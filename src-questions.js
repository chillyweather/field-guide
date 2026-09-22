// The questions put to Jev, defined once.
//
// Three callers ask them: the plugin, probe.js, and probe-chain.js. If they
// each built their own, a probe would measure a pipeline that is not the one
// shipping — which is the failure mode probes exist to prevent.
//
// One Choice for the component, one for behaviour, and the guide's probes as
// nouls. All in a single call: the documentation is explicit that questions are
// evaluated in parallel against the same state with no penalty for asking more,
// and the behaviour answer is only useful as an independent read.

function buildQuestions(taxonomy) {
  const criteria = {};
  for (const [name, entry] of Object.entries(taxonomy.components)) {
    criteria[name] = { what: entry.what, not_for: entry.not_for, examples: entry.examples };
  }

  const questions = {
    component: {
      type: "choice",
      instructions: "Which component from this design-system field guide does the described region show?",
      criteria,
    },
    family: {
      type: "choice",
      instructions: "What kind of component is the described region, by behaviour?",
      criteria: taxonomy.families,
    },
  };

  for (const [id, statement] of Object.entries(taxonomy.probes)) {
    questions[id] = { type: "noul", instructions: statement };
  }
  return questions;
}

/** The state string, also shared, so the geometry reaches Jev the same way everywhere. */
function buildState(description, geometry) {
  return "A region of a user interface, described by an observer:\n\n" + description +
    "\n\nGeometry from the design file: " + geometry;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { buildQuestions, buildState };
}
