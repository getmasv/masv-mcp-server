import { z } from "zod";
import { MASV_BASE_URL, MASV_TEAM_ID, MASV_API_KEY, MASV_ALLOW_DELETE } from "./env.js";

const GetPackagesSchema = z.object({
  page: z
    .number()
    .min(1)
    .describe("Page number of paginated response. First page is 1")
    .optional(),
  limit: z
    .number()
    .min(1)
    .max(100)
    .describe("Number of records returned per page")
    .optional(),
  sort: z
    .string()
    .describe("Sort results ascending (fieldname) or descending (-fieldname)")
    .optional(),
  status: z
    .array(z.enum(["new", "finalized", "expired", "archived"]))
    .describe(
      "Select packages with status. New - package is currently uploading and not ready for view/download yet, finalized - package was uploaded and is ready for download, view, or transfer to another storage destination, expired and archived means that package was deleted and files are not available anymore",
    )
    .optional(),
  name: z.string().describe("Filter packages by name").optional(),
  sender: z.string().describe("Filter packages by sender email").optional(),
  tags: z
    .array(z.string())
    .describe(
      "Filter packages by tag id. If any of provided tag ids match package will be returned",
    )
    .optional(),
  created_at_start: z
    .string()
    .describe("Retrieve records that were created after (YYYY-MM-DDTHH:mm:SS)")
    .optional(),
  created_at_end: z
    .string()
    .describe("Retrieve records that were created before (YYYY-MM-DDTHH:mm:SS)")
    .optional(),
  teamspaces: z
    .array(z.string())
    .describe(
      "Retrieve records where teamspace id is equal to one of these values",
    )
    .optional(),
  expiry_start: z
    .string()
    .describe("Retrieve records that expire after (YYYY-MM-DDTHH:mm:SS)")
    .optional(),
  expiry_end: z
    .string()
    .describe("Retrieve records that expire before (YYYY-MM-DDTHH:mm:SS)")
    .optional(),
  extra_storage: z
    .boolean()
    .describe(
      "If true, will only include packages which will or have already incurred extended storage costs",
    )
    .optional(),
});

type GetPackagesParams = z.infer<typeof GetPackagesSchema>;

async function getPackages({ page, ...params }: GetPackagesParams) {
  const url = new URL(`${MASV_BASE_URL}/v1.1/teams/${MASV_TEAM_ID}/packages`);

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

  return data;
}

const GetPackageSchema = z.object({
  packageId: z.string().describe("Id of the package to retrieve"),
});

type GetPackageParams = z.infer<typeof GetPackageSchema>;

async function getPackage({ packageId }: GetPackageParams) {
  const url = new URL(
    `${MASV_BASE_URL}/v1.1/teams/${MASV_TEAM_ID}/packages/${packageId}`,
  );

  const headers = {
    "content-type": "application/json",
    "x-api-key": MASV_API_KEY,
  };

  const r = await fetch(url.toString(), { headers });
  const data = await r.json();

  return data;
}

const GetPortalPackagesSchema = z.object({
  page: z
    .number()
    .min(1)
    .describe("Page number of paginated response. First page is 1")
    .optional(),
  limit: z
    .number()
    .min(1)
    .max(100)
    .describe("Number of records returned per page")
    .optional(),
  sort: z
    .string()
    .describe("Sort results ascending (fieldname) or descending (-fieldname)")
    .optional(),
  status: z
    .array(z.enum(["new", "finalized", "expired", "archived"]))
    .describe(
      "Select packages with status. New - package is currently uploading and not ready for view/download yet, finalized - package was uploaded and is ready for download, view, or transfer to another storage destination, expired and archived means that package was deleted and files are not available anymore",
    )
    .optional(),
  name: z.string().describe("Filter packages by name").optional(),
  sender: z.string().describe("Filter packages by sender email").optional(),
  portal: z
    .string()
    .describe("Retrieve records that belongs to the specified portal name")
    .optional(),
  tags: z
    .array(z.string())
    .describe(
      "Filter packages by tag id. If any of provided tag ids match package will be returned",
    )
    .optional(),
  created_at_start: z
    .string()
    .describe("Retrieve records that were created after (YYYY-MM-DDTHH:mm:SS)")
    .optional(),
  created_at_end: z
    .string()
    .describe("Retrieve records that were created before (YYYY-MM-DDTHH:mm:SS)")
    .optional(),
  teamspaces: z
    .array(z.string())
    .describe(
      "Retrieve records where teamspace id is equal to one of these values",
    )
    .optional(),
  expiry_start: z
    .string()
    .describe("Retrieve records that expire after (YYYY-MM-DDTHH:mm:SS)")
    .optional(),
  expiry_end: z
    .string()
    .describe("Retrieve records that expire before (YYYY-MM-DDTHH:mm:SS)")
    .optional(),
  extra_storage: z
    .boolean()
    .describe(
      "If true, will only include packages which will or have already incurred extended storage costs",
    )
    .optional(),
});

