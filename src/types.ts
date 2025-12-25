/**
 * TypeScript type definitions for AutoGLM MCP Server
 */

import { z } from 'zod';

// AutoGLM API Request Types
export interface AutoGLMMessage {
  role: 'user' | 'assistant' | 'system';
  content: AutoGLMContent[];
}

export type AutoGLMContent =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export interface AutoGLMRequest {
  model: string;
  messages: AutoGLMMessage[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
}

export interface AutoGLMResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: AutoGLMChoice[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface AutoGLMChoice {
  index: number;
  message: {
    role: string;
    content: string;
  };
  finish_reason: string;
}

// Action Types
export interface Action {
  action_type: string;
  parameters?: Record<string, unknown>;
  reasoning?: string;
}

export interface AutoGLMActionResponse {
  actions: Action[];
  reasoning?: string;
}

// Device Control Types
export interface DeviceInfo {
  device_id: string;
  platform: 'android' | 'ios' | 'harmonyos';
  screen_width: number;
  screen_height: number;
  connected: boolean;
}

// Zod Schemas
export const AutoGLMRequestSchema = z.object({
  model: z.string().default('autoglm-phone'),
  messages: z.array(
    z.object({
      role: z.enum(['user', 'assistant', 'system']),
      content: z.array(
        z.union([
          z.object({ type: z.literal('text'), text: z.string() }),
          z.object({
            type: z.literal('image_url'),
            image_url: z.object({ url: z.string().url() })
          })
        ])
      )
    })
  ),
  stream: z.boolean().optional().default(false),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().positive().optional()
});

export const ActionSchema = z.object({
  action_type: z.string(),
  parameters: z.record(z.unknown()).optional(),
  reasoning: z.string().optional()
});

export const DeviceInfoSchema = z.object({
  device_id: z.string(),
  platform: z.enum(['android', 'ios', 'harmonyos']),
  screen_width: z.number().int().positive(),
  screen_height: z.number().int().positive(),
  connected: z.boolean()
});
