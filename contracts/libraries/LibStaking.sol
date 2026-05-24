// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/******************************************************************************\
* Staking library for Diamond - SALT staking with owner-settable rewards
/******************************************************************************/

library LibStaking {
    bytes32 constant STAKING_STORAGE_POSITION = keccak256("salt.intern.staking.diamond.storage");

    struct StakeInfo {
        uint256 stakedAmount;
        uint256 rewardDebt;      // accumulated rewards already accounted
        uint256 lastUpdateTime;
    }

    struct StakingStorage {
        uint256 totalStaked;
        uint256 rewardRate;           // legacy inflationary rate (set to 0 in production)
        uint256 lastRewardTime;
        mapping(address => StakeInfo) stakes;

        // === Revenue-based rewards (new model) ===
        uint256 totalDistributed;     // total SALT ever distributed to stakers
        uint256 distributedPerShare;  // accumulated rewards per staked token (scaled by 1e12)
        mapping(address => uint256) userDebt; // tracks what user has already claimed
    }

    function stakingStorage() internal pure returns (StakingStorage storage ss) {
        bytes32 position = STAKING_STORAGE_POSITION;
        assembly {
            ss.slot := position
        }
    }

    function updateRewardDebt(address user) internal {
        StakingStorage storage ss = stakingStorage();
        StakeInfo storage info = ss.stakes[user];
        if (info.stakedAmount > 0) {
            uint256 timeElapsed = block.timestamp - info.lastUpdateTime;
            if (timeElapsed > 0) {
                uint256 pending = (info.stakedAmount * ss.rewardRate * timeElapsed) / 1e18;
                info.rewardDebt += pending;
            }
        }
        info.lastUpdateTime = block.timestamp;
    }

    function calculatePendingRewards(address user) internal view returns (uint256) {
        StakingStorage storage ss = stakingStorage();
        StakeInfo storage info = ss.stakes[user];
        if (info.stakedAmount == 0) return 0;
        uint256 timeElapsed = block.timestamp - info.lastUpdateTime;
        uint256 pending = (info.stakedAmount * ss.rewardRate * timeElapsed) / 1e18;
        return info.rewardDebt + pending;
    }

    // === New revenue-based claimable rewards ===

    function updateDistributedPerShare(uint256 amount) internal {
        StakingStorage storage ss = stakingStorage();
        if (ss.totalStaked > 0) {
            ss.distributedPerShare += (amount * 1e12) / ss.totalStaked;
        }
        ss.totalDistributed += amount;
    }

    function pendingRevenueRewards(address user) internal view returns (uint256) {
        StakingStorage storage ss = stakingStorage();
        StakeInfo storage info = ss.stakes[user];
        if (info.stakedAmount == 0) return 0;

        uint256 accumulated = (info.stakedAmount * ss.distributedPerShare) / 1e12;
        uint256 debt = ss.userDebt[user];
        if (accumulated <= debt) return 0;
        return accumulated - debt;
    }

    function updateUserDebt(address user) internal {
        StakingStorage storage ss = stakingStorage();
        StakeInfo storage info = ss.stakes[user];
        if (info.stakedAmount > 0) {
            ss.userDebt[user] = (info.stakedAmount * ss.distributedPerShare) / 1e12;
        }
    }
}
