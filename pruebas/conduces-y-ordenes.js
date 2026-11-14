// Conduces enlazados a su orden de compra: solos (la única abierta del proveedor o la que mencionan), a mano desde el conduce o desde la orden, la orden con lo que llegó, la factura que toma la orden de sus conduces y el mensaje para pedir facturas.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = process.env.APP_ROOT || path.resolve(__dirname, '..');
const SP = process.env.PRUEBAS_TMP || path.join(require('os').tmpdir(), 'facturas-pruebas');
const OUT = path.join(SP, 'test-condorden');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const file = path.join(ROOT, decodeURIComponent(u.pathname.replace(/^\/facturas\//, '')) || 'index.html');
  if (!u.pathname.startsWith('/facturas/') || !file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  res.end(fs.readFileSync(file));
});
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
const problems = [];
const check = (cond, msg) => { console.log((cond ? 'OK   ' : 'FALLA') + ' ' + msg); if (!cond) problems.push(msg); };
const pdfText = (f) => execFileSync('pdftotext', ['-layout', f, '-']).toString();
const settle = (page, ms = 450) => page.waitForTimeout(ms);
const txt = async (page, sel) => ((await page.textContent(sel).catch(() => '')) || '').replace(/\s+/g, ' ').trim();
async function waitUntil(fn, ms = 20000, step = 250) { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) return v; await new Promise((r) => setTimeout(r, step)); } }
async function docs(page, coll) {
  return page.evaluate((c) => new Promise((r) => { const un = RT.db.collection(c).onSnapshot((s) => { un(); r(s.docs.map((d) => ({ id: d.id, ...d.data() }))); }); }), coll);
}
async function download(page, clickSel, name) {
  await page.click(clickSel);
  await page.waitForSelector('[data-act="ready-save"]', { timeout: 60000 });
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-act="ready-save"]')]);
  const f = path.join(OUT, name);
  await dl.saveAs(f);
  await page.click('.sheet-h [data-act="sheet-close"]');
  return f;
}
const inv = async (page, id) => (await docs(page, 'invoices')).find((i) => i.id === id);
const segN = async (page, f) => Number(await page.textContent(`#f-seg [data-f="${f}"] .n`));
const BLANK = { es_factura: true, tipo_documento: 'factura', proveedor: '', rnc_proveedor: '', ncf: '', ncf_vence: '', fecha: '', itbis: '', total: '', total_corregido: '', tachados: [], cambio_de: '', condicion_pago: '', moneda: 'DOP', concepto: '', proyecto: '', rnc_cliente: '104595114', referencia: '', conduces: '', conduce_numero: '', material: '', cantidad: '', viajes: '' };
const answers = [];
const pad = (n) => String(n).padStart(2, '0');
const dayIso = (off) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + off); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const condDoc = async (page, id) => (await docs(page, 'conduces')).find((c) => c.id === id);
const sheetTxt = (page) => txt(page, '.sheet');

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const BASE = `http://127.0.0.1:${server.address().port}/facturas/`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' && !/404|Failed to fetch|net::/.test(m.text())) problems.push('consola: ' + m.text()); });
  page.on('pageerror', (e) => problems.push('error de página: ' + e.message));
  await page.goto(BASE);
  await page.waitForSelector('.empty h2');
  const I = await page.evaluate(async (d) => {
    const db = RT.db;
    await db.doc('settings/general').set({ company: 'SUCRE B. LANTIGUA CONSTRUCTORA, S.R.L.', companyRnc: '104595114', preparedBy: 'A. Robles' });
    const m = db.collection('projects').doc(); await m.set({ name: 'Monaco', createdAt: '2026-08-02T10:00:00.000Z' });
    const e = db.collection('projects').doc(); await e.set({ name: 'Enzo', createdAt: '2026-08-01T10:00:00.000Z' });
    const ord = async (x) => { const r = db.collection('orders').doc(); await r.set({ requestedBy: 'Ing. Peña', department: 'Obra', place: '', notes: '', signedAt: x.date, createdAt: '2026-11-01T08:00:00.000Z', status: 'autorizada', ...x }); return r.id; };
    const o9 = await ord({ number: 9, date: d.m6, projectId: m.id, supplier: 'Agregados del Norte', items: [{ qty: 5, unit: 'm³', desc: 'Arena lavada', price: 2000 }] });
    const o10 = await ord({ number: 10, date: d.m5, projectId: e.id, supplier: 'Ferretería Ochoa', items: [{ qty: 20, unit: 'Funda', desc: 'Cemento gris', price: 600 }] });
    const o11 = await ord({ number: 11, date: d.m5, projectId: m.id, supplier: 'Bloques del Cibao', items: [{ qty: 300, unit: 'Unidad', desc: 'Block de 6' }] });
    const o12 = await ord({ number: 12, date: d.m4, projectId: m.id, supplier: 'Bloques del Cibao', items: [{ qty: 200, unit: 'Unidad', desc: 'Block de 6' }] });
    const cbase = { invoiceId: null, projectHint: '', rnc: '', currency: 'DOP', trips: null, fileId: null, fileType: 'image/jpeg', thumbId: null, pages: 1, fileName: '', ai: 'off', aiErr: '', auto: false };
    const cond = async (x) => { const r = db.collection('conduces').doc(); await r.set({ ...cbase, ...x }); return r.id; };
    const c1 = await cond({ number: '501', date: d.m3, supplier: 'Agregados del Norte', projectId: m.id, material: 'Arena lavada', qty: '3 m³', total: 6000, createdAt: '2026-11-11T13:00:00.000Z' });
    const c2 = await cond({ number: '502', date: d.m2, supplier: 'Agregados del Norte', projectId: m.id, material: 'Arena lavada', qty: '4 m³', total: 8000, createdAt: '2026-11-12T13:00:00.000Z' });
    const c3 = await cond({ number: '777', date: d.m2, supplier: 'Plomería Central', projectId: e.id, material: 'Tubos', qty: '10', total: 1500, createdAt: '2026-11-12T14:00:00.000Z' });
    const c4 = await cond({ number: '900', date: d.m1, supplier: 'Bloques del Cibao', projectId: m.id, material: 'Block de 6', qty: '200', total: 9000, orderRef: 'OC-0012', ai: 'done', createdAt: '2026-11-13T14:00:00.000Z' });
    return { m: m.id, e: e.id, o9, o10, o11, o12, c1, c2, c3, c4 };
  }, { m1: dayIso(-1), m2: dayIso(-2), m3: dayIso(-3), m4: dayIso(-4), m5: dayIso(-5), m6: dayIso(-6) });
  await page.reload();
  await page.waitForSelector('#todo, #f-list', { state: 'attached' });
  await page.click('[data-act="backup-later"]').catch(() => {});

  // 1) Los conduces se enlazan solos a su orden: la única abierta del proveedor, o la que el conduce menciona.
  await waitUntil(async () => { const cs = await docs(page, 'conduces'); return cs.filter((c) => c.orderId).length >= 3; }, 15000);
  let cs = await docs(page, 'conduces');
  const cOf = (id) => cs.find((c) => c.id === id);
  check(cOf(I.c1).orderId === I.o9 && cOf(I.c1).orderAuto === true && cOf(I.c1).orderWhy === 'unica' && cOf(I.c2).orderId === I.o9, 'los conduces de Agregados del Norte se enlazan solos a la OC-0009 (la única abierta de ese proveedor)');
  check(cOf(I.c4).orderId === I.o12 && cOf(I.c4).orderWhy === 'numero', 'el conduce que menciona la OC-0012 se enlaza a esa (aunque el proveedor tenga dos órdenes abiertas)');
  check(!cOf(I.c3).orderId, 'el conduce de un proveedor sin orden queda sin orden');

  // 2) El conduce muestra su orden, por qué se enlazó y lo que pidió la orden.
  await page.click('[data-act="tab"][data-tab="conduces"]');
  await page.click('#c-seg [data-f="todos"]');
  await page.waitForSelector(`#c-list button[data-act="open-cond"][data-id="${I.c1}"]`);
  const tbl = await txt(page, '#c-list');
  check(/Orden/.test(await txt(page, '#c-list thead')) && /OC-0009/.test(tbl) && /OC-0012/.test(tbl), 'en la computadora, la tabla de conduces tiene la columna «Orden»');
  await page.fill('#c-search', 'OC-0012');
  await settle(page, 400);
  check(/900/.test(await txt(page, '#c-list')) && !/501/.test(await txt(page, '#c-list')), 'se puede buscar un conduce por su orden');
  await page.fill('#c-search', '');
  await settle(page, 400);
  await page.click(`#c-list button[data-act="open-cond"][data-id="${I.c1}"]`);
  await page.waitForSelector('#c-ord');
  check(await page.inputValue('#c-ord') === I.o9, 'el conduce tiene su campo «Orden de compra» con la OC-0009');
  check(/Se enlazó solo a la orden OC-0009: es la única orden abierta de este proveedor/.test(await sheetTxt(page)) && /Arena lavada/.test(await txt(page, '#c-oprev')), 'dice por qué se enlazó y muestra lo que pidió la orden');
  await page.screenshot({ path: path.join(OUT, 'conduce.png') });
  await page.click('.sheet-h [data-act="sheet-close"]');

  // 3) La orden muestra sus conduces (lo que ya llegó) y avisa si llegó más de lo pedido.
  await page.click('[data-act="tab"][data-tab="ordenes"]');
  await page.click('#o-seg [data-f="todas"]');
  await page.waitForSelector(`#o-list [data-act="open-order"][data-id="${I.o9}"]`);
  await page.click(`#o-list button[data-act="open-order"][data-id="${I.o9}"]`);
  await page.waitForSelector('#o-conds');
  const oc = await txt(page, '#o-conds');
  console.log('     orden:', oc);
  check(/Conduces de esta orden/.test(oc) && /Conduce 501/.test(oc) && /Conduce 502/.test(oc) && /2 conduces · RD\$ ?14,000\.00 · 2 esperan su factura/.test(oc), 'la orden lista sus conduces con lo que suman y cuántos esperan factura');
  check(/Los conduces traen 7 m³ de Arena lavada y la orden pidió 5/.test(await sheetTxt(page)), 'la orden avisa que los conduces trajeron más de lo pedido (sin esperar la factura)');
  await page.screenshot({ path: path.join(OUT, 'orden.png') });
  await page.click('.sheet-h [data-act="sheet-close"]');

  // 4) Elegir la orden a mano en el conduce, con la vista previa; quitarla a mano no se deshace sola.
  await page.click('[data-act="tab"][data-tab="conduces"]');
  await page.click(`#c-list button[data-act="open-cond"][data-id="${I.c3}"]`);
  await page.waitForSelector('#c-ord');
  check(await page.inputValue('#c-ord') === '', 'el conduce sin orden dice «Sin orden»');
  await page.selectOption('#c-ord', I.o10);
  await waitUntil(async () => /Cemento gris/.test(await txt(page, '#c-oprev')), 3000);
  check(/OC-0010/.test(await txt(page, '#c-oprev')) && /Cemento gris/.test(await txt(page, '#c-oprev')), 'al elegir la orden, se ve lo que pidió');
  await page.click('#cond-save');
  await page.waitForSelector('#cond-form', { state: 'detached' });
  let c3 = await waitUntil(async () => { const c = await condDoc(page, I.c3); return c.orderId === I.o10 ? c : null; }, 5000);
  check(c3 && c3.orderAuto === false, 'el conduce queda enlazado a la orden elegida a mano');

  // 5) Pedir las facturas: cada orden con sus conduces.
  await page.click('[data-act="tab"][data-tab="ordenes"]');
  await page.click('#o-seg [data-f="sinfactura"]');
  await page.waitForSelector('[data-act="ask-inv"]');
  const askBtns = await page.$$('[data-act="ask-inv"]');
  let askText = '';
  for (const b of askBtns) {
    await b.click();
    await page.waitForSelector('#ask-text');
    const t = await page.inputValue('#ask-text');
    await page.click('.sheet-h [data-act="sheet-close"]');
    if (/Ferretería Ochoa|OC-0010/.test(t)) askText = t;
  }
  console.log('     mensaje:', JSON.stringify(askText));
  check(/OC-0010 .*\(conduce 777\)/.test(askText), 'el mensaje para pedir la factura dice qué conduces de esa orden ya llegaron');

  // 6) Desde la orden: enlazar un conduce y quitarlo.
  await page.click('#o-seg [data-f="todas"]');
  await page.click(`#o-list button[data-act="open-order"][data-id="${I.o10}"]`);
  await page.waitForSelector('#o-conds');
  check(/Conduce 777/.test(await txt(page, '#o-conds')), 'la orden muestra el conduce enlazado a mano');
  await page.click(`#o-conds [data-act="order-unlink-cond"][data-id="${I.c3}"]`);
  await waitUntil(async () => !(await condDoc(page, I.c3)).orderId, 5000);
  c3 = await condDoc(page, I.c3);
  check(!c3.orderId && c3.noOrderAuto === true, '«Quitar» saca el conduce de la orden');
  await waitUntil(async () => !!(await page.$('#o-conds [data-act="order-link-cond-open"]')), 5000);
  await page.click('#o-conds [data-act="order-link-cond-open"]');
  await page.waitForSelector(`#o-cond-box [data-act="order-link-cond"][data-id="${I.c3}"]`);
  await page.click(`#o-cond-box [data-act="order-link-cond"][data-id="${I.c3}"]`);
  await waitUntil(async () => (await condDoc(page, I.c3)).orderId === I.o10, 5000);
  check((await condDoc(page, I.c3)).orderId === I.o10, '«Enlazar un conduce» desde la orden lo enlaza');
  await waitUntil(async () => /Conduce 777/.test(await txt(page, '#o-conds')), 5000);
  check(/Conduce 777/.test(await txt(page, '#o-conds')), 'la lista de conduces de la orden se actualiza');
  await page.click('.sheet-h [data-act="sheet-close"]');

  // 7) Llega la factura: se le adjuntan sus conduces y toma la orden de ellos.
  const invId = await page.evaluate(async (x) => {
    const r = RT.db.collection('invoices').doc();
    await r.set({ projectId: x.m, supplier: 'Agregados del Norte', rnc: '131777888', number: 'B0100000301', date: x.d, amount: 14000, itbis: 0, currency: 'DOP', concept: 'Arena', ref: '', buyerRnc: '104595114', notInvoice: false, fileId: null, ai: 'off', conduceRefs: ['501', '502'], createdAt: new Date().toISOString() });
    return r.id;
  }, { m: I.m, d: dayIso(-1) });
  await page.reload();
  await page.waitForSelector('#f-list [data-act="open-inv"]');
  const inv = await waitUntil(async () => { const i = (await docs(page, 'invoices')).find((x) => x.id === invId); return i && i.orderId ? i : null; }, 15000);
  cs = await docs(page, 'conduces');
  check(cOf(I.c1).invoiceId === invId && cOf(I.c2).invoiceId === invId, 'los conduces se adjuntan a la factura que los menciona');
  check(inv && inv.orderId === I.o9 && inv.orderAuto === true && inv.orderWhy === 'conduce', 'la factura toma sola la orden de sus conduces');
  await page.click(`#f-list [data-act="open-inv"][data-id="${invId}"]`);
  await page.waitForSelector('#inv-form, .sheet');
  await settle(page, 400);
  check(/Se enlazó sola a la orden OC-0009: sus conduces son de esa orden/.test(await sheetTxt(page)), 'la factura dice que tomó la orden de sus conduces');
  await page.click('.sheet-h [data-act="sheet-close"]');

  // 8) Si se le quita la orden a la factura a mano, no se la vuelve a poner sola.
  await page.click('[data-act="tab"][data-tab="ordenes"]');
  await page.click('#o-seg [data-f="todas"]');
  await page.click(`#o-list button[data-act="open-order"][data-id="${I.o9}"]`);
  await page.waitForSelector(`[data-act="order-unlink-inv"][data-id="${invId}"]`);
  await page.click(`[data-act="order-unlink-inv"][data-id="${invId}"]`);
  await waitUntil(async () => !((await docs(page, 'invoices')).find((x) => x.id === invId) || {}).orderId, 5000);
  await page.reload();
  await page.waitForSelector('#f-list, #o-list', { state: 'attached' });
  await page.waitForTimeout(4500);
  const inv2 = (await docs(page, 'invoices')).find((x) => x.id === invId);
  check(!inv2.orderId && inv2.orderOff === true, 'quitada a mano, la factura no vuelve a tomar la orden sola');

  // 9) En el teléfono: la tarjeta de la orden dice cuántos conduces llegaron.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.waitForSelector('#f-list', { state: 'attached' });
  await page.evaluate(() => { const b = document.querySelector('[data-act="tab"][data-tab="ordenes"]'); if (b) b.click(); });
  await page.waitForSelector(`#o-list [data-act="open-order"][data-id="${I.o12}"]`, { timeout: 10000 }).catch(() => {});
  await page.click('#o-seg [data-f="todas"]').catch(() => {});
  await settle(page, 400);
  const cards = await txt(page, '#o-list');
  check(/llegó 1 conduce/.test(cards) && /llegó 2 conduces/.test(cards), 'en el teléfono, la tarjeta de la orden dice cuántos conduces llegaron');
  await page.evaluate(() => { const b = document.querySelector('[data-act="tab"][data-tab="conduces"]'); if (b) b.click(); });
  await page.click('#c-seg [data-f="todos"]');
  await settle(page, 400);
  check(/Orden OC-0012/.test(await txt(page, '#c-list')), 'en el teléfono, cada conduce dice su orden');
  await page.screenshot({ path: path.join(OUT, 'conduces-tel.png') });

  console.log('problemas:', problems.length ? problems : 'ninguno');
  await browser.close();
  server.close();
  process.exit(problems.length ? 1 : 0);
})().catch((e) => { console.error(e); console.log('problemas:', problems); process.exit(1); });
