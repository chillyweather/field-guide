// The report: how many answers match the labels, per setup.
//
//   node report.js [--candidates fixtures/candidates.json] [--responses fixtures/responses.json]
//
// Only labelled candidates with a completed call count. An unlabelled candidate
// cannot be right or wrong, and a failed call is missing, not wrong.

const path = require("path");
const { SPIKE, SETUPS, LETTER, responseKey, readJson, parseArgs } = require("./common");

/** Per setup: right, out of how many labelled candidates with a completed call. */
function accuracy(candidates, entries) {
  const out = {};
  for (const setup of SETUPS) {
    let right = 0, counted = 0;
    for (const candidate of candidates) {
      if (!candidate.label) continue;
      const entry = entries[responseKey(candidate, setup, 1)];
      if (!entry || entry.status !== "ok") continue;
      counted++;
      if (entry.weighed.answer === candidate.label) right++;
    }
    out[setup] = { right, counted };
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const { candidates } = readJson(path.resolve(SPIKE, args.candidates || "fixtures/candidates.json"), { candidates: [] });
  const { entries } = readJson(path.resolve(SPIKE, args.responses || "fixtures/responses.json"), { entries: {} });
  const result = accuracy(candidates, entries);
  console.log("setup            right / labelled   accuracy");
  for (const setup of SETUPS) {
    const { right, counted } = result[setup];
    console.log((LETTER[setup] + " " + setup).padEnd(17) + (right + " / " + counted).padEnd(19) +
      (counted ? Math.round((right / counted) * 100) + "%" : "no labelled answers"));
  }
}

module.exports = { accuracy };

if (require.main === module) main();
