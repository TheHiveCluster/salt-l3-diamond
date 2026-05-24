# SALT Game Server

Express server that powers the Battleship game (and future games).

## Key Principle

**Agents and humans pay exactly the same price** (0.01 USD in SALT) via x402.

## Current Status

- ✅ Real integration with `GamePaymentFacet` (pay/settle via ethers)
- ✅ x402 payment middleware (placeholder — drop-in ready for `@x402/express`)
- ✅ Anti-MEV private tx helper (OP Stack conditional tx)
- ✅ AI opponent + full Battleship engine
- ✅ On-chain settlement on game end (when `GAME_SERVER_PRIVATE_KEY` + diamond configured)

## Setup

```bash
cd backend/game-server
cp .env.example .env
# edit .env with your DIAMOND_ADDRESS + GAME_SERVER_PRIVATE_KEY
npm install
npm run dev
```

Server now defaults to port 3001.

## On-chain Requirements

After deploying the diamond, the owner must call:
```
gamePayment.setGameServer(<your game server wallet address>)
```
This authorizes the server to call `settleMatch`.

## Next (pick one)
- Wire real x402 middleware
- Add ship placement + commit-reveal routes
- Hook ZK verifier when circuit is ready
- End-to-end test with live diamond
