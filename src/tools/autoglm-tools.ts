/**
 * AutoGLM MCP Tools
 *
 * Tools for interacting with AutoGLM-Phone API to control mobile devices.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ADBService } from '../services/adb-service.js';
import { AutoGLMAPIClient } from '../services/autoglm-api-client.js';
import {
  GetActionsInputSchema,
  ExecuteActionInputSchema,
  BatchExecuteActionsInputSchema,
  ListActionsInputSchema,
  GetDeviceInfoInputSchema,
  ListADBDevicesInputSchema,
  ADBConnectInputSchema,
  TaskInputSchema,
  ResponseFormat
} from '../schemas/index.js';

// Create ADB service instance
const adbService = new ADBService();

/**
 * Register all AutoGLM tools with the MCP server
 */
export function registerAutoGLMTools(server: McpServer): void {


  // Tool: ADB Connect
  server.registerTool(
    'adb_connect',
    {
      title: 'ADB Connect to Device',
      description: `Connect to an Android device via ADB over network.

This tool connects to an Android device using its IP address and port number.
The device must have ADB over TCP/IP enabled.

Args:
  - address (string): Device address in format IP:PORT (e.g., 192.168.10.20:5555)

Examples:
  - address: "192.168.10.20:5555"
  - address: "10.0.0.100:5555"

Prerequisites:
  - The target device must have ADB debugging enabled
  - The device must have TCP/IP mode enabled (adb tcpip 5555)
  - The device must be reachable on the network`,
      inputSchema: ADBConnectInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params) => {
      const result = await adbService.connect(params.address);
      return {
        content: [{
          type: 'text',
          text: result.success
            ? `✅ Successfully connected to ${params.address}\n${result.message}`
            : `❌ Failed to connect to ${params.address}\n${result.message}`
        }],
        structuredContent: result
      };
    }
  );

  // Tool: List ADB Devices
  server.registerTool(
    'autoglm_list_adb_devices',
    {
      title: 'List ADB Connected Devices',
      description: `List all Android devices connected via ADB (Android Debug Bridge).

This tool queries ADB to get a list of all connected Android devices, including their device IDs, status, connection type, model, and screen dimensions.

Device Status:
  - device: Device is connected and ready
  - offline: Device is connected but not responding
  - unauthorized: Device is connected but requires authorization

Connection Types:
  - usb: Connected via USB cable
  - wifi: Connected via WiFi
  - remote: Connected via remote ADB

Examples:
  - Use when: You need to check which Android devices are connected
  - Use when: You need to get device IDs for executing actions on specific devices
  - Use when: You need to verify ADB connection before executing actions

Error Handling:
  - Returns empty devices array if ADB is not installed or not accessible
  - Returns empty devices array if no devices are connected`,
      inputSchema: ListADBDevicesInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params) => {
      // Get all ADB devices
      const devices = await adbService.listDevices();
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ devices, total: devices.length }, null, 2)
        }],
        structuredContent: { devices, total: devices.length }
      };
    }
  );

  // Tool: Execute Task
  server.registerTool(
    'autoglm_task',
    {
      title: 'Execute AutoGLM Task',
      description: `Execute a task on a connected device using AutoGLM online model.

This tool sends a natural language task description to the AutoGLM online model, which analyzes the current screen state and automatically performs the required actions to complete the task. The model will iteratively capture screenshots, analyze the screen, and execute actions until the task is complete or the maximum steps are reached.

Args:
  - device_id (string, optional): Target ADB device ID (if not specified, uses the first connected device)
  - prompt (string): Natural language task description for AutoGLM to execute (1-5000 characters)
  - max_steps (number, optional): Maximum number of steps to execute (default: 100, range: 1-200)
  - lang ('cn' | 'en', optional): Language for system prompt and responses (default: 'cn')

How it works:
  1. Captures the current screen via ADB
  2. Sends the screen image and task prompt to AutoGLM online model
  3. The model analyzes the screen and decides on the next action
  4. Executes the action via ADB
  5. Repeats until the task is complete or max_steps is reached

Examples:
  - Use when: "Open WeChat and send a message to Mom saying hello"
  - Use when: "Order a coffee from Starbucks app"
  - Use when: "Navigate to the settings and enable dark mode"
  - Don't use when: You only need to execute a single known action (use autoglm_execute_action instead)

Error Handling:
  - Returns "Error: No ADB devices connected" if no device is available
  - Returns "Error: API authentication failed" if API key is invalid
  - Returns "Error: Task execution failed" if the task cannot be completed
  - Returns partial results if the task is interrupted`,
      inputSchema: TaskInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    async (params) => {
      try {
        // Create AutoGLM API client
        const apiClient = new AutoGLMAPIClient({
          apiKey: process.env.AUTOGLM_API_KEY || '',
          baseUrl: process.env.AUTOGLM_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4',
          model: process.env.AUTOGLM_MODEL || 'autoglm-phone',
          maxSteps: params.max_steps || 100,
          lang: params.lang || 'cn'
        });

        // Execute the task
        const result = await apiClient.executeTask(
          params.prompt,
          params.device_id
        );

        const output = {
          success: result.success,
          completed: result.completed,
          total_steps: result.totalSteps,
          steps: result.steps,
          final_state: result.finalState,
          device_id: result.deviceId,
          error: result.error
        };

        let textContent: string;
        textContent = formatTaskResultAsMarkdown(output);
        return {
          content: [{ type: 'text', text: textContent }],
          structuredContent: output
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    }
  );
}

/**
 * Format task result as markdown
 */
function formatTaskResultAsMarkdown(data: any): string {
  const lines = ['# AutoGLM Task Execution Result', ''];

  // Status
  const statusIcon = data.success ? '✅' : '❌';
  const completedIcon = data.completed ? '✅' : '⏸️';
  lines.push(`**Status:** ${statusIcon} ${data.success ? 'Success' : 'Failed'}`);
  lines.push(`**Completed:** ${completedIcon} ${data.completed ? 'Yes' : 'No'}`);
  lines.push(`**Total Steps:** ${data.total_steps}`);
  lines.push(`**Device ID:** ${data.device_id || 'default'}`);
  lines.push('');

  // Final state
  if (data.final_state) {
    lines.push(`**Final State:** ${data.final_state}`);
    lines.push('');
  }

  // Error
  if (data.error) {
    lines.push(`**Error:** ${data.error}`);
    lines.push('');
  }

  // Steps
  if (data.steps && data.steps.length > 0) {
    lines.push('## Execution Steps');
    lines.push('');

    data.steps.forEach((step: any, index: number) => {
      lines.push(`### Step ${step.step || index + 1}`);

      if (step.thinking) {
        lines.push(`**Thinking:** ${step.thinking}`);
      }

      if (step.action) {
        lines.push(`**Action:** ${step.action.action_type}`);
        if (step.action.parameters) {
          lines.push('**Parameters:**');
          for (const [key, value] of Object.entries(step.action.parameters)) {
            lines.push(`  - ${key}: ${JSON.stringify(value)}`);
          }
        }
      }

      if (step.result) {
        lines.push(`**Result:** ${step.result}`);
      }

      if (step.error) {
        lines.push(`**Error:** ${step.error}`);
      }

      lines.push('');
    });
  }

  return lines.join('\n');
}
