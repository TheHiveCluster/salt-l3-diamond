// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {LibDiamond} from "../libraries/LibDiamond.sol";
import {IERC20} from "../interfaces/IERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title AvABettingFacet (Minimal v1)
 * @dev On-chain betting for Agent vs Agent matches.
 *
 * Simple parimutuel-style betting on which agent wins an AvA match.
 * Only the authorized game server can settle bets after the match result is known.
 */
contract AvABettingFacet is ReentrancyGuard {

    event BetPlaced(
        uint256 indexed matchId,
        uint256 indexed agentId,
        address indexed better,
        uint256 amount
    );

    event AvABetsSettled(
        uint256 indexed matchId,
        uint256 winningAgentId,
        uint256 totalPool
    );

    address internal gameServer;
    IERC20 internal saltToken;

    // matchId => agentId => total amount bet on that agent
    mapping(uint256 => mapping(uint256 => uint256)) public betPools;

    // matchId => agentId => user => amount bet by user
    mapping(uint256 => mapping(uint256 => mapping(address => uint256))) public userBets;

    // Prevent double settlement
    mapping(uint256 => bool) public betsSettled;

    mapping(uint256 => uint256) public matchTotalPool;
    mapping(uint256 => uint256) public matchWinner;

    function ava_setGameServer(address _gameServer) external {
        LibDiamond.enforceIsContractOwner();
        gameServer = _gameServer;
    }

    function ava_setSaltToken(address _salt) external {
        LibDiamond.enforceIsContractOwner();
        saltToken = IERC20(_salt);
    }

    function ava_getGameServer() external view returns (address) {
        return gameServer;
    }

    function ava_getSaltToken() external view returns (address) {
        return address(saltToken);
    }

    /**
     * @notice Place a bet on a specific agent in an AvA match.
     */
    function placeBet(uint256 matchId, uint256 onAgentId, uint256 amount) external nonReentrant {
        require(amount > 0, "AvABetting: amount must be > 0");
        require(!betsSettled[matchId], "AvABetting: betting closed for this match");

        require(saltToken.transferFrom(msg.sender, address(this), amount), "AvABetting: SALT transfer failed");

        betPools[matchId][onAgentId] += amount;
        userBets[matchId][onAgentId][msg.sender] += amount;
        matchTotalPool[matchId] += amount;

        emit BetPlaced(matchId, onAgentId, msg.sender, amount);
    }

    /**
     * @notice Settle all bets for an AvA match. Records the winner.
     * Actual proportional distribution happens on claim.
     */
    function settleAvABets(uint256 matchId, uint256 winningAgentId) external nonReentrant {
        require(msg.sender == gameServer || msg.sender == LibDiamond.contractOwner(), "Only gameServer");
        require(!betsSettled[matchId], "Already settled");

        matchWinner[matchId] = winningAgentId;
        betsSettled[matchId] = true;

        emit AvABetsSettled(matchId, winningAgentId, matchTotalPool[matchId]);
    }

    /**
     * @notice Claim winnings using proper parimutuel distribution.
     * Winners on the winning side proportionally share the entire pool.
     */
    function claimWinnings(uint256 matchId, uint256 winningAgentId) external nonReentrant {
        require(betsSettled[matchId], "Match not yet settled");
        require(matchWinner[matchId] == winningAgentId, "Incorrect winning agent");

        uint256 userBet = userBets[matchId][winningAgentId][msg.sender];
        require(userBet > 0, "No winning bet on this agent");

        uint256 winningPool = betPools[matchId][winningAgentId];
        uint256 totalPool = matchTotalPool[matchId];

        require(winningPool > 0, "No bets on winning agent");

        // Proportional distribution: (userBet / winningPool) * totalPool
        uint256 payout = (userBet * totalPool) / winningPool;

        userBets[matchId][winningAgentId][msg.sender] = 0;

        require(saltToken.transfer(msg.sender, payout), "Payout failed");
    }

    /**
     * @notice Returns key betting info for a match for frontend display.
     * Pass the two agentIds that were used in the AvA match.
     */
    function getAvABettingInfo(uint256 matchId, uint256 agentId1, uint256 agentId2) 
        external 
        view 
        returns (
            uint256 totalPool,
            uint256 agent1Pool,
            uint256 agent2Pool,
            uint256 winningAgentId,
            bool settled
        )
    {
        totalPool = matchTotalPool[matchId];
        agent1Pool = betPools[matchId][agentId1];
        agent2Pool = betPools[matchId][agentId2];
        winningAgentId = matchWinner[matchId];
        settled = betsSettled[matchId];
    }

    /**
     * @notice Returns how much a specific user has bet on a given agent in a match.
     */
    function getUserBet(uint256 matchId, uint256 agentId, address user) 
        external 
        view 
        returns (uint256) 
    {
        return userBets[matchId][agentId][user];
    }

    /**
     * @notice Convenience view for the connected user's bets on both sides.
     */
    function getUserBets(uint256 matchId, address user, uint256 agentId1, uint256 agentId2) 
        external 
        view 
        returns (uint256 betOn1, uint256 betOn2) 
    {
        betOn1 = userBets[matchId][agentId1][user];
        betOn2 = userBets[matchId][agentId2][user];
    }
}
