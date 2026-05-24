# SALT / Intern – Battleship P2P Game System
## To-Do List & Roadmap

**Goal**: Build a fun, monetized, on-chain-settled P2P Battleship game where players pay ~0.01 USD worth of SALT to play against random users or AI agents. Add spectator betting pools, championships, and eSports features that feed revenue back into the SALT economy (treasury, stakers, paymaster).

**Core Rules Reminder**
- Entry fee: 0.01 USD equivalent in SALT (dynamic price oracle or fixed)
- Coin flip decides who goes first
- Standard Battleship (10x10 grid, ships: 5-4-3-3-2)
- Winner takes the pot (minus protocol fees + burns)

---

## Phase 1: MVP – Basic Matchmaking & Play (Priority: High)

- [ ] Define exact game rules & ship placement validation
- [ ] Create `GameManagerFacet.sol` (or dedicated `BattleshipFacet`)
  - [ ] Match creation (user vs random user / user vs AI)
  - [ ] Entry fee collection in SALT (0.01 USD equivalent)
  - [ ] Escrow of both players' entry fees
  - [ ] Coin flip using secure randomness (Chainlink VRF or commit-reveal)
  - [ ] Basic match state storage (who is playing, current turn, winner)
- [ ] Implement off-chain game engine (Node.js / TypeScript)
  - [ ] Real-time move validation (ships, hits, misses)
  - [ ] Prevent cheating (move verification)
  - [ ] On-chain settlement only at game end (winner payout + fee distribution)
- [ ] AI Agent opponent
  - [ ] Simple rule-based AI (Medium difficulty)
  - [ ] Later: smarter AI (ML or minimax)
- [ ] Basic frontend game UI (React + Canvas or Phaser.js)
  - [ ] Drag-and-drop ship placement
  - [ ] Real-time grid updates
- [ ] Integrate with existing `FeeDistributorFacet` (40/40/20 split)
- [ ] Add small burn on every game (e.g. 5–10% of entry fees)

**Deliverable**: Players can pay 0.01$ SALT, get matched, play vs another user or AI, winner gets ~90% of pot.

---

## Phase 2: On-Chain Settlement & Security (Priority: High)

- [ ] Decide architecture:
  - Option A: Fully off-chain game + on-chain final result + signature proof
  - Option B: Hybrid (moves off-chain, critical actions on-chain)
  - Option C: Fully on-chain (very expensive – probably not for MVP)
- [ ] Implement secure randomness for coin flip and (optionally) ship placement
- [ ] Add dispute / fraud proof mechanism (if using off-chain execution)
- [ ] Gas optimization for settlement transaction
- [ ] Add timeout / inactivity handling (auto-win for opponent after X time)
- [ ] Add re-entrancy guards and proper access control on Game facet

---

## Phase 3: Viewer Betting Pools & Spectators (Priority: Medium-High)

- [ ] Design `BettingPoolFacet.sol`
  - [ ] Create betting pools on live matches (before game starts or during)
  - [ ] Betting on "Player A wins", "Total hits in game", etc.
  - [ ] Dynamic odds based on pool size
  - [ ] Minimum bet size (e.g. 0.5 USD in SALT)
- [ ] Real-time game feed for spectators (WebSocket + on-chain events)
- [ ] Spectator UI (watch live games + place bets)
- [ ] Revenue from betting fees (e.g. 5% house edge)
- [ ] Integration with ReputationNFT (high-rep players = better odds or limits)

---

## Phase 4: Championships & Tournaments (Priority: Medium)

- [ ] Create `TournamentFacet.sol` + `ChampionshipManager`
  - [ ] Bracket system (single elimination, double elimination, Swiss)
  - [ ] Entry fee + prize pool mechanics (sponsored or player-funded)
  - [ ] Automated matchmaking for tournaments
  - [ ] Leaderboards (on-chain + off-chain cached)
- [ ] Seasonal Championships (weekly / monthly)
- [ ] NFT rewards for winners (special limited GamingAssetNFT or Reputation boosts)
- [ ] Qualification system (win X casual games to enter championship)

---

## Phase 5: eSports & Professional Layer (Priority: Medium-Long term)

- [ ] High-stakes lobbies (0.10$ – $1+ entry)
- [ ] Verified player system / KYC-lite for pros
- [ ] Sponsored tournaments with external prize money
- [ ] Stream integration (Twitch / YouTube + on-chain betting overlay)
- [ ] AI commentators or highlight reels
- [ ] Governance vote on official eSports rules and prize distribution

---

## Phase 6: Deep NFT & Economic Integration (Priority: High)

- [ ] GamingAssetNFT bonuses in Battleship
  - [ ] Specific ship skins or "lucky" items that give small in-game advantages (cosmetic + light gameplay)
  - [ ] Soulbound ReputationNFT gives win-rate boost or entry fee discount
- [ ] MemeNFT holders get special lobbies or reduced rake
- [ ] Automatic reputation progression from wins/losses (via ReputationManagerFacet)
- [ ] Staking boost for active players (play X games → temporary staking APY bonus)
- [ ] Revenue from game fees flows into the existing economic model (test this in simulation)

