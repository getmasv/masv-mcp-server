import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  createPortal,
  deletePortal,
  getPortal,
  getPortals,
  updatePortal,
} from "../../src/api/portals.ts";

function stubFetch(t: { mock: { method: typeof import("node:test").mock.method } }, body: unknown) {
  return t.mock.method(globalThis, "fetch", async () => Response.json(body));
}

function requestedUrl(f: ReturnType<typeof stubFetch>, call = 0) {
  return f.mock.calls[call].arguments[0] as string;
}

function requestedInit(f: ReturnType<typeof stubFetch>, call = 0) {
  return f.mock.calls[call].arguments[1] as RequestInit;
}

describe("getPortals", () => {
  it("forwards page, limit and sort", async (t) => {
    const f = stubFetch(t, { portals: [] });

    await getPortals({ page: 2, limit: 50, sort: "-created_at" });

    const url = requestedUrl(f);
    assert.match(url, /[?&]page=2(&|$)/, url);
    assert.match(url, /[?&]limit=50(&|$)/, url);
    assert.match(url, /[?&]sort=-created_at(&|$)/, url);
  });

  it("joins array values with commas rather than repeating the key", async (t) => {
    // MASV expects tags=a,b. Repeating the key does not filter, so a portal list
    // comes back unfiltered and the model reports portals the user did not ask for.
    // packages.ts and activities.ts already serialise this way.
    const f = stubFetch(t, { portals: [] });

    await getPortals({ tags: ["t1", "t2"], teamspaces: ["ts1", "ts2"] });

    const url = requestedUrl(f);
    assert.match(url, /tags=t1%2Ct2/, url);
    assert.match(url, /teamspaces=ts1%2Cts2/, url);
    assert.doesNotMatch(url, /tags=t1&tags=t2/, "key must not repeat");
  });

  it("returns an error for a 401", async (t) => {
    t.mock.method(globalThis, "fetch", async () =>
      Response.json({ error: "unauthorized" }, { status: 401 }),
    );

    await assert.rejects(() => getPortals({}), /401/);
  });
});

describe("getPortal", () => {
  it("requests the portal by id", async (t) => {
    const f = stubFetch(t, { id: "p1" });

    await getPortal({ portalId: "p1" });

    assert.match(requestedUrl(f), /\/v1\.1\/portals\/p1$/);
  });

  it("returns an error for a 404", async (t) => {
    t.mock.method(globalThis, "fetch", async () =>
      Response.json({ error: "not found" }, { status: 404 }),
    );

    await assert.rejects(() => getPortal({ portalId: "nope" }), /404/);
  });
});

describe("createPortal", () => {
  it("posts the portal body", async (t) => {
    const f = stubFetch(t, { id: "p1" });

    await createPortal({ name: "Intake", subdomain: "intake" });

    const init = requestedInit(f);
    assert.equal(init.method, "POST");
    assert.deepEqual(JSON.parse(init.body as string), { name: "Intake", subdomain: "intake" });
    assert.match(requestedUrl(f), /\/v1\/teams\/test-team\/portals$/);
  });

  it("returns an error when the subdomain is taken", async (t) => {
    t.mock.method(globalThis, "fetch", async () =>
      Response.json({ error: "subdomain in use" }, { status: 409 }),
    );

    await assert.rejects(() => createPortal({ name: "Intake", subdomain: "intake" }), /409/);
  });
});

describe("updatePortal", () => {
  it("puts the body without the portal id, which travels in the path", async (t) => {
    const f = stubFetch(t, { id: "p1" });

    await updatePortal({ portalId: "p1", name: "Intake", subdomain: "intake", active: false });

    const init = requestedInit(f);
    assert.equal(init.method, "PUT");
    assert.match(requestedUrl(f), /\/v1\/portals\/p1$/);

    const body = JSON.parse(init.body as string);
    assert.deepEqual(body, { name: "Intake", subdomain: "intake", active: false });
    assert.equal("portalId" in body, false, "portalId belongs in the path, not the body");
  });
});

describe("deletePortal", () => {
  it("refuses without MASV_ALLOW_DELETE and sends no request", async (t) => {
    const f = stubFetch(t, {});

    await assert.rejects(() => deletePortal({ portalId: "p1" }), /MASV_ALLOW_DELETE/);
    assert.equal(f.mock.callCount(), 0);
  });
});
