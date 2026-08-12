# Product Intent

## What This Is

An MCP server that lets agents operate MASV — sending large files and folders to people, collecting files
from external contributors, and moving media to and from cloud storage and on-prem NAS.

MASV is the action layer; the agent is the orchestrator. The agent decides what to move and where; MASV
moves it. See `architecture.md` for why that split is a hard constraint.

## Who It Serves

Non-developer knowledge workers in large-file workflows — producers, post supervisors, media ops — driving
work from assistants like Claude, ChatGPT, and Copilot, or from workflow tools like n8n. Developers are a
secondary audience.

The practical test: **if a step requires editing JSON or pasting an API key, it does not serve the primary
audience.** Weigh design decisions against that.

## Capabilities

- **Send** — deliver files to people by email or by shareable link, from cloud storage or from the user's
  own computer and NAS.
- **Receive** — collect files from external contributors, who need no account and no software.
- **Packages** — inspect, manage expiration, delete.
- **Portals** — persistent branded intake endpoints.
- **Activities** — event and transfer tracking.
- **Sources** — browse cloud storage and Storage Gateway (local disk, NAS, EFS).
- **Team** — list members.

## Design Priorities

Ranked. When they conflict, higher wins.

1. **Legibility to models.** A capability the manifest does not clearly state effectively does not exist.
   This is the highest-leverage surface in the project — see `tool-design.md`.
2. **Stay thin.** MASV is the authority on permissions and limits; the API key carries them. Don't
   reimplement policy here, and don't require a human in the loop — unattended operation is a supported
   use case. Make risk legible through honest annotations and clear results.
3. **Low setup friction.** Every prerequisite between install and first successful transfer loses users.
4. **Flexibility.** Hide API complexity without blocking legitimate use cases.

## What Good Looks Like

- A producer says "send this folder to the colorist" and it works, with no JSON and no API key.
- An unattended agent can retry a failed transfer overnight within limits its operator set.
- Success is measured in **completed transfers and repeat use**, not installs or download counts.
