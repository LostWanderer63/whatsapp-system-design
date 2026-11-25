const TYPES = new Map([
  ["image/jpeg", "image"],
  ["image/png", "image"],
  ["image/gif", "image"],
  ["image/webp", "image"],
  ["image/heic", "image"],
  ["image/avif", "image"],
  ["video/mp4", "video"],
  ["video/webm", "video"],
  ["video/quicktime", "video"],
  ["audio/mpeg", "audio"],
  ["audio/mp4", "audio"],
  ["audio/aac", "audio"],
  ["audio/ogg", "audio"],
  ["audio/webm", "audio"],
  ["audio/wav", "audio"],
  ["application/pdf", "file"],
  ["text/plain", "file"],
  ["text/csv", "file"],
  ["application/zip", "file"],
  ["application/msword", "file"],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "file"],
  ["application/vnd.ms-excel", "file"],
  ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "file"],
  ["application/vnd.ms-powerpoint", "file"],
  ["application/vnd.openxmlformats-officedocument.presentationml.presentation", "file"],
]);

const kindOf = (type) => TYPES.get(type) || null;
const isAllowed = (type) => TYPES.has(type);
const allowedTypes = () => [...TYPES.keys()];
const opensInline = (type) => ["image", "video", "audio"].includes(kindOf(type)) || type === "application/pdf";

module.exports = { kindOf, isAllowed, allowedTypes, opensInline };
