# SALT Protocol dApp (Frontend)

Modern frontend for the SALT / Intern Protocol.

## Tech Stack

- **Next.js 15** (App Router)
- **TypeScript**
- **wagmi v2 + viem**
- **RainbowKit** (wallet connection)
- **Tailwind CSS**

## Getting Started

```bash
cd frontend
npm install
npm run dev
```

## Current Pages / Features (MVP)

- Wallet connection (RainbowKit)
- Hero + navigation
- Game lobby (Play vs Human / AI)
- Basic Staking dashboard (static for now)
- Marketplace placeholder

## Next Steps (Recommended)

1. Add contract ABIs + addresses (from deployment)
2. Implement real staking interactions
3. Build the actual Battleship game UI (canvas + on-chain settlement)
4. Add NFT viewing + Marketplace trading
5. Connect to game server for match creation

## Environment Variables

Create `.env.local`:

```env
NEXT_PUBLIC_DIAMOND_ADDRESS=0x...
NEXT_PUBLIC_CHAIN_ID=84532   # Base Sepolia
```

## Integration Notes

- The Diamond is the main contract.
- GamePaymentFacet handles match entry + settlement.
- Use wagmi hooks (`useReadContract`, `useWriteContract`) for interactions.
- For the game, you'll likely need a hybrid approach (off-chain game state + on-chain settlement + ZK proof).
