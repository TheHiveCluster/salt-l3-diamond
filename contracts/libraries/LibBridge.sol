// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/******************************************************************************\
* Bridge library for Diamond - Cross-chain SALT transfers
* Supports Solana (chainId 1) and Cronos (chainId 2)
/******************************************************************************/

library LibBridge {
    bytes32 constant BRIDGE_STORAGE_POSITION = keccak256("salt.intern.bridge.diamond.storage");

    struct BridgeStorage {
        mapping(uint256 => bool) supportedChains; // chainId => supported
        mapping(address => bool) relayers;        // legacy relayer list
        mapping(bytes32 => bool) usedNonces;      // prevent replay attacks
        address[] trustedSigners;                 // multi-sig style trusted signers for bridgeIn
        uint256 minSignatures;                    // minimum signatures required (e.g. 2)
        uint256 bridgeFeeBps;                     // fee in basis points (e.g. 10 = 0.1%)
        address feeDistributor;                   // Moved here from facet to avoid storage collision in Diamond
    }

    function bridgeStorage() internal pure returns (BridgeStorage storage bs) {
        bytes32 position = BRIDGE_STORAGE_POSITION;
        assembly {
            bs.slot := position
        }
    }

    function isSupportedChain(uint256 chainId) internal view returns (bool) {
        return bridgeStorage().supportedChains[chainId];
    }

    function isRelayer(address account) internal view returns (bool) {
        return bridgeStorage().relayers[account];
    }

    function markNonceUsed(bytes32 nonce) internal {
        bridgeStorage().usedNonces[nonce] = true;
    }

    function isNonceUsed(bytes32 nonce) internal view returns (bool) {
        return bridgeStorage().usedNonces[nonce];
    }

    function getTrustedSigners() internal view returns (address[] memory) {
        return bridgeStorage().trustedSigners;
    }

    function getMinSignatures() internal view returns (uint256) {
        return bridgeStorage().minSignatures;
    }

    function getBridgeFeeBps() internal view returns (uint256) {
        return bridgeStorage().bridgeFeeBps;
    }

    function isTrustedSigner(address signer) internal view returns (bool) {
        address[] memory signers = bridgeStorage().trustedSigners;
        for (uint i = 0; i < signers.length; i++) {
            if (signers[i] == signer) return true;
        }
        return false;
    }

    function getFeeDistributor() internal view returns (address) {
        return bridgeStorage().feeDistributor;
    }
}
