// El generador de QR propio: se dibuja cada código y se lee con jsQR (el mismo lector que usa la app).
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const ROOT = process.env.APP_ROOT || path.resolve(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const file = path.join(ROOT, decodeURIComponent(u.pathname.replace(/^\/facturas\//, '')) || 'index.html');
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' }); res.end(fs.readFileSync(file));
});
(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/facturas/`);
  await page.addScriptTag({ url: 'vendor/jsQR.min.js' });
  await page.addScriptTag({ url: 'js/qr.js' });
  const res = await page.evaluate(() => {
    const out = [];
    const texts = ['A', 'OC1:0123456789abcdef0123:1', 'OC1:a1b2c3d4e5f60718293a:4580', 'Orden de compra OC-0012 · Caperuza 2 · ñandú', 'x'.repeat(60), 'y'.repeat(85), 'z'.repeat(106)];
    for (const t of texts) {
      const q = window.QR.encode(t);
      for (const px of [4, 2]) {
        const quiet = 4, n = q.size + quiet * 2;
        const c = document.createElement('canvas'); c.width = c.height = n * px;
        const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = '#000';
        for (let r = 0; r < q.size; r++) for (let k = 0; k < q.size; k++) if (q.isDark(r, k)) g.fillRect((k + quiet) * px, (r + quiet) * px, px, px);
        const img = g.getImageData(0, 0, c.width, c.height);
        const d = window.jsQR(img.data, c.width, c.height);
        out.push({ len: t.length, v: q.version, px, ok: !!d && d.data === t, got: d ? d.data.slice(0, 30) : null });
      }
    }
    let tooLong = false; try { window.QR.encode('w'.repeat(107)); } catch (e) { tooLong = true; }
    return { out, tooLong };
  });
  let bad = 0;
  for (const r of res.out) { if (!r.ok) bad++; console.log(`${r.ok ? 'OK   ' : 'FALLA'} ${String(r.len).padStart(3)} caracteres · versión ${r.v} · ${r.px} px por módulo${r.ok ? '' : ' → leyó: ' + r.got}`); }
  console.log((res.tooLong ? 'OK   ' : 'FALLA') + ' un texto de 107 caracteres se rechaza (máximo de la versión 6)');
  console.log(bad || !res.tooLong ? 'HAY FALLAS' : 'todo bien');
  await browser.close(); server.close();
})().catch((e) => { console.error('FALLO', e); process.exit(2); });
