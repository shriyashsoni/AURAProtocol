const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createOnchainAdapter } = require('./lib/onchain');

const root = __dirname;
const chain = createOnchainAdapter({ root });
const storePath = process.env.VERCEL ? path.join('/tmp', 'aura-prototype-data.json') : path.join(root, 'prototype-data.json');
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8'
};
const defaultStore = {
  operators: [],
  venues: [],
  networks: [],
  devices: [],
  sessions: [],
  heartbeats: [],
  epochs: [],
  profiles: [],
  launchClaims: [],
  questCompletions: [],
  stakes: [],
  rewardClaims: [],
  chainTransactions: [],
  auditLog: []
};
const questCatalog = [
  { id: 'quest_profile', title: 'Claim Aura profile', type: 'identity', rewardPoints: 120, repeatable: false, requirement: 'Create a user profile and wallet handle.' },
  { id: 'quest_twitter', title: 'Link Twitter identity', type: 'social', rewardPoints: 240, repeatable: false, requirement: 'Connect a Twitter/X handle to the profile.' },
  { id: 'quest_share', title: 'Share launch post', type: 'social', rewardPoints: 90, repeatable: true, requirement: 'Submit a social post link or proof text.' },
  { id: 'quest_speed', title: 'Run hotspot speed proof', type: 'network', rewardPoints: 180, repeatable: true, requirement: 'Record a quality task against an Aura network.' },
  { id: 'quest_referral', title: 'Invite another operator', type: 'growth', rewardPoints: 320, repeatable: true, requirement: 'Submit a referral code or invited handle.' },
  { id: 'quest_stake', title: 'Stake for signal boost', type: 'staking', rewardPoints: 160, repeatable: false, requirement: 'Stake AURA campaign points in the campaign vault.' }
];

