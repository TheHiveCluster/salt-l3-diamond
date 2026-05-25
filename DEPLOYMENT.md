# Deployment Guide - SALT Protocol

This guide explains how to work on the project **without anything being pre-deployed**, and how to do clean one-shot deployments.

## Philosophy

- Anyone should be able to spin up a **full working environment** locally.
- Deployments should be as **one-shot** as possible.
- We support both **local development** and **shared testnet** (Base Sepolia).
- **Current state**: Compilation fixed, AvABettingFacet fully integrated, ready for clean testnet deploys.

---

## 1. Local Development (Recommended for Daily Work)

This is the best way for contributors to build and test on-chain without depending on anyone else.

### Step-by-step

```bash
# 1. Start a local Hardhat node (in one terminal)
npx hardhat node

# 2. In another terminal, deploy the full system with one command
npx hardhat run scripts/deploy-one-shot.ts --network localhost
```

This gives you:
- A fresh Diamond with all important facets
- All addresses saved to `deployments/localhost.json`
- Ready to use with the frontend and game server

### Using the deployed contracts locally

The frontend and keeper bot automatically read from `deployments/localhost.json` when running on `localhost`.

---

## 2. Base Sepolia (Shared Testnet)

For testing with others or before moving to your real L3.

### One-shot deployment

```bash
npx hardhat run scripts/deploy-one-shot.ts --network baseSepolia --verify
```

This will:
- Deploy the full system
- Save addresses to `deployments/baseSepolia.json`
- Verify contracts on Basescan (if `--verify` is used)

### Important Notes for Base Sepolia

- You need a funded deployer wallet with Sepolia ETH.
- The deployment can take 3–8 minutes because of many transactions.
- **Recommended command** (now fully supported):
  ```bash
  npx hardhat run scripts/deploy-one-shot.ts --network baseSepolia -- --reset --verify
  ```
- Compilation issues from OpenZeppelin v5 have been resolved.

---

## 3. BuildBear (Alpha Testing Sandboxes)

BuildBear sandboxes are used for **Alpha** testing. They are private, fast, and can fork any chain (Base, Solana, etc.).

Each sandbox has its own RPC and Chain ID, which change when you create a new one.

### One-shot deployment to BuildBear

```bash
BUILDBEAR_RPC=https://rpc.buildbear.io/YOUR_SANDBOX_ID \
BUILDBEAR_CHAIN_ID=31337 \
NEXT_PUBLIC_BUILDBEAR_NETWORK_LABEL="BuildBear(Base)" \
npx hardhat run scripts/deploy-one-shot.ts --network buildbear -- --reset
```

This will:
- Deploy to your BuildBear sandbox
- Save the artifact as `deployments/BuildBear.json`
- Automatically update `frontend/.env.local` with the correct BuildBear variables

### Frontend Connection

After deploying:
1. Start the frontend
2. In RainbowKit, you should see your labeled network (e.g. `BuildBear(Base)`)
3. Click it — RainbowKit will help add the network to MetaMask

**Tip**: Set `NEXT_PUBLIC_BUILDBEAR_NETWORK_LABEL` to something descriptive like `BuildBear(Solana)` or `BuildBear(Arbitrum)` when using different forks.

---

## 4. How to Use Deployed Addresses

After any deployment, addresses are saved in:

```
deployments/
  └── localhost.json
  └── baseSepolia.json
  └── BuildBear.json
```

Both the **frontend** and **keeper bot** are configured to read from these files automatically.

Example in code:
```ts
const deployment = require(`../deployments/${network}.json`);
const diamondAddress = deployment.contracts.Diamond;
```

---

## 4. Current Deployment Scripts & Flags

| Command / Script                              | Purpose                                      | Recommended |
|-----------------------------------------------|----------------------------------------------|-------------|
| `npx hardhat run scripts/deploy-one-shot.ts --network localhost` | Full one-shot deployment                     | Yes |
| `... -- --core-only`                          | Deploy only core economic system             | For focused work |
| `... -- --game-only`                          | Deploy only Game + NFT + ZK system           | When core is already deployed |
| `... -- --reset`                              | Delete old deployment files before running   | When you want a clean slate |
| `scripts/start-local.sh`                      | One-command: start node + deploy + guide     | Best for daily local dev |
| `npx hardhat ignition deploy ignition/modules/SaltFullSystem.ts` | Modern Ignition deployment (recommended long-term) | Yes for robustness |

**New useful flags:**
- `--reset` → Deletes previous deployment artifacts before deploying
- `--core-only` / `--game-only` → Deploy only part of the system

---

## 5. One-Command Local Development

The easiest way to start everything locally:

```bash
./scripts/start-local.sh
```

This script:
- Starts Hardhat node
- Runs the one-shot deployment
- Prints next steps (frontend, game server, keeper, etc.)

---

## 5. Recommended Workflow for Contributors

1. Clone the repo
2. Run `npx hardhat node` + `deploy-one-shot.ts --network localhost`
3. Start the game server (`cd backend/game-server && npm run dev`)
4. Start the frontend (`cd frontend && npm run dev`)
5. Start the keeper bot if needed
6. Start building / testing your feature

This way **anyone** can have a fully working on-chain environment in under 5 minutes.

---

## 6. Future Improvements (Planned)

- Migrate to **Hardhat Ignition** for even more reliable one-shot deployments
- Add a `--reset` flag to redeploy everything cleanly
- Support deterministic deployments using `CREATE2`
- Add a `deploy --l3` mode for your actual OP Stack L3

---

## Need Help?

If the one-shot deployment fails on Base Sepolia, please share the error and we can make it more robust.

The goal is: **Clone → One command → Fully working system**.
