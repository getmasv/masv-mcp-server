// Stubs globalThis.fetch and records what was sent.
//
// This is not a mocking framework — node:test already is one. It is a thin wrapper
// over t.mock.method that names the replies and the recorded request fields, because
// `f.mock.calls[1].arguments[1] as RequestInit` obscures what a test is checking.

import type { TestContext } from "node:test";

/**
 * One stubbed response.
 *
 * A function, not a Response, for two reasons: a Response body can only be read
 * once, so every call needs a fresh object; and a test that needs an odd reply can
 * write one inline without a helper for it.
 */
export type Reply = () => Response;

/** A JSON body, 200 unless another status is given. */
export function json(body: unknown, status = 200): Reply {
  return () => Response.json(body, { status });
}

/** An HTML body, as a proxy or error page would return. */
export function html(body: string, status = 200): Reply {
  return () => new Response(body, { status, headers: { "content-type": "text/html" } });
}

/** 204, no body — what MASV answers a successful delete with. */
export function noContent(): Reply {
  return () => new Response(null, { status: 204 });
}

/** A 2xx with an empty body, which is not the same as 204. */
export function emptyBody(status = 200): Reply {
  return () => new Response("", { status });
}

/**
 * Replaces fetch for the duration of one test, answering each call with the next
 * reply. node:test restores the original automatically when the test ends.
 *
 * Replies are consumed in order and an unstubbed call fails loudly, so a test states
 * every request it expects and a tool that sends an extra one is caught.
 *
 *   const sent = stubFetch(t, json({ id: "pkg1", access_token: "tok" }), json({ files: [] }));
 *   await getPackageFiles({ packageId: "pkg1" });
 *   assert.equal(sent.headers(1)["x-package-token"], "tok");
 */
export function stubFetch(t: TestContext, ...replies: Reply[]) {
  let served = 0;

  const mocked = t.mock.method(globalThis, "fetch", async (target: string | URL) => {
    const reply = replies[served++];

    if (!reply) {
      throw new Error(
        `fetch was called ${served} time(s) but only ${replies.length} were stubbed. ` +
          `Unexpected request: ${target}`,
      );
    }

    return reply();
  });

  function argumentsOf(call: number) {
    const recorded = mocked.mock.calls[call];

    if (!recorded) {
      throw new Error(
        `no request number ${call + 1}: fetch was called ${mocked.mock.callCount()} time(s)`,
      );
    }

    return recorded.arguments as [string, RequestInit | undefined];
  }

  return {
    /** How many requests went out. Assert 0 to prove a guard ran before any I/O. */
    count: () => mocked.mock.callCount(),

    /** The full URL of the nth request, counting from 0. */
    url: (call = 0) => argumentsOf(call)[0],

    /** The method of the nth request. Unset means GET. */
    method: (call = 0) => argumentsOf(call)[1]?.method ?? "GET",

    /** The headers of the nth request. An absent header reads as undefined. */
    headers: (call = 0) =>
      (argumentsOf(call)[1]?.headers ?? {}) as Record<string, string | undefined>,

    /** The nth request's body, parsed. */
    requestJson: (call = 0) => JSON.parse(argumentsOf(call)[1]?.body as string),

    /** Escape hatch for anything the named accessors do not cover. */
    init: (call = 0) => argumentsOf(call)[1],
  };
}
