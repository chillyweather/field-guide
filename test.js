// Runs the decision logic against the offline fixtures. No network, no key, no Figma.
// `node test.js`

const fs = require("fs");
const path = require("path");
const { weigh } = require("./src-weigh");

const taxonomy = JSON.parse(fs.readFileSync(path.join(__dirname, "taxonomy", "components.json"), "utf8"));
const { cases } = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "offline.json"), "utf8"));

const expected = [
  { answer: "Button", verdict: "confident", contested: false, familyAgrees: true },
  { answer: "Checkbox", verdict: "confident", contested: false, familyAgrees: true },
  // Both signals fire at once: the top two are inseparable, and the behaviour
  // answer leans to the other one of them. Realistic, and the richest case here.
  { answer: "Chip", verdict: "check", contested: true, familyAgrees: false },
  { answer: "Card", verdict: "unsure", contested: true, familyAgrees: true },
  // 0.913 clears the act-alone bar, and is held back only by the family answer.
  { answer: "Select", verdict: "check", contested: false, familyAgrees: false },
];

let failed = 0;

cases.forEach((c, i) => {
  const got = weigh(c.answers, taxonomy);
  const want = expected[i];
  const bad = Object.keys(want).filter((k) => got[k] !== want[k]);

  if (bad.length) {
    failed++;
    console.log("FAIL  " + c.note);
    for (const k of bad) console.log("        " + k + ": expected " + want[k] + ", got " + got[k]);
  } else {
    console.log("ok    " + got.answer.padEnd(14) + got.verdict.padEnd(11) + "conf " + got.confidence.toFixed(3) +
      (got.contested ? "  contested: " + got.runners.slice(0, 2).map((r) => r[0]).join(" / ") : "") +
      (got.familyAgrees ? "" : "  family says " + got.family));
  }
});

// The probe list must stay in step with the guide, or the UI silently renders blanks.
const probes = weigh(cases[0].answers, taxonomy).probes;
const missing = Object.keys(taxonomy.probes).filter((k) => probes[k] === null || probes[k] === undefined);
if (missing.length) { failed++; console.log("FAIL  probes absent from fixtures: " + missing.join(", ")); }
else console.log("ok    all " + Object.keys(taxonomy.probes).length + " probes carried through");

console.log(failed ? "\n" + failed + " failing" : "\nall passing");
process.exit(failed ? 1 : 0);
