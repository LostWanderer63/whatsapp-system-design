const crypto = require("crypto");
const path = require("path");
const { S3Client, PutObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const config = require("../config");
const { opensInline } = require("../mediaTypes");

let client = null;

const isEnabled = () => Boolean(config.media.bucket);

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

async function uploadMedia({ conversationId, buffer, type, name }) {
  const extension = path.extname(name).toLowerCase().replace(/[^.a-z0-9]/g, "").slice(0, 10);
  const key = `media/${conversationId}/${crypto.randomUUID()}${extension}`;
  await s3().send(
    new PutObjectCommand({
      Bucket: config.media.bucket,
      Key: key,
      Body: buffer,
      ContentType: type,
      ContentDisposition: contentDisposition(type, name),
      CacheControl: "private, max-age=31536000, immutable",
    })
  );
  return key;
}

function mediaUrl(key) {
  if (config.media.publicBaseUrl) return Promise.resolve(`${config.media.publicBaseUrl}/${key}`);
  return getSignedUrl(s3(), new GetObjectCommand({ Bucket: config.media.bucket, Key: key }), { expiresIn: config.media.urlTtlSeconds });
}

async function withMediaUrls(messages) {
  return Promise.all(
    messages.map(async (m) => {
      if (!m.attachment) return m;
      const { key, ...rest } = m.attachment;
      const url = isEnabled() ? await mediaUrl(key) : null;
      return { ...m, attachment: { ...rest, url } };
    })
  );
}

const serializeMessages = (rows) => withMediaUrls(rows.map((r) => r.toPublic()));

module.exports = { isEnabled, cleanFileName, uploadMedia, withMediaUrls, serializeMessages };
