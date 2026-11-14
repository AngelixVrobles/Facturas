// Traslados de materiales entre obras: la hoja (materiales, precios y quiénes), el PDF para firmar, la hoja firmada,
// la cuenta entre obras, los pagos entre obras, lo que cuesta cada obra, el Excel y la papelera.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = process.env.APP_ROOT || path.resolve(__dirname, '..');
const SP = process.env.PRUEBAS_TMP || path.join(require('os').tmpdir(), 'facturas-pruebas');
const OUT = path.join(SP, 'test-traslados');
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
const row = (page, n) => page.locator('#t-items [data-row]').nth(n);
async function fillRow(page, n, qty, unit, desc, price) {
  const r = row(page, n);
  await r.locator('[data-f="qty"]').fill(qty);
  if (unit) await r.locator('[data-f="unit"]').fill(unit);
  if (price) await r.locator('[data-f="price"]').fill(price);
  await r.locator('[data-f="desc"]').fill(desc);
  await r.locator('[data-f="desc"]').dispatchEvent('change');
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
  const P = await page.evaluate(async () => {
    await RT.db.doc('settings/general').set({ company: 'SUCRE B. LANTIGUA CONSTRUCTORA, S.R.L.', companyRnc: '104595114', preparedBy: 'A. Robles' });
    const a = RT.db.collection('projects').doc(); await a.set({ name: 'Residencial ENZO', createdAt: '2026-09-01T10:00:00.000Z' });
    const b = RT.db.collection('projects').doc(); await b.set({ name: 'Monaco', createdAt: '2026-09-02T10:00:00.000Z' });
    await RT.db.collection('orders').doc().set({ number: 1, date: '2026-10-20', projectId: a.id, supplier: 'Ferretería Ochoa', status: 'autorizada', items: [{ qty: 6, unit: 'm³', desc: 'Arena lavada', price: 1500 }], createdAt: '2026-10-20T10:00:00.000Z' });
    return { enzo: a.id, monaco: b.id };
  });
  await page.click('[data-act="backup-later"]').catch(() => {});

  // 0) Membrete: logo, dirección y teléfono de la empresa (salen en los documentos).
  const logoFile = path.join(OUT, 'logo.png');
  await page.screenshot({ path: logoFile, clip: { x: 0, y: 0, width: 300, height: 120 } });
  await page.click('#settings-btn');
  await page.waitForSelector('#st-addr');
  await page.setInputFiles('#logo-input', logoFile);
  await page.waitForSelector('#logo-box img', { timeout: 10000 });
  await page.fill('#st-addr', 'Av. 27 de Febrero 100, Santiago');
  await page.fill('#st-phone', '809-555-0100');
  await page.click('#settings-form button[type="submit"]');
  await page.waitForSelector('#settings-form', { state: 'detached' });
  const stg = await page.evaluate(async () => (await RT.db.doc('settings/general').get()).data());
  check(/^data:image\/(png|jpeg);base64,/.test(stg.logo || '') && stg.logo.length < 300000 && stg.address === 'Av. 27 de Febrero 100, Santiago' && stg.phone === '809-555-0100', 'Ajustes guarda el logo (pequeño), la dirección y el teléfono');

  // 1) En el teléfono, Traslados está en «Más».
  await page.click('.tabs [data-act="more-menu"]');
  await page.click('.menu-row[data-go="traslados"]');
  await page.waitForSelector('#v-traslados:not([hidden]) .empty');
  check((await txt(page, '#title')) === 'Traslados' && /Nuevo traslado/.test(await txt(page, '#v-traslados')), 'en «Más» → Traslados de materiales: explica cómo se usa');

  // 2) Traslado del ENZO al Monaco: tierra con precio escrito, arena con el precio de la orden, cemento sin precio.
  await page.click('#t-new');
  await page.waitForSelector('#tr-form');
  check((await page.inputValue('#t-no')) === 'TR-0001', 'el primer traslado es TR-0001');
  await page.selectOption('#t-from', P.enzo);
  await page.selectOption('#t-from', P.enzo);
  await page.selectOption('#t-to', P.enzo);
  await page.click('#tr-form button[type="submit"]');
  await settle(page, 300);
  check(/tienen que ser distintas/.test(await txt(page, '#toast')), 'no deja trasladar a la misma obra');
  await page.selectOption('#t-to', P.monaco);
  check(/Lo entregó en Residencial ENZO/.test(await txt(page, 'label[for="t-dlv"]')) && /Lo recibió en Monaco/.test(await txt(page, 'label[for="t-rcv"]')), 'las casillas dicen «Lo entregó en Residencial ENZO» y «Lo recibió en Monaco»');
  await fillRow(page, 0, '3', 'm³', 'Tierra (ya estaba en la obra)', '800');
  await fillRow(page, 1, '2', '', 'Arena lavada', '');
  await settle(page, 300);
  check((await row(page, 1).locator('[data-f="price"]').inputValue()) === '1500' && (await row(page, 1).locator('[data-f="unit"]').inputValue()) === 'm³' && /Precio de OC-0001/.test(await txt(page, '#toast')), 'la arena toma el precio y la unidad de la orden OC-0001 y lo avisa');
  await fillRow(page, 2, '10', 'Saco', 'Cemento gris', '');
  await settle(page, 200);
  const sum = await txt(page, '#t-sum');
  check(/Total: RD\$5,400\.00/.test(sum) && /1 material sin precio/.test(sum) && /Monaco le queda debiendo RD\$5,400\.00 a Residencial ENZO/.test(sum), `el total y quién le debe a quién («${sum}»)`);
  for (const [id, v] of [['t-req', 'Ing. Pérez'], ['t-auth', 'Arq. Lantigua'], ['t-dlv', 'Juan del almacén'], ['t-car', 'Pedro (chofer)'], ['t-veh', 'Camión L123456'], ['t-rcv', 'Maestro Luis'], ['t-notes', 'Para el relleno del patio']]) await page.fill('#' + id, v);
  await page.screenshot({ path: path.join(OUT, 'hoja.png') });
  const pdf = await download(page, '[data-act="tr-pdf"]', 'traslado.pdf');
  const pt = pdfText(pdf);
  check(/TRASLADO DE MATERIALES ENTRE OBRAS/.test(pt) && /TR-0001/.test(pt) && /Residencial ENZO/.test(pt) && /Monaco/.test(pt) && /Tierra/.test(pt) && /RD\$2,400\.00/.test(pt) && /TOTAL DEL TRASLADO/.test(pt) && /RD\$5,400\.00/.test(pt), 'PDF: la hoja con las obras, los materiales, cada total y el total');
  check(/queda a favor de\s+Residencial ENZO/.test(pt) && /sin precio/.test(pt) && /Juan del almacén/.test(pt) && /Pedro \(chofer\)/.test(pt) && /Camión L123456/.test(pt) && /Maestro Luis/.test(pt) && /Lo autorizó/.test(pt), 'PDF: dice a favor de quién queda y las firmas con los nombres');
  execFileSync('pdftoppm', ['-r', '70', '-png', '-singlefile', pdf, path.join(OUT, 'hoja-pdf')]);
  check(/Av\. 27 de Febrero 100, Santiago/.test(pt) && /Tel\. 809-555-0100/.test(pt) && /Página 1 de 1/.test(pt) && /Generado el \d\d\/\d\d\/\d{4}/.test(pt) && /\bimage\b/.test(execFileSync('pdfimages', ['-list', pdf]).toString()), 'el PDF lleva el membrete (logo, dirección, teléfono) y el pie con «Página 1 de 1»');
  let trs = await docs(page, 'traslados');
  const t1 = trs[0];
  check(trs.length === 1 && t1.kind === 'material' && t1.number === 1 && t1.total === 5400 && t1.fromId === P.enzo && t1.toId === P.monaco && t1.items.length === 3 && t1.items[1].priceSrc === 'OC-0001' && !t1.items[0].priceSrc && t1.carriedBy === 'Pedro (chofer)', 'queda guardado: obras, materiales, total, de dónde salió cada precio y quiénes');
  await page.waitForSelector('.tr-acc-row');
  check(/Monaco le debe a Residencial ENZO/.test(await txt(page, '#t-acc')) && /RD\$5,400\.00/.test(await txt(page, '#t-acc')), 'arriba: «Monaco le debe a Residencial ENZO RD$5,400.00»');

  // 3) La hoja firmada.
  await page.click(`[data-act="tr-open"][data-id="${t1.id}"]`);
  await page.waitForSelector('#tr-form');
  check(/Sin firmar/.test(await txt(page, '.status-line')) && /Monaco le debe RD\$5,400\.00 a Residencial ENZO/.test(await txt(page, '.status-line')), 'el traslado dice «Sin firmar» y cómo va la cuenta');
  const foto = path.join(OUT, 'firmada.png');
  await page.screenshot({ path: foto });
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('[data-act="tr-signed"]')]);
  await fc.setFiles(foto);
  await page.waitForFunction(() => /Hoja firmada guardada/.test(document.querySelector('#toast').textContent), null, { timeout: 15000 }).catch(() => {});
  await page.waitForSelector('[data-act="tr-view-signed"]', { timeout: 10000 }).catch(() => {});
  trs = await docs(page, 'traslados');
  check(!!trs[0].signedFileId && !!(await page.$('[data-act="tr-view-signed"]')) && /Firmado/.test(await txt(page, '.status-line')), 'se adjunta la foto de la hoja firmada y queda «Firmado»');
  await page.click('.sheet-h [data-act="sheet-close"]');

  // 4) Otro traslado al revés: del Monaco al ENZO, varillas por RD$7,000. Ahora el ENZO le debe RD$1,600.
  await page.click('#t-new');
  await page.waitForSelector('#tr-form');
  await page.selectOption('#t-from', P.monaco);
  await page.selectOption('#t-to', P.enzo);
  await fillRow(page, 0, '20', 'Varilla', 'Varilla de 3/8', '350');
  await page.click('#tr-form button[type="submit"]');
  await page.waitForSelector('#tr-form', { state: 'detached' });
  await settle(page);
  check(/Residencial ENZO le debe a Monaco/.test(await txt(page, '#t-acc')) && /RD\$1,600\.00/.test(await txt(page, '#t-acc')), 'con el traslado al revés, la cuenta queda: «Residencial ENZO le debe a Monaco RD$1,600.00»');
  await page.click('[data-act="tr-acc"]');
  await page.waitForSelector('.tr-result');
  const acc = await txt(page, '#sheet-root .sheet');
  check(/Residencial ENZO le debe RD\$1,600\.00 a Monaco/.test(acc) && (await page.$$('#sheet-root .tr-mv')).length === 2 && /RD\$5,400\.00 a favor de Residencial ENZO/.test(acc) && /RD\$1,600\.00 a favor de Monaco/.test(acc), 'la cuenta entre las dos obras, movimiento por movimiento, con el saldo');
  await settle(page, 500);
  await page.screenshot({ path: path.join(OUT, 'cuenta.png') });

  // 5) Pago entre obras: el ENZO le paga al Monaco y quedan a mano.
  await page.click('#sheet-root [data-act="tr-pay"]');
  await page.waitForSelector('#tp-form');
  check((await page.inputValue('#tp-from')) === P.enzo && (await page.inputValue('#tp-to')) === P.monaco && (await page.inputValue('#tp-amt')) === '1600' && /Con este pago quedan a mano/.test(await txt(page, '#tp-msg')), 'el pago viene lleno: el ENZO le paga RD$1,600 al Monaco y quedan a mano');
  await page.fill('#tp-amt', '2000');
  check(/Monaco quedaría debiéndole RD\$400\.00 a Residencial ENZO/.test(await txt(page, '#tp-msg')), 'si paga de más, avisa cómo quedaría');
  await page.fill('#tp-amt', '1600');
  await page.fill('#tp-note', 'Transferencia del 10 de noviembre');
  await page.click('#tp-form button[type="submit"]');
  await page.waitForSelector('#tp-form', { state: 'detached' });
  await settle(page);
  check(/Las obras están a mano/.test(await txt(page, '#t-acc')) && (await page.$$('#t-list .tr-card')).length === 3, 'con el pago, las obras quedan a mano; la lista tiene los 2 traslados y el pago');

  // 6) La obra: lo que recibió y dio cambia lo que cuesta.
  await page.click('.tabs [data-act="more-menu"]');
  await page.click('.menu-row[data-go="proyectos"]');
  await page.click(`[data-act="open-proj"][data-id="${P.enzo}"]`);
  await page.waitForSelector('#proj-form');
  const pj = await txt(page, '#proj-form');
  check(/Recibió de otras obras RD\$7,000\.00 · dio a otras obras RD\$5,400\.00/.test(pj) && /Gastado\s*RD\$1,600\.00/.test(pj) && /materiales de otras obras RD\$7,000\.00/.test(pj), 'la obra: recibió RD$7,000 y dio RD$5,400; lo gastado lo toma en cuenta');
  await page.click('[data-act="tr-go-proj"]');
  await page.waitForSelector('#v-traslados:not([hidden])');
  check((await page.$$('#t-list .tr-card')).length === 3 && (await page.getAttribute(`[data-act="tr-projf"][data-p="${P.enzo}"]`, 'aria-pressed')) === 'true', '«Ver sus traslados» abre los traslados de esa obra');

  // 7) Excel.
  const xl = await download(page, '[data-act="tr-xlsx"]', 'traslados.xlsx');
  const xr = JSON.parse(execFileSync('python3', ['-I', '-c', `
import openpyxl, sys, json
wb = openpyxl.load_workbook(sys.argv[1])
m = [r for r in wb['Materiales'].iter_rows(values_only=True)][5:]
print(json.dumps({'hojas': wb.sheetnames, 'mat': [[r[6], r[8], r[9]] for r in m if r and r[1]], 'tot': [r[8] for r in m if r and r[0] == 'Total'], 'pagos': [list(r)[1:4] for r in list(wb['Pagos'].iter_rows(values_only=True))[5:] if r and r[1]]}, ensure_ascii=False, default=str))
`, xl]).toString());
  console.log('     excel:', JSON.stringify(xr));
  check(xr.hojas.join('|') === 'Cuentas|Materiales|Pagos' && xr.mat.length === 4 && xr.mat[0][2] === 'Escrito a mano' && xr.mat[1][2] === 'Precio de OC-0001' && xr.mat[2][2] === 'Sin precio' && xr.tot[0] === 12400 && xr.pagos.length === 1 && xr.pagos[0][2] === 1600, 'Excel: cuentas, cada material con de dónde salió su precio, el total y el pago');

  // 8) Borrar el pago: va a la papelera y se deshace.
  const pago = (await docs(page, 'traslados')).find((x) => x.kind === 'pago');
  await page.click(`[data-act="tr-open"][data-id="${pago.id}"]`);
  await page.waitForSelector('#tp-form');
  await page.click('[data-act="tr-del"]');
  await settle(page, 500);
  check(!(await docs(page, 'traslados')).some((x) => x.id === pago.id) && /RD\$1,600\.00/.test(await txt(page, '#t-acc')), 'al borrar el pago, la cuenta vuelve a RD$1,600');
  await page.click('#toast .toast-act');
  await settle(page, 600);
  check((await docs(page, 'traslados')).some((x) => x.id === pago.id) && /a mano/.test(await txt(page, '#t-acc')), '«Deshacer» lo regresa');

  // 9) En la computadora: tabla, «N» abre un traslado nuevo.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForSelector('.tr-tbl');
  check((await page.$$('.tr-tbl tbody tr')).length === 3 && await page.isVisible('.tabs [data-tab="traslados"]'), 'en la computadora: Traslados en el menú y la lista en tabla');
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await page.keyboard.press('n');
  await page.waitForSelector('#tr-form', { timeout: 5000 }).catch(() => {});
  check((await page.inputValue('#t-no').catch(() => '')) === 'TR-0003', '«N» abre el traslado nuevo TR-0003');
  await page.keyboard.press('Escape');
  await page.screenshot({ path: path.join(OUT, 'computadora.png') });

  console.log('problemas:', problems.length ? problems : 'ninguno');
  await browser.close();
  server.close();
  process.exit(problems.length ? 1 : 0);
})().catch((e) => { console.error(e); console.log('problemas:', problems); process.exit(1); });
