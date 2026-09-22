// The whole pipeline, once, without Figma.
//
//   node probe-chain.js [model]
//
// Draws a test image, describes it, masks any design-system vocabulary, puts the
// masked description to Jev, and weighs the answer. Each stage prints, so when
// the plugin gets an identification wrong it is possible to say which stage lost
// it rather than guessing at the whole.

const fs = require("fs");
const path = require("path");

const { toggleImage, describeWith } = require("./probe-vision");
const { maskVocabulary } = require("./src-vocabulary");
const { buildQuestions, buildState } = require("./src-questions");
const { weigh } = require("./src-weigh");

const taxonomy = JSON.parse(fs.readFileSync(path.join(__dirname, "taxonomy", "components.json"), "utf8"));
const MODEL = process.argv[2] || "gpt-4o";
const GEOMETRY = "100x44 px; aspect ratio 2.27; spans 8% of the screen width; positioned middle left of the screen";
const EXPECTED = "Toggle"; // what the drawing is, by the guide's own definitions

const JEV_KEY = process.env.TYPESAFE_API_KEY;

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

async function askJev(description) {
  const res = await fetch("https://api.typesafe.ai/v1/systemone", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer " + process.env.TYPESAFE_API_KEY },
    body: JSON.stringify({
      model: "jev-latest",
      state: buildState(description, GEOMETRY),
      questions: buildQuestions(taxonomy),
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error("Jev HTTP " + res.status + " — " + text.slice(0, 300));
  return JSON.parse(text);
}

(async () => {
  if (!process.env.TYPESAFE_API_KEY) { console.error("No TYPESAFE_API_KEY in .env.local"); process.exit(2); }

  const png = toggleImage();
  fs.writeFileSync(path.join(__dirname, "fixtures", "vision-test.png"), png);
  console.log("1. image      fixtures/vision-test.png, " + png.length + " bytes");
  console.log("              a rounded grey track with a white circle at its left inside edge");

  const t0 = Date.now();
  const seen = await describeWith(MODEL, png, GEOMETRY);
  console.log("\n2. vision     " + MODEL + ", " + (Date.now() - t0) + "ms, " +
    ((seen.usage && seen.usage.prompt_tokens) || "?") + " input tokens");
  console.log("              " + seen.text.replace(/\s+/g, " ").replace(/(.{88})/g, "$1\n              "));

  const masked = maskVocabulary(seen.text);
  console.log("\n3. masking    " + (masked.masked
    ? "removed " + masked.leaked.join(", ") + " — the vision model named it, the guide did not see that"
    : "clean, nothing to remove"));
  if (masked.masked) console.log("              " + masked.text.replace(/\s+/g, " ").slice(0, 88));

  const t1 = Date.now();
  const body = await askJev(masked.text);
  const v = weigh(body.answers, taxonomy);
  console.log("\n4. jev        " + (Date.now() - t1) + "ms, " +
    ((body.usage && body.usage.input_tokens) || "?") + " input tokens");
  console.log("              " + v.runners.filter((r) => r[1] > 0).map((r) => r[0] + " " + r[1]).join("   "));

  console.log("\n5. verdict    " + v.answer + "   confidence " + v.confidence.toFixed(2) + "   " + v.verdict +
    (v.contested ? "   contested" : "") + (v.familyAgrees ? "" : "   family says " + v.family));

  const right = v.answer === EXPECTED;
  console.log("\n" + (right
    ? "Correct — the drawing is a " + EXPECTED + " by the guide's own definitions" +
      (masked.masked ? ", and it got there after the giveaway word was removed." : ".")
    : "Wrong — expected " + EXPECTED + ", got " + v.answer + ". The stages above say where it went."));
  process.exit(right ? 0 : 1);
})().catch((e) => { console.error("\nFAILED — " + e.message); process.exit(1); });
