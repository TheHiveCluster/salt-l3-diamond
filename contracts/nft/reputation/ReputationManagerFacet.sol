// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { LibDiamond } from "../../libraries/LibDiamond.sol";
import { InternReputationNFT } from "./InternReputationNFT.sol";

/**
 * @title ReputationManagerFacet
 * @notice Tracks on-chain activity and automatically awards / levels up Intern Reputation NFTs.
 * 
 * Integrated with Staking, Bridge, Gaming, etc.
 */
contract ReputationManagerFacet {
    bytes32 constant REPUTATION_MANAGER_STORAGE = keccak256("salt.reputation.manager.storage");

    struct UserActivity {
        uint256 totalBridged;      // in SALT 18 decimals
        uint256 totalStaked;       // cumulative staked amount
        uint256 totalGamingUses;   // number of times gaming assets were used
        uint256 lastActivity;
    }

    struct ReputationManagerStorage {
        mapping(address => UserActivity) activity;
        address reputationNFT;     // address of InternReputationNFT
        uint256 bridgeThreshold1;
        uint256 stakeThreshold1;
        uint256 gamingThreshold1;
    }

    function reputationManagerStorage() internal pure returns (ReputationManagerStorage storage rs) {
        bytes32 position = REPUTATION_MANAGER_STORAGE;
        assembly { rs.slot := position }
    }

    // ========== Admin ==========

    function setReputationNFT(address nftAddress) external {
        LibDiamond.enforceIsContractOwner();
        reputationManagerStorage().reputationNFT = nftAddress;
    }

    function setThresholds(uint256 bridgeT, uint256 stakeT, uint256 gamingT) external {
        LibDiamond.enforceIsContractOwner();
        ReputationManagerStorage storage rs = reputationManagerStorage();
        rs.bridgeThreshold1 = bridgeT;
        rs.stakeThreshold1 = stakeT;
        rs.gamingThreshold1 = gamingT;
    }

    // ========== Activity Recording (called by other facets) ==========

    function recordBridgeActivity(address user, uint256 amount) external {
        // Only callable by BridgeFacet or Diamond
        require(msg.sender == address(this) || msg.sender == LibDiamond.contractOwner(), "Reputation: unauthorized");

        ReputationManagerStorage storage rs = reputationManagerStorage();
        UserActivity storage act = rs.activity[user];
        act.totalBridged += amount;
        act.lastActivity = block.timestamp;

        _checkAndAwardReputation(user);
    }

    function recordStakeActivity(address user, uint256 amount) external {
        require(msg.sender == address(this) || msg.sender == LibDiamond.contractOwner(), "Reputation: unauthorized");

        ReputationManagerStorage storage rs = reputationManagerStorage();
        UserActivity storage act = rs.activity[user];
        act.totalStaked += amount;
        act.lastActivity = block.timestamp;

        _checkAndAwardReputation(user);
    }

    function recordGamingActivity(address user) external {
        require(msg.sender == address(this) || msg.sender == LibDiamond.contractOwner(), "Reputation: unauthorized");

        ReputationManagerStorage storage rs = reputationManagerStorage();
        UserActivity storage act = rs.activity[user];
        act.totalGamingUses += 1;
        act.lastActivity = block.timestamp;

        _checkAndAwardReputation(user);
    }

    // ========== Internal Award Logic ==========

    function _checkAndAwardReputation(address user) internal {
        ReputationManagerStorage storage rs = reputationManagerStorage();
        if (rs.reputationNFT == address(0)) return;

        UserActivity storage act = rs.activity[user];
        InternReputationNFT repNFT = InternReputationNFT(rs.reputationNFT);

        // Simple thresholds for Level 1
        bool shouldHaveLevel1 =
            act.totalBridged >= rs.bridgeThreshold1 ||
            act.totalStaked >= rs.stakeThreshold1 ||
            act.totalGamingUses >= rs.gamingThreshold1;

        // Check if user already has a reputation NFT
        // For simplicity, we assume tokenId 0 is first one (can be improved)
        uint256 balance = repNFT.balanceOf(user);

        if (shouldHaveLevel1 && balance == 0) {
            // Mint Level 1 Reputation NFT
            string memory uri = "ipfs://reputation-level1";
            repNFT.mint(user, 1, uri);
        }
        // Future: level up logic based on higher thresholds
    }

    // ========== Views ==========

    function getUserActivity(address user) external view returns (UserActivity memory) {
        return reputationManagerStorage().activity[user];
    }

    function getReputationNFT() external view returns (address) {
        return reputationManagerStorage().reputationNFT;
    }
}
