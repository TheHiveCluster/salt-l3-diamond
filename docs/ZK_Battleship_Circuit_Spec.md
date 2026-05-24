# ZK Circuit Spec: Battleship Ship Placement + Game Result Validation

## Goal
Prove on-chain (via ZK) that:
1. Both players placed valid ships (no overlaps, correct lengths, within board).
2. All moves were legal.
3. The final result (winner) is correct based on the move sequence.
4. The coin flip was fairly executed.

This allows trustless settlement even when AI agents are involved.

## Public Inputs (visible on-chain)
- matchId (uint256)
- player1 (address)
- player2 (address)
- winner (address)
- finalGameHash (bytes32)          // Hash of entire transcript
- coinFlipResult (bool)            // Who went first
- numMoves (uint256)

## Private Inputs (hidden, only in proof)
- Player1 ship positions (5 ships: lengths [5,4,3,3,2])
- Player2 ship positions
- Sequence of moves (array of [x, y, isHit])
- Salt used for commitments

## Constraints (what the circuit must enforce)

### Ship Placement Rules
- Each ship must have exact length.
- No two ships overlap.
- All ships within 0-9 x 0-9 board.
- Ships are either horizontal or vertical (no diagonal).
- Exactly 5 ships per player.

### Move Legality
- No duplicate moves by the same player.
- A move can only be made on the opponent's turn.
- Hit detection must match the private ship placement.

### Outcome Correctness
- If all of one player's ships are fully hit → that player loses.
- The declared winner must be correct.
- All moves after the game should have ended are invalid.

### Coin Flip Fairness
- The revealed coin flip must match the on-chain commitment.

## Suggested Implementation

**Recommended Tooling:**
- **Noir** (by Aztec) - Easiest for EVM + good developer experience
- Alternative: RISC Zero or SP1 (for Rust-based circuits)

**High-level Noir circuit structure (pseudocode):**

```rust
fn main(
    // Public
    match_id: pub Field,
    winner: pub Field,
    game_hash: pub Field,
    // Private
    player1_ships: [Ship; 5],
    player2_ships: [Ship; 5],
    moves: [Move; MAX_MOVES],
    coin_flip_salt: Field,
) {
    // 1. Validate ship placements
    assert_valid_ships(player1_ships);
    assert_valid_ships(player2_ships);

    // 2. Simulate all moves against private boards
    let mut p1_hits = 0;
    let mut p2_hits = 0;
    // ... loop through moves and count hits

    // 3. Determine winner from hit counts
    let calculated_winner = if p1_hits == TOTAL_SHIP_CELLS { player2 } else { player1 };
    assert(calculated_winner == winner);

    // 4. Verify coin flip commitment
    // ...
}
```

## On-Chain Integration (already partially in our facets)

- `commitShipPlacement(matchId, hash)` — stores commitment
- `ZKGameVerifierFacet.verifyGameResult(...)` — will eventually call the real verifier with the above public inputs
- `GamePaymentFacet.settleMatch(...)` — only succeeds if ZK proof is valid

## Next Steps for Circuit

1. Define exact `Ship` and `Move` structs in Noir.
2. Implement `assert_valid_ships` function (check lengths, bounds, no overlap).
3. Generate verifier contract using `noir` + `bb` (Barretenberg).
4. Point `ZKGameVerifierFacet.zkVerifierContract` to the generated verifier.

This spec can be used directly by a ZK engineer to implement the circuit.
