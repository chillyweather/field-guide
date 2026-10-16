// Candidate selection: thousands of captured elements down to one proposal per
// visually distinct group, so the ~50 candidates are not fifty copies of the
// same button.
//
//   node select.js [--captures captures] [--step 8] [--out out/proposals.json]
//
// Groups the elements of every captured page by a coarse visual signature: tag,
// role, size rounded to a step, corner radius, background and border. One
// representative per group is proposed. A person picks from the proposals
// (node candidates.js pick <group>) and can add anything they missed by id
// (node candidates.js add <page> <element>).

const path = require("path");
const { SPIKE, writeJson, parseArgs, loadCaptures } = require("./common");

// Coarse enough that the same button at 119 and 121 px is one group.
const STEP = 8;

function signature(element, step) {
  const round = (n) => Math.max(step, Math.round(n / step) * step);
  const s = element.style || {};
  return {
    tag: element.tag,
    role: element.role || null,
    size: round(element.box.width) + "x" + round(element.box.height),
    borderRadius: s.borderRadius || null,
    background: s.backgroundColor || null,
    border: s.border || null,
  };
}

/**
 * One group per signature across all records, biggest first, each with its
 * first member (in page order, then element order) as the representative.
 */
function groupElements(records, step = STEP) {
  const groups = new Map();
  for (const record of records) {
    for (const element of record.elements) {
      const sig = signature(element, step);
      const key = JSON.stringify(sig);
      if (!groups.has(key)) groups.set(key, { signature: sig, members: [] });
      groups.get(key).members.push({ record, element });
    }
  }
  return [...groups.values()]
    .sort((a, b) => b.members.length - a.members.length)
    .map((g, i) => {
      const first = g.members[0];
      const hint = ((first.record.labelling || {})[first.element.id] || {}).classes || [];
      return {
        group: i + 1,
        signature: g.signature,
        count: g.members.length,
        pages: new Set(g.members.map((m) => m.record.url)).size,
        representative: {
          page: first.record.url,
          element: first.element.id,
          text: first.element.text || null,
          name: first.element.name || null,
          hint: hint.join(" ") || null,
        },
        others: g.members.slice(1, 6).map((m) => ({ page: m.record.url, element: m.element.id })),
      };
    });
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const captures = loadCaptures(path.resolve(SPIKE, args.captures || "captures"));
  const records = [...captures.values()].map((c) => c.record);
  if (!records.length) {
    console.error("No captures. Run: node capture.js <url>...");
    process.exit(2);
  }
  const step = Number(args.step) || STEP;
  const groups = groupElements(records, step);
  const out = path.resolve(SPIKE, args.out || "out/proposals.json");
  writeJson(out, { step, pages: records.map((r) => r.url), groups });

  const elements = records.reduce((n, r) => n + r.elements.length, 0);
  console.log(elements + " elements on " + records.length + " pages → " + groups.length + " groups → " + path.relative(SPIKE, out));
  for (const g of groups.slice(0, Number(args.show) || 40)) {
    const s = g.signature, r = g.representative;
    console.log(String(g.group).padStart(4) + "  ×" + String(g.count).padEnd(5) + ("<" + s.tag + "> " + (s.role || "")).padEnd(24) +
      s.size.padEnd(11) + JSON.stringify(r.name || r.text || "").slice(0, 40).padEnd(42) + r.element);
  }
}

module.exports = { groupElements, signature, STEP };

if (require.main === module) main();
