/* Swavy Dispatch API test: starts a fresh server on a temporary database and runs the main flows.
   Run with: npm test */
'use strict';
const { spawn } = require('node:child_process');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'swavy-dispatch-test-'));
const PORT = 3900 + Math.floor(Math.random() * 90), BASE = `http://localhost:${PORT}`;
let pass = 0, failed = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('  ✓ ' + name); } else { failed++; console.log('  ✗ ' + name, extra !== undefined ? JSON.stringify(extra).slice(0, 300) : ''); } };
function client() {
  let cookie = '';
  return async (method, url, body) => {
    const r = await fetch(BASE + url, { method, headers: Object.assign({ 'Content-Type': 'application/json', Origin: BASE }, cookie ? { Cookie: cookie } : {}), body: body ? JSON.stringify(body) : undefined });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    const j = await r.json().catch(() => ({})); j.status = r.status; return j;
  };
}
(async () => {
  console.log('\n  Swavy Dispatch API');
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'server.js'), '--port', String(PORT)], { env: Object.assign({}, process.env, { DATA_DIR: DATA, QUIET: '1', SIM_SPEED: '0', TELEGRAM_BOT_TOKEN: '' }), stdio: 'inherit' });
  for (let i = 0; i < 50; i++) { try { await fetch(BASE + '/api/catalog'); break; } catch (e) { await new Promise(r => setTimeout(r, 200)); } }
  try {
    const cust = client(), rider = client(), rider2 = client(), anon = client(), admin = client();
    const cat = await anon('GET', '/api/catalog');
    ok('catalog has Lagos + Abuja areas and 3 sizes', cat.cities.Lagos.length === 10 && cat.cities.Abuja.length === 8 && cat.sizes.length === 3);
    const qs = await anon('POST', '/api/quote', { pickupArea: 'Yaba', dropArea: 'Lekki', size: 'small' });
    const qm = await anon('POST', '/api/quote', { pickupArea: 'Yaba', dropArea: 'Lekki', size: 'medium' });
    const qx = await anon('POST', '/api/quote', { pickupArea: 'Yaba', dropArea: 'Lekki', size: 'medium', express: true });
    ok('zone price for Yaba → Lekki small (sample 3500)', qs.price === 3500, qs);
    ok('medium costs more, express adds the fee', qm.price === 4600 && qx.price === 6100, [qm.price, qx.price]);
    ok('same price both directions', (await anon('POST', '/api/quote', { pickupArea: 'Lekki', dropArea: 'Yaba', size: 'small' })).price === 3500);
    ok('Lagos → Abuja refused', (await anon('POST', '/api/quote', { pickupArea: 'Yaba', dropArea: 'Wuse', size: 'small' })).status === 400);
    for (const [c, e] of [[cust, 'customer'], [rider, 'rider'], [rider2, 'rider2']]) ok(e + ' logs in', (await c('POST', '/api/login', { email: e + '@swavy.ng', password: 'swavy123' })).ok);
    ok('guest cannot book', (await anon('POST', '/api/orders', {})).status === 401);
    ok('missing receiver phone refused', (await cust('POST', '/api/orders', { pickupArea: 'Yaba', pickupAddr: '12 Herbert Macaulay', dropArea: 'Lekki', dropAddr: 'Admiralty Way', size: 'small' })).field === 'receiverPhone');
    const B = { pickupArea: 'Yaba', pickupAddr: '12 Herbert Macaulay Way', dropArea: 'Lekki', dropAddr: 'Admiralty Way', size: 'medium', item: 'Shoes', receiverName: 'Kemi', receiverPhone: '0802 000 1111', pay: 'cash_delivery', collect: true, collectAmount: 25000 };
    const o = (await cust('POST', '/api/orders', B)).order;
    ok('customer books: price matches quote, code + tracking token', o.price === qm.price && /^SWD-\d{5}$/.test(o.code) && o.token && /^\d{4}$/.test(o.deliveryCode) && o.collectStatus === 'pending');
    const tr = await anon('GET', '/api/track/' + o.token);
    ok('public tracking link works and shows the delivery code', tr.order.status === 'pending' && tr.order.deliveryCode === o.deliveryCode && !tr.order.senderPhone);
    ok('bad tracking token is 404', (await anon('GET', '/api/track/nope')).status === 404);
    // SSE stream
    const ctrl = new AbortController(); const seen = [];
    const sse = fetch(`${BASE}/api/track/${o.token}/stream`, { signal: ctrl.signal }).then(async r => { const rd = r.body.getReader(); const dec = new TextDecoder(); let buf = ''; for (;;) { const { value, done } = await rd.read(); if (done) break; buf += dec.decode(value); let i; while ((i = buf.indexOf('\n\n')) >= 0) { const chunk = buf.slice(0, i); buf = buf.slice(i + 2); const line = chunk.split('\n').find(l => l.startsWith('data: ')); if (line) seen.push(JSON.parse(line.slice(6))); } } }).catch(() => {});
    await new Promise(r => setTimeout(r, 300));
    const d1 = await rider('GET', '/api/rider');
    ok('online verified rider sees the job offer', d1.offers.some(x => x.id === o.id) && d1.offers.find(x => x.id === o.id).deliveryCode === undefined);
    ok('rider cannot see the delivery code', !('deliveryCode' in d1.offers[0]));
    const acc = await rider('POST', `/api/rider/jobs/${o.id}/accept`);
    ok('rider accepts → heading to pickup', acc.order.status === 'to_pickup');
    ok('second rider cannot take the same job', (await rider2('POST', `/api/rider/jobs/${o.id}/accept`)).status === 409);
    ok('cannot deliver before pickup', (await rider('POST', `/api/rider/jobs/${o.id}/deliver`, { code: o.deliveryCode })).status === 400);
    ok('picked up (with photo path)', (await rider('POST', `/api/rider/jobs/${o.id}/step`, { to: 'picked', photo: '/img/sample/rider-1.svg' })).order.status === 'picked');
    ok('on the way', (await rider('POST', `/api/rider/jobs/${o.id}/step`, { to: 'on_way' })).order.status === 'on_way');
    const wrong = o.deliveryCode === '0000' ? '1111' : '0000';
    ok('wrong delivery code refused', (await rider('POST', `/api/rider/jobs/${o.id}/deliver`, { code: wrong })).field === 'code');
    const dl = await rider('POST', `/api/rider/jobs/${o.id}/deliver`, { code: o.deliveryCode });
    ok('right code completes delivery, money collected', dl.order.status === 'delivered' && dl.order.collectStatus === 'collected' && dl.order.paid);
    await new Promise(r => setTimeout(r, 300)); ctrl.abort(); await sse;
    const statuses = seen.filter(s => s.type === 'order').map(s => s.order.status);
    ok('live stream pushed every status', ['pending', 'to_pickup', 'picked', 'on_way', 'delivered'].every(s => statuses.includes(s)), statuses);
    const d2 = await rider('GET', '/api/rider');
    ok('rider earnings today include 80% share', d2.earnings.today >= Math.round(o.price * 0.8) && d2.earnings.todayJobs >= 1);
    ok('cash to hand over = fee + item money (+ sample)', d2.cash.items.some(i => i.id === o.id && i.total === o.price + 25000));
    ok('customer rates rider', (await cust('POST', `/api/orders/${o.id}/rate`, { stars: 5, note: 'Fast!' })).order.rating === 5);
    ok('cannot rate twice', (await cust('POST', `/api/orders/${o.id}/rate`, { stars: 1 })).status === 400);
    // Cancel + admin
    const o2 = (await cust('POST', '/api/orders', Object.assign({}, B, { collect: false, pay: 'transfer' }))).order;
    ok('transfer is marked paid (simulated)', o2.paid === true);
    ok('admin needs password', (await anon('GET', '/api/admin/overview')).status === 401);
    ok('wrong admin password refused', (await admin('POST', '/api/admin/login', { password: 'x' })).status === 401);
    await admin('POST', '/api/admin/login', { password: 'swavyadmin' });
    const ov = await admin('GET', '/api/admin/overview');
    ok('admin sees orders, riders, prices', ov.orders.length >= 5 && ov.riders.length >= 4 && ov.prices.length >= 15);
    const unv = ov.riders.find(r => !r.verified);
    ok('cannot assign unverified rider', (await admin('POST', `/api/admin/orders/${o2.id}/assign`, { riderId: unv.id })).status === 400);
    const r2id = ov.riders.find(r => /Emeka/.test(r.name)).id;
    ok('admin assigns rider 2', (await admin('POST', `/api/admin/orders/${o2.id}/assign`, { riderId: r2id })).order.status === 'assigned');
    ok('assigned rider sees it as active job', (await rider2('GET', '/api/rider')).active.some(x => x.id === o2.id));
    const r1id = ov.riders.find(r => /Musa/.test(r.name)).id;
    ok('admin reassigns to rider 1', (await admin('POST', `/api/admin/orders/${o2.id}/assign`, { riderId: r1id })).order.rider.id === r1id);
    ok('customer cancels while assigned', (await cust('POST', `/api/orders/${o2.id}/cancel`)).order.status === 'cancelled');
    ok('admin verifies a rider', (await admin('POST', `/api/admin/riders/${unv.id}/verify`, { verified: true })).ok);
    const rem = await admin('POST', `/api/admin/riders/${r1id}/remit`);
    ok('admin marks rider cash as received', rem.amount >= o.price + 25000);
    ok('rider cash back to zero', (await rider('GET', '/api/rider')).cash.total === 0);
    ok('pay out collected item money to sender', (await admin('POST', `/api/admin/orders/${o.id}/payout`)).ok);
    ok('price edit applies to quotes', (await admin('POST', '/api/admin/prices', { prices: [{ city: 'Lagos', z1: 1, z2: 3, amount: 4000 }], settings: { express: 2000 } })).ok && (await anon('POST', '/api/quote', { pickupArea: 'Yaba', dropArea: 'Lekki', size: 'small', express: true })).price === 6000);
    ok('offline rider gets no offers', (await rider('POST', '/api/rider/online', { online: false })).offers.length === 0);
    // Bot test endpoint (web chat drives the same bot)
    const chat = 'web-apitest123';
    let br = await anon('POST', '/api/bot-test/send', { chat, text: '/start' });
    ok('bot test chat replies to /start', br.replies[0].buttons.length > 0);
    for (const step of [{ data: 'book' }, { data: 'bc:Abuja' }, { data: 'bp:Wuse' }, { text: 'Plot 5 Aminu Kano Cres' }, { data: 'bd:Garki' }, { text: 'Area 11 Shopping' }, { data: 'bs:small' }, { text: '08099990000' }, { data: 'bok' }]) br = await anon('POST', '/api/bot-test/send', Object.assign({ chat }, step));
    ok('bot test booking creates an order', /Booked/.test(br.replies[0].text));
    ok('sign up as rider waits for verification', (await client()('POST', '/api/signup', { role: 'rider', name: 'New Rider', email: 'new@rider.ng', phone: '08011112222', password: 'secret1', area: 'Ikeja', plate: 'KJA-111AA' })).me.rider.verified === false);
  } catch (e) { failed++; console.error(e); }
  srv.kill();
  console.log(`\n  ${pass} passed, ${failed} failed\n`);
  fs.rmSync(DATA, { recursive: true, force: true });
  process.exit(failed ? 1 : 0);
})();
