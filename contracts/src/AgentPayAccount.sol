// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract AgentPayAccount {
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

    error NotOwner();
    error NotExecutor();
    error Paused();
    error ZeroAddress();
    error InvalidAmount();
    error InvalidRecipient();
    error TokenNotAllowed(address token);
    error RouteTargetNotAllowed(address target);
    error NonceAlreadyUsed(uint256 nonce);
    error DeadlineExpired(uint256 deadline);
    error CalldataHashMismatch();
    error InsufficientTokenBalance(address token, uint256 required, uint256 available);
    error NativeFeeTooHigh(uint256 sent, uint256 maxAllowed);
    error ExternalCallFailed(bytes reason);

    event DirectPaymentExecuted(
        uint256 indexed nonce, address indexed token, address indexed recipient, uint256 amount
    );

    event RoutePaymentExecuted(
        uint256 indexed nonce,
        address indexed sourceToken,
        address indexed routeTarget,
        uint256 maxAmountIn,
        uint256 destinationChainId,
        address recipient,
        uint256 amountOut
    );

    event ContractCallExecuted(
        uint256 indexed nonce,
        address indexed target,
        address indexed token,
        uint256 maxTokenSpend,
        uint256 maxNativeFee
    );

    event NonceCancelled(uint256 indexed nonce);
    event ExecutorUpdated(address indexed oldExecutor, address indexed newExecutor);
    event TokenAllowedUpdated(address indexed token, bool allowed);
    event RouteTargetAllowedUpdated(address indexed target, bool allowed);
    event WithdrawnToken(address indexed token, address indexed to, uint256 amount);
    event WithdrawnNative(address indexed to, uint256 amount);
    event AccountPaused();
    event AccountUnpaused();

    address public owner;
    address public executor;
    bool public paused;

    mapping(uint256 => bool) public usedNonces;
    mapping(address => bool) public allowedTokens;
    mapping(address => bool) public allowedRouteTargets;

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyExecutor() {
        if (msg.sender != executor) revert NotExecutor();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert Paused();
        _;
    }

    constructor(
        address initialOwner,
        address initialExecutor,
        address[] memory initialAllowedTokens,
        address[] memory initialAllowedRouteTargets
    ) {
        if (initialOwner == address(0) || initialExecutor == address(0)) {
            revert ZeroAddress();
        }
        owner = initialOwner;
        executor = initialExecutor;

        for (uint256 index = 0; index < initialAllowedTokens.length; index++) {
            address token = initialAllowedTokens[index];
            if (token == address(0)) revert ZeroAddress();
            allowedTokens[token] = true;
            emit TokenAllowedUpdated(token, true);
        }

        for (uint256 index = 0; index < initialAllowedRouteTargets.length; index++) {
            address target = initialAllowedRouteTargets[index];
            if (target == address(0)) revert ZeroAddress();
            allowedRouteTargets[target] = true;
            emit RouteTargetAllowedUpdated(target, true);
        }
    }

    receive() external payable {}

    function setExecutor(address newExecutor) external onlyOwner {
        if (newExecutor == address(0)) revert ZeroAddress();
        address oldExecutor = executor;
        executor = newExecutor;
        emit ExecutorUpdated(oldExecutor, newExecutor);
    }

    function setAllowedToken(address token, bool allowed) external onlyOwner {
        if (token == address(0)) revert ZeroAddress();
        allowedTokens[token] = allowed;
        emit TokenAllowedUpdated(token, allowed);
    }

    function setAllowedRouteTarget(address target, bool allowed) external onlyOwner {
        if (target == address(0)) revert ZeroAddress();
        allowedRouteTargets[target] = allowed;
        emit RouteTargetAllowedUpdated(target, allowed);
    }

    function cancelNonce(uint256 nonce) external onlyOwner {
        if (usedNonces[nonce]) revert NonceAlreadyUsed(nonce);
        usedNonces[nonce] = true;
        emit NonceCancelled(nonce);
    }

    function pause() external onlyOwner {
        paused = true;
        emit AccountPaused();
    }

    function unpause() external onlyOwner {
        paused = false;
        emit AccountUnpaused();
    }

    function withdrawToken(address token, address to, uint256 amount) external onlyOwner {
        if (token == address(0) || to == address(0)) revert ZeroAddress();
        if (amount == 0) revert InvalidAmount();
        _safeTransfer(token, to, amount);
        emit WithdrawnToken(token, to, amount);
    }

    function withdrawNative(address payable to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert InvalidAmount();

        (bool success, bytes memory reason) = to.call{value: amount}("");
        if (!success) revert ExternalCallFailed(reason);

        emit WithdrawnNative(to, amount);
    }

    function executeDirectPayment(DirectPaymentIntent calldata intent) external onlyExecutor whenNotPaused {
        _validateCommon(intent.token, intent.recipient, intent.amount, intent.nonce, intent.deadline);
        _requireTokenBalance(intent.token, intent.amount);

        usedNonces[intent.nonce] = true;
        _safeTransfer(intent.token, intent.recipient, intent.amount);

        emit DirectPaymentExecuted(intent.nonce, intent.token, intent.recipient, intent.amount);
    }

    function executeRoutePayment(RoutePaymentIntent calldata intent, bytes calldata routeCalldata)
        external
        payable
        onlyExecutor
        whenNotPaused
    {
        _validateCommon(intent.sourceToken, intent.recipient, intent.maxAmountIn, intent.nonce, intent.deadline);
        if (intent.amountOut == 0) revert InvalidAmount();
        if (!allowedRouteTargets[intent.routeTarget]) revert RouteTargetNotAllowed(intent.routeTarget);
        if (msg.value > intent.maxNativeFee) revert NativeFeeTooHigh(msg.value, intent.maxNativeFee);
        if (keccak256(routeCalldata) != intent.routeCalldataHash) revert CalldataHashMismatch();
        _requireTokenBalance(intent.sourceToken, intent.maxAmountIn);

        usedNonces[intent.nonce] = true;
        _safeApprove(intent.sourceToken, intent.routeTarget, intent.maxAmountIn);

        (bool success, bytes memory reason) = intent.routeTarget.call{value: msg.value}(routeCalldata);
        if (!success) revert ExternalCallFailed(reason);

        _safeApprove(intent.sourceToken, intent.routeTarget, 0);

        emit RoutePaymentExecuted(
            intent.nonce,
            intent.sourceToken,
            intent.routeTarget,
            intent.maxAmountIn,
            intent.destinationChainId,
            intent.recipient,
            intent.amountOut
        );
    }

    function executeContractCall(ContractCallIntent calldata intent, bytes calldata callData)
        external
        payable
        onlyExecutor
        whenNotPaused
    {
        _validateCommon(intent.token, intent.target, intent.maxTokenSpend, intent.nonce, intent.deadline);
        if (!allowedRouteTargets[intent.target]) revert RouteTargetNotAllowed(intent.target);
        if (msg.value > intent.maxNativeFee) revert NativeFeeTooHigh(msg.value, intent.maxNativeFee);
        if (keccak256(callData) != intent.callDataHash) revert CalldataHashMismatch();
        _requireTokenBalance(intent.token, intent.maxTokenSpend);

        usedNonces[intent.nonce] = true;
        _safeApprove(intent.token, intent.target, intent.maxTokenSpend);

        (bool success, bytes memory reason) = intent.target.call{value: msg.value}(callData);
        if (!success) revert ExternalCallFailed(reason);

        _safeApprove(intent.token, intent.target, 0);

        emit ContractCallExecuted(intent.nonce, intent.target, intent.token, intent.maxTokenSpend, intent.maxNativeFee);
    }

    function _validateCommon(address token, address recipient, uint256 amount, uint256 nonce, uint256 deadline)
        private
        view
    {
        if (!allowedTokens[token]) revert TokenNotAllowed(token);
        if (recipient == address(0)) revert InvalidRecipient();
        if (amount == 0) revert InvalidAmount();
        if (usedNonces[nonce]) revert NonceAlreadyUsed(nonce);
        if (deadline < block.timestamp) revert DeadlineExpired(deadline);
    }

    function _requireTokenBalance(address token, uint256 required) private view {
        uint256 available = IERC20(token).balanceOf(address(this));
        if (available < required) revert InsufficientTokenBalance(token, required, available);
    }

    function _safeTransfer(address token, address to, uint256 amount) private {
        (bool success, bytes memory data) = token.call(abi.encodeCall(IERC20.transfer, (to, amount)));
        _requireOptionalReturn(success, data);
    }

    function _safeApprove(address token, address spender, uint256 amount) private {
        (bool success, bytes memory data) = token.call(abi.encodeCall(IERC20.approve, (spender, amount)));
        _requireOptionalReturn(success, data);
    }

    function _requireOptionalReturn(bool success, bytes memory data) private pure {
        if (!success || (data.length != 0 && !abi.decode(data, (bool)))) {
            revert ExternalCallFailed(data);
        }
    }
}

interface IERC20 {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
}
