/* Real Telegram bot: talks to the Telegram Bot API with long polling (plain fetch, no packages).
   Only started when TELEGRAM_BOT_TOKEN is set in .env. The conversation itself lives in bot.js. */
'use strict';

function start({ token, bot, log }) {
  log = log || console;
  const API = `https://api.telegram.org/bot${token}/`;
  let offset = 0, stopped = false, failures = 0;
  async function call(method, body) {
    const r = await fetch(API + method, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}), signal: AbortSignal.timeout(method === 'getUpdates' ? 40000 : 15000) });
    const j = await r.json().catch(() => ({ ok: false, description: 'Bad reply from Telegram' }));
    if (!j.ok) throw new Error(j.description || `Telegram error ${r.status}`);
    return j.result;
  }
  // Telegram "Markdown" uses *bold*; our texts use only that, so other special characters are escaped.
  const md = s => String(s).replace(/([_`\[])/g, '\\$1');
  const markup = buttons => buttons && buttons.length ? { inline_keyboard: buttons.map(r => r.map(b => ({ text: b.text, callback_data: b.data }))) } : undefined;
  async function sendAll(chat, msgs) {
    for (const m of msgs) {
      try { await call('sendMessage', { chat_id: chat, text: md(m.text), parse_mode: 'Markdown', reply_markup: markup(m.buttons), disable_web_page_preview: true }); }
      catch (e) { try { await call('sendMessage', { chat_id: chat, text: m.text.replace(/\*/g, ''), reply_markup: markup(m.buttons) }); } catch (e2) { log.error('Telegram send failed:', e2.message); } }
    }
  }
  async function onUpdate(u) {
    if (u.message && u.message.text) {
      const m = u.message;
      await sendAll(m.chat.id, bot.handle(m.chat.id, { text: m.text, name: m.from && m.from.first_name }, 'telegram'));
    } else if (u.callback_query) {
      const q = u.callback_query;
      call('answerCallbackQuery', { callback_query_id: q.id }).catch(() => {});
      if (q.message) await sendAll(q.message.chat.id, bot.handle(q.message.chat.id, { data: q.data, name: q.from && q.from.first_name }, 'telegram'));
    }
  }
  async function loop() {
    try {
      const me = await call('getMe');
      log.log(`  Telegram bot:  @${me.username} is live. Open Telegram and send it /start`);
      await call('setMyCommands', { commands: [
        { command: 'start', description: 'Main menu' }, { command: 'book', description: 'Book a bike delivery' },
        { command: 'track', description: 'Track a package: /track SWD-12345' }, { command: 'price', description: 'Quick price check' }, { command: 'cancel', description: 'Stop what you are doing' }] }).catch(() => {});
    } catch (e) { log.error(`Telegram bot could not start: ${e.message}. Check TELEGRAM_BOT_TOKEN in .env`); return; }
    while (!stopped) {
      try {
        const updates = await call('getUpdates', { offset, timeout: 30, allowed_updates: ['message', 'callback_query'] });
        failures = 0;
        for (const u of updates) { offset = u.update_id + 1; try { await onUpdate(u); } catch (e) { log.error('Telegram update failed:', e.message); } }
      } catch (e) {
        failures++;
        if (failures === 1 || failures % 20 === 0) log.error('Telegram connection problem (will keep trying):', e.message);
        await new Promise(r => setTimeout(r, Math.min(30000, 2000 * failures)));
      }
    }
  }
  loop();
  return { sendAll, stop() { stopped = true; } };
}

module.exports = { start };
