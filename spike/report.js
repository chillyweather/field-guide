// The report: the spike's answer to #1, recomputable from the committed
// candidates and raw responses.
//
//   node report.js [--candidates fixtures/candidates.json] [--responses fixtures/responses.json]
//                  [--captures captures] [--out report.md]
//
// buildReport() is pure: candidates and raw-response entries in, a report
// structure out. Every saved body is weighed again by the plugin's own
// weigh(), so the report measures the code the plugin ships. renderMarkdown()
// turns the structure into the Markdown that is committed beside the spike.
//
// Counting rules, everywhere below:
//   - only a completed ("ok") call has an answer; a failed call is missing,
//     never wrong;
//   - accuracy and confident precision count labelled candidates only;
//   - movement, changed answers, stability and the noise yardsticks count
//     every candidate, labelled or not, since they need no label.

const path = require("path");
const { SPIKE, SETUPS, LETTER, candidateKey, responseKey, readJson, parseArgs, loadCaptures, taxonomy: guide } = require("./common");
const { loadCandidates, isLabelled } = require("./candidates");
const { weigh } = require("../src-weigh");
const { JEV_PRICE_IN } = require("../src-request");

const RUNS = [1, 2];
const VERDICTS = ["confident", "check", "unsure"];

// ARIA roles that name a guide entry outright. A right answer on one of these
// may be Jev reading the role off a list rather than reasoning from evidence.
const ROLE_NAMES_ENTRY = ["checkbox", "switch", "tab", "dialog", "link", "button"];

// What a tag or role says an element does, for the semantic-mismatch group.
// Role first, since a role overrides what the tag would mean.
const BUTTON_INPUTS = ["button", "submit", "reset", "image"];
function impliedFamily(facts) {
  if (!facts) return null;
  const role = facts.role || "";
  const tag = facts.tag || "";
  if (["checkbox", "switch", "radio"].includes(role)) return { family: "selection", why: "role " + role };
  if (role === "dialog" || tag === "dialog") return { family: "container", why: role === "dialog" ? "role dialog" : "<dialog>" };
  if (tag === "a" && typeof facts.href === "string") return { family: "navigation", why: "<a href>" };
  if (tag === "button") return { family: "action", why: "<button>" };
  if (tag === "input" && BUTTON_INPUTS.includes(String(facts.type || "").toLowerCase())) {
    return { family: "action", why: "<input type=" + facts.type + ">" };
  }
  return null;
}

/** A share that knows when it has nothing to divide. */
const share = (n, d) => ({ n, d, share: d ? n / d : null });

/**
 * The report structure.
 *
 *   candidates  [{ page, element, label?, looks_like?, pair?, facts?: { tag, role, type, href } }]
 *   entries     { [responseKey]: { status, body, inputTokens, ms, at, model, guideVersion, request } }
 *   options     { taxonomy, price, captures: [{ url, capturedAt }] }
 */
