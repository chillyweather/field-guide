// Builds the offline fixtures.
//
// Hand-written probability maps drift out of sum-to-1 the moment anyone edits
// them, and a fixture that could not have come off the wire teaches the UI to
// handle a response the API will never send. So they are generated: name the
// interesting options, spread the remainder, derive confidence the way the
// documentation says it is derived.

const fs = require("fs");
const path = require("path");

const taxonomy = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "taxonomy", "components.json"), "utf8"));
const NAMES = Object.keys(taxonomy.components);
const N = NAMES.length;

/** Confidence from the shape of the distribution, generalised from the docs' 3-option form. */
const confidenceOf = (pMax) => (N * pMax - 1) / (N - 1);

function distribution(weights) {
  const named = Object.values(weights).reduce((a, b) => a + b, 0);
  const rest = NAMES.filter((n) => !(n in weights));
  const share = (1 - named) / rest.length;
  const probs = {};
  for (const n of NAMES) probs[n] = +(n in weights ? weights[n] : share).toFixed(4);
  return probs;
}

function answer(weights, family, probes) {
  const probabilities = distribution(weights);
  const choice = Object.entries(probabilities).sort((a, b) => b[1] - a[1])[0][0];
  return {
    component: { choice, probabilities, confidence: +confidenceOf(probabilities[choice]).toFixed(4) },
    family: { choice: family, probabilities: {}, confidence: 0.9 },
    ...probes,
  };
}

const noul = (v) => ({ noul: v });

// Five specimens, chosen so that every branch of weigh() is exercised offline.
const cases = [
  {
    note: "clean identification — acts alone",
    description:
      "A filled rectangle with fully rounded ends and a solid blue background, about three times wider than it is tall. " +
      "Centred white text reads 'Continue'. No icon, no border, no visible state marker.",
    answers: answer({ Button: 0.96 }, "action", {
      accepts_typed_text: noul(0.01), has_binary_on_off_state: noul(0.02),
      contains_other_components: noul(0.03), is_overlaid_above_content: noul(0.05), is_dismissible: noul(0.02),
    }),
  },
  {
    note: "clean identification — acts alone",
    description:
      "A small square outline with a white fill and a thin grey border, roughly 18 by 18 pixels, containing a dark check mark. " +
      "To its right, dark text reads 'Remember me on this device'.",
    answers: answer({ Checkbox: 0.93 }, "selection", {
      accepts_typed_text: noul(0.01), has_binary_on_off_state: noul(0.97),
      contains_other_components: noul(0.02), is_overlaid_above_content: noul(0.03), is_dismissible: noul(0.01),
    }),
  },
  {
    note: "confusion pair — the guide does not separate these",
    description:
      "A small pill-shaped element with a pale green fill and no border, about 60 by 22 pixels. " +
      "Dark green text inside reads 'Active'. No icon and no visible dismiss affordance.",
    answers: answer({ Chip: 0.54, Badge: 0.42 }, "indicator", {
      accepts_typed_text: noul(0.01), has_binary_on_off_state: noul(0.08),
      contains_other_components: noul(0.02), is_overlaid_above_content: noul(0.04), is_dismissible: noul(0.11),
    }),
  },
  {
    note: "genuinely uncertain — left for the human",
    description:
      "A large white rectangle with rounded corners and a soft drop shadow, occupying much of the frame. " +
      "It contains a heading, two lines of body text and two smaller rectangles side by side at the bottom right. " +
      "The surrounding area of the context image appears darkened.",
    answers: answer({ Card: 0.34, "Modal Dialog": 0.29 }, "container", {
      accepts_typed_text: noul(0.04), has_binary_on_off_state: noul(0.02),
      contains_other_components: noul(0.96), is_overlaid_above_content: noul(0.58), is_dismissible: noul(0.41),
    }),
  },
  {
    note: "high probability, but the behaviour answer contradicts it — downgraded",
    description:
      "A rectangular field with a thin grey border and a white fill, spanning about a third of the screen width. " +
      "Grey text on the left reads 'Choose a country' and a small downward chevron sits at the right edge.",
    answers: answer({ Select: 0.92 }, "text_entry", {
      accepts_typed_text: noul(0.44), has_binary_on_off_state: noul(0.02),
      contains_other_components: noul(0.03), is_overlaid_above_content: noul(0.04), is_dismissible: noul(0.02),
    }),
  },
];

fs.writeFileSync(path.join(__dirname, "offline.json"), JSON.stringify({ cases }, null, 2) + "\n");

for (const c of cases) {
  const a = c.answers.component;
  console.log(
    String(a.choice).padEnd(14),
    "p=" + a.probabilities[a.choice].toFixed(2),
    "conf=" + a.confidence.toFixed(3),
    "sum=" + Object.values(a.probabilities).reduce((x, y) => x + y, 0).toFixed(3),
    " " + c.note,
  );
}
