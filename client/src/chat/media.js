export const kindFromType = (type = "") =>
  type.startsWith("image/") ? "image" : type.startsWith("video/") ? "video" : type.startsWith("audio/") ? "audio" : "file";

export function formatSize(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

export function attachmentLabel(attachment) {
  const labels = { image: "📷 Photo", video: "🎥 Video", audio: "🎵 Audio" };
  return labels[attachment.kind] || `📄 ${attachment.name}`;
}

export function checkFile(file, media) {
  if (!media?.enabled) return "Media sharing isn't set up on this server yet.";
  if (!media.types.includes(file.type)) return "That file type can't be shared. Try a photo, video, audio clip, PDF or document.";
  if (file.size > media.maxBytes) return `Files can be up to ${Math.round(media.maxBytes / (1024 * 1024))} MB.`;
  return null;
}
