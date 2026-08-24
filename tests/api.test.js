const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const port = 34771;
const root = path.join(__dirname, '..');
let child;

const request = async (route, payload = undefined, method = payload ? 'POST' : 'GET') => {
  const res = await fetch(`http://localhost:${port}${route}`, {
    method,
    headers: payload ? { 'content-type': 'application/json' } : undefined,
    body: payload ? JSON.stringify(payload) : undefined
  });
  return { status: res.status, body: await res.json() };
};
const sign = (privateKey, report) => crypto.sign(null, Buffer.from(JSON.stringify(report)), privateKey).toString('base64');
const createActiveNetwork = async (suffix = crypto.randomUUID().slice(0, 6)) => {
  const operator = await request('/v1/operators', { name: `Operator ${suffix}` });
  assert.equal(operator.status, 201);
  const venue = await request('/v1/venues', { operatorId: operator.body.data.id, name: `Venue ${suffix}`, city: 'Jabalpur' });
  assert.equal(venue.status, 201);
  const network = await request('/v1/networks', { name: `WiFi ${suffix}`, venueId: venue.body.data.id });
  assert.equal(network.status, 201);
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
  const deviceId = `gw_${suffix}`;
  const register = await request(`/v1/networks/${network.body.data.id}/devices/register`, {
    deviceId,
    publicKey: publicKey.export({ type: 'spki', format: 'pem' }),
    model: 'Test Gateway'
  });
  assert.equal(register.status, 201);
  const report = { deviceId, counter: 1, timestamp: new Date().toISOString(), nonce: crypto.randomUUID(), latencyMs: 30, uptime: 99, clientCount: 2 };
  const heartbeat = await request(`/v1/networks/${network.body.data.id}/heartbeat`, { ...report, signature: sign(privateKey, report) });
  assert.equal(heartbeat.status, 201);
  assert.equal(heartbeat.body.data.network.state, 'ACTIVE');
  return { networkId: network.body.data.id, privateKey, deviceId };
};

test.before(async () => {
  fs.rmSync(path.join(root, 'prototype-data.json'), { force: true });
  child = spawn(process.execPath, ['server.js'], { cwd: root, env: { ...process.env, PORT: String(port) } });
  await new Promise((resolve) => child.stdout.once('data', resolve));
});
test.after(() => {
  child.kill();
  fs.rmSync(path.join(root, 'prototype-data.json'), { force: true });
});

test('host onboarding requires a registered gateway and signed heartbeat', async () => {
  const operator = await request('/v1/operators', { name: 'Test operator' });
  const venue = await request('/v1/venues', { operatorId: operator.body.data.id, name: 'Test venue', city: 'Jabalpur' });
  const network = await request('/v1/networks', { name: 'Test WiFi', venueId: venue.body.data.id });
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
  const report = { deviceId: 'gw_unregistered', counter: 1, timestamp: new Date().toISOString(), nonce: crypto.randomUUID(), latencyMs: 30, uptime: 99, clientCount: 2 };
  assert.equal((await request(`/v1/networks/${network.body.data.id}/heartbeat`, { ...report, signature: sign(privateKey, report) })).status, 403);
  assert.equal((await request(`/v1/networks/${network.body.data.id}/devices/register`, { deviceId: 'gw_registered', publicKey: publicKey.export({ type: 'spki', format: 'pem' }) })).status, 201);
  const signedReport = { ...report, deviceId: 'gw_registered' };
  assert.equal((await request(`/v1/networks/${network.body.data.id}/heartbeat`, { ...signedReport, signature: sign(privateKey, signedReport) })).status, 201);
});

test('replayed signed report is rejected', async () => {
  const flow = await createActiveNetwork('replay');
  const report = { deviceId: flow.deviceId, counter: 2, timestamp: new Date().toISOString(), nonce: 'a-unique-nonce', latencyMs: 30, uptime: 99, clientCount: 1 };
  const signed = { ...report, signature: sign(flow.privateKey, report) };
  assert.equal((await request(`/v1/networks/${flow.networkId}/heartbeat`, signed)).status, 201);
  assert.equal((await request(`/v1/networks/${flow.networkId}/heartbeat`, signed)).status, 409);
});

