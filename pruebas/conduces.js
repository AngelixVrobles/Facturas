// Conduces junto a sus facturas y órdenes divididas por proyecto.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = process.env.APP_ROOT || path.resolve(__dirname, '..');
const SP = process.env.PRUEBAS_TMP || path.join(require('os').tmpdir(), 'facturas-pruebas');
const SAMPLES = path.join(SP, 'muestras-conduce');
const OUT = path.join(SP, 'test-conduces');
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
const pdfText = (f, pg) => execFileSync('pdftotext', ['-layout', ...(pg ? ['-f', String(pg), '-l', String(pg)] : []), f, '-']).toString();
const pdfPages = (f) => Number(execFileSync('pdfinfo', [f]).toString().match(/Pages:\s+(\d+)/)[1]);
const blank = { es_factura: true, tipo_documento: 'factura', proveedor: '', rnc_proveedor: '', ncf: '', ncf_vence: '', fecha: '', itbis: '', total: '', moneda: 'DOP', concepto: '', proyecto: '', rnc_cliente: '104595114', referencia: '', conduces: '', conduce_numero: '', material: '', cantidad: '', viajes: '' };
const INV = {
  B0100000777: { ...blank, proveedor: 'TRANSPORTE Y AGREGADOS S. LOPEZ, SRL', rnc_proveedor: '130999998', ncf: 'B0100000777', fecha: '2026-11-05', itbis: '0', total: '8000.00', concepto: 'Grava 5 m3', proyecto: 'Caperuza 2', conduces: '39807' },
  B0100000888: { ...blank, proveedor: 'BLOQUES DEL CIBAO, SRL', rnc_proveedor: '131555777', ncf: 'B0100000888', fecha: '2026-11-06', itbis: '720', total: '4720.00', concepto: '400 blocks de 6"' },
};
// Fotos que llegan con +: la lectura dice que son conduces (en este orden).
const photoAnswers = [
  { ...blank, es_factura: false, tipo_documento: 'conduce', proveedor: 'Transporte y Agregados S. López', fecha: '2026-11-04', total: '8,000', proyecto: 'Caperuza', conduce_numero: '39807', material: 'Grava', cantidad: '5 mts', viajes: '1' },
  { ...blank, es_factura: false, tipo_documento: 'conduce', proveedor: 'Bloques del Cibao', fecha: '06-11-2026', total: '4720', conduce_numero: '51234', material: 'Blocks de 6"', cantidad: '400 uds', viajes: '1' },
];
// Conduces agregados desde la factura (se leen con la lectura de conduces).
const condAnswers = [
  { numero: 'No. 40001', fecha: '05-11-2026', proveedor: 'Ochoa Ferretería', rnc_proveedor: '', proyecto: 'caperuza II', material: 'Cemento gris', cantidad: '10 fundas', viajes: '1', total: '590.00', moneda: 'DOP' },
];
const calls = [];

