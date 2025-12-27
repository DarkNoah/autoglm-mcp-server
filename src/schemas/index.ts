/**
 * Zod schemas for AutoGLM MCP Server
 */

import { z } from 'zod';

// Response format enum
export enum ResponseFormat {
  MARKDOWN = 'markdown',
  JSON = 'json'
}

// Get Actions Schema
export const GetActionsInputSchema = z.object({
  instruction: z.string()
    .min(1, 'Instruction is required')
    .max(2000, 'Instruction must not exceed 2000 characters')
    .describe('Natural language instruction describing what to do on the device'),
  screen_image: z.string().url().optional()
    .describe('Base64 encoded or URL of the current screen image'),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' for human-readable or 'json' for machine-readable")
}).strict();

export type GetActionsInput = z.infer<typeof GetActionsInputSchema>;

// Execute Action Schema
export const ExecuteActionInputSchema = z.object({
  action_type: z.enum([
    'Launch',
    'Tap',
    'Type',
    'Type_Name',
    'Swipe',
    'Back',
    'Home',
    'Double Tap',
    'Long Press',
    'Wait',
    'Take_over',
    'Note',
    'Call_API',
    'Interact'
  ]).describe('The type of action to execute'),
  parameters: z.record(z.unknown()).optional()
    .describe('Action-specific parameters (e.g., coordinates, text, duration)'),
  device_id: z.string().optional()
    .describe('Target device ID (if multiple devices are connected)')
}).strict();

export type ExecuteActionInput = z.infer<typeof ExecuteActionInputSchema>;

// Batch Execute Actions Schema
export const BatchExecuteActionsInputSchema = z.object({
  actions: z.array(z.object({
    action_type: z.enum([
      'Launch',
      'Tap',
      'Type',
      'Type_Name',
      'Swipe',
      'Back',
      'Home',
      'Double Tap',
      'Long Press',
      'Wait',
      'Take_over',
      'Note',
      'Call_API',
      'Interact'
    ]),
    parameters: z.record(z.unknown()).optional()
  })).min(1, 'At least one action is required')
    .max(50, 'Cannot execute more than 50 actions at once')
    .describe('Array of actions to execute in sequence'),
  device_id: z.string().optional()
    .describe('Target device ID (if multiple devices are connected)'),
  stop_on_error: z.boolean().default(false)
    .describe('Whether to stop execution if an action fails')
}).strict();

export type BatchExecuteActionsInput = z.infer<typeof BatchExecuteActionsInputSchema>;

// List Available Actions Schema
export const ListActionsInputSchema = z.object({
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' for human-readable or 'json' for machine-readable")
}).strict();

export type ListActionsInput = z.infer<typeof ListActionsInputSchema>;

// Get Device Info Schema
export const GetDeviceInfoInputSchema = z.object({
  device_id: z.string().optional()
    .describe('Device ID to query (if not specified, returns all connected devices)'),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' for human-readable or 'json' for machine-readable")
}).strict();

export type GetDeviceInfoInput = z.infer<typeof GetDeviceInfoInputSchema>;

// List ADB Devices Schema
export const ListADBDevicesInputSchema = z.object({}).strict();

export type ListADBDevicesInput = z.infer<typeof ListADBDevicesInputSchema>;

// ADB Connect Schema
export const ADBConnectInputSchema = z.object({
  address: z.string()
    .min(1, 'Address is required')
    .regex(/^[\d.]+:\d+$/, 'Address must be in format IP:PORT (e.g., 192.168.10.20:5555)')
    .describe('Device address in format IP:PORT (e.g., 192.168.10.20:5555)')
}).strict();

export type ADBConnectInput = z.infer<typeof ADBConnectInputSchema>;

// Task Schema
export const TaskInputSchema = z.object({
  device_id: z.string().optional()
    .describe('Target ADB device ID (if not specified, uses the first connected device)'),
  prompt: z.string()
    .min(1, 'Prompt is required')
    .max(5000, 'Prompt must not exceed 5000 characters')
    .describe('Natural language task description for AutoGLM to execute'),
  max_steps: z.number().int().min(1).max(200).optional()
    .default(100)
    .describe('Maximum number of steps to execute (default: 100)'),
  lang: z.enum(['cn', 'en']).optional()
    .default('cn')
    .describe('Language for system prompt and responses (default: cn)'),
}).strict();

export type TaskInput = z.infer<typeof TaskInputSchema>;
