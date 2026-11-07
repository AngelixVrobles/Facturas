// Tanda 5: atajos de teclado y foco en la computadora, textos para teléfono o computadora, listas por partes y espacio de la nube.


const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = process.env.APP_ROOT || path.resolve(__dirname, '..');
const SP = process.env.PRUEBAS_TMP || path.join(require('os').tmpdir(), 'facturas-pruebas');
const OUT = path.join(SP, 'test-atajos');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const app = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const file = path.join(ROOT, decodeURIComponent(u.pathname.replace(/^\/facturas\//, '')) || 'index.html');
  if (!u.pathname.startsWith('/facturas/') || !file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  res.end(fs.readFileSync(file));
});

// ---------- nube de prueba (como Supabase) ----------
const KEY = 'sb_publishable_prueba123';
const USERS = { 'yo@sucre.do': 'clave-yo-123' };
const access = new Map(), refresh = new Map();
const docs = new Map(), files = new Map();
let lastUs = 0;
function nowTs() { let us = Date.now() * 1000; if (us <= lastUs) us = lastUs + 1; lastUs = us; return new Date(Math.floor(us / 1000)).toISOString().replace('Z', String(us % 1000).padStart(3, '0') + '+00:00'); }
function toUs(s) { const m = /^(.*\.\d{3})(\d*)(Z|[+-]\d\d:\d\d)$/.exec(String(s)); if (!m) return Date.parse(s) * 1000; return Date.parse(m[1] + m[3]) * 1000 + Number((m[2] + '000').slice(0, 3)); }
const tok = () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
function session(email) { const a = tok(), r = tok(); access.set(a, { email, exp: Date.now() + 3600e3 }); refresh.set(r, email); return { access_token: a, token_type: 'bearer', expires_in: 3600, refresh_token: r, user: { email } }; }
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, apikey, content-type, prefer, x-upsert', 'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS' };
const send = (res, code, body, type = 'application/json') => { res.writeHead(code, { ...CORS, 'content-type': type }); res.end(body == null ? '' : typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body)); };
const nube = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks);
    const u = new URL(req.url, 'http://x');
    if (req.method === 'OPTIONS') return send(res, 204);
    if (req.headers.apikey !== KEY) return send(res, 401, { message: 'Invalid API key' });
    if (u.pathname === '/auth/v1/token') {
      const j = JSON.parse(body.toString() || '{}');
      if (u.searchParams.get('grant_type') === 'password') return USERS[j.email] === j.password ? send(res, 200, session(j.email)) : send(res, 400, { error_description: 'Invalid login credentials' });
      if (u.searchParams.get('grant_type') === 'refresh_token') { const e = refresh.get(j.refresh_token); if (!e) return send(res, 400, {}); refresh.delete(j.refresh_token); return send(res, 200, session(e)); }
      return send(res, 400, {});
    }
    const a = access.get(String(req.headers.authorization || '').replace(/^Bearer /, ''));
    if (!a || a.exp < Date.now()) return send(res, 401, { message: 'JWT expired' });
    if (u.pathname === '/rest/v1/docs' && req.method === 'GET') {
      const since = toUs((u.searchParams.get('updated_at') || 'gte.1970-01-01T00:00:00.000Z').replace(/^gte\./, ''));
      const rows = [...docs.values()].filter((d) => toUs(d.updated_at) >= since).sort((x, y) => toUs(x.updated_at) - toUs(y.updated_at) || (x.path < y.path ? -1 : 1));
      const off = Number(u.searchParams.get('offset') || 0), lim = Number(u.searchParams.get('limit') || 1000);
      return send(res, 200, rows.slice(off, off + lim));
    }
    if (u.pathname === '/rest/v1/docs' && req.method === 'POST') {
      for (const r of JSON.parse(body.toString())) docs.set(r.path, { path: r.path, data: r.data, deleted: !!r.deleted, updated_at: nowTs() });
      return send(res, 201, null);
    }
    if (u.pathname === '/storage/v1/object/list/archivos' && req.method === 'POST') {
      const j = JSON.parse(body.toString() || '{}'), pre = j.prefix || '';
      return send(res, 200, [...files.entries()].filter(([k]) => k.startsWith(pre) && !k.slice(pre.length).includes('/')).map(([k, f]) => ({ name: k.slice(pre.length), updated_at: f.at, created_at: f.at, metadata: { size: f.buf.length } })));
    }
    let m = /^\/storage\/v1\/object\/archivos\/(.+)$/.exec(u.pathname);
    if (m && req.method === 'POST') { files.set(decodeURIComponent(m[1]), { buf: body, type: req.headers['content-type'], at: new Date().toISOString() }); return send(res, 200, { Key: 'archivos/' + m[1] }); }
    m = /^\/storage\/v1\/object\/authenticated\/archivos\/(.+)$/.exec(u.pathname);
    if (m && req.method === 'GET') { const f2 = files.get(decodeURIComponent(m[1])); return f2 ? send(res, 200, f2.buf, f2.type) : send(res, 400, { error: 'not_found' }); }
    return send(res, 404, { message: 'no existe' });
  });
});

