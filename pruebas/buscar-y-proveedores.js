const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = process.env.APP_ROOT || path.resolve(__dirname, '..');
const SP = process.env.PRUEBAS_TMP || path.join(require('os').tmpdir(), 'facturas-pruebas');
const OUT = path.join(SP, 'test-buscar');
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
const sheetTxt = (page) => txt(page, '.sheet');
const tab = (page, t) => page.evaluate((x) => document.querySelector(`.tabs [data-tab="${x}"]`).click(), t);
const XML = `<?xml version="1.0" encoding="UTF-8"?>
<ECF><Encabezado><IdDoc><TipoeCF>31</TipoeCF><eNCF>E310000000077</eNCF><FechaVencimientoSecuencia>31-12-2027</FechaVencimientoSecuencia></IdDoc>
<Emisor><RNCEmisor>130000001</RNCEmisor><RazonSocialEmisor>Materiales Duarte SRL</RazonSocialEmisor><FechaEmision>20-11-2026</FechaEmision></Emisor>
<Comprador><RNCComprador>104595114</RNCComprador></Comprador><Totales><MontoTotal>4130.00</MontoTotal><TotalITBIS>630.00</TotalITBIS></Totales></Encabezado>
<DetallesItems><Item><NumeroLinea>1</NumeroLinea><NombreItem>BLOCK DE 6 PULGADAS</NombreItem><CantidadItem>100.00</CantidadItem><UnidadMedida>43</UnidadMedida><PrecioUnitarioItem>30.00</PrecioUnitarioItem><MontoItem>3000.00</MontoItem></Item>
<Item><NumeroLinea>2</NumeroLinea><NombreItem>ARENA LAVADA</NombreItem><CantidadItem>1</CantidadItem><UnidadMedida>m3</UnidadMedida><PrecioUnitarioItem>500.00</PrecioUnitarioItem><MontoItem>500.00</MontoItem></Item></DetallesItems></ECF>`;

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
    await db.collection('suppliers').doc().set({ name: 'Ferretería Gama', rnc: '131000222', phone: '809-555-0101', creditDays: 30, createdAt: '2026-09-01T10:00:00.000Z' });
    const png = await new Promise((r) => { const c = document.createElement('canvas'); c.width = 60; c.height = 80; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 60, 80); x.fillStyle = '#000'; x.fillText('FACTURA', 5, 20); c.toBlob(r, 'image/png'); });
    const img = await RT.assets.upload(png, { type: 'image/png' });
    const xml = await RT.assets.upload(new Blob([d.xml], { type: 'application/xml' }), { type: 'application/xml' });
    const base = { projectId: e.id, concept: '', ref: '', buyerRnc: '104595114', notInvoice: false, fileId: null, ai: 'done', currency: 'DOP', itbis: 0, createdAt: '2026-11-01T10:00:00.000Z' };
    const add = async (x) => { const r = db.collection('invoices').doc(); await r.set({ ...base, ...x }); return r.id; };
    const it = (qty, unit, desc, price, total) => ({ qty, unit, desc, price, total });
    const i1 = await add({ supplier: 'Ferretería Gama', rnc: '131000222', number: 'B0100004521', date: d.m10, amount: 5000, items: [it(10, 'Funda', 'CEMENTO GRIS PORTLAND 42.5KG', 450, 4500), it(20, '', 'VARILLA CORRUGADA 3/8 X 20', 25, 500)] });
    const i2 = await add({ supplier: 'Ferretería Gama', rnc: '131000222', number: 'B0100004533', date: d.m5, amount: 1200, items: [it(10, '', 'VARILLA 1/2 X 20', 100, 1000), it(5, 'lb', 'ALAMBRE DULCE', 40, 200)] });
    const i3 = await add({ supplier: 'Ferretería Gama', rnc: '131000222', number: 'B0100004602', date: d.m3, amount: 2400, fileId: img.id, fileType: 'image/png', thumbId: null, pages: 1 });
    const i4 = await add({ supplier: 'Ferretería Ochoa', rnc: '131023452', number: 'B0100000600', date: d.m4, amount: 900, items: [it(2, 'fundas', 'CEMENTO GRIS', 450, 900)] });
    const i5 = await add({ supplier: 'Materiales Duarte SRL', rnc: '130000001', number: 'E310000000077', date: d.m8, amount: 4130, itbis: 630, fiscal: 'xml', ai: 'off', fileId: xml.id, fileType: 'application/xml', xmlId: xml.id, pages: 1 });
    const i6 = await add({ supplier: '', rnc: '', number: '', date: '', amount: null, ai: 'off', fileId: img.id, fileType: 'image/png', thumbId: null, pages: 1, createdAt: '2026-11-27T10:00:00.000Z' });
    const i7 = await add({ supplier: '', rnc: '', number: '', date: d.m1, amount: 300, ai: 'off', createdAt: '2026-11-27T11:00:00.000Z' });
    const i8 = await add({ supplier: '', rnc: '', number: '', date: d.m1, amount: 150, ai: 'off', createdAt: '2026-11-27T12:00:00.000Z' });
    const ord = async (x) => { const r = db.collection('orders').doc(); await r.set({ projectId: e.id, department: 'Obra', place: 'ENZO', neededDate: '', notes: '', createdAt: '2026-11-02T10:00:00.000Z', ...x }); return r.id; };
    const o1 = await ord({ number: 1, date: d.m12, supplier: 'Ferretería Gama', requestedBy: 'Ing. Pérez', status: 'enviada', items: [{ qty: 20, unit: 'Unidad', desc: 'Varilla 3/8', price: null }, { qty: 10, unit: 'Funda', desc: 'Cemento gris', price: null }] });
    const o2 = await ord({ number: 2, date: d.m6, supplier: 'Ferretería Gama', requestedBy: 'ing. perez', status: 'enviada', items: [{ qty: 5, unit: 'Libra', desc: 'Alambre dulce', price: null }] });
    const o3 = await ord({ number: 3, date: d.m6, supplier: 'Ferretería Ochoa', requestedBy: 'María Gómez', status: 'borrador', items: [{ qty: 2, unit: 'Funda', desc: 'Cemento gris', price: null }] });
    const o4 = await ord({ number: 4, date: d.m4, supplier: 'Ferretería Gama', requestedBy: '', status: 'enviada', items: [{ qty: 3, unit: 'Unidad', desc: 'Malla electrosoldada', price: null }] });
    return { e: e.id, i1, i2, i3, i4, i5, i6, i7, i8, o1, o2, o3, o4 };
  }, { xml: XML, m1: dayIso(-1), m3: dayIso(-3), m4: dayIso(-4), m5: dayIso(-5), m6: dayIso(-6), m8: dayIso(-8), m10: dayIso(-10), m12: dayIso(-12) });
  await page.reload();
  await page.click('#settings-btn');
  await page.fill('#st-key', 'sk-ant-prueba');
  await page.click('#settings-form button[type="submit"]');
  await page.waitForSelector('#settings-form', { state: 'detached' });
  await page.click('[data-act="backup-later"]').catch(() => {});
  await page.click('#f-seg [data-f="todas"]');

  // 0) El XML de la factura electrónica trae sus renglones.
  const px = await page.evaluate((x) => RD.parseEcfXml(x).items, XML);
  check(px.length === 2 && px[0].qty === 100 && px[0].unit === '' && px[0].desc === 'BLOCK DE 6 PULGADAS' && px[0].price === 30 && px[0].total === 3000 && px[1].unit === 'm3', 'del XML de la e-CF salen sus renglones (cantidad, unidad, descripción, precio e importe)');

  // 1) Al leer una factura se guardan sus artículos.
  await page.click(`#f-list [data-act="open-inv"][data-id="${I.i6}"]`);
  await page.waitForSelector('#inv-form');
  answers.push({ ...BLANK, proveedor: 'Ferretería Gama', rnc_proveedor: '131000222', ncf: 'B0100004610', fecha: dayIso(-1), total: '750.00', articulos: [{ cantidad: '3', unidad: 'galones', descripcion: 'PINTURA ACRILICA BLANCA', precio: '250.00', importe: '750.00' }] });
  await page.click('[data-act="inv-ai"]');
  const r6 = await waitUntil(async () => { const x = await inv(page, I.i6); return x && Array.isArray(x.items) && x.items.length ? x : null; }, 15000);
  const sch = calls.length ? calls[calls.length - 1].output_config.format.schema : {};
  check(sch.required.includes('articulos') && /- articulos: cada renglón de la factura/.test(JSON.stringify(calls[calls.length - 1].messages)), 'la lectura pide los renglones de la factura');
  check(r6 && r6.items[0].qty === 3 && r6.items[0].unit === 'galones' && r6.items[0].desc === 'PINTURA ACRILICA BLANCA' && r6.items[0].price === 250 && r6.items[0].total === 750, 'al leer la factura quedan guardados sus artículos');
  await page.waitForSelector('#inv-items');
  check(/Artículos de la factura \(1\)/.test(await txt(page, '#inv-items')), 'la hoja de la factura muestra sus artículos');
  await page.click('.sheet-h [data-act="sheet-close"]');

  // 2) El buscador busca en lo que trae cada factura.
  const ids = () => page.evaluate(() => [...document.querySelectorAll('#f-list [data-act="open-inv"]')].map((b) => b.dataset.id).filter((v, k, a) => a.indexOf(v) === k));
  await page.fill('#f-search', 'varilla 3/8');
  await settle(page);
  let got = await ids();
  check(got.includes(I.i1) && !got.includes(I.i2) && got.length === 1, '«varilla 3/8» encuentra la factura que la trae (y no la de varilla 1/2)');
  check(/Trae: 20 VARILLA CORRUGADA 3\/8 X 20/.test(await txt(page, '#f-list')), 'la tarjeta dice qué renglón coincide («Trae: 20 VARILLA…»)');
  await page.screenshot({ path: path.join(OUT, 'buscar.png') });
  await page.fill('#f-search', 'gama cemento');
  await settle(page);
  got = await ids();
  check(got.includes(I.i1) && !got.includes(I.i4), '«gama cemento»: el cemento de esa ferretería, no el de otra');
  await page.fill('#f-search', 'cemento');
  await settle(page);
  got = await ids();
  check(got.includes(I.i1) && got.includes(I.i4) && got.length === 2, '«cemento» encuentra las dos facturas que lo traen');
  check(/El buscador también busca en lo que trae cada factura, pero 2 facturas todavía no tienen sus artículos leídos\. Leer sus artículos/.test(await txt(page, '#f-sum')), 'avisa cuántas facturas todavía no tienen sus artículos leídos');
  await page.setViewportSize({ width: 1280, height: 900 });
  await settle(page, 600);
  check(/Trae: 10 Funda CEMENTO GRIS PORTLAND 42\.5KG/.test(await txt(page, '#f-list .inv-tbl')) && /Trae: 2 fundas CEMENTO GRIS/.test(await txt(page, '#f-list .inv-tbl')), 'en la computadora, la tabla también dice qué renglón coincide');
  await page.screenshot({ path: path.join(OUT, 'buscar-tabla.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await settle(page, 600);
  await page.click(`#f-list [data-act="open-inv"][data-id="${I.i1}"]`);
  await page.waitForSelector('#inv-items');
  check(await page.evaluate(() => document.querySelector('#inv-items').open) && await page.locator('#inv-items tr.hit').count() === 1 && /Artículos de la factura \(2\) · 1 coincide con la búsqueda/.test(await txt(page, '#inv-items summary')), 'en la factura se abren sus artículos y se marca el que coincide');
  await settle(page, 700);
  await page.locator('#inv-items').scrollIntoViewIfNeeded();
  await settle(page, 300);
  await page.screenshot({ path: path.join(OUT, 'factura-articulos.png') });
  await page.click('.sheet-h [data-act="sheet-close"]');

  // 3) La orden: ¿en qué factura vino?
  await tab(page, 'ordenes');
  await page.click('#o-seg [data-f="todas"]');
  const hintsOf = () => page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#o-list .ord')].map((b) => [b.dataset.id, (b.querySelector('.ord-hint') || {}).textContent || ''])));
  let hs = await hintsOf();
  console.log('     pistas:', JSON.stringify(Object.values(hs)));
  check(hs[I.o1] === 'Puede estar en la factura NCF B0100004521' && hs[I.o2] === 'Puede estar en la factura NCF B0100004533' && hs[I.o3] === 'Puede estar en la factura NCF B0100000600' && hs[I.o4] === '', 'en la lista, cada orden sin factura dice en qué factura sin orden puede estar (si trae todo lo que pidió)');
  await page.click('#o-seg [data-f="sinfactura"]');
  await settle(page);
  check(/3 de ellas pueden estar en facturas que ya tienes sin orden \(traen todo lo que se pidió\): ábrelas para enlazarlas\./.test(await txt(page, '#o-list')), '«Sin factura» dice cuántas pueden estar en facturas que ya están en la app');
  await page.screenshot({ path: path.join(OUT, 'sin-factura-pistas.png') });
  await page.click('#o-seg [data-f="todas"]');
  await settle(page);
  await page.click(`#o-list [data-act="open-order"][data-id="${I.o1}"]`);
  await page.waitForSelector('#o-match');
  let om = await txt(page, '#o-match');
  console.log('     orden 1:', om.slice(0, 260));
  check(/¿En qué factura vino\?/.test(om) && /NCF B0100004521/.test(om) && /Trae los 2 artículos: 10 Funda CEMENTO GRIS PORTLAND 42\.5KG · 20 VARILLA CORRUGADA 3\/8 X 20/.test(om) && !/B0100004533/.test(om) && !/Ochoa/.test(om), 'la orden dice en qué factura vino lo que pidió (no la de varilla 1/2 ni la de otra ferretería)');
  await settle(page, 700);
  await page.locator('#o-match').scrollIntoViewIfNeeded();
  await settle(page, 300);
  await page.screenshot({ path: path.join(OUT, 'orden-factura.png') });
  await page.click(`#o-match [data-act="order-link-inv"][data-id="${I.i1}"]`);
  const l1 = await waitUntil(async () => ((await inv(page, I.i1)) || {}).orderId === I.o1, 5000);
  check(l1, '«Enlazar» enlaza esa factura a la orden');
  await waitUntil(async () => /B0100004521/.test(await txt(page, '#o-invs .list')), 5000);
  check(/B0100004521/.test(await txt(page, '#o-invs .list')) && !(await page.$('#o-match [data-id="' + I.i1 + '"]')), 'la factura pasa a «Facturas de esta orden»');
  await page.click('.sheet-h [data-act="sheet-close"]');
  await settle(page);
  hs = await hintsOf();
  check(hs[I.o1] === '' && hs[I.o2] === 'Puede estar en la factura NCF B0100004533', 'ya enlazada, la orden deja de decir dónde puede estar');
  await page.click(`#o-list [data-act="open-order"][data-id="${I.o4}"]`);
  await page.waitForSelector('#o-match');
  om = await txt(page, '#o-match');
  check(/Una factura de este proveedor todavía no tiene sus artículos leídos/.test(om), 'si una factura del proveedor no tiene sus artículos leídos, la orden lo dice');
  answers.push({ articulos: [{ cantidad: '3', unidad: '', descripcion: 'MALLA ELECTROSOLDADA 6X6', precio: '800.00', importe: '2400.00' }] });
  await page.click('#o-match [data-act="items-read-order"]');
  const r3 = await waitUntil(async () => { const x = await inv(page, I.i3); return x && Array.isArray(x.items) && x.items.length ? x : null; }, 15000);
  check(r3 && r3.items[0].desc === 'MALLA ELECTROSOLDADA 6X6' && /saca solo sus renglones/.test(JSON.stringify(calls[calls.length - 1].messages)), 'se leen solo los artículos de esa factura');
  await waitUntil(async () => /Trae lo que pidió/.test(await txt(page, '#o-match')), 8000);
  check(/NCF B0100004602/.test(await txt(page, '#o-match')) && /Trae lo que pidió: 3 MALLA ELECTROSOLDADA 6X6/.test(await txt(page, '#o-match')), 'ya leídos, la orden encuentra su factura');
  await page.click('.sheet-h [data-act="sheet-close"]');

  // 4) Las de antes: «Leer sus artículos» (la del XML, del XML, sin la lectura automática).
  await tab(page, 'facturas');
  await page.fill('#f-search', 'block');
  await settle(page);
  check(/1 factura todavía no tiene sus artículos leídos/.test(await txt(page, '#f-sum')) && !(await ids()).length, 'antes de leerlos, «block» no encuentra nada y avisa que falta 1');
  const nCalls = calls.length;
  await page.click('#f-sum [data-act="items-read-all"]');
  const r5 = await waitUntil(async () => { const x = await inv(page, I.i5); return x && Array.isArray(x.items) && x.items.length ? x : null; }, 10000);
  check(r5 && r5.items.length === 2 && calls.length === nCalls, 'los de la factura del XML salen del XML, sin la lectura automática');
  await waitUntil(async () => (await ids()).includes(I.i5), 5000);
  check((await ids()).includes(I.i5) && /Trae: 100 BLOCK DE 6 PULGADAS/.test(await txt(page, '#f-list')) && !/todavía no tiene/.test(await txt(page, '#f-sum')), 'ahora «block» encuentra la factura del XML');
  await page.fill('#f-search', 'malla');
  await settle(page);
  check((await ids()).join() === I.i3, '«malla» encuentra la factura leída desde la orden');
  await page.fill('#f-search', '');
  await settle(page);
  await page.click(`#f-list [data-act="open-inv"][data-id="${I.i2}"]`);
  await page.waitForSelector('#inv-form');
  const asg = await page.evaluate(() => [...document.querySelectorAll('.sheet [data-act="link-order"]')].map((b) => b.textContent.trim()));
  check(asg[0] === 'Asignar OC-0002 · trae lo que pidió' && asg.length === 3 && !/trae/.test(asg.slice(1).join()), 'desde la factura, la orden que pidió lo que trae sale primero: ' + asg.join(' | '));
  await page.click('.sheet-h [data-act="sheet-close"]');

  // 5) Órdenes: el solicitante y el filtro por solicitante.
  await tab(page, 'ordenes');
  await page.waitForSelector('#o-req');
  check(/OC-0001.*Solicitante: Ing\. Pérez/.test(await txt(page, '#o-list')), 'la tarjeta de la orden dice quién la pidió');
  const opts = await page.evaluate(() => [...document.querySelectorAll('#o-req option')].map((o) => o.textContent));
  console.log('     solicitantes:', opts.join(' | '));
  check(opts.join('|') === 'Todos|Ing. Pérez (2)|María Gómez (1)|Sin solicitante (1)', 'el filtro junta «Ing. Pérez» e «ing. perez» y cuenta las órdenes de cada uno');
  const ordIds = () => page.evaluate(() => [...document.querySelectorAll('#o-list [data-act="open-order"]')].map((b) => b.dataset.id).filter((v, k, a) => a.indexOf(v) === k));
  await page.selectOption('#o-req', { label: 'Ing. Pérez (2)' });
  await settle(page);
  let oi = await ordIds();
  check(oi.length === 2 && oi.includes(I.o1) && oi.includes(I.o2) && Number(await page.textContent('#o-seg [data-f="todas"] .n')) === 2, 'con «Ing. Pérez» quedan solo sus 2 órdenes (y los conteos son de él)');
  await page.screenshot({ path: path.join(OUT, 'solicitante.png') });
  await page.selectOption('#o-req', { label: 'Sin solicitante (1)' });
  await settle(page);
  oi = await ordIds();
  check(oi.length === 1 && oi[0] === I.o4, '«Sin solicitante» deja la que no dice quién la pidió');
  await page.selectOption('#o-req', { label: 'Todos' });
  await settle(page);
  check((await ordIds()).length === 4, '«Todos» las vuelve a mostrar');
  await page.setViewportSize({ width: 1280, height: 900 });
  await settle(page, 600);
  const th = await page.evaluate(() => [...document.querySelectorAll('#o-list .ord-tbl thead th')].map((x) => x.textContent.trim()).join('|'));
  check(/Proveedor\|Solicitante\|Estado/.test(th) && /Ing\. Pérez/.test(await txt(page, '#o-list .ord-tbl')), 'en la computadora la tabla de órdenes tiene la columna «Solicitante»');
  check(/Puede estar en la factura NCF B0100004533/.test(await txt(page, '#o-list .ord-tbl')), 'y en la columna «Facturas», en cuál puede estar');
  await page.screenshot({ path: path.join(OUT, 'ordenes-tabla.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await settle(page, 600);

  // 6) Directorio de proveedores: al escoger el proveedor se llenan sus datos.
  await tab(page, 'facturas');
  await page.click(`#f-list [data-act="open-inv"][data-id="${I.i7}"]`);
  await page.waitForSelector('#f-sup');
  const opt = await page.evaluate(() => { const o = [...document.querySelectorAll('#dl-isups option')].find((x) => x.value === 'Ferretería Gama'); return o ? o.label : null; });
  check(opt === 'RNC 1-31-00022-2', 'la lista de proveedores de la factura trae su RNC');
  await page.fill('#f-sup', 'Ferretería Gama');
  const v7 = await page.evaluate(() => ({ rnc: document.getElementById('f-rnc').value, num: document.getElementById('f-num').value, help: document.getElementById('f-sup-help').textContent }));
  console.log('     autollenado:', JSON.stringify(v7));
  check(v7.rnc === '131000222' && v7.num === 'B0100004' && v7.help === 'Se llenaron el RNC y el comienzo del NCF con sus facturas anteriores. Su último NCF fue B0100004610.', 'al escoger el proveedor se llenan su RNC y el comienzo de su NCF');
  await page.click('#f-num');
  await page.keyboard.press('End');
  await page.keyboard.type('B0100004615');
  check(await page.inputValue('#f-num') === 'B0100004615', 'si se escribe el NCF completo encima del comienzo, no queda repetido');
  await page.click('#inv-save');
  await page.waitForSelector('#inv-form', { state: 'detached' });
  const r7 = await inv(page, I.i7);
  check(r7.supplier === 'Ferretería Gama' && r7.rnc === '131000222' && r7.number === 'B0100004615', 'la factura queda guardada con el proveedor, su RNC y el NCF');
  await page.click(`#f-list [data-act="open-inv"][data-id="${I.i8}"]`);
  await page.waitForSelector('#f-rnc');
  await page.fill('#f-rnc', '131023452');
  const v8 = await page.evaluate(() => ({ sup: document.getElementById('f-sup').value, num: document.getElementById('f-num').value }));
  check(v8.sup === 'Ferretería Ochoa' && v8.num === 'B01', 'al escribir el RNC se llena el nombre del proveedor (y la serie de su NCF)');
  await page.click('.sheet-h [data-act="sheet-close"]');
  // En la devolución.
  await tab(page, 'pagos');
  await page.click('[data-act="cr-new"]');
  await page.waitForSelector('#cr-form');
  await page.fill('#cr-sup', 'Ferretería Gama');
  check(await page.inputValue('#cr-rnc') === '131000222', 'en la devolución también se llena el RNC');
  await page.click('.sheet-h [data-act="sheet-close"]');
  // En la orden y en su PDF.
  await tab(page, 'ordenes');
  await page.click('#o-new');
  await page.waitForSelector('#o-sup');
  await page.fill('#o-sup', 'Ferretería Gama');
  check(/^RNC 1-31-00022-2 · Tel\. 809-555-0101 · crédito 30 días · 5 facturas$/.test(await txt(page, '#o-sup-help')), 'en la orden, debajo del proveedor, salen su RNC, teléfono y crédito');
  await page.click('.sheet-h [data-act="sheet-close"]');
  await page.click(`#o-list [data-act="open-order"][data-id="${I.o1}"]`);
  await page.waitForSelector('#order-form');
  check(/RNC 1-31-00022-2 · Tel\. 809-555-0101/.test(await txt(page, '#o-sup-help')), 'la orden guardada también los muestra');
  const pdf = await download(page, '[data-act="order-pdf"]', 'orden.pdf');
  const pt = pdfText(pdf);
  fs.writeFileSync(path.join(OUT, 'orden.txt'), pt);
  check(/Ferretería Gama/.test(pt) && /RNC 1-31-00022-2 · Tel\. 809-555-0101/.test(pt), 'el PDF de la orden lleva el RNC y el teléfono del proveedor');
  execFileSync('pdftoppm', ['-png', '-r', '80', '-f', '1', '-l', '1', pdf, path.join(OUT, 'orden')]);

  // 7) La lista de proveedores: todos, con sus datos.
  await tab(page, 'proyectos');
  await page.click('[data-act="sups"]');
  await page.waitForSelector('#sps-list');
  const sl = await txt(page, '#sps-list');
  console.log('     proveedores:', sl.slice(0, 300));
  check(/Ferretería Gama\s*RNC 1-31-00022-2 · NCF B01 · 5 facturas · crédito 30 días · Tel\. 809-555-0101\s*Ficha/.test(sl) && /Ferretería Ochoa\s*RNC 1-31-02345-2 · NCF B01 · 1 factura/.test(sl) && /Materiales Duarte SRL\s*RNC 1-30-00000-1 · NCF E31 · 1 factura/.test(sl), 'la lista tiene todos los proveedores con su RNC, la serie de NCF y cuántas facturas');
  await settle(page, 700);
  await page.screenshot({ path: path.join(OUT, 'proveedores.png') });
  await page.fill('#sps-q', 'ochoa');
  check(await page.locator('#sps-list .o-pick').count() === 1, 'el buscador de proveedores filtra');
  await page.click('#sps-list .o-pick');
  await page.waitForSelector('#sup-form');
  check(await page.inputValue('#sp-name') === 'Ferretería Ochoa' && await page.inputValue('#sp-rnc') === '131023452' && /En tus facturas: 1 factura · usa NCF B01 \(crédito fiscal\) · el último, B0100000600/.test(await sheetTxt(page)), 'la ficha nueva viene con su nombre, RNC y lo que se sabe de sus facturas');
  await page.fill('#sp-phone', '809-555-0202');
  await page.fill('#sp-contact', 'Juan Ochoa');
  await page.fill('#sp-email', 'ventas@ochoa.do');
  await page.fill('#sp-addr', 'Av. Duarte 100, Santiago');
  await page.click('#sup-form button[type="submit"]');
  const sp = await waitUntil(async () => (await docs(page, 'suppliers')).find((s) => s.rnc === '131023452'), 5000);
  check(sp && sp.contact === 'Juan Ochoa' && sp.email === 'ventas@ochoa.do' && sp.address === 'Av. Duarte 100, Santiago' && sp.phone === '809-555-0202', 'la ficha guarda el contacto, el correo y la dirección');
  await page.waitForSelector('#sps-list');
  await page.click('.sheet-h [data-act="sheet-close"]');

  // 8) El Excel de las facturas: una hoja con lo que trae cada una.
  await tab(page, 'facturas');
  await page.click('#f-seg [data-f="todas"]');
  const xl = await download(page, '[data-act="list-xlsx"]', 'facturas.xlsx');
  const xr = JSON.parse(execFileSync('python3', ['-I', '-c', `
import openpyxl, sys, json
wb = openpyxl.load_workbook(sys.argv[1])
ws = wb['Artículos de las facturas'] if 'Artículos de las facturas' in wb.sheetnames else None
rows = [list(r) for r in ws.iter_rows(min_row=5, values_only=True)] if ws else []
print(json.dumps({'hojas': wb.sheetnames, 'head': rows[0] if rows else [], 'rows': [r for r in rows[1:] if r and r[1]]}, ensure_ascii=False, default=str))
`, xl]).toString());
  console.log('     hojas:', xr.hojas.join(', '));
  check(xr.hojas.includes('Artículos de las facturas') && xr.head.join('|') === 'Proyecto|Proveedor|NCF|Fecha|Orden de compra|#|Cantidad|Unidad|Descripción|Precio|Importe', 'el Excel tiene la hoja «Artículos de las facturas»');
  check(xr.rows.length === 9 && xr.rows.some((r) => r[2] === 'B0100004521' && r[4] === 'OC-0001' && r[8] === 'VARILLA CORRUGADA 3/8 X 20' && r[10] === 500), 'un renglón por artículo, con su factura y su orden (9)');

  // 9) Con muchas sin sus artículos, antes de gastar en la lectura, pregunta.
  const i3doc = await inv(page, I.i3);
  await page.evaluate(async (x) => { for (let k = 0; k < 21; k++) await RT.db.collection('invoices').doc().set({ projectId: x.e, supplier: 'Ferretería Gama', rnc: '131000222', number: 'B01000090' + String(10 + k), date: x.d, amount: 100, currency: 'DOP', itbis: 0, ai: 'done', notInvoice: false, fileId: x.f, fileType: 'image/png', thumbId: null, pages: 1, createdAt: '2026-11-20T10:00:00.000Z' }); }, { e: I.e, d: dayIso(-2), f: i3doc.fileId });
  await page.fill('#f-search', 'cemento');
  await settle(page, 600);
  check(/21 facturas todavía no tienen sus artículos leídos/.test(await txt(page, '#f-sum')), 'dice cuántas faltan (21)');
  const before = calls.length;
  await page.click('#f-sum [data-act="items-read-all"]');
  await settle(page);
  check(/Son 21 facturas para la lectura automática: cada una cuesta más o menos lo mismo que leerla otra vez\. Sí, leer sus artículos Ahora no/.test(await txt(page, '#f-sum')) && calls.length === before, 'con muchas, antes de leer pregunta (cuesta)');
  await page.click('#f-sum [data-act="items-ask-no"]');
  await settle(page);
  check(/21 facturas todavía no tienen sus artículos leídos\. Leer sus artículos/.test(await txt(page, '#f-sum')) && calls.length === before, '«Ahora no» no lee nada');

  console.log('problemas:', problems.length ? problems : 'ninguno');
  await browser.close();
  server.close();
  process.exit(problems.length ? 1 : 0);
})().catch((e) => { console.error(e); console.log('problemas:', problems); process.exit(1); });
