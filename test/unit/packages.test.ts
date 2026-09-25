import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  deletePackage,
  getPackage,
  getPackageFiles,
  getPackages,
  getPackageToken,
  getPackageTransfers,
  getPortalPackages,
  updatePackageExpiry,
} from "../../src/api/packages.ts";
import { html, json, stubFetch } from "../helpers/fetch-stub.ts";

/** A package lookup that yields a token, which every two-hop call starts with. */
const lookup = () => json({ id: "pkg1", access_token: "tok-abc" });

describe("getPackages", () => {
  it("forwards page to the query string", async (t) => {
    // A dropped `page` makes an agent re-read page 1 forever, with no error to
    // notice, so every paginated endpoint pins it.
    const sent = stubFetch(t, json({ packages: [] }));

    await getPackages({ page: 3, limit: 10 });

    assert.match(sent.url(), /[?&]page=3(&|$)/, sent.url());
    assert.match(sent.url(), /[?&]limit=10(&|$)/, sent.url());
  });

  it("omits an optional param that was left undefined", async (t) => {
    const sent = stubFetch(t, json({ packages: [] }));

    await getPackages({ limit: 10, page: undefined, name: undefined });

    assert.doesNotMatch(sent.url(), /page=/, "undefined must not become page=undefined");
    assert.doesNotMatch(sent.url(), /name=/);
  });

  it("returns an error for a 401", async (t) => {
    // The 401 body is JSON, so it would parse cleanly as a result. It must not.
    stubFetch(t, json({ error: "unauthorized" }, 401));

    await assert.rejects(() => getPackages({}), /401/);
  });

  it("returns an error naming the status for a 500 with an HTML body", async (t) => {
    stubFetch(t, html("<html><body>oops</body></html>", 500));

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

describe("getPackage", () => {
  it("requests the package by id", async (t) => {
    const sent = stubFetch(t, json({ id: "pkg1" }));

    await getPackage({ packageId: "pkg1" });

    assert.match(sent.url(), /\/v1\.1\/teams\/test-team\/packages\/pkg1$/);
    assert.equal(sent.headers()["x-api-key"], "test-key");
  });
});

describe("getPortalPackages", () => {
  it("forwards page to the query string", async (t) => {
    const sent = stubFetch(t, json({ packages: [] }));

    await getPortalPackages({ page: 2, limit: 25 });

    assert.match(sent.url(), /[?&]page=2(&|$)/, sent.url());
    assert.match(sent.url(), /[?&]limit=25(&|$)/, sent.url());
  });

  it("returns an error for a 403", async (t) => {
    stubFetch(t, json({ error: "forbidden" }, 403));

    await assert.rejects(() => getPortalPackages({}), /403/);
  });
});

describe("array query params", () => {
  it("joins array values with commas rather than repeating the key", async (t) => {
    // MASV expects status=a,b. Repeating the key (status=a&status=b) does not filter.
    const sent = stubFetch(t, json({ packages: [] }));

    await getPackages({ status: ["finalized", "expired"], tags: ["t1", "t2"] });

    assert.match(sent.url(), /status=finalized%2Cexpired/, sent.url());
    assert.match(sent.url(), /tags=t1%2Ct2/, sent.url());
    assert.doesNotMatch(sent.url(), /status=finalized&status=expired/, "key must not repeat");
  });

  it("joins array values with commas for portal packages too", async (t) => {
    const sent = stubFetch(t, json({ packages: [] }));

    await getPortalPackages({ status: ["new", "archived"] });

    assert.match(sent.url(), /status=new%2Carchived/);
  });

  it("sends an empty array as an empty value rather than dropping it", async (t) => {
    // Worth pinning either way: String([]) is "", so the key is still sent.
    const sent = stubFetch(t, json({ packages: [] }));

    await getPackages({ tags: [] });

    assert.match(sent.url(), /tags=(&|$)/, sent.url());
  });
});

describe("getPackageToken", () => {
  it("reads the token from the package lookup", async (t) => {
    const sent = stubFetch(t, lookup());

    assert.equal(await getPackageToken("pkg1"), "tok-abc");
    assert.match(sent.url(), /\/packages\/pkg1$/);
  });

  it("fails on the lookup rather than sending a second request", async (t) => {
    // The second hop would otherwise go out with `x-package-token: undefined` and
    // fail for an unrelated-looking reason, hiding the bad package id.
    const sent = stubFetch(t, json({ error: "package not found" }, 404));

    await assert.rejects(() => getPackageFiles({ packageId: "bogus" }), /404/);
    assert.equal(sent.count(), 1, "the second hop must not fire");
  });

  it("fails clearly when the lookup succeeds but the token is missing", async (t) => {
    // JSON cannot carry undefined, so this is what an absent field looks like.
    const sent = stubFetch(t, json({ id: "pkg1" }));

    await assert.rejects(
      () => getPackageFiles({ packageId: "pkg1" }),
      (err: Error) => {
        assert.match(err.message, /token/i, err.message);
        assert.match(err.message, /pkg1/, "the package id belongs in the message");
        assert.doesNotMatch(err.message, /undefined/, "must not leak a fabricated token");
        return true;
      },
    );
    assert.equal(sent.count(), 1, "the second hop must not fire");
  });

  it("fails clearly when the token is present but null", async (t) => {
    stubFetch(t, json({ id: "pkg1", access_token: null }));

    await assert.rejects(() => getPackageFiles({ packageId: "pkg1" }), /token/i);
  });

  it("fails clearly when the token is an empty string", async (t) => {
    // An empty token would send an empty header, which fails as a 401 far from here.
    stubFetch(t, json({ id: "pkg1", access_token: "" }));

    await assert.rejects(() => getPackageFiles({ packageId: "pkg1" }), /token/i);
  });
});

describe("two-hop requests", () => {
  it("authenticates getPackageFiles with the package token, not the API key", async (t) => {
    const sent = stubFetch(t, lookup(), json({ files: [] }));

    await getPackageFiles({ packageId: "pkg1" });

    assert.equal(sent.count(), 2);
    assert.equal(sent.headers(0)["x-api-key"], "test-key", "hop 1 uses the team key");
    assert.equal(sent.headers(1)["x-package-token"], "tok-abc");
    assert.equal(sent.headers(1)["x-api-key"], undefined, "hop 2 must not send the team key");
    assert.match(sent.url(1), /\/v1\/packages\/pkg1\/files$/);
  });

  it("authenticates getPackageTransfers with the package token", async (t) => {
    const sent = stubFetch(t, lookup(), json([]));

    await getPackageTransfers({ packageId: "pkg1" });

    assert.equal(sent.headers(1)["x-package-token"], "tok-abc");
    assert.match(sent.url(1), /\/v1\/packages\/pkg1\/transfer$/);
  });
});

describe("updatePackageExpiry", () => {
  it("sets an expiry date when unlimited storage is off", async (t) => {
    const sent = stubFetch(t, lookup(), json({ ok: true }));

    await updatePackageExpiry({
      packageId: "pkg1",
      unlimited_storage: false,
      expiry: "2030-01-01T00:00:00Z",
    });

    assert.equal(sent.method(1), "PUT");
    assert.deepEqual(sent.requestJson(1), {
      unlimited_storage: false,
      expiry: "2030-01-01T00:00:00Z",
    });
  });

  it("sends only the flag when enabling unlimited storage", async (t) => {
    const sent = stubFetch(t, lookup(), json({ ok: true }));

    await updatePackageExpiry({ packageId: "pkg1", unlimited_storage: true });

    assert.deepEqual(sent.requestJson(1), { unlimited_storage: true });
  });

  it("rejects unlimited storage combined with an expiry date", async (t) => {
    const sent = stubFetch(t, lookup());

    await assert.rejects(
      () =>
        updatePackageExpiry({
          packageId: "pkg1",
          unlimited_storage: true,
          expiry: "2030-01-01T00:00:00Z",
        }),
      /unlimited_storage/,
    );
    assert.equal(sent.count(), 0, "a contradictory request should cost no round trip");
  });

  it("requires an expiry date when unlimited storage is off", async (t) => {
    const sent = stubFetch(t, lookup());

    await assert.rejects(
      () => updatePackageExpiry({ packageId: "pkg1", unlimited_storage: false }),
      /expiry/,
    );
    assert.equal(sent.count(), 0, "an incomplete request should cost no round trip");
  });

  it("treats an undefined expiry the same as an absent one", async (t) => {
    const sent = stubFetch(t, lookup());

    await assert.rejects(
      () => updatePackageExpiry({ packageId: "pkg1", unlimited_storage: false, expiry: undefined }),
      /expiry/,
    );
    assert.equal(sent.count(), 0);
  });
});

describe("deletePackage", () => {
  it("refuses without MASV_ALLOW_DELETE and sends no request at all", async (t) => {
    const sent = stubFetch(t, lookup());

    await assert.rejects(() => deletePackage({ packageId: "pkg1" }), /MASV_ALLOW_DELETE/);
    assert.equal(sent.count(), 0, "the gate must close before the package lookup");
  });
});
