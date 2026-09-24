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

  it("returns an error for a 401", async (t) => {
    t.mock.method(globalThis, "fetch", async () =>
      Response.json({ error: "unauthorized" }, { status: 401 }),
    );

    await assert.rejects(() => getActivities({}), /401/);
  });
});

describe("getActivityEvents", () => {
  it("returns an error for a 404", async (t) => {
    t.mock.method(globalThis, "fetch", async () =>
      Response.json({ error: "no such activity" }, { status: 404 }),
    );

    await assert.rejects(() => getActivityEvents({ activityId: "bogus" }), /404/);
  });
});

describe("getActivities query params", () => {
  it("joins array values with commas rather than repeating the key", async (t) => {
    const f = t.mock.method(globalThis, "fetch", async () => Response.json({ activities: [] }));

    await getActivities({
      activity_states: ["pending", "complete"],
      activity_types: ["link_generation", "package_upload_to_masv"],
      portals: ["p1", "p2"],
    });

    const url = f.mock.calls[0].arguments[0] as string;
    assert.match(url, /activity_states=pending%2Ccomplete/, url);
    assert.match(url, /activity_types=link_generation%2Cpackage_upload_to_masv/, url);
    assert.match(url, /portals=p1%2Cp2/, url);
    assert.doesNotMatch(url, /portals=p1&portals=p2/, "key must not repeat");
  });
});

describe("getActivities response shape", () => {
  it("attaches the activities reference text to the payload", async (t) => {
    t.mock.method(globalThis, "fetch", async () =>
      Response.json({ activities: [{ id: "a1" }], total: 1 }),
    );

    const data = await getActivities({});

    assert.deepEqual(data.activities, [{ id: "a1" }]);
    assert.equal(data.total, 1);
    assert.match(data.activities_description, /MASV Activities/);
  });

  it("survives a JSON null body with a clear error", async (t) => {
    // Assigning a property to null throws a TypeError that says nothing about MASV.
    t.mock.method(globalThis, "fetch", async () => Response.json(null));

    await assert.rejects(
      () => getActivities({}),
      (err: Error) => {
        assert.doesNotMatch(err.message, /Cannot set propert/, "must not be a raw TypeError");
        assert.match(err.message, /activit/i, err.message);
        return true;
      },
    );
  });

  it("rejects an array body rather than silently dropping the reference text", async (t) => {
    // Assigning a named property to an array succeeds, then JSON.stringify discards
    // it, so the model never sees the description and nothing reports a problem.
    t.mock.method(globalThis, "fetch", async () => Response.json([{ id: "a1" }]));

    await assert.rejects(
      () => getActivities({}),
      (err: Error) => {
        assert.match(err.message, /activit/i, err.message);
        return true;
      },
    );
  });
});

describe("getActivityEvents", () => {
  it("requests the events for the given activity", async (t) => {
    const f = t.mock.method(globalThis, "fetch", async () => Response.json([]));

    await getActivityEvents({ activityId: "act1" });

    assert.match(
      f.mock.calls[0].arguments[0] as string,
      /\/v1\/teams\/test-team\/activities\/act1\/events$/,
    );
  });
});
