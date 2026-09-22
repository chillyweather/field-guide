// Builds the offline fixtures from responses the API actually returned.
//
// These began as hand-written probability maps and were wrong in a way that
// mattered: they assumed Jev spreads its probabilities across near-ties, and it
// mostly does not. Three of five live cases put everything on one option. A
// fixture invented from the documentation teaches the UI to handle a response
// the API will never send, so the live capture is now the source.
//
//   node probe.js                 # writes fixtures/jev-live.json
//   node fixtures/make-fixtures.js
//
// jev-live.json is gitignored; offline.json is committed, so the offline mode
// works on a clean clone with no key.

const fs = require("fs");
const path = require("path");

const here = __dirname;
const cases = require("../probe-cases");
const livePath = path.join(here, "jev-live.json");

if (!fs.existsSync(livePath)) {
  console.error("No fixtures/jev-live.json. Run `node probe.js` first.");
  process.exit(1);
}

const live = JSON.parse(fs.readFileSync(livePath, "utf8"));
const out = [];

for (const [name, body] of Object.entries(live)) {
  if (!cases[name] || !body.answers) continue;
  out.push({
    note: name,
    source: "live " + (body.model || "jev") + ", captured " + new Date().toISOString().slice(0, 10),
    description: cases[name].description,
    geometry: cases[name].geometry,
    answers: body.answers,
  });
}

// Not observed live: across five probes Jev never fell below 0.5 confidence,
// which is itself worth knowing. The branch still has to render, so one case is
// synthesised for it and labelled as such. Replace it the day a real one appears.
out.push({
  note: "below the acting threshold — synthetic, never observed live",
  source: "synthetic",
  description:
    "A rectangular region containing a photograph of a person at a desk, with no text, no border and no " +
    "visible control of any kind.",
  geometry: "320x180 px; aspect ratio 1.78; spans 25% of the screen width; positioned middle centre of the screen",
  answers: {
    component: {
      type: "choice",
      choice: "Other",
      confidence: 0.31,
      probabilities: { Other: 0.36, Card: 0.28, "Modal Dialog": 0.12, Badge: 0.08, Button: 0.06,
        Chip: 0.04, Link: 0.02, "Text Input": 0.01, "Search Field": 0.01, Select: 0.01,
        Checkbox: 0.005, "Radio Button": 0.005, Toggle: 0.0 },
    },
    family: { type: "choice", choice: "indicator", confidence: 0.4, probabilities: {} },
    accepts_typed_text: { type: "noul", noul: 0.02 },
    has_binary_on_off_state: { type: "noul", noul: 0.01 },
    contains_other_components: { type: "noul", noul: 0.22 },
    is_overlaid_above_content: { type: "noul", noul: 0.09 },
    is_dismissible: { type: "noul", noul: 0.03 },
  },
});

fs.writeFileSync(path.join(here, "offline.json"), JSON.stringify({ cases: out }, null, 2) + "\n");

const { weigh } = require("../src-weigh");
const taxonomy = JSON.parse(fs.readFileSync(path.join(here, "..", "taxonomy", "components.json"), "utf8"));
for (const c of out) {
  const v = weigh(c.answers, taxonomy);
  console.log(
    String(v.answer).padEnd(14) + v.verdict.padEnd(11) +
    "conf " + v.confidence.toFixed(2) +
    (v.contested ? "  contested" : "") + (v.familyAgrees ? "" : "  family: " + v.family) +
    "   " + (c.source === "synthetic" ? "[synthetic] " : "") + c.note,
  );
}
