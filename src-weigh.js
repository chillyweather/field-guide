// The composition step — pure, and the only part worth testing.
//
// Jev answers the questions. This decides what to do about the answers, which
// is where the judgement lives and therefore where it must be inspectable
// without a network, a key, or Figma.

// Naming a layer is cheap to undo, so the bar for acting alone sits at
// TypeSafe's documented high-confidence band and no higher.
const ACT_ALONE = 0.9;
const NEEDS_HUMAN = 0.5;
// Two options within this distance are not a weak answer. They are a taxonomy
// that does not separate them, which is a finding about the design system
// rather than about the model.
const CONTESTED_GAP = 0.15;

function weigh(answers, taxonomy) {
  const c = answers.component;
  const probs = Object.entries(c.probabilities).sort((a, b) => b[1] - a[1]);
  const top = probs[0];
  const second = probs[1];
  const entry = taxonomy.components[c.choice] || {};

  // An independent read on the same state. A behaviour answer that contradicts
  // the family recorded for the chosen component is a reason to distrust a high
  // probability, not a detail to report beside it.
  const familyAgrees = !entry.family || !answers.family || answers.family.choice === entry.family;
  const contested = Boolean(second) && top[1] - second[1] < CONTESTED_GAP;

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
  module.exports = { weigh, ACT_ALONE, NEEDS_HUMAN, CONTESTED_GAP };
}
