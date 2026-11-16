// Foto y video (diciendo su nombre) de cada obrero: cámara de adelante en la app, se para sola, la del teléfono si no hay permiso, la cámara se apaga, y las caras en el pase de lista.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = process.env.APP_ROOT || path.resolve(__dirname, '..');
const SP = process.env.PRUEBAS_TMP || path.join(require('os').tmpdir(), 'facturas-pruebas');
const OUT = path.join(SP, 'test-wmedia');
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
const sheetTxt = (page) => txt(page, '.sheet');
const pad = (n) => String(n).padStart(2, '0');
const now = new Date(), TODAY = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
const wdoc = async (page, id) => (await docs(page, 'workers')).find((w) => w.id === id);

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const BASE = `http://127.0.0.1:${server.address().port}/facturas/`;
  // Cámara y micrófono de prueba del navegador.
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, acceptDownloads: true, permissions: ['camera', 'microphone'] });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' && !/404|Failed to fetch|net::/.test(m.text())) problems.push('consola: ' + m.text()); });
  page.on('pageerror', (e) => problems.push('error de página: ' + e.message));
  // Para saber si la cámara queda apagada: se anotan los streams que se abren.
  await page.addInitScript(() => {
    window.__streams = [];
    const md = navigator.mediaDevices;
    if (md && md.getUserMedia) { const orig = md.getUserMedia.bind(md); md.getUserMedia = async (c) => { const s = await orig(c); window.__streams.push(s); return s; }; }
  });
  await page.goto(BASE);
  await page.waitForSelector('.empty h2');
  const I = await page.evaluate(async (x) => {
    const db = RT.db;
    await db.doc('settings/general').set({ company: 'SUCRE B. LANTIGUA CONSTRUCTORA, S.R.L.', companyRnc: '104595114', preparedBy: 'A. Robles' });
    const e = db.collection('projects').doc(); await e.set({ name: 'ENZO', createdAt: '2026-09-02T10:00:00.000Z' });
    const w = {};
    let n = 0;
    for (const name of ['Marcelo Peña', 'Maslem Joseph', 'Tipo Carlet']) { const r = db.collection('workers').doc(); await r.set({ projectId: e.id, name, role: 'Ayudante', pay: 1000, active: true, seq: ++n, createdAt: '2026-11-01T10:00:00.000Z' }); w[name.split(' ')[0]] = r.id; }
    await db.collection('asistencia').doc().set({ projectId: e.id, start: x.start, days: 14, entryLimit: '7:30', exitFrom: '5:00', workers: Object.values(w), marks: {}, surprise: {}, createdAt: '2026-11-15T10:00:00.000Z' });
    return { e: e.id, w };
  }, { start: (() => { const d = new Date(); d.setHours(12); d.setDate(d.getDate() - d.getDay()); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; })() });
  await page.reload();
  await page.click('[data-act="backup-later"]').catch(() => {});
  await page.evaluate(() => document.querySelector('.tabs [data-tab="asistencia"]').click());
  await page.waitForSelector('.att-row');

  // 1) En el pase de lista, cada obrero tiene su cara (o sus iniciales si todavía no tiene foto).
  const av = await page.$$eval('.att-row .w-av', (l) => l.map((b) => b.textContent.trim()));
  check(av.join(',') === 'MP,MJ,TC', 'sin foto, cada obrero sale con sus iniciales al lado del nombre');

  // 2) La ficha: tomar la foto con la cámara de adelante.
  await page.click(`.att-row [data-act="w-card"][data-id="${I.w.Marcelo}"]`);
  await page.waitForSelector('.wcard');
  check(/Marcelo Peña/.test(await txt(page, '.sheet-h')) && /Ayudante · ENZO/.test(await txt(page, '.wcard')) && /Todavía no tiene video/.test(await txt(page, '.wcard')), 'la ficha dice quién es y que le falta el video');
  await page.click('[data-act="w-photo"]');
  await page.waitForSelector('#cam-v');
  await page.waitForFunction(() => { const v = document.querySelector('#cam-v'); return v && v.videoWidth > 0; }, null, { timeout: 10000 });
  await page.screenshot({ path: path.join(OUT, 'camara.png') });
  check(await page.locator('.wcard [data-act="w-photo"]').isHidden() && await page.isVisible('[data-act="cam-shot"]'), 'con la cámara abierta solo hay un botón para tomar la foto');
  await page.click('[data-act="cam-shot"]');
  let w = await waitUntil(async () => { const x = await wdoc(page, I.w.Marcelo); return x.photoId ? x : null; }, 8000);
  check(w && w.photoId && w.photoBy === 'A. Robles' && w.photoAt.slice(0, 10) === new Date(w.photoAt).toISOString().slice(0, 10), 'la foto se guarda con la fecha y quién la tomó');
  const ph = await page.evaluate(async (id) => { const b = await RT.assets.get(id); return { type: b.type, size: b.size }; }, w.photoId);
  check(ph.type === 'image/jpeg' && ph.size > 1000 && ph.size < 120000, `la foto es un JPG pequeño (${ph.size} bytes)`);
  check(await page.evaluate(() => window.__streams.every((s) => s.getTracks().every((t) => t.readyState === 'ended'))), 'después de la foto la cámara queda apagada');
  await page.waitForSelector('.wcard img.wc-photo');
  check(/Foto del \d+ \w+ de \d{4} por A\. Robles/.test(await txt(page, '.wcard')), 'la ficha muestra la foto con su fecha');

  // 3) El video diciendo su nombre: grabar y parar.
  await page.click('[data-act="w-video"]');
  await page.waitForFunction(() => { const v = document.querySelector('#cam-v'); return v && v.videoWidth > 0; }, null, { timeout: 10000 });
  await page.click('#cam-rec-btn');
  await page.waitForSelector('#cam-time:not([hidden])');
  check(/Grabando/.test(await txt(page, '#cam-time')) && (await txt(page, '#cam-rec-btn')) === 'Parar', 'al grabar dice «Grabando» con los segundos y el botón cambia a «Parar»');
  await page.waitForTimeout(2300);
  await page.click('#cam-rec-btn');
  w = await waitUntil(async () => { const x = await wdoc(page, I.w.Marcelo); return x.videoId ? x : null; }, 8000);
  check(w && w.videoId && w.videoSecs >= 2 && w.videoSecs <= 4 && /^video\//.test(w.videoType) && w.videoBy === 'A. Robles', `el video se guarda con su duración (${w && w.videoSecs} s), el tipo y quién lo grabó`);
  check(w && w.videoBytes > 1000 && w.videoBytes < 2000000, `el video pesa poco (${w && w.videoBytes} bytes)`);
  await page.waitForSelector('#wc-video');
  const vinfo = await page.waitForFunction(() => { const v = document.querySelector('#wc-video'); return v && v.src && v.readyState >= 1 ? { src: v.src.slice(0, 5), dur: v.duration } : null; }, null, { timeout: 10000 }).then((h) => h.jsonValue()).catch(() => null);
  check(vinfo && vinfo.src === 'blob:', 'la ficha muestra el video para verlo');
  check(/Grabado el \d+ \w+ de \d{4} por A\. Robles · \d s/.test(await txt(page, '.wcard')), 'dice cuándo y quién lo grabó');
  check(await page.evaluate(() => window.__streams.every((s) => s.getTracks().every((t) => t.readyState === 'ended'))), 'después del video la cámara y el micrófono quedan apagados');
  await page.screenshot({ path: path.join(OUT, 'ficha.png') });

  // 4) «Siguiente sin foto o video» y el video que se para solo a los 8 segundos.
  check(/Siguiente sin foto o video: Maslem Joseph/.test(await txt(page, '.sheet-f')), 'ofrece pasar al siguiente que le falta');
  await page.click('.sheet-f [data-act="w-card"]');
  await page.waitForFunction(() => /Maslem Joseph/.test(document.querySelector('.sheet-h').textContent));
  await page.click('[data-act="w-video"]');
  await page.waitForFunction(() => { const v = document.querySelector('#cam-v'); return v && v.videoWidth > 0; }, null, { timeout: 10000 });
  await page.click('#cam-rec-btn');
  w = await waitUntil(async () => { const x = await wdoc(page, I.w.Maslem); return x.videoId ? x : null; }, 15000);
  check(w && w.videoSecs >= 7 && w.videoSecs <= 9, `si no lo paran, se para solo a los 8 segundos (${w && w.videoSecs} s)`);

  // 5) Si la cámara se cierra a mitad, se apaga.
  await page.waitForSelector('[data-act="w-photo"]');
  await page.click('[data-act="w-photo"]');
  await page.waitForFunction(() => { const v = document.querySelector('#cam-v'); return v && v.videoWidth > 0; }, null, { timeout: 10000 });
  await page.click('.sheet-h [data-act="sheet-close"]');
  await settle(page, 300);
  check(await page.evaluate(() => window.__streams.every((s) => s.getTracks().every((t) => t.readyState === 'ended'))), 'al cerrar la ficha con la cámara abierta, la cámara se apaga');

  // 6) Si la app no puede abrir la cámara, se usa la del teléfono (elegir archivo).
  await page.evaluate(() => { navigator.mediaDevices.getUserMedia = () => Promise.reject(Object.assign(new Error('no'), { name: 'NotAllowedError' })); });
  await page.click(`.att-row [data-act="w-card"][data-id="${I.w.Tipo}"]`);
  await page.waitForSelector('.wcard');
  const pngFile = path.join(OUT, 'cara.png');
  await page.screenshot({ path: pngFile, clip: { x: 0, y: 0, width: 300, height: 200 } });
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('[data-act="w-photo"]')]);
  await fc.setFiles(pngFile);
  w = await waitUntil(async () => { const x = await wdoc(page, I.w.Tipo); return x.photoId ? x : null; }, 8000);
  const ph2 = w && await page.evaluate(async (id) => { const b = await RT.assets.get(id); const bm = await createImageBitmap(b); return { type: b.type, w: bm.width, h: bm.height }; }, w.photoId);
  check(ph2 && ph2.type === 'image/jpeg' && ph2.w === ph2.h && ph2.w === 400, `sin permiso de cámara, se toma con la del teléfono y queda cuadrada (${ph2 && ph2.w}×${ph2 && ph2.h})`);
  await page.click('.sheet-h [data-act="sheet-close"]');

  // 7) Las caras en el pase de lista y en la lista de obreros.
  await settle(page, 400);
  check(await page.locator('.att-row .w-av img').count() === 2 && await page.locator('.att-row .w-av .w-vid').count() === 2, 'el pase de lista muestra las fotos (y un punto a los que tienen video)');
  await page.click('[data-act="att-workers"]').catch(async () => { await page.locator('button', { hasText: /^Obreros/ }).first().click(); });
  await page.waitForSelector('.w-list');
  check(/Foto y video: 1 de 3 listos/.test(await sheetTxt(page)) && await page.locator('.w-list .w-av').count() === 3, 'la lista de obreros dice cuántos tienen foto y video');
  await page.click('.sheet-h [data-act="sheet-close"]');

  // 8) En la computadora: la cara en la tabla de la quincena.
  await page.setViewportSize({ width: 1280, height: 860 });
  await settle(page, 600);
  check(await page.locator('.att-tbl .c-aname .w-av').count() === 3, 'en la computadora, la tabla de la quincena también tiene las caras');
  await page.screenshot({ path: path.join(OUT, 'pc.png') });

  console.log('problemas:', problems.length ? problems : 'ninguno');
  await browser.close();
  server.close();
  process.exit(problems.length ? 1 : 0);
})().catch((e) => { console.error(e); console.log('problemas:', problems); process.exit(1); });
