// One request to Jev, straight to api.typesafe.ai. Node sends no Origin header,
// so the plugin's CORS shim (proxy.js) is not needed here.

const { buildJevRequest, JEV_IMAGE_HEADER } = require("../src-request");
const { taxonomy, SUBJECT } = require("./common");

const ENDPOINT = "https://api.typesafe.ai/v1/systemone";
const MODEL = process.env.JEV_MODEL || "jev-latest";

/** The request for one candidate and setup, built by the plugin's own builder. */
function requestFor(evidence, setup, tag) {
  return buildJevRequest({ evidence, setup, taxonomy, subject: SUBJECT, model: MODEL, tag });
}

/**
 * The request as it is kept in a fixture: every image replaced by the file it
 * was written to and its hash, so the fixture stays small and readable and
 * still says exactly which picture was sent.
 */
function savedRequest(request, evidence) {
  const pictures = [evidence.crop, evidence.context].filter(Boolean);
  const body = JSON.parse(JSON.stringify(request.body));
  for (const asset of Object.values(body.assets || {})) {
    const picture = pictures.find((p) => p.b64 === asset.data_base64);
    delete asset.data_base64;
    asset.file = picture ? picture.file : null;
    asset.sha256 = picture ? picture.sha256 : null;
  }
  return { imageHeader: request.imageHeader, body };
}

/** Sends one request. Resolves with the raw body and timing, or throws with the API's reason. */
async function send(request, key) {
  const headers = { "content-type": "application/json", authorization: "Bearer " + key };
  if (request.imageHeader) headers[JEV_IMAGE_HEADER] = "true";
  const started = Date.now();
  const res = await fetch(ENDPOINT, { method: "POST", headers, body: JSON.stringify(request.body) });
  const text = await res.text();
  const ms = Date.now() - started;
  if (!res.ok) {
    const error = new Error("HTTP " + res.status + " — " + text.slice(0, 500));
    error.status = res.status;
    throw error;
  }
  return { body: JSON.parse(text), ms };
}

module.exports = { requestFor, savedRequest, send, ENDPOINT, MODEL };
