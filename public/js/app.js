/* Swavy Dispatch front end: 3-step booking with instant price, live tracking with map, rider app, admin/dispatcher. */
(function (SW) {
  'use strict';
  const { esc, icon, naira } = SW;
  let CAT = null;
  const BOOK = { step: 1, city: 'Lagos', pickupArea: '', pickupAddr: '', dropArea: '', dropAddr: '', size: '', item: '', receiverName: '', receiverPhone: '', express: false, pay: 'cash_delivery', collect: false, collectAmount: '' };
  const isRider = () => SW.me && SW.me.role === 'rider';
  let cleanup = [];   // timers / streams to stop when the page changes
  const onLeave = fn => cleanup.push(fn);
  const runCleanup = () => { cleanup.forEach(f => { try { f(); } catch (e) { /* ignore */ } }); cleanup = []; };
  const baseRender = SW.render;
  SW.render = () => { runCleanup(); return baseRender(); };
  const STATUS_BADGE = { pending: 'badge-warn', assigned: 'badge-brand', to_pickup: 'badge-brand', picked: 'badge-brand', on_way: 'badge-brand', delivered: 'badge-ok', cancelled: 'badge-bad' };
  const badge = o => `<span class="badge ${STATUS_BADGE[o.status] || ''}">${esc(o.statusText)}</span>`;
  const sizeName = k => (CAT.sizes.find(s => s.key === k) || { name: k }).name;
  const riderPic = (r, size) => r.photo ? `<img class="rpic" src="${esc(r.photo)}" alt="" style="width:${size}px;height:${size}px">` : SW.avatar(r.name, size);
  const sampleTag = o => o.sample ? ' <span class="sample-tag">sample</span>' : '';

  function shell() {
    document.getElementById('app').innerHTML = `
      <header class="top"><div class="top-in">
        <a href="#/" aria-label="Swavy Dispatch home">${SW.logo('dispatch')}</a>
        <nav class="top-nav" id="topnav"></nav><span class="grow"></span>
        <button class="icon-btn" id="themeBtn" aria-label="Switch light or dark mode"></button>
        <a class="icon-btn" href="#/account" aria-label="Account">${icon('user')}</a>
      </div></header>
      <main id="main" tabindex="-1"></main>
      <nav class="tabbar" id="tabbar" aria-label="Main"></nav>`;
    const tb = SW.$('#themeBtn');
    tb.innerHTML = icon(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon');
    tb.onclick = () => { tb.innerHTML = icon(SW.toggleTheme() === 'dark' ? 'sun' : 'moon'); };
  }
  SW.afterRender = path => {
    const tabs = isRider()
      ? [['#/', 'bike', 'Jobs'], ['#/earnings', 'cash', 'Earnings'], ['#/account', 'user', 'Account']]
      : [['#/', 'home', 'Home'], ['#/book', 'send', 'Send'], ['#/orders', 'list', 'My orders'], ['#/account', 'user', SW.me ? 'Account' : 'Log in']];
    const on = h => (h === '#/' ? path === '/' || path.startsWith('/job/') : ('#' + path).startsWith(h)) ? 'on' : '';
    SW.$('#tabbar').innerHTML = tabs.map(([h, i, l]) => `<a href="${h}" class="${on(h)}">${icon(i)}<span>${l}</span></a>`).join('');
    SW.$('#topnav').innerHTML = tabs.filter(t => t[0] !== '#/account').map(([h, , l]) => `<a href="${h}" class="${on(h)}">${l}</a>`).join('');
  };
  SW.needLogin = () => `<div class="empty">${icon('lock')}<h3>Log in to continue</h3><p>It takes 10 seconds.</p><button class="btn btn-primary btn-lg" data-login>Log in or sign up</button></div>`;
  document.addEventListener('click', e => { if (e.target.closest('[data-login]')) { e.preventDefault(); loginSheet(); } if (e.target.closest('[data-howto]')) onboard(true); });

  async function refreshMe() { const r = await SW.get('/api/me'); SW.me = r.me; SW.admin = r.admin; }
  function loginSheet(after) {
    SW.sheet(`<h2>Welcome to Swavy Dispatch</h2><p class="muted">Log in to send packages or ride with Swavy.</p>
      <form id="lf" novalidate>
        <label class="field"><span>Email</span><input class="input" name="email" type="email" inputmode="email" autocomplete="email"></label>
        <label class="field"><span>Password</span><input class="input" name="password" type="password" autocomplete="current-password"></label>
        <button class="btn btn-primary btn-block btn-lg">Log in</button></form>
      <p class="small muted mt center">Just testing? Use a sample account:</p>
      <div class="row wrap" style="justify-content:center"><button class="btn btn-sm btn-ghost" data-demo="customer@swavy.ng">Customer</button><button class="btn btn-sm btn-ghost" data-demo="rider@swavy.ng">Rider</button><button class="btn btn-sm btn-ghost" data-demo="rider2@swavy.ng">Rider 2</button></div>
      <hr class="hr"><a class="btn btn-block btn-ghost" href="#/signup" data-close>New here? Create account</a>`, (s, close) => {
      const f = s.querySelector('#lf');
      s.querySelectorAll('[data-demo]').forEach(b => b.onclick = () => { f.email.value = b.dataset.demo; f.password.value = 'swavy123'; f.requestSubmit(); });
      f.onsubmit = e => { e.preventDefault(); SW.busy(f.querySelector('button'), async () => {
        try { await SW.post('/api/login', { email: f.email.value, password: f.password.value }); } catch (err) { SW.showErr(f, err); return; }
        close(); await refreshMe(); SW.toast(`Welcome, ${SW.me.name.split(' ')[0]}!`, 'ok'); if (after) after(); else SW.render();
      }); };
    });
  }
  function onboard(force) {
    SW.onboarding('swavy-dispatch-onboarded', [
      { icon: 'send', title: 'Book a bike in 3 taps', text: 'Tell us where to pick up, where it is going and how big it is. You see the price before you confirm.' },
      { icon: 'map', title: 'Watch it move, live', text: 'Share the tracking link with the receiver on WhatsApp. You both see the rider, the bike and every step.' },
      { icon: 'lock', title: 'Delivery code = no wahala', text: 'The receiver gives the rider a 4-digit code only when the package is in their hand. No code, no "delivered".' }
    ], force);
  }

  // ——— Simple stylised city map (SVG, no internet map needed) ———
  const ROADS = {
    Lagos: [['Magodo', 'Ikeja'], ['Ikeja', 'Gbagada'], ['Gbagada', 'Yaba'], ['Yaba', 'Surulere'], ['Surulere', 'Festac'], ['Yaba', 'Ikoyi'], ['Ikoyi', 'Victoria Island'], ['Ikoyi', 'Lekki'], ['Victoria Island', 'Lekki'], ['Lekki', 'Ajah'], ['Surulere', 'Victoria Island']],
    Abuja: [['Kubwa', 'Gwarinpa'], ['Gwarinpa', 'Jabi'], ['Jabi', 'Wuse'], ['Wuse', 'Maitama'], ['Wuse', 'Garki'], ['Garki', 'Asokoro'], ['Maitama', 'Asokoro'], ['Jabi', 'Lugbe'], ['Garki', 'Lugbe']]
  };
  function mapSvg(city, o, rider) {
    const A = Object.fromEntries(CAT.areas.filter(a => a.city === city).map(a => [a.name, a]));
    const water = city === 'Lagos' ? '<path class="m-water" d="M0 68 C 20 64, 30 70, 45 67 S 75 66, 100 70 L100 76 C 80 72, 60 74, 45 73 S 20 71, 0 74 Z"/><path class="m-water" d="M0 92 C 30 90, 60 95, 100 93 L100 100 L0 100Z"/>' : '<path class="m-green" d="M66 40 q8 -6 14 2 q-2 9 -12 6z"/><circle class="m-green" cx="38" cy="62" r="5"/>';
    const roads = (ROADS[city] || []).filter(([a, b]) => A[a] && A[b]).map(([a, b]) => `<line class="m-road" x1="${A[a].x}" y1="${A[a].y}" x2="${A[b].x}" y2="${A[b].y}"/>`).join('');
    const dots = Object.values(A).map(a => `<circle class="m-dot" cx="${a.x}" cy="${a.y}" r="1.3"/><text class="m-lbl" x="${a.x}" y="${a.y - 2.6}">${esc(a.name)}</text>`).join('');
    let route = '';
    if (o && o.pickupXY[0] != null) {
      const [px, py] = o.pickupXY, [dx, dy] = o.dropXY;
      route = `<line class="m-route" x1="${px}" y1="${py}" x2="${dx}" y2="${dy}"/>
        <g transform="translate(${px} ${py})"><path class="m-pin m-pin-a" d="M0 0c-3-4-4.4-6-4.4-8a4.4 4.4 0 0 1 8.8 0c0 2-1.4 4-4.4 8z"/><text class="m-pin-t" y="-6.6">A</text></g>
        <g transform="translate(${dx} ${dy})"><path class="m-pin m-pin-b" d="M0 0c-3-4-4.4-6-4.4-8a4.4 4.4 0 0 1 8.8 0c0 2-1.4 4-4.4 8z"/><text class="m-pin-t" y="-6.6">B</text></g>`;
    }
    const r = rider && rider.x != null ? `<g id="riderDot" class="m-rider" style="transform:translate(${rider.x}px,${rider.y}px)"><circle r="4.2" class="m-rider-halo"/><circle r="2.8" class="m-rider-c"/><path d="M-1.6 .8h3.2M-1.2 -.6l.8 1.4M1.2 -.6l-.8 1.4" class="m-rider-i"/></g>` : '';
    return `<svg class="map" viewBox="0 0 100 100" role="img" aria-label="Map of ${esc(city)} showing pickup A${rider ? ', drop-off B and the rider' : ' and drop-off B'}"><rect class="m-bg" width="100" height="100" rx="4"/>${water}${roads}${route}${dots}${r}</svg>`;
  }

  // ——— Home ———
  SW.route('/', async () => {
    if (isRider()) return riderHome();
    let recent = [];
    if (SW.me) { try { recent = (await SW.get('/api/orders')).orders.slice(0, 3); } catch (e) { /* ignore */ } }
    const live = recent.filter(o => !['delivered', 'cancelled'].includes(o.status));
    return `<section class="hero"><p class="badge badge-lime">${icon('bike')} Okada delivery · Lagos & Abuja</p>
        <h1>Send it across town, <span class="hl">sharp sharp.</span></h1>
        <p class="muted" style="font-size:17px;max-width:600px">A verified Swavy rider picks up and delivers on a motorcycle. See the price first, track it live, and only the receiver's code can complete the delivery.</p></section>
      <a class="bigcta" href="#/book" data-cta>${icon('send')}<span><b>Send a package</b><small>3 quick steps · price shows instantly</small></span>${icon('chevR')}</a>
      ${live.map(o => `<a class="card livecard mt" href="#/t/${esc(o.token)}"><p class="eyebrow">${icon('map')} Live now</p><div class="row between"><b>${esc(o.pickupArea)} → ${esc(o.dropArea)}</b>${badge(o)}</div><p class="small muted" style="margin:6px 0 0">${esc(o.code)} · tap to track</p></a>`).join('')}
      <div class="feat mt2">
        <div class="card">${icon('cash')}<b>Price before you book</b><span class="muted small">Fixed by area and size. No haggling.</span></div>
        <div class="card">${icon('lock')}<b>Delivery code</b><span class="muted small">Rider can only finish with the receiver's 4 digits.</span></div>
        <div class="card">${icon('wa')}<b>Share on WhatsApp</b><span class="muted small">Receiver tracks the bike live too.</span></div>
        <div class="card">${icon('handshake')}<b>Collect money for me</b><span class="muted small">Selling? The rider collects the item cost for you.</span></div>
      </div>
      <a class="card row mt2" href="/bot-test" target="_blank" rel="noopener"><span class="tile-ic">${icon('bot')}</span><span class="grow"><b>Prefer chat? Book on Telegram</b><br><span class="small muted">Try the Swavy bot in test mode</span></span>${icon('chevR')}</a>
      <p class="footer-note center small muted mt2">Prices shown are <span class="sample-tag">sample</span> prices. <button class="link-btn" data-howto>How it works</button></p>`;
  });

  // ——— Booking: 3 steps, then price + confirm ———
  SW.route('/book', async () => {
    if (isRider()) return `<div class="empty">${icon('bike')}<h3>You are logged in as a rider</h3><p>Log out and use a customer account to send a package.</p></div>`;
    const cities = Object.keys(CAT.cities);
    if (!BOOK.city) BOOK.city = SW.me && SW.me.city || 'Lagos';
    const step = BOOK.step;
    const areaChips = (field, skip) => `<div class="chips">${CAT.cities[BOOK.city].map(a => `<button type="button" class="chip ${BOOK[field] === a ? 'on' : ''}" data-area="${field}" data-v="${esc(a)}">${esc(a)}</button>`).join('')}</div>`;
    const steps = `<div class="steps" aria-label="Step ${Math.min(step, 4)} of 4">${[1, 2, 3, 4].map(i => `<i class="${i <= step ? 'on' : ''}"></i>`).join('')}</div>`;
    let body = '';
    if (step === 1) {
      body = `<p class="eyebrow">Step 1 of 3</p><h1>Where should we pick it up?</h1>
        <div class="seg mt" role="group" aria-label="City">${cities.map(c => `<button type="button" class="${BOOK.city === c ? 'on' : ''}" data-city="${c}">${c}</button>`).join('')}</div>
        <p class="lbl mt">Pickup area</p>${areaChips('pickupArea')}
        <label class="field mt"><span>Pickup address</span><input class="input input-lg" name="pickupAddr" value="${esc(BOOK.pickupAddr)}" placeholder="e.g. 12 Herbert Macaulay Way, by the bank" autocomplete="street-address"></label>`;
    } else if (step === 2) {
      body = `<p class="eyebrow">Step 2 of 3</p><h1>Where is it going?</h1>
        <p class="lbl mt">Drop-off area (${esc(BOOK.city)})</p>${areaChips('dropArea')}
        <label class="field mt"><span>Drop-off address</span><input class="input input-lg" name="dropAddr" value="${esc(BOOK.dropAddr)}" placeholder="e.g. 7 Bourdillon Road, blue gate"></label>`;
    } else if (step === 3) {
      body = `<p class="eyebrow">Step 3 of 3</p><h1>What are we carrying?</h1>
        <div class="sizes mt">${CAT.sizes.map(s => `<button type="button" class="tile ${BOOK.size === s.key ? 'on' : ''}" data-size="${s.key}"><span class="tile-ic">${icon(s.icon)}</span><b>${s.name}</b><span class="tiny muted">${esc(s.hint)}</span></button>`).join('')}</div>
        <label class="field mt"><span>What is it? <span class="muted">(optional)</span></span><input class="input" name="item" value="${esc(BOOK.item)}" placeholder="e.g. Shoes, documents, cake"></label>
        <label class="field"><span>Receiver's name</span><input class="input" name="receiverName" value="${esc(BOOK.receiverName)}" placeholder="e.g. Kemi" autocomplete="off"></label>
        <label class="field"><span>Receiver's phone</span><input class="input" name="receiverPhone" type="tel" inputmode="tel" value="${esc(BOOK.receiverPhone)}" placeholder="0803 123 4567"></label>`;
    } else {
      const q = await SW.post('/api/quote', BOOK);
      body = `<p class="eyebrow">Your price</p><h1>Confirm your delivery</h1>
        <div class="pricecard"><span class="small">Total</span><b data-price>${naira(q.price)}</b><span class="small">${icon('clock', 'ic-sm')} About ${esc(q.eta)}${q.express ? ' · Express' : ''}</span></div>
        <div class="card card-flat"><ul class="routeline"><li><i class="ra">A</i><span><b>${esc(BOOK.pickupArea)}</b><br><span class="small muted">${esc(BOOK.pickupAddr)}</span></span></li><li><i class="rb">B</i><span><b>${esc(BOOK.dropArea)}</b><br><span class="small muted">${esc(BOOK.dropAddr)} · ${esc(BOOK.receiverName || 'Receiver')} ${esc(SW.phone(BOOK.receiverPhone))}</span></span></li></ul>
          <table class="qt"><tr><td>Base price (${esc(q.pickupArea)} → ${esc(q.dropArea)})</td><td>${naira(q.base)}</td></tr>${q.sizeExtra ? `<tr><td>${sizeName(q.size)} package</td><td>+${naira(q.sizeExtra)}</td></tr>` : ''}${q.expressFee ? `<tr><td>Express</td><td>+${naira(q.expressFee)}</td></tr>` : ''}</table></div>
        <button type="button" class="pick mt ${BOOK.express ? 'on' : ''}" data-express><span>${icon('zap')} Express: next free rider, straight there <span class="muted small">+${naira(Number(CAT.settings.express))}</span></span><span class="toggle ${BOOK.express ? 'on' : ''}"></span></button>
        <p class="lbl mt">How will you pay?</p>
        <div class="stack">${Object.entries(CAT.pay).map(([k, v]) => `<button type="button" class="pick ${BOOK.pay === k ? 'on' : ''}" data-pay="${k}"><span>${icon(k === 'transfer' ? 'send' : 'cash')} ${esc(v)}</span>${BOOK.pay === k ? icon('checkCircle') : ''}</button>`).join('')}</div>
        ${BOOK.pay === 'transfer' ? `<p class="note note-warn mt">${icon('info')}<span>${esc(CAT.payNote)}</span></p>` : ''}
        <button type="button" class="pick mt ${BOOK.collect ? 'on' : ''}" data-collect><span>${icon('handshake')} Collect money for me <span class="muted small">Rider collects the item cost from the receiver</span></span><span class="toggle ${BOOK.collect ? 'on' : ''}"></span></button>
        ${BOOK.collect ? `<label class="field mt"><span>Amount the receiver should pay you (₦)</span><input class="input input-lg" name="collectAmount" inputmode="numeric" value="${esc(BOOK.collectAmount)}" placeholder="e.g. 25000"></label>` : ''}`;
    }
    SW.mount(main => {
      const form = SW.$('#bk', main);
      const keep = () => SW.$$('input', form).forEach(i => { BOOK[i.name] = i.value; });
      SW.$$('[data-city]', main).forEach(b => b.onclick = () => { keep(); if (BOOK.city !== b.dataset.city) { BOOK.city = b.dataset.city; BOOK.pickupArea = BOOK.dropArea = ''; } SW.render(); });
      SW.$$('[data-area]', main).forEach(b => b.onclick = () => { keep(); BOOK[b.dataset.area] = b.dataset.v; SW.$$(`[data-area="${b.dataset.area}"]`, main).forEach(x => x.classList.toggle('on', x === b)); const inp = SW.$('input.input-lg', main); if (inp && !inp.value) inp.focus(); });
      SW.$$('[data-size]', main).forEach(b => b.onclick = () => { BOOK.size = b.dataset.size; SW.$$('[data-size]', main).forEach(x => x.classList.toggle('on', x === b)); });
      SW.$$('[data-pay]', main).forEach(b => b.onclick = () => { keep(); BOOK.pay = b.dataset.pay; SW.render(); });
      const ex = SW.$('[data-express]', main); if (ex) ex.onclick = () => { keep(); BOOK.express = !BOOK.express; SW.render(); };
      const co = SW.$('[data-collect]', main); if (co) co.onclick = () => { keep(); BOOK.collect = !BOOK.collect; SW.render(); };
      const back = SW.$('[data-back]', main); if (back) back.onclick = () => { keep(); BOOK.step--; SW.render(); };
      form.onsubmit = e => {
        e.preventDefault(); keep();
        const need = (cond, field, msg) => { if (!cond) { SW.showErr(form, { field, message: msg }); throw 0; } };
        try {
          if (step === 1) { need(BOOK.pickupArea, null, 'Pick the pickup area.'); need(BOOK.pickupAddr.trim().length >= 3, 'pickupAddr', 'Type the pickup address.'); }
          if (step === 2) { need(BOOK.dropArea, null, 'Pick the drop-off area.'); need(BOOK.dropAddr.trim().length >= 3, 'dropAddr', 'Type the drop-off address.'); }
          if (step === 3) { need(BOOK.size, null, 'Pick the package size.'); need(SW.normPhone(BOOK.receiverPhone).length >= 10, 'receiverPhone', "Enter the receiver's phone number."); }
        } catch (x) { if (x === 0) return; throw x; }
        if (step < 4) { BOOK.step++; SW.render(); window.scrollTo(0, 0); return; }
        const btn = SW.$('[data-confirm]', main);
        const send = () => SW.busy(btn, async () => {
          let r;
          try { r = await SW.post('/api/orders', BOOK); } catch (err) { if (err.status === 401) return loginSheet(send); if (err.status === 403) return SW.fail(new Error('Log in with a customer account to send a package.')); SW.showErr(form, err); return; }
          Object.assign(BOOK, { step: 1, pickupAddr: '', dropAddr: '', dropArea: '', size: '', item: '', receiverName: '', receiverPhone: '', express: false, collect: false, collectAmount: '' });
          SW.toast('Booked! Finding you a rider…', 'ok');
          SW.go('#/t/' + r.order.token);
        });
        if (!SW.me) loginSheet(send); else send();
      };
    });
    return `<form id="bk" class="narrow" novalidate>${step > 1 ? `<button type="button" class="back" data-back>${icon('chevL')} Back</button>` : ''}${steps}${body}
      <div class="stickybar"><button class="btn btn-primary btn-lg btn-block" ${step === 4 ? 'data-confirm' : ''}>${step < 3 ? `Next ${icon('chevR')}` : step === 3 ? `See price ${icon('chevR')}` : `${icon('check')} Confirm & book rider`}</button></div></form>`;
  });

  // ——— Live tracking (sender + receiver) ———
  SW.route('/t/:token', async token => {
    const r = await SW.get('/api/track/' + encodeURIComponent(token));
    let o = r.order; const mine = r.mine;
    SW.mount(main => {
      const draw = () => { SW.$('#trk', main).innerHTML = trackBody(o, mine); wire(); };
      const wire = () => {
        const share = SW.$('[data-share]', main);
        if (share) share.onclick = () => window.open(SW.waShare(shareText(o)), '_blank', 'noopener');
        const copy = SW.$('[data-copy]', main);
        if (copy) copy.onclick = async () => { try { await navigator.clipboard.writeText(trackUrl(o)); SW.toast('Link copied', 'ok'); } catch (e) { SW.toast(trackUrl(o)); } };
        const cancel = SW.$('[data-cancel]', main);
        if (cancel) cancel.onclick = async () => { if (await SW.confirm('Cancel this delivery?', 'The rider will be told not to come.', 'Yes, cancel', 'bad')) SW.busy(cancel, async () => { o = (await SW.post(`/api/orders/${o.id}/cancel`)).order; draw(); }); };
        let stars = 0;
        SW.$$('.starpick button', main).forEach(b => b.onclick = () => { stars = +b.dataset.s; SW.$$('.starpick button', main).forEach(x => x.classList.toggle('on', +x.dataset.s <= stars)); });
        const rate = SW.$('[data-rate]', main);
        if (rate) rate.onclick = () => { if (!stars) return SW.toast('Tap the stars first'); SW.busy(rate, async () => { o = (await SW.post(`/api/orders/${o.id}/rate`, { stars, note: SW.$('#rnote', main).value })).order; SW.toast('Thanks for rating!', 'ok'); draw(); }); };
      };
      wire();
      if (!['delivered', 'cancelled'].includes(o.status) && window.EventSource) {
        const es = new EventSource(`/api/track/${encodeURIComponent(token)}/stream`);
        es.onmessage = ev => {
          let d; try { d = JSON.parse(ev.data); } catch (e) { return; }
          if (d.type === 'order') { const changed = d.order.status !== o.status || d.order.events.length !== o.events.length || (d.order.rider || {}).id !== (o.rider || {}).id; o = d.order; if (changed) { draw(); if (o.status !== 'pending') SW.toast(o.statusText, o.status === 'delivered' ? 'ok' : ''); } if (['delivered', 'cancelled'].includes(o.status)) es.close(); }
          if (d.type === 'pos') { const dot = SW.$('#riderDot', main); if (dot) dot.style.transform = `translate(${d.x}px,${d.y}px)`; if (o.rider) { o.rider.x = d.x; o.rider.y = d.y; } }
        };
        onLeave(() => es.close());
      }
    });
    return `<div id="trk">${trackBody(o, mine)}</div>`;
  });
  const trackUrl = o => `${location.origin}/t/${o.token}`;
  const shareText = o => `Hi ${o.receiverName}, I'm sending you a package with Swavy Dispatch (${o.code}). Track the rider live here: ${trackUrl(o)}\nYour delivery code is ${o.deliveryCode}. Give it to the rider ONLY when the package is in your hand.`;
  function trackBody(o, mine) {
    const flow = [['pending', 'Booked'], ['to_pickup', 'Rider coming'], ['picked', 'Picked up'], ['on_way', 'On the way'], ['delivered', 'Delivered']];
    const idx = o.status === 'assigned' ? 0.5 : flow.findIndex(f => f[0] === o.status);
    const closed = ['delivered', 'cancelled'].includes(o.status);
    const r = o.rider;
    return `<div class="trackgrid"><div>
        <div class="row between"><span><p class="eyebrow" style="margin:0">${esc(o.code)}${sampleTag(o)}</p><h1 class="status-h" data-status="${o.status}">${esc(o.statusText)}</h1></span>${o.status === 'delivered' ? `<span class="okbig">${icon('checkCircle')}</span>` : ''}</div>
        ${o.status !== 'cancelled' ? `<ol class="prog">${flow.map((f, i) => `<li class="${i < idx || o.status === 'delivered' ? 'done' : i === Math.ceil(idx) ? 'now' : ''}"><i></i><span>${f[1]}</span></li>`).join('')}</ol>` : ''}
        <div class="mapbox">${mapSvg(o.city, o, closed ? null : r)}</div>
        ${r ? `<div class="card ridercard mt">${riderPic(r, 56)}<div class="grow"><b>${esc(r.name)}</b><span class="small muted">${esc(r.bike)}</span><span class="plate">${esc(r.plate)}</span></div><div class="center">${r.rating ? `<b>★ ${r.rating}</b><br><span class="tiny muted">${r.ratings} ratings</span>` : ''}${!closed ? `<a class="icon-btn callbtn mt" href="tel:+${esc(r.phone)}" aria-label="Call rider">${icon('call')}</a>` : ''}</div></div>` : !closed ? `<div class="note note-brand mt">${icon('search')}<span>Finding the nearest verified rider for you…</span></div>` : ''}
      </div><div>
        ${!closed && o.deliveryCode ? `<div class="codebox mt"><span class="small">Delivery code</span><b data-code>${esc(o.deliveryCode)}</b><span class="small muted">Receiver: give this to the rider <b>only</b> when the package is in your hand.</span></div>` : ''}
        ${!closed ? `<div class="row mt"><button class="btn btn-wa btn-lg grow" data-share>${icon('wa')} Share on WhatsApp</button><button class="btn btn-ghost btn-lg" data-copy aria-label="Copy tracking link">${icon('copy')}</button></div>` : ''}
        ${mine && o.status === 'delivered' && !o.rating ? `<div class="card next mt"><p class="eyebrow">${icon('star')} Rate your rider</p><div class="starpick">${[1, 2, 3, 4, 5].map(s => `<button data-s="${s}" aria-label="${s} star${s > 1 ? 's' : ''}">★</button>`).join('')}</div><input class="input mt" id="rnote" placeholder="Anything to add? (optional)"><button class="btn btn-primary btn-block btn-lg mt" data-rate>Send rating</button></div>` : ''}
        ${o.rating ? `<p class="note note-ok mt">${icon('star')}<span>You rated this delivery ${o.rating} star${o.rating > 1 ? 's' : ''}. Thank you!</span></p>` : ''}
        <div class="card mt"><ul class="routeline"><li><i class="ra">A</i><span><b>${esc(o.pickupArea)}</b><br><span class="small muted">${esc(o.pickupAddr)} · ${esc(o.senderName)}</span></span></li><li><i class="rb">B</i><span><b>${esc(o.dropArea)}</b><br><span class="small muted">${esc(o.dropAddr)} · ${esc(o.receiverName)}</span></span></li></ul>
          <dl class="kv mt"><dt>Package</dt><dd>${sizeName(o.size)}${o.item ? ' · ' + esc(o.item) : ''}</dd><dt>Price</dt><dd>${naira(o.price)}${o.express ? ' · Express' : ''}</dd><dt>Payment</dt><dd>${esc(o.payText)}${o.paid ? ' ✓' : ''}</dd>${o.collectAmount ? `<dt>Collect for sender</dt><dd>${naira(o.collectAmount)} · ${{ pending: 'rider will collect', collected: 'collected', paid_out: 'paid to sender' }[o.collectStatus] || ''}</dd>` : ''}</dl>
          ${o.pickupPhoto ? `<p class="lbl mt">Photo at pickup</p><img class="pphoto" src="${esc(o.pickupPhoto)}" alt="Package photo taken by the rider at pickup">` : ''}</div>
        <div class="card mt"><p class="eyebrow">${icon('clock')} Timeline</p><ul class="timeline">${o.events.slice().reverse().map(e => `<li><b>${esc(e.text)}</b><span class="tiny muted">${SW.time(e.at)} · ${SW.date(e.at)}</span></li>`).join('')}</ul></div>
        ${mine && ['pending', 'assigned'].includes(o.status) ? `<button class="btn btn-ghost btn-block mt" data-cancel>Cancel delivery</button>` : ''}
      </div></div>`;
  }

  // ——— Customer orders ———
  SW.route('/orders', async () => {
    if (isRider()) { SW.go('#/earnings'); return ''; }
    if (!SW.me) return SW.needLogin();
    const list = (await SW.get('/api/orders')).orders;
    return `<h1>My orders</h1>${list.length ? `<div class="list">${list.map(o => `<a class="item" href="#/t/${esc(o.token)}"><span class="tile-ic">${icon('box')}</span><span class="grow"><b>${esc(o.pickupArea)} → ${esc(o.dropArea)}</b>${sampleTag(o)}<br><span class="small muted">${esc(o.code)} · ${SW.ago(o.createdAt)} · ${naira(o.price)}</span></span>${badge(o)}</a>`).join('')}</div>`
      : `<div class="empty">${icon('box')}<h3>No deliveries yet</h3><a class="btn btn-primary btn-lg" href="#/book">Send a package</a></div>`}`;
  });

  // ——— Rider ———
  async function riderHome() {
    const d = await SW.get('/api/rider');
    SW.mount(main => {
      const t = setInterval(async () => { if (document.hidden) return; try { const n = await SW.get('/api/rider'); if (JSON.stringify([n.offers.map(o => o.id), n.active.map(o => o.status)]) !== JSON.stringify([d.offers.map(o => o.id), d.active.map(o => o.status)])) SW.render(); } catch (e) { /* ignore */ } }, 4000);
      onLeave(() => clearInterval(t));
      const tg = SW.$('[data-online]', main);
      if (tg) tg.onclick = () => SW.busy(tg, async () => { await SW.post('/api/rider/online', { online: !d.me.online }); SW.toast(d.me.online ? 'You are offline. Rest well!' : 'You are online. Jobs will show here.', 'ok'); SW.render(); });
      SW.$$('[data-accept]', main).forEach(b => b.onclick = () => SW.busy(b, async () => { const r = await SW.post(`/api/rider/jobs/${b.dataset.accept}/accept`); SW.toast('Job accepted! Head to pickup.', 'ok'); SW.go('#/job/' + r.order.id); }));
    });
    const m = d.me;
    return `<div class="row between"><span><p class="eyebrow" style="margin:0">Rider</p><h1 style="margin:0">Hi, ${esc(m.name.split(' ')[0])}</h1></span>${riderPic(m, 52)}</div>
      ${!m.verified ? `<div class="note note-warn mt">${icon('alert')}<span>Swavy is checking your bike papers and ID. You can take jobs once you are verified.</span></div>` : ''}
      <button class="onlinebtn ${m.online ? 'on' : ''} mt" data-online ${m.verified ? '' : 'disabled'}><span class="pw">${icon('power')}</span><span><b>${m.online ? 'You are ONLINE' : 'You are offline'}</b><small>${m.online ? 'Tap to go offline' : 'Tap to go online and get jobs'}</small></span></button>
      <div class="stat-grid mt"><a class="stat stat-hero" href="#/earnings"><b>${naira(d.earnings.today)}</b><span>Earned today · ${d.earnings.todayJobs} job${d.earnings.todayJobs === 1 ? '' : 's'}</span></a><a class="stat" href="#/earnings"><b>${naira(d.cash.total)}</b><span>Cash to hand over</span></a></div>
      ${d.active.length ? `<div class="section-title"><h2>Your job${d.active.length > 1 ? 's' : ''} now</h2></div>${d.active.map(o => `<a class="card next jobcard" href="#/job/${o.id}"><div class="row between"><b>${esc(o.pickupArea)} → ${esc(o.dropArea)}</b>${badge(o)}</div><p class="small muted" style="margin:6px 0 10px">${esc(o.code)} · ${sizeName(o.size)} · you earn ${naira(o.earn)}</p><span class="btn btn-primary btn-block btn-lg">Open job ${icon('chevR')}</span></a>`).join('')}` : ''}
      <div class="section-title"><h2>Jobs near you</h2><span class="small muted">${m.online ? 'updates by itself' : ''}</span></div>
      ${!m.online ? `<div class="empty">${icon('power')}<h3>Go online to see jobs</h3><p>Tap the big button above.</p></div>`
        : d.offers.length ? `<div class="list">${d.offers.map(o => `<div class="card offer"><div class="row between"><span class="badge ${o.express ? 'badge-lime' : 'badge-brand'}">${o.express ? icon('zap') + ' Express' : sizeName(o.size)}</span><span class="small muted">${o.away} km away</span></div>
            <ul class="routeline mt"><li><i class="ra">A</i><span><b>${esc(o.pickupArea)}</b><br><span class="small muted">${esc(o.pickupAddr)}</span></span></li><li><i class="rb">B</i><span><b>${esc(o.dropArea)}</b><br><span class="small muted">${esc(o.dropAddr)}</span></span></li></ul>
            <div class="row between mt"><span><b class="earn">${naira(o.earn)}</b><br><span class="tiny muted">you earn${o.cashAtPickup ? ` · collect ${naira(o.cashAtPickup)} at pickup` : o.cashToCollect ? ` · collect ${naira(o.cashToCollect)} at drop-off` : ''}</span></span><button class="btn btn-primary btn-lg" data-accept="${o.id}">Accept</button></div>${sampleTag(o)}</div>`).join('')}</div>`
        : `<div class="empty">${icon('search')}<h3>No jobs right now</h3><p>New jobs appear here by themselves. Stay close to busy areas.</p></div>`}`;
  }

  SW.route('/job/:id', async id => {
    if (!isRider()) return SW.needLogin();
    const o = (await SW.get('/api/rider/jobs/' + id)).order;
    const closed = ['delivered', 'cancelled'].includes(o.status);
    SW.mount(main => {
      const step = (to, photo) => SW.post(`/api/rider/jobs/${o.id}/step`, { to, photo }).then(() => SW.render());
      SW.$$('[data-step]', main).forEach(b => b.onclick = () => SW.busy(b, async () => {
        if (b.dataset.step === 'picked' && !b.hasAttribute('data-nophoto')) { const url = await SW.pickPhoto(); if (!url) return; await step('picked', url); SW.toast('Picked up. Photo saved.', 'ok'); return; }
        await step(b.dataset.step); SW.toast('Updated', 'ok');
      }));
      const f = SW.$('#dlv', main);
      if (f) f.onsubmit = e => { e.preventDefault(); SW.busy(f.querySelector('button'), async () => {
        try { await SW.post(`/api/rider/jobs/${o.id}/deliver`, { code: f.code.value }); } catch (err) { SW.showErr(f, err); return; }
        SW.toast('Delivered! Well done.', 'ok'); SW.render();
      }); };
      if (!closed) {
        const t = setInterval(async () => { try { const n = (await SW.get('/api/rider/jobs/' + id)).order; const dot = SW.$('#riderDot', main); if (dot && n.rider) dot.style.transform = `translate(${n.rider.x}px,${n.rider.y}px)`; if (n.status !== o.status) SW.render(); } catch (e) { /* ignore */ } }, 2000);
        onLeave(() => clearInterval(t));
      }
    });
    const action = {
      assigned: `<button class="btn btn-primary btn-lg btn-block" data-step="to_pickup">${icon('bike')} Start: heading to pickup</button>`,
      to_pickup: `<button class="btn btn-primary btn-lg btn-block" data-step="picked">${icon('camera')} I have the package: take photo</button><button class="link-btn mt center-block" data-step="picked" data-nophoto>No camera? Continue without photo</button>`,
      picked: `<button class="btn btn-primary btn-lg btn-block" data-step="on_way">${icon('send')} Start trip: on the way</button>`,
      on_way: `<form id="dlv" novalidate><label class="field"><span>Receiver's 4-digit delivery code</span><input class="input code-input" name="code" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="••••"></label><button class="btn btn-ok btn-lg btn-block">${icon('check')} Complete delivery</button></form><p class="small muted center mt">Ask the receiver for the code only after they have the package.</p>`
    }[o.status] || '';
    return `<button class="back" data-hback>${icon('chevL')} Jobs</button>
      <div class="row between"><span><p class="eyebrow" style="margin:0">${esc(o.code)}${sampleTag(o)}</p><h1 style="margin:0" class="status-h">${esc(o.statusText)}</h1></span><b class="earn">${naira(o.earn)}</b></div>
      <div class="mapbox mt">${mapSvg(o.city, o, closed ? null : o.rider)}</div>
      ${o.status === 'delivered' ? `<div class="card okc mt center"><span class="okbig">${icon('checkCircle')}</span><h2>Delivered. Nice one!</h2><p class="muted">You earned ${naira(o.earn)}${o.cashToCollect || o.pay !== 'transfer' ? '. Remember to hand over any cash you collected.' : '.'}</p><a class="btn btn-primary btn-lg btn-block" href="#/">Back to jobs</a></div>` : ''}
      ${o.cashAtPickup && o.status === 'to_pickup' ? `<p class="note note-warn mt">${icon('cash')}<span>Collect <b>${naira(o.cashAtPickup)}</b> cash from the sender at pickup.</span></p>` : ''}
      ${o.cashToCollect && ['picked', 'on_way'].includes(o.status) ? `<p class="note note-warn mt">${icon('cash')}<span>Collect <b>${naira(o.cashToCollect)}</b> from the receiver${o.collectAmount && o.collectStatus === 'pending' ? ` (includes ${naira(o.collectAmount)} item money for the sender)` : ''}.</span></p>` : ''}
      <div class="mt">${action}</div>
      <div class="card mt"><ul class="routeline"><li><i class="ra">A</i><span class="grow"><b>${esc(o.pickupArea)}</b><br><span class="small muted">${esc(o.pickupAddr)}<br>${esc(o.senderName)}</span></span>${o.senderPhone && !closed ? `<a class="icon-btn callbtn" href="tel:+${esc(o.senderPhone)}" aria-label="Call sender">${icon('call')}</a>` : ''}</li>
        <li><i class="rb">B</i><span class="grow"><b>${esc(o.dropArea)}</b><br><span class="small muted">${esc(o.dropAddr)}<br>${esc(o.receiverName)}</span></span>${!closed ? `<a class="icon-btn callbtn" href="tel:+${esc(o.receiverPhone)}" aria-label="Call receiver">${icon('call')}</a>` : ''}</li></ul>
        <dl class="kv mt"><dt>Package</dt><dd>${sizeName(o.size)}${o.item ? ' · ' + esc(o.item) : ''}</dd><dt>Payment</dt><dd>${esc(o.payText)}</dd></dl></div>`;
  });

  SW.route('/earnings', async () => {
    if (!isRider()) return SW.needLogin();
    const d = await SW.get('/api/rider');
    return `<h1>Earnings</h1><div class="stat-grid"><div class="stat stat-hero"><b>${naira(d.earnings.today)}</b><span>Today · ${d.earnings.todayJobs} jobs</span></div><div class="stat"><b>${naira(d.earnings.week)}</b><span>This week · ${d.earnings.weekJobs} jobs</span></div></div>
      <p class="small muted mt">You keep ${d.earnings.share}% of every delivery price.</p>
      <div class="card warnc mt"><p class="eyebrow">${icon('cash')} Cash in your hand</p><div class="totalbar"><span>Hand over to Swavy</span><b data-cash>${naira(d.cash.total)}</b></div>
        ${d.cash.items.length ? `<table class="qt">${d.cash.items.map(i => `<tr><td>${esc(i.code)}<br><span class="tiny muted">${i.fee ? 'Delivery fee ' + naira(i.fee) : ''}${i.fee && i.collected ? ' + ' : ''}${i.collected ? 'Item money ' + naira(i.collected) : ''}</span></td><td>${naira(i.total)}</td></tr>`).join('')}</table>` : '<p class="muted small mt">No cash to hand over. 👍</p>'}
        <p class="small muted mt">Pay this at the Swavy hub or by transfer. The dispatcher marks it once received.</p></div>
      <div class="section-title"><h2>Recent deliveries</h2></div>
      ${d.recent.length ? `<div class="list">${d.recent.map(o => `<div class="item"><span class="tile-ic">${icon('checkCircle')}</span><span class="grow"><b>${esc(o.pickupArea)} → ${esc(o.dropArea)}</b>${sampleTag(o)}<br><span class="small muted">${esc(o.code)} · ${SW.ago(o.deliveredAt)}${o.rating ? ' · ★' + o.rating : ''}</span></span><b>${naira(o.earn)}</b></div>`).join('')}</div>` : `<div class="empty">${icon('bike')}<h3>No deliveries yet</h3></div>`}`;
  });

  // ——— Account + signup ———
  SW.route('/account', async () => {
    SW.mount(main => {
      const lo = SW.$('[data-logout]', main);
      if (lo) lo.onclick = async () => { await SW.post('/api/logout'); SW.me = null; SW.admin = false; SW.toast('Logged out'); SW.go('#/'); };
    });
    if (!SW.me) return `<div class="narrow"><h1>Account</h1><div class="card"><p>Log in to send packages or take delivery jobs.</p><button class="btn btn-primary btn-lg btn-block" data-login>Log in</button><a class="btn btn-ghost btn-lg btn-block mt" href="#/signup">Create account</a></div>
      <div class="card mt list-links"><a class="rowlink" href="/bot-test" target="_blank" rel="noopener">${icon('bot')} Telegram bot (test mode)</a><a class="rowlink" href="#/admin">${icon('shield')} Dispatcher / admin</a><button class="rowlink link-btn" data-howto>${icon('info')} How it works</button></div></div>`;
    const m = SW.me;
    return `<div class="narrow"><h1>Account</h1><div class="card row">${m.rider ? riderPic(m.rider, 56) : SW.avatar(m.name, 56)}<div class="grow"><b>${esc(m.name)}</b><br><span class="small muted">${esc(m.email)} · ${esc(SW.phone(m.phone))}</span><br><span class="badge badge-brand mt">${m.role === 'rider' ? 'Rider' : 'Customer'} · ${esc(m.area || '')}, ${esc(m.city || '')}</span></div></div>
      ${m.rider ? `<div class="card mt"><dl class="kv"><dt>Bike</dt><dd>${esc(m.rider.bike)}</dd><dt>Plate</dt><dd>${esc(m.rider.plate)}</dd><dt>Verified</dt><dd>${m.rider.verified ? '✅ Yes' : '⏳ Waiting'}</dd><dt>Rating</dt><dd>${m.rider.rating ? '★ ' + m.rider.rating : 'No ratings yet'}</dd></dl></div>` : ''}
      <div class="card mt list-links"><a class="rowlink" href="/bot-test" target="_blank" rel="noopener">${icon('bot')} Telegram bot (test mode)</a><a class="rowlink" href="#/admin">${icon('shield')} Dispatcher / admin</a><button class="rowlink link-btn" data-howto>${icon('info')} How it works</button></div>
      <button class="btn btn-ghost btn-block btn-lg mt" data-logout>${icon('logout')} Log out</button></div>`;
  });
  SW.route('/signup', async () => {
    let role = SW.qs().get('as') === 'rider' ? 'rider' : 'customer';
    SW.mount(main => {
      const f = SW.$('#sf', main);
      SW.$$('[data-role]', main).forEach(b => b.onclick = () => { role = b.dataset.role; SW.$$('[data-role]', main).forEach(x => x.classList.toggle('on', x === b)); SW.$('#riderBits', main).classList.toggle('hide', role !== 'rider'); });
      f.onsubmit = e => { e.preventDefault(); SW.busy(f.querySelector('button[type=submit]'), async () => {
        const body = Object.fromEntries(new FormData(f)); body.role = role;
        try { await SW.post('/api/signup', body); } catch (err) { SW.showErr(f, err); return; }
        await refreshMe(); SW.toast('Account created. Welcome to Swavy!', 'ok'); SW.go('#/');
      }); };
    });
    const opts = Object.entries(CAT.cities).map(([c, list]) => `<optgroup label="${c}">${list.map(a => `<option>${esc(a)}</option>`).join('')}</optgroup>`).join('');
    return `<form id="sf" class="narrow" novalidate><h1>Create account</h1>
      <div class="tiles"><button type="button" class="tile ${role === 'customer' ? 'on' : ''}" data-role="customer"><span class="tile-ic">${icon('send')}</span>I want to send packages</button><button type="button" class="tile ${role === 'rider' ? 'on' : ''}" data-role="rider"><span class="tile-ic">${icon('bike')}</span>I ride a motorcycle</button></div>
      <label class="field mt"><span>Full name</span><input class="input" name="name" autocomplete="name"></label>
      <label class="field"><span>Phone</span><input class="input" name="phone" type="tel" inputmode="tel" placeholder="0803 123 4567"></label>
      <label class="field"><span>Email</span><input class="input" name="email" type="email" inputmode="email" autocomplete="email"></label>
      <label class="field"><span>Password</span><input class="input" name="password" type="password" autocomplete="new-password" placeholder="At least 6 characters"></label>
      <label class="field"><span>Your area</span><select class="input" name="area"><option value="">Choose…</option>${opts}</select></label>
      <div id="riderBits" class="${role === 'rider' ? '' : 'hide'}"><label class="field"><span>Bike plate number</span><input class="input" name="plate" placeholder="LSR-123AB"></label><label class="field"><span>Bike (make and colour)</span><input class="input" name="bike" placeholder="Bajaj Boxer, red"></label><p class="note">${icon('shield')}<span>Swavy checks your ID and bike papers before your first job.</span></p></div>
      <button type="submit" class="btn btn-primary btn-lg btn-block mt">Create account</button></form>`;
  });

  // ——— Admin / dispatcher ———
  let ADMIN_TAB = 'orders';
  SW.route('/admin', async () => {
    if (!SW.admin) {
      SW.mount(main => { const f = SW.$('#af', main); f.onsubmit = e => { e.preventDefault(); SW.busy(f.querySelector('button'), async () => { try { await SW.post('/api/admin/login', { password: f.password.value }); } catch (err) { SW.showErr(f, err); return; } SW.admin = true; SW.render(); }); }; });
      return `<form id="af" class="narrow card" novalidate><h1>Dispatcher login</h1><p class="muted">For Swavy staff. Default password is in the README.</p><label class="field"><span>Admin password</span><input class="input" name="password" type="password" autocomplete="current-password"></label><button class="btn btn-primary btn-lg btn-block">Open dispatch board</button></form>`;
    }
    const d = await SW.get('/api/admin/overview');
    SW.mount(main => {
      SW.$$('[data-tab]', main).forEach(b => b.onclick = () => { ADMIN_TAB = b.dataset.tab; SW.render(); });
      SW.$$('[data-assign]', main).forEach(b => b.onclick = () => SW.busy(b, async () => { const sel = SW.$(`#rs-${b.dataset.assign}`, main); await SW.post(`/api/admin/orders/${b.dataset.assign}/assign`, { riderId: sel.value }); SW.toast('Rider assigned', 'ok'); SW.render(); }));
      SW.$$('[data-acancel]', main).forEach(b => b.onclick = async () => { if (await SW.confirm('Cancel this order?', 'The customer will see it as cancelled.', 'Yes, cancel', 'bad')) SW.busy(b, async () => { await SW.post(`/api/admin/orders/${b.dataset.acancel}/cancel`); SW.render(); }); });
      SW.$$('[data-verify]', main).forEach(b => b.onclick = () => SW.busy(b, async () => { await SW.post(`/api/admin/riders/${b.dataset.verify}/verify`, { verified: b.dataset.v === '1' }); SW.toast('Saved', 'ok'); SW.render(); }));
      SW.$$('[data-remit]', main).forEach(b => b.onclick = () => SW.busy(b, async () => { const r = await SW.post(`/api/admin/riders/${b.dataset.remit}/remit`); SW.toast(`${naira(r.amount)} marked as received`, 'ok'); SW.render(); }));
      SW.$$('[data-payout]', main).forEach(b => b.onclick = () => SW.busy(b, async () => { await SW.post(`/api/admin/orders/${b.dataset.payout}/payout`); SW.toast('Marked as paid to sender', 'ok'); SW.render(); }));
      const pf = SW.$('#pf', main);
      if (pf) pf.onsubmit = e => { e.preventDefault(); SW.busy(pf.querySelector('[type=submit]'), async () => {
        const prices = SW.$$('[data-zp]', pf).map(i => { const [city, z1, z2] = i.dataset.zp.split('|'); return { city, z1: +z1, z2: +z2, amount: i.value }; });
        const settings = Object.fromEntries(SW.$$('[data-set]', pf).map(i => [i.dataset.set, i.value]));
        try { await SW.post('/api/admin/prices', { prices, settings }); } catch (err) { SW.fail(err); return; }
        CAT = await SW.get('/api/catalog'); SW.toast('Prices saved', 'ok');
      }); };
      const lo = SW.$('[data-alogout]', main); if (lo) lo.onclick = async () => { await SW.post('/api/admin/logout'); SW.admin = false; await refreshMe(); SW.go('#/'); };
      if (window.EventSource) {
        const es = new EventSource('/api/admin/stream'); let t;
        es.onmessage = () => { clearTimeout(t); t = setTimeout(() => { const a = document.activeElement; if (ADMIN_TAB === 'orders' && !(a && /SELECT|INPUT/.test(a.tagName))) SW.render(); }, 700); };
        onLeave(() => { es.close(); clearTimeout(t); });
      }
    });
    const riders = d.riders.filter(r => r.verified);
    const tabs = [['orders', 'Orders'], ['riders', 'Riders'], ['prices', 'Prices'], ['cash', 'Cash']];
    let body = '';
    if (ADMIN_TAB === 'orders') {
      body = `<div class="stat-grid stat-4"><div class="stat stat-hero"><b>${d.stats.waiting}</b><span>Waiting for rider</span></div><div class="stat"><b>${d.stats.live}</b><span>On the road</span></div><div class="stat"><b>${d.stats.online}</b><span>Riders online</span></div><div class="stat"><b>${naira(d.stats.cashOut)}</b><span>Cash with riders</span></div></div>
        <div class="list mt">${d.orders.map(o => `<div class="card aorder" data-order="${o.id}"><div class="row between"><b>${esc(o.code)}${sampleTag(o)}</b>${badge(o)}</div>
          <p style="margin:6px 0"><b>${esc(o.pickupArea)} → ${esc(o.dropArea)}</b> <span class="small muted">· ${esc(o.city)} · ${sizeName(o.size)}${o.express ? ' · Express' : ''} · ${naira(o.price)} · ${esc(o.payText)}${o.source !== 'web' ? ' · via ' + esc(o.source) : ''}</span></p>
          <p class="small muted" style="margin:0 0 8px">${esc(o.senderName)} → ${esc(o.receiverName)} ${esc(SW.phone(o.receiverPhone))} · ${SW.ago(o.createdAt)}${o.rider ? ` · Rider: <b>${esc(o.rider.name)}</b>` : ''}</p>
          ${!['delivered', 'cancelled'].includes(o.status) ? `<div class="row wrap"><select class="input grow" id="rs-${o.id}" aria-label="Rider for ${esc(o.code)}">${riders.filter(r => r.city === o.city).map(r => `<option value="${r.id}" ${o.rider && o.rider.id === r.id ? 'selected' : ''}>${esc(r.name)} · ${r.online ? 'online' : 'offline'}${r.active ? ` · ${r.active} job` : ''}</option>`).join('')}</select><button class="btn btn-primary" data-assign="${o.id}">${o.rider ? 'Reassign' : 'Assign'}</button><button class="btn btn-ghost" data-acancel="${o.id}" aria-label="Cancel order">${icon('x')}</button></div>` : ''}
          <a class="small" href="#/t/${esc(o.token)}">Open tracking page</a></div>`).join('')}</div>`;
    } else if (ADMIN_TAB === 'riders') {
      body = `<div class="list">${d.riders.map(r => `<div class="item">${riderPic(r, 48)}<span class="grow"><b>${esc(r.name)}</b><br><span class="small muted">${esc(r.plate)} · ${esc(r.bike)} · ${esc(r.city)}</span><br><span class="badge ${r.verified ? 'badge-ok' : 'badge-warn'}">${r.verified ? 'Verified' : 'Not verified'}</span> <span class="badge">${r.online ? '🟢 Online' : 'Offline'}</span> ${r.rating ? `<span class="badge">★ ${r.rating}</span>` : ''}</span><button class="btn btn-sm ${r.verified ? 'btn-ghost' : 'btn-primary'}" data-verify="${r.id}" data-v="${r.verified ? 0 : 1}">${r.verified ? 'Unverify' : 'Verify'}</button></div>`).join('')}</div>`;
    } else if (ADMIN_TAB === 'prices') {
      const byCity = {}; d.prices.forEach(p => (byCity[p.city] = byCity[p.city] || []).push(p));
      const zn = (c, z) => (d.zones.find(x => x.city === c && x.zone === z) || {}).name || 'Zone ' + z;
      body = `<form id="pf"><p class="note">${icon('info')}<span>These are <b>sample</b> prices for a small package. Medium and large multiply the price; express adds a fixed fee.</span></p>
        <div class="card mt"><p class="eyebrow">Extras</p><div class="setgrid"><label class="field"><span>Medium ×</span><input class="input" data-set="medium" value="${esc(d.settings.medium)}" inputmode="decimal"></label><label class="field"><span>Large ×</span><input class="input" data-set="large" value="${esc(d.settings.large)}" inputmode="decimal"></label><label class="field"><span>Express fee ₦</span><input class="input" data-set="express" value="${esc(d.settings.express)}" inputmode="numeric"></label><label class="field"><span>Rider share %</span><input class="input" data-set="riderShare" value="${esc(d.settings.riderShare)}" inputmode="numeric"></label></div></div>
        ${Object.entries(byCity).map(([c, list]) => `<div class="card mt"><p class="eyebrow">${esc(c)} zones</p><p class="small muted">${d.zones.filter(z => z.city === c).map(z => `<b>${z.zone}</b> ${esc(z.name)}`).join(' · ')}</p>
          <table class="qt ptable">${list.map(p => `<tr><td>${p.z1 === p.z2 ? `Inside zone ${p.z1}` : `Zone ${p.z1} ↔ ${p.z2}`}<br><span class="tiny muted">${esc(zn(c, p.z1))}${p.z1 !== p.z2 ? ' ↔ ' + esc(zn(c, p.z2)) : ''}</span></td><td><input class="input pinput" data-zp="${esc(c)}|${p.z1}|${p.z2}" value="${p.amount}" inputmode="numeric" aria-label="Price zone ${p.z1} to ${p.z2} ${esc(c)}"></td></tr>`).join('')}</table></div>`).join('')}
        <div class="stickybar"><button type="submit" class="btn btn-primary btn-lg btn-block">Save prices</button></div></form>`;
    } else {
      body = `<h2>Cash with riders</h2><div class="list">${d.riders.filter(r => r.cash.total).map(r => `<div class="item">${riderPic(r, 44)}<span class="grow"><b>${esc(r.name)}</b><br><span class="small muted">${r.cash.items.length} order${r.cash.items.length > 1 ? 's' : ''}</span></span><b>${naira(r.cash.total)}</b><button class="btn btn-sm btn-ok" data-remit="${r.id}">Received</button></div>`).join('') || `<p class="muted">No cash outstanding. 👍</p>`}</div>
        <h2 class="mt2">"Collect money" for senders</h2><div class="list">${d.collects.map(c => `<div class="item"><span class="grow"><b>${esc(c.code)}</b> · ${esc(c.sender)}<br><span class="small muted">${c.remitted ? 'Rider has handed it over' : 'Still with rider'}</span></span><b>${naira(c.amount)}</b><button class="btn btn-sm btn-primary" data-payout="${c.id}">Paid to sender</button></div>`).join('') || '<p class="muted">Nothing to pay out.</p>'}</div>
        <h2 class="mt2">Recent hand-overs</h2><div class="list">${d.remits.map(m => `<div class="item"><span class="grow"><b>${esc(m.name)}</b><br><span class="small muted">${SW.ago(m.at)} · ${m.orders} orders</span></span><b>${naira(m.amount)}</b></div>`).join('') || '<p class="muted">None yet.</p>'}</div>`;
    }
    return `<div class="row between"><h1 style="margin:0">Dispatch board</h1><button class="btn btn-sm btn-ghost" data-alogout>${icon('logout')} Exit</button></div>
      <div class="seg mt admin-tabs" role="tablist">${tabs.map(([k, l]) => `<button role="tab" class="${ADMIN_TAB === k ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('')}</div><div class="mt">${body}</div>`;
  });

  (async () => {
    shell();
    try { [CAT] = await Promise.all([SW.get('/api/catalog'), refreshMe()]); } catch (e) { SW.$('#main').innerHTML = `<div class="empty">${icon('alert')}<h3>Can't reach the Swavy server</h3><p>${esc(e.message)}</p><button class="btn btn-primary" data-reload>Try again</button></div>`; return; }
    SW.start();
    if (!location.hash.startsWith('#/t/') && !location.hash.startsWith('#/admin')) onboard();
  })();
})(window.SW);
