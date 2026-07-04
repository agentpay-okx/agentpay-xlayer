import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createContractFactoryAgentPayAccountDeployer } from "./account-deployer.ts";

describe("createContractFactoryAgentPayAccountDeployer", () => {
  it("deploys AgentPayAccount with owner and executor and returns address plus tx hash", async () => {
    const calls: unknown[] = [];
    const deployer = createContractFactoryAgentPayAccountDeployer({
      async deploy(
        ownerAddress: string,
        executorAddress: string,
        initialAllowedTokenAddresses: string[],
        initialAllowedRouteTargets: string[],
      ) {
        calls.push([ownerAddress, executorAddress, initialAllowedTokenAddresses, initialAllowedRouteTargets]);
        return {
          target: "0x3333333333333333333333333333333333333333",
          deploymentTransaction() {
            return {
              hash: "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
            };
          },
          async waitForDeployment() {
            calls.push("wait");
          },
        };
      },
    });

    const result = await deployer.deployAgentPayAccount({
      ownerAddress: "0x2222222222222222222222222222222222222222",
      executorAddress: "0x4444444444444444444444444444444444444444",
      initialAllowedTokenAddresses: [
        "0x5555555555555555555555555555555555555555",
        "0x6666666666666666666666666666666666666666",
      ],
      initialAllowedRouteTargets: ["0x7777777777777777777777777777777777777777"],
      homeChainId: 1952,
    });

    assert.deepEqual(calls, [
      [
        "0x2222222222222222222222222222222222222222",
        "0x4444444444444444444444444444444444444444",
        [
          "0x5555555555555555555555555555555555555555",
          "0x6666666666666666666666666666666666666666",
        ],
        ["0x7777777777777777777777777777777777777777"],
      ],
      "wait",
    ]);
    assert.deepEqual(result, {
      accountAddress: "0x3333333333333333333333333333333333333333",
      deploymentTxHash: "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    });
  });
});
