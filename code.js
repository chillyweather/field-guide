// Field Guide — plugin thread.
//
// This half only touches Figma: it exports the regions the designer marked,
// describes where they sit, and renames them once the UI has identified them.
// All network work happens in the UI iframe, which is the only half that has
// network at all.

const KEY_STORE = "field-guide.keys";
const SIZE_STORE = "field-guide.size";

// Wide enough that the survey row does not wrap, tall enough for the settings
// block plus one specimen. Below either, the panel stops being usable rather
// than merely cramped.
const MIN = { width: 380, height: 420 };
const MAX = { width: 1400, height: 2000 };
const clamp = (n, lo, hi) => Math.min(Math.max(Math.round(n) || lo, lo), hi);

figma.showUI(__html__, { width: 420, height: 600, themeColors: true });

// clientStorage is async and showUI is not, so the window opens at its default
// and corrects itself a frame later. Visible only as a small settle on open,
// which is cheaper than blocking the panel behind a read.
(async () => {
  try {
    const saved = await figma.clientStorage.getAsync(SIZE_STORE);
    if (saved && saved.width && saved.height) {
      figma.ui.resize(clamp(saved.width, MIN.width, MAX.width), clamp(saved.height, MIN.height, MAX.height));
    }
  } catch (error) {
    // A bad stored size must not stop the plugin opening.
    console.warn("[field-guide] could not restore window size", error);
  }
})();

figma.ui.onmessage = async (msg) => {
  try {
    switch (msg.type) {
      case "load-keys":
        return figma.ui.postMessage({
          type: "keys",
          keys: (await figma.clientStorage.getAsync(KEY_STORE)) || {},
        });

      case "save-keys":
        await figma.clientStorage.setAsync(KEY_STORE, msg.keys || {});
        return figma.ui.postMessage({ type: "keys-saved" });

      case "collect":
        return figma.ui.postMessage(await collect());

      case "apply":
        return figma.ui.postMessage(applyNames(msg.names || []));

      case "focus":
        return focusNode(msg.id);

      case "sheet":
        return figma.ui.postMessage(await buildSheet(msg.items || []));

      case "resize": {
        const width = clamp(msg.width, MIN.width, MAX.width);
        const height = clamp(msg.height, MIN.height, MAX.height);
        figma.ui.resize(width, height);
        // Written on release only — see the grip handler in the UI.
        if (msg.remember) await figma.clientStorage.setAsync(SIZE_STORE, { width, height });
        return;
      }
    }
  } catch (error) {
    figma.ui.postMessage({ type: "failed", message: String(error && error.message ? error.message : error) });
  }
};

/**
 * Exports every selected region, plus one shared context image.
 *
 * The context image is the reason this is worth doing inside a design tool.
 * A crop of a Tab, a Segment Control and a Navigation item are the same
 * picture; the frame they sit in is what tells them apart, so the vision step
 * gets both and is told which is which.
 */
async function collect() {
  const selection = figma.currentPage.selection.filter(canExport);
  if (selection.length === 0) {
    return { type: "collected", specimens: [], context: null, reason: "nothing-selected" };
  }

  const context = await exportContext(selection);
  const specimens = [];

  for (let i = 0; i < selection.length; i++) {
    const node = selection[i];
    const bytes = await node.exportAsync({ format: "PNG", constraint: { type: "SCALE", value: 2 } });
    specimens.push({
      id: node.id,
      index: i + 1,
      name: node.name,
      bytes,
      geometry: describeGeometry(node, context && context.box),
    });
  }

  return {
    type: "collected",
    specimens,
    context: context && context.image,
    contextName: context ? context.name : null,
    contextFramed: context ? context.framed : false,
    total: specimens.length,
  };
}

function canExport(node) {
  return typeof node.exportAsync === "function" && node.width > 0 && node.height > 0;
}

/**
 * The surroundings, exported once and shared by every specimen.
 *
 * Two wrong versions preceded this one, and both failed silently.
 *
 * The first walked up for a containing frame and gave up at the page. That is
 * the ordinary case: marking up a screenshot means dropping the image on the
 * page and drawing slices over it, so neither has a frame.
 *
 * The second looked for the largest page node enclosing `selection[0]` — and
 * the first selected node is very often the screenshot itself, which nothing
 * encloses. It returned null for exactly the arrangement it was written for.
 *
 * So the question is asked of the whole selection at once: the smallest box
 * covering every marked region, then the largest node on the page that contains
 * it. The screenshot qualifies whether or not it was itself selected, which is
 * the property both earlier versions lacked.
 */
