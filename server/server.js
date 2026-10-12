/* Swavy app server: Node.js built-ins only (node:http, node:sqlite, node:crypto).
   Usage: node server/server.js [--port 3000] [--open] */
'use strict';
const emitWarning = process.emitWarning;
process.emitWarning = function (warning, ...args) {
  const msg = typeof warning === 'string' ? warning : (warning && warning.message) || '';
  if (/sqlite/i.test(msg) && /experimental/i.test(msg + ' ' + (args[0] && (args[0].type || args[0])))) return;
  return emitWarning.call(process, warning, ...args);
};
try {
  require('node:sqlite');
} catch (e) {
  if ((e.code === 'ERR_UNKNOWN_BUILTIN_MODULE' || /node:sqlite/.test(e.message)) && !process.execArgv.includes('--experimental-sqlite')) {
    const { spawn } = require('node:child_process');
    const child = spawn(process.execPath, ['--experimental-sqlite', ...process.execArgv, __filename, ...process.argv.slice(2)], { stdio: 'inherit' });
    ['SIGINT', 'SIGTERM'].forEach(sig => process.on(sig, () => child.kill(sig)));
    child.on('exit', (code, signal) => process.exit(code == null ? (signal ? 1 : 0) : code));
    return;
  }
  console.error(`\n  This Node.js (${process.version}) has no built-in SQLite. Install Node.js 24 LTS from https://nodejs.org\n`);
  process.exit(1);
}
main();

