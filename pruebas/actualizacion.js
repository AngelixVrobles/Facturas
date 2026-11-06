// Actualización sola: se publica una versión nueva (copia de la app con otro número) y se comprueba que
// (A) se instala sola al volver a la app y (B) no se instala mientras hay una hoja abierta con datos; al cerrarla, sí.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const REPO = process.env.APP_ROOT || path.resolve(__dirname, '..');
const SP = process.env.PRUEBAS_TMP || path.join(require('os').tmpdir(), 'facturas-pruebas');
const ROOT = path.join(SP, 'autoupd-' + Date.now());
fs.cpSync(REPO, ROOT, { recursive: true, filter: (src) => !src.includes('/.git') });
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const file = path.join(ROOT, decodeURIComponent(u.pathname.replace(/^\/facturas\//, '')) || 'index.html');
  if (!u.pathname.startsWith('/facturas/') || !file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
  res.end(fs.readFileSync(file));
});
const problems = [];
const check = (cond, msg) => { console.log((cond ? 'OK   ' : 'FALLA') + ' ' + msg); if (!cond) problems.push(msg); };
function publish(n, appVersion) {
  const sw = path.join(ROOT, 'sw.js'), app = path.join(ROOT, 'js/app.js');
  fs.writeFileSync(sw, fs.readFileSync(sw, 'utf8').replace(/const VERSION = '[^']+';/, `const VERSION = 'facturas-prueba-${n}';`));
  fs.writeFileSync(app, fs.readFileSync(app, 'utf8').replace(/const APP_VERSION = '[^']+';/, `const APP_VERSION = '${appVersion}';`));
}
const backToApp = (page) => page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const BASE = `http://127.0.0.1:${server.address().port}/facturas/`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push('error de página: ' + e.message));
  await page.goto(BASE);
  await page.waitForSelector('.empty h2');
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 30000 });
  check(true, 'la app queda instalada para funcionar sin internet');

  // A) versión nueva publicada; el usuario vuelve a la app sin nada abierto → se instala sola
  publish(2, '9.9.8');
  await page.evaluate(() => { window.__antes = 1; });
  await backToApp(page);
  await page.waitForFunction(() => /se actualizó sola \(versión 9\.9\.8\)/.test(document.querySelector('#toast')?.textContent || ''), null, { timeout: 30000 });
  check(await page.evaluate(() => !window.__antes), 'A) al volver a la app con una versión nueva, se instaló sola y avisó «La app se actualizó sola (versión 9.9.8)»');

  // B) versión nueva mientras se llena una orden → no se instala; al cerrar la hoja, sí
  await page.click('[data-tab="ordenes"]');
  await page.click('#o-new');
  await page.waitForSelector('#order-form');
  await page.fill('#o-by', 'Ing. Ramón Peña');
  publish(3, '9.9.9');
  await page.evaluate(() => { window.__antes = 1; });
  await backToApp(page);
  await page.waitForTimeout(5000);
  const still = await page.evaluate(() => ({ marker: window.__antes === 1, by: document.querySelector('#o-by') && document.querySelector('#o-by').value }));
  check(still.marker && still.by === 'Ing. Ramón Peña', 'B) con la orden a medio llenar no se actualiza (no se pierde lo escrito)');
  await page.click('.sheet-h [data-act="sheet-close"]');
  await page.waitForFunction(() => /se actualizó sola \(versión 9\.9\.9\)/.test(document.querySelector('#toast')?.textContent || ''), null, { timeout: 30000 });
  check(await page.evaluate(() => !window.__antes), 'B) al cerrar la hoja se instaló sola (versión 9.9.9)');
  await page.click('#settings-btn');
  const about = await page.textContent('#settings-form');
  check(/Versión 9\.9\.9\. Se actualiza sola\./.test(about) && /© 2026 AngelixVrobles\. Uso gratuito/.test(about), 'Ajustes muestra la versión y la licencia');

  console.log('problemas:', problems.length ? problems : 'ninguno');
  await browser.close();
  server.close();
  process.exit(problems.length ? 1 : 0);
})().catch((e) => { console.error('FALLO', e); process.exit(2); });
