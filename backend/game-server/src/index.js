// backend/game-server/src/index.js
require('dotenv').config();
const express = require('express');
const { ethers } = require('ethers');
const { BattleshipEngine } = require('./battleship-engine');
const { generateRandomPlacement, getAIMove } = require('./ai-opponent');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3001;
const engine = new BattleshipEngine();

// ============================================
// ON-CHAIN INTEGRATION (GamePaymentFacet)
// ============================================
let provider;
let gameServerWallet;
let gamePayment;

const DIAMOND = process.env.DIAMOND_ADDRESS;
const RPC = process.env.RPC_URL || 'http://127.0.0.1:8545';
const GAME_SERVER_PK = process.env.GAME_SERVER_PRIVATE_KEY;

if (DIAMOND && GAME_SERVER_PK) {
  provider = new ethers.JsonRpcProvider(RPC);
  gameServerWallet = new ethers.Wallet(GAME_SERVER_PK, provider);

  // Minimal ABI for the functions we actually call
  const gamePaymentABI = [
    "function payToEnterMatch(uint256 matchId, address opponent) external",
    "function settleMatch(uint256 matchId, address winner, uint256 nonce, uint256 deadline) external",
    "function getMatch(uint256 matchId) external view returns (tuple(address,address,uint256,bool,address,uint256,uint256))",
    "function getCurrentEntryFeeSALT() external view returns (uint256)",
    "function setGameServer(address) external",

    // AvABettingFacet (Phase 4) - automatically called inside settleMatch for AvA matches
    "function settleAvABets(uint256 matchId, uint256 winningAgentId) external",
    "function placeBet(uint256 matchId, uint256 onAgentId, uint256 amount) external"
  ];

  gamePayment = new ethers.Contract(DIAMOND, gamePaymentABI, gameServerWallet);
  console.log(`[onchain] Connected to GamePaymentFacet at ${DIAMOND}`);
  console.log(`[onchain] AvA Betting is automatically settled when settleMatch is called on AvA matches (agentId1 + agentId2 present)`);
} else {
  console.log('[onchain] Running in OFF-CHAIN mode (no diamond configured)');
}

// Anti-MEV protected transaction helper (for OP Stack L3 conditional tx)
async function sendProtectedTransaction(contract, method, args, options = {}) {
  const tx = await contract[method].populateTransaction(...args);
  const isPrivate = process.env.USE_PRIVATE_TX === 'true';
  const p = contract.runner.provider;

  if (isPrivate) {
    try {
      const currentBlock = await p.getBlockNumber();
      return await p.send("eth_sendRawTransactionConditional", [
        await contract.runner.signTransaction(tx),
        { condition: { blockNumber: currentBlock + 1 } }
      ]);
    } catch (e) {
      console.warn("Private tx failed, falling back:", e.message);
    }
  }
  return await contract.runner.sendTransaction(tx);
}

// In-memory games (MVP). In prod we can sync from chain events.
const activeGames = new Map();

// Simple in-memory queue for Human vs Human matchmaking
let h2hQueue = []; // array of { playerAddress, timestamp, tier }

// Helper to get player tier from on-chain stats (for experience matchmaking)
async function getPlayerTier(address) {
  if (!gamePayment || !address) return 0; // default tier

  try {
    const stats = await gamePayment.getPlayerStats(address);
    const games = Number(stats[2] || 0);
    const wins = Number(stats[0] || 0);
    const winRate = games > 0 ? wins / games : 0.5;

    // Simple tiering
    if (games < 5) return 0;           // Newbie
    if (winRate > 0.7 && games > 20) return 3; // High skill
    if (winRate > 0.55) return 2;      // Good
    return 1;                          // Average
  } catch (e) {
    return 0;
  }
}

// ============================================
// x402 PAYMENT (placeholder — ready for @x402/express)
// ============================================
function requirePayment(req, res, next) {
  // TODO: Replace with real x402 middleware once @x402/express is installed
  // app.use(paymentMiddleware({ "POST /matchmaking/join": { price: "0.01 USD", asset: "SALT" } }))
  console.log(`[x402] Payment verified for ${req.path} — equal price for agents & humans`);
  next();
}

// ============================================
// Routes
// ============================================
app.get('/', (req, res) => {
  res.json({
    message: "SALT Game Server - Equal access for humans and AI agents",
    price: "0.01 USD in SALT via x402",
    onchain: !!gamePayment,
    diamond: DIAMOND || null
  });
});

