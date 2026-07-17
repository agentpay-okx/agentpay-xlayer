// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {DeployAgentPayMainnetAccountFactoryV1} from "../script/DeployAgentPayMainnetAccountFactoryV1.s.sol";
import {AgentPayAccountV2} from "../src/AgentPayAccountV2.sol";
import {AgentPayMainnetAccountFactoryV1} from "../src/AgentPayMainnetAccountFactoryV1.sol";

interface VmMainnetFactory {
    function addr(uint256 privateKey) external returns (address);
    function assume(bool condition) external;
    function chainId(uint256 newChainId) external;
    function deal(address account, uint256 balance) external;
    function etch(address target, bytes calldata newRuntimeBytecode) external;
    function expectEmit(bool checkTopic1, bool checkTopic2, bool checkTopic3, bool checkData) external;
    function expectRevert() external;
    function expectRevert(bytes calldata revertData) external;
    function prank(address sender) external;
    function sign(uint256 privateKey, bytes32 digest) external returns (uint8 v, bytes32 r, bytes32 s);
    function warp(uint256 newTimestamp) external;
}

contract FactoryOwnerContractStub {}

contract ConstructorSignatureOwner {
    constructor(
        AgentPayMainnetAccountFactoryV1 factory,
        AgentPayMainnetAccountFactoryV1.MainnetWalletSetup memory authorization,
        bytes memory ownerSignature
    ) {
        factory.deployAccount(authorization, ownerSignature);
    }
}

contract ConstructorSignatureAttackDeployer {
    function predictedFirstChild() external view returns (address) {
        return address(uint160(uint256(keccak256(abi.encodePacked(hex"d694", address(this), hex"01")))));
    }

    function attack(
        AgentPayMainnetAccountFactoryV1 factory,
        AgentPayMainnetAccountFactoryV1.MainnetWalletSetup memory authorization,
        bytes memory ownerSignature
    ) external returns (bool succeeded) {
        try new ConstructorSignatureOwner(factory, authorization, ownerSignature) returns (ConstructorSignatureOwner) {
            return true;
        } catch {
            return false;
        }
    }
}

