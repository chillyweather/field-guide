// Checks the vision half without Figma.
//
//   node probe-vision.js                  list the models the host exposes
//   node probe-vision.js <model>          describe a generated test image
//
// The second form uses the plugin's own request shapes (src-vision.js) and
// prints the reasoning level the model settled on, so it doubles as the check
// that a model will run in the plugin at all.
//
// Keys and base URL come from .env.local:
//   VISION_API_KEY=sk-...
//   VISION_BASE_URL=https://api.openai.com/v1
//
// The test image is drawn here rather than committed, so the probe carries no
// assets and the thing being described is known exactly: a rounded grey track
// with a white circle at its left, which any guide should read as a toggle and
// which no vision model should be able to name from memory.

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

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

const KEY = process.env.VISION_API_KEY || process.env.OPENAI_API_KEY;
const BASE = (process.env.VISION_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
const MODEL = process.argv[2];

if (!KEY) {
  console.error("No vision key. Add to .env.local:\n    VISION_API_KEY=sk-...\n    VISION_BASE_URL=" + BASE);
  process.exit(2);
}

/* ---- a real PNG, drawn from scratch so the probe needs no committed asset ---- */

function crc32(buf) {
  let c, table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function toggleImage(W = 160, H = 80) {
  const px = (x, y, r, g, b) => { const i = y * (W * 3 + 1) + 1 + x * 3; raw[i] = r; raw[i + 1] = g; raw[i + 2] = b; };
  const raw = Buffer.alloc(H * (W * 3 + 1), 255);
  for (let y = 0; y < H; y++) raw[y * (W * 3 + 1)] = 0; // filter byte per scanline

  // A rounded track, 100x44, centred, pale grey with a darker edge.
  const tx = 30, ty = 18, tw = 100, th = 44, r = th / 2;
  for (let y = ty; y < ty + th; y++) {
    for (let x = tx; x < tx + tw; x++) {
      const cx = Math.min(Math.max(x, tx + r), tx + tw - r);
      const d = Math.hypot(x - cx, y - (ty + r));
      if (d > r) continue;
      const edge = d > r - 2;
      px(x, y, edge ? 150 : 214, edge ? 150 : 214, edge ? 150 : 214);
    }
  }
  // A white circle resting against the left inside edge.
  const kr = r - 5, kx = tx + r, ky = ty + r;
  for (let y = ky - kr; y <= ky + kr; y++) {
    for (let x = kx - kr; x <= kx + kr; x++) {
      if (Math.hypot(x - kx, y - ky) <= kr) px(Math.round(x), Math.round(y), 255, 255, 255);
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit, truecolour
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ---- the calls ---- */

async function listModels() {
  const res = await fetch(BASE + "/models", { headers: { authorization: "Bearer " + KEY } });
  const text = await res.text();
  if (!res.ok) { console.error("HTTP " + res.status + " from " + BASE + "/models\n" + text.slice(0, 500)); process.exit(1); }

  let ids;
  try { const b = JSON.parse(text); ids = (b.data || b.models || []).map((m) => m.id || m.name).filter(Boolean); }
  catch { console.error("Not JSON:\n" + text.slice(0, 500)); process.exit(1); }

  console.log(BASE + " exposes " + ids.length + " models\n");
  // A name pattern, so it goes stale with every new family: gpt-6 and gpt-4.1
  // sat unnoticed under "the rest" until the list was read in full.
  const vision = ids.filter((id) => /vl|vision|omni|4o|gpt-4\.1|gpt-5|gpt-6|^o\d|gemini|qwen3|glm|internvl|pixtral|llava/i.test(id));
  if (vision.length) {
    console.log("likely vision-capable:");
    for (const id of vision.sort()) console.log("  " + id);
    console.log("\nthe rest:");
  }
  for (const id of ids.filter((i) => !vision.includes(i)).sort()) console.log("  " + id);
  console.log("\nDescribe the test image with one:  node probe-vision.js <model>");
}

const { firstShape, shapeFields, nextShape, reasoningTokens } = require("./src-vision");

async function describeWith(model, png, geometry) {
  // The same shapes the plugin negotiates, so a model that answers here runs in
  // the plugin at the same reasoning level. A list of which model takes what
  // would be stale by the next release; the refusal says what to change.
  let shape = firstShape();
  const messages = [{ role: "user", content: [
        { type: "text", text: "Next image: the region to describe." },
        { type: "image_url", image_url: { url: "data:image/png;base64," + png.toString("base64") } },
        { type: "text", text:
          "Describe this region of a user interface in 2-3 sentences, factually.\n" +
          "Cover: shape and corner treatment, fill and border, any text and its wording, any icons, " +
          "and any visible state such as a check mark, a sliding thumb, a chevron, or a dismiss affordance.\n" +
          "Geometry from the design file: " + geometry + "\n\n" +
          "Do NOT name the component type and do NOT use design-system vocabulary " +
          "(no 'button', 'chip', 'badge', 'input', 'card', 'modal', and so on). Describe only what is visible." },
      ] }];

  for (let attempt = 0; ; attempt++) {
    const res = await fetch(BASE + "/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer " + KEY },
      body: JSON.stringify(Object.assign({ model, messages }, shapeFields(shape))),
    });
    const text = await res.text();
    if (!res.ok) {
      const next = res.status === 400 && attempt < 4 ? nextShape(shape, text) : null;
      if (!next) throw new Error("HTTP " + res.status + " — " + text.slice(0, 400));
      shape = next;
      continue;
    }
    const body = JSON.parse(text);
    const choice = body.choices && body.choices[0];
    const out = choice && choice.message && choice.message.content;
    if (!out) {
      const thought = reasoningTokens(body.usage);
      throw new Error("No text in response" +
        (choice && choice.finish_reason ? " (finish: " + choice.finish_reason + (thought ? ", " + thought + " reasoning tokens" : "") + ")" : "") +
        ": " + JSON.stringify(body).slice(0, 300));
    }
    return { text: String(out).trim(), usage: body.usage, effort: shape.effort, cap: shape.cap };
  }
}

// One word list, shared with the plugin. A probe measuring a different rule from
// the one production enforces measures nothing.
const { maskVocabulary } = require("./src-vocabulary");
const leakedWords = (t) => maskVocabulary(t).leaked;

async function describe(model) {
  const png = toggleImage();
  fs.writeFileSync(path.join(__dirname, "fixtures", "vision-test.png"), png);
  console.log("test image: fixtures/vision-test.png (" + png.length + " bytes)\n");

  const started = Date.now();
  let out;
  try { out = await describeWith(model, png, "100x44 px; aspect ratio 2.27; spans 8% of the screen width"); }
  catch (e) { console.error("FAILED  " + e.message); process.exit(1); }
  console.log("HTTP 200  " + (Date.now() - started) + "ms  model=" + model +
    "  reasoning=" + (out.effort === null ? "n/a" : out.effort) + " (" + reasoningTokens(out.usage) + " tokens)" +
    "  cap=" + out.cap);
  console.log("\n--- description ---\n" + out.text);

  const leaked = leakedWords(out.text);
  console.log("\n--- the rule that matters ---");
  console.log(leaked.length
    ? "LEAKED design-system vocabulary: " + leaked.join(", ") +
      "\nThis model decides instead of describing, which hands the classification to it\n" +
      "rather than to the guide. Try a different model or tighten the instruction."
    : "Clean — no design-system vocabulary. The identification is left to Jev.");
  if (out.usage) console.log("\ntokens: " + JSON.stringify(out.usage));
}

module.exports = { toggleImage, describeWith, BASE, KEY };

if (require.main === module) {
  (MODEL ? describe(MODEL) : listModels()).catch((e) => {
    console.error("Could not reach " + BASE + " — " + e.message);
    process.exit(1);
  });
}
