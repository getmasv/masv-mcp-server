// masvFetch is the single place that decides whether a MASV response is a result or
// an error. These tests pin that decision: which statuses throw, what the message
// carries, and what a caller gets back for a body that is empty or not JSON.

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { masvFetch } from "../../src/api/fetch.ts";
import { emptyBody, html, json, noContent, stubFetch, type Reply } from "../helpers/fetch-stub.ts";

const URL_ = "https://api.test.invalid/v1/teams/test-team/packages";

describe("masvFetch", () => {
  it("returns the parsed body on success", async (t) => {
    stubFetch(t, json({ packages: [{ id: "p1" }] }));

    assert.deepEqual(await masvFetch(URL_), { packages: [{ id: "p1" }] });
  });

  it("returns null for 204 No Content", async (t) => {
    stubFetch(t, noContent());

    assert.equal(await masvFetch(URL_, { method: "DELETE" }), null);
  });

  it("returns null for an empty 200 body", async (t) => {
    stubFetch(t, emptyBody());

    assert.equal(await masvFetch(URL_), null);
  });

  it("returns a JSON null body as null, not as an error", async (t) => {
    // JSON can carry null but never undefined, so null is the only empty value a
    // response body can hold. Callers that dereference it must handle it themselves.
    stubFetch(t, json(null));

    assert.equal(await masvFetch(URL_), null);
  });

  it("forwards method, headers and body to fetch unchanged", async (t) => {
    const sent = stubFetch(t, json({}));

    await masvFetch(URL_, {
      method: "PUT",
      headers: { "x-package-token": "tok" },
      body: '{"a":1}',
    });

    assert.equal(sent.url(), URL_);
    assert.equal(sent.method(), "PUT");
    assert.deepEqual(sent.headers(), { "x-package-token": "tok" });
    assert.deepEqual(sent.requestJson(), { a: 1 });
  });
});

describe("masvFetch error responses", () => {
  it("throws on 4xx, carrying the status and the API's message", async (t) => {
    stubFetch(t, () =>
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
    stubFetch(t, html("<html><body>502 Bad Gateway</body></html>", 500));

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
    stubFetch(t, json({ error: "not found" }, 404));

    await assert.rejects(
      () => masvFetch("https://api.test.invalid/v1/packages/bogus/files", { method: "GET" }),
      /GET .*\/v1\/packages\/bogus\/files/,
    );
  });

  it("throws a clear error when a 200 body is not JSON", async (t) => {
    stubFetch(t, html("<html>hi</html>"));

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
    stubFetch(t, html("x".repeat(20_000), 500));

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

  it("says so when an error response has no body at all", async (t) => {
    stubFetch(t, () => new Response(null, { status: 502 }));

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
    stubFetch(t, json({}, 500));

    await assert.rejects(() => masvFetch("not-a-url"), /not-a-url/);
  });

  it("still reports the status when the body cannot be read", async (t) => {
    // A reply is just a function, so a test needing something Response-shaped but
    // deliberately broken can build it here rather than in the shared helper.
    const unreadable: Reply = () =>
      ({
        ok: false,
        status: 503,
        statusText: "Service Unavailable",
        headers: new Headers(),
        text: async () => {
          throw new Error("stream closed");
        },
      }) as unknown as Response;

    stubFetch(t, unreadable);

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
