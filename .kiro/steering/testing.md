# Testing

The reason this project had no tests for so long was not the credentials — it was that the only test
shape imagined was end-to-end. Most of the regression value here needs no network and no credentials.

This codebase is an adapter with almost no business logic, so the highest-value tests are
contract-shaped: does the request go out correctly, and does the tool surface match what we publish.

## Two tiers

| Tier                  | Creds? | Network? | Runs on                   | Covers                                                                            |
| --------------------- | ------ | -------- | ------------------------- | --------------------------------------------------------------------------------- |
| **1 — Offline**       | No     | No       | Every PR, including forks | Request building, error mapping, gates, param branches, parsing, the tool surface |
| **2 — Live contract** | Yes    | Yes      | `main`, tags, manual only | Real status codes and response shapes, array param format, auth                   |

Tier 1 is the default and where new tests belong. Reach for tier 2 only for a question the real API is
the only authority on.

There is deliberately no recorded-fixture tier. Every defect found in this codebase has been
request-side — a dropped query param, an unchecked status code, an array serialized two different ways —
and a recorded response says nothing about any of them. Where response shape is genuinely load-bearing,
write a five-line hand-made stub: a stub states the contract you rely on, a fixture merely records a
sighting.

## Running

```bash
npm test          # tier 1. offline, credential-free. build first — some tests spawn build/index.js
npm run build && npm test
```

Coverage is available locally via `node --test --experimental-test-coverage …`. Use it to find what you
forgot. **Do not gate CI on a coverage number.**

CI runs `npm test` _after_ `npm run bundle`, not next to the typecheck where it would read more
naturally, because the tool-surface tests need a build to exist.

## Runner: `node:test`, zero dependencies

`node:test` + `node:assert/strict`. Vitest was considered and declined — it buys nothing here once
import specifiers are migrated, and `t.mock.method` covers every assertion we need.

`mock.module` still needs `--experimental-test-module-mocks` on Node 24. Don't reach for it; the fetch
seam below removes the need.

## The `.ts` specifier rule

**Relative imports in `src/` are written with a `.ts` extension**, not `.js`:

```ts
import { MASV_BASE_URL } from "./env.ts";
```

This is load-bearing, not style. Node's type stripping does not map a `.js` specifier onto a `.ts` file
on disk, and it deliberately ignores `tsconfig.json` — that is what keeps stripping light enough to need
no source maps. With `.js` specifiers, `node --test` cannot import `src/` **at all**:

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/…/src/env.js' imported from /…/src/lib.ts
```

Writing tests in JavaScript does not dodge this — the failure is inside `src/*.ts` resolving its own
imports, so the test file's language is irrelevant.

`tsc` rewrites the extensions back to `.js` on emit via `rewriteRelativeImportExtensions`, so the
published package is unaffected. When this was introduced, the emitted `build/` was byte-for-byte
identical before and after. `test/unit/bootstrap.test.ts` guards the invariant.

Two things are **not** rewritten: `paths` aliases and `#subpath` imports. Neither is used here. If one
appears, TypeScript reports `TS2877` and the typecheck fails, so it cannot regress silently.

## What type stripping forbids

`erasableSyntaxOnly` is on, which bans **`enum`, `namespace`, and constructor parameter properties**.

The flag is not the constraint, it just moves the error somewhere useful. Without it, `tsc` compiles an
enum happily and Node then refuses to run the file with
`ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`. Stripping paints over type annotations with whitespace; an enum has
to _generate_ a runtime object, so there is nothing to strip.

Use a const object instead, which also serializes better for a server whose entire output is JSON read
by a model:

```ts
export const Direction = { Up: "up", Down: "down" } as const;
export type Direction = (typeof Direction)[keyof typeof Direction];
```

`verbatimModuleSyntax` is also on: type-only imports need `import type`.

Test files are deliberately **not** typechecked — one `tsconfig.json`, `include` is `src/**/*` only,
because tsc would otherwise emit compiled tests into `build/`, which `package.json` publishes wholesale.
Type errors in test code surface as failing tests. Editors still resolve types normally.

## One mock seam: `globalThis.fetch`

Every API module calls bare `fetch`, so a single seam covers all tools with no production change:

```ts
const f = t.mock.method(globalThis, "fetch", async (url, init) => new Response("{}"));
// … call the tool …
const [url, init] = f.mock.calls[0].arguments as [string, RequestInit];
```

`t.mock.method` restores the original at the end of each test automatically. Captured URL, method, and
headers are all we need. Do not build a mock harness — the runner already is one.

Stub at the boundary you don't own; don't mock what you do own.

## Environment

`test/setup.ts` is loaded with `--import` and sets dummy `MASV_*` values before the module graph loads.
It has to exist because `src/api/env.ts` validates at import time, so every API module throws without
credentials.

- The base URL is `https://api.test.invalid`. `.invalid` is RFC-reserved and cannot resolve, so a
  request that escapes its stub fails as a DNS error instead of quietly reaching a real host.
- The values are **forced, not defaulted**, so `npm test` behaves identically on a machine that exports
  real `MASV_*` vars in its shell.
- `MASV_ALLOW_DELETE` is cleared, so the delete gate is closed by default. `env.ts` reads it once at
  import, so a test cannot flip it mid-run — opening the gate needs a subprocess.

## Credential boundary

`npm test` must stay credential-free and offline. That property is what makes it safe to run a fork's
code in CI.

- `ci.yml` references **no secrets**, uses `pull_request` (never `pull_request_target`), and installs
  with `npm ci --ignore-scripts`. Keep all of that true.
- Never combine `pull_request_target` with a checkout of `head.sha`. That is the "pwn request" hole:
  anyone forks, adds a `postinstall`, opens a PR, and the key leaves in their run. No merge required.
- A PR from a branch _in this repo_ does get secrets under `pull_request`. "No secrets on PRs" is a
  boundary against forks, not against insiders.
- Staging base URL, team ID, and API key never appear in a committed file, a test, or a log. `local/` is
  gitignored and is the only safe place for them in the tree.

## Swagger is a hypothesis source, never an oracle

A staging swagger document exists. It is broadly right and wrong in many small details, and its host is
confidential — do not name it in a committed file.

**No test ever validates against it**, in either tier. Generating contract tests from it would encode its
mistakes as requirements and fail against a correct API. Use it to _find_ things worth checking, then
confirm each against live staging. When code and swagger disagree, neither wins on paper — staging
decides.

## Adding a tool

Two test-visible obligations, both enforced by `test/tools/surface.test.ts` once it lands:

1. A full annotation set — `title`, explicit `readOnlyHint`, and explicit `destructiveHint` whenever
   `readOnlyHint` is `false`. See `tool-design.md` for why this is functional work.
2. Name parity: the registered name must appear in `manifest.json` and in the README's tool list. That
   turns the doc-sync rule into a failing build instead of something a human has to remember.

The tool surface is enumerated by spawning `build/index.js` and calling `tools/list` over a real MCP
client, the same way `scripts/smithery-payload.mjs` does. `src/index.ts` calls `main()` at module top
level and connects a stdio transport, so it is not importable — the subprocess is the point, and it makes
these genuine end-to-end checks of the surface we actually ship.
