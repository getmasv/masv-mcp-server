// masvFetch is the single place that decides whether a MASV response is a
// result or an error. These tests pin that decision: which statuses throw, what
// the message carries, and what a caller gets back for a body that is empty or
// not JSON.

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { masvFetch } from "../../src/api/fetch.ts";

const URL_ = "https://api.test.invalid/v1/teams/test-team/packages";

describe("masvFetch", () => {
  it("returns the parsed body on success", async (t) => {
    t.mock.method(globalThis, "fetch", async () => Response.json({ packages: [{ id: "p1" }] }));

    assert.deepEqual(await masvFetch(URL_), { packages: [{ id: "p1" }] });
  });

  it("returns null for 204 No Content", async (t) => {
    t.mock.method(globalThis, "fetch", async () => new Response(null, { status: 204 }));

    assert.equal(await masvFetch(URL_, { method: "DELETE" }), null);
  });

  it("returns null for an empty 200 body", async (t) => {
    t.mock.method(globalThis, "fetch", async () => new Response("", { status: 200 }));

    assert.equal(await masvFetch(URL_), null);
  });

  it("forwards method, headers and body to fetch unchanged", async (t) => {
    const f = t.mock.method(globalThis, "fetch", async () => Response.json({}));

    await masvFetch(URL_, {
      method: "PUT",
      headers: { "x-package-token": "tok" },
      body: '{"a":1}',
    });

    const [url, init] = f.mock.calls[0].arguments as [string, RequestInit];
    assert.equal(url, URL_);
    assert.equal(init.method, "PUT");
    assert.deepEqual(init.headers, { "x-package-token": "tok" });
    assert.equal(init.body, '{"a":1}');
  });

  describe("error responses", () => {
    it("throws on 4xx, carrying the status and the API's message", async (t) => {
      t.mock.method(globalThis, "fetch", async () =>
        Response.json({ error: "invalid api key" }, { status: 401, statusText: "Unauthorized" }),
      );

      await assert.rejects(
        () => masvFetch(URL_),
        (err: Error) => {
          assert.match(err.message, /401/, "status code must be in the message");
          assert.match(err.message, /invalid api key/, "API's own message must survive");
          return true;
        },
      );
    });

    it("names the status when the body is HTML, not a JSON parse error", async (t) => {
      t.mock.method(
        globalThis,
        "fetch",
        async () =>
          new Response("<html><body>502 Bad Gateway</body></html>", {
            status: 500,
            headers: { "content-type": "text/html" },
          }),
      );

      await assert.rejects(
        () => masvFetch(URL_),
        (err: Error) => {
          assert.match(err.message, /500/, "status code must be in the message");
          assert.doesNotMatch(
            err.message,
            /Unexpected token|is not valid JSON/,
            "must not surface a raw JSON parse error",
          );
          return true;
        },
      );
    });

    it("reports the method and path so the failing call is identifiable", async (t) => {
      t.mock.method(globalThis, "fetch", async () =>
        Response.json({ error: "not found" }, { status: 404 }),
      );

      await assert.rejects(
        () =>
          masvFetch("https://api.test.invalid/v1/packages/bogus/files", {
            method: "GET",
          }),
        /GET .*\/v1\/packages\/bogus\/files/,
      );
    });

    it("throws a clear error when a 200 body is not JSON", async (t) => {
      t.mock.method(
        globalThis,
        "fetch",
        async () =>
          new Response("<html>hi</html>", {
            status: 200,
            headers: { "content-type": "text/html" },
          }),
      );

      await assert.rejects(
        () => masvFetch(URL_),
        (err: Error) => {
          assert.match(err.message, /200/);
          assert.doesNotMatch(err.message, /Unexpected token|is not valid JSON/);
          return true;
        },
      );
    });

    it("truncates a long error body", async (t) => {
      t.mock.method(
        globalThis,
        "fetch",
        async () =>
          new Response("x".repeat(20_000), {
            status: 500,
            headers: { "content-type": "text/html" },
          }),
      );

      await assert.rejects(
        () => masvFetch(URL_),
        (err: Error) => {
          assert.ok(
            err.message.length < 1_000,
            `error message should stay readable, got ${err.message.length} chars`,
          );
          return true;
        },
      );
    });
  });
});

describe("masvFetch edge cases", () => {
  it("says so when an error response has no body at all", async (t) => {
    t.mock.method(globalThis, "fetch", async () => new Response(null, { status: 502 }));

    await assert.rejects(
      () => masvFetch(URL_),
      (err: Error) => {
        assert.match(err.message, /502/);
        assert.match(err.message, /empty/i, err.message);
        return true;
      },
    );
  });

  it("falls back to the raw target when it is not a parseable URL", async (t) => {
    t.mock.method(globalThis, "fetch", async () => Response.json({}, { status: 500 }));

    await assert.rejects(() => masvFetch("not-a-url"), /not-a-url/);
  });
});

describe("masvFetch with an unreadable body", () => {
  it("still reports the status when the body cannot be read", async (t) => {
    // A response whose stream fails mid-read must not turn into an error about the
    // stream; the status is the part the caller can act on.
    t.mock.method(globalThis, "fetch", async () => ({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
      headers: new Headers(),
      text: async () => {
        throw new Error("stream closed");
      },
    }));

    await assert.rejects(
      () => masvFetch(URL_),
      (err: Error) => {
        assert.match(err.message, /503/);
        assert.doesNotMatch(err.message, /stream closed/);
        return true;
      },
    );
  });
});
