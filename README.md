# AutoGLM MCP Server

A Model Context Protocol (MCP) server for the AutoGLM-Phone API, enabling automated GUI interaction on mobile devices.

## Overview

This MCP server provides tools for interacting with the AutoGLM-Phone API, which allows AI models to control mobile devices through a series of actions. The server supports Android (ADB).

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

### autoglm_list_adb_devices

List all Android devices connected via ADB (Android Debug Bridge).

**Parameters:**
- `response_format` ('markdown' | 'json', optional): Output format

**Returns:**
- Device ID, status, connection type, model, Android version, screen dimensions

**Example:**
```json
{}
```

### autoglm_task

Execute a task on a connected device using AutoGLM online model. The model will iteratively capture screenshots, analyze the screen, and execute actions until the task is complete.

**Parameters:**
- `prompt` (string, required): Natural language task description (1-5000 characters)
- `device_id` (string, optional): Target ADB device ID
- `max_steps` (number, optional): Maximum steps to execute (default: 100, range: 1-200)
- `lang` ('cn' | 'en', optional): Language for responses (default: 'cn')

**How it works:**
1. Captures the current screen via ADB
2. Sends the screen image and task prompt to AutoGLM online model
3. The model analyzes the screen and decides on the next action
4. Executes the action via ADB
5. Repeats until the task is complete or max_steps is reached

**Example:**
```json
{
  "prompt": "Open WeChat and send a message to Mom saying hello",
  "max_steps": 50,
  "lang": "cn"
}
```

## Supported Actions

The AutoGLM model can execute the following actions:

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
