// Cambiar las fechas de una quincena del pase de lista sin perder marcas (para que una obra vaya igual que las otras).
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = process.env.APP_ROOT || path.resolve(__dirname, '..');
const SP = process.env.PRUEBAS_TMP || path.join(require('os').tmpdir(), 'facturas-pruebas');
const OUT = path.join(SP, 'test-attstart');
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
const sheets = async (page, pid) => (await docs(page, 'asistencia')).filter((a) => a.projectId === pid).sort((a, b) => a.start.localeCompare(b.start));

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const BASE = `http://127.0.0.1:${server.address().port}/facturas/`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' && !/404|Failed to fetch|net::/.test(m.text())) problems.push('consola: ' + m.text()); });
  page.on('pageerror', (e) => problems.push('error de página: ' + e.message));
  await page.goto(BASE);
  await page.waitForSelector('.empty h2');
  // ENZO quedó del 8 al 21 (con marcas la semana del 8 y el lunes 16); MONACO va del 15 al 28.
  const I = await page.evaluate(async () => {
    const db = RT.db;
    await db.doc('settings/general').set({ company: 'SUCRE B. LANTIGUA CONSTRUCTORA, S.R.L.', companyRnc: '104595114' });
    const m = db.collection('projects').doc(); await m.set({ name: 'MONACO', createdAt: '2026-09-01T10:00:00.000Z' });
    const e = db.collection('projects').doc(); await e.set({ name: 'ENZO', createdAt: '2026-09-02T10:00:00.000Z' });
    const w = {};
    let n = 0;
    for (const [pid, name] of [[e.id, 'Marcelo'], [e.id, 'Maslem'], [m.id, 'Carlet']]) { const r = db.collection('workers').doc(); await r.set({ projectId: pid, name, role: 'Ayudante', pay: 1000, active: true, seq: ++n, createdAt: '2026-11-01T10:00:00.000Z' }); w[name] = r.id; }
    const ok = { e: 'ok', p: 'ok', s: 'ok' };
    const se = db.collection('asistencia').doc();
    await se.set({ projectId: e.id, start: '2026-11-08', days: 14, entryLimit: '7:30', exitFrom: '5:00', workers: [w.Marcelo, w.Maslem], marks: { [w.Marcelo]: { 1: ok, 2: { e: 't', p: 'ok', s: 'ok' }, 8: ok }, [w.Maslem]: { 1: ok, 8: ok } }, surprise: { 2: '9:15', 8: '10:00' }, half: { 1: true, 9: true }, createdAt: '2026-11-08T10:00:00.000Z' });
    const sm = db.collection('asistencia').doc();
    await sm.set({ projectId: m.id, start: '2026-11-15', days: 14, entryLimit: '7:30', exitFrom: '5:00', workers: [w.Carlet], marks: {}, surprise: {}, createdAt: '2026-11-15T10:00:00.000Z' });
    return { m: m.id, e: e.id, w, se: se.id };
  });
  await page.reload();
  await page.click('[data-act="backup-later"]').catch(() => {});
  await page.evaluate(() => document.querySelector('.tabs [data-tab="asistencia"]').click());
  await page.locator('[data-act="att-proj"]', { hasText: 'ENZO' }).click();
  await page.waitForSelector('.att-row');
  check(/Del 8 al 21 de nov de 2026/.test(await txt(page, '.att-period')), 'ENZO empieza mal: del 8 al 21');

  // 1) «Cambiar las fechas de esta quincena» propone la fecha de la otra obra y explica lo que pasa.
  await page.click('[data-act="att-start"]');
  await page.waitForSelector('#att-start-d');
  check(await page.inputValue('#att-start-d') === '2026-11-15', 'propone el día en que empieza la otra obra (15 de noviembre)');
  const msg = await txt(page, '#att-start-msg');
  console.log('     aviso:', msg);
  check(/No se pierden/.test(msg) && /del 8 nov de 2026 al 14 nov de 2026/.test(msg) && /del 15 nov de 2026 al 28 nov de 2026/.test(msg), 'explica que los días de antes quedan en una planilla aparte y la nueva va del 15 al 28');
  await page.screenshot({ path: path.join(OUT, 'panel.png') });

  // 2) Una fecha que no se puede: avisa y no deja.
  await page.fill('#att-start-d', '2026-11-30');
  await page.dispatchEvent('#att-start-d', 'change');
  await settle(page, 200);
  check(/Empezar la quincena siguiente/.test(await txt(page, '#att-start-msg')) && await page.isDisabled('#att-start-go'), 'una fecha después de la quincena no se deja');
  await page.fill('#att-start-d', '2026-11-15');
  await page.dispatchEvent('#att-start-d', 'change');
  await settle(page, 200);

  // 3) Al cambiarla: ENZO queda del 15 al 28 con las marcas del lunes 16, y la semana del 8 al 14 aparte.
  await page.click('#att-start-go');
  await page.waitForSelector('#att-start-form', { state: 'detached' });
  await waitUntil(async () => (await sheets(page, I.e)).length === 2, 5000);
  const [a, b] = await sheets(page, I.e);
  console.log('     planillas:', JSON.stringify([a, b].map((x) => ({ start: x.start, days: x.days, marks: x.marks, surprise: x.surprise, half: x.half }))));
  check(a.start === '2026-11-08' && a.days === 7 && a.marks[I.w.Marcelo][1].e === 'ok' && a.marks[I.w.Marcelo][2].e === 't' && !a.marks[I.w.Marcelo][8] && a.surprise[2] === '9:15' && !a.surprise[8] && a.half[1] === true && !a.half[9], 'la semana del 8 al 14 queda en su planilla, con sus marcas, la hora del pase y el medio día');
  check(b.start === '2026-11-15' && b.days === 14 && b.marks[I.w.Marcelo][1].e === 'ok' && b.marks[I.w.Maslem][1].s === 'ok' && Object.keys(b.marks[I.w.Marcelo]).length === 1 && b.surprise[1] === '10:00' && b.half[2] === true && b.workers.length === 2, 'la quincena nueva va del 15 al 28 con las marcas del lunes 16 en su fecha');
  await waitUntil(async () => /Del 15 al 28 de nov de 2026/.test(await txt(page, '.att-period')), 5000);
  check(/Del 15 al 28 de nov de 2026/.test(await txt(page, '.att-period')), 'ENZO ahora dice «Del 15 al 28 de nov de 2026», igual que MONACO');
  check(await page.locator('.att-day').count() === 14, 'la quincena nueva tiene sus 14 días');
  await page.screenshot({ path: path.join(OUT, 'despues.png') });
  await page.click('[data-act="att-prev"]');
  await waitUntil(async () => /Del 8 al 14 de nov de 2026/.test(await txt(page, '.att-period')), 5000);
  check(/Del 8 al 14 de nov de 2026/.test(await txt(page, '.att-period')) && await page.locator('.att-day').count() === 7, 'con la flecha se ve la semana del 8 al 14 (7 días)');
  check(!(await page.$('[data-act="att-start"]')), 'las fechas solo se cambian en la quincena más nueva');

  // 4) Sin marcas de antes, solo se mueve (no hace otra planilla); y no puede pisar la anterior.
  await page.locator('[data-act="att-proj"]', { hasText: 'MONACO' }).click();
  await waitUntil(async () => /Del 15 al 28/.test(await txt(page, '.att-period')), 5000);
  await page.click('[data-act="att-start"]');
  await page.waitForSelector('#att-start-d');
  await page.fill('#att-start-d', '2026-11-16');
  await page.dispatchEvent('#att-start-d', 'change');
  await settle(page, 200);
  check(/Las marcas se quedan en sus mismas fechas/.test(await txt(page, '#att-start-msg')), 'sin marcas de antes, solo dice que se mueve');
  await page.click('#att-start-go');
  await page.waitForSelector('#att-start-form', { state: 'detached' });
  await waitUntil(async () => (await sheets(page, I.m))[0].start === '2026-11-16', 5000);
  const ms = await sheets(page, I.m);
  check(ms.length === 1 && ms[0].start === '2026-11-16' && ms[0].days === 14, 'MONACO se movió al 16 sin hacer otra planilla');
  await page.locator('[data-act="att-proj"]', { hasText: 'ENZO' }).click();
  await waitUntil(async () => /Del 15 al 28/.test(await txt(page, '.att-period')), 5000);
  await page.click('[data-act="att-start"]');
  await page.waitForSelector('#att-start-d');
  await page.fill('#att-start-d', '2026-11-12');
  await page.dispatchEvent('#att-start-d', 'change');
  await settle(page, 200);
  check(/La quincena anterior llega hasta el 14 nov de 2026/.test(await txt(page, '#att-start-msg')) && await page.isDisabled('#att-start-go'), 'no deja empezar antes de que termine la quincena anterior');

  console.log('problemas:', problems.length ? problems : 'ninguno');
  await browser.close();
  server.close();
  process.exit(problems.length ? 1 : 0);
})().catch((e) => { console.error(e); console.log('problemas:', problems); process.exit(1); });
