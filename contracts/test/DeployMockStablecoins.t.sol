// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../script/DeployMockStablecoins.s.sol";

contract DeployMockStablecoinsTest {
    address private constant OWNER = address(0x1234);

    function testDeploysXLayerTestnetMockStablecoins() public {
        DeployMockStablecoins deployer = new DeployMockStablecoins();

        (MockStablecoin usdt0, MockStablecoin usdc) = deployer.deploy(OWNER);

        assert(keccak256(bytes(usdt0.name())) == keccak256(bytes("Mock USDT0")));
        assert(keccak256(bytes(usdt0.symbol())) == keccak256(bytes("USDT0")));
        assert(usdt0.decimals() == 6);
        assert(usdt0.owner() == OWNER);

        assert(keccak256(bytes(usdc.name())) == keccak256(bytes("Mock USDC")));
        assert(keccak256(bytes(usdc.symbol())) == keccak256(bytes("USDC")));
        assert(usdc.decimals() == 6);
        assert(usdc.owner() == OWNER);
    }
}
