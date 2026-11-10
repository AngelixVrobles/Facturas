// Comprobar que lo que salió de una obra es lo que llegó a la otra: anotar lo que llegó, faltantes, lo que se cobra,
// las fotos al salir y al llegar, aclarar la diferencia, «Para hacer», la hoja con la columna «Recibido» y el Excel.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = process.env.APP_ROOT || path.resolve(__dirname, '..');
const SP = process.env.PRUEBAS_TMP || path.join(require('os').tmpdir(), 'facturas-pruebas');
const OUT = path.join(SP, 'test-recepcion');
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
const pdfText = (f) => execFileSync('pdftotext', ['-layout', f, '-']).toString();
const settle = (page, ms = 450) => page.waitForTimeout(ms);
const txt = async (page, sel) => ((await page.textContent(sel).catch(() => '')) || '').replace(/\s+/g, ' ').trim();
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
const tr = async (page) => (await docs(page, 'traslados'))[0];

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
  const id = await page.evaluate(async () => {
    await RT.db.doc('settings/general').set({ company: 'SUCRE B. LANTIGUA CONSTRUCTORA, S.R.L.', companyRnc: '104595114' });
    const a = RT.db.collection('projects').doc(); await a.set({ name: 'Residencial ENZO', createdAt: '2026-09-01T10:00:00.000Z' });
    const b = RT.db.collection('projects').doc(); await b.set({ name: 'Monaco', createdAt: '2026-09-02T10:00:00.000Z' });
    await RT.db.collection('invoices').doc().set({ projectId: a.id, supplier: 'Ferretería Ochoa', rnc: '131023452', number: 'B0100000555', date: '2026-11-09', amount: 1000, itbis: 0, currency: 'DOP', noOrder: true, ai: 'off', fileId: null, createdAt: '2026-11-09T10:00:00.000Z', envio: { id: 'x', at: '2026-11-09' } });
    const t = RT.db.collection('traslados').doc();
    await t.set({ kind: 'material', number: 1, date: '2026-11-10', fromId: a.id, toId: b.id, items: [{ qty: 3, unit: 'm³', desc: 'Tierra', price: 800 }, { qty: 20, unit: 'Varilla', desc: 'Varilla de 3/8', price: 350 }, { qty: 10, unit: 'Saco', desc: 'Cemento gris', price: 600 }], total: 15400, deliveredBy: 'Juan del almacén', carriedBy: 'Pedro (chofer)', receivedBy: '', createdAt: '2026-11-10T13:00:00.000Z' });
    return t.id;
  });
  await page.reload();
  await page.waitForSelector('#todo .todo-row');
  await page.click('[data-act="backup-later"]').catch(() => {});
  const todoText = async () => { const more = await page.$('#todo [data-act="todo-all"]'); if (more && /Ver todo/.test(await more.textContent())) { await more.click(); await settle(page, 150); } return txt(page, '#todo'); };
  check(/1 traslado por recibir: falta anotar lo que llegó/.test(await todoText()), '«Para hacer»: 1 traslado por recibir');

  // 1) La hoja dice «Por recibir» y cómo se recibe.
  await page.click('.tabs [data-act="more-menu"]');
  await page.click('.menu-row[data-go="traslados"]');
  await page.click(`[data-act="tr-open"][data-id="${id}"]`);
  await page.waitForSelector('#tr-recv');
  check(/Por recibir/.test(await txt(page, '.status-line')) && /Sin firmar/.test(await txt(page, '.status-line')) && /cuenta lo que llegó, lo escribe en la columna «Recibido»/.test(await txt(page, '#tr-recv')), 'el traslado dice «Por recibir» y explica cómo se recibe');
  const pdf0 = pdfText(await download(page, '[data-act="tr-pdf"]', 'antes.pdf'));
  check(/Recibido/.test(pdf0) && /Quien recibe: cuente lo que llegó/.test(pdf0) && /Llegada: fecha ______/.test(pdf0), 'la hoja trae la columna «Recibido», la hora de llegada en blanco y la instrucción para quien recibe');

  // 2) Llegó menos: 2 m³ de tierra (de 3) y 18 varillas (de 20).
  await page.click(`[data-act="tr-open"][data-id="${id}"]`);
  await page.waitForSelector('#tr-recv');
  await page.click('[data-act="tr-recv-open"]');
  check((await page.inputValue('[data-rq="0"]')) === '3' && (await page.inputValue('[data-rq="1"]')) === '20', 'para anotar, viene lleno con lo que salió');
  await page.fill('[data-rq="0"]', '2');
  await page.fill('[data-rq="1"]', '18');
  await page.fill('#tr-rcv-by', 'Maestro Luis');
  await page.click('[data-act="tr-recv-save"]');
  await settle(page, 600);
  let t = await tr(page);
  check(t.received && t.received.qty.join(',') === '2,18,10' && t.received.by === 'Maestro Luis' && t.total === 13900 && t.sentTotal === 15400, 'queda anotado lo que llegó; a Monaco se le cuenta solo eso (RD$13,900 de RD$15,400)');
  const rv = await txt(page, '#tr-recv');
  check(/Faltan 1 m³ de Tierra \(RD\$800\.00\)/.test(rv) && /Faltan 2 Varilla de Varilla de 3\/8 \(RD\$700\.00\)/.test(rv) && /lo que faltó \(RD\$1,500\.00\) se queda en Residencial ENZO/.test(rv) && /Con diferencia/.test(await txt(page, '.status-line')), 'dice qué faltó, cuánto vale y que se queda en el ENZO hasta aclararlo');
  await page.$eval('#tr-recv', (e) => e.scrollIntoView({ block: 'center' }));
  await settle(page, 300);
  await page.screenshot({ path: path.join(OUT, 'recepcion.png') });

  // 3) Fotos al salir y al llegar.
  const foto = path.join(OUT, 'carga.png');
  await page.screenshot({ path: foto });
  let [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('[data-act="tr-photo"][data-k="out"]')]);
  await fc.setFiles(foto);
  await page.waitForSelector('[data-act="tr-photo-view"][data-k="out"]', { timeout: 10000 }).catch(() => {});
  [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('[data-act="tr-photo"][data-k="in"]')]);
  await fc.setFiles(foto);
  await page.waitForSelector('[data-act="tr-photo-view"][data-k="in"]', { timeout: 10000 }).catch(() => {});
  t = await tr(page);
  check(!!t.outPhotoId && !!t.inPhotoId && !!t.outPhotoAt && !t.signedFileId && /Al salir/.test(await txt(page, '#tr-recv')) && /Al llegar/.test(await txt(page, '#tr-recv')), 'se guardan la foto de la carga al salir y la de lo que llegó, con su hora (y no se confunden con la hoja firmada)');
  await page.click('.sheet-h [data-act="sheet-close"]');
  check(/Monaco le debe a Residencial ENZO/.test(await txt(page, '#t-acc')) && /RD\$13,900\.00/.test(await txt(page, '#t-acc')), 'la cuenta entre obras toma lo que llegó: RD$13,900');
  await page.click('.tabs [data-tab="facturas"]');
  await settle(page, 300);
  check(/1 traslado llegó con diferencia/.test(await todoText()) && !/por recibir/.test(await txt(page, '#todo')), '«Para hacer»: 1 traslado llegó con diferencia');

  // 4) La hoja ya con lo recibido.
  await page.click('.tabs [data-act="more-menu"]');
  await page.click('.menu-row[data-go="traslados"]');
  await page.click(`[data-act="tr-open"][data-id="${id}"]`);
  await page.waitForSelector('#tr-recv');
  const pdf1 = pdfText(await download(page, '[data-act="tr-pdf"]', 'despues.pdf'));
  check(/Llegada: \d+ nov/.test(pdf1) && /Salida: \d+ nov/.test(pdf1) && /Maestro Luis/.test(pdf1), 'la hoja trae la hora de salida (de la foto), la de llegada y quién lo recibió');

  // 5) Aclarar la diferencia.
  await page.click(`[data-act="tr-open"][data-id="${id}"]`);
  await page.waitForSelector('#tr-short-note');
  await page.fill('#tr-short-note', 'El chofer devolvió 1 m³ al ENZO');
  await page.click('[data-act="tr-short-ok"]');
  await settle(page, 600);
  t = await tr(page);
  check(t.shortOk === true && /Diferencia aclarada: El chofer devolvió 1 m³ al ENZO/.test(await txt(page, '#tr-recv')) && /Recibido/.test(await txt(page, '.status-line')), '«Ya se aclaró» lo deja como recibido, con la nota');

  // 6) Corregir lo que llegó: al final sí llegaron las 20 varillas.
  await page.click('[data-act="tr-recv-open"]');
  await page.fill('[data-rq="1"]', '20');
  await page.click('[data-act="tr-recv-save"]');
  await settle(page, 600);
  t = await tr(page);
  check(t.total === 14600 && t.received.qty[1] === 20 && /Faltan 1 m³ de Tierra/.test(await txt(page, '#tr-recv')) && !/Varilla/.test(await txt(page, '#tr-recv .msg')), 'se corrige lo que llegó y el total queda en RD$14,600');
  await page.click('.sheet-h [data-act="sheet-close"]');

  // 7) Excel con lo que llegó.
  const xl = await download(page, '[data-act="tr-xlsx"]', 'recepcion.xlsx');
  const xr = JSON.parse(execFileSync('python3', ['-I', '-c', `
import openpyxl, sys, json
wb = openpyxl.load_workbook(sys.argv[1])
m = [r for r in wb['Materiales'].iter_rows(values_only=True)]
print(json.dumps({'head': list(m[4]), 'rows': [[r[6], r[10], r[11]] for r in m[5:] if r and r[1]]}, ensure_ascii=False, default=str))
`, xl]).toString());
  check(xr.head[10] === 'Llegó' && xr.head[11] === 'Estado' && xr.rows.map((r) => r[1]).join(',') === '2,20,10' && xr.rows[0][2] === 'Con diferencia', 'Excel: cuánto llegó de cada material y el estado');

  // 8) Aviso: la misma persona entrega y recibe.
  await page.click('#t-new');
  await page.waitForSelector('#tr-form');
  await page.fill('#t-dlv', 'Juan del almacén');
  await page.fill('#t-rcv', 'juan del almacen');
  check(await page.isVisible('#t-who-warn') && /La misma persona entrega y recibe/.test(await txt(page, '#t-who-warn')), 'avisa si la misma persona entrega y recibe');
  await page.fill('#t-rcv', 'Maestro Luis');
  check(!(await page.isVisible('#t-who-warn')), 'con personas distintas, no avisa');
  await page.click('.sheet-h [data-act="sheet-close"]');

  console.log('problemas:', problems.length ? problems : 'ninguno');
  await browser.close();
  server.close();
  process.exit(problems.length ? 1 : 0);
})().catch((e) => { console.error(e); console.log('problemas:', problems); process.exit(1); });
