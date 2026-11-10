// Pase de lista en la app: obreros, marcas de entrada / pase sorpresa / salida, reglas, resumen, Excel y PDF.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = process.env.APP_ROOT || path.resolve(__dirname, '..');
const SP = process.env.PRUEBAS_TMP || path.join(require('os').tmpdir(), 'facturas-pruebas');
const OUT = path.join(SP, 'test-asistencia');
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
const settle = (page, ms = 450) => page.waitForTimeout(ms);
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = new Date();
const sunday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay());
const START = iso(sunday);
const NEXT = iso(new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate() + 14));
const rowOf = (page, name) => page.locator('.att-row', { hasText: name });
const mark = (page, name, f, v) => rowOf(page, name).locator(`[data-act="att-mark"][data-f="${f}"][data-v="${v}"]`).click();
const val = async (page, name) => (await rowOf(page, name).locator('.att-val').textContent()).trim();

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
  const pid = await page.evaluate(async () => {
    await RT.db.doc('settings/general').set({ company: 'SUCRE B. LANTIGUA CONSTRUCTORA, S.R.L.', companyRnc: '104595114' });
    const p = RT.db.collection('projects').doc(); await p.set({ name: 'Residencial ENZO', createdAt: '2026-09-01T10:00:00.000Z' });
    return p.id;
  });
  await page.click('[data-act="backup-later"]').catch(() => {});
  check((await page.$$('.tabs [data-tab]')).length === 7 && /Asistencia/.test(await page.textContent('.tabs')) && /Conduces/.test(await page.textContent('.tabs')), 'la barra de abajo tiene las pestañas Conduces y Asistencia');
  await page.evaluate(() => document.querySelector('.tabs [data-tab="asistencia"]').click());
  await page.waitForSelector('#v-asistencia .empty');
  check(/Anota los obreros de esta obra/.test(await page.textContent('#v-asistencia')) && (await page.textContent('#title')) === 'Pase de lista', 'sin obreros: invita a anotarlos');

  // 1) Obreros: se anotan una vez.
  await page.click('#v-asistencia [data-act="att-workers"]');
  await page.waitForSelector('#w-add');
  for (const [n, r, p] of [['Marcelo', 'Ayudante', '1200'], ['Maslem', 'Ayudante', '1000'], ['Felipe', 'Terminador', '1500']]) {
    await page.fill('#w-name', n); await page.fill('#w-role', r); await page.fill('#w-pay', p);
    await page.click('#w-add button[type="submit"]');
    await page.waitForFunction((x) => [...document.querySelectorAll('.w-list input[data-wf="name"]')].some((i) => i.value === x), n);
  }
  let workers = await docs(page, 'workers');
  check(workers.length === 3 && workers.every((w) => w.projectId === pid && w.active === true) && workers.find((w) => w.name === 'Marcelo').pay === 1200, 'tres obreros con función y pago por día');
  const mas = page.locator('.w-row', { has: page.locator('input[data-wf="name"][value="Maslem"]') });
  await mas.locator('input[data-wf="pay"]').fill('1100');
  await mas.locator('input[data-wf="pay"]').dispatchEvent('change');
  await settle(page);
  workers = await docs(page, 'workers');
  check(workers.find((w) => w.name === 'Maslem').pay === 1100, 'se cambia el pago escribiendo en la casilla');
  await page.click('.sheet-h [data-act="sheet-close"]');

  // 2) Empezar la quincena (de domingo a sábado dos veces).
  await page.click('#v-asistencia [data-act="att-new"]');
  await page.waitForSelector('.att-row');
  let sheets = await docs(page, 'asistencia');
  check(sheets.length === 1 && sheets[0].start === START && sheets[0].days === 14 && sheets[0].workers.length === 3, `quincena del ${START}, 14 días y los 3 obreros`);
  check((await page.$$('.att-day')).length === 14 && !!(await page.$('.att-day.today[aria-pressed="true"]')), 'los 14 días, con hoy elegido');
  await page.fill('#att-in', '7:30'); await page.dispatchEvent('#att-in', 'change');
  await page.fill('#att-out', '5:00'); await page.dispatchEvent('#att-out', 'change');

  // 3) Lunes: todos entran, uno tarde, uno no vino; pase sorpresa; salida, uno corrido hasta la salida.
  await page.click('.att-day[data-k="1"]');
  await page.click('[data-act="att-all"][data-f="e"]');
  await mark(page, 'Maslem', 'e', 't');
  await mark(page, 'Felipe', 'e', 'x');
  await page.click('[data-act="att-surprise"]');
  await mark(page, 'Maslem', 'p', 'x');
  await page.click('[data-act="att-all"][data-f="s"]');
  await mark(page, 'Marcelo', 's', 'cc');
  check(await val(page, 'Marcelo') === '1.5' && await val(page, 'Maslem') === '0.5' && await val(page, 'Felipe') === '0', 'lunes: Marcelo 1½ = 1.5, Maslem (tarde: descuenta ½; sin estar en el pase) 0.5, Felipe no vino 0');
  check(/Pase sorpresa: \d{1,2}:\d{2}/.test(await page.textContent('.att-quick')), 'el pase sorpresa guarda la hora');
  await page.screenshot({ path: path.join(OUT, 'pase-de-lista.png') });
  // Martes: Marcelo corrido y se fue antes (C), Maslem se fue antes (x).
  await page.click('.att-day[data-k="2"]');
  await mark(page, 'Marcelo', 's', 'c');
  await mark(page, 'Maslem', 's', 'x');
  check(await val(page, 'Marcelo') === '1' && await val(page, 'Maslem') === '0.5', 'martes: C cuenta 1 y se fue antes ½');
  // Sábado: Felipe viene; el sábado es día entero.
  await page.click('.att-day[data-k="6"]');
  await mark(page, 'Felipe', 'e', 'ok');
  check(await val(page, 'Felipe') === '1' && !/el sábado vale/.test(await page.textContent('#v-asistencia')) && /T descuenta 0\.5 día/.test(await page.textContent('#v-asistencia')), 'sábado: Felipe vino y cuenta el día entero; la tardanza descuenta medio día (reglas de la empresa)');
  await settle(page, 900);
  sheets = await docs(page, 'asistencia');
  const W = Object.fromEntries((await docs(page, 'workers')).map((w) => [w.name, w.id]));
  const m = sheets[0].marks;
  check(m[W.Marcelo][1].s === 'cc' && m[W.Maslem][1].e === 't' && m[W.Maslem][1].p === 'x' && m[W.Felipe][1].e === 'x' && !m[W.Felipe][1].p && m[W.Marcelo][2].e === 'ok' && m[W.Marcelo][2].s === 'c', 'las marcas quedaron guardadas');
  check(/^\d{1,2}:\d{2}$/.test(sheets[0].surprise[1] || ''), 'la hora del pase sorpresa quedó guardada');

  // 4) Resumen: días y pago.
  const sumOf = () => page.$$eval('#v-asistencia table.sum tr', (trs) => trs.map((tr) => [...tr.children].map((td) => (td.querySelector('.pname') || td).textContent.trim()).join(' ')).join(' | '));
  const sum = await sumOf();
  console.log('     resumen:', sum);
  check(/Marcelo 2\.5 RD\$3,000\.00/.test(sum) && /Maslem 1 RD\$1,100\.00/.test(sum) && /Felipe 1 RD\$1,500\.00/.test(sum) && /Total 4\.5 RD\$5,600\.00/.test(sum), 'resumen: Marcelo 2.5 días RD$3,000; Maslem 1 día RD$1,100; Felipe 1 día (el sábado) RD$1,500; total RD$5,600');
  await page.$eval('#v-asistencia table.sum', (e) => e.scrollIntoView({ block: 'center' }));
  await settle(page, 200);
  await page.screenshot({ path: path.join(OUT, 'resumen-quincena.png') });

  // 5) Reglas: se pueden cambiar (aquí, que la tardanza no descuente).
  await page.click('#v-asistencia [data-act="att-rules"]');
  await page.waitForSelector('#att-rules-form');
  check(await page.inputValue('#ar-late') === '0.5' && await page.inputValue('#ar-sat') === '1', 'las reglas muestran la tardanza en medio día y el sábado como día entero');
  await page.selectOption('#ar-late', '0');
  await page.click('#att-rules-form button[type="submit"]');
  await page.waitForSelector('#att-rules-form', { state: 'detached' });
  await settle(page);
  const sum2 = await sumOf();
  check(/Maslem 1\.5 RD\$1,650\.00/.test(sum2) && /T no descuenta/.test(await page.textContent('#v-asistencia')), 'con la regla cambiada, Maslem queda en 1.5 días (RD$1,650)');
  const rs = await page.evaluate(async () => (await RT.db.doc('settings/asistencia').get()).data());
  check(rs.late === 0 && rs.saturday === 1 && rs.rev === 3, 'las reglas guardadas llevan su versión');

  // 6) Excel y PDF.
  const xl = await download(page, '[data-act="att-xlsx"]', 'asistencia.xlsx');
  const xr = JSON.parse(execFileSync('python3', ['-I', '-c', `
import openpyxl, sys, json
wb = openpyxl.load_workbook(sys.argv[1])
res = {'hojas': wb.sheetnames}
rows = list(wb['Resumen'].iter_rows(values_only=True))
res['res'] = {r[0]: [r[2], r[10]] for r in rows[5:] if r and r[0]}
pl = list(wb['Planilla'].iter_rows(values_only=True))
res['marcas'] = [c for c in pl[5] if c in ('✓', 'T', 'x', 'C', '1½')]
print(json.dumps(res, ensure_ascii=False, default=str))
`, xl]).toString());
  console.log('     excel:', JSON.stringify(xr));
  check(xr.hojas.join('|') === 'Resumen|Planilla' && xr.res.Marcelo[0] === 2.5 && xr.res.Marcelo[1] === 3000 && xr.res.Felipe[0] === 1 && xr.res.Total[1] === 6150, 'Excel: resumen con días y pago, total RD$6,150');
  check(xr.marcas.join('') === '✓✓1½✓C', 'Excel: la planilla de Marcelo con sus marcas (✓ ✓ 1½ y ✓ C)');
  const pdf = await download(page, '[data-act="att-pdf"]', 'asistencia.pdf');
  const pt = pdfText(pdf);
  check(/PASE DE LISTA — Residencial ENZO/.test(pt) && /Marcelo/.test(pt) && /Total a pagar: RD\$6,150\.00/.test(pt) && /Entrada hasta las: 7:30/.test(pt), 'PDF de la planilla con los obreros, la hora de entrada y el total');
  execFileSync('pdftoppm', ['-r', '70', '-png', '-singlefile', pdf, path.join(OUT, 'planilla')]);
  const blank = await download(page, '[data-act="att-blank"]', 'blanco.pdf');
  const bt = pdfText(blank);
  check(/Felipe/.test(bt) && !/Total a pagar/.test(bt) && /17/.test(bt), 'planilla en blanco: con los nombres, sin marcas ni total, 17 renglones');
  execFileSync('pdftoppm', ['-r', '70', '-png', '-singlefile', blank, path.join(OUT, 'planilla-blanco')]);

  // 7) Quincena siguiente y volver; las marcas siguen después de recargar.
  await page.click('[data-act="att-new"]');
  await page.waitForFunction(() => document.querySelectorAll('.att-row').length === 3);
  await settle(page, 600);
  sheets = await docs(page, 'asistencia');
  check(sheets.length === 2 && sheets.some((s) => s.start === NEXT), `la siguiente empieza el ${NEXT}`);
  await page.click('[data-act="att-prev"]');
  await settle(page);
  await page.reload();
  await page.evaluate(() => document.querySelector('.tabs [data-tab="asistencia"]').click());
  await page.waitForSelector('.att-row');
  await page.click('.att-day[data-k="1"]');
  check(await val(page, 'Marcelo') === '1.5', 'después de recargar, las marcas siguen ahí');

  // 8) Un obrero que se va: no sale en las planillas nuevas; en la vieja, con sus marcas, se queda.
  await page.click('#v-asistencia [data-act="att-workers"]');
  await page.waitForSelector('#w-add');
  await page.locator('.w-row', { has: page.locator('input[data-wf="name"][value="Felipe"]') }).locator('[data-act="att-w-toggle"]').click();
  await settle(page, 600);
  workers = await docs(page, 'workers');
  check(workers.find((w) => w.name === 'Felipe').active === false, 'Felipe: «Ya no está»');
  await page.click('.sheet-h [data-act="sheet-close"]');
  check((await page.$$('.att-row')).length === 3, 'en la quincena con sus marcas, Felipe sigue');

  // 9) Reglas guardadas con versiones anteriores: antes de la 1.11 (la tardanza no descontaba) y de la 1.11 a la 1.19 (el sábado valía medio día).
  await page.evaluate(() => RT.db.doc('settings/asistencia').set({ late: 0, surpriseMiss: 0, leftEarly: 0.5, corrido: 1, corridoFull: 1.5, saturday: 1, sunday: 1, updatedAt: '2026-11-01T10:00:00.000Z' }));
  await page.reload();
  for (let t = 0; t < 50; t++) { const d = await page.evaluate(async () => (await RT.db.doc("settings/asistencia").get()).data()).catch(() => null); if (d && d.rev === 3) break; await settle(page, 300); }
  const rold = await page.evaluate(async () => (await RT.db.doc('settings/asistencia').get()).data());
  check(rold.late === 0.5 && rold.saturday === 1 && rold.leftEarly === 0.5 && rold.rev === 3, 'las reglas de antes de la 1.11: la tardanza pasa a descontar medio día y el sábado sigue de día entero');
  await page.evaluate(() => RT.db.doc('settings/asistencia').set({ late: 0.25, surpriseMiss: 0, leftEarly: 0.5, corrido: 1, corridoFull: 1.5, saturday: 0.5, sunday: 1, rev: 2, updatedAt: '2026-11-02T10:00:00.000Z' }));
  await page.reload();
  for (let t = 0; t < 50; t++) { const d = await page.evaluate(async () => (await RT.db.doc("settings/asistencia").get()).data()).catch(() => null); if (d && d.rev === 3) break; await settle(page, 300); }
  const r2 = await page.evaluate(async () => (await RT.db.doc('settings/asistencia').get()).data());
  check(r2.saturday === 1 && r2.late === 0.25 && r2.rev === 3, 'las reglas de la 1.11 a la 1.19: el sábado pasa a día entero y lo demás se queda como estaba');

  console.log('problemas:', problems.length ? problems : 'ninguno');
  await browser.close();
  server.close();
  process.exit(problems.length ? 1 : 0);
})().catch((e) => { console.error(e); console.log('problemas:', problems); process.exit(1); });
