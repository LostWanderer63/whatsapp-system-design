import { useEffect, useState } from "react";
import AuthLayout from "./components/AuthLayout.jsx";
import SignupPage from "./components/SignupPage.jsx";
import LoginPage from "./components/LoginPage.jsx";

const ROUTES = ["signup", "login"];

function currentRoute() {
  const r = window.location.hash.replace(/^#\/?/, "");
  return ROUTES.includes(r) ? r : "signup";
}

export default function App() {
  const [route, setRoute] = useState(currentRoute);
  const [typedName, setTypedName] = useState("");
  // Carries the new account's email and a message from sign-up to the login page.
  const [handoff, setHandoff] = useState(null);

  useEffect(() => {
    const onHash = () => setRoute(currentRoute());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    document.title = route === "login" ? "Log in · Chorus" : "Create account · Chorus";
  }, [route]);

  function go(next, data = null) {
    setHandoff(data);
    window.location.hash = `/${next}`;
  }

  return (
    <AuthLayout mode={route} name={typedName}>
      {route === "signup" ? (
        <SignupPage onNameChange={setTypedName} onCreated={(user) => go("login", { identifier: user.email, name: user.name })} onLogin={() => go("login")} />
      ) : (
        <LoginPage handoff={handoff} onSignup={() => go("signup")} />
      )}
    </AuthLayout>
  );
}
