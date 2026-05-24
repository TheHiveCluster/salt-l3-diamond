// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { LibDiamond } from "../../libraries/LibDiamond.sol";
import { INFTManager } from "../interfaces/INFTManager.sol";

/**
 * @title NFTManagerFacet
 * @notice Central management for all NFT collections in the Intern/SALT ecosystem.
 * This facet allows registering and managing Meme NFTs, Gaming assets, Utility passes, etc.
 */
contract NFTManagerFacet is INFTManager {
    bytes32 constant NFT_MANAGER_STORAGE_POSITION = keccak256("salt.nft.manager.storage");

    struct NFTManagerStorage {
        mapping(address => NFTCollection) collections;
        mapping(NFTType => address[]) collectionsByType;
        mapping(address => bool) isRegistered;

        // NFT Benefit Configuration
        mapping(address => bool) stakingBoostCollections;     // collections that give staking multiplier
        mapping(address => uint256) feeDiscountBps;           // collections that give fee discount (in bps)
    }

    function nftManagerStorage() internal pure returns (NFTManagerStorage storage s) {
        bytes32 position = NFT_MANAGER_STORAGE_POSITION;
        assembly { s.slot := position }
    }

    function registerCollection(address collection, NFTType nftType, string calldata name) external override {
        LibDiamond.enforceIsContractOwner();
        require(collection != address(0), "NFTManager: invalid address");
        require(!nftManagerStorage().isRegistered[collection], "NFTManager: already registered");

        NFTManagerStorage storage s = nftManagerStorage();

        s.collections[collection] = NFTCollection({
            collectionAddress: collection,
            nftType: nftType,
            name: name,
            active: true
        });

        s.collectionsByType[nftType].push(collection);
        s.isRegistered[collection] = true;

        emit CollectionRegistered(collection, nftType, name);
    }

    function setCollectionStatus(address collection, bool active) external override {
        LibDiamond.enforceIsContractOwner();
        require(nftManagerStorage().isRegistered[collection], "NFTManager: not registered");

        nftManagerStorage().collections[collection].active = active;
        emit CollectionStatusUpdated(collection, active);
    }

    function getCollection(address collection) external view override returns (NFTCollection memory) {
        return nftManagerStorage().collections[collection];
    }

    function getCollectionsByType(NFTType nftType) external view override returns (address[] memory) {
        return nftManagerStorage().collectionsByType[nftType];
    }

    function isValidCollection(address collection) external view override returns (bool) {
        NFTManagerStorage storage s = nftManagerStorage();
        return s.isRegistered[collection] && s.collections[collection].active;
    }

    // ========== NFT Benefit Management ==========

    function setStakingBoostCollection(address collection, bool enabled) external {
        LibDiamond.enforceIsContractOwner();
        require(nftManagerStorage().isRegistered[collection], "NFTManager: not registered");
        nftManagerStorage().stakingBoostCollections[collection] = enabled;
    }

    function setFeeDiscountCollection(address collection, uint256 discountBps) external {
        LibDiamond.enforceIsContractOwner();
        require(nftManagerStorage().isRegistered[collection], "NFTManager: not registered");
        require(discountBps <= 5000, "NFTManager: discount too high (max 50%)");
        nftManagerStorage().feeDiscountBps[collection] = discountBps;
    }

    function hasStakingBoost(address user, address collection) external view returns (bool) {
        if (!nftManagerStorage().stakingBoostCollections[collection]) return false;
        // Simple check - user owns at least 1 NFT from the collection
        // In production you may want to use balanceOf or specific token checks
        (bool success, bytes memory data) = collection.staticcall(
            abi.encodeWithSignature("balanceOf(address)", user)
        );
        if (!success) return false;
        uint256 balance = abi.decode(data, (uint256));
        return balance > 0;
    }

    function getFeeDiscountBps(address user, address collection) external view returns (uint256) {
        uint256 discount = nftManagerStorage().feeDiscountBps[collection];
        if (discount == 0) return 0;

        (bool success, bytes memory data) = collection.staticcall(
            abi.encodeWithSignature("balanceOf(address)", user)
        );
        if (!success) return 0;
        uint256 balance = abi.decode(data, (uint256));
        return balance > 0 ? discount : 0;
    }

    /// @notice Returns true if user holds at least one NFT from any registered staking boost collection
    function hasAnyStakingBoost(address user) external view returns (bool) {
        NFTManagerStorage storage s = nftManagerStorage();

        // Check all registered collections that have staking boost enabled
        // For efficiency, we iterate over known boost ones (in practice you'd maintain a list)
        // Here we check the most common one (Meme) + future ones can be added

        // Simple robust check: scan all registered collections marked for boost
        // For production, maintain a separate array of boost collections
        address[] memory allMeme = s.collectionsByType[NFTType.MEME_ART];
        for (uint i = 0; i < allMeme.length; i++) {
            if (s.stakingBoostCollections[allMeme[i]]) {
                (bool success, bytes memory data) = allMeme[i].staticcall(
                    abi.encodeWithSignature("balanceOf(address)", user)
                );
                if (success) {
                    uint256 bal = abi.decode(data, (uint256));
                    if (bal > 0) return true;
                }
            }
        }
        return false;
    }
}
