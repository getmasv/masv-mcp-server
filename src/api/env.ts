/**
 * Configuration, read from the environment at the point of use.
 *
 * Nothing is cached in a module constant. The values cannot change during a server's
 * life, so reading them per call costs nothing, and it keeps every one of them
 * reachable from a test: set the variable, call the code, restore it.
 *
 * These are functions rather than raw `process.env` reads at the call sites because
 * `process.env.X` is typed `string | undefined`, which does not satisfy the header
 * objects and silently interpolates as the literal "undefined" into a URL. Returning a
 * validated `string` keeps that impossible, and puts the default base URL in one place
 * instead of at all 27 places a URL is built.
 */

const DEFAULT_BASE_URL = "https://api.massive.app";

/** The MASV API root. Defaults to production. */
export function baseUrl(): string {
  return process.env.MASV_BASE_URL || DEFAULT_BASE_URL;
}

/** The team every request is scoped to. Throws if unset. */
export function teamId(): string {
  return required("MASV_TEAM_ID");
}

/** The team API key, which carries the caller's permissions. Throws if unset. */
export function apiKey(): string {
  return required("MASV_API_KEY");
}

/**
 * Whether the two irreversible tools are permitted. Anything other than exactly
 * "true" leaves the gate closed — it fails closed by design.
 */
export function deleteAllowed(): boolean {
  return process.env.MASV_ALLOW_DELETE === "true";
}

/**
 * Fails unless the required credentials are present.
 *
 * Called once from src/index.ts at startup. Without it the server would start cleanly
 * and then fail on every tool call rather than saying what is missing.
 */
export function assertConfigured(): void {
  teamId();
  apiKey();
}

function required(name: "MASV_TEAM_ID" | "MASV_API_KEY"): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(
      `${name} is not set. Please set it in MCP server config environment variables.`,
    );
  }

  return value;
}
