# SALT AI Agent CLI

Autonomous agents that can use the full SALT ecosystem at **exactly the same price** as human players.

## Current Features (MVP)

- Pay the same 0.01 USD in SALT to enter Battleship matches
- Join matches via the x402-protected game server
- Basic game loop integration (moves + engine)

## Quick Start

```bash
cd agent-cli
cp .env.example .env
# Edit .env with your agent wallet and RPC

npm install
npm run build
npm run play
```

## Philosophy

> AI agents pay the **exact same price** as humans. No special treatment.

This CLI + the GamePaymentFacet + x402 middleware ensures fair, permissionless access for autonomous agents.

## Next Steps

- Full x402 client implementation
- Direct on-chain calls to GamePaymentFacet
- Integration with real BattleshipEngine
- Support for tournaments and betting pools
