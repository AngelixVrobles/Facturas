// Facturas con artículos tachados (se devolvieron o se cambiaron): la lectura los anota, el total impreso queda aparte,
// se rebaja el monto con un toque y queda para revisar hasta entonces. También el total corregido a mano y anotarlos a mano.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = process.env.APP_ROOT || path.resolve(__dirname, '..');
const SP = process.env.PRUEBAS_TMP || path.join(require('os').tmpdir(), 'facturas-pruebas');
const OUT = path.join(SP, 'test-tachados');
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
const settle = (page, ms = 450) => page.waitForTimeout(ms);
const txt = async (page, sel) => ((await page.textContent(sel).catch(() => '')) || '').replace(/\s+/g, ' ').trim();
async function waitUntil(fn, ms = 20000, step = 250) { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) return v; await new Promise((r) => setTimeout(r, step)); } }
async function docs(page, coll) {
  return page.evaluate((c) => new Promise((r) => { const un = RT.db.collection(c).onSnapshot((s) => { un(); r(s.docs.map((d) => ({ id: d.id, ...d.data() }))); }); }), coll);
}
const BLANK = { es_factura: true, tipo_documento: 'factura', proveedor: '', rnc_proveedor: '', ncf: '', ncf_vence: '', fecha: '', itbis: '', total: '', total_corregido: '', tachados: [], moneda: 'DOP', concepto: '', proyecto: '', rnc_cliente: '104595114', referencia: '', conduces: '', conduce_numero: '', material: '', cantidad: '', viajes: '' };
const answers = [];

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const BASE = `http://127.0.0.1:${server.address().port}/facturas/`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const calls = [];
  await ctx.route('https://api.anthropic.com/**', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const body = JSON.parse(route.request().postData() || '{}');
    calls.push(body);
    const ans = answers.length ? answers.shift() : { ok: true };
    route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify({ id: 'msg', type: 'message', role: 'assistant', model: body.model, content: [{ type: 'text', text: JSON.stringify(ans) }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 10, output_tokens: 10 } }) });
  });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' && !/404|Failed to fetch|net::/.test(m.text())) problems.push('consola: ' + m.text()); });
  page.on('pageerror', (e) => problems.push('error de página: ' + e.message));
  await page.goto(BASE);
  await page.waitForSelector('.empty h2');
  await page.evaluate(async () => { const p = RT.db.collection('projects').doc(); await p.set({ name: 'Caperuza 2', createdAt: '2026-09-01T10:00:00.000Z' }); });
  await page.click('#settings-btn');
  await page.fill('#st-company', 'SUCRE B. LANTIGUA CONSTRUCTORA, S.R.L.');
  await page.fill('#st-rnc', '104595114');
  await page.fill('#st-key', 'sk-ant-prueba');
  await page.click('#settings-form button[type="submit"]');
  await page.waitForSelector('#settings-form', { state: 'detached' });
  await page.click('[data-act="backup-later"]').catch(() => {});
  const foto = path.join(OUT, 'factura.png');
  await page.screenshot({ path: foto });
  const upload = async (name, ans) => {
    answers.push({ ...BLANK, ...ans });
    const f = path.join(OUT, name);
    fs.copyFileSync(foto, f);
    await page.setInputFiles('#file-input', f);
    return waitUntil(async () => (await docs(page, 'invoices')).find((i) => i.fileName === name && i.ai === 'done'), 25000);
  };

  // 1) La lectura ve dos renglones tachados: se anotan y el total impreso queda aparte; queda para revisar.
  let a = await upload('ferreteria.png', { proveedor: 'Ferretería Ochoa', rnc_proveedor: '131023452', ncf: 'B0100000555', fecha: '2026-11-09', itbis: '900.00', total: '5,900.00', concepto: 'Materiales de plomería', proyecto: 'Caperuza 2', tachados: [{ descripcion: '2 codos PVC 1/2', monto: '350.00' }, { descripcion: 'Llave de paso 1/2', monto: '650.00' }] });
  const sent = calls[calls.length - 1];
  const prompt = JSON.stringify(sent.messages || '');
  check(/tachados a mano/.test(prompt) && /total_corregido/.test(prompt) && !!(sent.output_config && sent.output_config.format.schema.properties.tachados), 'la lectura pide los renglones tachados y el total corregido a mano');
  check(a && a.amount === 5900 && a.printedTotal === 5900 && a.struck.length === 2 && a.struck[1].amount === 650 && a.struckOk === false, 'se anotan los 2 tachados; el monto sigue en el impreso hasta revisarlo');
  await settle(page, 400);
  check(/Tiene tachados/.test(await txt(page, '#f-list')) && /revisar/i.test(await txt(page, '#todo')), 'la factura dice «Tiene tachados» y sale en «Para hacer» para revisar');
  await page.click(`#f-list [data-act="open-inv"][data-id="${a.id}"]`);
  await page.waitForSelector('#inv-tach[open]');
  const box = await txt(page, '#inv-tach');
  check(/2 codos PVC 1\/2/.test(box) && /Total impreso RD\$5,900\.00 − tachado RD\$1,000\.00 = RD\$4,900\.00/.test(box) && /RD\$4,720\.00/.test(box) && /revisa que el total a pagar/.test(box), 'en la factura: lo tachado, la cuenta (5,900 − 1,000 = 4,900) y con ITBIS (4,720)');
  await page.$eval('#inv-tach', (e) => e.scrollIntoView({ block: 'center' }));
  await settle(page, 600);
  await page.screenshot({ path: path.join(OUT, 'tachados.png') });
  await page.click('[data-act="tc-apply"] >> nth=0');
  await settle(page, 500);
  a = (await docs(page, 'invoices')).find((i) => i.id === a.id);
  check(a.amount === 4900 && a.struckOk === true && a.printedTotal === 5900 && a.hist.some((h) => h.what === 'Rebajada por artículos tachados') && (await page.inputValue('#f-amt').catch(() => '')) === '4900', 'con un toque queda a pagar RD$4,900 (el impreso se guarda) y lo anota en el historial');
  await page.fill('#tc-note', 'El plomero los cambió por codos de 3/4');
  await page.dispatchEvent('#tc-note', 'change');
  await settle(page, 400);
  check((await docs(page, 'invoices')).find((i) => i.id === a.id).struckNote === 'El plomero los cambió por codos de 3/4', 'se anota quién lo devolvió o cambió');
  await page.click('.sheet-h [data-act="sheet-close"]');
  await page.waitForSelector('#sheet-root', { state: 'hidden', timeout: 5000 }).catch(() => {});
  check(!(await page.isVisible('#sheet-root')), 'la factura se cierra sin pedir guardar (lo de los tachados se guarda solo)');

  // 2) Total corregido a mano: ese es el que se paga; queda para revisar.
  let b = await upload('corregida.png', { proveedor: 'Bloques del Cibao', rnc_proveedor: '131555777', ncf: 'B0100000666', fecha: '2026-11-09', itbis: '', total: '3,500.00', total_corregido: '3,200.00', proyecto: 'Caperuza 2' });
  check(b && b.amount === 3200 && b.printedTotal === 3500 && b.struckFixed === true && b.struckOk === false, 'con el total corregido a mano, se paga el corregido (3,200) y el impreso (3,500) queda aparte');
  await page.click(`#f-list [data-act="open-inv"][data-id="${b.id}"]`);
  await page.waitForSelector('#inv-tach[open]');
  check(/el impreso era RD\$3,500\.00 y el corregido es RD\$3,200\.00/.test(await txt(page, '#inv-tach')), 'la factura explica el total corregido a mano');
  await page.click('[data-act="tc-ok"]');
  await settle(page, 500);
  check((await docs(page, 'invoices')).find((i) => i.id === b.id).struckOk === true && /Monto revisado/.test(await txt(page, '#inv-tach')), '«El monto está bien» la quita de lo que hay que revisar');
  await page.click('.sheet-h [data-act="sheet-close"]');

  // 3) Sin lectura: se anotan a mano.
  let c = await upload('sin-tachar.png', { proveedor: 'Ferretería Ochoa', rnc_proveedor: '131023452', ncf: 'B0100000777', fecha: '2026-11-10', total: '2,000.00', proyecto: 'Caperuza 2' });
  check(c && !c.struck && c.amount === 2000, 'una factura sin tachados queda igual');
  await page.click(`#f-list [data-act="open-inv"][data-id="${c.id}"]`);
  await page.waitForSelector('#inv-tach');
  await page.click('#inv-tach summary');
  await page.fill('#tc-desc', 'Tubo PVC 1/2');
  await page.fill('#tc-amt', '300');
  await page.click('[data-act="tc-add"]');
  await settle(page, 500);
  c = (await docs(page, 'invoices')).find((i) => i.id === c.id);
  check(c.struck.length === 1 && c.struck[0].amount === 300 && c.printedTotal === 2000 && c.struckOk === false && /= RD\$1,700\.00/.test(await txt(page, '#inv-tach')), 'anotado a mano: guarda el impreso y propone RD$1,700');
  await page.click('[data-act="tc-rm"]');
  await settle(page, 500);
  c = (await docs(page, 'invoices')).find((i) => i.id === c.id);
  check(c.struck.length === 0 && !/achados/.test(await txt(page, '#f-list [data-id="' + c.id + '"]')), 'quitado el último, ya no lleva la etiqueta');

  console.log('problemas:', problems.length ? problems : 'ninguno');
  await browser.close();
  server.close();
  process.exit(problems.length ? 1 : 0);
})().catch((e) => { console.error(e); console.log('problemas:', problems); process.exit(1); });
