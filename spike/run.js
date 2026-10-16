// The spike runner: every candidate, through each setup, twice, to Jev.
//
//   node run.js [--candidates fixtures/candidates.json] [--responses fixtures/responses.json]
//               [--captures captures] [--budget 1.00] [--dry-run]
//
// Before any call it counts what is missing, estimates the cost, prints it,
// and refuses to start above the budget. Each answer is weighed by the
// plugin's own weigh() and saved with its raw response the moment it arrives,
// keyed by (candidate, setup, run). A rerun sends only what is missing or
// failed. The logic is in runner.js; this file is the disk, the key and the
// network.

const path = require("path");
const fs = require("fs");
const { SPIKE, LETTER, candidateKey, evidenceName, readJson, writeJson, loadEnv, parseArgs, loadCaptures } = require("./common");
const { loadCandidates } = require("./candidates");

loadEnv();
const { send } = require("./jev");
const { planJobs, estimateCost, checkBudget, runJobs, RUNS, DEFAULT_BUDGET } = require("./runner");
const { JEV_PRICE_IN } = require("../src-request");

/**
 * Refuses, before anything is sent, a candidate whose capture is missing, whose
 * screenshot is gone, or whose capture is not the one its saved answers came
 * from. Every answer for a candidate must come from one capture: a page
 * recaptured part way through would compare setups on different pages.
 */
function preflight(jobs, entries, captures) {
  const problems = [];
  const seen = new Set();
  for (const { candidate } of jobs) {
    const key = candidateKey(candidate);
    if (seen.has(key)) continue;
    seen.add(key);
    const found = captures.get(candidate.page);
    if (!found) { problems.push(key + ": no capture of " + candidate.page + " (node capture.js " + candidate.page + ")"); continue; }
    if (!found.record.elements.some((e) => e.id === candidate.element)) problems.push(key + ": no such element in the capture");
    if (!fs.existsSync(found.screenshot)) problems.push(key + ": the screenshot is missing (screenshots are not committed); recapture the page");
    const earlier = Object.values(entries).find((e) => e.candidate === key && e.status === "ok" && e.capturedAt);
    if (earlier && earlier.capturedAt !== found.record.capturedAt) {
      problems.push(key + ": saved answers come from the capture of " + earlier.capturedAt + ", the capture on disk is from " +
        found.record.capturedAt + "; restore that capture, or delete the candidate's answers to start it again");
    }
  }
  if (problems.length) throw new Error("Nothing was sent:\n  " + problems.join("\n  "));
}

function summary(stats, ms, file) {
  return stats.calls + " calls (" + stats.ok + " ok, " + stats.failed + " failed), " + stats.tokens.toLocaleString() +
    " input tokens, $" + ((stats.tokens / 1e6) * JEV_PRICE_IN).toFixed(4) + ", " + Math.round(ms / 1000) + "s → " +
    path.relative(SPIKE, file);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const candidatesFile = path.resolve(SPIKE, args.candidates || "fixtures/candidates.json");
  const responsesFile = path.resolve(SPIKE, args.responses || "fixtures/responses.json");
  const captures = loadCaptures(path.resolve(SPIKE, args.captures || "captures"));
  const budget = args.budget !== undefined ? Number(args.budget) : DEFAULT_BUDGET;
  if (!(budget >= 0)) throw new Error("--budget takes a number of dollars.");

  const { candidates } = loadCandidates(candidatesFile);
  const fixture = readJson(responsesFile, { entries: {} });
  const entries = fixture.entries;

  const jobs = planJobs(candidates, entries);
  if (!candidates.length) {
    console.log("No candidates in " + path.relative(SPIKE, candidatesFile) + " yet. See node select.js and node candidates.js.");
    return;
  }
  if (!jobs.length) {
    console.log("Nothing missing: " + candidates.length + " candidates × 3 setups × " + RUNS + " runs are all saved.");
    return;
  }

  const estimate = estimateCost(jobs, entries);
  const retries = jobs.filter((j) => j.retry).length;
  console.log(jobs.length + " calls missing" + (retries ? " (" + retries + " of them retrying a failure)" : "") +
    ", about " + estimate.tokens.toLocaleString() + " input tokens, estimated $" + estimate.usd.toFixed(4) +
    " against a budget of $" + budget.toFixed(2) + ".");
  for (const [setup, b] of Object.entries(estimate.basis)) {
    console.log("  " + LETTER[setup] + " " + setup.padEnd(10) + b.tokens.toLocaleString().padStart(7) + " tokens a call, from " + b.from);
  }
  checkBudget(estimate, budget);
  if (args["dry-run"]) return;

  preflight(jobs, entries, captures);
  const key = process.env.TYPESAFE_API_KEY;
  if (!key) throw new Error("No key. Put TYPESAFE_API_KEY in the repository's .env.local (gitignored, never printed).");

  const { buildEvidence } = require("./evidence");
  const startedAt = Date.now();
  let stats;
  try {
    stats = await runJobs({
      jobs,
      entries,
      send: (request) => send(request, key),
      evidenceFor: async (candidate) => {
        const found = captures.get(candidate.page);
        const evidence = await buildEvidence({
          record: found.record, elementId: candidate.element, screenshot: found.screenshot,
          name: evidenceName(candidate, found.record.capturedAt),
        });
        return Object.assign(evidence, { capturedAt: found.record.capturedAt });
      },
      save: () => writeJson(responsesFile, fixture),
      log: (job, entry) => console.log(job.key.padEnd(56) + (entry.status === "ok"
        ? String(entry.weighed.answer).padEnd(14) + entry.weighed.verdict.padEnd(10) + entry.weighed.confidence.toFixed(2) +
          "  " + entry.ms + "ms " + entry.inputTokens + " in"
        : "FAILED  " + entry.error.split("\n")[0].slice(0, 120))),
    });
  } catch (error) {
    if (error.stats) console.log(summary(error.stats, Date.now() - startedAt, responsesFile));
    throw error;
  }
  console.log(summary(stats, Date.now() - startedAt, responsesFile));
}

module.exports = { preflight };

if (require.main === module) main().catch((error) => { console.error(error.message || error); process.exit(1); });
