// How a file listing is presented to the model: one line per entry, directories
// marked, sizes human-readable. The model has nothing but this string to work from,
// so a stray "undefined" or a mislabelled size becomes something it reports as fact.

import { describe, it, type TestContext } from "node:test";
import assert from "node:assert/strict";

import { formatFileSize, listFilesOnIntegration } from "../../src/api/integrations.ts";
import { json, stubFetch } from "../helpers/fetch-stub.ts";

const gatewayProvider = () => json({ id: "int1", provider: "desktop_sg" });

/** Lists one page of the given entries and returns the rendered output. */
async function render(t: TestContext, entries: unknown[]) {
  stubFetch(t, gatewayProvider(), json({ files: entries, more_data: false }));
  return listFilesOnIntegration({ integrationId: "int1" });
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
    // Media workflows do reach petabytes, so this is reachable rather than academic.
    assert.equal(formatFileSize(1024 ** 5), "1024.00 TiB");
    assert.equal(formatFileSize(1024 ** 6), "1048576.00 TiB");
  });
});

describe("listing output", () => {
  it("marks directories and formats file sizes", async (t) => {
    const out = await render(t, [
      { id: "d1", name: "dailies", kind: "directory" },
      { id: "f1", name: "clip.mov", kind: "file", size: 2048 },
    ]);

    assert.match(out, /\[DIR\] dailies\/ \(ID: d1\)/);
    assert.match(out, /\[FILE\] clip\.mov \(2\.00 KiB\) \(ID: f1\)/);
  });

  it("says unknown for a size that is missing or null", async (t) => {
    // The size check tests undefined and null separately, so both are covered here.
    const out = await render(t, [
      { id: "f1", name: "missing.mov", kind: "file" },
      { id: "f2", name: "null.mov", kind: "file", size: null },
    ]);

    assert.match(out, /\[FILE\] missing\.mov \(unknown\)/);
    assert.match(out, /\[FILE\] null\.mov \(unknown\)/);
  });

  it("reports a zero-byte file as a size, not as unknown", async (t) => {
    // 0 is falsy, so a truthiness check here would mislabel an empty file.
    const out = await render(t, [{ id: "f1", name: "empty.mov", kind: "file", size: 0 }]);

    assert.match(out, /\[FILE\] empty\.mov \(0 B\)/);
  });

  it("omits the id when an entry has none", async (t) => {
    const out = await render(t, [{ name: "clip.mov", kind: "file", size: 1 }]);

    assert.doesNotMatch(out, /\(ID: /);
    assert.doesNotMatch(out, /undefined/, "a missing id must not be printed");
  });

  it("does not print undefined for an entry with no name", async (t) => {
    const out = await render(t, [{ id: "f1", kind: "file", size: 1 }]);

    assert.doesNotMatch(out, /undefined/);
  });

  it("treats anything that is not a directory as a file", async (t) => {
    const out = await render(t, [{ id: "f1", name: "odd", kind: "symlink", size: 1 }]);

    assert.match(out, /\[FILE\] odd/);
  });

  it("returns an empty string for an empty listing rather than a placeholder", async (t) => {
    assert.equal(await render(t, []), "");
  });
});
