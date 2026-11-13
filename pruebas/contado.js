// Facturas al contado o pagadas por fuera de la app: salen de pendientes; «hay que reponérselo» va en un pago como reposición;
// la lectura pregunta si ya se pagó cuando la factura dice contado; en la computadora, varias de una vez; Excel y PDF del pago.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = process.env.APP_ROOT || path.resolve(__dirname, '..');
const SP = process.env.PRUEBAS_TMP || path.join(require('os').tmpdir(), 'facturas-pruebas');
const OUT = path.join(SP, 'test-contado');
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
    const base = { projectId: p.id, concept: 'Materiales', ref: '', buyerRnc: '104595114', qrUrl: '', fiscal: '', notInvoice: false, noOrder: true, fileId: null, fileType: 'image/jpeg', thumbId: null, pages: 1, xmlId: null, ai: 'off', currency: 'DOP', itbis: 0, createdAt: '2026-11-10T13:00:00.000Z' };
    const ids = {};
    for (const [k, sup, rnc, ncf, amt] of [['a', 'Ferretería Ochoa', '131023452', 'B0100000101', 1500], ['b', 'Bloques del Cibao', '131555777', 'B0100000102', 2300], ['c', 'Pinturas Tropical', '130111222', 'B0100000103', 900], ['d', 'Arenera del Este', '130333444', 'B0100000104', 4000]]) {
      const r = RT.db.collection('invoices').doc(); await r.set({ ...base, supplier: sup, rnc, number: ncf, date: '2026-11-10', amount: amt }); ids[k] = r.id;
    }
    const pay = RT.db.collection('payments').doc(); await pay.set({ name: 'Pago semana 46', date: '2026-11-12', status: 'armando', invoiceIds: [ids.d], createdAt: '2026-11-12T10:00:00.000Z' });
    return { ...ids, pay: pay.id, proj: p.id };
  });
  await page.reload();
  await page.waitForSelector('#f-list [data-act="open-inv"]');
  await page.click('[data-act="backup-later"]').catch(() => {});
  check(await segN(page, 'pendientes') === 3 && await segN(page, 'tramite') === 1, 'al principio: 3 pendientes y 1 en trámite');

  // 1) Ya se pagó al contado: sale de pendientes y pasa a pagadas.
  await page.click(`#f-list [data-act="open-inv"][data-id="${I.a}"]`);
  await page.waitForSelector('#f-paymode');
  check(await page.isHidden('#f-pm-how'), 'normalmente, «se paga en un pago»: no pide cómo ni quién');
  await page.selectOption('#f-paymode', 'directo');
  check(await page.isVisible('#f-pm-how') && await page.isVisible('#f-pm-who') && (await page.inputValue('#f-paiddate')) === '2026-11-10', 'al escoger «ya se pagó», pide cómo, cuándo (la fecha de la factura) y quién');
  await page.selectOption('#f-paymethod', 'Efectivo');
  await page.fill('#f-paidby', 'Caja chica');
  await page.click('#inv-save');
  await page.waitForSelector('#sheet-root', { state: 'hidden' });
  await settle(page);
  let a = await inv(page, I.a);
  check(a.payMode === 'directo' && a.payMethod === 'Efectivo' && a.paidBy === 'Caja chica' && a.paidDate === '2026-11-10' && a.hist.some((h) => /ya pagada/.test(h.what)), 'queda guardado: ya pagada, en efectivo, el 10 de noviembre, por la caja chica (y en el historial)');
  check(await segN(page, 'pendientes') === 2 && await segN(page, 'pagadas') === 1 && !(await page.$(`#f-list [data-id="${I.a}"]`)), 'sale de pendientes (la principal) y pasa a pagadas');
  await page.click('#f-seg [data-f="pagadas"]');
  await settle(page, 300);
  check(/Efectivo/.test(await txt(page, `#f-list [data-id="${I.a}"]`)), 'en pagadas dice cómo se pagó');
  await page.click('#f-seg [data-f="pendientes"]');

  // 2) Al contado, hay que reponérselo: sigue pendiente y dice a quién.
  await page.click(`#f-list [data-act="open-inv"][data-id="${I.b}"]`);
  await page.waitForSelector('#f-paymode');
  await page.selectOption('#f-paymode', 'reponer');
  check((await txt(page, 'label[for="f-paidby"]')) === 'A quién hay que reponérselo', 'para reponer, pregunta a quién');
  await page.click('#inv-save');
  await settle(page, 300);
  check(/Escribe a quién hay que reponérselo/.test(await txt(page, '#toast')), 'sin la persona no se guarda');
  await page.fill('#f-paidby', 'Ing. Pérez');
  await page.click('#inv-save');
  await page.waitForSelector('#sheet-root', { state: 'hidden' });
  await settle(page);
  check((await inv(page, I.b)).payMode === 'reponer' && /Reponer a Ing\. Pérez/.test(await txt(page, `#f-list [data-id="${I.b}"]`)) && await segN(page, 'pendientes') === 2, 'sigue en pendientes, con «Reponer a Ing. Pérez»');

  // 3) Una que está en un pago no se puede marcar «ya se pagó» sin quitarla del pago.
  await page.click('#f-seg [data-f="tramite"]');
  await page.click(`#f-list [data-act="open-inv"][data-id="${I.d}"]`);
  await page.waitForSelector('#f-paymode');
  await page.selectOption('#f-paymode', 'directo');
  await page.click('#inv-save');
  await settle(page, 300);
  check(/Está en el pago «Pago semana 46»/.test(await txt(page, '#toast')) && !(await inv(page, I.d)).payMode, 'si está en un pago, avisa que primero hay que quitarla de ese pago');
  await page.click('.sheet-h [data-act="sheet-close"]');
  await page.click('#f-seg [data-f="pendientes"]');

  // 4) La reposición en el PDF del pago.
  const p2 = await page.evaluate(async (b) => { const r = RT.db.collection('payments').doc(); await r.set({ name: 'Reposiciones', date: '2026-11-13', status: 'armando', invoiceIds: [b], createdAt: '2026-11-13T10:00:00.000Z' }); return r.id; }, I.b);
  await page.evaluate(() => document.querySelector('.tabs [data-tab="pagos"]').click());
  await page.click(`[data-act="open-pay"][data-id="${p2}"]`);
  await page.waitForSelector('[data-act="pay-pdf"]');
  const pt = pdfText(await download(page, '[data-act="pay-pdf"]', 'pago.pdf'));
  check(/Reposición \(se pagó al contado\)/.test(pt) && /se le repone a Ing\. Pérez/.test(pt), 'el PDF del pago dice que es una reposición y a quién');
  await page.click('[data-act="back"]').catch(() => {});
  await page.evaluate(() => document.querySelector('.tabs [data-tab="facturas"]').click());
  await settle(page, 300);

  // 5) La lectura: si la factura dice contado, pregunta si ya se pagó.
  await page.click('#settings-btn');
  await page.fill('#st-key', 'sk-ant-prueba');
  await page.click('#settings-form button[type="submit"]');
  await page.waitForSelector('#settings-form', { state: 'detached' });
  const foto = path.join(OUT, 'factura.png');
  await page.screenshot({ path: foto });
  answers.push({ ...BLANK, proveedor: 'Ferretería Ochoa', rnc_proveedor: '131023452', ncf: 'B0100000199', fecha: '2026-11-13', total: '650.00', proyecto: 'Caperuza 2', condicion_pago: 'contado' });
  await page.setInputFiles('#file-input', foto);
  const e = await waitUntil(async () => (await docs(page, 'invoices')).find((i) => i.fileName === 'factura.png' && i.ai === 'done'), 25000);
  check(e && e.termsCheck === true && !e.payMode, 'la factura dice contado: no se da por pagada sola, queda la pregunta');
  await settle(page, 400);
  const todo = async () => { const more = await page.$('#todo [data-act="todo-all"]'); if (more && /Ver todo/.test(await more.textContent())) { await more.click(); await settle(page, 150); } return txt(page, '#todo'); };
  check(/revisar/i.test(await todo()) && /¿Ya se pagó\?/.test(await txt(page, `#f-list [data-id="${e.id}"]`)), 'sale en «Para hacer» para revisar, con «¿Ya se pagó?»');
  await page.click(`#f-list [data-act="open-inv"][data-id="${e.id}"]`);
  await page.waitForSelector('[data-act="pm-yes"]');
  check(/dice que es de contado/.test(await txt(page, '#sheet-root .sheet')), 'la factura pregunta si ya se pagó');
  await page.click('[data-act="pm-yes"]');
  await settle(page, 600);
  check((await inv(page, e.id)).payMode === 'directo' && (await inv(page, e.id)).paidDate === '2026-11-13', '«Sí, ya se pagó» la marca pagada con la fecha de la factura');
  await page.click('.sheet-h [data-act="sheet-close"]').catch(() => {});

  // 6) En la computadora: varias de una vez, y deshacer.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForSelector(`#f-list input[data-sel="inv"][value="${I.c}"]`);
  await page.check(`#f-list input[data-sel="inv"][value="${I.c}"]`);
  await page.waitForSelector('#sel-bar [data-act="sel-paid"]');
  await page.click('#sel-bar [data-act="sel-paid"]');
  await settle(page, 600);
  check((await inv(page, I.c)).payMode === 'directo' && /marcada como ya pagada/.test(await txt(page, '#toast')), 'en la computadora, «Ya se pagaron» marca las elegidas');
  await page.click('#toast .toast-act');
  await settle(page, 600);
  check(!(await inv(page, I.c)).payMode, '«Deshacer» las devuelve a pendientes');

  // 7) Excel: la forma de pago de cada una.
  await page.click('#f-seg [data-f="todas"]');
  await settle(page, 300);
  const xl = await download(page, '[data-act="list-xlsx"]', 'facturas.xlsx');
  const xr = JSON.parse(execFileSync('python3', ['-I', '-c', `
import openpyxl, sys, json
wb = openpyxl.load_workbook(sys.argv[1])
ws = wb['Facturas']
rows = list(ws.iter_rows(values_only=True))
h = rows[4]
print(json.dumps([dict(zip(h, r)).get('Forma de pago') for r in rows[5:] if r[0] is not None and isinstance(r[0], int)], ensure_ascii=False))
`, xl]).toString());
  console.log('     excel:', JSON.stringify(xr));
  check(xr.some((v) => /Ya pagada · efectivo · el 10 nov.* · pagó Caja chica/.test(v)) && xr.some((v) => /reponerle a Ing\. Pérez/.test(v)) && xr.some((v) => v === 'En un pago (a crédito)'), 'Excel: la columna «Forma de pago»');

  console.log('problemas:', problems.length ? problems : 'ninguno');
  await browser.close();
  server.close();
  process.exit(problems.length ? 1 : 0);
})().catch((e) => { console.error(e); console.log('problemas:', problems); process.exit(1); });
