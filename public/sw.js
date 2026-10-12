/* Service worker: installable app, app files cached for fast loads and offline start.
   API calls always go to the network (with the last copy used only when offline). */
'use strict';
const VERSION = 'swavy-dispatch-v1';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icons/icon.svg', '/icons/icon-192.png', '/css/base.css', '/css/app.css', '/js/theme-init.js', '/js/core.js', '/js/app.js', '/bot-test.html', '/css/bot-test.css', '/js/bot-test.js'];
self.addEventListener('install', e => e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== VERSION && x !== VERSION + '-api').map(x => caches.delete(x)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.includes('/stream') || url.pathname.startsWith('/api/bot-test')) return;   // live streams + chat go straight to the network
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(fetch(req).then(res => { if (res.ok) { const c = res.clone(); caches.open(VERSION + '-api').then(x => x.put(req, c)); } return res; })
      .catch(() => caches.open(VERSION + '-api').then(c => c.match(req)).then(hit => hit || new Response(JSON.stringify({ ok: false, error: 'You are offline. Connect and try again.' }), { status: 503, headers: { 'Content-Type': 'application/json' } }))));
    return;
  }
  e.respondWith(caches.open(VERSION).then(async c => {
    const hit = await c.match(req, { ignoreSearch: true });
    const net = fetch(req).then(res => { if (res.ok && !url.pathname.startsWith('/uploads/')) c.put(req, res.clone()); return res; }).catch(() => null);
    return hit || (await net) || (req.mode === 'navigate' ? c.match('/') : new Response('', { status: 504 }));
  }));
});
