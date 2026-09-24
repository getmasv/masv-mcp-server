# Testing

How to write and run tests in this repo.

## Run

```bash
npm run build && npm test     # offline suite. no credentials, no network
```

Build first: some tests spawn `build/index.js`. Run `npm test` before declaring work done.

For a "what did I forget" pass: `node --test --experimental-test-coverage --import ./test/setup.ts
'test/{unit,tools}/**/*.test.ts'`. There is no coverage gate and should not be one.

## Where a test goes

```
test/
  setup.ts              dummy MASV_* env, loaded via --import before any test module
  helpers/
    mcp-client.ts       spawns build/index.js, returns tools/list
    child.ts            runs a snippet in a child process with chosen MASV_* vars
  unit/<domain>.test.ts one file per src/api/ module
  unit/delete.test.ts   the delete tools with the gate open (needs a child process)
  tools/surface.test.ts the registered tool surface: annotations, manifest parity
  integration/          live API, self-skips without credentials
```

Default to `test/unit/`. Use `test/integration/` only for a question the real API is the sole authority
on — array serialization format, whether an endpoint accepts a partial body, real status codes.

## Write a unit test

`node:test` + `node:assert/strict`. No other dependencies, no mock harness — the runner is one.

Stub `globalThis.fetch`. Every API module calls bare `fetch`, so that one seam covers every tool with no
production change. `t.mock.method` restores the original when the test ends.

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getPackages } from "../../src/api/packages.ts";

it("forwards page to the query string", async (t) => {
  const f = t.mock.method(globalThis, "fetch", async () => Response.json({ packages: [] }));

  await getPackages({ page: 3, limit: 10 });

  const [url, init] = f.mock.calls[0].arguments as [string, RequestInit];
  assert.match(url, /page=3/);
  assert.equal(f.mock.callCount(), 1);
});
```

Assert on what the request carried — URL, query params, method, headers, body — and on how a response is
mapped to a tool result. That is where this codebase's defects live; it is an adapter with almost no
business logic.

Rules:

- **Stub only `fetch`.** Don't mock our own modules. `mock.module` needs
  `--experimental-test-module-mocks` and is never needed here. `masvFetch` is ours: stub `fetch`
  underneath it and its status handling applies, which makes an error-path test a two-liner.
- **No recorded fixtures.** Where response shape is load-bearing, hand-write a five-line stub stating the
  contract you rely on.
- **Cover both sides of every branch**, not just the happy one: gate open/closed, param present/absent,
  cursor present/absent, 2xx/4xx/5xx, JSON body and non-JSON body.
- **Two-hop tools need two stub responses.** Anything reading a package token fetches the package first;
  assert the second request carries `x-package-token`, not `x-api-key`, and that a failed first hop stops
  the second from firing.
- **Assert `callCount` when a call should not happen.** Argument validation and the delete gate are only
  worth anything if they run before the request, and a passing rejection test does not prove that.
- **Pin array params as comma-joined** (`tags=a,b`). MASV does not filter on a repeated key, so getting
  this wrong returns an unfiltered list and nothing reports an error.

## Environment

`test/setup.ts` sets the dummy env before the module graph loads. It must exist because
`src/api/env.ts` validates at import time — every API module throws without it.

- Base URL is `https://api.test.invalid`. `.invalid` cannot resolve, so a request that escapes its stub
  fails as a DNS error instead of reaching a real host.
- Values are forced, not defaulted, so the suite behaves the same on a machine with real `MASV_*`
  exported.
- `MASV_ALLOW_DELETE` is cleared, so the delete gate is closed. `env.ts` reads it once at import, so a
  test cannot flip it mid-run.

Anything that depends on the environment being different — a missing required variable, an open delete
gate — needs a child process. `test/helpers/child.ts` provides one: it strips every `MASV_*` variable
from the parent and applies only what the test asks for, so nothing leaks in from the developer's shell.
Stub `globalThis.fetch` inside the snippet before importing the module under test.

## Import specifiers: `.ts`, not `.js`

**Relative imports in `src/` must use a `.ts` extension.** `tsc` rewrites them to `.js` on emit
(`rewriteRelativeImportExtensions`), so the published package is unaffected.

