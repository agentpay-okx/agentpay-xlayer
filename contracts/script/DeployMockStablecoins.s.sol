// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../src/MockStablecoin.sol";

interface MockStablecoinVm {
    function envAddress(string calldata name) external returns (address);
    function envUint(string calldata name) external returns (uint256);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

contract DeployMockStablecoins {
    address internal constant VM_ADDRESS = address(uint160(uint256(keccak256("hevm cheat code"))));

    MockStablecoinVm internal constant vm = MockStablecoinVm(VM_ADDRESS);

    event MockStablecoinsDeployed(address indexed usdt0, address indexed usdc, address indexed owner);

    function run() external returns (MockStablecoin usdt0, MockStablecoin usdc) {
        uint256 deployerPrivateKey = vm.envUint("SETUP_DEPLOYER_PRIVATE_KEY");
        address owner = vm.envAddress("AGENTPAY_OWNER_ADDRESS");

        vm.startBroadcast(deployerPrivateKey);
        (usdt0, usdc) = deploy(owner);
        vm.stopBroadcast();
    }

    function deploy(address owner) public returns (MockStablecoin usdt0, MockStablecoin usdc) {
        usdt0 = new MockStablecoin("Mock USDT0", "USDT0", 6, owner);
        usdc = new MockStablecoin("Mock USDC", "USDC", 6, owner);

        emit MockStablecoinsDeployed(address(usdt0), address(usdc), owner);
    }
}
