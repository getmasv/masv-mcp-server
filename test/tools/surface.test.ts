// The tool surface is the product. These tests check the two things about it that
// nothing else can catch:
//
//  - Annotations. Hosts prompt on every call to an unannotated tool, and missing
//    `title`/`readOnlyHint`/`destructiveHint` is a hard blocker on some assistant
//    directories. See .kiro/steering/tool-design.md.
//  - Manifest parity. manifest.json duplicates the tool list by hand and directory
//    crawlers read it, so drift is externally visible. This turns "remember to
//    update both" into a failing build.
//
// Enumerated from the real built server over MCP, so `npm run build` must run first.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { listRegisteredTools } from "../helpers/mcp-client.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

// Top-level await so each tool gets its own named test rather than one opaque
// failure listing twenty problems.
const tools = await listRegisteredTools();

describe("tool surface", () => {
  it("registers tools", () => {
    assert.ok(tools.length > 0, "server reported no tools");
  });

  for (const tool of tools) {
    describe(tool.name, () => {
      it("has a title", () => {
        assert.equal(
          typeof tool.title,
          "string",
          `${tool.name} has no title. Hosts fall back to the raw tool name in UI.`,
        );
        assert.ok((tool.title ?? "").trim().length > 0, `${tool.name} has an empty title`);
      });

      it("has a description", () => {
        assert.ok((tool.description ?? "").trim().length > 0, `${tool.name} has no description`);
      });

      it("declares readOnlyHint explicitly", () => {
        assert.equal(
          typeof tool.annotations?.readOnlyHint,
          "boolean",
          `${tool.name} does not declare readOnlyHint`,
        );
      });

      it("declares destructiveHint when it is not read-only", () => {
        if (tool.annotations?.readOnlyHint !== false) return;

        // destructiveHint defaults to true, so omitting it silently marks a
        // routine write destructive and invites a prompt on every call.
        assert.equal(
          typeof tool.annotations?.destructiveHint,
          "boolean",
          `${tool.name} is a write tool and must declare destructiveHint explicitly`,
        );
      });

      it("does not claim to be both read-only and destructive", () => {
        if (tool.annotations?.readOnlyHint !== true) return;

        assert.notEqual(
          tool.annotations?.destructiveHint,
          true,
          `${tool.name} cannot be read-only and destructive`,
        );
      });
    });
  }

  // Narrow on purpose. A broader "get_* must be read-only" heuristic would break on
  // the tool renames planned for later, whereas a delete_* tool that is not
  // destructive is wrong under any naming scheme.
  it("marks every delete_* tool destructive", () => {
    for (const tool of tools.filter((t) => t.name.startsWith("delete_"))) {
      assert.equal(tool.annotations?.readOnlyHint, false, `${tool.name} readOnlyHint`);
      assert.equal(tool.annotations?.destructiveHint, true, `${tool.name} destructiveHint`);
    }
  });
});

describe("manifest parity", () => {
  // manifest.json is a hand-maintained duplicate of the tool list that directory
  // crawlers read, so it can drift from the server. Names only: the MCPB schema
  // permits no other tool fields, and the descriptions there are deliberately
  // shorter than the registered ones.
  it("lists exactly the registered tools", () => {
    const registered = new Set(tools.map((t) => t.name));
    const manifest = JSON.parse(readFileSync(resolve(ROOT, "manifest.json"), "utf8"));
    const declared = new Set<string>(manifest.tools.map((t: { name: string }) => t.name));

    assert.deepEqual(
      sorted(declared),
      sorted(registered),
      diff(registered, declared, "manifest.json"),
    );
  });
});

function sorted(names: Set<string>) {
  return [...names].sort();
}

function diff(registered: Set<string>, declared: Set<string>, where: string) {
  const missing = sorted(registered).filter((n) => !declared.has(n));
  const phantom = sorted(declared).filter((n) => !registered.has(n));

  return [
    missing.length ? `${where} is missing registered tools: ${missing.join(", ")}` : "",
    phantom.length ? `${where} lists tools that are not registered: ${phantom.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join(" | ");
}
