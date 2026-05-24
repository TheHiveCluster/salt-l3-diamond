# Release Notes — Salty Intern (SALT L3 Diamond)

**Project:** Salty Intern  
**Status:** Testing Phase (Not Production Ready)  
**Date:** May 2026

---

## Overview

This is the **Salty Intern** project — an experimental ERC-2535 Diamond-based economy on an OP Stack L3.

The protocol combines:
- SALT token (ERC20 with staking & revenue sharing)
- Agent Identity system (ERC-8004 inspired)
- On-chain Agent vs Agent (AvA) betting
- Play-to-Earn mechanics with Heroes and loadouts

**Important:** This project is currently in active **testing phase**. It is not yet recommended for mainnet or real value.

---

## Major Deliveries in This Release

- **Agent Identity (ERC-8004 inspired)**
  - Full on-chain agent registry (`AgentIdentityFacet`)
  - Hero & loadout binding to agents
  - `mintHeroForAgent` with economic costs and rate limits
  - Automatic binding on mint

- **AvA Betting (Phase 4)**
  - `AvABettingFacet` with real proportional parimutuel math
  - Automatic betting settlement when `GamePaymentFacet.settleMatch` is called on AvA matches
  - New view functions: `getAvABettingInfo`, `getUserBets`, `getUserBet`
  - Full frontend support with dynamic agent selection, live pools, personal bet tracking, and claim winnings

- **Deployment & Developer Experience**
  - One-shot deployment script now fully supports testnets (`--reset`, `--verify`)
  - Compilation issues with OpenZeppelin v5 resolved
  - Added root `.env.example` and improved `.gitignore`
  - Legacy code cleanup in BridgeFacet and NFT contracts

---

## Deployment

**Recommended one-shot command (Base Sepolia):**

```bash
npx hardhat run scripts/deploy-one-shot.ts --network baseSepolia -- --reset --verify
```

See [DEPLOYMENT.md](./DEPLOYMENT.md) for full instructions.

---

## Testing Phase Notes

- The system is under active development and testing.
- Expect breaking changes in future releases.
- Smart contracts have not undergone professional audits.
- Use only with test funds on testnets.
- Some features (especially bridging and advanced ZK components) remain experimental.

---

## Known Limitations (as of this release)

- Some NFT contracts still contain minor code warnings
- BridgeFacet uses a simplified relayer model (production multi-sig version in progress)
- AvA betting currently assumes two-agent matches

---

## Next Focus Areas

- Further economy hardening and security reviews
- Improved frontend AvA experience
- Keeper automation and real testnet usage
- Migration toward full ERC-8004 compliance (future)

---

**Salty Intern** — Humans and agents pay the same. Revenue shared with stakers.

For the latest status, check the [Contributing Guide](./CONTRIBUTING.md).
