#!/usr/bin/env node
/**
 * Emits the Smithery release payload as JSON on stdout.
 *
 * The tool list is read from the *running server* via an MCP `tools/list` call,
 * so it can never drift from what the server actually registers. The previous
 * version of the publish script hardcoded a duplicate copy of all 20 tools,
 * which is why the live Smithery listing shows stale descriptions.
 *
 * configSchema is derived from manifest.json's user_config for the same reason.
 *
 * Requires `npm run build` first. No MASV credentials are used — dummy values
 * are injected because src/api/env.ts validates at import time.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (p) => JSON.parse(readFileSync(resolve(ROOT, p), "utf8"));

const pkg = readJson("package.json");
const manifest = readJson("manifest.json");

// --- live tool list from the built server -----------------------------------
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [resolve(ROOT, "build/index.js")],
  env: {
    ...process.env,
    // env.ts throws at import time without these; no API call is made.
    MASV_TEAM_ID: "smithery-payload-placeholder",
    MASV_API_KEY: "smithery-payload-placeholder",
  },
  stderr: "pipe",
});

const client = new Client({ name: "smithery-payload", version: "1.0.0" });
await client.connect(transport);
const { tools } = await client.listTools();
await client.close();

if (!tools?.length) {
  console.error("ERROR: server reported no tools");
  process.exit(1);
}

// --- configSchema derived from manifest user_config -------------------------
const jsonType = { string: "string", boolean: "boolean", number: "number" };
const properties = {};
const required = [];

for (const [key, cfg] of Object.entries(manifest.user_config ?? {})) {
  properties[key] = {
    type: jsonType[cfg.type] ?? "string",
    title: cfg.title,
    description: cfg.description,
  };
  if (cfg.required) required.push(key);
}

// --- payload ----------------------------------------------------------------
const payload = {
  type: "stdio",
  runtime: "node",
  serverCard: {
    serverInfo: {
      name: manifest.name,
      version: pkg.version,
    },
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
      ...(t.title ? { title: t.title } : {}),
      ...(t.annotations ? { annotations: t.annotations } : {}),
    })),
  },
  configSchema: { type: "object", properties, required },
};

// Sanity checks before anything is published.
if (pkg.version !== manifest.version) {
  console.error(
    `ERROR: version mismatch — package.json ${pkg.version} vs manifest.json ${manifest.version}`,
  );
  process.exit(1);
}

console.error(`tools: ${tools.length}  version: ${pkg.version}`);
process.stdout.write(JSON.stringify(payload));
