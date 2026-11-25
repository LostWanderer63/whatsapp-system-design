import { useState } from "react";
import Field from "./Field.jsx";
import { passwordStrength, MIN_PASSWORD } from "../validation.js";

const STRENGTH = ["", "Okay", "Good", "Strong"];

export default function PasswordField({ label = "Password", value, onChange, error, autoComplete, showStrength = false }) {
  const [visible, setVisible] = useState(false);
  const score = showStrength ? passwordStrength(value) : 0;
  const hint = showStrength
    ? value.length === 0
      ? `At least ${MIN_PASSWORD} characters.`
      : value.length < MIN_PASSWORD
        ? `${MIN_PASSWORD - value.length} more character${MIN_PASSWORD - value.length === 1 ? "" : "s"} to go.`
        : `${STRENGTH[score]} password.`
    : undefined;

  return (
    <Field label={label} hint={hint} error={error}>
      {({ id, describedBy, invalid }) => (
        <>
          <div className="password">
            <input
              id={id}
              className="input"
              type={visible ? "text" : "password"}
              value={value}
              onChange={onChange}
              autoComplete={autoComplete}
              aria-invalid={invalid}
              aria-describedby={describedBy}
            />
            <button
              type="button"
              className="password-toggle"
              onClick={() => setVisible((v) => !v)}
              aria-pressed={visible}
              aria-controls={id}
            >
              {visible ? "Hide" : "Show"}
            </button>
          </div>
          {showStrength && (
            <div className="strength" data-score={score} aria-hidden="true">
              <span /><span /><span />
            </div>
          )}
        </>
      )}
    </Field>
  );
}
