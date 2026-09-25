// listFilesOnIntegration has two pagination schemes behind one tool: cloud providers
// page by the last file's path, storage gateways page by offset. Which one applies is
// decided by the provider on the integration, so every call here is two requests —
// the integration lookup, then the listing.
//
// Both schemes can lose data silently, which is why the cursor gets this much
// attention: a cursor that points backwards or skips ahead produces no error, just a
// wrong answer that an agent will act on.

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { listFilesOnIntegration } from "../../src/api/integrations.ts";
import { json, stubFetch } from "../helpers/fetch-stub.ts";

const PAGE_SIZE = 50;

const cloudProvider = () => json({ id: "int1", provider: "aws_s3" });
const gatewayProvider = () => json({ id: "int1", provider: "desktop_sg" });

/** `count` files; the one at `emptyIdAt`, if given, has a blank id. */
function files(count: number, emptyIdAt?: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: i === emptyIdAt ? "" : `f${i}`,
    name: `file${i}.mov`,
    kind: "file",
    size: 1024,
  }));
}

function cursorIn(output: string) {
  return output.match(/cursor: (\S+)/)?.[1];
}

function decode(cursor: string) {
  return JSON.parse(Buffer.from(cursor, "base64").toString("utf8"));
}

function encode(cursor: object) {
  return Buffer.from(JSON.stringify(cursor)).toString("base64");
}

function fileLines(output: string) {
  return output.split("\n").filter((line) => line.startsWith("[FILE]"));
}

describe("listFilesOnIntegration, cloud provider", () => {
  it("asks for one more file than a page to detect a next page", async (t) => {
    const sent = stubFetch(t, cloudProvider(), json(files(10)));

    await listFilesOnIntegration({ integrationId: "int1" });

    assert.match(sent.url(1), /count=51/, sent.url(1));
  });

  it("offers no cursor when the page is not full", async (t) => {
    stubFetch(t, cloudProvider(), json(files(10)));

    const out = await listFilesOnIntegration({ integrationId: "int1" });

    assert.equal(cursorIn(out), undefined);
    assert.doesNotMatch(out, /More results/);
  });

  it("returns a page of 50 and a cursor built from the last file", async (t) => {
    stubFetch(t, cloudProvider(), json(files(PAGE_SIZE + 1)));

    const out = await listFilesOnIntegration({ integrationId: "int1" });

    assert.equal(fileLines(out).length, PAGE_SIZE, "the look-ahead file must not be shown");

    const cursor = cursorIn(out);
    assert.ok(cursor, "a full page must offer a cursor");
    assert.deepEqual(decode(cursor), { type: "cloud", last_file_path: "f49" });
  });

  it("sends the decoded cursor back as prev_key", async (t) => {
    const sent = stubFetch(t, cloudProvider(), json(files(5)));

    await listFilesOnIntegration({
      integrationId: "int1",
      cursor: encode({ type: "cloud", last_file_path: "f49" }),
    });

    assert.match(sent.url(1), /prev_key=f49/);
  });

  it("refuses a cursor belonging to the other pagination scheme", async (t) => {
    stubFetch(t, cloudProvider());

    await assert.rejects(
      () =>
        listFilesOnIntegration({
          integrationId: "int1",
          cursor: encode({ type: "storage_gateway", offset: 50 }),
        }),
      /cursor/i,
    );
  });

  it("never emits a cursor that would restart from the first page", async (t) => {
    // The cursor is the last file's id. An empty id encodes an empty prev_key, which
    // the API reads as "start from the beginning" — so an agent paginating on it
    // loops over page 1 forever and never sees an error. Index 49 is the last file
    // of the returned page of 50.
    stubFetch(t, cloudProvider(), json(files(PAGE_SIZE + 1, 49)));

    const out = await listFilesOnIntegration({ integrationId: "int1" });

    assert.equal(cursorIn(out), undefined, "no cursor is better than a backwards one");
    assert.match(out, /cannot continue/i, "truncation must be stated rather than silent");
  });

  it("passes a path through as the cloud prefix", async (t) => {
    const sent = stubFetch(t, cloudProvider(), json(files(1)));

    await listFilesOnIntegration({ integrationId: "int1", path: "footage/day1" });

    assert.match(sent.url(1), /prefix=footage%2Fday1/);
  });

  it("omits the prefix when no path was given", async (t) => {
    const sent = stubFetch(t, cloudProvider(), json(files(1)));

    await listFilesOnIntegration({ integrationId: "int1", path: undefined });

    assert.doesNotMatch(sent.url(1), /prefix=/);
  });

  it("treats a non-array cloud body as an empty listing", async (t) => {
    stubFetch(t, cloudProvider(), json({ unexpected: true }));

    assert.equal(await listFilesOnIntegration({ integrationId: "int1" }), "");
  });

  it("treats a null cloud body as an empty listing", async (t) => {
    stubFetch(t, cloudProvider(), json(null));

    assert.equal(await listFilesOnIntegration({ integrationId: "int1" }), "");
  });

  it("fails on the integration lookup without listing anything", async (t) => {
    const sent = stubFetch(t, json({ error: "no such integration" }, 404));

    await assert.rejects(() => listFilesOnIntegration({ integrationId: "nope" }), /404/);
    assert.equal(sent.count(), 1);
  });
});

