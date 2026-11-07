// Proteger los datos: papelera (Deshacer, recuperar, se vacía a los 30 días), respaldo automático en la nube
// (y restaurarlo en todos los aparatos), el indicador de la nube, el aviso cuando Supabase la pausa y el
// recordatorio mensual del respaldo en archivo aunque haya nube.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = process.env.APP_ROOT || path.resolve(__dirname, '..');
const SP = process.env.PRUEBAS_TMP || path.join(require('os').tmpdir(), 'facturas-pruebas');
const OUT = path.join(SP, 'test-respaldo');
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
const USERS = { 'yo@sucre.do': 'clave-yo-123' };
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

(async () => {
  await new Promise((r) => app.listen(0, '127.0.0.1', r));
  await new Promise((r) => nube.listen(0, '127.0.0.1', r));
  const BASE = `http://127.0.0.1:${app.address().port}/facturas/`;
  const NUBE = `http://127.0.0.1:${nube.address().port}`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' && !/404|540|Failed to fetch|net::|Failed to load resource/.test(m.text())) problems.push('consola: ' + m.text()); });
  page.on('pageerror', (e) => problems.push('error de página: ' + e.message));
  await page.goto(BASE);
  await page.waitForSelector('.empty h2');
  const ids = await page.evaluate(async () => {
    await RT.db.doc('settings/general').set({ company: 'SUCRE B. LANTIGUA CONSTRUCTORA, S.R.L.', companyRnc: '104595114' });
    const p = RT.db.collection('projects').doc(); await p.set({ name: 'Caperuza 2', createdAt: '2026-09-01T10:00:00.000Z' });
    const up = await RT.assets.upload(new Blob([new Uint8Array([255, 216, 255, 224, 0, 16, 74, 70, 73, 70])], { type: 'image/jpeg' }));
    const base = { projectId: p.id, concept: '', ref: '', buyerRnc: '104595114', qrUrl: '', fiscal: '', notInvoice: false, noOrder: true, thumbId: null, pages: 1, xmlId: null, ai: 'off', currency: 'DOP', createdAt: '2026-11-05T13:00:00.000Z' };
    const a = RT.db.collection('invoices').doc(); await a.set({ ...base, supplier: 'Transporte y Agregados S. López', rnc: '130999998', number: 'B0100000777', date: '2026-11-05', amount: 8000, itbis: 0, fileId: up.id, fileType: 'image/jpeg', fileName: 'lopez.jpg' });
    const b = RT.db.collection('invoices').doc(); await b.set({ ...base, supplier: 'Bloques del Cibao', rnc: '131555777', number: 'B0100000888', date: '2026-11-06', amount: 4720, itbis: 720, fileId: null, fileType: 'image/jpeg', fileName: 'b.jpg' });
    const c = RT.db.collection('invoices').doc(); await c.set({ ...base, supplier: 'Ferretería Ochoa', rnc: '131023452', number: 'B0100000502', date: '2026-11-02', amount: 1000, itbis: 152.54, fileId: null, fileType: 'image/jpeg', fileName: 'c.jpg' });
    const cd = RT.db.collection('conduces').doc(); await cd.set({ invoiceId: a.id, projectId: p.id, projectHint: '', supplier: 'Transporte y Agregados S. López', rnc: '130999998', number: '39807', date: '2026-11-04', total: 8000, currency: 'DOP', material: 'Grava', qty: '5 m³', trips: 1, fileId: null, fileType: 'image/jpeg', thumbId: null, pages: 1, fileName: 'c.jpg', ai: 'off', aiErr: '', auto: false, createdAt: '2026-11-04T12:00:00.000Z' });
    const o = RT.db.collection('orders').doc(); await o.set({ number: 7, status: 'borrador', supplier: 'Electricidad Martínez', projectId: p.id, date: '2026-11-06', items: [{ qty: '20', unit: 'rollos', desc: 'Alambre #12' }], createdAt: '2026-11-06T10:00:00.000Z' });
    const pay = RT.db.collection('payments').doc(); await pay.set({ name: 'Pago semana 45', date: '2026-11-06', status: 'armando', invoiceIds: [b.id], createdAt: '2026-11-06T10:00:00.000Z' });
    return { a: a.id, b: b.id, c: c.id, cd: cd.id, o: o.id, pay: pay.id, file: up.id };
  });
  await page.reload();
  await page.waitForSelector('#f-list [data-act="open-inv"]');
  await page.click('[data-act="backup-later"]').catch(() => {});
  await page.click('[data-act="filter"][data-f="todas"]').catch(() => {});
  await settle(page);

  // 1) Borrar una factura: va a la papelera y «Deshacer» la trae con su conduce.
  const delInvoice = async (id) => {
    await page.click(`#f-list [data-act="open-inv"][data-id="${id}"]`);
    await page.waitForSelector('#inv-form');
    await page.click('[data-act="inv-del"]');
    check(/Se va a la papelera/.test(await txt(page, '#inv-del-box')), 'al eliminar, avisa que se va a la papelera');
    await page.click('[data-act="inv-del-yes"]');
    await page.waitForSelector('#sheet-root', { state: 'hidden' });
  };
  await delInvoice(ids.a);
  await settle(page);
  let inv = await docsOf(page, 'invoices'), trash = await docsOf(page, 'papelera'), conds = await docsOf(page, 'conduces');
  check(!inv.some((i) => i.id === ids.a) && trash.length === 1 && trash[0].kind === 'invoice' && trash[0].srcId === ids.a && trash[0].extra.condIds.includes(ids.cd) && !conds[0].invoiceId, 'la factura sale de la lista y queda en la papelera (con su conduce anotado)');
  check(/Factura movida a la papelera/.test(await txt(page, '#toast')) && !!(await page.$('#toast .toast-act')), 'avisa «Factura movida a la papelera» con «Deshacer»');
  check(!!(await page.evaluate((f) => RT.assets.get(f).then((b) => !!b), ids.file)), 'sus archivos se quedan mientras esté en la papelera');
  await page.screenshot({ path: path.join(OUT, 'deshacer.png') });
  await page.click('#toast .toast-act');
  await waitUntil(async () => (await docsOf(page, 'invoices')).some((i) => i.id === ids.a), 5000);
  inv = await docsOf(page, 'invoices'); trash = await docsOf(page, 'papelera'); conds = await docsOf(page, 'conduces');
  check(inv.some((i) => i.id === ids.a && i.supplier === 'Transporte y Agregados S. López') && trash.length === 0 && conds[0].invoiceId === ids.a, '«Deshacer» la trae de vuelta con su conduce, y la papelera queda vacía');

  // 2) La papelera en Ajustes: recuperar.
  await delInvoice(ids.c);
  await settle(page);
  await page.click('#settings-btn');
  await page.waitForSelector('[data-act="trash-open"]');
  check(/Papelera \(1\)/.test(await txt(page, '[data-act="trash-open"]')), 'Ajustes: «Papelera (1)»');
  await page.click('[data-act="trash-open"]');
  await page.waitForSelector('.trash-row');
  const tr = await txt(page, '.trash-row');
  check(/Factura · Ferretería Ochoa · NCF B0100000502 · RD\$1,000\.00/.test(tr) && /se elimina para siempre en 30 días/.test(tr), 'la papelera dice qué es y cuántos días le quedan');
  await page.screenshot({ path: path.join(OUT, 'papelera.png') });
  await page.click('[data-act="trash-restore"]');
  await waitUntil(async () => (await docsOf(page, 'invoices')).some((i) => i.id === ids.c), 5000);
  check((await docsOf(page, 'invoices')).some((i) => i.id === ids.c) && (await docsOf(page, 'papelera')).length === 0, '«Recuperar» la trae de vuelta');
  await closeSheet(page);

  // 3) Órdenes y pagos también van a la papelera.
  await page.evaluate(() => document.querySelector('[data-tab="ordenes"]').click());
  await page.click(`[data-act="open-order"][data-id="${ids.o}"]`);
  await page.waitForSelector('[data-act="order-del"]');
  await page.click('[data-act="order-del"]');
  await page.click('[data-act="order-del-yes"]');
  await waitUntil(async () => !(await docsOf(page, 'orders')).length, 5000);
  check(/Orden movida a la papelera/.test(await txt(page, '#toast')), 'la orden va a la papelera');
  await page.click('#toast .toast-act');
  await waitUntil(async () => (await docsOf(page, 'orders')).length === 1, 5000);
  check((await docsOf(page, 'orders')).length === 1, '«Deshacer» trae la orden');
  await page.evaluate(() => document.querySelector('[data-tab="pagos"]').click());
  await page.click(`[data-act="open-pay"][data-id="${ids.pay}"]`);
  await page.waitForSelector('[data-act="pay-del"]');
  await page.click('[data-act="pay-del"]');
  await page.click('[data-act="pay-del-yes"]');
  await waitUntil(async () => !(await docsOf(page, 'payments')).length, 5000);
  await page.click('#toast .toast-act');
  await waitUntil(async () => (await docsOf(page, 'payments')).length === 1, 5000);
  const pays = await docsOf(page, 'payments');
  check(pays.length === 1 && pays[0].invoiceIds.join() === ids.b, 'el pago va a la papelera y vuelve con su factura');

  // 4) Pasados 30 días, se elimina para siempre (con sus archivos).
  await page.evaluate(() => document.querySelector('[data-tab="facturas"]').click());
  await delInvoice(ids.a);
  await settle(page);
  await page.evaluate(async () => { const s = await new Promise((r) => { const un = RT.db.collection('papelera').onSnapshot((x) => { un(); r(x.docs); }); }); for (const d of s) await RT.db.doc('papelera/' + d.id).update({ deletedAt: new Date(Date.now() - 31 * 864e5).toISOString() }); });
  await page.reload();
  await page.waitForSelector('#f-list');
  await waitUntil(async () => !(await docsOf(page, 'papelera')).length, 8000);
  check(!(await docsOf(page, 'papelera')).length && !(await page.evaluate((f) => RT.assets.get(f).then((b) => !!b), ids.file)), 'a los 30 días se elimina para siempre, con sus archivos');

  // 5) La nube: se conecta, el indicador dice «Al día» y se hace el primer respaldo automático.
  await page.click('#settings-btn');
  await page.waitForSelector('#nb-code');
  await page.fill('#nb-code', NUBE);
  await page.fill('#nb-key', KEY);
  await page.fill('#nb-email', 'yo@sucre.do');
  await page.fill('#nb-pass', 'clave-yo-123');
  await page.click('[data-act="nube-connect"]');
  await waitUntil(async () => /Al día/.test(await txt(page, '#nb-status')), 20000);
  await closeSheet(page);
  await waitUntil(async () => /Al día/.test(await txt(page, '#sync-chip')), 10000);
  check(/Al día/.test(await txt(page, '#sync-chip')) && !(await page.$eval('#sync-chip', (e) => e.hidden)), 'arriba, el indicador dice «Al día»');
  await waitUntil(() => [...files.keys()].some((k) => /^respaldos\/semana-\d\.json$/.test(k)), 15000);
  const bkKey = [...files.keys()].find((k) => /^respaldos\/semana-\d\.json$/.test(k));
  const bk = bkKey ? JSON.parse(files.get(bkKey).buf.toString()) : null;
  check(bk && bk.docs.some((d) => d.path === 'invoices/' + ids.b) && bk.docs.some((d) => d.path === 'invoices/' + ids.c), 'se hizo solo el primer respaldo en la nube, con las facturas (' + bkKey + ')');
  await waitUntil(async () => !!(await page.evaluate(async () => (await RT.db.doc('settings/respaldos').get()).data())), 8000);
  await page.screenshot({ path: path.join(OUT, 'indicador.png') });

  // 6) Algo se borra por error después del respaldo; se restaura el respaldo y vuelve, en la nube también.
  await page.evaluate(async (id) => { await RT.db.doc('invoices/' + id).update({ amount: 999 }); }, ids.b);
  await delInvoice(ids.c);
  await settle(page, 800);
  await page.evaluate(() => RT.sync.syncNow());
  await waitUntil(() => docs.get('invoices/' + ids.c) && docs.get('invoices/' + ids.c).deleted, 8000);
  check(docs.get('invoices/' + ids.c).deleted === true, 'el borrado llegó a la nube (así pasa en todos los aparatos)');
  await page.click('#settings-btn');
  await page.waitForSelector('[data-act="cloud-bk"]');
  check(/Respaldo automático en la nube/.test(await txt(page, '#sheet-root')) && /El último es del/.test(await txt(page, '#sheet-root')), 'Ajustes dice cuándo fue el último respaldo en la nube');
  await page.click('[data-act="cloud-bk"]');
  await page.waitForSelector('[data-act="cloud-bk-restore"]');
  check((await page.$$('[data-act="cloud-bk-restore"]')).length === 1 && /Semana del/.test(await txt(page, '#sheet-root')), 'la lista muestra el respaldo de la semana');
  await page.click('[data-act="cloud-bk-restore"]');
  await page.waitForSelector('#cbk-confirm .confirm');
  check(/tiene 2 facturas/.test(await txt(page, '#cbk-confirm')) && /todo vuelve a como estaba ese día/.test(await txt(page, '#cbk-confirm')), 'antes de restaurar, dice qué tiene y que todo vuelve a ese día');
  await page.screenshot({ path: path.join(OUT, 'restaurar.png') });
  await page.click('[data-act="cloud-bk-yes"]');
  await page.waitForSelector('#sheet-root', { state: 'hidden', timeout: 15000 });
  await settle(page, 600);
  inv = await docsOf(page, 'invoices');
  check(inv.some((i) => i.id === ids.c) && inv.find((i) => i.id === ids.b).amount === 4720 && !(await docsOf(page, 'papelera')).length, 'restaurado: la factura borrada volvió y el monto cambiado volvió a como estaba');
  await page.evaluate(() => RT.sync.syncNow());
  await waitUntil(() => docs.get('invoices/' + ids.c) && !docs.get('invoices/' + ids.c).deleted && docs.get('invoices/' + ids.b).data.amount === 4720, 10000);
  check(!docs.get('invoices/' + ids.c).deleted && docs.get('invoices/' + ids.b).data.amount === 4720 && [...docs.values()].filter((d) => d.path.startsWith('papelera/')).every((d) => d.deleted), 'en la nube también quedó como en el respaldo (para los otros aparatos)');
  check(files.has('respaldos/antes-de-restaurar.json'), 'antes de restaurar se guardó cómo estaba, por si acaso');

  // 7) Supabase pausa la nube: el indicador y el aviso lo dicen claro; al volver, se pone al día.
  paused = true;
  await page.evaluate(async (id) => { await RT.db.doc('invoices/' + id).update({ concept: 'cambio sin nube' }); }, ids.b);
  await page.evaluate(() => RT.sync.syncNow());
  await waitUntil(async () => /En pausa/.test(await txt(page, '#sync-chip')), 8000);
  check(/En pausa/.test(await txt(page, '#sync-chip')) && /La nube está en pausa/.test(await txt(page, '#banner')) && /supabase\.com/.test(await txt(page, '#banner')) && /Restore/.test(await txt(page, '#banner')), 'en pausa: el indicador y el aviso dicen qué hacer (entrar a supabase.com y tocar Restore)');
  await page.screenshot({ path: path.join(OUT, 'pausa.png') });
  paused = false;
  await page.click('#banner [data-act="nube-sync"]');
  await waitUntil(async () => /Al día/.test(await txt(page, '#sync-chip')), 10000);
  check(/Al día/.test(await txt(page, '#sync-chip')) && !/en pausa/.test(await txt(page, '#banner')) && docs.get('invoices/' + ids.b).data.concept === 'cambio sin nube', 'al volver: «Al día» y el cambio que esperaba subió');

  // 8) Con la nube, el respaldo en archivo se recuerda cada mes.
  await page.evaluate(() => { localStorage.setItem('facturas.lastBackup', String(Date.now() - 31 * 864e5)); localStorage.removeItem('facturas.backupSnooze'); });
  await page.reload();
  await page.waitForSelector('#f-list');
  await settle(page, 800);
  check(/La nube copia también lo que se borra/.test(await txt(page, '#banner')), 'con la nube, si pasó un mes sin respaldo en archivo, lo recuerda');
  await page.evaluate(() => localStorage.setItem('facturas.lastBackup', String(Date.now() - 10 * 864e5)));
  await page.reload();
  await page.waitForSelector('#f-list');
  await settle(page, 800);
  check(!/Haz un respaldo/.test(await txt(page, '#banner')), 'con un respaldo de hace 10 días, no molesta');

  console.log('problemas:', problems.length ? problems : 'ninguno');
  await browser.close();
  app.close(); nube.close();
  process.exit(problems.length ? 1 : 0);
})().catch((e) => { console.error(e); console.log('problemas:', problems); process.exit(1); });
