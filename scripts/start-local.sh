#!/bin/bash
# scripts/start-local.sh
# One-command script to start a full local SALT development environment

set -e

echo "🚀 Starting SALT Local Development Environment..."
echo ""

# Check if hardhat node is already running
if lsof -i :8545 > /dev/null 2>&1; then
  echo "⚠️  Port 8545 is already in use. Is Hardhat node already running?"
  read -p "Do you want to continue anyway? (y/n) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
fi

# Start Hardhat node in background
echo "Starting Hardhat local node..."
npx hardhat node > /tmp/hardhat-node.log 2>&1 &
HARDHAT_PID=$!
echo "Hardhat node started (PID: $HARDHAT_PID)"
echo "Logs: /tmp/hardhat-node.log"
echo ""

# Give the node time to start
sleep 5

# Deploy the full system
echo "Deploying full SALT system (one-shot)..."
npx hardhat run scripts/deploy-one-shot.ts --network localhost

echo ""
echo "✅ Local environment is ready!"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Useful next commands:"
echo ""
echo "  Frontend:           cd frontend && npm run dev"
echo "  Game Server:        cd backend/game-server && npm run dev"
echo "  Keeper Bot:         node scripts/keeper-update-prices.js"
echo "  Stop Hardhat node:  kill $HARDHAT_PID"
echo ""
echo "Deployment addresses are saved in: deployments/localhost.json"
echo "Environment files were auto-generated in frontend/.env.local and scripts/.env.keeper"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Keep script alive so user can see the output
read -p "Press Enter to stop the local node and exit..." 
kill $HARDHAT_PID 2>/dev/null || true
echo "Hardhat node stopped."