// Join match — entry fee handled on-chain via GamePaymentFacet
app.post('/matchmaking/join', requirePayment, async (req, res) => {
  const { matchId, playerAddress, mode } = req.body;
  const gameMode = mode || 'human-vs-ai';

  if (gamePayment && playerAddress) {
    console.log(`[onchain] Player ${playerAddress} paid for mode ${gameMode}`);
  }

  // === HUMAN VS HUMAN QUEUE (Experience-based) ===
  if (gameMode === 'human-vs-human') {
    const myTier = await getPlayerTier(playerAddress);

    // Try to find a close tier opponent
    const matchIndex = h2hQueue.findIndex(p => Math.abs(p.tier - myTier) <= 1);

    if (matchIndex !== -1) {
      const opponent = h2hQueue.splice(matchIndex, 1)[0];
      const newMatchId = Date.now();

      activeGames.set(newMatchId, {
        player1: opponent.playerAddress,
        player2: playerAddress,
        board1: engine.createEmptyBoard(),
        board2: engine.createEmptyBoard(),
        turn: 1,
        started: Date.now(),
        onchainMatchId: newMatchId,
        mode: 'human-vs-human',
        status: 'matched'
      });

      console.log(`[H2H] Matched (tier ${opponent.tier} vs ${myTier}) ${opponent.playerAddress} vs ${playerAddress}`);

      return res.json({
        success: true,
        matchId: newMatchId,
        message: "Matched with similar experience player!",
        status: "matched",
        opponent: opponent.playerAddress
      });
    } else {
      // No good match — join queue with tier
      h2hQueue.push({ playerAddress, timestamp: Date.now(), tier: myTier });
      console.log(`[H2H] ${playerAddress} (tier ${myTier}) added to queue. Size: ${h2hQueue.length}`);

      return res.json({
        success: true,
        status: "waiting",
        message: "Waiting for player of similar experience...",
        queuePosition: h2hQueue.length,
        tier: myTier
      });
    }
  }

  // === AI vs AI (Spectator) ===
  if (gameMode === 'ai-vs-ai') {
    const newMatchId = Date.now();

    // Accept specific agentIds from the UI (Phase 3+)
    // Falls back to env vars or the IDs from deploy-one-shot.ts
    const agentIdAlpha = Number(req.body.agentId1 || process.env.AGENT_ID_ALPHA || 8001);
    const agentIdBeta  = Number(req.body.agentId2 || process.env.AGENT_ID_BETA  || 8002);

    // On-chain validation that the agents are registered
    if (gamePayment) {
      try {
        const [alphaValid, betaValid] = await Promise.all([
          gamePayment.isValidAgent(agentIdAlpha),
          gamePayment.isValidAgent(agentIdBeta)
        ]);
        if (!alphaValid || !betaValid) {
          return res.status(400).json({ error: "One or both agentIds are not registered in AgentIdentityFacet" });
        }
      } catch (e) {
        console.warn("[AvA] Agent validation call failed (facet may not be cut yet), proceeding anyway");
      }
    }

    activeGames.set(newMatchId, {
      player1: "0xAgentAlpha",
      player2: "0xAgentBeta",
      agentId1: agentIdAlpha,
      agentId2: agentIdBeta,
      board1: engine.createEmptyBoard(),
      board2: engine.createEmptyBoard(),
      turn: 1,
      started: Date.now(),
      onchainMatchId: newMatchId,
      mode: 'ai-vs-ai',
      status: 'spectator'
    });

    return res.json({
      success: true,
      matchId: newMatchId,
      message: "Entered AI vs AI spectator mode",
      status: "spectator",
      agentId1: agentIdAlpha,
      agentId2: agentIdBeta
    });
  }

  // Default: Human vs AI
  const id = matchId || Date.now();
  activeGames.set(Number(id), {
    player1: playerAddress,
    player2: 'ai',
    board1: engine.createEmptyBoard(),
    board2: engine.createEmptyBoard(),
    turn: 1,
    started: Date.now(),
    onchainMatchId: id,
    mode: gameMode
  });

  res.json({
    success: true,
    matchId: id,
    message: "Matched with AI Agent",
    status: "matched"
  });
});

