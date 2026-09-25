// Enumerates the tool surface the server actually ships.
//
// src/index.ts calls main() at module top level and connects a stdio transport, so
// importing it would attach a server to the test process's own stdio. Spawning the
// built entry point and asking it over a real MCP client avoids that, and makes
// these end-to-end checks of the published surface rather than of a source file.
// Same approach as scripts/smithery-payload.mjs.

import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SERVER = resolve(ROOT, "build/index.js");

/** One spawn per test process, shared by every test in the file. */
let cached: Promise<Awaited<ReturnType<Client["listTools"]>>["tools"]> | undefined;

export function listRegisteredTools() {
  cached ??= spawnAndList();
  return cached;
}

async function spawnAndList() {
  if (!existsSync(SERVER)) {
    throw new Error(`${SERVER} not found — run \`npm run build\` before \`npm test\`.`);
  }

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [SERVER],
    // The server checks its credentials at startup; test/setup.ts has already put
    // dummy values in process.env. No API call is made by tools/list.
    env: { ...process.env } as Record<string, string>,
    stderr: "pipe",
  });

  const client = new Client({ name: "surface-test", version: "1.0.0" });
  await client.connect(transport);

  try {
    const { tools } = await client.listTools();
    return tools;
  } finally {
    await client.close();
  }
}
