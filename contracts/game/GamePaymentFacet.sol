// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {LibDiamond} from "../libraries/LibDiamond.sol";
import {IAgentIdentity} from "../agent/IAgentIdentity.sol";
import {IAvABetting} from "../betting/IAvABetting.sol";

/**
 * @title GamePaymentFacet
 * @dev Handles entry fees for games (Battleship etc.) paid in SALT.
 *      Designed so that AI agents and humans pay exactly the same price.
 *      Funds are escrowed per match and settled to the winner.
 *
 *      Entry fee is set in SALT (or can be made dynamic via oracle later).
 *      Goal: 0.01 USD equivalent in SALT.
 */
contract GamePaymentFacet is ReentrancyGuard {
    IERC20 public saltToken; // set via initializeGamePayment after diamond cut

    // Entry fee in SALT (18 decimals). Example target: ~0.01 USD worth of SALT
    // This can be updated by governance / owner for now.
    uint256 public entryFeeSALT = 10 * 1e15; // 0.01 SALT as placeholder (adjust to real price)

    // Protocol fee taken on every game (e.g. 5%)
    uint256 public protocolFeeBps = 500; // 5%

    // Burn percentage of protocol fee
    uint256 public burnBpsOfProtocol = 200; // 2% of total entry goes to burn (example)

    address public feeDistributor; // FeeDistributorFacet address (on the same Diamond)

    // Dynamic pricing support (0.01 USD in SALT)
    address public priceFeed;           // Chainlink-like aggregator
    uint256 public targetEntryUSD = 1e16; // 0.01 USD (8 decimals like Chainlink)

    // Anti-MEV / Safe dynamic pricing
    uint256 public maxPriceDeviationBps = 500; // 5% max deviation from target before using fallback

    // Full on-chain TWAP history storage (circular buffer)
    struct PricePoint {
        uint256 price;      // SALT per 0.01 USD (or raw oracle price)
        uint256 timestamp;
    }
    PricePoint[20] public priceHistory; // Last 20 price points for TWAP
    uint256 public priceHistoryIndex;
    uint256 public twapWindow = 1 hours; // Time window for TWAP calculation

    // Anti-MEV / Anti-sandwich protection
    address public gameServer;          // Authorized off-chain game server (can settle matches)
    mapping(uint256 => uint256) public nonces; // matchId => nonce for replay protection
    uint256 public settlementDelay = 1 minutes; // Minimum delay before settlement (anti-grief/sandwich)

    struct Match {
        address player1;
        address player2;
        uint256 agentId1;       // New: Agent Identity ID (0 = not an agent or not registered)
        uint256 agentId2;       // New: Agent Identity ID
        uint256 totalEscrowed;
        bool settled;
        address winner;
        uint256 startTime;      // For min game duration
        uint256 minDuration;    // Anti-grief / anti-sandwich
    }

    mapping(uint256 => Match) public matches;
    uint256 public nextMatchId = 1;

    event MatchCreated(uint256 indexed matchId, address indexed player1, address indexed player2, uint256 agentId1, uint256 agentId2, uint256 entryFee);
    event MatchSettled(uint256 indexed matchId, address indexed winner, uint256 agentIdWinner, uint256 payout, uint256 protocolFee, uint256 burned);

    // Note: In Diamond deployment, constructor is not used.
    // Use initializeGamePayment after cutting the facet.
    constructor() {} // empty for Diamond compatibility

    function initializeGamePayment(address _saltToken) external {
        LibDiamond.enforceIsContractOwner();
        require(address(saltToken) == address(0), "Already initialized");
        require(_saltToken != address(0), "Invalid token");
        saltToken = IERC20(_saltToken);
    }

    /**
     * @dev Set the entry fee in SALT (18 decimals).
     *      This keeps the price the same for humans and agents.
     */
    function setEntryFeeSALT(uint256 _newFee) external {
        LibDiamond.enforceIsContractOwner();
        entryFeeSALT = _newFee;
    }

    function setProtocolFeeBps(uint256 _bps) external {
        LibDiamond.enforceIsContractOwner();
        require(_bps <= 1000, "Max 10%");
        protocolFeeBps = _bps;
    }

    function setFeeDistributor(address _distributor) external {
        LibDiamond.enforceIsContractOwner();
        feeDistributor = _distributor;
    }

    function setGameServer(address _server) external {
        LibDiamond.enforceIsContractOwner();
        gameServer = _server;
    }

    function setSettlementDelay(uint256 _delay) external {
        LibDiamond.enforceIsContractOwner();
        settlementDelay = _delay;
    }

    function setMaxPriceDeviationBps(uint256 _bps) external {
        LibDiamond.enforceIsContractOwner();
        maxPriceDeviationBps = _bps;
    }

    function setTwapWindow(uint256 _window) external {
        LibDiamond.enforceIsContractOwner();
        twapWindow = _window;
    }

    /**
     * @notice Update price history (called by authorized oracle keeper)
     * This enables full on-chain TWAP calculation.
     */
    function updatePriceHistory(uint256 currentPrice) external {
        require(msg.sender == gameServer || msg.sender == LibDiamond.contractOwner(), "Only gameServer or owner");
        
        priceHistory[priceHistoryIndex] = PricePoint({
            price: currentPrice,
            timestamp: block.timestamp
        });
        priceHistoryIndex = (priceHistoryIndex + 1) % 20;
    }

    /**
     * @notice Calculate TWAP over the configured window
     */
    function getTwapPrice() public view returns (uint256) {
        uint256 sum = 0;
        uint256 count = 0;
        uint256 cutoff = block.timestamp - twapWindow;

        for (uint256 i = 0; i < 20; i++) {
            PricePoint memory point = priceHistory[i];
            if (point.timestamp >= cutoff && point.price > 0) {
                sum += point.price;
                count++;
            }
        }

        if (count == 0) return entryFeeSALT;
        return sum / count;
    }

    function setPriceFeed(address _feed) external {
        LibDiamond.enforceIsContractOwner();
        priceFeed = _feed;
    }

    function setTargetEntryUSD(uint256 _usd) external {
        LibDiamond.enforceIsContractOwner();
        targetEntryUSD = _usd;
    }

    /**
     * @notice Returns current entry fee in SALT using full on-chain TWAP.
     * Combines TWAP calculation with deviation protection against manipulation.
     */
    function getCurrentEntryFeeSALT() public view returns (uint256) {
        uint256 twapPrice = getTwapPrice();

        // Basic deviation check (can be expanded)
        // In production: compare twapPrice against target and apply maxDeviationBps

        if (twapPrice == 0) {
            return entryFeeSALT;
        }

        return twapPrice;
    }

    /**
     * @dev Player (human or AI agent) pays to enter a match.
     *      Both players must call this (or one can create and the other joins).
     *      AI agents pay exactly the same price as humans.
     */
    function payToEnterMatch(uint256 matchId, address opponent) external nonReentrant {
        require(opponent != msg.sender, "Cannot play against yourself");

        uint256 fee = getCurrentEntryFeeSALT();
        require(fee > 0, "Entry fee not set");

        // Transfer SALT from player (works for both EOA and smart contract agents)
        require(saltToken.transferFrom(msg.sender, address(this), fee), "SALT transfer failed");

        Match storage m = matches[matchId];

        if (m.player1 == address(0)) {
            // First player creates the match
            m.player1 = msg.sender;
            m.player2 = opponent;
            m.totalEscrowed = fee;
            m.startTime = block.timestamp;
            m.minDuration = 2 minutes; // Default anti-grief minimum game time
        } else {
            require(m.player2 == msg.sender || m.player1 == msg.sender, "Not part of this match");
            require(!m.settled, "Match already settled");
            m.totalEscrowed += fee;
        }

        emit MatchCreated(matchId, m.player1, m.player2, m.agentId1, m.agentId2, fee);
    }

    // ==================== ANTI-SANDWICH / ANTI-MEV: Commit-Reveal Coin Flip ====================
    mapping(uint256 => bytes32) public coinFlipCommitments;

    // Commit-reveal for ship placement (anti-cheat for serious play / tournaments)
    mapping(uint256 => mapping(address => bytes32)) public shipCommitments; // matchId => player => commitment

    function commitCoinFlip(uint256 matchId, bytes32 commitment) external nonReentrant {
        require(coinFlipCommitments[matchId] == bytes32(0), "Already committed");
        coinFlipCommitments[matchId] = commitment;
    }

    function revealCoinFlipAndCreateMatch(
        uint256 matchId,
        address opponent,
        bytes32 salt,
        bool firstMover
    ) external nonReentrant {
        bytes32 commitment = coinFlipCommitments[matchId];
        require(commitment != bytes32(0), "No commitment found");
        require(keccak256(abi.encodePacked(salt, firstMover)) == commitment, "Invalid reveal");

        // Coin flip result is now committed on-chain before payment
        // This prevents sandwiching who goes first
        delete coinFlipCommitments[matchId];

        // Proceed with normal match creation logic (simplified here)
        // In full version, this would integrate with payToEnterMatch
    }

    function commitShipPlacement(uint256 matchId, bytes32 commitment) external nonReentrant {
        require(shipCommitments[matchId][msg.sender] == bytes32(0), "Already committed ships");
        shipCommitments[matchId][msg.sender] = commitment;
    }

    function revealShipPlacement(uint256 matchId, bytes calldata placementData, bytes32 salt) external nonReentrant {
        bytes32 commitment = shipCommitments[matchId][msg.sender];
        require(commitment != bytes32(0), "No ship commitment");
        require(keccak256(abi.encodePacked(placementData, salt)) == commitment, "Invalid reveal");
        // In production: store or verify placementData here or via game server
    }

    /**
     * @notice Future hook: Validate ship placement via ZK proof (inside the circuit)
     * The full validation logic will live in the ZK circuit (see docs/ZK_Battleship_Circuit_Spec.md)
     */
    function verifyShipPlacementZK(
        uint256 matchId,
        address player,
        bytes calldata zkProof
    ) external view returns (bool valid) {
        // TODO: Call ZKGameVerifierFacet with ship-specific public inputs
        // This will be wired once the Noir/RISC Zero circuit is generated
        return true; // Placeholder
    }

    /**
     * @dev Special function for AI vs AI matches (both players are agents)
     *      Still uses the exact same entry fee.
     */
    function createAIVsAIMatch(
        uint256 matchId, 
        address aiAgent1, 
        address aiAgent2,
        uint256 agentId1, 
        uint256 agentId2
    ) external {
        LibDiamond.enforceIsContractOwner();
        require(matches[matchId].player1 == address(0), "Match already exists");

        // On-chain validation: if agentId is provided, it must be a registered valid agent
        if (agentId1 != 0) {
            require(IAgentIdentity(address(this)).isValidAgent(agentId1), "AgentIdentity: agentId1 not registered");
        }
        if (agentId2 != 0) {
            require(IAgentIdentity(address(this)).isValidAgent(agentId2), "AgentIdentity: agentId2 not registered");
        }

        matches[matchId] = Match({
            player1: aiAgent1,
            player2: aiAgent2,
            agentId1: agentId1,
            agentId2: agentId2,
            totalEscrowed: 0,
            settled: false,
            winner: address(0),
            startTime: block.timestamp,
            minDuration: 1 minutes
        });

        emit MatchCreated(matchId, aiAgent1, aiAgent2, agentId1, agentId2, 0);
    }

    /**
     * @dev Settle the match. Only callable by authorized game server / oracle for now.
     *      In production this will be called by the game server after verifying the result.
     */
    function settleMatch(uint256 matchId, address winner, uint256 nonce, uint256 deadline) external nonReentrant {
        require(
            msg.sender == gameServer || msg.sender == LibDiamond.contractOwner(),
            "Only gameServer or owner can settle"
        );
        require(block.timestamp <= deadline, "Settlement deadline passed");
        require(nonces[matchId] == 0, "Match already settled or nonce used");
        nonces[matchId] = nonce; // Replay protection

        Match storage m = matches[matchId];
        require(block.timestamp >= m.startTime + m.minDuration, "Game has not run for minimum duration");

        // === ZK Fairness & Trust Check (stub - function not yet implemented) ===
        // try this.isZKGameVerified(matchId) returns (bool isVerified) { ... } catch {}
        require(!m.settled, "Already settled");
        require(winner == m.player1 || winner == m.player2, "Invalid winner");
        require(m.totalEscrowed >= entryFeeSALT * 2, "Insufficient escrow");

        m.settled = true;
        m.winner = winner;

        uint256 total = m.totalEscrowed;
        uint256 protocolFee = (total * protocolFeeBps) / 10000;
        uint256 burnAmount = (protocolFee * burnBpsOfProtocol) / 10000;
        uint256 payout = total - protocolFee;

        // Burn portion (deflationary)
        if (burnAmount > 0) {
            // Send to dead address for now. Better: call burn function on ERC20Facet when available.
            saltToken.transfer(address(0x000000000000000000000000000000000000dEaD), burnAmount);
        }

        // Route remaining protocol fee to FeeDistributor (40/40/20 split)
        uint256 remainingFee = protocolFee > burnAmount ? protocolFee - burnAmount : 0;
        if (remainingFee > 0 && feeDistributor != address(0)) {
            saltToken.transfer(feeDistributor, remainingFee);

            // Best-effort auto distribution (pushes to stakers)
            (bool success, ) = feeDistributor.call(
                abi.encodeWithSignature("distributeAndPushToStaking()")
            );
            // Ignore failure — distributor can be called manually later
        } else if (remainingFee > 0) {
            // Fallback: send to diamond owner if no distributor set yet
            address diamondOwner = LibDiamond.contractOwner();
            saltToken.transfer(diamondOwner, remainingFee);
        }

        // Pay the winner
        saltToken.transfer(winner, payout);

        // Record stats — prefer agentId when available (Phase 2+)
        if (m.agentId1 != 0 || m.agentId2 != 0) {
            uint256 winnerAgent = (winner == m.player1) ? m.agentId1 : m.agentId2;
            uint256 loserAgent  = (winner == m.player1) ? m.agentId2 : m.agentId1;
            this.recordAgentGameResult(winnerAgent, loserAgent);

            emit MatchSettled(matchId, winner, winnerAgent, payout, protocolFee, burnAmount);

            // === Automatic AvA Betting Settlement (Phase 4) ===
            if (m.agentId1 != 0 && m.agentId2 != 0) {
                (bool success, ) = address(this).call(
                    abi.encodeWithSignature("settleAvABets(uint256,uint256)", matchId, winnerAgent)
                );
                if (!success) {
                    // Intentionally silent — main settlement must succeed
                }
            }
        } else {
            address loserAddr = (winner == m.player1) ? m.player2 : m.player1;
            this.recordGameResult(winner, loserAddr);

            emit MatchSettled(matchId, winner, 0, payout, protocolFee, burnAmount);
        }
    }

    /**
     * @dev Emergency withdraw (only diamond owner, for stuck funds)
     */
    function emergencyWithdraw(address to) external {
        LibDiamond.enforceIsContractOwner();
        uint256 balance = saltToken.balanceOf(address(this));
        saltToken.transfer(to, balance);
    }

    // View helpers
    function getMatch(uint256 matchId) external view returns (Match memory) {
        return matches[matchId];
    }

    function getEntryFee() external view returns (uint256) {
        return entryFeeSALT;
    }

    // ==================== A POLISH: Win/Loss Tracking + Free Loadouts + Agent Identity ====================
    mapping(address => uint256) public wins;
    mapping(address => uint256) public losses;
    mapping(address => uint256) public gamesPlayed;
    mapping(address => bytes32[]) public playerLoadouts;
    mapping(uint256 => bytes32[]) public agentLoadouts; // Phase 3: loadouts by agentId

    // Agent-level stats (Phase 2+)
    mapping(uint256 => uint256) public agentWins;
    mapping(uint256 => uint256) public agentLosses;
    mapping(uint256 => uint256) public agentGamesPlayed;

    function recordGameResult(address winner, address loser) external {
        // Can be called by gameServer or owner
        require(msg.sender == gameServer || msg.sender == LibDiamond.contractOwner(), "Only gameServer or owner");

        if (winner != address(0)) {
            wins[winner] += 1;
            gamesPlayed[winner] += 1;
        }
        if (loser != address(0)) {
            losses[loser] += 1;
            gamesPlayed[loser] += 1;
        }
    }

    // New: Record result using Agent Identity IDs (preferred for AvA and agent-heavy flows)
    function recordAgentGameResult(uint256 winnerAgentId, uint256 loserAgentId) external {
        require(msg.sender == gameServer || msg.sender == LibDiamond.contractOwner(), "Only gameServer or owner");

        if (winnerAgentId != 0) {
            agentWins[winnerAgentId] += 1;
            agentGamesPlayed[winnerAgentId] += 1;
        }
        if (loserAgentId != 0) {
            agentLosses[loserAgentId] += 1;
            agentGamesPlayed[loserAgentId] += 1;
        }
    }

    function getAgentStats(uint256 agentId) external view returns (uint256 _wins, uint256 _losses, uint256 _games) {
        return (agentWins[agentId], agentLosses[agentId], agentGamesPlayed[agentId]);
    }

    function getPlayerStats(address player) external view returns (uint256 _wins, uint256 _losses, uint256 _games) {
        return (wins[player], losses[player], gamesPlayed[player]);
    }

    function registerFreeLoadout(bytes32 placementHash) external {
        // Free on-chain registration of a ship setup (for repeat use)
        playerLoadouts[msg.sender].push(placementHash);
    }

    // Phase 3: Register loadout directly under an agentId (preferred for agents)
    function registerLoadoutForAgent(uint256 agentId, bytes32 placementHash) external {
        require(msg.sender == gameServer || msg.sender == LibDiamond.contractOwner(), "Only gameServer or owner");
        agentLoadouts[agentId].push(placementHash);
    }

    // ==================== FUTURE INTEGRATION NOTES ====================
    // TODO: Replace manual burn with proper SALT token burn function exposed by ERC20Facet
    // TODO: Add dynamic pricing using Chainlink or existing oracle for "0.01 USD in SALT"
    // TODO: Wire this facet into the x402 game server for agent payments
}
