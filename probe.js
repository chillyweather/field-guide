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

/**
 * Keys come from .env.local, which is gitignored and never printed.
 *
 * The point of the file is that the key stops travelling through command lines:
 * a key passed as an argument or exported inline lands in shell history, in
 * process listings, and in the transcript of anyone driving this session.
 */
function loadEnvFile() {
  const file = path.join(__dirname, ".env.local");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const match = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const value = match[2].replace(/^["']|["']$/g, "").trim();
    if (value && !process.env[match[1]]) process.env[match[1]] = value;
  }
}
loadEnvFile();

const KEY = process.env.TYPESAFE_API_KEY || process.argv[2];
const ENDPOINT = "https://api.typesafe.ai/v1/systemone";
const MODEL = process.env.JEV_MODEL || "jev-latest";

if (!KEY) {
  console.error("No key found.\n");
  console.error("Put one in .env.local (gitignored, never printed):");
  console.error("    TYPESAFE_API_KEY=sk-...");
  console.error("\nOr pass it for one run:  TYPESAFE_API_KEY=sk-... node probe.js");
  process.exit(2);
}

const taxonomy = JSON.parse(fs.readFileSync(path.join(__dirname, "taxonomy", "components.json"), "utf8"));

const PROBE_CASES = require("./probe-cases");
const CASES = Object.fromEntries(Object.entries(PROBE_CASES).map(([k, v]) => [k, v.description]));
const GEOMETRY = Object.fromEntries(Object.entries(PROBE_CASES).map(([k, v]) => [k, v.geometry]));

const only = process.argv[2] && !process.argv[2].startsWith("sk-") ? process.argv[2] : null;
if (only && !CASES[only]) {
  console.error("Unknown case '" + only + "'. Known: " + Object.keys(CASES).join(", "));
  process.exit(2);
}

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
