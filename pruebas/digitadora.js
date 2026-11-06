// Envíos a la digitadora: qué facturas faltan por mandar, el PDF y la lista en papel, marcar, deshacer y el Excel.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = process.env.APP_ROOT || path.resolve(__dirname, '..');
const SP = process.env.PRUEBAS_TMP || path.join(require('os').tmpdir(), 'facturas-pruebas');
const OUT = path.join(SP, 'test-digitadora');
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
const pdfText = (f, pg) => execFileSync('pdftotext', ['-layout', ...(pg ? ['-f', String(pg), '-l', String(pg)] : []), f, '-']).toString();
const pdfPages = (f) => Number((execFileSync('pdfinfo', [f]).toString().match(/Pages:\s+(\d+)/) || [])[1]);
async function docs(page, coll) {
  return page.evaluate((c) => new Promise((r) => { const un = RT.db.collection(c).onSnapshot((s) => { un(); r(s.docs.map((d) => ({ id: d.id, ...d.data() }))); }); }), coll);
}
const settle = (page, ms = 500) => page.waitForTimeout(ms);
const closeSheet = async (page) => { await page.click('.sheet-h [data-act="sheet-close"]'); await page.waitForSelector('#sheet-root', { state: 'hidden' }); };
const cardText = async (page, id) => ((await page.textContent(`#f-list [data-act="open-inv"][data-id="${id}"]`)) || '').replace(/\s+/g, ' ');
const todoText = async (page) => ((await page.textContent('#todo')) || '').replace(/\s+/g, ' ');
// Toca el botón que saca el PDF, lo guarda y deja la hoja abierta (para confirmar el envío).
async function savePdf(page, clickSel, name) {
  await page.click(clickSel);
  await page.waitForSelector('[data-act="ready-save"]', { timeout: 60000 });
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-act="ready-save"]')]);
  const f = path.join(OUT, name);
  await dl.saveAs(f);
  return f;
}

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
  const files = { pdf: fs.readFileSync(path.join(SAMPLES, 'factura-lopez.pdf')).toString('base64'), jpg: fs.readFileSync(path.join(SAMPLES, 'conduce.jpg')).toString('base64') };
  const ids = await page.evaluate(async (f) => {
    const blob = (b64, type) => new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], { type });
    const pdf = await RT.assets.upload(blob(f.pdf, 'application/pdf'));
    const jpg = await RT.assets.upload(blob(f.jpg, 'image/jpeg'));
    await RT.db.doc('settings/general').set({ company: 'SUCRE B. LANTIGUA CONSTRUCTORA, S.R.L.', companyRnc: '104595114', preparedBy: 'J. Pérez' });
    const p1 = RT.db.collection('projects').doc(); await p1.set({ name: 'Residencial ENZO', createdAt: '2026-09-01T10:00:00.000Z' });
    const p2 = RT.db.collection('projects').doc(); await p2.set({ name: 'Caperuza 2', createdAt: '2026-09-02T10:00:00.000Z' });
    const base = { concept: '', ref: '', buyerRnc: '104595114', qrUrl: '', fiscal: '', notInvoice: false, noOrder: true, thumbId: null, pages: 1, xmlId: null, ai: 'off', currency: 'DOP', createdAt: '2026-11-06T10:00:00.000Z' };
    const a = RT.db.collection('invoices').doc(); await a.set({ ...base, projectId: p2.id, supplier: 'Transporte y Agregados S. López', rnc: '130999998', number: 'B0100000777', date: '2026-11-05', amount: 8000, itbis: 0, fileId: pdf.id, fileType: 'application/pdf', fileName: 'factura-lopez.pdf' });
    const b = RT.db.collection('invoices').doc(); await b.set({ ...base, projectId: p1.id, supplier: 'Bloques del Cibao', rnc: '131555777', number: 'B0100000888', date: '2026-11-06', amount: 4720, itbis: 720, fileId: jpg.id, fileType: 'image/jpeg', fileName: 'bloques.jpg' });
    const c = RT.db.collection('invoices').doc(); await c.set({ ...base, projectId: p1.id, supplier: 'Ferretería Ochoa', rnc: '131023452', number: 'B0100000502', date: '2026-11-02', amount: 1000, itbis: 152.54, fileId: null, fileType: 'image/jpeg', fileName: 'ochoa.jpg' });
    const d = RT.db.collection('invoices').doc(); await d.set({ ...base, projectId: p1.id, supplier: 'Recibo de caja', rnc: '', number: '', date: '2026-11-03', amount: 300, itbis: null, notInvoice: true, fileId: null, fileType: 'image/jpeg', fileName: 'recibo.jpg' });
    return { a: a.id, b: b.id, c: c.id, d: d.id };
  }, files);
  await page.reload();
  await page.waitForSelector('#f-list [data-act="open-inv"]');
  await page.click('[data-act="backup-later"]').catch(() => {});
  await page.click('[data-act="filter"][data-f="todas"]').catch(() => {});
  await settle(page);

  // 1) Las que faltan por mandar: etiqueta en la tarjeta y aviso en «Para hacer».
  check(/Por digitar/.test(await cardText(page, ids.a)) && /Por digitar/.test(await cardText(page, ids.b)) && /Por digitar/.test(await cardText(page, ids.c)), 'las facturas sin mandar dicen «Por digitar»');
  const dCard = await page.$(`#f-list [data-act="open-inv"][data-id="${ids.d}"]`);
  check(!dCard || !/Por digitar/.test(await cardText(page, ids.d)), 'lo que no es factura no sale como por digitar');
  check(/3 facturas por mandar a la digitadora/.test(await todoText(page)), '«Para hacer» dice: 3 facturas por mandar a la digitadora');
  await page.screenshot({ path: path.join(OUT, 'lista.png') });

  // 2) La hoja para mandar: por proyecto, todas marcadas, el nombre de la digitadora se guarda.
  await page.click('#todo [data-act="digi-open"]');
  await page.waitForSelector('#digi-name');
  const boxes = await page.$$eval('#sheet-root input[data-digi="inv"]', (bs) => bs.map((b) => [b.value, b.checked]));
  check(boxes.length === 3 && boxes.every((b) => b[1]) && !boxes.some((b) => b[0] === ids.d), 'salen las 3 facturas, todas marcadas');
  const sheetTxt = (await page.textContent('#sheet-root')).replace(/\s+/g, ' ');
  check(/Caperuza 2/.test(sheetTxt) && /Residencial ENZO/.test(sheetTxt) && /Todas \(3\)/.test(sheetTxt), 'divididas por proyecto, con «Todas (3)»');
  await page.fill('#digi-name', 'Yokasta');
  await page.dispatchEvent('#digi-name', 'change');
  await settle(page);
  const dg = await page.evaluate(async () => (await RT.db.doc('settings/digitacion').get()).data());
  check(dg && dg.name === 'Yokasta', 'el nombre de la digitadora queda guardado');
  await page.click(`#sheet-root input[data-digi="inv"][value="${ids.c}"]`);
  check(/^2 facturas$/.test((await page.textContent('#digi-sum')).trim()) && await page.$eval('#digi-all', (e) => e.indeterminate), 'al quitar una, dice 2 facturas');
  await page.screenshot({ path: path.join(OUT, 'mandar.png') });

  // 3) Mandar en PDF: la lista y cada factura detrás; no se marca hasta confirmar.
  const pdf = await savePdf(page, '[data-act="digi-pdf"]', 'envio-1.pdf');
  await page.waitForSelector('#envio-confirm.pulse', { timeout: 5000 }).catch(() => {});
  check(!!(await page.$('#envio-confirm.pulse')) && /marcar 2 facturas/.test(await page.textContent('#envio-confirm')), 'después de guardar el PDF, pide confirmar que se mandó');
  const cover = pdfText(pdf, 1);
  console.log('     portada:', cover.replace(/\s+/g, ' ').slice(0, 400));
  check(/FACTURAS PARA DIGITAR/.test(cover) && /Envío 1/.test(cover) && /Para: Yokasta/.test(cover) && /Entrega: J\. Pérez/.test(cover), 'PDF: portada con el número de envío, para quién y quién entrega');
  check(/B0100000777/.test(cover) && /B0100000888/.test(cover) && !/B0100000502/.test(cover) && /RD\$12,720\.00/.test(cover) && /Recibió/.test(cover), 'PDF: las 2 facturas elegidas, el total y la firma de recibido');
  check(pdfPages(pdf) === 3 && /TRANSPORTE Y AGREGADOS S\. LOPEZ/.test(pdfText(pdf)), 'PDF: detrás va cada factura (el PDF y la foto): 3 páginas');
  execFileSync('pdftoppm', ['-r', '60', '-png', '-f', '1', '-l', '1', '-singlefile', pdf, path.join(OUT, 'portada')]);
  check((await docs(page, 'envios')).length === 0 && /Por digitar/.test(await cardText(page, ids.a)), 'antes de confirmar, nada queda marcado');
  await page.screenshot({ path: path.join(OUT, 'confirmar.png') });
  await page.click('[data-act="envio-ok"]');
  await page.waitForSelector('#sheet-root', { state: 'hidden' });
  await settle(page);
  let envs = await docs(page, 'envios');
  check(envs.length === 1 && envs[0].number === 1 && envs[0].method === 'archivo' && envs[0].to === 'Yokasta' && [...envs[0].invoiceIds].sort().join() === [ids.a, ids.b].sort().join(), 'confirmado: queda el envío 1 con las 2 facturas');
  check(!/Por digitar/.test(await cardText(page, ids.a)) && !/Por digitar/.test(await cardText(page, ids.b)) && /Por digitar/.test(await cardText(page, ids.c)), 'las mandadas ya no dicen «Por digitar»; la otra sí');
  check(/1 factura por mandar a la digitadora/.test(await todoText(page)), '«Para hacer» baja a 1');

  // 4) En la factura: cuándo se mandó; «No se la mandé» y «Ya se la mandé».
  await page.click(`#f-list [data-act="open-inv"][data-id="${ids.a}"]`);
  await page.waitForSelector('#inv-form');
  let ft = (await page.textContent('#inv-form')).replace(/\s+/g, ' ');
  check(/Se le mandó a la digitadora el .+, en PDF, a Yokasta\. Ver envío 1/.test(ft),'la factura dice cuándo se mandó, en qué envío y a quién');
  await settle(page, 700);
  await page.$eval('#inv-form [data-act="digi-undo-one"]', (e) => e.scrollIntoView({ block: 'center' }));
  await settle(page, 300);
  await page.screenshot({ path: path.join(OUT, 'factura-mandada.png') });
  await page.click('#inv-form [data-act="digi-undo-one"]');
  await page.waitForFunction(() => /Todavía no se la has mandado/.test(document.querySelector('#inv-form').textContent), null, { timeout: 5000 }).catch(() => {});
  envs = await docs(page, 'envios');
  check(/Todavía no se la has mandado/.test(await page.textContent('#inv-form')) && envs.length === 1 && envs[0].invoiceIds.join() === ids.b, '«No se la mandé» la saca del envío; el envío sigue con la otra');
  await page.click('#inv-form [data-act="digi-one"]');
  await page.waitForFunction(() => /marcada a mano/.test(document.querySelector('#inv-form').textContent), null, { timeout: 5000 }).catch(() => {});
  envs = await docs(page, 'envios');
  ft = (await page.textContent('#inv-form')).replace(/\s+/g, ' ');
  check(envs.length === 2 && envs.some((e) => e.number === 2 && e.method === 'manual' && e.invoiceIds.join() === ids.a) && /marcada a mano, a Yokasta\. Ver envío 2/.test(ft),'«Ya se la mandé» la marca a mano (envío 2)');
  // El envío se abre desde la factura.
  await page.click('#inv-form [data-act="envio-view"]');
  await page.waitForFunction(() => /Envío 2/.test((document.querySelector('.sheet-h h2') || {}).textContent || ''), null, { timeout: 5000 }).catch(() => {});
  check(/Envío 2/.test(await page.textContent('.sheet-h h2')) && /Transporte y Agregados/.test(await page.textContent('#sheet-root')), 'el envío se abre desde la factura, con sus facturas');
  await closeSheet(page);

  // 5) Lista en papel: solo la lista, para que firme de recibido.
  await page.click('#todo [data-act="digi-open"]');
  await page.waitForSelector('#digi-name');
  check((await page.$$('#sheet-root input[data-digi="inv"]')).length === 1 && /Envíos anteriores/.test(await page.textContent('#sheet-root')), 'queda 1 por mandar, y se ven los envíos anteriores');
  const paper = await savePdf(page, '[data-act="digi-paper"]', 'envio-3.pdf');
  const pt = pdfText(paper);
  check(pdfPages(paper) === 1 && /Envío 3/.test(pt) && /B0100000502/.test(pt) && /Recibió/.test(pt), 'en papel: una sola página con la lista (envío 3) y la firma');
  check(/Ya se las entregué: marcar 1 factura/.test(await page.textContent('#envio-confirm')), 'en papel, se confirma al entregarla');
  await page.click('[data-act="envio-ok"]');
  await page.waitForSelector('#sheet-root', { state: 'hidden' });
  await settle(page);
  envs = await docs(page, 'envios');
  check(envs.length === 3 && envs.some((e) => e.number === 3 && e.method === 'papel'), 'queda el envío 3, en papel');
  check(!/digitadora/.test(await todoText(page)) && !(await page.$$eval('#f-list .pill.digi', (p) => p.length)), 'todo mandado: no queda nada «Por digitar»');

  // 6) Deshacer un envío entero (desde Proyectos → Digitadora).
  await page.click('[data-tab="proyectos"]');
  await page.waitForSelector('#sup-bar [data-act="digi-open"]');
  check(/^Digitadora$/.test((await page.textContent('#sup-bar [data-act="digi-open"]')).trim()), 'en Proyectos está el botón Digitadora');
  await page.click('#sup-bar [data-act="digi-open"]');
  await page.waitForSelector('#digi-name');
  const e3 = envs.find((e) => e.number === 3);
  await page.click(`#sheet-root [data-act="envio-undo"][data-id="${e3.id}"]`);
  await settle(page, 300);
  check(/¿Deshacer\? Toca otra vez/.test(await page.textContent(`#sheet-root [data-act="envio-undo"][data-id="${e3.id}"]`)) && (await docs(page, 'envios')).length === 3, 'deshacer pide un segundo toque');
  await page.click(`#sheet-root [data-act="envio-undo"][data-id="${e3.id}"]`);
  await page.waitForFunction(() => document.querySelectorAll('#sheet-root input[data-digi="inv"]').length === 1, null, { timeout: 5000 }).catch(() => {});
  envs = await docs(page, 'envios');
  check(envs.length === 2 && (await page.$$('#sheet-root input[data-digi="inv"]')).length === 1, 'al deshacer el envío 3, su factura vuelve a «por mandar»');
  await closeSheet(page);
  check(/Digitadora \(1 por mandar\)/.test(await page.textContent('#sup-bar')), 'el botón dice cuántas faltan');

  // 7) Excel: la columna «Mandada a digitar».
  await page.click('[data-tab="facturas"]');
  await page.click('[data-act="list-xlsx"]');
  await page.waitForSelector('[data-act="ready-save"]', { timeout: 60000 });
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-act="ready-save"]')]);
  const xl = path.join(OUT, 'facturas.xlsx');
  await dl.saveAs(xl);
  const xr = JSON.parse(execFileSync('python3', ['-I', '-c', `
import openpyxl, sys, json
wb = openpyxl.load_workbook(sys.argv[1])
ws = wb['Facturas']
rows = list(ws.iter_rows(values_only=True))
h = next(r for r in rows if r and 'Mandada a digitar' in r)
k = h.index('Mandada a digitar'); n = h.index('NCF') if 'NCF' in h else None
out = {}
for r in rows[rows.index(h) + 1:]:
    if r and n is not None and r[n]:
        out[str(r[n])] = str(r[k]) if r[k] is not None else ''
print(json.dumps(out))
`, xl]).toString());
  console.log('     excel:', JSON.stringify(xr));
  const todayIso = await page.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
  const ncfKey = (v) => Object.keys(xr).find((k) => k.replace(/\D/g, '') === v.replace(/\D/g, ''));
  check(ncfKey('B0100000777') && xr[ncfKey('B0100000777')].startsWith(todayIso) && ncfKey('B0100000502') && xr[ncfKey('B0100000502')] === '', 'Excel: la columna «Mandada a digitar» con la fecha, vacía en la que falta');

  // 8) Si el archivo de una factura no está en el teléfono, el PDF sale igual y lo dice.
  await page.click('.sheet-h [data-act="sheet-close"]');
  await page.evaluate(async (id) => { await RT.db.doc('invoices/' + id).update({ fileId: 'f'.repeat(32), fileType: 'image/jpeg' }); }, ids.c);
  await settle(page);
  await page.click('#todo [data-act="digi-open"]');
  await page.waitForSelector('#digi-name');
  const lost = await savePdf(page, '[data-act="digi-pdf"]', 'sin-archivo.pdf');
  check(pdfPages(lost) === 1 && /No se pudo poner en el PDF el archivo de Ferretería Ochoa/.test(await page.textContent('#sheet-root')), 'sin el archivo: el PDF sale con la lista y avisa cuál falta');
  check((await docs(page, 'envios')).length === 2, 'y no se marca nada hasta confirmar');

  console.log('problemas:', problems.length ? problems : 'ninguno');
  await browser.close();
  server.close();
  process.exit(problems.length ? 1 : 0);
})().catch((e) => { console.error(e); console.log('problemas:', problems); process.exit(1); });
