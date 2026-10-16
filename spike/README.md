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
node capture.js <url-or-path>...       # captures/<slug>.json + .png
node run.js                            # fixtures/candidates.json → fixtures/responses.json
node report.js                         # accuracy per setup
```

`--candidates` and `--responses` point the runner and the report at another
pair of fixtures. `fixtures/test-page/` holds one candidate on the local test
page, run end to end:

```
node capture.js test/page.html
node run.js    --candidates fixtures/test-page/candidates.json --responses fixtures/test-page/responses.json
node report.js --candidates fixtures/test-page/candidates.json --responses fixtures/test-page/responses.json
```

## What is committed

Element records (`captures/*.json`), candidates, labels, and raw responses are
committed, so the report can be recomputed without recapturing. Screenshots,
crops and context windows (`*.png`, `out/`) are not. They are regenerable, and
for a public site they are pictures of someone else's pages.

Class names, `id` and `data-*` are kept in each record's `labelling` block, as
a hint for the labeller. Nothing that builds a request reads that block.
