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

// A control, then four regions written to sit on the fence.
//
// The control should be decisive. The other four describe things the guide
// deliberately does not separate, worded so that the deciding evidence is
// genuinely absent rather than merely unmentioned. If Jev spreads its
// probabilities anywhere, it is here; if it does not spread them here, the
// confusion-pair signal does not exist and should come out of the plugin.
const CASES = {
  "control-badge":
    "A small pill-shaped element with a pale green fill and no border, about 60 by 22 pixels. " +
    "Dark green text inside reads 'Active'. No icon and no visible dismiss affordance.",

  "chip-or-badge":
    "A small pill-shaped element with a pale grey fill and a thin border, about 84 by 24 pixels. " +
    "Dark text inside reads 'Marketing' and a small x glyph sits at its right edge. " +
    "Nothing indicates whether the x responds to a click.",

  "button-or-link":
    "A short run of blue text reading 'Learn more', with no background fill, no border and no rounded " +
    "container behind it. It is not underlined. It sits on its own line below a paragraph of body text.",

  "card-or-modal":
    "A white rectangle with rounded corners and a soft drop shadow, containing a bold heading, two lines " +
    "of body text, and two small rectangles side by side at its lower right. The context image is cropped " +
    "so that nothing outside this rectangle is visible.",

  "checkbox-or-toggle":
    "A small control about 40 by 22 pixels with a fully rounded outline, filled pale grey, with a white " +
    "circle sitting against its left inside edge. Text to its right reads 'Notifications'.",
};

const only = process.argv[2] && !process.argv[2].startsWith("sk-") ? process.argv[2] : null;
if (only && !CASES[only]) {
  console.error("Unknown case '" + only + "'. Known: " + Object.keys(CASES).join(", "));
  process.exit(2);
}

const GEOMETRY = {
  "control-badge": "60x22 px; aspect ratio 2.73; spans 4% of the screen width; positioned top right of the screen",
  "chip-or-badge": "84x24 px; aspect ratio 3.50; spans 6% of the screen width; positioned middle left of the screen",
  "button-or-link": "78x18 px; aspect ratio 4.33; spans 6% of the screen width; positioned middle left of the screen",
  "card-or-modal": "480x260 px; aspect ratio 1.85; spans 38% of the screen width; positioned middle centre of the screen",
  "checkbox-or-toggle": "40x22 px; aspect ratio 1.82; spans 3% of the screen width; positioned middle left of the screen",
};

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

async function ask(name) {
  const state =
    "A region of a user interface, described by an observer:\n\n" + CASES[name] +
    "\n\nGeometry from the design file: " + GEOMETRY[name];

  const started = Date.now();
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer " + KEY },
    body: JSON.stringify({ model: MODEL, state, questions }),
  });
  const text = await res.text();
  if (!res.ok) {
    const hint = res.status === 401 || res.status === 403 ? " (key or entitlement)"
      : res.status === 402 ? " (empty credit balance — check the console)"
      : res.status === 429 ? " (rate limited; the docs warn these move without notice)" : "";
    throw new Error("HTTP " + res.status + hint + " — " + text.slice(0, 300));
  }
  return { body: JSON.parse(text), ms: Date.now() - started };
}

/** Every field the plugin actually reads, named individually when it differs. */
function checkShape(answers) {
  const complaints = [];
  const c = answers && answers.component;
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
  return complaints;
}

(async () => {
  const names = only ? [only] : Object.keys(CASES);
  const saved = {};
  let tokens = 0, spread = 0, checked = false;

  console.log("case                 answer          p1     p2     conf   verdict     contested");
  console.log("-".repeat(86));

  for (const name of names) {
    let out;
    try {
      out = await ask(name);
    } catch (error) {
      console.log(name.padEnd(21) + "FAILED — " + error.message.split("\n")[0]);
      if (/HTTP (401|402|403)/.test(error.message)) process.exit(1);
      continue;
    }

    const answers = out.body.answers;
    if (!checked) {
      const complaints = checkShape(answers);
      checked = true;
      if (complaints.length) {
        console.log("\nShape differs from what src-weigh.js and the UI read:");
        for (const c of complaints) console.log("  - " + c);
        console.log("\nFix those against fixtures/jev-live.json, then rerun node test.js.");
        process.exit(1);
      }
    }

    saved[name] = out.body;
    tokens += (out.body.usage && out.body.usage.input_tokens) || 0;

    const v = weigh(answers, taxonomy);
    const p1 = v.runners[0] ? v.runners[0][1] : 0;
    const p2 = v.runners[1] ? v.runners[1][1] : 0;
    if (p2 > 0) spread++;

    console.log(
      name.padEnd(21) +
      String(v.answer).padEnd(16) +
      p1.toFixed(2).padEnd(7) +
      p2.toFixed(2).padEnd(7) +
      v.confidence.toFixed(2).padEnd(7) +
      v.verdict.padEnd(12) +
      (v.contested ? v.runners.slice(0, 2).map((r) => r[0]).join(" / ") : "-") +
      (v.familyAgrees ? "" : "   [family says " + v.family + "]"),
    );
  }

  fs.mkdirSync(path.join(__dirname, "fixtures"), { recursive: true });
  fs.writeFileSync(path.join(__dirname, "fixtures", "jev-live.json"), JSON.stringify(saved, null, 2) + "\n");

  console.log("-".repeat(86));
  console.log(names.length + " calls, " + tokens + " input tokens, about $" + (tokens / 1e6 * 0.042).toFixed(5));
  console.log("saved fixtures/jev-live.json");
  console.log(
    spread === 0
      ? "\nNo case produced a runner-up above zero. If that holds, the confusion-pair\n" +
        "signal never fires and should come out of the plugin — say so in the write-up\n" +
        "rather than shipping a feature that cannot trigger."
      : "\n" + spread + " of " + names.length + " cases spread probability onto a runner-up. The signal is real.",
  );
})();
