import { z } from "zod";
import { MASV_BASE_URL, MASV_TEAM_ID, MASV_API_KEY, MASV_ALLOW_DELETE } from "./env.js";

const GetPortalsSchema = z.object({
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
        .enum(["name", "-name", "created_at", "-created_at", "active", "-active"])
        .describe(
            "Sort results by field. Use field name for ascending order or prefix with '-' for descending (e.g., 'name' or '-created_at')",
        )
        .optional(),
    name: z.string().describe("Filter portals by name").optional(),
    subdomain: z.string().describe("Filter portals by subdomain").optional(),
    tags: z
        .array(z.string())
        .describe(
            "Filter portals by tag id. If any of provided tag ids match portal will be returned",
        )
        .optional(),
    teamspaces: z
        .array(z.string())
        .describe(
            "Retrieve records where teamspace id is equal to one of these values",
        )
        .optional(),
});

type GetPortalsParams = z.infer<typeof GetPortalsSchema>;

async function getPortals({ page, limit, sort, ...params }: GetPortalsParams) {
    const url = new URL(`${MASV_BASE_URL}/v1.1/teams/${MASV_TEAM_ID}/portals`);

    if (page !== undefined) url.searchParams.append("page", String(page));
    if (limit !== undefined) url.searchParams.append("limit", String(limit));
    if (sort !== undefined) url.searchParams.append("sort", sort);

    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
            if (Array.isArray(value)) {
                value.forEach((v) => url.searchParams.append(key, String(v)));
            } else {
                url.searchParams.append(key, String(value));
            }
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

const GetPortalSchema = z.object({
    portalId: z.string().describe("Id of the portal to retrieve"),
});

type GetPortalParams = z.infer<typeof GetPortalSchema>;

async function getPortal({ portalId }: GetPortalParams) {
    const url = new URL(`${MASV_BASE_URL}/v1.1/portals/${portalId}`);

    const headers = {
        "content-type": "application/json",
        "x-api-key": MASV_API_KEY,
    };

    const r = await fetch(url.toString(), { headers });
    const data = await r.json();

    return data;
}

const CreatePortalSchema = z.object({
    name: z.string().max(255).describe("Portal name"),
    subdomain: z.string().min(3).max(53).describe("Portal subdomain (3-53 characters)"),
    access_level: z
        .enum(["regular", "private"])
        .describe("Portal access level: 'regular' for public access, 'private' for restricted access")
        .optional(),
    access_list: z.array(z.string()).describe("Array of membership IDs for users with direct access to private portal. Use get_team_members to retrieve membership IDs").optional(),
    has_access_code: z.boolean().describe("Whether portal requires an access code to upload (if true, you also need to specify access_code parameter)").optional(),
    access_code: z.string().max(72).describe("Access code for portal (required if has_access_code is true)").optional(),
    has_download_password: z.boolean().describe("Whether portal packages require password to download (if true, you also need to specify download_password parameter)").optional(),
    download_password: z.string().max(72).describe("Download password (required if has_download_password is true)").optional(),
    message: z.string().describe("Welcome message displayed on portal").optional(),
    disable_upload_receipt: z.boolean().describe("Disable email receipt to uploader").optional(),
    active: z.boolean().describe("Whether portal is active and accepting uploads").optional(),
    recipients: z.array(z.email()).describe("Email addresses that receive notifications for portal uploads").optional(),
    cc_recipients: z.array(z.email()).describe("Email addresses that receive carbon copy notifications without download link").optional(),
    primary_color: z.string().max(255).describe("Primary color for portal branding (hex color code)").optional(),
    background_url: z.string().describe("URL of background image for portal").optional(),
    logo_url: z.string().describe("URL of logo image for portal").optional(),
    teamspace_id: z.string().describe("ID of teamspace to associate portal with").optional(),
    custom_expiry_days: z.number().int().min(-1).max(65535).describe("Custom expiry days for packages (-1 for unlimited)").optional(),
    expiry: z.string().describe("Portal expiry date (ISO 8601 format). This parameter is required when expiry_enabled: true").optional(),
    expiry_enabled: z.boolean().describe("Whether portal expiry is enabled. If set to true, need to also provide expiry parameter, e.g. expiry: '2027-01-01'").optional(),
    file_type_restriction_enabled: z.boolean().describe("Whether file type restrictions are enabled").optional(),
    file_type_restriction_exclude: z.boolean().describe("Whether to exclude (true) or include (false) specified file types").optional(),
    file_types: z.array(z.string()).describe("Allowed/excluded file extensions prefixed with dots (e.g., ['.mp4', '.mov'])").optional(),
    max_file_count: z.number().int().describe("Maximum number of files per upload (0 for unlimited). Only works when package_size_restriction_enabled: true").optional(),
    max_file_size: z.number().int().describe("Maximum file size in bytes (0 for unlimited). Only works when package_size_restriction_enabled: true").optional(),
    max_package_size: z.number().int().describe("Maximum package size in bytes (0 for unlimited). Only works when package_size_restriction_enabled: true").optional(),
    package_size_restriction_enabled: z.boolean().describe("Whether package size restrictions are enabled. Set to true in order to set max_file_count, max_file_size or max_package_size").optional(),
    user_authentication_required: z.boolean().describe("Whether to restrict Portal upload to only team users with proper access. Users must authenticate to upload").optional(),
    download_user_authentication_required: z.boolean().describe("Whether users must authenticate to download").optional(),
    package_name_format_enabled: z.boolean().describe("Whether custom package naming format is enabled").optional(),
    package_name_format: z.object({
        value: z.string().describe("Regex pattern used to enforce package name format (e.g., '^s\d{2}_e\d{2}$')"),
        label: z.string().describe("Label shown to users explaining the required package name format (e.g., 'Format For Videos')"),
    }).describe("Custom package naming format configuration (required when package_name_format_enabled is true)").optional(),
    terms_of_service_enabled: z.boolean().describe("Whether terms of service acceptance is required to upload to the portal").optional(),
    terms_of_service: z.object({
        title: z.string().describe("Title of the terms of service"),
        description: z.string().describe("Description or content of the terms of service"),
        checkbox_label: z.string().describe("Label for the acceptance checkbox"),
        checkbox_url: z.string().describe("URL to full terms of service document or any other additional information"),
    }).describe("Terms of service configuration (required when terms_of_service_enabled is true)").optional(),
});

type CreatePortalParams = z.infer<typeof CreatePortalSchema>;

async function createPortal(params: CreatePortalParams) {
    const url = new URL(`${MASV_BASE_URL}/v1/teams/${MASV_TEAM_ID}/portals`);

    const headers = {
        "content-type": "application/json",
        "x-api-key": MASV_API_KEY,
    };

    const r = await fetch(url.toString(), {
        method: "POST",
        headers,
        body: JSON.stringify(params),
    });

    const data = await r.json();
    return data;
}

const UpdatePortalSchema = z.object({
    portalId: z.string().describe("ID of the portal to update"),
    name: z.string().max(255).describe("Portal name"),
    subdomain: z.string().min(3).max(53).describe("Portal subdomain (3-53 characters)"),
    access_level: z
        .enum(["regular", "private"])
        .describe("Portal access level: 'regular' for public access, 'private' for restricted access")
        .optional(),
    access_list: z.array(z.string()).describe("Array of membership IDs for users with direct access to private portal. Use get_team_members to retrieve membership IDs").optional(),
    has_access_code: z.boolean().describe("Whether portal requires an access code to upload (if true, you also need to specify access_code parameter)").optional(),
    access_code: z.string().max(72).describe("Access code for portal (required if has_access_code is true)").optional(),
    has_download_password: z.boolean().describe("Whether portal packages require password to download (if true, you also need to specify download_password parameter)").optional(),
    download_password: z.string().max(72).describe("Download password (required if has_download_password is true)").optional(),
    message: z.string().describe("Welcome message displayed on portal").optional(),
    disable_upload_receipt: z.boolean().describe("Disable email receipt to uploader").optional(),
    active: z.boolean().describe("Whether portal is active and accepting uploads").optional(),
    recipients: z.array(z.string().email()).describe("Email addresses that receive notifications for portal uploads").optional(),
    cc_recipients: z.array(z.string().email()).describe("Email addresses that receive carbon copy notifications without download link").optional(),
    primary_color: z.string().max(255).describe("Primary color for portal branding (hex color code)").optional(),
    background_url: z.string().describe("URL of background image for portal").optional(),
    logo_url: z.string().describe("URL of logo image for portal").optional(),
    teamspace_id: z.string().describe("ID of teamspace to associate portal with").optional(),
    custom_expiry_days: z.number().int().min(-1).max(65535).describe("Custom expiry days for packages (-1 for unlimited)").optional(),
    expiry: z.string().describe("Portal expiry date (ISO 8601 format). This parameter is required when expiry_enabled: true").optional(),
    expiry_enabled: z.boolean().describe("Whether portal expiry is enabled. If set to true, need to also provide expiry parameter, e.g. expiry: '2027-01-01'.").optional(),
    file_type_restriction_enabled: z.boolean().describe("Whether file type restrictions are enabled").optional(),
    file_type_restriction_exclude: z.boolean().describe("Whether to exclude (true) or include (false) specified file types").optional(),
    file_types: z.array(z.string()).describe("Allowed/excluded file extensions prefixed with dots (e.g., ['.mp4', '.mov'])").optional(),
    max_file_count: z.number().int().describe("Maximum number of files per upload (0 for unlimited). Only works when package_size_restriction_enabled: true.").optional(),
    max_file_size: z.number().int().describe("Maximum file size in bytes (0 for unlimited). Only works when package_size_restriction_enabled: true.").optional(),
    max_package_size: z.number().int().describe("Maximum package size in bytes (0 for unlimited). Only works when package_size_restriction_enabled: true.").optional(),
    package_size_restriction_enabled: z.boolean().describe("Whether package size restrictions are enabled. Set to true in order to set max_file_count, max_file_size or max_package_size").optional(),
    user_authentication_required: z.boolean().describe("Whether to restrict Portal upload to only team users with proper access. Users must authenticate to upload").optional(),
    download_user_authentication_required: z.boolean().describe("Whether users must authenticate to download").optional(),
    package_name_format_enabled: z.boolean().describe("Whether custom package naming format is enabled").optional(),
    package_name_format: z.object({
        value: z.string().describe("Regex pattern used to enforce package name format (e.g., '*Video*')"),
        label: z.string().describe("Label shown to users explaining the required package name format (e.g., 'Format For Videos')"),
    }).describe("Custom package naming format configuration (required when package_name_format_enabled is true)").optional(),
    terms_of_service_enabled: z.boolean().describe("Whether terms of service acceptance is required").optional(),
    terms_of_service: z.object({
        title: z.string().describe("Title of the terms of service"),
        description: z.string().describe("Description or content of the terms of service"),
        checkbox_label: z.string().describe("Label for the acceptance checkbox"),
        checkbox_url: z.string().describe("URL to full terms of service document"),
    }).describe("Terms of service configuration (required when terms_of_service_enabled is true)").optional(),
});

type UpdatePortalParams = z.infer<typeof UpdatePortalSchema>;

async function updatePortal({ portalId, ...params }: UpdatePortalParams) {
    const url = new URL(`${MASV_BASE_URL}/v1/portals/${portalId}`);

    const headers = {
        "content-type": "application/json",
        "x-api-key": MASV_API_KEY,
    };

    const r = await fetch(url.toString(), {
        method: "PUT",
        headers,
        body: JSON.stringify(params),
    });

    const data = await r.json();
    return data;
}

const DeletePortalSchema = z.object({
    portalId: z.string().describe("Id of the portal to delete"),
});

type DeletePortalParams = z.infer<typeof DeletePortalSchema>;

async function deletePortal({ portalId }: DeletePortalParams) {
    if (!MASV_ALLOW_DELETE) {
        throw new Error("Delete operations are not allowed. Set MASV_ALLOW_DELETE=true in environment variables to enable.");
    }

    const url = new URL(`${MASV_BASE_URL}/v1/portals/${portalId}`);

    const headers = {
        "content-type": "application/json",
        "x-api-key": MASV_API_KEY,
    };

    const r = await fetch(url.toString(), { method: "DELETE", headers });

    if (r.status === 204) {
        return { success: true, message: "Portal deleted successfully" };
    }

    const data = await r.json();
    return data;
}

export {
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
};
