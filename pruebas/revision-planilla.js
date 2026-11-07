// Computadora: la factura con su documento grande al lado de los datos (foto y PDF), el pase de lista como la
// planilla de papel (obreros por días) y las facturas del pago en tabla con «Quitar». En el teléfono no cambia.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = process.env.APP_ROOT || path.resolve(__dirname, '..');
const SP = process.env.PRUEBAS_TMP || path.join(require('os').tmpdir(), 'facturas-pruebas');
const OUT = path.join(SP, 'test-revision');
const SAMPLES = path.join(SP, 'muestras-conduce');
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
const settle = (page, ms = 500) => page.waitForTimeout(ms);
const files = { pdf: fs.readFileSync(path.join(SAMPLES, 'factura-lopez.pdf')).toString('base64'), jpg: fs.readFileSync(path.join(SAMPLES, 'conduce.jpg')).toString('base64') };
async function seed(page) {
  return page.evaluate(async (f) => {
    const blob = (b64, type) => new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], { type });
    const pdf = await RT.assets.upload(blob(f.pdf, 'application/pdf'));
    const jpg = await RT.assets.upload(blob(f.jpg, 'image/jpeg'));
    await RT.db.doc('settings/general').set({ company: 'SUCRE B. LANTIGUA CONSTRUCTORA, S.R.L.', companyRnc: '104595114' });
    const p = RT.db.collection('projects').doc(); await p.set({ name: 'Residencial ENZO', createdAt: '2026-09-01T10:00:00.000Z' });
    const base = { projectId: p.id, concept: '', ref: '', buyerRnc: '104595114', qrUrl: '', fiscal: '', notInvoice: false, noOrder: true, thumbId: null, pages: 1, xmlId: null, ai: 'off', currency: 'DOP', createdAt: '2026-11-05T13:00:00.000Z' };
    const a = RT.db.collection('invoices').doc(); await a.set({ ...base, supplier: 'Transporte y Agregados S. López', rnc: '130999998', number: 'B0100000777', date: '2026-11-05', amount: 8000, itbis: 0, fileId: pdf.id, fileType: 'application/pdf', fileName: 'lopez.pdf' });
    const b = RT.db.collection('invoices').doc(); await b.set({ ...base, supplier: 'Bloques del Cibao', rnc: '131555777', number: 'B0100000888', date: '2026-11-06', amount: 4720, itbis: 720, fileId: jpg.id, fileType: 'image/jpeg', fileName: 'bloques.jpg' });
    const c = RT.db.collection('invoices').doc(); await c.set({ ...base, supplier: 'Ferretería Ochoa', rnc: '131023452', number: 'B0100000502', date: '2026-11-02', amount: 1000, itbis: 152.54, fileId: null, fileType: 'image/jpeg', fileName: 'c.jpg' });
    const pay = RT.db.collection('payments').doc(); await pay.set({ name: 'Pago semana 45', date: '2026-11-06', status: 'armando', invoiceIds: [b.id, c.id], createdAt: '2026-11-06T10:00:00.000Z' });
    const W = [];
    for (const [n, r, py] of [['Marcelo Peña', 'Ayudante', 1200], ['Maslem Díaz', 'Ayudante', 1100], ['Felipe Ruiz', 'Terminador', 1500]]) { const w = RT.db.collection('workers').doc(); await w.set({ projectId: p.id, name: n, role: r, pay: py, active: true, createdAt: '2026-11-01T10:00:00.000Z' }); W.push(w.id); }
    const marks = { [W[0]]: { 1: { e: 'ok', p: 'ok', s: 'cc' }, 2: { e: 'ok', s: 'c' } }, [W[1]]: { 1: { e: 't', p: 'x', s: 'ok' } }, [W[2]]: { 1: { e: 'x' } } };
    await RT.db.collection('asistencia').doc().set({ projectId: p.id, start: '2026-11-01', days: 14, entryLimit: '7:30', exitFrom: '5:00', workers: W, marks, surprise: { 1: '10:15' }, createdAt: '2026-11-01T10:00:00.000Z' });
    return { a: a.id, b: b.id, c: c.id, pay: pay.id };
  }, files);
}

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const BASE = `http://127.0.0.1:${server.address().port}/facturas/`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, timezoneId: 'America/Santo_Domingo' });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date('2026-11-02T10:00:00-04:00'));
  page.on('pageerror', (e) => problems.push('error de página: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) problems.push('consola: ' + m.text()); });
  await page.goto(BASE);
  await page.waitForSelector('.empty h2');
  const I = await seed(page);
  await page.reload();
  await page.waitForSelector('#f-list table.inv-tbl');
  await page.click('[data-act="backup-later"]').catch(() => {});
  await page.click('[data-act="filter"][data-f="todas"]').catch(() => {});
  await settle(page);

  // 1) Factura en PDF: el documento a la izquierda, los datos a la derecha.
  await page.click(`#f-list tr[data-id="${I.a}"] .row-btn`);
  await page.waitForSelector('#inv-form');
  await page.waitForSelector('.sheet.review .rev-doc canvas', { timeout: 20000 }).catch(() => {});
  const lay = await page.evaluate(() => { const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { l: Math.round(b.left), r: Math.round(b.right), w: Math.round(b.width), h: Math.round(b.height) }; }; return { sheet: r('.sheet.review'), doc: r('.rev-doc'), body: r('.sheet.review .sheet-b'), canvas: r('.rev-doc canvas'), prev: getComputedStyle(document.querySelector('#inv-form .preview') || document.body).display }; });
  console.log('     revisión:', JSON.stringify(lay));
  check(!!lay.sheet && lay.sheet.w > 1000 && lay.doc && lay.body && lay.doc.r <= lay.body.l + 2 && lay.doc.w > 450, 'la factura se abre ancha: el documento a la izquierda y los datos a la derecha');
  check(!!lay.canvas && lay.canvas.w > 400 && lay.prev === 'none', 'el PDF se ve grande (y no sale la miniatura)');
  await page.screenshot({ path: path.join(OUT, 'revision-pdf.png') });
  await page.click('.sheet-h [data-act="sheet-close"]');
  await page.waitForSelector('#sheet-root', { state: 'hidden' });
  // Factura en foto
  await page.click(`#f-list tr[data-id="${I.b}"] .row-btn`);
  await page.waitForSelector('.sheet.review .rev-doc img');
  const img = await page.$eval('.rev-doc img', (e) => ({ w: Math.round(e.getBoundingClientRect().width), ok: e.complete && e.naturalWidth > 0 }));
  check(img.ok && img.w > 400, 'la foto también se ve grande al lado');
  await page.click('.sheet-h [data-act="sheet-close"]');
  await page.waitForSelector('#sheet-root', { state: 'hidden' });
  // Sin archivo: la hoja normal
  await page.click(`#f-list tr[data-id="${I.c}"] .row-btn`);
  await page.waitForSelector('#inv-form');
  check(!(await page.$('.sheet.review')), 'sin archivo, se abre la hoja normal');
  await page.click('.sheet-h [data-act="sheet-close"]');
  await page.waitForSelector('#sheet-root', { state: 'hidden' });

  // 2) El pago: sus facturas en tabla, con «Quitar».
  await page.click('.tabs [data-tab="pagos"]');
  await page.click(`[data-act="open-pay"][data-id="${I.pay}"]`);
  await page.waitForSelector('#pd-body table.inv-tbl');
  const prow = await page.$$eval('#pd-body table.inv-tbl tbody tr', (r) => r.length);
  check(prow === 2 && (await page.$$('#pd-body table.inv-tbl [data-act="pay-rm"]')).length === 2 && !(await page.$('#pd-body table.inv-tbl input[data-sel]')), 'las facturas del pago van en tabla, con «Quitar» y sin casillas');
  await page.screenshot({ path: path.join(OUT, 'pago.png') });
  await page.click(`#pd-body table.inv-tbl [data-act="pay-rm"][data-id="${I.c}"]`);
  await page.waitForFunction(() => document.querySelectorAll('#pd-body table.inv-tbl tbody tr').length === 1, null, { timeout: 5000 }).catch(() => {});
  const pays = await page.evaluate(() => new Promise((r) => { const un = RT.db.collection('payments').onSnapshot((s) => { un(); r(s.docs.map((d) => d.data())); }); }));
  check(pays[0].invoiceIds.join() === I.b, '«Quitar» saca la factura del pago');

  // 3) El pase de lista como la planilla de papel.
  await page.click('.tabs [data-tab="asistencia"]');
  await page.waitForSelector('.att-plan table');
  const plan = await page.evaluate(() => {
    const t = document.querySelector('.att-plan table');
    return { heads: [...t.querySelectorAll('thead th')].map((h) => h.textContent.replace(/\s+/g, ' ').trim()), rows: [...t.querySelectorAll('tbody tr')].map((r) => [...r.children].map((c) => c.textContent.replace(/\s+/g, ' ').trim())), daysHidden: getComputedStyle(document.querySelector('.att-days')).display === 'none', cols: getComputedStyle(document.querySelector('.att-list')).gridTemplateColumns.split(' ').length };
  });
  console.log('     planilla:', JSON.stringify({ heads: plan.heads, fila1: plan.rows[0] }));
  check(plan.heads.length === 17 && plan.heads[0] === 'Obrero' && plan.heads[1] === 'D 1' && plan.heads[2] === 'L 2' && plan.heads[15] === 'Días' && plan.heads[16] === 'Pago', 'la planilla: obrero, los 14 días y los totales');
  check(plan.rows.length === 3 && /Marcelo Peña/.test(plan.rows[0][0]) && plan.rows[0][2] === '✓ ✓ 1½1.5' && plan.rows[0][3] === '✓ · C1', 'cada día con su entrada, pase y salida, y lo que cuenta (' + plan.rows[0][2] + ' / ' + plan.rows[0][3] + ')');
  check(plan.rows[2][2] === 'x0' && plan.rows[0][15] === '2.5' && /RD\$3,000\.00/.test(plan.rows[0][16]), 'la falta se ve, y los días y el pago de la quincena');
  check(plan.daysHidden && plan.cols === 3, 'los botones de los días se quitan (la planilla los tiene) y las tarjetas van en 3 columnas');
  await page.screenshot({ path: path.join(OUT, 'planilla.png') });
  await page.click('.att-plan thead th.att-h:nth-child(4) [data-act="att-day"]');
  await settle(page, 300);
  const on = await page.$eval('.att-plan thead th.on', (h) => h.textContent.replace(/\s+/g, ' ').trim());
  check(on === 'M 3' && /Martes 3 nov de 2026/i.test(await page.textContent('.att-quick')), 'tocando un día en la planilla, se marca ese día abajo');
  await page.click('.att-plan tbody tr:first-child td.att-c:nth-child(2)');
  await settle(page, 300);
  check(/Domingo 1 nov de 2026/i.test(await page.textContent('.att-quick')), 'y también tocando una casilla');
  await ctx.close();

  // 4) En el teléfono no cambia.
  const tctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const tp = await tctx.newPage();
  await tp.goto(BASE);
  await tp.waitForSelector('.empty h2');
  const J = await seed(tp);
  await tp.reload();
  await tp.waitForSelector('#f-list [data-act="open-inv"]');
  await tp.click('[data-act="backup-later"]').catch(() => {});
  await tp.click('[data-act="filter"][data-f="todas"]').catch(() => {});
  await tp.click(`#f-list [data-act="open-inv"][data-id="${J.a}"]`);
  await tp.waitForSelector('#inv-form');
  check(!(await tp.$('.sheet.review')) && (await tp.isVisible('#inv-form .preview')), 'teléfono: la factura se abre como siempre (con su miniatura)');
  await tp.click('.sheet-h [data-act="sheet-close"]');
  await tp.evaluate(() => document.querySelector('.tabs [data-tab="asistencia"]').click());
  await tp.waitForSelector('.att-row');
  check(!(await tp.isVisible('.att-plan')) && (await tp.isVisible('.att-days')), 'teléfono: el pase de lista como siempre');
  await tctx.close();

  console.log('problemas:', problems.length ? problems : 'ninguno');
  await browser.close();
  server.close();
  process.exit(problems.length ? 1 : 0);
})().catch((e) => { console.error(e); console.log('problemas:', problems); process.exit(1); });
