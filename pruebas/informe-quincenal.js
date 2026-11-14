// Informe quincenal para el jefe: fechas solas (desde el día después del último), vista previa, PDF con membrete, Excel y aviso a los 14 días.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = process.env.APP_ROOT || path.resolve(__dirname, '..');
const SP = process.env.PRUEBAS_TMP || path.join(require('os').tmpdir(), 'facturas-pruebas');
const OUT = path.join(SP, 'test-informe');
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
const pad = (n) => String(n).padStart(2, '0');
const dayIso = (off) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + off); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const dmy = (s) => s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4);
const T = dayIso(0), F = dayIso(-13);

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const BASE = `http://127.0.0.1:${server.address().port}/facturas/`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' && !/404|Failed to fetch|net::/.test(m.text())) problems.push('consola: ' + m.text()); });
  page.on('pageerror', (e) => problems.push('error de página: ' + e.message));
  await page.goto(BASE);
  await page.waitForSelector('.empty h2');
  await page.evaluate(async (d) => {
    const db = RT.db;
    await db.doc('settings/general').set({ company: 'SUCRE B. LANTIGUA CONSTRUCTORA, S.R.L.', companyRnc: '104595114', preparedBy: 'A. Robles', address: 'Santiago', phone: '809-555-0100' });
    const e = db.collection('projects').doc(); await e.set({ name: 'Enzo', budget: 12000, createdAt: '2026-08-01T10:00:00.000Z' });
    const m = db.collection('projects').doc(); await m.set({ name: 'Monaco', budget: 30000, createdAt: '2026-08-02T10:00:00.000Z' });
    await db.collection('suppliers').doc().set({ name: 'Ferretería Ochoa', rnc: '131023452', creditDays: 10, createdAt: '2026-08-01T10:00:00.000Z' });
    const base = { concept: 'Materiales', ref: '', buyerRnc: '104595114', notInvoice: false, noOrder: true, fileId: null, ai: 'off', currency: 'DOP', itbis: 0, createdAt: '2026-08-05T10:00:00.000Z' };
    const add = async (x) => { const r = db.collection('invoices').doc(); await r.set({ ...base, ...x }); return r.id; };
    const A = await add({ projectId: e.id, supplier: 'Ferretería Ochoa', rnc: '131023452', number: 'B0100000201', date: d.m10, amount: 10000 });
    await add({ projectId: m.id, supplier: 'Bloques del Cibao', rnc: '131555777', number: 'B0100000202', date: d.m5, amount: 25000 });
    await add({ projectId: e.id, supplier: 'Arenera del Este', rnc: '130333444', number: 'B0100000203', date: d.m3, amount: 5000, payMode: 'directo', payMethod: 'Transferencia', paidDate: d.m3 });
    await add({ projectId: m.id, supplier: 'Ferretería Ochoa', rnc: '131023452', number: 'B0100000204', date: d.m20, amount: 8000, abonos: [{ date: d.m1, amount: 3000, note: 'cheque' }] });
    await add({ projectId: m.id, supplier: 'Plomería Central', rnc: '130555666', number: 'B0100000205', date: d.m1, amount: 1200, payMode: 'reponer', paidBy: 'Caja chica', payMethod: 'Efectivo', paidDate: d.m1 });
    await db.collection('payments').doc().set({ name: 'Pago Ochoa', number: 1, date: d.m3, status: 'pagado', presentedAt: d.m3, paidAt: d.m2, invoiceIds: [A], createdAt: '2026-11-01T10:00:00.000Z' });
    await db.collection('orders').doc().set({ number: 9, date: d.m6, projectId: m.id, supplier: 'Cementos del Cibao', requestedBy: 'Ing. Peña', items: [{ qty: 10, unit: 'Funda', desc: 'Cemento gris', price: 500 }], status: 'autorizada', signedAt: d.m6, createdAt: '2026-11-01T08:00:00.000Z' });
    await db.collection('traslados').doc().set({ kind: 'material', number: 1, date: d.m4, fromId: e.id, toId: m.id, items: [{ qty: 3, unit: 'm³', desc: 'Tierra', price: 2500 }], total: 7500, createdAt: '2026-11-05T10:00:00.000Z' });
  }, { m1: dayIso(-1), m2: dayIso(-2), m3: dayIso(-3), m4: dayIso(-4), m5: dayIso(-5), m6: dayIso(-6), m10: dayIso(-10), m20: dayIso(-20) });
  await page.reload();
  await page.waitForSelector('#f-list [data-act="open-inv"]');
  await page.click('[data-act="backup-later"]').catch(() => {});

  // 1) El botón «Informe» en Facturas abre el panel con los últimos 14 días y la vista previa.
  check(await page.isVisible('#f-sum [data-act="inf-open"]'), 'Facturas tiene el botón «Informe»');
  check(!/informe quincenal/i.test(await txt(page, '#todo')), 'sin informe anterior, «Para hacer» no avisa');
  await page.click('#f-sum [data-act="inf-open"]');
  await page.waitForSelector('#inf-prev');
  check(await page.inputValue('#inf-from') === F && await page.inputValue('#inf-to') === T, `las fechas salen solas: los últimos 14 días (${F} al ${T})`);
  const prev = await txt(page, '#inf-prev');
  console.log('     vista previa:', prev);
  check(/Facturado\s*RD\$ ?41,200\.00\s*4 facturas/.test(prev) && /Pagado\s*RD\$ ?18,000\.00\s*3 pagos/.test(prev) && /Por pagar hoy\s*RD\$ ?31,200\.00\s*3 facturas/.test(prev) && /Vencido\s*RD\$ ?5,000\.00\s*1 factura/.test(prev), 'la vista previa: facturado, pagado (pago + contado + abono), por pagar y vencido');
  check(/orden de compra no tiene su factura/.test(prev) && /traslado no tiene anotado lo que llegó/.test(prev), 'la vista previa dice lo que necesita atención');
  await page.screenshot({ path: path.join(OUT, 'panel.png') });

  // 2) Cambiar las fechas cambia la vista previa.
  await page.fill('#inf-from', dayIso(-4));
  await page.dispatchEvent('#inf-from', 'change');
  await waitUntil(async () => /Facturado\s*RD\$ ?6,200\.00\s*2 facturas/.test(await txt(page, '#inf-prev')), 5000);
  check(/Facturado\s*RD\$ ?6,200\.00\s*2 facturas/.test(await txt(page, '#inf-prev')), 'al cambiar «Desde», la vista previa se actualiza');
  await page.fill('#inf-from', F);
  await page.dispatchEvent('#inf-from', 'change');
  await settle(page, 300);

  // 3) El PDF.
  const pdf = await download(page, '[data-act="inf-pdf"]', 'informe.pdf');
  const pt = pdfText(pdf);
  fs.writeFileSync(path.join(OUT, 'informe.txt'), pt);
  execFileSync('pdftoppm', ['-r', '70', '-png', pdf, path.join(OUT, 'pag')]);
  const nPages = Number((/Pages:\s+(\d+)/.exec(execFileSync('pdfinfo', [pdf]).toString()) || [])[1]);
  check(/INFORME QUINCENAL/.test(pt) && pt.includes(`Del ${dmy(F)} al ${dmy(T)}`) && /SUCRE B\. LANTIGUA CONSTRUCTORA/.test(pt) && /RNC 1-04-59511-4/.test(pt), 'el PDF lleva el membrete, el título y el período');
  check(/RESUMEN DEL PERÍODO/.test(pt) && /RD\$ ?41,200\.00/.test(pt) && /RD\$ ?18,000\.00/.test(pt) && /RD\$ ?31,200\.00/.test(pt) && /cuarenta y un mil doscientos pesos con 00\/100/.test(pt), 'resumen con los cuatro montos y el facturado en letras');
  check(/período anterior.*1 factura por RD\$ ?8,000\.00/s.test(pt), 'compara con el período anterior');
  check(/REQUIERE ATENCIÓN/.test(pt) && /1 factura vencida por RD\$ ?5,000\.00/.test(pt), 'lo que requiere atención');
  check(/POR OBRA/.test(pt) && /Enzo\s+RD\$ ?15,000\.00\s+RD\$ ?15,000\.00\s+RD\$ ?0\.00\s+RD\$ ?7,500\.00\s+RD\$ ?12,000\.00\s+63 %/.test(pt) && /Monaco\s+RD\$ ?26,200\.00\s+RD\$ ?3,000\.00\s+RD\$ ?31,200\.00\s+RD\$ ?41,700\.00\s+RD\$ ?30,000\.00\s+139 %/.test(pt), 'por obra: facturado, pagado, por pagar, gastado (con traslados), presupuesto y uso');
  check(/No incluye la mano de obra/.test(pt), 'el gasto por obra no incluye la mano de obra (lo dice debajo de la tabla)');
  check(/POR PROVEEDOR/.test(pt) && /Bloques del Cibao\s+1\s+RD\$ ?25,000\.00\s+RD\$ ?25,000\.00/.test(pt) && /Ferretería Ochoa\s+1\s+RD\$ ?10,000\.00\s+RD\$ ?0\.00/.test(pt), 'por proveedor, ordenado por monto');
  check(/PENDIENTE A LA FECHA/.test(pt) && /Facturas vencidas/.test(pt) && /Ferretería Ochoa\s+B0100000204\s+Monaco/.test(pt) && /Caja chica\s+1\s+RD\$ ?1,200\.00/.test(pt) && /Cementos del Cibao/.test(pt) && /RD\$ ?5,000\.00/.test(pt) && /Monaco\s+Enzo\s+RD\$ ?7,500\.00/.test(pt), 'pendiente: vencidas, por reponer, órdenes sin factura y cuentas entre obras');
  check(/FACTURAS RECIBIDAS EN EL PERÍODO/.test(pt) && /B0100000202/.test(pt) && !/B0100000204\s+Monaco\s+RD\$ ?8,000\.00\s+Pendiente/.test(pt), 'el detalle tiene las del período (no la del período anterior)');
  check(/PAGOS HECHOS EN EL PERÍODO/.test(pt) && /No\. 0001 Pago Ochoa/.test(pt) && /Al contado \(transferencia\)/.test(pt) && /Abono: cheque/.test(pt), 'los pagos del período: el pago, el contado y el abono');
  check(/Preparado por/.test(pt) && /A\. Robles/.test(pt) && /Recibido por/.test(pt) && new RegExp(`Página 1 de ${nPages}`).test(pt) && /Informe quincenal · Generado el/.test(pt), `firmas y el pie «Página X de ${nPages}»`);
  check(!/[?]{2}/.test(pt), 'sin letras raras en el PDF');

  // 4) Al guardarlo queda anotado como el último informe.
  const inf = await waitUntil(() => page.evaluate(async () => (await RT.db.doc('settings/informe').get()).data()), 5000);
  check(inf && inf.lastFrom === F && inf.lastTo === T && inf.by === 'A. Robles', 'al guardarlo queda anotado (desde, hasta y quién)');

  // 5) El Excel con el detalle.
  await page.click('#f-sum [data-act="inf-open"]');
  await page.waitForSelector('#inf-prev');
  check(await page.inputValue('#inf-from') === F && await page.inputValue('#inf-to') === T && /Último informe: del/.test(await txt(page, '.sheet')), 'al volver a abrirlo el mismo día, salen las fechas del último y dice cuándo toca el próximo');
  const xl = await download(page, '[data-act="inf-xlsx"]', 'informe.xlsx');
  const xr = JSON.parse(execFileSync('python3', ['-I', '-c', `
import openpyxl, sys, json
wb = openpyxl.load_workbook(sys.argv[1])
out = {'sheets': wb.sheetnames}
def rows(n): return [list(r) for r in wb[n].iter_rows(values_only=True)]
out['resumen'] = [r[:3] for r in rows('Resumen')[5:10]]
out['obra'] = [r[:8] for r in rows('Por obra')[5:8]]
out['facturas'] = len([r for r in rows('Facturas')[5:] if r[0] is not None and r[0] != 'Total'])
out['pagos'] = [r[4] for r in rows('Pagos')[5:] if r[0] is not None and r[0] != 'Total']
out['pend'] = [r[0] for r in rows('Pendiente')[5:] if r[0]]
print(json.dumps(out, ensure_ascii=False, default=str))
`, xl]).toString());
  console.log('     excel:', JSON.stringify(xr));
  check(xr.sheets.join() === 'Resumen,Por obra,Por proveedor,Facturas,Pagos,Pendiente', 'el Excel tiene sus seis hojas');
  check(JSON.stringify(xr.resumen[0]) === '["Facturado en el período",4,41200]' && JSON.stringify(xr.resumen[2]) === '["Pagado en el período",3,18000]' && JSON.stringify(xr.resumen[4]) === '["Vencido hoy",1,5000]', 'Excel: el resumen con números de verdad');
  check(xr.obra[1] && xr.obra[1][0] === 'Monaco' && xr.obra[1][5] === 41700 && xr.obra[1][7] === 139 && xr.facturas === 4 && xr.pagos.length === 3, 'Excel: por obra, las facturas y los pagos');
  check(xr.pend.includes('Cementos del Cibao') || xr.pend.includes('Órdenes de compra sin factura'), 'Excel: lo pendiente y las órdenes sin factura');

  // 6) A los 14 días, «Para hacer» avisa y el informe sigue desde el día después del último.
  const last = dayIso(-14);
  await page.evaluate(async (d) => RT.db.doc('settings/informe').set({ lastFrom: d.f, lastTo: d.t, at: d.t + 'T20:00:00.000Z', by: 'A. Robles' }), { f: dayIso(-27), t: last });
  await waitUntil(async () => /informe quincenal/i.test(await txt(page, '#todo')), 5000);
  check(/Toca el informe quincenal para el jefe/.test(await txt(page, '#todo')), 'a los 14 días, «Para hacer» avisa que toca el informe');
  await page.click('#todo [data-act="inf-open"]');
  await page.waitForSelector('#inf-prev');
  check(await page.inputValue('#inf-from') === dayIso(-13) && await page.inputValue('#inf-to') === T, 'el nuevo va desde el día después del último hasta hoy');
  await page.click('.sheet-h [data-act="sheet-close"]');
  await page.evaluate(async (t) => RT.db.doc('settings/informe').set({ lastFrom: t, lastTo: t, at: t + 'T20:00:00.000Z' }), dayIso(-5));
  await waitUntil(async () => !/informe quincenal/i.test(await txt(page, '#todo')), 5000);
  check(!/informe quincenal/i.test(await txt(page, '#todo')), 'antes de los 14 días no avisa');

  // 7) En la computadora.
  await page.setViewportSize({ width: 1280, height: 860 });
  await settle(page, 500);
  await page.click('#f-sum [data-act="inf-open"]');
  await page.waitForSelector('#inf-prev');
  const kb = await page.evaluate(() => { const r = [...document.querySelectorAll('.inf-kpis > div')].map((d) => d.getBoundingClientRect()); return { n: r.length, oneRow: r.every((x) => Math.abs(x.top - r[0].top) < 2), fits: document.documentElement.scrollWidth <= window.innerWidth }; });
  check(kb.n === 4 && kb.oneRow && kb.fits, 'en la computadora, los cuatro montos van en una fila');
  await page.screenshot({ path: path.join(OUT, 'panel-pc.png') });

  console.log('problemas:', problems.length ? problems : 'ninguno');
  await browser.close();
  server.close();
  process.exit(problems.length ? 1 : 0);
})().catch((e) => { console.error(e); console.log('problemas:', problems); process.exit(1); });
