import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

describe("release handoff", () => {
  it("summarizes local readiness, verification, and external launch actions", async () => {
    const contents = await readFile("docs/release-handoff.md", "utf8");

    for (const requiredPhrase of [
      "Release Handoff",
      "Local Readiness",
      "Implemented Surfaces",
      "Verification Evidence",
      "External Actions",
      "Git Status",
      "npm run release:smoke",
      "npm test",
      "npm audit --audit-level=high",
      "Supabase project",
      "migration tables are accessible",
      "BNB Chain testnet",
      "AGENTPAY_HOME_CHAIN_ID",
      "npm publish",
      "demo video",
      "Git repository is initialized",
    ]) {
      assert.match(contents, new RegExp(requiredPhrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
    }
  });
});
