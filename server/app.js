/* Swavy Dispatch: motorcycle parcel delivery. Pricing, orders, riders, live tracking (SSE),
   simulated rider movement, cash remittance and admin tools. */
'use strict';
const path = require('node:path');

const SIZES = [
  { key: 'small', name: 'Small', hint: 'Fits in a hand: documents, phone, food pack', icon: 'mail' },
  { key: 'medium', name: 'Medium', hint: 'Fits in a backpack: shoes, clothes, small box', icon: 'bag' },
  { key: 'large', name: 'Large', hint: 'Fits the bike box: carton, 2-3 bags', icon: 'box' }
];
const PAY = {
  cash_pickup: 'Cash at pickup',
  cash_delivery: 'Cash on delivery',
  transfer: 'Transfer (simulated)'
};
const STATUS = {
  pending: 'Looking for a rider',
  assigned: 'Rider assigned',
  to_pickup: 'Rider heading to pickup',
  picked: 'Package picked up',
  on_way: 'On the way',
  delivered: 'Delivered',
  cancelled: 'Cancelled'
};
const FLOW = ['pending', 'assigned', 'to_pickup', 'picked', 'on_way', 'delivered'];
const PAY_NOTE = 'Transfer is simulated in this demo: no real money moves. Real payments would need a provider like Paystack later.';
const DEFAULT_SETTINGS = { medium: '1.3', large: '1.7', express: '1500', riderShare: '80' };

