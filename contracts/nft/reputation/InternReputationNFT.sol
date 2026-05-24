// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/**
 * @title InternReputationNFT
 * @notice Soulbound (non-transferable) reputation NFTs for the Intern ecosystem.
 * 
 * Use cases:
 * - Earned through activity (staking, bridging volume, gaming achievements, etc.)
 * - Can be used for future benefits (higher staking multiplier, exclusive access, etc.)
 * - Cannot be traded or transferred (soulbound)
 */
contract InternReputationNFT is ERC721 {
    uint256 private _nextTokenId;

    address public immutable diamond;
    address public minter; // Can be set to a specific contract or the diamond

    mapping(uint256 => uint256) public reputationLevel; // e.g. 1, 2, 3...
    mapping(uint256 => string) private _tokenURIs;

    event ReputationMinted(address indexed to, uint256 tokenId, uint256 level, string tokenURI);
    event ReputationLeveledUp(uint256 indexed tokenId, uint256 newLevel);

    constructor(address _diamond, string memory name, string memory symbol) ERC721(name, symbol) {
        diamond = _diamond;
        minter = _diamond;
    }

    modifier onlyMinter() {
        require(msg.sender == minter || msg.sender == diamond, "ReputationNFT: not authorized");
        _;
    }

    function setMinter(address _minter) external {
        // Only diamond owner
        (bool success, bytes memory data) = diamond.staticcall(abi.encodeWithSignature("owner()"));
        address owner = success ? abi.decode(data, (address)) : address(0);
        require(msg.sender == owner, "ReputationNFT: only diamond owner");
        minter = _minter;
    }

    function mint(address to, uint256 level, string calldata uri) external onlyMinter returns (uint256) {
        uint256 tokenId = _nextTokenId++;
        _mint(to, tokenId);
        _tokenURIs[tokenId] = uri;
        reputationLevel[tokenId] = level;

        emit ReputationMinted(to, tokenId, level, uri);
        return tokenId;
    }

    function levelUp(uint256 tokenId, uint256 newLevel) external onlyMinter {
        require(_ownerOf(tokenId) != address(0), "ReputationNFT: token does not exist");
        require(newLevel > reputationLevel[tokenId], "ReputationNFT: level must increase");
        reputationLevel[tokenId] = newLevel;
        emit ReputationLeveledUp(tokenId, newLevel);
    }

    // === Soulbound: Disable all transfers (OZ v5 _update hook) ===
    function _update(address to, uint256 tokenId, address auth)
        internal
        override(ERC721)
        returns (address)
    {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) {
            revert("ReputationNFT: soulbound - cannot transfer");
        }
        return super._update(to, tokenId, auth);
    }

    // Standard overrides
    function tokenURI(uint256 tokenId) public view override(ERC721) returns (string memory) {
        return _tokenURIs[tokenId];
    }

    function supportsInterface(bytes4 interfaceId) public view override returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
