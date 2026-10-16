// The labelling sheet: one static page showing, for every candidate, what Jev
// would be shown, so a person can label without opening the site element by
// element.
//
//   node sheet.js [--candidates fixtures/candidates.json] [--captures captures] [--out out/sheet.html]
//
// Read-only. It shows the fitted crop, the outlined context window, the
// geometry and DOM facts exactly as the request carries them, and the
// class-name hint. Labels are typed into the candidate fixture, never here,
// and this script writes nothing but the page and its pictures.

const fs = require("fs");
const path = require("path");
const { SPIKE, candidateKey, evidenceName, parseArgs, loadCaptures } = require("./common");
const { loadCandidates, LABELLING_RULE } = require("./candidates");
const { buildEvidence } = require("./evidence");
const { requestFor } = require("./jev");

const esc = (t) => String(t == null ? "" : t)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Everything one card shows, from the same builder the runner uses. */
async function sheetEntry(candidate, captures, outDir) {
  const found = captures.get(candidate.page);
  if (!found) throw new Error("No capture of " + candidate.page + ". Run: node capture.js " + candidate.page);
  if (!fs.existsSync(found.screenshot)) {
    throw new Error("The screenshot for " + candidate.page + " is missing (screenshots are not committed). Recapture it.");
  }
  const evidence = await buildEvidence({
    record: found.record, elementId: candidate.element, screenshot: found.screenshot,
    name: evidenceName(candidate, found.record.capturedAt),
  });
  const state = requestFor(evidence, "dom").body.state;
  const rel = (file) => path.relative(outDir, path.join(SPIKE, file)).split(path.sep).join("/");
  return {
    candidate,
    key: candidateKey(candidate),
    crop: rel(evidence.crop.file),
    window: rel(evidence.context.file),
    geometry: state.geometry,
    dom: state.dom,
  };
}

function renderSheet(entries, rule) {
  const cards = entries.map((e, i) => {
    const c = e.candidate;
    const label = c.label
      ? esc(c.label) + (c.looks_like ? " <span class=\"muted\">· looks like " + esc(c.looks_like) + "</span>" : "")
      : "<span class=\"muted\">unlabelled</span>";
    return `
<section class="card" id="c${i + 1}">
  <header>
    <h2>${i + 1}. <code>${esc(c.element)}</code> <span class="muted">${esc(c.page)}</span></h2>
    <p>${c.pair ? "Tests <strong>" + esc(c.pair) + "</strong> · " : ""}label: ${label}</p>
  </header>
  <div class="pictures">
    <figure><img src="${esc(e.crop)}" alt="crop of ${esc(c.element)}"><figcaption>crop, as fitted for Jev</figcaption></figure>
    <figure class="wide"><img src="${esc(e.window)}" alt="context window around ${esc(c.element)}"><figcaption>context window, outlined</figcaption></figure>
  </div>
  <div class="facts">
    <h3>Geometry and DOM facts, as Jev gets them</h3>
    <pre>${esc(e.geometry)}\n\n${esc(e.dom)}</pre>
    <h3>Class-name hint <span class="muted">(never sent to Jev)</span></h3>
    <p><code>${esc(c.hint || "none")}</code></p>
    ${c.note ? "<h3>Note</h3><p>" + esc(c.note) + "</p>" : ""}
  </div>
</section>`;
  }).join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>DOM spike labelling sheet</title>
<style>
  :root { --ink: #1d1b16; --muted: #6e6a60; --line: #dedad2; --paper: #f7f5f0; --card: #ffffff; }
  @media (prefers-color-scheme: dark) { :root { --ink: #ece8df; --muted: #a39e92; --line: #3a3832; --paper: #171612; --card: #201f1a; } }
  body { margin: 0; padding: 32px 16px; background: var(--paper); color: var(--ink); font: 15px/1.5 -apple-system, "Helvetica Neue", Arial, sans-serif; }
  main { max-width: 1200px; margin: 0 auto; }
  h1 { font-size: 24px; margin: 0 0 8px; }
  .rule { background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 16px; margin: 16px 0 32px; }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 16px; margin: 0 0 24px; }
  .card h2 { font-size: 16px; margin: 0; word-break: break-all; }
  .card h3 { font-size: 13px; margin: 16px 0 4px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); }
  .muted { color: var(--muted); font-weight: normal; }
  .pictures { display: flex; gap: 16px; align-items: flex-start; flex-wrap: wrap; margin-top: 12px; }
  figure { margin: 0; flex: 0 0 auto; max-width: 100%; }
  figure.wide { flex: 1 1 480px; }
  img { display: block; max-width: 100%; height: auto; border: 1px solid var(--line); background: #fff; }
  figcaption { font-size: 12px; color: var(--muted); margin-top: 4px; }
  pre { white-space: pre-wrap; word-break: break-word; background: var(--paper); border: 1px solid var(--line); border-radius: 6px; padding: 12px; font-size: 13px; margin: 0; }
</style>
</head>
<body>
<main>
  <h1>Labelling sheet · ${entries.length} candidate${entries.length === 1 ? "" : "s"}</h1>
  <p class="muted">Read-only. Type labels into the candidate fixture, not here.</p>
  <div class="rule"><strong>The labelling rule.</strong> ${esc(rule)}</div>
${cards}
</main>
</body>
</html>
`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const fixture = loadCandidates(path.resolve(SPIKE, args.candidates || "fixtures/candidates.json"));
  const captures = loadCaptures(path.resolve(SPIKE, args.captures || "captures"));
  const out = path.resolve(SPIKE, args.out || "out/sheet.html");
  const outDir = path.dirname(out);
  const entries = [];
  for (const candidate of fixture.candidates) entries.push(await sheetEntry(candidate, captures, outDir));
  fs.mkdirSync(outDir, { recursive: true });
  // Always the rule as written here, so an old fixture cannot show an old rule.
  fs.writeFileSync(out, renderSheet(entries, LABELLING_RULE));
  console.log(entries.length + " candidates → " + path.relative(SPIKE, out) + " (open it in a browser; no server needed)");
}

module.exports = { sheetEntry, renderSheet };

if (require.main === module) main().catch((error) => { console.error(error.message || error); process.exit(1); });
