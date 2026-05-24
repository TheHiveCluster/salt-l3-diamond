// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/******************************************************************************\
* PegManagerFacet - Automatic management for 0.01 USDC stable peg of SALT
* Integrates Chainlink price feed
* Callable by owner or authorized keeper bot for rebalancing
/******************************************************************************/

import { LibDiamond } from "../libraries/LibDiamond.sol";
import { LibPeg } from "../libraries/LibPeg.sol";
import { IERC20 } from "../interfaces/IERC20.sol"; // for future reserve logic

contract PegManagerFacet {
    using LibPeg for LibPeg.PegStorage;

    event PegOracleUpdated(address indexed newFeed);
    event ThresholdUpdated(uint256 newThresholdBps);
    event RebalanceExecuted(uint256 currentPrice, int256 supplyDelta, bool expanded);
    event RebalanceToggled(bool enabled);

    // Initialize the peg (call once after diamond cut)
    function initializePeg(address _priceFeed, uint256 _deviationBps) external {
        LibDiamond.enforceIsContractOwner();
        LibPeg.PegStorage storage ps = LibPeg.pegStorage();

        ps.priceFeed = _priceFeed;
        ps.targetPrice = 1e16; // 0.01 USDC = 0.01 * 1e18
        ps.deviationThreshold = _deviationBps; // e.g. 300 = 3%
        ps.rebalanceEnabled = true;
        ps.lastRebalanceTime = block.timestamp;

        // Register this facet as the peg manager so it can mint/burn for stability
        IERC20(address(this)).setPegManager(address(this));

        emit PegOracleUpdated(_priceFeed);
        emit ThresholdUpdated(_deviationBps);
    }

    // Admin / Keeper: update Chainlink feed address (once L3 has proper oracles)
    function setPriceFeed(address _priceFeed) external {
        LibDiamond.enforceIsContractOwner();
        LibPeg.PegStorage storage ps = LibPeg.pegStorage();
        ps.priceFeed = _priceFeed;
        emit PegOracleUpdated(_priceFeed);
    }

    function setDeviationThreshold(uint256 _bps) external {
        LibDiamond.enforceIsContractOwner();
        LibPeg.PegStorage storage ps = LibPeg.pegStorage();
        require(_bps < 5000, "Peg: threshold too high");
        ps.deviationThreshold = _bps;
        emit ThresholdUpdated(_bps);
    }

    function toggleRebalance(bool _enabled) external {
        LibDiamond.enforceIsContractOwner();
        LibPeg.PegStorage storage ps = LibPeg.pegStorage();
        ps.rebalanceEnabled = _enabled;
        emit RebalanceToggled(_enabled);
    }

    // Core automatic peg management function
    // Keeper bots call this periodically (can be permissioned later)
    function rebalance() external {
        LibPeg.PegStorage storage ps = LibPeg.pegStorage();
        require(ps.rebalanceEnabled, "Peg: rebalancing disabled");

        uint256 currentPrice = LibPeg.getCurrentPrice();
        int256 supplyDelta = 0;
        bool expanded = false;

        if (LibPeg.isAbovePeg(currentPrice)) {
            // Price too high → expand supply (mint more SALT)
            uint256 totalSupply = IERC20(address(this)).totalSupply();
            uint256 mintAmount = totalSupply / 100; // 1% expansion (tune in production)
            if (mintAmount > 0) {
                IERC20(address(this)).mintForPeg(address(this), mintAmount); // mint to diamond (or a reserve)
                supplyDelta = int256(mintAmount);
                expanded = true;
            }
        } else if (LibPeg.isBelowPeg(currentPrice)) {
            // Price too low → contract supply (burn SALT)
            uint256 totalSupply = IERC20(address(this)).totalSupply();
            uint256 burnAmount = totalSupply / 100;
            if (burnAmount > 0) {
                IERC20(address(this)).burnForPeg(address(this), burnAmount);
                supplyDelta = -int256(burnAmount);
                expanded = false;
            }
        }

        ps.lastRebalanceTime = block.timestamp;

        emit RebalanceExecuted(currentPrice, supplyDelta, expanded);
    }

    // View functions for keepers / UI
    function getTargetPrice() external view returns (uint256) {
        return LibPeg.pegStorage().targetPrice;
    }

    function getCurrentPrice() external view returns (uint256) {
        return LibPeg.getCurrentPrice();
    }

    function getDeviationThreshold() external view returns (uint256) {
        return LibPeg.pegStorage().deviationThreshold;
    }

    function getPriceFeed() external view returns (address) {
        return LibPeg.pegStorage().priceFeed;
    }

    function isRebalanceEnabled() external view returns (bool) {
        return LibPeg.pegStorage().rebalanceEnabled;
    }

    function lastRebalanceTime() external view returns (uint256) {
        return LibPeg.pegStorage().lastRebalanceTime;
    }
}
