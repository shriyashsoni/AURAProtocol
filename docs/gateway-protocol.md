# Gateway heartbeat protocol

The local `gateway/simulator.js` models the authenticated shape; it is not a production gateway daemon.

## Required report fields

```json
{
  "deviceId": "gw_…",
  "counter": 42,
  "timestamp": "2026-08-24T11:04:11.016Z",
  "nonce": "uuid",
  "latencyMs": 28,
  "uptime": 99.2,
  "signature": "base64-ed25519-signature",
  "publicKey": "PEM-SPKI"
}
```

## Server verification

1. Validate field types and reject malformed metrics.
2. Require timestamp within five minutes of receipt.
3. Reject a counter that does not increase for the same device.
4. Reject a previously observed nonce.
5. Verify the Ed25519 signature over the canonical report body.
6. Only then change the network from `PROBATION` to `ACTIVE`.

Production must bind public keys during device registration, not trust a new public key in the report. It should use canonical serialization, mTLS or a dedicated device channel, persistent replay state, revocation checks, a secure element/TPM where available, and a signed update mechanism.
