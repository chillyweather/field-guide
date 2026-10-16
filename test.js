// Runs the decision logic against the offline fixtures. No network, no key, no Figma.
// `node test.js`

const fs = require("fs");
const path = require("path");
const { weigh } = require("./src-weigh");
const { maskVocabulary } = require("./src-vocabulary");

const taxonomy = JSON.parse(fs.readFileSync(path.join(__dirname, "taxonomy", "components.json"), "utf8"));
const { cases } = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "offline.json"), "utf8"));

const expected = [
  // Captured live on 22 September 2026, plus one synthetic. Order follows
  // fixtures/offline.json, which follows the order of the capture.

  // A row of pills that could filter or could switch a view. Jev is sure it is
  // Tabs; the behaviour question says 'selection', which is what a filter row is.
  // The disagreement is the point, and it is what holds this back from acting alone.
  { answer: 'Tabs', verdict: 'check', contested: false, familyAgrees: false },
  { answer: 'Badge', verdict: 'confident', contested: false, familyAgrees: true },
  // This one answered 'action' on an earlier capture and agreed on this one, from
  // the identical description. Jev is not deterministic, and the fixture records
  // one run rather than a guarantee.
  { answer: 'Chip', verdict: 'confident', contested: false, familyAgrees: true },
  { answer: 'Link', verdict: 'confident', contested: false, familyAgrees: true },
  // The one case that reliably spreads: 0.69 against 0.30.
  { answer: 'Card', verdict: 'check', contested: true, familyAgrees: true },
  { answer: 'Tabs', verdict: 'confident', contested: false, familyAgrees: true },
  { answer: 'Toggle', verdict: 'confident', contested: false, familyAgrees: true },
  // Synthetic. No live probe has fallen below the 0.5 confidence threshold.
  // Not contested: the runner-up is a real component but the winner is 'Other',
  // which makes this a recognition failure rather than a collision in the guide.
  { answer: 'Other', verdict: 'unsure', contested: false, familyAgrees: true },
];

let failed = 0;

cases.forEach((c, i) => {
  const got = weigh(c.answers, taxonomy);
  const want = expected[i];
  const bad = Object.keys(want).filter((k) => got[k] !== want[k]);

  if (bad.length) {
    failed++;
    console.log("FAIL  " + c.note);
    for (const k of bad) console.log("        " + k + ": expected " + want[k] + ", got " + got[k]);
  } else {
    console.log("ok    " + got.answer.padEnd(14) + got.verdict.padEnd(11) + "conf " + got.confidence.toFixed(3) +
      (got.contested ? "  contested: " + got.runners.slice(0, 2).map((r) => r[0]).join(" / ") : "") +
      (got.familyAgrees ? "" : "  family says " + got.family));
  }
});

// The probe list must stay in step with the guide, or the UI silently renders blanks.
const probes = weigh(cases[0].answers, taxonomy).probes;
const missing = Object.keys(taxonomy.probes).filter((k) => probes[k] === null || probes[k] === undefined);
if (missing.length) { failed++; console.log("FAIL  probes absent from fixtures: " + missing.join(", ")); }
else console.log("ok    all " + Object.keys(taxonomy.probes).length + " probes carried through");


// A component's required probes. Synthetic: the shape of the corner panel that
// came back Modal Dialog at 0.92 on an undimmed page, then the same answer with
// the overlay probe passing. Only the probe differs between the two.
const modal = (overlay) => ({
  component: { type: 'choice', choice: 'Modal Dialog', confidence: 0.92,
    probabilities: { 'Modal Dialog': 0.93, Other: 0.04, Card: 0.03 } },
  family: { type: 'choice', choice: 'container', confidence: 0.9, probabilities: {} },
  is_overlaid_above_content: { type: 'noul', noul: overlay },
});
const required = [
  { overlay: 0.12, verdict: 'check', unmet: 'is_overlaid_above_content' },
  { overlay: 0.81, verdict: 'confident', unmet: '' },
];
for (const r of required) {
  const got = weigh(modal(r.overlay), taxonomy);
  if (got.verdict !== r.verdict || got.unmet.join() !== r.unmet) {
    failed++;
    console.log('FAIL  requires, overlay ' + r.overlay + ': got ' + got.verdict + ' [' + got.unmet.join() + ']');
  } else {
    console.log('ok    requires overlay ' + String(r.overlay).padEnd(22) + got.verdict);
  }
}
// And an absent probe holds nothing back — an older response, or a guide whose
// probe list changed, must not quietly demote every modal.
{
  const answers = modal(0);
  delete answers.is_overlaid_above_content;
  const got = weigh(answers, taxonomy);
  if (got.verdict !== 'confident') { failed++; console.log('FAIL  requires: missing probe held the answer back'); }
  else console.log('ok    requires, probe absent          confident');
}

