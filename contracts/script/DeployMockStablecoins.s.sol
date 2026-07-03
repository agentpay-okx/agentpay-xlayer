// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../src/AgentPayAccount.sol";
import "../src/MockStablecoin.sol";

interface MockStablecoinVm {
    function envAddress(string calldata name) external returns (address);
    function envUint(string calldata name) external returns (uint256);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

contract DeployMockStablecoins {
    address internal constant VM_ADDRESS = address(uint160(uint256(keccak256("hevm cheat code"))));
    uint256 public constant MOCK_USDC_MINT_AMOUNT = 1_000 * 1e6;
    uint256 public constant MOCK_USDT_MINT_AMOUNT = 1_000 * 1e18;

    MockStablecoinVm internal constant vm = MockStablecoinVm(VM_ADDRESS);

    event MockStablecoinsDeployed(address indexed usdc, address indexed usdt, address indexed recipient);

    function run() external returns (MockStablecoin usdc, MockStablecoin usdt) {
        uint256 deployerPrivateKey = vm.envUint("SETUP_DEPLOYER_PRIVATE_KEY");
        address owner = vm.envAddress("AGENTPAY_OWNER_ADDRESS");
        address account = vm.envAddress("AGENTPAY_ACCOUNT_ADDRESS");

        vm.startBroadcast(deployerPrivateKey);
        (usdc, usdt) = deploy(owner, account);
        vm.stopBroadcast();
    }

    function deploy(address owner, address account) public returns (MockStablecoin usdc, MockStablecoin usdt) {
        usdc = new MockStablecoin("Mock USDC", "USDC", 6, owner);
        usdt = new MockStablecoin("Mock USDT", "USDT", 18, owner);

        usdc.mint(account, MOCK_USDC_MINT_AMOUNT);
        usdt.mint(account, MOCK_USDT_MINT_AMOUNT);

        AgentPayAccount(payable(account)).setAllowedToken(address(usdc), true);
        AgentPayAccount(payable(account)).setAllowedToken(address(usdt), true);

        emit MockStablecoinsDeployed(address(usdc), address(usdt), account);
    }
}
