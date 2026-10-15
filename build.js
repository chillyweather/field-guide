// Stitches the sources into the one file Figma will serve. No dependencies.
//
// Figma inlines the UI as a single HTML document, so a relative <script src>
// never resolves. The three things worth reading on their own — the guide, the
// decision logic, the offline fixtures — therefore live in their own files and
// are spliced in here rather than being written into the page by hand.

const fs = require("fs");
const path = require("path");

const root = __dirname;
const read = (...p) => fs.readFileSync(path.join(root, ...p), "utf8");

const pieces = [
  { marker: "/* __TAXONOMY__ */ {}", source: ["taxonomy", "components.json"], json: true },
  { marker: "/* __FIXTURES__ */ { cases: [] }", source: ["fixtures", "offline.json"], json: true },
  { marker: "/* __WEIGH__ */", source: ["src-weigh.js"], json: false },
  { marker: "/* __VOCABULARY__ */", source: ["src-vocabulary.js"], json: false },
  { marker: "/* __QUESTIONS__ */", source: ["src-questions.js"], json: false },
  { marker: "/* __VISION__ */", source: ["src-vision.js"], json: false },
  { marker: "/* __IMAGES__ */", source: ["src-images.js"], json: false },
];

let html = read("src-ui.html");

for (const piece of pieces) {
  const from = path.join(...piece.source);
  if (!html.includes(piece.marker)) {
    console.error("build: marker not found in src-ui.html for " + from + " — expected " + piece.marker);
    process.exit(1);
  }
  let body = read(...piece.source);
  if (piece.json) JSON.parse(body); // fail here, loudly, rather than silently inside Figma
  else body = body.replace(/\nif \(typeof module[\s\S]*$/, "\n"); // the node export has no meaning in the page
  html = html.replace(piece.marker, body.trim());
}

if (/__TAXONOMY__|__FIXTURES__|__WEIGH__|__VOCABULARY__|__QUESTIONS__|__VISION__|__IMAGES__/.test(html)) {
  console.error("build: a marker survived the splice");
  process.exit(1);
}

fs.mkdirSync(path.join(root, "dist"), { recursive: true });
fs.writeFileSync(path.join(root, "dist", "ui.html"), html);

const taxonomy = JSON.parse(read("taxonomy", "components.json"));
const fixtures = JSON.parse(read("fixtures", "offline.json"));
console.log(
  "build: dist/ui.html — " + Object.keys(taxonomy.components).length + " components, " +
  Object.keys(taxonomy.probes).length + " probes, " + fixtures.cases.length + " offline cases",
);
