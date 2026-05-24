# Contributing to SALT Protocol

**Current Status (May 2026):** Agent Identity + full on-chain AvA Betting system is live. One-shot deployment compiles cleanly and is ready for Base Sepolia.

Thank you for your interest in contributing to the SALT Protocol! This guide will help you set up the project on a fresh system and start building.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
  - [Clone the Repository](#clone-the-repository)
  - [Install Dependencies](#install-dependencies)
  - [Compile Contracts](#compile-contracts)
- [Local Development (Recommended)](#local-development-recommended)
  - [One-Command Setup](#one-command-setup)
  - [Manual Local Setup](#manual-local-setup)
- [Deploying to Base Sepolia](#deploying-to-base-sepolia)
- [Running the Full Application Stack](#running-the-full-application-stack)
- [Useful Commands](#useful-commands)
- [Common Issues](#common-issues)
- [Project Structure Overview](#project-structure-overview)

---

## Prerequisites

Before you begin, make sure you have the following installed:

- **Node.js** v20 or higher (recommended)
- **npm** or **yarn**
- **Git**
- A code editor (VS Code recommended)

For testnet deployment, you will also need:
- A wallet with **Sepolia ETH** (for Base Sepolia)

---

## Getting Started

### Clone the Repository

```bash
git clone <repository-url>
cd salt-l3-diamond
```

### Install Dependencies

```bash
npm install
```

### Compile Contracts

```bash
npx hardhat compile
```

---

## Local Development (Recommended)

The fastest way to get a fully working environment is to use our one-command local setup.

### One-Command Setup

```bash
# Make the script executable (only needed once)
chmod +x scripts/start-local.sh

# Start everything
./scripts/start-local.sh
```

This script will:
1. Start a local Hardhat node
2. Deploy the **full SALT Protocol** (Diamond + all major facets)
3. Save all contract addresses
4. Generate environment files for the frontend and keeper bot
5. Show you the next steps

### Manual Local Setup

If you prefer more control:

**Terminal 1** – Start the local blockchain:
```bash
npx hardhat node
```

**Terminal 2** – Deploy the system:
```bash
npx hardhat run scripts/deploy-one-shot.ts --network localhost
```

---

## Deploying to Base Sepolia

### Using the One-Shot Script

```bash
# Standard deployment
npx hardhat run scripts/deploy-one-shot.ts --network baseSepolia --verify

# Clean deployment (deletes previous artifacts)
npx hardhat run scripts/deploy-one-shot.ts --network baseSepolia -- --reset --verify
```

### Using Hardhat Ignition (Recommended for long-term)

```bash
npx hardhat ignition deploy ignition/modules/SaltFullSystem.ts --network baseSepolia --verify
```

> **Note**: Make sure your `.env` file contains a funded deployer private key.

---

## Running the Full Application Stack

After deployment, you can run the three main components:

### 1. Frontend (dApp)

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### 2. Game Server (Backend)

```bash
cd backend/game-server
npm install
npm run dev
```

### 3. Keeper Bot (Price Updates)

```bash
node scripts/keeper-update-prices.js
```

> **Tip**: Edit `scripts/.env.keeper` with your private key before running the keeper.

---

## Useful Commands

| Goal                                      | Command |
|-------------------------------------------|---------|
| Start full local environment              | `./scripts/start-local.sh` |
| Deploy locally                            | `npx hardhat run scripts/deploy-one-shot.ts --network localhost` |
| Deploy to Base Sepolia                    | `... --network baseSepolia --verify` |
| Clean redeployment                        | `... -- --reset` |
| Deploy only core system                   | `... -- --core-only` |
| Deploy only game + ZK system              | `... -- --game-only` |
| Use modern Ignition deployment            | `npx hardhat ignition deploy ignition/modules/SaltFullSystem.ts --network ...` |
| Compile contracts                         | `npx hardhat compile` |

---

## Common Issues

| Problem                              | Solution |
|--------------------------------------|----------|
| "No deployment file found"           | Run the deployment script first |
| Frontend not connecting to contracts | Check `frontend/.env.local` has the correct `NEXT_PUBLIC_DIAMOND_ADDRESS` |
| Keeper bot fails                     | Set a valid private key in `scripts/.env.keeper` |
| Gas errors on Base Sepolia           | Make sure your wallet has Sepolia ETH |
| Want a completely fresh start        | Use the `--reset` flag |

---

## Project Structure Overview

```
salt-l3-diamond/
├── contracts/                  # All Solidity contracts (Diamond + Facets)
├── ignition/                   # Hardhat Ignition deployment modules
├── scripts/                    # Deployment, keeper, and utility scripts
│   ├── deploy-one-shot.ts
│   └── start-local.sh
├── frontend/                   # Next.js dApp
├── backend/
│   └── game-server/            # Game server + AI opponent
├── deployments/                # Auto-generated deployment artifacts
└── DEPLOYMENT.md               # Detailed deployment documentation
```

---

## Need Help?

- Check the full deployment guide: [`DEPLOYMENT.md`](./DEPLOYMENT.md)
- Review the ZK circuit spec: [`docs/ZK_Battleship_Circuit_Spec.md`](./docs/ZK_Battleship_Circuit_Spec.md)

We’re happy to help you get set up. Feel free to open an issue or reach out if you run into any problems!

---

**Goal**: From clone to a fully working local environment in under 10 minutes.
