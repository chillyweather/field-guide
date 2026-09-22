// The composition step — pure, and the only part worth testing.
//
// Jev answers the questions. This decides what to do about the answers, which
// is where the judgement lives and therefore where it must be inspectable
// without a network, a key, or Figma.

// Naming a layer is cheap to undo, so the bar for acting alone sits at
// TypeSafe's documented high-confidence band and no higher.
const ACT_ALONE = 0.9;
const NEEDS_HUMAN = 0.5;
// A runner-up holding this much probability means the guide left real mass on a
// second component: not a weak answer, but a taxonomy that does not separate the
// two, which is a finding about the design system rather than about the model.
//
// Calibrated against five live responses on 22 September 2026, not chosen a
// priori. Jev turned out to be decisive — three of the five put everything on
// one option — and where it did spread, it spread to 0.65/0.34. A gap rule set
// at 0.15 could not fire on that, and did not. The runner-up floor reads more
// directly ("a second option kept meaningful mass"), survives a three-way split,
// and separates the observed ambiguous case (0.34) from the observed clear one
// (0.02) with room on both sides.
//
// Five points is thin. Revisit it after the first real screenshot run.
const CONTESTED_FLOOR = 0.2;

function weigh(answers, taxonomy) {
  const c = answers.component;
  const probs = Object.entries(c.probabilities).sort((a, b) => b[1] - a[1]);
  const second = probs[1];
  const entry = taxonomy.components[c.choice] || {};

  // An independent read on the same state. A behaviour answer that contradicts
  // the family recorded for the chosen component is a reason to distrust a high
  // probability, not a detail to report beside it.
  // 'Other' is exempt. It means 'not a component', which has no behaviour for the
  // family question to confirm or contradict, so any answer at all looked like a
  // disagreement. Measured cost of the bug: on an 18-region run it held back an
  // Other at confidence 0.96 for contradicting a family the entry should never
  // have carried.
  const familyAgrees = c.choice === "Other" || !entry.family || !answers.family ||
    answers.family.choice === entry.family;
  // Only between two real components. A run-off against 'Other' is not a
  // taxonomy that fails to separate two things, it is the guide failing to
  // recognise one — a different finding, and reporting it as a confusion pair
  // says something false about the design system. Seen live on a page heading:
  // Other 0.39, Button 0.32, printed as 'the guide does not separate these'.
  const realRunOff = Boolean(second) && c.choice !== "Other" && second[0] !== "Other";
  const contested = realRunOff && second[1] >= CONTESTED_FLOOR;

  let verdict = "unsure";
  if (c.confidence >= ACT_ALONE && familyAgrees && !contested) verdict = "confident";
  else if (c.confidence >= NEEDS_HUMAN) verdict = "check";

  const probes = {};
  for (const key of Object.keys(taxonomy.probes || {})) {
    probes[key] = answers[key] ? answers[key].noul : null;
  }

  return {
    answer: c.choice,
    confidence: c.confidence,
    verdict,
    contested,
    familyAgrees,
    family: answers.family ? answers.family.choice : null,
    runners: probs.slice(0, 3),
    probes,
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { weigh, ACT_ALONE, NEEDS_HUMAN, CONTESTED_FLOOR };
}
