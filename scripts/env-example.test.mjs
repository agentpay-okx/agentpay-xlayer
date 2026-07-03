import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const expectedKeys = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "BNB_RPC_URL",
  "BASE_RPC_URL",
  "EXECUTOR_PRIVATE_KEY",
  "SETUP_DEPLOYER_PRIVATE_KEY",
  "AGENTPAY_OWNER_ADDRESS",
  "AGENTPAY_EXECUTOR_ADDRESS",
  "AGENTPAY_HOME_CHAIN_ID",
  "AGENTPAY_ACCOUNT_ADDRESS",
  "AGENTPAY_BNB_TESTNET_USDC_ADDRESS",
  "AGENTPAY_BNB_TESTNET_USDT_ADDRESS",
  "AGENTPAY_ACCOUNT_BYTECODE_PATH",
  "AGENTPAY_ACCOUNT_BYTECODE",
  "AGENTPAY_INITIAL_ROUTE_TARGETS",
  "SETUP_WEB_URL",
  "SETUP_WEB_PORT",
  "LIFI_API_KEY",
  "LIFI_BASE_URL",
];

function parseEnvExampleKeys(contents) {
  return contents
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .map((line) => line.split("=", 1)[0]);
}

describe(".env.example", () => {
  it("matches the AgentPay installer and runtime config keys", async () => {
    const contents = await readFile(".env.example", "utf8");
    const keys = parseEnvExampleKeys(contents);

    assert.deepEqual(keys, expectedKeys);
  });
});
