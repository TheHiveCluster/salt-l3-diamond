// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { ERC721URIStorage } from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import { IGameAsset } from "./IGameAsset.sol";
import { IERC20 } from "../../interfaces/IERC20.sol";

/**
 * @title GamingAssetNFT (Skeleton)
 * @notice Base for Web3 gaming assets on the SALT L3.
 * Planned features: on-chain attributes, leveling, cross-game utility, staking for SALT rewards.
 */
contract GamingAssetNFT is ERC721, ERC721URIStorage, IGameAsset {
    mapping(uint256 => GameAttributes) private _attributes;

    address public immutable diamond;

    constructor(address _diamond, string memory name, string memory symbol) ERC721(name, symbol) {
        diamond = _diamond;
    }

    function mint(address to, uint256 tokenId, string calldata uri, GameAttributes calldata attrs) external {
        // In production: only authorized game contracts or diamond can mint
        _mint(to, tokenId);
        _setTokenURI(tokenId, uri);
        _attributes[tokenId] = attrs;
    }

    /**
     * @notice Mint a Hero directly bound to an Agent Identity (Phase 3)
     * Automatically registers the hero with the AgentIdentityFacet on the diamond.
     */
    function mintForAgent(
        uint256 agentId,
        uint256 tokenId,
        string calldata uri,
        GameAttributes calldata attrs
    ) external {
        // Mint the NFT (to the diamond for now; ownership can be transferred to agent controller if needed)
        _mint(diamond, tokenId);
        _setTokenURI(tokenId, uri);
        _attributes[tokenId] = attrs;

        // Automatically bind the hero to the agent on the diamond
        // This calls the AgentIdentityFacet function exposed via the diamond
        (bool success, ) = diamond.call(
            abi.encodeWithSignature("addHeroToAgent(uint256,uint256)", agentId, tokenId)
        );
        require(success, "AgentIdentity: automatic hero binding failed");
    }

    function getAttributes(uint256 tokenId) external view override returns (GameAttributes memory) {
        return _attributes[tokenId];
    }

    function levelUp(uint256 tokenId) external override {
        // TODO: Add logic, perhaps requires burning SALT or achieving in-game milestones
        _attributes[tokenId].level += 1;
        emit AssetLeveledUp(tokenId, _attributes[tokenId].level);
    }

    function useAsset(uint256 tokenId, bytes32 gameId) external override {
        _attributes[tokenId].lastUsed = block.timestamp;
        _attributes[tokenId].gameId = gameId;
        emit AssetUsed(tokenId, gameId);

        // === Security Hardened Play-to-Earn (only registered agents can earn) ===
        require(block.timestamp >= _attributes[tokenId].lastUsed + 1 hours, "GamingAsset: cooldown active");

        // Check that this hero is bound to a registered agent
        (bool success, bytes memory data) = diamond.staticcall(
            abi.encodeWithSignature("getAgentForHero(uint256)", tokenId)
        );
        require(success, "GamingAsset: agent lookup failed");

        uint256 boundAgentId = abi.decode(data, (uint256));
        require(boundAgentId != 0, "GamingAsset: hero not bound to any agent");

        // Verify the agent is still registered and active
        (bool validSuccess, bytes memory validData) = diamond.staticcall(
            abi.encodeWithSignature("isValidAgent(uint256)", boundAgentId)
        );
        require(validSuccess && abi.decode(validData, (bool)), "GamingAsset: bound agent is not valid");

        address owner = ownerOf(tokenId);
        uint256 earnAmount = _attributes[tokenId].power * 1e16;

        if (earnAmount > 0) {
            IERC20(diamond).mintForBridge(owner, earnAmount);
        }
    }

    // Standard overrides
    function tokenURI(uint256 tokenId) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC721URIStorage) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
