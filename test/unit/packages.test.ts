import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  deletePackage,
  getPackageFiles,
  getPackages,
  getPackageToken,
  getPackageTransfers,
  getPortalPackages,
  updatePackageExpiry,
} from "../../src/api/packages.ts";

/** Captures the URL of each outgoing request and answers with `body`. */
function stubFetch(t: { mock: { method: typeof import("node:test").mock.method } }, body: unknown) {
  return t.mock.method(globalThis, "fetch", async () => Response.json(body));
}

/** Answers each successive request with the next entry. */
function stubSequence(
  t: { mock: { method: typeof import("node:test").mock.method } },
  responses: (() => Response)[],
) {
  let call = 0;
  return t.mock.method(globalThis, "fetch", async () => {
    const next = responses[call++];
    if (!next) throw new Error(`unexpected fetch call ${call}`);
    return next();
  });
}

function requestedUrl(f: ReturnType<typeof stubFetch>, call = 0) {
  return f.mock.calls[call].arguments[0] as string;
}

function requestedInit(f: ReturnType<typeof stubFetch>, call = 0) {
  return f.mock.calls[call].arguments[1] as RequestInit;
}

function headersOf(f: ReturnType<typeof stubFetch>, call = 0) {
  return requestedInit(f, call).headers as Record<string, string>;
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

describe("array query params", () => {
  it("joins array values with commas rather than repeating the key", async (t) => {
    // MASV expects status=a,b. Repeating the key (status=a&status=b) does not filter.
    const f = stubFetch(t, { packages: [] });

    await getPackages({ status: ["finalized", "expired"], tags: ["t1", "t2"] });

    const url = requestedUrl(f);
    assert.match(url, /status=finalized%2Cexpired/, url);
    assert.match(url, /tags=t1%2Ct2/, url);
    assert.doesNotMatch(url, /status=finalized&status=expired/, "key must not repeat");
  });

  it("joins array values with commas for portal packages too", async (t) => {
    const f = stubFetch(t, { packages: [] });

    await getPortalPackages({ status: ["new", "archived"] });

    assert.match(requestedUrl(f), /status=new%2Carchived/);
  });
});

describe("getPackageToken", () => {
  it("reads the token from the package lookup", async (t) => {
    const f = stubFetch(t, { id: "pkg1", access_token: "tok-abc" });

    assert.equal(await getPackageToken("pkg1"), "tok-abc");
    assert.match(requestedUrl(f), /\/packages\/pkg1$/);
  });

  it("fails on the lookup rather than sending a second request", async (t) => {
    // The second hop would otherwise go out with `x-package-token: undefined` and
    // fail for an unrelated-looking reason, hiding the bad package id.
    const f = t.mock.method(globalThis, "fetch", async () =>
      Response.json({ error: "package not found" }, { status: 404 }),
    );

    await assert.rejects(() => getPackageFiles({ packageId: "bogus" }), /404/);
    assert.equal(f.mock.callCount(), 1, "the second hop must not fire");
  });

  it("fails clearly when the lookup succeeds but carries no token", async (t) => {
    const f = stubFetch(t, { id: "pkg1" });

    await assert.rejects(
      () => getPackageFiles({ packageId: "pkg1" }),
      (err: Error) => {
        assert.match(err.message, /token/i, err.message);
        assert.match(err.message, /pkg1/, "the package id belongs in the message");
        assert.doesNotMatch(err.message, /undefined/, "must not leak a fabricated token");
        return true;
      },
    );
    assert.equal(f.mock.callCount(), 1, "the second hop must not fire");
  });
});

describe("two-hop requests", () => {
  const lookup = () => Response.json({ id: "pkg1", access_token: "tok-abc" });

  it("authenticates getPackageFiles with the package token, not the API key", async (t) => {
    const f = stubSequence(t, [lookup, () => Response.json({ files: [] })]);

    await getPackageFiles({ packageId: "pkg1" });

    assert.equal(f.mock.callCount(), 2);
    assert.equal(headersOf(f, 0)["x-api-key"], "test-key", "hop 1 uses the team key");
    assert.equal(headersOf(f, 1)["x-package-token"], "tok-abc");
    assert.equal(headersOf(f, 1)["x-api-key"], undefined, "hop 2 must not send the team key");
    assert.match(requestedUrl(f, 1), /\/v1\/packages\/pkg1\/files$/);
  });

  it("authenticates getPackageTransfers with the package token", async (t) => {
    const f = stubSequence(t, [lookup, () => Response.json([])]);

    await getPackageTransfers({ packageId: "pkg1" });

    assert.equal(headersOf(f, 1)["x-package-token"], "tok-abc");
    assert.match(requestedUrl(f, 1), /\/v1\/packages\/pkg1\/transfer$/);
  });
});

describe("updatePackageExpiry", () => {
  const lookup = () => Response.json({ id: "pkg1", access_token: "tok-abc" });

  it("sets an expiry date when unlimited storage is off", async (t) => {
    const f = stubSequence(t, [lookup, () => Response.json({ ok: true })]);

    await updatePackageExpiry({
      packageId: "pkg1",
      unlimited_storage: false,
      expiry: "2030-01-01T00:00:00Z",
    });

    const init = requestedInit(f, 1);
    assert.equal(init.method, "PUT");
    assert.deepEqual(JSON.parse(init.body as string), {
      unlimited_storage: false,
      expiry: "2030-01-01T00:00:00Z",
    });
  });

  it("sends only the flag when enabling unlimited storage", async (t) => {
    const f = stubSequence(t, [lookup, () => Response.json({ ok: true })]);

    await updatePackageExpiry({ packageId: "pkg1", unlimited_storage: true });

    assert.deepEqual(JSON.parse(requestedInit(f, 1).body as string), {
      unlimited_storage: true,
    });
  });

  it("rejects unlimited storage combined with an expiry date", async (t) => {
    const f = stubFetch(t, {});

    await assert.rejects(
      () =>
        updatePackageExpiry({
          packageId: "pkg1",
          unlimited_storage: true,
          expiry: "2030-01-01T00:00:00Z",
        }),
      /unlimited_storage/,
    );
    assert.equal(f.mock.callCount(), 0, "a contradictory request should cost no round trip");
  });

  it("requires an expiry date when unlimited storage is off", async (t) => {
    const f = stubFetch(t, { id: "pkg1", access_token: "tok-abc" });

    await assert.rejects(
      () => updatePackageExpiry({ packageId: "pkg1", unlimited_storage: false }),
      /expiry/,
    );
    assert.equal(f.mock.callCount(), 0, "an incomplete request should cost no round trip");
  });
});

describe("deletePackage", () => {
  it("refuses without MASV_ALLOW_DELETE and sends no request at all", async (t) => {
    const f = stubFetch(t, {});

    await assert.rejects(() => deletePackage({ packageId: "pkg1" }), /MASV_ALLOW_DELETE/);
    assert.equal(f.mock.callCount(), 0, "the gate must close before the package lookup");
  });
});
