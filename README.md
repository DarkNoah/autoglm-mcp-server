# AutoGLM MCP Server

A Model Context Protocol (MCP) server for the AutoGLM-Phone API, enabling automated GUI interaction on mobile devices.

## Overview

This MCP server provides tools for interacting with the AutoGLM-Phone API, which allows AI models to control mobile devices through a series of actions. The server supports Android (ADB)

## Features

- **Get Actions**: Convert natural language instructions into executable device actions
- **Execute Actions**: Execute single or batch actions on connected devices
- **List Actions**: View all available action types with descriptions
- **Device Info**: Query connected device information
- **Multiple Transports**: Support stdio, HTTP, and SSE transport modes

## Quick Start

### Using npx (Recommended)

```bash
# Run directly without installation
npx -y autoglm-mcp-server

# With options
npx -y autoglm-mcp-server --transport http --port 3000
```

### Global Installation

```bash
npm install -g autoglm-mcp-server
autoglm-mcp-server
```

### Local Installation

```bash
npm install autoglm-mcp-server
```

## MCP Client Configuration

### Claude Desktop / Cursor (stdio mode)

```json
{
  "mcpServers": {
    "autoglm": {
      "command": "npx",
      "args": ["-y", "autoglm-mcp-server"],
      "env": {
        "AUTOGLM_API_KEY": "<YOUR_API_KEY>"
      }
    }
  }
}
```

### StreamableHTTP Mode

First start the server:
```bash
npx -y autoglm-mcp-server --transport http --port 3000
```

Then configure your MCP client:
```json
{
  "mcpServers": {
    "autoglm": {
      "url": "http://127.0.0.1:3000/mcp",
      "headers": {
        "Authorization": "<YOUR_API_KEY>"
      }
    }
  }
}
```

## Configuration

Set the following environment variables:

```bash
export AUTOGLM_API_KEY="your-api-key-here"
export AUTOGLM_API_URL="https://open.bigmodel.cn/api/paas/v4"  # optional
export AUTOGLM_MODEL="autoglm-phone"  # optional
```

Or create a `.env` file based on `.env.example`.

## Usage

### Development

```bash
npm run dev
```

### Build

```bash
npm run build
```

### Production

```bash
# stdio mode (default)
npm start

# HTTP mode
node dist/index.js --transport http --port 3000

# SSE mode
node dist/index.js --transport sse --port 3000

# HTTP mode on all interfaces
node dist/index.js --transport http --host 0.0.0.0 --port 3000
```

### Command Line Options

| Option | Alias | Description | Default |
|--------|-------|-------------|---------|
| `--transport` | `-t` | Transport type: `stdio`, `http`, or `sse` | `stdio` |
| `--port` | `-p` | Port for HTTP/SSE transport | `3000` |
| `--host` | `-h` | Host for HTTP/SSE transport | `127.0.0.1` |
| `--help` | | Show help message | |

## Available Tools

### autoglm_get_actions

Get a sequence of actions from AutoGLM based on a natural language instruction and optional screen image.

**Parameters:**
- `instruction` (string): Natural language instruction
- `screen_image` (string, optional): Base64 encoded or URL of screen image
- `response_format` ('markdown' | 'json'): Output format

**Example:**
```json
{
  "instruction": "Open WeChat and send a message to Mom",
  "response_format": "json"
}
```

### autoglm_execute_action

Execute a single AutoGLM action on a connected device.

**Parameters:**
- `action_type` (string): The type of action to execute
- `parameters` (object, optional): Action-specific parameters
- `device_id` (string, optional): Target device ID

**Example:**
```json
{
  "action_type": "Tap",
  "parameters": {"x": 500, "y": 800}
}
```

### autoglm_batch_execute_actions

Execute multiple AutoGLM actions in sequence.

**Parameters:**
- `actions` (array): Array of actions to execute
- `device_id` (string, optional): Target device ID
- `stop_on_error` (boolean): Whether to stop if an action fails

### autoglm_list_actions

List all available AutoGLM action types with descriptions.

**Parameters:**
- `response_format` ('markdown' | 'json'): Output format

### autoglm_get_device_info

Get information about connected mobile devices.

**Parameters:**
- `device_id` (string, optional): Device ID to query
- `response_format` ('markdown' | 'json'): Output format

## Supported Actions

| Action | Description | Parameters |
|--------|-------------|------------|
| Launch | Launch an application | `app_name` |
| Tap | Tap at coordinates | `x`, `y` (0-1000 scale) |
| Type | Type text | `text` |
| Type_Name | Type text by name | `text` |
| Swipe | Swipe between coordinates | `x1`, `y1`, `x2`, `y2`, `duration` |
| Back | Go back | - |
| Home | Go to home screen | - |
| Double Tap | Double tap at coordinates | `x`, `y` |
| Long Press | Long press at coordinates | `x`, `y`, `duration` |
| Wait | Wait for duration | `duration` (ms) |
| Take_over | Request human takeover | `reason` |
| Note | Add a note | `text` |
| Call_API | Call an API endpoint | `endpoint`, `params` |
| Interact | Interact with UI element | `element`, `action` |

## Coordinate System

All coordinates use a 0-1000 scale relative to screen size:
- (0, 0) is top-left corner
- (1000, 1000) is bottom-right corner

## Project Structure

```
autoglm-mcp-server/
├── src/
│   ├── index.ts                    # Main server entry point
│   ├── constants.ts                # Configuration constants
│   ├── types.ts                    # TypeScript type definitions
│   ├── tools/
│   │   └── autoglm-tools.ts        # MCP tool implementations
│   ├── services/
│   │   ├── autoglm-api-client.ts   # AutoGLM API client
│   │   ├── autoglm-client.ts       # AutoGLM client wrapper
│   │   └── adb-service.ts          # ADB device service
│   └── schemas/
│       └── index.ts                # Zod validation schemas
├── dist/                           # Compiled output
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

## HTTP/SSE Authentication

When using HTTP or SSE transport, you can pass the API key via the `Authorization` header:

```bash
# Bearer token format
curl -X POST http://localhost:3000/mcp \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"initialize",...}'
```

## References

- [AutoGLM-Phone Documentation](https://docs.bigmodel.cn/cn/guide/models/vlm/autoglm-phone)
- [Open-AutoGLM Repository](https://github.com/zai-org/Open-AutoGLM)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)

## License

MIT
