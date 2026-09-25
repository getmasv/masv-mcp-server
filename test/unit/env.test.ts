// Each accessor reads process.env when called, so every case here is an ordinary
// in-process test: set the variables, call it, restore.

import { describe, it, type TestContext } from "node:test";
import assert from "node:assert/strict";

import { apiKey, assertConfigured, baseUrl, deleteAllowed, teamId } from "../../src/api/env.ts";

/**
 * Replaces the MASV_* environment for one test and restores it afterwards.
 *
 * Every MASV_* variable is cleared first, so a test states the whole configuration it
 * wants and cannot be affected by what test/setup.ts or another test left behind.
 */
function withEnv(t: TestContext, vars: Record<string, string>) {
  const saved = Object.fromEntries(
    Object.keys(process.env)
      .filter((key) => key.startsWith("MASV_"))
      .map((key) => [key, process.env[key]]),
  );

  const clearAll = () => {
    for (const key of Object.keys(process.env).filter((k) => k.startsWith("MASV_"))) {
      delete process.env[key];
    }
  };

  clearAll();
  Object.assign(process.env, vars);

  t.after(() => {
    clearAll();
    Object.assign(process.env, saved);
  });
}

const credentials = { MASV_TEAM_ID: "t", MASV_API_KEY: "k" };

describe("teamId and apiKey", () => {
  it("return the configured values", (t) => {
    withEnv(t, credentials);

    assert.equal(teamId(), "t");
    assert.equal(apiKey(), "k");
  });

  it("throw naming MASV_TEAM_ID when it is missing", (t) => {
    withEnv(t, { MASV_API_KEY: "k" });

    assert.throws(() => teamId(), /MASV_TEAM_ID is not set/);
  });

  it("throw naming MASV_API_KEY when it is missing", (t) => {
    withEnv(t, { MASV_TEAM_ID: "t" });

    assert.throws(() => apiKey(), /MASV_API_KEY is not set/);
  });

  it("treat an empty string as missing", (t) => {
    // An empty team id would otherwise build /v1.1/teams//packages and 404 for a
    // reason that says nothing about configuration.
    withEnv(t, { MASV_TEAM_ID: "", MASV_API_KEY: "" });

    assert.throws(() => teamId(), /MASV_TEAM_ID is not set/);
    assert.throws(() => apiKey(), /MASV_API_KEY is not set/);
  });

  it("point at the MCP server config in the failure message", (t) => {
    // The people hitting this are configuring a client, not reading our source.
    withEnv(t, {});

    assert.throws(() => teamId(), /MCP server config/);
  });
});

describe("baseUrl", () => {
  it("defaults to production", (t) => {
    withEnv(t, credentials);

    assert.equal(baseUrl(), "https://api.massive.app");
  });

  it("can be overridden", (t) => {
    withEnv(t, { ...credentials, MASV_BASE_URL: "https://api.example.invalid" });

    assert.equal(baseUrl(), "https://api.example.invalid");
  });

  it("falls back to production when set to an empty string", (t) => {
    withEnv(t, { ...credentials, MASV_BASE_URL: "" });

    assert.equal(baseUrl(), "https://api.massive.app");
  });
});

describe("deleteAllowed", () => {
  it("is closed when the variable is unset", (t) => {
    withEnv(t, credentials);

    assert.equal(deleteAllowed(), false);
  });

  it("opens only for the exact string 'true'", (t) => {
    // A near miss must fail closed: this gate stands in front of the only two
    // irreversible operations in the server.
    for (const [value, expected] of [
      ["true", true],
      ["TRUE", false],
      ["True", false],
      ["1", false],
      ["yes", false],
      ["", false],
      [" true", false],
    ] as const) {
      withEnv(t, { ...credentials, MASV_ALLOW_DELETE: value });

      assert.equal(deleteAllowed(), expected, `MASV_ALLOW_DELETE=${JSON.stringify(value)}`);
    }
  });

  it("does not require credentials to be configured", (t) => {
    // The gate is policy, not authentication, and deletePackage checks it first.
    withEnv(t, { MASV_ALLOW_DELETE: "true" });

    assert.equal(deleteAllowed(), true);
  });
});

describe("assertConfigured", () => {
  it("passes when both credentials are present", (t) => {
    withEnv(t, credentials);

    assert.doesNotThrow(() => assertConfigured());
  });

  it("throws when either is missing", (t) => {
    withEnv(t, { MASV_API_KEY: "k" });
    assert.throws(() => assertConfigured(), /MASV_TEAM_ID is not set/);
  });

  it("does not require MASV_BASE_URL", (t) => {
    // Only the credentials are mandatory; the base URL has a default.
    withEnv(t, credentials);

    assert.doesNotThrow(() => assertConfigured());
  });
});

describe("nothing is cached", () => {
  it("reflects a change between calls", (t) => {
    // The property the whole design rests on. If an accessor ever starts caching, the
    // env tests stop testing anything and the delete gate becomes unreachable.
    withEnv(t, credentials);
    assert.equal(baseUrl(), "https://api.massive.app");

    process.env.MASV_BASE_URL = "https://second.invalid";
    assert.equal(baseUrl(), "https://second.invalid");

    process.env.MASV_ALLOW_DELETE = "true";
    assert.equal(deleteAllowed(), true);
  });
});
