// Una factura con varias órdenes de compra: pedidos separados que la ferretería mandó juntos en una sola factura.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = process.env.APP_ROOT || path.resolve(__dirname, '..');
const SP = process.env.PRUEBAS_TMP || path.join(require('os').tmpdir(), 'facturas-pruebas');
const OUT = path.join(SP, 'test-variasordenes');
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
const BLANK = { es_factura: true, tipo_documento: 'factura', proveedor: '', rnc_proveedor: '', ncf: '', ncf_vence: '', fecha: '', itbis: '', total: '', total_corregido: '', tachados: [], cambio_de: '', condicion_pago: '', moneda: 'DOP', concepto: '', proyecto: '', rnc_cliente: '104595114', referencia: '', conduces: '', conduce_numero: '', material: '', cantidad: '', viajes: '' };
const answers = [];

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const BASE = `http://127.0.0.1:${server.address().port}/facturas/`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, acceptDownloads: true });
  await ctx.route('https://api.anthropic.com/**', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const body = JSON.parse(route.request().postData() || '{}');
    const ans = answers.length ? answers.shift() : { ok: true };
    route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify({ id: 'msg', type: 'message', role: 'assistant', model: body.model, content: [{ type: 'text', text: JSON.stringify(ans) }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 10, output_tokens: 10 } }) });
  });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' && !/404|Failed to fetch|net::/.test(m.text())) problems.push('consola: ' + m.text()); });
  page.on('pageerror', (e) => problems.push('error de página: ' + e.message));
  await page.goto(BASE);
  await page.waitForSelector('.empty h2');
  const I = await page.evaluate(async () => {
    await RT.db.doc('settings/general').set({ company: 'SUCRE B. LANTIGUA CONSTRUCTORA, S.R.L.', companyRnc: '104595114', preparedBy: 'A. Robles' });
    const p = RT.db.collection('projects').doc(); await p.set({ name: 'Caperuza 2', createdAt: '2026-09-01T10:00:00.000Z' });
    const ob = { date: '2026-11-05', projectId: p.id, supplier: 'Ferretería Ochoa', status: 'autorizada', createdAt: '2026-11-05T10:00:00.000Z' };
    const o1 = RT.db.collection('orders').doc(); await o1.set({ ...ob, number: 1, items: [{ qty: 10, unit: 'Saco', desc: 'Cemento gris', price: 600 }] });
    const o2 = RT.db.collection('orders').doc(); await o2.set({ ...ob, number: 2, items: [{ qty: 20, unit: 'Varilla', desc: 'Varilla de 3/8', price: 350 }] });
    const o3 = RT.db.collection('orders').doc(); await o3.set({ ...ob, number: 3, items: [{ qty: 5, unit: 'Galón', desc: 'Pintura blanca', price: 900 }] });
    const r = RT.db.collection('invoices').doc();
    await r.set({ projectId: p.id, supplier: 'Ferretería Ochoa', rnc: '131023452', number: 'B0100000301', date: '2026-11-12', amount: 13000, itbis: 0, currency: 'DOP', concept: 'Materiales', buyerRnc: '104595114', orderId: o1.id, orderAuto: false, ai: 'off', fileId: null, createdAt: '2026-11-12T10:00:00.000Z' });
    return { proj: p.id, o1: o1.id, o2: o2.id, o3: o3.id, inv: r.id };
  });
  await page.reload();
  await page.waitForSelector('#f-list [data-act="open-inv"]');
  await page.click('[data-act="backup-later"]').catch(() => {});

  // 1) Con una sola orden, la factura pasa lo estimado.
  await page.click(`#f-list [data-act="open-inv"][data-id="${I.inv}"]`);
  await page.waitForSelector('#inv-more-orders');
  check(/La factura OC-0001 cobra RD\$13,000\.00 sin ITBIS y la orden estimó RD\$6,000\.00/.test(await txt(page, '#sheet-root .sheet')) && /La ferretería mandó juntos otros pedidos/.test(await txt(page, '#inv-more-orders')), 'con una orden, avisa que pasa lo estimado y ofrece agregar otras órdenes');
  const opts = await page.$$eval('#mo-add option', (os) => os.map((o) => o.textContent));
  check(opts.some((t) => /OC-0002/.test(t)) && opts.some((t) => /OC-0003/.test(t)) && !opts.some((t) => /OC-0001/.test(t)), 'ofrece las otras órdenes abiertas del proveedor (no la que ya tiene)');

  // 2) Se agrega la otra orden: las dos quedan con esta factura y lo estimado cuadra.
  await page.selectOption('#mo-add', I.o2);
  await page.click('[data-act="mo-add"]');
  await settle(page, 600);
  let x = await inv(page, I.inv);
  check(x.orderId === I.o1 && JSON.stringify(x.moreOrders) === JSON.stringify([I.o2]) && x.hist.some((h) => /Se le agregó la orden OC-0002/.test(h.what)), 'la factura queda con OC-0001 y OC-0002 (y en el historial)');
  check(/Otras órdenes que vinieron en esta factura/.test(await txt(page, '#inv-more-orders')) && /Las 2 órdenes suman RD\$13,000\.00 estimado/.test(await txt(page, '#inv-more-orders')), 'muestra las otras órdenes y que suman lo mismo que la factura');
  await page.click('.sheet-h [data-act="sheet-close"]');
  await settle(page, 300);
  const card = await txt(page, `#f-list [data-id="${I.inv}"]`);
  check(/OC-0001/.test(card) && /OC-0002/.test(card) && !/Pasa lo estimado/.test(card), 'en la lista lleva las dos órdenes y ya no pasa lo estimado');

  // 3) En Órdenes, la OC-0002 ya tiene su factura.
  await page.click('[data-tab="ordenes"]');
  await page.click(`[data-act="open-order"][data-id="${I.o2}"]`);
  await page.waitForSelector('#o-invs');
  check(/B0100000301/.test(await txt(page, '#o-invs')), 'la orden OC-0002 muestra la factura');
  await page.click('.sheet-h [data-act="sheet-close"]');

  // 4) Quitar la principal desde su orden: la otra pasa a ser la principal.
  await page.click(`[data-act="open-order"][data-id="${I.o1}"]`);
  await page.waitForSelector('#o-invs [data-act="order-unlink-inv"]');
  await page.click('#o-invs [data-act="order-unlink-inv"]');
  await settle(page, 600);
  x = await inv(page, I.inv);
  check(x.orderId === I.o2 && (x.moreOrders || []).length === 0, 'quitada la OC-0001, la factura sigue con la OC-0002');
  // Y desde otra orden se agrega a la misma factura.
  await page.click('[data-act="order-link-open"]');
  await page.waitForSelector('#o-link-results [data-act="order-link-inv"]');
  await page.click(`#o-link-results [data-act="order-link-inv"][data-id="${I.inv}"]`);
  await settle(page, 600);
  x = await inv(page, I.inv);
  check(x.orderId === I.o2 && JSON.stringify(x.moreOrders) === JSON.stringify([I.o1]), 'desde la orden se enlaza una factura que ya tenía otra orden: se agrega, no la reemplaza');
  await page.click('.sheet-h [data-act="sheet-close"]');

  // 5) La lectura: si la factura menciona varias órdenes, se enlazan todas.
  await page.click('[data-tab="facturas"]');
  await page.click('#settings-btn');
  await page.fill('#st-key', 'sk-ant-prueba');
  await page.click('#settings-form button[type="submit"]');
  await page.waitForSelector('#settings-form', { state: 'detached' });
  const foto = path.join(OUT, 'factura.png');
  await page.screenshot({ path: foto });
  answers.push({ ...BLANK, proveedor: 'Ferretería Ochoa', rnc_proveedor: '131023452', ncf: 'B0100000302', fecha: '2026-11-13', total: '4,500.00', proyecto: 'Caperuza 2', referencia: 'OC-0003 y OC-0001' });
  await page.setInputFiles('#file-input', foto);
  const e = await waitUntil(async () => (await docs(page, 'invoices')).find((i) => i.fileName === 'factura.png' && i.ai === 'done'), 25000);
  check(e && e.orderId === I.o3 && JSON.stringify(e.moreOrders) === JSON.stringify([I.o1]), 'la factura que dice «OC-0003 y OC-0001» queda con las dos órdenes');

  // 6) Excel: las órdenes de cada factura.
  await page.click('#f-seg [data-f="todas"]');
  await settle(page, 300);
  const xl = await download(page, '[data-act="list-xlsx"]', 'facturas.xlsx');
  const xr = JSON.parse(execFileSync('python3', ['-I', '-c', `
import openpyxl, sys, json
wb = openpyxl.load_workbook(sys.argv[1])
rows = list(wb['Facturas'].iter_rows(values_only=True))
h = rows[4]
print(json.dumps([dict(zip(h, r)).get('Orden de compra') for r in rows[5:] if r[0] is not None and isinstance(r[0], int)], ensure_ascii=False))
`, xl]).toString());
  console.log('     excel:', JSON.stringify(xr));
  check(xr.includes('OC-0002, OC-0001') && xr.includes('OC-0003, OC-0001'), 'Excel: cada factura con todas sus órdenes');

  console.log('problemas:', problems.length ? problems : 'ninguno');
  await browser.close();
  server.close();
  process.exit(problems.length ? 1 : 0);
})().catch((e) => { console.error(e); console.log('problemas:', problems); process.exit(1); });
