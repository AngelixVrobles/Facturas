// Conduces sin precio (transporte de material): por proveedor y material, toma el precio de los iguales que tienen y se lo pone a los demás.
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
    const base = { invoiceId: null, projectId: e.id, projectHint: '', supplier: 'Transporte y Agregados S. López', rnc: '', currency: 'DOP', fileId: null, fileType: 'image/jpeg', thumbId: null, pages: 1, ai: 'off', aiErr: '', auto: false };
    let n = 0;
    for (const [num, mat, total, trips] of [['39767', 'Relleno 5 MT', 4000, 1], ['39764', 'Relleno 5 mts', null, 1], ['39770', 'Relleno 5 m³', null, 2], ['39945', 'Caliche Amarillo 5 MT', null, 1], ['40062', 'Caliche amarillo 5 m³', null, 1], ['39807', 'Grava 5 m³', 8000, 1]]) {
      await db.collection('conduces').doc().set({ ...base, number: num, material: mat, qty: '', total, trips, date: '2026-11-1' + (++n % 9), createdAt: `2026-11-1${n % 9}T10:00:00.000Z` });
    }
    await db.collection('conduces').doc().set({ ...base, supplier: 'Otra Arenera', number: '777', material: 'Relleno 5 MT', total: null, trips: 1, date: '2026-11-15', createdAt: '2026-11-15T10:00:00.000Z' });
  });
  await page.reload();
  await page.click('[data-act="backup-later"]').catch(() => {});
  await page.click('[data-act="tab"][data-tab="conduces"]');
  await page.waitForSelector('#cp-card');
  const card = await txt(page, '#cp-card');
  console.log('     apartado:', card);
  check(/Conduces sin precio\s*5/.test(card), 'el apartado dice cuántos conduces no tienen precio (5)');
  const g = (re) => page.locator('.cp-g', { hasText: re });
  check(/Otros conduces iguales tienen RD\$ ?4,000\.00 por viaje \(39767\)/.test(await g(/Relleno 5 MT/).first().textContent()) && /2 conduces sin precio: 39764, 39770/.test(await g(/Relleno 5 MT/).first().textContent()), 'el relleno sin precio (5 MT, 5 mts, 5 m³) toma el precio del que tiene: RD$4,000 por viaje');
  const pv = await g(/Relleno 5 MT/).first().locator('input').inputValue();
  check(Number(pv.replace(/,/g, '')) === 4000, `el precio ya viene escrito (${pv})`);
  check(/Ningún conduce de este material tiene precio/.test(await g(/Caliche/).textContent()) && /2 conduces sin precio: 39945, 40062/.test(await g(/Caliche/).textContent()), 'el caliche (sin ninguno con precio) pide escribirlo');
  check(/Otra Arenera/.test(card) && /Ningún conduce/.test(await g(/Otra Arenera/).textContent()), 'otro proveedor con el mismo material no toma ese precio');
  await page.screenshot({ path: path.join(OUT, 'apartado.png') });
  // Ponerle el precio a los demás (el de 2 viajes queda al doble).
  await g(/Relleno 5 MT/).first().locator('[data-act="cp-apply"]').click();
  await waitUntil(async () => (await cOf(page))('39770').total != null, 5000);
  let c = await cOf(page);
  check(c('39764').total === 4000 && c('39770').total === 8000 && c('39764').priceFrom === 'igual', 'se le pone a los dos: RD$4,000 y RD$8,000 (2 viajes)');
  check(c('777').total == null, 'el de otro proveedor no se toca');
  // Escribir el precio del caliche.
  await waitUntil(async () => !/Relleno 5 MT[^]*39764/.test(await txt(page, '#cp-card')), 5000);
  await g(/Caliche/).locator('input').fill('3500');
  await g(/Caliche/).locator('[data-act="cp-apply"]').click();
  await waitUntil(async () => (await cOf(page))('40062').total != null, 5000);
  c = await cOf(page);
  check(c('39945').total === 3500 && c('40062').total === 3500 && c('40062').priceFrom === 'mano', 'el precio escrito se le pone a todos los del caliche');
  // Deshacer.
  await page.click('#toast .toast-act');
  await waitUntil(async () => (await cOf(page))('40062').total == null, 5000);
  c = await cOf(page);
  check(c('39945').total == null && c('40062').total == null, '«Deshacer» les quita el precio');
  // Un precio mal escrito no se pone.
  await waitUntil(async () => /Caliche/.test(await txt(page, '#cp-card')), 5000);
  await g(/Caliche/).locator('input').fill('abc');
  await g(/Caliche/).locator('[data-act="cp-apply"]').click();
  await settle(page, 400);
  check(/solo con números/.test(await txt(page, '#toast')) && (await cOf(page))('39945').total == null, 'un precio mal escrito no se pone');
  // Mientras se escribe, la app no borra lo escrito aunque se redibuje.
  await g(/Caliche/).locator('input').fill('35');
  await page.evaluate(async () => { const l = await new Promise((r) => { const un = RT.db.collection('conduces').onSnapshot((s) => { un(); r(s.docs); }); }); const d = l.find((x) => x.data().number === '777'); await RT.db.doc('conduces/' + d.id).update({ qty: '5' }); });
  await settle(page, 500);
  check(await g(/Caliche/).locator('input').inputValue() === '35', 'lo que se está escribiendo no se borra cuando cambia algo');

  console.log('problemas:', problems.length ? problems : 'ninguno');
  await browser.close();
  server.close();
  process.exit(problems.length ? 1 : 0);
})().catch((e) => { console.error(e); console.log('problemas:', problems); process.exit(1); });
