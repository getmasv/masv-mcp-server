# Project Overview

MCP server exposing the **MASV** file-transfer API as tools for LLMs. Currently stdio, distributed via
npm and run with `npx`; a remote HTTP server is the goal (see `architecture.md`).

## Tech Stack

- **Language:** TypeScript (strict mode, ES modules / `Node16` resolution)
- **Runtime:** Node.js >= 24
- **Key deps:** `@modelcontextprotocol/sdk`, `zod` (tool input schemas)
- **Build:** `tsc` → `build/` (dev dep `@anthropic-ai/mcpb` for `.mcpb` bundles)
- **Formatting:** Prettier, `printWidth: 100`, everything else default

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
- `npm run format` / `npm run format:check` — Prettier, `printWidth: 100`. CI fails on unformatted
  files. Run `format` before finishing a change; editors with format-on-save pick up
  `.prettierrc.json` automatically, and without a config they default to 80 columns and reflow whole
  files.
- `npm test` is a stub. Tests and CI are wanted; when a runner is introduced, wire it into the
  build/verify loop and run it before declaring work done.

## Doc Sync

Tool changes must land alongside `README.md` and `manifest.json`. The README has drifted from the
registered tool list before; a phantom tool in the docs is a real cost because directory listings and
models read it.

The Smithery payload is generated from the running server by `scripts/smithery-payload.mjs`, so it never
needs manual updating. Prefer generating over duplicating for any future publishing target.
