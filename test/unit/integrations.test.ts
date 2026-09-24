import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  formatFileSize,
  getIntegrations,
  listFilesOnIntegration,
  sendPackageToIntegration,
  transferFilesFromIntegration,
} from "../../src/api/integrations.ts";

function stubSequence(
  t: { mock: { method: typeof import("node:test").mock.method } },
  responses: (() => Response)[],
) {
  let call = 0;
  return t.mock.method(globalThis, "fetch", async () => {
    const next = responses[call++];
    if (!next) throw new Error(`unexpected fetch call ${call}`);
    return next();
  });
}

const cloudIntegration = () => Response.json({ id: "int1", provider: "aws_s3" });
const gatewayIntegration = () => Response.json({ id: "int1", provider: "desktop_sg" });

/** `count` cloud files; the one at `emptyIdAt`, if given, has a blank id. */
function cloudFiles(count: number, emptyIdAt?: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: i === emptyIdAt ? "" : `f${i}`,
    name: `file${i}.mov`,
    kind: "file",
    size: 1024,
  }));
}

function cursorFrom(output: string) {
  return output.match(/cursor: (\S+)/)?.[1];
}

function decode(cursor: string) {
  return JSON.parse(Buffer.from(cursor, "base64").toString("utf8"));
}

describe("formatFileSize", () => {
  it("handles zero without a unit conversion", () => {
    assert.equal(formatFileSize(0), "0 B");
  });

  it("stays in bytes below the first boundary", () => {
    assert.equal(formatFileSize(1), "1.00 B");
    assert.equal(formatFileSize(1023), "1023.00 B");
  });

  it("steps up exactly at each 1024 boundary", () => {
    assert.equal(formatFileSize(1024), "1.00 KiB");
    assert.equal(formatFileSize(1024 ** 2), "1.00 MiB");
    assert.equal(formatFileSize(1024 ** 3), "1.00 GiB");
    assert.equal(formatFileSize(1024 ** 4), "1.00 TiB");
  });

  it("clamps at TiB instead of inventing a larger unit", () => {
    assert.equal(formatFileSize(1024 ** 5), "1024.00 TiB");
    assert.equal(formatFileSize(1024 ** 6), "1048576.00 TiB");
  });
});

describe("getIntegrations", () => {
  it("lists the team's connected storage", async (t) => {
    const f = stubSequence(t, [() => Response.json([{ id: "int1" }])]);

    assert.deepEqual(await getIntegrations(), [{ id: "int1" }]);
    assert.match(
      f.mock.calls[0].arguments[0] as string,
      /\/v1\/teams\/test-team\/cloud_connections$/,
    );
  });

  it("returns an error for a 401", async (t) => {
    t.mock.method(globalThis, "fetch", async () => Response.json({}, { status: 401 }));

    await assert.rejects(() => getIntegrations(), /401/);
  });
});

describe("listFilesOnIntegration, cloud provider", () => {
  it("asks for one more file than a page to detect a next page", async (t) => {
    const f = stubSequence(t, [cloudIntegration, () => Response.json(cloudFiles(10))]);

    await listFilesOnIntegration({ integrationId: "int1" });

    const url = f.mock.calls[1].arguments[0] as string;
    assert.match(url, /count=51/, url);
  });

  it("offers no cursor when the page is not full", async (t) => {
    stubSequence(t, [cloudIntegration, () => Response.json(cloudFiles(10))]);

    const out = await listFilesOnIntegration({ integrationId: "int1" });

    assert.equal(cursorFrom(out), undefined);
    assert.doesNotMatch(out, /More results/);
  });

  it("returns a page of 50 and a cursor built from the last file", async (t) => {
    stubSequence(t, [cloudIntegration, () => Response.json(cloudFiles(51))]);

    const out = await listFilesOnIntegration({ integrationId: "int1" });

    assert.equal(out.split("\n").filter((l) => l.startsWith("[FILE]")).length, 50);

    const cursor = cursorFrom(out);
    assert.ok(cursor, "a full page must offer a cursor");
    assert.deepEqual(decode(cursor), { type: "cloud", last_file_path: "f49" });
  });

  it("sends the decoded cursor back as prev_key", async (t) => {
    const cursor = Buffer.from(JSON.stringify({ type: "cloud", last_file_path: "f49" })).toString(
      "base64",
    );
    const f = stubSequence(t, [cloudIntegration, () => Response.json(cloudFiles(5))]);

    await listFilesOnIntegration({ integrationId: "int1", cursor });

    assert.match(f.mock.calls[1].arguments[0] as string, /prev_key=f49/);
  });

  it("refuses a cursor belonging to the other pagination scheme", async (t) => {
    const cursor = Buffer.from(JSON.stringify({ type: "storage_gateway", offset: 50 })).toString(
      "base64",
    );
    stubSequence(t, [cloudIntegration]);

    await assert.rejects(
      () => listFilesOnIntegration({ integrationId: "int1", cursor }),
      /cursor/i,
    );
  });

  it("never emits a cursor that would restart from the first page", async (t) => {
    // The cursor is built from the last file's id. An empty id encodes an empty
    // prev_key, which the API reads as "start from the beginning" — so an agent
    // paginating would loop over page 1 forever without ever seeing an error.
    // Index 49 is the last file of the returned page of 50.
    stubSequence(t, [cloudIntegration, () => Response.json(cloudFiles(51, 49))]);

    const out = await listFilesOnIntegration({ integrationId: "int1" });
    const cursor = cursorFrom(out);

    if (cursor) {
      assert.notEqual(decode(cursor).last_file_path, "", "cursor must not encode an empty path");
    }
    assert.match(out, /could not|cannot/i, "truncation must be stated rather than silent");
  });

  it("passes a path through as the cloud prefix", async (t) => {
    const f = stubSequence(t, [cloudIntegration, () => Response.json(cloudFiles(1))]);

    await listFilesOnIntegration({ integrationId: "int1", path: "footage/day1" });

    assert.match(f.mock.calls[1].arguments[0] as string, /prefix=footage%2Fday1/);
  });

  it("treats a non-array cloud body as an empty listing", async (t) => {
    stubSequence(t, [cloudIntegration, () => Response.json({ unexpected: true })]);

    assert.equal(await listFilesOnIntegration({ integrationId: "int1" }), "");
  });
});

