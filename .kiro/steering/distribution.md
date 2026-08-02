# Distribution

## Model

npm is the installable artifact; the directories and registries are metadata pointing back to it. Users
run it with `npx @getmasv/masv-mcp-server` over stdio.

A remote HTTP server is the goal, because stdio does not run in remote agent sessions and is not listable
on assistant platforms that require a hosted endpoint. See `architecture.md`.

Releases are automated in CI on tag push. Publishing by hand is the exception, not the process.

## Identity

The same server is registered under different names per channel. Keeping this list accurate matters —
some listings are hard to find again without the exact identifier.

| Where                 | Identifier                                                                  |
| --------------------- | --------------------------------------------------------------------------- |
| npm                   | `@getmasv/masv-mcp-server` (public)                                         |
| Official MCP Registry | `io.github.getmasv/masv` (`mcpName` in package.json, `name` in server.json) |
| Smithery              | `masv/masv` → `smithery.ai/server/masv/masv`                                |
| GitHub                | `github.com/getmasv/masv-mcp-server`                                        |

**The Smithery listing is not discoverable by search.** A registry query for `masv` returns unrelated
fuzzy matches and not `masv/masv`; only direct lookup by qualified name resolves. Worth investigating —
Smithery's publish pipeline has deploy/scan/metadata/publish stages, and an incomplete stage is the likely
cause. Until it's fixed, the listing effectively does not exist for anyone browsing.

## Channels

Only the first three need an action per release. The rest were registered once and pick up changes from
npm, the MCP registry, or the GitHub repo — **do not resubmit them on every version.**

| Channel                   | Per release?          | How                                                                     |
| ------------------------- | --------------------- | ----------------------------------------------------------------------- |
| **npm**                   | yes                   | `npm publish`                                                           |
| **Official MCP Registry** | yes                   | `mcp-publisher publish` from `server.json`; version must match npm      |
| **Smithery**              | yes                   | `scripts/smithery-publish.sh`; payload generated from live `tools/list` |
| **Glama**                 | no — indexes GitHub   | One-time; `glama.json` claims the listing                               |
| **PulseMCP**              | no — indexes registry | One-time                                                                |
| **mcp.so**                | no — submitted once   | Web form, already done                                                  |
| **mcpservers.org**        | no — submitted once   | Web form, already done                                                  |

The self-updating assumption is untested: every channel currently shows 0.0.5, the only version ever
published, so a stale snapshot and a live refresh look identical. On the next release, check whether the
four one-time channels report the new version before trusting them to keep themselves current.

## Version Invariant

`package.json`, `manifest.json`, `server.json`, and `src/index.ts` must all carry the same version. They
drift easily because nothing currently checks them, and the MCP registry rejects a version that doesn't
match npm. CI should enforce this rather than a human remembering.

## Listing Requirements To Build Against

The major assistant directories share a baseline. These are engineering requirements, not marketing:

- `title` plus an explicit `readOnlyHint`/`destructiveHint` on **every** tool. A hard blocker on some
  directories, a common rejection cause on others.
- Read and write as separate tools. A catch-all `api_request`-style tool is auto-rejected.
- A publicly reachable endpoint, working test credentials, a privacy policy, an icon, accurate docs.
- Authentication: several directories expect OAuth rather than user-supplied API keys for a listed
  connector. Unresolved — assess before committing to a directory submission.

## Bundle Manifests

- `manifest.json` — Anthropic MCPB (`.mcpb`) manifest: tool list, `user_config`, platform/runtime compatibility.
- `server.json` — Official MCP registry manifest: npm package + env var declarations.
- Keep tool lists consistent between `README.md` and `manifest.json`. Directory crawlers read both, so
  drift is visible externally. The Smithery payload is generated from the server, so it needs no manual sync.

Channel priority, sequencing, and adoption metrics are tracked internally and intentionally not in this repo.
