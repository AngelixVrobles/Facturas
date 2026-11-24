// Saldo a favor por devoluciones (hoja de devolución: registrar con lectura, descontar en el pago con PDF y Excel, devuelto en cheque, papelera, convertir una «factura») y equipos (andamios) aparte en Conduces.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = process.env.APP_ROOT || path.resolve(__dirname, '..');
const SP = process.env.PRUEBAS_TMP || path.join(require('os').tmpdir(), 'facturas-pruebas');
const OUT = path.join(SP, 'test-devol');
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
const crs = (page) => docs(page, 'creditos');
const sheetTxt = (page) => txt(page, '.sheet');

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const BASE = `http://127.0.0.1:${server.address().port}/facturas/`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, acceptDownloads: true });
  const calls = [];
  await ctx.route('https://api.anthropic.com/**', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const body = JSON.parse(route.request().postData() || '{}');
    calls.push(body);
    const ans = answers.length ? answers.shift() : { ok: true };
    route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify({ id: 'msg', type: 'message', role: 'assistant', model: body.model, content: [{ type: 'text', text: JSON.stringify(ans) }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 10, output_tokens: 10 } }) });
  });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' && !/404|Failed to fetch|net::/.test(m.text())) problems.push('consola: ' + m.text()); });
  page.on('pageerror', (e) => problems.push('error de página: ' + e.message));
  await page.goto(BASE);
  await page.waitForSelector('.empty h2');
  const I = await page.evaluate(async (d) => {
    const db = RT.db;
    await db.doc('settings/general').set({ company: 'SUCRE B. LANTIGUA CONSTRUCTORA, S.R.L.', companyRnc: '104595114', preparedBy: 'A. Robles' });
    const e = db.collection('projects').doc(); await e.set({ name: 'ENZO', createdAt: '2026-09-01T10:00:00.000Z' });
    await db.collection('suppliers').doc().set({ name: 'Herrería Peña', rnc: '131000111', createdAt: '2026-09-01T10:00:00.000Z' });
    const base = { projectId: e.id, concept: 'Materiales', ref: '', buyerRnc: '104595114', notInvoice: false, noOrder: true, fileId: null, ai: 'off', currency: 'DOP', itbis: 0, createdAt: '2026-11-01T10:00:00.000Z' };
    const add = async (x) => { const r = db.collection('invoices').doc(); await r.set({ ...base, ...x }); return r.id; };
    const i1 = await add({ supplier: 'Herrería Peña', rnc: '131000111', number: 'B0100000501', date: d.m14, amount: 10000 });
    const i2 = await add({ supplier: 'Herrería Peña', rnc: '131000111', number: 'B0100000502', date: d.m3, amount: 8000 });
    const i3 = await add({ supplier: 'Ferretería Ochoa', rnc: '131023452', number: 'B0100000600', date: d.m3, amount: 3000 });
    const i4 = await add({ supplier: 'Herrería Peña', rnc: '131000111', number: '', date: d.m2, amount: 1500, concept: 'Devolución de varillas' });
    const p1 = db.collection('payments').doc(); await p1.set({ name: 'Pago semana 46', number: 1, date: d.m13, status: 'pagado', presentedAt: d.m13, paidAt: d.m12, invoiceIds: [i1], createdAt: '2026-11-02T10:00:00.000Z' });
    const p2 = db.collection('payments').doc(); await p2.set({ name: 'Pago semana 48', number: 2, date: d.m1, status: 'armando', invoiceIds: [i2, i3], createdAt: '2026-11-20T10:00:00.000Z' });
    const cbase = { invoiceId: null, projectId: e.id, projectHint: '', rnc: '', currency: 'DOP', fileId: null, fileType: 'image/jpeg', thumbId: null, pages: 1, ai: 'off', aiErr: '', auto: false, qty: '', trips: 1, total: null };
    const c = async (x) => { const r = db.collection('conduces').doc(); await r.set({ ...cbase, ...x }); return r.id; };
    const and = await c({ number: '5501', date: d.m4, supplier: 'Andamios del Caribe', material: 'Andamios 10 cuerpos', createdAt: d.m4 + 'T12:00:00.000Z' });
    const gen = await c({ number: '880', date: d.m2, supplier: 'Rentas Pérez', material: 'Generador eléctrico 5 kw', createdAt: d.m2 + 'T12:00:00.000Z' });
    const cal = await c({ number: '40700', date: d.m1, supplier: 'Transporte y Agregados S. López', material: 'Caliche 5 MT', createdAt: d.m1 + 'T12:00:00.000Z' });
    return { e: e.id, i1, i2, i3, i4, p1: p1.id, p2: p2.id, and, gen, cal };
  }, { m1: dayIso(-1), m2: dayIso(-2), m3: dayIso(-3), m4: dayIso(-4), m12: dayIso(-12), m13: dayIso(-13), m14: dayIso(-14) });
  await page.reload();
  // La clave de API (la lectura automática se simula).
  await page.click('#settings-btn');
  await page.fill('#st-key', 'sk-ant-prueba');
  await page.click('#settings-form button[type="submit"]');
  await page.waitForSelector('#settings-form', { state: 'detached' });
  await page.click('[data-act="backup-later"]').catch(() => {});
  const foto = path.join(OUT, 'hoja.png');
  await page.screenshot({ path: foto, clip: { x: 0, y: 0, width: 390, height: 500 } });

  // 1) En «Pagos»: registrar la hoja de devolución; con la foto se leen sus datos.
  await page.evaluate(() => document.querySelector('.tabs [data-tab="pagos"]').click());
  await page.waitForSelector('[data-act="cr-new"]');
  check(/Registrar una devolución \(saldo a favor\)/.test(await txt(page, '#pl')), '«Pagos» tiene «Registrar una devolución (saldo a favor)»');
  await page.click('[data-act="cr-new"]');
  await page.waitForSelector('#cr-form');
  check(/queda a favor de la empresa y se descuenta en el próximo pago/.test(await sheetTxt(page)), 'la hoja explica qué es el saldo a favor');
  answers.push({ proveedor: 'Herrería Peña', rnc_proveedor: '131000111', numero: 'No. 77', fecha: dayIso(-1), monto: '2,500.00', moneda: 'DOP', factura_referencia: 'B0100000501', articulos: '2 tubos de 4" y 1 llave de paso' });
  await page.setInputFiles('#cr-file-in', foto);
  await page.waitForFunction(() => /Datos leídos de la hoja/.test(document.querySelector('#cr-ai').textContent), null, { timeout: 15000 });
  const sent = calls[calls.length - 1];
  check(/hoja de devolución/.test(JSON.stringify(sent.messages || '')), 'la lectura pide los datos de la hoja de devolución');
  const vals = await page.evaluate(() => { const v = (id) => document.getElementById(id).value; return { sup: v('cr-sup'), rnc: v('cr-rnc'), num: v('cr-num'), amt: v('cr-amt'), date: v('cr-date'), inv: v('cr-inv'), what: v('cr-what') }; });
  console.log('     leído:', JSON.stringify(vals));
  check(vals.sup === 'Herrería Peña' && vals.rnc === '131000111' && vals.num === '77' && Number(vals.amt.replace(/,/g, '')) === 2500 && vals.date === dayIso(-1) && vals.inv === I.i1 && /2 tubos/.test(vals.what), 'se llenan proveedor, RNC, número, fecha, monto, la factura de lo devuelto y qué se devolvió');
  await page.screenshot({ path: path.join(OUT, 'registrar.png') });
  await page.click('#cr-save');
  await page.waitForSelector('#cr-form', { state: 'detached' });
  let c77 = await waitUntil(async () => (await crs(page)).find((c) => c.number === '77'), 5000);
  check(c77 && c77.amount === 2500 && c77.invoiceId === I.i1 && !!c77.fileId && c77.projectId === I.e && c77.by, 'queda registrada con su foto, su factura y la obra');
  await waitUntil(async () => /Saldo a favor\s*RD\$ ?2,500\.00/.test(await txt(page, '#cr-card')), 5000);
  const card = await txt(page, '#cr-card');
  check(/Saldo a favor\s*RD\$ ?2,500\.00/.test(card) && /Herrería Peña\s*RD\$ ?2,500\.00/.test(card) && /devolución No\. 77 del .* · ENZO\s*sin usar/.test(card), '«Pagos» muestra el saldo a favor por proveedor');

  // 2) La factura de lo devuelto lo dice; y «Para hacer» lo recuerda.
  await page.evaluate(() => document.querySelector('.tabs [data-tab="facturas"]').click());
  await page.click('#f-seg [data-f="todas"]');
  await page.click(`#f-list [data-act="open-inv"][data-id="${I.i1}"]`);
  await page.waitForSelector('#inv-form');
  check(/De esta factura se devolvió mercancía: RD\$ ?2,500\.00 quedaron a favor \(devolución No\. 77 del .*; disponible RD\$ ?2,500\.00\)/.test(await sheetTxt(page)), 'la factura original dice que de ella se devolvió y cuánto quedó a favor');
  await page.click('.sheet-h [data-act="sheet-close"]');
  await page.click('[data-act="todo-all"]').catch(() => {});
  check(/1\s*devolución con saldo a favor: RD\$ ?2,500\.00\. Se descuenta en el próximo pago a ese proveedor/.test(await txt(page, '#todo')), '«Para hacer» recuerda el saldo a favor');

  // 3) Al armar el pago a la herrería, se descuenta.
  await page.evaluate(() => document.querySelector('.tabs [data-tab="pagos"]').click());
  await page.click(`[data-act="open-pay"][data-id="${I.p2}"]`);
  await page.waitForSelector('#cr-pay');
  check(/Herrería Peña\s*Tiene RD\$ ?2,500\.00 a favor \(devolución No\. 77/.test(await txt(page, '#cr-pay')), 'el pago ofrece el saldo a favor de la herrería');
  await page.click('[data-act="pay-cr-add"]');
  await waitUntil(async () => ((await docs(page, 'payments')).find((p) => p.id === I.p2).credits || []).length === 1, 5000);
  check(((await docs(page, 'payments')).find((p) => p.id === I.p2).credits || [])[0].amount === 2500, 'se descuenta en el pago');
  await waitUntil(async () => /Total a pagar · 2 facturas\s*RD\$ ?8,500\.00/.test(await txt(page, '.bigtotal')), 5000);
  check(/Total a pagar · 2 facturas\s*RD\$ ?8,500\.00\s*Facturas RD\$ ?11,000\.00 · menos saldo a favor RD\$ ?2,500\.00/.test(await txt(page, '.bigtotal')), 'el total del pago: 11,000 menos 2,500 = 8,500');
  await page.screenshot({ path: path.join(OUT, 'pago.png') });

  // 4) El PDF: el total neto, en letras, el descuento por proveedor y en el detalle, y la hoja anexa.
  const pdf = await download(page, '[data-act="pay-pdf"]', 'pago.pdf');
  const pt = pdfText(pdf);
  fs.writeFileSync(path.join(OUT, 'pago.txt'), pt);
  check(/RD\$ ?8,500\.00/.test(pt) && /Facturas RD\$ ?11,000\.00 menos saldo a favor por devoluciones RD\$ ?2,500\.00/.test(pt) && /Ocho mil quinientos pesos con 00\/100/.test(pt), 'PDF: total a pagar 8,500 (y en letras), con el descuento explicado');
  check(/Herrería Peña\s+1-31-00011-1\s+1\s+RD\$ ?5,500\.00/.test(pt) && /menos saldo a favor \(devolución No\. 77/.test(pt), 'PDF: a la herrería se le pagan 5,500 (8,000 menos 2,500)');
  check(/Menos saldo a favor · Herrería Peña · devolución No\. 77[^\n]*-RD\$ ?2,500\.00/.test(pt) && /Total a pagar\s+RD\$ ?8,500\.00/.test(pt), 'PDF: en el detalle sale la línea del saldo a favor y el total a pagar');
  check(/Hoja de devolución No\. 77 · Herrería Peña · saldo a favor descontado en este pago: RD\$ ?2,500\.00/.test(pt), 'PDF: la hoja de devolución va anexa');
  // 5) El Excel.
  await page.waitForSelector('[data-act="pay-xlsx"]');
  const xl = await download(page, '[data-act="pay-xlsx"]', 'pago.xlsx');
  const xr = JSON.parse(execFileSync('python3', ['-I', '-c', `
import openpyxl, sys, json
wb = openpyxl.load_workbook(sys.argv[1])
rows = [[c for c in r] for r in wb['Resumen'].iter_rows(values_only=True)]
print(json.dumps([[r[0], r[4] if len(r) > 4 else None] for r in rows if r and r[0]], ensure_ascii=False, default=str))
`, xl]).toString());
  console.log('     excel:', JSON.stringify(xr.slice(-4)));
  check(xr.some((r) => /Herrería Peña · devolución No\. 77/.test(r[0]) && r[1] === -2500) && xr.some((r) => r[0] === 'Total a pagar' && r[1] === 8500), 'Excel: el saldo a favor descontado y el total a pagar');
  // 6) La lista de pagos muestra el neto; el saldo ya no está disponible.
  await page.click('[data-act="back"]').catch(() => {});
  await settle(page, 400);
  check(/Pago semana 48[^]*?RD\$ ?8,500\.00/.test(await txt(page, '#pl')), 'la lista de pagos muestra el total a pagar (8,500)');
  check(/No queda saldo a favor/.test(await txt(page, '#pl')) && /Ver las ya usadas \(1\)/.test(await txt(page, '#pl')), 'usada toda, la devolución pasa a «ya usadas»');
  await page.evaluate(() => document.querySelector('.tabs [data-tab="facturas"]').click());
  await settle(page, 300);
  check(!/devolución con saldo/.test(await txt(page, '#todo')), 'y «Para hacer» ya no la recuerda');
  await page.evaluate(() => document.querySelector('.tabs [data-tab="pagos"]').click());
  await settle(page, 300);
  // Quitarla del pago la deja disponible otra vez.
  await page.click(`[data-act="open-pay"][data-id="${I.p2}"]`);
  await page.waitForSelector('[data-act="pay-cr-rm"]');
  await page.click('[data-act="pay-cr-rm"]');
  await waitUntil(async () => !((await docs(page, 'payments')).find((p) => p.id === I.p2).credits || []).length, 5000);
  await waitUntil(async () => /Descontar RD\$ ?2,500\.00/.test(await txt(page, '#cr-pay')), 5000);
  check(/Descontar RD\$ ?2,500\.00/.test(await txt(page, '#cr-pay')), '«Quitar» la deja disponible otra vez');
  await page.click('[data-act="pay-cr-add"]');
  await waitUntil(async () => ((await docs(page, 'payments')).find((p) => p.id === I.p2).credits || []).length === 1, 5000);
  // Presentado y pagado: en el informe del jefe, lo pagado resta el saldo a favor.
  await page.click('[data-act="pay-status"][data-s="presentado"]');
  await page.waitForSelector('[data-act="pay-status"][data-s="pagado"]');
  await page.click('[data-act="pay-status"][data-s="pagado"]');
  await waitUntil(async () => (await docs(page, 'payments')).find((p) => p.id === I.p2).status === 'pagado', 5000);
  check(!(await page.$('[data-act="pay-cr-rm"]')), 'ya presentado, el descuento no se puede quitar');
  await page.click('[data-act="back"]').catch(() => {});
  await page.evaluate(() => document.querySelector('.tabs [data-tab="facturas"]').click());
  await page.click('#f-sum [data-act="inf-open"]');
  await page.waitForSelector('#inf-prev');
  const inf = await download(page, '[data-act="inf-pdf"]', 'informe.pdf');
  const it = pdfText(inf);
  check(/Saldo a favor, dev\. No\. 77\s+-RD\$ ?2,500\.00/.test(it), 'informe del jefe: en los pagos del período sale el saldo a favor restando');

  // 7) Otra devolución que el proveedor devolvió en cheque; y la papelera.
  await page.evaluate(async (x) => { await RT.db.collection('creditos').doc().set({ supplier: 'Herrería Peña', rnc: '131000111', number: '78', date: x.d, amount: 1000, currency: 'DOP', projectId: x.e, invoiceId: null, concept: 'Una varilla', notes: '', refund: null, createdAt: x.d + 'T10:00:00.000Z' }); }, { d: dayIso(-1), e: I.e });
  await page.evaluate(() => document.querySelector('.tabs [data-tab="pagos"]').click());
  await page.waitForSelector('#cr-card [data-act="cr-open"]');
  const c78 = (await crs(page)).find((c) => c.number === '78');
  await page.click(`#cr-card [data-act="cr-open"][data-id="${c78.id}"]`);
  await page.waitForSelector('.cr-rf summary');
  await page.click('.cr-rf summary');
  await page.selectOption('#cr-rf-how', 'Cheque');
  await page.click('[data-act="cr-refund"]');
  await waitUntil(async () => !!(await crs(page)).find((c) => c.number === '78').refund, 5000);
  check((await crs(page)).find((c) => c.number === '78').refund.how === 'Cheque', 'se anota que te lo devolvieron en cheque');
  await waitUntil(async () => /Te lo devolvieron: RD\$ ?1,000\.00 en cheque/.test(await sheetTxt(page)), 5000);
  check(/Te lo devolvieron: RD\$ ?1,000\.00 en cheque/.test(await sheetTxt(page)) && /Saldo\s*RD\$ ?0\.00/.test(await sheetTxt(page)), 'la devolución dice que te lo devolvieron y queda en 0');
  await page.click('[data-act="cr-del"]');
  await page.click('[data-act="cr-del-yes"]');
  await waitUntil(async () => !(await crs(page)).some((c) => c.number === '78'), 5000);
  await page.click('#toast .toast-act');
  await waitUntil(async () => (await crs(page)).some((c) => c.number === '78'), 5000);
  check((await crs(page)).some((c) => c.number === '78'), 'eliminar la manda a la papelera y «Deshacer» la recupera');
  c77 = (await crs(page)).find((c) => c.number === '77');
  await page.click('#cr-card [data-act="cr-all"]').catch(() => {});
  await page.waitForSelector(`#cr-card [data-act="cr-open"][data-id="${c77.id}"]`);
  await page.click(`#cr-card [data-act="cr-open"][data-id="${c77.id}"]`);
  await page.waitForSelector('#cr-form');
  check(/Está descontada en un pago: para borrarla, quítala primero de ese pago/.test(await sheetTxt(page)) && !(await page.$('[data-act="cr-del"]')) && /Pago semana 48/.test(await sheetTxt(page)), 'la que se usó en un pago dice en cuál y no se puede borrar');
  await page.click('.sheet-h [data-act="sheet-close"]');

  // 8) Una «factura» que en realidad es la hoja de devolución: se pasa a saldo a favor.
  await page.evaluate(() => document.querySelector('.tabs [data-tab="facturas"]').click());
  await page.click('#f-seg [data-f="todas"]');
  await page.click(`#f-list [data-act="open-inv"][data-id="${I.i4}"]`);
  await page.waitForSelector('[data-act="inv-to-cr"]');
  await page.click('[data-act="inv-to-cr"]');
  await waitUntil(async () => (await crs(page)).some((c) => c.amount === 1500), 5000);
  check((await crs(page)).some((c) => c.amount === 1500 && c.supplier === 'Herrería Peña') && !(await docs(page, 'invoices')).some((i) => i.id === I.i4), '«Es una hoja de devolución» la pasa a saldo a favor (y deja de ser factura)');
  await page.waitForSelector('#cr-form');
  await page.click('.sheet-h [data-act="sheet-close"]');
  // Y si se sube con «Agregar facturas», la lectura la reconoce sola.
  answers.push({ ...BLANK, es_factura: true, tipo_documento: 'devolucion', devolucion_numero: 'No. 91', proveedor: 'Herrería Peña', rnc_proveedor: '131000111', ncf: '', fecha: dayIso(-1), total: '1,200.00', concepto: 'Devolución de tornillos' });
  const f2 = path.join(OUT, 'devolucion.png');
  fs.copyFileSync(foto, f2);
  await page.setInputFiles('#file-input', f2);
  const c91 = await waitUntil(async () => (await crs(page)).find((c) => c.number === '91'), 20000);
  check(c91 && c91.amount === 1200 && c91.supplier === 'Herrería Peña' && !!c91.fileId, 'al subirla como factura, la lectura la reconoce y queda como saldo a favor');
  check(/Hoja de devolución/.test(await txt(page, '#queue')), 'la cola dice «Hoja de devolución»');

  // 9) Equipos: los andamios van aparte, con los días en la obra.
  await page.evaluate(() => document.querySelector('.tabs [data-tab="conduces"]').click());
  await page.waitForSelector('#c-seg [data-f="equipos"]');
  const n = async (f) => Number(await page.textContent(`#c-seg [data-f="${f}"] .n`));
  check(await n('equipos') === 1 && await n('esperando') === 2, 'los andamios salen en «Equipos» (solos, por el material), no en «Sin factura»');
  await page.click('#c-seg [data-f="equipos"]');
  await settle(page, 300);
  const eq = await txt(page, '#c-list');
  console.log('     equipos:', eq.slice(0, 300));
  check(/Equipos y alquileres \(andamios, puntales…\): van aparte de los materiales/.test(eq) && /Andamios del Caribe\s*1 conduce · 1 en la obra/.test(eq) && /Equipo, en la obra desde el [^(]+\(4 días\)/.test(eq), '«Equipos» dice cuántos días lleva el andamio en la obra');
  await page.click(`#c-list [data-act="open-cond"][data-id="${I.and}"]`);
  await page.waitForSelector('#c-kind');
  check(await page.inputValue('#c-kind') === 'equipo' && /Equipo en la obra desde el .*\(4 días\)\. Va aparte de los materiales/.test(await sheetTxt(page)), 'el conduce de andamios dice que es equipo y desde cuándo está');
  await page.fill('#c-ret', dayIso(-1));
  await page.click('#cond-save');
  await page.waitForSelector('#cond-form', { state: 'detached' });
  await waitUntil(async () => /devuelto el [^(]+\(3 días en la obra\)/.test(await txt(page, '#c-list')), 5000);
  check(/devuelto el [^(]+\(3 días en la obra\)/.test(await txt(page, '#c-list')) && /todo devuelto/.test(await txt(page, '#c-list')), 'al poner «Se devolvió el», queda con los días que estuvo (3)');
  // Un generador (el nombre no lo dice): se marca como equipo a mano.
  await page.click('#c-seg [data-f="esperando"]');
  await page.click(`#c-list [data-act="open-cond"][data-id="${I.gen}"]`);
  await page.waitForSelector('#c-kind');
  check(await page.inputValue('#c-kind') === 'material' && await page.isHidden('#c-ret-wrap'), 'el generador empieza como material');
  await page.selectOption('#c-kind', 'equipo');
  check(await page.isVisible('#c-ret-wrap'), 'al escoger «Equipo» sale «Se devolvió el»');
  await page.click('#cond-save');
  await page.waitForSelector('#cond-form', { state: 'detached' });
  await waitUntil(async () => (await n('equipos')) === 2, 5000);
  check(await n('equipos') === 2 && await n('esperando') === 1, 'marcado a mano, pasa a «Equipos»');
  await page.evaluate(() => document.querySelector('.tabs [data-tab="facturas"]').click());
  await settle(page, 300);
  await page.click('[data-act="todo-all"]').catch(() => {});
  check(/1\s*conduce esperando su factura/.test(await txt(page, '#todo')), '«Para hacer» no cuenta los equipos como conduces esperando factura');
  await page.screenshot({ path: path.join(OUT, 'final.png') });

  console.log('problemas:', problems.length ? problems : 'ninguno');
  await browser.close();
  server.close();
  process.exit(problems.length ? 1 : 0);
})().catch((e) => { console.error(e); console.log('problemas:', problems); process.exit(1); });
