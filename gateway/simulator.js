const crypto = require('crypto');

const networkId = process.argv[2];
if (!networkId) throw new Error('Usage: node gateway/simulator.js <network-id>');

const endpoint = process.env.AURA_API || 'http://localhost:3000';
const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
const deviceId = `gw_${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`;
const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' });
const api = async (route, payload) => {
  const res = await fetch(`${endpoint}${route}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error);
  return json.data;
};
const signReport = (report) => crypto.sign(null, Buffer.from(JSON.stringify(report)), privateKey).toString('base64');

(async () => {
  await api(`/v1/networks/${networkId}/devices/register`, {
    deviceId,
    publicKey: publicKeyPem,
    model: 'Aura Gateway DevKit',
    firmware: '0.1.0-local'
  });
  const report = {
    deviceId,
    counter: 1,
    timestamp: new Date().toISOString(),
    nonce: crypto.randomUUID(),
    latencyMs: 28,
    uptime: 99.2,
    clientCount: 3
  };
  const heartbeat = await api(`/v1/networks/${networkId}/heartbeat`, { ...report, signature: signReport(report) });
  console.log(JSON.stringify({ deviceId, heartbeat }, null, 2));
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
