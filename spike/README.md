# The DOM spike

Does the DOM help Jev identify what the picture can't? (#1, specced in #2.)

The spike captures web pages, turns hand-labelled candidates into the evidence
the plugin already sends, and asks Jev three ways:

| setup | Jev gets |
|---|---|
| A `image` | the fitted crop, the outlined context window, the geometry line |
| B `dom` | the DOM facts and the geometry line, no images |
| C `image+dom` | all of it |

It measures the plugin's own code. The request comes from `src-request.js`,
the geometry from `src-geometry.js`, the fitting from `src-images.js`, the
questions from `src-questions.js`, the weighing from `src-weigh.js`, and the
guide from `taxonomy/components.json`. All of them are loaded by relative path,
and none is copied.

Playwright and `sharp` live here, in their own `package.json`. The repository
root and the plugin build stay dependency-free.

## Setup

```
cd spike
npm install          # also installs Playwright's Chromium
npm test             # offline: capture of test/page.html, evidence, requests
```

The key is read from the repository's `.env.local` (`TYPESAFE_API_KEY=`), as
`probe.js` reads it. The key is never printed.

## Running it

```
node capture.js <url-or-path>...       # captures/<slug>.json + .png, several pages per run
node run.js --dry-run                  # what is missing, and what it should cost
node run.js                            # fixtures/candidates.json → fixtures/responses.json
node report.js --out report.md         # the full report, as Markdown
```

The runner sends every candidate through each setup twice, four calls at a
time from one queue. Before any call it counts the calls still missing and
estimates their cost. The estimate uses the input tokens this fixture has
already measured per setup, or the ~7,200 tokens a region cost in #1, priced
at `JEV_PRICE_IN` from `src-request.js`. The runner refuses to start above
`--budget` (default $1.00). It also refuses when a capture or screenshot is
missing, or when the capture on disk isn't the one a candidate's saved
answers came from.

Each setup's calls go one at a time until the first response arrives, and
that response is checked against the fields `weigh()` reads. A difference
stops the run after at most one call per setup, and the message names the
fields. A refused key or an empty balance also stops the run. Each result is
written the moment it arrives, keyed by `(candidate, setup, run)`. It holds
the raw body, the `weigh()` output, ms, input tokens, timestamp, model, guide
version and hash, the capture it came from, and the request with every
image replaced by its file name and sha256. A failed call is saved with the
API's reason. A rerun skips what is done and retries only what is missing or
failed, so failures count as missing, never as wrong.

`--candidates` and `--responses` point the runner and the report at another
pair of fixtures. `fixtures/test-page/` holds one candidate on the local test
page, run end to end:

```
node capture.js test/page.html
node run.js    --candidates fixtures/test-page/candidates.json --responses fixtures/test-page/responses.json
node report.js --candidates fixtures/test-page/candidates.json --responses fixtures/test-page/responses.json
```

## Choosing and labelling candidates

```
node select.js                                  # out/proposals.json: one proposal per visual group
node candidates.js pick 3 7 12 --pair "Button / Link"
node candidates.js add <page-url> <element-id> --note "missed by selection"
node sheet.js                                   # out/sheet.html: open it in a browser
```

`select.js` groups the elements of every captured page by a coarse visual
signature (tag, role, size rounded to 8 px, corner radius, background,
border) and proposes one representative per group, biggest group first.
`candidates.js` adds candidates to `fixtures/candidates.json`, either from
the proposals or by element id. The sheet shows each candidate's fitted crop,
its outlined context window, the geometry and DOM facts exactly as Jev gets
them, and the class-name hint. It is read-only.

Each candidate holds `page`, `element`, `pair` (the hard pair it tests, if
any), `hint`, `label`, an optional `looks_like`, and `note`. Labels are typed
into the fixture by a person. No tool writes `label` or `looks_like`, and a
label that isn't a guide entry is refused when the fixture loads.

