// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IAgentPayAccount {
    struct DirectPaymentIntent {
        address token;
        address recipient;
        uint256 amount;
        uint256 nonce;
        uint256 deadline;
    }

    struct RoutePaymentIntent {
        address sourceToken;
        uint256 maxAmountIn;
        uint256 destinationChainId;
        address recipient;
        uint256 amountOut;
        address routeTarget;
        bytes32 routeCalldataHash;
        uint256 maxNativeFee;
        uint256 nonce;
        uint256 deadline;
    }

    struct ContractCallIntent {
        address target;
        address token;
        uint256 maxTokenSpend;
        bytes32 callDataHash;
        uint256 maxNativeFee;
        uint256 nonce;
        uint256 deadline;
    }

    function executeDirectPayment(DirectPaymentIntent calldata intent) external;
    function executeRoutePayment(RoutePaymentIntent calldata intent, bytes calldata routeCalldata) external payable;
    function executeContractCall(ContractCallIntent calldata intent, bytes calldata callData) external payable;
}
