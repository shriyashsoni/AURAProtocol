const endpoint = process.env.AURA_API || 'http://localhost:3057';

const post = async (route, payload = {}) => {
  const res = await fetch(`${endpoint}${route}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json.data;
};

const get = async (route) => {
  const res = await fetch(`${endpoint}${route}`);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json.data || json;
};

const command = process.argv[2];

(async () => {
  if (command === 'status') return console.log(JSON.stringify(await get('/v1/chain/status'), null, 2));
  if (command === 'bootstrap') {
    const operator = await post('/v1/operators', { name: process.argv[3] || 'Aura Launch Operator', contactEmail: 'ops@aura.local' });
    const venue = await post('/v1/venues', { operatorId: operator.id, name: 'Aura Demo Venue', city: 'Jabalpur', hostType: 'coworking' });
    const network = await post('/v1/networks', { venueId: venue.id, name: 'Aura Protocol WiFi', ownerWallet: 'demo-wallet' });
    return console.log(JSON.stringify({ operator, venue, network }, null, 2));
  }
  throw new Error('Usage: node scripts/aura-cli.js status | bootstrap [operator-name]');
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
