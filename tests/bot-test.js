/* Swavy Dispatch bot unit test: drives the chat bot logic directly on an in-memory database. No network, no Telegram.
   Run with: npm test (or node tests/bot-test.js) */
'use strict';
try { require('node:sqlite'); } catch (e) {
  if (!process.execArgv.includes('--experimental-sqlite')) { const r = require('node:child_process').spawnSync(process.execPath, ['--experimental-sqlite', '--no-warnings', __filename], { stdio: 'inherit' }); process.exit(r.status == null ? 1 : r.status); }
}
const core = require('../server/core');
const { open } = require('../server/db');
const appMod = require('../server/app');
const { createBot } = require('../server/bot');
let pass = 0, failed = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('  ✓ ' + name); } else { failed++; console.log('  ✗ ' + name, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ''); } };

const db = open(':memory:');
const config = { publicUrl: 'https://swavy.example', simSpeed: 0 };
const app = appMod.createApp({ db, config, core });
appMod.seed(db, app, core, true);
const bot = createBot({ app, db, core, config });
const sent = [];
bot.onNotify((chat, msgs) => sent.push({ chat, msgs }));
const CHAT = '777001';
const say = (text) => bot.handle(CHAT, { text, name: 'Bola' }, 'telegram');
const tap = (data) => bot.handle(CHAT, { data, name: 'Bola' }, 'telegram');
const btns = r => r.flatMap(m => (m.buttons || []).flat().map(b => b.data));
const last = r => r[r.length - 1];

console.log('\n  Swavy Dispatch bot conversation');
let r = say('/start');
ok('/start greets by name with the main menu', /Hi Bola/.test(r[0].text) && btns(r).includes('book') && btns(r).includes('track') && btns(r).includes('price'));
r = tap('book');
ok('Book asks for the city', /Which city/.test(r[0].text) && btns(r).includes('bc:Lagos') && btns(r).includes('bc:Abuja'));
r = tap('bc:Lagos');
ok('City shows Lagos pickup areas as buttons', btns(r).includes('bp:Yaba') && !btns(r).includes('bp:Wuse'));
r = tap('bp:Yaba');
ok('Pickup area asks for the address', /pickup address/i.test(r[0].text));
r = say('12 Herbert Macaulay Way');
ok('Address accepted, asks for drop-off area', btns(r).includes('bd:Lekki'));
r = tap('bd:Lekki');
r = say('Admiralty Way, Phase 1');
ok('Drop-off address accepted, asks for size', btns(r).includes('bs:small') && btns(r).includes('bs:large'));
r = tap('bs:medium');
ok('Size accepted, asks for receiver phone', /receiver's phone/i.test(r[0].text));
r = say('12345');
ok('Bad phone number is refused politely', /does not look right/.test(r[0].text));
r = say('0803 123 4567');
const q = app.quote({ pickupArea: 'Yaba', dropArea: 'Lekki', size: 'medium' });
ok('Quote shows the same price as the app', r[0].text.includes(app.naira(q.price)) && btns(r).includes('bok'), r[0].text);
r = tap('bx');
const qx = app.quote({ pickupArea: 'Yaba', dropArea: 'Lekki', size: 'medium', express: true });
ok('Express toggle updates the price', r[0].text.includes(app.naira(qx.price)) && /Express/.test(r[0].text));
r = tap('bpay');
ok('Payment toggle switches to cash at pickup', /Cash at pickup/.test(r[0].text));
const before = db.get('SELECT COUNT(*) n FROM orders').n;
r = tap('bok');
const order = db.get('SELECT * FROM orders ORDER BY id DESC LIMIT 1');
ok('Confirm creates a real order in the database', db.get('SELECT COUNT(*) n FROM orders').n === before + 1 && order.source === 'telegram' && order.tg_chat === CHAT);
ok('Order has the chat answers', order.pickup_area === 'Yaba' && order.drop_area === 'Lekki' && order.size === 'medium' && order.express === 1 && order.pay === 'cash_pickup' && order.receiver_phone === '2348031234567' && order.price === qx.price);
ok('Booked message shows code, delivery code and tracking link', r[0].text.includes(order.code) && r[0].text.includes(order.delivery_code) && r[0].text.includes('https://swavy.example/t/' + order.token));
r = say('/track ' + order.code);
ok('/track <code> shows the status', /Looking for a rider/.test(r[0].text) && r[0].text.includes(order.code));
r = say('/track SWD-00000');
ok('/track with unknown code says so', /can't find/.test(r[0].text));
r = tap('track'); r = say(order.code.toLowerCase());
ok('Track button then typing the code (any case) works', r[0].text.includes(order.code));

// Status change notifications go back to the chat
const riderUser = db.get("SELECT * FROM users WHERE email = 'rider@swavy.ng'");
app.accept(riderUser, order.id);
ok('Chat is notified when a rider accepts', sent.length === 1 && sent[0].chat === CHAT && /heading to pickup/i.test(sent[0].msgs[0].text));
app.advance(riderUser, order.id, { to: 'picked' });
app.advance(riderUser, order.id, { to: 'on_way' });
app.deliver(riderUser, order.id, order.delivery_code);
ok('Chat is notified at every step up to Delivered', sent.length === 4 && /Delivered/.test(last(sent).msgs[0].text));
r = say('/track ' + order.code);
ok('Track after delivery shows rider and hides the code', /Delivered/.test(r[0].text) && /Musa/.test(r[0].text) && !r[0].text.includes('Delivery code'));

// Quick price
r = say('/price');
r = tap('pc:Abuja'); ok('Price check lists Abuja areas', btns(r).includes('pf:Wuse'));
r = tap('pf:Wuse'); r = tap('pt:Kubwa');
const pa = app.quote({ pickupArea: 'Wuse', dropArea: 'Kubwa', size: 'small' });
ok('/price shows small, medium and large prices', r[0].text.includes(app.naira(pa.price)) && /Medium/.test(r[0].text) && /Large/.test(r[0].text));
// Cancel / unknown
tap('book'); tap('bc:Lagos'); tap('bp:Ikeja');
r = say('/cancel');
ok('/cancel stops a booking half-way', /cancelled/i.test(r[0].text) && db.get('SELECT COUNT(*) n FROM orders').n === before + 1);
r = say('blah blah');
ok('Unknown text shows the menu', btns(r).includes('book'));
// Separate chats keep separate state
bot.handle('other', { data: 'book' }, 'telegram'); bot.handle('other', { data: 'bc:Abuja' }, 'telegram');
r = say('hello');
ok('Each chat has its own conversation', /Hi Bola/.test(r[0].text) && btns(bot.handle('other', { data: 'bp:Wuse' }, 'telegram').concat()).length === 0);

db.close();
console.log(`\n  ${pass} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
