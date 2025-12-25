/**
 * AutoGLM MCP Tools
 *
 * Tools for interacting with AutoGLM-Phone API to control mobile devices.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getAutoGLMClient } from '../services/autoglm-client.js';
import { ADBService } from '../services/adb-service.js';
import { AutoGLMAPIClient } from '../services/autoglm-api-client.js';
import { CHARACTER_LIMIT, ACTION_TYPES } from '../constants.js';
import {
  GetActionsInputSchema,
  ExecuteActionInputSchema,
  BatchExecuteActionsInputSchema,
  ListActionsInputSchema,
  GetDeviceInfoInputSchema,
  ListADBDevicesInputSchema,
  TaskInputSchema,
  ResponseFormat
} from '../schemas/index.js';

// Create ADB service instance
const adbService = new ADBService();

/**
 * Register all AutoGLM tools with the MCP server
 */
export function registerAutoGLMTools(server: McpServer): void {


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
 * Format actions as markdown
 */
function formatActionsAsMarkdown(data: any): string {
  const lines = ['# AutoGLM Actions', ''];

  if (data.reasoning) {
    lines.push(`**Reasoning:** ${data.reasoning}`, '');
  }

  if (data.truncated) {
    lines.push('> ⚠️ Response truncated. Showing partial results.', '');
  }

  lines.push(`**Total Actions:** ${data.actions.length}`, '');

  data.actions.forEach((action: any, index: number) => {
    lines.push(`## ${index + 1}. ${action.action_type}`);
    if (action.parameters) {
      lines.push('**Parameters:**');
      for (const [key, value] of Object.entries(action.parameters)) {
        lines.push(`  - ${key}: ${JSON.stringify(value)}`);
      }
    }
    lines.push('');
  });

  return lines.join('\n');
}

/**
 * Format actions list as markdown
 */
function formatActionsListAsMarkdown(actions: any[]): string {
  const lines = ['# Available AutoGLM Actions', ''];

  actions.forEach(action => {
    lines.push(`## ${action.name}`);
    lines.push(`**Description:** ${action.description}`);
    if (action.parameters) {
      lines.push('**Parameters:**');
      for (const [key, value] of Object.entries(action.parameters)) {
        lines.push(`  - \`${key}\`: ${value}`);
      }
    }
    lines.push('');
  });

  return lines.join('\n');
}

/**
 * Format device info as markdown
 */
function formatDeviceInfoAsMarkdown(devices: any[]): string {
  const lines = ['# Connected Devices', ''];

  if (devices.length === 0) {
    lines.push('No devices connected.');
    return lines.join('\n');
  }

  devices.forEach(device => {
    lines.push(`## ${device.device_id}`);
    lines.push(`- **Platform:** ${device.platform}`);
    lines.push(`- **Screen:** ${device.screen_width}x${device.screen_height}`);
    lines.push(`- **Status:** ${device.connected ? 'Connected' : 'Disconnected'}`);
    lines.push('');
  });

  return lines.join('\n');
}

/**
 * Format ADB devices as markdown
 */
function formatADBDevicesAsMarkdown(devices: any[]): string {
  const lines = ['# ADB Connected Devices', ''];

  if (devices.length === 0) {
    lines.push('No ADB devices connected.');
    lines.push('');
    lines.push('**Troubleshooting:**');
    lines.push('- Make sure ADB is installed and accessible');
    lines.push('- Make sure USB debugging is enabled on your Android device');
    lines.push('- Make sure your device is connected via USB or WiFi');
    lines.push('- Try running `adb devices` in your terminal to verify');
    return lines.join('\n');
  }

  lines.push(`**Total Devices:** ${devices.length}`, '');

  devices.forEach((device, index) => {
    lines.push(`## ${index + 1}. ${device.device_id}`);
    lines.push(`- **Status:** ${device.status}`);
    lines.push(`- **Connection:** ${device.connection_type}`);
    if (device.model) {
      lines.push(`- **Model:** ${device.model}`);
    }
    if (device.android_version) {
      lines.push(`- **Android Version:** ${device.android_version}`);
    }
    if (device.screen_width && device.screen_height) {
      lines.push(`- **Screen:** ${device.screen_width}x${device.screen_height}`);
    }
    lines.push(`- **Connected:** ${device.connected ? '✅ Yes' : '❌ No'}`);
    lines.push('');
  });

  return lines.join('\n');
}

/**
 * Get action descriptions
 */
function getActionDescriptions(): any[] {
  return [
    {
      name: 'Launch',
      description: 'Launch an application by name',
      parameters: { app_name: 'string' }
    },
    {
      name: 'Tap',
      description: 'Tap at the specified coordinates (0-1000 scale)',
      parameters: { x: 'number (0-1000)', y: 'number (0-1000)' }
    },
    {
      name: 'Type',
      description: 'Type the specified text',
      parameters: { text: 'string' }
    },
    {
      name: 'Type_Name',
      description: 'Type text by name (for input fields)',
      parameters: { text: 'string' }
    },
    {
      name: 'Swipe',
      description: 'Swipe from (x1,y1) to (x2,y2) with duration in ms',
      parameters: { x1: 'number', y1: 'number', x2: 'number', y2: 'number', duration: 'number (ms)' }
    },
    {
      name: 'Back',
      description: 'Go back to previous screen',
      parameters: {}
    },
    {
      name: 'Home',
      description: 'Go to home screen',
      parameters: {}
    },
    {
      name: 'Double Tap',
      description: 'Double tap at the specified coordinates',
      parameters: { x: 'number (0-1000)', y: 'number (0-1000)' }
    },
    {
      name: 'Long Press',
      description: 'Long press at coordinates for duration in ms',
      parameters: { x: 'number (0-1000)', y: 'number (0-1000)', duration: 'number (ms)' }
    },
    {
      name: 'Wait',
      description: 'Wait for the specified duration in ms',
      parameters: { duration: 'number (ms)' }
    },
    {
      name: 'Take_over',
      description: 'Request human takeover with a reason',
      parameters: { reason: 'string' }
    },
    {
      name: 'Note',
      description: 'Add a note for context',
      parameters: { text: 'string' }
    },
    {
      name: 'Call_API',
      description: 'Call an API endpoint',
      parameters: { endpoint: 'string', params: 'object' }
    },
    {
      name: 'Interact',
      description: 'Interact with a UI element',
      parameters: { element: 'string', action: 'string' }
    }
  ];
}

/**
 * Execute action using ADB service
 * Converts relative coordinates (0-1000) to absolute pixels and executes via ADB
 */
async function executeActionWithADB(params: any): Promise<{ message: string }> {
  const { action_type, parameters, device_id } = params;

  switch (action_type) {
    case 'Launch':
      await adbService.launchApp(parameters?.app_name || '', device_id);
      return { message: `Launched app: ${parameters?.app_name || 'unknown'}` };

    case 'Tap':
      await adbService.tap(parameters?.x || 0, parameters?.y || 0, device_id);
      return { message: `Tapped at (${parameters?.x}, ${parameters?.y})` };

    case 'Type':
      await adbService.typeText(parameters?.text || '', device_id);
      return { message: `Typed: ${parameters?.text || ''}` };

    case 'Type_Name':
      await adbService.typeText(parameters?.text || '', device_id);
      return { message: `Typed by name: ${parameters?.text || ''}` };

    case 'Swipe':
      await adbService.swipe(
        parameters?.x1 || 0,
        parameters?.y1 || 0,
        parameters?.x2 || 0,
        parameters?.y2 || 0,
        parameters?.duration || 500,
        device_id
      );
      return { message: `Swiped from (${parameters?.x1}, ${parameters?.y1}) to (${parameters?.x2}, ${parameters?.y2})` };

    case 'Back':
      await adbService.back(device_id);
      return { message: 'Pressed back button' };

    case 'Home':
      await adbService.home(device_id);
      return { message: 'Pressed home button' };

    case 'Double Tap':
      await adbService.doubleTap(parameters?.x || 0, parameters?.y || 0, device_id);
      return { message: `Double tapped at (${parameters?.x}, ${parameters?.y})` };

    case 'Long Press':
      await adbService.longPress(
        parameters?.x || 0,
        parameters?.y || 0,
        parameters?.duration || 1000,
        device_id
      );
      return { message: `Long pressed at (${parameters?.x}, ${parameters?.y}) for ${parameters?.duration}ms` };

    case 'Wait':
      await adbService.wait(parameters?.duration || 1000);
      return { message: `Waited for ${parameters?.duration}ms` };

    case 'Take_over':
      // Take_over is a special action that doesn't execute on device
      return { message: `Requested takeover: ${parameters?.reason || ''}` };

    case 'Note':
      // Note is a special action that doesn't execute on device
      return { message: `Added note: ${parameters?.text || ''}` };

    case 'Call_API':
      // Call_API is a special action that doesn't execute on device
      return { message: `Called API: ${parameters?.endpoint || 'unknown'}` };

    case 'Interact':
      // Interact is a special action that doesn't execute on device
      return { message: `Interacted with ${parameters?.element || 'unknown'}: ${parameters?.action || ''}` };

    default:
      throw new Error(`Unknown action type: ${action_type}`);
  }
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
