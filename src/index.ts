#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  GetPackagesSchema,
  getPackages,
  GetPackageSchema,
  getPackage,
  GetPortalPackagesSchema,
  getPortalPackages,
  GetPackageFilesSchema,
  getPackageFiles,
  getPackageTransfers,
  GetPackageTransfersSchema,
  UpdatePackageExpiryDateSchema,
  updatePackageExpiry,
  DeletePackageSchema,
  deletePackage,
} from "./api/packages.js";
import { mcpOk, mcpError } from "./mcp-responses.js";
import {
  getActivities,
  getActivitiesInformation,
  GetActivitiesSchema,
  getActivityEvents,
  GetActivityEventsSchema,
} from "./api/activities.js";
import {
  getIntegrations,
  listFilesOnStorageGatewayIntegration,
  ListFilesOnStorageGatewayIntegrationSchema,
  listFilesOnIntegration,
  ListFilesOnIntegrationSchema,
  sendPackageToIntegration,
  SendPackageToIntegrationSchema,
  transferFilesFromIntegration,
  TransferFilesFromIntegrationSchema,
} from "./api/integrations.js";
import {
  GetPortalsSchema,
  getPortals,
  GetPortalSchema,
  getPortal,
  CreatePortalSchema,
  createPortal,
  UpdatePortalSchema,
  updatePortal,
  DeletePortalSchema,
  deletePortal,
} from "./api/portals.js";
import {
  GetTeamMembersSchema,
  getTeamMembers,
} from "./api/users.js";
import { MASV_TEAM_ID, MASV_API_KEY } from "./api/env.js";

// Check required variables
if (!MASV_TEAM_ID || !MASV_API_KEY) throw new Error("Please set MASV_TEAM_ID and MASV_API_KEY variables in MCP server config or environment variables.")


// Server instance
const server = new McpServer({
  name: "masv-mcp-server",
  version: "0.0.1",
});

// Tools

server.registerTool(
  "get_packages",
  {
    description:
      "Get team packages. These are packages sent by MASV team users directly to MASV. It does not include packages sent to Portals. To get full list of packages you need to get both team packages and portal packages",
    inputSchema: GetPackagesSchema.shape,
  },
  async (args) => {
    try {
      const data = await getPackages(args);

      return mcpOk(data);
    } catch (error) {
      return mcpError(error);
    }
  },
);

server.registerTool(
  "get_package",
  {
    description: "Get package by id",
    inputSchema: GetPackageSchema.shape,
  },
  async (args) => {
    try {
      const data = await getPackage(args);

      return mcpOk(data);
    } catch (error) {
      return mcpError(error);
    }
  },
);

server.registerTool(
  "get_portal_packages",
  {
    description:
      "Get portal packages. These are packages uploaded by anyone to MASV Portals. Only packages that were uploaded to Portals returned by this tool. To get full list of packages you need to get both team packages and portal packages.",
    inputSchema: GetPortalPackagesSchema.shape,
  },
  async (args) => {
    try {
      const data = await getPortalPackages(args);

      return mcpOk(data);
    } catch (error) {
      return mcpError(error);
    }
  },
);

server.registerTool(
  "get_package_files",
  {
    description: "Get list of package files",
    inputSchema: GetPackageFilesSchema.shape,
  },
  async (args) => {
    try {
      const data = await getPackageFiles(args);

      return mcpOk(data);
    } catch (error) {
      return mcpError(error);
    }
  },
);

server.registerTool(
  "get_package_transfers",
  {
    description:
      "Get all transfers of a package to storage. Transfer is a package delivery via MASV to cloud or on-premise (via MASV Storage Gateway) destination",
    inputSchema: GetPackageTransfersSchema.shape,
  },
  async (args) => {
    try {
      const data = await getPackageTransfers(args);

      return mcpOk(data);
    } catch (error) {
      return mcpError(error);
    }
  },
);

server.registerTool(
  "update_package_expiration_date_and_time",
  {
    description:
      "Update package expiration date and time. Also allows enable or disable unlimited storage. Additional package storage may incur charges, depending on your team subscription plan. Once expired the package and all of its files are deleted and can not be restored.",
    inputSchema: UpdatePackageExpiryDateSchema.shape,
  },
  async (args) => {
    try {
      const data = await updatePackageExpiry(args);

      return mcpOk(data);
    } catch (error) {
      return mcpError(error);
    }
  },
);

server.registerTool(
  "delete_package",
  {
    description:
      "Delete a package by ID. This permanently removes the package and all its files and cannot be undone. Requires MASV_ALLOW_DELETE=true environment variable to be set.",
    inputSchema: DeletePackageSchema.shape,
  },
  async (args) => {
    try {
      const data = await deletePackage(args);

      return mcpOk(data);
    } catch (error) {
      return mcpError(error);
    }
  },
);

server.registerTool(
  "get_activities",
  {
    description:
      "Get activities. Activities are records of events that happened with MASV resources like packages, links and transfers. Each activity has assosiated events and can be in one of several states: pending, started, complete, cancelled, error. Full list of activity types: package_upload_to_masv (package upload from user or connected storage integration to MASV), package_download_from_masv (user downloads package), link_generation (new download link is added to the package), package_transfer_masv_to_cloud (package transfer from MASV to connected storage integration)",
    inputSchema: GetActivitiesSchema.shape,
  },
  async (args) => {
    try {
      const data = await getActivities(args);

      return mcpOk(data);
    } catch (error) {
      return mcpError(error);
    }
  },
);

