// One real call to Jev, from the terminal.
//
//   TYPESAFE_API_KEY=sk-... node probe.js
//
// Prints the raw response, saves it to fixtures/jev-live.json, and then checks
// it against what the decision logic actually reads. The docs describe the
// shape; this is the only thing that knows it.

const fs = require("fs");
const path = require("path");
const { weigh } = require("./src-weigh");

const KEY = process.env.TYPESAFE_API_KEY || process.argv[2];
const ENDPOINT = "https://api.typesafe.ai/v1/systemone";
const MODEL = process.env.JEV_MODEL || "jev-latest";

if (!KEY) {
  console.error("Need a key:  TYPESAFE_API_KEY=sk-... node probe.js");
  process.exit(2);
}

const taxonomy = JSON.parse(fs.readFileSync(path.join(__dirname, "taxonomy", "components.json"), "utf8"));

// Deliberately a describable region with a real confusion pair behind it, so the
// probe exercises the interesting path rather than the easy one.
const STATE =
  "A region of a user interface, described by an observer:\n\n" +
  "A small pill-shaped element with a pale green fill and no border, about 60 by 22 pixels. " +
  "Dark green text inside reads 'Active'. No icon and no visible dismiss affordance.\n\n" +
  "Geometry from the design file: 60x22 px; aspect ratio 2.73; spans 4% of the screen width; " +
  "positioned top right of the screen";

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

(async () => {
  const started = Date.now();
  let res;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer " + KEY },
      body: JSON.stringify({ model: MODEL, state: STATE, questions }),
    });
  } catch (error) {
    console.error("Could not reach " + ENDPOINT + " — " + error.message);
    console.error("Check https://status.typesafe.ai/ before assuming it is your code.");
    process.exit(1);
  }

  const text = await res.text();
  console.log("HTTP " + res.status + "  " + (Date.now() - started) + "ms  model=" + MODEL);

  if (!res.ok) {
    console.error("\n" + text.slice(0, 900));
    if (res.status === 401 || res.status === 403) console.error("\nThat reads like a key or entitlement problem, not a shape problem.");
    if (res.status === 402) console.error("\nThat reads like an empty credit balance. See the console's usage page.");
    if (res.status === 429) console.error("\nRate limited. The docs warn these move without notice.");
    process.exit(1);
  }

  let body;
  try { body = JSON.parse(text); } catch { console.error("Not JSON:\n" + text.slice(0, 900)); process.exit(1); }

  fs.mkdirSync(path.join(__dirname, "fixtures"), { recursive: true });
  fs.writeFileSync(path.join(__dirname, "fixtures", "jev-live.json"), JSON.stringify(body, null, 2) + "\n");
  console.log("saved fixtures/jev-live.json\n");
  console.log(JSON.stringify(body, null, 2).slice(0, 2000));

  console.log("\n--- what the plugin reads ---");
  const answers = body.answers || body;
  const complaints = [];
  if (!answers || typeof answers !== "object") complaints.push("no `answers` object, and the body is not one either");
  else {
    const c = answers.component;
    if (!c) complaints.push("answers.component missing");
    else {
      if (typeof c.choice !== "string") complaints.push("answers.component.choice is not a string");
      if (!c.probabilities || typeof c.probabilities !== "object") complaints.push("answers.component.probabilities missing");
      if (typeof c.confidence !== "number") complaints.push("answers.component.confidence is not a number");
    }
    if (!answers.family) complaints.push("answers.family missing");
    for (const id of Object.keys(taxonomy.probes)) {
      if (!answers[id]) complaints.push("probe " + id + " missing");
      else if (typeof answers[id].noul !== "number") complaints.push("probe " + id + " has no numeric .noul");
    }
  }

  if (complaints.length) {
    console.log("Shape differs from what src-ui.html and src-weigh.js assume:");
    for (const c of complaints) console.log("  - " + c);
    console.log("\nFix those two files against fixtures/jev-live.json, then rerun `node test.js`.");
    process.exit(1);
  }

  console.log("Shape matches. weigh() says:");
  console.log(weigh(answers, taxonomy));
})();
