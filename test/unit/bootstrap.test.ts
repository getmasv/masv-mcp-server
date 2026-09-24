// Guards the two things phase 0 bought, both of which fail loudly and confusingly
// if they regress:
//
//  1. Relative imports inside src/ resolve under Node's type stripping. This only
//     works because src/ authors specifiers as ".ts" and tsc rewrites them on emit
//     (rewriteRelativeImportExtensions). Reintroducing a ".js" specifier in src/
//     breaks every test that imports that module with ERR_MODULE_NOT_FOUND.
//  2. test/setup.ts runs before the module graph loads, so src/api/env.ts finds
//     the dummy credentials it validates at import time.

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { mcpOk, mcpError } from "../../src/mcp-responses.ts";
// packages.ts imports ./env.ts, so importing it exercises both invariants at once.
import { getPackages, GetPackagesSchema } from "../../src/api/packages.ts";
import { MASV_BASE_URL, MASV_TEAM_ID, MASV_ALLOW_DELETE } from "../../src/api/env.ts";

describe("test bootstrap", () => {
  it("resolves relative .ts imports across src/", () => {
    assert.equal(typeof getPackages, "function");
    assert.equal(typeof GetPackagesSchema.parse, "function");
    assert.equal(typeof mcpOk, "function");
  });

  it("loads the dummy environment before env.ts validates it", () => {
    assert.equal(MASV_BASE_URL, "https://api.test.invalid");
    assert.equal(MASV_TEAM_ID, "test-team");
    assert.equal(MASV_ALLOW_DELETE, false);
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
});
