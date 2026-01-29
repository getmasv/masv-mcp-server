if (!process.env.MASV_TEAM_ID)
  throw new Error(
    "MASV_TEAM_ID is not set. Please set it in MCP server config environment variables."
  );

if (!process.env.MASV_API_KEY)
  throw new Error(
    "MASV_API_KEY is not set. Please set it in MCP server config environment variables."
  );

export const MASV_BASE_URL = process.env.MASV_BASE_URL || "https://api.massive.app";
export const MASV_TEAM_ID = process.env.MASV_TEAM_ID;
export const MASV_API_KEY = process.env.MASV_API_KEY;
export const MASV_ALLOW_DELETE = process.env.MASV_ALLOW_DELETE === "true";