// What Jev will accept as a picture, and how a Figma export is made to fit.
//
// Jev's image input (docs.typesafe.ai/images, "Dreamer-ready" in October 2026)
// refuses rather than resizes: each side 280–1568 px, 78,400–2,458,624 pixels
// in all, and one refused image fails the whole request with no partial
// answers. Figma exports break both ends — a 2x crop of an icon button is about
// 48 px, and a long scrolling screen at 1x runs past 1568 in height.
//
// Too large is scaled down. Too small is padded, never scaled up: blowing a
// 24 px control up to 256 would tell the guide it is a big thing, and its size
// is evidence. The padding is flat white and the state says so, so it reads as
// background rather than as part of the region.

// The docs say 256 for the side. The API refuses anything under 280 — measured
// on 15 October 2026: 279x300 and 1000x256 answer "Invalid image dimensions",
// 280x300 is accepted. 280 squared is the pixel floor, so it looks like the
// floor applied per side. The measurement wins over the page.
const JEV_IMAGE = {
  minSide: 280,
  maxSide: 1568,
  minPixels: 78400,
  maxPixels: 2458624,
};

/**
 * The canvas an image of this size goes onto, and the size it is drawn at.
 * The drawing is centred on the canvas; `scale` is below 1 only when shrunk.
 */
function fitForJev(width, height) {
  const L = JEV_IMAGE;
  const scale = Math.min(1, L.maxSide / width, L.maxSide / height, Math.sqrt(L.maxPixels / (width * height)));
  const drawW = Math.max(1, Math.floor(width * scale));
  const drawH = Math.max(1, Math.floor(height * scale));

  let canvasW = Math.max(drawW, L.minSide);
  let canvasH = Math.max(drawH, L.minSide);
  // Redundant while minSide is 280, kept in case the API comes back in line
  // with its documented 256: then 256 x 256 would sit under the pixel floor.
  if (canvasW * canvasH < L.minPixels) {
    if (canvasW <= canvasH) canvasW = Math.ceil(L.minPixels / canvasH);
    else canvasH = Math.ceil(L.minPixels / canvasW);
  }
  return { canvasW, canvasH, drawW, drawH, scale, padded: canvasW > drawW || canvasH > drawH };
}

/** Whether Jev would take an image of exactly this size. */
function jevAccepts(width, height) {
  const L = JEV_IMAGE;
  const px = width * height;
  return width >= L.minSide && height >= L.minSide && width <= L.maxSide && height <= L.maxSide &&
    px >= L.minPixels && px <= L.maxPixels;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { JEV_IMAGE, fitForJev, jevAccepts };
}
