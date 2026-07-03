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
    uint256 public constant BNB_CHAIN_ID = 56;
    uint256 public constant BNB_TESTNET_CHAIN_ID = 97;
    address public constant BNB_USDC = 0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d;
    address public constant BNB_USDT = 0x55d398326f99059fF775485246999027B3197955;
    address public constant BNB_TESTNET_USDC = 0xEC1C60D64a06896Df296438c12edD14E974FDE47;
    address public constant BNB_TESTNET_USDT = 0x337610d27c682E347C9cD60BD4b3b107C9d34dDd;

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
        account = deployForChain(owner, executor, initialRouteTargets, BNB_CHAIN_ID);
    }

    function deployForChain(address owner, address executor, address[] memory initialRouteTargets, uint256 chainId)
        public
        returns (AgentPayAccount account)
    {
        account = new AgentPayAccount(owner, executor, defaultAllowedTokensForChain(chainId), initialRouteTargets);
        emit AgentPayAccountDeployed(address(account), owner, executor);
    }

    function defaultAllowedTokens() public pure returns (address[] memory tokens) {
        return defaultAllowedTokensForChain(BNB_CHAIN_ID);
    }

    function defaultAllowedTokensForChain(uint256 chainId) public pure returns (address[] memory tokens) {
        tokens = new address[](2);
        if (chainId == BNB_CHAIN_ID) {
            tokens[0] = BNB_USDC;
            tokens[1] = BNB_USDT;
            return tokens;
        }
        if (chainId == BNB_TESTNET_CHAIN_ID) {
            tokens[0] = BNB_TESTNET_USDC;
            tokens[1] = BNB_TESTNET_USDT;
            return tokens;
        }
        revert UnsupportedDeployChain(chainId);
    }
}
