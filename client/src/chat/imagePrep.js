import { kindFromType } from "./media.js";

const RESIZABLE = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_SIDE = 2560;
const THUMB_SIDE = 480;
const RESIZE_ABOVE_BYTES = 4 * 1024 * 1024;
const VIDEO_TIMEOUT_MS = 6000;

function drawScaled(source, width, height, maxSide, background) {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext("2d");
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

const toBlob = (canvas, type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality));

function renameTo(name, type) {
  const base = name.replace(/\.[^.]+$/, "") || "photo";
  return `${base}.${type === "image/webp" ? "webp" : "jpg"}`;
}

async function prepareImage(file) {
  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;
  let out = file;
  let finalWidth = width;
  let finalHeight = height;

  if (RESIZABLE.has(file.type) && (Math.max(width, height) > MAX_SIDE || file.size > RESIZE_ABOVE_BYTES)) {
    const type = file.type === "image/webp" ? "image/webp" : "image/jpeg";
    const canvas = drawScaled(bitmap, width, height, MAX_SIDE, type === "image/jpeg" ? "#ffffff" : null);
    const blob = await toBlob(canvas, type, 0.86);
    if (blob && blob.size < file.size) {
      out = new File([blob], renameTo(file.name, type), { type, lastModified: file.lastModified });
      finalWidth = canvas.width;
      finalHeight = canvas.height;
    }
  }

  const thumbnail = await toBlob(drawScaled(bitmap, width, height, THUMB_SIDE, "#ffffff"), "image/jpeg", 0.72);
  bitmap.close?.();
  return { file: out, thumbnail, width: finalWidth, height: finalHeight };
}

function prepareVideo(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
      resolve(result);
    };
    const timer = setTimeout(() => finish({ file, thumbnail: null, width: null, height: null }), VIDEO_TIMEOUT_MS);
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.onloadeddata = () => {
      video.currentTime = Math.min(0.5, (video.duration || 1) / 3);
    };
    video.onseeked = async () => {
      clearTimeout(timer);
      const { videoWidth: width, videoHeight: height } = video;
      if (!width || !height) return finish({ file, thumbnail: null, width: null, height: null });
      const thumbnail = await toBlob(drawScaled(video, width, height, THUMB_SIDE, "#000000"), "image/jpeg", 0.72);
      finish({ file, thumbnail, width, height });
    };
    video.onerror = () => {
      clearTimeout(timer);
      finish({ file, thumbnail: null, width: null, height: null });
    };
    video.src = url;
  });
}

export async function prepareMedia(file) {
  const kind = kindFromType(file.type);
  try {
    if (kind === "image") return await prepareImage(file);
    if (kind === "video") return await prepareVideo(file);
  } catch {
    return { file, thumbnail: null, width: null, height: null };
  }
  return { file, thumbnail: null, width: null, height: null };
}