server.registerTool(
  "get_activity_events",
  {
    description:
      "Get history of events for given activity. Activity gets event record every time it transitions to a new state. It is very useful to get events history to get more information about activity because it can transition states several times and activity only keeps track of its current state.",
    inputSchema: GetActivityEventsSchema.shape,
  },
  async (args) => {
    try {
      const data = await getActivityEvents(args);

      return mcpOk(data);
    } catch (error) {
      return mcpError(error);
    }
  },
);

server.registerTool(
  "get_activities_information",
  {
    description:
      "Get detailed information about all existing activities and their accurate states description. Always use this tool provide users with detailed explanation about activities and their states.",
  },
  async () => {
    try {
      const data = getActivitiesInformation();

      return mcpOk(data);
    } catch (error) {
      return mcpError(error);
    }
  },
);

server.registerTool(
  "get_integrations",
  {
    description:
      "Get list of connected integrations. Integration could be cloud or on-prem system like AWS S3, Frame.io, Dropbox, MASV Storage Gateway and many others",
  },
  async () => {
    try {
      const data = await getIntegrations();

      return mcpOk(data);
    } catch (error) {
      return mcpError(error);
    }
  },
);

server.registerTool(
  "send_package_to_integration",
  {
    description:
      "Send MASV package to connected integration. Integration could be cloud or on-prem system like AWS S3, Frame.io, Dropbox, MASV Storage Gateway and many others",
    inputSchema: SendPackageToIntegrationSchema.shape,
  },
  async (args) => {
    try {
      const data = await sendPackageToIntegration(args);

      return mcpOk(data);
    } catch (error) {
      return mcpError(error);
    }
  },
);

server.registerTool(
  "list_files_on_integration",
  {
    description:
      "List files on cloud integration (AWS S3, Wasabi, IBM Cloud). For MASV Storage Gateway integrations use list_files_on_storage_gateway tool instead.",
    inputSchema: ListFilesOnIntegrationSchema.shape,
  },
  async (args) => {
    try {
      const data = await listFilesOnIntegration(args);

      return mcpOk(data);
    } catch (error) {
      return mcpError(error);
    }
  },
);

server.registerTool(
  "list_files_on_storage_gateway",
  {
    description:
      "List files on MASV Storage Gateway integration.",
    inputSchema: ListFilesOnStorageGatewayIntegrationSchema.shape,
  },
  async (args) => {
    try {
      const data = await listFilesOnStorageGatewayIntegration(args);

      return mcpOk(data);
    } catch (error) {
      return mcpError(error);
    }
  },
);

server.registerTool(
  "transfer_files_from_integration",
  {
    description:
      "Transfer files from a cloud integration (AWS S3, Azure, Dropbox, etc.) or MASV Storage Gateway to MASV. Creates a new package and initiates the transfer. Use list_files_on_integration or list_files_on_storage_gateway first to get file information including IDs.",
    inputSchema: TransferFilesFromIntegrationSchema.shape,
  },
  async (args) => {
    try {
      const data = await transferFilesFromIntegration(args);

      return mcpOk(data);
    } catch (error) {
      return mcpError(error);
    }
  },
);

server.registerTool(
  "get_portals",
  {
    description:
      "Get list of portals that belong to the team. Portals are used to collect files from external users. Each portal has a unique subdomain and can be configured with various settings like upload and download password, file type restrictions, connected integrations, metadata forms, etc.",
    inputSchema: GetPortalsSchema.shape,
  },
  async (args) => {
    try {
      const data = await getPortals(args);

      return mcpOk(data);
    } catch (error) {
      return mcpError(error);
    }
  },
);

server.registerTool(
  "get_portal",
  {
    description:
      "Get a specific portal by ID. Returns detailed information about the portal including its configuration, recipients, connected integrations, and settings.",
    inputSchema: GetPortalSchema.shape,
  },
  async (args) => {
    try {
      const data = await getPortal(args);

      return mcpOk(data);
    } catch (error) {
      return mcpError(error);
    }
  },
);

server.registerTool(
  "create_portal",
  {
    description:
      "Create a new portal for collecting files from external users. Portals can be configured with access codes, download passwords, file type restrictions, custom branding, connected integrations, and more. Only 'name' and 'subdomain' are required - all other settings are optional.",
    inputSchema: CreatePortalSchema.shape,
  },
  async (args) => {
    try {
      const data = await createPortal(args);

      return mcpOk(data);
    } catch (error) {
      return mcpError(error);
    }
  },
);

server.registerTool(
  "update_portal",
  {
    description:
      "Update an existing portal's configuration. Use this to modify portal settings like access controls, branding, file restrictions, and more.",
    inputSchema: UpdatePortalSchema.shape,
  },
  async (args) => {
    try {
      const data = await updatePortal(args);

      return mcpOk(data);
    } catch (error) {
      return mcpError(error);
    }
  },
);

server.registerTool(
  "delete_portal",
  {
    description:
      "Delete a portal by ID. This permanently removes the portal and cannot be undone. Packages that were uploaded to this portal will remain accessible. Requires MASV_ALLOW_DELETE=true environment variable to be set.",
    inputSchema: DeletePortalSchema.shape,
  },
  async (args) => {
    try {
      const data = await deletePortal(args);

      return mcpOk(data);
    } catch (error) {
      return mcpError(error);
    }
  },
);

server.registerTool(
  "get_team_members",
  {
    description:
      "Get list of all team members. Returns member details including id (membership_id), email, name, policy, approval status, and teamspaces. Use this to get membership IDs needed for portal access_list when creating private portals.",
    inputSchema: GetTeamMembersSchema.shape,
  },
  async (args) => {
    try {
      const data = await getTeamMembers(args);

      return mcpOk(data);
    } catch (error) {
      return mcpError(error);
    }
  },
);

// Main function

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MASV MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
