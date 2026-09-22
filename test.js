// Runs the decision logic against the offline fixtures. No network, no key, no Figma.
// `node test.js`

const fs = require("fs");
const path = require("path");
const { weigh } = require("./src-weigh");
const { maskVocabulary } = require("./src-vocabulary");

const taxonomy = JSON.parse(fs.readFileSync(path.join(__dirname, "taxonomy", "components.json"), "utf8"));
const { cases } = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "offline.json"), "utf8"));

const expected = [
  // Five captured live on 22 September 2026, one synthetic. Expectations follow
  // what the API returned, not what the documentation suggested it would.
  { answer: 'Badge', verdict: 'confident', contested: false, familyAgrees: true },
  // Jev put everything on Chip, and the behaviour question said 'action' while
  // the guide files Chip under 'selection'. The cross-check is what holds this
  // back from acting alone — arguably the guide is the thing that is wrong here.
  { answer: 'Chip', verdict: 'check', contested: false, familyAgrees: false },
  { answer: 'Link', verdict: 'confident', contested: false, familyAgrees: true },
  // The only live case that spread: 0.65 against 0.34, and the one the runner-up
  // floor exists to catch.
  { answer: 'Card', verdict: 'check', contested: true, familyAgrees: true },
  { answer: 'Toggle', verdict: 'confident', contested: false, familyAgrees: true },
  // Synthetic. No live probe fell below the 0.5 confidence threshold.
  { answer: 'Other', verdict: 'unsure', contested: true, familyAgrees: true },
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


// The masking rule, which production applies to every description before the
// guide sees it. gpt-4o-mini leaked on 1 of 3 identical calls, so this is not
// belt and braces.
const masking = [
  { in: 'a small circular area that appears to be in a toggle position', leaked: ['toggle'] },
  { in: 'A radio button sits beside the label', leaked: ['radio button'], notIn: 'button' },
  { in: 'An oval shape with a light gray fill and a darker border', leaked: [] },
  { in: 'a search field beside a select dropdown', leaked: ['search field', 'dropdown', 'select'] },
  { in: 'Cards are stacked above the modal', leaked: ['card', 'modal'] },
  // Cost one live run to find: the noun was masked, the participle was not, and
  // the description carried the answer through anyway.
  { in: 'a thumb suggesting a toggled position', leaked: ['toggled'] },
  // Deliberately untouched. These describe visible state, which is the evidence
  // the guide asked for, not a component name.
  { in: 'in a selected state with a check mark visible', leaked: [] },
];

for (const m of masking) {
  const got = maskVocabulary(m.in);
  const sameWords = got.leaked.slice().sort().join('|') === m.leaked.slice().sort().join('|');
  const strayWord = m.notIn && new RegExp('\\b' + m.notIn + '\\b', 'i').test(got.text);
  if (!sameWords || strayWord) {
    failed++;
    console.log('FAIL  masking: ' + m.in);
    if (!sameWords) console.log('        expected [' + m.leaked.join(', ') + '], got [' + got.leaked.join(', ') + ']');
    if (strayWord) console.log('        left a stray "' + m.notIn + '" behind: ' + got.text);
  } else {
    console.log('ok    mask ' + (m.leaked.length ? '[' + m.leaked.join(', ') + ']' : 'clean').padEnd(38) + got.text.slice(0, 44));
  }
}

console.log(failed ? '\n' + failed + ' failing' : '\nall passing');
process.exit(failed ? 1 : 0);
