# Agent Identity Design Decisions (SALT L3)

**Date**: 2026-05-24  
**Status**: Phase 0 – Decisions Locked

## 1. Registry Approach: Custom Lighter Version (Optimized for Diamond)

**Decision**: Build a custom `AgentIdentityFacet` that is **inspired by ERC-8004** but lighter and tailored to our Diamond architecture.

**Rationale**:
- We already have strong on-chain reputation (`GamePaymentFacet` win/loss stats).
- We already have ZK validation infrastructure (`ZKGameVerifierFacet`).
- Full ERC-8004 (Identity + Reputation + Validation registries) would duplicate existing logic.
- We want to move fast on AvA betting + Hero NFTs + agent ownership.

**Future Compatibility**:
- The facet is designed so it can evolve toward full ERC-8004 compliance later.
- We will follow similar patterns:
  - `agentId` as the core identifier
  - `agentURI` pointing to off-chain registration metadata
  - Support for on-chain metadata
  - Clear events for indexing

## 2. Agent ID Format: Incremental uint256

**Decision**: Use simple **incremental `uint256` agentId**.

**Format**:
- `agentId` = 1, 2, 3, ... (auto-incremented on registration)
- For external references we can later expose a global identifier string: `eip155:{chainId}:{diamondAddress}:{agentId}`

**Rationale**:
- Gas efficient
- Easy to list and paginate
- Simple for matchmaking and UI
- Matches how `nextMatchId` already works in `GamePaymentFacet`

## 3. Registration Model: Hybrid (Game Server First + Future Self-Registration)

**Decision**: 
- **Phase 1–4**: Game server (authorized via `setGameServer`) can register agents.
- **Later phases**: Support signature-based self-registration for true agent autonomy (EIP-712 + ERC-1271).

**Current Allowed Registrars**:
- Diamond owner
- Game server address (set via `setGameServer` in GamePaymentFacet)

**Future Path**:
- Add `registerAsAgent(bytes signature)` for agents to self-register using their own private key or smart contract wallet.

## 4. Core Data Model

```solidity
struct Agent {
    uint256 agentId;
    address controller;           // Who currently controls this agent
    string agentURI;              // Points to off-chain metadata (IPFS / HTTPS)
    uint256 registeredAt;
    bool active;
}

mapping(uint256 => Agent) public agents;
mapping(address => uint256[]) public agentsByController;
uint256 public nextAgentId = 1;
```

Additional planned extensions (Phase 3+):
- Linked Hero NFTs
- Registered loadout hashes
- On-chain reputation snapshot (cached from GamePaymentFacet)

## 5. Integration Points (High Level)

- **GamePaymentFacet**: Will store `agentId` instead of (or in addition to) raw addresses in `Match` struct.
- **NFTManagerFacet**: Will support binding Heroes to `agentId`.
- **Game Server**: Will pass and validate `agentId` for AvA matches.
- **Frontend**: Will display real `agentId` + on-chain stats in AvA betting views.

## Next Steps

- Proceed to **Phase 1**: Implement `AgentIdentityFacet.sol`
- Update `GamePaymentFacet` to reference agent identities
- Add basic registration + viewing in the dApp

---

**Decisions Locked by**: User + opencode on 2026-05-24
