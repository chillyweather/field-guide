// Capture: a page in, a full-page screenshot and a record of its elements out.
//
//   node capture.js [--out captures] <url-or-path>...
//
// Written against the Playwright documentation (playwright.dev/docs/api) and
// the Chrome DevTools Protocol reference. Chromium only: role and accessible
// name come from Chromium's own accessibility tree, not a reimplementation.
//
// Per page it writes <slug>.png (never committed: a picture of someone else's
// site, and regenerable) and <slug>.json (committed, so the report can be
// recomputed without recapturing).

const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const { chromium } = require("playwright");
const { SPIKE, slug, writeJson, parseArgs } = require("./common");

// Desktop, at device pixel ratio 1, so a crop's pixel size is the element's
// CSS size and the geometry line and the picture agree.
const VIEWPORT = { width: 1440, height: 900 };

/** A local path becomes a file URL; the record keeps what was asked for. */
function resolveUrl(target) {
  if (/^[a-z]+:\/\//i.test(target)) return target;
  return pathToFileURL(path.resolve(SPIKE, target)).href;
}

/**
 * Captures every target in one browser, one page at a time.
 * Returns the records, and writes each one beside its screenshot in `outDir`.
 */
async function capture(targets, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  const records = [];
  try {
    for (const target of targets) {
      const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, reducedMotion: "reduce" });
      try {
        const page = await context.newPage();
        records.push(await capturePage(page, target, outDir));
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
  return records;
}

async function capturePage(page, target, outDir) {
  const name = slug(target);
  await page.goto(resolveUrl(target), { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => window.scrollTo(0, 0));

  const screenshot = name + ".png";
  await page.screenshot({ path: path.join(outDir, screenshot), fullPage: true, animations: "disabled", scale: "css" });

  const walked = await page.evaluate(walk);
  const roles = await accessibility(page);

  const elements = walked.elements.map((e, i) => Object.assign(
    { id: e.id, parent: e.parent, tag: e.tag, type: e.type },
    roles[i] || { role: null, name: null },
    { text: e.text, href: e.href, box: e.box, style: e.style },
  ));

  const record = {
    url: target,
    capturedAt: new Date().toISOString(),
    viewport: VIEWPORT,
    page: walked.page,
    screenshot,
    elements,
    // Class names, id and data-* are the design system's own names for things.
    // A labeller may read them as a hint; Jev must never see them, so they live
    // apart from the facts and nothing that builds a request reads this block.
    labelling: walked.labelling,
  };
  writeJson(path.join(outDir, name + ".json"), record);
  return record;
}

/**
 * Runs in the page. Every visible element, in document order, with the facts
 * the spike sends and, separately, the names it must not send.
 *
 * Leaves the elements on window.__fgElements, in the same order, so the
 * accessibility tree can be matched to them afterwards.
 */
function walk() {
  const round = (n) => Math.round(n * 100) / 100;
  const page = {
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
  };

  const recorded = new Map();
  const elements = [];
  const labelling = {};
  const kept = [];

  for (const el of document.querySelectorAll("*")) {
    const style = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    if (style.display === "none" || style.visibility !== "visible" || Number(style.opacity) === 0) continue;

    const id = "e" + (elements.length + 1);
    recorded.set(el, id);
    kept.push(el);

    let up = el.parentElement;
    while (up && !recorded.has(up)) up = up.parentElement;

    const raw = (el instanceof HTMLElement ? el.innerText : el.textContent) || "";
    const text = raw.replace(/\s+/g, " ").trim();

    elements.push({
      id,
      parent: up ? recorded.get(up) : null,
      tag: el.tagName.toLowerCase(),
      type: el.getAttribute("type"),
      text: text.length > 160 ? text.slice(0, 159) + "…" : text,
      href: el.hasAttribute("href") ? el.getAttribute("href") : null,
      box: { x: round(r.x + scrollX), y: round(r.y + scrollY), width: round(r.width), height: round(r.height) },
      style: {
        width: style.width,
        height: style.height,
        borderRadius: style.borderRadius,
        backgroundColor: style.backgroundColor,
        border: style.border || ["Top", "Right", "Bottom", "Left"]
          .map((side) => side.toLowerCase() + " " + style["border" + side]).join("; "),
        position: style.position,
        zIndex: style.zIndex,
        cursor: style.cursor,
      },
    });

    const names = { classes: [...el.classList], id: el.id || null, data: {} };
    for (const attr of el.attributes) if (attr.name.startsWith("data-")) names.data[attr.name] = attr.value;
    if (names.classes.length || names.id || Object.keys(names.data).length) labelling[id] = names;
  }

  window.__fgElements = kept;
  return { page, elements, labelling };
}

/**
 * Role and accessible name for each element left by walk(), in its order,
 * read from Chromium's accessibility tree over the DevTools protocol.
 */
async function accessibility(page) {
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send("DOM.enable");
    await cdp.send("Accessibility.enable");
    const { nodes } = await cdp.send("Accessibility.getFullAXTree");
    const byBackend = new Map();
    for (const node of nodes) if (node.backendDOMNodeId) byBackend.set(node.backendDOMNodeId, node);

    const { result } = await cdp.send("Runtime.evaluate", { expression: "window.__fgElements" });
    const { result: props } = await cdp.send("Runtime.getProperties", { objectId: result.objectId, ownProperties: true });
    const handles = props.filter((p) => /^\d+$/.test(p.name)).sort((a, b) => a.name - b.name);

    return await Promise.all(handles.map(async (p) => {
      const { node } = await cdp.send("DOM.describeNode", { objectId: p.value.objectId });
      const ax = byBackend.get(node.backendNodeId);
      return {
        role: ax && ax.role && ax.role.value ? String(ax.role.value) : null,
        name: ax && ax.name && ax.name.value ? String(ax.name.value) : null,
      };
    }));
  } finally {
    await cdp.detach();
  }
}

module.exports = { capture, VIEWPORT, resolveUrl };

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));
  if (!args._.length) {
    console.error("usage: node capture.js [--out captures] <url-or-path>...");
    process.exit(2);
  }
  const outDir = path.resolve(SPIKE, args.out || "captures");
  capture(args._, outDir).then((records) => {
    for (const r of records) console.log(r.url + ": " + r.elements.length + " elements → " + path.relative(SPIKE, outDir) + "/" + slug(r.url) + ".json");
  }).catch((error) => { console.error(error); process.exit(1); });
}
