import { z } from "zod";
import { MASV_BASE_URL, MASV_TEAM_ID, MASV_API_KEY } from "./env.js";
import { getPackageToken } from "./packages.js";

async function getIntegrations() {
  const url = new URL(
    `${MASV_BASE_URL}/v1/teams/${MASV_TEAM_ID}/cloud_connections`,
  );

  const headers = {
    "content-type": "application/json",
    "x-api-key": MASV_API_KEY,
  };

  const r = await fetch(url.toString(), { headers });
  const data = await r.json();

  return data;
}

async function getIntegration(integrationId: string) {
  const url = new URL(
    `${MASV_BASE_URL}/v1/cloud_connections/${integrationId}`,
  );

  const headers = {
    "content-type": "application/json",
    "x-api-key": MASV_API_KEY,
  };

  const r = await fetch(url.toString(), { headers });
  const data = await r.json();

  if (r.ok) {
    return data;
  } else {
    throw new Error(JSON.stringify(data));
  }

}

const SendPackageToIntegrationSchema = z.object({
  packageId: z
    .string()
    .describe(
      "Id of the package that will be transferred to connected integration",
    ),
  integrationId: z
    .string()
    .describe("Id of the integration to transfer package to. Integration should have direction: masv_to_cloud."),
});

type SendPackageToIntegrationParams = z.infer<
  typeof SendPackageToIntegrationSchema
>;

