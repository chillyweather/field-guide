// Keeping the vision model out of the classifier's job.
//
// The pipeline only means anything if the vision step describes and the guide
// decides. A description that says "a toggle switch" has already made the call,
// and Jev is then reading an answer rather than reaching one — the project's
// whole claim, quietly emptied.
//
// This is not hypothetical and not a bad-model problem. Measured on one image,
// 22 September 2026: gpt-4o-mini leaked on 1 of 3 identical calls; gpt-4o and
// gpt-5.2 on 0 of 3. Same prompt every time. So the instruction is necessary and
// not sufficient, and the check has to run on every description in production
// rather than once in a probe.
//
// Masking rather than retrying: a retry costs a second call and can leak again,
// while the rest of the sentence — shape, fill, geometry, state — is exactly
// what the guide needs and is still there once the giveaway word is gone.

// Inflections are listed rather than derived, because deriving them does real
// damage. A generic "-ed/-ing" rule turns "select" into "selected" and "check"
// into "checked" — and those are not component names, they are the visible state
// the description was asked for. Masking them would strip the evidence the guide
// needs while leaving the giveaway untouched.
//
// So the forms that are still a giveaway are named one by one, and the forms that
// describe state are deliberately absent. "toggled position" cost one live run to
// find: the noun was masked, the participle was not, and the description carried
// the answer through anyway.
const BANNED = [
  "button", "link", "chip", "badge", "input", "search field", "select", "dropdown",
  "checkbox", "radio button", "radio", "toggle", "toggled", "toggling",
  "switch", "switching", "card", "modal", "dialog",
  "popover", "tooltip", "slider", "tab", "tabs", "avatar", "accordion", "breadcrumb",
];

const pattern = (word) => new RegExp("\\b" + word.replace(/\s+/g, "\\s+") + "(?:es|s)?\\b", "gi");

/**
 * Replaces design-system nouns with a neutral placeholder.
 *
 * Longest first, so "radio button" is masked as one term rather than leaving a
 * stray "button" behind, and "search field" before "select" can catch part of it.
 */
function maskVocabulary(text) {
  if (!text) return { text: "", leaked: [], masked: false };
  const found = [];
  let out = String(text);
  for (const word of [...BANNED].sort((a, b) => b.length - a.length)) {
    const re = pattern(word);
    if (re.test(out)) {
      found.push(word);
      out = out.replace(pattern(word), "[element]");
    }
  }
  // Collapse the runs a multi-word mask can leave behind.
  out = out.replace(/(\[element\]\s*){2,}/g, "[element] ");
  return { text: out, leaked: found, masked: found.length > 0 };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { maskVocabulary, BANNED };
}
