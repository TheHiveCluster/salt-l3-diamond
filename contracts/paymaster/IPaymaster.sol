// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * Minimal ERC-4337 Paymaster interface
 * Based on official ERC-4337 spec
 */
interface IPaymaster {
    enum PostOpMode { opSucceeded, opReverted, postOpReverted }

    function validatePaymasterUserOp(
        UserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 maxCost
    ) external returns (bytes memory context, uint256 validationData);

    function postOp(
        PostOpMode mode,
        bytes calldata context,
        uint256 actualGasCost
    ) external;
}

// Minimal UserOperation struct (for interface)
struct UserOperation {
    address sender;
    uint256 nonce;
    bytes initCode;
    bytes callData;
    uint256 callGasLimit;
    uint256 verificationGasLimit;
    uint256 preVerificationGas;
    uint256 maxFeePerGas;
    uint256 maxPriorityFeePerGas;
    bytes paymasterAndData;
    bytes signature;
}
