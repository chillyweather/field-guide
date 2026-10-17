// Capture: a page in, a full-page screenshot and a record of its elements out.
//
//   node capture.js [--out captures] <url-or-path>...
//
// Several URLs in one run, so five to ten pages of one site come out together.
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
  const network = trackNetwork(page);
  // To the load event, then quiet by the tracker's own measure: Playwright's
  // "networkidle" waits on beacons too, and a page whose beacon is never
  // answered never gets there.
  await page.goto(resolveUrl(target), { waitUntil: "load" });
  await network.idle();
  await page.evaluate(() => document.fonts.ready);

  // Lazy content loads when it scrolls into view, so the page is scrolled to
  // the bottom a viewport at a time and back, and then left to go quiet. A
  // late image would otherwise be missing from the picture, and a late section
  // would move every box below it after the boxes were measured.
  await scrollThrough(page, network);
  await network.idle();
  await page.evaluate(() => document.fonts.ready);

  // Frozen here rather than by the screenshot alone: Playwright's own freeze is
  // lifted again when the screenshot returns, and the walk that follows would
  // then measure an animation in a different place from the one pictured.
  await page.evaluate(freezeAnimations);

  // At scroll position 0, so fixed and sticky elements sit where their boxes say.
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  const screenshot = name + ".png";
  await page.screenshot({ path: path.join(outDir, screenshot), fullPage: true, animations: "disabled", scale: "css" });

  const walked = await page.evaluate(walk);
  const tree = await inspect(page);
  network.stop();

  const elements = walked.elements.map((e, i) => {
    const found = tree.elements[i] || {};
    const element = Object.assign(
      { id: e.id, parent: e.parent, tag: e.tag, type: e.type },
      { role: found.role || null, name: found.name || null },
      { text: e.text, href: e.href, aria: e.aria, box: e.box, style: e.style },
    );
    if (e.shadow) element.shadow = true;
    if (found.closedShadowRoot) element.closedShadowRoot = true;
    return element;
  });

  const record = {
    url: target,
    capturedAt: new Date().toISOString(),
    viewport: VIEWPORT,
    page: walked.page,
    screenshot,
    // Closed shadow roots cannot be walked from the page. Counted, and their
    // hosts marked, so a page built on them is not silently half-captured.
    closedShadowRoots: tree.closedShadowRoots,
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
 * Requests in flight, so the capture can wait for a quiet network after it has
 * provoked lazy loading. Playwright's own "networkidle" only applies to a load.
 */
function trackNetwork(page) {
  const inFlight = new Set();
  // Set by every start and every finish, so a request that comes and goes
  // between two checks still resets the quiet interval.
  let lastActivity = Date.now();
  // Beacons (sendBeacon, <a ping>) are not counted: nothing on the page waits
  // for their answer, and GitHub's collector never sends one in headless Chromium.
  const start = (req) => { if (req.resourceType() === "ping") return; inFlight.add(req); lastActivity = Date.now(); };
  const end = (req) => { inFlight.delete(req); lastActivity = Date.now(); };
  page.on("request", start);
  page.on("requestfinished", end);
  page.on("requestfailed", end);
  return {
    // Quiet for half a second, as Playwright defines idle; given up on after
    // the timeout, so a page that polls forever is captured rather than hung.
    async idle(quietMs = 500, timeoutMs = 15000) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        if (!inFlight.size && Date.now() - lastActivity >= quietMs) return true;
        await page.waitForTimeout(50);
      }
      return false;
    },
    stop() {
      page.off("request", start);
      page.off("requestfinished", end);
      page.off("requestfailed", end);
    },
  };
}

/**
 * Down a viewport at a time to the bottom, then back to the top.
 *
 * Instant scrolling, since a page with scroll-behavior: smooth would otherwise
 * still be on its way when the position is read. At the bottom the network is
 * given time to settle and the bottom is checked again: content appended there
 * is swept through too, not just loaded.
 */
