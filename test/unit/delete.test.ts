// The delete tools are the only irreversible operations in the server, and the gate
// that guards them is read from the environment at import time. The closed case is
// covered in packages.test.ts and portals.test.ts; opening it needs a child process,
// which is also the only way to reach the request these tools actually send.

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { moduleUrl, runInChild } from "../helpers/child.ts";

const OPEN = {
  MASV_TEAM_ID: "test-team",
  MASV_API_KEY: "test-key",
  MASV_BASE_URL: "https://api.test.invalid",
  MASV_ALLOW_DELETE: "true",
};

describe("deletePackage with the gate open", () => {
  // Hop 1 is the package lookup for a token; hop 2 is the delete itself, which
  // answers 204 with no body.
  const script = `
    let call = 0;
    globalThis.fetch = async (url, init) => {
      call++;
      if (call === 1) return Response.json({ id: "pkg1", access_token: "tok-abc" });
      console.error(JSON.stringify({
        url: String(url),
        method: init.method,
        token: init.headers["x-package-token"],
        apiKey: init.headers["x-api-key"] ?? null,
      }));
      return new Response(null, { status: 204 });
    };
    const { deletePackage } = await import(${moduleUrl("src/api/packages.ts")});
    console.log(JSON.stringify(await deletePackage({ packageId: "pkg1" })));
  `;

  it("reports success for a 204 with no body", () => {
    const r = runInChild(script, OPEN);

    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(JSON.parse(r.stdout), {
      success: true,
      message: "Package deleted successfully",
    });
  });

  it("sends DELETE with the package token", () => {
    const r = runInChild(script, OPEN);
    const request = JSON.parse(r.stderr.trim().split("\n").at(-1) as string);

    assert.equal(request.method, "DELETE");
    assert.match(request.url, /\/v1\/packages\/pkg1$/);
    assert.equal(request.token, "tok-abc");
    assert.equal(request.apiKey, null, "the team key must not be sent on this hop");
  });
});

describe("deletePortal with the gate open", () => {
  const script = `
    globalThis.fetch = async (url, init) => {
      console.error(JSON.stringify({
        url: String(url),
        method: init.method,
        apiKey: init.headers["x-api-key"],
      }));
      return new Response(null, { status: 204 });
    };
    const { deletePortal } = await import(${moduleUrl("src/api/portals.ts")});
    console.log(JSON.stringify(await deletePortal({ portalId: "p1" })));
  `;

  it("reports success for a 204 with no body", () => {
    const r = runInChild(script, OPEN);

    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(JSON.parse(r.stdout), {
      success: true,
      message: "Portal deleted successfully",
    });
  });

  it("sends DELETE with the team API key", () => {
    const r = runInChild(script, OPEN);
    const request = JSON.parse(r.stderr.trim().split("\n").at(-1) as string);

    assert.equal(request.method, "DELETE");
    assert.match(request.url, /\/v1\/portals\/p1$/);
    assert.equal(request.apiKey, "test-key");
  });
});

describe("delete failures", () => {
  it("surfaces an API refusal rather than claiming success", () => {
    const script = `
      let call = 0;
      globalThis.fetch = async () => {
        call++;
        if (call === 1) return Response.json({ id: "pkg1", access_token: "tok-abc" });
        return Response.json({ error: "package is locked" }, { status: 409 });
      };
      const { deletePackage } = await import(${moduleUrl("src/api/packages.ts")});
      await deletePackage({ packageId: "pkg1" });
    `;

    const r = runInChild(script, OPEN);

    assert.notEqual(r.status, 0, "a refused delete must not resolve");
    assert.match(r.stderr, /409/);
    assert.match(r.stderr, /package is locked/);
  });
});
