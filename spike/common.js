// What every spike script shares: where things live, how a candidate is named,
// how JSON is read and written, and where the key comes from.
//
// The root modules (questions, weigh, image fitting, geometry, the request
// builder, the guide) are loaded by relative path wherever they are needed,
// never copied, so the spike measures the code the plugin ships.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const SPIKE = __dirname;
const ROOT = path.join(SPIKE, "..");

const taxonomy = JSON.parse(fs.readFileSync(path.join(ROOT, "taxonomy", "components.json"), "utf8"));

// The three setups, in report order, and the letters the report uses for them.
const SETUPS = ["image", "dom", "image+dom"];
const LETTER = { image: "A", dom: "B", "image+dom": "C" };

// One subject for every setup, so the questions are byte-identical across them.
// "pictured" would be false for the DOM-only setup, and "described" for all.
const SUBJECT = "given";

/**
 * A file-system-safe name for a page URL or a local path: readable, plus a
 * short hash of the whole URL, since "components/button" and
 * "components-button" read the same once the punctuation is gone.
 */
function slug(url) {
  const readable = String(url).replace(/^[a-z]+:\/\//i, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "")
    .toLowerCase().slice(0, 60) || "page";
  return readable + "-" + crypto.createHash("sha256").update(String(url)).digest("hex").slice(0, 8);
}

/** Candidates are named by page and element, since element ids are only unique within a page. */
function candidateKey(candidate) {
  return slug(candidate.page) + "/" + candidate.element;
}

/**
 * A file name for a candidate's pictures from one capture. The element id
 * survives however long the page slug is, and the capture is part of the name,
 * so pictures from a recapture never overwrite the ones a saved request names.
 */
function evidenceName(candidate, capturedAt) {
  const capture = crypto.createHash("sha256").update(String(capturedAt)).digest("hex").slice(0, 8);
  return slug(candidate.page) + "-" + String(candidate.element).replace(/[^a-z0-9]+/gi, "-") + "-" + capture;
}

function responseKey(candidate, setup, run) {
  return candidateKey(candidate) + "|" + setup + "|" + run;
}

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

/** Written whole and renamed into place, so an interrupted write never leaves half a fixture. */
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + "\n");
  fs.renameSync(tmp, file);
}

/**
 * Keys come from the repository's .env.local, the convention probe.js set: a
 * key passed on a command line lands in shell history and session transcripts.
 */
function loadEnv() {
  const file = path.join(ROOT, ".env.local");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const match = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const value = match[2].replace(/^["']|["']$/g, "").trim();
    if (value && !process.env[match[1]]) process.env[match[1]] = value;
  }
}

/** Capture records by URL, from every record in a captures directory, with their screenshot paths. */
function loadCaptures(dir) {
  const byUrl = new Map();
  if (!fs.existsSync(dir)) return byUrl;
  for (const file of fs.readdirSync(dir).sort()) {
    if (!file.endsWith(".json")) continue;
    const record = readJson(path.join(dir, file));
    if (!record || typeof record.url !== "string" || !Array.isArray(record.elements) || !record.screenshot) continue;
    byUrl.set(record.url, { record, screenshot: path.join(dir, record.screenshot) });
  }
  return byUrl;
}

/** `--name value` and `--flag` pairs, plus the bare arguments in order. */
function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) { args._.push(a); continue; }
    const name = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) args[name] = true;
    else { args[name] = next; i++; }
  }
  return args;
}

module.exports = {
  SPIKE, ROOT, taxonomy, SETUPS, LETTER, SUBJECT,
  slug, candidateKey, evidenceName, responseKey, readJson, writeJson, loadEnv, parseArgs, loadCaptures,
};
