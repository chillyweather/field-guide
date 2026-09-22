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

  const context = await exportContext(selection[0]);
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

  return { type: "collected", specimens, context: context && context.image, total: specimens.length };
}

function canExport(node) {
  return typeof node.exportAsync === "function" && node.width > 0 && node.height > 0;
}

/** The outermost frame the region sits in, exported once and shared by every specimen. */
async function exportContext(node) {
  let frame = node.parent;
  while (frame && frame.type !== "PAGE" && frame.parent && frame.parent.type !== "PAGE") {
    frame = frame.parent;
  }
  if (!frame || frame.type === "PAGE" || typeof frame.exportAsync !== "function") return null;

  const image = await frame.exportAsync({ format: "PNG", constraint: { type: "SCALE", value: 1 } });
  return { image, box: frame.absoluteBoundingBox };
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
