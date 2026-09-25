import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { getPackages, getPortalPackages } from "../../src/api/packages.ts";

/** Captures the URL of each outgoing request and answers with `body`. */
function stubFetch(t: { mock: { method: typeof import("node:test").mock.method } }, body: unknown) {
  return t.mock.method(globalThis, "fetch", async () => Response.json(body));
}

function requestedUrl(f: ReturnType<typeof stubFetch>, call = 0) {
  return f.mock.calls[call].arguments[0] as string;
}

describe("getPackages", () => {
  it("forwards page to the query string", async (t) => {
    // A dropped `page` makes an agent re-read page 1 forever, with no error to
    // notice, so every paginated endpoint pins it.
    const f = stubFetch(t, { packages: [] });

    await getPackages({ page: 3, limit: 10 });

    const url = requestedUrl(f);
    assert.match(url, /[?&]page=3(&|$)/, `page missing from ${url}`);
    assert.match(url, /[?&]limit=10(&|$)/, `limit missing from ${url}`);
  });

  it("omits page when it was not asked for", async (t) => {
    const f = stubFetch(t, { packages: [] });

    await getPackages({ limit: 10 });

    assert.doesNotMatch(requestedUrl(f), /page=/);
  });

  it("returns an error for a 401", async (t) => {
    // The 401 body is JSON, so it would parse cleanly as a result. It must not.
    t.mock.method(globalThis, "fetch", async () =>
      Response.json({ error: "unauthorized" }, { status: 401 }),
    );

    await assert.rejects(() => getPackages({}), /401/);
  });

  it("returns an error naming the status for a 500 with an HTML body", async (t) => {
    t.mock.method(
      globalThis,
      "fetch",
      async () =>
        new Response("<html><body>oops</body></html>", {
          status: 500,
          headers: { "content-type": "text/html" },
        }),
    );

    await assert.rejects(
      () => getPackages({}),
      (err: Error) => {
        assert.match(err.message, /500/);
        assert.doesNotMatch(err.message, /Unexpected token|is not valid JSON/);
        return true;
      },
    );
  });
});

describe("getPortalPackages", () => {
  it("forwards page to the query string", async (t) => {
    const f = stubFetch(t, { packages: [] });

    await getPortalPackages({ page: 2, limit: 25 });

    const url = requestedUrl(f);
    assert.match(url, /[?&]page=2(&|$)/, `page missing from ${url}`);
    assert.match(url, /[?&]limit=25(&|$)/, `limit missing from ${url}`);
  });

  it("returns an error for a 403", async (t) => {
    t.mock.method(globalThis, "fetch", async () =>
      Response.json({ error: "forbidden" }, { status: 403 }),
    );

    await assert.rejects(() => getPortalPackages({}), /403/);
  });
});
