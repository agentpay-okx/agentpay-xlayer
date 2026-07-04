// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../src/AgentPayAccount.sol";

interface Vm {
    function envAddress(string calldata name) external returns (address);
    function envUint(string calldata name) external returns (uint256);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

contract DeployAgentPayAccount {
    address internal constant VM_ADDRESS = address(uint160(uint256(keccak256("hevm cheat code"))));
    uint256 public constant XLAYER_CHAIN_ID = 196;
    uint256 public constant XLAYER_TESTNET_CHAIN_ID = 1952;
    address public constant XLAYER_USDT0 = 0x779Ded0c9e1022225f8E0630b35a9b54bE713736;
    address public constant XLAYER_USDC = 0x74b7F16337b8972027F6196A17a631aC6dE26d22;

    Vm internal constant vm = Vm(VM_ADDRESS);

    event AgentPayAccountDeployed(address indexed account, address indexed owner, address indexed executor);
    error UnsupportedDeployChain(uint256 chainId);

    function run() external returns (AgentPayAccount account) {
        uint256 deployerPrivateKey = vm.envUint("SETUP_DEPLOYER_PRIVATE_KEY");
        address owner = vm.envAddress("AGENTPAY_OWNER_ADDRESS");
        address executor = vm.envAddress("AGENTPAY_EXECUTOR_ADDRESS");
        address[] memory initialRouteTargets = new address[](0);

        vm.startBroadcast(deployerPrivateKey);
        account = deployForChain(owner, executor, initialRouteTargets, block.chainid);
        vm.stopBroadcast();
    }

    function deploy(address owner, address executor, address[] memory initialRouteTargets)
        public
        returns (AgentPayAccount account)
    {
        account = deployForChain(owner, executor, initialRouteTargets, XLAYER_CHAIN_ID);
    }

    function deployForChain(address owner, address executor, address[] memory initialRouteTargets, uint256 chainId)
        public
        returns (AgentPayAccount account)
    {
        account = new AgentPayAccount(owner, executor, defaultAllowedTokensForChain(chainId), initialRouteTargets);
        emit AgentPayAccountDeployed(address(account), owner, executor);
    }

    function defaultAllowedTokens() public returns (address[] memory tokens) {
        return defaultAllowedTokensForChain(XLAYER_CHAIN_ID);
    }

    function defaultAllowedTokensForChain(uint256 chainId) public returns (address[] memory tokens) {
        tokens = new address[](2);
        if (chainId == XLAYER_CHAIN_ID) {
            tokens[0] = XLAYER_USDT0;
            tokens[1] = XLAYER_USDC;
            return tokens;
        }
        if (chainId == XLAYER_TESTNET_CHAIN_ID) {
            tokens[0] = vm.envAddress("AGENTPAY_XLAYER_TESTNET_USDT0_ADDRESS");
            tokens[1] = vm.envAddress("AGENTPAY_XLAYER_TESTNET_USDC_ADDRESS");
            return tokens;
        }
        revert UnsupportedDeployChain(chainId);
    }
}
