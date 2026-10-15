// A CORS shim for the Jev API, for local development.
//
//   node proxy.js
//
// Why this exists, and why it is not a design choice:
//
// A Figma plugin's UI runs in a sandboxed iframe whose origin is the string
// "null". TypeSafe operates an origin allowlist — its preflight answers
// "Disallowed CORS origin" with a 400 — and `Origin` is a forbidden header, so
// page JavaScript can neither set nor remove the one thing being judged. There
// is nothing to fix on the plugin side. OpenAI, by contrast, answers
// `access-control-allow-origin: null` and is called directly; only Jev needs this.
//
// The moment api.typesafe.ai allows the null origin, point the panel's Jev base
// URL at it and delete this file. Nothing else changes.

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PROXY_PORT) || 8787;
const UPSTREAM = "https://api.typesafe.ai";

function loadEnvFile() {
  const file = path.join(__dirname, ".env.local");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const v = m[2].replace(/^["']|["']$/g, "").trim();
    if (v && !process.env[m[1]]) process.env[m[1]] = v;
  }
}
loadEnvFile();

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "authorization, content-type, typesafe-danger-zone-images",
  "access-control-max-age": "600",
};

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") { res.writeHead(204, CORS); return res.end(); }

  if (req.method !== "POST") {
    res.writeHead(405, { ...CORS, "content-type": "text/plain" });
    return res.end("POST only. This is a CORS shim for " + UPSTREAM + ".");
  }

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks);

  // The panel's own key wins. Falling back to .env.local means the key can stay
  // in one gitignored file instead of also living in figma.clientStorage.
  const auth = req.headers.authorization ||
    (process.env.TYPESAFE_API_KEY ? "Bearer " + process.env.TYPESAFE_API_KEY : null);
  if (!auth) {
    res.writeHead(401, { ...CORS, "content-type": "application/json" });
    return res.end(JSON.stringify({ error: "No key: send Authorization, or set TYPESAFE_API_KEY in .env.local" }));
  }

  const started = Date.now();
  try {
    const upstream = await fetch(UPSTREAM + req.url, {
      method: "POST",
      headers: Object.assign(
        { "content-type": "application/json", authorization: auth },
        // Jev's image input is opt-in per request. Without this passed on, every
        // Jev-only call arrives upstream as a plain request and is refused.
        req.headers["typesafe-danger-zone-images"]
          ? { "TypeSafe-Danger-Zone-Images": req.headers["typesafe-danger-zone-images"] }
          : {}),
      body,
    });
    const text = await upstream.text();
    console.log(new Date().toISOString().slice(11, 19) + "  " + upstream.status + "  " +
      (Date.now() - started) + "ms  " + req.url);
    res.writeHead(upstream.status, { ...CORS, "content-type": upstream.headers.get("content-type") || "application/json" });
    res.end(text);
  } catch (error) {
    console.error("upstream failed: " + error.message);
    res.writeHead(502, { ...CORS, "content-type": "application/json" });
    res.end(JSON.stringify({ error: "Upstream unreachable: " + error.message }));
  }
});

// Bound to both loopback addresses, not just 127.0.0.1.
//
// Figma rejects a bare IP in allowedDomains, so the plugin has to call the name
// "localhost" — and on macOS that resolves to ::1 as readily as to 127.0.0.1.
// A shim listening on only one of them fails intermittently and looks like a
// CORS problem all over again. Neither binding leaves this machine.
let listening = 0;
for (const host of ["127.0.0.1", "::1"]) {
  const instance = host === "127.0.0.1" ? server : http.createServer(server.listeners("request")[0]);
  instance.listen(PORT, host, () => {
    if (listening++ === 0) {
      console.log("Jev CORS shim on http://localhost:" + PORT + " -> " + UPSTREAM);
      console.log("key: " + (process.env.TYPESAFE_API_KEY ? ".env.local (panel key overrides)" : "expected from the panel"));
      console.log("Leave this running while the plugin is open.");
    }
  });
  instance.on("error", (error) => {
    if (error.code === "EADDRINUSE") { console.error("Port " + PORT + " is already in use on " + host + "."); process.exit(1); }
    if (error.code !== "EAFNOSUPPORT" && error.code !== "EADDRNOTAVAIL") console.warn("[" + host + "] " + error.message);
  });
}
