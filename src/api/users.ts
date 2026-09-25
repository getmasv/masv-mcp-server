import { z } from "zod";
import { apiKey, baseUrl, teamId } from "./env.ts";
import { masvFetch } from "./fetch.ts";

const GetTeamMembersSchema = z.object({});

type GetTeamMembersParams = z.infer<typeof GetTeamMembersSchema>;

async function getTeamMembers(_params: GetTeamMembersParams) {
  const url = new URL(`${baseUrl()}/v1/teams/${teamId()}/members`);

  const headers = {
    "content-type": "application/json",
    "x-api-key": apiKey(),
  };

  return masvFetch(url, { headers });
}

export { GetTeamMembersSchema, getTeamMembers };