// The masking rule, which production applies to every description before the
// guide sees it. gpt-4o-mini leaked on 1 of 3 identical calls, so this is not
// belt and braces.
const masking = [
  { in: 'a small circular area that appears to be in a toggle position', leaked: ['toggle'] },
  { in: 'A radio button sits beside the label', leaked: ['radio button'], notIn: 'button' },
  // Masked whole. "an icon [element]" still says most of it.
  { in: 'a small icon button with a gear glyph', leaked: ['icon button'], notIn: 'icon' },
  { in: 'An oval shape with a light gray fill and a darker border', leaked: [] },
  { in: 'a search field beside a select dropdown', leaked: ['search field', 'dropdown', 'select'] },
  { in: 'Cards are stacked above the modal', leaked: ['card', 'modal'] },
  // Cost one live run to find: the noun was masked, the participle was not, and
  // the description carried the answer through anyway.
  { in: 'a thumb suggesting a toggled position', leaked: ['toggled'] },
  // Deliberately untouched. These describe visible state, which is the evidence
  // the guide asked for, not a component name.
  { in: 'in a selected state with a check mark visible', leaked: [] },
];

for (const m of masking) {
  const got = maskVocabulary(m.in);
  const sameWords = got.leaked.slice().sort().join('|') === m.leaked.slice().sort().join('|');
  const strayWord = m.notIn && new RegExp('\\b' + m.notIn + '\\b', 'i').test(got.text);
  if (!sameWords || strayWord) {
    failed++;
    console.log('FAIL  masking: ' + m.in);
    if (!sameWords) console.log('        expected [' + m.leaked.join(', ') + '], got [' + got.leaked.join(', ') + ']');
    if (strayWord) console.log('        left a stray "' + m.notIn + '" behind: ' + got.text);
  } else {
    console.log('ok    mask ' + (m.leaked.length ? '[' + m.leaked.join(', ') + ']' : 'clean').padEnd(38) + got.text.slice(0, 44));
  }
}

// The request shapes, which decide whether a model in the comparison is run
// fairly or written off as broken. The refusals are shaped like OpenAI's 400s;
// the last two are the forms a less tidy host sends.
const { firstShape, shapeFields, nextShape } = require('./src-vision');
const refuse = (param, code, message) => JSON.stringify({ error: { param, code, message, type: 'invalid_request_error' } });
const shapes = [
  { why: 'a newer model has no "none" level', from: { cap: 'max_completion_tokens', effort: 'none' },
    error: refuse('reasoning_effort', 'unsupported_value', "Unsupported value: 'reasoning_effort' does not support 'none' with this model. Supported values are: 'minimal', 'low', 'medium', and 'high'."),
    want: { cap: 'max_completion_tokens', effort: 'minimal' } },
  { why: 'a flagship that starts at "low"', from: { cap: 'max_completion_tokens', effort: 'minimal' },
    error: refuse('reasoning_effort', 'unsupported_value', "Unsupported value: 'reasoning_effort' does not support 'minimal' with this model."),
    want: { cap: 'max_completion_tokens', effort: 'low' } },
  { why: 'no level left to try', from: { cap: 'max_completion_tokens', effort: 'low' },
    error: refuse('reasoning_effort', 'unsupported_value', "Unsupported value: 'reasoning_effort' does not support 'low' with this model."),
    want: null },
  { why: 'gpt-4o does not reason at all', from: { cap: 'max_completion_tokens', effort: 'none' },
    error: refuse('reasoning_effort', 'unsupported_parameter', "Unsupported parameter: 'reasoning_effort' is not supported with this model."),
    want: { cap: 'max_completion_tokens', effort: null } },
  { why: 'a reasoning model refuses max_tokens', from: { cap: 'max_tokens', effort: 'low' },
    error: refuse('max_tokens', 'unsupported_parameter', "Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead."),
    want: { cap: 'max_completion_tokens', effort: 'low' } },
  { why: 'the same message, but max_completion_tokens was sent', from: { cap: 'max_completion_tokens', effort: null },
    error: refuse('max_tokens', 'unsupported_parameter', "Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead."),
    want: null },
  { why: 'a host without JSON errors', from: { cap: 'max_completion_tokens', effort: 'none' },
    error: 'Unrecognized request argument supplied: reasoning_effort',
    want: { cap: 'max_completion_tokens', effort: null } },
  { why: 'a refusal about the image, not the shape', from: { cap: 'max_completion_tokens', effort: 'none' },
    error: refuse('messages', 'invalid_image_format', 'You uploaded an unsupported image.'),
    want: null },
];
for (const c of shapes) {
  const got = nextShape(c.from, c.error);
  if (JSON.stringify(got) !== JSON.stringify(c.want)) {
    failed++;
    console.log('FAIL  shape: ' + c.why + '\n        expected ' + JSON.stringify(c.want) + ', got ' + JSON.stringify(got));
  } else {
    console.log('ok    shape ' + (got ? (got.effort || 'no reasoning') + ' / ' + got.cap : 'give up').padEnd(40) + c.why);
  }
}
{
  const fields = shapeFields({ cap: 'max_tokens', effort: null });
  const first = shapeFields(firstShape());
  if ('reasoning_effort' in fields || first.reasoning_effort !== 'none' || !first.max_completion_tokens) {
    failed++; console.log('FAIL  shape fields: ' + JSON.stringify(fields) + ' / ' + JSON.stringify(first));
  } else console.log('ok    shape fields omit reasoning_effort when a model has none');
}

