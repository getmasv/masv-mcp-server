#!/usr/bin/env bash
#
# Builds the .mcpb bundle from a clean staging directory.
#
# Allowlist by construction: only what is explicitly copied below can ever ship.
# This is deliberate — a denylist (.mcpbignore) fails open, so any new untracked
# file in the repo would silently land in a public release artifact.
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

MCPB_VERSION="2.1.2"
OUT="masv-mcp-server.mcpb"
STAGE=".bundle-stage"

cleanup() { rm -rf "$ROOT/$STAGE"; }
trap cleanup EXIT

rm -rf "$STAGE" "$OUT"

echo "==> Building"
npm run build

echo "==> Staging (allowlist)"
mkdir -p "$STAGE"
cp -R build "$STAGE"/
cp manifest.json package.json package-lock.json "$STAGE"/

echo "==> Installing production dependencies only"
( cd "$STAGE" && npm ci --omit=dev --ignore-scripts >/dev/null )
rm -f "$STAGE/package-lock.json"

echo "==> Packing"
npx -y "@anthropic-ai/mcpb@${MCPB_VERSION}" pack "$STAGE" "$OUT" >/dev/null

echo "==> Verifying"

# List bare archive member names, one per line. `-Z1` (zipinfo mode) is used
# instead of `-l` on purpose: `-l` emits a decorated table where the path sits in
# the 4th column preceded by spaces, so anchored patterns silently never match.
NAMES=$(unzip -Z1 "$OUT")

# Fail closed: an empty listing means unzip failed or the archive is broken.
# Treating that as "no leaks found" would repeat the mistake .mcpbignore made.
if [ -z "$NAMES" ]; then
  echo "ERROR: could not list $OUT — refusing to report it as clean" >&2
  exit 1
fi

# local/ and .kiro/ are anchored at the archive root, where they would appear if
# the staging allowlist above ever broke. .env, .git and the mcp-publisher binary
# are matched as any path component, including inside node_modules.
DENY='^(local|\.kiro)/|(^|/)\.env|(^|/)\.git/|(^|/)mcp-publisher$'

if MATCHES=$(printf '%s\n' "$NAMES" | grep -iE "$DENY"); then
  echo "ERROR: bundle contains files that must never ship:" >&2
  printf '%s\n' "$MATCHES" | sed 's/^/  /' >&2
  exit 1
fi

FILES=$(printf '%s\n' "$NAMES" | grep -c .)
SIZE=$(du -h "$OUT" | awk '{print $1}')
echo "OK  $OUT  ($SIZE, $FILES entries, production deps only)"
