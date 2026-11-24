// Conduces sin precio (solo transporte de material): los que esperan factura, precio por metro cúbico de los iguales (dinero entre metros), por sus metros, «No lleva» por proveedor.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = process.env.APP_ROOT || path.resolve(__dirname, '..');
const SP = process.env.PRUEBAS_TMP || path.join(require('os').tmpdir(), 'facturas-pruebas');
const OUT = path.join(SP, 'test-cprice');
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
const cOf = async (page) => { const l = await docs(page, 'conduces'); return (n) => l.find((c) => c.number === n); };

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const BASE = `http://127.0.0.1:${server.address().port}/facturas/`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' && !/404|Failed to fetch|net::/.test(m.text())) problems.push('consola: ' + m.text()); });
  page.on('pageerror', (e) => problems.push('error de página: ' + e.message));
  await page.goto(BASE);
  await page.waitForSelector('.empty h2');
  await page.evaluate(async () => {
    const db = RT.db;
    await db.doc('settings/general').set({ company: 'SUCRE B. LANTIGUA CONSTRUCTORA, S.R.L.' });
    const e = db.collection('projects').doc(); await e.set({ name: 'ENZO', createdAt: '2026-09-01T10:00:00.000Z' });
    const inv = db.collection('invoices').doc(); await inv.set({ projectId: e.id, supplier: 'Ferretería Gama', number: 'B0100000901', date: '2026-11-10', amount: 5000, currency: 'DOP', ai: 'off', noOrder: true, createdAt: '2026-11-10T10:00:00.000Z' });
    const base = { invoiceId: null, projectId: e.id, projectHint: '', supplier: 'Transporte y Agregados S. López', rnc: '', currency: 'DOP', fileId: null, fileType: 'image/jpeg', thumbId: null, pages: 1, ai: 'off', aiErr: '', auto: false, qty: '' };
    let n = 0;
    const add = (x) => db.collection('conduces').doc().set({ ...base, date: '2026-11-1' + (++n % 9), createdAt: `2026-11-1${n % 9}T10:00:00.000Z`, trips: 1, total: null, ...x });
    // Con precio: 5 m³ a 4,000 y 10 m³ a 9,000 → 13,000 / 15 m³ = 866.67 el m³.
    await add({ number: '39767', material: 'Relleno 5 MT', total: 4000 });
    await add({ number: '39768', material: 'Relleno 10 m³', total: 9000 });
    await add({ number: '39764', material: 'Relleno 5 mts' });
    await add({ number: '39770', material: 'Relleno 5 m³', trips: 2 });
    await add({ number: '39771', material: 'Relleno', qty: '7 m3' });
    await add({ number: '39772', material: 'Relleno' });
    await add({ number: '39945', material: 'Caliche Amarillo 5 MT' });
    await add({ number: '40062', material: 'Caliche amarillo 5 m³' });
    await add({ number: '39999', material: 'Relleno 5 MT', invoiceId: inv.id });
    await add({ number: '501', supplier: 'Ferretería Gama', material: 'Cemento gris 10 fundas' });
    await add({ number: '601', supplier: 'Transporte Rodríguez', material: 'Arena gruesa 5 m³' });
  });
  await page.reload();
  await page.click('[data-act="backup-later"]').catch(() => {});
  await page.click('[data-act="tab"][data-tab="conduces"]');
  await page.waitForSelector('#cp-card');
  check(!(await page.$eval('#cp-card', (d) => d.open)) && (await page.$eval('#cp-card', (d) => d.getBoundingClientRect().height)) < 60, 'el apartado viene cerrado y ocupa una sola línea');
  check(/Conduces sin precio\s*7/.test(await txt(page, '#cp-card summary')), 'cuenta solo los que esperan factura (7; el que tiene factura no)');
  await page.click('#cp-card summary');
  const g = (re) => page.locator('.cp-g', { hasText: re });
  const rel = await g(/^Relleno/).textContent();
  console.log('     relleno:', rel.replace(/\s+/g, ' '));
  check(/RD\$ ?866\.67 el m³ \(de 2 conduces, 15 m³\)/.test(rel) && /4 sin precio \(39764, 39770, 39771, 39772\)/.test(rel) && /1 no dice los metros/.test(rel), 'precio del m³ = todo el dinero entre todos los metros (13,000 / 15 = 866.67)');
  check(!/39999/.test(await txt(page, '#cp-card')), 'el conduce que ya tiene factura no sale');
  check(!/Cemento gris|Ferretería Gama/.test(await txt(page, '#cp-card')), 'la ferretería no sale (entrega el conduce con su factura): solo el transporte de material');
  const hRow = await g(/^Relleno/).evaluate((e) => e.getBoundingClientRect().height);
  check(hRow < 80, `cada material ocupa poco (${Math.round(hRow)} px)`);
  await page.screenshot({ path: path.join(OUT, 'apartado.png') });
  // Un transportista que no pone precio en el conduce: «No lleva».
  await g(/Arena gruesa/).locator('[data-act="cp-hide"]').click();
  await waitUntil(async () => /No llevan precio: Transporte Rodríguez/.test(await txt(page, '#cp-card')), 5000);
  await settle(page, 300);
  check(/No llevan precio: Transporte Rodríguez/.test(await txt(page, '#cp-card')) && await g(/Arena gruesa/).count() === 0, '«No lleva» quita a ese proveedor del apartado');
  check(((await page.evaluate(async () => (await RT.db.doc('settings/conduces').get()).data())) || {}).noPrice.length === 1, 'se guarda (y pasa a los otros teléfonos)');
  // Poner el precio: cada uno por sus metros.
  await g(/^Relleno/).locator('[data-act="cp-apply"]').click();
  await waitUntil(async () => (await cOf(page))('39771').total != null, 5000);
  let c = await cOf(page);
  check(c('39764').total === 4333.35 && c('39770').total === 8666.7 && c('39771').total === 6066.69 && c('39764').priceM3 === 866.67, 'a cada uno: 866.67 por sus metros (5 m³, 5 m³ × 2 viajes, 7 m³)');
  check(c('39772').total == null && /1 sin metros/.test(await txt(page, '#toast')), 'el que no dice los metros se queda sin precio y lo avisa');
  check(c('39999').total == null, 'el que tiene factura no se toca');
  // Escribir el precio del caliche.
  await settle(page, 400);
  await g(/Caliche/).locator('input').fill('700');
  await g(/Caliche/).locator('[data-act="cp-apply"]').click();
  await waitUntil(async () => (await cOf(page))('40062').total != null, 5000);
  c = await cOf(page);
  check(c('39945').total === 3500 && c('40062').total === 3500 && c('40062').priceFrom === 'mano', 'caliche a 700 el m³: 5 m³ = 3,500');
  await page.click('#toast .toast-act');
  await waitUntil(async () => (await cOf(page))('40062').total == null, 5000);
  check((await cOf(page))('39945').total == null, '«Deshacer» les quita el precio');
  // Mostrarlo otra vez.
  await page.click('[data-act="cp-show"]');
  await waitUntil(async () => (await g(/Arena gruesa/).count()) === 1, 5000);
  check(await g(/Arena gruesa/).count() === 1, '«mostrar» lo vuelve a poner');
  // En el teléfono también cabe.
  await page.setViewportSize({ width: 390, height: 844 });
  await settle(page, 500);
  check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'en el teléfono no se sale de la pantalla');
  await page.screenshot({ path: path.join(OUT, 'telefono.png') });

  console.log('problemas:', problems.length ? problems : 'ninguno');
  await browser.close();
  server.close();
  process.exit(problems.length ? 1 : 0);
})().catch((e) => { console.error(e); console.log('problemas:', problems); process.exit(1); });
