// The delete tools are the only irreversible operations in the server, so both sides
// of their gate are worth pinning, along with the request each one actually sends.
//
// env.ts reads MASV_ALLOW_DELETE at call time rather than caching it at import, which
// is what lets these run in-process like every other test.

import { describe, it, type TestContext } from "node:test";
import assert from "node:assert/strict";

import { deletePackage } from "../../src/api/packages.ts";
import { deletePortal } from "../../src/api/portals.ts";
import { json, noContent, stubFetch } from "../helpers/fetch-stub.ts";

/** Opens the gate for one test and closes it again afterwards. */
function allowDelete(t: TestContext) {
  process.env.MASV_ALLOW_DELETE = "true";
  t.after(() => {
    delete process.env.MASV_ALLOW_DELETE;
  });
}

const lookup = () => json({ id: "pkg1", access_token: "tok-abc" });

describe("deletePackage with the gate closed", () => {
  it("refuses and sends no request at all", async (t) => {
    const sent = stubFetch(t, lookup());

    await assert.rejects(() => deletePackage({ packageId: "pkg1" }), /MASV_ALLOW_DELETE/);
    assert.equal(sent.count(), 0, "the gate must close before the package lookup");
  });

  it("names the variable that would open it", async (t) => {
    stubFetch(t);

    await assert.rejects(() => deletePackage({ packageId: "pkg1" }), /Set MASV_ALLOW_DELETE=true/);
  });
});

describe("deletePackage with the gate open", () => {
  it("sends DELETE with the package token", async (t) => {
    allowDelete(t);
    const sent = stubFetch(t, lookup(), noContent());

    await deletePackage({ packageId: "pkg1" });

    assert.equal(sent.count(), 2);
    assert.equal(sent.method(1), "DELETE");
    assert.match(sent.url(1), /\/v1\/packages\/pkg1$/);
    assert.equal(sent.headers(1)["x-package-token"], "tok-abc");
    assert.equal(sent.headers(1)["x-api-key"], undefined, "the team key must not be sent");
  });

  it("reports success for a 204 with no body", async (t) => {
    allowDelete(t);
    stubFetch(t, lookup(), noContent());

    assert.deepEqual(await deletePackage({ packageId: "pkg1" }), {
      success: true,
      message: "Package deleted successfully",
    });
  });

  it("returns the API's own body when it answers with one", async (t) => {
    allowDelete(t);
    stubFetch(t, lookup(), json({ id: "pkg1", state: "archived" }));

    assert.deepEqual(await deletePackage({ packageId: "pkg1" }), {
      id: "pkg1",
      state: "archived",
    });
  });

  it("surfaces an API refusal rather than claiming success", async (t) => {
    allowDelete(t);
    stubFetch(t, lookup(), json({ error: "package is locked" }, 409));

    await assert.rejects(
      () => deletePackage({ packageId: "pkg1" }),
      (err: Error) => {
        assert.match(err.message, /409/);
        assert.match(err.message, /package is locked/);
        return true;
      },
    );
  });

  it("fails on the package lookup without attempting the delete", async (t) => {
    allowDelete(t);
    const sent = stubFetch(t, json({ error: "not found" }, 404));

    await assert.rejects(() => deletePackage({ packageId: "bogus" }), /404/);
    assert.equal(sent.count(), 1, "nothing should be deleted after a failed lookup");
  });
});

describe("deletePortal with the gate closed", () => {
  it("refuses and sends no request at all", async (t) => {
    const sent = stubFetch(t, json({}));

    await assert.rejects(() => deletePortal({ portalId: "p1" }), /MASV_ALLOW_DELETE/);
    assert.equal(sent.count(), 0);
  });
});

describe("deletePortal with the gate open", () => {
  it("sends DELETE with the team API key and needs no package token", async (t) => {
    allowDelete(t);
    const sent = stubFetch(t, noContent());

    await deletePortal({ portalId: "p1" });

    assert.equal(sent.count(), 1, "a portal delete is a single request");
    assert.equal(sent.method(), "DELETE");
    assert.match(sent.url(), /\/v1\/portals\/p1$/);
    assert.equal(sent.headers()["x-api-key"], "test-key");
  });

  it("reports success for a 204 with no body", async (t) => {
    allowDelete(t);
    stubFetch(t, noContent());

    assert.deepEqual(await deletePortal({ portalId: "p1" }), {
      success: true,
      message: "Portal deleted successfully",
    });
  });

  it("surfaces an API refusal rather than claiming success", async (t) => {
    allowDelete(t);
    stubFetch(t, json({ error: "portal has active uploads" }, 409));

    await assert.rejects(() => deletePortal({ portalId: "p1" }), /409/);
  });
});

describe("the gate closes again between tests", () => {
  // Guards the cleanup above: a leaked MASV_ALLOW_DELETE would make the closed-gate
  // tests pass or fail depending on file ordering, which is the worst kind of flake.
  it("is closed by default", async (t) => {
    const sent = stubFetch(t);

    await assert.rejects(() => deletePortal({ portalId: "p1" }), /MASV_ALLOW_DELETE/);
    assert.equal(sent.count(), 0);
  });
});
