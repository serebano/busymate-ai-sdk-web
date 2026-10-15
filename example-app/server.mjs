// A tiny static server for the examples: serves this repository on
// http://localhost:5180 so the plain example can load ../../dist. Development only.
//
//   npm run build && node example-app/server.mjs
//   open http://localhost:5180/example-app/plain/
//
// The hosted chat frames only on the origins your workspace allows: add
// http://localhost:5180 to Console › Integration › allowed origins of a TEST
// workspace, or the SDK reports `origin_not_allowed`.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const port = Number(process.env.PORT || 5180);
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css", ".json": "application/json", ".map": "application/json" };

createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://localhost");
  let path = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, "");
  if (path === "" || path.endsWith(sep) || path.endsWith("/")) path = join(path, "index.html");
  const file = join(root, path);
  if (!file.startsWith(root) || file.includes(`${sep}node_modules${sep}`)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": types[extname(file)] || "application/octet-stream", "cache-control": "no-store" });
    res.end(body);
  } catch {
    if (url.pathname.endsWith("/plain") || url.pathname.endsWith("/react")) {
      res.writeHead(302, { location: url.pathname + "/" }).end();
      return;
    }
    res.writeHead(404).end("not found");
  }
}).listen(port, "127.0.0.1", () => console.log(`examples on http://localhost:${port}/example-app/plain/`));
