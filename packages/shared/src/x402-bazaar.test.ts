import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseX402PaymentRequired } from "./x402.ts";
import {
  buildX402BazaarHttpRequest,
  normalizeX402BazaarResource,
  prepareX402ServiceRequestInputSchema,
  searchX402ServicesInputSchema,
} from "./x402-bazaar.ts";

const bazaarResource = {
  resource: "https://api.market.example.com/prices",
  type: "http",
  x402Version: 2,
  serviceName: "Market Bazaar",
  description: "Paid market prices",
  tags: ["markets", "okx"],
  lastUpdated: "2026-07-05T08:00:00.000Z",
  accepts: [
    {
      scheme: "exact",
      network: "eip155:196",
      amount: "250000",
      asset: "0x779Ded0c9e1022225f8E0630b35a9b54bE713736",
      payTo: "0x1111111111111111111111111111111111111111",
      maxTimeoutSeconds: 60,
      extra: {
        name: "USDT0",
        version: "1",
      },
    },
  ],
  extensions: {
    bazaar: {
      info: {
        input: {
          type: "http",
          method: "GET",
          queryParams: {
            symbol: "BTC-USDT",
          },
        },
        output: {
          type: "json",
          example: {
            symbol: "BTC-USDT",
            price: "65000",
          },
        },
      },
    },
  },
};

describe("x402 Bazaar schemas", () => {
  it("parses service search input with safe defaults", () => {
    assert.deepEqual(
      searchX402ServicesInputSchema.parse({
        query: "  okx market data ",
      }),
      {
        query: "okx market data",
        type: "http",
        limit: 5,
      },
    );
  });

  it("keeps selected resource payloads and parameter maps structured", () => {
    const input = prepareX402ServiceRequestInputSchema.parse({
      resource: bazaarResource,
      parameters: {
        symbol: "ETH-USDT",
      },
      headers: {
        Accept: "application/json",
      },
    });

    assert.equal(input.resource.resource, "https://api.market.example.com/prices");
    assert.equal(input.parameters.symbol, "ETH-USDT");
    assert.equal(input.headers.Accept, "application/json");
  });
});

describe("buildX402BazaarHttpRequest", () => {
  it("builds an HTTP request plus PAYMENT-REQUIRED object from a Bazaar resource", () => {
    const output = buildX402BazaarHttpRequest({
      resource: normalizeX402BazaarResource(bazaarResource),
      parameters: {
        symbol: "ETH-USDT",
      },
      headers: {
        Accept: "application/json",
      },
    });

    assert.deepEqual(output, {
      status: "REQUEST_READY",
      request: {
        url: "https://api.market.example.com/prices?symbol=ETH-USDT",
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      },
      paymentRequired: {
        x402Version: 2,
        resource: {
          url: "https://api.market.example.com/prices?symbol=ETH-USDT",
          description: "Paid market prices",
          serviceName: "Market Bazaar",
        },
        accepts: bazaarResource.accepts,
        extensions: bazaarResource.extensions,
      },
      missingParameters: [],
    });

    const parsed = parseX402PaymentRequired({ paymentRequired: output.paymentRequired });
    assert.equal(parsed.paymentInput.amountOut, "0.25");
    assert.equal(parsed.paymentInput.destinationChainId, 196);
    assert.equal(parsed.paymentInput.destinationTokenSymbol, "USDT0");
    assert.equal(parsed.resource.url, "https://api.market.example.com/prices?symbol=ETH-USDT");
  });

  it("returns missing parameters instead of inventing request values", () => {
    const output = buildX402BazaarHttpRequest({
      resource: normalizeX402BazaarResource(bazaarResource),
      parameters: {},
      headers: {},
    });

    assert.deepEqual(output, {
      status: "NEEDS_INPUT",
      missingParameters: ["symbol"],
    });
  });

  it("resolves relative Bazaar route templates against the resource URL", () => {
    const output = buildX402BazaarHttpRequest({
      resource: normalizeX402BazaarResource({
        ...bazaarResource,
        resource: "https://api.market.example.com",
        extensions: {
          bazaar: {
            info: {
              input: {
                type: "http",
                method: "GET",
                routeTemplate: "/prices/{symbol}",
              },
            },
          },
        },
      }),
      parameters: {
        symbol: "BTC-USDT",
      },
      headers: {},
    });

    assert.equal(output.status, "REQUEST_READY");
    assert.equal(output.request?.url, "https://api.market.example.com/prices/BTC-USDT");
  });
});
