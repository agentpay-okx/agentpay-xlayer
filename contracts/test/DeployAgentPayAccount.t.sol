// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../script/DeployAgentPayAccount.s.sol";
import "../src/AgentPayAccount.sol";

interface TestVm {
    function setEnv(string calldata name, string calldata value) external;
}

contract DeployAgentPayAccountTest {
    address private constant VM_ADDRESS = address(uint160(uint256(keccak256("hevm cheat code"))));
    address private constant OWNER = address(0x1234);
    address private constant EXECUTOR = address(0x5678);
    address private constant ROUTE_TARGET = address(0x7777);
    address private constant XLAYER_USDT0 = 0x779Ded0c9e1022225f8E0630b35a9b54bE713736;
    address private constant XLAYER_USDC = 0x74b7F16337b8972027F6196A17a631aC6dE26d22;
    address private constant XLAYER_TESTNET_USDT0 = 0x1111111111111111111111111111111111111111;
    address private constant XLAYER_TESTNET_USDC = 0x2222222222222222222222222222222222222222;
    TestVm private constant vm = TestVm(VM_ADDRESS);

    function testDeploysAccountWithDefaultStableTokenAllowlist() public {
        DeployAgentPayAccount deployer = new DeployAgentPayAccount();
        address[] memory routeTargets = new address[](1);
        routeTargets[0] = ROUTE_TARGET;

        AgentPayAccount account = deployer.deploy(OWNER, EXECUTOR, routeTargets);

        assert(account.owner() == OWNER);
        assert(account.executor() == EXECUTOR);
        assert(account.allowedTokens(XLAYER_USDT0));
        assert(account.allowedTokens(XLAYER_USDC));
        assert(account.allowedRouteTargets(ROUTE_TARGET));
    }

    function testDefaultAllowedTokensAreXLayerStablecoins() public {
        DeployAgentPayAccount deployer = new DeployAgentPayAccount();
        address[] memory tokens = deployer.defaultAllowedTokens();

        assert(tokens.length == 2);
        assert(tokens[0] == XLAYER_USDT0);
        assert(tokens[1] == XLAYER_USDC);
    }

    function testDefaultAllowedTokensSupportXLayerTestnetOverrides() public {
        vm.setEnv("AGENTPAY_XLAYER_TESTNET_USDT0_ADDRESS", "0x1111111111111111111111111111111111111111");
        vm.setEnv("AGENTPAY_XLAYER_TESTNET_USDC_ADDRESS", "0x2222222222222222222222222222222222222222");

        DeployAgentPayAccount deployer = new DeployAgentPayAccount();
        address[] memory tokens = deployer.defaultAllowedTokensForChain(1952);

        assert(tokens.length == 2);
        assert(tokens[0] == XLAYER_TESTNET_USDT0);
        assert(tokens[1] == XLAYER_TESTNET_USDC);
    }
}
