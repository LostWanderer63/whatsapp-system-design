import { useLayoutEffect, useRef } from "react";
import { SendIcon } from "./bits.jsx";

const MAX_HEIGHT = 168; // about 7 lines, then the field scrolls

// Focus the field on open only with a mouse/trackpad; on phones it would pop the keyboard.
const finePointer = () => window.matchMedia("(pointer: fine)").matches;

export default function Composer({ value, onChange, onSend, placeholder }) {
  const field = useRef(null);

  // Grow with the text.
  useLayoutEffect(() => {
    const el = field.current;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
  }, [value]);

  const text = value.trim();

  function submit(e) {
    e?.preventDefault();
    if (!text) return;
    onSend(text);
    field.current.focus();
  }

  function onKeyDown(e) {
    // Enter sends, Shift+Enter adds a line. Leave Enter alone while an IME is composing.
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <form className="composer" onSubmit={submit}>
      <div className="composer-field">
        <label className="sr-only" htmlFor="composer-input">Message</label>
        <textarea
          id="composer-input"
          ref={field}
          rows={1}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          autoFocus={finePointer()}
          enterKeyHint="send"
        />
        <button className="send" type="submit" disabled={!text} aria-label="Send message">
          <SendIcon />
        </button>
      </div>
      <p className="composer-hint" aria-hidden="true">
        <kbd>Enter</kbd> to send · <kbd>Shift</kbd> + <kbd>Enter</kbd> for a new line
      </p>
    </form>
  );
}