const problems = [];
const check = (cond, msg) => { console.log((cond ? 'OK   ' : 'FALLA') + ' ' + msg); if (!cond) problems.push(msg); };
const settle = (page, ms = 500) => page.waitForTimeout(ms);
async function waitUntil(fn, ms = 20000, step = 250) { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) return v; await new Promise((r) => setTimeout(r, step)); } }
const txt = async (page, sel) => ((await page.textContent(sel).catch(() => '')) || '').replace(/\s+/g, ' ').trim();
const closeSheet = async (page) => { if (await page.$('#sheet-root:not([hidden]) .sheet-h [data-act="sheet-close"]')) { await page.click('.sheet-h [data-act="sheet-close"]'); await page.waitForSelector('#sheet-root', { state: 'hidden' }); } };
const openSettings = (page) => page.evaluate(() => [...document.querySelectorAll('[data-act="settings"]')].find((b) => b.offsetParent).click());
const goTab = (page, tab) => page.evaluate((t) => document.querySelector(`.tabs [data-tab="${t}"]`).click(), tab);
const active = (page) => page.evaluate(() => { const e = document.activeElement; return e ? { id: e.id, tag: e.tagName, cls: e.className, act: e.dataset.act || '', did: e.dataset.id || '', value: e.value } : {}; });
const blur = (page) => page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); });
async function connect(page, NUBE) {
  await openSettings(page);
  await page.waitForSelector('#nb-code');
  await page.fill('#nb-code', NUBE);
  await page.fill('#nb-key', KEY);
  await page.fill('#nb-email', 'yo@sucre.do');
  await page.fill('#nb-pass', 'clave-yo-123');
  await page.click('[data-act="nube-connect"]');
  await waitUntil(async () => /Al día/.test(await txt(page, '#nb-status')), 20000);
}
// Hace que el espacio de los archivos parezca de 900 MB (sin subir 900 MB), solo cuando la prueba lo pide.
const BIG = () => {
  let rt;
  Object.defineProperty(window, 'RT', {
    configurable: true,
    get() { return rt; },
    set(v) {
      rt = v;
      if (v && v.assets && v.assets.list && !v.assets.__big) {
        const orig = v.assets.list.bind(v.assets);
        v.assets.list = async (...x) => { const r = await orig(...x); if (localStorage.getItem('prueba.grande')) r.usage = { ...r.usage, bytes: 900 * 1048576 }; return r; };
        v.assets.__big = true;
      }
    },
  });
};

