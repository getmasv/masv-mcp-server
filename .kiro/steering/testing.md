# Testing

How to write and run tests in this repo.

## Run

```bash
npm run build && npm test     # offline suite. no credentials, no network
```

Build first: some tests spawn `build/index.js`. Run `npm test` before declaring work done.

```bash
npm run test:coverage         # same suite, plus a per-file report for src/
```

Coverage is a "what did I forget" pass, not a target. **There is no coverage gate in CI and should not be
one** — a number says nothing about whether the cases you wrote were the right ones. Read the uncovered
lines and decide whether each is a case you forgot or code nobody needs.

Two details in that command worth knowing, since both were needed to make the report mean anything:

- `--test-coverage-include='src/**'` scopes it to production code. Without it the report also covers the
  test files, and more confusingly `build/`: `test/tools/surface.test.ts` spawns `build/index.js`, the child
  process inherits coverage collection, and the compiled output then double-counts against `src/` and drags
  the totals down. That is why an unscoped run reports ~75% while every `src/` file is at 100%.
- `--experimental-test-coverage` is Stability 1, so the flag name and the report format are exempt from
  semver and a Node bump can change them. Fine for a local tool; another reason not to gate on it.

Node can enforce thresholds with `--test-coverage-lines`, `--test-coverage-branches` and
`--test-coverage-functions`. Deliberately unused.

## Where a test goes

```
test/
  setup.ts              dummy MASV_* env, loaded via --import before any test module
  helpers/
    mcp-client.ts       spawns build/index.js, returns tools/list

    fetch-stub.ts       stubs globalThis.fetch and records what was sent
  unit/<domain>.test.ts one file per src/api/ module
  unit/delete.test.ts   the delete tools, both sides of the gate
  tools/surface.test.ts the registered tool surface: annotations, manifest parity, startup
  integration/          live API, self-skips without credentials
```

One file per `src/api/` module, until a module holds several unrelated tools and the file stops being
readable. Then split by tool and keep the module prefix so they stay adjacent —
`integrations.test.ts`, `integrations-list.test.ts`, `integrations-transfer.test.ts`. Roughly 200 lines is
where a file starts being worth splitting.

Default to `test/unit/`. Use `test/integration/` only for a question the real API is the sole authority
on — array serialization format, whether an endpoint accepts a partial body, real status codes.

## Write a unit test

`node:test` + `node:assert/strict`. No other dependencies, and no mocking framework — the runner is one.

Stub `globalThis.fetch` through `test/helpers/fetch-stub.ts`. Every API module calls bare `fetch`, so that
one seam covers every tool with no production change, and `t.mock.method` underneath restores the original
when the test ends.

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getPackageFiles } from "../../src/api/packages.ts";
import { json, stubFetch } from "../helpers/fetch-stub.ts";

