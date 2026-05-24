// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/******************************************************************************\
* Staking Facet for Intern (SALT) token
* Stake SALT, earn SALT rewards at owner-configurable rate
* Fully compatible with the Diamond proxy
/******************************************************************************/

import { LibDiamond } from "../libraries/LibDiamond.sol";
import { LibStaking } from "../libraries/LibStaking.sol";
import { IERC20 } from "../interfaces/IERC20.sol";
import { NFTManagerFacet } from "../nft/facets/NFTManagerFacet.sol";
import { INFTManager } from "../nft/interfaces/INFTManager.sol";
import { ReputationManagerFacet } from "../nft/reputation/ReputationManagerFacet.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract StakingFacet is ReentrancyGuard {
    using LibStaking for LibStaking.StakingStorage;

    event Staked(address indexed user, uint256 amount);
    event Unstaked(address indexed user, uint256 amount);
    event RewardsClaimed(address indexed user, uint256 amount);
    event RewardRateUpdated(uint256 newRate);

    // Stake SALT tokens
    function stake(uint256 amount) external nonReentrant {
        require(amount > 0, "Staking: amount must be > 0");

        LibStaking.StakingStorage storage ss = LibStaking.stakingStorage();
        LibStaking.updateRewardDebt(msg.sender);

        // Transfer SALT from user to this diamond (routes through ERC20Facet)
        IERC20(address(this)).transferFrom(msg.sender, address(this), amount);

        ss.stakes[msg.sender].stakedAmount += amount;
        ss.totalStaked += amount;

        // Record for Reputation system
        ReputationManagerFacet repManager = ReputationManagerFacet(address(this));
        repManager.recordStakeActivity(msg.sender, amount);

        emit Staked(msg.sender, amount);
    }

    // Unstake SALT tokens (rewards must be claimed separately or auto-claimed)
    function unstake(uint256 amount) external nonReentrant {
        LibStaking.StakingStorage storage ss = LibStaking.stakingStorage();
        LibStaking.StakeInfo storage info = ss.stakes[msg.sender];
        require(info.stakedAmount >= amount, "Staking: insufficient staked balance");

        LibStaking.updateRewardDebt(msg.sender);

        info.stakedAmount -= amount;
        ss.totalStaked -= amount;

        // Return tokens (routes through ERC20Facet)
        IERC20(address(this)).transfer(msg.sender, amount);

        emit Unstaked(msg.sender, amount);
    }

    // Claim pending SALT rewards (mints new SALT via ERC20Facet owner mint)
    function claimRewards() external {
        LibStaking.StakingStorage storage ss = LibStaking.stakingStorage();
        LibStaking.updateRewardDebt(msg.sender);

        uint256 rewards = ss.stakes[msg.sender].rewardDebt;
        if (rewards == 0) return;

        ss.stakes[msg.sender].rewardDebt = 0;

        // For full functionality, extend ERC20Facet with a role-based minter
        // or call from owner. For this scaffold we emit the claim.
        // In production integrate with a minter role or keeper for peg/staking rewards.
        emit RewardsClaimed(msg.sender, rewards);

        // Production: IERC20(address(this)).mint(msg.sender, rewards); after adding mintRewards to ERC20
    }

    // View functions
    function stakedBalanceOf(address user) external view returns (uint256) {
        return LibStaking.stakingStorage().stakes[user].stakedAmount;
    }

    function pendingRewards(address user) external view returns (uint256) {
        uint256 baseRewards = LibStaking.calculatePendingRewards(user) + LibStaking.pendingRevenueRewards(user);

        // === NFT Staking Boost (Wired - Robust + Tiered) ===
        NFTManagerFacet nftManager = NFTManagerFacet(address(this));

        bool hasRegularBoost = nftManager.hasAnyStakingBoost(user);

        // Check for Reputation NFT (stronger boost)
        address repNFT = nftManager.getCollectionsByType(INFTManager.NFTType.REPUTATION).length > 0 
            ? nftManager.getCollectionsByType(INFTManager.NFTType.REPUTATION)[0] 
            : address(0);

        bool hasReputation = false;
        if (repNFT != address(0)) {
            (bool success, bytes memory data) = repNFT.staticcall(
                abi.encodeWithSignature("balanceOf(address)", user)
            );
            if (success) {
                uint256 bal = abi.decode(data, (uint256));
                hasReputation = bal > 0;
            }
        }

        if (hasReputation) {
            baseRewards = (baseRewards * 15000) / 10000; // +50% for Reputation holders
        } else if (hasRegularBoost) {
            baseRewards = (baseRewards * 12000) / 10000; // +20% for regular MemeNFTs
        }

        return baseRewards;
    }

    function totalStaked() external view returns (uint256) {
        return LibStaking.stakingStorage().totalStaked;
    }

    function rewardRate() external view returns (uint256) {
        return LibStaking.stakingStorage().rewardRate;
    }

    // === Revenue-based Staking (Recommended for production) ===

    /**
     * @notice Distribute SALT rewards from protocol revenue (bridge fees, collateral fees, etc.)
     * This replaces inflationary rewards.
     */
    function distributeRewards(uint256 saltAmount) external {
        LibDiamond.enforceIsContractOwner();
        require(saltAmount > 0, "Staking: amount must be > 0");

        // This SALT should already be in the diamond (sent by FeeDistributor)
        LibStaking.updateDistributedPerShare(saltAmount);
    }

    function claimRevenueRewards() external nonReentrant {
        uint256 pending = LibStaking.pendingRevenueRewards(msg.sender);
        if (pending == 0) return;

        LibStaking.updateUserDebt(msg.sender);

        // Non-mintable: Only distribute SALT that already exists in the diamond (from collected fees)
        // This prevents dilution of the USDC backing
        require(IERC20(address(this)).balanceOf(address(this)) >= pending, "Staking: insufficient treasury balance");
        IERC20(address(this)).transfer(msg.sender, pending);

        emit RewardsClaimed(msg.sender, pending);
    }

    // Legacy function - set to 0 in production to disable inflation
    function setRewardRate(uint256 newRate) external {
        LibDiamond.enforceIsContractOwner();
        LibStaking.StakingStorage storage ss = LibStaking.stakingStorage();
        ss.rewardRate = newRate;
        emit RewardRateUpdated(newRate);
    }

    function initializeStaking(uint256 initialRewardRate) external {
        LibDiamond.enforceIsContractOwner();
        LibStaking.StakingStorage storage ss = LibStaking.stakingStorage();
        require(ss.lastRewardTime == 0, "Staking: already initialized");
        ss.lastRewardTime = block.timestamp;
        ss.rewardRate = initialRewardRate; // Set to 0 for revenue-only model
    }
}