async function sendPackageToIntegration({
  packageId,
  integrationId,
}: SendPackageToIntegrationParams) {
  const url = new URL(`${MASV_BASE_URL}/v1/packages/${packageId}/transfer`);

  const packageToken = await getPackageToken(packageId);

  const headers = {
    "content-type": "application/json",
    "x-package-token": packageToken,
  };

  const body = {
    cloud_connection_id: integrationId,
  };

  const r = await fetch(url.toString(), {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const data = await r.json();

  return data;
}

const TransferFileSchema = z.object({
  id: z.string().describe("File ID, for Storage Gateway it is full file path (path + filename)"),
  name: z.string().describe("File or directory name"),
  kind: z.enum(["file", "directory"]).describe("Type of item: file or directory"),
});

const TransferFilesFromIntegrationSchema = z.object({
  integrationId: z.string().describe("ID of the cloud or storage gateway integration"),
  files: z.array(TransferFileSchema).min(1).describe("Array of files/directories to transfer from the integration"),
  packageName: z.string().describe("Name for the new package"),
  packageDescription: z.string().optional().describe("Description for the package"),
  recipients: z.array(z.email()).optional().describe("Email addresses to send package to"),
  notifyEmail: z.email().optional().describe("Email to notify on transfer completion"),
  accessLimit: z.number().optional().describe("Download access limit (default: 5)"),
});

type TransferFilesFromIntegrationParams = z.infer<
  typeof TransferFilesFromIntegrationSchema
>;

async function transferFilesFromIntegration({
  integrationId,
  files,
  packageName,
  packageDescription = "",
  recipients = [],
  notifyEmail,
  accessLimit = 5,
}: TransferFilesFromIntegrationParams) {
  // Step 1: Get integration details to extract provider
  const integration = await getIntegration(integrationId);
  const provider = integration.provider;

  // Step 2: Create package
  const createPackageUrl = new URL(
    `${MASV_BASE_URL}/v1/teams/${MASV_TEAM_ID}/packages`,
  );

  const createPackageBody = {
    name: packageName,
    description: packageDescription,
    recipients: recipients,
    access_limit: accessLimit,
  };

  const createPackageHeaders = {
    "content-type": "application/json",
    "x-api-key": MASV_API_KEY,
  };

  const createPackageResponse = await fetch(createPackageUrl.toString(), {
    method: "POST",
    headers: createPackageHeaders,
    body: JSON.stringify(createPackageBody),
  });

  const packageData = await createPackageResponse.json();

  if (!createPackageResponse.ok) {
    throw new Error(`Failed to create package: ${JSON.stringify(packageData)}`);
  }

  const packageId = packageData.id;
  const packageToken = packageData.access_token;

  // Step 3: Initiate transfer
  const transferUrl = new URL(
    `${MASV_BASE_URL}/v1/packages/${packageId}/transfer`,
  );

  const transferBody = {
    cloud_connection_id: integrationId,
    direction: "cloud_to_masv",
    provider: provider,
    files: files,
    ...(notifyEmail && { notify_email: notifyEmail }),
  };

  const transferHeaders = {
    "content-type": "application/json",
    "x-package-token": packageToken,
  };

  const transferResponse = await fetch(transferUrl.toString(), {
    method: "POST",
    headers: transferHeaders,
    body: JSON.stringify(transferBody),
  });

  const transferData = await transferResponse.json();

  if (!transferResponse.ok) {
    throw new Error(`Failed to initiate transfer: ${JSON.stringify(transferData)}`);
  }

  // Step 4: Format response for LLM
  const fileCount = files.length;

  const fileList = files.slice(0, 10).map(file => {
    if (file.kind === "directory") {
      return `[DIR] ${file.name}/`;
    } else {
      return `[FILE] ${file.name}`;
    }
  });

  if (files.length > 10) {
    fileList.push(`... and ${files.length - 10} more items`);
  }

  const response = [
    "Transfer initiated successfully!",
    "",
    `Package: ${packageName}`,
    `Package ID: ${packageId}`,
    `Transfer ID: ${transferData.id}`,
    `Status: ${transferData.state}`,
    "",
    `Files being transferred (${fileCount} items):`,
    ...fileList,
    "",
    "Track progress:",
    `- Use get_activities tool with package_id: ${packageId}`,
    `- Use get_package tool with package_id: ${packageId}`,
    "- Or track progress in MASV web application",
  ].join("\n");

  return response;
}

// Cursor encodes pagination state for both integration types
type CloudCursor = { type: "cloud"; last_file_path: string };
type StorageGatewayCursor = { type: "storage_gateway"; offset: number };
type PaginationCursor = CloudCursor | StorageGatewayCursor;

function encodeCursor(cursor: PaginationCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64");
}

function decodeCursor(cursor: string): PaginationCursor {
  return JSON.parse(Buffer.from(cursor, "base64").toString("utf8"));
}

const PAGE_SIZE = 50;

const ListFilesOnIntegrationSchema = z.object({
  integrationId: z.string().describe("ID of the cloud or storage gateway integration"),
  path: z.string().optional().describe("Directory path/prefix to list files from"),
  cursor: z.string().optional().describe("Pagination cursor returned from a previous call. Pass this to retrieve the next page of results."),
});

type ListFilesOnIntegrationParams = z.infer<typeof ListFilesOnIntegrationSchema>;

async function listFilesOnIntegration({
  integrationId,
  path,
  cursor,
}: ListFilesOnIntegrationParams) {
  const integration = await getIntegration(integrationId);
  const STORAGE_GATEWAY_PROVIDERS = new Set([
    "storage_gateway",
    "jellyfish_sg",
    "synology_sg",
    "qnap_sg",
    "amazon_efs_sg",
    "opendrives_sg",
    "desktop_sg",
  ]);
  const isStorageGateway = STORAGE_GATEWAY_PROVIDERS.has(integration.provider);

  const headers = {
    "content-type": "application/json",
    "x-api-key": MASV_API_KEY,
  };

  let files: any[];
  let hasMore = false;
  let nextCursor: string | undefined;

  if (isStorageGateway) {
    // Storage gateway uses offset-based pagination
    let offset = 0;
    if (cursor) {
      const decoded = decodeCursor(cursor);
      if (decoded.type !== "storage_gateway") throw new Error("Invalid cursor for this integration type");
      offset = decoded.offset;
    }

    const url = new URL(
      `${MASV_BASE_URL}/v1/cloud_connections/providers/storage_gateway/${integrationId}/files`,
    );
    if (path) url.searchParams.append("path", path);
    url.searchParams.append("offset", String(offset));
    // Request 1 more file to check if there are more files than we return
    url.searchParams.append("count", String(PAGE_SIZE + 1));

    const r = await fetch(url.toString(), { headers });
    const data = await r.json();

    const allFiles = data.files || [];
    hasMore = allFiles.length > PAGE_SIZE || data.more_data === true;
    files = allFiles.slice(0, PAGE_SIZE);

    if (hasMore) {
      nextCursor = encodeCursor({ type: "storage_gateway", offset: offset + PAGE_SIZE });
    }
  } else {
    // Cloud integrations use last_file_path cursor pagination
    let last_file_path: string | undefined;
    if (cursor) {
      const decoded = decodeCursor(cursor);
      if (decoded.type !== "cloud") throw new Error("Invalid cursor for this integration type");
      last_file_path = decoded.last_file_path;
    }

    const url = new URL(
      `${MASV_BASE_URL}/v1/cloud_connections/${integrationId}/files`,
    );
    if (path) url.searchParams.append("prefix", path);
    if (last_file_path) url.searchParams.append("last_file_path", last_file_path);

    // Request 1 more file to check if there are more files than we return
    url.searchParams.append("count", String(PAGE_SIZE + 1));

    const r = await fetch(url.toString(), { headers });
    const data = await r.json();

    const allFiles = Array.isArray(data) ? data : [];
    hasMore = allFiles.length > PAGE_SIZE;
    files = allFiles.slice(0, PAGE_SIZE);

    if (hasMore) {
      const lastFile = files[files.length - 1];
      const lastPath = lastFile?.id || "";
      nextCursor = encodeCursor({ type: "cloud", last_file_path: lastPath });
    }
  }

  // Format response
  const formattedLines: string[] = [];

  for (const file of files) {
    const isDirectory = file.kind === "directory";
    const name = file.name || "";
    const size = file.size;
    const id = file.id || "";

    if (isDirectory) {
      formattedLines.push(`[DIR] ${name}/${id ? ` (ID: ${id})` : ""}`);
    } else {
      const sizeStr = size !== undefined && size !== null ? formatFileSize(size) : "unknown";
      formattedLines.push(`[FILE] ${name} (${sizeStr})${id ? ` (ID: ${id})` : ""}`);
    }
  }

  if (hasMore && nextCursor) {
    formattedLines.push(
      `\nMore results available. Call this tool again with cursor: ${nextCursor}`,
    );
  }

  return formattedLines.join("\n");
}

/**
 * Formats bytes into human-readable file size (KiB, MiB, GiB, TiB)
 */
function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";

  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  const bytesPerUnit = 1024;
  const maxUnitIndex = units.length - 1;

  let unitIndex = 0;
  let size = bytes;

  while (size >= bytesPerUnit && unitIndex !== maxUnitIndex) {
    unitIndex++;
    size = size / bytesPerUnit;
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`;
}


export {
  getIntegrations,
  getIntegration,
  SendPackageToIntegrationSchema,
  sendPackageToIntegration,
  ListFilesOnIntegrationSchema,
  listFilesOnIntegration,
  TransferFilesFromIntegrationSchema,
  transferFilesFromIntegration,
};
