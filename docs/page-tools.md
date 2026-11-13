# Page tools

Page tools let the assistant act on **your page**: show the in-chat sign-in card, fill a form, look something up. A tool's `execute` runs in your page, so a password or a token never reaches the assistant.

```ts
await chat.registerPageTools([
  {
    name: "sign_in",
    description: "Show the sign-in form in the chat when something needs the visitor's account.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
    execute: () => ({
      $bmForm: 1,
      title: "Sign in",
      fields: [
        { name: "email", label: "Email", type: "email", required: true, autocomplete: "username" },
        { name: "password", label: "Password", type: "password", required: true, autocomplete: "current-password" },
      ],
      submit: { label: "Sign in", tool: "sign_in_submit" },
      cancel: { label: "Not now" },
    }),
  },
  {
    name: "sign_in_submit",
    description: "Complete the sign-in the card collected.",
    inputSchema: { type: "object", properties: {} },
    async execute({ email, password }) {
      const r = await fetch("/api/login", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
      return r.ok ? { signedIn: true } : { signedIn: false, error: "invalid_credentials" };
    },
  },
]);
```

`signedIn: true` is the one thing the chat reads: it then asks your `getIdentity` again and the **same conversation** continues signed in. With no `sign_in` tool and a `login_url` registered, the chat opens your login page instead (see [Sign-in and identity](https://busymate.ai/docs/identity)).

## API

- `chat.registerPageTools(tools, { exposedTo?, signal? })` resolves to `{ tools, rejected, exposedTo, unregister() }`. An invalid tool is rejected on its own (and logged); the others stay live.
- `chat.unregisterPageTools(names?)` removes tools by name, or all of them.
- `chat.registerDeclarativeForms(options?)` turns `<form toolname="...">` markup into tools.

Tools are exposed to the assistant's origin and `https://busymate.ai` only (exact origins, never a wildcard); `exposedTo` adds more.

## Loading and CSP

Nothing loads at import or `mount()`. The first page-tools call imports the runtime from the assistant origin (`<origin>/sdk/v1/webmcp/index.js`, with a `modulepreload` hint). Add that origin to `script-src`: `cspDirectives({ assistant: "acme", pageTools: true })`.
