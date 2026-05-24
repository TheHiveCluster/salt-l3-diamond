// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/******************************************************************************\
* BridgeFacet - Cross-chain bridge for SALT token
* Supports Solana (chainId=1) and Cronos (chainId=2)
* Skeleton for relayer-based bridging
/******************************************************************************/

import { LibDiamond } from "../libraries/LibDiamond.sol";
import { LibBridge } from "../libraries/LibBridge.sol";
import { IERC20 } from "../interfaces/IERC20.sol";
import { NFTManagerFacet } from "../nft/facets/NFTManagerFacet.sol";
import { INFTManager } from "../nft/interfaces/INFTManager.sol";
import { ReputationManagerFacet } from "../nft/reputation/ReputationManagerFacet.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract BridgeFacet is ReentrancyGuard {
    using LibBridge for LibBridge.BridgeStorage;

    event BridgeOut(
        uint256 indexed toChain,
        address indexed sender,
        bytes recipient,
        uint256 amount,
        uint256 nonce
    );

    event BridgeIn(
        uint256 indexed fromChain,
        bytes sender,
        address indexed recipient,
        uint256 amount,
        uint256 nonce
    );

    event ChainSupported(uint256 chainId, bool supported);
    event RelayerUpdated(address relayer, bool isRelayer);
    event TrustedSignerUpdated(address signer); // Legacy event (now using trustedSigners array)
    event BridgeFeeUpdated(uint256 feeBps);

    address public feeDistributor; // FeeDistributorFacet

    // ========== User Functions ==========

    /// @notice Lock/burn SALT to bridge out to another chain
    function bridgeOut(uint256 toChain, bytes calldata recipient, uint256 amount) external nonReentrant {
        require(LibBridge.isSupportedChain(toChain), "Bridge: chain not supported");
        require(amount > 0, "Bridge: amount must be > 0");

        // Burn the tokens from user (via bridge manager role)
        IERC20(address(this)).burnForBridge(msg.sender, amount);

        uint256 nonce = block.timestamp; // simple nonce for skeleton (improve in prod)

        emit BridgeOut(toChain, msg.sender, recipient, amount, nonce);
    }

    // ========== Relayer / Bridge Operator Functions ==========

    /// @notice Mint SALT after receiving proof from another chain (called by relayer)
    function bridgeIn(
        uint256 fromChain,
        bytes calldata sender,
        address recipient,
        uint256 amount,
        uint256 nonce
    ) external {
        require(LibBridge.isRelayer(msg.sender), "Bridge: caller is not a relayer");
        require(LibBridge.isSupportedChain(fromChain), "Bridge: chain not supported");
        require(amount > 0, "Bridge: amount must be > 0");

        bytes32 messageHash = keccak256(abi.encode(fromChain, sender, recipient, amount, nonce));
        require(!LibBridge.isNonceUsed(messageHash), "Bridge: nonce already used");

        LibBridge.markNonceUsed(messageHash);

        // Mint to recipient
        IERC20(address(this)).mintForBridge(recipient, amount);

        emit BridgeIn(fromChain, sender, recipient, amount, nonce);
    }

    // ========== Production BridgeIn with Signature (recommended) ==========

    /// @notice Bridge in with ECDSA signature from trusted off-chain signer (more secure)
    function bridgeInWithSignature(
        uint256 fromChain,
        bytes calldata sender,
        address recipient,
        uint256 amount,
        uint256 nonce,
        bytes[] calldata signatures   // Now accepts multiple signatures for threshold
    ) external {
        require(LibBridge.isSupportedChain(fromChain), "Bridge: chain not supported");
        require(amount > 0, "Bridge: amount must be > 0");

        bytes32 messageHash = keccak256(
            abi.encodePacked(
                "\x19Ethereum Signed Message:\n32",
                keccak256(abi.encode(fromChain, sender, recipient, amount, nonce, address(this)))
            )
        );

        require(!LibBridge.isNonceUsed(messageHash), "Bridge: nonce already used");

        // Multi-signer verification (threshold)
        uint256 validSignatures = 0;
        uint256 minSigs = LibBridge.getMinSignatures();

        for (uint i = 0; i < signatures.length; i++) {
            address signer = recoverSigner(messageHash, signatures[i]);
            if (LibBridge.isTrustedSigner(signer)) {
                validSignatures++;
            }
        }

        require(validSignatures >= minSigs, "Bridge: insufficient valid signatures");

        LibBridge.markNonceUsed(messageHash);

        // Apply bridge fee if configured
        uint256 feeBps = LibBridge.getBridgeFeeBps();

        // === NFT Fee Discount (Wired) ===
        NFTManagerFacet nftManager = NFTManagerFacet(address(this));
        uint256 discountBps = 0;

        // Check for any fee discount NFT the user holds
        address[] memory allCollections = nftManager.getCollectionsByType(INFTManager.NFTType.MEME_ART); // extend to all types later
        for (uint i = 0; i < allCollections.length; i++) {
            uint256 userDiscount = nftManager.getFeeDiscountBps(recipient, allCollections[i]);
            if (userDiscount > discountBps) discountBps = userDiscount;
        }

        if (discountBps > 0) {
            feeBps = (feeBps * (10000 - discountBps)) / 10000;
        }

        uint256 fee = (amount * feeBps) / 10000;
        uint256 amountAfterFee = amount - fee;

        if (fee > 0) {
            IERC20(address(this)).mintForBridge(address(this), fee);

            // === Small Burn on Fee (0.1% of bridged amount) ===
            uint256 burnBps = 10; // 0.1%
            uint256 burnAmount = (amount * burnBps) / 10000;
            if (burnAmount > 0 && fee > burnAmount) {
                // Burn part of the fee (reduces supply slightly)
                // For simplicity, we burn from the minted fee
                IERC20(address(this)).burnForBridge(address(this), burnAmount);
                fee -= burnAmount;
            }

            // Send remaining fee (minus burn) to FeeDistributor
            if (feeDistributor != address(0) && fee > 0) {
                uint256 toDistributor = fee / 2; // still split the remaining
                IERC20(address(this)).transfer(feeDistributor, toDistributor);
            }
        }

        IERC20(address(this)).mintForBridge(recipient, amountAfterFee);

        // Record activity for Reputation system
        ReputationManagerFacet repManager = ReputationManagerFacet(address(this));
        repManager.recordBridgeActivity(recipient, amount);

        emit BridgeIn(fromChain, sender, recipient, amountAfterFee, nonce);
    }

    function recoverSigner(bytes32 hash, bytes memory signature) internal pure returns (address) {
        require(signature.length == 65, "Bridge: invalid signature length");
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := mload(add(signature, 32))
            s := mload(add(signature, 64))
            v := byte(0, mload(add(signature, 96)))
        }
        return ecrecover(hash, v, r, s);
    }

    // ========== Admin Functions ==========

    function addSupportedChain(uint256 chainId) external {
        LibDiamond.enforceIsContractOwner();
        LibBridge.bridgeStorage().supportedChains[chainId] = true;
        emit ChainSupported(chainId, true);
    }

    function removeSupportedChain(uint256 chainId) external {
        LibDiamond.enforceIsContractOwner();
        LibBridge.bridgeStorage().supportedChains[chainId] = false;
        emit ChainSupported(chainId, false);
    }

    function addRelayer(address relayer) external {
        LibDiamond.enforceIsContractOwner();
        LibBridge.bridgeStorage().relayers[relayer] = true;
        emit RelayerUpdated(relayer, true);
    }

    function removeRelayer(address relayer) external {
        LibDiamond.enforceIsContractOwner();
        LibBridge.bridgeStorage().relayers[relayer] = false;
        emit RelayerUpdated(relayer, false);
    }

    function setTrustedSigners(address[] calldata signers, uint256 minSigs) external {
        LibDiamond.enforceIsContractOwner();
        require(signers.length >= minSigs && minSigs > 0, "Bridge: invalid threshold");
        LibBridge.bridgeStorage().trustedSigners = signers;
        LibBridge.bridgeStorage().minSignatures = minSigs;
        emit TrustedSignerUpdated(signers.length > 0 ? signers[0] : address(0));
    }

    function setBridgeFeeBps(uint256 feeBps) external {
        LibDiamond.enforceIsContractOwner();
        require(feeBps <= 500, "Bridge: fee too high"); // max 5%
        LibBridge.bridgeStorage().bridgeFeeBps = feeBps;
        emit BridgeFeeUpdated(feeBps);
    }

    function setFeeDistributor(address _distributor) external {
        LibDiamond.enforceIsContractOwner();
        feeDistributor = _distributor;
    }

    // ========== View Functions ==========

    function isChainSupported(uint256 chainId) external view returns (bool) {
        return LibBridge.isSupportedChain(chainId);
    }

    function isRelayer(address account) external view returns (bool) {
        return LibBridge.isRelayer(account);
    }

    // ========== Initialization ==========

    function initializeBridge() external {
        LibDiamond.enforceIsContractOwner();
        LibBridge.BridgeStorage storage bs = LibBridge.bridgeStorage();

        // Default supported chains
        bs.supportedChains[1] = true; // Solana
        bs.supportedChains[2] = true; // Cronos

        // Owner is initial trusted signer (for testing - replace with secure off-chain signer in prod)
        bs.trustedSigners.push(msg.sender);
        bs.minSignatures = 1;
        bs.bridgeFeeBps = 10; // 0.1% default bridge fee
    }
}
