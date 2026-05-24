// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { LibDiamond } from "../../libraries/LibDiamond.sol";

/**
 * @title NFTBenefits
 * @notice Library for checking NFT-based benefits across the SALT ecosystem.
 * Used by Staking, Bridge, Paymaster, etc. to apply discounts/boosts.
 */
library NFTBenefits {
    bytes32 constant NFT_BENEFITS_POSITION = keccak256("salt.nft.benefits.storage");

    struct BenefitsStorage {
        mapping(address => bool) stakingBoostNFTs;   // NFTs that give staking multiplier
        mapping(address => bool) feeDiscountNFTs;    // NFTs that reduce bridge/paymaster fees
        mapping(address => uint256) boostMultiplier; // e.g. 120 = 1.2x
    }

    function benefitsStorage() internal pure returns (BenefitsStorage storage bs) {
        bytes32 position = NFT_BENEFITS_POSITION;
        assembly { bs.slot := position }
    }

    function hasStakingBoost(address user, address nftCollection) internal view returns (bool) {
        // Simple check: does user own at least 1 of the boost NFT?
        // In production: use balanceOf or specific tokenId check
        return benefitsStorage().stakingBoostNFTs[nftCollection] && 
               IERC721(nftCollection).balanceOf(user) > 0;
    }

    function getFeeDiscountBps(address user, address nftCollection) internal view returns (uint256) {
        if (benefitsStorage().feeDiscountNFTs[nftCollection] && 
            IERC721(nftCollection).balanceOf(user) > 0) {
            return 2000; // 20% discount example
        }
        return 0;
    }
}

interface IERC721 {
    function balanceOf(address owner) external view returns (uint256);
}
