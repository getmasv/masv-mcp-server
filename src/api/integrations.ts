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

const ListFilesOnIntegrationSchema = z.object({
  integrationId: z.string().describe("Id of the integration to list files on"),
  prefix: z
    .string()
    .describe("A directory prefix (path) to list files from.")
    .optional(),
});

type ListFilesOnIntegrationParams = z.infer<
  typeof ListFilesOnIntegrationSchema
>;

async function listFilesOnIntegration({
  integrationId,
  ...params
}: ListFilesOnIntegrationParams) {
  // Step 1: Verify integration is NOT a storage_gateway type
  const integration = await getIntegration(integrationId);

  if (integration.provider === "storage_gateway") {
    throw new Error("For Storage Gateway integrations please use tool list_files_on_storage_gateway");
  }

  // Step 2: Get files from integration
  const url = new URL(
    `${MASV_BASE_URL}/v1/cloud_connections/${integrationId}/files`,
  );

  // Add params from schema
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) {
      url.searchParams.append(key, String(value));
    }
  });

  // Request 1 more file to check if there are more files than we return
  url.searchParams.append("count", "51");

  const headers = {
    "content-type": "application/json",
    "x-api-key": MASV_API_KEY,
  };

  const r = await fetch(url.toString(), { headers });
  const data = await r.json();

  // Step 3: Format the response for LLM consumption
  const files = Array.isArray(data) ? data : [];
  const hasMore = files.length > 50;
  const displayFiles = files.slice(0, 50);

  const formattedLines: string[] = [];

  for (const file of displayFiles) {
    const isDirectory = file.kind === "directory";
    const name = file.name || "";
    const size = file.size;
    const id = file.id || "";

    if (isDirectory) {
      formattedLines.push(`[DIR] ${name}/ (ID: ${id})`);
    } else {
      const sizeStr = size !== undefined && size !== null ? formatFileSize(size) : "unknown";
      formattedLines.push(`[FILE] ${name} (${sizeStr}) (ID: ${id})`);
    }
  }

  if (hasMore) {
    formattedLines.push(
      "\nMore results available please use more specific prefix to search for those files"
    );
  }

  return formattedLines.join("\n");
}

const ListFilesOnStorageGatewayIntegrationSchema = z.object({
  integrationId: z
    .string()
    .describe("Id of the MASV Storage Gateway integration to list files on"),
  path: z.string().describe("A directory path to list files from.").optional(),
});

type ListFilesOnStorageGatewayIntegrationParams = z.infer<
  typeof ListFilesOnStorageGatewayIntegrationSchema
>;

async function listFilesOnStorageGatewayIntegration({
  integrationId,
  ...params
}: ListFilesOnStorageGatewayIntegrationParams) {
  // Step 1: Verify integration is a storage_gateway type
  const integration = await getIntegration(integrationId);

  if (integration.provider !== "storage_gateway") {
    throw new Error("For non Storage Gateway integrations please use tool list_files_on_integration");
  }

  // Step 2: Get files from storage gateway
  const url = new URL(
    `${MASV_BASE_URL}/v1/cloud_connections/providers/storage_gateway/${integrationId}/files`,
  );

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) {
      url.searchParams.append(key, String(value));
    }
  });

  const headers = {
    "content-type": "application/json",
    "x-api-key": MASV_API_KEY,
  };

  const r = await fetch(url.toString(), { headers });
  const data = await r.json();

  // Step 3: Format the response for LLM consumption
  const files = data.files || [];
  const moreData = data.more_data || false;
  const displayFiles = files.slice(0, 50);

  const formattedLines: string[] = [];

  for (const file of displayFiles) {
    const isDirectory = file.kind === "directory";
    const name = file.name || "";
    const size = file.size;

    if (isDirectory) {
      formattedLines.push(`[DIR] ${name}/`);
    } else {
      const sizeStr = size !== undefined && size !== null ? formatFileSize(size) : "unknown";
      formattedLines.push(`[FILE] ${name} (${sizeStr})`);
    }
  }

  if (files.length > 50 || moreData) {
    formattedLines.push(
      "\nThe tool is displaying only 50 file records, more files exist in requested path. To access them please use MASV web application."
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
  ListFilesOnStorageGatewayIntegrationSchema,
  listFilesOnStorageGatewayIntegration,
  TransferFilesFromIntegrationSchema,
  transferFilesFromIntegration,
};
