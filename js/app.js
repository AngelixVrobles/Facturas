/* Facturas de Proyectos: app principal (pantallas, lectura de facturas, pagos, PDF y Excel). */
(() => {
'use strict';

const LIB = {
  pdflib: 'vendor/pdf-lib.min.js',
  pdfjs: 'vendor/pdf.min.js',
  pdfjsWorker: 'vendor/pdf.worker.min.js',
  jsqr: 'vendor/jsQR.min.js',
};
const APP_VERSION = '1.1.0';
const SVG = (d) => `<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICON = {
  plus: SVG('<path d="M12 5v14M5 12h14"/>'),
  close: SVG('<path d="M6 6l12 12M18 6L6 18"/>'),
  down: SVG('<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>'),
  spark: SVG('<path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16"/><path d="M8 10h8M8 14h5"/>'),
  trash: SVG('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'),
  check: SVG('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  right: SVG('<path d="M9 5l7 7-7 7"/>'),
  alert: SVG('<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17.5v.01"/>'),
  sheet: SVG('<rect x="3.5" y="4" width="17" height="16" rx="2"/><path d="M3.5 9.5h17M3.5 14.5h17M9.5 4v16"/>'),
  shield: SVG('<path d="M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>'),
  share: SVG('<path d="M12 15V4M8 8l4-4 4 4"/><path d="M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7"/>'),
  order: SVG('<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4.5V3h6v1.5M8.5 10h7M8.5 14h7M8.5 18h4"/>'),
};

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const round2 = (n) => Math.round(n * 100) / 100;
const assetUrl = (id) => (RT.assets.cachedUrl && RT.assets.cachedUrl(id)) || './_blob/' + encodeURIComponent(id);
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const ROMAN = { i: '1', ii: '2', iii: '3', iv: '4', v: '5', vi: '6', vii: '7', viii: '8', ix: '9', x: '10' };
const projKey = (s) => norm(s).split(' ').map((w) => ROMAN[w] || w.replace(/^0+(\d)/, '$1')).join(' ');
const lsGet = (k) => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } };
const lsSet = (k, v) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch (e) { /* sin almacenamiento */ } };

const PAY_LABEL = { armando: 'Por presentar', presentado: 'Presentado', pagado: 'Pagado' };
const INV_LABEL = { pendiente: 'Pendiente', enpago: 'En pago', presentada: 'Presentada', pagada: 'Pagada' };
const GROUP_OF = { pendiente: 'pendientes', enpago: 'tramite', presentada: 'tramite', pagada: 'pagadas' };
const SEGS = [['pendientes', 'Pendientes'], ['tramite', 'En trámite'], ['pagadas', 'Pagadas'], ['todas', 'Todas']];
const Q_LABEL = { espera: 'En espera', preparando: 'Preparando…', subiendo: 'Guardando…', leyendo: 'Leyendo la factura…', lista: 'Lista', qr: 'Lista: datos del QR de la DGII', xml: 'Lista: datos del XML', manual: 'Guardada; llena los datos', error: 'No se pudo agregar' };
const CUR_PREFIX = { DOP: 'RD$', USD: 'US$', EUR: '€' };
const ORDER_LABEL = { borrador: 'Borrador', enviada: 'Por firmar', autorizada: 'Firmada', anulada: 'Anulada' };
const ORDER_SEGS = [['porfirmar', 'Por firmar'], ['firmadas', 'Firmadas'], ['todas', 'Todas']];
const UNITS = ['Unidad', 'Funda', 'Saco', 'Galón', 'Cubeta', 'Caja', 'Rollo', 'Metro', 'Pie', 'Pulgada', 'Libra', 'Quintal', 'Plancha', 'Varilla', 'Tubo', 'Lámina', 'Juego', 'Par', 'Litro', 'm²', 'm³', 'Viaje', 'Servicio'];
const DEFAULT_ORDER_NOTE = 'Toda factura recibida por compras deberá estar acompañada, como mínimo, de una fotocopia de la orden de compra debidamente autorizada y sellada. Esta orden debe presentarse junto con la factura para su recepción, verificación y trámite.';

const S = {
  tab: 'facturas', filter: 'pendientes', projectFilter: 'all', search: '', paymentId: null,
  projects: [], invoices: [], payments: [], orders: [], settings: {}, got: { projects: false, invoices: false, payments: false, orders: false }, orderFilter: 'todas', orderSearch: '',
  dbState: 'loading', aiState: 'ok', queue: [], sheet: null, payDel: false, busyPdf: false, pdfMsg: '',
  updateReg: null, updating: false, ready: null, restoreFile: null,
};
let db = null, assets = null;
const ai = RT.ai;
let renderedPayFields = null;

/* ---------- formato ---------- */
const nf = new Intl.NumberFormat('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const df = new Intl.DateTimeFormat('es-DO', { day: 'numeric', month: 'short', year: 'numeric' });
function ymd(s) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); if (!m) return null; const d = new Date(+m[1], +m[2] - 1, +m[3]); return d.getMonth() === +m[2] - 1 && d.getDate() === +m[3] ? d : null; }
function fmtDate(s) { const d = ymd(s); return d ? df.format(d).replace(/\./g, '') : ''; }
function fmtDmy(s) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; }
function todayISO() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
const isNum = (n) => typeof n === 'number' && Number.isFinite(n);
function normCur(c) {
  const s = String(c || '').toUpperCase().replace(/[^A-Z$€]/g, '');
  if (!s || s === 'DOP' || s === 'RD$' || s === 'RD' || s === 'RDS' || s === '$') return 'DOP';
  if (s === 'USD' || s === 'US$' || s === 'US') return 'USD';
  if (s === 'EUR' || s === '€') return 'EUR';
  return s.slice(0, 3);
}
function money(n, cur) { if (!isNum(n)) return '—'; const c = normCur(cur); return (CUR_PREFIX[c] || c + ' ') + nf.format(n); }
function sumBy(list, field) {
  const g = new Map();
  for (const i of list) if (isNum(i[field])) { const c = normCur(i.currency); g.set(c, (g.get(c) || 0) + i[field]); }
  return g;
}
function totalStr(list, field = 'amount') {
  const g = sumBy(list, field);
  if (!g.size) return money(0);
  return [...g].map(([c, v]) => money(round2(v), c)).join(' + ');
}
function parseAmount(str) {
  let s = String(str ?? '').trim();
  if (!s) return null;
  s = s.replace(/[^\d.,-]/g, '');
  if (!/\d/.test(s)) return null;
  const neg = s.startsWith('-');
  s = s.replace(/-/g, '');
  const lc = s.lastIndexOf(','), ld = s.lastIndexOf('.');
  let dec = -1;
  if (lc >= 0 && ld >= 0) dec = Math.max(lc, ld);
  else {
    const p = Math.max(lc, ld);
    if (p >= 0) {
      const after = s.length - p - 1, before = s.slice(0, p).replace(/[.,]/g, '');
      if (!(after === 3 && before !== '' && before !== '0')) dec = p;
    }
  }
  const ip = (dec >= 0 ? s.slice(0, dec) : s).replace(/[.,]/g, '');
  const fp = dec >= 0 ? s.slice(dec + 1).replace(/[.,]/g, '') : '';
  const n = Number((ip || '0') + (fp ? '.' + fp : ''));
  return Number.isFinite(n) ? (neg ? -n : n) : null;
}
const amountInput = (n) => (isNum(n) ? String(round2(n)) : '');
function fmtBytes(n) { if (!isNum(n)) return '—'; if (n < 1048576) return Math.max(1, Math.round(n / 1024)) + ' KB'; if (n < 1073741824) return (n / 1048576).toFixed(1) + ' MB'; return (n / 1073741824).toFixed(1) + ' GB'; }

/* ---------- datos derivados ---------- */
function dupKey(i) {
  const n = RD.normNcf(i.number);
  if (!n) return '';
  return (RD.normRnc(i.rnc) || norm(i.supplier)) + '|' + n;
}
function derive() {
  const projects = [...S.projects].sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')) || String(a.name || '').localeCompare(String(b.name || '')));
  const projById = new Map();
  projects.forEach((p, k) => projById.set(p.id, { ...p, color: `var(--p${k % 8})` }));
  const payOf = new Map();
  for (const p of S.payments) for (const id of (Array.isArray(p.invoiceIds) ? p.invoiceIds : [])) payOf.set(id, p);
  const dups = new Map();
  for (const i of S.invoices) { const k = dupKey(i); if (k) dups.set(k, (dups.get(k) || 0) + 1); }
  const orders = [...S.orders].sort((a, b) => (Number(b.number) || 0) - (Number(a.number) || 0)).map((o) => ({ ...o, status: ORDER_LABEL[o.status] ? o.status : 'borrador', project: projById.get(o.projectId) || null }));
  const orderById = new Map(orders.map((o) => [o.id, o]));
  const firstOrderAt = S.orders.reduce((m, o) => (o.createdAt && (!m || o.createdAt < m) ? o.createdAt : m), '');
  const now = Date.now();
  const invoices = S.invoices.map((i) => {
    const pay = payOf.get(i.id) || null;
    const status = !pay ? 'pendiente' : pay.status === 'pagado' ? 'pagada' : pay.status === 'presentado' ? 'presentada' : 'enpago';
    let aiSt = i.ai || 'off';
    if (aiSt === 'pending' && !S.queue.some((q) => q.invId === i.id && !q.done) && !aiJobs.some((j) => j.invId === i.id) && now - (Date.parse(i.createdAt) || 0) > 120000) aiSt = 'failed';
    const k = dupKey(i);
    return { ...i, ai: aiSt, pay, status, project: projById.get(i.projectId) || null, order: orderById.get(i.orderId) || null, dup: k ? dups.get(k) > 1 : false };
  });
  const invByOrder = new Map();
  for (const i of invoices) if (i.order) { const a = invByOrder.get(i.order.id) || []; a.push(i); invByOrder.set(i.order.id, a); }
  return { projects: projects.map((p) => projById.get(p.id)), projById, invoices, orders, orderById, invByOrder, firstOrderAt, companyRnc: RD.normRnc(S.settings.companyRnc) };
}
function reviewFlags(i, D) {
  const r = [];
  if (i.notInvoice) r.push('¿No es factura?');
  if (!i.project) r.push('Falta proyecto');
  if (i.ai !== 'pending') {
    if (!isNum(i.amount)) r.push('Falta monto');
    if (!i.number) r.push('Falta NCF');
    else { const n = RD.parseNcf(i.number); if (!n.ok) r.push('NCF incompleto'); else if (n.consumo) r.push('De consumo'); }
    if (ncfExpired(i)) r.push('NCF vencido');
  }
  if (i.ai === 'failed') r.push('Sin leer');
  if (i.dup) r.push('¿Repetida?');
  if (needsOrder(i, D)) r.push('Sin orden');
  if (i.buyerRnc && D.companyRnc && RD.normRnc(i.buyerRnc) !== D.companyRnc) r.push('Otro cliente');
  return r;
}
/* ---------- órdenes de compra: utilidades ---------- */
function orderPrefix() { const p = S.settings.orderPrefix; return typeof p === 'string' ? p : 'OC-'; }
function orderNo(o) { return o && isNum(Number(o.number)) && Number(o.number) > 0 ? orderPrefix() + String(o.number).padStart(4, '0') : 'Orden nueva'; }
function nextOrderNumber() {
  const max = S.orders.reduce((m, o) => (Number(o.number) > m ? Number(o.number) : m), 0);
  const want = Math.floor(Number(S.settings.orderNext) || 0);
  return Math.max(max + 1, want > 0 ? want : 1);
}
// Proveedor: compara sin palabras de relleno, para que "FER. LA CASA DEL CONSTRUCTOR" y "Ferretería La Casa del Constructor" coincidan.
const SUP_STOP = new Set(['fer', 'ferr', 'ferret', 'ferreteria', 'ferreterias', 'srl', 'sas', 'sa', 'eirl', 'cxa', 'c', 'x', 'a', 's', 'r', 'l', 'y', 'e', 'de', 'del', 'la', 'el', 'los', 'las', 'comercial', 'com', 'distribuidora', 'dist', 'inversiones', 'grupo']);
const supKey = (v) => norm(v).split(' ').filter((w) => w && !SUP_STOP.has(w)).join(' ');
const sameName = (a, b) => { const x = supKey(a), y = supKey(b); return !!x && !!y && (x === y || (x.length >= 5 && y.includes(x)) || (y.length >= 5 && x.includes(y))); };
function orderCandidates(i, D) { return D.orders.filter((o) => o.status !== 'anulada' && i.projectId && o.projectId === i.projectId && sameName(o.supplier, i.supplier)); }
function needsOrder(i, D) { return !!(D.firstOrderAt && !i.order && String(i.createdAt || '') >= D.firstOrderAt); }
function fmtQty(q) { if (typeof q === 'number') return new Intl.NumberFormat('es-DO', { maximumFractionDigits: 3 }).format(q); return String(q == null ? '' : q); }
function matchOrderRef(text, projectId) {
  const t = String(text || '');
  const pre = orderPrefix().trim();
  if (!(/\b(o\s*\/\s*c|oc|orden)\b/i.test(t) || (pre && t.toUpperCase().includes(pre.toUpperCase())))) return null;
  for (const n of (t.match(/\d+/g) || []).map(Number)) {
    const o = S.orders.find((x) => Number(x.number) === n && x.status !== 'anulada' && (!projectId || !x.projectId || x.projectId === projectId));
    if (o) return o;
  }
  return null;
}
function ncfExpired(i) { return !!(i.ncfExpiry && ymd(i.ncfExpiry) && i.date && ymd(i.date) && i.date > i.ncfExpiry); }
const sortByDateDesc = (a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
function groupByProject(list, D) {
  const groups = new Map();
  for (const p of D.projects) groups.set(p.id, { id: p.id, name: p.name, color: p.color, items: [] });
  const none = { id: 'none', name: 'Sin proyecto', color: null, items: [] };
  for (const i of list) (i.project ? groups.get(i.project.id) : none).items.push(i);
  const out = [...groups.values()].filter((g) => g.items.length);
  if (none.items.length) out.unshift(none);
  return out;
}
function payInvoices(pay, D) { const ids = new Set(Array.isArray(pay.invoiceIds) ? pay.invoiceIds : []); return D.invoices.filter((i) => ids.has(i.id)); }
function inProject(i) { return S.projectFilter === 'all' || (S.projectFilter === 'none' ? !i.project : i.projectId === S.projectFilter); }
function visibleList(D) {
  const q = norm(S.search);
  let list = D.invoices.filter(inProject).filter((i) => S.filter === 'todas' || GROUP_OF[i.status] === S.filter);
  if (q) list = list.filter((i) => norm([i.supplier, i.number, i.rnc, i.concept, i.ref, i.project && i.project.name, i.fileName].join(' ')).includes(q));
  return list.sort(sortByDateDesc);
}

/* ---------- librerías (se cargan solo cuando hacen falta) ---------- */
const scripts = {};
function loadScript(src) {
  return scripts[src] || (scripts[src] = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.async = true;
    s.onload = () => res(); s.onerror = () => { delete scripts[src]; rej(new Error('No se pudo cargar una herramienta de la app.')); };
    document.head.appendChild(s);
  }));
}
let pdfjsP = null, pdflibP = null;
function pdfjs() {
  return pdfjsP || (pdfjsP = Promise.all([loadScript(LIB.pdfjsWorker), loadScript(LIB.pdfjs)]).then(() => {
    const lib = window.pdfjsLib;
    if (!lib) throw new Error('No se pudo abrir el lector de PDF.');
    lib.GlobalWorkerOptions.workerSrc = LIB.pdfjsWorker;
    return lib;
  }).catch((e) => { pdfjsP = null; throw e; }));
}
function pdflib() {
  return pdflibP || (pdflibP = loadScript(LIB.pdflib).then(() => {
    if (!window.PDFLib) throw new Error('No se pudo preparar el PDF.');
    return window.PDFLib;
  }).catch((e) => { pdflibP = null; throw e; }));
}

/* ---------- imágenes, PDF y QR ---------- */
function canvasToJpeg(c, q = 0.85) { return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('No se pudo preparar la imagen.'))), 'image/jpeg', q)); }
function scaledCanvas(src, maxDim) {
  const w0 = src.naturalWidth || src.width, h0 = src.naturalHeight || src.height;
  const k = Math.min(1, maxDim / Math.max(w0, h0));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w0 * k)); c.height = Math.max(1, Math.round(h0 * k));
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return c;
}
async function loadImage(file) {
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new UserError('No se pudo abrir esta foto. Mándala como JPG o PNG.')); i.src = url; });
  } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
}
// Busca el QR de la DGII: primero la imagen completa, luego las esquinas (suele ir abajo a la izquierda).
async function scanQr(canvas) {
  try { await loadScript(LIB.jsqr); } catch (e) { return null; }
  if (typeof window.jsQR !== 'function') return null;
  const regions = [[0, 0, 1, 1], [0, 0.45, 0.6, 0.55], [0.4, 0.45, 0.6, 0.55], [0, 0, 0.6, 0.55], [0.4, 0, 0.6, 0.55]];
  for (const [fx, fy, fw, fh] of regions) {
    const sx = Math.round(canvas.width * fx), sy = Math.round(canvas.height * fy);
    const sw = Math.round(canvas.width * fw), sh = Math.round(canvas.height * fh);
    const k = Math.min(1.6, 1400 / Math.max(sw, sh));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(sw * k)); c.height = Math.max(1, Math.round(sh * k));
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, c.width, c.height);
    const img = ctx.getImageData(0, 0, c.width, c.height);
    const code = window.jsQR(img.data, c.width, c.height, { inversionAttempts: 'dontInvert' });
    if (code && code.data) { const qr = RD.parseQr(code.data); if (qr) return qr; }
  }
  return null;
}
async function prepImage(file) {
  const img = await loadImage(file);
  const big = scaledCanvas(img, 2000);
  const blob = await canvasToJpeg(big, 0.85);
  const qr = await scanQr(big);
  return { blob, qr };
}
async function renderPdfCanvas(pdf, n, targetW) {
  const page = await pdf.getPage(n);
  const v1 = page.getViewport({ scale: 1 });
  const vp = page.getViewport({ scale: Math.max(0.5, Math.min(4, targetW / v1.width)) });
  const c = document.createElement('canvas'); c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
  const ctx = c.getContext('2d'); ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  return c;
}
async function openPdf(bytes) { const lib = await pdfjs(); return lib.getDocument({ data: new Uint8Array(bytes.slice(0)), isEvalSupported: false }).promise; }
async function inspectPdf(bytes) {
  const pdf = await openPdf(bytes);
  try {
    let text = '';
    for (let n = 1; n <= Math.min(pdf.numPages, 3); n++) {
      const tc = await (await pdf.getPage(n)).getTextContent();
      text += tc.items.map((it) => (it.str || '') + (it.hasEOL ? '\n' : ' ')).join('') + '\n';
    }
    const page = await renderPdfCanvas(pdf, 1, 1800);
    const qr = await scanQr(page);
    const thumb = await canvasToJpeg(scaledCanvas(page, 1400), 0.85);
    return { pages: pdf.numPages, text: text.replace(/[ \t]+/g, ' ').slice(0, 12000), thumb, qr };
  } finally { try { pdf.destroy(); } catch (e) { /* nada */ } }
}
async function getBlob(id) { const b = await RT.assets.get(id); if (!b) throw new Error('No se encontró el archivo.'); return b; }

/* ---------- errores ---------- */
class UserError extends Error {}
function upErr(e) {
  if (e instanceof UserError) return e.message;
  if (e && e.code === 'quota_exceeded') return 'El teléfono no tiene espacio';
  return 'Intenta de nuevo';
}
function dbErr(e) {
  if (e && e.code === 'quota_exceeded') return 'El teléfono se quedó sin espacio. Libera espacio o borra facturas viejas.';
  return 'No se pudo guardar. Intenta de nuevo.';
}
async function dbw(fn) {
  try { return await fn(); } catch (e) {
    if (e && e.code === 'unavailable') { await new Promise((r) => setTimeout(r, 300)); return fn(); }
    throw e;
  }
}
async function write(fn, okMsg) { try { await dbw(fn); if (okMsg) toast(okMsg); return true; } catch (e) { console.error(e); toast(dbErr(e)); return false; } }

let toastT = 0;
function toast(msg) { const el = $('#toast'); el.textContent = msg; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, 3000); }

/* ---------- pantallas ---------- */
let rq = 0;
function scheduleRender() { if (rq) return; rq = requestAnimationFrame(() => { rq = 0; renderAll(); }); }
const canEdit = () => S.dbState === 'ready';
const canUpload = () => canEdit() && !!assets;
const isStandalone = () => !!(navigator.standalone || (window.matchMedia && matchMedia('(display-mode: standalone)').matches));
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function renderAll() {
  const D = derive();
  $$('.tabs [data-tab]').forEach((b) => { if (b.dataset.tab === S.tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  for (const t of ['facturas', 'ordenes', 'pagos', 'proyectos']) $('#v-' + t).hidden = S.tab !== t;
  const pay = S.tab === 'pagos' && S.paymentId ? S.payments.find((p) => p.id === S.paymentId) : null;
  $('#back').hidden = !pay;
  $('#title').textContent = pay ? (pay.name || 'Pago') : { facturas: 'Facturas', ordenes: 'Órdenes', pagos: 'Pagos', proyectos: 'Proyectos' }[S.tab];
  renderBanner(D);
  if (S.tab === 'facturas') renderFacturas(D);
  else if (S.tab === 'ordenes') renderOrdenes(D);
  else if (S.tab === 'pagos') renderPagos(D, pay);
  else renderProyectos(D);
  $('#fab').hidden = !(S.tab === 'facturas' && canUpload());
  $('#settings-btn').hidden = S.dbState === 'absent';
  refreshInvoiceSheet(D);
  refreshOrderSheet(D);
}

function renderBanner(D) {
  const parts = [];
  if (S.dbState === 'absent') parts.push('<div class="note warn"><span class="grow"><b>Este navegador no deja guardar datos.</b> Si estás en modo privado, ábrela en una ventana normal.</span></div>');
  else if (S.dbState === 'error') parts.push('<div class="note warn"><span class="grow">No se pudieron cargar tus datos. Cierra la app y vuelve a abrirla.</span></div>');
  if (S.updateReg) parts.push('<div class="note example"><span class="grow"><b>Hay una versión nueva de la app.</b></span><span class="acts"><button type="button" class="btn sm" data-act="update-app">Actualizar</button></span></div>');
  if (isIOS() && !isStandalone() && !lsGet('facturas.installHintOff')) parts.push('<div class="note example"><span class="grow"><b>Instálala antes de empezar:</b> toca Compartir y luego <b>Agregar a pantalla de inicio</b>. En iPhone, lo que guardes en Safari no pasa a la app instalada.</span><span class="acts"><button type="button" class="btn sm" data-act="install-off">Entendido</button></span></div>');
  if (S.aiState === 'badkey') parts.push('<div class="note warn"><span class="grow">La clave de API no funciona, así que las facturas no se están leyendo solas.</span><span class="acts"><button type="button" class="btn sm" data-act="settings">Revisar</button></span></div>');
  const last = Number(lsGet('facturas.lastBackup')) || 0;
  const snooze = Number(lsGet('facturas.backupSnooze')) || 0;
  if (S.dbState === 'ready' && S.invoices.length && Date.now() - last > 7 * 864e5 && Date.now() > snooze) {
    parts.push(`<div class="note warn"><span class="grow"><b>${last ? 'Haz un respaldo:' : 'Todavía no tienes respaldo.'}</b> Tus facturas solo están en este teléfono. Guarda una copia en iCloud Drive o en tu computadora.</span><span class="acts"><button type="button" class="btn sm" data-act="backup">Respaldar ahora</button><button type="button" class="btn sm ghost" data-act="backup-later">Mañana</button></span></div>`);
  }
  const el = $('#banner');
  el.innerHTML = parts.join('');
  el.hidden = !parts.length;
}

function thumbHTML(i) {
  const tid = i.thumbId || (i.fileType && i.fileType.startsWith('image/') ? i.fileId : null);
  const label = i.fileType === 'application/pdf' ? 'PDF' : i.fileType === 'application/xml' ? 'XML' : 'FOTO';
  const inner = tid ? `<img src="${esc(assetUrl(tid))}" alt="" loading="lazy" decoding="async">` : `<span class="ph">${label}</span>`;
  return `<span class="thumb">${inner}${i.status === 'pagada' ? '<span class="stamp pagado">Pagada</span>' : ''}</span>`;
}
function cardHTML(i, D, opts = {}) {
  const reading = i.ai === 'pending';
  const name = i.supplier || (reading ? 'Leyendo factura…' : 'Factura sin datos');
  const meta = [i.number ? 'NCF ' + RD.normNcf(i.number) : '', fmtDate(i.date)].filter(Boolean).join(' · ') || i.fileName || '';
  const tags = [];
  if (!opts.hideProject && i.project) tags.push(`<span class="proj"><i class="dot" style="--c:${i.project.color}"></i><span>${esc(i.project.name)}</span></span>`);
  if (!opts.hideStatus) tags.push(`<span class="pill ${i.status}">${INV_LABEL[i.status]}</span>`);
  if (i.fiscal === 'qr' || i.fiscal === 'xml') tags.push(`<span class="pill official">${i.fiscal === 'xml' ? 'XML' : 'QR'} DGII</span>`);
  if (reading) tags.push('<span class="pill reading">Leyendo…</span>');
  for (const r of reviewFlags(i, D)) tags.push(`<span class="pill warn">${esc(r)}</span>`);
  return `<button type="button" class="inv" data-act="open-inv" data-id="${esc(i.id)}">${thumbHTML(i)}<span class="inv-main"><span class="inv-top"><span class="supplier${i.supplier ? '' : ' muted'}">${esc(name)}</span><span class="amount">${esc(money(i.amount, i.currency))}</span></span><span class="inv-meta">${esc(meta)}</span><span class="tags">${tags.join('')}</span></span></button>`;
}

function renderFacturas(D) {
  if (S.projectFilter !== 'all' && S.projectFilter !== 'none' && !D.projById.has(S.projectFilter) && S.got.projects) S.projectFilter = 'all';
  const base = D.invoices.filter(inProject);
  const counts = { pendientes: 0, tramite: 0, pagadas: 0, todas: base.length };
  for (const i of base) counts[GROUP_OF[i.status]]++;
  $('#f-seg').innerHTML = SEGS.map(([k, label]) => `<button type="button" data-act="filter" data-f="${k}" aria-pressed="${S.filter === k}"><span>${label}</span><span class="n">${counts[k]}</span></button>`).join('');
  const noneN = D.invoices.filter((i) => !i.project).length;
  const chips = [`<button type="button" class="chip" data-act="projf" data-p="all" aria-pressed="${S.projectFilter === 'all'}"><span>Todos los proyectos</span></button>`];
  if (noneN || S.projectFilter === 'none') chips.push(`<button type="button" class="chip" data-act="projf" data-p="none" aria-pressed="${S.projectFilter === 'none'}"><i class="dot ring"></i><span>Sin proyecto</span></button>`);
  for (const p of D.projects) chips.push(`<button type="button" class="chip" data-act="projf" data-p="${esc(p.id)}" aria-pressed="${S.projectFilter === p.id}"><i class="dot" style="--c:${p.color}"></i><span>${esc(p.name)}</span></button>`);
  $('#f-chips').innerHTML = chips.join('');

  const q = norm(S.search);
  const list = visibleList(D);
  const sum = $('#f-sum');
  if (S.got.invoices && base.length) {
    const canMake = S.filter === 'pendientes' && list.length && canEdit();
    const acts = (list.length ? `<button type="button" class="btn sm" data-act="list-xlsx">${ICON.sheet} Excel</button>` : '') + (canMake ? `<button type="button" class="btn sm" data-act="new-pay-from">Armar pago con estas ${ICON.right}</button>` : '');
    sum.innerHTML = `<div class="sumline"><span>${plural(list.length, 'factura', 'facturas')} · <b class="mono">${esc(totalStr(list))}</b></span>${acts ? `<span class="acts">${acts}</span>` : ''}</div>`;
  } else sum.innerHTML = '';

  const el = $('#f-list');
  if (!S.got.invoices) { el.innerHTML = S.dbState === 'absent' ? '' : '<p class="loading">Cargando tus facturas…</p>'; return; }
  if (!D.invoices.length) {
    el.innerHTML = `<div class="empty"><h2>Aquí van a aparecer tus facturas</h2><ol><li>Toca <b>Agregar facturas</b> y elige las fotos, PDF o XML que te mandaron.</li><li>Si la factura es electrónica, la app lee su código QR o su XML y toma el e-NCF, el RNC, la fecha y el monto. Si agregas tu clave de API en <b>Ajustes</b>, también lee las de papel.</li><li>Cuando toque pagar, ve a <b>Pagos</b>, elige cuáles entran y comparte el PDF o el Excel.</li></ol>${canUpload() ? `<button type="button" class="btn primary" data-act="add">${ICON.plus} Agregar facturas</button>` : ''}</div>`;
    return;
  }
  if (!list.length) {
    const what = { pendientes: 'pendientes', tramite: 'en trámite', pagadas: 'pagadas', todas: '' }[S.filter];
    el.innerHTML = `<div class="empty"><p>${q ? 'Nada coincide con tu búsqueda.' : `No hay facturas ${what}${S.projectFilter !== 'all' ? ' en este proyecto' : ''}.`}</p></div>`;
    return;
  }
  if (S.projectFilter === 'all') {
    el.innerHTML = groupByProject(list, D).map((g) => `<section class="group"><h2 class="group-h">${g.color ? `<i class="dot" style="--c:${g.color}"></i>` : '<i class="dot ring"></i>'}<span class="gname">${esc(g.name)}</span><span class="gmeta">${g.items.length} · ${esc(totalStr(g.items))}</span></h2><div class="list">${g.items.map((i) => cardHTML(i, D, { hideProject: true })).join('')}</div></section>`).join('');
  } else {
    el.innerHTML = `<div class="list">${list.map((i) => cardHTML(i, D, { hideProject: true })).join('')}</div>`;
  }
}

function renderQueue() {
  const el = $('#queue');
  const q = S.queue;
  if (!q.length) { el.hidden = true; el.innerHTML = ''; return; }
  const left = q.filter((x) => !x.done).length;
  const cls = { espera: 'q-busy', preparando: 'q-busy', subiendo: 'q-busy', leyendo: 'q-busy', lista: 'q-ok', qr: 'q-ok', xml: 'q-ok', manual: 'q-manual', error: 'q-error' };
  el.hidden = false;
  el.innerHTML = `<div class="q-head"><b>${left ? `Procesando ${left} de ${q.length}…` : `Listo: ${plural(q.length, 'archivo', 'archivos')}`}</b>${left ? '' : '<button type="button" class="btn sm ghost" data-act="queue-clear">Ocultar</button>'}</div><ul class="q-list">${q.map((x) => `<li class="${cls[x.state]}"><span class="q-dot"></span><span class="q-name">${esc(x.name)}</span><span class="q-state">${esc(Q_LABEL[x.state] + (x.msg ? ': ' + x.msg : ''))}</span></li>`).join('')}</ul>`;
}

function renderPagos(D, pay) {
  $('#pl').hidden = !!pay;
  $('#pd').hidden = !pay;
  if (pay) return renderPayDetail(D, pay);
  renderedPayFields = null;
  const el = $('#pl');
  if (!S.got.payments) { el.innerHTML = S.dbState === 'absent' ? '' : '<p class="loading">Cargando pagos…</p>'; return; }
  const order = { armando: 0, presentado: 1, pagado: 2 };
  const pays = [...S.payments].sort((a, b) => (order[a.status] ?? 0) - (order[b.status] ?? 0) || String(b.date || '').localeCompare(String(a.date || '')) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  const pendN = D.invoices.filter((i) => i.status === 'pendiente').length;
  const head = canEdit() ? `<button type="button" class="btn primary block" data-act="new-pay">${ICON.plus} Nuevo pago</button><p class="hint">Un pago junta las facturas que vas a presentar juntas. ${pendN ? `Tienes ${plural(pendN, 'factura pendiente', 'facturas pendientes')} de acomodar.` : 'Ahorita no tienes facturas pendientes.'}</p>` : '';
  if (!pays.length) {
    el.innerHTML = head + '<div class="empty"><h2>Todavía no hay pagos</h2><p>Cuando te toque presentar facturas, crea un pago, elige cuáles entran y comparte el PDF o el Excel. Después lo marcas como presentado y, cuando paguen, como pagado.</p></div>';
    return;
  }
  el.innerHTML = head + `<div class="list">${pays.map((p) => {
    const invs = payInvoices(p, D);
    const projN = new Set(invs.map((i) => (i.project ? i.project.id : 'none'))).size;
    const st = PAY_LABEL[p.status] ? p.status : 'armando';
    return `<button type="button" class="pay" data-act="open-pay" data-id="${esc(p.id)}"><span class="pay-name">${esc(p.name || 'Pago')}</span><span class="stamp ${st}">${PAY_LABEL[st]}</span><span class="pay-meta">${[fmtDate(p.date), plural(invs.length, 'factura', 'facturas'), invs.length ? plural(projN, 'proyecto', 'proyectos') : ''].filter(Boolean).join(' · ')}</span><span class="pay-total">${esc(totalStr(invs))}</span></button>`;
  }).join('')}</div>`;
}

function renderPayDetail(D, pay) {
  const invs = payInvoices(pay, D);
  const st = PAY_LABEL[pay.status] ? pay.status : 'armando';
  const edit = canEdit();
  const order = ['armando', 'presentado', 'pagado'];
  const stepCls = (k) => { const a = order.indexOf(st), b = order.indexOf(k); return b < a || st === 'pagado' ? 'done' : b === a ? 'cur' : ''; };
  const groups = groupByProject(invs, D);
  const statusBtns = [];
  if (edit && st === 'armando') statusBtns.push(`<button type="button" class="btn" data-act="pay-status" data-s="presentado" ${invs.length ? '' : 'disabled'}>${ICON.check} Marcar como presentado</button>`);
  if (edit && st === 'presentado') statusBtns.push(`<button type="button" class="btn" data-act="pay-status" data-s="pagado">${ICON.check} Marcar como pagado</button>`);
  const pdfBtn = `<button type="button" class="btn primary" data-act="pay-pdf" ${invs.length && !S.busyPdf ? '' : 'disabled'}>${ICON.down} ${S.busyPdf ? esc(S.pdfMsg || 'Preparando PDF…') : 'PDF para presentar'}</button>`;
  const xlsBtn = `<button type="button" class="btn" data-act="pay-xlsx" ${invs.length ? '' : 'disabled'}>${ICON.sheet} Excel</button>`;
  const undo = edit && st !== 'armando' ? `<button type="button" class="btn ghost sm" data-act="pay-status" data-s="${st === 'pagado' ? 'presentado' : 'armando'}">Regresar a “${st === 'pagado' ? 'Presentado' : 'Por presentar'}”</button>` : '';
  const dates = [pay.date ? 'Fecha del pago: ' + fmtDate(pay.date) : '', pay.presentedAt ? 'presentado el ' + fmtDate(pay.presentedAt) : '', pay.paidAt ? 'pagado el ' + fmtDate(pay.paidAt) : ''].filter(Boolean).join(' · ');
  const canRemove = edit && st !== 'pagado';
  const dot = (g) => (g.color ? `<i class="dot" style="--c:${g.color}"></i>` : '<i class="dot ring"></i>');
  const warnN = invs.filter((i) => reviewFlags(i, D).some((f) => f !== 'Sin orden')).length;
  const noOrd = invs.filter((i) => needsOrder(i, D)).length;
  const unsignedOrd = new Set(invs.filter((i) => i.order && i.order.status !== 'autorizada').map((i) => i.order.id)).size;
  const listHTML = groups.map((g) => `<section class="group"><h2 class="group-h">${dot(g)}<span class="gname">${esc(g.name)}</span><span class="gmeta">${g.items.length} · ${esc(totalStr(g.items))}</span></h2><div class="list">${g.items.sort(sortByDateDesc).map((i) => (canRemove ? `<div class="rowx">${cardHTML(i, D, { hideProject: true, hideStatus: true })}<button type="button" class="icon-btn" data-act="pay-rm" data-id="${esc(i.id)}" aria-label="Quitar del pago">${ICON.close}</button></div>` : cardHTML(i, D, { hideProject: true, hideStatus: true }))).join('')}</div></section>`).join('');
  $('#pd-body').innerHTML = `
    <ol class="steps" aria-label="Avance del pago"><li class="${stepCls('armando')}">Por presentar</li><li class="${stepCls('presentado')}">Presentado</li><li class="${stepCls('pagado')}">Pagado</li></ol>
    <div class="bigtotal"><span>Total del pago · ${plural(invs.length, 'factura', 'facturas')}</span><b>${esc(totalStr(invs))}</b><span>ITBIS incluido: ${esc(totalStr(invs, 'itbis'))}</span>${dates ? `<span>${esc(dates)}</span>` : ''}</div>
    ${warnN ? `<div class="msg warn">${ICON.alert}<span>${plural(warnN, 'factura tiene', 'facturas tienen')} algo que revisar antes de presentar (por ejemplo, falta el NCF o es de consumo).</span></div>` : ''}
    ${noOrd || unsignedOrd ? `<div class="msg warn">${ICON.alert}<span>${[noOrd ? plural(noOrd, 'factura no tiene', 'facturas no tienen') + ' orden de compra' : '', unsignedOrd ? plural(unsignedOrd, 'orden no tiene', 'órdenes no tienen') + ' la copia firmada y sellada' : ''].filter(Boolean).join(' y ')}. En el PDF van marcadas.</span></div>` : ''}
    <div class="actions">${pdfBtn}${xlsBtn}${statusBtns.join('')}</div>${undo ? `<div>${undo}</div>` : ''}
    ${groups.length ? `<div class="card"><h2>Por proyecto</h2><div class="table-wrap"><table class="sum"><thead><tr><th>Proyecto</th><th class="num">Facturas</th><th class="num">ITBIS</th><th class="num">Total</th></tr></thead><tbody>${groups.map((g) => `<tr><td><span class="pname">${dot(g)}${esc(g.name)}</span></td><td class="num">${g.items.length}</td><td class="num">${esc(totalStr(g.items, 'itbis'))}</td><td class="num">${esc(totalStr(g.items))}</td></tr>`).join('')}</tbody><tfoot><tr><td>Total</td><td class="num">${invs.length}</td><td class="num">${esc(totalStr(invs, 'itbis'))}</td><td class="num">${esc(totalStr(invs))}</td></tr></tfoot></table></div></div>` : ''}
    <div class="sumline"><span class="h2">Facturas en este pago</span>${edit && st === 'armando' ? `<button type="button" class="btn sm" data-act="pick-more">${ICON.plus} Agregar pendientes</button>` : ''}</div>
    ${invs.length ? listHTML : '<div class="empty"><p>Este pago todavía no tiene facturas.</p></div>'}`;
  if (renderedPayFields !== pay.id) {
    renderedPayFields = pay.id;
    $('#pd-fields').innerHTML = `<div class="field"><label for="pd-name">Nombre</label><input id="pd-name" maxlength="80" value="${esc(pay.name || '')}" ${edit ? '' : 'disabled'}></div><div class="field"><label for="pd-date">Fecha del pago</label><input id="pd-date" type="date" value="${esc(pay.date || '')}" ${edit ? '' : 'disabled'}></div>`;
    $('#pd-edit').open = false;
  }
  $('#pd-edit').hidden = !edit;
  $('#pd-foot').innerHTML = !edit || st === 'pagado' ? '' : S.payDel
    ? `<div class="confirm"><p>¿Eliminar este pago? Sus facturas regresan a <b>Pendientes</b>; no se borra ninguna.</p><div class="actions"><button type="button" class="btn danger solid" data-act="pay-del-yes">Eliminar pago</button><button type="button" class="btn" data-act="pay-del-no">Cancelar</button></div></div>`
    : `<button type="button" class="btn danger sm" data-act="pay-del">${ICON.trash} Eliminar pago</button>`;
}

function orderCardHTML(o, D) {
  const invs = D.invByOrder.get(o.id) || [];
  const n = (o.items || []).length;
  const meta = [o.project ? o.project.name : 'Sin proyecto', fmtDate(o.date), plural(n, 'artículo', 'artículos'), invs.length ? plural(invs.length, 'factura', 'facturas') : ''].filter(Boolean).join(' · ');
  return `<button type="button" class="ord" data-act="open-order" data-id="${esc(o.id)}"><span class="ord-top"><b class="mono">${esc(orderNo(o))}</b><span class="pill o-${o.status}">${ORDER_LABEL[o.status]}</span></span><span class="ord-sup">${esc(o.supplier || 'Sin proveedor')}</span><span class="ord-meta">${esc(meta)}</span></button>`;
}
function renderOrdenes(D) {
  const el = $('#o-list');
  $('#o-new').hidden = !canEdit();
  const groupOf = (o) => (o.status === 'autorizada' ? 'firmadas' : o.status === 'anulada' ? 'anuladas' : 'porfirmar');
  const counts = { porfirmar: 0, firmadas: 0, todas: D.orders.length };
  for (const o of D.orders) if (counts[groupOf(o)] != null) counts[groupOf(o)]++;
  $('#o-seg').innerHTML = ORDER_SEGS.map(([k, label]) => `<button type="button" data-act="ofilter" data-f="${k}" aria-pressed="${S.orderFilter === k}"><span>${label}</span><span class="n">${counts[k]}</span></button>`).join('');
  if (!S.got.orders) { el.innerHTML = S.dbState === 'absent' ? '' : '<p class="loading">Cargando órdenes…</p>'; return; }
  if (!D.orders.length) {
    el.innerHTML = `<div class="empty"><h2>Aquí van tus órdenes de compra</h2><ol><li>Cuando te pidan materiales, toca <b>Nueva orden de compra</b> y llénala. Si tienes la clave de API, puedes pegar el mensaje del pedido y se llena sola.</li><li>Comparte el PDF para que la firmen y la sellen.</li><li>Toma una foto de la orden firmada y adjúntala. Cuando llegue la factura, la enlazas a su orden y salen juntas en el PDF del pago.</li></ol></div>`;
    return;
  }
  const q = norm(S.orderSearch);
  let list = D.orders.filter((o) => S.orderFilter === 'todas' || groupOf(o) === S.orderFilter);
  if (q) list = list.filter((o) => norm([orderNo(o), o.supplier, o.requestedBy, o.project && o.project.name, (o.items || []).map((x) => x.desc).join(' ')].join(' ')).includes(q));
  el.innerHTML = list.length ? `<div class="list">${list.map((o) => orderCardHTML(o, D)).join('')}</div>` : `<div class="empty"><p>${q ? 'Nada coincide con tu búsqueda.' : 'No hay órdenes en esta lista.'}</p></div>`;
}

function renderProyectos(D) {
  $('#proj-add').hidden = !canEdit();
  const el = $('#p-list');
  if (!S.got.projects) { el.innerHTML = S.dbState === 'absent' ? '' : '<p class="loading">Cargando proyectos…</p>'; return; }
  const rows = D.projects.map((p) => {
    const invs = D.invoices.filter((i) => i.projectId === p.id);
    const pend = invs.filter((i) => i.status === 'pendiente'), tram = invs.filter((i) => GROUP_OF[i.status] === 'tramite'), paid = invs.filter((i) => i.status === 'pagada');
    const sub = [pend.length ? plural(pend.length, 'pendiente', 'pendientes') : '', tram.length ? `${tram.length} en trámite` : '', paid.length ? plural(paid.length, 'pagada', 'pagadas') : ''].filter(Boolean).join(' · ') || 'Sin facturas todavía';
    return `<button type="button" class="prow" data-act="open-proj" data-id="${esc(p.id)}"><i class="dot" style="--c:${p.color}"></i><span class="pr-mid"><b>${esc(p.name)}</b><small>${esc(sub)}</small></span><span class="pr-total">${pend.length ? `${esc(totalStr(pend))}<small>por pagar</small>` : ''}</span></button>`;
  });
  const none = D.invoices.filter((i) => !i.project);
  if (none.length) rows.unshift(`<button type="button" class="prow" data-act="proj-view" data-id="none"><i class="dot ring"></i><span class="pr-mid"><b>Sin proyecto</b><small>${plural(none.length, 'factura necesita', 'facturas necesitan')} que le asignes proyecto</small></span><span class="pr-total">${ICON.right}</span></button>`);
  el.innerHTML = rows.length ? rows.join('') : '<div class="empty"><p>Agrega tus proyectos aquí arriba. También puedes dejar que la app te los sugiera cuando lea tus facturas.</p></div>';
}

/* ---------- hojas (ventanas que suben desde abajo) ---------- */
function openSheet(html, data) {
  const root = $('#sheet-root');
  // Si es la misma hoja que se actualiza con datos nuevos, no se repite la animación de entrada.
  root.classList.toggle('still', !!(S.sheet && data && S.sheet.id && S.sheet.type === data.type && S.sheet.id === data.id));
  root.innerHTML = `<div class="scrim" data-act="sheet-close"></div><div class="sheet" role="dialog" aria-modal="true">${html}</div>`;
  root.hidden = false;
  S.sheet = data;
  lockBody();
}
function closeSheet() { const root = $('#sheet-root'); root.hidden = true; root.innerHTML = ''; S.sheet = null; S.ready = null; lockBody(); }
function lockBody() { document.body.classList.toggle('locked', !!S.sheet || !$('#viewer').hidden); }
const sheetHead = (title) => `<div class="sheet-h"><h2>${title}</h2><button type="button" class="icon-btn plain" data-act="sheet-close" aria-label="Cerrar">${ICON.close}</button></div>`;

function invSig(i) { return JSON.stringify([i.orderId, i.order && i.order.status, i.ncfExpiry, i.supplier, i.number, i.rnc, i.date, i.amount, i.itbis, i.currency, i.concept, i.ref, i.projectId, i.projectHint, i.ai, i.notInvoice, i.pay && i.pay.id, i.pay && i.pay.status, i.dup, i.fiscal, i.xmlId, i.fileId, i.buyerRnc]); }
function openInvoice(id, keepScroll) {
  const D = derive();
  const i = D.invoices.find((x) => x.id === id);
  if (!i) return;
  const edit = canEdit();
  const dis = edit ? '' : 'disabled';
  const tid = i.thumbId || (i.fileType && i.fileType.startsWith('image/') ? i.fileId : null);
  const kind = i.fileType === 'application/pdf' ? 'PDF' : i.fileType === 'application/xml' ? 'XML' : 'Foto';
  const preview = `<button type="button" class="preview" data-act="inv-view" data-id="${esc(i.id)}" aria-label="Ver archivo completo">${tid ? `<img src="${esc(assetUrl(tid))}" alt="">` : `<span class="ph">${kind.toUpperCase()}</span>`}<span class="preview-tag">${kind === 'PDF' ? `PDF · ${plural(i.pages || 1, 'página', 'páginas')}` : kind} · Ver</span></button>`;
  const msgs = [];
  const ncf = RD.parseNcf(i.number);
  const rnc = RD.rncInfo(i.rnc);
  if (i.fiscal === 'qr' || i.fiscal === 'xml') {
    const verify = RD.isDgiiUrl(i.qrUrl) ? ` <a class="link" href="${esc(i.qrUrl)}" target="_blank" rel="noopener noreferrer">Verificar en la DGII</a>` : '';
    msgs.push(`<div class="msg ok">${ICON.shield}<span>e-NCF, RNC, fecha y monto tomados ${i.fiscal === 'xml' ? 'del XML de la factura electrónica' : 'del código QR de la DGII'}.${verify}</span></div>`);
  }
  const aiLink = edit && i.ai !== 'pending' ? ` <button type="button" class="link" data-act="inv-ai" data-id="${esc(i.id)}">${i.ai === 'done' ? 'Leer otra vez' : 'Leer automáticamente'}</button>` : '';
  if (i.ai === 'pending') msgs.push(`<div class="msg ok">${ICON.spark}<span>Leyendo la factura… Los datos aparecen aquí en unos segundos.</span></div>`);
  else if (i.ai === 'done') msgs.push(`<div class="msg ok">${ICON.spark}<span>Datos leídos automáticamente. Revisa que estén bien.${aiLink}</span></div>`);
  else if (i.ai === 'failed') msgs.push(`<div class="msg warn">${ICON.alert}<span>No se pudo leer automáticamente. Llena los datos o intenta otra vez.${aiLink}</span></div>`);
  else if (i.fileType !== 'application/xml' && edit) msgs.push(`<div class="msg">${ICON.spark}<span>${ai.hasKey() ? '¿Quieres que la app lea los datos de esta factura?' : 'Para que la app llene los datos sola, agrega tu clave de API en Ajustes.'}${ai.hasKey() ? aiLink : ' <button type="button" class="link" data-act="settings">Abrir Ajustes</button>'}</span></div>`);
  if (ncf.ok && ncf.consumo) msgs.push(`<div class="msg warn">${ICON.alert}<span>Es una factura de <b>consumo</b> (${ncf.electronic ? 'E32' : 'B02'}): no sirve para crédito fiscal ni para sustentar costos. Pide al proveedor una de crédito fiscal.</span></div>`);
  if (ncfExpired(i)) msgs.push(`<div class="msg warn">${ICON.alert}<span>El NCF venció el ${esc(fmtDate(i.ncfExpiry))} y la factura es del ${esc(fmtDate(i.date))}: no sirve para crédito fiscal. Pide al proveedor que la reemita.</span></div>`);
  if (i.number && !ncf.ok) msgs.push(`<div class="msg warn">${ICON.alert}<span>El NCF no tiene el formato correcto: debe ser B + 10 dígitos (ej. B0100004521) o, si es electrónica, E + 12 dígitos (ej. E310000000123).</span></div>`);
  if (rnc.kind === 'rnc' && rnc.checkOk === false) msgs.push(`<div class="msg warn">${ICON.alert}<span>El dígito verificador del RNC no cuadra. Revisa que esté bien escrito.</span></div>`);
  if (i.buyerRnc && D.companyRnc && RD.normRnc(i.buyerRnc) !== D.companyRnc) msgs.push(`<div class="msg warn">${ICON.alert}<span>Esta factura está a nombre del RNC ${esc(RD.fmtRnc(i.buyerRnc))}, no del de tu empresa (${esc(RD.fmtRnc(D.companyRnc))}).</span></div>`);
  if (i.notInvoice) msgs.push(`<div class="msg warn">${ICON.alert}<span>Este archivo no parece una factura. Revísalo antes de meterlo a un pago.</span></div>`);
  if (i.dup) msgs.push(`<div class="msg warn">${ICON.alert}<span>Puede estar repetida: hay otra factura del mismo proveedor con el mismo NCF.</span></div>`);
  if (i.projectHint && !i.project && edit) msgs.push(`<div class="msg hint"><span>La factura dice que es del proyecto <b>${esc(i.projectHint)}</b>, que no está en tu lista.</span><button type="button" class="link" data-act="hint-create" data-id="${esc(i.id)}">Crear “${esc(i.projectHint)}” y asignarla</button></div>`);
  if (i.xmlId && i.fileType !== 'application/xml') msgs.push(`<div class="msg">${ICON.check}<span>También tiene su XML de factura electrónica. <button type="button" class="link" data-act="xml-view" data-id="${esc(i.id)}">Ver XML</button></span></div>`);
  const where = i.pay
    ? `<span class="pill ${i.status}">${INV_LABEL[i.status]}</span><span>En <button type="button" class="link" data-act="open-pay" data-id="${esc(i.pay.id)}">${esc(i.pay.name || 'Pago')}</button></span>`
    : '<span class="pill pendiente">Pendiente</span><span>Todavía no está en ningún pago.</span>';
  const opts = D.projects.map((p) => `<option value="${esc(p.id)}"${p.id === i.projectId ? ' selected' : ''}>${esc(p.name)}</option>`).join('');
  const ordList = D.orders.filter((o) => o.status !== 'anulada' || o.id === i.orderId).sort((a, b) => (b.projectId === i.projectId) - (a.projectId === i.projectId) || sameName(b.supplier, i.supplier) - sameName(a.supplier, i.supplier) || (Number(b.number) || 0) - (Number(a.number) || 0));
  const orderOpts = ordList.map((o) => `<option value="${esc(o.id)}"${o.id === i.orderId ? ' selected' : ''}>${esc([orderNo(o), o.supplier, o.project && o.project.name].filter(Boolean).join(' · '))}</option>`).join('');
  const cand = !i.order && edit ? orderCandidates(i, D) : [];
  if (cand.length) msgs.push(`<div class="msg hint"><span>Hay ${cand.length === 1 ? 'una orden' : 'órdenes'} de este proveedor para esta obra.</span>${cand.slice(0, 3).map((o) => `<button type="button" class="link" data-act="link-order" data-id="${esc(i.id)}" data-order="${esc(o.id)}">Asignar ${esc(orderNo(o))}</button>`).join(' ')}</div>`);
  else if (needsOrder(i, D)) msgs.push(`<div class="msg warn">${ICON.alert}<span>Esta factura no tiene orden de compra. Debe presentarse con su orden firmada y sellada.</span></div>`);
  if (i.order && i.order.status !== 'autorizada') msgs.push(`<div class="msg warn">${ICON.alert}<span>La orden ${esc(orderNo(i.order))} todavía no tiene la copia firmada y sellada.</span></div>`);
  const cur = normCur(i.currency);
  const delBtn = edit && i.status !== 'pagada' ? `<div><button type="button" class="btn danger sm" data-act="inv-del">${ICON.trash} Eliminar factura</button></div>` : '';
  const html = `<form id="inv-form" data-id="${esc(i.id)}" autocomplete="off">${sheetHead('Factura')}
    <div class="sheet-b">
      ${preview}
      <div class="status-line">${where}</div>
      ${msgs.join('')}
      <div class="fields">
        <div class="field full"><label for="f-proj">Proyecto</label><select id="f-proj" ${dis}><option value="">Sin proyecto</option>${opts}${edit ? '<option value="__new">+ Proyecto nuevo…</option>' : ''}</select></div>
        <div class="field full" id="f-newproj-wrap" hidden><label for="f-newproj">Nombre del proyecto nuevo</label><input id="f-newproj" maxlength="80" placeholder="Ej. Torre Piantini" value="${esc(i.projectHint || '')}"></div>
        <div class="field full"><label for="f-sup">Proveedor</label><input id="f-sup" maxlength="120" value="${esc(i.supplier || '')}" ${dis}></div>
        <div class="field"><label for="f-rnc">RNC o cédula del proveedor</label><input id="f-rnc" class="mono" inputmode="numeric" maxlength="15" value="${esc(RD.normRnc(i.rnc))}" ${dis}><small class="help" id="f-rnc-help">${esc(rnc.ok ? (rnc.kind === 'rnc' ? 'RNC ' : 'Cédula ') + RD.fmtRnc(rnc.value) : '9 dígitos (RNC) u 11 (cédula)')}</small></div>
        <div class="field"><label for="f-num">NCF o e-NCF</label><input id="f-num" class="mono" maxlength="20" autocapitalize="characters" value="${esc(RD.normNcf(i.number))}" ${dis}><small class="help" id="f-num-help">${esc(ncf.ok ? ncf.label + (i.ncfExpiry ? ' · válido hasta ' + fmtDmy(i.ncfExpiry) : '') : 'Ej. B0100004521 o E310000000123')}</small></div>
        <div class="field"><label for="f-date">Fecha</label><input id="f-date" type="date" value="${esc(i.date || '')}" ${dis}></div>
        <div class="field"><label for="f-cur">Moneda</label><select id="f-cur" ${dis}><option value="DOP"${cur === 'DOP' ? ' selected' : ''}>RD$ pesos</option><option value="USD"${cur === 'USD' ? ' selected' : ''}>US$ dólares</option><option value="EUR"${cur === 'EUR' ? ' selected' : ''}>€ euros</option></select></div>
        <div class="field"><label for="f-itbis">ITBIS</label><input id="f-itbis" class="mono" inputmode="decimal" maxlength="20" placeholder="0.00" value="${esc(amountInput(i.itbis))}" ${dis}></div>
        <div class="field"><label for="f-amt">Total a pagar</label><input id="f-amt" class="mono" inputmode="decimal" maxlength="20" placeholder="0.00" value="${esc(amountInput(i.amount))}" ${dis}></div>
        <div class="field full"><label for="f-con">Concepto</label><textarea id="f-con" maxlength="140" rows="2" ${dis}>${esc(i.concept || '')}</textarea></div>
        <div class="field full"><label for="f-order">Orden de compra</label><select id="f-order" ${dis}><option value="">Sin orden</option>${orderOpts}</select></div>
        <div class="field full"><label for="f-ref">Otra referencia (cubicación, contrato)</label><input id="f-ref" maxlength="60" placeholder="Opcional" value="${esc(i.ref || '')}" ${dis}></div>
      </div>
      ${delBtn}
      <div id="inv-del-box" hidden><div class="confirm"><p>¿Eliminar esta factura? También se borran sus archivos y se quita del pago donde esté.</p><div class="actions"><button type="button" class="btn danger solid" data-act="inv-del-yes" data-id="${esc(i.id)}">Eliminar factura</button><button type="button" class="btn" data-act="inv-del-no">Cancelar</button></div></div></div>
    </div>
    ${edit ? '<div class="sheet-f"><button type="submit" class="btn primary block" id="inv-save">Guardar</button></div>' : ''}
  </form>`;
  const prevScroll = keepScroll && $('.sheet-b') ? $('.sheet-b').scrollTop : 0;
  openSheet(html, { type: 'inv', id: i.id, dirty: false, sig: invSig(i) });
  if (keepScroll && $('.sheet-b')) $('.sheet-b').scrollTop = prevScroll;
}
function refreshInvoiceSheet(D) {
  const sh = S.sheet;
  if (!sh || sh.type !== 'inv' || sh.dirty) return;
  const i = D.invoices.find((x) => x.id === sh.id);
  if (!i) { if (S.got.invoices) closeSheet(); return; }
  if (invSig(i) !== sh.sig) openInvoice(i.id, true);
}
function liveHelp(t) {
  if (t.id === 'f-rnc') { const r = RD.rncInfo(t.value); $('#f-rnc-help').textContent = r.ok ? (r.kind === 'rnc' ? 'RNC ' : 'Cédula ') + RD.fmtRnc(r.value) + (r.checkOk === false ? ' · revisa el dígito verificador' : '') : '9 dígitos (RNC) u 11 (cédula)'; }
  if (t.id === 'f-num') { const n = RD.parseNcf(t.value); $('#f-num-help').textContent = n.ok ? n.label + (n.consumo ? ' · no sirve para crédito fiscal' : '') : 'Ej. B0100004521 o E310000000123'; }
}

function openPicker(mode, preselect) {
  const D = derive();
  const pending = D.invoices.filter((i) => i.status === 'pendiente').sort(sortByDateDesc);
  const pre = new Set(preselect || []);
  const groups = groupByProject(pending, D);
  const isNew = mode === 'new';
  const body = pending.length
    ? groups.map((g, k) => `<div class="pick-group"><label class="pick-row head"><input type="checkbox" data-pick="group" data-g="${k}"><span class="pr-name"><span>${esc(g.name)}</span><small>${plural(g.items.length, 'pendiente', 'pendientes')}</small></span><span class="num">${esc(totalStr(g.items))}</span></label>${g.items.map((i) => `<label class="pick-row"><input type="checkbox" data-pick="inv" data-g="${k}" value="${esc(i.id)}" data-amt="${isNum(i.amount) ? i.amount : ''}" data-cur="${esc(normCur(i.currency))}"${pre.has(i.id) ? ' checked' : ''}><span class="pr-name"><span>${esc(i.supplier || 'Factura sin datos')}</span><small>${esc([i.number ? 'NCF ' + RD.normNcf(i.number) : '', fmtDate(i.date)].filter(Boolean).join(' · '))}</small></span><span class="num">${esc(money(i.amount, i.currency))}</span></label>`).join('')}</div>`).join('')
    : '<div class="empty"><p>No tienes facturas pendientes. Primero agrégalas en la pestaña <b>Facturas</b>.</p></div>';
  const fields = isNew ? `<div class="fields"><div class="field"><label for="pk-name">Nombre del pago</label><input id="pk-name" maxlength="80" value="${esc('Pago ' + fmtDate(todayISO()))}"></div><div class="field"><label for="pk-date">Fecha del pago</label><input id="pk-date" type="date" value="${todayISO()}"></div></div>` : '';
  openSheet(`<form id="pick-form" autocomplete="off">${sheetHead(isNew ? 'Nuevo pago' : 'Agregar facturas')}
    <div class="sheet-b">${fields}${pending.length ? '<p class="hint">Elige las facturas que vas a presentar en este pago. Puedes marcar un proyecto completo.</p>' : ''}${body}</div>
    <div class="sheet-f"><span class="grow" id="pk-sum"></span><button type="submit" class="btn primary" id="pk-go" disabled>${isNew ? 'Crear pago' : 'Agregar'}</button></div>
  </form>`, { type: 'pick', mode });
  syncPicker();
}
function syncPicker() {
  const boxes = $$('#sheet-root input[data-pick="inv"]');
  for (const g of $$('#sheet-root input[data-pick="group"]')) {
    const kids = boxes.filter((b) => b.dataset.g === g.dataset.g);
    const on = kids.filter((b) => b.checked).length;
    g.checked = on === kids.length && on > 0;
    g.indeterminate = on > 0 && on < kids.length;
  }
  const sel = boxes.filter((b) => b.checked).map((b) => ({ amount: b.dataset.amt === '' ? null : Number(b.dataset.amt), currency: b.dataset.cur }));
  const sum = $('#pk-sum');
  if (sum) sum.innerHTML = sel.length ? `${plural(sel.length, 'factura', 'facturas')} · <b>${esc(totalStr(sel))}</b>` : 'Ninguna elegida';
  const go = $('#pk-go');
  if (go) go.disabled = !sel.length;
}

function openProject(id) {
  const D = derive();
  const p = D.projById.get(id);
  if (!p) return;
  const invs = D.invoices.filter((i) => i.projectId === id);
  const by = (k) => invs.filter((i) => GROUP_OF[i.status] === k);
  openSheet(`<form id="proj-form" data-id="${esc(id)}" autocomplete="off">${sheetHead(esc(p.name))}
    <div class="sheet-b">
      <div class="field"><label for="pe-name">Nombre del proyecto</label><input id="pe-name" maxlength="80" value="${esc(p.name)}" required></div>
      <div class="stats card"><div><span>Pendientes (${by('pendientes').length})</span><b>${esc(totalStr(by('pendientes')))}</b></div><div><span>En trámite (${by('tramite').length})</span><b>${esc(totalStr(by('tramite')))}</b></div><div><span>Pagadas (${by('pagadas').length})</span><b>${esc(totalStr(by('pagadas')))}</b></div></div>
      <button type="button" class="btn block" data-act="proj-view" data-id="${esc(id)}">Ver las facturas de este proyecto ${ICON.right}</button>
      <div id="proj-del-box" hidden>${invs.length ? `<div class="confirm"><p>Este proyecto tiene ${plural(invs.length, 'factura', 'facturas')}. Para eliminarlo, primero cámbialas a otro proyecto o bórralas.</p><div class="actions"><button type="button" class="btn" data-act="proj-del-no">Entendido</button></div></div>` : `<div class="confirm"><p>¿Eliminar el proyecto “${esc(p.name)}”?</p><div class="actions"><button type="button" class="btn danger solid" data-act="proj-del-yes" data-id="${esc(id)}">Eliminar proyecto</button><button type="button" class="btn" data-act="proj-del-no">Cancelar</button></div></div>`}</div>
    </div>
    <div class="sheet-f"><button type="submit" class="btn primary">Guardar nombre</button><button type="button" class="btn danger" data-act="proj-del">${ICON.trash} Eliminar</button></div>
  </form>`, { type: 'proj', id });
}

async function openSettings() {
  const st = S.settings || {};
  const last = Number(lsGet('facturas.lastBackup')) || 0;
  const models = ai.MODELS.map((m) => `<option value="${m.id}"${m.id === ai.getModel() ? ' selected' : ''}>${esc(m.label)}</option>`).join('');
  openSheet(`<form id="settings-form" autocomplete="off">${sheetHead('Ajustes')}
    <div class="sheet-b">
      <h3 class="h2">Tu empresa</h3>
      <p class="hint">Aparecen en el PDF y en el Excel. Con el RNC de tu empresa, la app avisa si una factura viene a nombre de otro.</p>
      <div class="fields">
        <div class="field full"><label for="st-company">Empresa</label><input id="st-company" maxlength="100" placeholder="Ej. Constructora del Caribe, S.R.L." value="${esc(st.company || '')}"></div>
        <div class="field"><label for="st-rnc">RNC de la empresa</label><input id="st-rnc" class="mono" inputmode="numeric" maxlength="15" value="${esc(RD.normRnc(st.companyRnc))}"></div>
        <div class="field"><label for="st-area">Área o departamento</label><input id="st-area" maxlength="80" placeholder="Ej. Administración de obra" value="${esc(st.area || '')}"></div>
        <div class="field full"><label for="st-name">Elaboró (tu nombre)</label><input id="st-name" maxlength="80" value="${esc(st.preparedBy || '')}"></div>
      </div>
      <h3 class="h2">Lectura automática (opcional)</h3>
      <p class="hint">Las facturas electrónicas se leen solas por su QR o su XML. Para que la app lea también las de papel y llene las órdenes desde el mensaje del pedido, pon una clave de API (se crea en platform.claude.com y se paga por uso). La clave se guarda solo en este teléfono y no va en los respaldos.</p>
      <div class="fields">
        <div class="field full"><label for="st-key">Clave de API</label><input id="st-key" type="password" autocomplete="off" spellcheck="false" placeholder="sk-ant-…" value="${esc(ai.getKey())}"></div>
        <div class="field full"><label for="st-model">Modelo</label><select id="st-model">${models}</select></div>
      </div>
      <div class="actions"><button type="button" class="btn" data-act="ai-test">${ICON.spark} Probar la clave</button></div>
      <p class="usage" id="st-ai-status"></p>
      <h3 class="h2">Órdenes de compra</h3>
      <div class="fields">
        <div class="field"><label for="st-oc-prefix">Prefijo del número</label><input id="st-oc-prefix" maxlength="8" value="${esc(orderPrefix())}"></div>
        <div class="field"><label for="st-oc-next">Próximo número</label><input id="st-oc-next" class="mono" inputmode="numeric" maxlength="7" value="${nextOrderNumber()}"></div>
        <div class="field full"><label for="st-oc-note">Nota obligatoria al pie de la orden</label><textarea id="st-oc-note" rows="3" maxlength="500">${esc(st.orderNote != null ? st.orderNote : DEFAULT_ORDER_NOTE)}</textarea></div>
      </div>
      <h3 class="h2">Respaldo</h3>
      <p class="hint">Tus facturas solo están en este teléfono. Descarga un respaldo cada semana y guárdalo en iCloud Drive o en tu computadora. ${last ? 'Último respaldo: ' + esc(fmtDate(new Date(last).toISOString().slice(0, 10))) + '.' : 'Todavía no has hecho ninguno.'}</p>
      <div class="actions"><button type="button" class="btn" data-act="backup">${ICON.down} Descargar respaldo</button><button type="button" class="btn" data-act="restore">Restaurar un respaldo</button></div>
      <div id="restore-box" hidden></div>
      <p class="usage" id="st-usage">Calculando espacio…</p>
      <p class="usage">Versión ${APP_VERSION}</p>
    </div>
    <div class="sheet-f"><button type="submit" class="btn primary block">Guardar</button></div>
  </form>`, { type: 'settings' });
  try {
    const { usage: u } = await assets.list();
    const persisted = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : null;
    const el = $('#st-usage');
    if (el) el.textContent = `${plural(u.files || 0, 'archivo', 'archivos')} · ${fmtBytes(u.bytes)}${isNum(u.maxBytes) ? ` (el navegador permite hasta ${fmtBytes(u.maxBytes)})` : ''}${persisted ? ' · protegido contra borrado automático' : ''}.`;
  } catch (e) { const el = $('#st-usage'); if (el) el.textContent = ''; }
}

/* ---------- archivo listo para compartir o guardar ---------- */
function deliverFile(blob, filename) {
  const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
  let canShare = false;
  try { canShare = !!(navigator.canShare && navigator.canShare({ files: [file] })); } catch (e) { canShare = false; }
  openSheet(`${sheetHead('Archivo listo')}
    <div class="sheet-b"><div class="ready">${ICON.check}<span><b>${esc(filename)}</b><small>${fmtBytes(blob.size)}</small></span></div>
    <p class="hint">${canShare ? '<b>Compartir</b> te deja mandarlo por WhatsApp o correo, o guardarlo en Archivos.' : 'Se guarda en la carpeta de descargas.'}</p></div>
    <div class="sheet-f">${canShare ? `<button type="button" class="btn primary" data-act="ready-share">${ICON.share} Compartir</button>` : ''}<button type="button" class="btn${canShare ? '' : ' primary'}" data-act="ready-save">${ICON.down} Guardar en el dispositivo</button></div>`, { type: 'ready' });
  S.ready = { file, filename };
}
function readyShare() {
  if (!S.ready) return;
  navigator.share({ files: [S.ready.file], title: S.ready.filename }).then(() => { if (S.ready && S.ready.onDone) S.ready.onDone(); }).catch((e) => { if (e && e.name !== 'AbortError') toast('No se pudo compartir. Usa «Guardar en el dispositivo».'); });
}
function readySave() {
  if (!S.ready) return;
  const u = URL.createObjectURL(S.ready.file);
  const a = document.createElement('a');
  a.href = u; a.download = S.ready.filename; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 60000);
  if (S.ready.onDone) S.ready.onDone();
}

/* ---------- visor ---------- */
function openViewer(id, forceXml) {
  const i = S.invoices.find((x) => x.id === id);
  if (!i) return;
  showFile({ title: i.supplier || i.fileName || 'Factura', fileId: forceXml ? i.xmlId : i.fileId, fileType: forceXml ? 'application/xml' : i.fileType });
}
async function showFile({ title, fileId, fileType }) {
  if (!fileId) return;
  const v = $('#viewer');
  const token = Symbol('v');
  v._token = token;
  const showXml = fileType === 'application/xml';
  const pdf = fileType === 'application/pdf';
  v.innerHTML = `<div class="viewer-h"><span>${esc(title)}</span><button type="button" class="icon-btn" data-act="viewer-close" aria-label="Cerrar">${ICON.close}</button></div><div class="viewer-b" id="viewer-b">${showXml || pdf ? '<p class="viewer-msg">Abriendo…</p>' : `<img src="${esc(assetUrl(fileId))}" alt="${esc(title)}">`}</div>`;
  v.hidden = false;
  lockBody();
  try {
    if (showXml) {
      const text = await (await getBlob(fileId)).text();
      const x = RD.parseEcfXml(text) || {};
      const rows = [['e-NCF', x.encf], ['Tipo', x.encf ? RD.parseNcf(x.encf).label : ''], ['Emisor', x.emisor], ['RNC emisor', RD.fmtRnc(x.rncEmisor)], ['Fecha de emisión', fmtDate(x.fecha)], ['Comprador', x.comprador], ['RNC comprador', RD.fmtRnc(x.rncComprador)], ['ITBIS', isNum(x.itbis) ? money(x.itbis, 'DOP') : ''], ['Total', isNum(x.total) ? money(x.total, 'DOP') : '']].filter((r) => r[1]);
      if (v._token !== token) return;
      $('#viewer-b').innerHTML = `<div class="xml-card"><h3>Factura electrónica (e-CF)</h3><dl>${rows.map(([k, val]) => `<dt>${esc(k)}</dt><dd>${esc(val)}</dd>`).join('')}</dl><details><summary>Ver el XML completo</summary><pre>${esc(text.slice(0, 200000))}</pre></details></div>`;
      return;
    }
    if (!pdf) return;
    const bytes = await (await getBlob(fileId)).arrayBuffer();
    const doc = await openPdf(bytes);
    const body = $('#viewer-b');
    if (v._token !== token) return;
    body.innerHTML = '';
    const w = Math.min(1800, Math.max(600, (body.clientWidth || 800) * Math.min(2, window.devicePixelRatio || 1)));
    for (let n = 1; n <= doc.numPages; n++) {
      if (v._token !== token || v.hidden) break;
      const c = await renderPdfCanvas(doc, n, w);
      c.className = 'viewer-page';
      body.appendChild(c);
    }
  } catch (e) {
    console.error(e);
    if (v._token === token) $('#viewer-b').innerHTML = '<p class="viewer-msg">No se pudo abrir el archivo.</p>';
  }
}
function closeViewer() { const v = $('#viewer'); v._token = null; v.hidden = true; v.innerHTML = ''; lockBody(); }

/* ---------- agregar y leer facturas ---------- */
function pickFiles() { if (!canUpload()) return; $('#file-input').click(); }
let qKey = 0, pumping = false, persistAsked = false;
function addFiles(files) {
  if (!canUpload()) { toast('Espera a que carguen tus datos.'); return; }
  const list = [...files].filter((f) => f && f.size > 0);
  if (!list.length) return;
  const projectId = S.projectFilter !== 'all' && S.projectFilter !== 'none' ? S.projectFilter : null;
  for (const f of list) S.queue.push({ key: ++qKey, file: f, name: f.name || 'archivo', state: 'espera', msg: '', invId: null, done: false, projectId });
  if (S.tab !== 'facturas') { S.tab = 'facturas'; S.paymentId = null; }
  if (S.filter === 'pagadas' || S.filter === 'tramite') S.filter = 'pendientes';
  renderAll();
  renderQueue();
  if (!persistAsked) { persistAsked = true; RT.persist(); }
  pump();
}
function setQ(item, state, msg) { item.state = state; if (msg !== undefined) item.msg = msg; renderQueue(); }
function finishQ(item, state, msg) {
  item.done = true;
  setQ(item, state, msg || '');
  if (S.queue.every((x) => x.done) && S.queue.every((x) => ['lista', 'qr', 'xml'].includes(x.state))) {
    setTimeout(() => { if (S.queue.every((x) => x.done)) { S.queue = S.queue.filter((x) => !['lista', 'qr', 'xml'].includes(x.state)); renderQueue(); } }, 5000);
  }
  scheduleRender();
}
async function pump() {
  if (pumping) return;
  pumping = true;
  try { let item; while ((item = S.queue.find((x) => x.state === 'espera'))) await addOne(item); } finally { pumping = false; }
}
const hasText = (t) => String(t || '').replace(/\s+/g, '').length >= 40;
function qrFields(qr) {
  const f = { fiscal: 'qr', qrUrl: qr.url };
  if (qr.rncEmisor) f.rnc = qr.rncEmisor;
  if (qr.encf) f.number = qr.encf;
  if (qr.fecha && ymd(qr.fecha)) f.date = qr.fecha;
  if (isNum(qr.monto)) f.amount = round2(qr.monto);
  if (qr.rncComprador) f.buyerRnc = qr.rncComprador;
  if (qr.codigo) f.secCode = qr.codigo;
  return f;
}
async function addOne(item) {
  const f = item.file;
  try {
    setQ(item, 'preparando');
    const name = String(f.name || '');
    const type = String(f.type || '').toLowerCase();
    const isXml = type.includes('xml') || /\.xml$/i.test(name);
    const isPdf = !isXml && (type === 'application/pdf' || /\.pdf$/i.test(name));
    const isImg = !isXml && !isPdf && (type.startsWith('image/') || /\.(jpe?g|png|webp|gif|heic|heif|bmp)$/i.test(name));
    if (!isXml && !isPdf && !isImg) throw new UserError('Solo se pueden agregar fotos, PDF o XML de factura electrónica');
    if (isXml) { await addXml(item, f); return; }
    let blob, ftype, thumb = null, text = '', pages = 1, aiImage = null, qr = null;
    if (isPdf) {
      if (f.size > 25 * 1048576) throw new UserError('El PDF pesa más de 25 MB');
      const bytes = await f.arrayBuffer();
      blob = new Blob([bytes], { type: 'application/pdf' });
      ftype = 'application/pdf';
      try { const r = await inspectPdf(bytes); pages = r.pages; text = r.text; thumb = r.thumb; qr = r.qr; } catch (e) { console.warn('PDF', e); }
      if (thumb && !hasText(text)) aiImage = thumb;
    } else {
      const r = await prepImage(f);
      blob = r.blob; qr = r.qr; ftype = 'image/jpeg'; aiImage = blob;
    }
    setQ(item, 'subiendo');
    // Si ya existe la misma factura electrónica cargada por XML, se le agrega la foto o el PDF.
    const twin = qr && qr.encf ? S.invoices.find((x) => x.fileType === 'application/xml' && RD.normNcf(x.number) === qr.encf) : null;
    const up = await assets.upload(blob, { type: ftype });
    let thumbId = null;
    if (thumb) { try { thumbId = (await assets.upload(thumb, { type: 'image/jpeg' })).id; } catch (e) { console.warn('miniatura', e); } }
    if (twin) {
      await dbw(() => db.doc('invoices/' + twin.id).update({ fileId: up.id, fileType: ftype, thumbId, pages, fileName: name.slice(0, 120), xmlId: twin.xmlId || twin.fileId, qrUrl: qr.url, secCode: qr.codigo || '' }));
      item.invId = twin.id;
      finishQ(item, 'qr');
      return;
    }
    const willRead = ai.hasKey() && (!!aiImage || hasText(text));
    const doc = {
      projectId: item.projectId || null, supplier: '', rnc: '', number: '', date: '', amount: null, itbis: null, currency: 'DOP',
      concept: '', ref: '', buyerRnc: '', qrUrl: '', secCode: '', fiscal: '', notInvoice: false,
      fileId: up.id, fileType: ftype, thumbId, pages, fileName: name.slice(0, 120), xmlId: null,
      createdAt: new Date().toISOString(), ai: willRead ? 'pending' : 'off',
    };
    if (qr) Object.assign(doc, qrFields(qr));
    const ref = db.collection('invoices').doc();
    await dbw(() => ref.set(doc));
    item.invId = ref.id;
    item.file = null;
    if (willRead) {
      setQ(item, 'leyendo');
      enqueueAI({ invId: ref.id, input: { image: aiImage, text } }).then((r) => finishQ(item, r === 'done' ? (qr ? 'qr' : 'lista') : qr ? 'qr' : 'manual'));
    } else finishQ(item, qr ? 'qr' : 'manual');
  } catch (e) {
    if (e instanceof UserError) console.warn(e.message); else console.error(e);
    finishQ(item, 'error', upErr(e));
  }
}
async function addXml(item, f) {
  const text = await f.text();
  const x = RD.parseEcfXml(text);
  if (!x) throw new UserError('Este XML no es una factura electrónica (e-CF)');
  setQ(item, 'subiendo');
  const up = await assets.upload(new Blob([text], { type: 'application/xml' }), { type: 'application/xml' });
  const fields = { fiscal: 'xml', number: x.encf, currency: 'DOP' };
  if (x.vence) fields.ncfExpiry = x.vence;
  if (x.rncEmisor) fields.rnc = x.rncEmisor;
  if (x.fecha) fields.date = x.fecha;
  if (isNum(x.total)) fields.amount = round2(x.total);
  if (isNum(x.itbis)) fields.itbis = round2(x.itbis);
  if (x.rncComprador) fields.buyerRnc = x.rncComprador;
  const same = S.invoices.find((i) => RD.normNcf(i.number) === x.encf && (!i.rnc || RD.normRnc(i.rnc) === x.rncEmisor));
  if (same) {
    const upd = { ...fields, xmlId: up.id };
    if (!same.supplier && x.emisor) upd.supplier = x.emisor.slice(0, 120);
    await dbw(() => db.doc('invoices/' + same.id).update(upd));
    item.invId = same.id;
    finishQ(item, 'xml');
    return;
  }
  const ref = db.collection('invoices').doc();
  await dbw(() => ref.set({
    projectId: item.projectId || null, supplier: (x.emisor || '').slice(0, 120), rnc: '', number: '', date: '', amount: null, itbis: null,
    concept: '', ref: '', buyerRnc: '', qrUrl: '', secCode: '', notInvoice: false, ...fields,
    fileId: up.id, fileType: 'application/xml', thumbId: null, pages: 1, fileName: String(f.name || '').slice(0, 120), xmlId: up.id,
    createdAt: new Date().toISOString(), ai: 'off',
  }));
  item.invId = ref.id;
  item.file = null;
  finishQ(item, 'xml');
}

const aiJobs = [];
let aiRunning = 0;
function enqueueAI(job) { return new Promise((res) => { aiJobs.push({ ...job, res }); runAI(); }); }
function runAI() {
  while (aiRunning < 2 && aiJobs.length) {
    const job = aiJobs.shift();
    aiRunning++;
    readWithAI(job.invId, job.input).catch((e) => { console.error(e); return 'failed'; }).then((r) => { aiRunning--; job.res(r); runAI(); });
  }
}
const AI_FIELDS = ['es_factura', 'proveedor', 'rnc_proveedor', 'ncf', 'ncf_vence', 'fecha', 'itbis', 'total', 'moneda', 'concepto', 'proyecto', 'rnc_cliente', 'referencia'];
const AI_SCHEMA = {
  type: 'object',
  properties: {
    es_factura: { type: 'boolean' }, proveedor: { type: 'string' }, rnc_proveedor: { type: 'string' }, ncf: { type: 'string' }, ncf_vence: { type: 'string' },
    fecha: { type: 'string' }, itbis: { type: 'string' }, total: { type: 'string' }, moneda: { type: 'string', enum: ['DOP', 'USD', 'EUR', ''] },
    concepto: { type: 'string' }, proyecto: { type: 'string' }, rnc_cliente: { type: 'string' }, referencia: { type: 'string' },
  },
  required: AI_FIELDS,
  additionalProperties: false,
};
function buildPrompt(text, withImage) {
  const names = S.projects.map((p) => p.name).filter(Boolean);
  const t = String(text || '').trim();
  const companyRnc = RD.normRnc(S.settings.companyRnc);
  return [
    'Lee esta factura de República Dominicana y saca sus datos para registrarla en una relación de pagos de una constructora.',
    withImage ? 'La imagen adjunta es una foto o captura de la factura (o nota/recibo) que mandó el proveedor.' : `Este es el texto de la factura en PDF:\n<<<\n${t.slice(0, 9000)}\n>>>`,
    withImage && t ? `Texto que se pudo sacar del mismo archivo (puede estar incompleto):\n<<<\n${t.slice(0, 4000)}\n>>>` : '',
    'Proyectos u obras que ya existen: ' + (names.length ? JSON.stringify(names.slice(0, 200)) : '(todavía ninguno)'),
    companyRnc ? `RNC de la empresa que recibe y paga la factura: ${companyRnc}.` : '',
    'Llena cada campo así (usa "" si el dato no aparece):',
    '- proveedor: nombre o razón social de quien emite y cobra la factura.',
    '- rnc_proveedor: RNC (9 dígitos) o cédula (11 dígitos) del proveedor, solo números.',
    '- ncf: el NCF (B y 10 dígitos, ej. B0100004521) o e-NCF (E y 12 dígitos, ej. E310000000123), sin espacios ni guiones. Algunos sistemas lo imprimen con ceros delante (ej. 00000000B0100003467): devuelve solo B0100003467.',
    '- ncf_vence: la fecha de vencimiento del NCF ("Válida hasta" o "Vencimiento"), en AAAA-MM-DD.',
    '- fecha: fecha de emisión en formato AAAA-MM-DD (en la factura suele estar como DD/MM/AAAA).',
    '- itbis: total de ITBIS facturado, solo el número con punto decimal (ej. 2880.00).',
    '- total: el total de la factura que aparece al pie (Total DOP, Total RD$ o Total a pagar), solo el número con punto decimal. No uses "Balance" ni "Saldo": ese es el saldo de la cuenta del cliente, no el total de esta factura.',
    '- moneda: "DOP" si está en pesos (RD$), "USD" si está en dólares (US$).',
    '- concepto: qué se está cobrando, máximo 80 caracteres.',
    '- proyecto: la obra o proyecto; suele venir en campos como Nota, Obra, Proyecto o Referencia (ej. "Nota: CAPERUZA 2"). Si coincide con uno de los proyectos que ya existen (aunque esté escrito distinto, por ejemplo "caperuza II" y "Caperuza 2"), escribe el nombre exactamente como está en la lista; si no, escríbelo tal cual.',
    '- rnc_cliente: RNC del cliente o comprador al que va dirigida la factura, solo números.',
    '- referencia: número de orden de compra (OC), contrato o cubicación, si aparece, con su etiqueta (ej. "OC-0012" o "Cubicación 4").',
    '- es_factura: false solo si el archivo claramente no es una factura, nota ni recibo.',
  ].filter(Boolean).join('\n');
}
function matchProject(name) {
  const n = projKey(name);
  if (!n) return null;
  let best = null;
  for (const p of S.projects) {
    const pn = projKey(p.name);
    if (!pn) continue;
    if (pn === n) return p;
    if (!best && ((pn.length >= 4 && n.includes(pn)) || (n.length >= 4 && pn.includes(n)))) best = p;
  }
  return best;
}
function parseAI(out, inv) {
  const o = out && typeof out === 'object' && !Array.isArray(out) ? out : {};
  const s = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : typeof v === 'number' ? String(v) : '');
  const official = inv && (inv.fiscal === 'qr' || inv.fiscal === 'xml');
  const keep = (field) => official && inv[field] !== '' && inv[field] != null;
  const upd = { ai: 'done', notInvoice: o.es_factura === false };
  const sup = s(o.proveedor, 120); if (sup && !(inv && inv.supplier)) upd.supplier = sup;
  const rnc = RD.normRnc(o.rnc_proveedor); if ((rnc.length === 9 || rnc.length === 11) && !keep('rnc')) upd.rnc = rnc;
  const ncf = RD.normNcf(o.ncf); if (ncf && !keep('number')) upd.number = ncf;
  let venc = s(o.ncf_vence, 10); if (!ymd(venc)) venc = RD.dmyToIso(venc); if (ymd(venc) && !keep('ncfExpiry')) upd.ncfExpiry = venc;
  let f = s(o.fecha, 10);
  if (!ymd(f)) f = RD.dmyToIso(f);
  if (ymd(f) && !keep('date')) upd.date = f;
  const tot = parseAmount(s(o.total, 40)); if (isNum(tot) && tot >= 0 && tot < 1e12 && !keep('amount')) upd.amount = round2(tot);
  const itb = parseAmount(s(o.itbis, 40)); if (isNum(itb) && itb >= 0 && itb < 1e12 && !keep('itbis')) upd.itbis = round2(itb);
  if (o.moneda && !official) upd.currency = normCur(o.moneda);
  const con = s(o.concepto, 140); if (con) upd.concept = con;
  const buyer = RD.normRnc(o.rnc_cliente); if ((buyer.length === 9 || buyer.length === 11) && !keep('buyerRnc')) upd.buyerRnc = buyer;
  const pname = s(o.proyecto, 80);
  const hasProject = inv && inv.projectId && S.projects.some((p) => p.id === inv.projectId);
  if (pname && !hasProject) { const m = matchProject(pname); if (m) { upd.projectId = m.id; upd.projectHint = ''; } else upd.projectHint = pname; }
  // Si la factura menciona su orden de compra (ej. "OC-0012"), queda enlazada; si no tenía obra, toma la de la orden.
  const refx = s(o.referencia, 60);
  const pid = upd.projectId || (hasProject ? inv.projectId : null);
  const ordRef = refx && !(inv && inv.orderId) ? matchOrderRef(refx, pid) : null;
  if (ordRef) { upd.orderId = ordRef.id; if (!pid && ordRef.projectId) { upd.projectId = ordRef.projectId; upd.projectHint = ''; } }
  else if (refx && !(inv && inv.ref)) upd.ref = refx;
  return upd;
}
async function readWithAI(invId, input) {
  const ref = db.doc('invoices/' + invId);
  const useImg = !!input.image;
  if (!ai.hasKey() || (!useImg && !hasText(input.text))) { await ref.update({ ai: 'off' }).catch(() => {}); return 'off'; }
  let out;
  try {
    out = await ai.json(buildPrompt(input.text, useImg), { images: useImg ? [input.image] : [], schema: AI_SCHEMA });
  } catch (e) {
    console.warn('lectura', e);
    if (e && e.code === 'bad_key') { S.aiState = 'badkey'; scheduleRender(); }
    await ref.update({ ai: e && e.code === 'no_key' ? 'off' : 'failed' }).catch(() => {});
    return 'failed';
  }
  if (S.aiState === 'badkey') { S.aiState = 'ok'; scheduleRender(); }
  const cur = S.invoices.find((x) => x.id === invId);
  if (!cur) return 'failed';
  await dbw(() => ref.update(parseAI(out, cur))).catch((e) => console.error(e));
  return 'done';
}
async function rereadInvoice(id, btn) {
  const i = S.invoices.find((x) => x.id === id);
  if (!i) return;
  if (!ai.hasKey()) { openSettings(); return; }
  btn.disabled = true;
  btn.textContent = 'Leyendo…';
  try {
    let input = { image: null, text: '' };
    if (i.fileType === 'application/pdf') {
      const r = await inspectPdf(await (await getBlob(i.fileId)).arrayBuffer());
      input = { text: r.text, image: hasText(r.text) ? null : r.thumb };
    } else if (i.fileType && i.fileType.startsWith('image/')) input.image = await getBlob(i.fileId);
    else { toast('Esta factura viene del XML; no hace falta leerla.'); return; }
    await db.doc('invoices/' + id).update({ ai: 'pending' });
    if (S.sheet && S.sheet.type === 'inv' && S.sheet.id === id) S.sheet.dirty = false;
    const r = await enqueueAI({ invId: id, input });
    toast(r === 'done' ? 'Listo: datos leídos otra vez' : 'No se pudo leer esta factura');
  } catch (e) {
    console.error(e);
    toast('No se pudo leer esta factura');
    await db.doc('invoices/' + id).update({ ai: 'failed' }).catch(() => {});
  }
}

/* ---------- acciones de datos ---------- */
async function ensureProject(name) {
  const clean = String(name || '').trim().slice(0, 80);
  if (!clean) return null;
  const m = S.projects.find((p) => projKey(p.name) === projKey(clean));
  if (m) return m.id;
  const ref = db.collection('projects').doc();
  await dbw(() => ref.set({ name: clean, createdAt: new Date().toISOString() }));
  return ref.id;
}
async function saveInvoice(form) {
  const id = form.dataset.id;
  const inv = S.invoices.find((x) => x.id === id);
  if (!inv) return;
  const btn = $('#inv-save');
  btn.disabled = true;
  try {
    let projectId = $('#f-proj').value;
    if (projectId === '__new') {
      const name = $('#f-newproj').value.trim();
      if (!name) { toast('Escribe el nombre del proyecto nuevo.'); $('#f-newproj').focus(); btn.disabled = false; return; }
      projectId = await ensureProject(name);
    }
    const amtRaw = $('#f-amt').value.trim(), itbRaw = $('#f-itbis').value.trim();
    const amt = parseAmount(amtRaw), itb = parseAmount(itbRaw);
    if ((amtRaw && amt == null) || (itbRaw && itb == null)) { toast('Revisa los montos: escribe solo números.'); btn.disabled = false; return; }
    const date = $('#f-date').value;
    const upd = {
      projectId: projectId || null,
      supplier: $('#f-sup').value.trim().slice(0, 120),
      rnc: RD.normRnc($('#f-rnc').value).slice(0, 11),
      number: RD.normNcf($('#f-num').value).slice(0, 19),
      date: ymd(date) ? date : '',
      amount: amt == null ? null : round2(amt),
      itbis: itb == null ? null : round2(itb),
      currency: normCur($('#f-cur').value),
      concept: $('#f-con').value.trim().slice(0, 140),
      ref: $('#f-ref').value.trim().slice(0, 60),
      orderId: $('#f-order') ? $('#f-order').value || null : inv.orderId || null,
      notInvoice: false,
    };
    if (upd.projectId) upd.projectHint = '';
    if (inv.ai === 'pending' || inv.ai === 'failed') upd.ai = 'off';
    await dbw(() => db.doc('invoices/' + id).update(upd));
    closeSheet();
    toast('Factura guardada');
  } catch (e) {
    console.error(e);
    toast(dbErr(e));
    btn.disabled = false;
  }
}
async function deleteInvoice(id) {
  const i = derive().invoices.find((x) => x.id === id);
  if (!i) return;
  if (i.status === 'pagada') { toast('Esta factura ya está pagada; no se puede eliminar.'); return; }
  const ok = await write(async () => {
    if (i.pay) await db.doc('payments/' + i.pay.id).update({ invoiceIds: (i.pay.invoiceIds || []).filter((x) => x !== id) });
    await db.doc('invoices/' + id).delete();
  }, 'Factura eliminada');
  if (!ok) return;
  closeSheet();
  for (const a of new Set([i.fileId, i.thumbId, i.xmlId])) if (a) { try { await assets.delete(a); } catch (e) { console.warn(e); } }
}
async function createPayment(name, date, ids) {
  const ref = db.collection('payments').doc();
  const ok = await write(() => ref.set({ name: String(name || '').trim().slice(0, 80) || 'Pago ' + fmtDate(todayISO()), date: ymd(date) ? date : todayISO(), status: 'armando', invoiceIds: ids, createdAt: new Date().toISOString() }), 'Pago creado');
  if (ok) { closeSheet(); S.tab = 'pagos'; S.paymentId = ref.id; S.payDel = false; renderAll(); window.scrollTo(0, 0); }
}
async function addToPayment(payId, ids) {
  const pay = S.payments.find((p) => p.id === payId);
  if (!pay) return;
  const free = new Set(derive().invoices.filter((i) => i.status === 'pendiente').map((i) => i.id));
  const next = [...new Set([...(pay.invoiceIds || []), ...ids.filter((x) => free.has(x))])];
  if (await write(() => db.doc('payments/' + payId).update({ invoiceIds: next }), plural(ids.length, 'factura agregada', 'facturas agregadas'))) closeSheet();
}
async function setPayStatus(payId, s) {
  const pay = S.payments.find((p) => p.id === payId);
  if (!pay || !PAY_LABEL[s]) return;
  const upd = { status: s };
  if (s === 'armando') { upd.presentedAt = ''; upd.paidAt = ''; }
  if (s === 'presentado') { upd.paidAt = ''; if (pay.status === 'armando' || !pay.presentedAt) upd.presentedAt = todayISO(); }
  if (s === 'pagado') upd.paidAt = todayISO();
  await write(() => db.doc('payments/' + payId).update(upd), { presentado: 'Marcado como presentado', pagado: 'Marcado como pagado', armando: 'Regresó a por presentar' }[s]);
}
async function removeFromPayment(payId, invId) {
  const pay = S.payments.find((p) => p.id === payId);
  if (pay) await write(() => db.doc('payments/' + payId).update({ invoiceIds: (pay.invoiceIds || []).filter((x) => x !== invId) }), 'Factura quitada del pago');
}
async function deletePayment(payId) {
  if (await write(() => db.doc('payments/' + payId).delete(), 'Pago eliminado')) { S.paymentId = null; S.payDel = false; renderAll(); }
}

/* ---------- órdenes de compra ---------- */
function itemRowHTML(it, n, dis) {
  return `<div class="o-row" data-row><span class="o-n mono">${n}</span><input data-f="qty" class="mono" inputmode="decimal" maxlength="12" placeholder="Cant." aria-label="Cantidad" value="${esc(it.qty != null ? String(it.qty) : '')}" ${dis}><input data-f="unit" list="dl-units" maxlength="20" placeholder="Unidad" aria-label="Unidad" value="${esc(it.unit || '')}" ${dis}><input data-f="desc" maxlength="160" placeholder="Descripción y especificaciones" aria-label="Descripción" value="${esc(it.desc || '')}" ${dis}>${dis ? '' : `<button type="button" class="icon-btn plain" data-act="order-rm-item" aria-label="Quitar artículo">${ICON.close}</button>`}</div>`;
}
function uniqList(list) { const seen = new Set(); const out = []; for (const v of list) { const s = String(v || '').trim(); const k = norm(s); if (s && !seen.has(k)) { seen.add(k); out.push(s); } } return out; }
function orderSig(o, D) { return JSON.stringify([o.status, o.signedFileId, o.signedAt, o.updatedAt, o.number, (D.invByOrder.get(o.id) || []).map((i) => [i.id, i.supplier, i.number, i.amount])]); }
function refreshOrderSheet(D) {
  const sh = S.sheet;
  if (!sh || sh.type !== 'order' || !sh.id || sh.dirty) return;
  const o = D.orderById.get(sh.id);
  if (!o) { if (S.got.orders && sh.sig) closeSheet(); return; }
  if (orderSig(o, D) !== sh.sig) openOrder(o.id, true);
}
function openOrder(id, keepScroll) {
  const D = derive();
  const o = id ? D.orderById.get(id) : null;
  if (id && !o) return;
  const edit = canEdit() && (!o || o.status !== 'anulada');
  const dis = edit ? '' : 'disabled';
  const projId = o ? o.projectId : S.projectFilter !== 'all' && S.projectFilter !== 'none' ? S.projectFilter : '';
  const prevPlace = (pid) => { const p = D.orders.find((x) => x.projectId === pid && x.place); return p ? p.place : ''; };
  const data = o || { number: nextOrderNumber(), date: todayISO(), projectId: projId, requestedBy: '', supplier: '', neededDate: '', place: projId ? prevPlace(projId) : '', department: (D.orders[0] && D.orders[0].department) || '', items: [], notes: '' };
  const items = (data.items || []).slice();
  if (edit) for (let k = Math.max(1, 3 - items.length); k > 0; k--) items.push({});
  const opts = D.projects.map((p) => `<option value="${esc(p.id)}"${p.id === data.projectId ? ' selected' : ''}>${esc(p.name)}</option>`).join('');
  const invs = o ? D.invByOrder.get(o.id) || [] : [];
  const dl = (idn, arr) => `<datalist id="${idn}">${arr.map((v) => `<option value="${esc(v)}"></option>`).join('')}</datalist>`;
  const signed = o && o.signedFileId;
  const signedThumb = signed ? o.signedThumbId || (String(o.signedFileType).startsWith('image/') ? o.signedFileId : null) : null;
  const statusText = !o ? '' : o.status === 'autorizada' ? 'Firmada y sellada' + (o.signedAt ? ' el ' + fmtDate(o.signedAt) : '') + '.' : o.status === 'enviada' ? 'Falta adjuntar la copia firmada y sellada.' : o.status === 'anulada' ? 'Esta orden está anulada.' : 'Todavía no has sacado el PDF.';
  const fill = edit && ai.hasKey() ? `<details class="edit" id="o-fill"><summary>Llenar desde el mensaje del pedido</summary><div class="fields"><div class="field full"><label for="o-msg">Pega aquí el mensaje (por ejemplo, de WhatsApp)</label><textarea id="o-msg" rows="4" maxlength="4000" placeholder="Ej.: Necesito para mañana en Caperuza 2: 10 fundas de cemento, 20 varillas de 3/8 y 2 galones de pintura blanca"></textarea></div><div class="actions full"><button type="button" class="btn" data-act="order-fill">Llenar con el mensaje</button><button type="button" class="btn" data-act="order-fill-photo">Usar una foto de la lista</button></div><p class="usage full" id="o-fill-status"></p></div></details>` : '';
  const signedBox = o ? `<div class="card"><h2>Orden firmada y sellada</h2>${signed ? `<button type="button" class="preview" data-act="order-view-signed" data-id="${esc(o.id)}">${signedThumb ? `<img src="${esc(assetUrl(signedThumb))}" alt="">` : '<span class="ph">PDF</span>'}<span class="preview-tag">Ver</span></button>` : '<p class="hint">Cuando la firmen y la sellen, tómale una foto y adjúntala. Esa copia es la que va con la factura en el PDF del pago.</p>'}${edit ? `<div><button type="button" class="btn" data-act="order-signed">${ICON.plus} ${signed ? 'Cambiar la copia firmada' : 'Adjuntar la orden firmada'}</button></div>` : ''}</div>` : '';
  const invBox = invs.length ? `<div class="card"><h2>Facturas de esta orden</h2><div class="list">${invs.map((i) => `<button type="button" class="link" data-act="open-inv" data-id="${esc(i.id)}">${esc((i.supplier || 'Factura') + (i.number ? ' · ' + RD.normNcf(i.number) : '') + ' · ' + money(i.amount, i.currency))}</button>`).join('')}</div></div>` : '';
  const prevScroll = keepScroll && $('.sheet-b') ? $('.sheet-b').scrollTop : 0;
  const danger = o && canEdit() ? `<div>${invs.length ? (o.status !== 'anulada' ? '<button type="button" class="btn danger sm" data-act="order-annul">Anular orden</button>' : '') : `<button type="button" class="btn danger sm" data-act="order-del">${ICON.trash} Eliminar orden</button>`}</div><div id="o-confirm" hidden></div>` : '';
  openSheet(`<form id="order-form" data-id="${o ? esc(o.id) : ''}" autocomplete="off">${sheetHead(o ? esc(orderNo(o)) : 'Nueva orden de compra')}
    <div class="sheet-b">
      ${o ? `<div class="status-line"><span class="pill o-${o.status}">${ORDER_LABEL[o.status]}</span><span>${esc(statusText)}</span></div>` : ''}
      ${fill}
      <div class="fields">
        <div class="field"><label for="o-no">No. de orden</label><input id="o-no" class="mono" value="${esc(orderNo(data))}" disabled></div>
        <div class="field"><label for="o-date">Fecha</label><input id="o-date" type="date" value="${esc(data.date || '')}" ${dis}></div>
        <div class="field full"><label for="o-proj">Proyecto / obra</label><select id="o-proj" ${dis}><option value="">Elige la obra</option>${opts}</select></div>
        <div class="field"><label for="o-by">Solicitado por</label><input id="o-by" list="dl-people" maxlength="80" value="${esc(data.requestedBy || '')}" ${dis}></div>
        <div class="field"><label for="o-dept">Departamento</label><input id="o-dept" list="dl-depts" maxlength="60" value="${esc(data.department || '')}" ${dis}></div>
        <div class="field full"><label for="o-sup">Proveedor</label><input id="o-sup" list="dl-sups" maxlength="120" value="${esc(data.supplier || '')}" ${dis}></div>
        <div class="field"><label for="o-need">Fecha requerida</label><input id="o-need" type="date" value="${esc(data.neededDate || '')}" ${dis}></div>
        <div class="field"><label for="o-place">Lugar de entrega</label><input id="o-place" maxlength="120" value="${esc(data.place || '')}" ${dis}></div>
      </div>
      <h3 class="h2">Artículos o materiales</h3>
      <div id="o-items" class="o-items">${items.map((it, k) => itemRowHTML(it, k + 1, dis)).join('')}</div>
      ${edit ? `<div><button type="button" class="btn sm" data-act="order-add-item">${ICON.plus} Agregar artículo</button></div>` : ''}
      <div class="field"><label for="o-notes">Observaciones / instrucciones especiales</label><textarea id="o-notes" rows="2" maxlength="300" ${dis}>${esc(data.notes || '')}</textarea></div>
      ${signedBox}
      ${invBox}
      ${danger}
    </div>
    <div class="sheet-f">${edit ? '<button type="submit" class="btn">Guardar</button>' : ''}<button type="button" class="btn primary" data-act="order-pdf">${ICON.down} ${edit ? 'Guardar y sacar PDF' : 'Sacar PDF'}</button></div>
  </form>${dl('dl-units', uniqList([...UNITS, ...D.orders.flatMap((x) => (x.items || []).map((it) => it.unit))]))}${dl('dl-people', uniqList(D.orders.map((x) => x.requestedBy)))}${dl('dl-sups', uniqList([...D.orders.map((x) => x.supplier), ...S.invoices.map((x) => x.supplier)]))}${dl('dl-depts', uniqList(D.orders.map((x) => x.department)))}`, { type: 'order', id: o ? o.id : null, dirty: false, sig: o ? orderSig(o, D) : null });
  if (keepScroll && $('.sheet-b')) $('.sheet-b').scrollTop = prevScroll;
}
function renumberItems() { $$('#o-items [data-row]').forEach((r, k) => { r.querySelector('.o-n').textContent = String(k + 1); }); }
function addItemRow(it = {}) { const box = $('#o-items'); if (!box) return; box.insertAdjacentHTML('beforeend', itemRowHTML(it, box.children.length + 1, '')); renumberItems(); }
function collectItems() {
  return $$('#o-items [data-row]').map((r) => {
    const qtyRaw = r.querySelector('[data-f="qty"]').value.trim();
    const qty = /^\d+([.,]\d+)?$/.test(qtyRaw) ? parseAmount(qtyRaw) : qtyRaw.slice(0, 12);
    return { qty, unit: r.querySelector('[data-f="unit"]').value.trim().slice(0, 20), desc: r.querySelector('[data-f="desc"]').value.trim().slice(0, 160) };
  }).filter((x) => x.desc || x.qty !== '');
}
async function saveOrder(thenPdf) {
  const f = $('#order-form');
  if (!f) return null;
  const id = f.dataset.id;
  const prev = id ? S.orders.find((x) => x.id === id) : null;
  if (prev && prev.status === 'anulada') { if (thenPdf) await makeOrderPdf(prev); return prev; }
  const items = collectItems();
  const projectId = $('#o-proj').value;
  if (!projectId) { toast('Elige el proyecto u obra.'); $('#o-proj').focus(); return null; }
  if (!items.length) { toast('Agrega al menos un artículo.'); return null; }
  const date = $('#o-date').value, need = $('#o-need').value;
  const data = {
    date: ymd(date) ? date : todayISO(), projectId,
    requestedBy: $('#o-by').value.trim().slice(0, 80), department: $('#o-dept').value.trim().slice(0, 60),
    supplier: $('#o-sup').value.trim().slice(0, 120), neededDate: ymd(need) ? need : '', place: $('#o-place').value.trim().slice(0, 120),
    items: items.slice(0, 200), notes: $('#o-notes').value.trim().slice(0, 300), updatedAt: new Date().toISOString(),
  };
  let full = null;
  const ok = await write(async () => {
    if (prev) { await db.doc('orders/' + id).update(data); full = { ...prev, ...data }; }
    else {
      const ref = db.collection('orders').doc();
      full = { ...data, number: nextOrderNumber(), status: 'borrador', createdAt: new Date().toISOString() };
      await ref.set(full);
      full.id = ref.id;
    }
  }, thenPdf ? '' : 'Orden guardada');
  if (!ok) return null;
  if (S.sheet && S.sheet.type === 'order') { S.sheet.dirty = false; S.sheet.id = full.id; f.dataset.id = full.id; }
  if (thenPdf) await makeOrderPdf(full); else closeSheet();
  return full;
}
async function orderPdfAction() {
  const f = $('#order-form');
  if (!f) return;
  if (canEdit()) { await saveOrder(true); return; }
  const o = S.orders.find((x) => x.id === f.dataset.id);
  if (o) makeOrderPdf(o);
}
async function makeOrderPdf(o) {
  try {
    const bytes = await buildOrderPdf(o);
    if (canEdit() && (!o.status || o.status === 'borrador')) await db.doc('orders/' + o.id).update({ status: 'enviada' }).catch(() => {});
    deliverFile(new Blob([bytes], { type: 'application/pdf' }), fileSafe(`Orden de compra ${orderNo(o)}${o.supplier ? ' - ' + o.supplier : ''}`) + '.pdf');
  } catch (e) {
    console.error(e);
    toast('No se pudo preparar el PDF de la orden.');
  }
}
function orderConfirm(text, act, label) {
  const box = $('#o-confirm');
  if (!box) return;
  box.hidden = false;
  box.innerHTML = `<div class="confirm"><p>${esc(text)}</p><div class="actions"><button type="button" class="btn danger solid" data-act="${act}">${esc(label)}</button><button type="button" class="btn" data-act="order-confirm-no">Cancelar</button></div></div>`;
  box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
async function deleteOrder(id) {
  const o = S.orders.find((x) => x.id === id);
  if (!o) return;
  if (S.invoices.some((i) => i.orderId === id)) { toast('Tiene facturas enlazadas; mejor anúlala.'); return; }
  if (!(await write(() => db.doc('orders/' + id).delete(), 'Orden eliminada'))) return;
  closeSheet();
  for (const a of [o.signedFileId, o.signedThumbId]) if (a) { try { await assets.delete(a); } catch (e) { /* ya no existe */ } }
}
async function attachSigned(orderId, file) {
  const o = S.orders.find((x) => x.id === orderId);
  if (!o) return;
  toast('Guardando la copia firmada…');
  try {
    const name = String(file.name || ''), type = String(file.type || '').toLowerCase();
    const isPdf = type === 'application/pdf' || /\.pdf$/i.test(name);
    let blob, ftype, thumbId = null;
    if (isPdf) {
      const bytes = await file.arrayBuffer();
      blob = new Blob([bytes], { type: 'application/pdf' });
      ftype = 'application/pdf';
      try { const r = await inspectPdf(bytes); thumbId = (await assets.upload(r.thumb, { type: 'image/jpeg' })).id; } catch (e) { console.warn('miniatura', e); }
    } else {
      blob = (await prepImage(file)).blob;
      ftype = 'image/jpeg';
    }
    const up = await assets.upload(blob, { type: ftype });
    const old = [o.signedFileId, o.signedThumbId].filter(Boolean);
    await dbw(() => db.doc('orders/' + orderId).update({ signedFileId: up.id, signedFileType: ftype, signedThumbId: thumbId, signedAt: todayISO(), status: o.status === 'anulada' ? 'anulada' : 'autorizada' }));
    for (const a of old) { try { await assets.delete(a); } catch (e) { /* ya no existe */ } }
    toast('Copia firmada guardada');
  } catch (e) {
    console.error(e);
    toast(e instanceof UserError ? e.message : 'No se pudo guardar la copia. Intenta de nuevo.');
  }
}
async function linkOrder(invId, orderId) {
  if (!(await write(() => db.doc('invoices/' + invId).update({ orderId }), 'Orden asignada'))) return;
  if (S.sheet && S.sheet.type === 'inv' && S.sheet.id === invId && S.sheet.dirty && $('#f-order')) $('#f-order').value = orderId;
}
const ORDER_SCHEMA = {
  type: 'object',
  properties: {
    solicitado_por: { type: 'string' }, proyecto: { type: 'string' }, proveedor: { type: 'string' }, fecha_requerida: { type: 'string' },
    lugar_entrega: { type: 'string' }, departamento: { type: 'string' }, observaciones: { type: 'string' },
    articulos: { type: 'array', items: { type: 'object', properties: { cantidad: { type: 'string' }, unidad: { type: 'string' }, descripcion: { type: 'string' } }, required: ['cantidad', 'unidad', 'descripcion'], additionalProperties: false } },
  },
  required: ['solicitado_por', 'proyecto', 'proveedor', 'fecha_requerida', 'lugar_entrega', 'departamento', 'observaciones', 'articulos'],
  additionalProperties: false,
};
async function fillOrderFromMessage(btn, photo) {
  const msg = $('#o-msg') ? $('#o-msg').value.trim() : '';
  const status = $('#o-fill-status');
  if (!msg && !photo) { if (status) status.textContent = 'Primero pega el mensaje o elige una foto.'; return; }
  if (btn) btn.disabled = true;
  if (status) status.textContent = 'Leyendo el pedido…';
  try {
    const image = photo ? (await prepImage(photo)).blob : null;
    const names = S.projects.map((p) => p.name).filter(Boolean);
    const prompt = [
      'Este es un pedido de materiales que alguien de una obra le hizo a compras de una constructora en República Dominicana' + (image ? ' (la imagen adjunta es una foto de la lista o del mensaje)' : '') + '. Saca los datos para llenar una orden de compra.',
      msg ? `Mensaje:\n<<<\n${msg.slice(0, 4000)}\n>>>` : '',
      `Fecha de hoy: ${todayISO()} (úsala para entender "mañana", "el lunes", etc.).`,
      'Proyectos u obras que existen: ' + (names.length ? JSON.stringify(names.slice(0, 200)) : '(ninguno)'),
      'Unidades de uso común: ' + UNITS.join(', ') + '.',
      'Llena cada campo así (usa "" si el dato no aparece):',
      '- solicitado_por: nombre de quien pide.',
      '- proyecto: la obra; si coincide con una de la lista (aunque esté escrita distinto, por ejemplo "caperuza II" y "Caperuza 2"), escribe el nombre exacto de la lista.',
      '- proveedor: a quién se le compra, si lo dice.',
      '- fecha_requerida: para cuándo lo necesitan, en AAAA-MM-DD.',
      '- lugar_entrega: dónde se entrega, si lo dice.',
      '- departamento: área que pide (por ejemplo Obra, Electricidad o Plomería), si se deduce.',
      '- observaciones: instrucciones especiales, máximo 200 caracteres.',
      '- articulos: un elemento por material, con cantidad (solo el número), unidad (de la lista si aplica) y descripción con medidas y especificaciones, sin repetir la cantidad.',
    ].filter(Boolean).join('\n');
    applyOrderFill(await ai.json(prompt, { images: image ? [image] : [], schema: ORDER_SCHEMA }));
    if (status) status.textContent = 'Listo. Revisa los datos antes de guardar.';
    if (S.sheet) S.sheet.dirty = true;
  } catch (e) {
    console.warn('pedido', e);
    if (status) status.textContent = { no_key: 'Falta la clave de API en Ajustes.', bad_key: 'La clave de API no funciona.', offline: 'No hay internet en este momento.' }[e && e.code] || 'No se pudo leer el pedido. Intenta de nuevo.';
  } finally { if (btn) btn.disabled = false; }
}
function applyOrderFill(out) {
  const o = out && typeof out === 'object' && !Array.isArray(out) ? out : {};
  const s = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : typeof v === 'number' ? String(v) : '');
  const setIfEmpty = (sel, v) => { const el = $(sel); if (el && !el.value && v) el.value = v; };
  setIfEmpty('#o-by', s(o.solicitado_por, 80));
  setIfEmpty('#o-sup', s(o.proveedor, 120));
  setIfEmpty('#o-dept', s(o.departamento, 60));
  let need = s(o.fecha_requerida, 10);
  if (!ymd(need)) need = RD.dmyToIso(need);
  if (ymd(need)) setIfEmpty('#o-need', need);
  setIfEmpty('#o-notes', s(o.observaciones, 300));
  const pm = matchProject(s(o.proyecto, 80));
  if (pm && !$('#o-proj').value) $('#o-proj').value = pm.id;
  if (!$('#o-place').value) { const pid = $('#o-proj').value; const prev = pid ? S.orders.find((x) => x.projectId === pid && x.place) : null; setIfEmpty('#o-place', s(o.lugar_entrega, 120) || (prev ? prev.place : '')); }
  const items = Array.isArray(o.articulos) ? o.articulos : [];
  if (!items.length) return;
  for (const r of $$('#o-items [data-row]')) if (!['qty', 'unit', 'desc'].some((f) => r.querySelector(`[data-f="${f}"]`).value.trim())) r.remove();
  for (const it of items.slice(0, 100)) addItemRow({ qty: s(it && it.cantidad, 12), unit: s(it && it.unidad, 20), desc: s(it && it.descripcion, 160) });
  addItemRow();
}
function wrapText(text, f, size, width) {
  const lines = [];
  let cur = '';
  for (const w of pdfSafe(text).split(/\s+/).filter(Boolean)) {
    const t = cur ? cur + ' ' + w : w;
    if (f.widthOfTextAtSize(t, size) <= width) { cur = t; continue; }
    if (cur) lines.push(cur);
    cur = w;
    while (cur.length > 1 && f.widthOfTextAtSize(cur, size) > width) {
      let k = cur.length - 1;
      while (k > 1 && f.widthOfTextAtSize(cur.slice(0, k), size) > width) k--;
      lines.push(cur.slice(0, k));
      cur = cur.slice(k);
    }
  }
  if (cur) lines.push(cur);
  return lines;
}
// PDF de la orden con el formato de la empresa (carta, encabezado, 12 renglones, firmas y nota).
async function buildOrderPdf(o, opts = {}) {
  const { PDFDocument, StandardFonts, rgb } = await pdflib();
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  doc.setTitle(pdfSafe('Orden de compra ' + orderNo(o)));
  doc.setCreator('Facturas de Proyectos');
  const st = S.settings || {};
  const proj = S.projects.find((p) => p.id === o.projectId);
  const W = 612, H = 792, X0 = 38, X1 = 574;
  const NAVY = rgb(0.137, 0.255, 0.353), INK = rgb(0.1, 0.11, 0.13), VAL = rgb(0.04, 0.1, 0.3), GREY = rgb(0.42, 0.45, 0.5);
  const SEP = rgb(0.8, 0.82, 0.86), GRID = rgb(0.62, 0.67, 0.74), WHITE = rgb(1, 1, 1), RED = rgb(0.75, 0.15, 0.12);
  const items = (o.items || []).filter((x) => x && (x.desc || (x.qty !== '' && x.qty != null)));
  const per = 12;
  const nPages = Math.max(1, Math.ceil(items.length / per));
  const yy = (top) => H - top;
  const fitT = (s, f, size, w) => { let t = pdfSafe(s); if (f.widthOfTextAtSize(t, size) <= w) return t; while (t.length > 1 && f.widthOfTextAtSize(t + '…', size) > w) t = t.slice(0, -1); return t + '…'; };
  for (let pg = 0; pg < nPages; pg++) {
    const p = doc.addPage([W, H]);
    const text = (s, x, top, size, f = font, color = INK) => p.drawText(pdfSafe(s), { x, y: yy(top), size, font: f, color });
    const center = (s, cx, top, size, f = font, color = INK) => { const t = pdfSafe(s); p.drawText(t, { x: cx - f.widthOfTextAtSize(t, size) / 2, y: yy(top), size, font: f, color }); };
    const hline = (a, b, top, th = 0.6, color = SEP) => p.drawLine({ start: { x: a, y: yy(top) }, end: { x: b, y: yy(top) }, thickness: th, color });
    if (st.company) center(st.company.toUpperCase(), W / 2, 56, 13.5, bold, NAVY);
    center('ORDEN DE COMPRA / SOLICITUD DE MATERIALES', W / 2, st.company ? 76 : 60, 10.5, font, INK);
    if (nPages > 1) { const t = `Página ${pg + 1} de ${nPages}`; text(t, X1 - font.widthOfTextAtSize(t, 8), 28, 8, font, GREY); }
    if (opts.unsigned) { const t = 'COPIA SIN FIRMA'; text(t, X1 - bold.widthOfTextAtSize(t, 9), 40, 9, bold, RED); }
    const field = (label, value, x, top, xEnd) => {
      text(label, x, top, 9, font, INK);
      const lx = x + font.widthOfTextAtSize(pdfSafe(label), 9) + 4;
      hline(lx, xEnd, top + 2, 0.6, INK);
      if (value) text(fitT(value, bold, 9.5, xEnd - lx - 4), lx + 2, top - 1, 9.5, bold, VAL);
    };
    [
      ['No. de orden:', orderNo(o), 'Fecha:', fmtDmy(o.date)],
      ['Proyecto / obra:', proj ? proj.name : '', 'Solicitado por:', o.requestedBy || ''],
      ['Proveedor:', o.supplier || '', 'Fecha requerida:', fmtDmy(o.neededDate)],
      ['Lugar de entrega:', o.place || '', 'Departamento:', o.department || ''],
    ].forEach(([l1, v1, l2, v2], k) => {
      const top = 117 + 28 * k;
      field(l1, v1, 44, top, 300);
      field(l2, v2, 322, top, X1 - 2);
      hline(X0 + 2, X1, top + 11);
    });
    text('DETALLE DE LOS ARTÍCULOS O MATERIALES SOLICITADOS', 44, 237, 8.5, bold, INK);
    const tTop = 247.5, hH = 25.2, rH = 25, cols = [X0, 73, 147, 221, X1];
    const bodyTop = tTop + hH, bottom = bodyTop + rH * per;
    p.drawRectangle({ x: X0, y: yy(bodyTop), width: X1 - X0, height: hH, color: NAVY });
    center('No.', (cols[0] + cols[1]) / 2, tTop + 16, 8.5, bold, WHITE);
    center('Cantidad', (cols[1] + cols[2]) / 2, tTop + 16, 8.5, bold, WHITE);
    center('Unidad', (cols[2] + cols[3]) / 2, tTop + 16, 8.5, bold, WHITE);
    text('Descripción detallada / especificaciones', cols[3] + 7, tTop + 16, 8.5, bold, WHITE);
    for (let r = 0; r < per; r++) {
      const top = bodyTop + rH * r;
      const n = pg * per + r;
      center(String(n + 1), (cols[0] + cols[1]) / 2, top + 16, 9, font, INK);
      const it = items[n];
      if (!it) continue;
      if (it.qty !== '' && it.qty != null) center(fitT(fmtQty(it.qty), bold, 9.5, cols[2] - cols[1] - 6), (cols[1] + cols[2]) / 2, top + 16, 9.5, bold, VAL);
      if (it.unit) center(fitT(it.unit, font, 9, cols[3] - cols[2] - 6), (cols[2] + cols[3]) / 2, top + 16, 9, font, VAL);
      const lines = wrapText(it.desc || '', font, 9, cols[4] - cols[3] - 12);
      if (lines.length <= 1) text(lines[0] || '', cols[3] + 7, top + 16, 9, font, VAL);
      else { text(lines[0], cols[3] + 7, top + 11, 8.5, font, VAL); text(fitT(lines.slice(1).join(' '), font, 8.5, cols[4] - cols[3] - 12), cols[3] + 7, top + 21, 8.5, font, VAL); }
    }
    p.drawRectangle({ x: X0, y: yy(bottom), width: X1 - X0, height: bottom - tTop, borderColor: GRID, borderWidth: 0.8 });
    for (let r = 1; r < per; r++) hline(X0, X1, bodyTop + rH * r, 0.6, GRID);
    for (const cx of cols.slice(1, -1)) p.drawLine({ start: { x: cx, y: yy(tTop) }, end: { x: cx, y: yy(bottom) }, thickness: 0.6, color: GRID });
    if (pg < nPages - 1) continue;
    const obsLabel = 'Observaciones / instrucciones especiales:';
    text(obsLabel, 44, 596, 9, bold, INK);
    const ox = 44 + bold.widthOfTextAtSize(obsLabel, 9) + 4;
    hline(ox, X1 - 2, 598, 0.6, INK);
    const notes = wrapText(o.notes || '', font, 9, X1 - ox - 6);
    if (notes[0]) text(notes[0], ox + 2, 595, 9, font, VAL);
    if (notes.length > 1) { hline(44, X1 - 2, 612, 0.6, INK); text(fitT(notes.slice(1).join(' '), font, 9, X1 - 50), 46, 609, 9, font, VAL); }
    for (const [a, b, lbl] of [[53, 213, 'Firma del solicitante'], [243, 403, 'Autorizado por / firma'], [448, 544, 'Sello de la compañía']]) {
      hline(a, b, 628, 0.8, INK);
      center(lbl, (a + b) / 2, 642, 9, font, INK);
    }
    if (o.requestedBy) center(fitT(o.requestedBy, font, 8, 150), (53 + 213) / 2, 654, 8, font, GREY);
    const note = String(st.orderNote != null ? st.orderNote : DEFAULT_ORDER_NOTE).trim();
    if (note) {
      const lead = 'NOTA OBLIGATORIA: ';
      const lw = bold.widthOfTextAtSize(lead, 8.5) + 2;
      const words = pdfSafe(note).split(/\s+/).filter(Boolean);
      let first = '';
      while (words.length && font.widthOfTextAtSize(first ? first + ' ' + words[0] : words[0], 8.5) <= X1 - 2 - 44 - lw) first = first ? first + ' ' + words.shift() : words.shift();
      text(lead, 44, 671, 8.5, bold, INK);
      text(first, 44 + lw, 671, 8.5, font, INK);
      wrapText(words.join(' '), font, 8.5, X1 - 2 - 44).slice(0, 4).forEach((ln, k) => text(ln, 44, 684 + 13 * k, 8.5, font, INK));
    }
  }
  return doc.save();
}

/* ---------- PDF para presentar ---------- */
const WIN = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');
function pdfSafe(s) {
  let out = '';
  for (const ch of String(s ?? '').normalize('NFC')) {
    const c = ch.codePointAt(0);
    if ((c >= 0x20 && c <= 0x7E) || (c >= 0xA1 && c <= 0xFF && c !== 0xAD) || WIN.has(ch)) out += ch;
    else if (c === 0x09 || c === 0x0A || c === 0x0D || c === 0xA0 || (c >= 0x2000 && c <= 0x200A) || c === 0x202F || c === 0x205F || c === 0x3000) out += ' ';
    else if (c === 0xAD || c === 0x2010 || c === 0x2011 || c === 0x2212) out += '-';
    else if (c >= 0x200B && c <= 0x200F) out += '';
    else out += '?';
  }
  return out;
}
const isPng = (b) => { const u = new Uint8Array(b, 0, 4); return u[0] === 0x89 && u[1] === 0x50 && u[2] === 0x4E && u[3] === 0x47; };
// Nombres de archivo sin acentos ni signos raros: algunos navegadores descartan el nombre si los tiene.
function fileSafe(s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9 ._(),-]+/g, '-').replace(/\s+/g, ' ').replace(/-+/g, '-').trim().slice(0, 110) || 'Pago'; }
function packageGroups(invs, D) {
  const groups = groupByProject(invs, D).map((g) => ({ ...g, items: [...g.items].sort((a, b) => String(a.date || '').localeCompare(String(b.date || ''))) }));
  if (groups.length && groups[0].id === 'none') groups.push(groups.shift());
  return groups;
}
async function buildPackage(pay, D, onProgress) {
  const { PDFDocument, StandardFonts, rgb } = await pdflib();
  const out = await PDFDocument.create();
  const font = await out.embedFont(StandardFonts.Helvetica);
  const bold = await out.embedFont(StandardFonts.HelveticaBold);
  out.setTitle(pdfSafe('Relación de facturas - ' + (pay.name || 'Pago')));
  out.setCreator('Facturas de Proyectos');
  const groups = packageGroups(payInvoices(pay, D), D);
  const invs = groups.flatMap((g) => g.items);
  const st = S.settings || {};
  const W = 612, H = 792, M = 42;
  const C = { ink: rgb(0.08, 0.11, 0.16), grey: rgb(0.38, 0.42, 0.48), line: rgb(0.84, 0.86, 0.9), band: rgb(0.94, 0.95, 0.97), accent: rgb(0.13, 0.26, 0.75) };
  let page, y;
  const T = (s, x, yy, size, f = font, color = C.ink) => page.drawText(pdfSafe(s), { x, y: yy, size, font: f, color });
  const R = (s, xr, yy, size, f = font, color = C.ink) => { const t = pdfSafe(s); page.drawText(t, { x: xr - f.widthOfTextAtSize(t, size), y: yy, size, font: f, color }); };
  const fit = (s, f, size, w) => { let t = pdfSafe(s); if (f.widthOfTextAtSize(t, size) <= w) return t; while (t.length > 1 && f.widthOfTextAtSize(t + '…', size) > w) t = t.slice(0, -1); return t + '…'; };
  const hr = (yy, color = C.line, th = 0.7) => page.drawLine({ start: { x: M, y: yy }, end: { x: W - M, y: yy }, thickness: th, color });
  const foot = () => page.drawText(pdfSafe(`${st.company ? st.company + ' · ' : ''}${pay.name || 'Pago'} · Relación de facturas`), { x: M, y: M - 20, size: 8, font, color: C.grey });
  const newPage = () => { page = out.addPage([W, H]); y = H - M; };
  const ensure = (need, again) => { if (y - need < M + 14) { foot(); newPage(); if (again) again(); } };

  newPage();
  if (st.company) {
    T(fit(st.company, bold, 11, W - 2 * M - 200), M, y - 8, 11, bold);
    const sub = [st.companyRnc ? 'RNC ' + RD.fmtRnc(st.companyRnc) : '', st.area || ''].filter(Boolean).join(' · ');
    if (sub) T(fit(sub, font, 9, W - 2 * M - 200), M, y - 21, 9, font, C.grey);
    R('RELACIÓN DE FACTURAS PARA PAGO', W - M, y - 8, 9, bold, C.accent);
    hr(y - (sub ? 31 : 20));
    y -= sub ? 62 : 50;
  } else { T('RELACIÓN DE FACTURAS PARA PAGO', M, y - 8, 9, bold, C.accent); y -= 36; }
  T(fit(pay.name || 'Pago', bold, 22, W - 2 * M), M, y, 22, bold); y -= 20;
  T([pay.date ? 'Fecha del pago: ' + fmtDate(pay.date) : '', 'Estado: ' + (PAY_LABEL[pay.status] || 'Por presentar'), 'Generado el ' + fmtDate(todayISO()), st.preparedBy ? 'Elaboró: ' + st.preparedBy : ''].filter(Boolean).join('   ·   '), M, y, 9, font, C.grey); y -= 34;
  T('Total a pagar', M, y, 10, font, C.grey); R(plural(invs.length, 'factura', 'facturas') + ' · ' + plural(groups.length, 'proyecto', 'proyectos'), W - M, y, 10, font, C.grey); y -= 28;
  T(fit(totalStr(invs), bold, 26, W - 2 * M), M, y, 26, bold); y -= 16;
  T('ITBIS incluido: ' + totalStr(invs, 'itbis'), M, y - 2, 9.5, font, C.grey); y -= 12; hr(y, C.ink, 1.2); y -= 28;

  T('Por proyecto', M, y, 11.5, bold); y -= 20;
  page.drawRectangle({ x: M, y: y - 6, width: W - 2 * M, height: 19, color: C.band });
  T('Proyecto', M + 6, y, 9, bold, C.grey); R('Facturas', 360, y, 9, bold, C.grey); R('ITBIS', 460, y, 9, bold, C.grey); R('Total', W - M - 6, y, 9, bold, C.grey); y -= 21;
  for (const g of groups) { ensure(20); T(fit(g.name, font, 10, 260), M + 6, y, 10); R(String(g.items.length), 360, y, 10); R(totalStr(g.items, 'itbis'), 460, y, 10); R(totalStr(g.items), W - M - 6, y, 10, bold); y -= 8; hr(y); y -= 13; }
  y -= 18;

  const cols = [
    { k: '#', x: M + 2, w: 14 }, { k: 'Proyecto', x: M + 18, w: 62 }, { k: 'Proveedor', x: M + 82, w: 90 },
    { k: 'RNC', x: M + 174, w: 52 }, { k: 'NCF', x: M + 228, w: 64 }, { k: 'OC', x: M + 294, w: 44 }, { k: 'Fecha', x: M + 340, w: 46 },
    { k: 'ITBIS', xr: M + 454, w: 62 }, { k: 'Total', xr: W - M - 2, w: 70 },
  ];
  const head = () => { page.drawRectangle({ x: M, y: y - 6, width: W - 2 * M, height: 19, color: C.band }); cols.forEach((c) => (c.xr ? R(c.k, c.xr, y, 8, bold, C.grey) : T(c.k, c.x, y, 8, bold, C.grey))); y -= 21; };
  ensure(70); T('Detalle', M, y, 11.5, bold); y -= 20; head();
  invs.forEach((i, n) => {
    ensure(20, head);
    const vals = [String(n + 1), i.project ? i.project.name : 'Sin proyecto', i.supplier || 'Sin nombre', RD.normRnc(i.rnc) || '-', RD.normNcf(i.number) || '-', i.order ? orderNo(i.order) : '-', fmtDmy(i.date) || '-', isNum(i.itbis) ? money(i.itbis, i.currency) : '-', money(i.amount, i.currency)];
    cols.forEach((c, k) => { const t = fit(vals[k], font, 8, c.w); if (c.xr) R(t, c.xr, y, 8); else T(t, c.x, y, 8); });
    y -= 7; hr(y, C.line, 0.5); y -= 12;
  });
  ensure(30); y -= 6;
  T('Total', M + 294, y, 10, bold); R(totalStr(invs, 'itbis'), M + 454, y, 10, bold); R(totalStr(invs), W - M - 2, y, 10, bold);
  y -= 20;
  ensure(110);
  y -= 66;
  const gap = 28, sw = (W - 2 * M - 2 * gap) / 3;
  ['Elaboró', 'Revisó', 'Autorizó'].forEach((lbl, n) => {
    const x = M + n * (sw + gap);
    page.drawLine({ start: { x, y }, end: { x: x + sw, y }, thickness: 0.8, color: C.ink });
    T(lbl, x, y - 13, 9, bold, C.grey);
    if (n === 0 && st.preparedBy) T(fit(st.preparedBy, font, 9, sw), x, y - 25, 9);
  });
  foot();

  let k = 0;
  const doneOrders = new Set();
  for (const i of invs) {
    k++;
    if (onProgress) onProgress(k, invs.length);
    const label = `${k} de ${invs.length} · ${i.project ? i.project.name : 'Sin proyecto'} · ${i.supplier || 'Sin nombre'}${i.number ? ' · NCF ' + RD.normNcf(i.number) : ''} · ${money(i.amount, i.currency)}`;
    try {
      if (i.fileType === 'application/xml') {
        const x = RD.parseEcfXml(await (await getBlob(i.fileId)).text()) || {};
        newPage();
        T(fit(label, font, 8.5, W - 2 * M), M, H - M + 12, 8.5, font, C.grey);
        y = H - M - 30;
        T('Factura electrónica (e-CF): datos del XML', M, y, 15, bold); y -= 30;
        const rows = [['e-NCF', x.encf], ['Tipo', x.encf ? RD.parseNcf(x.encf).label : ''], ['Emisor', x.emisor], ['RNC del emisor', RD.fmtRnc(x.rncEmisor)], ['Fecha de emisión', fmtDate(x.fecha)], ['Comprador', x.comprador], ['RNC del comprador', RD.fmtRnc(x.rncComprador)], ['ITBIS', isNum(x.itbis) ? money(x.itbis, 'DOP') : ''], ['Total', isNum(x.total) ? money(x.total, 'DOP') : '']].filter((r) => r[1]);
        for (const [kk, vv] of rows) { T(kk, M, y, 10, font, C.grey); T(fit(vv, bold, 11, W - 2 * M - 150), M + 150, y, 11, bold); y -= 9; hr(y); y -= 15; }
        continue;
      }
      const bytes = await (await getBlob(i.fileId)).arrayBuffer();
      if (i.fileType === 'application/pdf') {
        const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
        const pages = await out.copyPages(src, src.getPageIndices());
        pages.forEach((p) => out.addPage(p));
      } else {
        const img = isPng(bytes) ? await out.embedPng(bytes) : await out.embedJpg(bytes);
        newPage();
        T(fit(label, font, 8.5, W - 2 * M), M, H - M + 12, 8.5, font, C.grey);
        const bw = W - 2 * M, bh = H - 2 * M - 8;
        const s = Math.min(bw / img.width, bh / img.height);
        const w = img.width * s, h = img.height * s;
        page.drawImage(img, { x: M + (bw - w) / 2, y: M + (bh - h), width: w, height: h });
      }
    } catch (e) {
      console.warn('PDF factura', e);
      newPage();
      T('No se pudo incluir el archivo de esta factura:', M, y - 20, 12, bold);
      T(fit(label, font, 10, W - 2 * M), M, y - 40, 10);
    }
    // La orden de compra va justo después de su (primera) factura.
    if (i.order && !doneOrders.has(i.order.id)) {
      doneOrders.add(i.order.id);
      const ord = i.order;
      try {
        if (ord.signedFileId) {
          const ob = await (await getBlob(ord.signedFileId)).arrayBuffer();
          if (ord.signedFileType === 'application/pdf') {
            const src = await PDFDocument.load(ob, { ignoreEncryption: true });
            (await out.copyPages(src, src.getPageIndices())).forEach((p) => out.addPage(p));
          } else {
            const img = isPng(ob) ? await out.embedPng(ob) : await out.embedJpg(ob);
            newPage();
            T(fit(`Orden de compra ${orderNo(ord)} · ${ord.supplier || ''} · firmada y sellada`, font, 8.5, W - 2 * M), M, H - M + 12, 8.5, font, C.grey);
            const bw = W - 2 * M, bh = H - 2 * M - 8;
            const s = Math.min(bw / img.width, bh / img.height);
            page.drawImage(img, { x: M + (bw - img.width * s) / 2, y: M + (bh - img.height * s), width: img.width * s, height: img.height * s });
          }
        } else {
          const src = await PDFDocument.load(await buildOrderPdf(ord, { unsigned: true }));
          (await out.copyPages(src, src.getPageIndices())).forEach((p) => out.addPage(p));
        }
      } catch (e) { console.warn('PDF orden', e); }
    }
  }
  return out.save();
}
async function makePdf(payId) {
  if (S.busyPdf) return;
  const pay = S.payments.find((p) => p.id === payId);
  if (!pay) return;
  const D = derive();
  const n = payInvoices(pay, D).length;
  if (!n) return;
  S.busyPdf = true; S.pdfMsg = 'Preparando PDF…'; renderAll();
  try {
    const bytes = await buildPackage(pay, D, (k, tot) => { S.pdfMsg = `Preparando PDF… ${k} de ${tot}`; renderAll(); });
    S.busyPdf = false; renderAll();
    deliverFile(new Blob([bytes], { type: 'application/pdf' }), fileSafe(`${pay.name || 'Pago'} - ${plural(n, 'factura', 'facturas')}`) + '.pdf');
  } catch (e) {
    console.error(e);
    S.busyPdf = false; renderAll();
    toast('No se pudo preparar el PDF. Intenta de nuevo.');
  }
}

/* ---------- Excel ---------- */
const XL_STATUS = { pendiente: 'Pendiente', enpago: 'En pago por presentar', presentada: 'Presentada', pagada: 'Pagada' };
function invoicesWorkbook({ heading, scope, invs, D, isPayment }) {
  const { XS, colName, excelDate, sheetXml, buildXlsx } = FILES;
  const st = S.settings || {};
  const list = packageGroups(invs, D).flatMap((g) => g.items);
  const curs = [...new Set(list.map((i) => normCur(i.currency)))];
  const multi = curs.length > 1;
  const cols = ['#', 'Proyecto', 'Proveedor', 'RNC', 'NCF', 'Tipo', 'Fecha', 'Concepto', 'Orden de compra', 'Referencia', 'ITBIS', 'Total'].concat(multi ? ['Moneda'] : [], ['Estado', 'Pago', 'Fecha del pago']);
  const widths = [5, 24, 30, 13, 16, 22, 12, 36, 15, 14, 15, 16].concat(multi ? [9] : [], [22, 22, 15]);
  const C = (n) => cols.indexOf(n);
  const L = (n) => colName(C(n));
  const H = 5, first = H + 1, last = H + list.length;
  const mStyle = (cur, total) => (normCur(cur) === 'USD' ? (total ? XS.totMoneyUsd : XS.moneyUsd) : total ? XS.totMoney : XS.money);
  const company = [st.company, st.companyRnc ? 'RNC ' + RD.fmtRnc(st.companyRnc) : ''].filter(Boolean).join(' · ');
  const generated = ['Generado el ' + fmtDate(todayISO()), st.preparedBy ? 'Elaboró: ' + st.preparedBy : ''].filter(Boolean).join(' · ');
  const top = [
    [{ v: company || heading, s: XS.title }],
    [{ v: company ? heading : scope, s: company ? XS.bold : XS.muted }],
    [{ v: [company ? scope : '', st.area || '', generated].filter(Boolean).join(' · '), s: XS.muted }],
  ];
  const footer = `&L${(st.company || 'Facturas de Proyectos').replace(/&/g, '&&')}&C${heading.replace(/&/g, '&&')}&RPágina &P de &N`;
  const rows = top.map((r) => r.slice());
  rows[H - 1] = cols.map((c) => ({ v: c, s: c === 'ITBIS' || c === 'Total' || c === '#' ? XS.headR : c === 'Proyecto' || c === 'Estado' ? XS.headInd : XS.head }));
  list.forEach((i, n) => {
    const r = [];
    const ncf = RD.parseNcf(i.number);
    r[C('#')] = { v: n + 1, s: XS.int };
    r[C('Proyecto')] = { v: i.project ? i.project.name : 'Sin proyecto', s: XS.ind };
    r[C('Proveedor')] = { v: i.supplier || '' };
    r[C('RNC')] = { v: RD.normRnc(i.rnc) };
    r[C('NCF')] = { v: RD.normNcf(i.number) };
    r[C('Tipo')] = { v: ncf.ok ? ncf.label : '' };
    const fd = excelDate(i.date);
    r[C('Fecha')] = fd == null ? { v: '' } : { v: fd, s: XS.date };
    r[C('Concepto')] = { v: i.concept || '' };
    r[C('Orden de compra')] = { v: i.order ? orderNo(i.order) : '' };
    r[C('Referencia')] = { v: i.ref || '' };
    r[C('ITBIS')] = isNum(i.itbis) ? { v: round2(i.itbis), s: mStyle(i.currency) } : { v: '' };
    r[C('Total')] = isNum(i.amount) ? { v: round2(i.amount), s: mStyle(i.currency) } : { v: '' };
    if (multi) r[C('Moneda')] = { v: normCur(i.currency) };
    r[C('Estado')] = { v: XL_STATUS[i.status] || '', s: XS.ind };
    r[C('Pago')] = { v: i.pay ? i.pay.name || 'Pago' : '' };
    const pd = i.pay ? excelDate(i.pay.status === 'pagado' && i.pay.paidAt ? i.pay.paidAt : i.pay.date) : null;
    r[C('Fecha del pago')] = pd == null ? { v: '' } : { v: pd, s: XS.date };
    rows[H + n] = r;
  });
  const sum = (field, cur) => round2(list.reduce((t, i) => t + (isNum(i[field]) && (!cur || normCur(i.currency) === cur) ? i[field] : 0), 0));
  if (!multi) {
    const tot = cols.map(() => ({ v: '', s: XS.totBlank }));
    tot[C('#')] = { f: `SUBTOTAL(3,${L('Proyecto')}${first}:${L('Proyecto')}${last})`, v: list.length, s: XS.totInt };
    tot[C('Referencia')] = { v: 'Total', s: XS.totLabel };
    tot[C('ITBIS')] = { f: `SUBTOTAL(9,${L('ITBIS')}${first}:${L('ITBIS')}${last})`, v: sum('itbis'), s: mStyle(curs[0], true) };
    tot[C('Total')] = { f: `SUBTOTAL(9,${L('Total')}${first}:${L('Total')}${last})`, v: sum('amount'), s: mStyle(curs[0], true) };
    rows[last] = tot;
  } else {
    curs.forEach((c, k) => {
      const tot = cols.map(() => ({ v: '', s: XS.totBlank }));
      tot[C('Referencia')] = { v: 'Total ' + (CUR_PREFIX[c] || c), s: XS.totLabel };
      tot[C('ITBIS')] = { f: `SUMIF(${L('Moneda')}${first}:${L('Moneda')}${last},"${c}",${L('ITBIS')}${first}:${L('ITBIS')}${last})`, v: sum('itbis', c), s: mStyle(c, true) };
      tot[C('Total')] = { f: `SUMIF(${L('Moneda')}${first}:${L('Moneda')}${last},"${c}",${L('Total')}${first}:${L('Total')}${last})`, v: sum('amount', c), s: mStyle(c, true) };
      rows[last + k] = tot;
    });
  }
  const lastCol = colName(cols.length - 1);
  const factXml = sheetXml(rows, { widths, freeze: H, autoFilter: `A${H}:${lastCol}${last}`, landscape: true, footer });
  // Hoja de resumen (valores fijos, por proyecto y moneda).
  const rs = top.map((r) => r.slice());
  rs[H - 1] = [{ v: 'Proyecto', s: XS.head }, { v: 'Facturas', s: XS.headR }, { v: 'ITBIS', s: XS.headR }, { v: 'Total', s: XS.headR }];
  let r = H;
  for (const g of packageGroups(invs, D)) {
    for (const c of curs) {
      const its = g.items.filter((i) => normCur(i.currency) === c);
      if (!its.length) continue;
      rs[r++] = [{ v: g.name + (multi ? ` (${CUR_PREFIX[c] || c})` : '') }, { v: its.length, s: XS.int }, { v: round2(its.reduce((t, i) => t + (isNum(i.itbis) ? i.itbis : 0), 0)), s: mStyle(c) }, { v: round2(its.reduce((t, i) => t + (isNum(i.amount) ? i.amount : 0), 0)), s: mStyle(c) }];
    }
  }
  for (const c of curs) {
    const its = list.filter((i) => normCur(i.currency) === c);
    rs[r++] = [{ v: 'Total' + (multi ? ' ' + (CUR_PREFIX[c] || c) : ''), s: XS.totLabel }, { v: its.length, s: XS.totInt }, { v: sum('itbis', c), s: mStyle(c, true) }, { v: sum('amount', c), s: mStyle(c, true) }];
  }
  if (!isPayment) {
    r++;
    rs[r++] = [{ v: 'Estado', s: XS.head }, { v: 'Facturas', s: XS.headR }, { v: 'ITBIS', s: XS.headR }, { v: 'Total', s: XS.headR }];
    for (const k of ['pendiente', 'enpago', 'presentada', 'pagada']) {
      for (const c of curs) {
        const its = list.filter((i) => i.status === k && normCur(i.currency) === c);
        if (!its.length) continue;
        rs[r++] = [{ v: XL_STATUS[k] + (multi ? ` (${CUR_PREFIX[c] || c})` : '') }, { v: its.length, s: XS.int }, { v: round2(its.reduce((t, i) => t + (isNum(i.itbis) ? i.itbis : 0), 0)), s: mStyle(c) }, { v: round2(its.reduce((t, i) => t + (isNum(i.amount) ? i.amount : 0), 0)), s: mStyle(c) }];
      }
    }
  }
  const resXml = sheetXml(rs, { widths: [40, 12, 18, 18], selected: true, footer });
  return buildXlsx([{ name: 'Resumen', xml: resXml }, { name: 'Facturas', xml: factXml }], {
    title: heading + ' - ' + scope, creator: st.preparedBy || 'Facturas de Proyectos',
    names: [{ name: '_xlnm._FilterDatabase', sheet: 1, hidden: true, ref: `Facturas!$A$${H}:$${lastCol}$${last}` }, { name: '_xlnm.Print_Titles', sheet: 1, ref: `Facturas!$${H}:$${H}` }],
  });
}
function exportPaymentExcel(payId) {
  const pay = S.payments.find((p) => p.id === payId);
  if (!pay) return;
  const D = derive();
  const invs = payInvoices(pay, D);
  if (!invs.length) { toast('Este pago no tiene facturas.'); return; }
  const scope = [pay.name || 'Pago', pay.date ? 'Fecha del pago: ' + fmtDate(pay.date) : '', PAY_LABEL[pay.status] || 'Por presentar'].filter(Boolean).join(' · ');
  deliverFile(invoicesWorkbook({ heading: 'Relación de facturas para pago', scope, invs, D, isPayment: true }), fileSafe(`${pay.name || 'Pago'} - facturas`) + '.xlsx');
}
function exportListExcel() {
  const D = derive();
  const invs = visibleList(D);
  if (!invs.length) { toast('No hay facturas en esta lista.'); return; }
  const heading = { pendientes: 'Facturas pendientes', tramite: 'Facturas en trámite', pagadas: 'Facturas pagadas', todas: 'Todas las facturas' }[S.filter] || 'Facturas';
  const proj = S.projectFilter === 'all' ? 'Todos los proyectos' : S.projectFilter === 'none' ? 'Sin proyecto' : (D.projById.get(S.projectFilter) || {}).name || 'Proyecto';
  const scope = [proj, S.search.trim() ? `Búsqueda: "${S.search.trim()}"` : ''].filter(Boolean).join(' · ');
  deliverFile(invoicesWorkbook({ heading, scope, invs, D, isPayment: false }), fileSafe(`${heading} - ${proj} - ${todayISO()}`) + '.xlsx');
}

/* ---------- respaldo ---------- */
async function makeBackup() {
  try {
    const data = await RT.exportAll();
    const files = [{ name: 'respaldo.json', data: JSON.stringify({ app: 'facturas-rd', version: 1, exportedAt: new Date().toISOString(), docs: data.docs, files: data.files.map((f) => ({ id: f.id, type: f.type, createdAt: f.createdAt })) }) }];
    for (const f of data.files) files.push({ name: 'archivos/' + f.id, data: new Uint8Array(f.buf) });
    const blob = FILES.zipStore(files, 'application/zip');
    deliverFile(blob, `facturas-respaldo-${todayISO()}.zip`);
    S.ready.onDone = () => { lsSet('facturas.lastBackup', String(Date.now())); scheduleRender(); };
  } catch (e) {
    console.error(e);
    toast('No se pudo preparar el respaldo.');
  }
}
async function restoreBackup(file) {
  const box = $('#restore-box');
  try {
    const entries = await FILES.unzip(file);
    const man = entries.find((e) => e.name === 'respaldo.json');
    if (!man) throw new Error('Este archivo no es un respaldo de la app.');
    const meta = JSON.parse(new TextDecoder().decode(man.data));
    if (meta.app !== 'facturas-rd' || !Array.isArray(meta.docs)) throw new Error('Este archivo no es un respaldo de la app.');
    const byName = new Map(entries.map((e) => [e.name, e.data]));
    const files = (meta.files || []).map((f) => ({ id: f.id, type: f.type, createdAt: f.createdAt, buf: (byName.get('archivos/' + f.id) || new Uint8Array()).buffer })).filter((f) => f.buf.byteLength);
    const invN = meta.docs.filter((d) => String(d.path).startsWith('invoices/')).length;
    const ordN = meta.docs.filter((d) => String(d.path).startsWith('orders/')).length;
    S.restoreFile = { docs: meta.docs, files, exportedAt: meta.exportedAt };
    if (box) {
      box.hidden = false;
      box.innerHTML = `<div class="confirm"><p>Este respaldo es del ${esc(fmtDate(String(meta.exportedAt || '').slice(0, 10)) || 'día desconocido')} y tiene ${plural(invN, 'factura', 'facturas')}${ordN ? ' y ' + plural(ordN, 'orden de compra', 'órdenes de compra') : ''}. Al restaurarlo se <b>reemplaza todo</b> lo que hay ahora en la app.</p><div class="actions"><button type="button" class="btn danger solid" data-act="restore-yes">Reemplazar y restaurar</button><button type="button" class="btn" data-act="restore-no">Cancelar</button></div></div>`;
    }
  } catch (e) {
    console.error(e);
    toast(e && e.message ? e.message : 'No se pudo leer el respaldo.');
  }
}
async function confirmRestore() {
  if (!S.restoreFile) return;
  try {
    await RT.importAll(S.restoreFile);
    if (S.restoreFile.exportedAt) lsSet('facturas.lastBackup', String(Date.parse(S.restoreFile.exportedAt) || Date.now()));
    S.restoreFile = null;
    closeSheet();
    S.projectFilter = 'all'; S.paymentId = null;
    toast('Respaldo restaurado');
    renderAll();
  } catch (e) {
    console.error(e);
    toast('No se pudo restaurar. ' + dbErr(e));
  }
}

/* ---------- eventos ---------- */
function onClick(e) {
  const t = e.target.closest('[data-act]');
  if (!t) return;
  const a = t.dataset.act, id = t.dataset.id;
  switch (a) {
    case 'tab': S.tab = t.dataset.tab; if (S.tab !== 'pagos') S.paymentId = null; S.payDel = false; renderAll(); window.scrollTo(0, 0); break;
    case 'filter': S.filter = t.dataset.f; renderAll(); break;
    case 'projf': S.projectFilter = t.dataset.p; renderAll(); break;
    case 'add': pickFiles(); break;
    case 'open-inv': openInvoice(id); break;
    case 'open-pay': closeSheet(); S.tab = 'pagos'; S.paymentId = id; S.payDel = false; renderAll(); window.scrollTo(0, 0); break;
    case 'back': S.paymentId = null; S.payDel = false; renderAll(); window.scrollTo(0, 0); break;
    case 'new-pay': openPicker('new'); break;
    case 'new-pay-from': { const D = derive(); const ids = $$('#f-list [data-act="open-inv"]').map((b) => b.dataset.id).filter((x) => D.invoices.some((i) => i.id === x && i.status === 'pendiente')); openPicker('new', ids); break; }
    case 'pick-more': openPicker('add'); break;
    case 'pay-status': setPayStatus(S.paymentId, t.dataset.s); break;
    case 'pay-rm': removeFromPayment(S.paymentId, id); break;
    case 'pay-pdf': makePdf(S.paymentId); break;
    case 'pay-xlsx': exportPaymentExcel(S.paymentId); break;
    case 'list-xlsx': exportListExcel(); break;
    case 'pay-del': S.payDel = true; renderAll(); break;
    case 'pay-del-no': S.payDel = false; renderAll(); break;
    case 'pay-del-yes': deletePayment(S.paymentId); break;
    case 'sheet-close': closeSheet(); break;
    case 'inv-view': openViewer(id); break;
    case 'xml-view': openViewer(id, true); break;
    case 'inv-ai': rereadInvoice(id, t); break;
    case 'inv-del': $('#inv-del-box').hidden = false; $('#inv-del-box').scrollIntoView({ block: 'nearest', behavior: 'smooth' }); break;
    case 'inv-del-no': $('#inv-del-box').hidden = true; break;
    case 'inv-del-yes': deleteInvoice(id); break;
    case 'hint-create': hintCreate(id, t); break;
    case 'open-proj': openProject(id); break;
    case 'proj-view': closeSheet(); S.tab = 'facturas'; S.projectFilter = id; S.filter = 'todas'; renderAll(); window.scrollTo(0, 0); break;
    case 'proj-del': $('#proj-del-box').hidden = false; break;
    case 'proj-del-no': $('#proj-del-box').hidden = true; break;
    case 'proj-del-yes': write(() => db.doc('projects/' + id).delete(), 'Proyecto eliminado').then((ok) => { if (ok) closeSheet(); }); break;
    case 'queue-clear': S.queue = S.queue.filter((x) => !x.done); renderQueue(); break;
    case 'viewer-close': closeViewer(); break;
    case 'ofilter': S.orderFilter = t.dataset.f; renderAll(); break;
    case 'new-order': openOrder(null); break;
    case 'open-order': openOrder(id); break;
    case 'order-add-item': { addItemRow(); const rows = $$('#o-items [data-row]'); const last = rows[rows.length - 1]; if (last) last.querySelector('[data-f="qty"]').focus(); if (S.sheet) S.sheet.dirty = true; break; }
    case 'order-rm-item': { const row = t.closest('[data-row]'); if (row) { row.remove(); renumberItems(); if (S.sheet) S.sheet.dirty = true; } break; }
    case 'order-pdf': orderPdfAction(); break;
    case 'order-signed': $('#signed-input').click(); break;
    case 'order-view-signed': { const o = S.orders.find((x) => x.id === id); if (o && o.signedFileId) showFile({ title: orderNo(o) + ' firmada', fileId: o.signedFileId, fileType: o.signedFileType }); break; }
    case 'order-annul': orderConfirm('¿Anular esta orden? Queda en el registro como anulada.', 'order-annul-yes', 'Anular orden'); break;
    case 'order-annul-yes': write(() => db.doc('orders/' + S.sheet.id).update({ status: 'anulada' }), 'Orden anulada').then((ok) => { if (ok) closeSheet(); }); break;
    case 'order-del': orderConfirm('¿Eliminar esta orden? No se puede deshacer.', 'order-del-yes', 'Eliminar orden'); break;
    case 'order-del-yes': deleteOrder(S.sheet && S.sheet.id); break;
    case 'order-confirm-no': $('#o-confirm').hidden = true; break;
    case 'order-fill': fillOrderFromMessage(t, null); break;
    case 'order-fill-photo': $('#fill-photo-input').click(); break;
    case 'link-order': linkOrder(id, t.dataset.order); break;
    case 'settings': closeSheet(); openSettings(); break;
    case 'ai-test': testKey(t); break;
    case 'backup': closeSheet(); makeBackup(); break;
    case 'backup-later': lsSet('facturas.backupSnooze', String(Date.now() + 864e5)); renderAll(); break;
    case 'restore': $('#restore-input').click(); break;
    case 'restore-yes': confirmRestore(); break;
    case 'restore-no': S.restoreFile = null; $('#restore-box').hidden = true; break;
    case 'ready-share': readyShare(); break;
    case 'ready-save': readySave(); break;
    case 'install-off': lsSet('facturas.installHintOff', '1'); renderAll(); break;
    case 'update-app': if (S.updateReg && S.updateReg.waiting) { S.updating = true; S.updateReg.waiting.postMessage('skipWaiting'); } break;
    default: break;
  }
}
async function testKey(btn) {
  const key = $('#st-key').value.trim();
  const status = $('#st-ai-status');
  if (!key) { status.textContent = 'Primero pega la clave.'; return; }
  ai.setKey(key);
  ai.setModel($('#st-model').value);
  btn.disabled = true;
  status.textContent = 'Probando…';
  try {
    await ai.test();
    status.textContent = 'La clave funciona. Las facturas nuevas se van a leer solas.';
    S.aiState = 'ok';
  } catch (e) {
    status.textContent = { bad_key: 'La clave no es válida o no tiene permiso.', offline: 'No hay internet en este momento.', rate_limited: 'La cuenta llegó a su límite; intenta más tarde.' }[e && e.code] || 'No se pudo comprobar la clave. Intenta de nuevo.';
    if (e && e.code === 'bad_key') S.aiState = 'badkey';
  } finally { btn.disabled = false; renderBanner(derive()); }
}
async function hintCreate(id, btn) {
  const i = S.invoices.find((x) => x.id === id);
  if (!i || !i.projectHint) return;
  const name = i.projectHint;
  btn.disabled = true;
  let pid = null;
  const ok = await write(async () => { pid = await ensureProject(name); await db.doc('invoices/' + id).update({ projectId: pid, projectHint: '' }); }, `Proyecto “${name}” listo`);
  if (!ok) { btn.disabled = false; return; }
  if (S.sheet && S.sheet.type === 'inv' && S.sheet.id === id && S.sheet.dirty) {
    const sel = $('#f-proj');
    if (sel && pid) {
      if (![...sel.options].some((o) => o.value === pid)) { const o = document.createElement('option'); o.value = pid; o.textContent = name; sel.insertBefore(o, sel.querySelector('option[value="__new"]')); }
      sel.value = pid;
      $('#f-newproj-wrap').hidden = true;
    }
    const m = btn.closest('.msg'); if (m) m.remove();
  }
}
function onChange(e) {
  const t = e.target;
  if (t.id === 'f-proj') { $('#f-newproj-wrap').hidden = t.value !== '__new'; if (t.value === '__new') $('#f-newproj').focus(); }
  if (t.id === 'o-proj' && t.value && !$('#o-place').value) { const prev = S.orders.find((x) => x.projectId === t.value && x.place); if (prev) $('#o-place').value = prev.place; }
  if (t.dataset && t.dataset.pick === 'group') { for (const b of $$(`#sheet-root input[data-pick="inv"][data-g="${t.dataset.g}"]`)) b.checked = t.checked; syncPicker(); } else if (t.dataset && t.dataset.pick === 'inv') syncPicker();
  if ((t.id === 'pd-name' || t.id === 'pd-date') && S.paymentId) {
    const v = t.value.trim();
    if ((t.id === 'pd-name' && !v) || (t.id === 'pd-date' && v && !ymd(v))) return;
    write(() => db.doc('payments/' + S.paymentId).update(t.id === 'pd-name' ? { name: v.slice(0, 80) } : { date: v }), 'Guardado');
  }
}
function onInput(e) {
  const t = e.target;
  if (t.id === 'f-search') { S.search = t.value; renderAll(); return; }
  if (t.id === 'o-search') { S.orderSearch = t.value; renderAll(); return; }
  if (S.sheet && S.sheet.type === 'order' && t.closest && t.closest('#order-form') && t.id !== 'o-msg') S.sheet.dirty = true;
  if (t.id === 'f-rnc' || t.id === 'f-num') liveHelp(t);
  if (S.sheet && S.sheet.type === 'inv' && t.closest && t.closest('#inv-form')) S.sheet.dirty = true;
}
function onSubmit(e) {
  const f = e.target;
  e.preventDefault();
  if (f.id === 'inv-form') saveInvoice(f);
  else if (f.id === 'order-form') saveOrder(false);
  else if (f.id === 'pick-form') {
    const ids = $$('#sheet-root input[data-pick="inv"]').filter((b) => b.checked).map((b) => b.value);
    if (!ids.length) return;
    $('#pk-go').disabled = true;
    if (S.sheet.mode === 'new') createPayment($('#pk-name').value, $('#pk-date').value, ids);
    else addToPayment(S.paymentId, ids);
  } else if (f.id === 'proj-add') {
    const inp = $('#proj-name');
    const name = inp.value.trim();
    if (!name) return;
    if (S.projects.some((p) => projKey(p.name) === projKey(name))) { toast('Ese proyecto ya existe.'); return; }
    write(() => db.collection('projects').doc().set({ name: name.slice(0, 80), createdAt: new Date().toISOString() }), 'Proyecto agregado').then((ok) => { if (ok) inp.value = ''; });
  } else if (f.id === 'proj-form') {
    const name = $('#pe-name').value.trim();
    if (!name) return;
    if (S.projects.some((p) => p.id !== f.dataset.id && projKey(p.name) === projKey(name))) { toast('Ya hay otro proyecto con ese nombre.'); return; }
    write(() => db.doc('projects/' + f.dataset.id).update({ name: name.slice(0, 80) }), 'Nombre guardado').then((ok) => { if (ok) closeSheet(); });
  } else if (f.id === 'settings-form') {
    const rncv = RD.normRnc($('#st-rnc').value);
    if (rncv && rncv.length !== 9 && rncv.length !== 11) { toast('El RNC debe tener 9 dígitos (u 11 si es cédula).'); return; }
    const data = { company: $('#st-company').value.trim().slice(0, 100), companyRnc: rncv, area: $('#st-area').value.trim().slice(0, 80), preparedBy: $('#st-name').value.trim().slice(0, 80), orderPrefix: $('#st-oc-prefix').value.trim().slice(0, 8), orderNext: Math.max(1, parseInt($('#st-oc-next').value, 10) || 1), orderNote: $('#st-oc-note').value.trim().slice(0, 500), updatedAt: new Date().toISOString() };
    const key = $('#st-key').value.trim();
    if (key !== ai.getKey()) S.aiState = 'ok';
    ai.setKey(key);
    ai.setModel($('#st-model').value);
    write(() => db.doc('settings/general').set(data), 'Ajustes guardados').then((ok) => { if (ok) { S.settings = data; closeSheet(); renderAll(); } });
  }
}
function bind() {
  document.addEventListener('click', onClick);
  document.addEventListener('change', onChange);
  document.addEventListener('input', onInput);
  document.addEventListener('submit', onSubmit);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (!$('#viewer').hidden) closeViewer(); else if (S.sheet) closeSheet(); } });
  $('#file-input').addEventListener('change', (e) => { const files = [...e.target.files]; e.target.value = ''; if (files.length) addFiles(files); });
  $('#restore-input').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) restoreBackup(f); });
  $('#signed-input').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f && S.sheet && S.sheet.type === 'order' && S.sheet.id) attachSigned(S.sheet.id, f); });
  $('#fill-photo-input').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) fillOrderFromMessage(null, f); });
  document.addEventListener('dragover', (e) => { if (canUpload() && e.dataTransfer && [...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
  document.addEventListener('drop', (e) => { if (!e.dataTransfer || !e.dataTransfer.files.length) return; e.preventDefault(); addFiles(e.dataTransfer.files); });
  document.addEventListener('paste', (e) => { const files = e.clipboardData ? [...e.clipboardData.files] : []; if (files.length && !S.sheet) { e.preventDefault(); addFiles(files); } });
  // Si el service worker todavía no sirve los archivos guardados, se cargan directo del teléfono.
  document.addEventListener('error', (e) => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement) || img.dataset.fb) return;
    const m = /\/_blob\/([^/?#]+)/.exec(img.getAttribute('src') || '');
    if (!m) return;
    img.dataset.fb = '1';
    RT.assets.objectUrl(decodeURIComponent(m[1])).then((u) => { if (u) img.src = u; });
  }, true);
  window.addEventListener('online', () => { if (S.aiState !== 'ok') scheduleRender(); });
}

/* ---------- service worker (funciona sin internet y se actualiza sola) ---------- */
function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('sw.js').then((reg) => {
    const check = () => { if (reg.waiting && navigator.serviceWorker.controller) { S.updateReg = reg; renderAll(); } };
    check();
    reg.addEventListener('updatefound', () => { const w = reg.installing; if (w) w.addEventListener('statechange', () => { if (w.state === 'installed') check(); }); });
    setInterval(() => reg.update().catch(() => {}), 3600000);
  }).catch((e) => console.warn('SW', e));
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (S.updating && !reloaded) { reloaded = true; location.reload(); } });
}

/* ---------- arranque ---------- */
function subscribe() {
  db.doc('settings/general').onSnapshot((snap) => { S.settings = (snap.exists && snap.data()) || {}; scheduleRender(); }, (err) => console.warn(err));
  const done = () => { if (S.got.projects && S.got.invoices && S.got.payments && S.got.orders && S.dbState === 'loading') S.dbState = 'ready'; };
  for (const name of ['projects', 'invoices', 'payments', 'orders']) {
    db.collection(name).onSnapshot((snap) => {
      S[name] = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
      S.got[name] = true;
      done();
      scheduleRender();
    }, (err) => { console.error(err); S.dbState = 'error'; renderAll(); });
  }
}
function boot() {
  bind();
  renderAll();
  RT.use('db').then((d) => {
    db = d;
    if (!d) { S.dbState = 'absent'; renderAll(); return; }
    subscribe();
  });
  RT.use('assets').then((a) => { assets = a; renderAll(); });
  registerSW();
}
boot();
})();
