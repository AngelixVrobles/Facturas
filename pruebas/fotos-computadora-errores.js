// Tanda 5: protección del navegador, registro de errores, vista de computadora y recortar/enderezar fotos.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = process.env.APP_ROOT || path.resolve(__dirname, '..');
const SP = process.env.PRUEBAS_TMP || path.join(require('os').tmpdir(), 'facturas-pruebas');
const OUT = path.join(SP, 'test-tanda5');
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
async function docs(page, coll) {
  return page.evaluate((c) => new Promise((r) => { const un = RT.db.collection(c).onSnapshot((s) => { un(); r(s.docs.map((d) => ({ id: d.id, ...d.data() }))); }); }), coll);
}
async function upload(page, files) {
  await page.setInputFiles('#file-input', files);
  await page.waitForFunction(() => { const h = document.querySelector('#queue .q-head'); return h && /Listo/.test(h.textContent); }, null, { timeout: 90000 });
  await page.waitForTimeout(500);
  await page.click('[data-act="queue-clear"]').catch(() => {});
}
const settle = (page, ms = 500) => page.waitForTimeout(ms);
// Foto de una factura torcida sobre una mesa oscura: esquinas (250,200) (950,260) (1000,1400) (180,1350).
const PHOTO = path.join(OUT, 'factura-torcida.jpg');
const CORNERS = [[250, 200], [950, 260], [1000, 1400], [180, 1350]];
execFileSync('python3', ['-I', '-c', `
import sys
from PIL import Image, ImageDraw
im = Image.new('RGB', (1200, 1600), (52, 48, 44))
d = ImageDraw.Draw(im)
d.polygon([(250, 200), (950, 260), (1000, 1400), (180, 1350)], fill=(246, 246, 242))
for k in range(12):
    y = 330 + k * 80
    d.line([(320, y), (860, y + 30)], fill=(60, 60, 70), width=8)
im.save(sys.argv[1], quality=92)
`, PHOTO]);
const imgInfo = (page, id) => page.evaluate(async (fid) => {
  const b = await RT.assets.get(fid);
  const bmp = await createImageBitmap(b);
  const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
  const x = c.getContext('2d'); x.drawImage(bmp, 0, 0);
  const px = (a, b2) => [...x.getImageData(a, b2, 1, 1).data].slice(0, 3);
  return { w: bmp.width, h: bmp.height, corner: px(6, 6), mid: px(Math.round(bmp.width / 2), 8) };
}, id);

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const BASE = `http://127.0.0.1:${server.address().port}/facturas/`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' && !/404|prueba del registro/.test(m.text())) problems.push('consola: ' + m.text()); });
  page.on('pageerror', (e) => problems.push('error de página: ' + e.message));
  await page.goto(BASE);
  await page.waitForSelector('.empty h2');
  const csp = await page.getAttribute('meta[http-equiv="Content-Security-Policy"]', 'content');
  check(/default-src 'self'/.test(csp || '') && /object-src 'none'/.test(csp || ''), 'la página tiene su protección (solo carga lo suyo)');
  await page.evaluate(async () => { await RT.db.doc('settings/general').set({ company: 'SUCRE B. LANTIGUA CONSTRUCTORA, S.R.L.', companyRnc: '104595114' }); });
  await page.click('[data-act="backup-later"]').catch(() => {});

  // 1) Registro de errores en Ajustes.
  await page.evaluate(() => console.error('prueba del registro: algo falló'));
  await page.click('#settings-btn');
  await page.waitForSelector('#err-box');
  check(/prueba del registro: algo falló/.test(await page.textContent('#err-box')), 'Ajustes muestra el registro de errores');
  await page.click('#err-box summary');
  await page.click('[data-act="err-clear"]');
  check(!(await page.$('#err-box')) && (await page.evaluate(() => localStorage.getItem('facturas.errores'))) === null, '«Borrar» vacía el registro');
  await page.click('.sheet-h [data-act="sheet-close"]');

  // 2) Recortar y enderezar.
  await upload(page, [PHOTO]);
  let inv = (await docs(page, 'invoices'))[0];
  const orig = inv.fileId;
  await page.click('[data-act="filter"][data-f="todas"]');
  await page.click(`#f-list [data-act="open-inv"][data-id="${inv.id}"]`);
  await page.waitForSelector('#inv-form');
  await page.click('[data-act="crop-open"]');
  await page.waitForSelector('#crop-wrap canvas');
  await page.waitForFunction(() => !document.querySelector('[data-act="crop-go"]').disabled);
  await settle(page, 400);
  const box = await page.locator('#crop-wrap').boundingBox();
  for (let k = 0; k < 4; k++) {
    const hb = await page.locator(`.crop-h[data-h="${k}"]`).boundingBox();
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + (CORNERS[k][0] / 1200) * box.width, box.y + (CORNERS[k][1] / 1600) * box.height, { steps: 6 });
    await page.mouse.up();
  }
  await page.screenshot({ path: path.join(OUT, 'recortar.png') });
  await page.click('[data-act="crop-go"]');
  await page.waitForSelector('#crop-wrap', { state: 'detached', timeout: 30000 });
  await settle(page, 700);
  inv = (await docs(page, 'invoices'))[0];
  const info = await imgInfo(page, inv.fileId);
  console.log('     recortada:', JSON.stringify(info));
  check(inv.fileId !== orig && inv.origFileId === orig, 'la foto recortada reemplaza a la original, que se guarda');
  check(Math.abs(info.w - 822) <= 12 && Math.abs(info.h - 1150) <= 12, `enderezada al tamaño de la hoja (${info.w} × ${info.h}, cerca de 822 × 1150)`);
  check(info.corner.every((v) => v > 200) && info.mid.every((v) => v > 200), 'las esquinas ya son la hoja blanca, no la mesa');
  await page.click(`#f-list [data-act="open-inv"][data-id="${inv.id}"]`);
  await page.waitForSelector('#inv-form');
  await page.click('[data-act="crop-undo"]');
  await settle(page, 700);
  inv = (await docs(page, 'invoices'))[0];
  check(inv.fileId === orig && !inv.origFileId, '«Volver a la foto original» la devuelve');
  // Girar: la foto entera, acostada.
  if (!(await page.$('#inv-form'))) { await page.click(`#f-list [data-act="open-inv"][data-id="${inv.id}"]`); await page.waitForSelector('#inv-form'); }
  await page.click('[data-act="crop-open"]');
  await page.waitForFunction(() => document.querySelector('[data-act="crop-go"]') && !document.querySelector('[data-act="crop-go"]').disabled);
  await page.click('[data-act="crop-rot"]');
  await page.click('[data-act="crop-all"]');
  await page.click('[data-act="crop-go"]');
  await page.waitForSelector('#crop-wrap', { state: 'detached', timeout: 30000 });
  await settle(page, 700);
  inv = (await docs(page, 'invoices'))[0];
  const rot = await imgInfo(page, inv.fileId);
  check(rot.w === 1600 && rot.h === 1200, `girada: ${rot.w} × ${rot.h}`);

  // 3) En la computadora: menú a la izquierda, las facturas en una tabla que se ordena y la hoja como panel a la derecha.
  await page.evaluate(async () => {
    for (let k = 0; k < 5; k++) await RT.db.collection('invoices').doc().set({ projectId: null, supplier: 'Proveedor ' + k, rnc: '', number: 'B01000000' + (10 + k), date: '2026-11-04', amount: 100 * (k + 1), itbis: 0, currency: 'DOP', concept: '', ref: '', buyerRnc: '', qrUrl: '', fiscal: '', notInvoice: false, noOrder: true, fileId: null, fileType: 'image/jpeg', thumbId: null, pages: 1, fileName: 'x.jpg', xmlId: null, ai: 'off', createdAt: '2026-11-04T10:00:00.000Z' });
  });
  const desk = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const dp = await desk.newPage();
  dp.on('pageerror', (e) => problems.push('error de página (computadora): ' + e.message));
  await dp.goto(BASE);
  await dp.waitForSelector('.empty h2');
  await dp.evaluate(async () => {
    const p = RT.db.collection('projects').doc(); await p.set({ name: 'Residencial ENZO', createdAt: '2026-09-01T10:00:00.000Z' });
    for (let k = 0; k < 6; k++) await RT.db.collection('invoices').doc().set({ projectId: p.id, supplier: 'Ferretería ' + k, rnc: '', number: 'B01000000' + (20 + k), date: '2026-11-04', amount: 1180 * (k + 1), itbis: 180 * (k + 1), currency: 'DOP', concept: '', ref: '', buyerRnc: '', qrUrl: '', fiscal: '', notInvoice: false, noOrder: true, fileId: null, fileType: 'image/jpeg', thumbId: null, pages: 1, fileName: 'x.jpg', xmlId: null, ai: 'off', createdAt: '2026-11-04T10:00:00.000Z' });
  });
  await dp.waitForSelector('#f-list [data-act="open-inv"]');
  await dp.click('[data-act="backup-later"]').catch(() => {});
  const nav = await dp.$eval('.tabs', (e) => { const r = e.getBoundingClientRect(); return { x: r.left, w: r.width, h: r.height }; });
  const fab = await dp.$eval('#fab', (e) => e.getBoundingClientRect().top);
  check(nav.x === 0 && nav.w > 180 && nav.w < 300 && nav.h >= 850 && fab < 80 && !!(await dp.$('.tabs .nav-only[data-act="settings"]:visible')), 'en la computadora: menú a la izquierda (con Ajustes) y «Agregar facturas» arriba');
  const rowsN = await dp.$$eval('#f-list table.inv-tbl tbody tr', (r) => r.length);
  const heads = await dp.$$eval('#f-list table.inv-tbl thead th:not(.c-sel)', (t) => t.map((x) => x.textContent.trim()));
  check(rowsN === 6 && heads.join('|') === 'Proveedor|NCF|Fecha|Estado|Etiquetas|Monto', 'las facturas van en una tabla: proveedor, NCF, fecha, estado, etiquetas y monto');
  const firstRow = () => dp.$eval('#f-list table.inv-tbl tbody tr .row-btn', (b) => b.textContent.trim());
  await dp.click('[data-act="sort"][data-scope="inv"][data-k="amount"]');
  const hi = await firstRow();
  await dp.click('[data-act="sort"][data-scope="inv"][data-k="amount"]');
  const lo = await firstRow();
  check(hi === 'Ferretería 5' && lo === 'Ferretería 0', `tocando «Monto» se ordena de mayor a menor y otra vez de menor a mayor (${hi} / ${lo})`);
  await dp.screenshot({ path: path.join(OUT, 'computadora.png') });
  await dp.click('#f-list table.inv-tbl tbody tr >> nth=0');
  await dp.waitForSelector('#inv-form');
  await dp.waitForTimeout(400);
  const sb = await dp.$eval('.sheet', (e) => { const r = e.getBoundingClientRect(); return { right: window.innerWidth - r.right, top: r.top, h: r.height, w: r.width }; });
  check(sb.right === 0 && sb.top === 0 && sb.h === 860 && sb.w <= 700, 'la hoja se abre como panel a la derecha, a todo lo alto');
  await dp.screenshot({ path: path.join(OUT, 'computadora-hoja.png') });
  await dp.click('.sheet-h [data-act="sheet-close"]');
  await dp.click('.tabs [data-tab="ordenes"]');
  const oNew = await dp.$eval('#o-new', (e) => { const r = e.getBoundingClientRect(); return { top: r.top, w: r.width }; });
  check(oNew.top < 80 && oNew.w < 400, '«Nueva orden de compra» va arriba, como botón');

  console.log('problemas:', problems.length ? problems : 'ninguno');
  await browser.close();
  server.close();
  process.exit(problems.length ? 1 : 0);
})().catch((e) => { console.error(e); console.log('problemas:', problems); process.exit(1); });
