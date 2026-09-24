import { z } from "zod";
import { MASV_BASE_URL, MASV_TEAM_ID, MASV_API_KEY, MASV_ALLOW_DELETE } from "./env.ts";
import { masvFetch } from "./fetch.ts";

const GetPackagesSchema = z.object({
  page: z.number().min(1).describe("Page number of paginated response. First page is 1").optional(),
  limit: z.number().min(1).max(100).describe("Number of records returned per page").optional(),
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
    .describe("Retrieve records where teamspace id is equal to one of these values")
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

async function getPackages(params: GetPackagesParams) {
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

  return masvFetch(url, { headers });
}

const GetPackageSchema = z.object({
  packageId: z.string().describe("Id of the package to retrieve"),
});

type GetPackageParams = z.infer<typeof GetPackageSchema>;

async function getPackage({ packageId }: GetPackageParams) {
  const url = new URL(`${MASV_BASE_URL}/v1.1/teams/${MASV_TEAM_ID}/packages/${packageId}`);

  const headers = {
    "content-type": "application/json",
    "x-api-key": MASV_API_KEY,
  };

  return masvFetch(url, { headers });
}

const GetPortalPackagesSchema = z.object({
  page: z.number().min(1).describe("Page number of paginated response. First page is 1").optional(),
  limit: z.number().min(1).max(100).describe("Number of records returned per page").optional(),
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
    .describe("Retrieve records where teamspace id is equal to one of these values")
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

async function getPortalPackages(params: GetPortalPackagesParams) {
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

  return masvFetch(url, { headers });
}

async function getPackageToken(packageId: string) {
  const data = await getPackage({ packageId });
  const token = data?.access_token;

  // Without this, an absent token becomes the literal header value "undefined" on
  // the next request, which fails for a reason that looks unrelated to the package.
  if (!token) {
    throw new Error(
      `MASV returned no access token for package ${packageId}, so its files, transfers and ` +
        `expiry cannot be accessed. Check the package id, and that this API key may read it.`,
    );
  }

  return token;
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

  return masvFetch(url, { headers });
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

  return masvFetch(url, { headers });
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

type UpdatePackageExpiryDateSchemaParams = z.infer<typeof UpdatePackageExpiryDateSchema>;

async function updatePackageExpiry({
  packageId,
  unlimited_storage,
  expiry,
}: UpdatePackageExpiryDateSchemaParams) {
  // Validated before the package lookup, so a contradictory request costs no round
  // trip and the error names the argument at fault rather than the package.
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
      throw new Error("expiry parameter must be provided if unlimited storage is disabled");

    body = {
      unlimited_storage: false,
      expiry,
    };
  }

  const packageToken = await getPackageToken(packageId);

  const url = new URL(`${MASV_BASE_URL}/v1/packages/${packageId}/expiry`);

  const headers = {
    "content-type": "application/json",
    "x-package-token": packageToken,
  };

  return masvFetch(url, {
    method: "PUT",
    headers,
    body: JSON.stringify(body),
  });
}

const DeletePackageSchema = z.object({
  packageId: z.string().describe("Id of the package to delete"),
});

type DeletePackageParams = z.infer<typeof DeletePackageSchema>;

async function deletePackage({ packageId }: DeletePackageParams) {
  if (!MASV_ALLOW_DELETE) {
    throw new Error(
      "Delete operations are not allowed. Set MASV_ALLOW_DELETE=true in environment variables to enable.",
    );
  }

  const packageToken = await getPackageToken(packageId);

  const url = new URL(`${MASV_BASE_URL}/v1/packages/${packageId}`);

  const headers = {
    "content-type": "application/json",
    "x-package-token": packageToken,
  };

  // A successful delete answers 204 with no body, which masvFetch reports as null.
  const data = await masvFetch(url, { method: "DELETE", headers });

  return data ?? { success: true, message: "Package deleted successfully" };
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
