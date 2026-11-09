// Día entero o medio día en cada día de la planilla (por ejemplo, un feriado en que se trabaja hasta el mediodía),
// y el sábado de día entero.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = process.env.APP_ROOT || path.resolve(__dirname, '..');
const SP = process.env.PRUEBAS_TMP || path.join(require('os').tmpdir(), 'facturas-pruebas');
const OUT = path.join(SP, 'test-mediodia');
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
const today = new Date();
const sunday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay());
const MON = new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate() + 1);
const rowOf = (page, name) => page.locator('.att-row', { hasText: name });
const mark = (page, name, f, v) => rowOf(page, name).locator(`[data-act="att-mark"][data-f="${f}"][data-v="${v}"]`).click();
const val = async (page, name) => (await rowOf(page, name).locator('.att-val').textContent()).trim();
const txt = async (page, sel) => ((await page.textContent(sel).catch(() => '')) || '').replace(/\s+/g, ' ').trim();
const halfOf = async (page, pname) => { const P = Object.fromEntries((await docs(page, 'projects')).map((p) => [p.name, p.id])); const sh = (await docs(page, 'asistencia')).find((x) => x.projectId === P[pname]); return sh && sh.half ? sh.half : {}; };

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
  await page.evaluate(async () => {
    await RT.db.doc('settings/general').set({ company: 'SUCRE B. LANTIGUA CONSTRUCTORA, S.R.L.', companyRnc: '104595114' });
    const a = RT.db.collection('projects').doc(); await a.set({ name: 'Residencial ENZO', createdAt: '2026-09-01T10:00:00.000Z' });
    const b = RT.db.collection('projects').doc(); await b.set({ name: 'Caperuza 2', createdAt: '2026-09-02T10:00:00.000Z' });
    let n = 0;
    for (const [pid, name, role, pay] of [[a.id, 'Marcelo', 'Ayudante', 1200], [a.id, 'Maslem', 'Ayudante', 1100], [b.id, 'Pedro', 'Albañil', 1300]]) {
      await RT.db.collection('workers').doc().set({ projectId: pid, name, role, pay, active: true, seq: ++n, createdAt: '2026-11-01T10:00:00.000Z' });
    }
  });
  await page.click('[data-act="backup-later"]').catch(() => {});
  await page.evaluate(() => document.querySelector('.tabs [data-tab="asistencia"]').click());
  await page.waitForSelector('#v-asistencia [data-act="att-new"]');
  // Las dos obras con su quincena.
  await page.click('#v-asistencia [data-act="att-new"]');
  await page.waitForSelector('.att-row');
  await page.locator('[data-act="att-proj"]', { hasText: 'Caperuza 2' }).click();
  await page.waitForSelector('#v-asistencia [data-act="att-new"]');
  await page.click('#v-asistencia [data-act="att-new"]');
  await page.waitForFunction(() => document.querySelectorAll('.att-row').length === 1);
  await page.locator('[data-act="att-proj"]', { hasText: 'Residencial ENZO' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.att-row').length === 2);

  // 1) El lunes, día entero (lo normal): todos ✓ cuentan 1.
  await page.click('.att-day[data-k="1"]');
  check(await page.getAttribute('[data-act="att-half"][data-v="0"]', 'aria-pressed') === 'true', 'cada día viene de día entero');
  await page.click('[data-act="att-all"][data-f="e"]');
  check(await val(page, 'Marcelo') === '1' && await val(page, 'Maslem') === '1', 'día entero: el que vino cuenta 1');

  // 2) Medio día: todo cuenta la mitad; el día lleva ½; se ofrece ponerlo en la otra obra.
  await page.click('[data-act="att-half"][data-v="1"]');
  await page.waitForFunction(() => /½/.test(document.querySelector('.att-day[data-k="1"]').textContent));
  check(await val(page, 'Marcelo') === '0.5' && await val(page, 'Maslem') === '0.5', 'medio día: el que vino cuenta ½');
  check(await page.getAttribute('[data-act="att-half"][data-v="1"]', 'aria-pressed') === 'true' && /½/.test(await txt(page, '.att-day[data-k="1"] span')), 'el botón «Medio día» queda marcado y el día dice ½');
  const tmsg = await txt(page, '#toast');
  check(new RegExp(`Medio día el lunes ${MON.getDate()} en esta obra\\.`).test(tmsg) && /También en la otra obra/.test(tmsg), `avisa y ofrece ponerlo también en la otra obra («${tmsg}»)`);
  await page.screenshot({ path: path.join(OUT, 'medio-dia.png') });
  await page.click('#toast .toast-act');
  await settle(page, 600);
  check((await halfOf(page, 'Residencial ENZO'))[1] === true && (await halfOf(page, 'Caperuza 2'))[1] === true, 'con un toque, el lunes queda de medio día en las dos obras');
  await mark(page, 'Maslem', 'e', 't');
  check(await val(page, 'Maslem') === '0.25', 'si llegó tarde en un medio día, se le descuenta la mitad de lo de siempre (¼)');

  // 3) El sábado es día entero.
  await page.click('.att-day[data-k="6"]');
  await mark(page, 'Marcelo', 'e', 'ok');
  check(await val(page, 'Marcelo') === '1' && await page.getAttribute('[data-act="att-half"][data-v="0"]', 'aria-pressed') === 'true', 'el sábado cuenta el día entero');

  // 4) Resumen: los días y el pago con el medio día; dice qué día fue.
  const sum = await page.$$eval('#v-asistencia table.sum tr', (trs) => trs.map((tr) => [...tr.children].map((td) => (td.querySelector('.pname') || td).textContent.trim()).join(' ')).join(' | '));
  console.log('     resumen:', sum);
  check(/Marcelo 1\.5 RD\$1,800\.00/.test(sum) && /Maslem 0\.25 RD\$275\.00/.test(sum) && /Total 1\.75 RD\$2,075\.00/.test(sum), 'resumen: Marcelo 1.5 días (½ + el sábado) RD$1,800; Maslem ¼ RD$275');
  check(new RegExp(`Medio día: lunes ${MON.getDate()}\\.`).test(await txt(page, '#v-asistencia')), `el resumen dice «Medio día: lunes ${MON.getDate()}»`);

  // 5) Excel y PDF: el día lleva ½ y la nota explica.
  const xl = await download(page, '[data-act="att-xlsx"]', 'medio-dia.xlsx');
  const xr = JSON.parse(execFileSync('python3', ['-I', '-c', `
import openpyxl, sys, json
wb = openpyxl.load_workbook(sys.argv[1])
pl = list(wb['Planilla'].iter_rows(values_only=True))
rs = list(wb['Resumen'].iter_rows(values_only=True))
print(json.dumps({'head': [c for c in pl[3] if c], 'nota': [str(r[0]) for r in pl if r and r[0] and '½ =' in str(r[0])], 'res': {r[0]: r[2] for r in rs[5:] if r and r[0]}}, ensure_ascii=False, default=str))
`, xl]).toString());
  console.log('     excel:', JSON.stringify(xr).slice(0, 300));
  check(xr.head.includes(`L ${MON.getDate()}/${MON.getMonth() + 1} ½`) && xr.nota.length === 1 && xr.res.Marcelo === 1.5 && xr.res.Maslem === 0.25, 'Excel: el lunes dice ½, la nota lo explica y el resumen cuenta el medio día');
  const pdf = await download(page, '[data-act="att-pdf"]', 'medio-dia.pdf');
  const pt = pdfText(pdf);
  check(/½ = medio día/.test(pt) && new RegExp(`L\\s*${MON.getDate()}\\s*½`).test(pt) && /Total a pagar: RD\$2,075\.00/.test(pt), 'PDF: el lunes dice ½, con la nota y el total');
  execFileSync('pdftoppm', ['-r', '70', '-png', '-singlefile', pdf, path.join(OUT, 'planilla')]);

  // 6) En la otra obra, se vuelve a día entero solo ahí.
  await page.locator('[data-act="att-proj"]', { hasText: 'Caperuza 2' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.att-row').length === 1);
  await page.click('.att-day[data-k="1"]');
  await mark(page, 'Pedro', 'e', 'ok');
  check(await val(page, 'Pedro') === '0.5', 'en la otra obra el lunes también es de medio día');
  await page.click('[data-act="att-half"][data-v="0"]');
  await page.waitForFunction(() => !/½/.test(document.querySelector('.att-day[data-k="1"]').textContent));
  check(await val(page, 'Pedro') === '1', 'se cambia a día entero y Pedro cuenta 1');
  await settle(page, 400);
  check(!(await halfOf(page, 'Caperuza 2'))[1] && (await halfOf(page, 'Residencial ENZO'))[1] === true, 'el cambio queda solo en esa obra (si no se toca «También en la otra obra»)');

  // 7) Reglas: el sábado viene de día entero y explica cómo poner un medio día.
  await page.click('#v-asistencia [data-act="att-rules"]');
  await page.waitForSelector('#att-rules-form');
  check(await page.inputValue('#ar-sat') === '1' && /escoge Medio día en ese día de la planilla/.test(await txt(page, '#att-rules-form')), 'las reglas: el sábado de día entero y cómo poner un medio día');
  await page.click('.sheet-h [data-act="sheet-close"]');

  // 8) En la computadora, la planilla de la quincena marca el lunes con ½.
  await page.locator('[data-act="att-proj"]', { hasText: 'Residencial ENZO' }).click();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForSelector('.att-tbl');
  check(await page.$$eval('.att-tbl th .att-half-mk', (l) => l.length) === 1, 'en la computadora, la planilla marca el lunes con ½');
  await page.screenshot({ path: path.join(OUT, 'computadora.png') });

  console.log('problemas:', problems.length ? problems : 'ninguno');
  await browser.close();
  server.close();
  process.exit(problems.length ? 1 : 0);
})().catch((e) => { console.error(e); console.log('problemas:', problems); process.exit(1); });
