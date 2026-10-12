/* Server configuration.
   Change values in a `.env` file in the project folder (KEY=VALUE per line, see .env.example)
   or with environment variables. Environment variables win over .env, which wins over these defaults. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const brand = require('./brand');

const ROOT = path.join(__dirname, '..');
function loadDotEnv(file) {
  const out = {};
  try {
    fs.readFileSync(file, 'utf8').split(/\r?\n/).forEach(line => {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (!m || line.trim().startsWith('#')) return;
      out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
    });
  } catch (e) { /* no .env file: use defaults */ }
  return out;
}
const env = Object.assign({}, loadDotEnv(path.join(ROOT, '.env')), process.env);
const bool = v => /^(1|true|yes|on)$/i.test(String(v || ''));

module.exports = {
  ROOT, brand,
  publicDir: path.join(ROOT, 'public'),
  port: parseInt(env.PORT || String(brand.port), 10),
  // 127.0.0.1 keeps the app private to this computer. HOST=0.0.0.0 lets phones on your Wi-Fi open it.
  host: env.HOST || ((env.RENDER || env.PORT) ? '0.0.0.0' : '127.0.0.1'),
  dataDir: path.resolve(ROOT, env.DATA_DIR || 'data'),
  sessionDays: parseInt(env.SESSION_DAYS || '30', 10),
  // Password for the admin page (#/admin). Change it in .env.
  adminPassword: env.ADMIN_PASSWORD || 'swavyadmin',
  // Telegram bot: paste the token from @BotFather here (TELEGRAM_BOT_TOKEN=...) to switch the bot on.
  telegramToken: (env.TELEGRAM_BOT_TOKEN || '').trim(),
  // Optional web address people can open (used in bot messages for tracking links), e.g. https://dispatch.example.com
  publicUrl: (env.PUBLIC_URL || '').replace(/\/$/, ''),
  // Speed of the simulated rider dot on the map (1 = normal, 0 = off).
  simSpeed: env.SIM_SPEED == null ? 1 : Number(env.SIM_SPEED),
  seed: env.SEED == null ? true : bool(env.SEED),
  quiet: bool(env.QUIET)
};