function buildReport(candidates, entries, { taxonomy = guide, price = JEV_PRICE_IN, captures = [] } = {}) {
  // Every completed call, weighed now by the real weigh().
  const answers = new Map();
  for (const c of candidates) {
    for (const setup of SETUPS) {
      for (const run of RUNS) {
        const entry = entries[responseKey(c, setup, run)];
        if (!entry || entry.status !== "ok" || !entry.body || !entry.body.answers) continue;
        answers.set(responseKey(c, setup, run), weigh(entry.body.answers, taxonomy));
      }
    }
  }
  const got = (c, setup, run) => answers.get(responseKey(c, setup, run)) || null;
  const right = (c, a) => a.answer === c.label;
  const labelled = candidates.filter(isLabelled);
  const roleNames = (c) => Boolean(c.facts && ROLE_NAMES_ENTRY.includes(c.facts.role));

  // 6. Semantic mismatches, first, since accuracy is also given without them.
  const mismatches = [];
  for (const c of candidates) {
    const implied = impliedFamily(c.facts);
    const labelFamily = isLabelled(c) && taxonomy.components[c.label] ? taxonomy.components[c.label].family : null;
    const tagDisagrees = implied && labelFamily && c.label !== "Other" && implied.family !== labelFamily;
    if (!c.looks_like && !tagDisagrees) continue;
    mismatches.push({
      key: candidateKey(c), label: c.label || null, looks_like: c.looks_like || null,
      implied: implied ? implied.family : null, impliedBy: implied ? implied.why : null, labelFamily,
      why: [c.looks_like ? "looks like " + c.looks_like : null,
        tagDisagrees ? implied.why + " implies " + implied.family + ", the label is " + labelFamily : null].filter(Boolean).join("; "),
    });
  }
  const mismatched = new Set(mismatches.map((m) => m.key));

  // 1. Accuracy.
  const accuracyOver = (group, setup) => {
    const runs = {};
    let n = 0, d = 0;
    for (const run of RUNS) {
      let rn = 0, rd = 0;
      for (const c of group) {
        const a = got(c, setup, run);
        if (!a) continue;
        rd++;
        if (right(c, a)) rn++;
      }
      runs[run] = share(rn, rd);
      n += rn; d += rd;
    }
    return { runs, pooled: share(n, d) };
  };
  // 2. Confident precision, pooled over both runs.
  const precisionOver = (group, setup) => {
    let n = 0, d = 0;
    for (const c of group) {
      for (const run of RUNS) {
        const a = got(c, setup, run);
        if (!a || a.verdict !== "confident") continue;
        d++;
        if (right(c, a)) n++;
      }
    }
    return Object.assign(share(n, d), { none: d === 0 });
  };
  const groups = {
    all: labelled,
    withoutMismatches: labelled.filter((c) => !mismatched.has(candidateKey(c))),
    roleNamesEntry: labelled.filter(roleNames),
    roleDoesNot: labelled.filter((c) => !roleNames(c)),
  };
  const accuracy = {}, precision = {};
  for (const setup of SETUPS) {
    accuracy[setup] = {};
    precision[setup] = {};
    for (const [name, group] of Object.entries(groups)) {
      accuracy[setup][name] = accuracyOver(group, setup);
      precision[setup][name] = precisionOver(group, setup);
    }
  }

  // 3. Movement: verdict in A against verdict in C, same run paired.
  const movement = {};
  for (const run of RUNS) {
    const matrix = Object.fromEntries(VERDICTS.map((v) => [v, Object.fromEntries(VERDICTS.map((w) => [w, 0]))]));
    let n = 0;
    for (const c of candidates) {
      const a = got(c, "image", run), cc = got(c, "image+dom", run);
      if (!a || !cc) continue;
      matrix[a.verdict][cc.verdict]++;
      n++;
    }
    movement[run] = { matrix, n };
  }

  // 4. Changed answers between A and C, in either run.
  const top = (a) => a.runners.map(([name, p]) => ({ name, p }));
  const factsSent = (c) => {
    for (const setup of ["image+dom", "dom"]) {
      for (const run of RUNS) {
        const e = entries[responseKey(c, setup, run)];
        const dom = e && e.request && e.request.body && e.request.body.state && e.request.body.state.dom;
        if (dom) return dom;
      }
    }
    return null;
  };
  const changed = [];
  for (const c of candidates) {
    const runs = {};
    let differs = false;
    for (const run of RUNS) {
      const a = got(c, "image", run), cc = got(c, "image+dom", run);
      if (!a || !cc) continue;
      runs[run] = {
        A: { answer: a.answer, verdict: a.verdict, top: top(a) },
        C: { answer: cc.answer, verdict: cc.verdict, top: top(cc) },
      };
      if (a.answer !== cc.answer) differs = true;
    }
    if (differs) changed.push({ key: candidateKey(c), label: c.label || null, runs, facts: factsSent(c) });
  }

  // 5. Stability: run 1 against run 2, per setup.
  const stability = {};
  for (const setup of SETUPS) {
    let n = 0, sameAnswer = 0, sameVerdict = 0, sameBoth = 0;
    for (const c of candidates) {
      const one = got(c, setup, 1), two = got(c, setup, 2);
      if (!one || !two) continue;
      n++;
      if (one.answer === two.answer) sameAnswer++;
      if (one.verdict === two.verdict) sameVerdict++;
      if (one.answer === two.answer && one.verdict === two.verdict) sameBoth++;
    }
    stability[setup] = {
      n,
      sameAnswer: share(sameAnswer, n),
      sameVerdict: share(sameVerdict, n),
      // The noise yardsticks the decision rules use.
      answerDisagreement: share(n - sameAnswer, n),
      answerOrVerdictDisagreement: share(n - sameBoth, n),
    };
  }

  // Button / Link, the question that started the spike.
  const isButtonLink = (c) => c.label === "Button" || c.label === "Link" || c.pair === "Button / Link";
  const buttonLinkCandidates = candidates.filter(isButtonLink);
  const buttonLink = {
    rows: buttonLinkCandidates.map((c) => ({
      key: candidateKey(c), label: c.label || null, looks_like: c.looks_like || null,
      answers: Object.fromEntries(SETUPS.map((s) => [s, RUNS.map((r) => {
        const a = got(c, s, r);
        return a ? { answer: a.answer, verdict: a.verdict, right: isLabelled(c) ? right(c, a) : null } : null;
      })])),
    })),
    accuracy: Object.fromEntries(SETUPS.map((s) => [s, accuracyOver(buttonLinkCandidates.filter(isLabelled), s).pooled])),
  };

  // Cost and time, from every saved call, failed ones included: they were sent.
  const all = Object.entries(entries).filter(([key]) => candidates.some((c) => key.startsWith(candidateKey(c) + "|")))
    .map(([, e]) => e);
  const tokens = all.reduce((n, e) => n + (e.inputTokens || 0), 0);
  const times = all.filter((e) => e.at).map((e) => ({ end: Date.parse(e.at), start: Date.parse(e.at) - (e.ms || 0) }));
  const first = times.length ? Math.min(...times.map((t) => t.start)) : null;
  const last = times.length ? Math.max(...times.map((t) => t.end)) : null;
  const cost = {
    calls: all.length,
    ok: all.filter((e) => e.status === "ok").length,
    failed: all.filter((e) => e.status !== "ok").length,
    inputTokens: tokens,
    usd: (tokens / 1e6) * price,
    wallClockMs: first === null ? null : last - first,
    firstAt: first === null ? null : new Date(first).toISOString(),
    lastAt: last === null ? null : new Date(last).toISOString(),
    models: [...new Set(all.map((e) => e.model).filter(Boolean))],
    guideVersions: [...new Set(all.map((e) => e.guideVersion).filter(Boolean))],
  };

  const rules = decide({ candidates, labelled, got, right, accuracy, precision, stability, buttonLinkCandidates });
  const holding = Object.entries(rules).filter(([, r]) => r.holds).map(([name]) => name);

  return {
    counts: {
      candidates: candidates.length, labelled: labelled.length, mismatches: mismatches.length,
      roleNamesEntry: groups.roleNamesEntry.length,
    },
    captures,
    accuracy, precision, movement, changed, stability, mismatches, buttonLink, cost, rules,
    decision: holding.length === 1 ? holding[0] : holding.length ? "several" : "none",
    holding,
  };
}