describe("listFilesOnIntegration, storage gateway", () => {
  it("reads files from the gateway endpoint with an offset", async (t) => {
    const f = stubSequence(t, [
      gatewayIntegration,
      () => Response.json({ files: cloudFiles(10), more_data: false }),
    ]);

    await listFilesOnIntegration({ integrationId: "int1" });

    const url = f.mock.calls[1].arguments[0] as string;
    assert.match(url, /providers\/storage_gateway\/int1\/files/, url);
    assert.match(url, /offset=0/, url);
    assert.match(url, /count=51/, url);
  });

  it("advances the offset by the number of files it actually returned", async (t) => {
    stubSequence(t, [
      gatewayIntegration,
      () => Response.json({ files: cloudFiles(51), more_data: true }),
    ]);

    const out = await listFilesOnIntegration({ integrationId: "int1" });
    const cursor = cursorFrom(out);

    assert.ok(cursor);
    assert.deepEqual(decode(cursor), { type: "storage_gateway", offset: 50 });
  });

  it("does not skip files when the gateway reports more data on a short page", async (t) => {
    // A cursor that jumps a whole page past a 10-file response silently loses
    // files 10 through 49.
    stubSequence(t, [
      gatewayIntegration,
      () => Response.json({ files: cloudFiles(10), more_data: true }),
    ]);

    const out = await listFilesOnIntegration({ integrationId: "int1" });
    const cursor = cursorFrom(out);

    assert.ok(cursor, "more_data means another page exists");
    assert.equal(decode(cursor).offset, 10, "offset must continue where the page ended");
  });

  it("uses the offset from a supplied gateway cursor", async (t) => {
    const cursor = Buffer.from(JSON.stringify({ type: "storage_gateway", offset: 50 })).toString(
      "base64",
    );
    const f = stubSequence(t, [
      gatewayIntegration,
      () => Response.json({ files: cloudFiles(1), more_data: false }),
    ]);

    await listFilesOnIntegration({ integrationId: "int1", cursor });

    assert.match(f.mock.calls[1].arguments[0] as string, /offset=50/);
  });

  it("treats a missing files array as an empty listing", async (t) => {
    stubSequence(t, [gatewayIntegration, () => Response.json({ more_data: false })]);

    assert.equal(await listFilesOnIntegration({ integrationId: "int1" }), "");
  });

  it("marks directories and formats file sizes", async (t) => {
    stubSequence(t, [
      gatewayIntegration,
      () =>
        Response.json({
          files: [
            { id: "d1", name: "dailies", kind: "directory" },
            { id: "f1", name: "clip.mov", kind: "file", size: 2048 },
            { id: "f2", name: "unknown.mov", kind: "file" },
          ],
          more_data: false,
        }),
    ]);

    const out = await listFilesOnIntegration({ integrationId: "int1" });

    assert.match(out, /\[DIR\] dailies\//);
    assert.match(out, /\[FILE\] clip\.mov \(2\.00 KiB\)/);
    assert.match(out, /\[FILE\] unknown\.mov \(unknown\)/);
  });
});

describe("sendPackageToIntegration", () => {
  it("posts the integration id with the package token", async (t) => {
    const f = stubSequence(t, [
      () => Response.json({ id: "pkg1", access_token: "tok-abc" }),
      () => Response.json({ id: "tr1", state: "started" }),
    ]);

    await sendPackageToIntegration({ packageId: "pkg1", integrationId: "int1" });

    const init = f.mock.calls[1].arguments[1] as RequestInit;
    assert.equal(init.method, "POST");
    assert.equal((init.headers as Record<string, string>)["x-package-token"], "tok-abc");
    assert.deepEqual(JSON.parse(init.body as string), { cloud_connection_id: "int1" });
  });
});

describe("transferFilesFromIntegration", () => {
  const files = [{ id: "f1", name: "clip.mov", kind: "file" as const }];

  function happyPath() {
    return [
      cloudIntegration,
      () => Response.json({ id: "pkg1", access_token: "tok-abc" }),
      () => Response.json({ id: "tr1", state: "started" }),
    ];
  }

  it("reports the package, transfer and state the API returned", async (t) => {
    stubSequence(t, happyPath());

    const out = await transferFilesFromIntegration({
      integrationId: "int1",
      files,
      packageName: "Day 1",
    });

    assert.match(out, /Package ID: pkg1/);
    assert.match(out, /Transfer ID: tr1/);
    assert.match(out, /Status: started/);
  });

  it("authenticates the transfer with the token from the new package", async (t) => {
    const f = stubSequence(t, happyPath());

    await transferFilesFromIntegration({ integrationId: "int1", files, packageName: "Day 1" });

    const createInit = f.mock.calls[1].arguments[1] as RequestInit;
    assert.equal((createInit.headers as Record<string, string>)["x-api-key"], "test-key");

    const transferInit = f.mock.calls[2].arguments[1] as RequestInit;
    assert.equal((transferInit.headers as Record<string, string>)["x-package-token"], "tok-abc");
    assert.match(f.mock.calls[2].arguments[0] as string, /\/v1\/packages\/pkg1\/transfer$/);
  });

  it("sends the integration's provider and the cloud_to_masv direction", async (t) => {
    const f = stubSequence(t, happyPath());

    await transferFilesFromIntegration({ integrationId: "int1", files, packageName: "Day 1" });

    assert.deepEqual(JSON.parse((f.mock.calls[2].arguments[1] as RequestInit).body as string), {
      cloud_connection_id: "int1",
      direction: "cloud_to_masv",
      provider: "aws_s3",
      files,
    });
  });

  it("includes notify_email only when one was given", async (t) => {
    const f = stubSequence(t, happyPath());

    await transferFilesFromIntegration({
      integrationId: "int1",
      files,
      packageName: "Day 1",
      notifyEmail: "editor@example.com",
    });

    const body = JSON.parse((f.mock.calls[2].arguments[1] as RequestInit).body as string);
    assert.equal(body.notify_email, "editor@example.com");
  });

  it("applies the documented default access limit", async (t) => {
    const f = stubSequence(t, happyPath());

    await transferFilesFromIntegration({ integrationId: "int1", files, packageName: "Day 1" });

    const body = JSON.parse((f.mock.calls[1].arguments[1] as RequestInit).body as string);
    assert.equal(body.access_limit, 5);
  });

  it("distinguishes directories from files in what it echoes back", async (t) => {
    stubSequence(t, happyPath());

    const out = await transferFilesFromIntegration({
      integrationId: "int1",
      packageName: "Day 1",
      files: [
        { id: "d1", name: "dailies", kind: "directory" },
        { id: "f1", name: "clip.mov", kind: "file" },
      ],
    });

    assert.match(out, /\[DIR\] dailies\//);
    assert.match(out, /\[FILE\] clip\.mov/);
    assert.match(out, /\(2 items\)/);
  });

  it("truncates the file list it echoes back", async (t) => {
    stubSequence(t, happyPath());

    const many = Array.from({ length: 12 }, (_, i) => ({
      id: `f${i}`,
      name: `clip${i}.mov`,
      kind: "file" as const,
    }));

    const out = await transferFilesFromIntegration({
      integrationId: "int1",
      files: many,
      packageName: "Day 1",
    });

    assert.match(out, /\(12 items\)/);
    assert.match(out, /and 2 more items/);
  });

  it("fails before creating a package when the integration lookup fails", async (t) => {
    const f = stubSequence(t, [
      () => Response.json({ error: "no such integration" }, { status: 404 }),
    ]);

    await assert.rejects(
      () => transferFilesFromIntegration({ integrationId: "nope", files, packageName: "Day 1" }),
      /404/,
    );
    assert.equal(f.mock.callCount(), 1, "no package should be created");
  });

  it("fails without starting a transfer when package creation fails", async (t) => {
    const f = stubSequence(t, [
      cloudIntegration,
      () => Response.json({ error: "quota exceeded" }, { status: 402 }),
    ]);

    await assert.rejects(
      () => transferFilesFromIntegration({ integrationId: "int1", files, packageName: "Day 1" }),
      /402/,
    );
    assert.equal(f.mock.callCount(), 2, "the transfer must not be attempted");
  });

  it("fails clearly when the new package carries no token", async (t) => {
    stubSequence(t, [cloudIntegration, () => Response.json({ id: "pkg1" })]);

    await assert.rejects(
      () => transferFilesFromIntegration({ integrationId: "int1", files, packageName: "Day 1" }),
      (err: Error) => {
        assert.match(err.message, /token/i, err.message);
        assert.doesNotMatch(err.message, /undefined/);
        return true;
      },
    );
  });
});
