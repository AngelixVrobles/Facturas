// Automatización: QR de la orden (la foto de la orden firmada se adjunta sola) y enlace automático factura → orden.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = process.env.APP_ROOT || path.resolve(__dirname, '..');
const SP = process.env.PRUEBAS_TMP || path.join(require('os').tmpdir(), 'facturas-pruebas');
const OUT = path.join(SP, 'test-excel');
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
const answers = [];
const problems = [];
const check = (cond, msg) => { console.log((cond ? 'OK   ' : 'FALLA') + ' ' + msg); if (!cond) problems.push(msg); };
const xml = (rnc, name, encf, total, itbis, oc) => `<?xml version="1.0" encoding="utf-8"?>
<ECF><Encabezado><Version>1.0</Version>
<IdDoc><TipoeCF>31</TipoeCF><eNCF>${encf}</eNCF><FechaVencimientoSecuencia>31-12-2027</FechaVencimientoSecuencia></IdDoc>
<Emisor><RNCEmisor>${rnc}</RNCEmisor><RazonSocialEmisor>${name}</RazonSocialEmisor><FechaEmision>02-11-2026</FechaEmision></Emisor>
<Comprador><RNCComprador>104595114</RNCComprador><RazonSocialComprador>SUCRE B. LANTIGUA CONSTRUCTORA, S.R.L.</RazonSocialComprador>${oc ? `<NumeroOrdenCompra>${oc}</NumeroOrdenCompra>` : ''}</Comprador>
<Totales><TotalITBIS>${itbis}</TotalITBIS><MontoTotal>${total}</MontoTotal></Totales></Encabezado></ECF>`;