type GetPortalPackagesParams = z.infer<typeof GetPortalPackagesSchema>;

async function getPortalPackages({ page, ...params }: GetPortalPackagesParams) {
  const url = new URL(`${MASV_BASE_URL}/v1.1/teams/${MASV_TEAM_ID}/inbox`);

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

  return data;
}

async function getPackageToken(packageId: string) {
  const data = await getPackage({ packageId });
  return data.access_token;
}

const GetPackageFilesSchema = z.object({
  packageId: z.string().describe("Id of the package to retrieve files for"),
});

type GetPackageFilesParams = z.infer<typeof GetPackageFilesSchema>;

async function getPackageFiles({ packageId }: GetPackageFilesParams) {
  const packageToken = await getPackageToken(packageId);

  const url = new URL(`${MASV_BASE_URL}/v1/packages/${packageId}/files`);

  const headers = {
    "content-type": "application/json",
    "x-package-token": packageToken,
  };

  const r = await fetch(url.toString(), { headers });
  const data = await r.json();

  return data;
}

const GetPackageTransfersSchema = z.object({
  packageId: z
    .string()
    .describe(
      "Id of the package to retrieve transfers for. Transfer is a package delivery via MASV to cloud or on-premise (via MASV Storage Gateway) destination",
    ),
});

type GetPackageTransfersParams = z.infer<typeof GetPackageTransfersSchema>;

async function getPackageTransfers({ packageId }: GetPackageTransfersParams) {
  const packageToken = await getPackageToken(packageId);

  const url = new URL(`${MASV_BASE_URL}/v1/packages/${packageId}/transfer`);

  const headers = {
    "content-type": "application/json",
    "x-package-token": packageToken,
  };

  const r = await fetch(url.toString(), { headers });
  const data = await r.json();

  return data;
}

const UpdatePackageExpiryDateSchema = z.object({
  packageId: z.string().describe("Id of the package to update expiry date for"),
  unlimited_storage: z
    .boolean()
    .describe(
      "Specifies if unlimited storage is enabled or disabled for a package. If disabling unlimited storage expiry parameter must be set",
    ),
  expiry: z.iso
    .datetime()
    .describe(
      "The date and time on which the package will expire in UTC (ISO 8601 format). When setting expiry unlimited_storage parameter should be false",
    )
    .optional(),
});

type UpdatePackageExpiryDateSchemaParams = z.infer<
  typeof UpdatePackageExpiryDateSchema
>;

async function updatePackageExpiry({
  packageId,
  unlimited_storage,
  expiry,
}: UpdatePackageExpiryDateSchemaParams) {
  const packageToken = await getPackageToken(packageId);

  const url = new URL(`${MASV_BASE_URL}/v1/packages/${packageId}/expiry`);

  const headers = {
    "content-type": "application/json",
    "x-package-token": packageToken,
  };

  let body;

  if (unlimited_storage == true) {
    if (expiry) {
      throw new Error(
        "Can not set both unlimited_storage: true and expiration date. If you want to enable unlimited storage please only pass unlimited_storage parameter",
      );
    }

    body = {
      unlimited_storage: true,
    };
  } else {
    if (!expiry)
      throw new Error(
        "expiry parameter must be provided if unlimited storage is disabled",
      );

    body = {
      unlimited_storage: false,
      expiry,
    };
  }

  const r = await fetch(url.toString(), {
    method: "PUT",
    headers,
    body: JSON.stringify(body),
  });
  const data = await r.json();

  return data;
}

const DeletePackageSchema = z.object({
  packageId: z.string().describe("Id of the package to delete"),
});

type DeletePackageParams = z.infer<typeof DeletePackageSchema>;

async function deletePackage({ packageId }: DeletePackageParams) {
  if (!MASV_ALLOW_DELETE) {
    throw new Error("Delete operations are not allowed. Set MASV_ALLOW_DELETE=true in environment variables to enable.");
  }

  const packageToken = await getPackageToken(packageId);

  const url = new URL(`${MASV_BASE_URL}/v1/packages/${packageId}`);

  const headers = {
    "content-type": "application/json",
    "x-package-token": packageToken,
  };

  const r = await fetch(url.toString(), { method: "DELETE", headers });

  if (r.status === 204) {
    return { success: true, message: "Package deleted successfully" };
  }

  const data = await r.json();
  return data;
}

export {
  GetPackagesSchema,
  getPackages,
  GetPackageSchema,
  getPackage,
  GetPortalPackagesSchema,
  getPortalPackages,
  GetPackageFilesSchema,
  getPackageFiles,
  GetPackageTransfersSchema,
  getPackageTransfers,
  UpdatePackageExpiryDateSchema,
  updatePackageExpiry,
  DeletePackageSchema,
  deletePackage,
  getPackageToken,
};