---

## Phase 7: Backend & Infrastructure

- [ ] Matchmaking service (Redis + queue)
- [ ] Game server (authoritative, handles game logic)
- [ ] AI opponent service (separate microservice)
- [ ] WebSocket real-time communication
- [ ] Database for game history, stats, replays
- [ ] Oracle integration for SALT/USD price (for dynamic 0.01$ fee)
- [ ] Anti-cheat / rate limiting
- [ ] Replay system (store game logs for disputes)

---

## Phase 8: Frontend & UX

- [ ] Modern web3 game interface
- [ ] Mobile responsive version
- [ ] Spectator mode with betting
- [ ] Profile page (stats, win rate, NFT loadout, reputation)
- [ ] Tournament lobby + bracket viewer
- [ ] In-game chat (with moderation)
- [ ] Leaderboards (casual + ranked + tournament)

---

## Phase 9: Testing, Auditing & Economics

- [ ] Unit tests for all new facets
- [ ] Integration tests (full game flow + payout)
- [ ] Economic simulation update: add game revenue stream to the 5-year model
- [ ] Security audit (especially randomness, escrow, betting pools)
- [ ] Gas cost analysis and optimization
- [ ] Load testing (1000+ concurrent games)

---

## Phase 10: Polish & Launch

- [ ] Tutorial / onboarding flow
- [ ] Daily/weekly quests (play X games, win with specific NFT, etc.)
- [ ] Referral system (both players get small SALT bonus)
- [ ] Governance proposals for game parameter changes (entry fee, rake, etc.)
- [ ] Marketing assets + eSports trailer

---

## Open Architecture Questions (Need Decisions)

1. **Game execution model** — Fully off-chain with on-chain settlement? Or more on-chain?
2. **Randomness source** — Chainlink VRF (reliable but cost) vs commit-reveal?
3. **AI difficulty tiers** — How many levels? Should top AI be extremely hard?
4. **Betting pool timing** — Only pre-game or also in-game betting?
5. **NFT power level** — Purely cosmetic or light gameplay advantage? (affects fairness)
6. **SALT price oracle** — Use existing Chainlink or new feed for dynamic 0.01 USD fee?
7. **Dispute resolution** — Who resolves cheating claims? DAO? Admin multisig? Automated?

---

## Suggested File Structure (New)

```
contracts/
  game/
    BattleshipFacet.sol
    BettingPoolFacet.sol
    TournamentFacet.sol
    GameNFTIntegration.sol     (hooks into existing NFTs)

scripts/
  deploy-game-facets.js

test/
  game/
    battleship.test.js
    betting-pool.test.js
    tournament.test.js

backend/
  game-server/
  ai-agent/
  matchmaking/

frontend/
  src/
    components/
      Game/
      Betting/
      Tournament/
```

---

**Next Step Recommendation**:
Start with **Phase 1 MVP** — define the exact contract interface for `BattleshipFacet`, implement the off-chain game engine, and get a working "pay → match → play → settle" loop.

---

Would you like me to:
- Turn this into a living `docs/` file and keep it updated?
- Start implementing Phase 1 (begin with the facet interface + game rules spec)?
- Prioritize any specific phase or feature first?

---

## Phase 12: Equal Access for AI Agents via x402 (Priority: High) — STARTED

**Core Principle**: AI agents must pay **exactly the same price** as humans (0.01 USD in SALT) and have full access to the system. No special discounts or premium tiers for agents.

### What Was Built (May 23, 2026)

- `contracts/game/GamePaymentFacet.sol`
  - On-chain escrow for game entry fees in SALT
  - Same `entryFeeSALT` for humans and agents
  - Protocol fee + burn on every game
  - `payToEnterMatch()` + `settleMatch()` functions

- `agent-cli/`
  - TypeScript CLI skeleton (`salt-agent`)
  - `src/play-battleship.ts` — ready to implement x402 payment + game loop
  - Designed so agents can autonomously pay and play

- `backend/game-server/`
  - Basic Express server with placeholder `requirePayment` middleware
  - Ready to be upgraded with official `@x402/express` middleware
  - All protected routes enforce the **same price** for agents and humans

### Remaining Work

- [ ] Install and integrate real `@x402/express` + `@x402/evm` (or SALT-specific facilitator)
- [ ] Make `GamePaymentFacet` callable from the x402-protected server
- [ ] Implement full x402 client in the AI Agent CLI
- [ ] Support dynamic 0.01 USD pricing (oracle or fixed SALT amount)
- [ ] Extend x402 protection to future features (tournaments, betting pools, premium AI, etc.)
- [ ] Document how any external AI agent can use the system at the same price

**Key Message**: The entire SALT ecosystem (games, future services, APIs) will be agent-friendly at human prices via x402.

---

**Current Status**: We have started building. The foundation for "agents pay the same as humans" is in place.

Next immediate tasks:
1. Wire the GamePaymentFacet into the game server
2. Add real x402 middleware
3. Make the first working agent that can pay and join a match

Let’s keep building! 🚀

