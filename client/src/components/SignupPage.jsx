import { useEffect, useState } from "react";
import Field from "./Field.jsx";
import PasswordField from "./PasswordField.jsx";
import { request, ApiError } from "../api.js";
import { validateSignup } from "../validation.js";

const EMPTY = { name: "", email: "", phone: "", password: "" };

export default function SignupPage({ onNameChange, onCreated, onLogin }) {
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [exists, setExists] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [focusTick, setFocusTick] = useState(0);

  useEffect(() => {
    if (focusTick) document.querySelector(".field.has-error input")?.focus();
  }, [focusTick]);

  function update(field) {
    return (e) => {
      const value = e.target.value;
      setValues((v) => ({ ...v, [field]: value }));
      if (errors[field]) setErrors((errs) => ({ ...errs, [field]: undefined }));
      if (field === "name") onNameChange(value);
    };
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError("");
    setExists(false);

    const found = validateSignup(values);
    setErrors(found);
    if (Object.keys(found).length) {
      setFocusTick((t) => t + 1);
      return;
    }

    setSubmitting(true);
    try {
      const { user } = await request("/auth/signup", { method: "POST", body: values });
      onCreated(user);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fields);
        if (Object.keys(err.fields).length) setFocusTick((t) => t + 1);
        setExists(err.status === 409);
        if (!Object.keys(err.fields).length || err.status === 409) setFormError(err.message);
      } else {
        setFormError("Something went wrong. Please try again.");
      }
      setSubmitting(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit} noValidate>
      <h1>Create your account</h1>
      <p className="lede">
        Already have one?{" "}
        <a href="#/login" onClick={(e) => { e.preventDefault(); onLogin(); }}>Log in</a>
      </p>

      {formError && (
        <div className="notice notice-error" role="alert">
          {formError}
          {exists && (
            <>
              {" "}
              <a href="#/login" onClick={(e) => { e.preventDefault(); onLogin(); }}>Go to login</a>
            </>
          )}
        </div>
      )}

      <Field label="Name" error={errors.name} inputProps={{ value: values.name, onChange: update("name"), autoComplete: "name", maxLength: 60 }} />
      <Field label="Email" error={errors.email} inputProps={{ type: "email", value: values.email, onChange: update("email"), autoComplete: "email", inputMode: "email" }} />
      <Field
        label="Phone number"
        hint="10-digit numbers are saved with +91. Add your country code if you're outside India."
        error={errors.phone}
        inputProps={{ type: "tel", value: values.phone, onChange: update("phone"), autoComplete: "tel", inputMode: "tel", placeholder: "98765 43210" }}
      />
      <PasswordField value={values.password} onChange={update("password")} error={errors.password} autoComplete="new-password" showStrength />

      <button className="btn-primary" type="submit" disabled={submitting}>
        {submitting ? "Creating account…" : "Create account"}
      </button>
    </form>
  );
}
