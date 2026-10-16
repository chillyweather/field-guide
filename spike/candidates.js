// The candidate fixture: which elements the spike asks about, and what a
// person says they are.
//
//   node candidates.js add <page> <element> [--pair "Button / Link"] [--note "..."]
//   node candidates.js pick <group>...     (from out/proposals.json, see select.js)
//
// Each candidate holds: the page URL, the element id from that page's capture,
// the hard pair it tests (if any), the class-name hint, `label`, an optional
// `looks_like`, and a free-text note. Tools add candidates and never write
// `label` or `looks_like`; only a person types those, into the file itself.

const path = require("path");
const { SPIKE, taxonomy, candidateKey, readJson, writeJson, parseArgs, loadCaptures } = require("./common");

// Shown in the fixture, on the labelling sheet and in the README: wherever the
// labeller is when they decide.
const LABELLING_RULE =
  "label is the guide entry (taxonomy/components.json) that the guide's own definitions give when " +
  "everything about the element is known, including what activating it does. When the picture alone " +
  "would earn a different entry, write that entry in looks_like. For example, an <a href> styled as a " +
  "filled button is label: Link, looks_like: Button. Leave label out when you cannot decide: an " +
  "unlabelled candidate counts towards stability, never towards accuracy. Tools never write label or looks_like.";

/** Reads a candidate fixture and refuses one a run could misread. */
function loadCandidates(file) {
  const fixture = readJson(file, null);
  if (!fixture) return { rule: LABELLING_RULE, candidates: [] };
  if (!Array.isArray(fixture.candidates)) throw new Error(file + ": no candidates list.");
  const problems = [];
  const seen = new Set();
  fixture.candidates.forEach((c, i) => {
    const where = "candidate " + (i + 1) + (c && c.element ? " (" + c.element + ")" : "");
    if (!c || typeof c.page !== "string" || typeof c.element !== "string") {
      problems.push(where + ": needs page and element");
      return;
    }
    const key = candidateKey(c);
    if (seen.has(key)) problems.push(where + ": listed twice");
    seen.add(key);
    for (const field of ["label", "looks_like"]) {
      if (c[field] !== undefined && c[field] !== null && c[field] !== "" && !taxonomy.components[c[field]]) {
        problems.push(where + ": " + field + " '" + c[field] + "' is not a guide entry");
      }
    }
  });
  if (problems.length) throw new Error(file + ":\n  " + problems.join("\n  "));
  return fixture;
}

/** True when a person has labelled the candidate. */
const isLabelled = (c) => typeof c.label === "string" && c.label !== "";

/**
 * The fixture with one more candidate. Existing entries are returned exactly as
 * they were, labels included. The new one never has label or looks_like.
 */
function addCandidate(fixture, record, elementId, extra = {}) {
  const element = record.elements.find((e) => e.id === elementId);
  if (!element) throw new Error("No element " + elementId + " in the capture of " + record.url + ".");
  const stub = { page: record.url, element: elementId };
  if (fixture.candidates.some((c) => candidateKey(c) === candidateKey(stub))) {
    throw new Error(record.url + " " + elementId + " is already a candidate.");
  }
  const names = (record.labelling || {})[elementId] || {};
  stub.pair = extra.pair || null;
  stub.hint = (names.classes || []).join(" ") || null;
  stub.note = extra.note || "";
  return Object.assign({}, fixture, {
    rule: fixture.rule || LABELLING_RULE,
    candidates: [...fixture.candidates, stub],
  });
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const [command, ...rest] = args._;
  const file = path.resolve(SPIKE, args.candidates || "fixtures/candidates.json");
  const captures = loadCaptures(path.resolve(SPIKE, args.captures || "captures"));
  let fixture = loadCandidates(file);

  const add = (page, element, extra) => {
    const found = captures.get(page);
    if (!found) throw new Error("No capture of " + page + ". Captured: " + [...captures.keys()].join(", "));
    fixture = addCandidate(fixture, found.record, element, extra);
    console.log("added " + page + " " + element);
  };

  if (command === "add" && rest.length === 2) {
    add(rest[0], rest[1], { pair: args.pair, note: args.note });
  } else if (command === "pick" && rest.length) {
    const proposals = readJson(path.resolve(SPIKE, args.proposals || "out/proposals.json"), null);
    if (!proposals) throw new Error("No proposals. Run: node select.js");
    for (const n of rest) {
      const group = proposals.groups.find((g) => String(g.group) === String(n));
      if (!group) throw new Error("No group " + n + " in the proposals.");
      add(group.representative.page, group.representative.element, { pair: args.pair, note: args.note });
    }
  } else {
    console.error("usage: node candidates.js add <page> <element> [--pair \"Button / Link\"] [--note \"...\"]\n" +
      "       node candidates.js pick <group>... [--pair ...] [--note ...]");
    process.exit(2);
  }
  writeJson(file, fixture);
}

module.exports = { LABELLING_RULE, loadCandidates, addCandidate, isLabelled };

if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exit(1); }
}
