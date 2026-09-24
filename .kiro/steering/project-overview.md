# Project Overview

MCP server exposing the **MASV** file-transfer API as tools for LLMs. Currently stdio, distributed via
npm and run with `npx`; a remote HTTP server is the goal (see `architecture.md`).

## Tech Stack

- **Language:** TypeScript (strict mode, ES modules / `nodenext` resolution)
- **Runtime:** Node.js >= 24
- **Key deps:** `@modelcontextprotocol/sdk`, `zod` (tool input schemas)
- **Build:** `tsc` → `build/` (dev dep `@anthropic-ai/mcpb` for `.mcpb` bundles)
- **Tests:** `node:test`, zero dependencies
- **Formatting:** Prettier, `printWidth: 100`, everything else default
- **Source runs unbuilt.** Relative imports in `src/` use `.ts` extensions so Node's type stripping can
  run the sources directly; `tsc` rewrites them to `.js` on emit. `erasableSyntaxOnly` therefore bans
  `enum`, `namespace`, and parameter properties. Details and rationale in `testing.md`.

## Layout

```
src/
  index.ts            Entry point. Creates McpServer, registers all tools.
  mcp-responses.ts    mcpOk() / mcpError() helpers for tool results.
  api/
    env.ts            Reads/validates MASV_* env vars + MASV_BASE_URL.
    packages.ts       Package tools (schema + handler per tool).
    portals.ts        Portal tools.
    activities.ts     Activity/event tools.
    activities-info.md  Reference text returned by get_activities_information.
    integrations.ts   Storage integration + Storage Gateway tools.
    users.ts          Team member tools.
test/
  setup.ts            Dummy MASV_* env, loaded via --import before any test module.
  unit/               Offline tests against src/, fetch stubbed at globalThis.
build/                Compiled output (gitignored).
scripts/              Build & publish scripts (bundle, Smithery release).
```

## Conventions

- One file per API domain under `src/api/`. Each tool = an exported `zod` schema + an async handler.
- Register tools in `src/index.ts` via
  `server.registerTool(name, { title, description, inputSchema: Schema.shape, annotations }, handler)`.
  **Annotations are required** — see `tool-design.md`.
- Return results with `mcpOk(data)`; catch errors and return `mcpError(error)`. Keep error handling
  consistent across domains, including HTTP status handling.
- Config comes from env only (`src/api/env.ts`). Never hardcode secrets or the team ID.
- Destructive tools (`delete_package`, `delete_portal`) are gated behind `MASV_ALLOW_DELETE=true`. That is
  the only client-side gate by design — permissions belong to the API key. See `architecture.md`.
- The server never touches the local filesystem. Local files are reached via Storage Gateway only.

## Build & Run

- `npm run build` — typecheck + compile. Run before declaring work done.
- `npm run inspector` — launch MCP Inspector against the built server.
- `npm run bundle` — build + pack `.mcpb`.
- `npm test` — offline test suite, no credentials, no network. Build first; some tests spawn
  `build/index.js`. Run it before declaring work done. See `testing.md`.
- `npm run format` / `npm run format:check` — Prettier, `printWidth: 100`. CI fails on unformatted
  files. Run `format` before finishing a change; editors with format-on-save pick up
  `.prettierrc.json` automatically, and without a config they default to 80 columns and reflow whole
  files.

## Doc Sync

Tool changes must land alongside `README.md` and `manifest.json`. The README has drifted from the
registered tool list before; a phantom tool in the docs is a real cost because directory listings and
models read it.

The Smithery payload is generated from the running server by `scripts/smithery-payload.mjs`, so it never
needs manual updating. Prefer generating over duplicating for any future publishing target.
