// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {LibDiamond} from "../libraries/LibDiamond.sol";
import {IERC20} from "../interfaces/IERC20.sol";

/**
 * @title AgentIdentityFacet
 * @dev Provides on-chain identity for autonomous AI agents (ERC-8004 inspired).
 *
 * This is a custom, lighter implementation optimized for the SALT Diamond.
 * It can evolve toward full ERC-8004 compliance in the future.
 *
 * Every agent gets a unique incremental agentId.
 * Agents can be controlled by EOAs or other contracts.
 */
contract AgentIdentityFacet {
    event AgentRegistered(
        uint256 indexed agentId,
        address indexed controller,
        string agentURI
    );

    event AgentURIUpdated(
        uint256 indexed agentId,
        string newAgentURI,
        address indexed updatedBy
    );

    event AgentControllerUpdated(
        uint256 indexed agentId,
        address indexed oldController,
        address indexed newController
    );

    struct Agent {
        uint256 agentId;
        address controller;
        string agentURI;
        uint256 registeredAt;
        bool active;
    }

    mapping(uint256 => Agent) public agents;
    mapping(address => uint256[]) public agentsByController;

    // Phase 3: Assets & Capabilities bound to agent
    mapping(uint256 => uint256[]) public agentHeroes;           // agentId => list of Hero tokenIds
    mapping(uint256 => bytes32[]) public agentLoadouts;         // agentId => list of loadout hashes
    mapping(uint256 => uint256) public heroToAgent;             // heroTokenId => agentId (for quick lookup)

    uint256 public nextAgentId = 1;

    address public gameServer;

    // Only owner or authorized game server can register agents (Phase 1-2)
    modifier onlyAuthorizedRegistrar() {
        require(
            msg.sender == LibDiamond.contractOwner() ||
            (gameServer != address(0) && msg.sender == gameServer),
            "AgentIdentity: not authorized registrar"
        );
        _;
    }

    function setGameServer(address _gameServer) external {
        LibDiamond.enforceIsContractOwner();
        gameServer = _gameServer;
    }

    /**
     * @notice Register a new agent identity.
     * @param controller The address that controls this agent (can be EOA or contract)
     * @param agentURI URI pointing to off-chain agent registration metadata
     */
    function registerAgent(address controller, string calldata agentURI)
        external
        onlyAuthorizedRegistrar
        returns (uint256 agentId)
    {
        require(controller != address(0), "AgentIdentity: invalid controller");
        require(bytes(agentURI).length > 0, "AgentIdentity: agentURI required");

        agentId = nextAgentId++;

        agents[agentId] = Agent({
            agentId: agentId,
            controller: controller,
            agentURI: agentURI,
            registeredAt: block.timestamp,
            active: true
        });

        agentsByController[controller].push(agentId);

        emit AgentRegistered(agentId, controller, agentURI);
    }

    /**
     * @notice Update the agentURI for an existing agent.
     */
    function setAgentURI(uint256 agentId, string calldata newAgentURI) external {
        Agent storage agent = agents[agentId];
        require(agent.active, "AgentIdentity: agent does not exist");
        require(
            msg.sender == agent.controller || msg.sender == LibDiamond.contractOwner(),
            "AgentIdentity: not controller"
        );

        agent.agentURI = newAgentURI;
        emit AgentURIUpdated(agentId, newAgentURI, msg.sender);
    }

    /**
     * @notice Transfer control of an agent to a new controller.
     */
    function transferAgentControl(uint256 agentId, address newController) external {
        Agent storage agent = agents[agentId];
        require(agent.active, "AgentIdentity: agent does not exist");
        require(msg.sender == agent.controller, "AgentIdentity: not current controller");
        require(newController != address(0), "AgentIdentity: invalid new controller");

        address oldController = agent.controller;
        agent.controller = newController;

        // Update reverse mapping
        // (Simple implementation - can be optimized later with better data structures)
        uint256[] storage oldList = agentsByController[oldController];
        for (uint256 i = 0; i < oldList.length; i++) {
            if (oldList[i] == agentId) {
                oldList[i] = oldList[oldList.length - 1];
                oldList.pop();
                break;
            }
        }
        agentsByController[newController].push(agentId);

        emit AgentControllerUpdated(agentId, oldController, newController);
    }

    // ==================== VIEW FUNCTIONS ====================

    function getAgent(uint256 agentId) external view returns (Agent memory) {
        return agents[agentId];
    }

    function getAgentsByController(address controller) external view returns (uint256[] memory) {
        return agentsByController[controller];
    }

    function isValidAgent(uint256 agentId) external view returns (bool) {
        return agents[agentId].active;
    }

    function getAgentController(uint256 agentId) external view returns (address) {
        return agents[agentId].controller;
    }

    // ==================== PHASE 3: BINDING HEROES & LOADOUTS ====================

    function addHeroToAgent(uint256 agentId, uint256 heroTokenId) external {
        Agent storage agent = agents[agentId];
        require(agent.active, "AgentIdentity: agent does not exist");
        require(msg.sender == agent.controller || msg.sender == LibDiamond.contractOwner(), "Not authorized");

        agentHeroes[agentId].push(heroTokenId);
        heroToAgent[heroTokenId] = agentId;   // reverse mapping for fast lookup
    }

    function registerLoadoutForAgent(uint256 agentId, bytes32 loadoutHash) external {
        Agent storage agent = agents[agentId];
        require(agent.active, "AgentIdentity: agent does not exist");
        require(msg.sender == agent.controller || msg.sender == LibDiamond.contractOwner(), "Not authorized");

        agentLoadouts[agentId].push(loadoutHash);
    }

    function getAgentHeroes(uint256 agentId) external view returns (uint256[] memory) {
        return agentHeroes[agentId];
    }

    function getAgentLoadouts(uint256 agentId) external view returns (bytes32[] memory) {
        return agentLoadouts[agentId];
    }

    function getAgentForHero(uint256 heroTokenId) external view returns (uint256) {
        return heroToAgent[heroTokenId];
    }

    // ==================== PHASE 3+: Agents can mint their own Heroes directly ====================
    mapping(uint256 => uint256) public lastHeroMintTime; // agentId => timestamp

    /**
     * @notice Allows the controller of an agent (or game server) to mint a Hero directly for that agent.
     * The actual NFT mint + binding happens inside the GamingAssetNFT.
     * Has a small cost and daily rate limit for economic security.
     */
    function mintHeroForAgent(
        uint256 agentId,
        address nftContract,
        uint256 tokenId,
        string calldata tokenURI,
        bytes calldata attributes
    ) external {
        Agent storage agent = agents[agentId];
        require(agent.active, "AgentIdentity: agent does not exist");
        require(
            msg.sender == agent.controller || msg.sender == gameServer || msg.sender == LibDiamond.contractOwner(),
            "AgentIdentity: not authorized to mint for this agent"
        );

        // Rate limit: max 1 hero per agent per 24 hours
        require(block.timestamp >= lastHeroMintTime[agentId] + 1 days, "AgentIdentity: hero mint cooldown active");

        // Small economic cost: 0.05 SALT (sent to diamond, can be distributed later)
        uint256 mintCost = 5 * 1e16; // 0.05 SALT
        IERC20(address(this)).transferFrom(msg.sender, address(this), mintCost);

        lastHeroMintTime[agentId] = block.timestamp;

        // Call the GamingAssetNFT to mint and auto-bind
        (bool success, ) = nftContract.call(
            abi.encodeWithSignature(
                "mintForAgent(uint256,uint256,string,bytes)",
                agentId,
                tokenId,
                tokenURI,
                attributes
            )
        );
        require(success, "AgentIdentity: mintForAgent call failed");
    }
}
