// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title INFTManager
 * @notice Central registry for all NFT collections in the SALT ecosystem.
 * Allows the diamond to manage multiple NFT types (Meme, Gaming, Utility, etc.)
 */
interface INFTManager {
    enum NFTType {
        MEME_ART,
        GAMING_ASSET,
        UTILITY_PASS,
        REVENUE_SHARE,
        POSITION,
        REPUTATION
    }

    struct NFTCollection {
        address collectionAddress;
        NFTType nftType;
        string name;
        bool active;
    }

    event CollectionRegistered(address indexed collection, NFTType nftType, string name);
    event CollectionStatusUpdated(address indexed collection, bool active);

    function registerCollection(address collection, NFTType nftType, string calldata name) external;
    function setCollectionStatus(address collection, bool active) external;
    function getCollection(address collection) external view returns (NFTCollection memory);
    function getCollectionsByType(NFTType nftType) external view returns (address[] memory);
    function isValidCollection(address collection) external view returns (bool);
}
