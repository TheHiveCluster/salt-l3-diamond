// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { LibDiamond } from "../libraries/LibDiamond.sol";
import { IERC20 } from "../interfaces/IERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title FeeDistributorFacet
 * @notice Automatically splits protocol fees between Treasury, Stakers, and Paymaster.
 *
 * This is the central revenue router for the SALT economy.
 */
contract FeeDistributorFacet is ReentrancyGuard {
    event FeesDistributed(
        uint256 total,
        uint256 toTreasury,
        uint256 toStakers,
        uint256 toPaymaster
    );

    address public treasury;
    address public stakingContract;     // StakingFacet address (the diamond itself)
    address public paymasterContract;   // PaymasterFacet address (the diamond itself)

    // Allocation in basis points (must sum to 10000)
    uint256 public treasuryShareBps = 4000;   // 40%
    uint256 public stakersShareBps  = 4000;   // 40%
    uint256 public paymasterShareBps = 2000;  // 20%

    function setRecipients(
        address _treasury,
        address _staking,
        address _paymaster
    ) external {
        LibDiamond.enforceIsContractOwner();
        treasury = _treasury;
        stakingContract = _staking;
        paymasterContract = _paymaster;
    }

    function setAllocation(
        uint256 _treasuryBps,
        uint256 _stakersBps,
        uint256 _paymasterBps
    ) external {
        LibDiamond.enforceIsContractOwner();
        require(
            _treasuryBps + _stakersBps + _paymasterBps == 10000,
            "FeeDistributor: shares must sum to 100%"
        );
        treasuryShareBps = _treasuryBps;
        stakersShareBps = _stakersBps;
        paymasterShareBps = _paymasterBps;
    }

    /**
     * @notice Distributes fees and automatically pushes staker share into Staking rewards.
     * This is the "proper" auto-distribution function.
     */
    function distributeAndPushToStaking() external nonReentrant {
        uint256 balance = IERC20(address(this)).balanceOf(address(this));
        if (balance == 0) return;

        uint256 toTreasury   = (balance * treasuryShareBps)  / 10000;
        uint256 toStakers    = (balance * stakersShareBps)   / 10000;
        uint256 toPaymaster  = balance - toTreasury - toStakers;

        if (toTreasury > 0 && treasury != address(0)) {
            IERC20(address(this)).transfer(treasury, toTreasury);
        }

        if (toStakers > 0 && stakingContract != address(0)) {
            IERC20(address(this)).transfer(stakingContract, toStakers);
            // Automatically call distributeRewards on StakingFacet
            (bool success, ) = stakingContract.call(
                abi.encodeWithSignature("distributeRewards(uint256)", toStakers)
            );
            // Note: This works because both are facets on the same diamond
        }

        if (toPaymaster > 0 && paymasterContract != address(0)) {
            IERC20(address(this)).transfer(paymasterContract, toPaymaster);
        }

        emit FeesDistributed(balance, toTreasury, toStakers, toPaymaster);
    }

    /**
     * @notice Simple distribute (for backward compatibility)
     */
    function distribute() external {
        this.distributeAndPushToStaking();
    }

    /// @notice Anyone can send SALT to this contract to be distributed later
    receive() external payable {}
    fallback() external {}
}
