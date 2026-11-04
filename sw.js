/* Service worker: guarda la app para que abra sin internet
   y sirve las fotos y PDF guardados en el teléfono (rutas ./_blob/<id>). */
const VERSION = 'facturas-1.3.2';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest',
  'js/rd.js', 'js/qr.js', 'js/xlsx-zip.js', 'js/runtime.js', 'js/app.js',
  'fonts/archivo-latin.woff2', 'fonts/plexmono-400.woff2', 'fonts/plexmono-500.woff2', 'fonts/plexmono-600.woff2',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png',
  'vendor/pdf-lib.min.js', 'vendor/pdf.min.js', 'vendor/pdf.worker.min.js', 'vendor/jsQR.min.js', 'vendor/anthropic-sdk.mjs',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });

function openDb() {
  return new Promise((res, rej) => {
    const req = indexedDB.open('facturas-rd', 1);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains('docs')) d.createObjectStore('docs');
      if (!d.objectStoreNames.contains('files')) d.createObjectStore('files');
    };
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

async function serveBlob(id) {
  try {
    const d = await openDb();
    const rec = await new Promise((res, rej) => {
      const r = d.transaction('files', 'readonly').objectStore('files').get(id);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    d.close();
    if (!rec) return new Response('', { status: 404 });
    return new Response(rec.buf, { headers: { 'Content-Type': rec.type || 'application/octet-stream', 'Cache-Control': 'no-store' } });
  } catch (e) {
    return new Response('', { status: 500 });
  }
}

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return; // las llamadas a otros dominios van directo
  const base = new URL(self.registration.scope).pathname;
  if (url.pathname.startsWith(base + '_blob/')) {
    e.respondWith(serveBlob(decodeURIComponent(url.pathname.slice(base.length + 6))));
    return;
  }
  if (e.request.method !== 'GET') return;
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const hit = await cache.match(e.request, { ignoreSearch: true });
    if (hit) return hit;
    try {
      return await fetch(e.request);
    } catch (err) {
      if (e.request.mode === 'navigate') {
        const page = (await cache.match('index.html')) || (await cache.match('./'));
        if (page) return page;
      }
      throw err;
    }
  })());
});
