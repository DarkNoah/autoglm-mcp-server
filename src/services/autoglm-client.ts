/**
 * AutoGLM API Client Service
 *
 * Handles communication with the AutoGLM-Phone API for automated
 * GUI interaction on mobile devices.
 */

import axios, { AxiosError } from 'axios';
import type {
  AutoGLMRequest,
  AutoGLMResponse,
  AutoGLMActionResponse
} from '../types.js';
import { API_BASE_URL, API_KEY, MODEL_NAME } from '../constants.js';

/**
 * AutoGLM API Client
 */
export class AutoGLMClient {
  private apiKey: string;
  private baseUrl: string;
  private modelName: string;

  constructor(apiKey?: string, baseUrl?: string, modelName?: string) {
    this.apiKey = apiKey || API_KEY;
    this.baseUrl = baseUrl || API_BASE_URL;
    this.modelName = modelName || MODEL_NAME;

    if (!this.apiKey) {
      throw new Error('AutoGLM API key is required. Set AUTOGLM_API_KEY environment variable.');
    }
  }

  /**
   * Send a request to AutoGLM API
   */
  async sendRequest(request: AutoGLMRequest): Promise<AutoGLMResponse> {
    try {
      const response = await axios.post<AutoGLMResponse>(
        `${this.baseUrl}/chat/completions`,
        {
          ...request,
          model: request.model || this.modelName
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`
          },
          timeout: 60000 // 60 second timeout
        }
      );

      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Send a request with screen image to get actions
   */
  async getActions(
    userInstruction: string,
    screenImage?: string,
    conversationHistory?: Array<{ role: string; content: string }>
  ): Promise<AutoGLMActionResponse> {
    const messages: any[] = [];

    // Add system prompt
    messages.push({
      role: 'system',
      content: this.getSystemPrompt()
    });

    // Add conversation history if provided
    if (conversationHistory && conversationHistory.length > 0) {
      messages.push(...conversationHistory);
    }

    // Build user message
    const userContent: any[] = [{ type: 'text', text: userInstruction }];
    if (screenImage) {
      userContent.push({ type: 'image_url', image_url: { url: screenImage } });
    }
    messages.push({ role: 'user', content: userContent });

    const request: AutoGLMRequest = {
      model: this.modelName,
      messages,
      temperature: 0.7,
      max_tokens: 2000
    };

    const response = await this.sendRequest(request);

    // Parse actions from response
    return this.parseActions(response);
  }

  /**
   * Get the system prompt for AutoGLM
   */
  private getSystemPrompt(): string {
    return `You are an intelligent phone assistant that can control mobile devices through a series of actions.

Available Actions:
1. Launch(app_name): Launch an application by name
2. Tap(x, y): Tap at the specified coordinates (0-1000 scale)
3. Type(text): Type the specified text
4. Type_Name(text): Type text by name (for input fields)
5. Swipe(x1, y1, x2, y2, duration): Swipe from (x1,y1) to (x2,y2) with duration in ms
6. Back(): Go back to previous screen
7. Home(): Go to home screen
8. Double_Tap(x, y): Double tap at the specified coordinates
9. Long_Press(x, y, duration): Long press at coordinates for duration in ms
10. Wait(duration): Wait for the specified duration in ms
11. Take_over(reason): Request human takeover with a reason
12. Note(text): Add a note for context
13. Call_API(endpoint, params): Call an API endpoint
14. Interact(element, action): Interact with a UI element

Coordinate System:
- All coordinates use a 0-1000 scale relative to screen size
- (0,0) is top-left, (1000,1000) is bottom-right

Response Format:
Provide your response as a JSON object with an "actions" array containing the actions to perform:
{
  "actions": [
    {"action_type": "Launch", "parameters": {"app_name": "WeChat"}},
    {"action_type": "Tap", "parameters": {"x": 500, "y": 800}}
  ],
  "reasoning": "Brief explanation of the plan"
}`;
  }

  /**
   * Parse actions from AutoGLM response
   */
  private parseActions(response: AutoGLMResponse): AutoGLMActionResponse {
    const content = response.choices[0]?.message?.content || '';

    try {
      // Try to parse as JSON
      const parsed = JSON.parse(content);
      return {
        actions: parsed.actions || [],
        reasoning: parsed.reasoning
      };
    } catch {
      // If not JSON, try to extract actions from text
      return {
        actions: [],
        reasoning: content
      };
    }
  }

  /**
   * Handle API errors
   */
  private handleError(error: unknown): Error {
    if (error instanceof AxiosError) {
      if (error.response) {
        const status = error.response.status;
        const data = error.response.data as any;

        switch (status) {
          case 400:
            return new Error(`Bad Request: ${data.error?.message || 'Invalid request parameters'}`);
          case 401:
            return new Error('Authentication failed: Invalid API key');
          case 403:
            return new Error('Forbidden: You do not have permission to access this resource');
          case 429:
            return new Error('Rate limit exceeded: Please wait before making more requests');
          case 500:
            return new Error('Internal server error: The AutoGLM service encountered an error');
          default:
            return new Error(`API request failed with status ${status}: ${data.error?.message || 'Unknown error'}`);
        }
      } else if (error.code === 'ECONNABORTED') {
        return new Error('Request timeout: The request took too long to complete');
      } else if (error.code === 'ECONNREFUSED') {
        return new Error('Connection refused: Unable to connect to AutoGLM API');
      }
    }

    return new Error(`Unexpected error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Create a singleton instance of the AutoGLM client
 */
let clientInstance: AutoGLMClient | null = null;

export function getAutoGLMClient(): AutoGLMClient {
  if (!clientInstance) {
    clientInstance = new AutoGLMClient();
  }
  return clientInstance;
}
