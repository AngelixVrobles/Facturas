// Conduces que llegan antes que su factura: el apartado Conduces, se adjuntan solos cuando suman lo mismo que la
// factura, en la factura se marcan varios a la vez, y la nube acepta la dirección del panel de Supabase.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = process.env.APP_ROOT || path.resolve(__dirname, '..');
const SP = process.env.PRUEBAS_TMP || path.join(require('os').tmpdir(), 'facturas-pruebas');
const OUT = path.join(SP, 'test-condapartado');
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
const settle = (page, ms = 500) => page.waitForTimeout(ms);
const txt = async (page, sel) => ((await page.textContent(sel)) || '').replace(/\s+/g, ' ').trim();
const groupsOf = (page) => page.$$eval('#c-list .group-h', (hs) => hs.map((h) => [h.querySelector('.gname').textContent.trim(), h.querySelector('.gmeta').textContent.trim()]));
const at = (hhmm) => new Date(`2026-11-06T${hhmm}:00-04:00`);

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const BASE = `http://127.0.0.1:${server.address().port}/facturas/`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, timezoneId: 'America/Santo_Domingo' });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(at('10:00'));
  page.on('console', (m) => { if (m.type() === 'error' && !/404|ERR_FAILED|Failed to load resource/.test(m.text())) problems.push('consola: ' + m.text()); });
  page.on('pageerror', (e) => problems.push('error de página: ' + e.message));
  await page.goto(BASE);
  await page.waitForSelector('.empty h2');
  const ids = await page.evaluate(async () => {
    await RT.db.doc('settings/general').set({ company: 'SUCRE B. LANTIGUA CONSTRUCTORA, S.R.L.', companyRnc: '104595114' });
    const p = RT.db.collection('projects').doc(); await p.set({ name: 'Caperuza 2', createdAt: '2026-09-01T10:00:00.000Z' });
    const base = { invoiceId: null, projectId: p.id, projectHint: '', currency: 'DOP', material: 'Grava', qty: '5 m³', trips: 1, fileId: null, fileType: 'image/jpeg', thumbId: null, pages: 1, fileName: 'conduce.jpg', ai: 'off', aiErr: '', auto: false };
    const out = {};
    const add = async (k, sup, rnc, number, date, total) => { const r = RT.db.collection('conduces').doc(); await r.set({ ...base, supplier: sup, rnc, number, date, total, createdAt: `${date}T12:30:00.000Z` }); out[k] = r.id; };
    await add('L1', 'Transporte y Agregados S. López', '130999998', '39801', '2026-11-02', 2000);
    await add('L2', 'Transporte y Agregados S. López', '130999998', '39802', '2026-11-03', 3000);
    await add('L3', 'Transporte y Agregados S. López', '130999998', '39803', '2026-11-04', 3000);
    await add('L4', 'Transporte y Agregados S. López', '130999998', '39804', '2026-11-06', 1500);
    await add('A1', 'Arena del Norte', '131222333', '501', '2026-11-02', 1000);
    await add('A2', 'Arena del Norte', '131222333', '502', '2026-11-03', 700);
    await add('A3', 'Arena del Norte', '131222333', '503', '2026-11-04', 1500);
    await add('B1', 'Bloques del Cibao', '131555777', '7001', '2026-11-05', 4720);
    out.p = p.id;
    return out;
  });
  await page.reload();
  await page.waitForSelector('.tabs [data-tab="conduces"]');
  await page.click('[data-act="backup-later"]').catch(() => {});

  // 1) El apartado Conduces.
  check((await page.$$('.tabs [data-tab]')).length === 7 && /Conduces/.test(await txt(page, '.tabs')), 'la barra de abajo tiene la pestaña Conduces');
  check(/8 conduces esperando su factura/.test(await txt(page, '#todo')), '«Para hacer»: 8 conduces esperando su factura');
  await page.click('#todo [data-act="cond-list"]');
  await page.waitForSelector('#c-list .cond-row');
  check((await page.textContent('#title')) === 'Conduces' && (await page.$eval('[data-act="cfilter"][data-f="esperando"]', (b) => b.getAttribute('aria-pressed'))) === 'true', '«Ver» abre la pestaña Conduces en «Esperando factura»');
  const seg = await txt(page, '#c-seg');
  check(/Sin factura\s*8/.test(seg) && /Con factura\s*0/.test(seg) && /Todos\s*8/.test(seg), 'cuenta: 8 esperando, 0 con factura');
  let gs = await groupsOf(page);
  console.log('     grupos:', JSON.stringify(gs));
  check(gs.length === 3 && gs.some(([n, m]) => /López/.test(n) && /^4 · RD\$9,500\.00$/.test(m)) && gs.some(([n, m]) => /Arena/.test(n) && /^3 · RD\$3,200\.00$/.test(m)), 'por proveedor, con lo que suman: López 4 · RD$9,500; Arena 3 · RD$3,200');
  check(/8 conduces · RD\$17,420\.00/.test(await txt(page, '#c-sum')), 'arriba, el total: 8 conduces · RD$17,420.00');
  check(/39803/.test(await txt(page, '#c-list')) && /Grava 5 m³/.test(await txt(page, '#c-list')), 'cada conduce con su número, fecha, material y cantidad');
  check(/Agregar conduces/.test(await txt(page, '#fab')) && !(await page.$eval('#fab', (b) => b.hidden)), 'el botón de abajo dice «Agregar conduces»');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null), page.click('#fab')]);
  check(!!chooser && (await chooser.element().evaluate((e) => e.id)) === 'cond-input', 'y abre para elegir las fotos de los conduces');
  await page.screenshot({ path: path.join(OUT, 'conduces.png') });
  await page.fill('#c-search', '39803');
  await settle(page, 300);
  check((await page.$$('#c-list .cond-row')).length === 1, 'la búsqueda encuentra por número de conduce');
  await page.fill('#c-search', '');
  await settle(page, 300);

  // 2) Llega la factura de López (RD$8,000, no dice los números): se le adjuntan los 3 más viejos, que suman eso.
  // El conduce de hoy (39804) se agrega al mismo tiempo que la factura: no es de ella, aunque se agregaron juntos.
  const invL = await page.evaluate(async ([pid, l4]) => {
    await RT.db.doc('conduces/' + l4).update({ createdAt: new Date().toISOString() });
    const r = RT.db.collection('invoices').doc();
    await r.set({ projectId: pid, supplier: 'Transporte y Agregados S. López', rnc: '130999998', number: 'B0100000901', date: '2026-11-05', amount: 8000, itbis: 0, currency: 'DOP', concept: '', ref: '', buyerRnc: '104595114', qrUrl: '', fiscal: '', notInvoice: false, noOrder: true, fileId: null, fileType: 'image/jpeg', thumbId: null, pages: 1, fileName: 'lopez.jpg', xmlId: null, ai: 'off', createdAt: new Date().toISOString() });
    return r.id;
  }, [ids.p, ids.L4]);
  await page.reload();
  await page.waitForSelector('.tabs [data-tab="conduces"]');
  for (let t = 0; t < 30; t++) { const cs = await docs(page, 'conduces'); if (cs.filter((c) => c.invoiceId === invL).length >= 3) break; await settle(page, 300); }
  let conds = await docs(page, 'conduces');
  const byId = (k) => conds.find((c) => c.id === ids[k]);
  check(['L1', 'L2', 'L3'].every((k) => byId(k).invoiceId === invL && byId(k).auto === true && byId(k).autoWhy === 'suma') && !byId('L4').invoiceId, 'la factura de RD$8,000: se le adjuntaron solos los 3 conduces que suman eso; el de hoy, aunque se agregó junto con ella, sigue esperando');
  check(!byId('A1').invoiceId && !byId('B1').invoiceId, 'los de otros proveedores no se tocan');
  await page.click('[data-tab="facturas"]');
  await page.click('[data-act="filter"][data-f="todas"]').catch(() => {});
  await page.click(`#f-list [data-act="open-inv"][data-id="${invL}"]`);
  await page.waitForSelector('#inv-conds');
  let box = await txt(page, '#inv-conds');
  check((await page.$$('#inv-conds .cond-list .cond-row')).length === 3 && /Los 3 conduces suman RD\$8,000\.00/.test(box) && /Los 3 conduces se adjuntaron solos: son de este proveedor y suman lo mismo que la factura/.test(box), 'en la factura: los 3 conduces, lo que suman y por qué se adjuntaron solos (un solo aviso)');
  check(/Hay un conduce esperando factura que puede ser de esta/.test(box) && /39804/.test(box), 'y sugiere el que quedó esperando');
  await settle(page, 400);
  await page.$eval('#inv-conds', (e) => e.scrollIntoView({ block: 'start' }));
  await page.screenshot({ path: path.join(OUT, 'factura-suma.png') });
  await page.click('.sheet-h [data-act="sheet-close"]');
  await page.waitForSelector('#sheet-root', { state: 'hidden' });

  // 3) La factura de Arena (RD$2,500) no cuadra con los más viejos: se marcan los que son y se adjuntan de una vez.
  await page.clock.setFixedTime(at('10:40'));
  const invA = await page.evaluate(async (pid) => {
    const r = RT.db.collection('invoices').doc();
    await r.set({ projectId: pid, supplier: 'Arena del Norte', rnc: '131222333', number: 'B0100000902', date: '2026-11-05', amount: 2500, itbis: 0, currency: 'DOP', concept: '', ref: '', buyerRnc: '104595114', qrUrl: '', fiscal: '', notInvoice: false, noOrder: true, fileId: null, fileType: 'image/jpeg', thumbId: null, pages: 1, fileName: 'arena.jpg', xmlId: null, ai: 'off', createdAt: new Date().toISOString() });
    return r.id;
  }, ids.p);
  await settle(page, 600);
  await page.click(`#f-list [data-act="open-inv"][data-id="${invA}"]`);
  await page.waitForSelector('#cpick');
  const items = await page.$$eval('#cpick input[data-cpick="c"]', (bs) => bs.map((b) => b.value));
  check(items.length === 3 && [ids.A1, ids.A2, ids.A3].every((x) => items.includes(x)) && !!(await page.$('#cpick input[data-cpick="all"]')), 'la factura muestra los 3 conduces de Arena con casillas (y «Todos»)');
  check(/Ninguno marcado · la factura: RD\$2,500\.00/.test(await txt(page, '#cpick-sum')) && await page.$eval('[data-act="cond-link-many"]', (b) => b.disabled), 'sin marcar: dice el monto de la factura y el botón espera');
  await page.check(`#cpick input[value="${ids.A1}"]`);
  await page.check(`#cpick input[value="${ids.A3}"]`);
  const s2 = await txt(page, '#cpick-sum');
  check(/2 marcados: RD\$2,500\.00 · suman lo mismo que la factura/.test(s2) && (await txt(page, '[data-act="cond-link-many"]')) === 'Adjuntar 2', 'al marcar 2: «2 marcados: RD$2,500.00 · suman lo mismo que la factura»');
  await page.$eval('#cpick', (e) => e.scrollIntoView({ block: 'center' }));
  await settle(page, 300);
  await page.screenshot({ path: path.join(OUT, 'marcar-varios.png') });
  await page.click('[data-act="cond-link-many"]');
  for (let t = 0; t < 20; t++) { const cs = await docs(page, 'conduces'); if (cs.filter((c) => c.invoiceId === invA).length === 2) break; await settle(page, 250); }
  conds = await docs(page, 'conduces');
  check(byId('A1').invoiceId === invA && byId('A3').invoiceId === invA && byId('A1').auto === false && !byId('A2').invoiceId, 'se adjuntaron los 2 marcados; el otro sigue esperando');
  await settle(page, 500);
  check((await page.$$('#inv-conds .cond-list .cond-row')).length === 2, 'la factura ya los muestra');
  await page.click('.sheet-h [data-act="sheet-close"]');
  await page.waitForSelector('#sheet-root', { state: 'hidden' });
  check(true, 'la hoja se cierra sin pedir guardar (marcar casillas no cuenta como cambio en la factura)');

  // 4) El apartado ya los muestra con su factura.
  await page.click('[data-tab="conduces"]');
  await page.waitForSelector('#c-list');
  const seg2 = await txt(page, '#c-seg');
  check(/Sin factura\s*3/.test(seg2) && /Con factura\s*5/.test(seg2), 'ahora: 3 esperando y 5 con factura');
  await page.click('[data-act="cfilter"][data-f="confactura"]');
  await settle(page, 300);
  const cl = await txt(page, '#c-list');
  check(/Factura B0100000901/.test(cl) && /Factura B0100000902/.test(cl) && (await page.$$('#c-list .cond-row')).length === 5, '«Con factura»: cada conduce dice de qué factura es');
  await page.screenshot({ path: path.join(OUT, 'con-factura.png') });
  await page.click('[data-act="cfilter"][data-f="esperando"]');
  await settle(page, 300);
  gs = await groupsOf(page);
  check(gs.length === 3 && gs.some(([n, m]) => /López/.test(n) && /^1 · RD\$1,500\.00$/.test(m)), '«Esperando factura»: López ya solo tiene el de RD$1,500');

  // 5) La nube acepta la dirección del panel de Supabase y busca la del proyecto.
  let asked = '';
  await ctx.route('https://abcdefghijklmnopqrst.supabase.co/**', (route) => { asked = route.request().url(); route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error_description: 'Invalid login credentials' }) }); });
  await page.click('#settings-btn');
  await page.waitForSelector('#nb-code');
  await page.fill('#nb-code', 'https://supabase.com/dashboard/project/abcdefghijklmnopqrst');
  await page.fill('#nb-key', 'sb_publishable_prueba');
  await page.fill('#nb-email', 'yo@sucre.do');
  await page.fill('#nb-pass', 'clave-mal');
  await page.click('[data-act="nube-connect"]');
  await page.waitForFunction(() => { const t = document.querySelector('#nb-msg')?.textContent || ''; return t.length > 5 && !/Conectando/.test(t); }, null, { timeout: 10000 }).catch(() => {});
  check(/^https:\/\/abcdefghijklmnopqrst\.supabase\.co\/auth\/v1\/token/.test(asked) && /no son correctos/.test(await txt(page, '#nb-msg')), 'con la dirección del panel, la app llama a la del proyecto (' + (asked || 'no llamó') + ')');

  // 6) El código que el teléfono cambió al pegarlo (minúsculas, saltos de línea) igual sirve; uno dañado o una URL que no es, lo dice claro.
  const goodCode = 'FACTURAS-NUBE:' + Buffer.from(JSON.stringify({ url: 'https://abcdefghijklmnopqrst.supabase.co', key: 'sb_publishable_prueba' })).toString('base64');
  const mangled = goodCode.replace('FACTURAS-NUBE:', 'facturas-nube: ').replace(/^(.{40})/, '$1\n');
  asked = '';
  await page.fill('#nb-code', mangled);
  await page.fill('#nb-key', '');
  await page.click('[data-act="nube-connect"]');
  await page.waitForFunction(() => { const t = document.querySelector('#nb-msg')?.textContent || ''; return t.length > 5 && !/Conectando/.test(t); }, null, { timeout: 10000 }).catch(() => {});
  check(/^https:\/\/abcdefghijklmnopqrst\.supabase\.co\/auth\/v1\/token/.test(asked) && /no son correctos/.test(await txt(page, '#nb-msg')), 'el código pegado en minúsculas y partido en dos líneas igual se entiende');
  asked = '';
  await page.fill('#nb-code', 'facturas-nube:eyJ1cmwiOiJodHRwczovL3Z3Y3N1a3Zq');
  await page.click('[data-act="nube-connect"]');
  await settle(page, 300);
  check(!asked && /El código se dañó al pegarlo/.test(await txt(page, '#nb-msg')), 'un código dañado: lo dice y explica qué hacer (sin intentar conectar)');
  await page.fill('#nb-code', 'hola esto no es');
  await page.fill('#nb-key', 'sb_publishable_prueba');
  await page.click('[data-act="nube-connect"]');
  await settle(page, 300);
  check(!asked && /Eso no parece la URL del proyecto/.test(await txt(page, '#nb-msg')), 'algo que no es la URL del proyecto: lo dice');

  console.log('problemas:', problems.length ? problems : 'ninguno');
  await browser.close();
  server.close();
  process.exit(problems.length ? 1 : 0);
})().catch((e) => { console.error(e); console.log('problemas:', problems); process.exit(1); });
