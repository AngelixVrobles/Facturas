// Facturas con orden de compra y sin ella: etiqueta en cada factura, filtro Todas / Con orden / Sin orden,
// columna OC del PDF del pago y estado de la orden en el Excel.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = process.env.APP_ROOT || path.resolve(__dirname, '..');
const SP = process.env.PRUEBAS_TMP || path.join(require('os').tmpdir(), 'facturas-pruebas');
const OUT = path.join(SP, 'test-octags');
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

async function download(page, clickSel, name) {
  await page.click(clickSel);
  await page.waitForSelector('[data-act="ready-save"]', { timeout: 60000 });
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-act="ready-save"]')]);
  const f = path.join(OUT, name);
  await dl.saveAs(f);
  await page.click('.sheet-h [data-act="sheet-close"]');
  return f;
}
// Lo que muestra cada tarjeta: proveedor y sus etiquetas de orden (texto y clase).
const cards = (page) => page.$$eval('#f-list [data-act="open-inv"]', (els) => els.map((e) => ({
  sup: e.querySelector('.supplier').textContent,
  oc: [...e.querySelectorAll('.pill.oc, .pill.nooc')].map((p) => p.className.replace('pill ', '') + '=' + p.textContent),
  warnSinOrden: [...e.querySelectorAll('.pill.warn')].some((p) => p.textContent === 'Sin orden'),
})));
const chipText = (page) => page.$$eval('#f-ochips .chip', (els) => els.map((e) => [...e.querySelectorAll('span')].map((x) => x.textContent.trim()).join(' ') + (e.getAttribute('aria-pressed') === 'true' ? '*' : '')));
const sups = async (page) => (await cards(page)).map((c) => c.sup).sort().join('|');
const settle = (page) => page.waitForTimeout(250);

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

  // 1) Sin órdenes en la app: no aparece nada de órdenes (la empresa puede no usarlas).
  const ids = await page.evaluate(async () => {
    const db = RT.db;
    await db.doc('settings/general').set({ company: 'SUCRE B. LANTIGUA CONSTRUCTORA, S.R.L.', companyRnc: '104595114' });
    const pA = db.collection('projects').doc(); await pA.set({ name: 'Caperuza 2', createdAt: '2026-09-01T10:00:00.000Z' });
    const base = { projectId: pA.id, concept: '', ref: '', notInvoice: false, fileId: null, fileType: 'image/jpeg', thumbId: null, pages: 1, fileName: 'x.jpg', xmlId: null, ai: 'off', buyerRnc: '104595114', currency: 'DOP', fiscal: '', qrUrl: '', date: '2026-11-02', createdAt: '2026-11-02T10:00:00.000Z' };
    const add = async (o) => { const d = db.collection('invoices').doc(); await d.set({ ...base, ...o }); return d.id; };
    return {
      p: pA.id,
      A: await add({ supplier: 'Ferretería Americana', rnc: '101001577', number: 'B0100000101', amount: 1180, itbis: 180 }),
      B: await add({ supplier: 'Ferretería Ochoa', rnc: '131023452', number: 'B0100000102', amount: 2360, itbis: 360 }),
      C: await add({ supplier: 'Importadora Caribe', rnc: '101555122', number: 'B0100000103', amount: 590, itbis: 90 }),
      D: await add({ supplier: 'Colmado La Esquina', rnc: '130000011', number: 'B0100000104', amount: 354, itbis: 54, noOrder: true }),
      E: await add({ supplier: 'Bloques del Cibao', rnc: '130000022', number: 'B0100000105', amount: 4720, itbis: 720, date: '2026-09-20', createdAt: '2026-09-20T10:00:00.000Z' }),
      F: await add({ supplier: 'Maderas Nacionales', rnc: '130000033', number: 'B0100000106', amount: 826, itbis: 126 }),
    };
  });
  await page.waitForSelector('#f-list [data-act="open-inv"]');
  await settle(page);
  check((await page.isHidden('#f-ochips')) && (await page.$$('#f-list .pill.oc, #f-list .pill.nooc')).length === 0, 'sin órdenes en la app: no hay filtro ni etiquetas de orden');

  // 2) Con órdenes: una firmada, una por firmar y una anulada. E es anterior a la primera orden.
  await page.evaluate(async (ids) => {
    const db = RT.db;
    const t = '2026-10-30T10:00:00.000Z';
    const mk = async (number, status, supplier) => { const o = db.collection('orders').doc(); await o.set({ number, date: '2026-10-30', projectId: ids.p, supplier, requestedBy: 'Ing. Ramón Peña', items: [{ qty: 1, unit: 'Ud', desc: 'Material' }], status, createdAt: t, ...(status === 'autorizada' ? { signedAt: '2026-10-31' } : {}) }); return o.id; };
    const o1 = await mk(1, 'autorizada', 'Ferretería Americana');
    const o2 = await mk(2, 'enviada', 'Ferretería Ochoa');
    const o3 = await mk(3, 'anulada', 'Maderas Nacionales');
    await db.doc('invoices/' + ids.A).update({ orderId: o1 });
    await db.doc('invoices/' + ids.B).update({ orderId: o2 });
    await db.doc('invoices/' + ids.F).update({ orderId: o3 });
  }, ids);
  await page.waitForFunction(() => document.querySelectorAll('#f-list .pill.oc').length === 3);
  await settle(page);
  const all = await cards(page);
  const by = Object.fromEntries(all.map((c) => [c.sup, c]));
  console.log('     etiquetas:', JSON.stringify(all.map((c) => [c.sup, c.oc.join(', '), c.warnSinOrden ? 'aviso' : ''])));
  check(by['Ferretería Americana'].oc.join() === 'oc ok=OC-0001', 'con orden firmada: «OC-0001» en verde');
  check(by['Ferretería Ochoa'].oc.join() === 'oc pend=OC-0002 por firmar', 'con orden por firmar: «OC-0002 por firmar» en ámbar');
  check(by['Maderas Nacionales'].oc.join() === 'oc bad=OC-0003 anulada', 'con orden anulada: «OC-0003 anulada» en rojo');
  check(by['Importadora Caribe'].oc.length === 0 && by['Importadora Caribe'].warnSinOrden, 'sin orden y la debía llevar: aviso rojo «Sin orden» (una sola etiqueta)');
  check(by['Colmado La Esquina'].oc.join() === 'nooc=No lleva orden' && !by['Colmado La Esquina'].warnSinOrden, 'marcada que no lleva: «No lleva orden» en gris');
  check(by['Bloques del Cibao'].oc.join() === 'nooc=Sin orden' && !by['Bloques del Cibao'].warnSinOrden, 'anterior a las órdenes: «Sin orden» en gris, sin aviso');

  // 3) Filtro Todas / Con orden / Sin orden con sus cantidades.
  check((await chipText(page)).join(' | ') === 'Todas 6* | Con orden 3 | Sin orden 3', 'filtro: ' + (await chipText(page)).join(' | '));
  await page.click('[data-act="backup-later"]').catch(() => {});
  await settle(page);
  const shot = async (name) => { await page.$eval('#f-seg', (e) => window.scrollTo(0, e.getBoundingClientRect().top + window.scrollY - 12)); await settle(page); await page.screenshot({ path: path.join(OUT, name) }); };
  await shot('facturas-todas.png');
  await page.click('[data-act="invorder"][data-o="con"]');
  await settle(page);
  check((await sups(page)) === 'Ferretería Americana|Ferretería Ochoa|Maderas Nacionales', 'Con orden: ' + (await sups(page)));
  check(/3 facturas/.test(await page.textContent('#f-sum')), 'el total de arriba cuenta solo las 3 con orden');
  await page.click('[data-act="invorder"][data-o="sin"]');
  await settle(page);
  check((await sups(page)) === 'Bloques del Cibao|Colmado La Esquina|Importadora Caribe', 'Sin orden: ' + (await sups(page)));
  check((await chipText(page)).join(' | ') === 'Todas 6 | Con orden 3 | Sin orden 3*', 'el filtro marca «Sin orden»');
  await shot('facturas-sin-orden.png');

  // Las cantidades siguen al estado elegido arriba (Pendientes / Pagadas…).
  await page.click('[data-act="filter"][data-f="pagadas"]');
  await settle(page);
  check((await chipText(page)).join(' | ') === 'Todas 0 | Con orden 0 | Sin orden 0*', 'en Pagadas las cantidades son 0');
  check(/No hay facturas pagadas sin orden de compra\./.test(await page.textContent('#f-list')), 'mensaje vacío dice «pagadas sin orden de compra»');
  await page.click('[data-act="filter"][data-f="pendientes"]');
  await settle(page);

  // 4) Excel de la lista filtrada: dice el filtro y el estado de la orden.
  const xl = await download(page, '[data-act="list-xlsx"]', 'sin-orden.xlsx');
  const xr = JSON.parse(execFileSync('python3', ['-I', '-c', `
import openpyxl, sys, json
wb = openpyxl.load_workbook(sys.argv[1])
res = {}
ws = wb['Facturas']; rows = list(ws.iter_rows(values_only=True)); h = rows[4]
res['scope'] = ' '.join(str(c) for r in rows[:4] for c in r if c)
ei = h.index('Estado de la orden') + 1
data = [(r[h.index('Proveedor')], str(r[ei - 1] or ''), ws.cell(row=6 + k, column=ei).font.color.rgb if ws.cell(row=6 + k, column=ei).font.color else None) for k, r in enumerate(rows[5:]) if r[0] is not None and isinstance(r[0], int)]
res['estado'] = sorted(f"{a}={b}" for a, b, c in data)
res['rojo'] = sorted(a for a, b, c in data if c and str(c).upper().endswith('B42318'))
ws = wb['Resumen']
res['control'] = {str(r[0]): r[1] for r in ws.iter_rows(values_only=True) if r and r[0] and isinstance(r[1], int)}
print(json.dumps(res, ensure_ascii=False, default=str))
`, xl]).toString());
  console.log('     excel:', JSON.stringify(xr));
  check(/Sin orden de compra/.test(xr.scope), 'el Excel dice que es la lista «Sin orden de compra»');
  check(xr.estado.join('|') === 'Bloques del Cibao=Sin orden|Colmado La Esquina=No lleva|Importadora Caribe=Sin orden', 'Excel: estado de la orden en cada factura');
  check(xr.rojo.join('|') === 'Importadora Caribe', 'Excel: en rojo solo la que debía llevar orden (' + xr.rojo.join(', ') + ')');
  check(xr.control['Con orden de compra'] === 0 && xr.control['Sin orden de compra'] === 2 && xr.control['Marcadas como que no llevan orden'] === 1, 'Resumen: con orden 0, sin orden 2, no llevan 1');

  // 5) Búsqueda por número de orden.
  await page.click('[data-act="invorder"][data-o="all"]');
  await page.fill('#f-search', 'oc-0002');
  await settle(page);
  check((await sups(page)) === 'Ferretería Ochoa', 'buscar «oc-0002» encuentra su factura');
  await page.fill('#f-search', '');
  await settle(page);

  // 6) El atajo «sin orden de compra» de Para hacer manda sobre el filtro y lo esconde.
  await page.click('[data-act="invorder"][data-o="con"]');
  await settle(page);
  await page.click('[data-act="focus"][data-f="sinorden"]');
  await settle(page);
  check((await sups(page)) === 'Importadora Caribe' && (await page.isHidden('#f-ochips')), 'atajo de Para hacer: muestra la que falta y esconde el filtro');
  await page.click('[data-act="focus-off"]');
  await settle(page);
  check((await sups(page)) === 'Ferretería Americana|Ferretería Ochoa|Maderas Nacionales' && !(await page.isHidden('#f-ochips')), 'al volver, sigue el filtro «Con orden»');

  // 7) Pago armado con las que no tienen orden: el PDF lo dice en la columna OC.
  await page.click('[data-act="invorder"][data-o="sin"]');
  await settle(page);
  await page.click('[data-act="new-pay-from"]');
  await page.fill('#pk-name', 'Pago sin orden');
  await page.click('#pk-go');
  await page.waitForSelector('#pd-body .bigtotal');
  check(/3 facturas/.test(await page.textContent('#pd-body')), 'el pago toma las 3 del filtro');
  const pdf = await download(page, '[data-act="pay-pdf"]', 'pago.pdf');
  const cover = pdfText(pdf, 1);
  const line = (ncf) => (cover.split('\n').find((l) => l.includes(ncf)) || '').replace(/\s+/g, ' ');
  console.log('     PDF:', JSON.stringify(['B0100000103', 'B0100000104', 'B0100000105'].map(line)));
  check(/B0100000103 Sin OC/.test(line('B0100000103')) && /B0100000104 No lleva/.test(line('B0100000104')) && /B0100000105 Sin OC/.test(line('B0100000105')), 'PDF del pago: «Sin OC» y «No lleva» en la columna OC');
  execFileSync('pdftoppm', ['-r', '60', '-f', '1', '-l', '1', '-png', pdf, path.join(OUT, 'pago')]);

  // 8) Tema oscuro (solo para mirar el contraste).
  await page.click('[data-tab="facturas"]');
  await page.click('[data-act="invorder"][data-o="all"]');
  await page.emulateMedia({ colorScheme: 'dark' });
  await settle(page);
  await shot('facturas-oscuro.png');

  console.log('problemas:', problems.length ? problems : 'ninguno');
  await browser.close();
  server.close();
  process.exit(problems.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
