import { useEffect, useRef, useState } from "react";

const splitEmails = (text) => text.split(/[\s,;]+/).map((e) => e.trim()).filter(Boolean);

export default function GroupDialog({ mode, onModeChange, onCreate, onJoin, onClose }) {
  const [name, setName] = useState("");
  const [emails, setEmails] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const firstField = useRef(null);

  useEffect(() => {
    firstField.current?.focus();
    setError("");
  }, [mode]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (mode === "create") await onCreate(name, splitEmails(emails));
      else await onJoin(code);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const count = splitEmails(emails).length;

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="dialog" role="dialog" aria-modal="true" aria-labelledby="group-dialog-title" onSubmit={submit}>
        <div className="dialog-head">
          <h2 id="group-dialog-title">{mode === "create" ? "New group" : "Join a group"}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="dialog-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={mode === "create"} onClick={() => onModeChange("create")}>
            Create
          </button>
          <button type="button" role="tab" aria-selected={mode === "join"} onClick={() => onModeChange("join")}>
            Join with code
          </button>
        </div>

        {mode === "create" ? (
          <>
            <label className="dialog-field">
              <span>Group name</span>
              <input ref={firstField} className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} placeholder="Weekend trek" />
            </label>
            <label className="dialog-field">
              <span>Add people by email</span>
              <textarea
                className="input dialog-emails"
                value={emails}
                onChange={(e) => setEmails(e.target.value)}
                placeholder="bob@example.com, carol@example.com"
                rows={3}
                spellCheck={false}
              />
              <small>{count ? `${count} ${count === 1 ? "person" : "people"} · ` : ""}Separate with commas or spaces. You can also share the invite code later.</small>
            </label>
          </>
        ) : (
          <label className="dialog-field">
            <span>Invite code</span>
            <input
              ref={firstField}
              className="input dialog-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ABCD2345"
              maxLength={16}
              autoComplete="off"
              spellCheck={false}
            />
            <small>Ask someone in the group for its code. It's under Group info.</small>
          </label>
        )}

        {error && (
          <p className="dialog-error" role="alert">
            {error}
          </p>
        )}

        <button className="btn-primary" type="submit" disabled={busy || (mode === "create" ? !name.trim() : !code.trim())}>
          {busy ? "One moment…" : mode === "create" ? "Create group" : "Join group"}
        </button>
      </form>
    </div>
  );
}
