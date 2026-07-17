// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AgentPayMainnetAccountFactoryV1} from "../src/AgentPayMainnetAccountFactoryV1.sol";

interface VmMainnetFactoryDeploy {
    function envAddress(string calldata name) external returns (address);
    function envUint(string calldata name) external returns (uint256);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

contract DeployAgentPayMainnetAccountFactoryV1 {
    error UnsupportedDeployChain(uint256 chainId);

    event AgentPayMainnetAccountFactoryV1Deployed(
        address indexed factory,
        address indexed executor,
        address indexed usdt0,
        bytes32 policyVersion,
        bytes32 factoryRuntimeHash,
        bytes32 accountCreationCodeHash
    );

    address internal constant VM_ADDRESS = address(uint160(uint256(keccak256("hevm cheat code"))));
    uint256 public constant XLAYER_CHAIN_ID = 196;

    VmMainnetFactoryDeploy internal constant vm = VmMainnetFactoryDeploy(VM_ADDRESS);

    function run() external returns (AgentPayMainnetAccountFactoryV1 factory) {
        _requireMainnet();
        uint256 deployerPrivateKey = vm.envUint("SETUP_DEPLOYER_PRIVATE_KEY");
        address executor = vm.envAddress("AGENTPAY_EXECUTOR_ADDRESS");

        vm.startBroadcast(deployerPrivateKey);
        factory = deploy(executor);
        vm.stopBroadcast();
    }

    function deploy(address executor) public returns (AgentPayMainnetAccountFactoryV1 factory) {
        _requireMainnet();
        factory = new AgentPayMainnetAccountFactoryV1(executor);
        emit AgentPayMainnetAccountFactoryV1Deployed(
            address(factory),
            factory.executor(),
            factory.USDT0(),
            factory.POLICY_VERSION(),
            address(factory).codehash,
            factory.accountCreationCodeHash()
        );
    }

    function _requireMainnet() private view {
        if (block.chainid != XLAYER_CHAIN_ID) revert UnsupportedDeployChain(block.chainid);
    }
}
