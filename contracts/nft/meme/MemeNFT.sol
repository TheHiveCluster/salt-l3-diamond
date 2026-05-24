// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { LibDiamond } from "../../libraries/LibDiamond.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { ERC721URIStorage } from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";

/**
 * @title MemeNFT
 * @notice NFT system for meme art assets.
 * Supports minting, metadata, and direct NFT swaps (P2P, no marketplace fees).
 * Designed for Web3 gaming and community art on the SALT L3.
 */
contract MemeNFT is ERC721, ERC721URIStorage {
    uint256 private _nextTokenId;

    address public immutable diamond; // The main SALT diamond
    address public minter;            // Can be the diamond or a specific minter role

    event MemeMinted(address indexed to, uint256 tokenId, string tokenURI);
    event MemeSwapped(uint256 indexed tokenIdA, uint256 indexed tokenIdB, address indexed partyA, address partyB);

    constructor(address _diamond, string memory name, string memory symbol) ERC721(name, symbol) {
        diamond = _diamond;
        minter = _diamond; // By default, diamond can mint
    }

    modifier onlyMinter() {
        require(msg.sender == minter || msg.sender == diamond, "MemeNFT: not authorized minter");
        _;
    }

    function setMinter(address _minter) external {
        // Only diamond owner can change
        (bool success, bytes memory data) = diamond.staticcall(abi.encodeWithSignature("owner()"));
        address owner = success ? abi.decode(data, (address)) : address(0);
        require(msg.sender == owner, "MemeNFT: only diamond owner");
        minter = _minter;
    }

    function mint(address to, string calldata uri) external onlyMinter returns (uint256) {
        uint256 tokenId = _nextTokenId++;
        _mint(to, tokenId);
        _setTokenURI(tokenId, uri);

        emit MemeMinted(to, tokenId, uri);
        return tokenId;
    }

    /**
     * @notice Direct P2P NFT swap (no platform fee)
     * Party A approves this contract for their token, then calls swap.
     */
    function swapNFTs(uint256 tokenIdA, uint256 tokenIdB, address ownerB) external {
        address ownerA = ownerOf(tokenIdA);
        require(ownerA == msg.sender, "MemeNFT: not owner of tokenA");
        require(ownerOf(tokenIdB) == ownerB, "MemeNFT: ownerB mismatch");

        // Execute atomic swap
        _transfer(ownerA, ownerB, tokenIdA);
        _transfer(ownerB, ownerA, tokenIdB);

        emit MemeSwapped(tokenIdA, tokenIdB, ownerA, ownerB);
    }

    // Optional: Allow swapping NFT for SALT (integrates with ERC20Facet)
    function swapNFTForSALT(uint256 tokenId, uint256 saltAmount, address recipient) external {
        address owner = ownerOf(tokenId);
        require(owner == msg.sender, "MemeNFT: not owner");

        // Burn or lock the NFT (for now we transfer to recipient or burn)
        _transfer(owner, recipient, tokenId);

        // Pay in SALT (caller must have approved SALT to this contract or use diamond call)
        // For full integration, call into diamond's ERC20
        // IERC20(diamond).transferFrom(recipient, owner, saltAmount);
    }

    // Standard overrides
    function tokenURI(uint256 tokenId) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC721URIStorage) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