const clone = (value) => JSON.parse(JSON.stringify(value));
const read = () => {
  const data = fs.existsSync(storePath) ? JSON.parse(fs.readFileSync(storePath, 'utf8')) : {};
  return { ...clone(defaultStore), ...data };
};
const write = (data) => fs.writeFileSync(storePath, JSON.stringify(data, null, 2));
const now = () => new Date().toISOString();
const id = (prefix) => `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`;
const send = (res, status, data) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
};
const sendHtml = (res, html) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(html);
};
const sendSvg = (res, svg) => {
  res.writeHead(200, { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'public, max-age=300' });
  res.end(svg);
};
const sendPng = (res, png) => {
  res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=300' });
  res.end(png);
};
const body = (req) => new Promise((resolve, reject) => {
  let raw = '';
  req.on('data', (chunk) => { raw += chunk; });
  req.on('end', () => {
    try { resolve(raw ? JSON.parse(raw) : {}); }
    catch { reject(new Error('Body must be valid JSON.')); }
  });
});
const validText = (value, max = 160) => typeof value === 'string' && value.trim().length > 1 && value.trim().length <= max;
const validNumber = (value, min, max) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const assertText = (value, message, max) => {
  if (!validText(value, max)) throw new Error(message);
  return value.trim();
};
const audit = (data, type, subjectId, detail = {}) => data.auditLog.push({ id: id('evt'), type, subjectId, detail, createdAt: now() });
const getRouteId = (pathname, pattern) => {
  const match = pathname.match(pattern);
  return match ? match[1] : null;
};
const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const completedUsage = (sessions) => sessions.filter((session) => session.state === 'COMPLETED' && session.verified);
const summarizeNetwork = (data, networkId) => {
  const usage = completedUsage(data.sessions).filter((session) => session.networkId === networkId);
  const bytes = usage.reduce((total, session) => total + session.bytesDown + session.bytesUp, 0);
  const minutes = usage.reduce((total, session) => total + session.durationMinutes, 0);
  const rewardUnits = usage.reduce((total, session) => total + session.rewardUnits, 0);
  return { completedSessions: usage.length, verifiedBytes: bytes, verifiedMinutes: minutes, rewardUnits };
};
const enrichNetworks = (data) => data.networks.map((network) => ({
  ...network,
  venue: data.venues.find((venue) => venue.id === network.venueId) || null,
  devices: data.devices.filter((device) => device.networkId === network.id).map(({ publicKey, ...device }) => device),
  usage: summarizeNetwork(data, network.id)
}));
const toPublic = (data) => ({
  operators: data.operators,
  venues: data.venues,
  networks: enrichNetworks(data),
  devices: data.devices.map(({ publicKey, ...device }) => device),
  sessions: data.sessions,
  epochs: data.epochs,
  chainTransactions: data.chainTransactions,
  game: gameState(data)
});
const profileScore = (data, profileId) => {
  const earned = data.questCompletions.filter((item) => item.profileId === profileId).reduce((total, item) => total + item.rewardPoints, 0);
  const staked = data.stakes.filter((item) => item.profileId === profileId).reduce((total, item) => total + item.amount, 0);
  const claimed = data.rewardClaims.filter((item) => item.profileId === profileId).reduce((total, item) => total + item.amount, 0);
  return { earned, staked, claimed, claimable: Math.max(0, Math.floor(earned * 0.45) - staked - claimed), rankScore: earned + Math.floor(staked * 1.25) };
};
const publicProfile = (data, profile) => ({ ...profile, score: profileScore(data, profile.id) });
const launchSiteUrl = 'https://www.auraprotocol.space/';
const launchTwitterHandle = 'Aura_protocol_';
const launchPostTemplate = `I just claimed my Aura Protocol username with @${launchTwitterHandle}. We are coming on Solana. Decentralized WiFi, verified hosts, launch rewards, and the AURA airdrop layer are loading. Claim yours: ${launchSiteUrl} #AuraProtocol #Solana #DePIN`;
const launchScore = (claim) => {
  const likes = Math.max(0, Math.min(100000, Number(claim.engagement?.likes || 0)));
  const reposts = Math.max(0, Math.min(100000, Number(claim.engagement?.reposts || 0)));
  const replies = Math.max(0, Math.min(100000, Number(claim.engagement?.replies || 0)));
  return 1000 + likes * 12 + reposts * 30 + replies * 16 + (claim.followed ? 300 : 0);
};
const launchEngagement = (input) => ({
  likes: Math.max(0, Math.min(100000, Number.parseInt(input.likes || 0, 10) || 0)),
  reposts: Math.max(0, Math.min(100000, Number.parseInt(input.reposts || 0, 10) || 0)),
  replies: Math.max(0, Math.min(100000, Number.parseInt(input.replies || 0, 10) || 0))
});
const defaultWhyAura = 'I want Aura because internet should be coordinated by the people who provide it.';
const shareQuery = (claim) => {
  const params = new URLSearchParams();
  if (claim.twitterHandle) params.set('x', claim.twitterHandle);
  if (claim.whyAura) params.set('w', claim.whyAura);
  return params.toString();
};
const profileUrlFor = (claim) => {
  const query = shareQuery(claim);
  return `${launchSiteUrl}p/${encodeURIComponent(claim.auraHandle)}${query ? `?${query}` : ''}`;
};
const shareImageFor = (claim, ext = 'png') => {
  const query = shareQuery(claim);
  return `${launchSiteUrl}share/${encodeURIComponent(claim.auraHandle)}.${ext}${query ? `?${query}` : ''}`;
};
const publicLaunchClaim = (claim) => ({
  ...claim,
  profileUrl: profileUrlFor(claim),
  shareImage: shareImageFor(claim),
  score: launchScore(claim),
  estimatedAirdrop: Math.floor(launchScore(claim) * 1.8)
});
const publicLaunchProfile = (data, claim) => {
  if (!claim) return null;
  const profile = data.profiles.find((item) => item.id === claim.profileId || item.handle.toLowerCase() === claim.auraHandle.toLowerCase());
  return {
    auraHandle: claim.auraHandle,
    twitterHandle: claim.twitterHandle,
    twitterUrl: `https://x.com/${claim.twitterHandle}`,
    officialTwitter: `https://x.com/${launchTwitterHandle}`,
    profileUrl: profileUrlFor(claim),
    shareImage: shareImageFor(claim),
    whyAura: claim.whyAura || profile?.bio || defaultWhyAura,
    state: claim.state,
    score: launchScore(claim),
    estimatedAirdrop: Math.floor(launchScore(claim) * 1.8),
    engagement: claim.engagement,
    createdAt: claim.createdAt,
    updatedAt: claim.updatedAt,
    profile: profile ? publicProfile(data, profile) : null
  };
};
const previewProfileFromUrl = (handle, searchParams) => {
  const twitterHandle = String(searchParams.get('x') || '').replace(/^@/, '').trim();
  const whyAura = String(searchParams.get('w') || '').trim();
  if (!twitterHandle && !whyAura) return null;
  const claim = {
    auraHandle: handle,
    twitterHandle: /^[a-zA-Z0-9_]{2,40}$/.test(twitterHandle) ? twitterHandle : 'aura_builder',
    whyAura: whyAura.slice(0, 280) || defaultWhyAura,
    followed: true,
    engagement: {},
    state: 'PREVIEW_LINK',
    createdAt: now(),
    updatedAt: now()
  };
  return {
    auraHandle: claim.auraHandle,
    twitterHandle: claim.twitterHandle,
    twitterUrl: `https://x.com/${claim.twitterHandle}`,
    officialTwitter: `https://x.com/${launchTwitterHandle}`,
    profileUrl: profileUrlFor(claim),
    shareImage: shareImageFor(claim),
    whyAura: claim.whyAura,
    state: claim.state,
    score: launchScore(claim),
    estimatedAirdrop: Math.floor(launchScore(claim) * 1.8),
    engagement: claim.engagement,
    createdAt: claim.createdAt,
    updatedAt: claim.updatedAt,
    profile: null
  };
};
const resolveLaunchProfile = (data, handle, searchParams) => {
  const claim = data.launchClaims.find((item) => item.auraHandle === handle.toLowerCase());
  return claim ? publicLaunchProfile(data, claim) : previewProfileFromUrl(handle.toLowerCase(), searchParams);
};
const launchState = (data) => ({
  postTemplate: launchPostTemplate,
  siteUrl: launchSiteUrl,
  twitterHandle: launchTwitterHandle,
  twitterUrl: `https://x.com/${launchTwitterHandle}`,
  shareImage: '/assets/aura-claim-card.svg',
  claims: data.launchClaims.map(publicLaunchClaim),
  leaderboard: data.launchClaims.map(publicLaunchClaim).sort((a, b) => b.score - a.score).slice(0, 50)
});
const ensureLaunchProfile = async (data, auraHandle, twitterHandle, whyAura) => {
  let profile = data.profiles.find((item) => item.handle.toLowerCase() === auraHandle.toLowerCase());
  if (!profile) {
    profile = {
      id: id('prof'),
      handle: auraHandle,
      displayName: `@${auraHandle}`,
      wallet: null,
      twitter: { handle: twitterHandle, linkedAt: now(), provider: 'launch-claim' },
      bio: whyAura,
      referralCode: crypto.createHash('sha256').update(auraHandle + Date.now()).digest('hex').slice(0, 8).toUpperCase(),
      source: 'launch-claim',
      createdAt: now()
    };
    data.profiles.push(profile);
    data.questCompletions.push({ id: id('qcmp'), profileId: profile.id, questId: 'quest_profile', proof: 'launch-claim-profile', rewardPoints: 120, createdAt: now() });
  }
  profile.twitter = { handle: twitterHandle, linkedAt: profile.twitter?.linkedAt || now(), provider: 'launch-claim' };
  profile.bio = whyAura || profile.bio;
  const twitterQuest = requireQuest('quest_twitter');
  const shareQuest = requireQuest('quest_share');
  if (!data.questCompletions.some((item) => item.profileId === profile.id && item.questId === twitterQuest.id)) {
    data.questCompletions.push({ id: id('qcmp'), profileId: profile.id, questId: twitterQuest.id, proof: `@${twitterHandle}`, rewardPoints: twitterQuest.rewardPoints, createdAt: now() });
  }
  data.questCompletions.push({ id: id('qcmp'), profileId: profile.id, questId: shareQuest.id, proof: 'launch-social-post-opened', rewardPoints: shareQuest.rewardPoints, createdAt: now() });
  if (chain.config.autoSync && !profile.chain) {
    const receipt = await chain.record('profile.create', { profile, score: profileScore(data, profile.id), source: 'launch-claim' });
    profile.chain = receipt;
    data.chainTransactions.push(receipt);
  }
  return profile;
};
const renderShareSvg = (profile) => {
  const handle = escapeHtml(profile.auraHandle || 'aura_builder');
  const twitter = escapeHtml(profile.twitterHandle || 'builder');
  const why = escapeHtml((profile.whyAura || '').slice(0, 120));
  return `<svg width="1600" height="900" viewBox="0 0 1600 900" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="1600" height="900" fill="#EAF6E7"/>
  <defs><radialGradient id="g" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(1120 320) rotate(115) scale(620 700)"><stop stop-color="white"/><stop offset=".48" stop-color="#D9EED7"/><stop offset="1" stop-color="#BFD9BB"/></radialGradient></defs>
  <rect width="1600" height="900" fill="url(#g)" opacity=".9"/>
  <g opacity=".55">${Array.from({ length: 28 }).map((_, i) => `<circle cx="${90 + i * 54}" cy="${70 + (i % 9) * 82}" r="${i % 2 ? 3 : 5}" fill="${i % 3 ? 'white' : '#0A0D0B'}" opacity="${i % 3 ? '.8' : '.16'}"/>`).join('')}</g>
  <rect x="76" y="70" width="8" height="30" rx="4" fill="#6DCCA0"/><text x="108" y="98" fill="#0A0D0B" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="700" letter-spacing="14">AURA PROTOCOL</text>
  <text x="96" y="248" fill="#0A0D0B" font-family="Arial, Helvetica, sans-serif" font-size="78" font-weight="800" letter-spacing="-2">I AM BUILDER</text>
  <text x="96" y="350" fill="#0A0D0B" font-family="Arial, Helvetica, sans-serif" font-size="96" font-weight="800">@${handle}</text>
  <text x="102" y="430" fill="#233329" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="700">Claimed Aura profile on Solana.</text>
  <text x="102" y="502" fill="#4E6254" font-family="Arial, Helvetica, sans-serif" font-size="28">X: @${twitter}</text>
  <text x="102" y="562" fill="#4E6254" font-family="Arial, Helvetica, sans-serif" font-size="28">${why}</text>
  <rect x="102" y="690" width="530" height="88" rx="44" fill="#0A0D0B"/><text x="148" y="746" fill="white" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="800">www.auraprotocol.space</text>
  <g transform="translate(990 190)"><rect width="430" height="430" rx="215" fill="white" fill-opacity=".38"/><rect x="50" y="50" width="330" height="330" rx="165" fill="#DCEEDB"/><path d="M215 92C280 178 324 274 342 382H88C106 274 150 178 215 92Z" fill="#0A0D0B"/><path d="M98 250C172 190 258 190 332 250L298 300C245 260 185 260 132 300L98 250Z" fill="white"/><path d="M144 322C190 292 240 292 286 322L254 370C228 356 202 356 176 370L144 322Z" fill="white"/></g>
  <text x="1100" y="810" fill="#0A0D0B" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="700" letter-spacing="8">#AURA #SOLANA #DEPIN</text>
</svg>`;
};
const renderProfileDocument = (profile) => {
  const title = `@${escapeHtml(profile.auraHandle)} joined Aura Protocol`;
  const description = escapeHtml(`${profile.whyAura || 'Aura Protocol launch profile'} X: @${profile.twitterHandle}`.slice(0, 190));
  const profileUrl = profile.profileUrl || `${launchSiteUrl}p/${encodeURIComponent(profile.auraHandle)}`;
  const imageUrl = profile.shareImage || `${launchSiteUrl}share/${encodeURIComponent(profile.auraHandle)}.png`;
  const clientUrl = `/profile.html?u=${encodeURIComponent(profile.auraHandle)}&x=${encodeURIComponent(profile.twitterHandle)}&w=${encodeURIComponent(profile.whyAura || '')}`;
  return `<!doctype html><html><head>
  <meta name="virtual-protocol-site-verification" content="09b6b84d1d285824b9d81ab48dca5201" />
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title}</title>
  <meta name="description" content="${description}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:url" content="${profileUrl}">
  <meta property="og:image" content="${imageUrl}">
  <meta property="og:image:width" content="1600">
  <meta property="og:image:height" content="900">
  <meta property="og:image:type" content="image/png">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:site" content="@${launchTwitterHandle}">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${imageUrl}">
  <meta http-equiv="refresh" content="0; url=${clientUrl}">
  </head><body><a href="${clientUrl}">Open ${title}</a></body></html>`;
};
const gameState = (data) => ({
  quests: questCatalog,
  profiles: data.profiles.map((profile) => publicProfile(data, profile)),
  completions: data.questCompletions,
  stakes: data.stakes,
  claims: data.rewardClaims,
  leaderboard: data.profiles.map((profile) => publicProfile(data, profile)).sort((a, b) => b.score.rankScore - a.score.rankScore).slice(0, 20),
  launch: launchState(data)
});
const requireProfile = (data, profileId) => {
  const profile = data.profiles.find((item) => item.id === profileId);
  if (!profile) throw new Error('Profile not found.');
  return profile;
};
const requireQuest = (questId) => {
  const quest = questCatalog.find((item) => item.id === questId);
  if (!quest) throw new Error('Quest not found.');
  return quest;
};
const calculateRewardUnits = ({ bytesDown, bytesUp, durationMinutes, qualityScore }) => {
  const megabytes = (bytesDown + bytesUp) / 1_000_000;
  const quality = Math.max(0.25, Math.min(1, qualityScore / 100));
  const durationWeight = Math.max(0.5, Math.min(1.6, durationMinutes / 30));
  return Math.round(megabytes * quality * durationWeight * 100);
};
const requireNetwork = (data, networkId) => {
  const network = data.networks.find((item) => item.id === networkId);
  if (!network) throw new Error('Network not found.');
  return network;
};
const requireSession = (data, sessionId) => {
  const session = data.sessions.find((item) => item.id === sessionId);
  if (!session) throw new Error('Session not found.');
  return session;
};
const verifyHeartbeat = (data, network, input) => {
  assertText(input.deviceId, 'Gateway deviceId is required.');
  assertText(input.nonce, 'Gateway nonce is required.');
  assertText(input.timestamp, 'Gateway timestamp is required.');
  if (!Number.isInteger(input.counter) || input.counter < 1) throw new Error('Gateway counter must be a positive integer.');
  if (!validNumber(input.latencyMs, 0, 10000)) throw new Error('latencyMs must be a valid number.');
  const device = data.devices.find((item) => item.id === input.deviceId && item.networkId === network.id);
  if (!device) {
    const error = new Error('Gateway must be registered to this network before sending telemetry.');
    error.status = 403;
    throw error;
  }
  if (device.revokedAt) {
    const error = new Error('Gateway has been revoked.');
    error.status = 403;
    throw error;
  }
  const timestamp = Date.parse(input.timestamp);
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() - timestamp) > 5 * 60 * 1000) throw new Error('Gateway timestamp outside five-minute window.');
  if (input.counter <= device.counter || data.heartbeats.some((item) => item.nonce === input.nonce)) {
    const error = new Error('Rejected replayed device report.');
    error.status = 409;
    throw error;
  }
  if (!input.signature) {
    const error = new Error('Gateway signature is required.');
    error.status = 401;
    throw error;
  }
  const signed = {
    deviceId: input.deviceId,
    counter: input.counter,
    timestamp: input.timestamp,
    nonce: input.nonce,
    latencyMs: input.latencyMs,
    uptime: input.uptime,
    clientCount: input.clientCount
  };
  const verified = crypto.verify(null, Buffer.from(JSON.stringify(signed)), device.publicKey, Buffer.from(input.signature, 'base64'));
  if (!verified) {
    const error = new Error('Gateway signature is invalid.');
    error.status = 401;
    throw error;
  }
  return device;
};

