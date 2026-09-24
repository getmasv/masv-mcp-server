import { z } from "zod";
import { MASV_BASE_URL, MASV_TEAM_ID, MASV_API_KEY } from "./env.ts";
import { masvFetch } from "./fetch.ts";

const GetTeamMembersSchema = z.object({});

type GetTeamMembersParams = z.infer<typeof GetTeamMembersSchema>;

async function getTeamMembers(_params: GetTeamMembersParams) {
  const url = new URL(`${MASV_BASE_URL}/v1/teams/${MASV_TEAM_ID}/members`);

  const headers = {
    "content-type": "application/json",
    "x-api-key": MASV_API_KEY,
  };

  return masvFetch(url, { headers });
}

export { GetTeamMembersSchema, getTeamMembers };
