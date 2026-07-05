import { once } from "node:events";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import {
  createAgentPayRuntime,
  parseAgentPayEnv,
  type AgentPayRuntime,
  type AgentPayRuntimeConfig,
} from "../runtime/agentpay-runtime.ts";
import { createAgentPayMcpServer, type ConnectableAgentPayMcpServer } from "./stdio.ts";

const defaultHostname = "0.0.0.0";
const defaultPort = 3001;
const defaultMcpPath = "/mcp";
const defaultHealthPath = "/healthz";

export interface AgentPayHttpServer {
  url: string;
  mcpUrl: string;
  healthUrl: string;
  close(): Promise<void>;
}

export interface StartAgentPayHttpServerOptions {
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  hostname?: string;
  port?: number;
  mcpPath?: string;
  healthPath?: string;
  createRuntime?: (config: AgentPayRuntimeConfig) => AgentPayRuntime;
  createServer?: (runtime: AgentPayRuntime) => ConnectableAgentPayMcpServer;
  createTransport?: () => StreamableHTTPServerTransport;
}

export async function startAgentPayHttpServer(options: StartAgentPayHttpServerOptions = {}): Promise<AgentPayHttpServer> {
  const config = parseAgentPayEnv(options.env ?? process.env);
  const runtime = options.createRuntime ? options.createRuntime(config) : createAgentPayRuntime(config);
  const hostname = options.hostname ?? defaultHostname;
  const port = options.port ?? defaultPort;
  const mcpPath = normalizePath(options.mcpPath ?? defaultMcpPath);
  const healthPath = normalizePath(options.healthPath ?? defaultHealthPath);
  const server = createServer((request, response) => {
    void handleAgentPayHttpRequest({
      request,
      response,
      runtime,
      mcpPath,
      healthPath,
      createServer: options.createServer ?? createAgentPayMcpServer,
      createTransport: options.createTransport ?? createStatelessTransport,
    });
  });

  server.listen(port, hostname);
  await once(server, "listening");

  const address = server.address();
  const resolvedPort = typeof address === "object" && address ? address.port : port;
  const baseUrl = `http://${hostname}:${resolvedPort}`;

  return {
    url: baseUrl,
    mcpUrl: `${baseUrl}${mcpPath}`,
    healthUrl: `${baseUrl}${healthPath}`,
    async close() {
      await closeServer(server);
    },
  };
}

interface HandleAgentPayHttpRequestOptions {
  request: IncomingMessage;
  response: ServerResponse;
  runtime: AgentPayRuntime;
  mcpPath: string;
  healthPath: string;
  createServer: (runtime: AgentPayRuntime) => ConnectableAgentPayMcpServer;
  createTransport: () => StreamableHTTPServerTransport;
}

async function handleAgentPayHttpRequest(options: HandleAgentPayHttpRequestOptions): Promise<void> {
  setCorsHeaders(options.response);
  const pathname = getRequestPathname(options.request);

  if (options.request.method === "OPTIONS") {
    options.response.writeHead(204).end();
    return;
  }

  if (pathname === options.healthPath && options.request.method === "GET") {
    writeJson(options.response, 200, {
      ok: true,
      service: "agentpay-a2mcp",
      transport: "streamable-http",
    });
    return;
  }

  if (pathname !== options.mcpPath) {
    writeJson(options.response, 404, { error: "Not found" });
    return;
  }

  if (options.request.method !== "POST") {
    writeJson(options.response, 405, {
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed.",
      },
      id: null,
    });
    return;
  }

  const mcpServer = options.createServer(options.runtime);
  const transport = options.createTransport();

  try {
    await mcpServer.connect(transport);
    await transport.handleRequest(options.request, options.response);
  } catch {
    if (!options.response.headersSent) {
      writeJson(options.response, 500, {
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal server error.",
        },
        id: null,
      });
    }
  } finally {
    await Promise.allSettled([transport.close(), mcpServer.close()]);
  }
}

function createStatelessTransport(): StreamableHTTPServerTransport {
  return new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
}

function setCorsHeaders(response: ServerResponse): void {
  response.setHeader("access-control-allow-origin", "*");
  response.setHeader("access-control-allow-methods", "POST, OPTIONS");
  response.setHeader("access-control-allow-headers", "content-type, mcp-session-id, mcp-protocol-version");
}

function writeJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, { "content-type": "application/json" });
  response.end(`${JSON.stringify(body)}\n`);
}

function getRequestPathname(request: IncomingMessage): string {
  const host = request.headers.host ?? "127.0.0.1";
  return new URL(request.url ?? "/", `http://${host}`).pathname;
}

function normalizePath(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

async function closeServer(server: Server): Promise<void> {
  if (!server.listening) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}
