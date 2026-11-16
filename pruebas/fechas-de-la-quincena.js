// Ordenar las quincenas del pase de lista a partir del día en que empezó una (cada 14 días), sin perder marcas, en una obra o en todas, con «Deshacer».
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
const sheetTxt = (page) => txt(page, '.sheet');
const sheets = async (page, pid) => (await docs(page, 'asistencia')).filter((a) => a.projectId === pid).sort((a, b) => a.start.localeCompare(b.start));
const goProj = async (page, name) => { await page.locator('[data-act="att-proj"]', { hasText: name }).click(); await settle(page, 300); };
const setDate = async (page, d) => { await page.fill('#att-start-d', d); await page.dispatchEvent('#att-start-d', 'change'); await settle(page, 200); };

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const BASE = `http://127.0.0.1:${server.address().port}/facturas/`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, acceptDownloads: true });
  const page = await ctx.newPage();
  // Hoy es el lunes 16 de noviembre de 2026.
  await page.clock.setFixedTime(new Date('2026-11-16T12:00:00'));
  page.on('console', (m) => { if (m.type() === 'error' && !/404|Failed to fetch|net::/.test(m.text())) problems.push('consola: ' + m.text()); });
  page.on('pageerror', (e) => problems.push('error de página: ' + e.message));
  await page.goto(BASE);
  await page.waitForSelector('.empty h2');
  // Como en el teléfono: MONACO del 15 al 28; ENZO quedó con una planilla del 8 al 14 (7 días) y otra del 15 al 28;
  // TORRE del 8 al 21 y otra del 22 al 5 empezada sin querer. La quincena de verdad fue del domingo 1 al sábado 14.
  const I = await page.evaluate(async () => {
    const db = RT.db;
    await db.doc('settings/general').set({ company: 'SUCRE B. LANTIGUA CONSTRUCTORA, S.R.L.', companyRnc: '104595114' });
    const proj = async (name, n) => { const r = db.collection('projects').doc(); await r.set({ name, createdAt: `2026-09-0${n}T10:00:00.000Z` }); return r.id; };
    const m = await proj('MONACO', 1), e = await proj('ENZO', 2), t = await proj('TORRE', 3);
    const w = {};
    let n = 0;
    for (const [pid, name] of [[e, 'Marcelo'], [e, 'Maslem'], [m, 'Carlet'], [t, 'Tipo']]) { const r = db.collection('workers').doc(); await r.set({ projectId: pid, name, role: 'Ayudante', pay: 1000, active: true, seq: ++n, createdAt: '2026-11-01T10:00:00.000Z' }); w[name] = r.id; }
    const ok = { e: 'ok', p: 'ok', s: 'ok' };
    const sheet = async (x) => { const r = db.collection('asistencia').doc(); await r.set({ days: 14, entryLimit: '7:30', exitFrom: '5:00', marks: {}, surprise: {}, createdAt: '2026-11-08T10:00:00.000Z', ...x }); return r.id; };
    const m1 = await sheet({ projectId: m, start: '2026-11-15', workers: [w.Carlet] });
    const e1 = await sheet({ projectId: e, start: '2026-11-08', days: 7, workers: [w.Marcelo, w.Maslem], marks: { [w.Marcelo]: { 1: ok, 2: { e: 't', p: 'ok', s: 'ok' } }, [w.Maslem]: { 1: ok } }, surprise: { 2: '9:15' }, half: { 1: true } });
    const e2 = await sheet({ projectId: e, start: '2026-11-15', workers: [w.Marcelo, w.Maslem], marks: { [w.Marcelo]: { 1: ok }, [w.Maslem]: { 1: ok } }, surprise: { 1: '10:00' }, half: { 2: true }, createdAt: '2026-11-15T10:00:00.000Z' });
    const t1 = await sheet({ projectId: t, start: '2026-11-08', workers: [w.Tipo], marks: { [w.Tipo]: { 1: ok, 2: ok, 8: { e: 't', p: 'ok', s: 'ok' } } }, surprise: { 8: '10:00' }, half: { 8: true } });
    const t2 = await sheet({ projectId: t, start: '2026-11-22', workers: [w.Tipo], createdAt: '2026-11-16T12:00:00.000Z' });
    return { m, e, t, w, m1, e1, e2, t1, t2 };
  });
  await page.reload();
  await page.click('[data-act="backup-later"]').catch(() => {});
  await page.evaluate(() => document.querySelector('.tabs [data-tab="asistencia"]').click());
  await goProj(page, 'ENZO');
  await page.waitForSelector('.att-row');
  check(/Del 15 al 28 de nov de 2026/.test(await txt(page, '.att-period')), 'ENZO muestra la quincena de hoy (15 al 28)');

  // 1) El enlace sale en cualquier quincena; propone el 15 y explica cómo quedan.
  await page.click('[data-act="att-prev"]');
  await waitUntil(async () => /Del 8 al 14 de nov de 2026/.test(await txt(page, '.att-period')), 5000);
  check(await page.isVisible('[data-act="att-start"]'), 'también en la planilla del 8 al 14 sale «Cambiar las fechas de las quincenas»');
  await page.click('[data-act="att-start"]');
  await page.waitForSelector('#att-start-d');
  check(await page.inputValue('#att-start-d') === '2026-11-15', 'propone el 15 (el día en que empezó la quincena de ahora en las obras)');
  check(/Ahora ENZO tiene: del 8 nov de 2026 al 14 nov de 2026 \(7 días\) · del 15 nov de 2026 al 28 nov de 2026/.test(await sheetTxt(page)), 'dice cómo están ahora');
  let msg = await txt(page, '#att-start-msg');
  console.log('     aviso:', msg);
  check(/Quedan así: del 1 nov de 2026 al 14 nov de 2026 — 2 días marcados · del 15 nov de 2026 al 28 nov de 2026 — 1 día marcado\. Ninguna marca se pierde\./.test(msg), 'con el 15, la del 8 al 14 pasa a ser del 1 al 14 (y la de ahora sigue del 15 al 28)');
  await setDate(page, '2026-11-01');
  check(await txt(page, '#att-start-msg') === msg, 'escoger el domingo 1 da lo mismo que el 15');
  check(await page.isVisible('#att-start-all') && /Hacer lo mismo en TORRE/.test(await txt(page, '#att-start-all-row')) && !/MONACO/.test(await txt(page, '#att-start-all-row')), 'ofrece hacer lo mismo en TORRE (MONACO ya va así)');
  await page.screenshot({ path: path.join(OUT, 'panel.png') });
  await page.uncheck('#att-start-all');
  await page.click('#att-start-go');
  await page.waitForSelector('#att-start-form', { state: 'detached' });
  await waitUntil(async () => (await sheets(page, I.e))[0].start === '2026-11-01', 5000);
  let [a, b] = await sheets(page, I.e);
  console.log('     enzo:', JSON.stringify([a, b].map((x) => ({ start: x.start, days: x.days, marks: x.marks, surprise: x.surprise, half: x.half }))));
  check(a.id === I.e1 && a.start === '2026-11-01' && a.days === 14 && a.marks[I.w.Marcelo][8].e === 'ok' && a.marks[I.w.Marcelo][9].e === 't' && a.marks[I.w.Maslem][8].e === 'ok' && a.surprise[9] === '9:15' && a.half[8] === true && a.workers.length === 2, 'ENZO: del 1 al 14, con las marcas del 9 y el 10 en sus fechas (y la hora del pase y el medio día)');
  check(b.id === I.e2 && b.start === '2026-11-15' && b.days === 14 && b.marks[I.w.Marcelo][1].e === 'ok' && b.surprise[1] === '10:00' && b.half[2] === true, 'ENZO: la de ahora sigue del 15 al 28 con lo del lunes 16');
  const tor = await sheets(page, I.t);
  check(tor.length === 2 && tor[0].start === '2026-11-08' && tor[1].start === '2026-11-22', 'sin marcar la casilla, TORRE no se tocó');
  await waitUntil(async () => /Del 15 al 28 de nov de 2026/.test(await txt(page, '.att-period')), 5000);
  check(/Del 15 al 28 de nov de 2026/.test(await txt(page, '.att-period')), 'después muestra la quincena de hoy');
  await page.click('[data-act="att-prev"]');
  await waitUntil(async () => /Del 1 al 14 de nov de 2026/.test(await txt(page, '.att-period')), 5000);
  check(/Del 1 al 14 de nov de 2026/.test(await txt(page, '.att-period')) && await page.locator('.att-day').count() === 14, 'con la flecha: «Del 1 al 14 de nov de 2026» con sus 14 días');

  // 2) Deshacer: vuelve como estaba.
  await page.click('[data-act="att-start"]');
  await page.waitForSelector('#att-start-d');
  await setDate(page, '2026-11-08');
  await page.uncheck('#att-start-all').catch(() => {});
  await page.click('#att-start-go');
  await page.waitForSelector('#att-start-form', { state: 'detached' });
  await page.waitForSelector('#toast .toast-act');
  await waitUntil(async () => (await sheets(page, I.e))[0].start === '2026-10-25' || (await sheets(page, I.e))[0].start === '2026-11-08', 5000);
  const mid = await sheets(page, I.e);
  console.log('     con el 8:', JSON.stringify(mid.map((x) => [x.start, x.days])));
  await page.click('#toast .toast-act');
  await waitUntil(async () => { const l = await sheets(page, I.e); return l.length === 2 && l[0].start === '2026-11-01' && l[1].start === '2026-11-15'; }, 5000);
  [a, b] = await sheets(page, I.e);
  check(a.start === '2026-11-01' && b.start === '2026-11-15' && a.marks[I.w.Marcelo][9].e === 't' && b.marks[I.w.Marcelo][1].e === 'ok', '«Deshacer» deja las quincenas como estaban, con sus marcas');

  // 3) Ya ordenada: lo dice; y una fecha muy vieja no se deja.
  await page.click('[data-act="att-start"]');
  await page.waitForSelector('#att-start-d');
  await setDate(page, '2026-11-15');
  check(/En ENZO las quincenas ya van así/.test(await txt(page, '#att-start-msg')), 'si ya van así, lo dice');
  await page.uncheck('#att-start-all');
  await settle(page, 200);
  check(await page.isDisabled('#att-start-go'), 'y no hay nada que hacer en ENZO');
  await setDate(page, '2026-09-01');
  check(/Elige una fecha de las últimas seis semanas/.test(await txt(page, '#att-start-msg')) && await page.isDisabled('#att-start-go'), 'una fecha muy vieja no se deja');

  // 4) Hacer lo mismo en las otras obras: TORRE queda del 1 al 14 y del 15 al 28 (la del 22 al 5 se usa para la de ahora).
  await setDate(page, '2026-11-15');
  await page.check('#att-start-all');
  await settle(page, 200);
  check(!(await page.isDisabled('#att-start-go')), 'con la casilla marcada sí se puede (para TORRE)');
  await page.click('#att-start-go');
  await page.waitForSelector('#att-start-form', { state: 'detached' });
  await waitUntil(async () => (await sheets(page, I.t))[0].start === '2026-11-01', 5000);
  const [t1, t2] = await sheets(page, I.t);
  console.log('     torre:', JSON.stringify([t1, t2].map((x) => ({ start: x.start, days: x.days, marks: x.marks, surprise: x.surprise, half: x.half }))));
  check(t1.start === '2026-11-01' && t1.days === 14 && t1.marks[I.w.Tipo][8].e === 'ok' && t1.marks[I.w.Tipo][9].e === 'ok' && !t1.marks[I.w.Tipo][15] && Object.keys(t1.surprise).length === 0, 'TORRE: del 1 al 14 con las marcas del 9 y el 10');
  check(t2.start === '2026-11-15' && t2.days === 14 && t2.marks[I.w.Tipo][1].e === 't' && t2.surprise[1] === '10:00' && t2.half[1] === true && (await sheets(page, I.t)).length === 2, 'TORRE: del 15 al 28 con lo del lunes 16, y no queda la del 22 al 5');
  const mon = await sheets(page, I.m);
  check(mon.length === 1 && mon[0].start === '2026-11-15', 'MONACO no cambió (ya iba así)');
  await goProj(page, 'TORRE');
  await waitUntil(async () => /Del 15 al 28 de nov de 2026/.test(await txt(page, '.att-period')), 5000);
  await page.click('.att-day[data-k="1"]');
  await settle(page, 300);
  check(/Del 15 al 28 de nov de 2026/.test(await txt(page, '.att-period')) && /Tipo/.test(await txt(page, '.att-row')), 'TORRE muestra la de ahora con su obrero');
  await page.screenshot({ path: path.join(OUT, 'despues.png') });

  console.log('problemas:', problems.length ? problems : 'ninguno');
  await browser.close();
  server.close();
  process.exit(problems.length ? 1 : 0);
})().catch((e) => { console.error(e); console.log('problemas:', problems); process.exit(1); });
