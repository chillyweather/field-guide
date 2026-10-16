// The spike runner: every candidate, through each setup, to Jev.
//
//   node run.js [--candidates fixtures/candidates.json] [--responses fixtures/responses.json]
//               [--captures captures]
//
// Each answer is weighed by the plugin's own weigh() and saved with its raw
// response, keyed by (candidate, setup, run), as soon as it arrives. A key
// already saved is not asked again.

const path = require("path");
const fs = require("fs");
const { SPIKE, taxonomy, SETUPS, candidateKey, evidenceName, responseKey, readJson, writeJson, loadEnv, parseArgs, loadCaptures } = require("./common");
const { loadCandidates } = require("./candidates");

loadEnv();
const { weigh } = require("../src-weigh");
const { buildEvidence } = require("./evidence");
const { requestFor, savedRequest, send, MODEL } = require("./jev");

async function evidenceFor(candidate, captures) {
  const found = captures.get(candidate.page);
  if (!found) throw new Error("No capture of " + candidate.page + ". Run: node capture.js " + candidate.page);
  if (!fs.existsSync(found.screenshot)) {
    throw new Error("The screenshot for " + candidate.page + " is missing (screenshots are not committed). Recapture it.");
  }
  return buildEvidence({
    record: found.record, elementId: candidate.element, screenshot: found.screenshot,
    name: evidenceName(candidate, found.record.capturedAt),
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const candidatesFile = path.resolve(SPIKE, args.candidates || "fixtures/candidates.json");
  const responsesFile = path.resolve(SPIKE, args.responses || "fixtures/responses.json");
  const captures = loadCaptures(path.resolve(SPIKE, args.captures || "captures"));

  const key = process.env.TYPESAFE_API_KEY;
  if (!key) {
    console.error("No key. Put TYPESAFE_API_KEY in the repository's .env.local (gitignored, never printed).");
    process.exit(2);
  }

  const { candidates } = loadCandidates(candidatesFile);
  const fixture = readJson(responsesFile, { entries: {} });
  let calls = 0, tokens = 0;

  for (const candidate of candidates) {
    const run = 1;
    // Only what is still missing. A candidate with every answer saved needs no
    // screenshot, and rebuilding its pictures would overwrite the files its
    // saved requests point at.
    const pending = SETUPS.filter((setup) => {
      const entry = fixture.entries[responseKey(candidate, setup, run)];
      return !entry || entry.status !== "ok";
    });
    if (!pending.length) continue;
    // Every setup of a candidate must see the same capture. A page recaptured
    // between a saved answer and the rest would compare setups on different
    // pages, and rebuilding would overwrite the pictures the saved answers name.
    const found = captures.get(candidate.page);
    const earlier = SETUPS.map((setup) => fixture.entries[responseKey(candidate, setup, run)])
      .find((entry) => entry && entry.status === "ok");
    if (found && earlier && earlier.capturedAt !== found.record.capturedAt) {
      throw new Error(candidateKey(candidate) + " has answers from the capture of " + earlier.capturedAt +
        ", but the capture on disk is from " + found.record.capturedAt + ". Restore that capture, or delete the " +
        "candidate's saved answers to start it again.");
    }
    const evidence = await evidenceFor(candidate, captures);
    for (const setup of pending) {
      const k = responseKey(candidate, setup, run);

      const request = requestFor(evidence, setup, Math.random().toString(36).slice(2, 10));
      const out = await send(request, key);
      calls++;
      const inputTokens = (out.body.usage && out.body.usage.input_tokens) || 0;
      tokens += inputTokens;
      const weighed = weigh(out.body.answers, taxonomy);
      fixture.entries[k] = {
        candidate: candidateKey(candidate), setup, run, status: "ok", capturedAt: found.record.capturedAt,
        at: new Date().toISOString(), ms: out.ms, inputTokens,
        model: out.body.model || null, requestedModel: MODEL, guideVersion: taxonomy.version,
        weighed, body: out.body, request: savedRequest(request, evidence),
      };
      writeJson(responsesFile, fixture);
      console.log(k.padEnd(48) + String(weighed.answer).padEnd(14) + weighed.verdict.padEnd(10) +
        weighed.confidence.toFixed(2) + "  " + out.ms + "ms " + inputTokens + " in");
    }
  }
  console.log(calls + " calls, " + tokens + " input tokens → " + path.relative(SPIKE, responsesFile));
}

module.exports = { evidenceFor };

if (require.main === module) main().catch((error) => { console.error(error.message || error); process.exit(1); });