/**
 * The three decision rules from #2, each against Jev's own run-to-run noise
 * (answer 5) rather than a fixed margin.
 */
function decide({ candidates, labelled, got, right, accuracy, precision, stability, buttonLinkCandidates }) {
  const both = (c, setup) => RUNS.every((r) => got(c, setup, r));

  // Continue: C is right on most Button / Link candidates in both runs, and the
  // clear cases it makes worse are no more than A's own noise. A clear case is
  // one A got right and confident in both runs; worse is a wrong answer or a
  // verdict below confident in either run of C.
  const bl = buttonLinkCandidates.filter((c) => isLabelled(c) && both(c, "image+dom"));
  const blRight = bl.filter((c) => RUNS.every((r) => right(c, got(c, "image+dom", r)))).length;
  const clear = labelled.filter((c) => both(c, "image") && both(c, "image+dom") &&
    RUNS.every((r) => { const a = got(c, "image", r); return right(c, a) && a.verdict === "confident"; }));
  const worse = clear.filter((c) => RUNS.some((r) => { const x = got(c, "image+dom", r); return !right(c, x) || x.verdict !== "confident"; }));
  const aNoise = stability.image.answerOrVerdictDisagreement;
  const worseShare = share(worse.length, clear.length);
  const continueRule = {
    holds: bl.length > 0 && blRight * 2 > bl.length && aNoise.share !== null &&
      (worseShare.share === null ? true : worseShare.share <= aNoise.share),
    buttonLinkRightInBothRuns: share(blRight, bl.length),
    clearCases: clear.length,
    clearCasesMadeWorse: worseShare,
    worse: worse.map(candidateKey),
    aNoise,
  };

  // Rethink the inputs: B's accuracy and confident precision each within C's
  // run-to-run disagreement of C's.
  const cNoise = stability["image+dom"].answerDisagreement;
  const accB = accuracy.dom.all.pooled, accC = accuracy["image+dom"].all.pooled;
  const preB = precision.dom.all, preC = precision["image+dom"].all;
  const accGap = accB.share !== null && accC.share !== null ? Math.abs(accB.share - accC.share) : null;
  const preGap = preB.none && preC.none ? 0 : preB.none || preC.none ? null : Math.abs(preB.share - preC.share);
  const rethinkRule = {
    holds: cNoise.share !== null && accGap !== null && preGap !== null && accGap <= cNoise.share && preGap <= cNoise.share,
    accuracyGap: accGap, precisionGap: preGap, cNoise,
    precisionNote: preB.none && preC.none ? "neither B nor C was ever confident"
      : preB.none || preC.none ? (preB.none ? "B" : "C") + " was never confident, so precision cannot be compared" : null,
  };

  // Look at the guide: A and C differ on no more candidates than A differs
  // from itself. Both counted over candidates with all four calls complete.
  const four = candidates.filter((c) => both(c, "image") && both(c, "image+dom"));
  const acDiffer = four.filter((c) => RUNS.some((r) => got(c, "image", r).answer !== got(c, "image+dom", r).answer)).length;
  const aDiffer = four.filter((c) => got(c, "image", 1).answer !== got(c, "image", 2).answer).length;
  const guideRule = {
    holds: four.length > 0 && acDiffer <= aDiffer,
    candidates: four.length, aAndCDiffer: acDiffer, aDiffersFromItself: aDiffer,
  };

  return { continue: continueRule, rethink: rethinkRule, guide: guideRule };
}

