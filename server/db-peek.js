/* Quick, read-only look inside the app database (data folder). No extra software needed.
   Usage:
     npm run db                  -> every table with its number of rows
     npm run db -- orders        -> the latest 15 rows of one table
     npm run db -- orders 50     -> the latest 50 rows
   Password hashes and session tokens are hidden. */
'use strict';
const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

let sqlite;
try { sqlite = require('node:sqlite'); } catch (e) {
  if (!process.execArgv.includes('--experimental-sqlite')) {
    const r = spawnSync(process.execPath, ['--experimental-sqlite', '--no-warnings', __filename, ...process.argv.slice(2)], { stdio: 'inherit' });
    process.exit(r.status == null ? 1 : r.status);
  }
  console.error('This needs Node.js 22.5 or newer. Install Node.js 24 LTS from https://nodejs.org');
  process.exit(1);
}

const config = require('./config');
const file = path.join(config.dataDir, config.brand.dbFile);
if (!fs.existsSync(file)) { console.log(`\n  No database yet at ${file}\n  Start the app once (start.bat or npm start) and it will be created.\n`); process.exit(0); }

const db = new sqlite.DatabaseSync(file, { readOnly: true });
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r => r.name);
const [table, limitArg] = process.argv.slice(2);
const HIDE = /^(pass_hash|pass_salt|password_hash|token_hash|sid_hash)$/;

if (!table) {
  console.log(`\n  ${config.brand.name} database: ${file}\n`);
  for (const t of tables) console.log(`  ${t.padEnd(16)} ${String(db.prepare(`SELECT COUNT(*) n FROM "${t}"`).get().n).padStart(6)} rows`);
  console.log('\n  See one table:  npm run db -- users   (or any table above)\n');
} else if (!tables.includes(table)) {
  console.log(`\n  No table called "${table}". Tables: ${tables.join(', ')}\n`);
} else {
  const limit = Math.min(Math.max(parseInt(limitArg || '15', 10) || 15, 1), 500);
  const cols = db.prepare(`PRAGMA table_info("${table}")`).all().map(c => c.name);
  const order = cols.includes('id') ? 'ORDER BY id DESC' : '';
  const rows = db.prepare(`SELECT * FROM "${table}" ${order} LIMIT ${limit}`).all().map(r => {
    const o = {};
    for (const k of Object.keys(r)) {
      let v = r[k];
      if (HIDE.test(k)) v = '(hidden)';
      else if (/_at$|_until$|^at$/.test(k) && typeof v === 'number' && v > 1e12) v = new Date(v).toLocaleString('en-GB');
      else if (typeof v === 'string' && v.length > 40) v = v.slice(0, 37) + '...';
      o[k] = v;
    }
    return o;
  });
  console.log(`\n  ${table}: latest ${rows.length} row(s)\n`);
  console.table(rows);
}
db.close();
