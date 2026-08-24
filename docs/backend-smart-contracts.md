# Aura Protocol backend and smart-contract runbook

Aura Protocol now has three backend layers:

1. **Local API ledger** in `server.js` for a fully working client-demo prototype.
2. **Chain adapter** in `lib/onchain.js` for local receipts today and Solana-ready sync calls tomorrow.
3. **Anchor program source** in `programs/aura_protocol/src/lib.rs` for protocol, operator, network, epoch, profile, quest, stake, and claim accounts.

## Runtime config

Copy `.env.example` to `.env` and edit local values:

```bash
PORT=3057
AURA_CHAIN_MODE=local
AURA_AUTO_SYNC=true
AURA_ADMIN_TOKEN=change-me-before-client-demo
AURA_SOLANA_RPC_URL=https://api.devnet.solana.com
AURA_PROGRAM_ID=REPLACE_WITH_DEPLOYED_AURA_PROTOCOL_PROGRAM_ID
AURA_WALLET_KEYPAIR=C:\path\to\your\solana-keypair.json
AURA_TREASURY_WALLET=REPLACE_WITH_TREASURY_PUBLIC_KEY
```

Do not paste private keys into chat or frontend files. Keep the Solana JSON keypair as a local file and only reference its path.

## API routes

Core prototype:

- `GET /v1/status`
- `GET /v1/overview`
- `POST /v1/operators`
- `POST /v1/venues`
- `POST /v1/networks`
- `POST /v1/networks/:id/devices/register`
- `POST /v1/networks/:id/heartbeat`
- `POST /v1/sessions`
- `POST /v1/sessions/:id/complete`
- `POST /v1/epochs/close`

Quest economy:

- `GET /v1/game`
- `POST /v1/profiles`
- `POST /v1/profiles/:id/link-twitter`
- `POST /v1/quests/:id/complete`
- `POST /v1/profiles/:id/stake`
- `POST /v1/profiles/:id/claim`

Chain adapter:

- `GET /v1/chain/status`
- `POST /v1/chain/sync/profile`
- `POST /v1/chain/sync/epoch`
- `POST /v1/chain/sync/claim`

When `AURA_AUTO_SYNC=true`, profile creation, epoch close, and reward claim automatically write deterministic local chain receipts. When `AURA_CHAIN_MODE=solana`, the adapter validates wallet/program configuration and prepares for real submission.

## Smart-contract accounts

- `Protocol`: authority, reward authority, fees, pause state, network/profile counts.
- `Operator`: operator authority and deployment status.
- `Network`: registered DePIN network with metadata hash and lifecycle state.
- `RewardEpoch`: compact epoch root for verified usage settlement.
- `ClaimReceipt`: network reward claim receipt.
- `Campaign`: quest/game economy aggregate state.
- `Profile`: wallet-owned profile with social hash and points balances.
- `QuestReceipt`: one on-chain receipt per completed quest hash.
- `StakePosition`: locked campaign points.
- `CampaignClaim`: user claim receipt for campaign rewards.

## Deploy path

Install the missing deployment tools on the machine:

```bash
cargo install --git https://github.com/coral-xyz/anchor avm --locked
avm install latest
avm use latest
```

Install Solana CLI, generate or provide a local keypair, fund it on devnet, then update `.env` and `Anchor.toml`.

Check readiness:

```bash
npm run chain:check
```

Build/deploy after toolchain is ready:

```bash
anchor keys sync
anchor build
anchor deploy --provider.cluster devnet
```

After deploy, set `AURA_PROGRAM_ID` to the deployed id and restart the API.

## Current local limitation

This Windows environment currently has `cargo`, but not `anchor`, not `solana`, and Rust build currently stops because `dlltool.exe` is missing. Install the Solana/Anchor toolchain and a GNU binutils provider before final devnet deployment checks.