async function exportContext(nodes) {
  const union = unionBox(nodes);
  if (!union) return null;

  const framed = enclosingFrame(nodes[0]);
  const source = framed || largestContaining(union);
  if (!source || typeof source.exportAsync !== "function") return null;

  // Scale 1: this image is re-sent with every region in the run, so its size is
  // multiplied by the selection count. On eighteen regions a 1,000-token context
  // is 18,000 tokens, which would roughly double the run.
  const image = await source.exportAsync({ format: "PNG", constraint: { type: "SCALE", value: 1 } });
  return { image, box: source.absoluteBoundingBox, name: source.name, framed: Boolean(framed) };
}

/** The smallest box covering every marked region. */
function unionBox(nodes) {
  let box = null;
  for (const node of nodes) {
    const b = node.absoluteBoundingBox;
    if (!b) continue;
    if (!box) { box = { x: b.x, y: b.y, right: b.x + b.width, bottom: b.y + b.height }; continue; }
    box.x = Math.min(box.x, b.x);
    box.y = Math.min(box.y, b.y);
    box.right = Math.max(box.right, b.x + b.width);
    box.bottom = Math.max(box.bottom, b.y + b.height);
  }
  return box;
}

function enclosingFrame(node) {
  let frame = node.parent;
  while (frame && frame.type !== "PAGE" && frame.parent && frame.parent.type !== "PAGE") {
    frame = frame.parent;
  }
  return frame && frame.type !== "PAGE" && typeof frame.exportAsync === "function" ? frame : null;
}

/**
 * The biggest page node containing the whole selection.
 *
 * Slices are excluded: a slice large enough to contain the others is a marked
 * region, not the screen behind them, and exporting one would send the crop
 * back as its own context.
 */
function largestContaining(union) {
  let best = null;
  let bestArea = 0;
  for (const candidate of figma.currentPage.children) {
    if (candidate.type === "SLICE" || typeof candidate.exportAsync !== "function") continue;
    const b = candidate.absoluteBoundingBox;
    if (!b) continue;
    const contains = b.x <= union.x && b.y <= union.y &&
      b.x + b.width >= union.right && b.y + b.height >= union.bottom;
    if (!contains) continue;
    const area = b.width * b.height;
    if (area > bestArea) { best = candidate; bestArea = area; }
  }
  return best;
}
/**
 * What the pixels do not say.
 *
 * Size, proportion and position are free here and genuinely discriminating: a
 * full-width 64px band at the top of the frame is a Header and not a Card, and
 * no crop of it says so.
 */
function describeGeometry(node, contextBox) {
  const box = node.absoluteBoundingBox;
  const w = Math.round(node.width);
  const h = Math.round(node.height);
  const parts = [`${w}x${h} px`, `aspect ratio ${(w / Math.max(h, 1)).toFixed(2)}`];

  if (contextBox && box) {
    const widthShare = box.width / contextBox.width;
    const relX = (box.x - contextBox.x) / contextBox.width;
    const relY = (box.y - contextBox.y) / contextBox.height;
    parts.push(`spans ${Math.round(widthShare * 100)}% of the screen width`);
    parts.push(`positioned ${band(relY, "top", "middle", "bottom")} ${band(relX, "left", "centre", "right")} of the screen`);
  }
  return parts.join("; ");
}

function band(ratio, low, mid, high) {
  if (ratio < 0.33) return low;
  if (ratio < 0.66) return mid;
  return high;
}

/** Renames only what the UI decided to apply. Missing nodes are skipped, not fatal. */
function applyNames(names) {
  let applied = 0;
  for (const entry of names) {
    const node = figma.getNodeById(entry.id);
    if (!node || node.removed) continue;
    node.name = entry.name;
    applied++;
  }
  figma.notify(applied === 1 ? "Named 1 region" : `Named ${applied} regions`);
  return { type: "applied", applied };
}

function focusNode(id) {
  const node = figma.getNodeById(id);
  if (!node || node.removed) return;
  figma.currentPage.selection = [node];
  figma.viewport.scrollAndZoomIntoView([node]);
}


/* ---------------------------------------------------------------------------
 * The sheet.
 *
 * A survey that only renames layers leaves nothing to look at. This lays the
 * findings out on the canvas beside the screenshot they came from: one heading
 * per component the guide recognised, and under it every region identified as
 * that component, as a picture.
 *
 * Built from the node ids rather than from the crops the UI already holds. The
 * bytes would have to travel back across postMessage for no gain — the nodes
 * are right here, and re-exporting is cheaper than shipping images twice.
 * ------------------------------------------------------------------------ */

