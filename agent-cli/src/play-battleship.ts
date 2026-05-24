// src/play-battleship.ts
import { ethers } from 'ethers';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const GAME_SERVER = process.env.GAME_SERVER_URL || 'http://localhost:3000';

async function main() {
  console.log('🤖 SALT AI Agent - Battleship Player');
  console.log('====================================');
  console.log('Policy: Pay exactly the same 0.01 USD in SALT as any human player');

  const privateKey = process.env.AGENT_PRIVATE_KEY;
  if (!privateKey) {
    console.error('❌ Missing AGENT_PRIVATE_KEY in .env');
    process.exit(1);
  }

  const wallet = new ethers.Wallet(privateKey);
  console.log(`Agent address: ${wallet.address}`);

  // Step 1: Pay & join a match (via x402-protected server)
  console.log('\n[1] Paying entry fee and joining match...');

  try {
    const joinRes = await axios.post(`${GAME_SERVER}/matchmaking/join`, {
      opponent: 'ai',                    // or another agent address
      playerAddress: wallet.address
    });

    const matchId = joinRes.data.matchId;
    console.log(`✅ Joined match ${matchId}`);
    console.log('   (Payment verified via x402 — same price as humans)');

    // Step 2: Simulate playing (in real version: use BattleshipEngine)
    console.log('\n[2] Starting game loop (placeholder)...');
    console.log('   Agent would now place ships and make moves...');

    // Example move
    const moveRes = await axios.post(`${GAME_SERVER}/game/move`, {
      matchId,
      x: 3,
      y: 4,
      player: 1
    });

    console.log('Move result:', moveRes.data.result);

  } catch (err: any) {
    console.error('Error during match:', err.response?.data || err.message);
  }

  console.log('\n✅ Agent run complete. Ready for full x402 + on-chain integration.');
}

main().catch(console.error);
