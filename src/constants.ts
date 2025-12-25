/**
 * Constants for AutoGLM MCP Server
 */

// API Configuration
export const API_BASE_URL = process.env.AUTOGLM_API_URL || 'https://open.bigmodel.cn/api/paas/v4';
export const API_KEY = process.env.AUTOGLM_API_KEY || '';
export const MODEL_NAME = process.env.AUTOGLM_MODEL || 'autoglm-phone';

// Response limits
export const CHARACTER_LIMIT = 25000;
export const MAX_IMAGE_SIZE = 20 * 1024 * 1024; // 20MB

// Action types supported by AutoGLM
export const ACTION_TYPES = [
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
] as const;

export type ActionType = typeof ACTION_TYPES[number];

// Coordinate system
export const COORDINATE_SCALE = 1000; // AutoGLM uses 0-1000 scale
