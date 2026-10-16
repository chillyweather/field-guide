// The spike's own checks. Playwright against the static page in test/, no
// network, no key. `npm test` in spike/.

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const sharp = require("sharp");
const { SPIKE, ROOT, SETUPS, slug } = require("./common");
const { capture } = require("./capture");
const { buildEvidence, contextWindow, cropRect } = require("./evidence");
const { requestFor, savedRequest } = require("./jev");
const { domFor } = require("./evidence");
const { domFacts } = require("../src-request");
const crypto = require("crypto");
const { groupElements } = require("./select");
const { addCandidate, loadCandidates, LABELLING_RULE } = require("./candidates");
const { accuracy } = require("./report");

let failed = 0;
function check(name, problem) {
  if (problem) { failed++; console.log("FAIL  " + name + (problem === true ? "" : "\n        " + problem)); }
  else console.log("ok    " + name);
}

const OUT = path.join(SPIKE, "out", "test");
const byText = (record, tag, text) => record.elements.find((e) => e.tag === tag && e.text === text);

(async () => {
  // The plugin side stays as it was: no dependencies at the root, and the
  // build still produces a page with nothing of the spike in it.
  {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
    check("the repository root declares no dependencies", (pkg.dependencies || pkg.devDependencies) && JSON.stringify(pkg));
    execFileSync(process.execPath, [path.join(ROOT, "build.js")], { stdio: "ignore" });
    const ui = fs.readFileSync(path.join(ROOT, "dist", "ui.html"), "utf8");
    check("the plugin build carries nothing of the spike", /playwright|require\("sharp"\)/.test(ui) && "found in dist/ui.html");
  }

  check("pages whose names read the same keep apart",
    slug("https://example.com/components/button") === slug("https://example.com/components-button") && "same slug");

  fs.rmSync(OUT, { recursive: true, force: true });
  const [record] = await capture(["test/page.html"], OUT);
  const screenshot = path.join(OUT, record.screenshot);

  check("capture writes a screenshot and an element record",
    (!fs.existsSync(screenshot) || !fs.existsSync(path.join(OUT, slug("test/page.html") + ".json")) || !record.elements.length) &&
    "missing output");
  {
    const meta = await sharp(screenshot).metadata();
    check("the screenshot is the full page at device pixel ratio 1",
      (meta.width !== record.page.width || meta.height !== record.page.height) &&
      meta.width + "x" + meta.height + " against a page of " + record.page.width + "x" + record.page.height);
  }

  // An animation that never ends. Frozen at its start for the screenshot and
  // for the walk alike, so the record's box is where the picture shows it.
  {
    const block = record.elements.find((e) => e.style.backgroundColor === "rgb(218, 30, 40)");
    const { data, info } = await sharp(screenshot).raw().toBuffer({ resolveWithObject: true });
    const red = (x, y) => {
      const i = (y * info.width + x) * info.channels;
      return data[i] === 218 && data[i + 1] === 30 && data[i + 2] === 40;
    };
    check("a running animation is recorded and pictured in the same place",
      (!block || block.box.x !== 600 || !red(640, 320) || red(1040, 320)) &&
      JSON.stringify(block && block.box) + " / red at its box: " + red(640, 320));
  }
  check("an element wholly outside the screenshot has no crop",
    cropRect({ x: 1500, y: 10, width: 40, height: 40 }, { width: 1440, height: 1792 }) !== null && "got a crop");

  const cta = byText(record, "a", "Get started");
  const save = byText(record, "button", "Save");
  check("the record holds tag, text, href and box", (!cta || cta.href !== "/start" || cta.box.width !== 160) && JSON.stringify(cta));

  for (const element of [cta, save]) {
    const ev = await buildEvidence({ record, elementId: element.id, screenshot, name: "t-" + element.id, outDir: OUT });
    check("crop of <" + element.tag + "> is its box, " + element.box.width + "x" + element.box.height,
      (ev.crop.width !== element.box.width || ev.crop.height !== element.box.height) && ev.crop.width + "x" + ev.crop.height);
  }

  // The call to action sits on the page's top edge. A window centred on it
  // would run off the top; clamped, it starts at 0 and keeps its full height.
  {
    const ev = await buildEvidence({ record, elementId: cta.id, screenshot, name: "t-top", outDir: OUT });
    const win = ev.context.box;
    const meta = await sharp(path.join(SPIKE, ev.context.file)).metadata();
    check("a candidate on the top edge gets a full-size window, clamped",
      (win.y !== 0 || win.width !== 1440 || win.height !== 900 || meta.width !== 1440 || meta.height !== 900) &&
      JSON.stringify(win) + " written at " + meta.width + "x" + meta.height);
    check("the geometry is measured against that window",
      !/^160x48 px; aspect ratio 3\.33; spans 11% of the screen width; positioned top left/.test(ev.geometry) && ev.geometry);
  }
  {
    const bottom = contextWindow({ x: 600, y: 1780, width: 100, height: 10 }, record.viewport, { width: 1440, height: 1792 });
    check("and one on the bottom edge is clamped the other way", (bottom.y !== 1792 - 900 || bottom.height !== 900) && JSON.stringify(bottom));
  }

  // Fidelity: what the browser rendered and exposes, not what the markup says.
  {
    const find = (text, tag) => record.elements.find((e) => e.text === text && (!tag || e.tag === tag));
    const want = [
      { text: "Get started", tag: "a", role: "link", name: "Get started", href: "/start" },
      { text: "Save", tag: "button", role: "button", name: "Save", href: null },
      { text: "documentation", tag: "a", role: "link", name: "documentation", href: "/docs" },
      { text: "", tag: "input", role: "checkbox", name: "Email me updates", href: null },
      { text: "Dark mode", tag: "div", role: "switch", name: "Dark mode", href: null },
      { text: "Read the guide", tag: "a", role: "link", name: "Read the guide", href: "/type" },
      { text: "Typography", tag: "h3", role: "heading", name: "Typography", href: null },
    ];
    const wrong = [];
    for (const w of want) {
      const e = find(w.text, w.tag);
      if (!e) wrong.push("no <" + w.tag + "> " + JSON.stringify(w.text));
      else if (e.role !== w.role || e.name !== w.name || e.href !== w.href) {
        wrong.push("<" + w.tag + "> " + JSON.stringify(w.text) + ": " + JSON.stringify({ role: e.role, name: e.name, href: e.href }));
      }
    }
    check("roles, accessible names and href come from the browser", wrong.join("; "));

    const sw = find("Dark mode", "div");
    check("aria-checked is recorded where present", (!sw || sw.aria.checked !== "true") && JSON.stringify(sw && sw.aria));
    const star = find("★", "span");
    check("aria-hidden elements are kept, and marked", (!star || star.aria.hidden !== "true") && JSON.stringify(star));

    const hidden = ["Hidden by display", "Hidden by visibility", "Hidden by opacity", "Off the page"]
      .filter((t) => record.elements.some((e) => e.text === t || e.name === t));
    check("hidden elements are absent: display, visibility, an opacity-0 ancestor, off the page", hidden.join(", "));

    check("a display: contents wrapper with opacity 0 hides nothing",
      !find("Shown through contents", "button") && "the button is missing");
    check("an open popover inside an opacity-0 wrapper is kept",
      !record.elements.some((e) => e.text === "Popover note") && "the popover is missing");
    check("lazy content appended at the bottom is loaded and swept through",
      !find("Late section seen", "p") && JSON.stringify(record.elements.filter((e) => /^Late|^Waiting/.test(e.text)).map((e) => e.text)));

    const banner = find("Releases ship on Tuesdays", "div");
    check("a fixed banner is recorded where the picture shows it",
      (!banner || banner.style.position !== "fixed" || banner.box.y !== 0 || banner.box.x !== 1040) && JSON.stringify(banner && banner.box));

    // The card's links sit in a display: contents wrapper, which has no box and
    // is not recorded. Their parent is the card itself.
    const byId = new Map(record.elements.map((e) => [e.id, e]));
    const chain = [];
    for (let e = find("Read the guide", "a"); e && e.parent; e = byId.get(e.parent)) chain.push(byId.get(e.parent).tag);
    check("a link in the card climbs article, main, body, html", chain.join(" > ") !== "article > main > body > html" && chain.join(" > "));

    const pill = record.elements.find((e) => e.tag === "status-pill");
    const beta = find("Beta", "span");
    const dismiss = find("Dismiss", "button");
    const slotted = find("Slotted note", "span");
    check("elements in an open shadow root are present and marked",
      (!pill || !beta || !dismiss || !beta.shadow || !dismiss.shadow || beta.role !== "status" ||
        beta.parent !== pill.id || dismiss.parent !== pill.id) && JSON.stringify({ beta, dismiss }));
    check("a slotted light-DOM element is not marked, and hangs off its host",
      (!slotted || slotted.shadow || slotted.parent !== pill.id) && JSON.stringify(slotted));
    const sealed = record.elements.find((e) => e.tag === "sealed-widget");
    check("a closed shadow root is noted", (!sealed || !sealed.closedShadowRoot || record.closedShadowRoots !== 1) &&
      JSON.stringify({ sealed, count: record.closedShadowRoots }));

    const cta = find("Get started", "a");
    const names = record.labelling[cta.id] || {};
    const planted = [...(names.classes || []), names.id, ...Object.values(names.data || {})];
    const facts = domFacts(domFor(record.elements, cta)).join("\n");
    check("the labelling block holds the classes, id and data-*",
      (!(names.classes || []).includes("cds--btn") || names.id !== "hero-signup" || names.data["data-track"] !== "signup-hero") &&
      JSON.stringify(names));
    check("and the DOM facts list holds none of them", planted.filter((v) => facts.includes(v)).join(", "));
    const elementsJson = JSON.stringify(record.elements);
    check("and the elements list holds none of them either", planted.filter((v) => elementsJson.includes(v)).join(", "));
  }
  {
    const again = await capture(["test/page.html"], path.join(OUT, "again"));
    const same = (r) => JSON.stringify({ page: r.page, closed: r.closedShadowRoots, elements: r.elements, labelling: r.labelling });
    check("two captures of the same page give the same element record", same(again[0]) !== same(record) && "they differ");
  }

  // Selection: identical-looking elements collapse into one group, and every
  // element is in exactly one.
  {
    const groups = groupElements([record]);
    const of = (text) => record.elements.find((e) => e.text === text && e.tag === "a").id;
    const home = (id) => groups.filter((g) => g.representative.element === id || g.others.some((o) => o.element === id));
    const a = home(of("Read the guide")), b = home(of("See the tokens"));
    check("identical-looking links collapse into one group",
      (a.length !== 1 || b.length !== 1 || a[0] !== b[0] || a[0].count < 2) && JSON.stringify(a.map((g) => g.signature)));
    const total = groups.reduce((n, g) => n + g.count, 0);
    const sigs = new Set(groups.map((g) => JSON.stringify(g.signature)));
    check("one proposal per visual group, covering every element",
      (total !== record.elements.length || sigs.size !== groups.length) && total + " of " + record.elements.length);
    check("the save button and the shadow dismiss button look different and stay apart",
      home(record.elements.find((e) => e.text === "Save").id)[0] === home(record.elements.find((e) => e.text === "Dismiss").id)[0] && "one group");
  }

  // The candidate fixture: tools add, people label.
  {
    const ctaHint = record.labelling[cta.id].classes.join(" ");
    const labelled = { page: "test/page.html", element: cta.id, pair: "Button / Link", hint: ctaHint, label: "Link", looks_like: "Button", note: "typed by a person" };
    const start = { rule: LABELLING_RULE, candidates: [labelled] };
    const save = record.elements.find((e) => e.text === "Save");
    const next = addCandidate(start, record, save.id, { pair: "Button / Link", label: "Button", looks_like: "Link" });
    const added = next.candidates[1];
    check("adding a candidate keeps every existing entry exactly, labels included",
      JSON.stringify(next.candidates[0]) !== JSON.stringify(labelled) && JSON.stringify(next.candidates[0]));
    check("a new candidate never has label or looks_like, whatever is passed",
      ("label" in added || "looks_like" in added || added.element !== save.id) && JSON.stringify(added));
    let refused = 0;
    try { addCandidate(next, record, save.id); } catch (e) { refused++; }
    try { addCandidate(next, record, "e9999"); } catch (e) { refused++; }
    check("a duplicate or an unknown element id is refused", refused !== 2 && refused + " of 2 refused");

    // The command-line tool on a file, with an element no proposal offered.
    const file = path.join(OUT, "candidates.json");
    fs.writeFileSync(file, JSON.stringify(start, null, 2));
    const pill = record.elements.find((e) => e.tag === "status-pill");
    execFileSync(process.execPath, ["candidates.js", "add", "test/page.html", pill.id, "--label", "Badge",
      "--candidates", file, "--captures", OUT], { cwd: SPIKE, stdio: "ignore" });
    const written = JSON.parse(fs.readFileSync(file, "utf8"));
    check("the add command appends by id and writes no label",
      (written.candidates.length !== 2 || JSON.stringify(written.candidates[0]) !== JSON.stringify(labelled) ||
        written.candidates[1].element !== pill.id || "label" in written.candidates[1]) && JSON.stringify(written.candidates));

    let rejected = false;
    fs.writeFileSync(path.join(OUT, "bad.json"), JSON.stringify({ candidates: [{ page: "p", element: "e1", label: "Buton" }] }));
    try { loadCandidates(path.join(OUT, "bad.json")); } catch (e) { rejected = /not a guide entry/.test(e.message); }
    check("a label that is not a guide entry is refused on load", !rejected && "accepted");

    // The sheet, from that file: read-only, and showing what Jev gets.
    const before = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
    execFileSync(process.execPath, ["sheet.js", "--candidates", file, "--captures", OUT, "--out", path.join(OUT, "sheet", "sheet.html")],
      { cwd: SPIKE, stdio: "ignore" });
    const after = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
    const html = fs.readFileSync(path.join(OUT, "sheet", "sheet.html"), "utf8");
    const imgs = [...html.matchAll(/<img src="([^"]+)"/g)].map((m) => m[1]);
    const missing = imgs.filter((src) => !fs.existsSync(path.join(OUT, "sheet", src)));
    const ev = await buildEvidence({ record, elementId: cta.id, screenshot, name: "t-sheet", outDir: OUT });
    const domText = requestFor(ev, "dom").body.state.dom;
    const esc = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    check("the sheet shows crop and window for every candidate, from local files",
      (imgs.length !== 4 || missing.length || /https?:/.test(imgs.join())) && JSON.stringify({ imgs, missing }));
    check("the sheet shows the DOM facts exactly as Jev gets them, and the hint",
      (!html.includes(esc(domText)) || !html.includes(esc(ctaHint)) || !html.includes("The labelling rule")) && "missing");
    check("making the sheet leaves the candidate fixture untouched", before !== after && "the file changed");

    // Runner and report take the format, unlabelled candidates included.
    const fixture = loadCandidates(file);
    const entry = (answer) => ({ status: "ok", weighed: { answer } });
    const keyOf = (c, setup) => require("./common").responseKey(c, setup, 1);
    const entries = {
      [keyOf(fixture.candidates[0], "image")]: entry("Link"),
      [keyOf(fixture.candidates[1], "image")]: entry("Badge"),
    };
    const acc = accuracy(fixture.candidates, entries).image;
    check("an unlabelled candidate never counts towards accuracy", (acc.counted !== 1 || acc.right !== 1) && JSON.stringify(acc));
  }

  // The requests, as the runner builds and saves them.
  {
    const ev = await buildEvidence({ record, elementId: cta.id, screenshot, name: "t-req", outDir: OUT });
    const requests = Object.fromEntries(SETUPS.map((s) => [s, requestFor(ev, s, "t")]));
    const dom = requests.dom;
    check("setup B sends no images and no image header",
      ("assets" in dom.body || dom.imageHeader) && JSON.stringify(Object.keys(dom.body)));

    const names = record.labelling[cta.id];
    const planted = [...names.classes, names.id, ...Object.values(names.data)];
    check("the call to action has labelling names to leak", planted.length < 3 && JSON.stringify(names));
    const leaks = [];
    for (const setup of SETUPS) {
      const saved = JSON.stringify(savedRequest(requests[setup], ev));
      for (const value of planted) if (saved.includes(value)) leaks.push(setup + " carries " + value);
      if (/data_base64|[A-Za-z0-9+/]{200,}/.test(saved)) leaks.push(setup + " still holds base64");
    }
    check("saved requests hold no class names, id, data-* or base64", leaks.join("; "));
    const saved = savedRequest(requests["image+dom"], ev);
    check("saved images point at their file and hash",
      Object.values(saved.body.assets).some((a) => !a.file || !/^[0-9a-f]{64}$/.test(a.sha256)) && JSON.stringify(saved.body.assets));
  }

  // The runner, offline: a fake Jev, no key, no browser.
  {
    const { planJobs, estimateCost, checkBudget, runJobs } = require("./runner");
    const { taxonomy, responseKey } = require("./common");
    const BIG = "iVBORw0KGgo" + "A".repeat(4000);
    const candidates = [
      { page: "https://example.com/a", element: "e1", label: "Button" },
      { page: "https://example.com/b", element: "e7", label: "Link" },
    ];
    const answer = { "e1": "Button", "e7": "Link" };
    const evidenceFor = async (c) => ({
      origin: "web", capturedAt: "2026-10-16T00:00:00.000Z",
      crop: { b64: BIG + "c", file: "out/evidence/" + c.element + "-crop.png", sha256: "1".repeat(64), padded: true },
      context: { b64: BIG + "w", file: "out/evidence/" + c.element + "-window.png", sha256: "2".repeat(64), scale: 1,
        outline: { colour: "magenta", width: 3 } },
      geometry: "for " + c.element,
      dom: { tag: "a", role: "link", name: c.element, style: {}, children: {} },
    });
    const answers = (choice, bend) => {
      const a = {
        component: { type: "choice", choice, confidence: 0.95, probabilities: { [choice]: 0.97, Other: 0.03 } },
        family: { type: "choice", choice: taxonomy.components[choice].family, confidence: 0.9, probabilities: {} },
      };
      for (const id of Object.keys(taxonomy.probes)) a[id] = { type: "noul", noul: 0.1 };
      if (bend) delete a.component.probabilities;
      return a;
    };
    // Answers by what the request is about, after a random delay, so results
    // finish out of order.
    const fakeJev = (opts = {}) => {
      const sent = [];
      let inFlight = 0, most = 0;
      const send = async (request) => {
        const element = /for (e\d+)/.exec(request.body.state.geometry)[1];
        sent.push(request);
        inFlight++; most = Math.max(most, inFlight);
        await new Promise((r) => setTimeout(r, Math.random() * 15));
        inFlight--;
        if (opts.fail && opts.fail(sent.length, request)) throw Object.assign(new Error(opts.reason || "HTTP 429 — slow down"), { status: opts.status || 429 });
        return { body: { model: "jev-1.13.0", answers: answers(answer[element], opts.bend), usage: { input_tokens: 5000 } }, ms: 7 };
      };
      return { send, sent, most: () => most };
    };
    const quiet = { save: () => {} };

    const all = planJobs(candidates, {});
    check("a run plans every candidate through every setup twice", all.length !== 12 && all.length + " jobs");

    {
      const entries = {};
      const jev = fakeJev();
      await runJobs({ jobs: all, entries, send: jev.send, evidenceFor, ...quiet });
      const misplaced = Object.entries(entries).filter(([key, e]) => e.status !== "ok" ||
        e.weighed.answer !== answer[key.split("|")[0].split("/").pop()]);
      check("four in flight from one queue, and every result under its own key",
        (jev.most() > 4 || jev.sent.length !== 12 || Object.keys(entries).length !== 12 || misplaced.length) &&
        "most " + jev.most() + ", sent " + jev.sent.length + ", misplaced " + misplaced.map(([k]) => k).join(", "));
      const json = JSON.stringify(entries);
      check("saved requests hold no base64", (json.includes(BIG.slice(0, 200)) || json.includes("data_base64")) && "base64 found");
      const e = entries[all[0].key];
      check("each entry records the guide version and the model",
        (e.guideVersion !== taxonomy.version || !/^[0-9a-f]{64}$/.test(e.guideSha256) || e.model !== "jev-1.13.0" ||
          !e.requestedModel || typeof e.ms !== "number" || e.inputTokens !== 5000 || !e.at || !e.body || !e.weighed) &&
        JSON.stringify(Object.keys(e)));
    }

    {
      // Interrupted: the key is refused on the fifth call. Resumed: only what
      // is missing or failed goes out.
      const entries = {};
      const first = fakeJev({ fail: (n) => n >= 5, status: 401, reason: "HTTP 401 — bad key" });
      let stopped = "";
      try { await runJobs({ jobs: planJobs(candidates, entries), entries, send: first.send, evidenceFor, ...quiet }); }
      catch (error) { stopped = error.message; }
      const saved = Object.values(entries).filter((e) => e.status === "ok").length;
      const resume = planJobs(candidates, entries);
      const again = fakeJev();
      await runJobs({ jobs: resume, entries, send: again.send, evidenceFor, ...quiet });
      const sentKeys = again.sent.map((r) => /for (e\d+)/.exec(r.body.state.geometry)[1]);
      check("an interrupted run, resumed, sends only the calls missing or failed",
        (!/Stopped/.test(stopped) || saved < 1 || resume.length !== 12 - saved || again.sent.length !== resume.length ||
          Object.values(entries).some((e) => e.status !== "ok") || sentKeys.length !== resume.length) &&
        JSON.stringify({ stopped, saved, resume: resume.length, sent: again.sent.length }));
    }

    {
      // A failed call is kept with the API's reason, and is missing, not wrong.
      const entries = {};
      const flaky = fakeJev({ fail: (n, request) => /for e7/.test(request.body.state.geometry) && request.body.assets === undefined });
      await runJobs({ jobs: planJobs(candidates, entries), entries, send: flaky.send, evidenceFor, ...quiet });
      const failedOnes = Object.entries(entries).filter(([, e]) => e.status === "failed");
      const retry = planJobs(candidates, entries);
      const acc = accuracy(candidates, entries).dom;
      check("a failed call is saved with its reason and planned again",
        (failedOnes.length !== 2 || !failedOnes.every(([, e]) => /slow down/.test(e.error) && e.httpStatus === 429) ||
          retry.length !== 2 || !retry.every((j) => j.retry)) && JSON.stringify(failedOnes.map(([k, e]) => [k, e.error])));
      check("and the report counts it as missing, not wrong", (acc.counted !== 1 || acc.right !== 1) && JSON.stringify(acc));
    }

    {
      // The API changed shape: one call per setup, then a stop that names the fields.
      const entries = {};
      const bent = fakeJev({ bend: true });
      let message = "";
      try { await runJobs({ jobs: planJobs(candidates, entries), entries, send: bent.send, evidenceFor, ...quiet }); }
      catch (error) { message = error.message; }
      check("a response with the wrong shape stops the run after at most one call per setup, naming the fields",
        (bent.sent.length > 3 || !/answers\.component\.probabilities missing/.test(message)) &&
        bent.sent.length + " calls: " + message);
    }

    {
      // 50 candidates, 300 calls, at the measured figure: about $0.09.
      const fifty = Array.from({ length: 50 }, (_, i) => ({ page: "https://example.com/p", element: "e" + (i + 1) }));
      const estimate = estimateCost(planJobs(fifty, {}), {});
      let refused = "";
      try { checkBudget(estimate, 0.05); } catch (error) { refused = error.message; }
      let allowed = true;
      try { checkBudget(estimate, 1); } catch (error) { allowed = false; }
      check("the estimate prices the missing calls at the measured figure",
        (estimate.calls !== 300 || estimate.usd < 0.05 || estimate.usd > 0.15) && JSON.stringify(estimate));
      check("a cost above the ceiling is refused, and one below is not", (!/above the budget/.test(refused) || !allowed) && refused);

      // The command line, with a key that would be refused if anything were sent.
      const dir = path.join(OUT, "budget");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, "candidates.json"), JSON.stringify({ candidates: fifty }));
      let code = 0, said = "";
      try {
        execFileSync(process.execPath, ["run.js", "--candidates", path.join(dir, "candidates.json"),
          "--responses", path.join(dir, "responses.json"), "--budget", "0.01"],
        { cwd: SPIKE, env: Object.assign({}, process.env, { TYPESAFE_API_KEY: "sk-not-a-key" }), stdio: "pipe" });
      } catch (error) { code = error.status; said = String(error.stderr); }
      check("run.js stops above the ceiling before any call",
        (code !== 1 || !/above the budget/.test(said) || fs.existsSync(path.join(dir, "responses.json"))) && code + " " + said);
    }
  }

  console.log(failed ? "\n" + failed + " failing" : "\nall passing");
  process.exit(failed ? 1 : 0);
})().catch((error) => { console.error(error); process.exit(1); });