describe("listFilesOnIntegration, storage gateway", () => {
  it("reads files from the gateway endpoint with an offset", async (t) => {
    const sent = stubFetch(t, gatewayProvider(), json({ files: files(10), more_data: false }));

    await listFilesOnIntegration({ integrationId: "int1" });

    assert.match(sent.url(1), /providers\/storage_gateway\/int1\/files/, sent.url(1));
    assert.match(sent.url(1), /offset=0/, sent.url(1));
    assert.match(sent.url(1), /count=51/, sent.url(1));
  });

  it("advances the offset by the number of files it actually returned", async (t) => {
    stubFetch(t, gatewayProvider(), json({ files: files(PAGE_SIZE + 1), more_data: true }));

    const out = await listFilesOnIntegration({ integrationId: "int1" });
    const cursor = cursorIn(out);

    assert.ok(cursor);
    assert.deepEqual(decode(cursor), { type: "storage_gateway", offset: PAGE_SIZE });
  });

  it("does not skip files when the gateway reports more data on a short page", async (t) => {
    // A cursor that jumps a whole page past a 10-file response loses files 10 to 49.
    stubFetch(t, gatewayProvider(), json({ files: files(10), more_data: true }));

    const out = await listFilesOnIntegration({ integrationId: "int1" });
    const cursor = cursorIn(out);

    assert.ok(cursor, "more_data means another page exists");
    assert.equal(decode(cursor).offset, 10, "offset must continue where the page ended");
  });

  it("offers no cursor when more data is claimed but no files came back", async (t) => {
    // Advancing by zero would hand back the cursor that produced this page.
    stubFetch(t, gatewayProvider(), json({ files: [], more_data: true }));

    const out = await listFilesOnIntegration({ integrationId: "int1" });

    assert.equal(cursorIn(out), undefined);
    assert.match(out, /cannot continue/i);
  });

  it("uses the offset from a supplied gateway cursor", async (t) => {
    const sent = stubFetch(t, gatewayProvider(), json({ files: files(1), more_data: false }));

    await listFilesOnIntegration({
      integrationId: "int1",
      cursor: encode({ type: "storage_gateway", offset: 50 }),
    });

    assert.match(sent.url(1), /offset=50/);
  });

  it("treats a missing files array as an empty listing", async (t) => {
    stubFetch(t, gatewayProvider(), json({ more_data: false }));

    assert.equal(await listFilesOnIntegration({ integrationId: "int1" }), "");
  });

  it("treats a null files array as an empty listing", async (t) => {
    stubFetch(t, gatewayProvider(), json({ files: null, more_data: false }));

    assert.equal(await listFilesOnIntegration({ integrationId: "int1" }), "");
  });

  it("recognises every storage gateway provider, not just one", async (t) => {
    // A provider missing from the set would silently take the cloud path and hit the
    // wrong endpoint, so the list is worth pinning.
    for (const provider of [
      "storage_gateway",
      "jellyfish_sg",
      "synology_sg",
      "qnap_sg",
      "amazon_efs_sg",
      "opendrives_sg",
      "desktop_sg",
    ]) {
      const sent = stubFetch(
        t,
        json({ id: "int1", provider }),
        json({ files: files(1), more_data: false }),
      );

      await listFilesOnIntegration({ integrationId: "int1" });

      assert.match(sent.url(1), /providers\/storage_gateway/, `${provider} took the cloud path`);
      t.mock.restoreAll();
    }
  });
});

// How a listing is rendered is covered in integrations-format.test.ts.
