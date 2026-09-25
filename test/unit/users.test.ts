import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { getTeamMembers } from "../../src/api/users.ts";
import { json, stubFetch } from "../helpers/fetch-stub.ts";

describe("getTeamMembers", () => {
  it("requests the team's members with the API key", async (t) => {
    const sent = stubFetch(t, json([{ membership_id: "m1", email: "editor@example.com" }]));

    const data = await getTeamMembers({});

    assert.deepEqual(data, [{ membership_id: "m1", email: "editor@example.com" }]);
    assert.match(sent.url(), /\/v1\/teams\/test-team\/members$/);
    assert.equal(sent.headers()["x-api-key"], "test-key");
    assert.equal(sent.method(), "GET");
  });

  it("returns an error for a 403", async (t) => {
    stubFetch(t, json({ error: "insufficient permissions" }, 403));

    await assert.rejects(() => getTeamMembers({}), /403/);
  });
});
