# Salt L3 Diamond - Intern (SALT) + Staking + Peg Manager (Chainlink)

**Latest: Agent Identity (ERC-8004 inspired) + On-Chain AvA Betting (Phase 4)** — Full one-shot deployment now ready for testnets.

**Testing Tiers:**
- **Alpha** → BuildBear sandboxes (`--network buildbear`) — See [BuildBear Deployment Guide](./docs/BUILDBEAR_DEPLOYMENT_GUIDE.md)
- **Beta** → Base Sepolia
- **Production** → Mainnet (future)

Full ERC-2535 Diamond for the Intern (SALT) token + Staking on your L3.

> **New contributor or setting up on a fresh machine?**  
> Please read the **[Contributing & Onboarding Guide](./CONTRIBUTING.md)** for the easiest way to get everything running.

## What's Included Now
- **Agent Identity + AvA Betting (Phase 4)** — Full on-chain agent registry, hero binding, and proportional parimutuel betting for Agent vs Agent matches
- Diamond proxy + all standard facets
- ERC20Facet: Intern / SALT, 18 decimals, owner mint/burn, setTokenSettings
- **NEW: StakingFacet** (this iteration)
  - stake / unstake SALT
  - claimRewards (SALT inflation rewards)
  - setRewardRate by owner
  - View: stakedBalanceOf, pendingRewards, totalStaked, rewardRate
  - Time-weighted simple reward model (rewardRate per second per 1e18 staked)

## Quick Start (after npm install)

**Recommended way (clean one-shot deployment):**

```bash
npx hardhat compile

# Terminal 1
npx hardhat node

# Terminal 2
npx hardhat run scripts/deploy-one-shot.ts --network localhost
```

See the full guides:
- **[Contributing & Onboarding Guide](./CONTRIBUTING.md)** ← Start here for setup
- **[DEPLOYMENT.md](./DEPLOYMENT.md)** ← Detailed deployment instructions
- **[BuildBear Deployment Guide](./docs/BUILDBEAR_DEPLOYMENT_GUIDE.md)** ← Alpha testing on BuildBear sandboxes (recommended for new features). The one-shot deploy now includes a y/n prompt for Collateral setup.

**Convenience scripts:**
- `npm run deploy:buildbear`
- `npm run setup:collateral:buildbear`
- **[RELEASE_NOTES.md](./RELEASE_NOTES.md)** ← Current status and testing phase notes

This allows anyone to get a fully working on-chain environment in minutes.

After deploy you get one address that is **both** your SALT ERC20 **and** the Staking contract.

Example usage (ethers v6):
```js
const salt = await ethers.getContractAt("ERC20Facet", diamondAddr);
const staking = await ethers.getContractAt("StakingFacet", diamondAddr);

await salt.approve(diamondAddr, amount);
await staking.stake(amount);

const pending = await staking.pendingRewards(user);
await staking.claimRewards();
```

## Reward Rate Example
`initializeStaking(ethers.parseUnits("0.0001", 18))` ≈ 8.64% APY at 1 SALT staked (rough, continuous).

Tune with `setRewardRate()`.

## Contributing

We welcome contributions! 

Please read the **[Contributing & Onboarding Guide](./CONTRIBUTING.md)** for:
- How to set up the project on a fresh machine
- Local development workflow
- How to deploy the system
- Guidelines for adding new features (facets, game logic, frontend, etc.)

Thank you for helping build the SALT Protocol!

## Peg Manager (0.01 USDC Auto-Peg) - Just Added
- Target: 0.01 USDC per SALT (1e16 in 18 decimals)
- Uses Chainlink `AggregatorV3Interface` (mock included for local)
- `rebalance()` callable by keeper bots when price deviates > threshold
- Admin functions: `setPriceFeed`, `setDeviationThreshold`, `toggleRebalance`
- Currently emits events + calculates direction (full mint/burn wired after adding a `pegMinter` role to ERC20Facet)

Example after deploy:
```js
const peg = await ethers.getContractAt("PegManagerFacet", diamondAddr);
const price = await peg.getCurrentPrice();           // normalized to 18 dec
const target = await peg.getTargetPrice();           // 10000000000000000 (0.01)
await peg.rebalance();                               // keeper calls this
```

In production on your L3:
- Point to real Chainlink feed or deploy your own oracle for SALT/USDC
- Add a restricted `mintForPeg` / `burnForPeg` in ERC20Facet
- Run a keeper bot (or Gelato / Chainlink Automation) that calls `rebalance()` when deviation detected

