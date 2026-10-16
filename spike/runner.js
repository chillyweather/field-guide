// The runner's logic, kept apart from the network, the browser and the disk so
// that queueing, resuming and the budget can be tested offline.
//
// A run is a list of jobs: every candidate through every setup, twice. A job is
// done when the fixture holds an "ok" entry for its key. A failed entry is
// kept, with the API's reason, and is asked again on the next run: it is
// missing, not wrong.

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { ROOT, taxonomy, SETUPS, candidateKey, responseKey } = require("./common");
const { weigh, checkShape } = require("../src-weigh");
const { JEV_PRICE_IN } = require("../src-request");
const { requestFor, savedRequest, MODEL } = require("./jev");

// Each candidate through each setup this many times, so the report can tell a
// change between setups from Jev's run-to-run noise.
const RUNS = 2;
// Four in flight, as the plugin's survey runs.
const CONCURRENCY = 4;
// Input tokens per call, before this run has measured its own: the ~$0.0003 a
// region cost in the Jev-only test (#1) at JEV_PRICE_IN, rounded up.
const MEASURED_TOKENS_PER_CALL = 7200;
// Refused above this unless --budget says otherwise. 300 calls are expected to
// cost under $0.10; the guard is for mistakes, not for the expected run.
const DEFAULT_BUDGET = 1.0;

// The guide a run measured, so a rerun against an edited guide cannot pass
// for the same experiment.
const GUIDE = {
  version: taxonomy.version,
  sha256: crypto.createHash("sha256").update(fs.readFileSync(path.join(ROOT, "taxonomy", "components.json"))).digest("hex"),
};

/** The jobs still to do, in candidate, setup, run order: never asked, or failed. */
function planJobs(candidates, entries, { setups = SETUPS, runs = RUNS } = {}) {
  const jobs = [];
  for (const candidate of candidates) {
    for (const setup of setups) {
      for (let run = 1; run <= runs; run++) {
        const key = responseKey(candidate, setup, run);
        const entry = entries[key];
        if (!entry || entry.status !== "ok") jobs.push({ key, candidate, setup, run, retry: Boolean(entry) });
      }
    }
  }
  return jobs;
}

/**
 * What the missing calls should cost. Per setup, the mean input tokens this
 * fixture has already measured for it, or the measured per-region figure when
 * it has none yet.
 */
function estimateCost(jobs, entries, price = JEV_PRICE_IN) {
  const basis = {};
  for (const setup of SETUPS) {
    const seen = Object.values(entries).filter((e) => e.status === "ok" && e.setup === setup && e.inputTokens > 0);
    basis[setup] = seen.length
      ? { tokens: Math.round(seen.reduce((n, e) => n + e.inputTokens, 0) / seen.length), from: seen.length + (seen.length === 1 ? " call" : " calls") + " in this fixture" }
      : { tokens: MEASURED_TOKENS_PER_CALL, from: "the measured per-region figure" };
  }
  const tokens = jobs.reduce((n, j) => n + basis[j.setup].tokens, 0);
  return { calls: jobs.length, tokens, usd: (tokens / 1e6) * price, basis };
}

/** Throws before any call when the estimate is over the ceiling. */
function checkBudget(estimate, budget = DEFAULT_BUDGET) {
  if (estimate.usd > budget) {
    throw new Error("Estimated $" + estimate.usd.toFixed(4) + " for " + estimate.calls + " calls is above the budget of $" +
      budget.toFixed(2) + ". Nothing was sent. Check the candidate list, or raise the ceiling with --budget <usd>.");
  }
}

/**
 * Runs the jobs and writes every result into `entries` the moment it arrives,
 * calling `save(entries)` after each one.
 *
 *   send(request)        → { body, ms } or throws (error.status for HTTP)
 *   evidenceFor(cand)    → the evidence for a candidate, with .capturedAt
 *
 * The first response of each setup is checked against the fields weigh()
 * reads before any other job of that setup goes out, so a change in the API's
 * shape stops the run after at most one call per setup. A refused key or an
 * empty balance stops it too; any other failure is saved and the run goes on.
 */