**The labelling rule.** `label` is the guide entry for the design-system
component the element is: the component a designer would place for it in
Figma, whatever tag renders it. The class-name hint often names it. A
design-system Button rendered as `<a href>` (Primer's "Sign in") is
`label: Button`, and a design-system Link rendered as `<button>` is
`label: Link`. The report puts those tag mismatches in their own group
(answer 6), so the Button / Link breakout measures whether the DOM misleads
Jev there. When the picture alone would earn a different entry, that entry
goes in `looks_like`. Leave `label` out if you can't decide: an unlabelled
candidate counts towards stability, never towards accuracy.

The plugin works on Figma frames, where there is no tag or `href`, so the
component is the answer it has to give. An earlier version of this rule
labelled by what activating the element does (`<a href>` styled as a button
was `label: Link`, `looks_like: Button`); it was changed before any real
candidate was labelled.

## What capture records

Capture uses Chromium at 1440 × 900 and device pixel ratio 1. It waits for fonts,
scrolls to the bottom and back to trigger lazy loading, waits for the network
to go quiet, and freezes animations. It then takes the full-page screenshot at
scroll position 0 and records every visible element.

- **Visible** means all of these: a box of at least 1 px each way, not
  `display: none`, not `visibility: hidden`, opacity above zero once every
  ancestor's opacity is applied, and some part inside the page. `aria-hidden`
  elements are visible, so they are kept, and their `aria-hidden` is recorded.
- **Role and accessible name** come from Chromium's accessibility tree (over
  CDP), not from a reimplementation. `aria-checked`, `aria-pressed`,
  `aria-expanded` and `aria-hidden` are recorded where the page declares them.
- **Parent** is the nearest recorded ancestor in the rendered tree. A slotted
  element hangs off its slot's host, and skipped wrappers
  (`display: contents`, zero-size) don't break the chain.
- **Shadow DOM**: open roots are walked and their elements marked
  `shadow: true`. A closed root can't be walked. Its host is marked
  `closedShadowRoot: true` and the page counts them.

## The report

`report.js` re-weighs every saved body with the plugin's own `weigh()` and
answers the six questions from #1. A failed call is missing, never wrong.
Accuracy and confident precision count labelled candidates only. The other
answers count every candidate.

1. **Accuracy** per setup, per run and pooled. It's also given without the
   semantic-mismatch group, and split by whether the ARIA role names a guide
   entry outright (`checkbox`, `switch`, `tab`, `dialog`, `link`, `button`).
2. **Confident precision** per setup, with its count. When nothing was
   `confident` the report says "none confident", never 0 %.
3. **Movement**: a 3 × 3 table of verdicts from A to C, one per run.
4. **Changed answers**: every candidate whose A and C answers differ in
   either run, with both verdicts, the top three probabilities and the DOM
   facts sent.
5. **Stability**: per setup, the share of candidates with the same answer in
   both runs, and the share with the same verdict.
6. **Semantic mismatches**: candidates with a `looks_like`, plus any whose tag
   or role implies a different family from the label's. `a[href]` implies
   navigation, `button` and button-type inputs imply action, the
   `checkbox`/`switch`/`radio` roles imply selection, and `dialog` implies
   container. `Other` is exempt.

It also covers the Button / Link breakout, cost and wall-clock time, and the
capture each page's answers came from. The three decision rules are measured
against Jev's own run-to-run noise from answer 5:

- **Continue** holds when C is right in both runs on more than half the
  labelled Button / Link candidates, *and* the share of clear cases that C
  makes worse is no more than A's run-to-run disagreement. A clear case is one
  A got right and `confident` in both runs. Worse means a wrong answer or a
  verdict below `confident` in either run of C. A's disagreement is the share
  of candidates whose two A runs differ in answer or verdict.
- **Rethink the inputs** holds when B's pooled accuracy and confident
  precision are each within C's run-to-run answer disagreement of C's.
- **Look at the guide** holds when A and C differ on no more candidates than
  A differs from itself, both counted over candidates with all four calls.

The report names the rule that holds, or says that none or several do. It
ends with a conclusion to be written by hand.

## What is committed

Element records (`captures/*.json`), candidates, labels, and raw responses are
committed, so the report can be recomputed without recapturing. Screenshots,
crops and context windows (`*.png`, `out/`) are not. They are regenerable, and
for a public site they are pictures of someone else's pages.

Class names, `id` and `data-*` are kept in each record's `labelling` block, as
a hint for the labeller. Nothing that builds a request reads that block.