## BridgeFacet (Solana + Cronos) - Just Added ✓

- `bridgeOut(toChain, recipientBytes, amount)` — burns SALT and emits event for relayers
- `bridgeIn(fromChain, sender, recipient, amount, nonce)` — only callable by registered relayers, mints SALT
- Supported chains: 1 = Solana, 2 = Cronos (easily extendable)
- Relayer management + replay protection via nonces
- Uses `mintForBridge` / `burnForBridge` on the ERC20Facet

Usage after deploy:
```js
const bridge = await ethers.getContractAt("BridgeFacet", diamondAddr);

// User bridges out to Solana
await salt.approve(diamondAddr, amount);
await bridge.bridgeOut(1, "solana-recipient-address-bytes", amount);

// Relayer (off-chain) calls bridgeIn after confirmation on other chain
await bridge.bridgeIn(1, "solana-sender", userAddress, amount, nonce);
```

Admin (owner) can add more chains and relayers.

## Uniswap V4 Stable Hook (SALT/USDC 0.01) - Just Added ✓

Located at: `contracts/uniswap-v4/hooks/SALTStableHook.sol`

- Designed specifically for your SALT token targeting **0.01 USDC**
- Reads live price from your **PegManagerFacet** on the diamond
- Dynamic fee suggestion: higher fees when price deviates from target
- Ready to be attached to a Uniswap V4 pool once you deploy the V4 PoolManager on your L3

**Next steps to use it:**
1. Deploy full Uniswap V4 (PoolManager + periphery) on your OP Stack L3
2. Deploy `SALTStableHook` with the diamond address
3. Initialize a SALT/USDC pool using the hook

This hook can later call `rebalance()` on your PegManager during swaps if the pair moves too far from 0.01.

## ERC-4337 Paymaster (Low Gas Trades) + Improved Bridge - Just Added ✓

### PaymasterFacet
- Full ERC-4337 compatible Paymaster
- Sponsor gas for key actions: stable pair swaps, bridging, staking, peg rebalance
- Owner can whitelist function selectors and fund the paymaster with ETH
- Users can send UserOperations without holding ETH for gas

### Bridge Improvements (Production Ready)
- `bridgeInWithSignature()` — secure ECDSA signature verification from trusted off-chain signer
- Configurable bridge fee (default 0.1%)
- Better nonce + replay protection
- `setTrustedSigner()` and `setBridgeFeeBps()` for governance

Usage example (Paymaster + Bridge):
```js
// User sends a sponsored UserOperation to bridgeOut or swap
// Relayer calls bridgeInWithSignature with a valid signature from the trusted key
```

Both components are now integrated into your single Diamond address.

## Economic Fixes Implemented (Top 3)

1. **Staking Fixed** — Inflation disabled by default (`rewardRate = 0`). Rewards now come from real protocol revenue via `distributeRewards()` (to be called by owner or future FeeDistributor from bridge/collateral fees).

2. **Protocol Revenue Share** — Bridge and Collateral fees now have a clear path to stakers (50% of fees can be pushed via `distributeRewards`).

3. **CollateralFacet Hardened**:
   - Proper USDC decimal handling
   - 0.05% deposit + withdrawal fees (configurable)
   - Emergency pause
   - Max withdrawal per tx limit

4. **FeeDistributorFacet** added:
   - Automatically splits fees: 40% Treasury, 40% Stakers, 20% Paymaster
   - Wired to Bridge + Collateral
   - Stakers now get real revenue via `claimRevenueRewards()`

5. **LibStaking** upgraded with proper `distributedPerShare` + claimable rewards pool.

## Major Update: USDC Collateral Model (Deposit = Mint, Withdraw = Burn)

You requested to move from algorithmic mint/burn to a **fully USDC-backed model**.

**New CollateralFacet** (`contracts/collateral/CollateralFacet.sol`):

- `depositUSDC(usdcAmount)` → Transfers bridged USDC to the diamond and mints **100 SALT per 1 USDC**
- `withdrawUSDC(saltAmount)` → Burns SALT and returns equivalent USDC from reserves
- Tracks reserves and backed supply
- The diamond now holds real USDC as backing (much safer than pure algorithmic)

