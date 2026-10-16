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

  console.log(failed ? "\n" + failed + " failing" : "\nall passing");
  process.exit(failed ? 1 : 0);
})().catch((error) => { console.error(error); process.exit(1); });
