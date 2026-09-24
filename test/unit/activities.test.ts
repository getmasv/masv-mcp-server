import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { getActivities, getActivityEvents } from "../../src/api/activities.ts";

describe("getActivities", () => {
  it("forwards page to the query string", async (t) => {
    const f = t.mock.method(globalThis, "fetch", async () => Response.json({ activities: [] }));

    await getActivities({ page: 4, limit: 20 });

    const url = f.mock.calls[0].arguments[0] as string;
    assert.match(url, /[?&]page=4(&|$)/, `page missing from ${url}`);
    assert.match(url, /[?&]limit=20(&|$)/, `limit missing from ${url}`);
  });

  it("surfaces an API error instead of returning the error body as data", async (t) => {
    t.mock.method(globalThis, "fetch", async () =>
      Response.json({ error: "unauthorized" }, { status: 401 }),
    );

    await assert.rejects(() => getActivities({}), /401/);
  });
});

describe("getActivityEvents", () => {
  it("surfaces an API error instead of returning the error body as data", async (t) => {
    t.mock.method(globalThis, "fetch", async () =>
      Response.json({ error: "no such activity" }, { status: 404 }),
    );

    await assert.rejects(() => getActivityEvents({ activityId: "bogus" }), /404/);
  });
});
