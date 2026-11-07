// Control: historial de cada factura, candado con PIN (y quitarlo con la contraseña de la nube) y aprobación de pagos por el dueño desde su teléfono.


const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = process.env.APP_ROOT || path.resolve(__dirname, '..');
const SP = process.env.PRUEBAS_TMP || path.join(require('os').tmpdir(), 'facturas-pruebas');
const OUT = path.join(SP, 'test-control');
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

// ---------- nube de prueba (como Supabase), con lista de archivos y «pausa» ----------
const KEY = 'sb_publishable_prueba123';
const USERS = { 'yo@sucre.do': 'clave-yo-123', 'dueno@sucre.do': 'clave-dueno-456' };
const access = new Map(), refresh = new Map();
const docs = new Map(), files = new Map();
let paused = false;
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
    if (paused) return send(res, 540, { message: 'Project paused' });
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
const docsOf = (page, coll) => page.evaluate((c) => new Promise((r) => { const un = RT.db.collection(c).onSnapshot((s) => { un(); r(s.docs.map((d) => ({ id: d.id, ...d.data() }))); }); }), coll);
const settle = (page, ms = 500) => page.waitForTimeout(ms);
async function waitUntil(fn, ms = 20000, step = 250) { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) return v; await new Promise((r) => setTimeout(r, step)); } }
const txt = async (page, sel) => ((await page.textContent(sel).catch(() => '')) || '').replace(/\s+/g, ' ').trim();
const closeSheet = async (page) => { if (await page.$('#sheet-root:not([hidden]) .sheet-h [data-act="sheet-close"]')) { await page.click('.sheet-h [data-act="sheet-close"]'); await page.waitForSelector('#sheet-root', { state: 'hidden' }); } };
async function connect(page, NUBE, email, pass, code) {
  await page.click('#settings-btn');
  await page.waitForSelector('#nb-code');
  await page.fill('#nb-code', code || NUBE);
  if (!code) await page.fill('#nb-key', KEY);
  await page.fill('#nb-email', email);
  await page.fill('#nb-pass', pass);
  await page.click('[data-act="nube-connect"]');
  await waitUntil(async () => /Al día/.test(await txt(page, '#nb-status')), 20000);
  await closeSheet(page);
}

