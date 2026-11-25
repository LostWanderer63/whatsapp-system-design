import ChatPanel from "./ChatPanel.jsx";

export default function AuthLayout({ mode, name, children }) {
  return (
    <div className="auth">
      <aside className="auth-aside">
        <div className="brand">
          <img src="/favicon.svg" alt="" width="32" height="32" />
          <span>Chorus</span>
        </div>
        <div aria-hidden="true">
          <ChatPanel mode={mode} name={name} />
        </div>
        <p className="aside-foot">Group chats for the people you actually talk to.</p>
      </aside>

      <main className="auth-main">
        <div className="auth-form-wrap">{children}</div>
      </main>
    </div>
  );
}
