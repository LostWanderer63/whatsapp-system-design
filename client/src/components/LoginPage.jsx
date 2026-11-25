import { useEffect, useState } from "react";
import Field from "./Field.jsx";
import PasswordField from "./PasswordField.jsx";
import { request, setToken, ApiError } from "../api.js";
import { identifierKind, validateLogin } from "../validation.js";

export default function LoginPage({ handoff, onSignup }) {
  const [identifier, setIdentifier] = useState(handoff?.identifier || "");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // Bumped when errors appear, so focus moves after React has rendered them.
  const [focusTick, setFocusTick] = useState(0);

  useEffect(() => {
    if (focusTick) document.querySelector(".field.has-error input")?.focus();
  }, [focusTick]);
  const [loggedIn, setLoggedIn] = useState(null);

  const kind = identifierKind(identifier);
  const hint = kind === "email" ? "Logging in with your email." : kind === "phone" ? "Logging in with your phone number." : undefined;

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError("");

    const found = validateLogin({ identifier, password });
    setErrors(found);
    if (Object.keys(found).length) {
      setFocusTick((t) => t + 1);
      return;
    }

    setSubmitting(true);
    try {
      const { token, user } = await request("/auth/login", { method: "POST", body: { identifier, password } });
      setToken(token);
      setLoggedIn(user);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fields);
        if (Object.keys(err.fields).length) setFocusTick((t) => t + 1);
        if (!Object.keys(err.fields).length) setFormError(err.message);
      } else {
        setFormError("Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  function logOut() {
    setToken(null);
    setLoggedIn(null);
    setPassword("");
  }

  if (loggedIn) {
    return (
      <div className="auth-form" role="status">
        <h1>You're logged in</h1>
        <p className="lede">Signed in as {loggedIn.name}.</p>
        <dl className="account">
          <div><dt>Email</dt><dd>{loggedIn.email}</dd></div>
          <div><dt>Phone</dt><dd>{loggedIn.phone}</dd></div>
        </dl>
        <button className="btn-secondary" type="button" onClick={logOut}>Log out</button>
      </div>
    );
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit} noValidate>
      <h1>Log in</h1>
      <p className="lede">
        New to Chorus?{" "}
        <a href="#/signup" onClick={(e) => { e.preventDefault(); onSignup(); }}>Create an account</a>
      </p>

      {handoff?.name && !formError && (
        <div className="notice notice-success" role="status">
          Account created for {handoff.name}. Log in with your email or phone number.
        </div>
      )}
      {formError && <div className="notice notice-error" role="alert">{formError}</div>}

      <Field
        label="Email or phone number"
        hint={hint}
        error={errors.identifier}
        inputProps={{
          value: identifier,
          onChange: (e) => { setIdentifier(e.target.value); if (errors.identifier) setErrors((x) => ({ ...x, identifier: undefined })); },
          autoComplete: "username",
          autoCapitalize: "none",
          spellCheck: false,
        }}
      />
      <PasswordField
        value={password}
        onChange={(e) => { setPassword(e.target.value); if (errors.password) setErrors((x) => ({ ...x, password: undefined })); }}
        error={errors.password}
        autoComplete="current-password"
      />

      <button className="btn-primary" type="submit" disabled={submitting}>
        {submitting ? "Logging in…" : "Log in"}
      </button>
    </form>
  );
}