async function docs(page, coll) {
  return page.evaluate((c) => new Promise((r) => { const un = RT.db.collection(c).onSnapshot((s) => { un(); r(s.docs.map((d) => ({ id: d.id, ...d.data() }))); }); }), coll);
}
async function upload(page, files) {
  await page.setInputFiles('#file-input', files);
  await page.waitForFunction(() => { const h = document.querySelector('#queue .q-head'); return h && /Listo/.test(h.textContent); }, null, { timeout: 90000 });
  await page.waitForTimeout(900);
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
const openInv = async (page, ncfOrName) => { await page.click(`#f-list [data-act="open-inv"]:has-text("${ncfOrName}")`); await page.waitForSelector('#inv-form'); };
const closeSheet = async (page) => { await page.click('.sheet-h [data-act="sheet-close"]'); await page.waitForSelector('#sheet-root', { state: 'hidden' }); };
const settle = (page, ms = 500) => page.waitForTimeout(ms);

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const BASE = `http://127.0.0.1:${server.address().port}/facturas/`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, acceptDownloads: true });
  await ctx.route('https://api.anthropic.com/**', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const body = JSON.parse(route.request().postData() || '{}');
    const txt = JSON.stringify(body.messages || []);
    let ans;
    if (txt.includes('Lee este conduce')) { ans = condAnswers.shift() || {}; calls.push('conduce'); }
    else { const k = Object.keys(INV).find((n) => txt.includes(n)); if (k) { ans = INV[k]; calls.push('factura ' + k); } else { ans = photoAnswers.shift() || blank; calls.push('foto'); } }
    route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify({ id: 'msg', type: 'message', role: 'assistant', model: body.model, content: [{ type: 'text', text: JSON.stringify(ans) }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } }) });
  });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) problems.push('consola: ' + m.text()); });
  page.on('pageerror', (e) => problems.push('error de página: ' + e.message));
  await page.goto(BASE);
  await page.waitForSelector('.empty h2');
  const ids = await page.evaluate(async () => {
    const db = RT.db;
    await db.doc('settings/general').set({ company: 'SUCRE B. LANTIGUA CONSTRUCTORA, S.R.L.', companyRnc: '104595114' });
    const pA = db.collection('projects').doc(); await pA.set({ name: 'Caperuza 2', createdAt: '2026-09-01T10:00:00.000Z' });
    const pB = db.collection('projects').doc(); await pB.set({ name: 'Torre Piantini', createdAt: '2026-09-02T10:00:00.000Z' });
    return { pA: pA.id, pB: pB.id };
  });
  await page.click('#settings-btn');
  await page.fill('#st-key', 'sk-ant-prueba');
  await page.click('#settings-form button[type="submit"]');
  await page.waitForSelector('#settings-form', { state: 'detached' });

  // 1) Factura en PDF y la foto de su conduce, agregadas juntas con +.
  const q1 = await upload(page, [path.join(SAMPLES, 'factura-lopez.pdf'), path.join(SAMPLES, 'conduce.jpg')]);
  console.log('     cola:', q1);
  let invs = await docs(page, 'invoices'), conds = await docs(page, 'conduces');
  const lopez = invs.find((i) => i.number === 'B0100000777');
  const c1 = conds.find((c) => c.number === '39807');
  check(invs.length === 1 && !!lopez && lopez.supplier === 'TRANSPORTE Y AGREGADOS S. LOPEZ, SRL' && lopez.projectId === ids.pA, 'la factura se leyó (proveedor y obra Caperuza 2)');
  check(!!c1 && conds.length === 1, 'la foto quedó como conduce, no como factura');
  check(c1 && c1.invoiceId === lopez.id && c1.auto === true && c1.autoWhy === 'numero', 'el conduce 39807 se adjuntó solo a su factura (la factura menciona su número)');
  check(c1 && c1.total === 8000 && c1.material === 'Grava' && c1.qty === '5 mts' && c1.trips === 1 && c1.date === '2026-11-04' && c1.projectId === ids.pA, 'datos del conduce: RD$8,000, grava, 5 mts, 1 viaje, 4 nov, Caperuza 2');
  check(/Conduce: adjuntado a la factura de TRANSPORTE Y AGREGADOS/.test(q1), 'la cola dice a qué factura se adjuntó');
  const pill = await page.textContent('#f-list [data-act="open-inv"]:has-text("B0100000777") .pill.cond').catch(() => '');
  check(pill === 'Conduce 39807', 'la factura muestra la etiqueta «Conduce 39807»');

  // 2) La hoja de la factura lista el conduce y dice por qué se adjuntó solo.
  await openInv(page, 'B0100000777');
  const card = (await page.textContent('#inv-conds')).replace(/\s+/g, ' ');
  check(/Conduce 39807/.test(card) && /RD\$8,000\.00/.test(card) && /se adjuntó solo: la factura menciona su número/.test(card), 'la factura muestra su conduce y por qué se adjuntó');
  await page.screenshot({ path: path.join(OUT, 'factura-con-conduce.png'), fullPage: false });
  await page.$eval('#inv-conds', (e) => e.scrollIntoView({ block: 'center' }));
  await settle(page, 300);
  await page.screenshot({ path: path.join(OUT, 'factura-con-conduce-2.png') });
  await closeSheet(page);

  // 3) Pago: el PDF lleva la factura y detrás su conduce; el Excel tiene la hoja Conduces.
  await page.click('[data-act="new-pay-from"]');
  await page.fill('#pk-name', 'Pago agregados');
  await page.click('#pk-go');
  await page.waitForSelector('#pd-body .bigtotal');
  const pdf = await download(page, '[data-act="pay-pdf"]', 'pago.pdf');
  const np = pdfPages(pdf);
  const cover = pdfText(pdf, 1);
  const last = pdfText(pdf, np);
  check(np === 3, `PDF del pago: portada + factura + conduce = ${np} páginas`);
  check(/1 conduce/.test(cover), 'la portada dice que lleva 1 conduce');
  check(/Conduce 39807/.test(last) && /NCF B0100000777/.test(last), 'la última página es el conduce 39807, marcado con su factura');
  execFileSync('pdftoppm', ['-r', '50', '-png', pdf, path.join(OUT, 'pago')]);
  const xl = await download(page, '[data-act="pay-xlsx"]', 'pago.xlsx');
  const xr = JSON.parse(execFileSync('python3', ['-I', '-c', `
import openpyxl, sys, json
wb = openpyxl.load_workbook(sys.argv[1])
res = {'hojas': wb.sheetnames}
ws = wb['Facturas']; rows = list(ws.iter_rows(values_only=True)); h = rows[4]
res['col'] = [r[h.index('Conduces')] for r in rows[5:] if r[0] is not None and isinstance(r[0], int)]
ws = wb['Conduces']; rows = list(ws.iter_rows(values_only=True)); h = rows[4]
res['cond'] = [dict(zip(h, r)) for r in rows[5:] if r[0]]
print(json.dumps(res, ensure_ascii=False, default=str))
`, xl]).toString());
  console.log('     excel:', JSON.stringify(xr));
  check(xr.hojas.includes('Conduces') && xr.col[0] === '39807', 'Excel: columna Conduces en Facturas y hoja Conduces');
  const xc = xr.cond.find((r) => r.Conduce === '39807');
  check(xc && xc.Material === 'Grava' && xc['Total del conduce'] === 8000 && xc['Factura (NCF)'] === 'B0100000777', 'Excel: el conduce con su material, total y la factura');

  // 4) Conduce agregado a mano desde la factura (se lee solo), quitarlo y volverlo a poner.
  await page.click('[data-tab="facturas"]');
  const ochoa = await page.evaluate(async (pid) => {
    const r = RT.db.collection('invoices').doc();
    await r.set({ projectId: pid, supplier: 'Ferretería Ochoa', rnc: '131023452', number: 'B0100000555', date: '2026-11-05', amount: 590, itbis: 90, currency: 'DOP', concept: '', ref: '', buyerRnc: '104595114', qrUrl: '', fiscal: '', notInvoice: false, fileId: null, fileType: 'image/jpeg', thumbId: null, pages: 1, fileName: 'x.jpg', xmlId: null, ai: 'off', createdAt: '2026-11-05T09:00:00.000Z' });
    return r.id;
  }, ids.pA);
  await page.waitForSelector('#f-list [data-act="open-inv"]:has-text("B0100000555")');
  await openInv(page, 'B0100000555');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#inv-conds [data-act="cond-add"]')]);
  await chooser.setFiles(path.join(SAMPLES, 'conduce-2.jpg'));
  await page.waitForFunction(() => { const r = document.querySelector('#inv-conds .cond-row'); return r && /40001/.test(r.textContent); }, null, { timeout: 30000 });
  conds = await docs(page, 'conduces');
  const c2 = conds.find((c) => c.number === '40001');
  check(c2 && c2.invoiceId === ochoa && c2.ai === 'done' && c2.total === 590 && c2.date === '2026-11-05' && c2.material === 'Cemento gris' && c2.supplier === 'Ferretería Ochoa', 'conduce agregado desde la factura: queda en ella y se lee solo (40001, 5 nov, cemento, RD$590)');
  await page.click('#inv-conds [data-act="open-cond"]');
  await page.waitForSelector('#cond-form');
  await page.selectOption('#c-inv', '');
  await page.click('#cond-save');
  await page.waitForSelector('#cond-form', { state: 'detached' });
  await settle(page, 900);
  conds = await docs(page, 'conduces');
  check(conds.find((c) => c.id === c2.id).invoiceId === null && conds.find((c) => c.id === c2.id).noAuto === true, 'quitado a mano: queda esperando factura y no se vuelve a enlazar solo');
  const todo = (await page.textContent('#todo')).replace(/\s+/g, ' ');
  check(/1 conduce esperando su factura/.test(todo), 'Para hacer: «1 conduce esperando su factura»');
  await page.click('#todo [data-act="cond-list"]');
  await page.waitForSelector('.sheet .cond-row');
  check((await page.$$('.sheet .cond-row')).length === 1, 'la lista de conduces sin factura lo muestra');
  await page.click('.sheet .cond-row');
  await page.waitForSelector('#cond-form');
  await page.selectOption('#c-inv', ochoa);
  await page.click('#cond-save');
  await page.waitForSelector('#cond-form', { state: 'detached' });
  await settle(page);
  conds = await docs(page, 'conduces');
  check(conds.find((c) => c.id === c2.id).invoiceId === ochoa, 'elegida la factura en el conduce: vuelve a su factura');

  // 5) Conduce que llega antes que su factura: espera y se adjunta solo cuando llega (mismo proveedor y monto).
  const q2 = await upload(page, [path.join(SAMPLES, 'conduce.jpg')]);
  conds = await docs(page, 'conduces');
  const c3 = conds.find((c) => c.number === '51234');
  check(c3 && !c3.invoiceId && /esperando su factura/.test(q2), 'conduce de Bloques del Cibao sin factura todavía: queda esperando');
  await upload(page, [path.join(SAMPLES, 'factura-bloques.pdf')]);
  invs = await docs(page, 'invoices'); conds = await docs(page, 'conduces');
  const bloques = invs.find((i) => i.number === 'B0100000888');
  const c3b = conds.find((c) => c.id === c3.id);
  check(bloques && c3b.invoiceId === bloques.id && c3b.autoWhy === 'monto', 'llegó la factura de Bloques del Cibao: el conduce se adjuntó solo (mismo proveedor y monto)');

  // 6) Sin clave: una foto de conduce entra como factura y se pasa a conduce con un toque.
  await page.click('#settings-btn');
  await page.fill('#st-key', '');
  await page.click('#settings-form button[type="submit"]');
  await page.waitForSelector('#settings-form', { state: 'detached' });
  const nInv = (await docs(page, 'invoices')).length, nCond = (await docs(page, 'conduces')).length;
  await upload(page, [path.join(SAMPLES, 'conduce-2.jpg')]);
  await page.click('[data-act="filter"][data-f="todas"]');
  await openInv(page, 'Factura sin datos');
  check(!!(await page.$('[data-act="inv-to-cond"]')), 'la factura sin datos ofrece «Es un conduce»');
  await page.click('[data-act="inv-to-cond"]');
  await page.waitForSelector('#cond-form', { timeout: 5000 });
  check((await docs(page, 'invoices')).length === nInv && (await docs(page, 'conduces')).length === nCond + 1, 'pasada a conduce: hay una factura menos y un conduce más');
  await closeSheet(page);

  // 7) Eliminar la factura: su conduce queda guardado, esperando factura.
  await openInv(page, 'B0100000555');
  await page.click('[data-act="inv-del"]');
  await page.click('[data-act="inv-del-yes"]');
  await page.waitForSelector('#inv-form', { state: 'detached' });
  await settle(page, 900);
  conds = await docs(page, 'conduces');
  check(conds.find((c) => c.id === c2.id) && conds.find((c) => c.id === c2.id).invoiceId === null, 'factura eliminada: su conduce se queda, esperando factura');

  // 8) Órdenes divididas por proyecto.
  await page.evaluate(async (p) => {
    const db = RT.db;
    const mk = async (number, pid, sup, status) => db.collection('orders').doc().set({ number, date: '2026-11-0' + number, projectId: pid, supplier: sup, requestedBy: 'William', items: [{ qty: 1, unit: 'Ud', desc: 'Material' }], status, createdAt: '2026-11-0' + number + 'T08:00:00.000Z' });
    await mk(1, p.pA, 'Ferretería Ochoa', 'autorizada');
    await mk(2, p.pB, 'Ferretería Americana', 'enviada');
    await mk(3, p.pA, 'Transporte y Agregados S. López', 'enviada');
  }, ids);
  await page.click('[data-act="backup-later"]').catch(() => {});
  await page.click('[data-tab="ordenes"]');
  await page.waitForSelector('#o-list .group');
  await page.waitForSelector('#toast', { state: 'hidden', timeout: 8000 }).catch(() => {});
  const groups = await page.$$eval('#o-list .group', (gs) => gs.map((g) => g.querySelector('.gname').textContent + ':' + g.querySelectorAll('.ord').length + ':' + g.querySelector('.gmeta').textContent));
  console.log('     grupos:', JSON.stringify(groups));
  check(groups.length === 2 && groups[0].startsWith('Caperuza 2:2:') && groups[1].startsWith('Torre Piantini:1:'), 'Órdenes divididas por proyecto (Caperuza 2: 2, Torre Piantini: 1)');
  check(/2 órdenes · 1 por firmar/.test(groups[0]), 'el encabezado dice cuántas y cuántas faltan por firmar');
  const chipsTxt = await page.$$eval('#o-chips .chip', (cs) => cs.map((c) => c.textContent.trim()));
  check(chipsTxt.join('|') === 'Todos los proyectos|Caperuza 2|Torre Piantini', 'filtro por proyecto en Órdenes');
  await page.screenshot({ path: path.join(OUT, 'ordenes-por-proyecto.png') });
  await page.click(`#o-chips [data-p="${ids.pB}"]`);
  await settle(page, 300);
  const segTodas = await page.textContent('#o-seg [data-f="todas"] .n');
  check((await page.$$('#o-list .ord')).length === 1 && !(await page.$('#o-list .group')) && segTodas === '1', 'elegido Torre Piantini: solo su orden y los contadores de ese proyecto');
  await page.click('#o-new');
  await page.waitForSelector('#order-form');
  check((await page.inputValue('#o-proj')) === ids.pB, 'orden nueva con el proyecto elegido');
  await closeSheet(page);

  // Un proyecto con órdenes no se puede eliminar (las órdenes quedarían sin proyecto).
  await page.click('[data-tab="proyectos"]');
  await page.click(`[data-act="open-proj"][data-id="${ids.pB}"]`);
  await page.waitForSelector('#proj-form');
  await page.click('[data-act="proj-del"]');
  const delTxt = (await page.textContent('#proj-del-box')).replace(/\s+/g, ' ');
  check(/tiene 1 orden de compra/.test(delTxt) && !(await page.$('[data-act="proj-del-yes"]')), 'proyecto con órdenes: no deja eliminarlo y dice por qué');
  await closeSheet(page);

  // Ver las pantallas de los conduces.
  await page.click('[data-tab="facturas"]');
  await page.click('#todo [data-act="cond-list"]');
  await page.waitForSelector('.sheet .cond-row');
  await settle(page, 600);
  await page.screenshot({ path: path.join(OUT, 'conduces-sin-factura.png') });
  await closeSheet(page);
  await openInv(page, 'B0100000777');
  await page.click('#inv-conds [data-act="open-cond"]');
  await page.waitForSelector('#cond-form');
  await settle(page, 700);
  check(/De la factura/.test(await page.textContent('#cond-form .status-line')) && (await page.inputValue('#c-num')) === '39807' && (await page.inputValue('#c-mat')) === 'Grava', 'la hoja del conduce muestra su factura y sus datos');
  await page.screenshot({ path: path.join(OUT, 'hoja-conduce.png') });
  await closeSheet(page);

  // El mismo conduce dos veces (mismo proveedor y número): avisa para no pagarlo doble.
  await page.evaluate(async () => {
    const all = await new Promise((r) => { const un = RT.db.collection('conduces').onSnapshot((s) => { un(); r(s.docs.map((d) => ({ id: d.id, ...d.data() }))); }); });
    const c = all.find((x) => x.number === '39807');
    const copy = { ...c, createdAt: new Date().toISOString(), auto: false };
    delete copy.id;
    await RT.db.collection('conduces').doc().set(copy);
  });
  await page.waitForFunction(() => /2 conduces/.test(document.querySelector('#f-list').textContent));
  const cardTxt = (await page.textContent('#f-list [data-act="open-inv"]:has-text("B0100000777")')).replace(/\s+/g, ' ');
  check(/2 conduces/.test(cardTxt) && /¿Conduce repetido\?/.test(cardTxt), 'conduce repetido: la factura avisa «¿Conduce repetido?»');
  await openInv(page, 'B0100000777');
  check((await page.$$('#inv-conds .pill.warn')).length === 2, 'los dos conduces repetidos salen marcados');
  await page.click('#inv-conds [data-act="open-cond"] >> nth=1');
  await page.waitForSelector('#cond-form');
  check(/para que no se pague doble/.test(await page.textContent('#cond-form')), 'la hoja del conduce explica que está repetido');
  console.log('     lecturas:', calls.join(', '));
  console.log('problemas:', problems.length ? problems : 'ninguno');
  await browser.close();
  server.close();
  process.exit(problems.length ? 1 : 0);
})().catch((e) => { console.error(e); console.log('problemas:', problems); process.exit(1); });
