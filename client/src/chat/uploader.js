import { ApiError, request, uploadFile } from "../api.js";

const MAX_RETRIES = 8;
const PART_CONCURRENCY = 3;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const backoff = (attempt) => Math.min(30000, 1000 * 2 ** attempt) * (0.7 + Math.random() * 0.6);

class UploadError extends Error {
  constructor(message, { status = 0, retryable = false, blocked = false } = {}) {
    super(message);
    this.status = status;
    this.retryable = retryable;
    this.blocked = blocked;
  }
}

const isRetryable = (err) => err.retryable || (err instanceof ApiError && (err.status === 0 || err.status === 429 || err.status >= 500));

function waitForOnline() {
  if (navigator.onLine) return Promise.resolve();
  return new Promise((resolve) => window.addEventListener("online", () => resolve(), { once: true }));
}

async function withRetry(task, onWait, isBlocked) {
  let previousStatus = null;
  for (let attempt = 0; ; attempt++) {
    try {
      return await task(attempt);
    } catch (err) {
      if (isBlocked && attempt === 1 && previousStatus === 0 && (await isBlocked(err))) {
        throw new UploadError("Direct upload is blocked.", { blocked: true });
      }
      previousStatus = err.status;
      if (!isRetryable(err)) throw err;
      if (attempt >= MAX_RETRIES) {
        throw new UploadError("Upload failed after several attempts. Check your connection and tap Retry.", { status: err.status });
      }
      if (!navigator.onLine) {
        onWait?.("Waiting for connection…");
        await waitForOnline();
      } else {
        onWait?.("Connection hiccup, retrying…");
      }
      await sleep(backoff(attempt));
      onWait?.(null);
    }
  }
}

const api = (path, body, onWait) => withRetry(() => request(path, { method: "POST", auth: true, body }), onWait);

function putToStorage(url, body, headers, onProgress, active) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    active?.add(xhr);
    const settle = (fn, value) => {
      active?.delete(xhr);
      fn(value);
    };
    xhr.open("PUT", url);
    for (const [name, value] of Object.entries(headers || {})) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) settle(resolve, { etag: xhr.getResponseHeader("ETag") });
      else settle(reject, new UploadError(`Storage refused the upload (${xhr.status}).`, { status: xhr.status, retryable: xhr.status === 429 || xhr.status >= 500 }));
    };
    xhr.onerror = () => settle(reject, new UploadError("Network error while uploading.", { status: 0, retryable: true }));
    xhr.ontimeout = xhr.onerror;
    xhr.onabort = () => settle(reject, new UploadError("Upload stopped.", { status: -1 }));
    xhr.send(body);
  });
}

async function storageBlocked(err) {
  if (err.status !== 0 || !navigator.onLine) return false;
  try {
    await request("/media/config", { auth: true });
    return true;
  } catch {
    return false;
  }
}

async function uploadSingle(target, blob, onProgress, onWait, refresh, isBlocked) {
  let current = target;
  await withRetry(async () => {
    try {
      await putToStorage(current.url, blob, current.headers, onProgress);
    } catch (err) {
      onProgress?.(0);
      if (err.status === 403) {
        current = await refresh();
        throw new UploadError(err.message, { retryable: true });
      }
      throw err;
    }
  }, onWait, isBlocked);
  return current;
}

async function uploadParts(target, file, onProgress, onWait, isBlocked) {
  const urls = new Map(target.parts.map((p) => [p.partNumber, p.url]));
  const queue = [...urls.keys()];
  const loaded = new Map();
  const etags = new Map();
  const active = new Set();
  let stopped = false;
  const report = () => onProgress?.([...loaded.values()].reduce((a, b) => a + b, 0) / file.size);

  async function worker() {
    while (queue.length && !stopped) {
      const partNumber = queue.shift();
      const start = (partNumber - 1) * target.partSize;
      const blob = file.slice(start, Math.min(start + target.partSize, file.size));
      const { etag } = await withRetry(async () => {
        if (stopped) throw new UploadError("Upload stopped.", { status: -1 });
        try {
          return await putToStorage(urls.get(partNumber), blob, {}, (p) => {
            loaded.set(partNumber, p * blob.size);
            report();
          }, active);
        } catch (err) {
          loaded.set(partNumber, 0);
          report();
          if (err.status === 403) {
            const { parts } = await api("/media/uploads/parts", { token: target.token, partNumbers: [partNumber] }, onWait);
            urls.set(partNumber, parts[0].url);
            throw new UploadError(err.message, { retryable: true });
          }
          throw err;
        }
      }, onWait, isBlocked);
      if (!etag) throw new UploadError("Storage didn't return an ETag. The bucket's CORS rules must expose the ETag header.");
      etags.set(partNumber, etag);
      loaded.set(partNumber, blob.size);
      report();
    }
  }

  try {
    await Promise.all([...Array(Math.min(PART_CONCURRENCY, queue.length))].map(worker));
  } catch (err) {
    stopped = true;
    active.forEach((xhr) => xhr.abort());
    throw err;
  }
  return [...etags].map(([partNumber, etag]) => ({ partNumber, etag }));
}

async function uploadThumbnail(conversationId, thumbnail, onWait) {
  const target = await api("/media/uploads", { conversationId, purpose: "thumbnail", name: "thumb.jpg", type: thumbnail.type, size: thumbnail.size }, onWait);
  await uploadSingle(target, thumbnail, null, null, () => api("/media/uploads", { conversationId, purpose: "thumbnail", name: "thumb.jpg", type: thumbnail.type, size: thumbnail.size }));
  return target.token;
}

async function viaServer({ conversationId, clientId, caption, file, width, height, onProgress, onWait }) {
  const form = new FormData();
  form.append("conversationId", conversationId);
  form.append("clientId", clientId);
  form.append("caption", caption);
  if (width) form.append("width", width);
  if (height) form.append("height", height);
  form.append("file", file);
  const { message } = await withRetry(() => uploadFile("/media", form, { onProgress }), onWait);
  return message;
}

export async function sendAttachment({ conversationId, clientId, caption, file, thumbnail, width, height, proxyMaxBytes, onProgress, onWait }) {
  const describe = { conversationId, name: file.name, type: file.type, size: file.size };
  const newTarget = () => api("/media/uploads", describe, onWait);
  let target = await newTarget();
  const thumbnailToken = thumbnail ? uploadThumbnail(conversationId, thumbnail, null).catch(() => null) : Promise.resolve(null);

  const canFallBack = file.size <= proxyMaxBytes;
  const isBlocked = canFallBack ? storageBlocked : null;
  let parts;
  try {
    if (target.method === "single") target = await uploadSingle(target, file, (p) => onProgress?.(p * 0.97), onWait, newTarget, isBlocked);
    else parts = await uploadParts(target, file, (p) => onProgress?.(p * 0.97), onWait, isBlocked);
  } catch (err) {
    if (target.method === "multipart") request("/media/uploads/abort", { method: "POST", auth: true, body: { token: target.token } }).catch(() => {});
    if (!err.blocked) throw err;
    onWait?.("Using backup upload…");
    onProgress?.(0);
    return viaServer({ conversationId, clientId, caption, file, width, height, onProgress, onWait });
  }

  const { message } = await api(
    "/media/uploads/complete",
    { token: target.token, parts, caption, clientId, width, height, thumbnailToken: await thumbnailToken },
    onWait
  );
  onProgress?.(1);
  return message;
}
