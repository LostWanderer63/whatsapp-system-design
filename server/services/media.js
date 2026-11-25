const crypto = require("crypto");
const path = require("path");
const jwt = require("jsonwebtoken");
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const config = require("../config");
const { opensInline } = require("../mediaTypes");

const PART_SIZE = 8 * 1024 * 1024;
const UPLOAD_URL_TTL = 60 * 60;
const UPLOAD_TOKEN_TTL = "6h";
const THUMB_TYPES = new Set(["image/jpeg", "image/webp"]);
const THUMB_MAX_BYTES = 1024 * 1024;

let client = null;

const isEnabled = () => Boolean(config.media.bucket);
const bucket = () => config.media.bucket;

function s3() {
  if (!client) {
    const { region, endpoint, forcePathStyle } = config.media;
    client = new S3Client({
      region,
      ...(endpoint
        ? { endpoint, forcePathStyle, requestChecksumCalculation: "WHEN_REQUIRED", responseChecksumValidation: "WHEN_REQUIRED" }
        : {}),
    });
  }
  return client;
}

function cleanFileName(name) {
  const cleaned = String(name || "file").replace(/[\u0000-\u001f\u007f/\\]/g, "").trim();
  return (cleaned || "file").slice(0, 255);
}

function contentDisposition(type, name) {
  return `${opensInline(type) ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(name)}`;
}

function newKey(conversationId, name, prefix = "media") {
  const extension = path.extname(name).toLowerCase().replace(/[^.a-z0-9]/g, "").slice(0, 10);
  return `${prefix}/${conversationId}/${crypto.randomUUID()}${extension}`;
}

async function uploadMedia({ conversationId, buffer, type, name }) {
  const key = newKey(conversationId, name);
  await s3().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: buffer,
      ContentType: type,
      ContentDisposition: contentDisposition(type, name),
      CacheControl: "private, max-age=31536000, immutable",
    })
  );
  return key;
}

function signUploadToken(claims) {
  return jwt.sign({ typ: "media-upload", ...claims }, config.jwt.secret, { expiresIn: UPLOAD_TOKEN_TTL });
}

function readUploadToken(token, userId) {
  try {
    const claims = jwt.verify(String(token || ""), config.jwt.secret, { algorithms: ["HS256"] });
    return claims.typ === "media-upload" && claims.uid === userId ? claims : null;
  } catch {
    return null;
  }
}

async function createUploadTarget({ userId, conversationId, name, type, size, purpose }) {
  const key = newKey(conversationId, name, purpose === "thumbnail" ? "thumbs" : "media");
  const objectHeaders = {
    ContentType: type,
    ContentDisposition: contentDisposition(type, name),
    CacheControl: "private, max-age=31536000, immutable",
  };
  const claims = { uid: userId, cid: String(conversationId), key, name, type, size, purpose };

  if (size <= PART_SIZE) {
    const url = await getSignedUrl(
      s3(),
      new PutObjectCommand({ Bucket: bucket(), Key: key, ContentLength: size, ...objectHeaders }),
      { expiresIn: UPLOAD_URL_TTL, signableHeaders: new Set(["content-type", "content-length", "content-disposition", "cache-control"]) }
    );
    return {
      method: "single",
      token: signUploadToken(claims),
      url,
      headers: { "Content-Type": type, "Content-Disposition": objectHeaders.ContentDisposition, "Cache-Control": objectHeaders.CacheControl },
    };
  }

  const { UploadId } = await s3().send(new CreateMultipartUploadCommand({ Bucket: bucket(), Key: key, ...objectHeaders }));
  const partCount = Math.ceil(size / PART_SIZE);
  return {
    method: "multipart",
    token: signUploadToken({ ...claims, uploadId: UploadId, partCount }),
    partSize: PART_SIZE,
    parts: await signParts({ key, uploadId: UploadId, size, partNumbers: [...Array(partCount)].map((_, i) => i + 1) }),
  };
}

function signParts({ key, uploadId, size, partNumbers }) {
  return Promise.all(
    partNumbers.map(async (partNumber) => {
      const length = Math.min(PART_SIZE, size - (partNumber - 1) * PART_SIZE);
      const url = await getSignedUrl(
        s3(),
        new UploadPartCommand({ Bucket: bucket(), Key: key, UploadId: uploadId, PartNumber: partNumber, ContentLength: length }),
        { expiresIn: UPLOAD_URL_TTL, signableHeaders: new Set(["content-length"]) }
      );
      return { partNumber, url };
    })
  );
}

async function headObject(key) {
  try {
    return await s3().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
  } catch (err) {
    if (err.name === "NotFound" || err.$metadata?.httpStatusCode === 404) return null;
    throw err;
  }
}

async function finishUpload(claims, parts) {
  if (claims.uploadId) {
    const existing = await headObject(claims.key);
    if (!existing) {
      const sorted = [...parts].sort((a, b) => a.partNumber - b.partNumber);
      await s3().send(
        new CompleteMultipartUploadCommand({
          Bucket: bucket(),
          Key: claims.key,
          UploadId: claims.uploadId,
          MultipartUpload: { Parts: sorted.map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })) },
        })
      );
    }
  }
  const head = await headObject(claims.key);
  if (!head) return { error: "The upload didn't reach storage. Please try again." };
  const type = (head.ContentType || "").split(";")[0].trim();
  if (Number(head.ContentLength) !== claims.size || type !== claims.type) {
    await s3().send(new DeleteObjectCommand({ Bucket: bucket(), Key: claims.key })).catch(() => {});
    return { error: "The uploaded file doesn't match what was announced." };
  }
  return { ok: true };
}

async function abortUpload(claims) {
  if (claims.uploadId) {
    await s3().send(new AbortMultipartUploadCommand({ Bucket: bucket(), Key: claims.key, UploadId: claims.uploadId })).catch(() => {});
  }
}

function signedGet(key) {
  if (config.media.publicBaseUrl) return Promise.resolve(`${config.media.publicBaseUrl}/${key}`);
  return getSignedUrl(s3(), new GetObjectCommand({ Bucket: bucket(), Key: key }), { expiresIn: config.media.urlTtlSeconds });
}

async function withMediaUrls(messages) {
  return Promise.all(
    messages.map(async (m) => {
      if (!m.attachment) return m;
      const { key, thumbKey, ...rest } = m.attachment;
      if (!isEnabled()) return { ...m, attachment: { ...rest, url: null, thumbUrl: null } };
      const [url, thumbUrl] = await Promise.all([signedGet(key), thumbKey ? signedGet(thumbKey) : null]);
      return { ...m, attachment: { ...rest, url, thumbUrl } };
    })
  );
}

const serializeMessages = (rows) => withMediaUrls(rows.map((r) => r.toPublic()));

module.exports = {
  PART_SIZE,
  THUMB_TYPES,
  THUMB_MAX_BYTES,
  isEnabled,
  cleanFileName,
  uploadMedia,
  createUploadTarget,
  signParts,
  readUploadToken,
  finishUpload,
  abortUpload,
  withMediaUrls,
  serializeMessages,
};
