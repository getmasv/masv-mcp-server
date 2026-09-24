// Runs a snippet in a child process with a chosen set of MASV_* variables.
//
// Needed because src/api/env.ts reads the environment once, at import time. Nothing
// a test does in-process can change MASV_ALLOW_DELETE or remove a required variable
// after the fact, so the cases that depend on those have to be observed from outside.

import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/** A file URL for a module under src/, ready to paste into a dynamic import. */
export function moduleUrl(relativePath: string) {
  return JSON.stringify(pathToFileURL(resolve(ROOT, relativePath)).href);
}

/**
 * Runs `script` as an ES module. The child inherits the current environment with
 * every MASV_* variable stripped, then `masvEnv` applied — so a test states the
 * whole MASV configuration it wants and nothing leaks in from the parent.
 */
export function runInChild(script: string, masvEnv: Record<string, string> = {}) {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && !key.startsWith("MASV_")) env[key] = value;
  }
  Object.assign(env, masvEnv);

  return spawnSync(process.execPath, ["--input-type=module", "-e", script], {
    env,
    encoding: "utf8",
  });
}
