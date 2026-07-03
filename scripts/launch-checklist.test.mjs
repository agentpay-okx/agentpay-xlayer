import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

describe("launch checklist", () => {
  it("tracks external launch tasks and local verification gates", async () => {
    const contents = await readFile("docs/launch-checklist.md", "utf8");

    for (const requiredPhrase of [
      "Supabase project",
      "migration tables are accessible",
      "BNB Chain testnet",
      "AGENTPAY_HOME_CHAIN_ID=97",
      "npm publish",
      "demo video",
      "npm run release:smoke",
      "npm test",
      "npm audit --audit-level=high",
    ]) {
      assert.match(contents, new RegExp(requiredPhrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
    }
  });
});
