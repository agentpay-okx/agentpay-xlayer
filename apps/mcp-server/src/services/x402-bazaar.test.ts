import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createX402BazaarDiscoveryProvider } from "./x402-bazaar.ts";

const bazaarResource = {
  resource: "https://api.market.example.com/prices",
  type: "http",
  x402Version: 2,
  serviceName: "Market Bazaar",
  description: "Paid market prices",
  lastUpdated: "2026-07-05T08:00:00.000Z",
  accepts: [
    {
      scheme: "exact",
      network: "eip155:196",
      amount: "250000",
      asset: "0x779Ded0c9e1022225f8E0630b35a9b54bE713736",
      payTo: "0x1111111111111111111111111111111111111111",
      maxTimeoutSeconds: 60,
    },
  ],
};

describe("createX402BazaarDiscoveryProvider", () => {
  it("calls the facilitator search endpoint with Bazaar filters", async () => {
    const fetchCalls: Array<{ url: string; init: RequestInit }> = [];
    const provider = createX402BazaarDiscoveryProvider({
      facilitatorUrl: "https://facilitator.example.com",
      async fetch(url, init) {
        fetchCalls.push({ url: String(url), init: init ?? {} });
        return Response.json({
          x402Version: 2,
          resources: [bazaarResource],
          partialResults: true,
          pagination: {
            limit: 3,
            cursor: "next-cursor",
          },
        });
      },
    });

    const output = await provider.search({
      query: "okx market data",
      type: "http",
      network: "eip155:196",
      limit: 3,
      cursor: "cursor-1",
    });

    assert.equal(
      fetchCalls[0]?.url,
      "https://facilitator.example.com/discovery/search?query=okx+market+data&type=http&network=eip155%3A196&limit=3&cursor=cursor-1",
    );
    assert.equal(fetchCalls[0]?.init.method, "GET");
    assert.deepEqual(fetchCalls[0]?.init.headers, {
      "Content-Type": "application/json",
    });
    assert.equal(output.resources[0]?.resource, "https://api.market.example.com/prices");
    assert.equal(output.nextCursor, "next-cursor");
    assert.equal(output.partialResults, true);
  });

  it("turns facilitator HTTP failures into useful errors", async () => {
    const provider = createX402BazaarDiscoveryProvider({
      facilitatorUrl: "https://facilitator.example.com/",
      async fetch() {
        return new Response("search unavailable", { status: 503, statusText: "Service Unavailable" });
      },
    });

    await assert.rejects(
      () => provider.search({ query: "weather", type: "http", limit: 5 }),
      /x402 Bazaar search failed \(503\): search unavailable/,
    );
  });
});
