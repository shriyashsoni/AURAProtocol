const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { loadEnv } = require('./env');

const sha256 = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const bool = (value) => ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());

const readKeypairSummary = (walletPath) => {
  if (!walletPath) return { configured: false };
  const resolved = path.resolve(walletPath.replace(/^~(?=$|[\\/])/, process.env.USERPROFILE || process.env.HOME || ''));
  if (!fs.existsSync(resolved)) return { configured: true, exists: false, path: resolved };
  const parsed = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  if (!Array.isArray(parsed) || parsed.length < 32) throw new Error('Wallet keypair file must be a Solana JSON byte array.');
  return { configured: true, exists: true, path: resolved, bytes: parsed.length };
};

const createOnchainAdapter = ({ root }) => {
  const env = loadEnv(root);
  const mode = (env.AURA_CHAIN_MODE || 'local').toLowerCase();
  const config = {
    mode,
    autoSync: env.AURA_AUTO_SYNC === undefined ? true : bool(env.AURA_AUTO_SYNC),
    rpcUrl: env.AURA_SOLANA_RPC_URL || 'http://127.0.0.1:8899',
    programId: env.AURA_PROGRAM_ID || 'REPLACE_WITH_DEPLOYED_AURA_PROTOCOL_PROGRAM_ID',
    walletPath: env.AURA_WALLET_KEYPAIR || '',
    treasuryWallet: env.AURA_TREASURY_WALLET || '',
    adminTokenEnabled: Boolean(env.AURA_ADMIN_TOKEN)
  };

  const status = () => {
    let wallet = { configured: false };
    try { wallet = readKeypairSummary(config.walletPath); }
    catch (error) { wallet = { configured: true, exists: false, error: error.message }; }
    return {
      mode: config.mode,
      autoSync: config.autoSync,
      rpcUrl: config.rpcUrl,
      programId: config.programId,
      treasuryWallet: config.treasuryWallet || null,
      wallet,
      readyForDevnet: mode === 'solana' && wallet.exists && !config.programId.startsWith('REPLACE_'),
      requiredTools: ['anchor', 'solana'],
      note: mode === 'local'
        ? 'Local ledger mode records deterministic chain receipts without sending transactions.'
        : 'Solana mode expects Anchor/Solana CLI and a deployed Aura Protocol program id.'
    };
  };

  const requireAdmin = (req) => {
    const expected = env.AURA_ADMIN_TOKEN;
    if (!expected) return;
    const received = req.headers.authorization || '';
    if (received !== `Bearer ${expected}`) {
      const error = new Error('Admin token required for chain sync.');
      error.status = 401;
      throw error;
    }
  };

  const record = async (action, payload) => {
    const createdAt = new Date().toISOString();
    const digest = sha256({ action, payload, createdAt, programId: config.programId });
    if (mode === 'solana') {
      const state = status();
      if (!state.readyForDevnet) {
        const error = new Error('Solana mode is not ready. Set AURA_PROGRAM_ID and AURA_WALLET_KEYPAIR in .env.');
        error.status = 503;
        throw error;
      }
      return {
        id: `tx_${digest.slice(0, 12)}`,
        mode,
        action,
        state: 'READY_TO_SUBMIT',
        programId: config.programId,
        rpcUrl: config.rpcUrl,
        digest,
        createdAt,
        nextStep: 'Run Anchor deploy + client submit script after installing Solana/Anchor CLI.'
      };
    }
    return {
      id: `localtx_${digest.slice(0, 12)}`,
      mode: 'local',
      action,
      state: 'RECORDED_LOCAL_LEDGER',
      programId: config.programId,
      signature: `local_${digest}`,
      digest,
      createdAt
    };
  };

  return { config, status, requireAdmin, record };
};

module.exports = { createOnchainAdapter };
