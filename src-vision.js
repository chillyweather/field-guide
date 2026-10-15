// What a vision model will accept, learned from the model rather than listed.
//
// Comparing OpenAI's vision models across generations only means anything if
// every one of them is asked the same question in a form it accepts. Three
// things differ between them, and each one quietly skews a comparison:
//
//   - The token cap's name. Older models take max_tokens; reasoning models
//     refuse it and want max_completion_tokens.
//   - Reasoning. GPT-4o and GPT-4.1 have none and refuse the parameter. GPT-5
//     and later think before answering unless told not to, and the lowest level
//     a model accepts differs by generation: "none", "minimal" or "low".
//   - The cap itself. Reasoning tokens count against it. At 300, gpt-5-mini
//     spent the whole allowance thinking and returned no text at all, which reads
//     as "unusable" when it was only misconfigured.
//
// So every model runs at the lowest reasoning it accepts, with a cap large
// enough that thinking cannot crowd out the answer, and the level it settled on
// goes into the run record. A table of which model takes what would be out of
// date by the next release; the API's own refusal says what to change.

const VISION_CAP = 2000;
const EFFORT_FLOOR = ["none", "minimal", "low"];

/** The first request shape to try for a model nothing is known about yet. */
function firstShape() {
  return { cap: "max_completion_tokens", effort: EFFORT_FLOOR[0] };
}

/** The request fields a shape contributes. */
function shapeFields(shape) {
  const fields = {};
  fields[shape.cap] = VISION_CAP;
  if (shape.effort) fields.reasoning_effort = shape.effort;
  return fields;
}

/**
 * Given a shape the API refused and the body of its refusal, the shape to try
 * next — or null when the refusal is not about the shape, and a retry would only
 * repeat it.
 */
function nextShape(shape, errorText) {
  let err = {};
  try { err = JSON.parse(errorText).error || {}; } catch (e) { /* not JSON: read the text */ }
  const message = String(err.message || errorText || "");
  const param = err.param || "";

  if (param === "reasoning_effort" || /reasoning_effort/.test(message)) {
    if (!shape.effort) return null;
    // A level this model does not take: step up to the next floor, never down.
    if (err.code === "unsupported_value" || /unsupported value|supported values/i.test(message)) {
      const i = EFFORT_FLOOR.indexOf(shape.effort);
      if (i < 0 || i === EFFORT_FLOOR.length - 1) return null;
      return { cap: shape.cap, effort: EFFORT_FLOOR[i + 1] };
    }
    // The parameter itself is refused: a model that does not reason.
    return { cap: shape.cap, effort: null };
  }

  // The cap's name refused. Only switch away from the name that was sent, so a
  // message mentioning both ("use max_completion_tokens instead") cannot loop.
  const capRefused = param === shape.cap ||
    (!param && new RegExp("'?" + shape.cap + "'?\\s+is not supported|unrecognized[^.]*" + shape.cap, "i").test(message));
  if (capRefused) {
    return { cap: shape.cap === "max_tokens" ? "max_completion_tokens" : "max_tokens", effort: shape.effort };
  }
  return null;
}

/** How many tokens a response spent thinking, when the host reports it. */
function reasoningTokens(usage) {
  return (usage && usage.completion_tokens_details && usage.completion_tokens_details.reasoning_tokens) || 0;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { VISION_CAP, EFFORT_FLOOR, firstShape, shapeFields, nextShape, reasoningTokens };
}