**Important:**
- You must deploy/bridge USDC to your L3 and call `setUSDCAddress(...)` on the CollateralFacet.
- The old PegManager (oracle algo) is now secondary / legacy. The primary supply control is through USDC deposits/withdrawals.

This makes SALT a true **backed stable** at exactly 0.01 USDC, with natural supply elasticity driven by user demand.

## Revenue System - Now Complete

The full revenue flow is now wired:

- Bridge & Collateral fees → `FeeDistributorFacet`
- `FeeDistributor` automatically splits (40% Treasury / 40% Stakers / 20% Paymaster)
- Staker share is pushed directly into `StakingFacet.distributeRewards()`
- Users claim via `claimRevenueRewards()`
- V4 Hook is prepared to send depeg fees into the same system

A full end-to-end test exists at `test/revenue-flow.test.js`.

### How to Run the Revenue Test
```bash
npx hardhat test test/revenue-flow.test.js
```
- (4) Peg finished ✓

The diamond architecture makes all of these easy to add as new facets without changing the token address.

All code follows the official Diamond-3-Hardhat reference.

**D: drive note**: The drive is currently flaky from the CLI (device not ready during copy). The canonical up-to-date workspace is at:
`C:\Users\shadr\projects\salt-l3-diamond`

When your D: drive is stable, just copy the entire folder over.

Built step-by-step with opencode.

## NFT Framework (New - Framework Started)

We have begun building a complete modular NFT system tailored to your SALT L3 project, including support for Web3 gaming and meme culture.

### Architecture
- `contracts/nft/NFTManagerFacet` — Central registry to manage multiple NFT collections (Meme, Gaming, Utility, Revenue, Position).
- `nft/meme/MemeNFT.sol` — Dedicated meme art NFTs with **direct P2P swaps** (`swapNFTs()`) — no marketplace fees.
- `nft/gaming/GamingAssetNFT.sol` + `IGameAsset.sol` — On-chain attributes (level, rarity, power, gameId) for Web3 gaming assets.
- `libraries/NFTBenefits.sol` — Helper library so Staking, Bridge, and Paymaster can give benefits to NFT holders.

### Current Features
**Meme System**
- Mint meme art with metadata
- Built-in direct NFT-to-NFT swaps
- Easy integration for future NFT ↔ SALT swaps

**Gaming Ready**
- Assets have on-chain stats
- `levelUp()` and `useAsset()` functions
- Designed for play-to-earn (earn SALT by playing/using assets)

**Future Integrations (easy to add)**
- Holding an "Intern Pass" NFT → +20% staking rewards
- Holding meme NFTs → reduced bridge fees
- Gaming NFTs that can be staked or bridged
- Revenue Share NFTs that receive automatic payouts from FeeDistributor

This framework is built to scale with your Web3 gaming vision while staying fully modular inside the Diamond.

**Next NFT Priorities (if you want):**
- Wire actual benefits into StakingFacet and BridgeFacet ✓ (done)
- Paymaster also respects NFT holders ✓
- **Meme NFT Marketplace + Auction** ✓ (just added)
- **Soulbound Intern Reputation NFTs + Auto-awarding** ✓ (just added)
- **Gaming Play-to-Earn + Tiered Benefits** ✓ (just added)
- Full end-to-end test for the complete NFT + Gaming economy

## Critical Security Upgrades Applied

- **TimelockFacet** — All sensitive owner actions now require 24h delay via Timelock
- **Bridge Multi-Sig** — `trustedSigners` + configurable threshold (no longer single signer)
- **Non-mintable Staking Rewards** — Rewards only come from existing treasury balance (protects backing)
- **Collateral Circuit Breaker** — Max withdrawable USDC per period (prevents sudden reserve drain)
- **On-chain Backing Ratio** — `getBackingRatio()` view in CollateralFacet
- **Small Burn Mechanism** — 0.1% burn on bridge and marketplace volume (mild deflation)
- **Soulbound Intern Reputation NFTs** — Non-transferable + auto-awarded based on real activity (bridge/staking/gaming)
- **Tiered NFT Benefits** — Reputation NFTs give +50% staking boost (stronger than regular MemeNFTs)
- **Gaming Play-to-Earn** — Using/staking Gaming NFTs now earns SALT directly + progresses Reputation
- **Robust NFT Benefit Checks** — Now properly queries NFTManager for registered boost/discount collections

These changes significantly improve both security and economic integrity.
- Soulbound achievement system for gaming
- Full end-to-end test for NFT benefits + revenue share