(async () => {
  await new Promise((r) => app.listen(0, '127.0.0.1', r));
  await new Promise((r) => nube.listen(0, '127.0.0.1', r));
  const BASE = `http://127.0.0.1:${app.address().port}/facturas/`;
  const NUBE = `http://127.0.0.1:${nube.address().port}`;
  const browser = await chromium.launch();
  const mk = async (name, phone) => {
    const ctx = await browser.newContext(phone ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 } });
    await ctx.addInitScript(BIG);
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error' && !/404|Failed to fetch|net::|Failed to load resource/.test(m.text())) problems.push(name + ' consola: ' + m.text()); });
    page.on('pageerror', (e) => problems.push(name + ' error de página: ' + e.message));
    await page.goto(BASE);
    await page.waitForSelector('.empty h2');
    return page;
  };

  // ---------- computadora ----------
  const a = await mk('computadora', false);
  await a.evaluate(async () => {
    await RT.db.doc('settings/general').set({ company: 'SUCRE B. LANTIGUA CONSTRUCTORA, S.R.L.', companyRnc: '104595114', preparedBy: 'A. Robles' });
    const p = RT.db.collection('projects').doc(); await p.set({ name: 'Caperuza 2', createdAt: '2026-09-01T10:00:00.000Z' });
    const base = { projectId: p.id, concept: '', ref: '', buyerRnc: '104595114', qrUrl: '', fiscal: '', notInvoice: false, noOrder: true, fileId: null, fileType: 'image/jpeg', thumbId: null, pages: 1, xmlId: null, ai: 'off', currency: 'DOP', itbis: 0 };
    for (let n = 0; n < 160; n++) {
      const d = new Date(Date.UTC(2026, 10, 6) - n * 864e5 / 4).toISOString();
      await RT.db.collection('invoices').doc().set({ ...base, supplier: 'Ferretería Ochoa ' + (n % 7), rnc: '1309' + String(10000 + n), number: 'B01' + String(10000000 + n).padStart(8, '0'), date: d.slice(0, 10), amount: 1000 + n, fileName: 'f' + n + '.jpg', createdAt: d });
    }
  });
  await a.reload();
  await a.waitForSelector('#f-list [data-act="open-inv"]');
  await a.click('[data-act="backup-later"]').catch(() => {});
  await settle(a, 400);

  // 1) Listas por partes: 150 en la tabla y «Ver 10 más».
  const rows0 = await a.$$eval('#f-list .row-btn', (l) => l.length);
  check(rows0 === 150 && /Ver 10 más/.test(await txt(a, '#f-list [data-act="more"]')), `la tabla muestra 150 facturas y «Ver 10 más» (muestra ${rows0})`);
  await a.click('#f-list [data-act="more"]');
  await settle(a, 300);
  check((await a.$$eval('#f-list .row-btn', (l) => l.length)) === 160, 'con «Ver más» salen las 160');

  // 2) La ayuda de los atajos sale en el menú de la izquierda.
  check(await a.isVisible('.tabs .nav-keys') && /\/ buscar · N agregar · Esc cerrar/.test(await txt(a, '.tabs .nav-keys')), 'en el menú de la izquierda dice: / buscar · N agregar · Esc cerrar');

  // 3) «/» va a la búsqueda sin escribir la barra; dentro de la búsqueda, «n» se escribe.
  let choosers = 0;
  a.on('filechooser', () => { choosers++; });
  await blur(a);
  await a.keyboard.press('/');
  let ae = await active(a);
  check(ae.id === 'f-search' && ae.value === '', '«/» lleva a la búsqueda de facturas (sin escribir la barra)');
  await a.keyboard.type('n');
  await settle(a, 400);
  check((await a.inputValue('#f-search')) === 'n' && choosers === 0, 'escribiendo en la búsqueda, la «n» es una letra, no el atajo');
  await a.fill('#f-search', '');
  await settle(a, 300);

  // 4) «N» agrega: en Facturas abre para escoger los archivos.
  await blur(a);
  await a.keyboard.press('n');
  await waitUntil(async () => choosers > 0, 3000, 100);
  check(choosers === 1, '«N» en Facturas abre para escoger las facturas');
  // con una casilla de la tabla marcada (y con el foco en ella), «/» sigue llevando a la búsqueda
  await a.focus('#f-list [data-sel]');
  await a.keyboard.press('/');
  check((await active(a)).id === 'f-search', 'con el foco en una casilla de la tabla, «/» también lleva a la búsqueda');

  // 5) Flechas: de una fila a otra; Enter la abre; el panel recibe el foco; Esc lo cierra y el foco vuelve a la fila.
  const order = await a.$$eval('#f-list .row-btn', (l) => l.slice(0, 3).map((b) => b.dataset.id));
  await a.focus(`#f-list .row-btn[data-id="${order[0]}"]`);
  await a.keyboard.press('ArrowDown');
  await a.keyboard.press('ArrowDown');
  ae = await active(a);
  const down2 = ae.did === order[2];
  await a.keyboard.press('ArrowUp');
  ae = await active(a);
  check(down2 && ae.did === order[1], 'las flechas ↓ ↑ pasan de una fila a otra de la tabla');
  await a.keyboard.press('Enter');
  await a.waitForSelector('#inv-form');
  ae = await active(a);
  check(/\bsheet\b/.test(ae.cls), 'Enter abre la factura y el teclado queda dentro del panel');
  const before = choosers;
  await a.keyboard.press('n');
  await settle(a, 400);
  check(choosers === before && await a.isVisible('#inv-form'), 'con el panel abierto, «N» no hace nada');
  await a.keyboard.press('Escape');
  await a.waitForSelector('#sheet-root', { state: 'hidden' });
  ae = await active(a);
  check(ae.act === 'open-inv' && ae.did === order[1], 'Esc cierra el panel y el foco vuelve a la misma fila');
  await a.screenshot({ path: path.join(OUT, 'computadora.png') });

  // 6) En Conduces y Órdenes, «/» y «N» hacen lo de esa sección.
  await goTab(a, 'conduces');
  await settle(a, 300);
  await blur(a);
  await a.keyboard.press('/');
  check((await active(a)).id === 'c-search', '«/» en Conduces va a su búsqueda');
  await blur(a);
  const c0 = choosers;
  await a.keyboard.press('n');
  await waitUntil(async () => choosers > c0, 3000, 100);
  check(choosers === c0 + 1, '«N» en Conduces abre para escoger los conduces');
  await goTab(a, 'ordenes');
  await settle(a, 300);
  await blur(a);
  await a.keyboard.press('n');
  await a.waitForSelector('#sheet-root:not([hidden]) .sheet', { timeout: 5000 }).catch(() => {});
  check(await a.isVisible('#sheet-root .sheet') && /orden/i.test(await txt(a, '#sheet-root .sheet-h')), '«N» en Órdenes abre una orden nueva');
  await a.keyboard.press('Escape');
  await a.waitForSelector('#sheet-root', { state: 'hidden' });
  await goTab(a, 'facturas');

  // 7) Textos para la computadora en Ajustes.
  await openSettings(a);
  await a.waitForSelector('[data-act="nube-connect"]');
  const sTxt = await txt(a, '#settings-form');
  check((await txt(a, '[data-act="nube-connect"]')) === 'Conectar esta computadora' && /Nube: teléfono y computadora/.test(sTxt), 'en la computadora: «Conectar esta computadora» y la sección «Nube: teléfono y computadora»');
  check(/Tus facturas solo están en esta computadora/.test(sTxt) && /solo en esta computadora: no va en los respaldos/.test(sTxt) && !/este teléfono/.test(sTxt), 'Ajustes no habla de «este teléfono» en la computadora');
  await closeSheet(a);

  // 8) Espacio de la nube: sin nube no hay aviso; con la nube y 900 MB de archivos, avisa.
  await a.evaluate(() => localStorage.setItem('prueba.grande', '1'));
  await a.reload();
  await a.waitForSelector('#f-list [data-act="open-inv"]');
  await settle(a, 3200);
  check(!/se está llenando/.test(await txt(a, '#banner')), 'sin la nube no sale el aviso del espacio');
  await connect(a, NUBE);
  await waitUntil(async () => /En la nube:/.test(await txt(a, '#st-usage')), 8000);
  check(/En la nube: 900\.0 MB de alrededor de 1\.0 GB del plan gratis \(88 %\)/.test(await txt(a, '#st-usage')), 'Ajustes dice cuánto ocupa en la nube: 900.0 MB de alrededor de 1.0 GB (88 %)');
  check((await txt(a, '[data-act="nube-share"]')) === 'Datos para conectar otro aparato' && (await txt(a, '[data-act="nube-off"]')) === 'Desconectar esta computadora', 'con la nube: «Datos para conectar otro aparato» y «Desconectar esta computadora»');
  await a.click('[data-act="nube-off"]');
  check(/¿Desconectar esta computadora de la nube\?/.test(await txt(a, '#nb-confirm')), 'la confirmación dice «¿Desconectar esta computadora de la nube?»');
  await closeSheet(a);
  await a.reload();
  await a.waitForSelector('#f-list [data-act="open-inv"]');
  await waitUntil(async () => /se está llenando/.test(await txt(a, '#banner')), 8000);
  check(/La nube se está llenando:.*900\.0 MB de alrededor de 1\.0 GB/.test(await txt(a, '#banner')), 'con la nube y 900 MB, avisa arriba «La nube se está llenando»');
  check(await a.evaluate(() => { const s = document.querySelector('#sync-chip span'); return s && getComputedStyle(s).position !== 'absolute' && s.offsetWidth > 20; }), 'en la computadora el indicador dice «Al día» con letras');
  await a.screenshot({ path: path.join(OUT, 'espacio.png') });

  // ---------- teléfono ----------
  const b = await mk('teléfono', true);
  await b.click('#settings-btn');
  await b.waitForSelector('[data-act="nube-connect"]');
  check((await txt(b, '[data-act="nube-connect"]')) === 'Conectar este teléfono' && /Tus facturas solo están en este teléfono/.test(await txt(b, '#settings-form')), 'en el teléfono: «Conectar este teléfono»');
  await closeSheet(b);
  check(!(await b.isVisible('.tabs .nav-keys')), 'en el teléfono no sale la ayuda del teclado');
  await b.click('#settings-btn');
  await b.waitForSelector('#nb-code');
  await b.fill('#nb-code', NUBE);
  await b.fill('#nb-key', KEY);
  await b.fill('#nb-email', 'yo@sucre.do');
  await b.fill('#nb-pass', 'clave-yo-123');
  await b.click('[data-act="nube-connect"]');
  await waitUntil(async () => /Al día/.test(await txt(b, '#nb-status')), 20000);
  await closeSheet(b);
  await waitUntil(() => b.evaluate(() => document.querySelector('#sync-chip').classList.contains('ok')), 10000);
  check(await b.evaluate(() => { const c = document.querySelector('#sync-chip'), s = c.querySelector('span'); return c.getAttribute('aria-label') === 'Nube: Al día' && getComputedStyle(s).position === 'absolute' && c.offsetWidth < 48; }), 'en el teléfono, al día, el indicador es solo la nube (y sigue diciendo «Al día» al lector de pantalla)');
  check(await b.evaluate(() => getComputedStyle(document.querySelector('.top h1')).webkitLineClamp === '2'), 'el título de arriba usa a lo más 2 líneas');
  await b.screenshot({ path: path.join(OUT, 'telefono.png') });

  console.log('problemas:', problems.length ? problems : 'ninguno');
  await browser.close();
  app.close(); nube.close();
  process.exit(problems.length ? 1 : 0);
})().catch((e) => { console.error(e); console.log('problemas:', problems); process.exit(1); });
