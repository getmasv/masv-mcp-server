# Tool Design

The highest-leverage surface in this project. Models pick tools with well-written descriptions far more
often, so a capability the manifest does not clearly state effectively does not exist. A description
defect is indistinguishable from a missing feature — treat naming and wording as functional work, not
polish.

## Name for the user's job, not the API shape

A tool name is read by a model deciding what to call. `transfer_files_from_integration` does not match
"send this folder to my colorist."

| Avoid                             | Prefer                       |
| --------------------------------- | ---------------------------- |
| `transfer_files_from_integration` | `send_files`                 |
| `list_files_on_integration`       | `browse_files`               |
| `send_package_to_integration`     | `deliver_package_to_storage` |
| `get_integrations`                | `list_connected_sources`     |

## Descriptions carry the user's vocabulary

For the send path the description must contain: **send, share, download link, folder, people, email, my
computer, NAS, Desktop, no file size limit**. Name Storage Gateway _and_ illustrate it — cloud-only
examples teach the model that local disk is out of scope.

- Lead with the outcome ("send files to people"), not the mechanism ("to MASV").
- State the prerequisite up front (MASV Desktop or Agent connected as a gateway).
- State limits and non-limits explicitly.
- Surface anything the model cannot infer. A provider string like `desktop_sg` means nothing to a model
  that was never told what it is.

## Annotations are mandatory

Every tool gets a `title`, an explicit `readOnlyHint`, an explicit `destructiveHint` whenever
`readOnlyHint` is `false`, and `idempotentHint` where genuinely true.

Not cosmetic: required for the Claude directory, required for Microsoft, a named top rejection cause on
OpenAI, and unannotated tools trigger an approval prompt on every single call in Cowork.

Two traps:

- **`destructiveHint` defaults to `true`.** Omitting it on a write tool silently marks it destructive and
  invites prompts on routine actions. Always set it explicitly.
- **Annotate honestly, by effect on state.** `destructiveHint` means "may mutate or delete durable state".
  Do not use it as a generic danger flag for expensive or irreversible-in-other-ways operations; see the
  annotation table in `architecture.md`. Dishonest labels get audited, and they degrade unattended use.

They are hints for host UX, not a permission system. Actual permissions come from the MASV API key.

## Shape

- Composite, outcome-oriented tools beat thin API mirrors. Prefer `send_folder`, `request_files`,
  `explain_failed_transfer` over parameter-heavy passthroughs.
- Ship a capability-discovery read tool: which gateways and integrations are configured, what roots they
  expose, and what kinds of transfer are therefore possible. Do not promise liveness — whether a gateway
  will actually respond often isn't knowable until a transfer is attempted, so report configuration as
  fact and let failures surface with a clear, actionable message.
- Keep the manifest tight. Tool-count bloat degrades selection quality.
- Expect a dual namespace in remote sessions: the host's own file paths and gateway-relative paths refer
  to the same disk. Document the mapping so the agent can translate.

## Definition of done for any tool change

1. Name reads as a user intent.
2. Description carries user vocabulary, prerequisites, and limits.
3. Annotations present.
4. Result carries enough for the model to explain what happened — what moved, where, and the operation ID.
5. `README.md` and `manifest.json` updated in the same change. (The Smithery payload is generated from
   the server, so it needs no edit.)
