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


// The shape check the probe and the spike run on a first live response.
{
  const { checkShape } = require('./src-weigh');
  const good = checkShape(cases[0].answers, taxonomy);
  const bent = JSON.parse(JSON.stringify(cases[0].answers));
  delete bent.component.probabilities;
  bent.component.confidence = '0.98';
  delete bent.is_dismissible;
  const named = checkShape(bent, taxonomy).join('; ');
  const wantNamed = ['answers.component.probabilities missing', 'answers.component.confidence is not a number', 'probe is_dismissible missing'];
  if (good.length || wantNamed.some((w) => !named.includes(w))) {
    failed++; console.log('FAIL  shape check: live case ' + JSON.stringify(good) + ', bent case ' + named);
  } else console.log('ok    shape check passes a live response and names each field a bent one lacks');
}

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
const { fitForJev, jevAccepts } = require('./src-images');
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
// The Jev request, built by one shared function for the plugin and the spike.
const { buildJevRequest, JEV_IMAGE_HEADER } = require('./src-request');
const { buildQuestions } = require('./src-questions');
{
  const check = (why, wrong) => {
    if (wrong) { failed++; console.log('FAIL  request ' + why + (wrong === true ? '' : '\n        ' + wrong)); }
    else console.log('ok    request ' + why);
  };

  // Pinned to the request the plugin's Jev-only survey sent before the
  // builder existed: the same state keys, in the same order, word for word.
  const figma = (context, padded) => buildJevRequest({
    evidence: { origin: 'figma', crop: { b64: 'CROP', padded }, context, geometry: '48x48 px; aspect ratio 1.00' },
    setup: 'image', taxonomy, subject: 'pictured', model: 'jev-latest', tag: 'x',
  });
  const pinned = (state, assets) => JSON.stringify({
    model: 'jev-latest', state, assets, questions: buildQuestions(taxonomy, 'pictured'),
  });
  {
    const got = figma({ b64: 'SCREEN', scale: 0.26 }, true);
    const want = pinned({
      task: 'A region of a user interface, marked by a designer, to be identified.',
      region: 'fg-region-x',
      geometry: 'From the design file: 48x48 px; aspect ratio 1.00',
      region_note: 'The region is drawn at its true size on a flat white margin; the margin is not part of it.',
      screen: 'fg-screen-x',
      screen_note: 'The whole screen the region sits on, for context only. Shown at 26% of its size.',
    }, {
      'fg-region-x': { type: 'image', format: 'png', data_base64: 'CROP' },
      'fg-screen-x': { type: 'image', format: 'png', data_base64: 'SCREEN' },
    });
    check('figma + image, padded crop on a shrunk screen, as the plugin sent it',
      JSON.stringify(got.body) !== want ? 'got ' + JSON.stringify(got.body.state) : got.imageHeader !== true && 'no image header');
  }
  {
    const got = figma(null, false);
    const want = pinned({
      task: 'A region of a user interface, marked by a designer, to be identified.',
      region: 'fg-region-x',
      geometry: 'From the design file: 48x48 px; aspect ratio 1.00',
      screen_note: 'No surrounding screen was found; judge from the region alone.',
    }, { 'fg-region-x': { type: 'image', format: 'png', data_base64: 'CROP' } });
    check('figma + image, no screen, as the plugin sent it', JSON.stringify(got.body) !== want && 'got ' + JSON.stringify(got.body.state));
  }
  check('image header name', JEV_IMAGE_HEADER !== 'TypeSafe-Danger-Zone-Images' && JEV_IMAGE_HEADER);

  // A web candidate with its labelling-only names planted everywhere they could
  // ride along: on the facts object, beside it, and on the evidence itself.
  const planted = ['cds--btn--primary', 'hero-cta-7f3a', 'data-track-signup-q4'];
  const dom = {
    tag: 'a', role: 'link', name: 'Get started', text: 'Get started', href: '/start',
    aria: { expanded: 'false' },
    style: { width: '160px', height: '48px', borderRadius: '0px', backgroundColor: 'rgb(15, 98, 254)',
      border: '0px none rgb(255, 255, 255)', position: 'static', zIndex: 'auto', cursor: 'pointer' },
    parent: { tag: 'div', role: 'generic' }, children: {},
    classes: [planted[0]], id: planted[1], data: { track: planted[2] },
    labelling: { classes: [planted[0]], id: planted[1], data: { 'data-track': planted[2] } },
  };
  const web = (setup) => buildJevRequest({
    evidence: {
      origin: 'web', crop: { b64: 'CROP', padded: true },
      context: { b64: 'WINDOW', scale: 1, outline: { colour: 'magenta', width: 3 } },
      geometry: '160x48 px; aspect ratio 3.33; spans 11% of the screen width; positioned top left of the screen',
      dom, labelling: dom.labelling,
    },
    setup, taxonomy, subject: 'given', model: 'jev-latest', tag: 'y',
  });
  const A = web('image'), B = web('dom'), C = web('image+dom');
  const says = (r, text) => JSON.stringify(r.body).includes(text);

  check('dom carries no assets and no header flag', ('assets' in B.body || B.imageHeader !== false) && JSON.stringify(B.body.state));
  check('dom does not point at a picture', (says(B, 'fg-region') || says(B, 'fg-screen')) && 'an image reference survived');
  check('image carries no DOM facts', (A.body.state.dom !== undefined || says(A, 'Get started') || says(A, '/start')) && JSON.stringify(A.body.state));
  check('image+dom carries both', (!C.body.assets || !C.body.assets['fg-region-y'] || !C.body.assets['fg-screen-y'] ||
    !C.imageHeader || !/href: present, "\/start"/.test(C.body.state.dom)) && JSON.stringify(C.body.state));
  check('dom and image+dom carry the same facts', B.body.state.dom !== C.body.state.dom && 'they differ');
  {
    const q = [A, B, C].map((r) => JSON.stringify(r.body.questions));
    check('questions byte-identical across the three setups', (q[0] !== q[1] || q[1] !== q[2]) && 'they differ');
  }
  {
    const leaks = [];
    for (const [name, r] of [['image', A], ['dom', B], ['image+dom', C]]) {
      for (const value of planted) if (says(r, value)) leaks.push(name + ' carries ' + value);
    }
    check('class names, id and data-* reach no request', leaks.join('; '));
  }
  {
    const claims = [['image', A], ['dom', B], ['image+dom', C]]
      .filter(([, r]) => /design file|designer/i.test(JSON.stringify(r.body))).map(([name]) => name);
    check('web never claims a design file or a designer', claims.length && 'claimed in ' + claims.join(', '));
  }
  {
    const refused = [];
    const tryIt = (why, args) => { try { buildJevRequest(args); refused.push(why + ' was accepted'); } catch (e) { /* expected */ } };
    tryIt('figma + dom', { evidence: { origin: 'figma', geometry: 'g', dom }, setup: 'dom', taxonomy, model: 'm' });
    tryIt('image without a crop', { evidence: { origin: 'web', geometry: 'g', dom }, setup: 'image+dom', taxonomy, model: 'm', tag: 't' });
    tryIt('web window without its outline', { evidence: { origin: 'web', geometry: 'g', crop: { b64: 'C' }, context: { b64: 'W', scale: 1 } },
      setup: 'image', taxonomy, model: 'm', tag: 't' });
    tryIt('an unknown setup', { evidence: { origin: 'web', geometry: 'g', dom }, setup: 'both', taxonomy, model: 'm' });
    check('refuses evidence a setup cannot truthfully send', refused.join('; '));
  }
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