async function scrollThrough(page, network) {
  const step = (height) => page.evaluate((h) => {
    const before = window.scrollY;
    window.scrollBy({ top: h, behavior: "instant" });
    return window.scrollY !== before;
  }, height);
  // Capped, so an infinite feed ends; forty viewports is 36,000 px of page.
  for (let i = 0; i < 40; i++) {
    if (!(await step(VIEWPORT.height))) {
      await network.idle(500, 5000);
      await heightSettles(page);
      if (!(await step(VIEWPORT.height))) break;
    }
    // A frame or more at every position, or an observer never sees it.
    await page.waitForTimeout(100);
  }
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
}

/**
 * Until the page has kept the same height for a second, or five seconds pass.
 * Content appended by a timer or a slow script makes no request to wait on.
 */
async function heightSettles(page, stableMs = 1000, timeoutMs = 5000) {
  const height = () => page.evaluate(() => document.documentElement.scrollHeight);
  const deadline = Date.now() + timeoutMs;
  let last = await height();
  let since = Date.now();
  while (Date.now() < deadline && Date.now() - since < stableMs) {
    await page.waitForTimeout(100);
    const now = await height();
    if (now !== last) { last = now; since = Date.now(); }
  }
}

/**
 * Runs in the page. Stops every running animation and leaves it stopped, the way
 * Playwright's screenshot option does for its own duration: a finite one jumps
 * to its end, an infinite one is cancelled back to where it started. Open
 * shadow roots hold their own animations, so each is asked separately.
 */
function freezeAnimations() {
  const roots = [document];
  for (let i = 0; i < roots.length; i++) {
    for (const el of roots[i].querySelectorAll("*")) if (el.shadowRoot) roots.push(el.shadowRoot);
  }
  for (const root of roots) {
    for (const animation of root.getAnimations()) {
      try {
        const timing = animation.effect && animation.effect.getComputedTiming();
        if (timing && timing.endTime === Infinity) animation.cancel();
        else animation.finish();
      } catch (error) {
        animation.cancel();
      }
    }
  }
}

/**
 * Runs in the page. Every visible element, with the facts the spike sends and,
 * separately, the names it must not send.
 *
 * Elements are visited in document order, and an open shadow root's contents
 * straight after its host. "Visible" means all of: a box at least one pixel
 * each way; not display: none; not visibility: hidden; opacity above zero once
 * every ancestor's opacity is applied, since opacity is not inherited and a
 * transparent wrapper hides everything in it (one with display: contents has
 * no box, and hides nothing, and none reaches into the top layer); and some part inside the page.
 * aria-hidden elements are visible, so they are kept, and their aria-hidden is
 * recorded.
 *
 * Leaves the kept elements on window.__fgElements, in record order, so the
 * accessibility tree can be matched to them afterwards.
 */
