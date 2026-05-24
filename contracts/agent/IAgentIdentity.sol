// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IAgentIdentity {
    struct Agent {
        uint256 agentId;
        address controller;
        string agentURI;
        uint256 registeredAt;
        bool active;
    }

    event AgentRegistered(uint256 indexed agentId, address indexed controller, string agentURI);
    event AgentURIUpdated(uint256 indexed agentId, string newAgentURI, address indexed updatedBy);
    event AgentControllerUpdated(uint256 indexed agentId, address indexed oldController, address indexed newController);

    function registerAgent(address controller, string calldata agentURI) external returns (uint256 agentId);
    function setAgentURI(uint256 agentId, string calldata newAgentURI) external;
    function transferAgentControl(uint256 agentId, address newController) external;

    function getAgent(uint256 agentId) external view returns (Agent memory);
    function getAgentsByController(address controller) external view returns (uint256[] memory);
    function isValidAgent(uint256 agentId) external view returns (bool);
    function getAgentController(uint256 agentId) external view returns (address);

    function nextAgentId() external view returns (uint256);

    function gameServer() external view returns (address);
    function setGameServer(address _gameServer) external;

    // Phase 3: Asset & Loadout binding
    function addHeroToAgent(uint256 agentId, uint256 heroTokenId) external;
    function registerLoadoutForAgent(uint256 agentId, bytes32 loadoutHash) external;
    function getAgentHeroes(uint256 agentId) external view returns (uint256[] memory);
    function getAgentLoadouts(uint256 agentId) external view returns (bytes32[] memory);

    function getAgentForHero(uint256 heroTokenId) external view returns (uint256 agentId);

    // Agents can mint their own Heroes
    function mintHeroForAgent(
        uint256 agentId,
        address nftContract,
        uint256 tokenId,
        string calldata tokenURI,
        bytes calldata attributes
    ) external;
}
