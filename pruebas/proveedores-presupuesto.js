// Tanda 4: ficha de proveedores (crédito, vencimientos, banco), presupuesto por obra y precio estimado en la orden.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = process.env.APP_ROOT || path.resolve(__dirname, '..');
const SP = process.env.PRUEBAS_TMP || path.join(require('os').tmpdir(), 'facturas-pruebas');
const OUT = path.join(SP, 'test-tanda4');
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
const problems = [];
const check = (cond, msg) => { console.log((cond ? 'OK   ' : 'FALLA') + ' ' + msg); if (!cond) problems.push(msg); };
const pdfText = (f, pg) => execFileSync('pdftotext', ['-layout', ...(pg ? ['-f', String(pg), '-l', String(pg)] : []), f, '-']).toString();
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
const settle = (page, ms = 500) => page.waitForTimeout(ms);
const closeSheet = async (page) => { await page.click('.sheet-h [data-act="sheet-close"]'); await page.waitForSelector('#sheet-root', { state: 'hidden' }); };
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const BASE = `http://127.0.0.1:${server.address().port}/facturas/`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) problems.push('consola: ' + m.text()); });
  page.on('pageerror', (e) => problems.push('error de página: ' + e.message));
  await page.goto(BASE);
  await page.waitForSelector('.empty h2');
  // Crédito de 30 días: la de hace 36 días está vencida (hace 6), la de hace 27 vence en 3 y la de hace 5, más adelante.
  const ids = await page.evaluate(async (d) => {
    const db = RT.db;
    await db.doc('settings/general').set({ company: 'SUCRE B. LANTIGUA CONSTRUCTORA, S.R.L.', companyRnc: '104595114' });
    const p = db.collection('projects').doc(); await p.set({ name: 'Residencial ENZO', createdAt: '2026-09-01T10:00:00.000Z' });
    const o = db.collection('orders').doc();
    await o.set({ number: 3, date: d.d5, projectId: p.id, supplier: 'Ferretería Ochoa', requestedBy: 'William', items: [{ qty: 10, unit: 'Funda', desc: 'Cemento gris' }], status: 'autorizada', signedAt: d.d5, createdAt: '2026-10-01T08:00:00.000Z' });
    const base = { projectId: p.id, concept: '', ref: '', buyerRnc: '104595114', qrUrl: '', fiscal: '', notInvoice: false, fileId: null, fileType: 'image/jpeg', thumbId: null, pages: 1, fileName: 'x.jpg', xmlId: null, ai: 'off', currency: 'DOP', createdAt: '2026-10-02T10:00:00.000Z', noOrder: true };
    const add = async (x) => { const r = db.collection('invoices').doc(); await r.set({ ...base, ...x }); return r.id; };
    return {
      p: p.id, o: o.id,
      venc: await add({ supplier: 'Ferretería Ochoa, SRL', rnc: '131023452', number: 'B0100000101', date: d.d36, amount: 3000, itbis: 457.63 }),
      pronto: await add({ supplier: 'Ferretería Ochoa, SRL', rnc: '131023452', number: 'B0100000102', date: d.d27, amount: 2000, itbis: 305.08 }),
      lejos: await add({ supplier: 'FERRETERIA OCHOA', rnc: '131023452', number: 'B0100000103', date: d.d5, amount: 4000, itbis: 610.17, orderId: o.id, noOrder: false }),
    };
  }, { d36: daysAgo(36), d27: daysAgo(27), d5: daysAgo(5) });
  await page.reload();
  await page.waitForSelector('#f-list [data-act="open-inv"]');
  await page.click('[data-act="backup-later"]').catch(() => {});

  // 1) Ficha del proveedor desde las facturas: crédito, banco y cuenta.
  await page.click('[data-tab="proyectos"]');
  await page.click('[data-act="sups"]');
  await page.waitForSelector('.sheet [data-act="sup-new"][data-rnc="131023452"]');
  await page.click('.sheet [data-act="sup-new"][data-rnc="131023452"]');
  await page.waitForSelector('#sup-form');
  check((await page.inputValue('#sp-name')) === 'Ferretería Ochoa, SRL' && (await page.inputValue('#sp-rnc')) === '131023452', 'la ficha nueva viene llena con el nombre y el RNC de sus facturas');
  await page.fill('#sp-credit', '30');
  await page.fill('#sp-bank', 'Banco Popular');
  await page.selectOption('#sp-acct-type', 'Ahorros');
  await page.fill('#sp-acct', '123-45678-9');
  await page.fill('#sp-phone', '809-555-0101');
  await page.click('#sup-form button[type="submit"]');
  await page.waitForSelector('.sheet [data-act="sup-open"]');
  const sups = await docs(page, 'suppliers');
  check(sups.length === 1 && sups[0].creditDays === 30 && sups[0].bank === 'Banco Popular' && sups[0].account === '123-45678-9', 'ficha guardada: 30 días de crédito y la cuenta del Banco Popular');
  await closeSheet(page);

  // 2) Vencimientos: en la tarjeta, en Para hacer y en la lista enfocada.
  await page.click('[data-tab="facturas"]');
  await settle(page);
  const card = async (id) => (await page.textContent(`#f-list [data-act="open-inv"][data-id="${id}"]`)).replace(/\s+/g, ' ');
  check(/Vencida hace 6 días/.test(await card(ids.venc)) && /Vence en 3 días/.test(await card(ids.pronto)) && !/Vence/.test(await card(ids.lejos)), 'tarjetas: «Vencida hace 6 días», «Vence en 3 días» y la otra sin aviso');
  const todo = (await page.textContent('#todo')).replace(/\s+/g, ' ');
  check(/1 factura vencida · RD\$3,000\.00/.test(todo) && /1 factura vence esta semana · RD\$2,000\.00/.test(todo), 'Para hacer: 1 vencida (RD$3,000) y 1 vence esta semana (RD$2,000)');
  await page.click('#todo [data-act="focus"][data-f="vencidas"]');
  await settle(page);
  const shown = await page.$$eval('#f-list [data-act="open-inv"]', (b) => b.map((x) => x.dataset.id));
  check(shown.length === 1 && shown[0] === ids.venc && /facturas vencidas/.test(await page.textContent('#f-sum')), '«Ver» muestra solo la vencida');
  await page.click('[data-act="focus-off"]');
  await page.click(`#f-list [data-act="open-inv"][data-id="${ids.venc}"]`);
  await page.waitForSelector('#inv-form');
  check(/crédito de 30 días, vence el/.test(await page.textContent('#inv-form')) && /Banco Popular 123-45678-9/.test(await page.textContent('#inv-form')), 'la factura dice su crédito, cuándo venció y la cuenta');
  await closeSheet(page);

  // 3) Pago: la portada tiene el banco y la cuenta del proveedor; el Excel, el vencimiento y la cuenta.
  await page.click('[data-act="new-pay-from"]');
  await page.fill('#pk-name', 'Pago Ochoa');
  await page.click('#pk-go');
  await page.waitForSelector('#pd-body .bigtotal');
  const pdf = await download(page, '[data-act="pay-pdf"]', 'pago.pdf');
  check(/Banco Popular · Ahorros · Cta\. 123-45678-9/.test(pdfText(pdf, 1)), 'PDF del pago: «Banco Popular · Ahorros · Cta. 123-45678-9» en el proveedor');
  const xl = await download(page, '[data-act="pay-xlsx"]', 'pago.xlsx');
  const xr = JSON.parse(execFileSync('python3', ['-I', '-c', `
import openpyxl, sys, json
wb = openpyxl.load_workbook(sys.argv[1])
f = list(wb['Facturas'].iter_rows(values_only=True)); h = f[4]
p = list(wb['Por proveedor'].iter_rows(values_only=True)); hp = p[4]
print(json.dumps({'vence': [str(r[h.index('Vence')])[:10] for r in f[5:] if r[0] is not None and isinstance(r[0], int)], 'cuenta': p[5][hp.index('Cuenta')], 'banco': p[5][hp.index('Banco')]}, default=str))
`, xl]).toString());
  check(xr.vence.length === 3 && xr.vence.includes(daysAgo(6)) && xr.cuenta === '123-45678-9' && /Banco Popular/.test(xr.banco), 'Excel: columna Vence y la cuenta del proveedor');

  // 4) Precio estimado en la orden; la factura que pasa lo estimado avisa.
  await page.click('[data-tab="ordenes"]');
  await page.click(`[data-act="open-order"][data-id="${ids.o}"]`);
  await page.waitForSelector('#order-form');
  await page.fill('#o-items [data-row] >> nth=0 >> [data-f="price"]', '300');
  await page.dispatchEvent('#o-items [data-row] >> nth=0 >> [data-f="price"]', 'input');
  check(/Estimado: RD\$3,000\.00/.test(await page.textContent('#o-est')), 'la orden calcula el estimado al escribir el precio (10 × 300)');
  await page.click('#order-form button[type="submit"]');
  await page.waitForSelector('#order-form', { state: 'detached' });
  await settle(page);
  const ord = (await docs(page, 'orders'))[0];
  check(ord.items[0].price === 300 && /estimado RD\$3,000\.00/.test(await page.textContent(`[data-act="open-order"][data-id="${ids.o}"]`)), 'se guarda el precio y la orden dice «estimado RD$3,000.00»');
  await page.click('[data-tab="facturas"]');
  await page.click('[data-act="filter"][data-f="todas"]');
  await settle(page);
  check(/Pasa lo estimado/.test(await card(ids.lejos)), 'la factura de RD$4,000 (RD$3,389.83 sin ITBIS) avisa «Pasa lo estimado»');
  await page.click(`#f-list [data-act="open-inv"][data-id="${ids.lejos}"]`);
  await page.waitForSelector('#inv-form');
  check(/cobra RD\$3,389\.83 sin ITBIS y la orden estimó RD\$3,000\.00/.test(await page.textContent('#inv-form')), 'la hoja explica cuánto pasa');
  await page.click('[data-act="ack"][data-f="estOk"]');
  await settle(page, 700);
  if (await page.$('#inv-form')) await closeSheet(page);
  check(!/Pasa lo estimado/.test(await card(ids.lejos)), '«Está bien» quita el aviso');

  // 5) Presupuesto por obra: facturas más mano de obra del pase de lista.
  await page.evaluate(async (pid) => {
    const w = RT.db.collection('workers').doc(); await w.set({ projectId: pid, name: 'Marcelo', role: 'Ayudante', pay: 1000, active: true, seq: 1, createdAt: '2026-11-01T08:00:00.000Z' });
    const a = RT.db.collection('asistencia').doc(); await a.set({ projectId: pid, start: '2026-11-01', days: 14, entryLimit: '', exitFrom: '', workers: [w.id], marks: { [w.id]: { 1: { e: 'ok', p: 'ok', s: 'ok' } } }, surprise: {}, createdAt: '2026-11-01T08:00:00.000Z' });
  }, ids.p);
  await page.click('[data-tab="proyectos"]');
  await page.click(`[data-act="open-proj"][data-id="${ids.p}"]`);
  await page.waitForSelector('#proj-form');
  await page.fill('#pe-budget', '12,500');
  await page.click('#proj-form button[type="submit"]');
  await page.waitForSelector('#proj-form', { state: 'detached' });
  await settle(page);
  const row = (await page.textContent(`[data-act="open-proj"][data-id="${ids.p}"]`)).replace(/\s+/g, ' ');
  check(/80 % del presupuesto \(RD\$10,000\.00 de RD\$12,500\.00\)/.test(row), 'Proyectos: 80 % del presupuesto (RD$9,000 de facturas + RD$1,000 de mano de obra)');
  await page.click(`[data-act="open-proj"][data-id="${ids.p}"]`);
  await page.waitForSelector('#proj-form');
  const bud = (await page.textContent('#proj-form .budget')).replace(/\s+/g, ' ');
  check(/Gastado · 80 %/.test(bud) && /quedan RD\$2,500\.00/.test(bud) && /mano de obra RD\$1,000\.00/.test(bud), 'la obra dice lo gastado, lo que queda y la mano de obra');
  await page.screenshot({ path: path.join(OUT, 'presupuesto.png') });

  console.log('problemas:', problems.length ? problems : 'ninguno');
  await browser.close();
  server.close();
  process.exit(problems.length ? 1 : 0);
})().catch((e) => { console.error(e); console.log('problemas:', problems); process.exit(1); });
