import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { mintFromEndpoint } from "@busymate/ai-web";
import { useBusymateChat } from "./useBusymateChat.js";

// A stand-in for YOUR auth store. In your app this is your session hook.
function useFakeAuth() {
  const [user, setUser] = useState(null);
  return { user, signIn: () => setUser({ id: "user-1" }), signOut: () => setUser(null), switchUser: () => setUser({ id: "user-2" }) };
}

const mintUrl = new URLSearchParams(location.search).get("mint");
const mint = mintUrl ? mintFromEndpoint(mintUrl) : null;

function App() {
  const auth = useFakeAuth();
  const [events, setEvents] = useState([]);
  const { chat, linkStatus } = useBusymateChat({
    assistant: new URLSearchParams(location.search).get("assistant") || "demos",
    locale: "en",
    // Signed out: null, so the chat stays a guest. Signed in: a fresh token from YOUR backend.
    getIdentity: (request) => (auth.user && mint ? mint(request) : null),
    account: () => auth.user?.id ?? null,
  });

  // Tell the chat about YOUR auth events (transitions only); it upgrades or withdraws in place.
  const previous = useRef(null);
  useEffect(() => {
    const id = auth.user?.id ?? null;
    const was = previous.current;
    previous.current = id;
    if (!chat || id === was) return;
    if (id) void chat.identityChanged();
    else chat.logout();
  }, [chat, auth.user?.id]);

  useEffect(() => {
    if (!chat) return;
    const offs = ["ready", "open", "close", "error"].map((name) => chat.on(name, (e) => setEvents((list) => [`${name} ${JSON.stringify(e)}`, ...list].slice(0, 30))));
    return () => offs.forEach((off) => off());
  }, [chat]);

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 16, font: "15px/1.5 system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 22 }}>Busymate AI Web SDK in React</h1>
      <p>Signed in as: <b>{auth.user?.id ?? "nobody"}</b>{mint ? "" : " (add ?mint=https://your-app.example/api/bmai/identity to link accounts)"}</p>
      <p style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button onClick={auth.signIn}>Sign in</button>
        <button onClick={auth.switchUser}>Switch account</button>
        <button onClick={auth.signOut}>Sign out</button>
        <button onClick={() => chat?.ask("Where is my order?")}>Ask about an order</button>
      </p>
      <p>Link status: <b>{linkStatus ? `${linkStatus.state} · ${linkStatus.reason}` : "—"}</b></p>
      <pre style={{ fontSize: 12, whiteSpace: "pre-wrap" }}>{events.join("\n")}</pre>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<StrictMode><App /></StrictMode>);
