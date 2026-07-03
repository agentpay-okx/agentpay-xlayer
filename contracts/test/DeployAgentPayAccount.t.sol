// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../script/DeployAgentPayAccount.s.sol";
import "../src/AgentPayAccount.sol";

contract DeployAgentPayAccountTest {
    address private constant OWNER = address(0x1234);
    address private constant EXECUTOR = address(0x5678);
    address private constant ROUTE_TARGET = address(0x7777);
    address private constant BNB_USDC = 0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d;
    address private constant BNB_USDT = 0x55d398326f99059fF775485246999027B3197955;
    address private constant BNB_TESTNET_USDC = 0xEC1C60D64a06896Df296438c12edD14E974FDE47;
    address private constant BNB_TESTNET_USDT = 0x337610d27c682E347C9cD60BD4b3b107C9d34dDd;

    function testDeploysAccountWithDefaultStableTokenAllowlist() public {
        DeployAgentPayAccount deployer = new DeployAgentPayAccount();
        address[] memory routeTargets = new address[](1);
        routeTargets[0] = ROUTE_TARGET;

        AgentPayAccount account = deployer.deploy(OWNER, EXECUTOR, routeTargets);

        assert(account.owner() == OWNER);
        assert(account.executor() == EXECUTOR);
        assert(account.allowedTokens(BNB_USDC));
        assert(account.allowedTokens(BNB_USDT));
        assert(account.allowedRouteTargets(ROUTE_TARGET));
    }

    function testDefaultAllowedTokensAreBnbStablecoins() public {
        DeployAgentPayAccount deployer = new DeployAgentPayAccount();
        address[] memory tokens = deployer.defaultAllowedTokens();

        assert(tokens.length == 2);
        assert(tokens[0] == BNB_USDC);
        assert(tokens[1] == BNB_USDT);
    }

    function testDefaultAllowedTokensSupportBnbTestnet() public {
        DeployAgentPayAccount deployer = new DeployAgentPayAccount();
        address[] memory tokens = deployer.defaultAllowedTokensForChain(97);

        assert(tokens.length == 2);
        assert(tokens[0] == BNB_TESTNET_USDC);
        assert(tokens[1] == BNB_TESTNET_USDT);
    }
}