const handler = async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  const publicProfileHandle = getRouteId(pathname, /^\/p\/([a-z0-9_]+)$/);
  if (req.method === 'GET' && publicProfileHandle) {
    const data = read();
    const profile = resolveLaunchProfile(data, publicProfileHandle, url.searchParams);
    if (!profile) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Aura profile not found');
    }
    return sendHtml(res, renderProfileDocument(profile));
  }

  const publicShareHandle = getRouteId(pathname, /^\/share\/([a-z0-9_]+)\.svg$/);
  if (req.method === 'GET' && publicShareHandle) {
    const data = read();
    const profile = resolveLaunchProfile(data, publicShareHandle, url.searchParams);
    if (!profile) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Aura share card not found');
    }
    return sendSvg(res, renderShareSvg(profile));
  }

  const publicSharePngHandle = getRouteId(pathname, /^\/share\/([a-z0-9_]+)\.png$/);
  if (req.method === 'GET' && publicSharePngHandle) {
    const data = read();
    const profile = resolveLaunchProfile(data, publicSharePngHandle, url.searchParams);
    if (!profile) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Aura share card not found');
    }
    const svg = renderShareSvg(profile);
    try {
      const sharp = require('sharp');
      return sendPng(res, await sharp(Buffer.from(svg)).png().toBuffer());
    } catch {
      return sendSvg(res, svg);
    }
  }

  if (pathname.startsWith('/v1/')) {
    try {
      const data = read();

      if (req.method === 'GET' && pathname === '/v1/overview') return send(res, 200, { data: toPublic(data) });
      if (req.method === 'GET' && pathname === '/v1/game') return send(res, 200, { data: gameState(data) });
      if (req.method === 'GET' && pathname === '/v1/launch') return send(res, 200, { data: launchState(data) });
      const launchProfileHandle = getRouteId(pathname, /^\/v1\/launch\/profiles\/([a-z0-9_]+)$/);
      if (req.method === 'GET' && launchProfileHandle) {
        const claim = data.launchClaims.find((item) => item.auraHandle === launchProfileHandle.toLowerCase());
        if (!claim) {
          const error = new Error('Aura profile not found.');
          error.status = 404;
          throw error;
        }
        return send(res, 200, { data: publicLaunchProfile(data, claim) });
      }
      if (req.method === 'GET' && pathname === '/v1/networks') return send(res, 200, { data: enrichNetworks(data) });
      if (req.method === 'GET' && pathname === '/v1/sessions') return send(res, 200, { data: data.sessions });
      if (req.method === 'GET' && pathname === '/v1/epochs') return send(res, 200, { data: data.epochs });
      if (req.method === 'GET' && pathname === '/v1/status') {
        const chainStatus = chain.status();
        return send(res, 200, {
          protocol: 'aura-protocol',
          environment: 'private-development',
          services: [
            { name: 'Web app', state: 'operational' },
            { name: 'Aura Core API', state: 'operational' },
            { name: 'Gateway verification', state: 'operational' },
            { name: 'Usage accounting', state: 'operational' },
            { name: 'Solana settlement', state: chainStatus.readyForDevnet ? 'ready for devnet submit' : 'local ledger mode' }
          ],
          chain: chainStatus
        });
      }
      if (req.method === 'GET' && pathname === '/v1/chain/status') return send(res, 200, { data: chain.status() });

      if (req.method === 'POST' && pathname === '/v1/chain/sync/profile') {
        chain.requireAdmin(req);
        const input = await body(req);
        const profile = requireProfile(data, input.profileId);
        const receipt = await chain.record('profile.sync', {
          profileId: profile.id,
          handle: profile.handle,
          wallet: profile.wallet,
          twitter: profile.twitter,
          score: profileScore(data, profile.id)
        });
        data.chainTransactions.push(receipt);
        audit(data, 'chain.profile.synced', receipt.id, { profileId: profile.id });
        write(data);
        return send(res, 201, { data: receipt });
      }

      if (req.method === 'POST' && pathname === '/v1/chain/sync/epoch') {
        chain.requireAdmin(req);
        const input = await body(req);
        const epoch = data.epochs.find((item) => item.id === input.epochId);
        if (!epoch) throw new Error('Epoch not found.');
        const receipt = await chain.record('epoch.publish', epoch);
        epoch.chain = receipt;
        data.chainTransactions.push(receipt);
        audit(data, 'chain.epoch.synced', receipt.id, { epochId: epoch.id });
        write(data);
        return send(res, 201, { data: receipt });
      }

      if (req.method === 'POST' && pathname === '/v1/chain/sync/claim') {
        chain.requireAdmin(req);
        const input = await body(req);
        const claim = data.rewardClaims.find((item) => item.id === input.claimId);
        if (!claim) throw new Error('Claim not found.');
        const profile = requireProfile(data, claim.profileId);
        const receipt = await chain.record('claim.record', { claim, profile: publicProfile(data, profile) });
        claim.chain = receipt;
        data.chainTransactions.push(receipt);
        audit(data, 'chain.claim.synced', receipt.id, { claimId: claim.id });
        write(data);
        return send(res, 201, { data: receipt });
      }

      if (req.method === 'POST' && pathname === '/v1/operators') {
        const input = await body(req);
        const operator = {
          id: id('op'),
          name: assertText(input.name, 'A valid operator name is required.'),
          contactEmail: validText(input.contactEmail, 180) ? input.contactEmail.trim() : null,
          createdAt: now()
        };
        data.operators.push(operator);
        audit(data, 'operator.created', operator.id);
        write(data);
        return send(res, 201, { data: operator });
      }

      if (req.method === 'POST' && pathname === '/v1/profiles') {
        const input = await body(req);
        const handle = assertText(input.handle, 'Profile handle is required.', 40).replace(/^@/, '');
        if (!/^[a-zA-Z0-9_]{2,40}$/.test(handle)) throw new Error('Profile handle can only use letters, numbers, and underscores.');
        if (data.profiles.some((profile) => profile.handle.toLowerCase() === handle.toLowerCase())) {
          const error = new Error('Profile handle is already claimed.');
          error.status = 409;
          throw error;
        }
        const profile = {
          id: id('prof'),
          handle,
          displayName: validText(input.displayName, 80) ? input.displayName.trim() : handle,
          wallet: validText(input.wallet, 100) ? input.wallet.trim() : null,
          twitter: null,
          referralCode: crypto.createHash('sha256').update(handle + Date.now()).digest('hex').slice(0, 8).toUpperCase(),
          createdAt: now()
        };
        data.profiles.push(profile);
        data.questCompletions.push({ id: id('qcmp'), profileId: profile.id, questId: 'quest_profile', proof: 'profile-created', rewardPoints: 120, createdAt: now() });
        if (chain.config.autoSync) {
          const receipt = await chain.record('profile.create', { profile, score: profileScore(data, profile.id) });
          profile.chain = receipt;
          data.chainTransactions.push(receipt);
        }
        audit(data, 'profile.created', profile.id, { handle });
        write(data);
        return send(res, 201, { data: publicProfile(data, profile) });
      }

      if (req.method === 'POST' && pathname === '/v1/launch/claim') {
        const input = await body(req);
        const auraHandle = assertText(input.auraHandle, 'Aura username is required.', 32).replace(/^@/, '').toLowerCase();
        const twitterHandle = assertText(input.twitterHandle, 'Twitter/X username is required.', 40).replace(/^@/, '');
        if (!/^[a-z0-9_]{2,32}$/.test(auraHandle)) throw new Error('Aura username can only use lowercase letters, numbers, and underscores.');
        if (!/^[a-zA-Z0-9_]{2,40}$/.test(twitterHandle)) throw new Error('Twitter/X username can only use letters, numbers, and underscores.');
        const sameClaim = data.launchClaims.find((claim) => claim.auraHandle === auraHandle && claim.twitterHandle.toLowerCase() === twitterHandle.toLowerCase());
        if (sameClaim) return send(res, 200, { data: publicLaunchClaim(sameClaim) });
        if (data.launchClaims.some((claim) => claim.auraHandle === auraHandle)) {
          const error = new Error('This Aura username is already claimed.');
          error.status = 409;
          throw error;
        }
        if (data.launchClaims.some((claim) => claim.twitterHandle.toLowerCase() === twitterHandle.toLowerCase())) {
          const error = new Error('This Twitter/X username already claimed a launch profile.');
          error.status = 409;
          throw error;
        }
        const suppliedPostUrl = validText(input.postUrl, 260) ? input.postUrl.trim() : '';
        const postUrl = suppliedPostUrl || `https://x.com/${twitterHandle}/status/pending`;
        if (suppliedPostUrl) {
          if (!/^https:\/\/(x\.com|twitter\.com)\/[a-zA-Z0-9_]{2,40}\/status\/[0-9]+/i.test(postUrl)) throw new Error('Post URL must look like https://x.com/username/status/123...');
          if (!postUrl.toLowerCase().includes(`/${twitterHandle.toLowerCase()}/status/`)) throw new Error('Post URL username must match the Twitter/X username.');
          if (data.launchClaims.some((claim) => claim.postUrl.toLowerCase() === postUrl.toLowerCase())) {
            const error = new Error('This post URL has already been used for a claim.');
            error.status = 409;
            throw error;
          }
        }
        const postText = assertText(input.postText || launchPostTemplate, 'Post text is required.', 500);
        const normalizedPost = postText.toLowerCase();
        const requiredTerms = ['aura protocol', 'solana'];
        const missing = requiredTerms.filter((term) => !normalizedPost.includes(term));
        if (missing.length) throw new Error(`Post text must include: ${missing.join(', ')}.`);
        if (!input.followed) throw new Error('Confirm that you followed Aura Protocol before claiming.');
        const engagement = launchEngagement(input);
        const whyAura = validText(input.whyAura, 280) ? input.whyAura.trim() : 'I want Aura because internet should be coordinated by the people who provide it.';
        const profile = await ensureLaunchProfile(data, auraHandle, twitterHandle, whyAura);
        const claim = {
          id: id('launch'),
          auraHandle,
          twitterHandle,
          profileId: profile.id,
          postUrl,
          postText,
          whyAura,
          followed: true,
          engagement,
          state: 'VERIFIED_LOCAL',
          verification: {
            provider: 'local-proof-check',
            checkedPostUrl: Boolean(suppliedPostUrl),
            checkedRequiredText: true,
            checkedFollowConfirmation: true,
            note: suppliedPostUrl
              ? 'Production can replace this with X API OAuth/post/follow verification.'
              : 'Username reserved in prototype mode. X composer is opened client-side; production can replace this with X API OAuth/post/follow verification.'
          },
          createdAt: now(),
          updatedAt: now()
        };
        data.launchClaims.push(claim);
        audit(data, 'launch.username.claimed', claim.id, { auraHandle, twitterHandle, profileId: profile.id, score: launchScore(claim) });
        write(data);
        return send(res, 201, { data: publicLaunchClaim(claim) });
      }

      if (req.method === 'POST' && pathname === '/v1/launch/claim/engagement') {
        const input = await body(req);
        const auraHandle = assertText(input.auraHandle, 'Aura username is required.', 32).replace(/^@/, '').toLowerCase();
        const twitterHandle = assertText(input.twitterHandle, 'Twitter/X username is required.', 40).replace(/^@/, '');
        const claim = data.launchClaims.find((item) => item.auraHandle === auraHandle && item.twitterHandle.toLowerCase() === twitterHandle.toLowerCase());
        if (!claim) {
          const error = new Error('Claim not found. Verify and claim the username first.');
          error.status = 404;
          throw error;
        }
        const next = launchEngagement(input);
        claim.engagement = {
          likes: Math.max(Number(claim.engagement?.likes || 0), next.likes),
          reposts: Math.max(Number(claim.engagement?.reposts || 0), next.reposts),
          replies: Math.max(Number(claim.engagement?.replies || 0), next.replies)
        };
        claim.updatedAt = now();
        audit(data, 'launch.engagement.updated', claim.id, { auraHandle, twitterHandle, score: launchScore(claim), engagement: claim.engagement });
        write(data);
        return send(res, 200, { data: publicLaunchClaim(claim) });
      }

      const twitterProfileId = getRouteId(pathname, /^\/v1\/profiles\/(prof_[a-z0-9]+)\/link-twitter$/);
      if (req.method === 'POST' && twitterProfileId) {
        const input = await body(req);
        const profile = requireProfile(data, twitterProfileId);
        const twitterHandle = assertText(input.twitterHandle, 'Twitter handle is required.', 40).replace(/^@/, '');
        if (!/^[a-zA-Z0-9_]{2,40}$/.test(twitterHandle)) throw new Error('Twitter handle can only use letters, numbers, and underscores.');
        profile.twitter = { handle: twitterHandle, linkedAt: now(), provider: 'simulated-local-oauth' };
        const quest = requireQuest('quest_twitter');
        const already = data.questCompletions.some((item) => item.profileId === profile.id && item.questId === quest.id);
        if (!already) data.questCompletions.push({ id: id('qcmp'), profileId: profile.id, questId: quest.id, proof: `@${twitterHandle}`, rewardPoints: quest.rewardPoints, createdAt: now() });
        audit(data, 'profile.twitter.linked', profile.id, { twitterHandle });
        write(data);
        return send(res, 200, { data: publicProfile(data, profile) });
      }

      const questId = getRouteId(pathname, /^\/v1\/quests\/(quest_[a-z0-9]+)\/complete$/);
      if (req.method === 'POST' && questId) {
        const input = await body(req);
        const quest = requireQuest(questId);
        const profile = requireProfile(data, input.profileId);
        if (!quest.repeatable && data.questCompletions.some((item) => item.profileId === profile.id && item.questId === quest.id)) {
          const error = new Error('Quest already completed for this profile.');
          error.status = 409;
          throw error;
        }
        const proof = validText(input.proof, 240) ? input.proof.trim() : `${quest.id}-click-proof`;
        const completion = { id: id('qcmp'), profileId: profile.id, questId: quest.id, proof, rewardPoints: quest.rewardPoints, createdAt: now() };
        data.questCompletions.push(completion);
        audit(data, 'quest.completed', completion.id, { profileId: profile.id, questId: quest.id });
        write(data);
        return send(res, 201, { data: { completion, profile: publicProfile(data, profile) } });
      }

      const stakeProfileId = getRouteId(pathname, /^\/v1\/profiles\/(prof_[a-z0-9]+)\/stake$/);
      if (req.method === 'POST' && stakeProfileId) {
        const input = await body(req);
        const profile = requireProfile(data, stakeProfileId);
        if (!Number.isInteger(input.amount) || input.amount < 10 || input.amount > 100000) throw new Error('Stake amount must be an integer between 10 and 100000.');
        const score = profileScore(data, profile.id);
        if (input.amount > score.earned - score.staked - score.claimed) throw new Error('Not enough unlocked campaign points to stake.');
        const stake = { id: id('stk'), profileId: profile.id, amount: input.amount, lockDays: Number.isInteger(input.lockDays) ? Math.min(365, Math.max(7, input.lockDays)) : 30, createdAt: now() };
        data.stakes.push(stake);
        const quest = requireQuest('quest_stake');
        const already = data.questCompletions.some((item) => item.profileId === profile.id && item.questId === quest.id);
        if (!already) data.questCompletions.push({ id: id('qcmp'), profileId: profile.id, questId: quest.id, proof: `stake:${stake.id}`, rewardPoints: quest.rewardPoints, createdAt: now() });
        audit(data, 'profile.staked', stake.id, { profileId: profile.id, amount: input.amount });
        write(data);
        return send(res, 201, { data: { stake, profile: publicProfile(data, profile) } });
      }

      const claimProfileId = getRouteId(pathname, /^\/v1\/profiles\/(prof_[a-z0-9]+)\/claim$/);
      if (req.method === 'POST' && claimProfileId) {
        const profile = requireProfile(data, claimProfileId);
        const score = profileScore(data, profile.id);
        if (score.claimable <= 0) {
          const error = new Error('No claimable prototype rewards yet.');
          error.status = 409;
          throw error;
        }
        const claim = { id: id('claim'), profileId: profile.id, amount: score.claimable, state: 'CLAIMED_LOCAL', createdAt: now() };
        if (chain.config.autoSync) {
          claim.chain = await chain.record('claim.record', { claim, profile: publicProfile(data, profile) });
          data.chainTransactions.push(claim.chain);
        }
        data.rewardClaims.push(claim);
        audit(data, 'profile.reward.claimed', claim.id, { profileId: profile.id, amount: claim.amount });
        write(data);
        return send(res, 201, { data: { claim, profile: publicProfile(data, profile) } });
      }

      if (req.method === 'POST' && pathname === '/v1/venues') {
        const input = await body(req);
        const operator = input.operatorId ? data.operators.find((item) => item.id === input.operatorId) : null;
        if (input.operatorId && !operator) throw new Error('Operator not found.');
        const venue = {
          id: id('ven'),
          operatorId: operator ? operator.id : null,
          name: assertText(input.name, 'Venue name is required.'),
          city: assertText(input.city, 'City is required.'),
          visibility: input.visibility === 'private' ? 'private' : 'public',
          hostType: validText(input.hostType, 80) ? input.hostType.trim() : 'venue',
          createdAt: now()
        };
        data.venues.push(venue);
        audit(data, 'venue.created', venue.id, { operatorId: venue.operatorId });
        write(data);
        return send(res, 201, { data: venue });
      }

      if (req.method === 'POST' && pathname === '/v1/networks') {
        const input = await body(req);
        const venue = data.venues.find((item) => item.id === input.venueId);
        if (!venue) throw new Error('Venue not found.');
        const network = {
          id: id('net'),
          name: assertText(input.name, 'Network name is required.'),
          venueId: venue.id,
          ownerWallet: validText(input.ownerWallet, 80) ? input.ownerWallet.trim() : null,
          state: 'PROBATION',
          createdAt: now(),
          activatedAt: null,
          lastHeartbeat: null,
          settlementPda: `pda:${crypto.createHash('sha256').update(`${venue.id}:${input.name}`).digest('hex').slice(0, 32)}`
        };
        data.networks.push(network);
        audit(data, 'network.created', network.id, { venueId: venue.id });
        write(data);
        return send(res, 201, { data: network });
      }

      const registerDeviceId = getRouteId(pathname, /^\/v1\/networks\/(net_[a-z0-9]+)\/devices\/register$/);
      if (req.method === 'POST' && registerDeviceId) {
        const network = requireNetwork(data, registerDeviceId);
        const input = await body(req);
        const deviceId = assertText(input.deviceId, 'deviceId is required.');
        if (data.devices.some((device) => device.id === deviceId)) {
          const error = new Error('Device id is already registered.');
          error.status = 409;
          throw error;
        }
        assertText(input.publicKey, 'Gateway publicKey is required.', 1200);
        const device = {
          id: deviceId,
          networkId: network.id,
          publicKey: input.publicKey.trim(),
          model: validText(input.model, 80) ? input.model.trim() : 'Aura Gateway Prototype',
          firmware: validText(input.firmware, 80) ? input.firmware.trim() : 'dev',
          counter: 0,
          revokedAt: null,
          createdAt: now(),
          lastSeenAt: null
        };
        data.devices.push(device);
        audit(data, 'gateway.registered', device.id, { networkId: network.id });
        write(data);
        const { publicKey, ...publicDevice } = device;
        return send(res, 201, { data: publicDevice });
      }

      const heartbeatNetworkId = getRouteId(pathname, /^\/v1\/networks\/(net_[a-z0-9]+)\/heartbeat$/);
      if (req.method === 'POST' && heartbeatNetworkId) {
        const network = requireNetwork(data, heartbeatNetworkId);
        const input = await body(req);
        const device = verifyHeartbeat(data, network, input);
        const receivedAt = now();
        device.counter = input.counter;
        device.lastSeenAt = receivedAt;
        network.state = 'ACTIVE';
        network.lastHeartbeat = receivedAt;
        if (!network.activatedAt) network.activatedAt = receivedAt;
        const heartbeat = {
          id: id('hb'),
          networkId: network.id,
          deviceId: device.id,
          counter: input.counter,
          latencyMs: input.latencyMs,
          uptime: validNumber(input.uptime, 0, 100) ? input.uptime : null,
          clientCount: Number.isInteger(input.clientCount) && input.clientCount >= 0 ? input.clientCount : 0,
          nonce: input.nonce,
          receivedAt
        };
        data.heartbeats.push(heartbeat);
        audit(data, 'gateway.heartbeat.accepted', heartbeat.id, { networkId: network.id, deviceId: device.id });
        write(data);
        return send(res, 201, { data: { network, heartbeat } });
      }

      if (req.method === 'POST' && pathname === '/v1/sessions') {
        const input = await body(req);
        const network = requireNetwork(data, input.networkId);
        if (network.state !== 'ACTIVE') {
          const error = new Error('Network must be ACTIVE before access sessions can start.');
          error.status = 409;
          throw error;
        }
        const session = {
          id: id('ses'),
          networkId: network.id,
          consumerRef: assertText(input.consumerRef || 'guest-user', 'consumerRef is required.'),
          accessMode: input.accessMode === 'sponsor' ? 'sponsor' : 'wallet',
          state: 'OPEN',
          bytesDown: 0,
          bytesUp: 0,
          durationMinutes: 0,
          qualityScore: 0,
          verified: false,
          rewardUnits: 0,
          epochId: null,
          startedAt: now(),
          completedAt: null
        };
        data.sessions.push(session);
        audit(data, 'session.started', session.id, { networkId: network.id });
        write(data);
        return send(res, 201, { data: session });
      }

      const completeSessionId = getRouteId(pathname, /^\/v1\/sessions\/(ses_[a-z0-9]+)\/complete$/);
      if (req.method === 'POST' && completeSessionId) {
        const input = await body(req);
        const session = requireSession(data, completeSessionId);
        if (session.state !== 'OPEN') {
          const error = new Error('Session is already completed.');
          error.status = 409;
          throw error;
        }
        if (!Number.isInteger(input.bytesDown) || input.bytesDown < 0) throw new Error('bytesDown must be a non-negative integer.');
        if (!Number.isInteger(input.bytesUp) || input.bytesUp < 0) throw new Error('bytesUp must be a non-negative integer.');
        if (!validNumber(input.durationMinutes, 0.1, 1440)) throw new Error('durationMinutes must be between 0.1 and 1440.');
        if (!validNumber(input.qualityScore, 0, 100)) throw new Error('qualityScore must be between 0 and 100.');
        session.state = 'COMPLETED';
        session.bytesDown = input.bytesDown;
        session.bytesUp = input.bytesUp;
        session.durationMinutes = input.durationMinutes;
        session.qualityScore = input.qualityScore;
        session.verified = input.qualityScore >= 65 && input.durationMinutes >= 1 && input.bytesDown + input.bytesUp >= 50_000;
        session.rewardUnits = session.verified ? calculateRewardUnits(session) : 0;
        session.completedAt = now();
        audit(data, 'session.completed', session.id, { verified: session.verified, rewardUnits: session.rewardUnits });
        write(data);
        return send(res, 200, { data: session });
      }

      if (req.method === 'POST' && pathname === '/v1/epochs/close') {
        const input = await body(req);
        const eligible = completedUsage(data.sessions).filter((session) => !session.epochId);
        const byNetwork = eligible.reduce((acc, session) => {
          acc[session.networkId] ||= { networkId: session.networkId, sessions: 0, bytes: 0, minutes: 0, rewardUnits: 0 };
          acc[session.networkId].sessions += 1;
          acc[session.networkId].bytes += session.bytesDown + session.bytesUp;
          acc[session.networkId].minutes += session.durationMinutes;
          acc[session.networkId].rewardUnits += session.rewardUnits;
          return acc;
        }, {});
        const epoch = {
          id: id('epoch'),
          label: validText(input.label, 80) ? input.label.trim() : `Aura epoch ${data.epochs.length + 1}`,
          state: 'CLOSED_LOCAL',
          closedAt: now(),
          merkleRoot: eligible.length ? crypto.createHash('sha256').update(JSON.stringify(byNetwork)).digest('hex') : null,
          totalVerifiedSessions: eligible.length,
          totalRewardUnits: eligible.reduce((total, session) => total + session.rewardUnits, 0),
          networks: Object.values(byNetwork)
        };
        if (chain.config.autoSync) {
          epoch.chain = await chain.record('epoch.publish', epoch);
          data.chainTransactions.push(epoch.chain);
        }
        eligible.forEach((session) => { session.epochId = epoch.id; });
        data.epochs.push(epoch);
        audit(data, 'epoch.closed', epoch.id, { sessions: eligible.length, rewardUnits: epoch.totalRewardUnits });
        write(data);
        return send(res, 201, { data: epoch });
      }

      return send(res, 404, { error: 'Route not found.' });
    } catch (error) {
      return send(res, error.status || 400, { error: error.message || 'Invalid request.' });
    }
  }

  const requested = pathname === '/' ? 'index.html' : pathname.slice(1);
  const target = path.resolve(root, requested);
  if (!target.startsWith(root) || !fs.existsSync(target) || fs.statSync(target).isDirectory()) {
    res.writeHead(404);
    return res.end('Not found');
  }
  res.writeHead(200, { 'Content-Type': mime[path.extname(target)] || 'application/octet-stream' });
  fs.createReadStream(target).pipe(res);
};

if (require.main === module) {
  http.createServer(handler).listen(process.env.PORT || 3000, () => console.log(`Aura protocol: http://localhost:${process.env.PORT || 3000}`));
}

module.exports = handler;
