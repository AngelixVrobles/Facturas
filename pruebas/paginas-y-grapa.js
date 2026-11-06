// Varias páginas por factura y separar la grapa: factura + orden firmada en un PDF, agregar página, «Es otra página»,
// separar páginas a mano y lectura con todas las páginas.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = process.env.APP_ROOT || path.resolve(__dirname, '..');
const SP = process.env.PRUEBAS_TMP || path.join(require('os').tmpdir(), 'facturas-pruebas');
const SAMPLES = path.join(SP, 'muestras-conduce');
const OUT = path.join(SP, 'test-paginas');
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
const pdfPages = (f) => Number(execFileSync('pdfinfo', [f]).toString().match(/Pages:\s+(\d+)/)[1]);
async function docs(page, coll) {
  return page.evaluate((c) => new Promise((r) => { const un = RT.db.collection(c).onSnapshot((s) => { un(); r(s.docs.map((d) => ({ id: d.id, ...d.data() }))); }); }), coll);
}
async function upload(page, files) {
  await page.setInputFiles('#file-input', files);
  await page.waitForFunction(() => { const h = document.querySelector('#queue .q-head'); return h && /Listo/.test(h.textContent); }, null, { timeout: 90000 });
  await page.waitForTimeout(700);
  const state = (await page.textContent('#queue .q-list')).replace(/\s+/g, ' ').trim();
  await page.click('[data-act="queue-clear"]').catch(() => {});
  return state;
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
const openInvId = async (page, id) => { await page.click(`#f-list [data-act="open-inv"][data-id="${id}"]`); await page.waitForSelector('#inv-form'); await settle(page, 300); };
// PDF con páginas de texto (reportlab); una página puede ser una imagen (la orden escaneada).
const makePdf = (file, pagesSpec) => execFileSync('python3', ['-I', '-c', `
import sys, json
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
out, spec = sys.argv[1], json.loads(sys.argv[2])
c = canvas.Canvas(out, pagesize=letter)
for p in spec:
    if 'image' in p:
        c.drawImage(p['image'], 0, 0, width=612, height=792, preserveAspectRatio=True, anchor='n')
    else:
        y = 740
        for line in p['lines']:
            c.setFont('Helvetica', 12); c.drawString(60, y, line); y -= 22
    c.showPage()
c.save()
`, file, JSON.stringify(pagesSpec)]);

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const BASE = `http://127.0.0.1:${server.address().port}/facturas/`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, acceptDownloads: true });
  const reads = [];
  await ctx.route('https://api.anthropic.com/**', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const body = JSON.parse(route.request().postData() || '{}');
    const imgs = (body.messages || []).flatMap((m) => (Array.isArray(m.content) ? m.content : [])).filter((b) => b.type === 'image').length;
    reads.push(imgs);
    const ans = { es_factura: true, tipo_documento: 'factura', proveedor: 'Ferretería Americana', rnc_proveedor: '101001577', ncf: 'B0100000444', ncf_vence: '', fecha: '2026-11-05', itbis: '180', total: '1180', moneda: 'DOP', concepto: 'Materiales', proyecto: '', rnc_cliente: '104595114', referencia: '', conduces: '', conduce_numero: '', material: '', cantidad: '', viajes: '' };
    route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify({ id: 'msg', type: 'message', role: 'assistant', model: body.model, content: [{ type: 'text', text: JSON.stringify(ans) }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } }) });
  });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) problems.push('consola: ' + m.text()); });
  page.on('pageerror', (e) => problems.push('error de página: ' + e.message));
  await page.goto(BASE);
  await page.waitForSelector('.empty h2');
  const ids = await page.evaluate(async () => {
    await RT.db.doc('settings/general').set({ company: 'SUCRE B. LANTIGUA CONSTRUCTORA, S.R.L.', companyRnc: '104595114' });
    const p = RT.db.collection('projects').doc(); await p.set({ name: 'Residencial ENZO', createdAt: '2026-09-01T10:00:00.000Z' });
    const o = RT.db.collection('orders').doc();
    await o.set({ number: 12, date: '2026-11-04', projectId: p.id, supplier: 'Ferretería Ochoa', requestedBy: 'William', department: 'Obra', place: 'ENZO', neededDate: '', items: [{ qty: 10, unit: 'Funda', desc: 'Cemento gris' }], notes: '', status: 'enviada', createdAt: '2026-11-04T08:00:00.000Z' });
    return { p: p.id, o: o.id };
  });
  await page.reload();
  await page.click('[data-act="backup-later"]').catch(() => {});

  // 1) Factura y orden firmada escaneadas juntas en un PDF: la orden va a su orden y la factura queda enlazada.
  await page.click('[data-tab="ordenes"]');
  await page.click(`[data-act="open-order"][data-id="${ids.o}"]`);
  await page.waitForSelector('#order-form');
  const orderPdf = await download(page, '[data-act="order-pdf"]', 'orden.pdf');
  if (await page.$('#order-form')) await closeSheet(page);
  execFileSync('pdftoppm', ['-r', '200', '-png', '-singlefile', orderPdf, path.join(OUT, 'orden-escaneada')]);
  const staple = path.join(OUT, 'grapa.pdf');
  makePdf(staple, [{ lines: ['FERRETERIA OCHOA, SRL   RNC 131023452', 'FACTURA DE CREDITO FISCAL   NCF: B0100000999', 'Fecha: 06/11/2026', '10 fundas de cemento gris', 'TOTAL RD$ 5,900.00'] }, { image: path.join(OUT, 'orden-escaneada.png') }]);
  await page.click('[data-tab="facturas"]');
  const q1 = await upload(page, [staple]);
  console.log('     cola:', q1);
  let invs = await docs(page, 'invoices');
  let ords = await docs(page, 'orders');
  const st = invs[0];
  const o12 = ords.find((x) => x.id === ids.o);
  check(invs.length === 1 && st.pages === 1 && st.orderId === ids.o, 'el PDF engrapado: queda la factura (1 página) enlazada a OC-0012');
  check(o12.status === 'autorizada' && !!o12.signedFileId && o12.signedFileType === 'application/pdf', 'la página de la orden quedó como su copia firmada (OC-0012 firmada)');
  check(/con la orden OC-0012 firmada/.test(q1), 'la cola dice que separó la orden');

  // 2) Agregar página a una factura: se ve, se cuenta y entra en el PDF del pago.
  await upload(page, [path.join(SAMPLES, 'conduce.jpg')]);
  invs = await docs(page, 'invoices');
  const photo = invs.find((i) => i.id !== st.id);
  await openInvId(page, st.id);
  const [ch] = await Promise.all([page.waitForEvent('filechooser'), page.click('[data-act="page-add"]')]);
  await ch.setFiles(path.join(SAMPLES, 'conduce-2.jpg'));
  await page.waitForFunction(() => /2 páginas/.test((document.querySelector('.pages-line') || {}).textContent || ''), null, { timeout: 20000 });
  invs = await docs(page, 'invoices');
  check((invs.find((i) => i.id === st.id).extraPages || []).length === 1, 'la factura tiene una página más');
  await page.screenshot({ path: path.join(OUT, 'factura-paginas.png') });
  await page.click('.pages-line .pg-img');
  await page.waitForSelector('#viewer:not([hidden]) .viewer-b');
  await page.waitForFunction(() => document.querySelectorAll('#viewer-b img, #viewer-b canvas').length >= 2, null, { timeout: 20000 });
  check(true, 'el visor muestra las dos páginas');
  await page.click('[data-act="viewer-close"]');
  await closeSheet(page);

  // 3) «Es otra página»: la foto que entró sola pasa a ser página de su factura.
  await openInvId(page, photo.id);
  await page.click('[data-act="inv-to-page"]');
  await page.waitForSelector(`[data-act="page-merge"][data-to="${st.id}"]`);
  await page.click(`[data-act="page-merge"][data-to="${st.id}"]`);
  await page.waitForSelector('#inv-form');
  await settle(page, 700);
  invs = await docs(page, 'invoices');
  check(invs.length === 1 && (invs[0].extraPages || []).length === 2, '«Es otra página»: queda una sola factura con 3 páginas');
  if (await page.$('#inv-form')) await closeSheet(page);

  // Pago: el PDF lleva la portada, las 3 páginas de la factura y la orden firmada.
  await page.click('[data-act="new-pay-from"]');
  await page.fill('#pk-name', 'Pago Ochoa');
  await page.click('#pk-go');
  await page.waitForSelector('#pd-body .bigtotal');
  const payPdf = await download(page, '[data-act="pay-pdf"]', 'pago.pdf');
  check(pdfPages(payPdf) === 5, `PDF del pago: portada + 3 páginas de la factura + la orden firmada = ${pdfPages(payPdf)}`);

  // 4) Separar páginas a mano: factura, conduce y otra factura en un PDF.
  const mixed = path.join(OUT, 'mezcla.pdf');
  makePdf(mixed, [{ lines: ['AGREGADOS S. LOPEZ', 'FACTURA NCF B0100000321', 'TOTAL RD$ 8,000.00'] }, { lines: ['CONDUCE No. 555', 'Material: Arena', 'Cantidad: 5 mts', 'Total RD$ 8,000'] }, { lines: ['BLOQUES DEL CIBAO', 'FACTURA NCF B0100000654', 'TOTAL RD$ 4,720.00'] }]);
  await page.click('[data-tab="facturas"]');
  await upload(page, [mixed]);
  invs = await docs(page, 'invoices');
  const mx = invs.find((i) => i.fileName === 'mezcla.pdf');
  check(mx && mx.pages === 3, 'el PDF mezclado entró como una factura de 3 páginas');
  await page.click('[data-act="filter"][data-f="todas"]');
  await openInvId(page, mx.id);
  await page.click('[data-act="split-open"]');
  await page.waitForSelector('#split-b select[data-split="3"]', { timeout: 30000 });
  await settle(page, 400);
  await page.screenshot({ path: path.join(OUT, 'separar.png') });
  await page.selectOption('#split-b select[data-split="2"]', 'conduce');
  await page.selectOption('#split-b select[data-split="3"]', 'otra');
  await page.click('[data-act="split-go"]');
  await page.waitForSelector('#sheet-root', { state: 'hidden', timeout: 30000 });
  await settle(page, 800);
  invs = await docs(page, 'invoices');
  const conds = await docs(page, 'conduces');
  const mx2 = invs.find((i) => i.id === mx.id);
  check(mx2.pages === 1 && conds.length === 1 && conds[0].invoiceId === mx.id && invs.length === 3, 'separado: la factura queda con 1 página, un conduce adjunto y otra factura aparte');

  // 5) La lectura ve todas las páginas.
  await page.click('#settings-btn');
  await page.fill('#st-key', 'sk-ant-prueba');
  await page.click('#settings-form button[type="submit"]');
  await page.waitForSelector('#settings-form', { state: 'detached' });
  await openInvId(page, st.id);
  await page.click('[data-act="inv-ai"]');
  await page.waitForFunction(() => /datos leídos otra vez/.test(document.querySelector('#toast').textContent || ''), null, { timeout: 30000 });
  console.log('     imágenes por lectura:', JSON.stringify(reads));
  check(reads.length >= 1 && reads[reads.length - 1] === 2, 'al leer, van las 2 fotos de las otras páginas (el PDF de la factura va como texto)');

  console.log('problemas:', problems.length ? problems : 'ninguno');
  await browser.close();
  server.close();
  process.exit(problems.length ? 1 : 0);
})().catch((e) => { console.error(e); console.log('problemas:', problems); process.exit(1); });
