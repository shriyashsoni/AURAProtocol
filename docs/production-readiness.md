# Production readiness gate

The phrase “live network” should only be used after all gates below pass.

## Protocol

- Anchor program reviewed and tested for signer, owner, PDA seed, mint, arithmetic, pause, and duplicate-claim conditions.
- Devnet deployment passes end-to-end host, heartbeat, epoch, and claim tests.
- Upgrade authority, treasury, and reward authority are role-separated multisigs.

## Platform

- PostgreSQL migrations, encrypted backups, retention policy, structured logs, tracing, alerts, and incident runbook.
- API authentication, rate limits, CSRF/CORS/headers, server-side RBAC, audit logs, and secret manager.
- Gateway signed releases, checksums, rollback, device revocation, replay protection, and secure update channel.

## Operational and legal

- A real pilot operator completes host registration and gateway setup.
- Privacy policy, host terms, data processing, tax, telecom, and local access requirements are reviewed for each launch region.
- No token, return, price, or token-allocation claim is published before compliant and finalized design.
