/* Swavy Dispatch: web test chat that looks like Telegram and drives the same bot logic (server/bot.js). */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const log = $('#log'), form = $('#bar'), input = $('#msg');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const newId = () => 'web-' + Array.from(crypto.getRandomValues(new Uint8Array(9)), b => b.toString(36).padStart(2, '0')).join('').slice(0, 16);
  let chat;
  try { chat = localStorage.getItem('swavy-bot-chat'); } catch (e) { /* ignore */ }
  if (!chat || !/^web-[a-z0-9]{6,40}$/.test(chat)) { chat = newId(); try { localStorage.setItem('swavy-bot-chat', chat); } catch (e) { /* ignore */ } }
  const time = () => { const d = new Date(); return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`; };
  // *bold* like Telegram Markdown, and clickable tracking links
  const fmt = t => esc(t).replace(/\*([^*\n]+)\*/g, '<b>$1</b>').replace(/(https?:\/\/[^\s]+|\/t\/[A-Za-z0-9_-]+)/g, u => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`).replace(/\n/g, '<br>');
  function add(who, text, buttons) {
    const el = document.createElement('div');
    el.className = 'msg ' + who;
    el.innerHTML = `<div class="bubble">${fmt(text)}<span class="t">${time()}</span></div>` +
      (buttons && buttons.length ? `<div class="kb">${buttons.map(r => `<div class="kb-row">${r.map(b => `<button type="button" data-cb="${esc(b.data)}">${esc(b.text)}</button>`).join('')}</div>`).join('')}</div>` : '');
    log.appendChild(el);
    el.scrollIntoView({ block: 'end' });
    log.scrollTop = log.scrollHeight;
  }
  let busy = false;
  async function send(payload, shown) {
    if (busy) return; busy = true;
    if (shown) add('me', shown);
    try {
      const r = await fetch('/api/bot-test/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ chat, name: 'Tester' }, payload)) });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || 'Bot error');
      j.replies.forEach(m => add('bot', m.text, m.buttons));
    } catch (e) { add('bot', '⚠️ ' + e.message); }
    busy = false;
  }
  form.onsubmit = e => { e.preventDefault(); const t = input.value.trim(); if (!t) return; input.value = ''; send({ text: t }, t); };
  log.addEventListener('click', e => {
    const b = e.target.closest('[data-cb]'); if (!b) return;
    send({ data: b.dataset.cb }, b.textContent);
  });
  $('#reset').onclick = () => { chat = newId(); try { localStorage.setItem('swavy-bot-chat', chat); } catch (e) { /* ignore */ } log.innerHTML = ''; send({ text: '/start' }, '/start'); };
  // Status notifications ("Rider accepted", "Delivered"...) arrive here like Telegram messages.
  setInterval(async () => {
    if (document.hidden) return;
    try { const j = await (await fetch('/api/bot-test/poll?chat=' + encodeURIComponent(chat))).json(); if (j.ok) { j.messages.forEach(m => add('bot', m.text, m.buttons)); $('#botState').textContent = j.live ? 'bot · real Telegram bot is ALSO on' : 'bot · test mode'; } } catch (e) { /* offline */ }
  }, 2000);
  send({ text: '/start' }, '/start');
})();
