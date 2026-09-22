// Inlines the field guide into the UI. No dependencies, no bundler.
//
// Figma serves the UI as one inlined HTML file, so a relative <script src>
// never resolves. The taxonomy still deserves to be its own reviewable file —
// it is the substance of this project — so it lives in taxonomy/components.json
// and is stitched in here.

const fs = require("fs");
const path = require("path");

const root = __dirname;
const MARKER = "/* __TAXONOMY__ */ {}";

const html = fs.readFileSync(path.join(root, "src-ui.html"), "utf8");
const taxonomy = fs.readFileSync(path.join(root, "taxonomy", "components.json"), "utf8");

JSON.parse(taxonomy); // fail loudly here rather than silently inside Figma

if (!html.includes(MARKER)) {
  console.error("build: marker " + MARKER + " not found in src-ui.html");
  process.exit(1);
}

fs.mkdirSync(path.join(root, "dist"), { recursive: true });
fs.writeFileSync(path.join(root, "dist", "ui.html"), html.replace(MARKER, taxonomy.trim()));

const count = Object.keys(JSON.parse(taxonomy).components).length;
console.log("build: dist/ui.html written, " + count + " components in the guide");
