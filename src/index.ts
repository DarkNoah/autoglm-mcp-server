#!/usr/bin/env node

/**
 * AutoGLM MCP Server
 *
 * A Model Context Protocol (MCP) server for the AutoGLM-Phone API.
 * This server provides tools for automated GUI interaction on mobile devices.
 *
 * Usage:
 *   - stdio mode (default): node dist/index.js
 *   - HTTP mode: node dist/index.js --transport http --port 3000
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { registerAutoGLMTools } from "./tools/autoglm-tools.js";
import express from "express";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import type { Response } from 'express';

// 读取 package.json 获取版本号（兼容 npx 等各种运行方式）
const require = createRequire(import.meta.url);
const packageJson = require("../package.json");
const VERSION: string = packageJson.version;



/**
 * Create and configure the AutoGLM MCP server
 */
function createServer(): McpServer {
  const server = new McpServer(
    {
      name: "autoglm-mcp-server",
      version: VERSION,
      description: "MCP server for AutoGLM-Phone API integration",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Register all AutoGLM tools
  registerAutoGLMTools(server);

  return server;
}

/**
 * Parse command line arguments
 */
function parseArgs(): { transport: "stdio" | "http" | "sse"; port: number; host: string } {
  const args = process.argv.slice(2);
  const result = {
    transport: "stdio" as "stdio" | "http" | "sse",
    port: 3000,
    host: "127.0.0.1",
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--transport":
      case "-t":
        result.transport = args[++i] as "stdio" | "http" | "sse";
        break;
      case "--port":
      case "-p":
        result.port = parseInt(args[++i], 10);
        break;
      case "--host":
      case "-h":
        result.host = args[++i];
        break;
      case "--help":
        console.log(`
AutoGLM MCP Server

Usage:
  node dist/index.js [options]

Options:
  --transport, -t <type>  Transport type: stdio (default), http, or sse
  --port, -p <port>       Port for HTTP/SSE transport (default: 3000)
  --host, -h <host>       Host for HTTP/SSE transport (default: 127.0.0.1)
  --help                  Show this help message

Examples:
  # Start with stdio transport (default)
  node dist/index.js

  # Start with HTTP transport on port 3000
  node dist/index.js --transport http --port 3000

  # Start with SSE transport on port 3000
  node dist/index.js --transport sse --port 3000

  # Start with HTTP transport on all interfaces
  node dist/index.js --transport http --host 0.0.0.0 --port 3000
        `);
        process.exit(0);
    }
  }

  return result;
}

/**
 * Start server with stdio transport
 */
async function startStdioServer(server: McpServer): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("AutoGLM MCP Server started successfully");
  console.error("Listening on stdio...");
}

/**
 * Extract API key from Authorization header
 */
function extractApiKey(authHeader: string | undefined): string | undefined {
  if (!authHeader) return undefined;

  // Support "Bearer <token>" format
  if (authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }

  // Support raw token
  return authHeader;
}

/**
 * Start server with HTTP transport
 */
async function startHttpServer(
  _server: McpServer,
  port: number,
  host: string
): Promise<void> {
  const app = express();
  app.use(express.json());

  // Store transports by session ID
  const transports: Record<string, StreamableHTTPServerTransport> = {};

  // Set up route for MCP requests
  app.post("/mcp", async (req, res: Response) => {
    // Extract API key from Authorization header
    const apiKey = extractApiKey(req.headers.authorization);
    if (apiKey) {
      process.env.AUTOGLM_API_KEY = apiKey;
    }

    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    try {
      let transport: StreamableHTTPServerTransport;

      if (sessionId && transports[sessionId]) {
        // Reuse existing transport
        transport = transports[sessionId];
      } else if (!sessionId && isInitializeRequest(req.body)) {
        // New initialization request - create new server and transport
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (newSessionId) => {
            console.error(`Session initialized: ${newSessionId}`);
            transports[newSessionId] = transport;
          },
        });

        // Clean up on close
        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid && transports[sid]) {
            console.error(`Session closed: ${sid}`);
            delete transports[sid];
          }
        };

        // Create new server for this session and connect
        const server = createServer();
        await server.connect(transport);
      } else {
        // Invalid request
        res.status(400).json({
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: "Bad Request: No valid session ID provided",
          },
          id: null,
        });
        return;
      }

      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error("Error handling MCP request:", error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: "Internal server error",
          },
          id: null,
        });
      }
    }
  });

  // Set up GET endpoint for SSE streams
  app.get("/mcp", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (!sessionId || !transports[sessionId]) {
      res.status(400).json({ error: "Invalid or missing session ID" });
      return;
    }

    const transport = transports[sessionId];
    await transport.handleRequest(req, res);
  });

  // DELETE endpoint for session cleanup
  app.delete("/mcp", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (!sessionId || !transports[sessionId]) {
      res.status(400).json({ error: "Invalid or missing session ID" });
      return;
    }

    try {
      const transport = transports[sessionId];
      await transport.handleRequest(req, res);
    } catch (error) {
      console.error("Error handling session termination:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Error processing session termination" });
      }
    }
  });

  // Start HTTP server
  app.listen(port, host, () => {
    console.error(`AutoGLM MCP Server started successfully`);
    console.error(`HTTP server listening on http://${host}:${port}`);
    console.error(`MCP endpoint: http://${host}:${port}/mcp`);
    console.error(`Note: Use Authorization header to pass AUTOGLM_API_KEY`);
  });
}

/**
 * Start server with SSE transport
 */
async function startSseServer(
  port: number,
  host: string
): Promise<void> {
  const app = express();
  app.use(express.json());

  // Store transports by session ID
  const transports = new Map<string, SSEServerTransport>();

  // SSE endpoint - client connects here first to establish SSE stream
  app.get("/sse", async (req, res) => {
    // Extract API key from Authorization header
    const apiKey = extractApiKey(req.headers.authorization);
    if (apiKey) {
      process.env.AUTOGLM_API_KEY = apiKey;
    }

    // Create new server and transport for each SSE connection
    const server = createServer();
    const transport = new SSEServerTransport("/messages", res);

    // Store transport
    transports.set(transport.sessionId, transport);

    // Clean up on close
    transport.onclose = () => {
      transports.delete(transport.sessionId);
    };

    await server.connect(transport);
  });

  // Messages endpoint - client sends messages here
  app.post("/messages", async (req, res) => {
    // Extract API key from Authorization header
    const apiKey = extractApiKey(req.headers.authorization);
    if (apiKey) {
      process.env.AUTOGLM_API_KEY = apiKey;
    }

    const sessionId = req.query.sessionId as string;
    const transport = transports.get(sessionId);

    if (!transport) {
      res.status(400).json({ error: "Invalid or missing session ID" });
      return;
    }

    await transport.handlePostMessage(req, res);
  });

  // Start HTTP server
  app.listen(port, host, () => {
    console.error(`AutoGLM MCP Server started successfully (SSE mode)`);
    console.error(`HTTP server listening on http://${host}:${port}`);
    console.error(`SSE endpoint: http://${host}:${port}/sse`);
    console.error(`Messages endpoint: http://${host}:${port}/messages`);
    console.error(`Note: Use Authorization header to pass AUTOGLM_API_KEY`);
  });
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const server = createServer();
  const args = parseArgs();

  if (args.transport === "http") {
    await startHttpServer(server, args.port, args.host);
  } else if (args.transport === "sse") {
    await startSseServer(args.port, args.host);
  } else {
    await startStdioServer(server);
  }
}

// Start the server
main().catch((error) => {
  console.error("Fatal error starting server:", error);
  process.exit(1);
});
