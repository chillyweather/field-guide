// The evidence for one candidate: what the plugin would have, made from a page.
//
// - the crop, cut from the full-page screenshot and fitted by fitForJev exactly
//   as the plugin fits its exports (padded on white, never enlarged);
// - a viewport-sized context window around it, clamped at the page edges so a
//   candidate near the top still gets a full window, with the candidate
//   outlined, then fitted the same way;
// - the plugin's geometry sentence, measured against that window;
// - the DOM facts, from the element record and never from the labelling block.
//
// The pictures are written to out/evidence (never committed) and named by the
// candidate, so a saved request can point at them by file and hash.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const sharp = require("sharp");
const { fitForJev } = require("../src-images");
const { describeGeometry } = require("../src-geometry");
const { SPIKE } = require("./common");

// Named in the state, so Jev can tell the outline from a focus ring or a border.
const OUTLINE = { colour: "magenta", hex: "#ff00ff", width: 3, gap: 2 };

/**
 * The element's box as whole pixels, rounded outward and kept inside the image,
 * or null when no part of it is inside the image.
 */
function cropRect(box, image) {
  const left = Math.max(0, Math.floor(box.x));
  const top = Math.max(0, Math.floor(box.y));
  const right = Math.min(image.width, Math.ceil(box.x + box.width));
  const bottom = Math.min(image.height, Math.ceil(box.y + box.height));
  if (right <= left || bottom <= top) return null;
  return { left, top, width: right - left, height: bottom - top };
}

/**
 * One viewport around the candidate's centre, slid back inside the page
 * rather than cut off at its edge. Smaller than a viewport only when the page is.
 */
function contextWindow(box, viewport, image) {
  const width = Math.min(viewport.width, image.width);
  const height = Math.min(viewport.height, image.height);
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const clamp = (v, hi) => Math.max(0, Math.min(Math.round(v), hi));
  return {
    x: clamp(cx - width / 2, image.width - width),
    y: clamp(cy - height / 2, image.height - height),
    width,
    height,
  };
}

/**
 * The facts Jev may read about an element: its own, its parent's tag and role,
 * and its children counted by role. Built from named fields of the element
 * records only; the record's labelling block is never passed in.
 */
function domFor(elements, element) {
  const parent = element.parent ? elements.find((e) => e.id === element.parent) : null;
  const children = {};
  for (const e of elements) {
    if (e.parent !== element.id) continue;
    const role = e.role || "none";
    children[role] = (children[role] || 0) + 1;
  }
  return {
    tag: element.tag,
    type: element.type || null,
    role: element.role || null,
    name: element.name || null,
    text: element.text || null,
    href: typeof element.href === "string" ? element.href : null,
    aria: element.aria || {},
    style: element.style || {},
    parent: parent ? { tag: parent.tag, role: parent.role || null } : null,
    children,
  };
}

/** A PNG fitted to Jev's limits the way the plugin's fitImage does it, on a white canvas. */
async function fitPng(buffer) {
  const meta = await sharp(buffer).metadata();
  const fit = fitForJev(meta.width, meta.height);
  let image = sharp(buffer).flatten({ background: "#ffffff" });
  if (fit.drawW !== meta.width || fit.drawH !== meta.height) image = image.resize(fit.drawW, fit.drawH, { fit: "fill" });
  const left = Math.floor((fit.canvasW - fit.drawW) / 2);
  const top = Math.floor((fit.canvasH - fit.drawH) / 2);
  image = image.extend({
    left, top, right: fit.canvasW - fit.drawW - left, bottom: fit.canvasH - fit.drawH - top,
    background: "#ffffff",
  });
  const png = await image.png().toBuffer();
  return { png, width: meta.width, height: meta.height, ...fit };
}

function outlineSvg(box, win) {
  const off = OUTLINE.gap + OUTLINE.width / 2;
  const x = box.x - win.x - off;
  const y = box.y - win.y - off;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${win.width}" height="${win.height}">` +
    `<rect x="${x}" y="${y}" width="${box.width + off * 2}" height="${box.height + off * 2}" ` +
    `fill="none" stroke="${OUTLINE.hex}" stroke-width="${OUTLINE.width}"/></svg>`);
}

const sha256 = (buffer) => crypto.createHash("sha256").update(buffer).digest("hex");

/**
 * Everything the request builder needs for one candidate, plus the files the
 * pictures were written to. `name` is file-safe and unique per candidate.
 */
async function buildEvidence({ record, elementId, screenshot, name, outDir }) {
  const element = record.elements.find((e) => e.id === elementId);
  if (!element) throw new Error("No element " + elementId + " in the record for " + record.url);

  const shot = sharp(screenshot);
  const image = await shot.metadata();

  const rect = cropRect(element.box, image);
  if (!rect) {
    throw new Error("Element " + elementId + " on " + record.url + " lies outside the screenshot (" +
      JSON.stringify(element.box) + " on " + image.width + "x" + image.height + "); there is nothing to crop.");
  }
  const crop = await sharp(screenshot).extract(rect).png().toBuffer();

  const win = contextWindow(element.box, record.viewport, image);
  const windowPng = await sharp(screenshot)
    .extract({ left: win.x, top: win.y, width: win.width, height: win.height })
    .composite([{ input: outlineSvg(element.box, win), left: 0, top: 0 }])
    .png().toBuffer();

  const cropFit = await fitPng(crop);
  const windowFit = await fitPng(windowPng);

  const dir = outDir || path.join(SPIKE, "out", "evidence");
  fs.mkdirSync(dir, { recursive: true });
  const cropFile = path.join(dir, name + "-crop.png");
  const windowFile = path.join(dir, name + "-window.png");
  fs.writeFileSync(cropFile, cropFit.png);
  fs.writeFileSync(windowFile, windowFit.png);

  const picture = (fit, file) => ({
    b64: fit.png.toString("base64"),
    file: path.relative(SPIKE, file),
    sha256: sha256(fit.png),
    width: fit.width,
    height: fit.height,
    padded: fit.padded,
    scale: fit.scale,
  });

  return {
    origin: "web",
    crop: Object.assign(picture(cropFit, cropFile), { cut: rect }),
    context: Object.assign(picture(windowFit, windowFile), {
      box: win,
      outline: { colour: OUTLINE.colour, width: OUTLINE.width },
    }),
    geometry: describeGeometry(element.box, win),
    dom: domFor(record.elements, element),
  };
}

module.exports = { buildEvidence, cropRect, contextWindow, domFor, fitPng, OUTLINE };
