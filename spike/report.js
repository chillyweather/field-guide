// The report: how many answers match the labels, per setup, per run and pooled.
//
//   node report.js [--candidates fixtures/candidates.json] [--responses fixtures/responses.json]
//
// Only labelled candidates with a completed call count. An unlabelled candidate
// cannot be right or wrong, and a failed call is missing, not wrong.

const path = require("path");
const { SPIKE, SETUPS, LETTER, responseKey, readJson, parseArgs } = require("./common");
const { loadCandidates, isLabelled } = require("./candidates");

/**
 * Per setup, per run and pooled: right, out of how many labelled candidates
 * with a completed call.
 */
function accuracy(candidates, entries, runs = [1, 2]) {
  const out = {};
  for (const setup of SETUPS) {
    const byRun = {};
    let right = 0, counted = 0;
    for (const run of runs) {
      let r = 0, c = 0;
      for (const candidate of candidates) {
        if (!isLabelled(candidate)) continue;
        const entry = entries[responseKey(candidate, setup, run)];
        if (!entry || entry.status !== "ok") continue;
        c++;
        if (entry.weighed.answer === candidate.label) r++;
      }
      byRun[run] = { right: r, counted: c };
      right += r; counted += c;
    }
    out[setup] = { right, counted, runs: byRun };
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const { candidates } = loadCandidates(path.resolve(SPIKE, args.candidates || "fixtures/candidates.json"));
  const { entries } = readJson(path.resolve(SPIKE, args.responses || "fixtures/responses.json"), { entries: {} });
  const result = accuracy(candidates, entries);
  const pct = ({ right, counted }) => (right + " / " + counted).padEnd(9) +
    (counted ? (Math.round((right / counted) * 100) + "%").padStart(5) : "    -");
  console.log("setup            run 1             run 2             pooled");
  for (const setup of SETUPS) {
    const a = result[setup];
    console.log((LETTER[setup] + " " + setup).padEnd(17) + pct(a.runs[1]).padEnd(18) + pct(a.runs[2]).padEnd(18) + pct(a));
  }
  console.log("right / labelled candidates with a completed call; unlabelled candidates and failed calls are not counted");
}

module.exports = { accuracy };

if (require.main === module) main();