function createApp({ db, config, core }) {
  const { fail, str, text, int } = core;
  const now = () => Date.now();
  const listeners = new Set();
  const on = fn => { listeners.add(fn); return () => listeners.delete(fn); };
  const emit = (type, o, extra) => { for (const fn of listeners) { try { fn(type, o, extra); } catch (e) { console.error('listener failed:', e.message); } } };

  // ——— Settings, areas and prices ———
  const settings = () => Object.assign({}, DEFAULT_SETTINGS, Object.fromEntries(db.all('SELECT key, value FROM settings').map(r => [r.key, r.value])));
  const areas = () => db.all('SELECT * FROM areas ORDER BY city, zone, name');
  const area = name => db.get('SELECT * FROM areas WHERE name = ?', str(name, 40));
  const cities = () => { const out = {}; for (const a of areas()) (out[a.city] = out[a.city] || []).push(a.name); return out; };
  function zonePrice(city, a, b) {
    const [z1, z2] = a <= b ? [a, b] : [b, a];
    const r = db.get('SELECT amount FROM zone_prices WHERE city = ? AND z1 = ? AND z2 = ?', city, z1, z2);
    return r ? r.amount : null;
  }
  const round100 = n => Math.round(n / 100) * 100;
  function quote(b) {
    const A = area(b.pickupArea), B = area(b.dropArea);
    if (!A) fail('Pick the pickup area.', 'pickupArea');
    if (!B) fail('Pick the drop-off area.', 'dropArea');
    if (A.city !== B.city) fail(`We deliver inside one city for now. ${A.name} is in ${A.city} and ${B.name} is in ${B.city}.`, 'dropArea');
    const size = SIZES.find(s => s.key === b.size) ? b.size : 'small';
    const base = zonePrice(A.city, A.zone, B.zone);
    if (base == null) fail('No price set for this route yet. Ask the admin to add it.');
    const s = settings();
    const mult = size === 'small' ? 1 : Number(s[size]) || 1;
    const express = b.express ? Number(s.express) || 0 : 0;
    const price = round100(base * mult) + express;
    const dist = Math.hypot(A.x - B.x, A.y - B.y);
    const mins = Math.round(15 + dist * 0.9 * (b.express ? 0.7 : 1));
    return { city: A.city, pickupArea: A.name, dropArea: B.name, size, express: !!b.express, base, sizeExtra: round100(base * mult) - base, expressFee: express, price, eta: `${mins}-${mins + 15} min` };
  }

  // ——— Output shapes ———
  function riderOut(uid) {
    if (!uid) return null;
    const r = db.get('SELECT r.*, u.name, u.phone FROM riders r JOIN users u ON u.id = r.user_id WHERE r.user_id = ?', uid);
    if (!r) return null;
    return { id: r.user_id, name: r.name, phone: r.phone, plate: r.plate, bike: r.bike, photo: r.photo, verified: !!r.verified, online: !!r.online, x: r.x, y: r.y, rating: r.rating_n ? Math.round(r.rating_sum / r.rating_n * 10) / 10 : null, ratings: r.rating_n };
  }
  // view: 'owner' (sender, sees code), 'rider', 'admin', 'public' (tracking link: also sees code, it is for sender + receiver)
  function orderOut(o, view) {
    const A = area(o.pickup_area) || {}, B = area(o.drop_area) || {};
    const out = {
      id: o.id, code: o.code, token: o.token, source: o.source, status: o.status, statusText: STATUS[o.status], step: FLOW.indexOf(o.status),
      city: o.city, pickupArea: o.pickup_area, pickupAddr: o.pickup_addr, dropArea: o.drop_area, dropAddr: o.drop_addr,
      pickupXY: [A.x, A.y], dropXY: [B.x, B.y],
      size: o.size, item: o.item, receiverName: o.receiver_name, receiverPhone: o.receiver_phone, senderName: o.sender_name, senderPhone: o.sender_phone,
      express: !!o.express, price: o.price, pay: o.pay, payText: PAY[o.pay], paid: !!o.paid,
      collectAmount: o.collect_amount, collectStatus: o.collect_status, pickupPhoto: o.pickup_photo,
      rating: o.rating, ratingNote: o.rating_note, remitted: !!o.remitted, sample: !!o.is_sample,
      createdAt: o.created_at, updatedAt: o.updated_at, deliveredAt: o.delivered_at,
      rider: riderOut(o.rider_id),
      events: db.all('SELECT status, text, at FROM order_events WHERE order_id = ? ORDER BY id', o.id)
    };
    if (view === 'owner' || view === 'public' || view === 'admin') out.deliveryCode = o.delivery_code;
    if (view === 'rider') { delete out.token; out.cashToCollect = (o.pay === 'cash_delivery' && !o.paid ? o.price : 0) + (o.collect_status === 'pending' ? o.collect_amount : 0); out.cashAtPickup = o.pay === 'cash_pickup' && !o.paid ? o.price : 0; out.earn = riderEarn(o); }
    if (view === 'public') { delete out.senderPhone; }
    return out;
  }
  const riderEarn = o => Math.round(o.price * (Number(settings().riderShare) || 80) / 100);
  const getOrder = id => db.get('SELECT * FROM orders WHERE id = ?', Number(id)) || fail('Order not found.', null, 404);
  const byToken = t => db.get('SELECT * FROM orders WHERE token = ?', str(t, 60)) || fail('This tracking link is not valid.', null, 404);
  const byCode = c => db.get('SELECT * FROM orders WHERE code = ?', str(c, 20).toUpperCase().replace(/^SWD-?/, 'SWD-'));

  function event(o, status, msg) {
    db.run('INSERT INTO order_events (order_id, status, text, at) VALUES (?,?,?,?)', o.id, status, msg, now());
  }
  function setStatus(o, status, msg, extra) {
    const sets = ['status = ?', 'updated_at = ?'], vals = [status, now()];
    for (const [k, v] of Object.entries(extra || {})) { sets.push(`${k} = ?`); vals.push(v); }
    db.tx(() => { db.run(`UPDATE orders SET ${sets.join(', ')} WHERE id = ?`, ...vals, o.id); event(o, status, msg); });
    const fresh = getOrder(o.id);
    emit('status', fresh, { text: msg });
    return fresh;
  }

  // ——— Create an order (web, Telegram or test chat) ———
  function createOrder(user, b, opts) {
    opts = opts || {};
    const q = quote(b);
    const pickupAddr = text(b.pickupAddr, 160), dropAddr = text(b.dropAddr, 160);
    if (pickupAddr.length < 3) fail('Type the pickup address (street, house number or landmark).', 'pickupAddr');
    if (dropAddr.length < 3) fail('Type the drop-off address.', 'dropAddr');
    const receiverName = str(b.receiverName, 60) || 'Receiver';
    const receiverPhone = core.normPhone(b.receiverPhone);
    if (!/^\d{10,15}$/.test(receiverPhone)) fail("Enter the receiver's phone number, like 0803 123 4567.", 'receiverPhone');
    const pay = PAY[b.pay] ? b.pay : 'cash_delivery';
    const collect = b.collect ? int(b.collectAmount, 'collectAmount', { min: 100, max: 5e6, label: 'Amount to collect' }) : 0;
    const senderName = user ? user.name : str(b.senderName, 60) || 'Customer';
    const senderPhone = user ? user.phone : core.normPhone(b.senderPhone);
    const t = now();
    let code; do { code = core.ref('SWD'); } while (db.get('SELECT 1 FROM orders WHERE code = ?', code));
    const id = db.tx(() => {
      const id = Number(db.run(`INSERT INTO orders (code, token, customer_id, source, tg_chat, sender_name, sender_phone, city, pickup_area, pickup_addr, drop_area, drop_addr, size, item, receiver_name, receiver_phone, express, price, pay, paid, collect_amount, collect_status, delivery_code, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        code, core.token(12), user ? user.id : null, opts.source || 'web', opts.chat || null, senderName, senderPhone, q.city, q.pickupArea, pickupAddr, q.dropArea, dropAddr, q.size, str(b.item, 80) || 'Package',
        receiverName, receiverPhone, q.express ? 1 : 0, q.price, pay, pay === 'transfer' ? 1 : 0, collect, collect ? 'pending' : 'none', core.code4(), t, t).lastInsertRowid);
      event({ id }, 'pending', `Order booked${opts.source && opts.source !== 'web' ? ' on ' + (opts.source === 'telegram' ? 'Telegram' : 'the test chat') : ''}. Looking for a rider near ${q.pickupArea}.`);
      if (pay === 'transfer') event({ id }, 'pending', 'Transfer marked as paid (simulated)');
      return id;
    });
    const o = getOrder(id);
    emit('new', o);
    return o;
  }

  // ——— Customer ———
  function ownOrder(user, id) { const o = getOrder(id); if (o.customer_id !== user.id) fail('Order not found.', null, 404); return o; }
  function myOrders(user) { return db.all('SELECT * FROM orders WHERE customer_id = ? ORDER BY id DESC LIMIT 50', user.id).map(o => orderOut(o, 'owner')); }
  function cancel(user, id) {
    const o = ownOrder(user, id);
    if (!['pending', 'assigned'].includes(o.status)) fail('The rider has started this delivery. Call the rider or Swavy support to cancel.');
    return setStatus(o, 'cancelled', 'Cancelled by sender');
  }
  function rate(user, id, stars, note) {
    const o = ownOrder(user, id);
    if (o.status !== 'delivered') fail('You can rate after delivery.');
    if (o.rating) fail('You already rated this delivery. Thank you!');
    const n = int(stars, 'stars', { min: 1, max: 5, label: 'Stars' });
    db.tx(() => {
      db.run('UPDATE orders SET rating = ?, rating_note = ?, updated_at = ? WHERE id = ?', n, text(note, 300), now(), o.id);
      if (o.rider_id) db.run('UPDATE riders SET rating_sum = rating_sum + ?, rating_n = rating_n + 1 WHERE user_id = ?', n, o.rider_id);
    });
    return getOrder(o.id);
  }

  // ——— Rider ———
  const riderRow = user => db.get('SELECT * FROM riders WHERE user_id = ?', user.id) || fail('Rider profile not found.', null, 404);
  function setOnline(user, online) {
    const r = riderRow(user);
    if (online && !r.verified) fail('Your account is waiting for Swavy to verify your bike papers. You can go online after that.');
    db.run('UPDATE riders SET online = ? WHERE user_id = ?', online ? 1 : 0, user.id);
  }
  const ACTIVE = "('assigned','to_pickup','picked','on_way')";
  function riderDash(user) {
    const r = riderRow(user);
    const me = riderOut(user.id);
    const active = db.all(`SELECT * FROM orders WHERE rider_id = ? AND status IN ${ACTIVE} ORDER BY id`, user.id).map(o => orderOut(o, 'rider'));
    let offers = [];
    if (r.online && r.verified) {
      offers = db.all("SELECT * FROM orders WHERE status = 'pending' AND rider_id IS NULL AND city = ? ORDER BY express DESC, id DESC LIMIT 20", user.city).map(o => {
        const x = orderOut(o, 'rider'); x.away = Math.round(Math.hypot(r.x - x.pickupXY[0], r.y - x.pickupXY[1]) / 8 * 10) / 10; return x;
      }).sort((a, b) => a.away - b.away);
    }
    const day = new Date(); day.setHours(0, 0, 0, 0);
    const week = new Date(day); week.setDate(week.getDate() - ((week.getDay() + 6) % 7));
    const done = db.all("SELECT * FROM orders WHERE rider_id = ? AND status = 'delivered' ORDER BY delivered_at DESC", user.id);
    const sum = since => done.filter(o => o.delivered_at >= since).reduce((s, o) => s + riderEarn(o), 0);
    const cash = cashFor(user.id);
    return {
      me, offers, active,
      earnings: { today: sum(+day), week: sum(+week), todayJobs: done.filter(o => o.delivered_at >= +day).length, weekJobs: done.filter(o => o.delivered_at >= +week).length, share: Number(settings().riderShare) || 80 },
      cash, recent: done.slice(0, 10).map(o => orderOut(o, 'rider'))
    };
  }
  function cashFor(riderId) {
    const rows = db.all("SELECT * FROM orders WHERE rider_id = ? AND remitted = 0 AND status IN ('picked','on_way','delivered')", riderId);
    const items = rows.map(o => {
      const fee = (o.pay === 'cash_pickup' || (o.pay === 'cash_delivery' && o.status === 'delivered')) ? o.price : 0;
      const collected = o.collect_status === 'collected' ? o.collect_amount : 0;
      return { id: o.id, code: o.code, fee, collected, total: fee + collected, at: o.delivered_at || o.updated_at };
    }).filter(i => i.total > 0);
    return { total: items.reduce((s, i) => s + i.total, 0), items };
  }
  function riderOrder(user, id) { const o = getOrder(id); if (o.rider_id !== user.id) fail('This job is not yours.', null, 403); return o; }
  function accept(user, id) {
    const r = riderRow(user);
    if (!r.verified) fail('Your account is not verified yet.');
    if (!r.online) fail('Go online first.');
    const o = getOrder(id);
    if (o.status !== 'pending' || o.rider_id) fail('Another rider already took this job. Check the next one!', null, 409);
    const changed = db.run("UPDATE orders SET rider_id = ?, status = 'to_pickup', updated_at = ? WHERE id = ? AND status = 'pending' AND rider_id IS NULL", user.id, now(), o.id).changes;
    if (!changed) fail('Another rider already took this job.', null, 409);
    event(o, 'to_pickup', `${user.name} accepted. Heading to pickup in ${o.pickup_area}.`);
    const fresh = getOrder(o.id); emit('status', fresh, { text: 'Rider accepted and is heading to pickup' });
    return fresh;
  }
  function advance(user, id, b) {
    const o = riderOrder(user, id);
    const to = str(b.to, 20);
    if (o.status === 'assigned' && to === 'to_pickup') return setStatus(o, 'to_pickup', `${user.name} is heading to pickup`);
    if (o.status === 'to_pickup' && to === 'picked') {
      const photo = /^\/(uploads|img)\/[A-Za-z0-9_\/.-]+$/.test(String(b.photo || '')) ? b.photo : '';
      const paidNow = o.pay === 'cash_pickup' ? { paid: 1 } : {};
      return setStatus(o, 'picked', `Package picked up${photo ? ' (photo taken)' : ''}${o.pay === 'cash_pickup' ? `. Rider collected ${naira(o.price)} cash` : ''}`, Object.assign({ pickup_photo: photo }, paidNow));
    }
    if (o.status === 'picked' && to === 'on_way') return setStatus(o, 'on_way', `On the way to ${o.drop_area}`);
    fail('You cannot do that step now.');
  }
  function deliver(user, id, code) {
    const o = riderOrder(user, id);
    if (!['picked', 'on_way'].includes(o.status)) fail('Pick up the package first.');
    if (String(code || '').trim() !== o.delivery_code) fail("Wrong code. Ask the receiver for the 4-digit code in their Swavy tracking link or SMS.", 'code');
    const extra = { delivered_at: now() };
    if (o.pay === 'cash_delivery') extra.paid = 1;
    if (o.collect_status === 'pending') extra.collect_status = 'collected';
    const B = area(o.drop_area); if (B) db.run('UPDATE riders SET x = ?, y = ? WHERE user_id = ?', B.x, B.y, user.id);
    const bits = [];
    if (o.pay === 'cash_delivery') bits.push(`${naira(o.price)} delivery fee`);
    if (o.collect_status === 'pending') bits.push(`${naira(o.collect_amount)} item money`);
    return setStatus(o, 'delivered', `Delivered with the receiver's code${bits.length ? '. Rider collected ' + bits.join(' + ') : ''}`, extra);
  }

  // ——— Admin ———
  function adminOverview() {
    const orders = db.all('SELECT * FROM orders ORDER BY id DESC LIMIT 100').map(o => orderOut(o, 'admin'));
    const riders = db.all('SELECT user_id FROM riders ORDER BY verified, user_id').map(r => Object.assign(riderOut(r.user_id), { city: db.get('SELECT city FROM users WHERE id = ?', r.user_id).city, cash: cashFor(r.user_id), active: db.get(`SELECT COUNT(*) n FROM orders WHERE rider_id = ? AND status IN ${ACTIVE}`, r.user_id).n }));
    const zones = db.all('SELECT * FROM zones ORDER BY city, zone');
    const prices = db.all('SELECT * FROM zone_prices ORDER BY city, z1, z2');
    const collects = db.all("SELECT * FROM orders WHERE collect_status = 'collected' ORDER BY delivered_at DESC").map(o => ({ id: o.id, code: o.code, sender: o.sender_name, amount: o.collect_amount, remitted: !!o.remitted }));
    const remits = db.all('SELECT m.*, u.name FROM remittances m JOIN users u ON u.id = m.rider_id ORDER BY m.id DESC LIMIT 20');
    const stats = {
      today: db.get('SELECT COUNT(*) n FROM orders WHERE created_at > ?', now() - 864e5).n,
      live: db.get(`SELECT COUNT(*) n FROM orders WHERE status IN ${ACTIVE}`).n,
      waiting: db.get("SELECT COUNT(*) n FROM orders WHERE status = 'pending'").n,
      delivered: db.get("SELECT COUNT(*) n FROM orders WHERE status = 'delivered'").n,
      cashOut: riders.reduce((s, r) => s + r.cash.total, 0),
      online: riders.filter(r => r.online).length
    };
    return { stats, orders, riders, zones, prices, areas: areas(), settings: settings(), collects, remits };
  }
  function assign(id, riderId) {
    const o = getOrder(id);
    if (['delivered', 'cancelled'].includes(o.status)) fail('This order is closed.');
    const r = riderOut(Number(riderId));
    if (!r) fail('Pick a rider.', 'rider');
    if (!r.verified) fail('That rider is not verified yet.');
    const again = !!o.rider_id;
    const status = ['picked', 'on_way'].includes(o.status) ? o.status : 'assigned';
    return setStatus(o, status, `${again ? 'Reassigned' : 'Assigned'} by Swavy dispatch to ${r.name} (${r.plate})`, { rider_id: r.id });
  }
  function adminCancel(id) {
    const o = getOrder(id);
    if (['delivered', 'cancelled'].includes(o.status)) fail('This order is closed.');
    return setStatus(o, 'cancelled', 'Cancelled by Swavy dispatch');
  }
  function remit(riderId) {
    const c = cashFor(Number(riderId));
    if (!c.total) fail('This rider has no cash to hand over.');
    db.tx(() => {
      c.items.forEach(i => db.run('UPDATE orders SET remitted = 1 WHERE id = ?', i.id));
      db.run('INSERT INTO remittances (rider_id, amount, orders, at) VALUES (?,?,?,?)', Number(riderId), c.total, c.items.length, now());
    });
    return { amount: c.total };
  }
  function payOut(id) {
    const o = getOrder(id);
    if (o.collect_status !== 'collected') fail('Nothing to pay out for this order.');
    db.run("UPDATE orders SET collect_status = 'paid_out', updated_at = ? WHERE id = ?", now(), o.id);
    event(o, o.status, `${naira(o.collect_amount)} item money paid to the sender`);
    emit('status', getOrder(o.id), { text: `${naira(o.collect_amount)} item money paid to you`, quiet: true });
  }
  function savePrices(b) {
    db.tx(() => {
      for (const p of Array.isArray(b.prices) ? b.prices : []) {
        const amt = int(p.amount, 'price', { min: 200, max: 200000, label: 'Price' });
        db.run('UPDATE zone_prices SET amount = ? WHERE city = ? AND z1 = ? AND z2 = ?', amt, str(p.city, 20), Number(p.z1), Number(p.z2));
      }
      const s = b.settings || {};
      const put = (k, v) => db.run('INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', k, String(v));
      if (s.medium != null) { const v = Number(s.medium); if (!(v >= 1 && v <= 5)) fail('Medium size multiplier must be between 1 and 5.'); put('medium', v); }
      if (s.large != null) { const v = Number(s.large); if (!(v >= 1 && v <= 5)) fail('Large size multiplier must be between 1 and 5.'); put('large', v); }
      if (s.express != null) put('express', int(s.express, 'express', { min: 0, max: 50000, label: 'Express fee' }));
      if (s.riderShare != null) put('riderShare', int(s.riderShare, 'riderShare', { min: 10, max: 100, label: 'Rider share' }));
    });
  }
  function verifyRider(id, v) { if (!db.run('UPDATE riders SET verified = ?, online = CASE WHEN ? THEN online ELSE 0 END WHERE user_id = ?', v ? 1 : 0, v ? 1 : 0, Number(id)).changes) fail('Rider not found.', null, 404); }

  function signup(auth, b) {
    const role = b.role === 'rider' ? 'rider' : 'customer';
    const A = area(b.area);
    if (!A) fail('Pick your area.', 'area');
    return db.tx(() => {
      const id = auth.createUser({ role, name: b.name, email: b.email, phone: b.phone, password: b.password, city: A.city, area: A.name });
      if (role === 'rider') {
        const plate = str(b.plate, 12).toUpperCase();
        if (plate.length < 5) fail('Enter your bike plate number, e.g. LSR-123AB.', 'plate');
        db.run('INSERT INTO riders (user_id, plate, bike, verified, x, y) VALUES (?,?,?,0,?,?)', id, plate, str(b.bike, 40) || 'Motorcycle', A.x, A.y);
      }
      return db.get('SELECT * FROM users WHERE id = ?', id);
    });
  }
  function me(u) { const out = { id: u.id, role: u.role, name: u.name, email: u.email, phone: u.phone, city: u.city, area: u.area }; if (u.role === 'rider') out.rider = riderOut(u.id); return out; }

  // ——— Simulated rider movement on the map ———
  function tick(stepSize) {
    const moving = db.all("SELECT o.*, r.x rx, r.y ry FROM orders o JOIN riders r ON r.user_id = o.rider_id WHERE o.status IN ('to_pickup','on_way','picked')");
    const seen = new Set();
    for (const o of moving) {
      if (seen.has(o.rider_id)) continue; seen.add(o.rider_id);
      const target = area(o.status === 'to_pickup' ? o.pickup_area : o.drop_area);
      if (!target) continue;
      if (o.status === 'picked') continue;   // waiting at pickup until rider taps "On the way"
      const dx = target.x - o.rx, dy = target.y - o.ry, d = Math.hypot(dx, dy);
      if (d < 0.5) continue;
      const k = Math.min(1, stepSize / d);
      const x = Math.round((o.rx + dx * k) * 10) / 10, y = Math.round((o.ry + dy * k) * 10) / 10;
      db.run('UPDATE riders SET x = ?, y = ? WHERE user_id = ?', x, y, o.rider_id);
      emit('pos', o, { x, y });
    }
  }

  const naira = n => '₦' + Number(n || 0).toLocaleString('en-NG');
  return { on, emit, settings, areas, area, cities, quote, createOrder, orderOut, getOrder, byToken, byCode, myOrders, ownOrder, cancel, rate, setOnline, riderDash, accept, advance, deliver, adminOverview, assign, adminCancel, remit, payOut, savePrices, verifyRider, signup, me, tick, riderOut, naira };
}

function routes(router, { db, app, auth, core, config, http }) {
  const { fail } = core;
  // Live tracking streams (Server-Sent Events): token -> set of open responses.
  const streams = new Map();
  const adminStreams = new Set();
  const push = (res, data) => { try { res.write(`data: ${JSON.stringify(data)}\n\n`); } catch (e) { /* closed */ } };
  app.on((type, o, extra) => {
    const set = streams.get(o.token);
    if (type === 'pos') { if (set) for (const res of set) push(res, { type: 'pos', x: extra.x, y: extra.y }); return; }
    if (set) { const out = app.orderOut(o, 'public'); for (const res of set) push(res, { type: 'order', order: out }); }
    for (const res of adminStreams) push(res, { type: 'changed', id: o.id });
  });
  function openStream(ctx, set) {
    ctx.res.writeHead(200, Object.assign({}, http.SECURITY_HEADERS, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' }));
    ctx.res.write('retry: 3000\n\n');
    set.add(ctx.res);
    const ping = setInterval(() => { try { ctx.res.write(': ping\n\n'); } catch (e) { /* closed */ } }, 20000);
    ctx.req.on('close', () => { clearInterval(ping); set.delete(ctx.res); });
  }

  if (config.simSpeed > 0) setInterval(() => { try { app.tick(2.2 * config.simSpeed); } catch (e) { console.error('sim tick failed:', e.message); } }, 1500).unref();

  router.get('/api/catalog', () => ({ sizes: SIZES, pay: PAY, status: STATUS, payNote: PAY_NOTE, areas: app.areas(), cities: app.cities(), settings: app.settings() }));
  router.post('/api/quote', ctx => app.quote(ctx.body));
  router.post('/api/signup', ctx => { const u = app.signup(auth, ctx.body); auth.start(ctx, u.id); return { me: app.me(u) }; });

  // Customer
  router.post('/api/orders', { auth: true, role: 'customer' }, ctx => ({ order: app.orderOut(app.createOrder(ctx.user, ctx.body), 'owner') }));
  router.get('/api/orders', { auth: true, role: 'customer' }, ctx => ({ orders: app.myOrders(ctx.user) }));
  router.post('/api/orders/:id/cancel', { auth: true, role: 'customer' }, ctx => ({ order: app.orderOut(app.cancel(ctx.user, ctx.params.id), 'owner') }));
  router.post('/api/orders/:id/rate', { auth: true, role: 'customer' }, ctx => ({ order: app.orderOut(app.rate(ctx.user, ctx.params.id, ctx.body.stars, ctx.body.note), 'owner') }));

  // Public tracking (sender + receiver link)
  router.get('/api/track/:token', ctx => {
    const o = app.byToken(ctx.params.token);
    return { order: app.orderOut(o, 'public'), mine: !!(ctx.user && ctx.user.id === o.customer_id) };
  });
  router.get('/api/track/:token/stream', ctx => {
    const o = app.byToken(ctx.params.token);
    if (!streams.has(o.token)) streams.set(o.token, new Set());
    const set = streams.get(o.token);
    openStream(ctx, set);
    push(ctx.res, { type: 'order', order: app.orderOut(o, 'public') });
    ctx.req.on('close', () => { if (!set.size) streams.delete(o.token); });
  });
  router.get('/t/:token', ctx => { ctx.res.writeHead(302, { Location: '/#/t/' + encodeURIComponent(ctx.params.token) }); ctx.res.end(); });

  // Rider
  router.get('/api/rider', { auth: true, role: 'rider' }, ctx => app.riderDash(ctx.user));
  router.post('/api/rider/online', { auth: true, role: 'rider' }, ctx => { app.setOnline(ctx.user, !!ctx.body.online); return app.riderDash(ctx.user); });
  router.post('/api/rider/jobs/:id/accept', { auth: true, role: 'rider' }, ctx => ({ order: app.orderOut(app.accept(ctx.user, ctx.params.id), 'rider') }));
  router.post('/api/rider/jobs/:id/step', { auth: true, role: 'rider' }, ctx => ({ order: app.orderOut(app.advance(ctx.user, ctx.params.id, ctx.body), 'rider') }));
  router.post('/api/rider/jobs/:id/deliver', { auth: true, role: 'rider' }, ctx => ({ order: app.orderOut(app.deliver(ctx.user, ctx.params.id, ctx.body.code), 'rider') }));
  router.get('/api/rider/jobs/:id', { auth: true, role: 'rider' }, ctx => { const o = app.getOrder(ctx.params.id); if (o.rider_id !== ctx.user.id) fail('This job is not yours.', null, 403); return { order: app.orderOut(o, 'rider') }; });

  // Admin / dispatcher
  router.get('/api/admin/overview', { admin: true }, () => app.adminOverview());
  router.get('/api/admin/stream', { admin: true }, ctx => openStream(ctx, adminStreams));
  router.post('/api/admin/orders/:id/assign', { admin: true }, ctx => ({ order: app.orderOut(app.assign(ctx.params.id, ctx.body.riderId), 'admin') }));
  router.post('/api/admin/orders/:id/cancel', { admin: true }, ctx => { app.adminCancel(ctx.params.id); return {}; });
  router.post('/api/admin/orders/:id/payout', { admin: true }, ctx => { app.payOut(ctx.params.id); return {}; });
  router.post('/api/admin/riders/:id/verify', { admin: true }, ctx => { app.verifyRider(ctx.params.id, !!ctx.body.verified); return {}; });
  router.post('/api/admin/riders/:id/remit', { admin: true }, ctx => app.remit(ctx.params.id));
  router.post('/api/admin/prices', { admin: true }, ctx => { app.savePrices(ctx.body); return {}; });
  router.post('/api/admin/logout', ctx => { auth.end(ctx); return {}; });

  // Telegram bot + the web test chat that drives the same bot logic
  const bot = require('./bot').createBot({ app, db, core, config });
  const testQueues = new Map();   // test chat id -> pending notification messages
  bot.onNotify((chat, msgs) => {
    if (String(chat).startsWith('web-')) { const q = testQueues.get(chat) || []; q.push(...msgs); testQueues.set(chat, q.slice(-30)); }
    else if (tg) tg.sendAll(chat, msgs);
  });
  const tg = config.telegramToken ? require('./telegram').start({ token: config.telegramToken, bot }) : null;
  router.get('/bot-test', ctx => http.sendPage(config.publicDir, ctx.res, 'bot-test.html'));
  const chatId = v => { const c = String(v || ''); if (!/^web-[A-Za-z0-9_-]{6,40}$/.test(c)) fail('Bad chat id.'); return c; };
  router.post('/api/bot-test/send', ctx => {
    const chat = chatId(ctx.body.chat);
    const replies = bot.handle(chat, { text: ctx.body.text, data: ctx.body.data, name: core.str(ctx.body.name, 40) || 'You' }, 'bot-test');
    return { replies };
  });
  router.get('/api/bot-test/poll', ctx => { const chat = chatId(ctx.query.chat); const q = testQueues.get(chat) || []; testQueues.delete(chat); return { messages: q, live: !!tg }; });
}

module.exports = { createApp, routes, seed: (...a) => require('./seed')(...a), SIZES, PAY, STATUS };
