// Transporte de material: una orden de 10 m³ lleva 2 conduces de 5 m³ (y una de 5 m³, uno); con todos queda «Completa» y solo le falta la factura, que llega al final. La ferretería entrega el conduce con su factura.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = process.env.APP_ROOT || path.resolve(__dirname, '..');
const SP = process.env.PRUEBAS_TMP || path.join(require('os').tmpdir(), 'facturas-pruebas');
const OUT = path.join(SP, 'test-viajes');
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
const condsBy = async (page) => { const l = await docs(page, 'conduces'); return (n) => l.find((c) => c.number === n); };

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const BASE = `http://127.0.0.1:${server.address().port}/facturas/`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' && !/404|Failed to fetch|net::/.test(m.text())) problems.push('consola: ' + m.text()); });
  page.on('pageerror', (e) => problems.push('error de página: ' + e.message));
  await page.goto(BASE);
  await page.waitForSelector('.empty h2');
  // S. López con varias órdenes abiertas a la vez (cada una de 10 m³) y sus conduces de 5 m³, todavía sin enlazar.
  const I = await page.evaluate(async () => {
    const db = RT.db;
    await db.doc('settings/general').set({ company: 'SUCRE B. LANTIGUA CONSTRUCTORA, S.R.L.', preparedBy: 'A. Robles' });
    const e = db.collection('projects').doc(); await e.set({ name: 'ENZO', createdAt: '2026-09-01T10:00:00.000Z' });
    const sup = 'Transporte y Agregados S. López';
    const ord = async (number, date, items) => { const r = db.collection('orders').doc(); await r.set({ number, date, projectId: e.id, supplier: sup, requestedBy: 'Ing. Peña', items, status: 'autorizada', signedAt: date, createdAt: date + 'T08:00:00.000Z' }); return r.id; };
    const o = {
      c39: await ord(39, '2026-11-16', [{ qty: 10, unit: 'm³', desc: 'Caliche amarillo' }]),
      c43: await ord(43, '2026-11-16', [{ qty: 10, unit: 'm³', desc: 'Caliche amarillo' }]),
      c51: await ord(51, '2026-11-18', [{ qty: 10, unit: 'm³', desc: 'Caliche amarillo' }]),
      r35: await ord(35, '2026-11-14', [{ qty: 10, unit: 'm³', desc: 'Relleno' }]),
      t37: await ord(37, '2026-11-13', [{ qty: 2, unit: 'Viaje', desc: 'Tierra negra 5 m³' }]),
    };
    const base = { invoiceId: null, projectId: e.id, projectHint: '', supplier: sup, rnc: '', currency: 'DOP', fileId: null, fileType: 'image/jpeg', thumbId: null, pages: 1, ai: 'off', aiErr: '', auto: false, qty: '', trips: 1, total: null };
    for (const [number, date, material] of [['39767', '2026-11-14', 'Relleno 5 MT'], ['39764', '2026-11-14', 'Relleno Amarillo 5 mt'], ['39925', '2026-11-13', 'Tierra negra 5 m³'],
      ['39449', '2026-11-16', 'Caliche Amarillo 5 MT'], ['39934', '2026-11-16', 'Caliche Amarillo 5 MT'], ['39935', '2026-11-16', 'Caliche Amarillo 5 MT'], ['39945', '2026-11-17', 'Caliche Amarillo 5 MT'],
      ['40062', '2026-11-18', 'Caliche Amarillo 5 MT'], ['40102', '2026-11-18', 'Caliche amarillo 5 m³'], ['40200', '2026-11-18', 'Caliche amarillo 5 m³'], ['39807', '2026-11-04', 'Grava 5 m³']]) {
      await db.collection('conduces').doc().set({ ...base, number, date, material, createdAt: date + 'T12:00:00.000Z' });
    }
    return o;
  });
  await page.reload();
  await page.click('[data-act="backup-later"]').catch(() => {});

  // 1) Cada orden de 10 m³ se queda con 2 conduces de 5 m³, aunque haya varias abiertas del mismo proveedor.
  await waitUntil(async () => (await docs(page, 'conduces')).filter((c) => c.orderId).length >= 9, 15000);
  const cs = await docs(page, 'conduces');
  const per = (id) => cs.filter((c) => c.orderId === id).map((c) => c.number).sort();
  console.log('     reparto:', JSON.stringify({ c39: per(I.c39), c43: per(I.c43), c51: per(I.c51), r35: per(I.r35), t37: per(I.t37) }));
  check(per(I.c39).length === 2 && per(I.c43).length === 2 && per(I.c51).length === 2, 'cada orden de caliche (10 m³) se queda con 2 conduces de 5 m³');
  check(per(I.c51).join() === '40062,40102', 'los conduces del 18 van a la orden del 18 (las del 16 ya estaban completas)');
  check(per(I.c39).concat(per(I.c43)).sort().join() === '39449,39934,39935,39945', 'los del 16 y el 17 se reparten entre las dos órdenes del 16');
  check(per(I.r35).join() === '39764,39767' && per(I.t37).join() === '39925', 'el relleno va a la orden de relleno y la tierra a la de tierra (no se mezclan materiales)');
  const c = await condsBy(page);
  check(!c('40200').orderId, 'un conduce de más (todas las de caliche ya están completas) no se enlaza solo');
  check(!c('39807').orderId, 'la grava (sin orden de grava) no se enlaza a otra orden');
  check(['reciente', 'libre'].includes(c('39935').orderWhy) && ['reciente', 'libre'].includes(c('40062').orderWhy) && c('39767').orderWhy === 'unica', 'cada enlace dice por qué');

  // 2) Las órdenes dicen cuánto llegó.
  await page.evaluate(() => document.querySelector('.tabs [data-tab="ordenes"]').click());
  await page.click('#o-seg [data-f="transporte"]');
  await settle(page, 400);
  const list = await txt(page, '#o-list');
  console.log('     con conduce:', list.slice(0, 500));
  check(/Transporte de material: entrega solo conduces, uno por viaje \(una orden de 10 m³ son 2 conduces de 5 m³; una de 5 m³, 1 conduce\), y la factura llega al final, con el pago/.test(list), 'la pestaña «Transporte» explica que cada viaje es un conduce y la factura llega al final');
  check((list.match(/Completa\s*Falta la factura/g) || []).length === 4 && (list.match(/2 de 2 conduces \(10 de 10 m³\) · falta la factura \(llega con el pago\)/g) || []).length === 4, 'las órdenes con sus 2 conduces salen «Completa» y «Falta la factura»');
  check(/OC-0037[^]*?Falta 1 conduce[^]*?1 de 2 conduces \(5 de 10 m³\) · la factura llega con el pago/.test(list), 'la de tierra negra (2 viajes de 5 m³) dice «Falta 1 conduce» y «1 de 2 conduces»');
  check(/5\s+órdenes · 9\s+conduces · 4\s+completas · 1\s+a\s+medias/.test(list), 'el proveedor dice cuántas están completas y cuántas a medias');
  await page.screenshot({ path: path.join(OUT, 'ordenes.png') });
  await page.click(`#o-list [data-act="open-order"][data-id="${I.t37}"]`);
  await page.waitForSelector('#o-conds');
  check(/Llegaron 1 de 2 conduces \(5 de 10 m³\): falta 1 conduce\. Esta orden lleva 2 conduces \(uno por viaje\)/.test(await txt(page, '#o-conds')), 'en la orden: «Llegaron 1 de 2 conduces (5 de 10 m³): falta 1 conduce»');
  await page.click('.sheet-h [data-act="sheet-close"]');
  await page.click(`#o-list [data-act="open-order"][data-id="${I.c51}"]`);
  await page.waitForSelector('#o-conds');
  check(/Completa: 2 de 2 conduces \(10 de 10 m³\)\. Solo le falta la factura, que llega al final, con el pago\./.test(await txt(page, '#o-conds')), 'en la orden completa: «Completa … Solo le falta la factura»');
  await page.click('.sheet-h [data-act="sheet-close"]');

  // 3) «Para hacer» avisa la que quedó a medias.
  await page.evaluate(() => document.querySelector('.tabs [data-tab="facturas"]').click());
  await settle(page, 300);
  await page.click('[data-act="todo-all"]').catch(() => {});
  await settle(page, 200);
  check(/1\s*orden con conduce quedó a medias: OC-0037 \(1 de 2 conduces\)\. Falta material o subir un conduce/.test(await txt(page, '#todo')), '«Para hacer» avisa la orden que quedó a medias');

  // 4) El conduce de más: las órdenes dicen cuánto llevan; al ponerlo a mano, la orden avisa que llegó de más.
  await page.evaluate(() => document.querySelector('.tabs [data-tab="conduces"]').click());
  await page.click('#c-seg [data-f="todos"]');
  await page.click(`#c-list [data-act="open-cond"][data-id="${c('40200').id}"]`);
  await page.waitForSelector('#c-ord');
  const opts = await page.$$eval('#c-ord option', (l) => l.map((x) => x.textContent));
  check(opts.some((t) => /OC-0051 .*tiene 2 de 2 conduces/.test(t)), 'al escoger la orden, cada una dice cuántos conduces tiene');
  await page.selectOption('#c-ord', I.c51);
  await page.click('#cond-save');
  await page.waitForSelector('#cond-form', { state: 'detached' });
  await waitUntil(async () => (await condsBy(page))('40200').orderId === I.c51, 5000);
  await page.evaluate(() => document.querySelector('.tabs [data-tab="ordenes"]').click());
  await page.click('#o-seg [data-f="transporte"]');
  await settle(page, 400);
  check(/OC-0051[^]*?Llegó de más[^]*?3 de 2 conduces \(15 de 10 m³\) · la factura llega con el pago/.test(await txt(page, '#o-list')), 'con 3 conduces la orden de 10 m³ dice «Llegó de más» y «3 de 2 conduces»');
  await page.click(`#o-list [data-act="open-order"][data-id="${I.c51}"]`);
  await page.waitForSelector('#o-conds');
  check(/Los conduces traen 15 m³ de Caliche amarillo y la orden pidió 10/.test(await txt(page, '.sheet')), 'y en la orden avisa: «Los conduces traen 15 m³ … y la orden pidió 10» (cuenta los metros del material)');
  await page.click('.sheet-h [data-act="sheet-close"]');

  // 5) Desde la orden: «Enlazar un conduce» ya trae marcado el que falta (mismo proveedor, material y fecha).
  const pid = (await docs(page, 'orders')).find((x) => x.id === I.t37).projectId;
  const cbase = { invoiceId: null, projectId: pid, projectHint: '', supplier: 'Transporte y Agregados S. López', rnc: '', currency: 'DOP', fileId: null, fileType: 'image/jpeg', thumbId: null, pages: 1, ai: 'off', aiErr: '', auto: false, qty: '', trips: 1, total: null };
  await page.evaluate(async (b) => { await RT.db.collection('conduces').doc().set({ ...b, number: '40300', date: '2026-11-13', material: 'Tierra negra 5 MT', noOrderAuto: true, createdAt: '2026-11-13T15:00:00.000Z' }); }, cbase);
  await settle(page, 500);
  await page.click(`#o-list [data-act="open-order"][data-id="${I.t37}"]`);
  await page.waitForSelector('[data-act="order-link-cond-open"]');
  await page.click('[data-act="order-link-cond-open"]');
  await page.waitForSelector('#o-cond-box input[data-cpk]');
  const box = await txt(page, '#o-cond-box');
  console.log('     enlazar:', box.slice(0, 260));
  const checked = await page.$$eval('#o-cond-box input[data-cpk]:checked', (l) => l.map((x) => x.closest('label').textContent));
  check(/Esta orden de 10 m³ lleva 2 conduces \(uno por viaje\) y tiene 1\. Ya está marcado el que más tiene que ver/.test(box) && checked.length === 1 && /40300/.test(checked[0]), 'al enlazar desde la orden, ya viene marcado el conduce que falta (el 40300)');
  check(!checked.some((t) => /39807|40200/.test(t)), 'la grava y el caliche no salen marcados');
  await page.click('[data-act="order-link-conds"]');
  await waitUntil(async () => (await condsBy(page))('40300').orderId === I.t37, 5000);
  check((await condsBy(page))('40300').orderId === I.t37, '«Enlazar los marcados» lo enlaza');
  await waitUntil(async () => /Completa: 2 de 2 conduces \(10 de 10 m³\)/.test(await txt(page, '.sheet')), 5000);
  check(/Completa: 2 de 2 conduces \(10 de 10 m³\)/.test(await txt(page, '.sheet')), 'y la orden queda completa');
  await page.click('.sheet-h [data-act="sheet-close"]');

  // 6) Desde el conduce: al ponerle a mano una orden de 10 m³, propone el otro conduce que tiene que ver.
  const o60 = await page.evaluate(async (b) => {
    const db = RT.db;
    const r = db.collection('orders').doc(); await r.set({ number: 60, date: '2026-11-20', projectId: b.projectId, supplier: b.supplier, requestedBy: 'Ing. Peña', items: [{ qty: 10, unit: 'm³', desc: 'Relleno' }], status: 'autorizada', signedAt: '2026-11-20', createdAt: '2026-11-20T08:00:00.000Z' });
    for (const n of ['40400', '40401']) await db.collection('conduces').doc().set({ ...b, number: n, date: '2026-11-20', material: 'Relleno 5 MT', noOrderAuto: true, createdAt: '2026-11-20T15:00:00.000Z' });
    return r.id;
  }, cbase);
  await page.evaluate(() => document.querySelector('.tabs [data-tab="conduces"]').click());
  await page.click('#c-seg [data-f="todos"]');
  await settle(page, 400);
  await page.click(`#c-list [data-act="open-cond"][data-id="${(await condsBy(page))('40400').id}"]`);
  await page.waitForSelector('#c-ord');
  await page.selectOption('#c-ord', o60);
  await page.click('#cond-save');
  await page.waitForSelector('#cond-form', { state: 'detached' });
  await page.waitForFunction(() => /¿Enlazar también/.test(document.querySelector('#toast').textContent), null, { timeout: 8000 }).catch(() => {});
  check(/OC-0060 lleva 2 conduces y tiene 1\. ¿Enlazar también el 40401\?/.test(await txt(page, '#toast')), 'al enlazar uno a mano, propone el otro: «OC-0060 lleva 2 conduces y tiene 1. ¿Enlazar también el 40401?»');
  await page.click('#toast .toast-act');
  await waitUntil(async () => (await condsBy(page))('40401').orderId === o60, 5000);
  check((await condsBy(page))('40401').orderId === o60, '«Enlazar» le pone la orden al otro conduce');

  // 7) La factura: antes de pagar, avisa si a su orden le falta un conduce.
  const inv = await page.evaluate(async (b) => {
    const db = RT.db;
    const r = db.collection('orders').doc(); await r.set({ number: 70, date: '2026-11-21', projectId: b.projectId, supplier: b.supplier, requestedBy: 'Ing. Peña', items: [{ qty: 10, unit: 'm³', desc: 'Tierra negra' }], status: 'autorizada', signedAt: '2026-11-21', createdAt: '2026-11-21T08:00:00.000Z' });
    await db.collection('conduces').doc().set({ ...b, number: '40500', date: '2026-11-21', material: 'Tierra negra 5 m³', total: 4000, createdAt: '2026-11-21T15:00:00.000Z' });
    const f = db.collection('invoices').doc(); await f.set({ projectId: b.projectId, supplier: b.supplier, rnc: '', number: 'B0100000777', date: '2026-11-22', amount: 4000, itbis: 0, currency: 'DOP', concept: 'Transporte', ref: '', buyerRnc: '', notInvoice: false, fileId: null, ai: 'off', conduceRefs: ['40500'], createdAt: new Date().toISOString() });
    return { o70: r.id, f: f.id };
  }, cbase);
  await page.reload();
  await waitUntil(async () => { const f = (await docs(page, 'invoices')).find((x) => x.id === inv.f); return f && f.orderId; }, 15000);
  const f = (await docs(page, 'invoices')).find((x) => x.id === inv.f);
  check(f.orderId === inv.o70 && (await condsBy(page))('40500').orderId === inv.o70, 'la factura toma la orden de su conduce (OC-0070)');
  await page.evaluate(() => document.querySelector('.tabs [data-tab="facturas"]').click());
  await page.click('#f-seg [data-f="todas"]').catch(() => {});
  await page.waitForSelector(`#f-list [data-act="open-inv"][data-id="${inv.f}"]`);
  await page.click(`#f-list [data-act="open-inv"][data-id="${inv.f}"]`);
  await page.waitForSelector('#inv-form');
  await settle(page, 400);
  check(/La orden OC-0070 tiene 1 de 2 conduces \(5 de 10 m³\): falta 1 conduce\. Antes de pagar, sube y enlaza el conduce que falta\./.test(await txt(page, '.sheet')), 'la factura avisa: «La orden OC-0070 tiene 1 de 2 conduces … Antes de pagar, sube y enlaza el conduce que falta»');
  await page.click('.sheet-h [data-act="sheet-close"]');

  // 8) En la computadora, la tabla de órdenes dice cuántos conduces tiene cada una.
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.evaluate(() => document.querySelector('[data-act="tab"][data-tab="ordenes"]').click());
  await page.click('#o-seg [data-f="todas"]');
  await settle(page, 500);
  check(/Completa\s*2 de 2 conduces · falta la factura/.test(await txt(page, `#o-list tr[data-id="${I.t37}"]`)), 'en la computadora, la tabla dice «Completa · 2 de 2 conduces · falta la factura»');
  await page.screenshot({ path: path.join(OUT, 'pc.png') });

  // 9) Una orden de 5 m³ queda completa con un solo conduce.
  await page.setViewportSize({ width: 390, height: 844 });
  const extra = await page.evaluate(async (b) => {
    const db = RT.db;
    const r = db.collection('orders').doc(); await r.set({ number: 80, date: '2026-11-22', projectId: b.projectId, supplier: b.supplier, requestedBy: 'Ing. Peña', items: [{ qty: 5, unit: 'm³', desc: 'Relleno' }], status: 'autorizada', signedAt: '2026-11-22', createdAt: '2026-11-22T08:00:00.000Z' });
    await db.collection('conduces').doc().set({ ...b, number: '40600', date: '2026-11-22', material: 'Relleno 5 MT', createdAt: '2026-11-22T15:00:00.000Z' });
    // La ferretería: su conduce viene con la factura; si la factura no llegó, falta.
    const g = db.collection('orders').doc(); await g.set({ number: 90, date: '2026-11-22', projectId: b.projectId, supplier: 'Ferretería Gama', requestedBy: 'Ing. Peña', items: [{ qty: 20, unit: 'Funda', desc: 'Cemento gris' }], status: 'autorizada', signedAt: '2026-11-22', createdAt: '2026-11-22T08:00:00.000Z' });
    await db.collection('conduces').doc().set({ ...b, supplier: 'Ferretería Gama', number: '501', date: '2026-11-22', material: 'Cemento gris 20 fundas', createdAt: '2026-11-22T16:00:00.000Z' });
    return { o80: r.id, o90: g.id };
  }, cbase);
  await page.reload();
  await waitUntil(async () => (await condsBy(page))('40600').orderId === extra.o80 && (await condsBy(page))('501').orderId === extra.o90, 15000);
  check((await condsBy(page))('40600').orderId === extra.o80 && (await condsBy(page))('501').orderId === extra.o90, 'cada conduce se enlaza a su orden (el de 5 m³ y el de la ferretería)');
  await page.evaluate(() => document.querySelector('.tabs [data-tab="ordenes"]').click());
  await page.click('#o-seg [data-f="transporte"]');
  await settle(page, 400);
  const tr2 = await txt(page, '#o-list');
  check(/OC-0080\s*Firmada\s*Completa\s*Falta la factura[^]*?1 de 1 conduce \(5 de 5 m³\) · falta la factura \(llega con el pago\)/.test(tr2), 'la orden de 5 m³ sale «Completa» con un solo conduce (y «Falta la factura»)');
  check(!/OC-0090/.test(tr2), 'la de la ferretería no está en «Transporte»');
  await page.click('#o-seg [data-f="sinfactura"]');
  await settle(page, 400);
  const sinf = await txt(page, '#o-list');
  check(/OC-0090\s*Firmada\s*Con conduce[^]*?sin factura/.test(sinf) && !/OC-00(35|37|39|43|51|60|80)/.test(sinf), '«Sin factura» tiene la de la ferretería (llegó el conduce, falta su factura) y ninguna de transporte');
  await page.click(`#o-list [data-act="open-order"][data-id="${extra.o90}"]`);
  await page.waitForSelector('#o-conds');
  check(/Este proveedor entrega el conduce con su factura\.\s*Es transporte de material/.test(await txt(page, '#o-conds')) && !/de 1 conduce|de 2 conduces/.test(await txt(page, '#o-conds')), 'en la orden de la ferretería no se cuentan viajes: dice que el conduce viene con su factura');
  // Si un proveedor sí es de transporte, se marca desde la orden.
  await page.click('[data-act="sup-transport"]');
  await waitUntil(async () => ((await docs(page, 'suppliers')).find((x) => /Gama/.test(x.name)) || {}).transport === true, 5000);
  check(((await docs(page, 'suppliers')).find((x) => /Gama/.test(x.name)) || {}).transport === true, '«Es transporte de material» lo guarda en la ficha del proveedor');
  await page.click('.sheet-h [data-act="sheet-close"]');
  await page.click('#o-seg [data-f="transporte"]');
  await settle(page, 400);
  check(/OC-0090/.test(await txt(page, '#o-list')), 'y la orden pasa a «Transporte»');
  await page.click(`#o-list [data-act="open-order"][data-id="${extra.o90}"]`);
  await page.waitForSelector('[data-act="sup-transport"]');
  await page.click('[data-act="sup-transport"]');
  await waitUntil(async () => ((await docs(page, 'suppliers')).find((x) => /Gama/.test(x.name)) || {}).transport === false, 5000);
  await page.click('.sheet-h [data-act="sheet-close"]');
  await page.click('#o-seg [data-f="sinfactura"]');
  await settle(page, 400);
  check(/OC-0090/.test(await txt(page, '#o-list')), '«No es transporte» la devuelve a «Sin factura»');
  await page.evaluate(() => document.querySelector('.tabs [data-tab="facturas"]').click());
  await settle(page, 300);
  await page.click('[data-act="todo-all"]').catch(() => {});
  await settle(page, 200);
  check(/1\s*orden sin factura/.test(await txt(page, '#todo')), '«Para hacer» cuenta como faltante solo la factura de la ferretería');
  await page.screenshot({ path: path.join(OUT, 'transporte.png') });

  console.log('problemas:', problems.length ? problems : 'ninguno');
  await browser.close();
  server.close();
  process.exit(problems.length ? 1 : 0);
})().catch((e) => { console.error(e); console.log('problemas:', problems); process.exit(1); });
