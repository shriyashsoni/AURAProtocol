# Aura Protocol prototype

This is a local, working vertical-slice prototype for Aura Protocol. It now includes the public site, private console, Node backend, local chain ledger adapter, gateway simulator, tests, and Anchor smart-contract source.

## What works locally

1. Create an operator with `POST /v1/operators`.
2. Create a venue with `POST /v1/venues`.
3. Register a network with `POST /v1/networks`.
4. Register a gateway public key with `POST /v1/networks/:id/devices/register`.
5. Submit a signed gateway heartbeat with `POST /v1/networks/:id/heartbeat`.
6. Start and complete a verified access session with `POST /v1/sessions`.
7. Close a local reward epoch with `POST /v1/epochs/close`.
8. Run the growth game with profiles, local Twitter linking, quests, staking, claiming, and leaderboard state.
9. Auto-record local chain receipts for profile creation, epoch publication, and campaign claims.
10. Manually sync profiles, epochs, and claims through `/v1/chain/sync/*`.
11. The console shows active networks, gateways, verified usage, and settlement preview state.

Run `npm run dev`, then open `http://localhost:3000/dashboard.html`.
Open `http://localhost:3000/game.html` for the Aura Quest Arena.

Copy `.env.example` to `.env` before client demos if you want fixed port, admin token, Solana RPC, program id, and wallet path configuration.

## Chain/backend commands

```bash
npm run chain:check
node scripts/aura-cli.js status
node scripts/aura-cli.js bootstrap "Demo Operator"
```

Smart-contract and deployment details live in [docs/backend-smart-contracts.md](docs/backend-smart-contracts.md).
If you do not want Solana/Anchor tools installed locally, use [docs/no-local-smart-contract-deploy.md](docs/no-local-smart-contract-deploy.md).

## Verification

```bash
npm test
```

The automated tests cover gateway registration, signed telemetry, replay rejection, verified sessions, reward epoch creation, profile claiming, social linking, quests, staking, claims, and leaderboard scoring.

## Gateway simulator

After creating a network from the console or API, run:

```bash
node gateway/simulator.js <network-id>
```

The simulator creates an Ed25519 keypair, registers the public key, signs a telemetry report, and sends it to the local API.

Data is written to `prototype-data.json`, which is local development data only and should not be treated as production records.

## Before deployment

Do not deploy this directly to mainnet. The production path needs the items in [docs/production-readiness.md](docs/production-readiness.md), an audited Anchor program, tested SPL-token settlement, role-separated multisig authority, staging, monitoring, legal/compliance review, and real gateway firmware enrollment.