// Jev refuses an image outside its limits and fails the whole request, so
// every size a Figma export can come out at has to land inside them.
const { fitForJev, jevAccepts, buildImageState } = require('./src-images');
const sizes = [
  { why: '2x icon button, padded not enlarged', w: 48, h: 48, padded: true, scale: 1 },
  { why: 'wide thin divider', w: 1200, h: 4, padded: true, scale: 1 },
  { why: 'documented minimum, refused in practice', w: 256, h: 256, padded: true, scale: 1 },
  { why: 'measured minimum', w: 280, h: 280, padded: false, scale: 1 },
  { why: 'card that already fits', w: 640, h: 480, padded: false, scale: 1 },
  { why: 'long scrolling screen, shrunk to 26%', w: 1440, h: 6000, padded: false },
  { why: 'desktop screen over the side cap', w: 1920, h: 1080, padded: false },
];
for (const c of sizes) {
  const f = fitForJev(c.w, c.h);
  const wrong = !jevAccepts(f.canvasW, f.canvasH) || f.drawW > f.canvasW || f.drawH > f.canvasH ||
    f.scale > 1 || f.padded !== c.padded || (c.scale !== undefined && f.scale !== c.scale);
  if (wrong) { failed++; console.log('FAIL  fit ' + c.why + ': ' + JSON.stringify(f)); }
  else console.log('ok    fit ' + (c.w + 'x' + c.h + ' -> ' + f.canvasW + 'x' + f.canvasH).padEnd(38) + c.why);
}
{
  const st = buildImageState({ crop: 'fg-region-x', context: null }, '48x48 px', { cropPadded: true, contextScale: 1 });
  if (st.region !== 'fg-region-x' || st.screen || !st.region_note || !/alone/.test(st.screen_note)) {
    failed++; console.log('FAIL  image state: ' + JSON.stringify(st));
  } else console.log('ok    image state references the crop, notes the margin and the missing screen');
}

// The geometry sentence, pinned to what code.js said before it moved into
// src-geometry.js. Each expected line was produced by the old describeGeometry
// on a Figma-shaped node with the same numbers; Jev has read these words on
// every live run, so a change in wording is a change in the experiment.
const { describeGeometry } = require('./src-geometry');
{
  const screen = { x: 0, y: 0, width: 1440, height: 900 };
  const square = { x: 0, y: 0, width: 1000, height: 1000 };
  const geometry = [
    { why: 'no context box', box: { x: 10, y: 10, width: 48, height: 48 }, context: null,
      want: '48x48 px; aspect ratio 1.00' },
    { why: 'full-width header', box: { x: 0, y: 0, width: 1440, height: 64 }, context: screen,
      want: '1440x64 px; aspect ratio 22.50; spans 100% of the screen width; positioned top left of the screen' },
    { why: 'screen not at the origin', box: { x: 1660, y: 560, width: 320, height: 180 },
      context: { x: 1000, y: 200, width: 1440, height: 1024 },
      want: '320x180 px; aspect ratio 1.78; spans 22% of the screen width; positioned middle centre of the screen' },
    { why: 'fractional size, rounded', box: { x: 1300, y: 860, width: 36.4, height: 35.6 }, context: screen,
      want: '36x36 px; aspect ratio 1.00; spans 3% of the screen width; positioned bottom right of the screen' },
    { why: 'band edge 0.33', box: { x: 330, y: 330, width: 100, height: 40 }, context: square,
      want: '100x40 px; aspect ratio 2.50; spans 10% of the screen width; positioned middle centre of the screen' },
    { why: 'just under 0.33', box: { x: 329, y: 329, width: 100, height: 40 }, context: square,
      want: '100x40 px; aspect ratio 2.50; spans 10% of the screen width; positioned top left of the screen' },
    { why: 'band edge 0.66', box: { x: 660, y: 660, width: 100, height: 40 }, context: square,
      want: '100x40 px; aspect ratio 2.50; spans 10% of the screen width; positioned bottom right of the screen' },
    { why: 'zero height', box: { x: 120, y: 450, width: 1200, height: 0 }, context: screen,
      want: '1200x0 px; aspect ratio 1200.00; spans 83% of the screen width; positioned middle left of the screen' },
    { why: 'rotated: size from the node, share from the box', box: { x: 0, y: 0, width: 80, height: 80 },
      size: { width: 100, height: 20 }, context: { x: 0, y: 0, width: 400, height: 400 },
      want: '100x20 px; aspect ratio 5.00; spans 20% of the screen width; positioned top left of the screen' },
    { why: 'no box at all, size only', box: null, size: { width: 48, height: 24 }, context: screen,
      want: '48x24 px; aspect ratio 2.00' },
  ];
  for (const g of geometry) {
    const got = describeGeometry(g.box, g.context, g.size);
    if (got !== g.want) { failed++; console.log('FAIL  geometry ' + g.why + '\n        expected ' + g.want + '\n        got      ' + got); }
    else console.log('ok    geometry ' + g.why);
  }
}

console.log(failed ? '\n' + failed + ' failing' : '\nall passing');
process.exit(failed ? 1 : 0);