it("authenticates with the package token, not the API key", async (t) => {
  const sent = stubFetch(t, json({ id: "pkg1", access_token: "tok" }), json({ files: [] }));

  await getPackageFiles({ packageId: "pkg1" });

  assert.equal(sent.headers(1)["x-package-token"], "tok");
  assert.equal(sent.headers(1)["x-api-key"], undefined);
});
```

Each argument to `stubFetch` answers one request, in order, and an unstubbed call fails loudly — so a
test declares every request it expects and an extra one is caught. Replies are `json`, `html`,
`noContent`, `emptyBody`, or any function returning a `Response` for an odd case. The reply is a function
because a `Response` body can only be read once.

`sent` names the recorded fields: `url`, `method`, `headers`, `requestJson`, `count`, each taking a
0-based call index. Prefer them over reaching into `f.mock.calls[…].arguments`.

Rules:

- **Stub only `fetch`.** Don't mock our own modules. `mock.module` needs
  `--experimental-test-module-mocks` and is never needed here. `masvFetch` is ours: stub `fetch`
  underneath it and its status handling applies, which makes an error-path test a two-liner.
- **No recorded fixtures.** Where response shape is load-bearing, hand-write a five-line stub stating the
  contract you rely on.
- **Assert `count()` when a call should not happen.** Argument validation and the delete gate are only
  worth anything if they run before the request, and a passing rejection test does not prove that.
- **Two-hop tools need two replies.** Anything reading a package token fetches the package first; assert
  the second request carries `x-package-token`, not `x-api-key`, and that a failed first hop stops the
  second from firing.

## Choosing what to test

The approach is specification-based, from Aniche's _Effective Software Testing_: derive cases from each
function's contract, not from its lines. Coverage comes afterwards, as a check on what you forgot (ch. 2
and 3). Also from the book: stub at the boundary you don't own and don't mock what you do own (ch. 6), and
solve testability with the smallest change that removes the obstacle rather than a refactor (ch. 7) —
which is why a child process stands in for reloading `env.ts`.

Where the book fits this codebase less well: it is mostly about unit-testing business logic, and this is
an adapter with almost none. The cases that find real defects here are contract-shaped — did the right
request go out, is the response mapped faithfully — so that is where to spend effort.

A workable order for a new function:

1. **Write down the contract.** Parameters and their optionality, what the request should look like, what
   the result should contain, what should fail.
2. **Partition each parameter and take the boundaries.** `formatFileSize` gets 0, 1023, 1024, and the TiB
   clamp, because every defect in a unit-conversion loop lives at a boundary. An enum-like parameter gets
   every value if the set is small — that is how the storage-gateway provider list is covered.
3. **Cross the parameters that interact.** `unlimited_storage` × `expiry` is four combinations, two of
   which must be rejected. Cursor present/absent × provider type is four paths through one tool.
4. **Add the failure modes of the boundary you don't own**: 4xx with a JSON body, 5xx with HTML, an empty
   body, a field the API omitted.
5. **Then run coverage** and ask what the uncovered lines mean. Every gap is either a case you forgot or
   code nobody needs.

Five defect patterns have actually been found in this repo. They are worth checking for by name in
anything new:

- **Silent pagination loss.** A dropped `page`, a cursor encoding an empty path, an offset that jumps
  further than the page returned. All produce a plausible wrong answer and no error, which is the worst
  possible outcome for an agent that cannot tell.
- **An error body read as data.** Any code path that returns without checking status hands the model an
  error to report as a result.
- **A fabricated auth value.** Reading `access_token` off a response nobody checked sends
  `x-package-token: undefined` on the next hop and fails somewhere unrelated. Assert the error names the
  step that actually failed.
- **Parameter serialization.** Array params must be comma-joined; MASV does not filter on a repeated key,
  so the wrong form returns an unfiltered list and reports nothing.
- **Validation after I/O.** A guard that runs after the first request still costs a round trip and reports
  the wrong problem. `count()` is what proves the order.

## null, undefined, and missing fields

Both matter, in different places, so it is worth knowing which one is reachable:

- **Response bodies cannot contain `undefined`.** JSON has no such value and `JSON.parse` never produces
  one. So for a payload, test `null` and test a **missing property** — the latter is what reads as
  `undefined` in our code. `masvFetch` returns `null` for 204 and for an empty body, never `undefined`.
- **Tool arguments can be `undefined`.** Optional zod fields arrive that way, and the query-string
  builders skip a value only when it is exactly `undefined`. Pass `undefined` explicitly and assert the
  key is absent rather than serialized as `"undefined"`.
- **Check the falsy values that are not empty.** `0` and `""` and `false` are the ones that get lost to a
  truthiness check: a zero-byte file must report `0 B` rather than "unknown", `active: false` must survive
  into a portal update body, and an empty-string token must be rejected rather than sent.

## Environment

`test/setup.ts` sets the dummy env before the module graph loads. It must exist because
`src/api/env.ts` validates at import time — every API module throws without it.

- Base URL is `https://api.test.invalid`. `.invalid` cannot resolve, so a request that escapes its stub
  fails as a DNS error instead of reaching a real host.
- Values are forced, not defaulted, so the suite behaves the same on a machine with real `MASV_*`
  exported.
- `MASV_ALLOW_DELETE` is cleared, so the delete gate is closed. `env.ts` reads it once at import, so a
  test cannot flip it mid-run.

**Configuration is read at the point of use, which is what keeps it testable.** The accessors in `env.ts`
— `baseUrl()`, `teamId()`, `apiKey()`, `deleteAllowed()` — read `process.env` on every call instead of
caching values in module constants, so any environment case is an ordinary in-process test: set the
variables, call the code, restore. Set a variable and the next call sees it; there is nothing to reload.

```ts
function withEnv(t: TestContext, vars: Record<string, string>) {
  // clear every MASV_* var, apply `vars`, restore in t.after()
}
```

Two rules when doing this:

- **Clear the whole `MASV_*` set before applying yours.** Otherwise a test inherits whatever `setup.ts` or
  a previous test left behind, and the result depends on file ordering.
- **Restore in `t.after()`,** not at the end of the body, so a failing assertion cannot leak state into the
  next test. `test/unit/delete.test.ts` ends with a test asserting the gate is closed by default, which is
  cheap insurance against exactly that leak.

Do not add a module constant that caches an environment value. It reintroduces the problem this design
exists to avoid, and the only way to test around it is reloading the module in a separate process.

The one thing left that needs a separate process is the server's own startup, because `src/index.ts`
connects a transport at module top level and cannot be imported. `test/tools/surface.test.ts` spawns the
built `build/index.js` for that — a real file, with no code passed as a string.

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
