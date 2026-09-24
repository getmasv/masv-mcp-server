// env.ts validates at import time, and test/setup.ts has already satisfied it by the
// time any test runs. So the missing-variable behaviour can only be observed from a
// child process with a deliberately incomplete environment.

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { moduleUrl, runInChild } from "../helpers/child.ts";

const ENV_MODULE = moduleUrl("src/api/env.ts");

/**
 * Imports env.ts with exactly the MASV_* vars given, optionally printing an export.
 *
 * The value is stringified in the child rather than logged raw: console.log formats a
 * non-string through util.inspect, which would wrap a boolean in ANSI colour codes
 * whenever colour is enabled.
 */
function importEnv(masvVars: Record<string, string>, print?: string) {
  const script = print
    ? `const m = await import(${ENV_MODULE}); console.log(String(m.${print}));`
    : `await import(${ENV_MODULE});`;

  return runInChild(script, masvVars);
}

describe("env", () => {
  it("refuses to load without MASV_TEAM_ID, naming the variable", () => {
    const r = importEnv({ MASV_API_KEY: "k" });

    assert.notEqual(r.status, 0, "import should fail");
    assert.match(r.stderr, /MASV_TEAM_ID is not set/);
  });

  it("refuses to load without MASV_API_KEY, naming the variable", () => {
    const r = importEnv({ MASV_TEAM_ID: "t" });

    assert.notEqual(r.status, 0, "import should fail");
    assert.match(r.stderr, /MASV_API_KEY is not set/);
  });

  it("points at the MCP server config in the failure message", () => {
    // The people hitting this are configuring a client, not reading our source.
    const r = importEnv({});

    assert.match(r.stderr, /MCP server config/);
  });

  it("loads when both required variables are present", () => {
    const r = importEnv({ MASV_TEAM_ID: "t", MASV_API_KEY: "k" });

    assert.equal(r.status, 0, r.stderr);
  });

  it("defaults MASV_BASE_URL to production", () => {
    const r = importEnv({ MASV_TEAM_ID: "t", MASV_API_KEY: "k" }, "MASV_BASE_URL");

    assert.equal(r.stdout.trim(), "https://api.massive.app");
  });

  it("lets MASV_BASE_URL be overridden", () => {
    const r = importEnv(
      { MASV_TEAM_ID: "t", MASV_API_KEY: "k", MASV_BASE_URL: "https://api.example.invalid" },
      "MASV_BASE_URL",
    );

    assert.equal(r.stdout.trim(), "https://api.example.invalid");
  });

  it("treats MASV_ALLOW_DELETE as true only for the exact string 'true'", () => {
    const base = { MASV_TEAM_ID: "t", MASV_API_KEY: "k" };

    for (const [value, expected] of [
      ["true", "true"],
      ["TRUE", "false"],
      ["1", "false"],
      ["yes", "false"],
      ["", "false"],
    ]) {
      const r = importEnv({ ...base, MASV_ALLOW_DELETE: value as string }, "MASV_ALLOW_DELETE");
      assert.equal(r.stdout.trim(), expected, `MASV_ALLOW_DELETE=${JSON.stringify(value)}`);
    }
  });
});
