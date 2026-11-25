import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { SendIcon } from "./bits.jsx";
import { checkFile, formatSize, kindFromType } from "./media.js";

const MAX_HEIGHT = 168;

const finePointer = () => window.matchMedia("(pointer: fine)").matches;

function PendingFile({ pending, onRemove }) {
  return (
    <div className="pending-file">
      {pending.kind === "image" ? (
        <img src={pending.previewUrl} alt="" />
      ) : pending.kind === "video" ? (
        <video src={pending.previewUrl} muted />
      ) : (
        <span className="pending-icon" aria-hidden="true">
          {pending.kind === "audio" ? "🎵" : "📄"}
        </span>
      )}
      <span className="pending-text">
        <strong>{pending.file.name}</strong>
        <small>{formatSize(pending.file.size)} · add a caption or press Enter</small>
      </span>
      <button type="button" className="icon-btn" onClick={onRemove} aria-label="Remove attachment">
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

export default function Composer({ value, onChange, onSend, onSendMedia, media, placeholder }) {
  const field = useRef(null);
  const picker = useRef(null);
  const [pending, setPending] = useState(null);
  const [fileError, setFileError] = useState("");
  const [dragging, setDragging] = useState(false);

  useLayoutEffect(() => {
    const el = field.current;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
  }, [value]);

  useEffect(() => () => pending && URL.revokeObjectURL(pending.previewUrl), [pending]);

  const text = value.trim();
  const canSend = Boolean(text || pending);

  function choose(file) {
    if (!file) return;
    const problem = checkFile(file, media);
    if (problem) {
      setFileError(problem);
      return;
    }
    setFileError("");
    setPending({ file, kind: kindFromType(file.type), previewUrl: URL.createObjectURL(file) });
    field.current.focus();
  }

  function submit(e) {
    e?.preventDefault();
    if (!canSend) return;
    if (pending) {
      onSendMedia(pending.file, text);
      setPending(null);
    } else {
      onSend(text);
    }
    field.current.focus();
  }

  function onKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  }

  function onPaste(e) {
    if (!media?.enabled) return;
    const file = [...e.clipboardData.files][0];
    if (file) {
      e.preventDefault();
      choose(file);
    }
  }

  const dropProps = media?.enabled
    ? {
        onDragOver: (e) => {
          if ([...e.dataTransfer.types].includes("Files")) {
            e.preventDefault();
            setDragging(true);
          }
        },
        onDragLeave: () => setDragging(false),
        onDrop: (e) => {
          e.preventDefault();
          setDragging(false);
          choose(e.dataTransfer.files[0]);
        },
      }
    : {};

  return (
    <form className={`composer${dragging ? " is-dragging" : ""}`} onSubmit={submit} {...dropProps}>
      {pending && <PendingFile pending={pending} onRemove={() => setPending(null)} />}
      {fileError && (
        <p className="composer-error" role="alert">
          {fileError}
        </p>
      )}
      <div className="composer-field">
        {media?.enabled && (
          <>
            <button type="button" className="attach" onClick={() => picker.current.click()} aria-label="Attach a file" title="Attach a photo, video or file">
              <svg viewBox="0 0 24 24" width="21" height="21" aria-hidden="true">
                <path
                  d="M20.5 11.5 12.4 19.6a5 5 0 0 1-7.1-7.1l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4l7.8-7.8"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <input
              ref={picker}
              type="file"
              hidden
              accept={media.types.join(",")}
              onChange={(e) => {
                choose(e.target.files[0]);
                e.target.value = "";
              }}
            />
          </>
        )}
        <label className="sr-only" htmlFor="composer-input">Message</label>
        <textarea
          id="composer-input"
          ref={field}
          rows={1}
          value={value}
          placeholder={pending ? "Add a caption…" : placeholder}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          autoFocus={finePointer()}
          enterKeyHint="send"
          maxLength={4000}
        />
        <button className="send" type="submit" disabled={!canSend} aria-label={pending ? "Send file" : "Send message"}>
          <SendIcon />
        </button>
      </div>
      <p className="composer-hint" aria-hidden="true">
        <kbd>Enter</kbd> to send · <kbd>Shift</kbd> + <kbd>Enter</kbd> for a new line{media?.enabled ? " · paste or drop files to share" : ""}
      </p>
    </form>
  );
}
