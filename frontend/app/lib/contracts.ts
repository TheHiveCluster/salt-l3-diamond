// frontend/app/lib/contracts.ts
// Minimal ABIs + addresses for core SALT flows (Staking + Collateral + GamePayment)

export const DIAMOND_ABI = [
  // ERC20 views
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",

  // Staking
  "function stake(uint256 amount)",
  "function unstake(uint256 amount)",
  "function claimRevenueRewards()",
  "function stakedBalanceOf(address) view returns (uint256)",
  "function pendingRewards(address) view returns (uint256)",
  "function totalStaked() view returns (uint256)",

  // Collateral
  "function depositUSDC(uint256 usdcAmount)",
  "function withdrawUSDC(uint256 saltAmount)",
  "function getUSDCReserves() view returns (uint256)",
  "function getBackingRatio() view returns (uint256)",

  // GamePayment (for C)
  "function payToEnterMatch(uint256 matchId, address opponent)",
  "function getCurrentEntryFeeSALT() view returns (uint256)",
   "function getMatch(uint256) view returns (tuple(address,address,uint256,uint256,uint256,bool,address,uint256,uint256))",
   "event MatchCreated(uint256 indexed matchId, address indexed player1, address indexed player2, uint256 agentId1, uint256 agentId2, uint256 entryFee)",
   "event MatchSettled(uint256 indexed matchId, address indexed winner, uint256 agentIdWinner, uint256 payout, uint256 protocolFee, uint256 burned)",

  // Commit-Reveal (Phase 2)
  "function commitShipPlacement(uint256 matchId, bytes32 commitment)",
  "function revealShipPlacement(uint256 matchId, bytes calldata placementData, bytes32 salt)",

  // ZK Verification (Phase 3)
  "function verifyGameResult(uint256 matchId, address winner, bytes32 gameHash, bytes calldata proof) returns (bool)",
  "function isGameVerified(uint256 matchId) view returns (bool)",

  // Loadouts & Stats (A polish)
  "function registerFreeLoadout(bytes32 placementHash)",
  "function getPlayerStats(address player) view returns (uint256 wins, uint256 losses, uint256 gamesPlayed)",
  "function recordGameResult(address winner, address loser)",
  "function wins(address) view returns (uint256)",
  "function losses(address) view returns (uint256)",
  "function gamesPlayed(address) view returns (uint256)",
  "function playerLoadouts(address, uint256) view returns (bytes32)",

  // Agent Identity (Phase 1)
  "function registerAgent(address controller, string agentURI) returns (uint256 agentId)",
  "function setAgentURI(uint256 agentId, string agentURI)",
  "function getAgent(uint256 agentId) view returns (tuple(uint256 agentId, address controller, string agentURI, uint256 registeredAt, bool active))",
  "function getAgentsByController(address controller) view returns (uint256[])",
  "function isValidAgent(uint256 agentId) view returns (bool)",
  "function nextAgentId() view returns (uint256)",
  "function getAgentStats(uint256 agentId) view returns (uint256 wins, uint256 losses, uint256 games)",
  "function recordAgentGameResult(uint256 winnerAgentId, uint256 loserAgentId) external",

  // Phase 3: Heroes & Loadouts bound to agentId
  "function addHeroToAgent(uint256 agentId, uint256 heroTokenId) external",
  "function registerLoadoutForAgent(uint256 agentId, bytes32 loadoutHash) external",
  "function getAgentHeroes(uint256 agentId) view returns (uint256[])",
  "function getAgentLoadouts(uint256 agentId) view returns (bytes32[])",
  "function registerLoadoutForAgent(uint256 agentId, bytes32 placementHash) external",

  // Agents mint their own Heroes
  "function mintHeroForAgent(uint256 agentId, address nftContract, uint256 tokenId, string tokenURI, bytes attributes) external",

  // AvA Betting (Phase 4)
  "function placeBet(uint256 matchId, uint256 onAgentId, uint256 amount) external",
  "function settleAvABets(uint256 matchId, uint256 winningAgentId) external",
  "function claimWinnings(uint256 matchId, uint256 winningAgentId) external",
  "function betPools(uint256 matchId, uint256 agentId) view returns (uint256)",
  "function matchWinner(uint256 matchId) view returns (uint256)",
  "function betsSettled(uint256 matchId) view returns (bool)",

  // AvA Betting Info helper
  "function getAvABettingInfo(uint256 matchId, uint256 agentId1, uint256 agentId2) view returns (uint256 totalPool, uint256 agent1Pool, uint256 agent2Pool, uint256 winningAgentId, bool settled)",
  "function getUserBet(uint256 matchId, uint256 agentId, address user) view returns (uint256)",
  "function getUserBets(uint256 matchId, address user, uint256 agentId1, uint256 agentId2) view returns (uint256 betOn1, uint256 betOn2)",
] as const;

export function getDiamondAddress(): `0x${string}` {
  const addr = process.env.NEXT_PUBLIC_DIAMOND_ADDRESS as `0x${string}` | undefined;
  if (!addr || addr === '0x...') {
    // Fallback for local dev after running deploy-one-shot
    return '0x5FbDB2315678afecb367f032d93F642f64180aa3'; // common hardhat first deploy
  }
  return addr;
}
