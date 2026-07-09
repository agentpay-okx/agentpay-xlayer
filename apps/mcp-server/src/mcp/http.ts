import { EventEmitter, once } from "node:events";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { PassThrough } from "node:stream";

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type {
  HTTPAdapter,
  HTTPRequestContext,
  HTTPResponseInstructions,
  HTTPTransportContext,
} from "@okxweb3/x402-core/http";

import {
  createAgentPayRuntime,
  parseAgentPayEnv,
  type AgentPayRuntime,
  type AgentPayRuntimeConfig,
} from "../runtime/agentpay-runtime.ts";
import {
  createOkxAgentPaymentProcessorFromEnv,
  type AgentPayMcpPaymentProcessor,
} from "./okx-agent-payment.ts";
import { createAgentPayMcpServer, type ConnectableAgentPayMcpServer } from "./stdio.ts";

export type { AgentPayMcpPaymentProcessor } from "./okx-agent-payment.ts";

const defaultHostname = "0.0.0.0";
const defaultPort = 3001;
const defaultMcpPath = "/mcp";
const defaultHealthPath = "/healthz";
const freeJsonRpcMethods = new Set(["initialize", "notifications/initialized", "ping", "tools/list"]);

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
  paymentProcessor?: AgentPayMcpPaymentProcessor;
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
  const paymentProcessor =
    options.paymentProcessor ??
    (await createOkxAgentPaymentProcessorFromEnv(options.env ?? process.env, {
      mcpPath,
    }));
  const server = createServer((request, response) => {
    void handleAgentPayHttpRequest({
      request,
      response,
      runtime,
      mcpPath,
      healthPath,
      paymentProcessor,
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
  paymentProcessor?: AgentPayMcpPaymentProcessor;
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
    if (options.paymentProcessor && isGenericPaymentProbe(options.request)) {
      const paymentResult = await options.paymentProcessor.processHTTPRequest(
        createPaymentRequestContext(options.request, pathname),
      );

      if (paymentResult.type === "payment-error") {
        writeHttpInstruction(options.response, paymentResult.response);
        return;
      }
    }

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

  const requestBody = await readRequestBody(options.request);
  const shouldProcessPayment =
    Boolean(options.paymentProcessor) && !isFreeMcpRequest(requestBody);
  const paymentContext = createPaymentRequestContext(options.request, pathname);
  const paymentResult = shouldProcessPayment && options.paymentProcessor
    ? await options.paymentProcessor.processHTTPRequest(paymentContext)
    : { type: "no-payment-required" as const };

  if (paymentResult.type === "payment-error") {
    writeHttpInstruction(options.response, paymentResult.response);
    return;
  }

  if (paymentResult.type === "payment-verified") {
    const bufferedResponse = new BufferedServerResponse();

    await serveMcpRequest({
      request: options.request,
      requestBody,
      response: bufferedResponse as unknown as ServerResponse,
      runtime: options.runtime,
      createServer: options.createServer,
      createTransport: options.createTransport,
    });

    if (bufferedResponse.statusCode >= 400) {
      bufferedResponse.flushTo(options.response);
      return;
    }

    const settlement = await options.paymentProcessor?.processSettlement(
      paymentResult.paymentPayload,
      paymentResult.paymentRequirements,
      paymentResult.declaredExtensions,
      createPaymentTransportContext(paymentContext, bufferedResponse),
    );

    if (!settlement?.success) {
      writeHttpInstruction(
        options.response,
        settlement?.response ?? {
          status: 402,
          headers: { "content-type": "application/json" },
          body: { error: "Payment settlement failed." },
        },
      );
      return;
    }

    bufferedResponse.flushTo(options.response, settlement.headers);
    return;
  }

  await serveMcpRequest({
    request: options.request,
    requestBody,
    response: options.response,
    runtime: options.runtime,
    createServer: options.createServer,
    createTransport: options.createTransport,
  });
}

interface ServeMcpRequestOptions {
  request: IncomingMessage;
  requestBody: Buffer;
  response: ServerResponse;
  runtime: AgentPayRuntime;
  createServer: (runtime: AgentPayRuntime) => ConnectableAgentPayMcpServer;
  createTransport: () => StreamableHTTPServerTransport;
}

async function serveMcpRequest(options: ServeMcpRequestOptions): Promise<void> {
  const mcpServer = options.createServer(options.runtime);
  const transport = options.createTransport();

  try {
    await mcpServer.connect(transport);
    await transport.handleRequest(
      createReplayableRequest(options.request, options.requestBody),
      options.response,
      parseJsonBody(options.requestBody),
    );
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

function isGenericPaymentProbe(request: IncomingMessage): boolean {
  if (request.method !== "GET") {
    return false;
  }

  const accept = String(request.headers.accept ?? "");
  return !accept.toLowerCase().includes("text/event-stream");
}

async function readRequestBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(toBuffer(chunk));
  }

  return Buffer.concat(chunks);
}

function createReplayableRequest(request: IncomingMessage, body: Buffer): IncomingMessage {
  const replay = new PassThrough();
  Object.assign(replay, {
    complete: true,
    headers: request.headers,
    httpVersion: request.httpVersion,
    httpVersionMajor: request.httpVersionMajor,
    httpVersionMinor: request.httpVersionMinor,
    method: request.method,
    rawHeaders: request.rawHeaders,
    rawTrailers: request.rawTrailers,
    url: request.url,
    socket: request.socket,
    trailers: request.trailers,
  });
  replay.end(body);

  return replay as unknown as IncomingMessage;
}

function isFreeMcpRequest(body: Buffer): boolean {
  const messages = parseJsonRpcMessages(body);

  return messages.length > 0 && messages.every(isFreeJsonRpcMessage);
}

function parseJsonRpcMessages(body: Buffer): JsonRpcMessage[] {
  const parsed = parseJsonBody(body);

  if (parsed === undefined) {
    return [];
  }

  const messages = Array.isArray(parsed) ? parsed : [parsed];

  return messages.filter(isJsonRpcMessage);
}

function parseJsonBody(body: Buffer): unknown {
  if (body.length === 0) {
    return undefined;
  }

  try {
    return JSON.parse(body.toString("utf8"));
  } catch {
    return undefined;
  }
}

interface JsonRpcMessage {
  method?: unknown;
  params?: unknown;
}

function isJsonRpcMessage(value: unknown): value is JsonRpcMessage {
  return typeof value === "object" && value !== null;
}

function isFreeJsonRpcMessage(message: JsonRpcMessage): boolean {
  if (typeof message.method !== "string") {
    return false;
  }

  return freeJsonRpcMethods.has(message.method);
}

function createStatelessTransport(): StreamableHTTPServerTransport {
  return new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
}

function setCorsHeaders(response: ServerResponse): void {
  response.setHeader("access-control-allow-origin", "*");
  response.setHeader("access-control-allow-methods", "POST, OPTIONS");
  response.setHeader(
    "access-control-allow-headers",
    "content-type, mcp-session-id, mcp-protocol-version, payment-signature, PAYMENT-SIGNATURE",
  );
  response.setHeader("access-control-expose-headers", "PAYMENT-REQUIRED, PAYMENT-RESPONSE");
}

function writeJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, { "content-type": "application/json" });
  response.end(`${JSON.stringify(body)}\n`);
}

function getRequestPathname(request: IncomingMessage): string {
  const host = request.headers.host ?? "127.0.0.1";
  return new URL(request.url ?? "/", `http://${host}`).pathname;
}

function createPaymentRequestContext(request: IncomingMessage, path: string): HTTPRequestContext {
  const adapter = createNodeHttpPaymentAdapter(request, path);

  return {
    adapter,
    path,
    method: adapter.getMethod(),
    paymentHeader: adapter.getHeader("PAYMENT-SIGNATURE"),
  };
}

function createNodeHttpPaymentAdapter(request: IncomingMessage, path: string): HTTPAdapter {
  return {
    getHeader(name) {
      const value = request.headers[name.toLowerCase()];

      return Array.isArray(value) ? value.join(", ") : value;
    },
    getMethod() {
      return request.method ?? "GET";
    },
    getPath() {
      return path;
    },
    getUrl() {
      return createRequestUrl(request);
    },
    getAcceptHeader() {
      return this.getHeader("accept") ?? "";
    },
    getUserAgent() {
      return this.getHeader("user-agent") ?? "";
    },
    getQueryParams() {
      return Object.fromEntries(new URL(createRequestUrl(request)).searchParams.entries());
    },
    getQueryParam(name) {
      return new URL(createRequestUrl(request)).searchParams.get(name) ?? undefined;
    },
  };
}

function createRequestUrl(request: IncomingMessage): string {
  const host = getForwardedHeader(request, "x-forwarded-host") ?? request.headers.host ?? "127.0.0.1";
  const proto =
    getForwardedHeader(request, "x-forwarded-proto") ??
    ((request.socket as { encrypted?: boolean }).encrypted ? "https" : "http");

  return `${proto}://${host}${request.url ?? "/"}`;
}

function getForwardedHeader(request: IncomingMessage, name: string): string | undefined {
  const value = request.headers[name];
  const firstValue = Array.isArray(value) ? value[0] : value;

  return firstValue?.split(",")[0]?.trim();
}

function writeHttpInstruction(response: ServerResponse, instruction: HTTPResponseInstructions): void {
  for (const [name, value] of Object.entries(instruction.headers)) {
    response.setHeader(name, value);
  }

  if (instruction.body === undefined) {
    response.writeHead(instruction.status).end();
    return;
  }

  if (typeof instruction.body === "string") {
    response.writeHead(instruction.status).end(instruction.body);
    return;
  }

  response.writeHead(instruction.status).end(`${JSON.stringify(instruction.body)}\n`);
}

function createPaymentTransportContext(
  request: HTTPRequestContext,
  response: BufferedServerResponse,
): HTTPTransportContext {
  return {
    request,
    responseBody: response.body,
    responseHeaders: response.headers,
  };
}

class BufferedServerResponse extends EventEmitter {
  statusCode = 200;
  statusMessage = "";
  headersSent = false;
  writable = true;
  writableEnded = false;
  destroyed = false;
  readonly headers: Record<string, string> = {};
  private readonly chunks: Buffer[] = [];

  get body(): Buffer {
    return Buffer.concat(this.chunks);
  }

  setHeader(name: string, value: number | string | readonly string[]): this {
    this.headers[name.toLowerCase()] = Array.isArray(value) ? value.join(", ") : String(value);
    return this;
  }

  getHeader(name: string): string | undefined {
    return this.headers[name.toLowerCase()];
  }

  getHeaders(): Record<string, string> {
    return { ...this.headers };
  }

  removeHeader(name: string): void {
    delete this.headers[name.toLowerCase()];
  }

  flushHeaders(): void {
    this.headersSent = true;
  }

  writeHead(statusCode: number, statusMessageOrHeaders?: string | Record<string, number | string | readonly string[]>, headers?: Record<string, number | string | readonly string[]>): this {
    this.statusCode = statusCode;

    if (typeof statusMessageOrHeaders === "string") {
      this.statusMessage = statusMessageOrHeaders;
    } else if (statusMessageOrHeaders) {
      this.setHeaders(statusMessageOrHeaders);
    }

    if (headers) {
      this.setHeaders(headers);
    }

    this.headersSent = true;
    return this;
  }

  write(chunk: unknown, encodingOrCallback?: BufferEncoding | ((error?: Error | null) => void), callback?: (error?: Error | null) => void): boolean {
    this.headersSent = true;
    this.chunks.push(toBuffer(chunk, typeof encodingOrCallback === "string" ? encodingOrCallback : undefined));
    const done = typeof encodingOrCallback === "function" ? encodingOrCallback : callback;
    done?.();

    return true;
  }

  end(chunk?: unknown, encodingOrCallback?: BufferEncoding | (() => void), callback?: () => void): this {
    if (chunk !== undefined) {
      this.write(chunk, typeof encodingOrCallback === "string" ? encodingOrCallback : undefined);
    }

    this.headersSent = true;
    this.writableEnded = true;
    this.emit("finish");
    const done = typeof encodingOrCallback === "function" ? encodingOrCallback : callback;
    done?.();

    return this;
  }

  destroy(error?: Error): this {
    this.destroyed = true;

    if (error) {
      this.emit("error", error);
    }

    this.emit("close");
    return this;
  }

  flushTo(response: ServerResponse, extraHeaders: Record<string, string> = {}): void {
    for (const [name, value] of Object.entries({ ...this.headers, ...extraHeaders })) {
      response.setHeader(name, value);
    }

    response.writeHead(this.statusCode);
    response.end(this.body);
  }

  private setHeaders(headers: Record<string, number | string | readonly string[]>): void {
    for (const [name, value] of Object.entries(headers)) {
      this.setHeader(name, value);
    }
  }
}

function toBuffer(chunk: unknown, encoding: BufferEncoding = "utf8"): Buffer {
  if (Buffer.isBuffer(chunk)) {
    return chunk;
  }

  if (chunk instanceof Uint8Array) {
    return Buffer.from(chunk);
  }

  return Buffer.from(String(chunk), encoding);
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