function main() {
  const fs = require('node:fs');
  const path = require('node:path');
  const nodeHttp = require('node:http');
  const net = require('node:net');
  const config = require('./config');
  const http = require('./http');
  const core = require('./core');
  const { open } = require('./db');
  const appMod = require('./app');
  const brand = config.brand;

  const args = process.argv.slice(2);
  const portArg = args.indexOf('--port');
  const fixedPort = portArg >= 0 && args[portArg + 1];
  if (fixedPort) config.port = parseInt(args[portArg + 1], 10);
  const shouldOpen = args.includes('--open');
  const log = { info: (...a) => { if (!config.quiet) console.log(...a); }, error: (...a) => console.error('error:', ...a) };

  const dbFile = path.join(config.dataDir, brand.dbFile);
  const db = open(dbFile);
  const uploadDir = path.join(config.dataDir, 'uploads');
  fs.mkdirSync(uploadDir, { recursive: true });
  const app = appMod.createApp({ db, config, core });
  const seeded = appMod.seed(db, app, core, config.seed);   // areas + sample prices always; demo data only when SEED=1

  // ——— Sessions ———
  const auth = {
    start(ctx, userId, isAdmin) {
      const tok = core.token();
      db.run('INSERT INTO sessions (token_hash, user_id, is_admin, expires_at) VALUES (?,?,?,?)', core.sha256(tok), userId || null, isAdmin ? 1 : 0, Date.now() + config.sessionDays * 864e5);
      ctx.cookies.push(http.cookie(brand.cookie, tok, { maxAge: config.sessionDays * 86400 }));
    },
    end(ctx) {
      if (ctx.token) db.run('DELETE FROM sessions WHERE token_hash = ?', core.sha256(ctx.token));
      ctx.cookies.push(http.cookie(brand.cookie, '', { maxAge: 0 }));
    },
    lookup(tok) {
      const s = db.get('SELECT * FROM sessions WHERE token_hash = ? AND expires_at > ?', core.sha256(tok), Date.now());
      if (!s) return { user: null, admin: false };
      const user = s.user_id ? db.get('SELECT * FROM users WHERE id = ?', s.user_id) : null;
      return { user: user || null, admin: !!s.is_admin };
    },
    login(email, password) {
      const u = db.get('SELECT * FROM users WHERE email = ?', core.str(email, 120).toLowerCase());
      if (!u || !core.checkPassword(password, u.pass_salt, u.pass_hash)) core.fail('Email or password no correct. Check am and try again.', 'password', 401);
      return u;
    },
    createUser({ role, name, email, phone, password, city, area }) {
      name = core.str(name, 80); email = core.str(email, 120).toLowerCase(); phone = core.normPhone(phone);
      if (name.length < 2) core.fail('Please enter your name.', 'name');
      if (!core.isEmail(email)) core.fail('That email does not look right.', 'email');
      if (!/^\d{10,15}$/.test(phone)) core.fail('Enter a phone number like 0803 123 4567.', 'phone');
      if (String(password || '').length < 6) core.fail('Password needs at least 6 characters.', 'password');
      if (db.get('SELECT id FROM users WHERE email = ?', email)) core.fail('This email already has an account. Log in instead.', 'email', 409);
      const { salt, hash } = core.hashPassword(password);
      return Number(db.run('INSERT INTO users (role, name, email, phone, city, area, pass_salt, pass_hash, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
        role, name, email, phone, core.str(city, 40), core.str(area, 40), salt, hash, Date.now()).lastInsertRowid);
    }
  };
  db.run('DELETE FROM sessions WHERE expires_at < ?', Date.now());

  const limits = { auth: http.rateLimiter(30, 10 * 60000) };
  const router = http.createRouter();

  // ——— Shared routes: login, logout, me, admin login, photo uploads ———
  router.post('/api/login', ctx => {
    if (!limits.auth.hit(ctx.ip)) core.fail('Too many tries. Wait small and try again.', null, 429);
    const u = auth.login(ctx.body.email, ctx.body.password);
    auth.start(ctx, u.id);
    return { me: app.me(u) };
  });
  router.post('/api/logout', ctx => { auth.end(ctx); return {}; });
  router.get('/api/me', ctx => ({ me: ctx.user ? app.me(ctx.user) : null, admin: ctx.admin }));
  router.post('/api/admin/login', ctx => {
    if (!limits.auth.hit(ctx.ip)) core.fail('Too many tries. Wait small and try again.', null, 429);
    const a = Buffer.from(core.sha256(ctx.body.password || '')), b = Buffer.from(core.sha256(config.adminPassword));
    if (!require('node:crypto').timingSafeEqual(a, b)) core.fail('Wrong admin password.', 'password', 401);
    auth.start(ctx, ctx.user ? ctx.user.id : null, true);
    return {};
  });
  router.post('/api/upload', { auth: true, limit: 4 * 1024 * 1024 }, ctx => {
    const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(ctx.body.data || ''));
    if (!m) core.fail('Please choose a photo (JPG or PNG).');
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > 3 * 1024 * 1024) core.fail('That photo is too big. Try a smaller one.');
    const name = core.token(12) + '.' + (m[1] === 'jpeg' ? 'jpg' : m[1]);
    fs.writeFileSync(path.join(uploadDir, name), buf);
    return { url: '/uploads/' + name };
  });
  router.get('/uploads/:name', ctx => {
    if (!/^[A-Za-z0-9_-]+\.(jpg|png|webp)$/.test(ctx.params.name)) core.fail('Not found', null, 404);
    const file = path.join(uploadDir, ctx.params.name);
    if (!fs.existsSync(file)) core.fail('Not found', null, 404);
    const body = fs.readFileSync(file);
    const type = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[path.extname(file).slice(1)];
    http.send(ctx.res, 200, body, { 'Content-Type': type, 'Cache-Control': 'private, max-age=86400' });
  });
  appMod.routes(router, { db, app, auth, core, config, http });

  const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
  async function handle(req, res) {
    let url;
    try { url = new URL(req.url, 'http://localhost'); } catch (e) { return http.json(res, 400, { ok: false, error: 'Bad request.' }); }
    const pathname = url.pathname;
    const isApi = pathname.startsWith('/api/');
    const m = router.match(req.method, pathname);
    if (!m) {
      if ((req.method === 'GET' || req.method === 'HEAD') && !isApi && http.serveStatic(config.publicDir, req, res, pathname)) return;
      return isApi ? http.json(res, 404, { ok: false, error: 'Not found.' })
        : http.html(res, 404, `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Not found · ${brand.name}</title><body style="font:16px system-ui;padding:40px"><h1>Page no dey here</h1><p><a href="/">Go to ${brand.name}</a></p>`);
    }
    if (m.notAllowed) return http.json(res, 405, { ok: false, error: 'Method not allowed.' });
    const cookiesIn = http.parseCookies(req);
    const ctx = { req, res, params: m.params, query: Object.fromEntries(url.searchParams), cookies: [], ip: http.clientIp(req), body: {} };
    try {
      if (MUTATING.has(req.method) && isApi) {
        if (!http.sameOrigin(req)) return http.json(res, 403, { ok: false, error: 'Cross-origin request blocked.' });
        if (!/application\/json/i.test(String(req.headers['content-type'] || ''))) return http.json(res, 415, { ok: false, error: 'Send requests as application/json.' });
        ctx.body = await http.parseBody(req, m.route.opts.limit || 65536);
      }
      ctx.token = cookiesIn[brand.cookie] || '';
      Object.assign(ctx, ctx.token ? auth.lookup(ctx.token) : { user: null, admin: false });
      const o = m.route.opts;
      if (o.auth && !ctx.user) return http.json(res, 401, { ok: false, code: 'auth', error: 'Please log in first.' });
      if (o.role && (!ctx.user || ctx.user.role !== o.role)) return http.json(res, 403, { ok: false, error: 'This page is not for your account type.' });
      if (o.admin && !ctx.admin) return http.json(res, 401, { ok: false, code: 'admin', error: 'Admin login needed.' });
      const out = await m.route.handler(ctx);
      if (res.headersSent || res.writableEnded) return;
      http.json(res, 200, Object.assign({ ok: true }, out || {}), ctx.cookies.length ? { 'Set-Cookie': ctx.cookies } : null);
    } catch (e) {
      if (e instanceof core.UserError || (e && e.status && e.status < 500)) {
        if (!isApi) return http.html(res, e.status || 400, `<!doctype html><meta charset="utf-8"><title>${brand.name}</title><body style="font:16px system-ui;padding:40px">Not found. <a href="/">Go home</a>`);
        return http.json(res, e.status || 400, { ok: false, error: e.message, field: e.field || undefined, code: e.code || undefined });
      }
      log.error(`${req.method} ${pathname} failed:`, e);
      http.json(res, 500, { ok: false, error: 'Something went wrong on the server. Please try again.' });
    }
  }

  const server = nodeHttp.createServer((req, res) => { handle(req, res).catch(e => { log.error(e); try { http.json(res, 500, { ok: false, error: 'Server error.' }); } catch (e2) { /* ignore */ } }); });
  server.keepAliveTimeout = 5000;

  // Use the configured port, or the next free one if it is taken (unless --port was given).
  function freePort(p, tries) {
    return new Promise(resolve => {
      const t = net.createServer().once('error', () => resolve(tries > 0 ? freePort(p + 1, tries - 1) : p)).once('listening', () => t.close(() => resolve(p))).listen(p, config.host);
    });
  }
  (fixedPort ? Promise.resolve(config.port) : freePort(config.port, 20)).then(port => {
    server.on('error', e => {
      console.error(e.code === 'EADDRINUSE' ? `\n  Port ${port} is already in use. Try: node server/server.js --port ${port + 1}\n` : `\n  Could not start the server: ${e.message}\n`);
      process.exit(1);
    });
    server.listen(port, config.host, () => {
      const url = `http://localhost:${port}`;
      log.info(`\n  ${brand.name} is running  (Node ${process.version})`);
      log.info(`  Open:       ${url}`);
      log.info(`  Database:   ${dbFile}${seeded ? '   (new, filled with SAMPLE demo data)' : ''}`);
      log.info(`  Demo login: ${brand.demo}`);
      log.info(`  Admin page: ${url}/#/admin   (password from .env, default "swavyadmin")`);
      log.info(`  Bot test:   ${url}/bot-test   (try the Telegram bot without a token)`);
      if (!config.telegramToken) log.info('  Telegram:   off. Add TELEGRAM_BOT_TOKEN to .env to switch the real bot on (see README).');
      log.info('\n  Keep this window open. Press Ctrl+C to stop.\n');
      if (shouldOpen) openBrowser(url);
    });
  });

  function openBrowser(url) {
    const { spawn } = require('node:child_process');
    const cmd = process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
    try { spawn(cmd[0], cmd[1], { stdio: 'ignore', detached: true, windowsVerbatimArguments: process.platform === 'win32' }).on('error', () => {}).unref(); } catch (e) { /* no browser */ }
  }
  let closing = false;
  function shutdown() {
    if (closing) return; closing = true;
    server.close(() => { db.close(); process.exit(0); });
    server.closeAllConnections && server.closeAllConnections();
    setTimeout(() => { db.close(); process.exit(0); }, 1500).unref();
  }
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
