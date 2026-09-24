import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  getActivities,
  getActivitiesInformation,
  getActivityEvents,
} from "../../src/api/activities.ts";
import { json, stubFetch } from "../helpers/fetch-stub.ts";

describe("getActivities", () => {
  it("forwards page to the query string", async (t) => {
    const sent = stubFetch(t, json({ activities: [] }));

    await getActivities({ page: 4, limit: 20 });

    assert.match(sent.url(), /[?&]page=4(&|$)/, sent.url());
    assert.match(sent.url(), /[?&]limit=20(&|$)/, sent.url());
  });

  it("joins array values with commas rather than repeating the key", async (t) => {
    const sent = stubFetch(t, json({ activities: [] }));

    await getActivities({
      activity_states: ["pending", "complete"],
      activity_types: ["link_generation", "package_upload_to_masv"],
      portals: ["p1", "p2"],
    });

    assert.match(sent.url(), /activity_states=pending%2Ccomplete/, sent.url());
    assert.match(sent.url(), /activity_types=link_generation%2Cpackage_upload_to_masv/, sent.url());
    assert.match(sent.url(), /portals=p1%2Cp2/, sent.url());
    assert.doesNotMatch(sent.url(), /portals=p1&portals=p2/, "key must not repeat");
  });

  it("returns an error for a 401", async (t) => {
    stubFetch(t, json({ error: "unauthorized" }, 401));

    await assert.rejects(() => getActivities({}), /401/);
  });
});

describe("getActivities response shape", () => {
  it("attaches the activities reference text to the payload", async (t) => {
    stubFetch(t, json({ activities: [{ id: "a1" }], total: 1 }));

    const data = await getActivities({});

    assert.deepEqual(data.activities, [{ id: "a1" }]);
    assert.equal(data.total, 1, "the rest of the payload must survive");
    assert.match(data.activities_description, /MASV Activities/);
  });

  it("survives a JSON null body with a clear error", async (t) => {
    // Assigning a property to null throws a TypeError that says nothing about MASV.
    stubFetch(t, json(null));

    await assert.rejects(
      () => getActivities({}),
      (err: Error) => {
        assert.doesNotMatch(err.message, /Cannot set propert/, "must not be a raw TypeError");
        assert.match(err.message, /activit/i, err.message);
        assert.match(err.message, /null/, "the message should say what arrived");
        return true;
      },
    );
  });

  it("rejects an array body rather than silently dropping the reference text", async (t) => {
    // Assigning a named property to an array succeeds, then JSON.stringify discards
    // it, so the model never sees the description and nothing reports a problem.
    stubFetch(t, json([{ id: "a1" }]));

    await assert.rejects(
      () => getActivities({}),
      (err: Error) => {
        assert.match(err.message, /activit/i, err.message);
        assert.match(err.message, /array/, "the message should say what arrived");
        return true;
      },
    );
  });

  it("rejects a bare string body", async (t) => {
    stubFetch(t, json("not an object"));

    await assert.rejects(() => getActivities({}), /string/);
  });
});

describe("getActivitiesInformation", () => {
  it("describes every activity type the schema accepts", () => {
    // The tool exists so a model can explain activity states without guessing, so a
    // type present in the schema but absent from this text is a real gap.
    const info = getActivitiesInformation();

    for (const type of [
      "package_upload_to_masv",
      "package_download_from_masv",
      "link_generation",
      "package_transfer_masv_to_cloud",
    ]) {
      assert.match(info, new RegExp(type), `${type} is undocumented`);
    }
  });

  it("describes every state the schema accepts", () => {
    const info = getActivitiesInformation();

    for (const state of ["pending", "started", "complete", "cancelled", "error"]) {
      assert.match(info, new RegExp(`\\b${state}\\b`), `${state} is undocumented`);
    }
  });

  it("makes no network call", async (t) => {
    const sent = stubFetch(t, json({}));

    getActivitiesInformation();

    assert.equal(sent.count(), 0);
  });
});

describe("getActivityEvents", () => {
  it("requests the events for the given activity", async (t) => {
    const sent = stubFetch(t, json([]));

    await getActivityEvents({ activityId: "act1" });

    assert.match(sent.url(), /\/v1\/teams\/test-team\/activities\/act1\/events$/);
    assert.equal(sent.headers()["x-api-key"], "test-key");
  });

  it("returns an error for a 404", async (t) => {
    stubFetch(t, json({ error: "no such activity" }, 404));

    await assert.rejects(() => getActivityEvents({ activityId: "bogus" }), /404/);
  });
});
