// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { LibDiamond } from "../libraries/LibDiamond.sol";
import { IERC20 } from "../interfaces/IERC20.sol";
import { IERC20Metadata } from "../interfaces/IERC20Metadata.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title CollateralFacet (Hardened)
 * @notice USDC-backed mint/burn for SALT at 0.01 USDC target
 * 
 * Economics improvements:
 * - Proper decimal handling
 * - Small deposit & withdrawal fees (go to protocol treasury / stakers)
 * - Emergency pause
 * - Per-transaction withdrawal limit
 */
contract CollateralFacet is ReentrancyGuard {
    event USDCDeposited(address indexed user, uint256 usdcAmount, uint256 saltMinted, uint256 fee);
    event USDCWithdrawn(address indexed user, uint256 saltBurned, uint256 usdcWithdrawn, uint256 fee);
    event Paused(address account);
    event Unpaused(address account);

    address public usdcToken;
    bool public paused;
    uint256 public depositFeeBps = 5;     // 0.05%
    uint256 public withdrawFeeBps = 5;    // 0.05%
    uint256 public maxWithdrawPerTx;      // set by owner
    address public feeDistributor;

    // Circuit breaker for withdrawals
    uint256 public maxWithdrawPerPeriod;
    uint256 public periodDuration;        // e.g. 24 hours = 86400
    uint256 public periodStart;
    uint256 public withdrawnThisPeriod;

    modifier whenNotPaused() {
        require(!paused, "Collateral: paused");
        _;
    }

    function setUSDCAddress(address _usdc) external {
        LibDiamond.enforceIsContractOwner();
        usdcToken = _usdc;
    }

    function setFees(uint256 _depositBps, uint256 _withdrawBps) external {
        LibDiamond.enforceIsContractOwner();
        require(_depositBps <= 100 && _withdrawBps <= 100, "Collateral: fee too high");
        depositFeeBps = _depositBps;
        withdrawFeeBps = _withdrawBps;
    }

    function setMaxWithdrawPerTx(uint256 _max) external {
        LibDiamond.enforceIsContractOwner();
        maxWithdrawPerTx = _max;
    }

    function setWithdrawCircuitBreaker(uint256 _maxPerPeriod, uint256 _periodDuration) external {
        LibDiamond.enforceIsContractOwner();
        maxWithdrawPerPeriod = _maxPerPeriod;
        periodDuration = _periodDuration;
        periodStart = block.timestamp;
        withdrawnThisPeriod = 0;
    }

    function setFeeDistributor(address _distributor) external {
        LibDiamond.enforceIsContractOwner();
        feeDistributor = _distributor;
    }

    function pause() external {
        LibDiamond.enforceIsContractOwner();
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external {
        LibDiamond.enforceIsContractOwner();
        paused = false;
        emit Unpaused(msg.sender);
    }

    function depositUSDC(uint256 usdcAmount) external whenNotPaused nonReentrant {
        require(usdcToken != address(0), "Collateral: USDC not set");
        require(usdcAmount > 0, "Collateral: amount must be > 0");

        uint8 usdcDecimals = IERC20Metadata(usdcToken).decimals();
        uint256 fee = (usdcAmount * depositFeeBps) / 10000;
        uint256 netDeposit = usdcAmount - fee;

        IERC20(usdcToken).transferFrom(msg.sender, address(this), usdcAmount);

        // Calculate SALT: 1 USDC (in its decimals) = 100 SALT (18 decimals)
        uint256 saltToMint = netDeposit * (10 ** (18 - usdcDecimals)) * 100;

        // Mint SALT
        IERC20(address(this)).mintForCollateral(msg.sender, saltToMint);

        // Fee stays in diamond as protocol revenue
        if (feeDistributor != address(0) && fee > 0) {
            // Mint the fee portion to distributor for splitting
            IERC20(address(this)).mintForCollateral(feeDistributor, (fee * 100 * 1e12)); // rough conversion
        }
        emit USDCDeposited(msg.sender, usdcAmount, saltToMint, fee);
    }

    function withdrawUSDC(uint256 saltAmount) external whenNotPaused nonReentrant {
        require(usdcToken != address(0), "Collateral: USDC not set");
        require(saltAmount > 0, "Collateral: amount must be > 0");

        uint8 usdcDecimals = IERC20Metadata(usdcToken).decimals();
        uint256 usdcAmount = saltAmount / 100 / (10 ** (18 - usdcDecimals));

        if (maxWithdrawPerTx > 0) {
            require(usdcAmount <= maxWithdrawPerTx, "Collateral: exceeds max withdraw per tx");
        }

        // === Circuit Breaker ===
        if (periodDuration > 0) {
            if (block.timestamp >= periodStart + periodDuration) {
                // New period
                periodStart = block.timestamp;
                withdrawnThisPeriod = 0;
            }

            if (maxWithdrawPerPeriod > 0) {
                require(withdrawnThisPeriod + usdcAmount <= maxWithdrawPerPeriod,
                        "Collateral: exceeds max withdraw per period (circuit breaker)");
            }
            withdrawnThisPeriod += usdcAmount;
        }

        uint256 fee = (usdcAmount * withdrawFeeBps) / 10000;
        uint256 netWithdraw = usdcAmount - fee;

        // Burn the user's SALT
        IERC20(address(this)).burnForCollateral(msg.sender, saltAmount);

        // Send USDC back from reserves
        IERC20(usdcToken).transfer(msg.sender, netWithdraw);

        if (feeDistributor != address(0) && fee > 0) {
            IERC20(address(this)).mintForCollateral(feeDistributor, (fee * 100 * 1e12));
        }

        emit USDCWithdrawn(msg.sender, saltAmount, netWithdraw, fee);
    }

    function getUSDCReserves() external view returns (uint256) {
        if (usdcToken == address(0)) return 0;
        return IERC20(usdcToken).balanceOf(address(this));
    }

    function getWithdrawCircuitBreakerStatus() external view returns (
        uint256 maxPerPeriod,
        uint256 withdrawn,
        uint256 remaining,
        uint256 timeUntilReset
    ) {
        maxPerPeriod = maxWithdrawPerPeriod;
        withdrawn = withdrawnThisPeriod;

        if (periodDuration == 0) {
            remaining = type(uint256).max;
            timeUntilReset = 0;
        } else {
            uint256 end = periodStart + periodDuration;
            if (block.timestamp >= end) {
                remaining = maxWithdrawPerPeriod;
                timeUntilReset = 0;
            } else {
                remaining = maxWithdrawPerPeriod > withdrawnThisPeriod 
                    ? maxWithdrawPerPeriod - withdrawnThisPeriod 
                    : 0;
                timeUntilReset = end - block.timestamp;
            }
        }
    }

    /// @notice On-chain backing ratio (USDC reserves / total SALT supply)
    /// Returns value with 18 decimals (e.g. 1e18 = 100% backed)
    function getBackingRatio() external view returns (uint256) {
        uint256 reserves = this.getUSDCReserves();
        uint256 totalSupply = IERC20(address(this)).totalSupply();

        if (totalSupply == 0) return 0;

        // Since 1 USDC backs 100 SALT, we compare reserves * 100 (in 18 dec) vs totalSupply
        uint8 usdcDec = IERC20Metadata(usdcToken).decimals();
        uint256 backedSALT = reserves * (10 ** (18 - usdcDec)) * 100;

        return (backedSALT * 1e18) / totalSupply; // e.g. 1e18 = fully backed
    }
}
