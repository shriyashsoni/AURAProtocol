const fs = require('fs');
const path = require('path');

const parseDotenv = (raw) => raw.split(/\r?\n/).reduce((acc, line) => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return acc;
  const index = trimmed.indexOf('=');
  if (index === -1) return acc;
  const key = trimmed.slice(0, index).trim();
  let value = trimmed.slice(index + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  acc[key] = value;
  return acc;
}, {});

const loadEnv = (root) => {
  const envPath = path.join(root, '.env');
  if (fs.existsSync(envPath)) {
    const parsed = parseDotenv(fs.readFileSync(envPath, 'utf8'));
    Object.entries(parsed).forEach(([key, value]) => {
      if (process.env[key] === undefined) process.env[key] = value;
    });
  }
  return process.env;
};

module.exports = { loadEnv };