test('verified access sessions can be closed into a reward epoch', async () => {
  const flow = await createActiveNetwork('epoch');
  const session = await request('/v1/sessions', { networkId: flow.networkId, consumerRef: 'wallet:test-consumer', accessMode: 'wallet' });
  assert.equal(session.status, 201);
  const completed = await request(`/v1/sessions/${session.body.data.id}/complete`, {
    bytesDown: 420000000,
    bytesUp: 35000000,
    durationMinutes: 24,
    qualityScore: 91
  });
  assert.equal(completed.body.data.verified, true);
  assert.ok(completed.body.data.rewardUnits > 0);
  const epoch = await request('/v1/epochs/close', { label: 'Unit test epoch' });
  assert.equal(epoch.status, 201);
  assert.equal(epoch.body.data.totalVerifiedSessions, 1);
  assert.ok(epoch.body.data.merkleRoot);
});

test('quest arena supports profile, social link, repeated tasks, stake, claim, and leaderboard', async () => {
  const profile = await request('/v1/profiles', { handle: 'quest_builder', displayName: 'Quest Builder', wallet: 'devnet-wallet' });
  assert.equal(profile.status, 201);
  assert.equal(profile.body.data.score.earned, 120);
  const linked = await request(`/v1/profiles/${profile.body.data.id}/link-twitter`, { twitterHandle: 'quest_builder_x' });
  assert.equal(linked.status, 200);
  assert.equal(linked.body.data.twitter.handle, 'quest_builder_x');
  assert.equal(linked.body.data.score.earned, 360);
  const firstShare = await request('/v1/quests/quest_share/complete', { profileId: profile.body.data.id, proof: 'https://x.com/demo/status/1' });
  const secondShare = await request('/v1/quests/quest_share/complete', { profileId: profile.body.data.id, proof: 'https://x.com/demo/status/2' });
  assert.equal(firstShare.status, 201);
  assert.equal(secondShare.status, 201);
  assert.equal(secondShare.body.data.profile.score.earned, 540);
  const duplicateTwitter = await request('/v1/quests/quest_twitter/complete', { profileId: profile.body.data.id, proof: '@again' });
  assert.equal(duplicateTwitter.status, 409);
  const stake = await request(`/v1/profiles/${profile.body.data.id}/stake`, { amount: 100, lockDays: 30 });
  assert.equal(stake.status, 201);
  assert.equal(stake.body.data.profile.score.staked, 100);
  const claim = await request(`/v1/profiles/${profile.body.data.id}/claim`, {});
  assert.equal(claim.status, 201);
  assert.ok(claim.body.data.claim.amount > 0);
  const game = await request('/v1/game', undefined, 'GET');
  assert.equal(game.status, 200);
  assert.equal(game.body.data.leaderboard[0].handle, 'quest_builder');
});

test('chain adapter exposes status and local ledger receipts', async () => {
  const status = await request('/v1/chain/status', undefined, 'GET');
  assert.equal(status.status, 200);
  assert.equal(status.body.data.mode, 'local');
  assert.equal(status.body.data.autoSync, true);
  const profile = await request('/v1/profiles', { handle: 'chain_ready', displayName: 'Chain Ready', wallet: 'devnet-wallet' });
  assert.equal(profile.status, 201);
  assert.equal(profile.body.data.chain.state, 'RECORDED_LOCAL_LEDGER');
  const manual = await request('/v1/chain/sync/profile', { profileId: profile.body.data.id });
  assert.equal(manual.status, 201);
  assert.equal(manual.body.data.action, 'profile.sync');
});

