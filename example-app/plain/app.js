// The plain-HTML example: every option, every call, every event, on the
// script-tag build (`window.BusymateAIWeb`). No framework, no bundler.
(function () {
  "use strict";
  const sdk = window.BusymateAIWeb;
  const $ = (id) => document.getElementById(id);
  const log = (name, detail) => {
    const line = `${new Date().toISOString().slice(11, 23)}  ${name}${detail === undefined ? "" : "  " + JSON.stringify(detail)}\n`;
    $("log").textContent = line + $("log").textContent;
  };
  $("version").textContent = `${sdk.SDK_VERSION} · wire v${sdk.CONTRACT_VERSION} (${sdk.BRIDGE_MARKER})`;

  // Remember the settings for this tab only (never a token).
  const KEY = "busymate-ai-web-example";
  try {
    const saved = JSON.parse(sessionStorage.getItem(KEY) || "{}");
    for (const [id, value] of Object.entries(saved)) if ($(id)) $(id).value = value;
  } catch (_) { /* ignored */ }
  // Query parameters win (a shareable, preconfigured link for phones): ?assistant=&origin=&mode=&locale=&theme=&mint=
  const query = new URLSearchParams(location.search);
  for (const id of ["assistant", "origin", "mode", "locale", "theme", "mint"]) if (query.has(id) && $(id)) $(id).value = query.get(id);

  let chat = null;
  window.__busymateExample = { events: [] }; // read by the live smoke check

  function mount() {
    if (chat) chat.unmount();
    $("inline").textContent = "";
    const settings = {};
    for (const id of ["assistant", "origin", "mode", "locale", "theme", "mint"]) settings[id] = $(id).value.trim();
    try { sessionStorage.setItem(KEY, JSON.stringify(settings)); } catch (_) { /* ignored */ }

    const options = {
      assistant: settings.assistant,
      mode: settings.mode,
      launcher: { label: "Ask AI" },
    };
    if (settings.origin) options.origin = settings.origin;
    if (settings.locale) options.locale = settings.locale;
    if (settings.theme) options.theme = settings.theme;
    if (settings.mode === "inline") { $("inline").style.display = "block"; options.container = $("inline"); }
    // Identified mode: YOUR authenticated endpoint signs { token, nonce }. Guest mode: no provider.
    if (settings.mint) options.getIdentity = sdk.mintFromEndpoint(settings.mint);

    try {
      chat = sdk.createBusymateChat(options);
    } catch (error) {
      log("invalid settings", String(error.message || error));
      return;
    }
    for (const name of ["ready", "open", "close", "message", "navigate", "signInRequest", "sessionEnded", "error"]) {
      chat.on(name, (event) => {
        window.__busymateExample.events.push({ name, event });
        log(name, event);
      });
    }
    chat.onLinkStatus((status) => {
      $("status").textContent = `${status.state} · ${status.reason} (${status.source})`;
      window.__busymateExample.events.push({ name: "linkStatus", event: status });
      log("linkStatus", status);
    });
    chat.mount();
    $("frame").textContent = chat.frameUrl() || "";
    window.__busymateExample.chat = chat;
  }

  $("apply").addEventListener("click", mount);
  $("unmount").addEventListener("click", () => { if (chat) chat.unmount(); log("unmounted"); });
  for (const button of document.querySelectorAll("[data-call]")) {
    button.addEventListener("click", () => chat && chat[button.dataset.call]());
  }
  $("ask").addEventListener("click", () => chat && chat.ask("What can you help me with?"));
  $("changed").addEventListener("click", () => chat && chat.identityChanged().then((ok) => log("identityChanged ->", ok)));
  $("switch").addEventListener("click", () => chat && chat.switchAccount().then((ok) => log("switchAccount ->", ok)));
  mount();
})();
