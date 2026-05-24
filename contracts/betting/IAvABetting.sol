// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IAvABetting {
    function setGameServer(address _gameServer) external;
    function setSaltToken(address _salt) external;

    function placeBet(uint256 matchId, uint256 onAgentId, uint256 amount) external;
    function settleAvABets(uint256 matchId, uint256 winningAgentId) external;
    function claimWinnings(uint256 matchId, uint256 winningAgentId) external;

    function betPools(uint256 matchId, uint256 agentId) external view returns (uint256);
    function matchWinner(uint256 matchId) external view returns (uint256);
    function betsSettled(uint256 matchId) external view returns (bool);

    function getAvABettingInfo(uint256 matchId, uint256 agentId1, uint256 agentId2) 
        external 
        view 
        returns (
            uint256 totalPool,
            uint256 agent1Pool,
            uint256 agent2Pool,
            uint256 winningAgentId,
            bool settled
        );

    function getUserBet(uint256 matchId, uint256 agentId, address user) external view returns (uint256);
    function getUserBets(uint256 matchId, address user, uint256 agentId1, uint256 agentId2) external view returns (uint256 betOn1, uint256 betOn2);
}
