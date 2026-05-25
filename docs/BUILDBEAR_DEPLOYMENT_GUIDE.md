# BuildBear Deployment Guide (SALT L3 Diamond)

This guide covers deploying the full SALT Protocol diamond (including Agent Identity + AvA Betting) to a BuildBear sandbox. BuildBear sandboxes are great for alpha testing but have quirks around diamond cuts, storage, and cross-facet calls.

## 1. Prerequisites

- Node.js 18+ and Hardhat
- A funded private key on the BuildBear sandbox
- Latest code from `main` (with all the `game_*`, `ava_*` renames and storage fixes)

## 2. Create a BuildBear Sandbox

1. Go to [buildbear.io](https://buildbear.io)
2. Create a new sandbox (fork of Base or any supported chain)
3. Copy the **RPC URL** (e.g. `https://rpc.buildbear.io/sound-thanos-a8fff49d`)
4. Note the **Chain ID** (usually `31337` for custom sandboxes)

## 3. Environment Variables

Set these before every command:

```powershell
$env:BUILDBEAR_RPC = "https://rpc.buildbear.io/YOUR-SANDBOX-ID"
$env:BUILDBEAR_CHAIN_ID = "31337"
$env:PRIVATE_KEY = "0xYOUR_PRIVATE_KEY"
$env:RESET = "true"          # Use this for fresh deploys
```

## 4. Full One-Shot Deployment

```powershell
npx hardhat run scripts/deploy-one-shot.ts --network buildbear
```

### Important Notes

- The script uses `BATCH_SIZE=1` — **do not increase this** on BuildBear.
- It includes detailed selector logging (very useful when debugging collisions).
- After success it will:
  - Save `deployments/BuildBear.json`
  - Update `frontend/.env.local`
  - Generate `scripts/.env.keeper`

## 5. Post-Deployment Setup (Critical)

The one-shot deploy does **not** fully initialize Collateral. You **must** run these steps:

### 5.1 Set USDC Address

```powershell
npx hardhat run scripts/set-usdc-address.js --network buildbear
```

### 5.2 Set Collateral Manager + Unpause

```powershell
npx hardhat run scripts/set-collateral-manager.js --network buildbear
```

This script sets the manager to the actual `CollateralFacet` address (required because of how cross-facet calls resolve `msg.sender`).

### 5.3 Verify Setup

```powershell
npx hardhat run scripts/check-collateral-balances.js --network buildbear
```

## 6. Testing Collateral Flows

Use the test scripts (they now auto-fix common issues):

```powershell
# Full test deposit (1 USDC)
npx hardhat run scripts/test-deposit-usdc.js --network buildbear

# Check balances
npx hardhat run scripts/check-collateral-balances.js --network buildbear

# Test withdraw
npx hardhat run scripts/test-withdraw-usdc.js --network buildbear
```

## 7. Common Issues & Fixes

| Issue | Symptom | Fix |
|-------|---------|-----|
| Selector collision | `LibDiamondCut: Can't add function that already exists` | Rename conflicting functions with prefixes (`game_`, `ava_`, `bridge_`, etc.) |
| Storage collision | "Already initialized" on fresh deploy | Use proper diamond storage patterns or reset storage slots |
| `mintForCollateral` reverts | Silent revert on deposit/withdraw | Set `collateralManager` to the **CollateralFacet address**, not the diamond |
| Contract is paused | Deposit/withdraw always reverts | Call `unpause()` on CollateralFacet |
| Multiple IERC20 artifacts | Hardhat error `HH701` | Use fully qualified name: `"@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20"` |
| Large diamond cuts fail | Revert with no reason | Keep `BATCH_SIZE=1` |

## 8. Useful Scripts

| Script | Purpose |
|--------|---------|
| `deploy-one-shot.ts` | Full diamond deployment |
| `set-usdc-address.js` | Set USDC token on Collateral |
| `set-collateral-manager.js` | Set correct manager + unpause |
| `test-deposit-usdc.js` | End-to-end deposit test (auto-setup) |
| `test-withdraw-usdc.js` | Withdraw test |
| `check-collateral-balances.js` | Quick balance + reserves viewer |
| `keeper-update-prices.js` | TWAP price feeder for GamePayment |
| `npm run deploy:buildbear` | One-shot deploy on BuildBear |
| `npm run setup:collateral:buildbear` | Full Collateral + USDC setup |
| `npm run start:keeper:buildbear` | Start the price keeper |

## 9. Next Steps After Deployment

When you run `npm run deploy:buildbear`, the script will now:

- Automatically ask if you want to run the full Collateral/USDC setup (y/n prompt)
- Generate an improved `scripts/.env.keeper` with the correct BuildBear RPC

After the deploy finishes, the typical next steps are:

1. Update `KEEPER_PRIVATE_KEY` in `scripts/.env.keeper` (replace the placeholder)
2. Start the price keeper:
   ```bash
   node scripts/keeper-update-prices.js
   ```
3. Start the frontend:
   ```bash
   cd frontend && npm run dev
   ```
4. Start your game server (in another terminal)

You can also run the collateral setup manually anytime with:
```bash
npm run setup:collateral:buildbear
```

## 10. Tips for Future Deploys

- Always use a **fresh sandbox** when making big changes (storage is persistent within a sandbox).
- Keep the detailed logging in `deploy-one-shot.ts`.
- After any facet rename, update all call sites (deploy script + keeper + tests).
- Document new prefixed functions in `IAvABetting.sol` / interfaces.

## 11. Troubleshooting (Quick Commands)

### Most Common Issues & Fixes

| Problem | Quick Fix Command |
|---------|-------------------|
| Deposit fails with silent revert | Run the auto-setup deposit script (it unpauses + fixes manager) |
| Collateral is paused | `npx hardhat run scripts/test-deposit-usdc.js --network buildbear` (auto-unpauses) |
| `mintForCollateral` access denied | Run `set-collateral-manager.js` |
| USDC not set on Collateral | `npx hardhat run scripts/set-usdc-address.js --network buildbear` |
| Multiple IERC20 artifacts error | Use fully qualified name in scripts (already done in our helpers) |
| Selector collision on cut | Use `BATCH_SIZE=1` + look at the detailed logs in `deploy-one-shot.ts` |
| Want to inspect current state | Use the balance checker script |

### Useful One-Liners (Hardhat Console)

```powershell
npx hardhat console --network buildbear
```

Then paste any of these:

```js
// Check if Collateral is paused
const collateral = await ethers.getContractAt("CollateralFacet", "0xFa58e1310478A0F72F57F193c0E0dAf43dea609B");
console.log("Paused:", await collateral.paused());

// Check current collateralManager
const erc20 = await ethers.getContractAt("ERC20Facet", "0xFa58e1310478A0F72F57F193c0E0dAf43dea609B");
console.log("Collateral Manager:", await erc20.getCollateralManager());

// Check USDC address set on Collateral
console.log("USDC on Collateral:", await collateral.usdcToken());

// Check your balances
const diamond = "0xFa58e1310478A0F72F57F193c0E0dAf43dea609B";
const usdc = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const usdcToken = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", usdc);
const salt = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", diamond);
console.log("Your USDC:", await usdcToken.balanceOf(deployer.address));
console.log("Your SALT:", await salt.balanceOf(deployer.address));
```

### Recommended Recovery Sequence (when things break)

```powershell
# 1. Full diagnostic
npx hardhat run scripts/check-collateral-balances.js --network buildbear

# 2. Fix everything in one go (recommended)
npx hardhat run scripts/test-deposit-usdc.js --network buildbear

# 3. Verify
npx hardhat run scripts/check-collateral-balances.js --network buildbear
```

---

**Last Updated**: Based on successful deployment on sandbox `sound-thanos-a8fff49d` (May 2026).

This guide captures hard-won lessons from multiple full deployments and debugging sessions.