test('launch claim verifies social proof and blocks duplicate usernames', async () => {
  const launch = await request('/v1/launch', undefined, 'GET');
  assert.equal(launch.status, 200);
  assert.ok(launch.body.data.postTemplate.includes('Aura Protocol'));
  assert.equal(launch.body.data.siteUrl, 'https://www.auraprotocol.space/');
  assert.equal(launch.body.data.twitterHandle, 'Aura_protocol_');
  const bad = await request('/v1/launch/claim', {
    auraHandle: 'early_builder',
    twitterHandle: 'early_builder_x',
    postText: 'random post',
    postUrl: 'https://x.com/early_builder_x/status/123456789',
    followed: true
  });
  assert.equal(bad.status, 400);
  const claim = await request('/v1/launch/claim', {
    auraHandle: 'early_builder',
    twitterHandle: 'early_builder_x',
    postText: launch.body.data.postTemplate,
    postUrl: 'https://x.com/early_builder_x/status/123456789',
    followed: true,
    whyAura: 'I want Aura because community-owned WiFi should reward real builders.',
    likes: 10,
    reposts: 2,
    replies: 1
  });
  assert.equal(claim.status, 201);
  assert.equal(claim.body.data.auraHandle, 'early_builder');
  assert.ok(claim.body.data.profileId);
  assert.ok(claim.body.data.profileUrl.includes('/p/early_builder'));
  assert.equal(claim.body.data.whyAura, 'I want Aura because community-owned WiFi should reward real builders.');
  assert.ok(claim.body.data.score > 1000);
  const publicProfile = await request('/v1/launch/profiles/early_builder', undefined, 'GET');
  assert.equal(publicProfile.status, 200);
  assert.equal(publicProfile.body.data.auraHandle, 'early_builder');
  assert.equal(publicProfile.body.data.twitterHandle, 'early_builder_x');
  assert.ok(publicProfile.body.data.shareImage.includes('/share/early_builder.png'));
  assert.equal(publicProfile.body.data.whyAura, 'I want Aura because community-owned WiFi should reward real builders.');
  assert.equal(publicProfile.body.data.profile.handle, 'early_builder');
  const profilePage = await fetch(`http://localhost:${port}/p/early_builder`);
  assert.equal(profilePage.status, 200);
  assert.match(await profilePage.text(), /twitter:card/);
  const sharePng = await fetch(`http://localhost:${port}/share/early_builder.png`);
  assert.equal(sharePng.status, 200);
  assert.match(sharePng.headers.get('content-type'), /image\/(png|svg\+xml)/);
  const shareCard = await fetch(`http://localhost:${port}/share/early_builder.svg`);
  assert.equal(shareCard.status, 200);
  assert.match(await shareCard.text(), /I AM BUILDER/);
  const updated = await request('/v1/launch/claim/engagement', {
    auraHandle: 'early_builder',
    twitterHandle: 'early_builder_x',
    likes: 50,
    reposts: 7,
    replies: 4
  });
  assert.equal(updated.status, 200);
  assert.ok(updated.body.data.score > claim.body.data.score);
  const twoFieldClaim = await request('/v1/launch/claim', {
    auraHandle: 'simple_builder',
    twitterHandle: 'simple_builder_x',
    postText: launch.body.data.postTemplate,
    followed: true,
    whyAura: 'I want Aura for fast local internet rewards.'
  });
  assert.equal(twoFieldClaim.status, 201);
  assert.equal(twoFieldClaim.body.data.verification.checkedPostUrl, false);
  const board = await request('/v1/launch', undefined, 'GET');
  assert.equal(board.status, 200);
  assert.equal(board.body.data.leaderboard[0].auraHandle, 'early_builder');
  const duplicate = await request('/v1/launch/claim', {
    auraHandle: 'early_builder',
    twitterHandle: 'another_builder',
    postText: launch.body.data.postTemplate,
    postUrl: 'https://x.com/another_builder/status/222222222',
    followed: true
  });
  assert.equal(duplicate.status, 409);
});