function walk() {
  const round = (n) => Math.round(n * 100) / 100;
  const page = {
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
  };

  // The parent an element is rendered inside: its slot when it is slotted,
  // its host when it is the top of a shadow tree.
  const renderedParent = (el) => {
    if (el.assignedSlot) return el.assignedSlot;
    if (el.parentElement) return el.parentElement;
    const root = el.parentNode;
    return root instanceof ShadowRoot ? root.host : null;
  };

  const all = [];
  const visit = (root) => {
    for (const el of root.querySelectorAll("*")) {
      all.push(el);
      if (el.shadowRoot) visit(el.shadowRoot);
    }
  };
  visit(document);

  const opacity = new Map();
  const effectiveOpacity = (el) => {
    if (!el) return 1;
    if (opacity.has(el)) return opacity.get(el);
    // A display: contents element has no box for its opacity to apply to, so
    // its children paint as if it were not there.
    const style = getComputedStyle(el);
    const own = style.display === "contents" ? 1 : Number(style.opacity);
    // An open modal dialog or popover paints in the top layer, out of reach of
    // its ancestors' opacity; only its own applies.
    const topLayer = el.matches(":modal, :popover-open, :fullscreen");
    const value = topLayer ? own : own * effectiveOpacity(renderedParent(el));
    opacity.set(el, value);
    return value;
  };

  const kept = [];
  const ids = new Map();
  for (const el of all) {
    const style = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    if (style.display === "none" || style.visibility !== "visible") continue;
    if (!(effectiveOpacity(el) > 0)) continue;
    const x = r.x + scrollX, y = r.y + scrollY;
    if (x + r.width <= 0 || y + r.height <= 0 || x >= page.width || y >= page.height) continue;
    ids.set(el, "e" + (kept.length + 1));
    kept.push(el);
  }

  const elements = [];
  const labelling = {};
  for (const el of kept) {
    const id = ids.get(el);
    const style = getComputedStyle(el);
    const r = el.getBoundingClientRect();

    // The nearest recorded ancestor, so the tree stays closed across skipped
    // wrappers (display: contents, zero-size, and the like).
    let up = renderedParent(el);
    while (up && !ids.has(up)) up = renderedParent(up);

    const raw = (el instanceof HTMLElement ? el.innerText : el.textContent) || "";
    const text = raw.replace(/\s+/g, " ").trim();

    const element = {
      id,
      parent: up ? ids.get(up) : null,
      tag: el.tagName.toLowerCase(),
      type: el.getAttribute("type"),
      text: text.length > 160 ? text.slice(0, 159) + "…" : text,
      href: el.hasAttribute("href") ? el.getAttribute("href") : null,
      aria: ariaStates(el),
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
    };
    if (el.getRootNode() instanceof ShadowRoot) element.shadow = true;
    elements.push(element);

    const names = { classes: [...el.classList], id: el.id || null, data: {} };
    for (const attr of el.attributes) if (attr.name.startsWith("data-")) names.data[attr.name] = attr.value;
    if (names.classes.length || names.id || Object.keys(names.data).length) labelling[id] = names;
  }

  // The ARIA states a control can declare, only where the page declares them.
  function ariaStates(el) {
    const states = {};
    for (const key of ["checked", "pressed", "expanded", "hidden"]) {
      if (el.hasAttribute("aria-" + key)) states[key] = el.getAttribute("aria-" + key);
    }
    return states;
  }

  window.__fgElements = kept;
  return { page, elements, labelling };
}

/**
 * For each element left by walk(), in its order: role and accessible name from
 * Chromium's accessibility tree, and whether it hosts a closed shadow root.
 * Over the DevTools protocol, which sees what page script cannot.
 */
async function inspect(page) {
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send("DOM.enable");
    await cdp.send("Accessibility.enable");
    const { nodes } = await cdp.send("Accessibility.getFullAXTree");
    const byBackend = new Map();
    for (const node of nodes) if (node.backendDOMNodeId) byBackend.set(node.backendDOMNodeId, node);

    // Hosts of closed shadow roots, found in the pierced DOM tree.
    const closedHosts = new Set();
    const { root } = await cdp.send("DOM.getDocument", { depth: -1, pierce: true });
    const stack = [root];
    while (stack.length) {
      const node = stack.pop();
      for (const shadow of node.shadowRoots || []) {
        if (shadow.shadowRootType === "closed") closedHosts.add(node.backendNodeId);
        stack.push(shadow);
      }
      for (const child of node.children || []) stack.push(child);
      if (node.contentDocument) stack.push(node.contentDocument);
    }

    const { result } = await cdp.send("Runtime.evaluate", { expression: "window.__fgElements" });
    const { result: props } = await cdp.send("Runtime.getProperties", { objectId: result.objectId, ownProperties: true });
    const handles = props.filter((p) => /^\d+$/.test(p.name)).sort((a, b) => a.name - b.name);

    const elements = await Promise.all(handles.map(async (p) => {
      const { node } = await cdp.send("DOM.describeNode", { objectId: p.value.objectId });
      const ax = byBackend.get(node.backendNodeId);
      return {
        role: ax && ax.role && ax.role.value ? String(ax.role.value) : null,
        name: ax && ax.name && ax.name.value ? String(ax.name.value) : null,
        closedShadowRoot: closedHosts.has(node.backendNodeId),
      };
    }));
    return { elements, closedShadowRoots: closedHosts.size };
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
