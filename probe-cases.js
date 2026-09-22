// The regions the probe describes, kept in one place because two things read
// them: probe.js, which sends them, and fixtures/make-fixtures.js, which pairs
// each one with the response it actually produced.
//
// A control, then four written to sit on the fence — worded so the deciding
// evidence is genuinely absent rather than merely unmentioned.

module.exports = {
  "control-badge": {
    description:
      "A small pill-shaped element with a pale green fill and no border, about 60 by 22 pixels. " +
      "Dark green text inside reads 'Active'. No icon and no visible dismiss affordance.",
    geometry: "60x22 px; aspect ratio 2.73; spans 4% of the screen width; positioned top right of the screen",
  },
  "chip-or-badge": {
    description:
      "A small pill-shaped element with a pale grey fill and a thin border, about 84 by 24 pixels. " +
      "Dark text inside reads 'Marketing' and a small x glyph sits at its right edge. " +
      "Nothing indicates whether the x responds to a click.",
    geometry: "84x24 px; aspect ratio 3.50; spans 6% of the screen width; positioned middle left of the screen",
  },
  "button-or-link": {
    description:
      "A short run of blue text reading 'Learn more', with no background fill, no border and no rounded " +
      "container behind it. It is not underlined. It sits on its own line below a paragraph of body text.",
    geometry: "78x18 px; aspect ratio 4.33; spans 6% of the screen width; positioned middle left of the screen",
  },
  "card-or-modal": {
    description:
      "A white rectangle with rounded corners and a soft drop shadow, containing a bold heading, two lines " +
      "of body text, and two small rectangles side by side at its lower right. The context image is cropped " +
      "so that nothing outside this rectangle is visible.",
    geometry: "480x260 px; aspect ratio 1.85; spans 38% of the screen width; positioned middle centre of the screen",
  },
  "clear-tabs": {
    description:
      "A horizontal row of three short text labels reading 'Overview', 'Activity' and 'Settings', " +
      "evenly spaced on one baseline with no fills or borders behind them. A two-pixel dark underline " +
      "sits beneath the first label only, and a thin hairline runs the full width below all three.",
    geometry: "360x44 px; aspect ratio 8.18; spans 28% of the screen width; positioned top left of the screen",
  },
  "tabs-or-chips": {
    description:
      "A horizontal row of four rounded pill shapes, each about 90 by 32 pixels, reading 'All', " +
      "'Unread', 'Flagged' and 'Archived'. The first has a dark fill with light text; the other three " +
      "have a pale fill with dark text and a thin border. Nothing below the row is visible in the crop.",
    geometry: "396x32 px; aspect ratio 12.38; spans 31% of the screen width; positioned top left of the screen",
  },
  "clear-sidebar": {
    description:
      "A tall narrow panel running the full height of the frame against its left edge, on a very " +
      "slightly tinted background with a hairline border on its right side. Inside, thirteen short " +
      "text labels are stacked vertically and evenly spaced, reading 'General', 'API keys', 'People', " +
      "'Billing' and so on. One of them sits on a pale grey rounded fill; the rest have no fill.",
    geometry: "260x1040 px; aspect ratio 0.25; spans 20% of the screen width; positioned middle left of the screen",
  },
  "sidebar-or-card": {
    description:
      "A vertical panel with a thin border and a white fill, taller than it is wide, containing five " +
      "short text labels stacked one above the other with even spacing. One label is bolder than the " +
      "others. Nothing outside the panel is visible in the crop.",
    geometry: "300x420 px; aspect ratio 0.71; spans 23% of the screen width; positioned middle centre of the screen",
  },
  "checkbox-or-toggle": {
    description:
      "A small control about 40 by 22 pixels with a fully rounded outline, filled pale grey, with a white " +
      "circle sitting against its left inside edge. Text to its right reads 'Notifications'.",
    geometry: "40x22 px; aspect ratio 1.82; spans 3% of the screen width; positioned middle left of the screen",
  },
};