contract AgentPayMainnetAccountFactoryV1Test {
    uint256 private constant XLAYER_CHAIN_ID = 196;
    address private constant USDT0 = 0x779Ded0c9e1022225f8E0630b35a9b54bE713736;
    bytes32 private constant POLICY_VERSION = keccak256("agentpay-mainnet-account-v1");
    bytes32 private constant TOKEN_ALLOWLIST_HASH = 0xc0687130b337dbc04821b9bd064027dd46ef43a11adc8c2d98fccd719152b4a5;
    bytes32 private constant ROUTE_ALLOWLIST_HASH = 0x569e75fc77c1a856f6daaf9e69d8a9566ca34aa47f9133711ce065a571af0cfd;
    bytes32 private constant EIP712_DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant MAINNET_WALLET_SETUP_TYPEHASH = keccak256(
        "MainnetWalletSetup(string setupIntentId,bytes32 deploymentNonce,address owner,address executor,uint256 homeChainId,string environment,uint256 deadline,address factory,bytes32 factoryRuntimeCodeHash,bytes32 deploymentSalt,address predictedAccount,bytes32 accountCreationCodeHash,bytes32 accountRuntimeCodeHash,address token,bytes32 tokenAllowlistHash,bytes32 routeAllowlistHash,bytes32 manifestSha256)"
    );
    address private constant VM_ADDRESS = address(uint160(uint256(keccak256("hevm cheat code"))));
    uint256 private constant OWNER_PRIVATE_KEY = 0xA11CE;
    uint256 private constant OTHER_PRIVATE_KEY = 0xB0B;
    uint256 private constant SECP256K1_N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141;

    VmMainnetFactory private constant vm = VmMainnetFactory(VM_ADDRESS);

    event AccountDeployed(
        address indexed owner, address indexed account, bytes32 indexed salt, bytes32 authorizationHash
    );
    event AccountReused(address indexed owner, address indexed account, bytes32 indexed authorizationHash);

    address private executor = address(0xEEC);
    address private owner;
    AgentPayMainnetAccountFactoryV1 private factory;
    AgentPayAccountV2 private referenceAccount;

    function setUp() public {
        vm.chainId(XLAYER_CHAIN_ID);
        vm.warp(1_900_000_000);
        owner = vm.addr(OWNER_PRIVATE_KEY);
        factory = new AgentPayMainnetAccountFactoryV1(executor);
        referenceAccount = _newReferenceAccount(owner);
    }

    function testConstructorPinsMainnetExecutorAndPolicyConstants() public view {
        assertEq(factory.XLAYER_CHAIN_ID(), XLAYER_CHAIN_ID);
        assertEq(factory.USDT0(), USDT0);
        assertEq(factory.POLICY_VERSION(), POLICY_VERSION);
        assertEq(factory.TOKEN_ALLOWLIST_HASH(), TOKEN_ALLOWLIST_HASH);
        assertEq(factory.ROUTE_ALLOWLIST_HASH(), ROUTE_ALLOWLIST_HASH);
        assertEq(factory.executor(), executor);
    }

    function testConstructorRejectsWrongChain() public {
        vm.chainId(1);
        vm.expectRevert(abi.encodeWithSelector(AgentPayMainnetAccountFactoryV1.UnsupportedChain.selector, 1));
        new AgentPayMainnetAccountFactoryV1(executor);
    }

    function testConstructorRejectsZeroExecutor() public {
        vm.expectRevert(abi.encodeWithSelector(AgentPayMainnetAccountFactoryV1.ZeroExecutor.selector));
        new AgentPayMainnetAccountFactoryV1(address(0));
    }

    function testDomainAndAuthorizationHashMatchCanonicalEip712Encoding() public view {
        AgentPayMainnetAccountFactoryV1.MainnetWalletSetup memory authorization = _validAuthorization();
        bytes32 expectedDomain = keccak256(
            abi.encode(
                EIP712_DOMAIN_TYPEHASH, keccak256("AgentPay Setup"), keccak256("1"), XLAYER_CHAIN_ID, address(factory)
            )
        );
        bytes32 expectedDigest =
            keccak256(abi.encodePacked("\x19\x01", expectedDomain, _manualStructHash(authorization)));

        assertEq(factory.domainSeparator(), expectedDomain);
        assertEq(factory.hashSetupAuthorization(authorization), expectedDigest);
    }

    function testPredictionMatchesSignedDeploymentAndAccountPolicy() public {
        AgentPayMainnetAccountFactoryV1.MainnetWalletSetup memory authorization = _validAuthorization();
        bytes memory signature = _sign(authorization, OWNER_PRIVATE_KEY);
        bytes32 authorizationHash = factory.hashSetupAuthorization(authorization);

        vm.expectEmit(true, true, true, true);
        emit AccountDeployed(owner, authorization.predictedAccount, authorization.deploymentSalt, authorizationHash);
        address deployed = factory.deployAccount(authorization, signature);

        assertEq(deployed, authorization.predictedAccount);
        assertEq(deployed.codehash, authorization.accountRuntimeCodeHash);

        AgentPayAccountV2 account = AgentPayAccountV2(payable(deployed));
        assertEq(account.owner(), owner);
        assertEq(account.executor(), executor);
        assertTrue(account.allowedTokens(USDT0));
        assertFalse(account.allowedTokens(address(0xBEEF)));
        assertFalse(account.allowedRouteTargets(address(0xCAFE)));
        assertFalse(account.paused());

        bytes32 expectedAccountDomain = keccak256(
            abi.encode(
                EIP712_DOMAIN_TYPEHASH, keccak256(bytes("AgentPay")), keccak256(bytes("1")), XLAYER_CHAIN_ID, deployed
            )
        );
        assertEq(account.domainSeparator(), expectedAccountDomain);
    }

    function testValidSignatureIsReplaySafeAndIdempotentlyReusesSameAccount() public {
        AgentPayMainnetAccountFactoryV1.MainnetWalletSetup memory authorization = _validAuthorization();
        bytes memory signature = _sign(authorization, OWNER_PRIVATE_KEY);
        address first = factory.deployAccount(authorization, signature);
        bytes32 firstCodeHash = first.codehash;
        uint256 firstCodeSize = first.code.length;
        bytes32 authorizationHash = factory.hashSetupAuthorization(authorization);

        vm.expectEmit(true, true, true, true);
        emit AccountReused(owner, first, authorizationHash);
        address second = factory.deployAccount(authorization, signature);

        assertEq(second, first);
        assertEq(second.codehash, firstCodeHash);
        assertEq(second.code.length, firstCodeSize);
    }

    function testConstructorContractCannotBypassEoaCheckWithoutOwningSignature() public {
        ConstructorSignatureAttackDeployer attacker = new ConstructorSignatureAttackDeployer();
        address constructorOwner = attacker.predictedFirstChild();
        AgentPayAccountV2 constructorOwnerReference = _newReferenceAccount(constructorOwner);
        AgentPayMainnetAccountFactoryV1.MainnetWalletSetup memory authorization =
            _validAuthorizationFor(factory, constructorOwner, address(constructorOwnerReference).codehash);
        bytes memory attackerSignature = _sign(authorization, OTHER_PRIVATE_KEY);

        bool succeeded = attacker.attack(factory, authorization, attackerSignature);

        assertFalse(succeeded);
        assertEq(authorization.predictedAccount.code.length, 0);
    }

    function testWrongSignerCannotDeploy() public {
        AgentPayMainnetAccountFactoryV1.MainnetWalletSetup memory authorization = _validAuthorization();
        bytes memory wrongSignature = _sign(authorization, OTHER_PRIVATE_KEY);

        vm.expectRevert(abi.encodeWithSelector(AgentPayMainnetAccountFactoryV1.InvalidOwnerSignature.selector));
        factory.deployAccount(authorization, wrongSignature);
        assertEq(authorization.predictedAccount.code.length, 0);
    }

    function testRejectsMalformedSignatureLength() public {
        AgentPayMainnetAccountFactoryV1.MainnetWalletSetup memory authorization = _validAuthorization();
        bytes memory malformed = new bytes(64);

        vm.expectRevert(
            abi.encodeWithSelector(AgentPayMainnetAccountFactoryV1.InvalidSignatureLength.selector, malformed.length)
        );
        factory.deployAccount(authorization, malformed);
    }

    function testRejectsInvalidSignatureV() public {
        AgentPayMainnetAccountFactoryV1.MainnetWalletSetup memory authorization = _validAuthorization();
        (, bytes32 r, bytes32 s) = vm.sign(OWNER_PRIVATE_KEY, factory.hashSetupAuthorization(authorization));
        bytes memory invalidV = abi.encodePacked(r, s, uint8(29));

        vm.expectRevert(abi.encodeWithSelector(AgentPayMainnetAccountFactoryV1.InvalidSignatureV.selector, 29));
        factory.deployAccount(authorization, invalidV);
    }

    function testRejectsHighSSignature() public {
        AgentPayMainnetAccountFactoryV1.MainnetWalletSetup memory authorization = _validAuthorization();
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(OWNER_PRIVATE_KEY, factory.hashSetupAuthorization(authorization));
        bytes32 highS = bytes32(SECP256K1_N - uint256(s));
        uint8 flippedV = v == 27 ? 28 : 27;
        bytes memory malleable = abi.encodePacked(r, highS, flippedV);

        vm.expectRevert(abi.encodeWithSelector(AgentPayMainnetAccountFactoryV1.InvalidSignatureS.selector));
        factory.deployAccount(authorization, malleable);
    }

    function testRejectsZeroAddressRecovery() public {
        AgentPayMainnetAccountFactoryV1.MainnetWalletSetup memory authorization = _validAuthorization();
        bytes memory zeroRecovery = abi.encodePacked(bytes32(0), bytes32(uint256(1)), uint8(27));

        vm.expectRevert(abi.encodeWithSelector(AgentPayMainnetAccountFactoryV1.InvalidOwnerSignature.selector));
        factory.deployAccount(authorization, zeroRecovery);
    }

    function testRejectsExpiredAuthorizationAtBoundary() public {
        AgentPayMainnetAccountFactoryV1.MainnetWalletSetup memory authorization = _validAuthorization();
        authorization.deadline = block.timestamp;
        bytes memory signature = _sign(authorization, OWNER_PRIVATE_KEY);

        vm.expectRevert(
            abi.encodeWithSelector(AgentPayMainnetAccountFactoryV1.AuthorizationExpired.selector, block.timestamp)
        );
        factory.deployAccount(authorization, signature);
    }

    function testOriginalSignatureRejectsMutationOfEveryAuthorizationField() public {
        AgentPayMainnetAccountFactoryV1.MainnetWalletSetup memory original = _validAuthorization();
        bytes memory signature = _sign(original, OWNER_PRIVATE_KEY);

        for (uint256 index = 0; index < 17; index++) {
            AgentPayMainnetAccountFactoryV1.MainnetWalletSetup memory mutated =
                _mutateAuthorization(_validAuthorization(), index);
            (bool success,) = address(factory).call(abi.encodeCall(factory.deployAccount, (mutated, signature)));
            assertFalse(success);
        }

        assertEq(original.predictedAccount.code.length, 0);
    }

    function testSignedPolicyMutationsAreRejectedIndependentlyOfSignatureValidity() public {
        AgentPayMainnetAccountFactoryV1.MainnetWalletSetup memory original = _validAuthorization();

        for (uint256 index = 0; index < 13; index++) {
            AgentPayMainnetAccountFactoryV1.MainnetWalletSetup memory mutated =
                _mutateEnforcedPolicy(_validAuthorization(), index);
            bytes memory signature = _signForFactory(mutated, factory, OWNER_PRIVATE_KEY);
            (bool success,) = address(factory).call(abi.encodeCall(factory.deployAccount, (mutated, signature)));
            assertFalse(success);
        }

        assertEq(original.predictedAccount.code.length, 0);
    }

    function testSignatureFromWrongDomainCannotDeploy() public {
        AgentPayMainnetAccountFactoryV1 otherFactory = new AgentPayMainnetAccountFactoryV1(executor);
        AgentPayMainnetAccountFactoryV1.MainnetWalletSetup memory authorization =
            _validAuthorizationFor(otherFactory, owner, address(referenceAccount).codehash);
        bytes32 wrongDomainDigest =
            keccak256(abi.encodePacked("\x19\x01", factory.domainSeparator(), _manualStructHash(authorization)));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(OWNER_PRIVATE_KEY, wrongDomainDigest);

        vm.expectRevert(abi.encodeWithSelector(AgentPayMainnetAccountFactoryV1.InvalidOwnerSignature.selector));
        otherFactory.deployAccount(authorization, abi.encodePacked(r, s, v));
    }

    function testSignedWrongAccountRuntimeHashRollsBackNewDeployment() public {
        AgentPayMainnetAccountFactoryV1.MainnetWalletSetup memory authorization = _validAuthorization();
        authorization.accountRuntimeCodeHash = bytes32(uint256(1));
        bytes memory signature = _sign(authorization, OWNER_PRIVATE_KEY);

        vm.expectRevert(abi.encodeWithSelector(AgentPayMainnetAccountFactoryV1.AccountRuntimeCodeHashMismatch.selector));
        factory.deployAccount(authorization, signature);
        assertEq(authorization.predictedAccount.code.length, 0);
    }

    function testReuseRejectsExecutorDrift() public {
        (AgentPayMainnetAccountFactoryV1.MainnetWalletSetup memory authorization, bytes memory signature) =
            _deployValidAccount();
        AgentPayAccountV2 account = AgentPayAccountV2(payable(authorization.predictedAccount));
        vm.prank(owner);
        account.setExecutor(address(0xD00D));

        vm.expectRevert(abi.encodeWithSelector(AgentPayMainnetAccountFactoryV1.ReusedAccountPolicyMismatch.selector));
        factory.deployAccount(authorization, signature);
    }

    function testReuseRejectsOwnerDrift() public {
        AgentPayMainnetAccountFactoryV1.MainnetWalletSetup memory authorization = _validAuthorization();
        AgentPayAccountV2 differentOwnerAccount = _newReferenceAccount(vm.addr(OTHER_PRIVATE_KEY));
        bytes memory differentOwnerRuntime = address(differentOwnerAccount).code;
        vm.etch(authorization.predictedAccount, differentOwnerRuntime);
        authorization.accountRuntimeCodeHash = keccak256(differentOwnerRuntime);
        bytes memory signature = _sign(authorization, OWNER_PRIVATE_KEY);

        vm.expectRevert(abi.encodeWithSelector(AgentPayMainnetAccountFactoryV1.ReusedAccountPolicyMismatch.selector));
        factory.deployAccount(authorization, signature);
    }

    function testReuseRejectsPausedAccount() public {
        (AgentPayMainnetAccountFactoryV1.MainnetWalletSetup memory authorization, bytes memory signature) =
            _deployValidAccount();
        AgentPayAccountV2 account = AgentPayAccountV2(payable(authorization.predictedAccount));
        vm.prank(owner);
        account.pause();

        vm.expectRevert(abi.encodeWithSelector(AgentPayMainnetAccountFactoryV1.ReusedAccountPolicyMismatch.selector));
        factory.deployAccount(authorization, signature);
    }

    function testReuseRejectsUsdt0AllowlistDrift() public {
        (AgentPayMainnetAccountFactoryV1.MainnetWalletSetup memory authorization, bytes memory signature) =
            _deployValidAccount();
        AgentPayAccountV2 account = AgentPayAccountV2(payable(authorization.predictedAccount));
        vm.prank(owner);
        account.setAllowedToken(USDT0, false);

        vm.expectRevert(abi.encodeWithSelector(AgentPayMainnetAccountFactoryV1.ReusedAccountPolicyMismatch.selector));
        factory.deployAccount(authorization, signature);
    }

    function testReuseRejectsSignedRuntimeHashMismatch() public {
        (AgentPayMainnetAccountFactoryV1.MainnetWalletSetup memory authorization,) = _deployValidAccount();
        authorization.accountRuntimeCodeHash = bytes32(uint256(1));
        bytes memory signature = _sign(authorization, OWNER_PRIVATE_KEY);

        vm.expectRevert(abi.encodeWithSelector(AgentPayMainnetAccountFactoryV1.AccountRuntimeCodeHashMismatch.selector));
        factory.deployAccount(authorization, signature);
    }

    function testReuseRejectsUnreadableAccountCodeWithCustomPolicyError() public {
        AgentPayMainnetAccountFactoryV1.MainnetWalletSetup memory authorization = _validAuthorization();
        bytes memory unreadableRuntime = hex"00";
        vm.etch(authorization.predictedAccount, unreadableRuntime);
        authorization.accountRuntimeCodeHash = keccak256(unreadableRuntime);
        bytes memory signature = _sign(authorization, OWNER_PRIVATE_KEY);

        vm.expectRevert(abi.encodeWithSelector(AgentPayMainnetAccountFactoryV1.ReusedAccountPolicyMismatch.selector));
        factory.deployAccount(authorization, signature);
    }

    function testReuseEventDoesNotClaimExhaustivePolicyAfterExtraAllowlistEntries() public {
        (AgentPayMainnetAccountFactoryV1.MainnetWalletSetup memory authorization, bytes memory signature) =
            _deployValidAccount();
        AgentPayAccountV2 account = AgentPayAccountV2(payable(authorization.predictedAccount));
        vm.prank(owner);
        account.setAllowedToken(address(0xBEEF), true);
        vm.prank(owner);
        account.setAllowedRouteTarget(address(0xCAFE), true);
        bytes32 authorizationHash = factory.hashSetupAuthorization(authorization);

        vm.expectEmit(true, true, true, true);
        emit AccountReused(owner, address(account), authorizationHash);
        assertEq(factory.deployAccount(authorization, signature), address(account));
    }

    function testDeploymentRejectsNativeValue() public {
        AgentPayMainnetAccountFactoryV1.MainnetWalletSetup memory authorization = _validAuthorization();
        bytes memory signature = _sign(authorization, OWNER_PRIVATE_KEY);
        vm.deal(address(this), 1 wei);
        (bool success,) =
            address(factory).call{value: 1 wei}(abi.encodeCall(factory.deployAccount, (authorization, signature)));

        assertFalse(success);
        assertEq(address(factory).balance, 0);
        assertEq(authorization.predictedAccount.code.length, 0);
    }

    function testEveryPredictionBoundaryRejectsZeroOwner() public {
        _expectEveryPredictionSurfaceToRevert(
            address(0), abi.encodeWithSelector(AgentPayMainnetAccountFactoryV1.ZeroOwner.selector)
        );
    }

    function testEveryPredictionBoundaryRejectsContractOwner() public {
        FactoryOwnerContractStub ownerContract = new FactoryOwnerContractStub();
        _expectEveryPredictionSurfaceToRevert(
            address(ownerContract),
            abi.encodeWithSelector(AgentPayMainnetAccountFactoryV1.OwnerMustBeEOA.selector, address(ownerContract))
        );
    }

    function testEveryPredictionBoundaryRejectsExecutorAsOwner() public {
        _expectEveryPredictionSurfaceToRevert(
            executor, abi.encodeWithSelector(AgentPayMainnetAccountFactoryV1.OwnerCannotBeExecutor.selector)
        );
    }

    function testEveryPredictionBoundaryRejectsFactoryAsOwner() public {
        _expectEveryPredictionSurfaceToRevert(
            address(factory), abi.encodeWithSelector(AgentPayMainnetAccountFactoryV1.OwnerCannotBeFactory.selector)
        );
    }

    function testSaltUsesAbiEncodingAndDiffersByOwner() public view {
        address otherOwner = address(0xB0B);
        bytes32 ownerSalt = factory.deploymentSalt(owner);
        bytes32 otherOwnerSalt = factory.deploymentSalt(otherOwner);

        assertEq(ownerSalt, keccak256(abi.encode(POLICY_VERSION, owner)));
        assertEq(otherOwnerSalt, keccak256(abi.encode(POLICY_VERSION, otherOwner)));
        assertTrue(ownerSalt != otherOwnerSalt);
    }

    function testCreationInitAndAllowlistHashesUseExactPolicyPayload() public view {
        bytes32 expectedCreationCodeHash = keccak256(type(AgentPayAccountV2).creationCode);
        address[] memory tokens = new address[](1);
        tokens[0] = USDT0;
        address[] memory routes = new address[](0);
        bytes32 expectedInitCodeHash = keccak256(
            abi.encodePacked(type(AgentPayAccountV2).creationCode, abi.encode(owner, executor, tokens, routes))
        );

        assertEq(factory.accountCreationCodeHash(), expectedCreationCodeHash);
        assertEq(factory.accountInitCodeHash(owner), expectedInitCodeHash);
        assertEq(factory.TOKEN_ALLOWLIST_HASH(), keccak256(abi.encode(tokens)));
        assertEq(factory.ROUTE_ALLOWLIST_HASH(), keccak256(abi.encode(routes)));
    }

    function testFactoryAndAccountRuntimeCodeStayUnderEip170Limit() public {
        (AgentPayMainnetAccountFactoryV1.MainnetWalletSetup memory authorization,) = _deployValidAccount();

        assertTrue(address(factory).code.length < 24_576);
        assertTrue(authorization.predictedAccount.code.length < 24_576);
    }

    function testFactoryHasNoUnsignedOwnerAdminUpgradeArbitraryCallOrWithdrawSelectors() public {
        _assertUnknownSelectorReverts(abi.encodeWithSignature("deployAccount(address)", owner));
        _assertUnknownSelectorReverts(abi.encodeWithSignature("owner()"));
        _assertUnknownSelectorReverts(abi.encodeWithSignature("admin()"));
        _assertUnknownSelectorReverts(abi.encodeWithSignature("upgradeTo(address)", address(0xBEEF)));
        _assertUnknownSelectorReverts(
            abi.encodeWithSignature("arbitraryCall(address,uint256,bytes)", address(0xBEEF), 0, bytes(""))
        );
        _assertUnknownSelectorReverts(abi.encodeWithSignature("withdraw(address,uint256)", owner, 1));
    }

    function testDeployScriptTestablePathDeploysPinnedFactory() public {
        DeployAgentPayMainnetAccountFactoryV1 deployer = new DeployAgentPayMainnetAccountFactoryV1();
        AgentPayMainnetAccountFactoryV1 deployedFactory = deployer.deploy(executor);

        assertEq(deployedFactory.executor(), executor);
        assertEq(deployedFactory.USDT0(), USDT0);
        assertEq(deployedFactory.POLICY_VERSION(), POLICY_VERSION);
        assertEq(deployedFactory.accountCreationCodeHash(), keccak256(type(AgentPayAccountV2).creationCode));
        assertEq(address(deployedFactory).codehash, keccak256(address(deployedFactory).code));
    }

    function testDeployScriptRejectsWrongChainBeforeDeployment() public {
        DeployAgentPayMainnetAccountFactoryV1 deployer = new DeployAgentPayMainnetAccountFactoryV1();
        vm.chainId(1);

        vm.expectRevert(
            abi.encodeWithSelector(DeployAgentPayMainnetAccountFactoryV1.UnsupportedDeployChain.selector, 1)
        );
        deployer.deploy(executor);
    }

    function testFuzzPredictionMatchesCreate2FormulaAndSignedDeployment(uint256 fuzzPrivateKey) public {
        uint256 privateKey = (fuzzPrivateKey % (SECP256K1_N - 1)) + 1;
        address fuzzOwner = vm.addr(privateKey);
        _assumeValidOwner(fuzzOwner);
        AgentPayAccountV2 fuzzReference = _newReferenceAccount(fuzzOwner);

        bytes32 salt = keccak256(abi.encode(POLICY_VERSION, fuzzOwner));
        bytes32 initCodeHash = factory.accountInitCodeHash(fuzzOwner);
        address expected =
            address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(factory), salt, initCodeHash)))));
        AgentPayMainnetAccountFactoryV1.MainnetWalletSetup memory authorization =
            _validAuthorizationFor(factory, fuzzOwner, address(fuzzReference).codehash);

        assertEq(factory.deploymentSalt(fuzzOwner), salt);
        assertEq(factory.predictAccount(fuzzOwner), expected);
        assertEq(factory.deployAccount(authorization, _sign(authorization, privateKey)), expected);
    }

    function _validAuthorization() private view returns (AgentPayMainnetAccountFactoryV1.MainnetWalletSetup memory) {
        return _validAuthorizationFor(factory, owner, address(referenceAccount).codehash);
    }

    function _validAuthorizationFor(
        AgentPayMainnetAccountFactoryV1 targetFactory,
        address targetOwner,
        bytes32 accountRuntimeCodeHash
    ) private view returns (AgentPayMainnetAccountFactoryV1.MainnetWalletSetup memory authorization) {
        authorization = AgentPayMainnetAccountFactoryV1.MainnetWalletSetup({
            setupIntentId: "setup-intent-0000000001",
            deploymentNonce: keccak256("deployment-nonce-0001"),
            owner: targetOwner,
            executor: executor,
            homeChainId: XLAYER_CHAIN_ID,
            environment: "production",
            deadline: block.timestamp + 1 hours,
            factory: address(targetFactory),
            factoryRuntimeCodeHash: address(targetFactory).codehash,
            deploymentSalt: targetFactory.deploymentSalt(targetOwner),
            predictedAccount: targetFactory.predictAccount(targetOwner),
            accountCreationCodeHash: targetFactory.accountCreationCodeHash(),
            accountRuntimeCodeHash: accountRuntimeCodeHash,
            token: USDT0,
            tokenAllowlistHash: TOKEN_ALLOWLIST_HASH,
            routeAllowlistHash: ROUTE_ALLOWLIST_HASH,
            manifestSha256: sha256("mainnet-activation-manifest")
        });
    }

    function _deployValidAccount()
        private
        returns (AgentPayMainnetAccountFactoryV1.MainnetWalletSetup memory authorization, bytes memory signature)
    {
        authorization = _validAuthorization();
        signature = _sign(authorization, OWNER_PRIVATE_KEY);
        factory.deployAccount(authorization, signature);
    }

    function _newReferenceAccount(address accountOwner) private returns (AgentPayAccountV2 account) {
        address[] memory tokens = new address[](1);
        tokens[0] = USDT0;
        address[] memory routes = new address[](0);
        account = new AgentPayAccountV2(accountOwner, executor, tokens, routes);
    }

    function _sign(AgentPayMainnetAccountFactoryV1.MainnetWalletSetup memory authorization, uint256 privateKey)
        private
        returns (bytes memory)
    {
        return _signForFactory(authorization, factoryFor(authorization), privateKey);
    }

    function _signForFactory(
        AgentPayMainnetAccountFactoryV1.MainnetWalletSetup memory authorization,
        AgentPayMainnetAccountFactoryV1 signingFactory,
        uint256 privateKey
    ) private returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, signingFactory.hashSetupAuthorization(authorization));
        return abi.encodePacked(r, s, v);
    }

    function factoryFor(AgentPayMainnetAccountFactoryV1.MainnetWalletSetup memory authorization)
        private
        pure
        returns (AgentPayMainnetAccountFactoryV1)
    {
        return AgentPayMainnetAccountFactoryV1(authorization.factory);
    }

    function _manualStructHash(AgentPayMainnetAccountFactoryV1.MainnetWalletSetup memory authorization)
        private
        pure
        returns (bytes32)
    {
        bytes32[18] memory words;
        words[0] = MAINNET_WALLET_SETUP_TYPEHASH;
        words[1] = keccak256(bytes(authorization.setupIntentId));
        words[2] = authorization.deploymentNonce;
        words[3] = bytes32(uint256(uint160(authorization.owner)));
        words[4] = bytes32(uint256(uint160(authorization.executor)));
        words[5] = bytes32(authorization.homeChainId);
        words[6] = keccak256(bytes(authorization.environment));
        words[7] = bytes32(authorization.deadline);
        words[8] = bytes32(uint256(uint160(authorization.factory)));
        words[9] = authorization.factoryRuntimeCodeHash;
        words[10] = authorization.deploymentSalt;
        words[11] = bytes32(uint256(uint160(authorization.predictedAccount)));
        words[12] = authorization.accountCreationCodeHash;
        words[13] = authorization.accountRuntimeCodeHash;
        words[14] = bytes32(uint256(uint160(authorization.token)));
        words[15] = authorization.tokenAllowlistHash;
        words[16] = authorization.routeAllowlistHash;
        words[17] = authorization.manifestSha256;
        return keccak256(abi.encode(words));
    }

    function _mutateAuthorization(AgentPayMainnetAccountFactoryV1.MainnetWalletSetup memory original, uint256 index)
        private
        pure
        returns (AgentPayMainnetAccountFactoryV1.MainnetWalletSetup memory mutated)
    {
        mutated = original;
        if (index == 0) mutated.setupIntentId = "setup-intent-0000000002";
        else if (index == 1) mutated.deploymentNonce = bytes32(uint256(original.deploymentNonce) ^ 1);
        else if (index == 2) mutated.owner = address(0xB0B);
        else if (index == 3) mutated.executor = address(0xD00D);
        else if (index == 4) mutated.homeChainId = 1952;
        else if (index == 5) mutated.environment = "staging";
        else if (index == 6) mutated.deadline = original.deadline + 1;
        else if (index == 7) mutated.factory = address(0xBEEF);
        else if (index == 8) mutated.factoryRuntimeCodeHash = bytes32(uint256(original.factoryRuntimeCodeHash) ^ 1);
        else if (index == 9) mutated.deploymentSalt = bytes32(uint256(original.deploymentSalt) ^ 1);
        else if (index == 10) mutated.predictedAccount = address(0xCAFE);
        else if (index == 11) mutated.accountCreationCodeHash = bytes32(uint256(original.accountCreationCodeHash) ^ 1);
        else if (index == 12) mutated.accountRuntimeCodeHash = bytes32(uint256(original.accountRuntimeCodeHash) ^ 1);
        else if (index == 13) mutated.token = address(0xBEEF);
        else if (index == 14) mutated.tokenAllowlistHash = bytes32(uint256(original.tokenAllowlistHash) ^ 1);
        else if (index == 15) mutated.routeAllowlistHash = bytes32(uint256(original.routeAllowlistHash) ^ 1);
        else mutated.manifestSha256 = bytes32(uint256(original.manifestSha256) ^ 1);
    }

    function _mutateEnforcedPolicy(AgentPayMainnetAccountFactoryV1.MainnetWalletSetup memory original, uint256 index)
        private
        view
        returns (AgentPayMainnetAccountFactoryV1.MainnetWalletSetup memory mutated)
    {
        mutated = original;
        if (index == 0) mutated.setupIntentId = "short";
        else if (index == 1) mutated.homeChainId = 1952;
        else if (index == 2) mutated.environment = "staging";
        else if (index == 3) mutated.deadline = block.timestamp;
        else if (index == 4) mutated.executor = address(0xD00D);
        else if (index == 5) mutated.factory = address(0xBEEF);
        else if (index == 6) mutated.factoryRuntimeCodeHash = bytes32(uint256(original.factoryRuntimeCodeHash) ^ 1);
        else if (index == 7) mutated.deploymentSalt = bytes32(uint256(original.deploymentSalt) ^ 1);
        else if (index == 8) mutated.predictedAccount = address(0xCAFE);
        else if (index == 9) mutated.accountCreationCodeHash = bytes32(uint256(original.accountCreationCodeHash) ^ 1);
        else if (index == 10) mutated.token = address(0xBEEF);
        else if (index == 11) mutated.tokenAllowlistHash = bytes32(uint256(original.tokenAllowlistHash) ^ 1);
        else mutated.routeAllowlistHash = bytes32(uint256(original.routeAllowlistHash) ^ 1);
    }

    function _expectEveryPredictionSurfaceToRevert(address invalidOwner, bytes memory revertData) private {
        vm.expectRevert(revertData);
        factory.deploymentSalt(invalidOwner);

        vm.expectRevert(revertData);
        factory.accountInitCodeHash(invalidOwner);

        vm.expectRevert(revertData);
        factory.predictAccount(invalidOwner);
    }

    function _assertUnknownSelectorReverts(bytes memory callData) private {
        (bool success,) = address(factory).call(callData);
        assertFalse(success);
    }

    function _assumeValidOwner(address fuzzOwner) private {
        vm.assume(fuzzOwner != address(0));
        vm.assume(fuzzOwner != executor);
        vm.assume(fuzzOwner != address(factory));
        vm.assume(fuzzOwner != VM_ADDRESS);
        vm.assume(fuzzOwner.code.length == 0);
    }

    function assertEq(address actual, address expected) private pure {
        require(actual == expected, "address mismatch");
    }

    function assertEq(uint256 actual, uint256 expected) private pure {
        require(actual == expected, "uint256 mismatch");
    }

    function assertEq(bytes32 actual, bytes32 expected) private pure {
        require(actual == expected, "bytes32 mismatch");
    }

    function assertTrue(bool value) private pure {
        require(value, "expected true");
    }

    function assertFalse(bool value) private pure {
        require(!value, "expected false");
    }
}
