/* Swavy Dispatch chat bot logic. Used by the real Telegram bot (telegram.js) and the web test chat (/bot-test).
   It never touches the network: handle() takes one message or button tap and returns the replies.
   Reply shape: { text, buttons: [[{ text, data }]] }  (buttons become Telegram inline keyboard buttons). */
'use strict';

const B = (text, data) => ({ text, data });
const rows = (list, per) => { const out = []; for (let i = 0; i < list.length; i += per) out.push(list.slice(i, i + per)); return out; };
const MENU = [[B('📦 Book a delivery', 'book')], [B('📍 Track a package', 'track'), B('💰 Check price', 'price')]];
const SIZE_LABEL = { small: '✉️ Small', medium: '🎒 Medium', large: '📦 Large' };
const STATUS_EMOJI = { pending: '🔎', assigned: '🏍️', to_pickup: '🏍️', picked: '📦', on_way: '🛣️', delivered: '✅', cancelled: '❌' };

function createBot({ app, db, core, config }) {
  const notifiers = new Set();
  const naira = app.naira;
  const load = chat => { const r = db.get('SELECT state FROM bot_chats WHERE chat = ?', String(chat)); return r ? core.json(r.state, {}) : {}; };
  const save = (chat, name, st) => db.run('INSERT INTO bot_chats (chat, name, state, updated_at) VALUES (?,?,?,?) ON CONFLICT(chat) DO UPDATE SET state = excluded.state, name = CASE WHEN excluded.name != \'\' THEN excluded.name ELSE bot_chats.name END, updated_at = excluded.updated_at',
    String(chat), name || '', JSON.stringify(st), Date.now());
  const link = o => (config.publicUrl ? `${config.publicUrl}/t/${o.token}` : `/t/${o.token}`);
  const cityButtons = prefix => [Object.keys(app.cities()).map(c => B(c === 'Lagos' ? '🌊 Lagos' : '🏛️ Abuja', `${prefix}:${c}`)), [B('✖ Cancel', 'menu')]];
  const areaButtons = (city, prefix, skip) => [...rows((app.cities()[city] || []).filter(a => a !== skip).map(a => B(a, `${prefix}:${a}`)), 2), [B('✖ Cancel', 'menu')]];
  const sizeButtons = prefix => [[B(SIZE_LABEL.small, `${prefix}:small`), B(SIZE_LABEL.medium, `${prefix}:medium`), B(SIZE_LABEL.large, `${prefix}:large`)], [B('✖ Cancel', 'menu')]];

  function statusText(o) {
    const out = app.orderOut(o, 'owner');
    const lines = [`${STATUS_EMOJI[o.status] || '•'} *${out.statusText}*`, `Order ${o.code}: ${o.pickup_area} → ${o.drop_area}`, `Price: ${naira(o.price)} (${out.payText})`];
    if (out.rider) lines.push(`Rider: ${out.rider.name}, ${out.rider.bike} ${out.rider.plate}${out.rider.rating ? ` ★${out.rider.rating}` : ''}`);
    const last = out.events[out.events.length - 1]; if (last) lines.push(`Latest: ${last.text}`);
    if (!['delivered', 'cancelled'].includes(o.status)) lines.push(`Delivery code: ${o.delivery_code} (give it to the rider only when the package is in the receiver's hand)`);
    lines.push(`Live tracking: ${link(o)}`);
    return lines.join('\n');
  }
  const welcome = name => ({ text: `Hi ${name || 'there'} 👋 Welcome to *Swavy Dispatch*.\nFast motorcycle delivery in Lagos and Abuja.\n\nWhat do you want to do?`, buttons: MENU });

  function handle(chat, input, source) {
    input = input || {};
    const text = core.str(input.text, 300);
    const data = core.str(input.data, 64);
    const name = core.str(input.name, 40);
    let st = load(chat);
    const done = (replies, next) => { save(chat, name, next === undefined ? st : next); return Array.isArray(replies) ? replies : [replies]; };

    // Commands work at any time
    if (/^\/start\b/i.test(text) || /^(hi|hello|menu)$/i.test(text) || data === 'menu') return done(welcome(name), {});
    if (/^\/cancel\b/i.test(text)) return done({ text: 'Okay, cancelled. Nothing was booked.', buttons: MENU }, {});
    if (/^\/help\b/i.test(text)) return done({ text: 'Commands:\n/start - main menu\n/book - book a delivery\n/track SWD-12345 - see where your package is\n/price - quick price check\n/cancel - stop what you are doing', buttons: MENU }, {});
    const tm = text.match(/^\/track(?:@\w+)?\s*(.*)$/i);
    if (tm) { if (tm[1]) return done(track(tm[1]), {}); return done({ text: 'Send me your order code, e.g. SWD-48213.' }, { mode: 'track' }); }
    if (/^\/price\b/i.test(text) || data === 'price') return done({ text: '💰 Quick price check. Which city?', buttons: cityButtons('pc') }, { mode: 'price' });
    if (/^\/book\b/i.test(text) || data === 'book') return done({ text: '📦 Let\'s book a bike. Step 1 of 6\nWhich city?', buttons: cityButtons('bc') }, { mode: 'book', o: {} });
    if (data === 'track') return done({ text: 'Send me your order code, e.g. SWD-48213.' }, { mode: 'track' });

    // Quick price flow
    if (st.mode === 'price') {
      if (data.startsWith('pc:')) { st.city = data.slice(3); return done({ text: `From which area in ${st.city}?`, buttons: areaButtons(st.city, 'pf') }); }
      if (data.startsWith('pf:')) { st.from = data.slice(3); return done({ text: `From ${st.from} to which area?`, buttons: areaButtons(st.city, 'pt') }); }
      if (data.startsWith('pt:')) {
        const to = data.slice(3);
        try {
          const q = s => app.quote({ pickupArea: st.from, dropArea: to, size: s });
          const ex = app.quote({ pickupArea: st.from, dropArea: to, size: 'small', express: true });
          return done({ text: `💰 *${st.from} → ${to}*\n✉️ Small: ${naira(q('small').price)}\n🎒 Medium: ${naira(q('medium').price)}\n📦 Large: ${naira(q('large').price)}\n⚡ Express adds ${naira(ex.expressFee)}\nTime: about ${q('small').eta}`, buttons: [[B('📦 Book this route', 'book')], [B('🏠 Menu', 'menu')]] }, {});
        } catch (e) { return done({ text: '⚠️ ' + e.message, buttons: MENU }, {}); }
      }
    }

    // Track flow
    if (st.mode === 'track' && text) return done(track(text), {});

    // Booking flow
    if (st.mode === 'book') {
      const o = st.o || (st.o = {});
      if (data.startsWith('bc:')) { o.city = data.slice(3); return done({ text: `Step 2 of 6\n📍 Where should the rider *pick up* the package? (${o.city})`, buttons: areaButtons(o.city, 'bp') }); }
      if (data.startsWith('bp:')) { o.pickupArea = data.slice(3); st.ask = 'pickupAddr'; return done({ text: `Type the pickup address in ${o.pickupArea} (street, house number or landmark):` }); }
      if (st.ask === 'pickupAddr' && text) {
        if (text.length < 3) return done({ text: 'Please type a bit more of the address.' });
        o.pickupAddr = text; st.ask = null;
        return done({ text: 'Step 3 of 6\n🏁 Where is it going? Pick the *drop-off* area:', buttons: areaButtons(o.city, 'bd') });
      }
      if (data.startsWith('bd:')) { o.dropArea = data.slice(3); st.ask = 'dropAddr'; return done({ text: `Type the drop-off address in ${o.dropArea}:` }); }
      if (st.ask === 'dropAddr' && text) {
        if (text.length < 3) return done({ text: 'Please type a bit more of the address.' });
        o.dropAddr = text; st.ask = null;
        return done({ text: 'Step 4 of 6\nHow big is the package?\n✉️ Small: documents, phone, food pack\n🎒 Medium: shoes, clothes, small box\n📦 Large: carton, 2-3 bags', buttons: sizeButtons('bs') });
      }
      if (data.startsWith('bs:')) { o.size = data.slice(3); st.ask = 'receiverPhone'; return done({ text: 'Step 5 of 6\n📞 Type the *receiver\'s phone number* (e.g. 0803 123 4567):' }); }
      if (st.ask === 'receiverPhone' && text) {
        const p = core.normPhone(text);
        if (!/^\d{10,15}$/.test(p)) return done({ text: 'That phone number does not look right. Try again, e.g. 0803 123 4567.' });
        o.receiverPhone = p; st.ask = null;
        return done(quoteMsg(o));
      }
      if (data === 'bx') { o.express = !o.express; return done(quoteMsg(o)); }
      if (data === 'bpay') { o.pay = o.pay === 'cash_pickup' ? 'cash_delivery' : 'cash_pickup'; return done(quoteMsg(o)); }
      if (data === 'bok') {
        try {
          const order = app.createOrder(null, Object.assign({ senderName: name || 'Telegram customer', receiverName: 'Receiver', item: 'Package', pay: o.pay || 'cash_delivery' }, o), { source: source === 'telegram' ? 'telegram' : 'bot-test', chat: String(chat) });
          return done({ text: `✅ *Booked!* Order ${order.code}\n${order.pickup_area} → ${order.drop_area}, ${naira(order.price)} (${o.pay === 'cash_pickup' ? 'cash at pickup' : 'cash on delivery'})\n\n🔐 Delivery code: *${order.delivery_code}*\nSend this code to the receiver. They give it to the rider only when the package is in their hand.\n\n📍 Live tracking: ${link(order)}\nI will message you here when a rider accepts and at every step.`, buttons: [[B('📍 Track now', 'tr:' + order.code)], [B('🏠 Menu', 'menu')]] }, {});
        } catch (e) { return done({ text: '⚠️ ' + e.message + '\nLet\'s start again.', buttons: MENU }, {}); }
      }
      if (st.ask) return done({ text: 'Please type your answer, or /cancel to stop.' });
    }
    if (data.startsWith('tr:')) return done(track(data.slice(3)), st);
    return done({ text: "I didn't catch that. Tap a button below 👇", buttons: MENU }, {});
  }

  function quoteMsg(o) {
    let q;
    try { q = app.quote(o); } catch (e) { return { text: '⚠️ ' + e.message, buttons: MENU }; }
    const pay = o.pay === 'cash_pickup' ? 'Cash at pickup' : 'Cash on delivery';
    return {
      text: `Step 6 of 6 · Your price\n📍 ${o.pickupArea}: ${o.pickupAddr}\n🏁 ${o.dropArea}: ${o.dropAddr}\n${SIZE_LABEL[q.size]} package · receiver ${o.receiverPhone}\n${q.express ? '⚡ Express\n' : ''}\n💰 *${naira(q.price)}*  (about ${q.eta})\n💵 Payment: ${pay}`,
      buttons: [[B(`✅ Confirm ${naira(q.price)}`, 'bok')], [B(q.express ? '🐢 Normal speed' : `⚡ Express +${naira(Number(app.settings().express))}`, 'bx'), B(o.pay === 'cash_pickup' ? '💵 Pay on delivery' : '💵 Pay at pickup', 'bpay')], [B('✖ Cancel', 'menu')]]
    };
  }
  function track(code) {
    const o = app.byCode(String(code).trim());
    if (!o) return { text: `I can't find order "${String(code).slice(0, 20)}". Check the code (it looks like SWD-48213).`, buttons: MENU };
    return { text: statusText(o), buttons: [[B('🔄 Refresh', 'tr:' + o.code)], [B('🏠 Menu', 'menu')]] };
  }

  // Tell the chat that booked an order about every status change.
  app.on((type, o, extra) => {
    if (type !== 'status' || !o.tg_chat) return;
    const msgs = [{ text: `${STATUS_EMOJI[o.status] || '•'} Order ${o.code}: *${app.orderOut(o, 'owner').statusText}*\n${extra && extra.text ? extra.text : ''}${o.status === 'delivered' ? '\n\nThank you for using Swavy Dispatch 💜' : ''}`, buttons: [[B('📍 Track', 'tr:' + o.code)]] }];
    for (const fn of notifiers) fn(o.tg_chat, msgs);
  });

  return { handle, onNotify: fn => notifiers.add(fn), statusText, MENU };
}

module.exports = { createBot };