const SHEET_KEY = "field-guide-sheet";
const CARD_PADDING = 48;
const SHEET_PADDING = 80;
const SHEET_GAP = 160;
// figma.createImage refuses anything longer than this on either side, with
// "Image is too large". Exporting a full-width region at 2x clears it easily.
const MAX_IMAGE_PX = 4096;

const PAPER = { r: 0.957, g: 0.945, b: 0.925 };
const CARD = { r: 1, g: 1, b: 1 };
const INK = { r: 0.137, g: 0.125, b: 0.102 };
const MUTED = { r: 0.478, g: 0.447, b: 0.388 };

async function loadSheetFonts() {
  // Inter is Figma's default and present in almost every file, but a file that
  // has never used it can still fail the load. Roboto is the fallback, and a
  // sheet in the wrong typeface beats no sheet at all.
  for (const family of ["Inter", "Roboto"]) {
    try {
      await Promise.all([
        figma.loadFontAsync({ family, style: "Regular" }),
        figma.loadFontAsync({ family, style: "Bold" }),
      ]);
      return family;
    } catch (error) {
      console.warn("[field-guide] could not load " + family, error);
    }
  }
  throw new Error("No usable font: tried Inter and Roboto.");
}

function column(name, spacing, padding) {
  const frame = figma.createFrame();
  frame.name = name;
  frame.layoutMode = "VERTICAL";
  frame.itemSpacing = spacing;
  frame.paddingTop = frame.paddingBottom = frame.paddingLeft = frame.paddingRight = padding || 0;
  frame.primaryAxisSizingMode = "AUTO";
  frame.counterAxisSizingMode = "AUTO";
  frame.fills = [];
  frame.clipsContent = false;
  return frame;
}

function label(text, size, weight, colour, family) {
  const node = figma.createText();
  node.fontName = { family, style: weight };
  node.characters = text;
  node.fontSize = size;
  node.fills = [{ type: "SOLID", color: colour }];
  return node;
}

/**
 * Enough pixels for a crisp picture at the size it is displayed, and never more
 * than createImage will accept.
 */
function exportScaleFor(natural, displayScale) {
  const wanted = displayScale * 2;
  const longest = Math.max(natural.w, natural.h);
  const ceiling = MAX_IMAGE_PX / Math.max(1, longest);
  // Figma accepts a scale constraint between 0.01 and 4.
  return Math.max(0.01, Math.min(4, wanted, ceiling));
}

/** One region, as a white card with the exported picture centred on it. */
async function specimenCard(node, width, family, caption, note) {
  // Scaled down to fit inside the card, never merely placed in it. A region
  // wider than the card used to hang out of both sides of it — auto-layout
  // does not shrink a fixed-size child, it lets it overflow.
  const inner = Math.max(1, width - CARD_PADDING * 2);
  const natural = { w: Math.max(1, Math.round(node.width)), h: Math.max(1, Math.round(node.height)) };
  const scale = natural.w > inner ? inner / natural.w : 1;

  // Export for the size it will be shown at, not for the size it is.
  //
  // A flat 2x was both wasteful and fatal: a region already being scaled down
  // to a third of its width was exported at six times the pixels it would
  // display, and on a full-page screenshot that cleared createImage's limit and
  // threw "Image is too large" — which aborted the whole sheet, not one card.
  const bytes = await node.exportAsync({
    format: "PNG",
    constraint: { type: "SCALE", value: exportScaleFor(natural, scale) },
  });
  const image = figma.createImage(bytes);

  const picture = figma.createFrame();
  picture.name = node.name;
  picture.resize(Math.max(1, Math.round(natural.w * scale)), Math.max(1, Math.round(natural.h * scale)));
  picture.fills = [{ type: "IMAGE", scaleMode: "FIT", imageHash: image.hash }];

  const card = figma.createFrame();
  card.name = "card";
  card.layoutMode = "HORIZONTAL";
  card.primaryAxisAlignItems = "CENTER";
  card.counterAxisAlignItems = "CENTER";
  card.paddingTop = card.paddingBottom = CARD_PADDING;
  card.paddingLeft = card.paddingRight = CARD_PADDING;
  card.counterAxisSizingMode = "AUTO";
  card.primaryAxisSizingMode = "FIXED";
  card.fills = [{ type: "SOLID", color: CARD }];
  card.appendChild(picture);
  card.resize(width, card.height);

  const item = column("item", 8);
  const captionRow = column("caption", 2);
  captionRow.appendChild(label(caption, 16, "Regular", MUTED, family));
  if (note) captionRow.appendChild(label(note, 13, "Regular", MUTED, family));
  item.appendChild(captionRow);
  item.appendChild(card);
  return item;
}

