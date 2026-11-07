// Pantallas: en el teléfono, 5 pestañas con «Más», «Para hacer» corto y etiquetas secundarias suaves; en la
// computadora, los filtros en una barra, la tabla a la vista y marcar varias facturas para pago, digitadora o Excel.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = process.env.APP_ROOT || path.resolve(__dirname, '..');
const SP = process.env.PRUEBAS_TMP || path.join(require('os').tmpdir(), 'facturas-pruebas');
const OUT = path.join(SP, 'test-pantallas');
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
const settle = (page, ms = 450) => page.waitForTimeout(ms);
const txt = async (page, sel) => ((await page.textContent(sel).catch(() => '')) || '').replace(/\s+/g, ' ').trim();
async function seed(page) {
  return page.evaluate(async () => {
    await RT.db.doc('settings/general').set({ company: 'SUCRE B. LANTIGUA CONSTRUCTORA, S.R.L.', companyRnc: '104595114' });
    const P = {};
    for (const [k, n] of [['enzo', 'Residencial ENZO'], ['cap', 'Caperuza 2']]) { const r = RT.db.collection('projects').doc(); await r.set({ name: n, createdAt: '2026-09-01T10:00:00.000Z' }); P[k] = r.id; }
    await RT.db.collection('orders').doc().set({ number: 2, status: 'enviada', supplier: 'Bloques del Cibao', projectId: P.cap, date: '2026-11-03', items: [{ qty: '400', unit: 'uds', desc: 'Block' }], createdAt: '2026-11-03T10:00:00.000Z' });
    const base = { concept: '', ref: '', buyerRnc: '104595114', qrUrl: '', fiscal: '', notInvoice: false, noOrder: true, fileId: null, fileType: 'image/jpeg', thumbId: null, pages: 1, fileName: 'f.jpg', xmlId: null, ai: 'off', currency: 'DOP', createdAt: '2026-11-01T13:00:00.000Z' };
    const I = {};
    const add = async (k, pk, sup, rnc, ncf, date, amt, itbis, extra = {}) => { const r = RT.db.collection('invoices').doc(); await r.set({ ...base, projectId: pk ? P[pk] : null, supplier: sup, rnc, number: ncf, date, amount: amt, itbis, ...extra }); I[k] = r.id; };
    await add('a', 'enzo', 'Ferretería Ochoa', '131023452', 'B0100000502', '2026-10-25', 38350, 5850);
    await add('b', 'enzo', 'Plomería Rosario', '131444555', 'B0100000901', '2026-10-28', 12500, 1906.78);
    await add('c', 'cap', 'Transporte y Agregados S. López', '130999998', 'B0100000777', '2026-11-05', 8000, 0);
    await add('d', 'cap', 'Bloques del Cibao', '131555777', 'B0100000888', '2026-11-06', 18000, 2745.76, { noOrder: false });
    await add('e', null, 'Depósito El Constructor', '', '', '2026-11-06', null, null);
    await RT.db.collection('conduces').doc().set({ invoiceId: null, projectId: P.cap, projectHint: '', supplier: 'Transporte y Agregados S. López', rnc: '130999998', number: '39811', date: '2026-11-06', total: 2000, currency: 'DOP', material: 'Grava', qty: '5 m³', trips: 1, fileId: null, fileType: 'image/jpeg', thumbId: null, pages: 1, fileName: 'c.jpg', ai: 'off', aiErr: '', auto: false, createdAt: '2026-11-06T12:30:00.000Z' });
    const pay = RT.db.collection('payments').doc(); await pay.set({ name: 'Pago semana 44', date: '2026-10-30', status: 'presentado', invoiceIds: [], createdAt: '2026-10-30T10:00:00.000Z' });
    return I;
  });
}

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const BASE = `http://127.0.0.1:${server.address().port}/facturas/`;
  const browser = await chromium.launch();

  // ---------- teléfono ----------
  const tctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const tp = await tctx.newPage();
  tp.on('pageerror', (e) => problems.push('error de página (teléfono): ' + e.message));
  await tp.goto(BASE);
  await tp.waitForSelector('.empty h2');
  await seed(tp);
  await tp.reload();
  await tp.waitForSelector('#f-list [data-act="open-inv"]');
  await tp.click('[data-act="backup-later"]').catch(() => {});
  await settle(tp);
  const visTabs = await tp.$$eval('.tabs button', (bs) => bs.filter((b) => b.offsetParent !== null).map((b) => b.textContent.trim()));
  check(visTabs.join('|') === 'Facturas|Conduces|Órdenes|Pagos|Más', 'teléfono: 5 pestañas abajo (' + visTabs.join(', ') + ')');
  const todoRows = await tp.$$('#todo .todo-row');
  const todoTxt = await txt(tp, '#todo');
  check(todoRows.length === 4 && /Ver todo \(\d+\)/.test(todoTxt), '«Para hacer» muestra 4 cosas y «Ver todo»');
  const firstCls = await tp.$eval('#todo .todo-row', (r) => r.className);
  check(/warn/.test(firstCls), 'lo urgente va arriba (' + firstCls + ')');
  await tp.click('#todo [data-act="todo-all"]');
  await settle(tp, 250);
  const allN = (await tp.$$('#todo .todo-row')).length;
  check(allN > 4 && /Ver menos/.test(await txt(tp, '#todo')), '«Ver todo» muestra todas (' + allN + ')');
  await tp.click('#todo [data-act="todo-all"]');
  const card = await tp.$eval('#f-list [data-act="open-inv"]', (c) => [...c.querySelectorAll('.pill')].map((p) => (p.classList.contains('minor') ? 'm:' : '') + p.textContent.trim()));
  console.log('     etiquetas de una tarjeta:', JSON.stringify(card));
  const firstMinor = card.findIndex((x) => x.startsWith('m:'));
  check(firstMinor > 0 && card.slice(firstMinor).every((x) => x.startsWith('m:')) && card.some((x) => x === 'm:Por digitar'), 'las etiquetas secundarias (No lleva orden, Por digitar) van al final y más suaves');
  await tp.screenshot({ path: path.join(OUT, 'telefono.png') });
  await tp.click('.tabs [data-act="more-menu"]');
  await tp.waitForSelector('.menu-list');
  const menu = await tp.$$eval('.menu-row b', (bs) => bs.map((b) => b.textContent.trim()));
  check(menu.join('|') === 'Pase de lista|Proyectos|Proveedores|Digitadora|Papelera|Ajustes', '«Más» tiene: ' + menu.join(', '));
  await tp.screenshot({ path: path.join(OUT, 'mas.png') });
  await tp.click('.menu-row[data-go="asistencia"]');
  await tp.waitForSelector('#sheet-root', { state: 'hidden' });
  await settle(tp);
  check((await tp.textContent('#title')) === 'Pase de lista' && (await tp.$eval('.tabs .more-tab', (b) => b.getAttribute('aria-current'))) === 'page', 'desde «Más» se abre el Pase de lista, y «Más» queda marcado');
  await tp.click('.tabs [data-act="more-menu"]');
  await tp.click('.menu-row[data-go="proyectos"]');
  await settle(tp);
  check((await tp.textContent('#title')) === 'Proyectos', 'y Proyectos');
  await tctx.close();

  // ---------- computadora ----------
  const dctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, acceptDownloads: true });
  const dp = await dctx.newPage();
  dp.on('pageerror', (e) => problems.push('error de página (computadora): ' + e.message));
  await dp.goto(BASE);
  await dp.waitForSelector('.empty h2');
  const I = await seed(dp);
  await dp.reload();
  await dp.waitForSelector('#f-list table.inv-tbl');
  await dp.click('[data-act="backup-later"]').catch(() => {});
  await settle(dp);
  const box = (sel) => dp.$eval(sel, (e) => { const r = e.getBoundingClientRect(); return { top: Math.round(r.top), left: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height) }; });
  const seg = await box('#f-seg'), search = await box('#v-facturas > .search-box'), filters = await box('#f-filters'), todo = await box('#todo'), table = await box('#f-list table.inv-tbl');
  console.log('     cajas:', JSON.stringify({ seg, search, filters, todo, table }));
  check(Math.abs(seg.top - search.top) < 30 && search.left > seg.left + seg.w - 2, 'los estados y la búsqueda van en la misma fila');
  check(filters.top > seg.top && filters.top < seg.top + 90 && todo.left > search.left, 'los filtros van debajo, y «Para hacer» a la derecha');
  check(table.top < 600, `la tabla se ve sin bajar (empieza a ${table.top}px de 768)`);
  await dp.screenshot({ path: path.join(OUT, 'computadora.png') });
  // Marcar varias
  check(!(await dp.isVisible('#sel-bar')), 'sin marcar, no hay barra');
  await dp.check(`#f-list input[data-sel="inv"][value="${I.a}"]`);
  await dp.check(`#f-list input[data-sel="inv"][value="${I.b}"]`);
  await settle(dp, 200);
  check(await dp.isVisible('#sel-bar') && /2 facturas elegidas · RD\$50,850\.00/.test(await txt(dp, '#sel-bar')), 'al marcar 2: «2 facturas elegidas · RD$50,850.00»');
  check(!(await dp.$('#inv-form')), 'marcar una casilla no abre la factura');
  await dp.screenshot({ path: path.join(OUT, 'elegidas.png') });
  await dp.click('[data-act="sel-pay"]');
  await dp.waitForSelector('#pick-form');
  const picked = await dp.$$eval('#pick-form input[data-pick="inv"]:checked', (bs) => bs.map((b) => b.value).sort());
  check(picked.join() === [I.a, I.b].sort().join(), '«Armar pago» abre el pago con esas 2 marcadas');
  await dp.click('.sheet-h [data-act="sheet-close"]');
  await dp.click('[data-act="sel-digi"]');
  await dp.waitForSelector('#digi-name');
  const dg = await dp.$$eval('#sheet-root input[data-digi="inv"]', (bs) => bs.filter((b) => b.checked).map((b) => b.value).sort());
  check(dg.join() === [I.a, I.b].sort().join() && /^2 facturas$/.test((await txt(dp, '#digi-sum'))), '«Mandar a la digitadora» abre con solo esas 2 marcadas');
  await dp.click('.sheet-h [data-act="sheet-close"]');
  await dp.click('[data-act="sel-xlsx"]');
  await dp.waitForSelector('[data-act="ready-save"]', { timeout: 60000 });
  const [dl] = await Promise.all([dp.waitForEvent('download'), dp.click('[data-act="ready-save"]')]);
  const xl = path.join(OUT, 'elegidas.xlsx');
  await dl.saveAs(xl);
  const n = JSON.parse(execFileSync('python3', ['-I', '-c', `
import openpyxl, sys, json
ws = openpyxl.load_workbook(sys.argv[1])['Facturas']
rows = list(ws.iter_rows(values_only=True))
print(json.dumps(len([r for r in rows[5:] if r and isinstance(r[0], int)])))
`, xl]).toString());
  check(n === 2, 'el Excel sale con solo las 2 elegidas');
  await dp.click('.sheet-h [data-act="sheet-close"]');
  // «Elegir todas» de un proyecto
  const gAll = await dp.$('#f-list input[data-sel="all"]');
  await gAll.check();
  await settle(dp, 200);
  const nSel = await dp.$$eval('#f-list input[data-sel="inv"]:checked', (bs) => bs.length);
  check(nSel >= 3 && /facturas elegidas/.test(await txt(dp, '#sel-bar')), 'la casilla del encabezado marca todas las de ese grupo');
  await dp.click('[data-act="sel-clear"]');
  await settle(dp, 200);
  check(!(await dp.isVisible('#sel-bar')) && !(await dp.$$eval('#f-list input[data-sel="inv"]:checked', (bs) => bs.length)), '«Quitar» limpia la selección');
  // Sin nada en «Para hacer», la búsqueda usa el ancho
  await dp.evaluate(() => { document.querySelector('#todo').hidden = true; });
  await settle(dp, 100);
  const s2 = await box('#v-facturas > .search-box');
  check(s2.left + s2.w > 1200, 'sin «Para hacer», los filtros usan todo el ancho');
  await dctx.close();

  console.log('problemas:', problems.length ? problems : 'ninguno');
  await browser.close();
  server.close();
  process.exit(problems.length ? 1 : 0);
})().catch((e) => { console.error(e); console.log('problemas:', problems); process.exit(1); });
