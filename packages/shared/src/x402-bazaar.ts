import { z } from "zod";

const positiveIntegerStringSchema = z.string().regex(/^[1-9]\d*$/, "Expected a positive integer string");
const httpMethodSchema = z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("GET");
const bazaarResourceTypeSchema = z.enum(["http", "mcp"]);
const scalarParameterSchema = z.union([z.string(), z.number(), z.boolean()]);

const x402BazaarPaymentRequirementSchema = z
  .object({
    scheme: z.string(),
    network: z.string(),
    amount: positiveIntegerStringSchema,
    asset: z.string(),
    payTo: z.string(),
    maxTimeoutSeconds: z.number().int().positive(),
    extra: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export const x402BazaarResourceSchema = z
  .object({
    resource: z.string().url(),
    type: bazaarResourceTypeSchema,
    x402Version: z.literal(2),
    accepts: z.array(x402BazaarPaymentRequirementSchema).min(1),
    lastUpdated: z.string().optional(),
    description: z.string().optional(),
    mimeType: z.string().optional(),
    serviceName: z.string().optional(),
    tags: z.array(z.string()).optional(),
    iconUrl: z.string().url().optional(),
    extensions: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export const searchX402ServicesInputSchema = z.object({
  query: z.string().trim().min(1),
  type: bazaarResourceTypeSchema.default("http"),
  network: z.string().trim().min(1).optional(),
  limit: z.number().int().min(1).max(20).default(5),
  cursor: z.string().trim().min(1).optional(),
});

export const prepareX402ServiceRequestInputSchema = z.object({
  resource: x402BazaarResourceSchema,
  parameters: z.record(z.string(), scalarParameterSchema).default({}),
  headers: z.record(z.string(), z.string()).default({}),
  body: z.unknown().optional(),
});

export type X402BazaarResource = z.output<typeof x402BazaarResourceSchema>;
export type X402BazaarPaymentRequirement = z.output<typeof x402BazaarPaymentRequirementSchema>;
export type SearchX402ServicesInput = z.input<typeof searchX402ServicesInputSchema>;
export type ParsedSearchX402ServicesInput = z.output<typeof searchX402ServicesInputSchema>;
export type PrepareX402ServiceRequestInput = z.input<typeof prepareX402ServiceRequestInputSchema>;
export type ParsedPrepareX402ServiceRequestInput = z.output<typeof prepareX402ServiceRequestInputSchema>;

export interface X402BazaarPaymentRequiredObject extends Record<string, unknown> {
  x402Version: 2;
  resource: {
    url: string;
    description?: string;
    serviceName?: string;
    mimeType?: string;
  };
  accepts: X402BazaarPaymentRequirement[];
  extensions?: Record<string, unknown>;
}

export interface BuiltX402BazaarHttpRequest {
  status: "REQUEST_READY" | "NEEDS_INPUT";
  request?: {
    url: string;
    method: z.output<typeof httpMethodSchema>;
    headers: Record<string, string>;
    body?: string;
  };
  paymentRequired?: X402BazaarPaymentRequiredObject;
  missingParameters: string[];
}

export function normalizeX402BazaarResource(rawResource: unknown): X402BazaarResource {
  return x402BazaarResourceSchema.parse(rawResource);
}

export function buildX402BazaarHttpRequest(request: {
  resource: X402BazaarResource;
  parameters: Record<string, string | number | boolean>;
  headers: Record<string, string>;
  body?: unknown;
}): BuiltX402BazaarHttpRequest {
  if (request.resource.type !== "http") {
    throw new Error("prepare_x402_service_request currently supports Bazaar HTTP resources only.");
  }

  const input = getBazaarInput(request.resource);
  const method = httpMethodSchema.parse(asString(input.method)?.toUpperCase() ?? "GET");
  const missingParameters = new Set<string>();
  const usedParameters = new Set<string>();
  const routeTemplate = asString(input.routeTemplate) ?? request.resource.resource;
  const templatedPath = applyPathParameters(routeTemplate, request.parameters, usedParameters, missingParameters);
  const url = new URL(resolveRouteTemplate(templatedPath, request.resource.resource));
  const queryParams = asRecord(input.queryParams);

  for (const key of Object.keys(queryParams ?? {})) {
    usedParameters.add(key);
    if (!Object.hasOwn(request.parameters, key)) {
      missingParameters.add(key);
    } else {
      url.searchParams.set(key, String(request.parameters[key]));
    }
  }

  for (const key of getJsonSchemaRequiredKeys(input)) {
    if (!Object.hasOwn(request.parameters, key) && request.body === undefined) {
      missingParameters.add(key);
    }
  }

  if (missingParameters.size > 0) {
    return {
      status: "NEEDS_INPUT",
      missingParameters: [...missingParameters].sort(),
    };
  }

  const headers = { ...request.headers };
  const body = createRequestBody(method, request.body, request.parameters, usedParameters, headers);
  const requestUrl = url.toString();

  return {
    status: "REQUEST_READY",
    request: omitUndefined({
      url: requestUrl,
      method,
      headers,
      body,
    }) as BuiltX402BazaarHttpRequest["request"],
    paymentRequired: createPaymentRequiredObject(request.resource, requestUrl),
    missingParameters: [],
  };
}

export function getX402BazaarRequiredParameters(resource: X402BazaarResource): string[] {
  const input = getBazaarInput(resource);
  const routeTemplate = asString(input.routeTemplate) ?? resource.resource;
  return [...new Set([...getPathParameterNames(routeTemplate), ...Object.keys(asRecord(input.queryParams) ?? {}), ...getJsonSchemaRequiredKeys(input)])].sort();
}

export function getX402BazaarHttpMethod(resource: X402BazaarResource): string | undefined {
  const input = getBazaarInput(resource);
  return asString(input.method)?.toUpperCase();
}

function createPaymentRequiredObject(resource: X402BazaarResource, requestUrl: string): X402BazaarPaymentRequiredObject {
  return omitUndefined({
    x402Version: 2,
    resource: omitUndefined({
      url: requestUrl,
      description: resource.description,
      serviceName: resource.serviceName,
      mimeType: resource.mimeType,
    }),
    accepts: resource.accepts,
    extensions: resource.extensions,
  }) as X402BazaarPaymentRequiredObject;
}

function createRequestBody(
  method: z.output<typeof httpMethodSchema>,
  rawBody: unknown,
  parameters: Record<string, string | number | boolean>,
  usedParameters: Set<string>,
  headers: Record<string, string>,
): string | undefined {
  if (method === "GET" || method === "DELETE") {
    return undefined;
  }

  if (rawBody !== undefined) {
    return typeof rawBody === "string" ? rawBody : JSON.stringify(rawBody);
  }

  const unusedParameters = Object.fromEntries(
    Object.entries(parameters).filter(([key]) => !usedParameters.has(key)),
  );

  if (Object.keys(unusedParameters).length === 0) {
    return undefined;
  }

  if (!hasHeader(headers, "content-type")) {
    headers["Content-Type"] = "application/json";
  }

  return JSON.stringify(unusedParameters);
}

function applyPathParameters(
  routeTemplate: string,
  parameters: Record<string, string | number | boolean>,
  usedParameters: Set<string>,
  missingParameters: Set<string>,
): string {
  return routeTemplate
    .replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_match, key: string) =>
      replacePathParameter(key, parameters, usedParameters, missingParameters),
    )
    .replace(/\[([A-Za-z_][A-Za-z0-9_]*)\]/g, (_match, key: string) =>
      replacePathParameter(key, parameters, usedParameters, missingParameters),
    )
    .replace(/\/:([A-Za-z_][A-Za-z0-9_]*)/g, (_match, key: string) =>
      `/${replacePathParameter(key, parameters, usedParameters, missingParameters)}`,
    );
}

function replacePathParameter(
  key: string,
  parameters: Record<string, string | number | boolean>,
  usedParameters: Set<string>,
  missingParameters: Set<string>,
): string {
  usedParameters.add(key);
  if (!Object.hasOwn(parameters, key)) {
    missingParameters.add(key);
    return `{${key}}`;
  }

  return encodeURIComponent(String(parameters[key]));
}

function getPathParameterNames(routeTemplate: string): string[] {
  return [
    ...routeTemplate.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g),
    ...routeTemplate.matchAll(/\[([A-Za-z_][A-Za-z0-9_]*)\]/g),
    ...routeTemplate.matchAll(/\/:([A-Za-z_][A-Za-z0-9_]*)/g),
  ].map((match) => match[1]!);
}

function resolveRouteTemplate(routeTemplate: string, resourceUrl: string): string {
  return new URL(routeTemplate, resourceUrl).toString();
}

function getJsonSchemaRequiredKeys(input: Record<string, unknown>): string[] {
  const inputSchema = asRecord(input.inputSchema);
  const required = inputSchema?.required;
  return Array.isArray(required) ? required.filter((key): key is string => typeof key === "string") : [];
}

function getBazaarInput(resource: X402BazaarResource): Record<string, unknown> {
  const extensions = asRecord(resource.extensions);
  const bazaar = asRecord(extensions?.bazaar);
  const info = asRecord(bazaar?.info);
  return asRecord(info?.input) ?? {};
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function hasHeader(headers: Record<string, string>, headerName: string): boolean {
  return Object.keys(headers).some((name) => name.toLowerCase() === headerName.toLowerCase());
}

function omitUndefined<T extends Record<string, unknown>>(record: T): Partial<T> {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined)) as Partial<T>;
}
