// The spike's own checks. Playwright against the static page in test/, no
// network, no key. `npm test` in spike/.

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const sharp = require("sharp");
const { SPIKE, ROOT, SETUPS, slug } = require("./common");
const { capture } = require("./capture");
const { buildEvidence, contextWindow } = require("./evidence");
const { requestFor, savedRequest } = require("./jev");

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
