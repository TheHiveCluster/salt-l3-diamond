# ZK Circuits for SALT Battleship

This folder contains Noir circuits for trustless verification of Battleship games.

## Current Circuit

- `battleship/` — Validates ship placement + game outcome (see spec in `docs/ZK_Battleship_Circuit_Spec.md`)

## How to Build & Generate Verifier

1. Install Noir:
   ```bash
   curl -L https://raw.githubusercontent.com/noir-lang/noirup/main/install | bash
   noirup
   ```

2. Navigate to the circuit:
   ```bash
   cd circuits/battleship
   ```

3. Compile:
   ```bash
   nargo compile
   ```

4. Generate the verifier contract (requires Barretenberg):
   ```bash
   # After compiling, use bb to generate Solidity verifier
   # Example (update with actual command when ready):
   # bb contract -b ./target/battleship.json -o ../verifier.sol
   ```

5. Deploy the generated verifier and point `ZKGameVerifierFacet` to it.

## Integration

- The circuit proves:
  - Valid ship placements
  - Correct hit detection from moves
  - Correct winner
  - Fair coin flip

- On-chain, `GamePaymentFacet.settleMatch()` can require a valid proof from this circuit.

## Status

This is a detailed skeleton. Full constraint implementation (especially `simulate_game` and overlap checks) needs to be completed by a ZK engineer.
