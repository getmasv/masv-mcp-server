#!/usr/bin/env bash
#
# Asserts that every place a version or identity is written agrees.
#
# Five files carry the version and nothing checked they matched, so they drifted
# easily. The MCP Registry rejects a version that disagrees with npm, and npm
# versions are immutable — so a mismatch discovered after `npm publish` burns a
# version number. This runs before anything is published.
#
# package-lock.json is included because nothing else catches it: `npm ci` validates
# the lockfile against package.json's *dependencies* only and is perfectly happy
# with a root version that disagrees, so a stale lock version survives the whole
# pipeline. It then gets rewritten by whoever next runs `npm install`, landing a
# confusing version bump in an unrelated PR. It carries the version twice — the
# top-level field and the root package entry — and `npm version` updates both.
#
# Usage:
#   bash scripts/check-versions.sh                 # consistency only
#   bash scripts/check-versions.sh --tag 0.0.6     # also assert the tag matches
#
# JSON is read with `node -e` rather than `jq` so this behaves identically on a
# bare CI runner and on a developer machine with nothing installed.
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

TAG=""
while [ $# -gt 0 ]; do
  case "$1" in
    --tag) TAG="${2:?--tag requires a value}"; shift 2 ;;
    *) echo "ERROR: unknown argument: $1" >&2; exit 2 ;;
  esac
done

FAILED=0
fail() { echo "  FAIL  $*" >&2; FAILED=1; }
pass() { echo "  ok    $*"; }

# Reads a dotted path out of a JSON file. Prints nothing and returns non-zero if
# the value is missing, rather than the literal string "undefined" — a missing
# field must fail loudly, not compare equal to another missing field.
json() {
  local file="$1" path="$2" out
  out=$(node -e '
    const [file, path] = process.argv.slice(1);
    const data = JSON.parse(require("fs").readFileSync(file, "utf8"));
    const value = path.split(".").reduce(
      (acc, key) => (acc == null ? acc : acc[/^\d+$/.test(key) ? Number(key) : key]),
      data,
    );
    if (value === undefined || value === null) process.exit(1);
    process.stdout.write(String(value));
  ' "$file" "$path") || { echo "ERROR: $file has no '$path'" >&2; return 1; }
  printf '%s' "$out"
}

# Extracts the version literal from the McpServer constructor in src/index.ts.
# Requires exactly one match: if the shape of that call ever changes, this fails
# closed rather than silently checking nothing.
index_version() {
  local matches count
  matches=$(grep -oE 'version:[[:space:]]*"[^"]+"' src/index.ts | grep -oE '"[^"]+"' | tr -d '"')
  count=$(printf '%s\n' "$matches" | grep -c . || true)
  if [ "$count" -ne 1 ]; then
    echo "ERROR: expected exactly 1 version literal in src/index.ts, found $count." >&2
    echo "       The file shape changed — update scripts/check-versions.sh." >&2
    return 1
  fi
  printf '%s' "$matches"
}

echo "==> Versions"

PKG_VERSION=$(json package.json version)
# The trailing dot is the empty-string key: package-lock.json stores the root
# package under "" in .packages. json() splits on "." so 'packages..version'
# reads .packages[""].version.
LOCK_VERSION=$(json package-lock.json version)
LOCK_ROOT_VERSION=$(json package-lock.json packages..version)
MANIFEST_VERSION=$(json manifest.json version)
SERVER_VERSION=$(json server.json version)
SERVER_PKG_VERSION=$(json server.json packages.0.version)
INDEX_VERSION=$(index_version)

printf '  %-32s %s\n' 'package.json .version' "$PKG_VERSION"
printf '  %-32s %s\n' 'package-lock.json .version' "$LOCK_VERSION"
printf '  %-32s %s\n' 'package-lock.json .packages[""]' "$LOCK_ROOT_VERSION"
printf '  %-32s %s\n' 'manifest.json .version' "$MANIFEST_VERSION"
printf '  %-32s %s\n' 'server.json .version' "$SERVER_VERSION"
printf '  %-32s %s\n' 'server.json .packages[0]' "$SERVER_PKG_VERSION"
printf '  %-32s %s\n' 'src/index.ts' "$INDEX_VERSION"
echo

for pair in \
  "package-lock.json .version:$LOCK_VERSION" \
  "package-lock.json .packages[\"\"].version:$LOCK_ROOT_VERSION" \
  "manifest.json:$MANIFEST_VERSION" \
  "server.json .version:$SERVER_VERSION" \
  "server.json .packages[0].version:$SERVER_PKG_VERSION" \
  "src/index.ts:$INDEX_VERSION"
do
  name="${pair%%:*}"; value="${pair##*:}"
  if [ "$value" = "$PKG_VERSION" ]; then
    pass "$name matches package.json"
  else
    fail "$name is $value, expected $PKG_VERSION"
  fi
done

echo
echo "==> Identity"

PKG_NAME=$(json package.json name)
PKG_MCP_NAME=$(json package.json mcpName)
SERVER_NAME=$(json server.json name)
SERVER_IDENTIFIER=$(json server.json packages.0.identifier)

if [ "$PKG_MCP_NAME" = "$SERVER_NAME" ]; then
  pass "package.json .mcpName == server.json .name  ($SERVER_NAME)"
else
  fail "package.json .mcpName ($PKG_MCP_NAME) != server.json .name ($SERVER_NAME)"
fi

if [ "$SERVER_IDENTIFIER" = "$PKG_NAME" ]; then
  pass "server.json .packages[0].identifier == package.json .name  ($PKG_NAME)"
else
  fail "server.json .packages[0].identifier ($SERVER_IDENTIFIER) != package.json .name ($PKG_NAME)"
fi

if [ -n "$TAG" ]; then
  echo
  echo "==> Tag"
  if [ "$TAG" = "$PKG_VERSION" ]; then
    pass "tag $TAG matches package.json version"
  else
    fail "tag $TAG does not match package.json version $PKG_VERSION"
  fi
fi

echo
if [ "$FAILED" -ne 0 ]; then
  echo "ERROR: version/identity check failed — refusing to continue." >&2
  exit 1
fi
echo "OK  all version and identity fields agree ($PKG_VERSION)"
