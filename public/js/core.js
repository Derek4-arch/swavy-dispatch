/* Swavy shared front-end kit: formatting, API calls, icons, logo, toasts, sheets, router, photos, onboarding. */
window.SW = window.SW || {};
(function (SW) {
  'use strict';
  const nn = new Intl.NumberFormat('en-NG');
  SW.naira = n => '₦' + nn.format(Math.round(Number(n) || 0));
  SW.esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  SW.date = t => { const d = new Date(t); return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };
  SW.time = t => { const d = new Date(t); let h = d.getHours(); const ap = h >= 12 ? 'pm' : 'am'; h = h % 12 || 12; return `${h}:${String(d.getMinutes()).padStart(2, '0')}${ap}`; };
  SW.ago = t => {
    const s = Math.max(0, (Date.now() - t) / 1000);
    if (s < 45) return 'just now'; if (s < 3600) return `${Math.round(s / 60)} min ago`;
    if (s < 86400) { const h = Math.round(s / 3600); return `${h} hr${h === 1 ? '' : 's'} ago`; }
    const d = Math.round(s / 86400); return d === 1 ? 'yesterday' : d < 7 ? `${d} days ago` : SW.date(t);
  };
  SW.initials = n => String(n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
  SW.hue = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
  SW.avatar = (name, size) => `<span class="avatar" style="background:linear-gradient(135deg,hsl(${SW.hue(name)} 60% 45%),hsl(${(SW.hue(name) + 40) % 360} 65% 55%));${size ? `width:${size}px;height:${size}px;border-radius:${size / 3}px;font-size:${size / 2.6}px` : ''}" aria-hidden="true">${SW.esc(SW.initials(name))}</span>`;
  SW.stars = r => { const n = Math.round(r || 0); return `<span class="stars" aria-label="${r || 0} out of 5">${'★'.repeat(n)}<span style="opacity:.25">${'★'.repeat(5 - n)}</span></span>`; };
  SW.normPhone = v => { let d = String(v || '').replace(/[^\d]/g, ''); if (d.startsWith('0') && d.length === 11) d = '234' + d.slice(1); return d; };
  SW.phone = p => { const d = SW.normPhone(p); return d.startsWith('234') && d.length === 13 ? `0${d.slice(3, 6)} ${d.slice(6, 9)} ${d.slice(9)}` : p; };
  SW.wa = (phone, text) => `https://wa.me/${SW.normPhone(phone)}?text=${encodeURIComponent(text || '')}`;
  SW.waShare = text => `https://wa.me/?text=${encodeURIComponent(text)}`;
  SW.$ = (s, r) => (r || document).querySelector(s);
  SW.$$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  // ——— Icons (24px stroke) ———
  const P = {
    drop: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
    bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z"/>',
    snow: '<path d="M12 2v20M4.9 6l14.2 12M19.1 6 4.9 18"/><path d="m9 4 3 2 3-2M9 20l3-2 3 2"/>',
    gen: '<rect x="3" y="7" width="18" height="12" rx="2"/><path d="M7 7V4h4v3M12 11l-2 3h4l-2 3"/>',
    hammer: '<path d="m15 12-8.5 8.5a2.1 2.1 0 0 1-3-3L12 9"/><path d="m17.6 15 4.4-4.4-6.2-6.2a4 4 0 0 0-5.6 0L9 5.5l7 7z"/>',
    brush: '<path d="M18 2l4 4-9.5 9.5-4-4z"/><path d="M8.5 11.5c-3 0-4.5 2-4.5 4.5 0 1.5-1 3-2 3 2 2 7 2 8.5-1 .8-1.6.5-3.5-.5-4.5"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    car: '<path d="M5 17H3v-5l2-5h14l2 5v5h-2"/><path d="M3 12h18"/><circle cx="7.5" cy="17" r="2"/><circle cx="16.5" cy="17" r="2"/>',
    sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
    scissors: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12"/>',
    phone: '<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/>',
    laptop: '<rect x="4" y="4" width="16" height="11" rx="2"/><path d="M2 19h20"/>',
    tablet: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M11 18h2"/>',
    watch: '<rect x="6" y="6" width="12" height="12" rx="3"/><path d="M9 6l1-4h4l1 4M9 18l1 4h4l1-4"/>',
    game: '<path d="M6 8h12a4 4 0 0 1 4 4v1a4 4 0 0 1-7 2.6l-.5-.6h-5l-.5.6A4 4 0 0 1 2 13v-1a4 4 0 0 1 4-4z"/><path d="M7 11v3M5.5 12.5h3"/><circle cx="16" cy="12" r=".6"/><circle cx="18" cy="13.5" r=".6"/>',
    headphones: '<path d="M3 18v-6a9 9 0 0 1 18 0v6"/><rect x="3" y="14" width="4" height="7" rx="1.5"/><rect x="17" y="14" width="4" height="7" rx="1.5"/>',
    home: '<path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    checkCircle: '<circle cx="12" cy="12" r="10"/><path d="m8 12 3 3 5-6"/>',
    shield: '<path d="M12 2 4 5v6c0 5 3.4 9.5 8 11 4.6-1.5 8-6 8-11V5z"/><path d="m9 12 2 2 4-4"/>',
    star: '<path d="m12 2 3 6.5 7 .9-5.1 4.9 1.3 7L12 18l-6.2 3.3 1.3-7L2 9.4l7-.9z"/>',
    pin: '<path d="M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/>',
    camera: '<path d="M4 7h3l2-3h6l2 3h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="4"/>',
    wa: '<path d="M3 21l1.6-4.7A9 9 0 1 1 8 20z"/><path d="M9 8.5c0 3.5 3 6.5 6.5 6.5l1-1.6-2-1-1 1c-1.2-.5-2.2-1.5-2.8-2.8l1-1-1-2z"/>',
    chevR: '<path d="m9 6 6 6-6 6"/>', chevL: '<path d="m15 6-6 6 6 6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', x: '<path d="M6 6l12 12M18 6 6 18"/>',
    moon: '<path d="M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10z"/>', sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    cash: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 10v4M18 10v4"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    tag: '<path d="M3 12V3h9l9 9-9 9z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
    chart: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
    logout: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11"/>',
    flag: '<path d="M5 22V4M5 4h11l-2 4 2 4H5"/>',
    alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17v.5"/>',
    share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>',
    wrench: '<path d="M14.7 6.3a4 4 0 0 0 5 5L21 13l-8 8-3-3 6.3-6.3"/><path d="M14.7 6.3 17 4a5 5 0 0 0-6 6L3 18l3 3 8-8"/>',
    box: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
    gift: '<rect x="3" y="8" width="18" height="13" rx="1"/><path d="M12 8v13M3 12h18M12 8c-2-4-6-4-6-1.5S9 8 12 8c3 0 6-1 6-1.5S14 4 12 8"/>',
    handshake: '<path d="m11 17 2 2a1.4 1.4 0 0 0 2-2"/><path d="m14 14 2.5 2.5a1.4 1.4 0 0 0 2-2L14 10l-3 3a1.4 1.4 0 0 1-2-2l3.5-3.5a3 3 0 0 1 4 0L21 12"/><path d="m3 12 5-5 3 1M2 13l7 7"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3M14 9l2 2"/>',
    battery: '<rect x="2" y="7" width="17" height="10" rx="2"/><path d="M22 11v2M6 10v4M10 10v4"/>',
    bike: '<circle cx="5.5" cy="17" r="3.5"/><circle cx="18.5" cy="17" r="3.5"/><path d="M5.5 17 9 10h5l4.5 7M14 10l-1.5-4H16M9 10l3 7h6.5"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    bag: '<path d="M6 8h12l1 13H5z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
    map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>',
    send: '<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4z"/>',
    call: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
    power: '<path d="M12 2v10"/><path d="M5.6 6.6a9 9 0 1 0 12.8 0"/>',
    bot: '<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 4v4M9 13v1M15 13v1M9 17h6"/><circle cx="12" cy="3" r="1"/>',
    copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
    zap: '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'
  };
  SW.icon = (name, cls) => `<svg class="ic ${cls || ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || P.info}</svg>`;

  // ——— Swavy logo mark: violet squircle with a lime "S" wave ———
  SW.mark = () => `<svg viewBox="0 0 48 48" aria-hidden="true"><defs><linearGradient id="swg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6C3BFF"/><stop offset="1" stop-color="#3A16C9"/></linearGradient></defs><rect width="48" height="48" rx="15" fill="url(#swg)"/><path d="M32.5 15.5c-2.4-2.3-5.7-3.2-9-2.6-3.6.7-6 3-5.6 6 .5 3.5 4.6 4.2 8.2 5 3.5.8 6.9 2.1 6.6 5.8-.3 3.4-3.8 5.5-7.9 5.4-3.3-.1-6-1.3-8-3.3" fill="none" stroke="#C6F432" stroke-width="5" stroke-linecap="round"/><circle cx="35.5" cy="35.5" r="3" fill="#FF6B3D"/></svg>`;
  SW.logo = sub => `<span class="logo">${SW.mark()}<span>swavy</span>${sub ? `<span class="sub">${SW.esc(sub)}</span>` : ''}</span>`;

  // ——— API ———
  SW.api = async (method, url, body) => {
    const opt = { method, headers: { Accept: 'application/json' }, credentials: 'same-origin' };
    if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
    let res, data;
    try { res = await fetch(url, opt); } catch (e) { throw Object.assign(new Error('Network wahala. Check your connection and try again.'), { status: 0 }); }
    try { data = await res.json(); } catch (e) { data = { ok: false, error: 'Unexpected reply from server.' }; }
    if (!res.ok || !data.ok) {
      const err = Object.assign(new Error(data.error || 'Something went wrong.'), { status: res.status, field: data.field, code: data.code });
      throw err;
    }
    return data;
  };
  SW.get = u => SW.api('GET', u); SW.post = (u, b) => SW.api('POST', u, b || {}); SW.put = (u, b) => SW.api('PUT', u, b || {});

  // ——— Toasts ———
  SW.toast = (msg, kind) => {
    let box = SW.$('#toasts');
    if (!box) { box = document.createElement('div'); box.id = 'toasts'; box.setAttribute('role', 'status'); box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
    const t = document.createElement('div');
    t.className = 'toast ' + (kind || '');
    t.innerHTML = SW.icon(kind === 'bad' ? 'alert' : kind === 'ok' ? 'checkCircle' : 'info') + `<span>${SW.esc(msg)}</span>`;
    box.appendChild(t);
    setTimeout(() => { t.style.transition = 'opacity .3s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, kind === 'bad' ? 4200 : 2800);
  };
  SW.fail = e => SW.toast(e && e.message ? e.message : String(e), 'bad');

  // ——— Bottom sheet ———
  SW.sheet = (html, onMount, onClose) => {
    const scrim = document.createElement('div');
    scrim.className = 'scrim';
    scrim.innerHTML = `<div class="sheet" role="dialog" aria-modal="true"><div class="sheet-grab"></div>${html}</div>`;
    const prev = document.activeElement;
    const close = () => { if (!scrim.isConnected) return; scrim.remove(); if (onClose) onClose(); document.removeEventListener('keydown', onKey); if (prev && prev.focus) prev.focus(); };
    const onKey = e => { if (e.key === 'Escape') close(); };
    scrim.addEventListener('click', e => { if (e.target === scrim || e.target.closest('[data-close]')) close(); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(scrim);
    const sheet = scrim.firstElementChild;
    const f = sheet.querySelector('[autofocus], input, button.btn-primary'); if (f) setTimeout(() => f.focus(), 30);
    if (onMount) onMount(sheet, close);
    return close;
  };
  SW.confirm = (title, text, yes, kind) => new Promise(resolve => {
    let answer = false;
    SW.sheet(`<h2>${SW.esc(title)}</h2><p class="muted">${SW.esc(text || '')}</p><div class="stack mt"><button class="btn btn-block ${kind === 'bad' ? 'btn-bad' : 'btn-primary'}" data-yes>${SW.esc(yes || 'Yes, continue')}</button><button class="btn btn-block btn-ghost" data-close>No, go back</button></div>`,
      (s, close) => { s.querySelector('[data-yes]').onclick = () => { answer = true; close(); }; }, () => resolve(answer));
  });

  // ——— Busy buttons ———
  SW.busy = async (btn, fn) => {
    if (btn.disabled) return;
    const old = btn.innerHTML; btn.disabled = true; btn.innerHTML = 'Please wait…';
    try { return await fn(); } catch (e) { SW.fail(e); } finally { if (btn.isConnected) { btn.disabled = false; btn.innerHTML = old; } }
  };
  SW.showErr = (form, e) => {
    SW.$$('.err', form).forEach(x => x.remove()); SW.$$('.bad', form).forEach(x => x.classList.remove('bad'));
    const input = e.field && form.querySelector(`[name="${e.field}"]`);
    if (input) { input.classList.add('bad'); input.insertAdjacentHTML('afterend', `<span class="err">${SW.esc(e.message)}</span>`); input.focus(); } else SW.fail(e);
  };

  // ——— Photos: pick, shrink in the browser, upload ———
  SW.pickPhoto = () => new Promise(resolve => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*';
    inp.onchange = async () => {
      const file = inp.files && inp.files[0];
      if (!file) return resolve(null);
      try { resolve(await SW.uploadFile(file)); } catch (e) { SW.fail(e); resolve(null); }
    };
    inp.click();
  });
  SW.uploadFile = async file => {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(new Error('Could not read that photo.')); i.src = url; });
      const max = 1280, k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      const data = c.toDataURL('image/jpeg', 0.82);
      SW.toast('Uploading photo…');
      return (await SW.post('/api/upload', { data })).url;
    } finally { URL.revokeObjectURL(url); }
  };

  // ——— Theme ———
  SW.toggleTheme = () => {
    const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem('swavy-theme', t); } catch (e) { /* ignore */ }
    const m = SW.$('meta[name=theme-color]'); if (m) m.content = t === 'dark' ? '#0E0C1A' : '#F6F5FB';
    return t;
  };

  // ——— Onboarding: 3 slides, shown once ———
  SW.onboarding = (key, slides, force) => {
    try { if (!force && localStorage.getItem(key)) return; } catch (e) { /* ignore */ }
    let i = 0;
    const el = document.createElement('div');
    el.className = 'onb'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'How it works');
    const draw = () => {
      const s = slides[i];
      el.innerHTML = `<div class="onb-in"><div class="row between"><span class="logo">${SW.mark()}</span><button class="link-btn" data-skip>Skip</button></div>
        <div class="onb-art"><div class="bubble">${SW.icon(s.icon)}</div></div>
        <div><p class="badge badge-brand">How it works · ${i + 1} of ${slides.length}</p><h2>${SW.esc(s.title)}</h2><p class="muted" style="font-size:17px">${SW.esc(s.text)}</p></div>
        <div class="onb-dots">${slides.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</div>
        <button class="btn btn-primary btn-lg btn-block" data-next>${i < slides.length - 1 ? 'Next' : 'Oya, let\'s go!'} ${SW.icon('chevR')}</button></div>`;
      el.querySelector('[data-next]').onclick = () => { if (i < slides.length - 1) { i++; draw(); } else finish(); };
      el.querySelector('[data-skip]').onclick = finish;
    };
    const finish = () => { try { localStorage.setItem(key, '1'); } catch (e) { /* ignore */ } el.remove(); };
    draw();
    document.body.appendChild(el);
  };

  // ——— Hash router ———
  const routes = [];
  SW.route = (pattern, fn) => routes.push({ re: new RegExp('^' + pattern.replace(/:(\w+)/g, '([^/]+)') + '$'), fn });
  SW.go = h => { if (location.hash === h) SW.render(); else location.hash = h; };
  SW.path = () => (location.hash.replace(/^#/, '') || '/').split('?')[0];
  SW.qs = () => new URLSearchParams((location.hash.split('?')[1]) || '');
  let seq = 0;
  SW.render = async () => {
    const p = SW.path();
    const my = ++seq;
    const main = SW.$('#main');
    for (const r of routes) {
      const m = p.match(r.re);
      if (!m) continue;
      try {
        const html = await r.fn(...m.slice(1).map(decodeURIComponent));
        if (my !== seq) return;
        if (typeof html === 'string') { main.innerHTML = html; }
        if (SW.afterRender) SW.afterRender(p);
        if (SW.onMount) { const f = SW.onMount; SW.onMount = null; f(main); }
      } catch (e) {
        if (my !== seq) return;
        if (e.status === 401) { SW.me = null; SW.afterRender && SW.afterRender(p); main.innerHTML = SW.needLogin(); return; }
        main.innerHTML = `<div class="empty">${SW.icon('alert')}<h3>Something no work</h3><p>${SW.esc(e.message)}</p><button class="btn btn-primary" data-reload>Try again</button></div>`;
      }
      return;
    }
    main.innerHTML = `<div class="empty">${SW.icon('search')}<h3>Page no dey here</h3><a class="btn btn-primary" href="#/">Go home</a></div>`;
  };
  SW.mount = fn => { SW.onMount = fn; };
  SW.start = () => {
    window.addEventListener('hashchange', () => { SW.render(); window.scrollTo(0, 0); });
    SW.render();
    if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('/sw.js').catch(() => {});
  };
})(window.SW);
document.addEventListener('click', e => {
  if (e.target.closest('[data-hback]')) { e.preventDefault(); if (history.length > 1) history.back(); else location.hash = '#/'; }
  if (e.target.closest('[data-reload]')) location.reload();
});
