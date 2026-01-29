# MASV MCP Server

> **⚠️ Experimental Server**: This is an experimental MCP server created to gauge interest and integration potential. It has not been subject to our rigorous internal verification processes. Further support and updates will be provided on a best effort basis. We want to hear from you ! If you have any questions or issues, please contact us at [support@masv.io](mailto:support@masv.io).

An MCP (Model Context Protocol) server that provides LLMs with tools to interact with the MASV API.

## What is MASV?

MASV (massive.io) is a file transfer platform designed for large media files. It enables secure and fast transfer of large files with features including:

- Package uploads and downloads
- File collection through customizable Portals
- Cloud and on-premise storage integrations (AWS S3, Azure, Frame.io, Dropbox, MASV Storage Gateway, and more)
- Activity tracking and event monitoring
- Team collaboration and access controls

Learn more https://massive.io/

## Installation

The server can be run directly with `npx` without installation, or installed globally if preferred:

```bash
# Run directly with npx (recommended)
npx masv-mcp-server

# Or install globally
npm install -g masv-mcp-server
```

## Configuration

### Required Environment Variables

The server requires the following environment variables to authenticate with the MASV API:

- `MASV_TEAM_ID` - Your MASV team identifier
- `MASV_API_KEY` - Your MASV API authentication key

### Optional Environment Variables

- `MASV_ALLOW_DELETE` - Set to `true` to allow LLM use package and portal deletion tools (default: `false`)

### MCP Client Configuration

Add the server to your MCP client configuration file:

```json
{
  "mcpServers": {
    "masv": {
      "command": "npx",
      "args": ["-y", "masv-mcp-server"],
      "env": {
        "MASV_TEAM_ID": "your-team-id",
        "MASV_API_KEY": "your-api-key"
      }
    }
  }
}
```

**Note**: The `-y` flag automatically confirms the package execution without prompting.

## Available Tools

The server provides the following tools for LLM interaction:

### Package Management
- `get_packages` - List team packages
- `get_package` - Get package details by ID
- `get_portal_packages` - List packages uploaded to portals
- `get_package_files` - List files in a package
- `get_package_transfers` - Get package transfer history
- `update_package_expiration_date_and_time` - Modify package expiration
- `delete_package` - Delete a package (requires `MASV_ALLOW_DELETE=true`)

### Portal Management
- `get_portals` - List all portals
- `get_portal` - Get portal details by ID
- `create_portal` - Create a new portal
- `update_portal` - Update portal configuration
- `delete_portal` - Delete a portal (requires `MASV_ALLOW_DELETE=true`)

### Activity Tracking
- `get_activities` - List activities and events
- `get_activity_events` - Get event history for an activity
- `get_activities_information` - Get detailed activity state descriptions

### Integration Management
- `get_integrations` - List connected storage integrations
- `send_package_to_integration` - Transfer package to connected storage
- `list_files_on_integration` - Browse files on cloud integrations
- `list_files_on_storage_gateway` - Browse files on Storage Gateway
- `transfer_files_from_integration` - Transfer files from storage to MASV (works with both cloud and MASV Storage Gateway)

### Team Management
- `get_team_members` - List team members and their details


## License

MIT

## Support

For questions, issues, or feedback please contact us at [support@masv.io](mailto:support@masv.io).