async function docs(page, coll) {
  return page.evaluate((c) => new Promise((r) => { const un = RT.db.collection(c).onSnapshot((s) => { un(); r(s.docs.map((d) => ({ id: d.id, ...d.data() }))); }); }), coll);
}
async function upload(page, file) {
  await page.setInputFiles('#file-input', file);
  await page.waitForFunction(() => { const h = document.querySelector('#queue .q-head'); return h && /Listo/.test(h.textContent); }, null, { timeout: 90000 });
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
async function newOrder(page, { proj, sup, items, pdf }) {
  await page.click('[data-tab="ordenes"]');
  await page.click('#o-new');
  await page.waitForSelector('#order-form');
  await page.selectOption('#o-proj', proj);
  await page.fill('#o-sup', sup);
  for (let k = 0; k < items.length; k++) {
    if (k >= 3) await page.click('[data-act="order-add-item"]');
    await page.fill(`#o-items [data-row] >> nth=${k} >> [data-f="qty"]`, items[k][0]);
    await page.fill(`#o-items [data-row] >> nth=${k} >> [data-f="unit"]`, items[k][1]);
    await page.fill(`#o-items [data-row] >> nth=${k} >> [data-f="desc"]`, items[k][2]);
  }
  if (pdf) return download(page, '[data-act="order-pdf"]', pdf);
  await page.click('#order-form button[type="submit"]');
  await page.waitForSelector('#order-form', { state: 'detached' });
  return null;
}

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const BASE = `http://127.0.0.1:${server.address().port}/facturas/`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) problems.push('consola: ' + m.text()); });
  page.on('pageerror', (e) => problems.push('error de página: ' + e.message));
  await page.goto(BASE);
  await page.waitForSelector('.empty h2');
  // Datos sembrados directo en la base del teléfono (la captura ya se prueba en las otras pruebas).
  await page.evaluate(async () => {
    const db = RT.db;
    const t0 = '2026-11-01T10:00:00.000Z';
    await db.doc('settings/general').set({ company: 'SUCRE B. LANTIGUA CONSTRUCTORA, S.R.L.', companyRnc: '104595114', preparedBy: 'Departamento de Sistemas' });
    const pA = db.collection('projects').doc(); await pA.set({ name: 'Caperuza 2', createdAt: t0 });
    const pB = db.collection('projects').doc(); await pB.set({ name: 'Torre Piantini', createdAt: t0 });
    const o1 = db.collection('orders').doc(); await o1.set({ number: 1, date: '2026-10-30', projectId: pA.id, supplier: 'FER. LA CASA DEL CONSTRUCTOR', requestedBy: 'Ing. Ramón Peña', department: 'Obra', place: 'Caperuza 2', neededDate: '2026-11-02', items: [{ qty: 12, unit: 'Tubo', desc: 'Tubo PVC 2"' }, { qty: 2.5, unit: 'Galón', desc: 'Pintura' }], notes: '', status: 'autorizada', signedAt: '2026-10-31', createdAt: t0 });
    const o2 = db.collection('orders').doc(); await o2.set({ number: 2, date: '2026-10-31', projectId: pB.id, supplier: 'Ferretería Ochoa, SRL', requestedBy: 'Pedro', department: '', place: '', neededDate: '', items: [{ qty: 100, unit: 'Funda', desc: 'Cemento' }], notes: 'Urgente', status: 'enviada', createdAt: t0 });
    const base = { concept: '', ref: '', notInvoice: false, fileId: null, fileType: 'image/jpeg', thumbId: null, pages: 1, fileName: 'x.jpg', xmlId: null, ai: 'off', buyerRnc: '104595114', createdAt: '2026-11-02T10:00:00.000Z' };
    const url = 'https://ecf.dgii.gov.do/ecf/ConsultaTimbre?RncEmisor=132273788&RncComprador=104595114&ENCF=E310000004601&FechaEmision=02-11-2026&MontoTotal=1180.00&FechaFirma=02-11-2026%2010:15:22&CodigoSeguridad=kP7v2Q';
    await db.collection('invoices').doc().set({ ...base, projectId: pA.id, supplier: 'FER. LA CASA DEL CONSTRUCTOR', rnc: '132273788', number: 'E310000004601', date: '2026-11-02', amount: 1180, itbis: 180, currency: 'DOP', fiscal: 'qr', qrUrl: url, orderId: o1.id, ncfExpiry: '2027-12-31' });
    await db.collection('invoices').doc().set({ ...base, projectId: pB.id, supplier: 'Importadora Caribe', rnc: '101555122', number: 'B0100000123', date: '2026-11-01', amount: 500, itbis: 76.27, currency: 'USD', fiscal: '', qrUrl: '', concept: 'Bomba sumergible' });
    await db.collection('invoices').doc().set({ ...base, projectId: pA.id, supplier: 'Colmado La Esquina', rnc: '', number: 'B0200004567', date: '2026-11-01', amount: 590, itbis: 90, currency: 'DOP', fiscal: '', qrUrl: '', noOrder: true, concept: 'Agua y hielo' });
    await db.collection('invoices').doc().set({ ...base, projectId: pB.id, supplier: 'Ferretería Ochoa, SRL', rnc: '131023452', number: 'E310000000789', date: '2026-11-02', amount: 2360, itbis: 360, currency: 'DOP', fiscal: 'xml', qrUrl: '', fileType: 'application/xml', orderId: o2.id, ai: 'off' });
  });
  await page.reload();
  await page.waitForSelector('#f-list [data-act="open-inv"]');
  await page.click('[data-act="filter"][data-f="todas"]');
  const f = await download(page, '[data-act="list-xlsx"]', 'lista.xlsx');
  const out = execFileSync('python3', ['-I', '-c', `
import openpyxl, sys, json
wb = openpyxl.load_workbook(sys.argv[1])
res = {'hojas': wb.sheetnames}
ws = wb['Facturas']; rows = list(ws.iter_rows(values_only=True)); h = rows[4]
res['cols'] = list(h)
data = [dict(zip(h, r)) for r in rows[5:] if r[0] is not None and isinstance(r[0], int)]
res['estado_orden'] = sorted(str(d['Estado de la orden']) for d in data)
res['moneda'] = sorted(set(d['Moneda'] for d in data))
res['link'] = [str(ws.cell(row=6 + k, column=h.index('Verificar en la DGII') + 1).value or '')[:40] for k in range(len(data))]
res['tot'] = [[c for c in r if c not in (None, '')] for r in rows[5 + len(data):]]
ws = wb['Por proveedor']; rows = list(ws.iter_rows(values_only=True))
res['prov'] = [[c for c in r[:6]] for r in rows[5:] if r[0]]
ws = wb['Resumen']; res['control'] = [[c for c in r[:2]] for r in ws.iter_rows(values_only=True) if r and r[0] and r[1] is not None and not isinstance(r[1], str)][-6:]
res['ordenes'] = [r[0] for r in list(wb['Órdenes'].iter_rows(values_only=True))[5:] if r[0]]
res['articulos'] = len([r for r in list(wb['Artículos'].iter_rows(values_only=True))[5:] if r[0]])
print(json.dumps(res, ensure_ascii=False, default=str))
`, f]).toString();
  const r = JSON.parse(out);
  check(r.hojas.join('|') === 'Resumen|Facturas|Por proveedor|Órdenes|Artículos', 'hojas: ' + r.hojas.join(', '));
  check(['Subtotal', 'Vence NCF', 'Estado de la orden', 'Solicitado por', 'Datos tomados de', 'Avisos', 'Verificar en la DGII', 'Agregada', 'Moneda'].every((c) => r.cols.includes(c)), 'columnas nuevas en Facturas (' + r.cols.length + ' columnas)');
  check(r.estado_orden.join('|') === 'Firmada|No lleva|Por firmar|Sin orden', 'estado de la orden por factura: ' + r.estado_orden.join(', '));
  check(r.moneda.join('|') === 'DOP|USD', 'columna Moneda con RD$ y US$');
  check(r.link.some((x) => /^=HYPERLINK\("https:\/\/ecf\.dgii\.gov\.do/.test(x)), 'enlace «Verificar» a la DGII en la factura con QR');
  console.log('     totales:', JSON.stringify(r.tot));
  check(r.tot.length === 2 && /SUMIF/.test(JSON.stringify(r.tot)), 'dos filas de total (RD$ y US$) con SUMIF');
  console.log('     por proveedor:', JSON.stringify(r.prov));
  check(r.prov.length >= 4, 'hoja Por proveedor con cada proveedor');
  console.log('     control:', JSON.stringify(r.control));
  check(r.ordenes.join('|') === 'OC-0001|OC-0002' && r.articulos === 3, 'hojas Órdenes (2) y Artículos (3)');
  // LibreOffice: abre el archivo y calcula las fórmulas
  const lo = path.join(OUT, 'lo');
  fs.mkdirSync(lo, { recursive: true });
  try {
    execFileSync('soffice', ['--headless', '--convert-to', 'pdf', '--outdir', lo, f], { timeout: 120000, stdio: 'pipe' });
    const txt = execFileSync('pdftotext', ['-layout', path.join(lo, 'lista.pdf'), '-']).toString();
    check(/RD\$4,130\.00/.test(txt) && /US\$500\.00/.test(txt), 'LibreOffice lo abre y calcula los totales (RD$4,130.00 y US$500.00)');
    fs.writeFileSync(path.join(OUT, 'lista.txt'), txt);
  } catch (e) { check(false, 'LibreOffice no pudo abrir el Excel: ' + e.message.slice(0, 200)); }
  console.log('problemas:', problems.length ? problems : 'ninguno');
  await browser.close();
  server.close();
  process.exit(problems.length ? 1 : 0);
})().catch((e) => { console.error('FALLO', e); process.exit(2); });
