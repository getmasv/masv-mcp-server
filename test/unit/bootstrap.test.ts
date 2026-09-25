// Guards the two preconditions every other test depends on. Both fail loudly and
// confusingly if they regress, so they get named assertions here rather than
// surfacing as an unrelated-looking failure somewhere else:
//
//  1. Relative imports inside src/ resolve under Node's type stripping. This only
//     works because src/ authors specifiers as ".ts" and tsc rewrites them on emit
//     (rewriteRelativeImportExtensions). Reintroducing a ".js" specifier in src/
//     breaks every test that imports that module with ERR_MODULE_NOT_FOUND.
//  2. test/setup.ts runs before any test module, so the dummy credentials are in
//     place for every call that reads configuration.

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { mcpOk, mcpError } from "../../src/mcp-responses.ts";
// packages.ts imports ./env.ts, so importing it exercises both invariants at once.
import { getPackages, GetPackagesSchema } from "../../src/api/packages.ts";
import { baseUrl, deleteAllowed, teamId } from "../../src/api/env.ts";

describe("test bootstrap", () => {
  it("resolves relative .ts imports across src/", () => {
    assert.equal(typeof getPackages, "function");
    assert.equal(typeof GetPackagesSchema.parse, "function");
    assert.equal(typeof mcpOk, "function");
  });

  it("provides the dummy environment every test relies on", () => {
    assert.equal(baseUrl(), "https://api.test.invalid");
    assert.equal(teamId(), "test-team");
    assert.equal(deleteAllowed(), false, "the delete gate must start closed");
  });

  it("mcpOk and mcpError produce MCP tool results", () => {
    assert.deepEqual(mcpOk("hello"), {
      content: [{ type: "text", text: "hello" }],
    });
    assert.deepEqual(mcpError(new Error("boom")), {
      isError: true,
      content: [{ type: "text", text: "boom" }],
    });
  });

  it("mcpOk serialises an object as indented JSON", () => {
    assert.deepEqual(mcpOk({ id: "pkg1" }), {
      content: [{ type: "text", text: '{\n  "id": "pkg1"\n}' }],
    });
  });

  it("mcpError stringifies a value that is not an Error", () => {
    // A rejected promise can carry anything; String() keeps the message readable
    // rather than rendering "[object Object]" from a template literal.
    assert.deepEqual(mcpError("plain failure"), {
      isError: true,
      content: [{ type: "text", text: "plain failure" }],
    });
  });
});
