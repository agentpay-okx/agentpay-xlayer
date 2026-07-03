// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../src/MockStablecoin.sol";

interface Vm {
    function prank(address sender) external;
}

contract MockStablecoinTest {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    address private constant OWNER = address(0x1234);
    address private constant USER = address(0x5678);

    function testMintsMockStablecoinToRecipient() public {
        MockStablecoin token = new MockStablecoin("Mock USDC", "USDC", 6, OWNER);

        vm.prank(OWNER);
        token.mint(USER, 1_000_000);

        assert(keccak256(bytes(token.name())) == keccak256(bytes("Mock USDC")));
        assert(keccak256(bytes(token.symbol())) == keccak256(bytes("USDC")));
        assert(token.decimals() == 6);
        assert(token.balanceOf(USER) == 1_000_000);
    }
}
