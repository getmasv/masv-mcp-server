/**
 * The single entry point for every MASV API request.
 *
 * Its job is to make a failed request look like a failure. Tool handlers wrap their
 * calls in try/catch and return `mcpError`, so anything that returns normally is
 * presented to the model as a result — which meant an unchecked error body was
 * indistinguishable from data. This checks the status, keeps the API's own message,
 * and never lets a non-JSON body surface as a raw parse error.
 *
 * Auth headers stay at the call sites: requests are split between a team API key and
 * a per-package token, and which one applies is the caller's concern.
 */

/** Long enough to carry an API error message, short enough to survive an HTML 500. */
const MAX_BODY_CHARS = 300;

/**
 * Performs a MASV API request and returns the parsed JSON body.
 *
 * @returns the parsed body, or `null` when the response has no content (204, or an
 *          empty body — both of which MASV uses for successful deletes).
 * @throws on any non-2xx status, and on a success whose body is not JSON. The
 *         message carries the status, the method and path, and the API's own text.
 */
export async function masvFetch(url: string | URL, init?: RequestInit): Promise<any> {
  const target = url.toString();
  const response = await fetch(target, init);
  const where = `${init?.method ?? "GET"} ${pathOf(target)}`;

  if (!response.ok) {
    throw new Error(
      `MASV API error ${status(response)} on ${where}: ${await bodySummary(response)}`,
    );
  }

  const body = await response.text();
  if (body.trim() === "") return null;

  try {
    return JSON.parse(body);
  } catch {
    // A 2xx that isn't JSON means a proxy or error page answered in place of the
    // API. Reporting the status and a snippet is far more actionable to a model
    // than `Unexpected token '<', "<html>"... is not valid JSON`.
    throw new Error(
      `MASV API returned a ${status(response)} response on ${where} whose body is not JSON` +
        `${contentType(response)}: ${truncate(body)}`,
    );
  }
}

function status(response: Response) {
  return response.statusText ? `${response.status} ${response.statusText}` : `${response.status}`;
}

function contentType(response: Response) {
  const type = response.headers.get("content-type");
  return type ? ` (content-type ${type.split(";")[0]})` : "";
}

async function bodySummary(response: Response) {
  let body: string;
  try {
    body = await response.text();
  } catch {
    return "<response body could not be read>";
  }

  if (body.trim() === "") return "<empty response body>";
  return `${truncate(body)}${contentType(response)}`;
}

function truncate(body: string) {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > MAX_BODY_CHARS ? `${flat.slice(0, MAX_BODY_CHARS)}… (truncated)` : flat;
}

/**
 * Method and path only. The host is noise, and the path is where the interesting
 * detail lives — a wrong or missing query param is the most common request defect.
 */
function pathOf(target: string) {
  try {
    const url = new URL(target);
    return `${url.pathname}${url.search}`;
  } catch {
    return target;
  }
}
