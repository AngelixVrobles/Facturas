// Corre las pruebas de la app (con datos inventados) y dice cuáles pasaron.
// Uso: node pruebas/correr.js            (todas)
//      node pruebas/correr.js conduces.js abonos.js
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = process.env.PRUEBAS_TMP || path.join(os.tmpdir(), 'facturas-pruebas');
fs.mkdirSync(TMP, { recursive: true });
execFileSync('python3', [path.join(__dirname, 'muestras.py'), path.join(TMP, 'muestras-conduce')], { stdio: 'inherit' });

const pedidas = process.argv.slice(2);
const lista = pedidas.length ? pedidas : fs.readdirSync(__dirname).filter((f) => f.endsWith('.js') && f !== 'correr.js').sort();
let mal = 0, total = 0;
for (const f of lista) {
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], { encoding: 'utf8', env: { ...process.env, PRUEBAS_TMP: TMP }, timeout: 600000 });
  const out = (r.stdout || '') + (r.stderr || '');
  const ok = (out.match(/^OK/gm) || []).length;
  const fallas = out.match(/^FALLA.*$/gm) || [];
  const bien = r.status === 0 && !fallas.length;
  total += ok;
  if (!bien) mal++;
  console.log(`${bien ? 'bien' : 'MAL '}  ${f.padEnd(32)} ${String(ok).padStart(3)} revisiones`);
  if (!bien) console.log('      ' + (fallas.length ? fallas : out.trim().split('\n').slice(-6)).join('\n      '));
}
console.log(mal ? `\n${mal} de ${lista.length} con fallas.` : `\nTodo bien: ${lista.length} pruebas, ${total} revisiones.`);
process.exit(mal ? 1 : 0);