```ts
import { MASV_BASE_URL } from "./env.ts"; // correct
import { MASV_BASE_URL } from "./env.js"; // breaks every test importing this module
```

Node's type stripping does not map a `.js` specifier onto a `.ts` file, and it ignores `tsconfig.json`.
One `.js` specifier makes the module unimportable from a test:

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/…/src/env.js' imported from /…/src/lib.ts
```

Writing tests in JavaScript does not help — the failure is inside `src/` resolving its own imports.
`test/unit/bootstrap.test.ts` guards this.

`paths` aliases and `#subpath` imports are not rewritten; neither is used. If one appears, `tsc` reports
`TS2877` and CI fails, so it cannot regress silently.

## Syntax `src/` cannot use

Type stripping runs the sources as-is, so `enum`, `namespace`, and constructor parameter properties are
banned. `erasableSyntaxOnly` catches them at compile time instead of as a runtime
`ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX` mid-test-run. Use a const object:

```ts
export const Direction = { Up: "up", Down: "down" } as const;
export type Direction = (typeof Direction)[keyof typeof Direction];
```

`verbatimModuleSyntax` is on: type-only imports need `import type`.

Test files are not typechecked — `tsconfig.json` includes `src/**/*` only, because tsc would otherwise
emit compiled tests into `build/`, which `package.json` publishes wholesale. Type errors in test code
surface as failing tests. Editors resolve types normally.

## Adding a tool

`test/tools/surface.test.ts` enumerates the real surface by spawning `build/index.js` and calling
`tools/list` over an MCP client, the way `scripts/smithery-payload.mjs` does. `src/index.ts` connects a
transport at module top level, so it is not importable; the subprocess is deliberate and makes these
end-to-end checks of what we actually ship.

It will fail unless the new tool has:

1. `title`, an explicit `readOnlyHint`, and an explicit `destructiveHint` whenever `readOnlyHint` is
   `false`. See `tool-design.md`.
2. Its name in `manifest.json`.

Annotations live only in `src/index.ts`. The MCPB manifest schema allows just `name` and `description`
per tool (`additionalProperties: false`), so adding `title` or `annotations` to `manifest.json` fails
`mcpb validate` and breaks `npm run bundle`. Parity is asserted on names only.

Also add the tool to the README list — that one is not tested. Asserting on prose was tried and removed:
the parse is brittle and the stakes are low, since models read the server's `tools/list`, not the README.

## Credentials and CI

`npm test` must stay credential-free and offline. That is what makes it safe to run a fork's code in CI.

- `ci.yml` references no secrets, triggers on `pull_request` (never `pull_request_target`), and installs
  with `npm ci --ignore-scripts`. Keep all of it true.
- Never combine `pull_request_target` with a checkout of `head.sha` — that is the "pwn request" hole: fork,
  add a `postinstall`, open a PR, key leaves in their run, no merge needed.
- A PR from a branch in this repo does get secrets under `pull_request`. The no-secrets boundary is
  against forks, not insiders.
- The staging base URL, team ID, and API key never appear in a committed file, a test, or a log. `local/`
  is gitignored and is the only place for them in the tree.
- The live suite runs on `main`, tags, and manual dispatch only, from a protected environment.

## Live tests

Staging permits real mutation, so:

- Assert narrowly — status codes, field presence, types. GitHub masks declared secrets but a dumped
  response body still prints real subdomains and recipient emails into a public log.
- Never echo a package token, access token, or signed URL, even on failure.
- Name created resources `mcp-test-<run_id>-…` and delete them in teardown, including on failure.
- Keep the suite small. Every test is a real operation against a real team.
- Self-skip without credentials so local runs stay green:

  ```ts
  const live = !!process.env.MASV_API_KEY;
  describe("live API", { skip: !live ? "no credentials" : false }, () => {});
  ```

## Swagger is never an oracle

The staging swagger document is broadly right and wrong in small details, and its host is confidential —
do not name it in a committed file. No test validates against it, in either tier: generating tests from it
encodes its mistakes as requirements. Use it to form a hypothesis, confirm against live staging. When code
and swagger disagree, staging decides.
