# Architecture Principles

## Control plane / data plane split

Non-negotiable. The MCP server exchanges **references, IDs, manifests, status, and policy** — never bytes.

```
agent / workflow
      │  intent, manifest, policy
      ▼
MASV MCP control plane  ──────►  MASV data plane
      ▲                          ├── MASV Agent / Desktop (local disk, NAS)
      │  status, events           ├── Browser SDK / portal
      └──────────────────────     └── connected cloud storage
```

Consequences that constrain every change:

- Never return or stream file content through a tool result.
- **The server must stay filesystem-free.** It only calls `MASV_BASE_URL` over HTTPS. Local files are
  reached through Storage Gateway, an out-of-band daemon on the user's machine. This is what lets the same
  codebase run locally or hosted remotely with only a transport change. Do not break it.
- Long operations return an operation ID and are polled or webhooked. Never block on a transfer.

## Transport

- Today: stdio. Target: **HTTP**, publicly reachable.
- stdio does not run in remote agent sessions and is not listable on ChatGPT or M365. Keep stdio and the
  MCPB bundle for developers, but the remote server is the strategic artifact.
- Build against the stateless MCP core (2026-07-28 spec). No session-affine state.

## Authorization belongs to MASV, not to this client

The MASV API is the authority on what a caller may do. The API key carries the user's own permissions, so
access management is configured in MASV — not by adding checks here.

Keep this client thin:

- **Do not build permission, quota, budget, or policy engines here.** They would duplicate backend
  behaviour, drift from it, and be bypassable by calling the API directly. A control that only exists in a
  client is not a control.
- **Do not add config switches speculatively.** `MASV_ALLOW_DELETE` exists as a deliberate guard on two
  irreversible operations. Treat it as the exception, not a pattern to extend. Add more only with evidence
  that users need them.
- **Surface what the API says.** When MASV rejects a call on permissions or limits, pass that through as a
  clear, actionable message instead of pre-empting it with local logic.

Deployment guidance follows from this: scope the API key to what the agent should be able to do.

## Tool annotations

Annotations are **hints for host UX and directory listings**, not enforcement — the spec says clients must
treat them as untrusted. Their job is to be honest so hosts can present sensible confirmation behaviour.

| Class          | Example                           | Annotations                                     |
| -------------- | --------------------------------- | ----------------------------------------------- |
| Read           | list packages, get status         | `readOnlyHint: true`                            |
| Additive write | create a portal, start a transfer | `readOnlyHint: false`, `destructiveHint: false` |
| Destructive    | delete a package or portal        | `readOnlyHint: false`, `destructiveHint: true`  |

**`destructiveHint` defaults to `true`.** Any tool with `readOnlyHint: false` that omits it is treated as
destructive, so hosts will prompt on routine actions. Set it explicitly.

**Cost is not destructiveness.** `destructiveHint` means "may mutate or delete durable state". A transfer
or download creates data and destroys nothing. Don't borrow the flag to signal spend — it misleads hosts
and reviewers, and it makes unattended use needlessly painful. Note real costs in the description.

## Unattended operation must keep working

Agents run without a human present — overnight retries, watch-folder ingest, scheduled delivery. So no
tool may _require_ a confirmation round-trip to function: a caller with a valid key completes an action in
one call. Whether to confirm with a human is the host's decision, informed by the annotations above.

Return enough in each result for the model to explain what happened — what moved, where, how much, and the
operation ID — so a preview is something the model can offer rather than something the protocol forces.

## Security

- Treat inbound links and package tokens as untrusted input. An inbox-reading agent that auto-downloads is
  both a cost event and a possible exfiltration path. The mitigation is a properly scoped API key plus
  MASV-side controls, not client-side guesswork.
- **No catch-all `api_request` tool.** Auto-rejected by Anthropic, and unsafe. Read and write stay separate.