async function buildSheet(items) {
  // Everything created during a build, so a failure part way through can be
  // swept up. figma.createFrame and createText attach to the current page the
  // moment they are called, so an abort would otherwise strew loose frames
  // across the designer's document.
  const created = [];
  try {
    return await assembleSheet(items, created);
  } catch (error) {
    for (const node of created) {
      if (node && !node.removed && node.parent && node.parent.type === "PAGE") node.remove();
    }
    throw error;
  }
}

async function assembleSheet(items, created) {
  if (!items.length) return { type: "sheet-built", count: 0, groups: 0, reason: "nothing-identified" };

  const family = await loadSheetFonts();
  const resolved = [];
  for (const item of items) {
    const node = figma.getNodeById(item.id);
    if (node && !node.removed && typeof node.exportAsync === "function") resolved.push({ item, node });
  }
  if (!resolved.length) return { type: "sheet-built", count: 0, groups: 0, reason: "nothing-identified" };

  // Cards share one width so the sheet reads as a column rather than a ragged
  // stack, and the widest specimen is what sets it.
  const widest = Math.max(...resolved.map((r) => Math.round(r.node.width)));
  const cardWidth = Math.max(480, Math.min(widest + 96, 1200));

  // Grouped by what the guide called them, biggest group first — the point of
  // the sheet is which components this screen is made of.
  const groups = new Map();
  for (const entry of resolved) {
    const key = entry.item.answer || "Unidentified";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }
  const ordered = [...groups.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));

  const sheet = column("Field Guide — sheet", 80, SHEET_PADDING);
  created.push(sheet);
  sheet.fills = [{ type: "SOLID", color: PAPER }];
  sheet.setPluginData(SHEET_KEY, "1");

  for (const [component, entries] of ordered) {
    const group = column(component, 12);
    created.push(group);
    const heading = label(component, 48, "Bold", INK, family);
    group.appendChild(heading);
    const count = label(entries.length === 1 ? "1 region" : entries.length + " regions", 14, "Regular", MUTED, family);
    group.appendChild(count);

    const stack = column("regions", 24);
    created.push(stack);
    for (const { item, node } of entries) {
      // The held-back ones say so. A sheet that shows only the answer and not
      // its standing would misrepresent a run where a third were guesses.
      const note = item.verdict === "confident"
        ? null
        : "confidence " + Number(item.confidence).toFixed(2) + " · " +
          (item.verdict === "unsure" ? "not identified" : "awaiting review");
      const card = await specimenCard(node, cardWidth, family, node.name, note);
      created.push(card);
      stack.appendChild(card);
    }
    group.appendChild(stack);
    sheet.appendChild(group);
  }

  figma.currentPage.appendChild(sheet);
  placeLeftOf(sheet, resolved.map((r) => r.node), cardWidth);
  figma.currentPage.selection = [sheet];
  figma.viewport.scrollAndZoomIntoView([sheet]);

  return { type: "sheet-built", count: resolved.length, groups: ordered.length };
}

/**
 * Beside the screenshot, never on top of it.
 *
 * Anchored to the union of the marked regions rather than to the context node,
 * because the context may be absent — and the regions are what the sheet is
 * about in either case.
 */
function placeLeftOf(sheet, nodes, cardWidth) {
  const union = unionBox(nodes);
  if (!union) return;

  // Not `sheet.width` alone. Auto-layout width is not reliably settled in the
  // same tick the children were appended, and reading it early returns",
  // something near zero — which put the sheet 160px left of the regions,
  // directly on top of the screenshot it was supposed to sit beside.
  //
  // The intended width is known without asking: one card plus the sheet's own
  // padding. Take whichever is larger, so a settled layout still wins if a
  // heading turns out wider than the cards.
  const intended = cardWidth + SHEET_PADDING * 2;
  const width = Math.max(sheet.width || 0, intended);

  sheet.x = Math.round(union.x - width - SHEET_GAP);
  sheet.y = Math.round(union.y);
}
