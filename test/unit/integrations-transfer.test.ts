// transferFilesFromIntegration is the longest chain in the server: look up the
// integration for its provider, create a package, then start the transfer with the
// token that package came back with. Each step depends on a field from the one
// before, so the tests check both the request sequence and what happens when a step
// returns something incomplete.

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { transferFilesFromIntegration } from "../../src/api/integrations.ts";
import { json, stubFetch } from "../helpers/fetch-stub.ts";

const files = [{ id: "f1", name: "clip.mov", kind: "file" as const }];

const integration = () => json({ id: "int1", provider: "aws_s3" });
const newPackage = () => json({ id: "pkg1", access_token: "tok-abc" });
const startedTransfer = () => json({ id: "tr1", state: "started" });

function transfer(overrides = {}) {
  return transferFilesFromIntegration({
    integrationId: "int1",
    files,
    packageName: "Day 1",
    ...overrides,
  });
}

describe("transferFilesFromIntegration", () => {
  it("reports the package, transfer and state the API returned", async (t) => {
    stubFetch(t, integration(), newPackage(), startedTransfer());

    const out = await transfer();

    assert.match(out, /Package ID: pkg1/);
    assert.match(out, /Transfer ID: tr1/);
    assert.match(out, /Status: started/);
  });

  it("tells the agent how to follow the transfer it just started", async (t) => {
    // The tool returns before the transfer finishes, so the result has to say how to
    // check on it or the agent has nothing to do but guess.
    stubFetch(t, integration(), newPackage(), startedTransfer());

    const out = await transfer();

    assert.match(out, /get_activities/);
    assert.match(out, /pkg1/);
  });

  it("authenticates the transfer with the token from the new package", async (t) => {
    const sent = stubFetch(t, integration(), newPackage(), startedTransfer());

    await transfer();

    assert.equal(sent.headers(1)["x-api-key"], "test-key", "the package is made with the team key");
    assert.equal(sent.headers(2)["x-package-token"], "tok-abc");
    assert.match(sent.url(2), /\/v1\/packages\/pkg1\/transfer$/);
  });

  it("sends the integration's provider and the cloud_to_masv direction", async (t) => {
    const sent = stubFetch(t, integration(), newPackage(), startedTransfer());

    await transfer();

    assert.deepEqual(sent.requestJson(2), {
      cloud_connection_id: "int1",
      direction: "cloud_to_masv",
      provider: "aws_s3",
      files,
    });
  });

  it("includes notify_email only when one was given", async (t) => {
    const withEmail = stubFetch(t, integration(), newPackage(), startedTransfer());
    await transfer({ notifyEmail: "editor@example.com" });
    assert.equal(withEmail.requestJson(2).notify_email, "editor@example.com");

    t.mock.restoreAll();

    const without = stubFetch(t, integration(), newPackage(), startedTransfer());
    await transfer();
    assert.equal("notify_email" in without.requestJson(2), false);
  });

  it("applies the documented defaults for description, recipients and access limit", async (t) => {
    const sent = stubFetch(t, integration(), newPackage(), startedTransfer());

    await transfer();

    assert.deepEqual(sent.requestJson(1), {
      name: "Day 1",
      description: "",
      recipients: [],
      access_limit: 5,
    });
  });

  it("passes recipients and an access limit through when given", async (t) => {
    const sent = stubFetch(t, integration(), newPackage(), startedTransfer());

    await transfer({
      packageDescription: "dailies",
      recipients: ["colorist@example.com"],
      accessLimit: 1,
    });

    assert.deepEqual(sent.requestJson(1), {
      name: "Day 1",
      description: "dailies",
      recipients: ["colorist@example.com"],
      access_limit: 1,
    });
  });

  it("distinguishes directories from files in what it echoes back", async (t) => {
    stubFetch(t, integration(), newPackage(), startedTransfer());

    const out = await transfer({
      files: [
        { id: "d1", name: "dailies", kind: "directory" },
        { id: "f1", name: "clip.mov", kind: "file" },
      ],
    });

    assert.match(out, /\[DIR\] dailies\//);
    assert.match(out, /\[FILE\] clip\.mov/);
    assert.match(out, /\(2 items\)/);
  });

  it("truncates the echoed file list at ten and counts the rest", async (t) => {
    stubFetch(t, integration(), newPackage(), startedTransfer());

    const out = await transfer({
      files: Array.from({ length: 12 }, (_, i) => ({
        id: `f${i}`,
        name: `clip${i}.mov`,
        kind: "file" as const,
      })),
    });

    assert.match(out, /\(12 items\)/);
    assert.match(out, /and 2 more items/);
  });

  it("lists all files when there are exactly ten", async (t) => {
    stubFetch(t, integration(), newPackage(), startedTransfer());

    const out = await transfer({
      files: Array.from({ length: 10 }, (_, i) => ({
        id: `f${i}`,
        name: `clip${i}.mov`,
        kind: "file" as const,
      })),
    });

    assert.doesNotMatch(out, /more items/, "ten is not more than ten");
  });
});

describe("transferFilesFromIntegration failures", () => {
  it("fails before creating a package when the integration lookup fails", async (t) => {
    const sent = stubFetch(t, json({ error: "no such integration" }, 404));

    await assert.rejects(() => transfer({ integrationId: "nope" }), /404/);
    assert.equal(sent.count(), 1, "no package should be created");
  });

  it("fails without starting a transfer when package creation fails", async (t) => {
    const sent = stubFetch(t, integration(), json({ error: "quota exceeded" }, 402));

    await assert.rejects(() => transfer(), /402/);
    assert.equal(sent.count(), 2, "the transfer must not be attempted");
  });

  it("fails clearly when the new package carries no token", async (t) => {
    // Without this the transfer goes out with `x-package-token: undefined`, which
    // fails as a 401 that says nothing about the package that was just created.
    const sent = stubFetch(t, integration(), json({ id: "pkg1" }));

    await assert.rejects(
      () => transfer(),
      (err: Error) => {
        assert.match(err.message, /token/i, err.message);
        assert.doesNotMatch(err.message, /undefined/);
        return true;
      },
    );
    assert.equal(sent.count(), 2, "the transfer must not be attempted");
  });

  it("fails clearly when the new package carries no id", async (t) => {
    stubFetch(t, integration(), json({ access_token: "tok-abc" }));

    await assert.rejects(
      () => transfer(),
      (err: Error) => {
        assert.match(err.message, /id/i, err.message);
        assert.doesNotMatch(err.message, /undefined/);
        return true;
      },
    );
  });

  it("reports a failure to start the transfer after the package exists", async (t) => {
    stubFetch(t, integration(), newPackage(), json({ error: "gateway offline" }, 503));

    await assert.rejects(() => transfer(), /503/);
  });
});
