// Abonos: pagos parciales en la factura; el pago, el PDF y el Excel toman el balance.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = process.env.APP_ROOT || path.resolve(__dirname, '..');
const SP = process.env.PRUEBAS_TMP || path.join(require('os').tmpdir(), 'facturas-pruebas');
const OUT = path.join(SP, 'test-abonos');
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
  const ids = await page.evaluate(async () => {
    await RT.db.doc('settings/general').set({ company: 'SUCRE B. LANTIGUA CONSTRUCTORA, S.R.L.', companyRnc: '104595114' });
    const p = RT.db.collection('projects').doc(); await p.set({ name: 'Residencial ENZO', createdAt: '2026-09-01T10:00:00.000Z' });
    const base = { projectId: p.id, concept: '', ref: '', buyerRnc: '104595114', qrUrl: '', fiscal: '', notInvoice: false, noOrder: true, fileId: null, fileType: 'image/jpeg', thumbId: null, pages: 1, fileName: 'x.jpg', xmlId: null, ai: 'off', currency: 'DOP', createdAt: '2026-11-01T10:00:00.000Z' };
    const a = RT.db.collection('invoices').doc(); await a.set({ ...base, supplier: 'Agregados S. López', rnc: '130999998', number: 'B0100000501', date: '2026-11-01', amount: 10000, itbis: 0 });
    const b = RT.db.collection('invoices').doc(); await b.set({ ...base, supplier: 'Ferretería Ochoa', rnc: '131023452', number: 'B0100000502', date: '2026-11-02', amount: 1000, itbis: 152.54 });
    return { a: a.id, b: b.id };
  });
  await page.reload();
  await page.waitForSelector('#f-list [data-act="open-inv"]');
  await page.click('[data-act="backup-later"]').catch(() => {});

  // 1) Anotar un abono: la factura dice el balance y la lista suma lo que falta.
  await page.click(`#f-list [data-act="open-inv"][data-id="${ids.a}"]`);
  await page.waitForSelector('#inv-abonos');
  await page.click('#inv-abonos summary');
  await page.fill('#ab-amt', '4,000');
  await page.fill('#ab-note', 'Cheque 123');
  await page.click('[data-act="ab-add"]');
  await page.waitForFunction(() => /balance RD\$6,000\.00/.test((document.querySelector('#inv-abonos summary') || {}).textContent || ''), null, { timeout: 10000 });
  await page.fill('#ab-amt', '7000');
  await page.click('[data-act="ab-add"]');
  await settle(page);
  check(/pasa el balance/.test(await page.textContent('#toast')), 'un abono más grande que el balance no se acepta');
  await page.screenshot({ path: path.join(OUT, 'abonos.png') });
  await closeSheet(page);
  const card = (await page.textContent(`#f-list [data-act="open-inv"][data-id="${ids.a}"]`)).replace(/\s+/g, ' ');
  check(/Balance RD\$6,000\.00/.test(card), 'la tarjeta dice «Balance RD$6,000.00»');
  check(/2 facturas · RD\$7,000\.00/.test((await page.textContent('#f-sum')).replace(/\s+/g, ' ')), 'la lista suma lo que falta por pagar: 6,000 + 1,000');

  // 2) El pago toma el balance: pantalla, PDF y Excel.
  await page.click('[data-act="new-pay-from"]');
  await page.waitForSelector('#pick-form');
  check(/RD\$7,000\.00/.test(await page.textContent('#pk-sum')), 'al elegir las facturas, el total es el balance');
  await page.fill('#pk-name', 'Pago con abono');
  await page.click('#pk-go');
  await page.waitForSelector('#pd-body .bigtotal');
  check(/RD\$7,000\.00/.test(await page.textContent('#pd-body .bigtotal')), 'el pago suma RD$7,000.00');
  const pdf = await download(page, '[data-act="pay-pdf"]', 'pago.pdf');
  const cover = execFileSync('pdftotext', ['-layout', '-f', '1', '-l', '1', pdf, '-']).toString();
  check(/RD\$7,000\.00/.test(cover) && /Con abonos \(se paga el balance\)/.test(cover) && /abonado RD\$4,000\.00/.test(cover), 'PDF del pago: total RD$7,000.00 y la nota del abono');
  const xl = await download(page, '[data-act="pay-xlsx"]', 'pago.xlsx');
  const xr = JSON.parse(execFileSync('python3', ['-I', '-c', `
import openpyxl, sys, json
wb = openpyxl.load_workbook(sys.argv[1])
f = list(wb['Facturas'].iter_rows(values_only=True)); h = f[4]
rows = [dict(zip(h, r)) for r in f[5:] if r[0] is not None and isinstance(r[0], int)]
p = list(wb['Por proveedor'].iter_rows(values_only=True)); hp = p[4]
print(json.dumps({'ab': [[r['Proveedor'], r.get('Abonado'), r.get('Por pagar')] for r in rows], 'prov': [[r[0], r[hp.index('Total a pagar')]] for r in p[5:] if r[0] and r[0] != 'Total']}, default=str))
`, xl]).toString());
  console.log('     excel:', JSON.stringify(xr));
  const lop = xr.ab.find((x) => /López/.test(x[0]));
  check(lop && lop[1] === 4000 && lop[2] === 6000, 'Excel: columnas Abonado (4,000) y Por pagar (6,000)');
  check(xr.prov.some((x) => /López/.test(x[0]) && x[1] === 6000), 'Excel por proveedor: a López se le pagan 6,000');

  // 3) Abonada completa: queda pagada; si se quita el abono, vuelve a pendiente.
  await page.click('[data-tab="facturas"]');
  await page.click('[data-act="filter"][data-f="todas"]');
  await page.evaluate(async (id) => { await RT.db.doc('invoices/' + id).update({ abonos: [{ date: '2026-11-03', amount: 1000, note: '' }] }); }, ids.b);
  await settle(page);
  let invs = await page.evaluate(() => new Promise((r) => { const un = RT.db.collection('payments').onSnapshot((s) => { un(); r(s.docs.map((d) => d.data())); }); }));
  const pay = invs[0];
  await page.evaluate(async (pid) => { await RT.db.doc('payments/' + pid).update({ invoiceIds: [] }); }, (await docs(page, 'payments'))[0].id);
  await settle(page);
  check(/Pagada/.test(await page.textContent(`#f-list [data-act="open-inv"][data-id="${ids.b}"]`)), 'con abonos por todo el monto, la factura queda pagada');
  await page.click(`#f-list [data-act="open-inv"][data-id="${ids.b}"]`);
  await page.waitForSelector('#inv-abonos');
  await page.click('[data-act="ab-rm"]');
  await settle(page, 700);
  if (await page.$('#inv-form')) await closeSheet(page);
  check(/Pendiente/.test(await page.textContent(`#f-list [data-act="open-inv"][data-id="${ids.b}"]`)) && pay, 'al quitar el abono vuelve a pendiente');

  console.log('problemas:', problems.length ? problems : 'ninguno');
  await browser.close();
  server.close();
  process.exit(problems.length ? 1 : 0);
})().catch((e) => { console.error(e); console.log('problemas:', problems); process.exit(1); });
