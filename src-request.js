// The request Jev is sent about one region, built in one place.
//
// Two callers ask Jev about a region: the plugin's Jev-only survey, and the DOM
// spike, which asks the same thing three ways. If each built its own request,
// the spike would measure a request the plugin does not send — so both come
// here, and the plugin's own request is pinned in test.js.
//
// Pure: no network, no images decoded, no randomness. The caller fits the
// pictures (src-images.js), words the geometry (src-geometry.js), and supplies
// the tag that makes the image references unique.

// Jev refuses images unless the request opts in with this header.
const JEV_IMAGE_HEADER = "TypeSafe-Danger-Zone-Images";

// What each setup shows Jev. Geometry goes with every one of them.
const SETUPS = {
  image: { images: true, dom: false },
  dom: { images: false, dom: true },
  "image+dom": { images: true, dom: true },
};

// Where the evidence came from, which decides what the state may truthfully
// claim. A web page has no designer and no design file, and Jev reads every
// sentence of the state as a fact about the region.
const ORIGINS = {
  figma: {
    task: "A region of a user interface, marked by a designer, to be identified.",
    geometry: "From the design file: ",
    screen: () => "The whole screen the region sits on, for context only.",
    noScreen: "No surrounding screen was found; judge from the region alone.",
  },
  web: {
    task: "A region of a web page, picked out by a tool, to be identified.",
    geometry: "From the page layout, measured against the browser viewport: ",
    screen: (outline) => "A viewport-sized window of the page around the region, for context only. " +
      "The tool outlined the region in it with a " + outline.width + " px " + outline.colour +
      " line drawn just outside its edges; the outline is not part of the page.",
    noScreen: "No surrounding page was captured; judge from the region alone.",
  },
};

/**
 * The complete request for one region.
 *
 *   evidence  { origin: "figma" | "web",
 *               crop:    { b64, padded } — fitted by fitForJev,
 *               context: { b64, scale, outline? } | null — fitted, outline for web,
 *               geometry: the sentence from describeGeometry,
 *               dom:     DOM facts (see domFacts), web only }
 *   setup     "image" | "dom" | "image+dom"
 *   subject   how the questions point at the region (see buildQuestions)
 *   tag       unique per call; Jev swaps a reference for its image wherever the
 *             string appears, so it must not be something a sentence could say
 *
 * Returns { body: { model, state, assets?, questions }, imageHeader }. A setup
 * without pictures carries no assets at all and does not ask for the header.
 */
function buildJevRequest({ evidence, setup, taxonomy, subject, model, tag }) {
  const shows = SETUPS[setup];
  if (!shows) throw new Error("Unknown setup '" + setup + "'. Known: " + Object.keys(SETUPS).join(", "));
  const origin = ORIGINS[evidence.origin];
  if (!origin) throw new Error("Unknown origin '" + evidence.origin + "'. Known: " + Object.keys(ORIGINS).join(", "));
  if (shows.images && !(evidence.crop && evidence.crop.b64)) throw new Error("Setup '" + setup + "' needs a fitted crop.");
  if (shows.images && !tag) throw new Error("Setup '" + setup + "' needs a tag for the image references.");
  if (shows.dom && !evidence.dom) throw new Error("Setup '" + setup + "' needs DOM facts.");
  if (shows.dom && evidence.origin !== "web") throw new Error("DOM facts come only from a web page.");

  const state = { task: origin.task };
  const assets = {};

  if (shows.images) {
    const context = evidence.context && evidence.context.b64 ? evidence.context : null;
    if (context && evidence.origin === "web" && !context.outline) {
      throw new Error("A web context window must say how the region was outlined.");
    }
    const refs = { crop: "fg-region-" + tag, context: context ? "fg-screen-" + tag : null };
    assets[refs.crop] = { type: "image", format: "png", data_base64: evidence.crop.b64 };
    if (context) assets[refs.context] = { type: "image", format: "png", data_base64: context.b64 };
    Object.assign(state, imageState(origin, refs, evidence.geometry, {
      cropPadded: Boolean(evidence.crop.padded),
      contextScale: context && typeof context.scale === "number" ? context.scale : 1,
      outline: context && context.outline,
    }));
  } else {
    state.geometry = origin.geometry + evidence.geometry;
    state.picture_note = "No picture of the region is given; judge from its facts and geometry alone.";
  }

  if (shows.dom) {
    state.dom = "Read from the page's DOM and computed style:\n- " + domFacts(evidence.dom).join("\n- ");
  }

  const body = { model, state };
  if (shows.images) body.assets = assets;
  body.questions = questionsFor(taxonomy, subject);
  return { body, imageHeader: shows.images };
}

