import { useId } from "react";

export default function Field({ label, hint, error, children, inputProps = {} }) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;

  const input = children ? (
    children({ id, describedBy: [errorId, hintId].filter(Boolean).join(" ") || undefined, invalid: Boolean(error) })
  ) : (
    <input
      id={id}
      className="input"
      aria-invalid={Boolean(error)}
      aria-describedby={[errorId, hintId].filter(Boolean).join(" ") || undefined}
      {...inputProps}
    />
  );

  return (
    <div className={`field${error ? " has-error" : ""}`}>
      <label htmlFor={id}>{label}</label>
      {input}
      {error ? (
        <p className="field-error" id={errorId}>{error}</p>
      ) : hint ? (
        <p className="field-hint" id={hintId}>{hint}</p>
      ) : null}
    </div>
  );
}
