import { useEffect, useState } from "react";
import AuthLayout from "./components/AuthLayout.jsx";
import SignupPage from "./components/SignupPage.jsx";
import LoginPage from "./components/LoginPage.jsx";
import ChatApp from "./chat/ChatApp.jsx";
import { clearSession, getToken, getUser } from "./api.js";

const AUTH_ROUTES = ["signup", "login"];

// #/signup, #/login, #/chat, #/chat/<id>
function readHash() {
  const [route, id] = window.location.hash.replace(/^#\/?/, "").split("/");
  if (route === "chat") return { route, id: id ? decodeURIComponent(id) : null };
  if (AUTH_ROUTES.includes(route)) return { route, id: null };
  return { route: getToken() && getUser() ? "chat" : "signup", id: null };
}

export default function App() {
  const [{ route, id }, setLocation] = useState(readHash);
  const [user, setUser] = useState(getUser);
  const [typedName, setTypedName] = useState("");
  const [handoff, setHandoff] = useState(null);

  const signedIn = Boolean(user && getToken());

  useEffect(() => {
    const onHash = () => setLocation(readHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Chats need a session.
  useEffect(() => {
    if (route === "chat" && !signedIn) window.location.replace("#/login");
  }, [route, signedIn]);

  useEffect(() => {
    if (route === "login") document.title = "Log in · Chorus";
    else if (route === "signup") document.title = "Create account · Chorus";
  }, [route]);

  function go(next, data = null) {
    setHandoff(data);
    window.location.hash = `/${next}`;
  }

  function logOut() {
    clearSession();
    setUser(null);
    go("login");
  }

  if (route === "chat") {
    return signedIn ? <ChatApp user={user} activeId={id} onLogout={logOut} /> : null;
  }

  return (
    <AuthLayout mode={route} name={typedName}>
      {route === "signup" ? (
        <SignupPage onNameChange={setTypedName} onCreated={(u) => go("login", { identifier: u.email, name: u.name })} onLogin={() => go("login")} />
      ) : (
        <LoginPage
          handoff={handoff}
          onSignup={() => go("signup")}
          onLoggedIn={(u) => {
            setUser(u);
            go("chat");
          }}
        />
      )}
    </AuthLayout>
  );
}