// ---------------------------------------------------------------------------
// Markdown

const RULE_NAMES = { continue: "Continue", rethink: "Rethink the inputs", guide: "Look at the guide" };

function pct(s) {
  return s.share === null ? "–" : Math.round(s.share * 100) + "% (" + s.n + "/" + s.d + ")";
}
function precisionCell(p) {
  return p.none ? "none confident" : Math.round(p.share * 100) + "% of " + p.d;
}
const cell = (t) => String(t === null || t === undefined ? "–" : t).replace(/\|/g, "\\|").replace(/\n/g, " ");
const table = (head, rows) => ["| " + head.map(cell).join(" | ") + " |", "|" + head.map(() => "---").join("|") + "|",
  ...rows.map((r) => "| " + r.map(cell).join(" | ") + " |")].join("\n");
const setupName = (s) => LETTER[s] + " " + s;
const pp = (x) => x === null ? "–" : Math.round(x * 100) + " pp";
const count = (n, word) => n + " " + word + (n === 1 ? "" : "s");

function renderMarkdown(r) {
  const out = [];
  out.push("# DOM spike report");
  out.push("");
  out.push(count(r.counts.candidates, "candidate") + ", " + r.counts.labelled + " labelled, " + r.counts.mismatches +
    " in the semantic-mismatch group. Setups: A image, B dom, C image+dom, each run twice.");
  out.push("");
  out.push("## Decision");
  out.push("");
  out.push(r.decision === "none" ? "None of the three rules holds."
    : r.decision === "several" ? "Several rules hold: " + r.holding.map((h) => RULE_NAMES[h]).join(" and ") + ". The numbers do not single one out."
      : "The numbers point to: **" + RULE_NAMES[r.decision] + "**.");
  out.push("");
  const c = r.rules.continue, t = r.rules.rethink, g = r.rules.guide;
  out.push(table(["Rule", "Holds", "The numbers"], [
    ["Continue", c.holds ? "yes" : "no",
      "C right in both runs on " + pct(c.buttonLinkRightInBothRuns) + " of Button / Link; clear cases made worse " +
      pct(c.clearCasesMadeWorse) + " against A's run-to-run disagreement " + pct(c.aNoise)],
    ["Rethink the inputs", t.holds ? "yes" : "no",
      "B − C accuracy " + pp(t.accuracyGap) + ", confident precision " + pp(t.precisionGap) +
      (t.precisionNote ? " (" + t.precisionNote + ")" : "") + ", against C's run-to-run disagreement " + pct(t.cNoise)],
    ["Look at the guide", g.holds ? "yes" : "no",
      "A and C differ on " + g.aAndCDiffer + " of " + count(g.candidates, "candidate") + "; A differs from itself on " + g.aDiffersFromItself],
  ]));
  out.push("");

  out.push("## 1. Accuracy");
  out.push("");
  out.push("Answers equal to the label, over labelled candidates with a completed call.");
  out.push("");
  const accRows = [];
  for (const s of SETUPS) {
    const a = r.accuracy[s];
    accRows.push([setupName(s), pct(a.all.runs[1]), pct(a.all.runs[2]), pct(a.all.pooled), pct(a.withoutMismatches.pooled),
      pct(a.roleNamesEntry.pooled), pct(a.roleDoesNot.pooled)]);
  }
  out.push(table(["Setup", "Run 1", "Run 2", "Pooled", "Without mismatches", "Role names an entry", "Role does not"], accRows));
  out.push("");

  out.push("## 2. Confident precision");
  out.push("");
  out.push("Right answers among `confident` verdicts, both runs pooled, with the count they rest on.");
  out.push("");
  out.push(table(["Setup", "All", "Role names an entry", "Role does not"], SETUPS.map((s) => [setupName(s),
    precisionCell(r.precision[s].all), precisionCell(r.precision[s].roleNamesEntry), precisionCell(r.precision[s].roleDoesNot)])));
  out.push("");

  out.push("## 3. Movement from A to C");
  out.push("");
  for (const run of RUNS) {
    const m = r.movement[run];
    out.push("Run " + run + ", " + count(m.n, "candidate") + ". Rows are A's verdict, columns are C's.");
    out.push("");
    out.push(table(["A \\ C", ...VERDICTS], VERDICTS.map((v) => [v, ...VERDICTS.map((w) => m.matrix[v][w])])));
    out.push("");
  }

  out.push("## 4. Changed answers");
  out.push("");
  if (!r.changed.length) { out.push("No candidate's answer differs between A and C in either run."); out.push(""); }
  for (const ch of r.changed) {
    out.push("### " + ch.key + (ch.label ? " (label " + ch.label + ")" : " (unlabelled)"));
    out.push("");
    const rows = [];
    for (const run of RUNS) {
      const x = ch.runs[run];
      if (!x) continue;
      const tops = (a) => a.top.map((p) => p.name + " " + p.p.toFixed(2)).join(", ");
      rows.push([run, x.A.answer + " (" + x.A.verdict + ")", tops(x.A), x.C.answer + " (" + x.C.verdict + ")", tops(x.C)]);
    }
    out.push(table(["Run", "A", "A top three", "C", "C top three"], rows));
    out.push("");
    if (ch.facts) {
      out.push("DOM facts sent:");
      out.push("");
      out.push("```");
      out.push(ch.facts);
      out.push("```");
      out.push("");
    }
  }

  out.push("## 5. Stability");
  out.push("");
  out.push("Run 1 against run 2, over every candidate with both runs complete, labelled or not.");
  out.push("");
  out.push(table(["Setup", "Candidates", "Same answer", "Same verdict"], SETUPS.map((s) => [setupName(s), r.stability[s].n,
    pct(r.stability[s].sameAnswer), pct(r.stability[s].sameVerdict)])));
  out.push("");

  out.push("## 6. Semantic mismatches");
  out.push("");
  out.push("The picture and the tag disagree. These are findings about the site, not errors in the identification.");
  out.push("");
  if (!r.mismatches.length) out.push("None.");
  else out.push(table(["Candidate", "Label", "Looks like", "Tag or role says", "Why"], r.mismatches.map((m) =>
    [m.key, m.label, m.looks_like, m.implied ? m.implied + " (" + m.impliedBy + ")" : null, m.why])));
  out.push("");

  out.push("## Button / Link");
  out.push("");
  out.push(table(["Setup", "Accuracy"], SETUPS.map((s) => [setupName(s), pct(r.buttonLink.accuracy[s])])));
  out.push("");
  if (r.buttonLink.rows.length) {
    const ans = (a) => a ? a.answer + (a.right === null ? "" : a.right ? " ✓" : " ✗") : "–";
    out.push(table(["Candidate", "Label", "A1", "A2", "B1", "B2", "C1", "C2"], r.buttonLink.rows.map((row) => [row.key,
      (row.label || "unlabelled") + (row.looks_like ? " (looks like " + row.looks_like + ")" : ""),
      ...SETUPS.flatMap((s) => row.answers[s].map(ans))])));
    out.push("");
  }

  out.push("## Run");
  out.push("");
  const k = r.cost;
  out.push("- Calls: " + k.calls + " (" + k.ok + " completed, " + k.failed + " failed)");
  out.push("- Cost: $" + k.usd.toFixed(4) + " for " + k.inputTokens.toLocaleString("en-US") + " input tokens");
  out.push("- Wall-clock: " + (k.wallClockMs === null ? "–" : (k.wallClockMs / 1000).toFixed(1) + " s, " + k.firstAt + " to " + k.lastAt));
  out.push("- Model: " + (k.models.join(", ") || "–") + "; guide version " + (k.guideVersions.join(", ") || "–"));
  out.push("");
  out.push("## Captures");
  out.push("");
  if (!r.captures.length) out.push("None recorded.");
  for (const cap of r.captures) out.push("- " + cap.url + " (captured " + cap.capturedAt + ")");
  out.push("");
  out.push("## Conclusion");
  out.push("");
  out.push("_To be written by hand._");
  out.push("");
  return out.join("\n");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const { candidates } = loadCandidates(path.resolve(SPIKE, args.candidates || "fixtures/candidates.json"));
  const { entries } = readJson(path.resolve(SPIKE, args.responses || "fixtures/responses.json"), { entries: {} });
  const captures = loadCaptures(path.resolve(SPIKE, args.captures || "captures"));

  // The tag, role, type and href each candidate had, from its capture.
  const enriched = candidates.map((c) => {
    const found = captures.get(c.page);
    const e = found && found.record.elements.find((x) => x.id === c.element);
    return e ? Object.assign({}, c, { facts: { tag: e.tag, role: e.role, type: e.type, href: e.href } }) : c;
  });
  // The capture each page's answers were made from, as the entries record it;
  // the capture on disk only when no entry says.
  const pages = [...new Set(candidates.map((c) => c.page))];
  const capturedAt = (url) => {
    const keys = candidates.filter((c) => c.page === url).map(candidateKey);
    const seen = [...new Set(Object.entries(entries)
      .filter(([key, e]) => e.capturedAt && keys.some((k) => key.startsWith(k + "|"))).map(([, e]) => e.capturedAt))].sort();
    if (seen.length) return seen.join(", ");
    return captures.has(url) ? captures.get(url).record.capturedAt : "not on disk";
  };
  const report = buildReport(enriched, entries, { captures: pages.map((url) => ({ url, capturedAt: capturedAt(url) })) });
  const markdown = renderMarkdown(report);
  if (args.out) {
    require("fs").writeFileSync(path.resolve(SPIKE, args.out), markdown);
    console.log("wrote " + args.out);
  } else {
    process.stdout.write(markdown);
  }
}

module.exports = { buildReport, renderMarkdown, impliedFamily, ROLE_NAMES_ENTRY };

if (require.main === module) main();
