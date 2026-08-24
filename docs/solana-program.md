# Solana program specification

The `programs/aura_protocol` Anchor source contains the ownership, WiFi DePIN registry, profile, quest, staking, epoch, and claim state-machine slice. It is ready for local/devnet deployment work after Anchor/Solana CLI setup.

## Accounts and PDAs

| Account | Seed | Purpose |
|---|---|---|
| Protocol | `protocol` | Authority, reward authority, fee configuration, pause state, counter |
| Operator | `operator`, wallet | Network operator authority and status |
| Network | `network`, network_id | Operator ownership, metadata commitment, state, timestamps |

## Implemented instructions

- `initialize_protocol(fee_basis_points)` validates the fee cap and initializes authority state.
- `register_operator()` creates an operator PDA for the signing wallet.
- `register_network(network_id, metadata_hash)` requires the operator signer and begins at `PROBATION`.
- `set_network_state(state)` is authority-gated and honors the protocol pause control.
- `set_protocol_paused(paused)` is authority-gated.

## Not implemented yet

USDC provider deposits, reward epoch publication, Merkle claim verification, transfer-network, role-separated reward authority, and multisig governance are mandatory before a value-bearing deployment. They are deliberately absent rather than represented with unsafe placeholder code.

## Deployment sequence

1. Install a pinned Solana CLI and Anchor version; replace the placeholder program ID with `anchor keys list` output.
2. Run `anchor build`, local-validator tests, and `anchor test`.
3. Deploy to devnet using a dedicated deployment authority—not a personal browser wallet.
4. Validate PDAs, program upgrade authority, indexer reconciliation, and gateway-to-chain registration.
5. Audit before any mainnet-beta program deployment or treasury funding.