/**
 * The picture half of the state: the images in place of a description.
 *
 * Both images go in the state rather than in a question's instructions, so the
 * dozen questions in the call share one copy instead of each carrying its own.
 */
function imageState(origin, refs, geometry, notes) {
  const state = {
    region: refs.crop,
    geometry: origin.geometry + geometry,
  };
  if (notes.cropPadded) {
    state.region_note = "The region is drawn at its true size on a flat white margin; the margin is not part of it.";
  }
  if (refs.context) {
    state.screen = refs.context;
    state.screen_note = origin.screen(notes.outline) +
      (notes.contextScale < 1 ? " Shown at " + Math.round(notes.contextScale * 100) + "% of its size." : "");
  } else {
    state.screen_note = origin.noScreen;
  }
  return state;
}

/**
 * DOM facts as the short plain list Jev reads.
 *
 * Built from named fields only. Anything else on the object — class names,
 * `id`, `data-*`, which a capture keeps for labelling — is never read, so it
 * cannot reach Jev however the evidence was assembled.
 *
 *   { tag, type, role, name, text, href,
 *     aria:  { checked, pressed, expanded, hidden } — only those present,
 *     style: { width, height, borderRadius, backgroundColor, border, position, zIndex, cursor },
 *     parent: { tag, role } | null,
 *     children: { [role]: count } }
 */
function domFacts(dom) {
  const quote = (v) => JSON.stringify(String(v));
  const lines = [];
  lines.push("element: <" + dom.tag + (dom.type ? " type=" + quote(dom.type) : "") + ">");
  lines.push("role: " + (dom.role || "none"));
  lines.push("accessible name: " + (dom.name ? quote(dom.name) : "none"));
  lines.push("visible text: " + (dom.text ? quote(dom.text) : "none"));
  lines.push("href: " + (typeof dom.href === "string" ? "present, " + quote(dom.href) : "absent"));
  const aria = dom.aria || {};
  for (const key of ["checked", "pressed", "expanded", "hidden"]) {
    if (aria[key] !== undefined && aria[key] !== null) lines.push("aria-" + key + ": " + quote(aria[key]));
  }
  const style = dom.style || {};
  const styles = [
    ["width", "width"], ["height", "height"], ["borderRadius", "corner radius"],
    ["backgroundColor", "background colour"], ["border", "border"], ["position", "position"],
    ["zIndex", "z-index"], ["cursor", "cursor"],
  ];
  for (const [key, said] of styles) {
    if (style[key] !== undefined && style[key] !== null && style[key] !== "") lines.push(said + " (computed): " + style[key]);
  }
  lines.push("parent: " + (dom.parent ? "<" + dom.parent.tag + ">, role " + (dom.parent.role || "none") : "none"));
  const counts = Object.entries(dom.children || {}).filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  lines.push("children by role: " + (counts.length ? counts.map(([role, n]) => n + " " + role).join(", ") : "none"));
  return lines;
}

// In the page these are the spliced globals; in Node, the root modules.
function questionsFor(taxonomy, subject) {
  const build = typeof buildQuestions === "function" ? buildQuestions : require("./src-questions").buildQuestions;
  return build(taxonomy, subject);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { buildJevRequest, domFacts, JEV_IMAGE_HEADER, SETUPS };
}
