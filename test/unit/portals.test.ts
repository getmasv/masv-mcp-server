import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  createPortal,
  deletePortal,
  getPortal,
  getPortals,
  updatePortal,
} from "../../src/api/portals.ts";
import { json, stubFetch } from "../helpers/fetch-stub.ts";

describe("getPortals", () => {
  it("forwards page, limit and sort", async (t) => {
    const sent = stubFetch(t, json({ portals: [] }));

    await getPortals({ page: 2, limit: 50, sort: "-created_at" });

    assert.match(sent.url(), /[?&]page=2(&|$)/, sent.url());
    assert.match(sent.url(), /[?&]limit=50(&|$)/, sent.url());
    assert.match(sent.url(), /[?&]sort=-created_at(&|$)/, sent.url());
  });

  it("omits page, limit and sort when they are undefined", async (t) => {
    const sent = stubFetch(t, json({ portals: [] }));

    await getPortals({ page: undefined, limit: undefined, sort: undefined });

    assert.doesNotMatch(sent.url(), /page=|limit=|sort=/, sent.url());
  });

  it("joins array values with commas rather than repeating the key", async (t) => {
    // MASV expects tags=a,b. Repeating the key does not filter, so the caller gets an
    // unfiltered portal list and nothing reports a problem. packages.ts and
    // activities.ts already serialise this way.
    const sent = stubFetch(t, json({ portals: [] }));

    await getPortals({ tags: ["t1", "t2"], teamspaces: ["ts1", "ts2"] });

    assert.match(sent.url(), /tags=t1%2Ct2/, sent.url());
    assert.match(sent.url(), /teamspaces=ts1%2Cts2/, sent.url());
    assert.doesNotMatch(sent.url(), /tags=t1&tags=t2/, "key must not repeat");
  });

  it("returns an error for a 401", async (t) => {
    stubFetch(t, json({ error: "unauthorized" }, 401));

    await assert.rejects(() => getPortals({}), /401/);
  });
});

describe("getPortal", () => {
  it("requests the portal by id", async (t) => {
    const sent = stubFetch(t, json({ id: "p1" }));

    await getPortal({ portalId: "p1" });

    assert.match(sent.url(), /\/v1\.1\/portals\/p1$/);
    assert.equal(sent.headers()["x-api-key"], "test-key");
  });

  it("returns an error for a 404", async (t) => {
    stubFetch(t, json({ error: "not found" }, 404));

    await assert.rejects(() => getPortal({ portalId: "nope" }), /404/);
  });
});

describe("createPortal", () => {
  it("posts the portal body", async (t) => {
    const sent = stubFetch(t, json({ id: "p1" }));

    await createPortal({ name: "Intake", subdomain: "intake" });

    assert.equal(sent.method(), "POST");
    assert.deepEqual(sent.requestJson(), { name: "Intake", subdomain: "intake" });
    assert.match(sent.url(), /\/v1\/teams\/test-team\/portals$/);
  });

  it("returns an error when the subdomain is taken", async (t) => {
    stubFetch(t, json({ error: "subdomain in use" }, 409));

    await assert.rejects(() => createPortal({ name: "Intake", subdomain: "intake" }), /409/);
  });
});

describe("updatePortal", () => {
  it("puts the body without the portal id, which travels in the path", async (t) => {
    const sent = stubFetch(t, json({ id: "p1" }));

    await updatePortal({ portalId: "p1", name: "Intake", subdomain: "intake", active: false });

    assert.equal(sent.method(), "PUT");
    assert.match(sent.url(), /\/v1\/portals\/p1$/);

    const body = sent.requestJson();
    assert.deepEqual(body, { name: "Intake", subdomain: "intake", active: false });
    assert.equal("portalId" in body, false, "portalId belongs in the path, not the body");
  });

  it("keeps active: false in the body rather than dropping a falsy value", async (t) => {
    // Deactivating a portal is the obvious use for this tool, and a truthiness check
    // anywhere in the body building would silently turn it into a no-op.
    const sent = stubFetch(t, json({ id: "p1" }));

    await updatePortal({ portalId: "p1", name: "Intake", subdomain: "intake", active: false });

    assert.equal(sent.requestJson().active, false);
  });

  it("returns an error for a 404", async (t) => {
    stubFetch(t, json({ error: "not found" }, 404));

    await assert.rejects(
      () => updatePortal({ portalId: "nope", name: "Intake", subdomain: "intake" }),
      /404/,
    );
  });
});

describe("deletePortal", () => {
  it("refuses without MASV_ALLOW_DELETE and sends no request", async (t) => {
    const sent = stubFetch(t, json({}));

    await assert.rejects(() => deletePortal({ portalId: "p1" }), /MASV_ALLOW_DELETE/);
    assert.equal(sent.count(), 0);
  });
});
