// The geometry sentence Jev reads, built from plain boxes.
//
// Size, proportion and position are free and genuinely discriminating: a
// full-width 64px band at the top of the frame is a Header and not a Card, and
// no crop of it says so.
//
// Kept out of the Figma thread so that anything with a box can say the same
// sentence: the plugin, measuring a node against the screen it sits on, and the
// DOM spike, measuring an element against the viewport its window shows. The
// wording is pinned in test.js; a change here changes what Jev reads everywhere.

/**
 * `box` and `context` are { x, y, width, height } in one coordinate space.
 * `context` may be null, and then only the size is said.
 *
 * `size` is the region's own width and height when it differs from its box. In
 * Figma a rotated node's bounding box is not its size, and the sentence has
 * always given the size from the node and the share and position from the box.
 */
function describeGeometry(box, context, size) {
  const own = size || box;
  const w = Math.round(own.width);
  const h = Math.round(own.height);
  const parts = [`${w}x${h} px`, `aspect ratio ${(w / Math.max(h, 1)).toFixed(2)}`];

  if (context && box) {
    const widthShare = box.width / context.width;
    const relX = (box.x - context.x) / context.width;
    const relY = (box.y - context.y) / context.height;
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

if (typeof module !== "undefined" && module.exports) {
  module.exports = { describeGeometry };
}
