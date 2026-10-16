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
node report.js                         # accuracy per setup
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

**The labelling rule.** `label` is the guide entry that the guide's own
definitions give when everything about the element is known, including what
activating it does. When the picture alone would earn a different entry,
that entry goes in `looks_like`. An `<a href>` styled as a filled button is
`label: Link`, `looks_like: Button`. Leave `label` out if you can't decide:
an unlabelled candidate counts towards stability, never towards accuracy.

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

## What is committed

Element records (`captures/*.json`), candidates, labels, and raw responses are
committed, so the report can be recomputed without recapturing. Screenshots,
crops and context windows (`*.png`, `out/`) are not. They are regenerable, and
for a public site they are pictures of someone else's pages.

Class names, `id` and `data-*` are kept in each record's `labelling` block, as
a hint for the labeller. Nothing that builds a request reads that block.
