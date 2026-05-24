// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/******************************************************************************\
* Peg / Stable Management library for 0.01 USDC target
* Uses Chainlink oracle for price feed
/******************************************************************************/

import { AggregatorV3Interface } from "../interfaces/AggregatorV3Interface.sol";

library LibPeg {
    bytes32 constant PEG_STORAGE_POSITION = keccak256("salt.intern.peg.diamond.storage");

    struct PegStorage {
        address priceFeed;           // Chainlink Aggregator for USDC (or SALT/USDC)
        uint256 targetPrice;         // 0.01 USDC in 18 decimals = 1e16
        uint256 deviationThreshold;  // e.g. 5% = 500 (in basis points, 1e4)
        uint256 lastRebalanceTime;
        bool rebalanceEnabled;
    }

    function pegStorage() internal pure returns (PegStorage storage ps) {
        bytes32 position = PEG_STORAGE_POSITION;
        assembly {
            ps.slot := position
        }
    }

    function getCurrentPrice() internal view returns (uint256) {
        PegStorage storage ps = pegStorage();
        require(ps.priceFeed != address(0), "Peg: no oracle set");

        AggregatorV3Interface feed = AggregatorV3Interface(ps.priceFeed);
        (, int256 answer, , , ) = feed.latestRoundData();
        require(answer > 0, "Peg: invalid oracle price");

        // Assume feed returns price with its own decimals (usually 8 for Chainlink USD)
        uint8 feedDecimals = feed.decimals();
        uint256 price = uint256(answer);

        // Normalize to 18 decimals
        if (feedDecimals < 18) {
            price = price * (10 ** (18 - feedDecimals));
        } else if (feedDecimals > 18) {
            price = price / (10 ** (feedDecimals - 18));
        }
        return price;
    }

    function isAbovePeg(uint256 currentPrice) internal view returns (bool) {
        PegStorage storage ps = pegStorage();
        return currentPrice > (ps.targetPrice * (10000 + ps.deviationThreshold) / 10000);
    }

    function isBelowPeg(uint256 currentPrice) internal view returns (bool) {
        PegStorage storage ps = pegStorage();
        return currentPrice < (ps.targetPrice * (10000 - ps.deviationThreshold) / 10000);
    }
}
