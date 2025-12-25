# AutoGLM MCP Server

A Model Context Protocol (MCP) server for the AutoGLM-Phone API, enabling automated GUI interaction on mobile devices.

## Overview

This MCP server provides tools for interacting with the AutoGLM-Phone API, which allows AI models to control mobile devices through a series of actions. The server supports Android (ADB), HarmonyOS (HDC), and iOS devices.

## Features

- **Get Actions**: Convert natural language instructions into executable device actions
- **Execute Actions**: Execute single or batch actions on connected devices
- **List Actions**: View all available action types with descriptions
- **Device Info**: Query connected device information

## Installation

```bash
npm install
```

## Configuration

Set the following environment variables:

```bash
export AUTOGLM_API_KEY="your-api-key-here"
export AUTOGLM_API_URL="https://open.bigmodel.cn/api/paas/v4"  # optional
export AUTOGLM_MODEL="autoglm-phone"  # optional
```

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
npm start
```

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
│   ├── index.ts              # Main server entry point
│   ├── constants.ts          # Configuration constants
│   ├── types.ts              # TypeScript type definitions
│   ├── tools/
│   │   └── autoglm-tools.ts  # MCP tool implementations
│   ├── services/
│   │   └── autoglm-client.ts # AutoGLM API client
│   └── schemas/
│       └── index.ts          # Zod validation schemas
├── package.json
├── tsconfig.json
└── README.md
```

## References

- [AutoGLM-Phone Documentation](https://docs.bigmodel.cn/cn/guide/models/vlm/autoglm-phone)
- [Open-AutoGLM Repository](https://github.com/zai-org/Open-AutoGLM)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)

## License

MIT
