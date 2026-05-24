// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IGameAsset
 * @notice Interface for Web3 Gaming NFTs / Assets in the SALT ecosystem.
 * Assets can have on-chain attributes, levels, and be used across games.
 */
interface IGameAsset {
    struct GameAttributes {
        uint256 level;
        uint256 rarity;
        uint256 power;
        bytes32 gameId;      // Which game this asset belongs to
        uint256 lastUsed;
    }

    event AssetLeveledUp(uint256 indexed tokenId, uint256 newLevel);
    event AssetUsed(uint256 indexed tokenId, bytes32 gameId);

    function getAttributes(uint256 tokenId) external view returns (GameAttributes memory);
    function levelUp(uint256 tokenId) external;
    function useAsset(uint256 tokenId, bytes32 gameId) external;
}
