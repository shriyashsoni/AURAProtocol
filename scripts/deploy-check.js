const { spawnSync } = require('child_process');
const path = require('path');
const { createOnchainAdapter } = require('../lib/onchain');

const root = path.join(__dirname, '..');
const adapter = createOnchainAdapter({ root });
const commandState = (command) => {
  const result = spawnSync(command, ['--version'], { shell: true, encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() || 'installed' : 'missing';
};

const report = {
  backend: 'Aura Protocol',
  chain: adapter.status(),
  tools: {
    node: process.version,
    anchor: commandState('anchor'),
    solana: commandState('solana'),
    cargo: commandState('cargo')
  }
};

console.log(JSON.stringify(report, null, 2));
if (report.chain.mode === 'solana' && !report.chain.readyForDevnet) process.exitCode = 1;