async function runJobs({ jobs, entries, send, evidenceFor, save, concurrency = CONCURRENCY, now = () => new Date(), log = () => {} }) {
  const evidence = new Map();
  const evidenceOnce = (candidate) => {
    const key = candidateKey(candidate);
    if (!evidence.has(key)) evidence.set(key, Promise.resolve().then(() => evidenceFor(candidate)));
    return evidence.get(key);
  };
  const stats = { calls: 0, tokens: 0, ok: 0, failed: 0 };
  let stop = null;

  async function one(job) {
    let ev, request;
    try {
      ev = await evidenceOnce(job.candidate);
      request = requestFor(ev, job.setup, crypto.randomBytes(6).toString("hex"));
    } catch (error) {
      // Nothing was sent for this job. Stop taking new ones, but let the calls
      // already in flight land and be saved: they are paid for.
      stop = stop || new Error("Stopped: could not prepare " + job.key + ": " + (error.message || error));
      return { responded: false, shape: [] };
    }
    // The run may have been told to stop while this job's evidence was being
    // built. Then it is not sent: it stays missing for the next run.
    if (stop) return { responded: false, shape: [] };
    const base = {
      candidate: candidateKey(job.candidate), setup: job.setup, run: job.run,
      capturedAt: ev.capturedAt || null, requestedModel: MODEL,
      guideVersion: GUIDE.version, guideSha256: GUIDE.sha256,
    };
    let out;
    stats.calls++;
    try {
      out = await send(request);
    } catch (error) {
      stats.failed++;
      entries[job.key] = Object.assign(base, {
        status: "failed", at: now().toISOString(), httpStatus: error.status || null,
        error: String(error.message || error), request: savedRequest(request, ev),
      });
      save(entries);
      log(job, entries[job.key]);
      if (error.status === 401 || error.status === 402 || error.status === 403) {
        stop = stop || new Error("Stopped: " + error.message + (error.status === 402 ? " (empty credit balance)" : " (key or entitlement)"));
      }
      return { responded: false, shape: [] };
    }
    // Anything that is not a JSON object is a shape failure like any other.
    const raw = out ? out.body : undefined;
    const body = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    const inputTokens = (body.usage && body.usage.input_tokens) || 0;
    stats.tokens += inputTokens;
    const shape = out && typeof out.unparsable === "string" ? ["the response is not JSON"]
      : body === raw ? checkShape(body.answers, taxonomy) : ["the response body is not a JSON object"];
    const at = now().toISOString();
    const kept = { ms: out && out.ms, inputTokens, model: body.model || null, body: raw === undefined ? null : raw, request: savedRequest(request, ev) };
    if (out && typeof out.unparsable === "string") kept.unparsable = out.unparsable;
    if (shape.length) {
      // Known bad: nothing more goes out, and the calls in flight still land.
      stop = stop || new Error("Stopped: the response to " + job.key + " differs from what weigh() reads: " + shape.join("; "));
      stats.failed++;
      entries[job.key] = Object.assign(base, { status: "failed", at,
        error: "Response shape differs from what weigh() reads: " + shape.join("; ") }, kept);
    } else {
      try {
        entries[job.key] = Object.assign(base, { status: "ok", at, weighed: weigh(body.answers, taxonomy) }, kept);
        stats.ok++;
      } catch (error) {
        // Kept, paid for, and a reason to stop: weigh() met something the
        // shape check did not anticipate.
        stats.failed++;
        entries[job.key] = Object.assign(base, { status: "failed", at, error: "weigh() failed: " + (error.message || error) }, kept);
        stop = stop || new Error("Stopped: weigh() failed on " + job.key + ": " + (error.message || error));
      }
    }
    save(entries);
    log(job, entries[job.key]);
    return { responded: true, shape };
  }

  // Each setup goes one call at a time until a response comes back, and that
  // response's shape is checked before the rest are released. A call that
  // fails outright has no shape to check, so the next one is tried; three in a
  // row at the start of a setup look like an outage and stop the run.
  const tried = new Set();
  const gates = SETUPS.map(async (setup) => {
    let failures = 0;
    for (const job of jobs.filter((j) => j.setup === setup)) {
      if (stop) return { setup, shape: [] };
      tried.add(job);
      const result = await one(job);
      if (result.responded) return { setup, shape: result.shape };
      if (++failures === 3) {
        stop = stop || new Error("Stopped: the first three calls of " + setup + " failed; the last said: " + entries[job.key].error);
        return { setup, shape: [] };
      }
    }
    return { setup, shape: [] };
  });
  const bent = (await Promise.all(gates)).filter((g) => g.shape.length);
  if (bent.length) {
    throw Object.assign(new Error("The first response of " + bent.map((g) => g.setup).join(", ") +
      " differs from what weigh() reads, so nothing else was sent:\n  - " +
      [...new Set(bent.flatMap((g) => g.shape))].join("\n  - ")), { stats });
  }
  if (stop) throw Object.assign(stop, { stats });

  // Then the rest, from one queue. Each result lands under its own key, so
  // the order things finish in does not matter. A wrong shape now still stops
  // the run (see one()); it would mean the API changed in the middle of it.
  const rest = jobs.filter((j) => !tried.has(j));
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, rest.length) }, async () => {
    while (!stop && cursor < rest.length) await one(rest[cursor++]);
  });
  await Promise.all(workers);
  if (stop) throw Object.assign(stop, { stats });
  return stats;
}

module.exports = {
  planJobs, estimateCost, checkBudget, runJobs,
  RUNS, CONCURRENCY, DEFAULT_BUDGET, MEASURED_TOKENS_PER_CALL, GUIDE,
};