(async () => {
  await new Promise((r) => app.listen(0, '127.0.0.1', r));
  await new Promise((r) => nube.listen(0, '127.0.0.1', r));
  const BASE = `http://127.0.0.1:${app.address().port}/facturas/`;
  const NUBE = `http://127.0.0.1:${nube.address().port}`;
  const browser = await chromium.launch();
  const mk = async (name) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE.replace(/\/facturas\/$/, '') });
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error' && !/404|540|Failed to fetch|net::|Failed to load resource/.test(m.text())) problems.push(name + ' consola: ' + m.text()); });
    page.on('pageerror', (e) => problems.push(name + ' error de página: ' + e.message));
    await page.goto(BASE);
    await page.waitForSelector('.empty h2');
    return page;
  };
  const a = await mk('yo');
  const ids = await a.evaluate(async () => {
    await RT.db.doc('settings/general').set({ company: 'SUCRE B. LANTIGUA CONSTRUCTORA, S.R.L.', companyRnc: '104595114', preparedBy: 'A. Robles' });
    const p = RT.db.collection('projects').doc(); await p.set({ name: 'Caperuza 2', createdAt: '2026-09-01T10:00:00.000Z' });
    const base = { projectId: p.id, concept: '', ref: '', buyerRnc: '104595114', qrUrl: '', fiscal: '', notInvoice: false, noOrder: true, fileId: null, fileType: 'image/jpeg', thumbId: null, pages: 1, xmlId: null, ai: 'off', currency: 'DOP', createdAt: '2026-11-05T13:00:00.000Z' };
    const x = RT.db.collection('invoices').doc(); await x.set({ ...base, supplier: 'Transporte y Agregados S. López', rnc: '130999998', number: 'B0100000777', date: '2026-11-05', amount: 8000, itbis: 0, fileName: 'l.jpg' });
    const y = RT.db.collection('invoices').doc(); await y.set({ ...base, supplier: 'Bloques del Cibao', rnc: '131555777', number: 'B0100000888', date: '2026-11-06', amount: 4720, itbis: 720, fileName: 'b.jpg' });
    return { x: x.id, y: y.id };
  });
  await a.reload();
  await a.waitForSelector('#f-list [data-act="open-inv"]');
  await a.click('[data-act="backup-later"]').catch(() => {});

  // 1) Historial: un cambio a mano queda anotado con lo que cambió.
  await a.click(`#f-list [data-act="open-inv"][data-id="${ids.x}"]`);
  await a.waitForSelector('#inv-form');
  await a.fill('#f-amt', '8500');
  await a.click('#inv-save');
  await a.waitForSelector('#sheet-root', { state: 'hidden' });
  await settle(a);
  let inv = (await docsOf(a, 'invoices')).find((i) => i.id === ids.x);
  check(inv.hist && inv.hist.length === 1 && inv.hist[0].what === 'Cambiada a mano' && inv.hist[0].ch.amount[0] === 8000 && inv.hist[0].ch.amount[1] === 8500 && /A\. Robles/.test(inv.hist[0].by), 'el cambio a mano queda anotado: qué cambió, de cuánto a cuánto y quién');
  await a.click(`#f-list [data-act="open-inv"][data-id="${ids.x}"]`);
  await a.waitForSelector('#inv-hist');
  await a.click('#inv-hist summary');
  const h = await txt(a, '#inv-hist');
  check(/Historial \(2\)/.test(h) && /Cambiada a mano/.test(h) && /Monto: RD\$8,000\.00 → RD\$8,500\.00/.test(h) && /Agregada a la app/.test(h), 'la factura muestra su historial: agregada y el cambio del monto');
  await a.screenshot({ path: path.join(OUT, 'historial.png') });
  await closeSheet(a);

  // 2) PIN: se pone, se pide al abrir, avisa si está mal y deja entrar con el bueno.
  await a.click('#settings-btn');
  await a.click('[data-act="pin-open"]');
  await a.waitForSelector('#pin-form');
  await a.fill('#pin-a', '12');
  await a.fill('#pin-b', '12');
  await a.click('#pin-form button[type="submit"]');
  check(/de 4 a 8 números/.test(await txt(a, '#pin-msg')), 'un PIN muy corto no se acepta');
  await a.fill('#pin-a', '2468');
  await a.fill('#pin-b', '2468');
  await a.click('#pin-form button[type="submit"]');
  await a.waitForSelector('#sheet-root', { state: 'hidden' });
  await a.reload();
  await a.waitForSelector('#lock:not([hidden]) #lock-pin');
  check(await a.evaluate(() => getComputedStyle(document.querySelector('#main')).visibility === 'hidden'), 'al abrir, pide el PIN y no se ven las facturas');
  await a.screenshot({ path: path.join(OUT, 'pin.png') });
  await a.fill('#lock-pin', '1111');
  await a.click('#lock-form button[type="submit"]');
  await settle(a, 300);
  check(/PIN equivocado/.test(await txt(a, '#lock-msg')) && (await a.isVisible('#lock')), 'con el PIN equivocado no entra');
  await a.fill('#lock-pin', '2468');
  await a.click('#lock-form button[type="submit"]');
  await a.waitForSelector('#lock', { state: 'hidden' });
  check(await a.evaluate(() => getComputedStyle(document.querySelector('#main')).visibility === 'visible'), 'con el PIN bueno entra');
  // 5 minutos sin usarla: lo vuelve a pedir
  await a.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await a.clock.install({ time: Date.now() + 6 * 60000 }).catch(() => {});
  await a.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await settle(a, 300);
  check(await a.isVisible('#lock'), 'después de 5 minutos sin usarla, vuelve a pedir el PIN');
  await a.fill('#lock-pin', '2468');
  await a.click('#lock-form button[type="submit"]');
  await a.waitForSelector('#lock', { state: 'hidden' });
  await a.reload();
  await a.waitForSelector('#lock:not([hidden]) #lock-pin');
  await a.fill('#lock-pin', '2468');
  await a.click('#lock-form button[type="submit"]');
  await a.waitForSelector('#lock', { state: 'hidden' });

  // 3) Aprobación del dueño: A conecta la nube y la activa; el dueño (B) aprueba desde su teléfono.
  await connect(a, NUBE, 'yo@sucre.do', 'clave-yo-123');
  await a.click('#settings-btn');
  await a.waitForSelector('#st-ap');
  await a.check('#st-ap');
  await a.fill('#st-owner', 'Dueno@Sucre.do');
  await a.click('#settings-form button[type="submit"]');
  await a.waitForSelector('#settings-form', { state: 'detached' });
  const pays = await a.evaluate(async (I) => {
    const p1 = RT.db.collection('payments').doc(); await p1.set({ name: 'Pago semana 45', date: '2026-11-06', status: 'presentado', presentedAt: '2026-11-06', invoiceIds: [I.x], createdAt: '2026-11-06T10:00:00.000Z' });
    const p2 = RT.db.collection('payments').doc(); await p2.set({ name: 'Pago semana 46', date: '2026-11-06', status: 'presentado', presentedAt: '2026-11-06', invoiceIds: [I.y], createdAt: '2026-11-06T11:00:00.000Z' });
    return { p1: p1.id, p2: p2.id };
  }, ids);
  await settle(a);
  await a.evaluate(() => document.querySelector('.tabs [data-tab="pagos"]').click());
  await a.click(`[data-act="open-pay"][data-id="${pays.p1}"]`);
  await a.waitForSelector('#pd-body .bigtotal');
  check(/Esperando la aprobación del dueño \(dueno@sucre\.do\)/.test(await txt(a, '#pd-body')) && await a.$eval('[data-act="pay-status"][data-s="pagado"]', (b) => b.disabled), 'sin aprobar: «Esperando la aprobación del dueño» y no se puede marcar pagado');
  await a.evaluate(() => RT.sync.syncNow());
  await settle(a, 800);
  const code = await a.evaluate(() => RT.sync.shareCode());
  const b = await mk('dueño');
  await connect(b, NUBE, 'dueno@sucre.do', 'clave-dueno-456', code);
  await waitUntil(async () => (await docsOf(b, 'payments')).length === 2, 15000);
  await b.click('[data-act="backup-later"]').catch(() => {});
  await settle(b, 600);
  check(/2 pagos esperando tu aprobación/.test(await txt(b, '#todo')), 'en el teléfono del dueño: «2 pagos esperando tu aprobación»');
  await b.evaluate(() => document.querySelector('.tabs [data-tab="pagos"]').click());
  await b.click(`[data-act="open-pay"][data-id="${pays.p1}"]`);
  await b.waitForSelector('[data-act="pay-approve"]');
  check(/espera tu aprobación/.test(await txt(b, '#pd-body')), 'el dueño ve que espera su aprobación');
  await b.screenshot({ path: path.join(OUT, 'aprobar.png') });
  await b.click('[data-act="pay-approve"]');
  await settle(b, 500);
  await b.evaluate(() => RT.sync.syncNow());
  await waitUntil(() => docs.get('payments/' + pays.p1) && docs.get('payments/' + pays.p1).data.approvedAt, 10000);
  await a.evaluate(() => RT.sync.syncNow());
  await waitUntil(async () => /Aprobado por/.test(await txt(a, '#pd-body')), 10000);
  check(/Aprobado por dueno@sucre\.do/.test(await txt(a, '#pd-body')) && !(await a.$eval('[data-act="pay-status"][data-s="pagado"]', (x) => x.disabled)), 'en tu teléfono: «Aprobado por dueno@sucre.do» y ya se puede marcar pagado');
  await a.click('[data-act="pay-status"][data-s="pagado"]');
  await settle(a);
  check((await docsOf(a, 'payments')).find((p) => p.id === pays.p1).status === 'pagado', 'y se marca pagado');
  // Devolver con una nota
  await b.click('[data-act="back"]').catch(() => {});
  await b.evaluate(() => document.querySelector('.tabs [data-tab="pagos"]').click());
  await b.click(`[data-act="open-pay"][data-id="${pays.p2}"]`);
  await b.waitForSelector('[data-act="pay-return"]');
  await b.click('[data-act="pay-return"]');
  await b.fill('#pay-ret-note', 'Falta la copia firmada de la orden');
  await b.click('[data-act="pay-return-yes"]');
  await settle(b, 500);
  await b.evaluate(() => RT.sync.syncNow());
  await waitUntil(() => docs.get('payments/' + pays.p2) && docs.get('payments/' + pays.p2).data.status === 'armando', 10000);
  await a.evaluate(() => RT.sync.syncNow());
  await a.click('[data-act="back"]').catch(() => {});
  await a.click(`[data-act="open-pay"][data-id="${pays.p2}"]`);
  await waitUntil(async () => /lo devolvió/.test(await txt(a, '#pd-body')), 10000);
  check(/El dueño lo devolvió.*«Falta la copia firmada de la orden»/.test(await txt(a, '#pd-body')), 'devuelto: en tu teléfono sale la nota del dueño y el pago vuelve a «Por presentar»');

  // 4) Olvidé el PIN: con la contraseña de la nube se quita.
  await a.reload();
  await a.waitForSelector('#lock:not([hidden]) #lock-pin');
  await a.click('[data-act="pin-forgot"]');
  await a.fill('#lock-pass', 'clave-mala');
  await a.click('[data-act="pin-reset"]');
  await settle(a, 800);
  check(/no es la contraseña/.test(await txt(a, '#lock-msg')) && (await a.isVisible('#lock')), 'con una contraseña mala no se quita');
  await a.fill('#lock-pass', 'clave-yo-123');
  await a.click('[data-act="pin-reset"]');
  await a.waitForSelector('#lock', { state: 'hidden', timeout: 10000 });
  await a.reload();
  await a.waitForSelector('#f-list');
  await settle(a, 500);
  check(!(await a.isVisible('#lock')), 'con la contraseña de la nube se quita el PIN');

  console.log('problemas:', problems.length ? problems : 'ninguno');
  await browser.close();
  app.close(); nube.close();
  process.exit(problems.length ? 1 : 0);
})().catch((e) => { console.error(e); console.log('problemas:', problems); process.exit(1); });
