// The integration module covers three separate jobs, split across three files so
// each stays readable:
//
//   integrations.test.ts          listing connected storage, sending a package to it
//   integrations-list.test.ts     browsing files, both pagination schemes
//   integrations-format.test.ts   how a listing is rendered, and size formatting
//   integrations-transfer.test.ts pulling files out of storage into a new package

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { getIntegrations, sendPackageToIntegration } from "../../src/api/integrations.ts";
import { json, stubFetch } from "../helpers/fetch-stub.ts";

describe("getIntegrations", () => {
  it("lists the team's connected storage", async (t) => {
    const sent = stubFetch(t, json([{ id: "int1", provider: "aws_s3" }]));

    assert.deepEqual(await getIntegrations(), [{ id: "int1", provider: "aws_s3" }]);
    assert.match(sent.url(), /\/v1\/teams\/test-team\/cloud_connections$/);
    assert.equal(sent.headers()["x-api-key"], "test-key");
  });

  it("returns an error for a 401", async (t) => {
    stubFetch(t, json({ error: "unauthorized" }, 401));

    await assert.rejects(() => getIntegrations(), /401/);
  });
});

describe("sendPackageToIntegration", () => {
  it("posts the integration id with the package token", async (t) => {
    const sent = stubFetch(
      t,
      json({ id: "pkg1", access_token: "tok-abc" }),
      json({ id: "tr1", state: "started" }),
    );

    await sendPackageToIntegration({ packageId: "pkg1", integrationId: "int1" });

    assert.equal(sent.method(1), "POST");
    assert.equal(sent.headers(1)["x-package-token"], "tok-abc");
    assert.equal(sent.headers(1)["x-api-key"], undefined);
    assert.deepEqual(sent.requestJson(1), { cloud_connection_id: "int1" });
    assert.match(sent.url(1), /\/v1\/packages\/pkg1\/transfer$/);
  });

  it("fails on the package lookup without attempting the transfer", async (t) => {
    const sent = stubFetch(t, json({ error: "not found" }, 404));

    await assert.rejects(
      () => sendPackageToIntegration({ packageId: "bogus", integrationId: "int1" }),
      /404/,
    );
    assert.equal(sent.count(), 1);
  });
});
