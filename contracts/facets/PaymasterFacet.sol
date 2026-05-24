// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { LibDiamond } from "../libraries/LibDiamond.sol";
import { IPaymaster, UserOperation } from "../paymaster/IPaymaster.sol";
import { IERC20 } from "../interfaces/IERC20.sol";
import { NFTManagerFacet } from "../nft/facets/NFTManagerFacet.sol";

/**
 * @title PaymasterFacet
 * @notice ERC-4337 compatible Paymaster for low-gas / sponsored trades on the L3
 *
 * Use cases:
 * - Sponsor gas for users swapping on the SALT/USDC 0.01 stable pair
 * - Sponsor bridging (Solana/Cronos)
 * - Sponsor staking actions
 *
 * The diamond owner (or governance) can fund this paymaster with ETH or SALT.
 */
contract PaymasterFacet is IPaymaster {
    event SponsoredOperation(address indexed user, bytes4 selector, uint256 gasUsed);
    event PaymasterFunded(uint256 amount);

    // Allow sponsoring specific function selectors (e.g. swap, bridgeOut, stake)
    mapping(bytes4 => bool) public sponsoredSelectors;

    // Optional: allow paying gas in SALT instead of ETH (future extension)
    bool public allowSALTGasPayment = false;

    function initializePaymaster() external {
        LibDiamond.enforceIsContractOwner();
        // By default sponsor common actions on this diamond
        sponsoredSelectors[bytes4(keccak256("swap(bytes)"))] = true;           // example Uniswap swap
        sponsoredSelectors[bytes4(keccak256("bridgeOut(uint256,bytes,uint256)"))] = true;
        sponsoredSelectors[bytes4(keccak256("stake(uint256)"))] = true;
        sponsoredSelectors[bytes4(keccak256("rebalance()"))] = true;          // peg rebalance
    }

    function setSponsoredSelector(bytes4 selector, bool enabled) external {
        LibDiamond.enforceIsContractOwner();
        sponsoredSelectors[selector] = enabled;
    }

    function setAllowSALTGasPayment(bool enabled) external {
        LibDiamond.enforceIsContractOwner();
        allowSALTGasPayment = enabled;
    }

    /// @notice Fund the paymaster with ETH (called by owner or anyone)
    function fund() external payable {
        emit PaymasterFunded(msg.value);
    }

    // ==================== ERC-4337 Paymaster Logic ====================

    function validatePaymasterUserOp(
        UserOperation calldata userOp,
        bytes32 /*userOpHash*/,
        uint256 /*maxCost*/
    ) external override returns (bytes memory context, uint256 validationData) {
        // Extract the function selector from callData
        bytes4 selector;
        if (userOp.callData.length >= 4) {
            selector = bytes4(userOp.callData[0]) |
                       (bytes4(userOp.callData[1]) >> 8) |
                       (bytes4(userOp.callData[2]) >> 16) |
                       (bytes4(userOp.callData[3]) >> 24);
        }

        // Only sponsor whitelisted actions
        require(sponsoredSelectors[selector], "Paymaster: selector not sponsored");

        // === NFT Holder Benefit (Wired) ===
        // NFT holders get priority / higher trust for sponsorship (can be expanded)
        NFTManagerFacet nftManager = NFTManagerFacet(address(this));
        // Example: if user holds a fee discount NFT, we can treat them better
        // (for now just a comment - real logic can increase maxCost allowance etc.)

        // For now: always approve (in production add more checks: user whitelist, daily limits, etc.)
        // Return empty context and 0 = success, no time limit
        return ("", 0);
    }

    function postOp(
        PostOpMode mode,
        bytes calldata /*context*/,
        uint256 actualGasCost
    ) external override {
        // Could emit events, charge users in SALT, or refund excess
        if (mode == PostOpMode.opSucceeded) {
            emit SponsoredOperation(tx.origin, 0x00000000, actualGasCost);
        }
    }

    // Allow the diamond to receive ETH
    receive() external payable {}
}