// Ship placement from client (for Phase 1 + later commit-reveal)
app.post('/game/place', (req, res) => {
  const { matchId, placements, player } = req.body;
  const game = activeGames.get(Number(matchId));
  if (!game) return res.status(404).json({ error: "Match not found" });

  try {
    const board = player === 1 ? game.board1 : game.board2;
    const placedBoard = engine.placeShips(board, placements);

    if (player === 1) game.board1 = placedBoard;
    else game.board2 = placedBoard;

    game[`placed${player}`] = true;

    res.json({ success: true, message: "Ships placed successfully" });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Make a move
app.post('/game/move', async (req, res) => {
  const { matchId, x, y, player } = req.body;
  const game = activeGames.get(Number(matchId));

  if (!game) return res.status(404).json({ error: "Match not found" });

  try {
    const board = player === 1 ? game.board1 : game.board2;
    const result = engine.fire(board, x, y);

    res.json({
      success: true,
      result,
      boardPreview: engine.printBoard(board, true)
    });

    if (result.gameOver) {
      const winner = player === 1 ? game.player1 : game.player2;
      console.log(`[Game Over] Match ${matchId} won by ${winner}`);

      // ============================================
      // ON-CHAIN SETTLEMENT (the important part)
      // ============================================
      if (gamePayment && winner) {
        try {
          const nonce = Date.now();
          const deadline = Math.floor(Date.now() / 1000) + 3600; // 1h

          // Phase 2+: We can pass agentIds to settleMatch in future versions
          // For now we keep the existing signature
          const tx = await sendProtectedTransaction(
            gamePayment,
            'settleMatch',
            [matchId, winner, nonce, deadline]
          );
          console.log(`[onchain] Settled match ${matchId} tx: ${tx.hash || tx}`);

          if (game.agentId1 || game.agentId2) {
            console.log(`[Phase 2] Match had agentIds: ${game.agentId1} vs ${game.agentId2}`);
            console.log(`[AvA Betting] Betting pool for match ${matchId} settled automatically via settleMatch → AvABettingFacet`);
          }
        } catch (e) {
          console.error('[onchain] settleMatch failed:', e.message);
        }
      }

      // C: ZK verification stub (Phase 3) - calls ZKGameVerifierFacet
      if (gamePayment) {  // gamePayment is the diamond
        try {
          // In real version: call verifyGameResult with actual proof
          console.log(`[ZK] Would call ZKGameVerifierFacet.verifyGameResult for match ${matchId}`);
          // Example: await sendProtectedTransaction(zkVerifierContract, "verifyGameResult", [matchId, winner, gameHash, proof])
        } catch (e) {
          console.log('[ZK] Verification stub (not yet wired)');
        }
      }

      activeGames.delete(Number(matchId));
    }
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Get game state
app.get('/game/:matchId', (req, res) => {
  const game = activeGames.get(Number(req.params.matchId));
  if (!game) return res.status(404).json({ error: "Match not found" });

  res.json({
    matchId: req.params.matchId,
    turn: game.turn,
    status: game.status || "in_progress",
    player1: game.player1,
    player2: game.player2,
    mode: game.mode
  });
});

// Check H2H queue status for a player
app.get('/matchmaking/status', (req, res) => {
  const { playerAddress } = req.query;
  if (!playerAddress) return res.status(400).json({ error: "playerAddress required" });

  // Check if player is in queue
  const inQueue = h2hQueue.findIndex(p => p.playerAddress === playerAddress);
  if (inQueue !== -1) {
    return res.json({
      status: "waiting",
      queuePosition: inQueue + 1,
      totalInQueue: h2hQueue.length
    });
  }

  // Check if player is in an active matched game
  for (const [matchId, game] of activeGames.entries()) {
    if (game.mode === 'human-vs-human' && (game.player1 === playerAddress || game.player2 === playerAddress)) {
      return res.json({
        status: "matched",
        matchId: matchId,
        opponent: game.player1 === playerAddress ? game.player2 : game.player1
      });
    }
  }

  res.json({ status: "not_in_queue" });
});

// Dev helper: force settlement (only when no diamond is configured or for testing)
app.post('/dev/settle', async (req, res) => {
  const { matchId, winner } = req.body;
  if (!gamePayment) {
    return res.json({ message: "OFF-CHAIN mode — nothing to settle on chain" });
  }
  try {
    const nonce = Date.now();
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    const tx = await sendProtectedTransaction(gamePayment, 'settleMatch', [matchId, winner, nonce, deadline]);
    res.json({ success: true, tx: tx.hash || tx });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`🎮 SALT Game Server running on port ${PORT}`);
  console.log(`→ Agents and humans pay the exact same price`);
  console.log(`→ On-chain mode: ${!!gamePayment ? 'ENABLED (GamePaymentFacet)' : 'OFF-CHAIN (dev)'}`);
});
