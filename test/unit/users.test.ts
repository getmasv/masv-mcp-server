import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { getTeamMembers } from "../../src/api/users.ts";

describe("getTeamMembers", () => {
  it("requests the team's members with the API key", async (t) => {
    const f = t.mock.method(globalThis, "fetch", async () =>
      Response.json([{ membership_id: "m1", email: "editor@example.com" }]),
    );

    const data = await getTeamMembers({});

    assert.deepEqual(data, [{ membership_id: "m1", email: "editor@example.com" }]);
    assert.match(f.mock.calls[0].arguments[0] as string, /\/v1\/teams\/test-team\/members$/);

    const init = f.mock.calls[0].arguments[1] as RequestInit;
    assert.equal((init.headers as Record<string, string>)["x-api-key"], "test-key");
    assert.equal(init.method, undefined, "a read must not send a method override");
  });

  it("returns an error for a 403", async (t) => {
    t.mock.method(globalThis, "fetch", async () =>
      Response.json({ error: "insufficient permissions" }, { status: 403 }),
    );

    await assert.rejects(() => getTeamMembers({}), /403/);
  });
});
