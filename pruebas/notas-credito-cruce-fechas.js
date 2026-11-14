// Tanda 1: notas de crédito que restan, avisos del cruce orden-conduce-factura, filtro por fecha y listas largas.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = process.env.APP_ROOT || path.resolve(__dirname, '..');
const SP = process.env.PRUEBAS_TMP || path.join(require('os').tmpdir(), 'facturas-pruebas');
const OUT = path.join(SP, 'test-tanda1');
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
const settle = (page, ms = 400) => page.waitForTimeout(ms);
const closeSheet = async (page) => { await page.click('.sheet-h [data-act="sheet-close"]'); await page.waitForSelector('#sheet-root', { state: 'hidden' }); };
const openInv = async (page, txt) => { await page.click(`#f-list [data-act="open-inv"]:has-text("${txt}")`); await page.waitForSelector('#inv-form'); await settle(page, 300); };

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
    const db = RT.db;
    await db.doc('settings/general').set({ company: 'SUCRE B. LANTIGUA CONSTRUCTORA, S.R.L.', companyRnc: '104595114' });
    const pA = db.collection('projects').doc(); await pA.set({ name: 'Residencial ENZO', createdAt: '2026-09-01T10:00:00.000Z' });
    const pB = db.collection('projects').doc(); await pB.set({ name: 'Caperuza 2', createdAt: '2026-09-02T10:00:00.000Z' });
    const o = db.collection('orders').doc();
    await o.set({ number: 7, date: '2026-10-20', projectId: pA.id, supplier: 'Agregados S. López', requestedBy: 'William', items: [{ qty: 5, unit: 'm³', desc: 'Grava' }, { qty: 20, unit: 'Funda', desc: 'Cemento gris' }], status: 'autorizada', signedAt: '2026-10-20', createdAt: '2026-10-01T08:00:00.000Z' });
    const base = { concept: '', ref: '', buyerRnc: '104595114', qrUrl: '', fiscal: '', notInvoice: false, fileId: null, fileType: 'image/jpeg', thumbId: null, pages: 1, fileName: 'x.jpg', xmlId: null, ai: 'off', currency: 'DOP', createdAt: '2026-10-25T10:00:00.000Z' };
    const add = async (x) => { const r = db.collection('invoices').doc(); await r.set({ ...base, ...x }); return r.id; };
    const cond = async (x) => db.collection('conduces').doc().set({ projectId: pA.id, projectHint: '', rnc: '', currency: 'DOP', fileId: 'f', fileType: 'image/jpeg', thumbId: null, pages: 1, fileName: 'c.jpg', ai: 'off', auto: false, createdAt: '2026-10-25T10:00:00.000Z', ...x });
    const normal = await add({ projectId: pB.id, supplier: 'Ferretería Ochoa', rnc: '131023452', number: 'B0100000001', date: '2026-10-10', amount: 1000, itbis: 152.54, noOrder: true });
    // Nota de crédito guardada antes con el monto en positivo: se arregla sola.
    const nc = await add({ projectId: pB.id, supplier: 'Ferretería Ochoa', rnc: '131023452', number: 'B0400000002', date: '2026-10-12', amount: 300, itbis: 45.76 });
    // Factura de agregados con orden y dos conduces: cobra más y menciona un conduce que falta.
    const ag = await add({ projectId: pA.id, supplier: 'Agregados S. López', rnc: '130999998', number: 'B0100000777', date: '2026-11-03', amount: 17000, itbis: 0, orderId: o.id, conduceRefs: ['39807', '39808', '39811'] });
    await cond({ invoiceId: ag, supplier: 'Agregados S. López', number: '39807', date: '2026-11-01', total: 8000, material: 'Grava', qty: '5 mts', trips: 1 });
    await cond({ invoiceId: ag, supplier: 'Agregados S. López', number: '39808', date: '2026-11-02', total: 8000, material: 'Grava', qty: '5 mts', trips: 1 });
    return { pA: pA.id, pB: pB.id, o: o.id, normal, nc, ag };
  });
  await page.reload();
  await page.waitForSelector('#f-list [data-act="open-inv"]');
  await page.click('[data-act="backup-later"]').catch(() => {});
  await settle(page, 3500);

  // 1) Nota de crédito: resta.
  let invs = await docs(page, 'invoices');
  const ncDoc = invs.find((i) => i.id === ids.nc);
  check(ncDoc.amount === -300 && ncDoc.itbis === -45.76, 'la nota de crédito guardada en positivo se arregló sola: -300 y ITBIS -45.76');
  const ncCard = (await page.textContent(`#f-list [data-act="open-inv"][data-id="${ids.nc}"]`)).replace(/\s+/g, ' ');
  check(/-RD\$300\.00/.test(ncCard) && /Nota de crédito/.test(ncCard) && !/Sin orden/.test(ncCard), 'la tarjeta dice «Nota de crédito», -RD$300.00 y no pide orden');
  await page.click('#f-filt');
  await page.click(`#f-chips [data-p="${ids.pB}"]`);
  await settle(page);
  check(/2 facturas · RD\$700\.00/.test((await page.textContent('#f-sum')).replace(/\s+/g, ' ')), 'Caperuza 2: 1,000 - 300 = RD$700.00');
  await page.click('[data-act="new-pay-from"]');
  await page.fill('#pk-name', 'Pago Ochoa');
  await page.click('#pk-go');
  await page.waitForSelector('#pd-body .bigtotal');
  check(/RD\$700\.00/.test(await page.textContent('#pd-body .bigtotal')), 'el pago con la nota de crédito suma RD$700.00');
  const pdf = await download(page, '[data-act="pay-pdf"]', 'pago.pdf');
  const cover = pdfText(pdf, 1);
  check(/RD\$700\.00/.test(cover) && /-RD\$300\.00/.test(cover), 'PDF del pago: total RD$700.00 y la nota de crédito en -RD$300.00');
  const xl = await download(page, '[data-act="pay-xlsx"]', 'pago.xlsx');
  const tot = execFileSync('python3', ['-I', '-c', `
import openpyxl, sys
ws = openpyxl.load_workbook(sys.argv[1])['Resumen']
print([r[4] for r in ws.iter_rows(values_only=True) if r and r[0] == 'Total'][0])
`, xl]).toString().trim();
  check(Number(tot) === 700, 'Excel del pago: total 700 (' + tot + ')');
  // Escrita a mano: B04 con el monto en positivo se guarda en negativo.
  await page.click('[data-tab="facturas"]');
  await page.click(`#f-chips [data-p="all"]`);
  await page.click('[data-act="filter"][data-f="todas"]');
  await openInv(page, 'B0100000001');
  await page.fill('#f-num', 'B0400000009');
  await page.fill('#f-amt', '250');
  await page.fill('#f-itbis', '38.14');
  await page.click('#inv-save');
  await page.waitForSelector('#inv-form', { state: 'detached' });
  await settle(page);
  invs = await docs(page, 'invoices');
  const typed = invs.find((i) => i.id === ids.normal);
  check(typed.amount === -250 && typed.itbis === -38.14, 'nota de crédito escrita a mano: se guarda -250 y ITBIS -38.14');

  // 2) Cruce: cobra más que sus conduces, falta un conduce y los conduces pasan la orden.
  await openInv(page, 'B0100000777');
  const msgs = (await page.textContent('#inv-form')).replace(/\s+/g, ' ');
  check(/cobra RD\$17,000\.00 y sus conduces suman RD\$16,000\.00: RD\$1,000\.00 más/.test(msgs), 'aviso: la factura cobra RD$1,000 más que sus conduces');
  check(/menciona el conduce 39811, que no está adjunto/.test(msgs), 'aviso: menciona el conduce 39811 que no está adjunto');
  check(/traen 10 m³ de Grava y la orden pidió 5/.test(msgs), 'aviso: los conduces traen 10 m³ de grava y la orden pidió 5');
  await page.screenshot({ path: path.join(OUT, 'avisos-cruce.png') });
  await closeSheet(page);
  let card = (await page.textContent(`#f-list [data-act="open-inv"][data-id="${ids.ag}"]`)).replace(/\s+/g, ' ');
  check(/Revisar:.*Cobra más que sus conduces/.test(card) && /Más que la orden/.test(card) && /Le falta:.*conduce/.test(card), 'la tarjeta lleva los tres avisos');
  await openInv(page, 'B0100000777');
  await page.click('[data-act="ack"][data-f="condRefsOk"]');
  await settle(page, 700);
  card = (await page.textContent(`#f-list [data-act="open-inv"][data-id="${ids.ag}"]`)).replace(/\s+/g, ' ');
  check(!/Falta conduce/.test(card) && /Cobra más que sus conduces/.test(card), '«No hace falta» quita solo ese aviso');
  if (await page.$('#inv-form')) await closeSheet(page);
  await page.click('[data-tab="ordenes"]');
  await page.click(`[data-act="open-order"][data-id="${ids.o}"]`);
  await page.waitForSelector('#order-form');
  check(/traen 10 m³ de Grava y la orden pidió 5/.test(await page.textContent('#o-invs')), 'la orden también avisa que los conduces pasan lo pedido');
  await closeSheet(page);

  // 3) Filtro por fecha.
  await page.click('[data-tab="facturas"]');
  const months = await page.$$eval('#f-month option', (os) => os.map((o) => o.textContent));
  check(months.join('|') === 'Todas las fechas|Noviembre de 2026|Octubre de 2026|Elegir fechas…', 'meses para elegir: ' + months.join(', '));
  await page.selectOption('#f-month', '2026-10');
  await settle(page);
  const octCards = await page.$$eval('#f-list [data-act="open-inv"]', (b) => b.map((x) => x.dataset.id));
  check(octCards.length === 2 && !octCards.includes(ids.ag), 'Octubre: solo las 2 de octubre');
  const xl2 = await download(page, '[data-act="list-xlsx"]', 'octubre.xlsx');
  const scope = execFileSync('python3', ['-I', '-c', `
import openpyxl, sys
ws = openpyxl.load_workbook(sys.argv[1])['Facturas']
print(' '.join(str(c) for r in list(ws.iter_rows(values_only=True))[:4] for c in r if c))
`, xl2]).toString();
  check(/Octubre de 2026/.test(scope) && /Octubre de 2026/.test(path.basename(xl2) + scope), 'el Excel dice «Octubre de 2026»');
  await page.selectOption('#f-month', 'range');
  await page.waitForSelector('#f-from');
  await page.fill('#f-from', '2026-10-11');
  await page.dispatchEvent('#f-from', 'change');
  await page.fill('#f-to', '2026-11-30');
  await page.dispatchEvent('#f-to', 'change');
  await settle(page);
  const rngCards = await page.$$eval('#f-list [data-act="open-inv"]', (b) => b.map((x) => x.dataset.id));
  check(rngCards.length === 2 && rngCards.includes(ids.ag) && rngCards.includes(ids.nc) && !rngCards.includes(ids.normal), 'del 11 de octubre al 30 de noviembre: la nota de crédito del 12 y la de agregados (no la del 10)');
  await page.screenshot({ path: path.join(OUT, 'filtro-fechas.png') });
  await page.selectOption('#f-month', '');
  await settle(page);

  // 4) Listas largas: 60 y «Ver más»; «Armar pago con estas» toma todas.
  await page.evaluate(async (pid) => {
    for (let k = 0; k < 70; k++) {
      await RT.db.collection('invoices').doc().set({ projectId: pid, supplier: 'Proveedor ' + k, rnc: '', number: 'B01000' + String(10000 + k), date: '2026-11-04', amount: 100, itbis: 15.25, currency: 'DOP', concept: '', ref: '', buyerRnc: '104595114', qrUrl: '', fiscal: '', notInvoice: false, noOrder: true, fileId: null, fileType: 'image/jpeg', thumbId: null, pages: 1, fileName: 'x.jpg', xmlId: null, ai: 'off', createdAt: '2026-11-04T10:00:00.000Z' });
    }
  }, ids.pB);
  await page.click('[data-act="filter"][data-f="pendientes"]');
  await page.click(`#f-chips [data-p="${ids.pB}"]`);
  await settle(page, 800);
  check((await page.$$('#f-list [data-act="open-inv"]')).length === 60 && /Ver 12 más/.test(await page.textContent('#f-list')), 'con 72 facturas pendientes se ven 60 y «Ver 12 más»');
  await page.click('[data-act="new-pay-from"]');
  await page.waitForSelector('#pick-form');
  const picked = await page.$$eval('#sheet-root input[data-pick="inv"]', (bs) => bs.filter((b) => b.checked).length);
  check(picked === 70, '«Armar pago con estas» marca las 70 que faltan por pagar, no solo las que se ven (' + picked + ')');
  await closeSheet(page);
  await page.click('[data-act="more"]');
  await settle(page);
  check((await page.$$('#f-list [data-act="open-inv"]')).length === 72, '«Ver más» muestra las 72');

  console.log('problemas:', problems.length ? problems : 'ninguno');
  await browser.close();
  server.close();
  process.exit(problems.length ? 1 : 0);
})().catch((e) => { console.error(e); console.log('problemas:', problems); process.exit(1); });
