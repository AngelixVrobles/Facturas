/* Facturas de Proyectos: app principal (pantallas, lectura de facturas, pagos, PDF y Excel). */
(() => {
'use strict';

const LIB = {
  pdflib: 'vendor/pdf-lib.min.js',
  pdfjs: 'vendor/pdf.min.js',
  pdfjsWorker: 'vendor/pdf.worker.min.js',
  jsqr: 'vendor/jsQR.min.js',
  qrgen: 'js/qr.js',
};
const PDF_CREATOR = 'Facturas de Proyectos';
const APP_VERSION = '1.27.0';
const SVG = (d) => `<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICON = {
  lock: SVG('<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>'),
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
// Fotos y PDF guardados: los sirve el service worker (./_blob/<id>). En el primer momento, antes de que tome
// control de la página, se leen directo del teléfono en vez de pedirlos al servidor (que no los tiene).
const BLANK_IMG = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const assetUrl = (id) => {
  const c = RT.assets.cachedUrl && RT.assets.cachedUrl(id);
  if (c) return c;
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) return './_blob/' + encodeURIComponent(id);
  const ph = BLANK_IMG + '#' + id;
  RT.assets.objectUrl(id).then((u) => { if (u) for (const img of document.querySelectorAll('img')) if (img.getAttribute('src') === ph) img.src = u; }).catch(() => {});
  return ph;
};
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const ROMAN = { i: '1', ii: '2', iii: '3', iv: '4', v: '5', vi: '6', vii: '7', viii: '8', ix: '9', x: '10' };
const projKey = (s) => norm(s).split(' ').map((w) => ROMAN[w] || w.replace(/^0+(\d)/, '$1')).join(' ');
const lsGet = (k) => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } };
const lsSet = (k, v) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch (e) { /* sin almacenamiento */ } };
/* ---------- registro de errores (para saber qué falló en el teléfono de otra persona) ---------- */
const ERR_KEY = 'facturas.errores';
function logErr(msg) {
  try {
    const m = String(msg || '').replace(/sk-ant-[\w-]+/g, 'sk-ant-…').replace(/\s+/g, ' ').trim().slice(0, 300);
    if (!m) return;
    const list = JSON.parse(lsGet(ERR_KEY) || '[]');
    const last = list[list.length - 1];
    if (last && last.m === m) last.n = (last.n || 1) + 1;
    else list.push({ t: new Date().toISOString(), m, v: APP_VERSION });
    lsSet(ERR_KEY, JSON.stringify(list.slice(-40)));
  } catch (e) { /* sin almacenamiento */ }
}
const errList = () => { try { return JSON.parse(lsGet(ERR_KEY) || '[]'); } catch (e) { return []; } };
{
  const show = (a) => { try { return a && a.message ? a.message + (a.stack ? ' | ' + String(a.stack).split('\n').slice(1, 3).join(' ') : '') : typeof a === 'string' ? a : JSON.stringify(a); } catch (e) { return String(a); } };
  const orig = console.error.bind(console);
  console.error = (...args) => { orig(...args); logErr(args.map(show).join(' ')); };
  window.addEventListener('error', (e) => logErr((e.message || 'Error') + (e.filename ? ' @ ' + String(e.filename).split('/').pop() + ':' + e.lineno : '')));
  window.addEventListener('unhandledrejection', (e) => logErr('Sin atender: ' + show(e.reason)));
}


const PAY_LABEL = { armando: 'Por presentar', presentado: 'Presentado', pagado: 'Pagado' };
const INV_LABEL = { pendiente: 'Pendiente', enpago: 'En pago', presentada: 'Presentada', pagada: 'Pagada' };
const GROUP_OF = { pendiente: 'pendientes', enpago: 'tramite', presentada: 'tramite', pagada: 'pagadas' };
const SEGS = [['pendientes', 'Pendientes'], ['tramite', 'En trámite'], ['pagadas', 'Pagadas'], ['todas', 'Todas']];
// Cómo se paga una factura: en un pago de la app (a crédito, lo normal), ya se pagó (al contado al comprar, o por fuera
// de la app) o se pagó al contado y hay que reponérselo a quien pagó (de su bolsillo o de la caja chica).
const PAY_METHODS = ['Efectivo', 'Transferencia', 'Tarjeta', 'Cheque'];
const PAY_MODE_LABEL = { '': 'Se paga en un pago de la app (a crédito)', directo: 'Ya se pagó (al contado o por fuera)', reponer: 'Se pagó al contado y hay que reponérselo a quien pagó' };
const payText = (i) => (i.payMode === 'directo' ? ['Ya pagada', i.payMethod ? i.payMethod.toLowerCase() : '', i.paidDate ? 'el ' + fmtDate(i.paidDate) : '', i.paidBy ? 'pagó ' + i.paidBy : ''].filter(Boolean).join(' · ') : i.payMode === 'reponer' ? `Al contado: reponerle a ${i.paidBy || 'quien lo pagó'}` : 'En un pago (a crédito)');
const Q_LABEL = { espera: 'En espera', preparando: 'Preparando…', subiendo: 'Guardando…', leyendo: 'Leyendo la factura…', lista: 'Lista', qr: 'Lista: datos del QR de la DGII', xml: 'Lista: datos del XML', manual: 'Guardada; llena los datos', orden: 'Orden firmada', conduce: 'Conduce', error: 'No se pudo agregar' };
const CUR_PREFIX = { DOP: 'RD$', USD: 'US$', EUR: '€' };
const ORDER_LABEL = { borrador: 'Borrador', enviada: 'Por firmar', autorizada: 'Firmada', anulada: 'Anulada' };
// Por qué no se pudo usar la clave de API, en palabras del usuario (lo que se arregla en la consola).
const AI_ERR = {
  bad_key: 'La clave no es válida, venció o la desactivaron. Crea otra en la consola y pégala aquí.',
  no_credit: 'La cuenta de API no tiene saldo. En la consola, entra a Billing (Facturación), compra créditos y vuelve a probar.',
  no_workspace: 'La clave no está asignada a un espacio de trabajo. Crea una clave nueva y, al crearla, elige el workspace (por ejemplo «Facturas»).',
  cors_blocked: 'La cuenta de API de la empresa no permite usarla desde el teléfono (tiene activada la retención cero de datos o el Compliance API).',
  bad_model: 'La cuenta no tiene acceso a ese modelo. Elige otro en «Modelo» y vuelve a probar.',
  rate_limited: 'La cuenta llegó a su límite de uso por ahora; intenta en unos minutos.',
  offline: 'No hay internet en este momento.',
};
const AI_STOP = new Set(['bad_key', 'no_credit', 'no_workspace', 'cors_blocked', 'bad_model']);
const ORDER_SEGS = [['sinfactura', 'Sin factura'], ['confactura', 'Con factura'], ['todas', 'Todas']];
const UNITS = ['Unidad', 'Funda', 'Saco', 'Galón', 'Cubeta', 'Caja', 'Rollo', 'Metro', 'Pie', 'Pulgada', 'Libra', 'Quintal', 'Plancha', 'Varilla', 'Tubo', 'Lámina', 'Juego', 'Par', 'Litro', 'm²', 'm³', 'Viaje', 'Servicio'];
const DEFAULT_ORDER_NOTE = 'Toda factura recibida por compras deberá estar acompañada, como mínimo, de una fotocopia de la orden de compra debidamente autorizada y sellada. Esta orden debe presentarse junto con la factura para su recepción, verificación y trámite.';

const S = {
  tab: 'facturas', filter: 'pendientes', projectFilter: 'all', search: '', paymentId: null,
  projects: [], invoices: [], payments: [], orders: [], conduces: [], workers: [], asistencia: [], suppliers: [], envios: [], papelera: [], traslados: [], settings: {}, attRules: {}, digi: {}, bk: {}, envioPending: null, got: { projects: false, invoices: false, payments: false, orders: false, conduces: false, workers: false, asistencia: false, suppliers: false, envios: false, papelera: false, traslados: false },
  attProject: '', attSheet: '', attDay: 0, orderFilter: 'todas', orderSearch: '', orderProject: 'all', condFilter: 'esperando', condSearch: '', condProject: 'all', trProject: 'all', trSearch: '', sort: { inv: null, cond: null, ord: null, tr: null }, sel: new Set(), todoAll: false, focus: null, invOrder: 'all', dateFilter: '', dateFrom: '', dateTo: '', showAll: new Set(),
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
function money(n, cur) { if (!isNum(n)) return '—'; const c = normCur(cur); return (n < 0 ? '-' : '') + (CUR_PREFIX[c] || c + ' ') + nf.format(Math.abs(n)); }
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
  const suppliers = [...S.suppliers].sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  const supByRnc = new Map(suppliers.filter((s) => RD.normRnc(s.rnc)).map((s) => [RD.normRnc(s.rnc), s]));
  const supFor = (i) => supByRnc.get(RD.normRnc(i.rnc)) || (i.supplier ? suppliers.find((s) => s.name && sameName(s.name, i.supplier)) : null) || null;
  const invIds = new Set(S.invoices.map((i) => i.id));
  const envios = [...S.envios].sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
  const envioOf = new Map();
  for (const e of envios) for (const id of e.invoiceIds || []) envioOf.set(id, e);
  const condKey = (c) => (condNum(c.number) ? (supKey(c.supplier) || '?') + '|' + condNum(c.number) : '');
  const cdups = new Map();
  for (const c of S.conduces) { const k = condKey(c); if (k) cdups.set(k, (cdups.get(k) || 0) + 1); }
  const conduces = S.conduces.map((c) => {
    let aiSt = c.ai || 'off';
    if (aiSt === 'pending' && !aiBusy('c:' + c.id) && now - (Date.parse(c.createdAt) || 0) > 120000) aiSt = 'failed';
    const k = condKey(c);
    return { ...c, ai: aiSt, invoiceId: c.invoiceId && invIds.has(c.invoiceId) ? c.invoiceId : null, project: projById.get(c.projectId) || null, dup: k ? cdups.get(k) > 1 : false };
  }).sort(condSort);
  const condByInv = new Map();
  for (const c of conduces) if (c.invoiceId) { const a = condByInv.get(c.invoiceId) || []; a.push(c); condByInv.set(c.invoiceId, a); }
  const invoices = S.invoices.map((i) => {
    const pay = payOf.get(i.id) || null;
    const abonado = round2((i.abonos || []).reduce((t, a) => t + (isNum(a.amount) ? a.amount : 0), 0));
    const toPay = isNum(i.amount) ? round2(i.amount - abonado) : i.amount;
    const status = !pay ? (i.payMode === 'directo' || (abonado > 0 && isNum(i.amount) && toPay <= 0.005) ? 'pagada' : 'pendiente') : pay.status === 'pagado' ? 'pagada' : pay.status === 'presentado' ? 'presentada' : 'enpago';
    let aiSt = i.ai || 'off';
    if (aiSt === 'pending' && !S.queue.some((q) => q.invId === i.id && !q.done) && !aiBusy(i.id) && now - (Date.parse(i.createdAt) || 0) > 120000) aiSt = 'failed';
    const k = dupKey(i);
    return { ...i, ai: aiSt, pay, status, abonado, toPay, envio: envioOf.get(i.id) || null, project: projById.get(i.projectId) || null, ...(() => { const ords = orderIdsOf(i).map((x) => orderById.get(x)).filter(Boolean); return { order: ords[0] || null, orders: ords }; })(), dup: k ? dups.get(k) > 1 : false, conduces: condByInv.get(i.id) || [], ...(() => { const sp = supFor(i); return { sup: sp, due: sp && isNum(sp.creditDays) && sp.creditDays > 0 && ymd(i.date) ? addDays(i.date, sp.creditDays) : '' }; })() };
  });
  const invByOrder = new Map();
  const namesByRnc = new Map();
  for (const i of S.invoices) if (i.rnc && i.supplier) { const a = namesByRnc.get(i.rnc) || []; if (!a.includes(i.supplier)) a.push(i.supplier); namesByRnc.set(i.rnc, a); }
  for (const i of invoices) for (const o of i.orders) { const a = invByOrder.get(o.id) || []; a.push(i); invByOrder.set(o.id, a); }
  return { projects: projects.map((p) => projById.get(p.id)), projById, invoices, orders, orderById, invByOrder, namesByRnc, firstOrderAt, conduces, condByInv, suppliers, supByRnc, supFor, envios, companyRnc: RD.normRnc(S.settings.companyRnc) };
}
function reviewFlags(i, D) {
  const r = [];
  if (i.notInvoice) r.push('¿No es factura?');
  if (struckPending(i)) r.push('Tiene tachados');
  if (i.termsCheck && !i.payMode) r.push('¿Ya se pagó?');
  if (!i.project) r.push('Falta proyecto');
  if (i.ai !== 'pending') {
    if (!isNum(i.amount)) r.push('Falta monto');
    if (!i.number) r.push('Falta NCF');
    else { const n = RD.parseNcf(i.number); if (!n.ok) r.push('NCF incompleto'); else if (n.consumo) r.push('De consumo'); }
    if (ncfExpired(i)) r.push('NCF vencido');
  }
  if (i.ai === 'failed') r.push('Sin leer');
  if (i.dup) r.push('¿Repetida?');
  if ((i.conduces || []).some((c) => c.dup)) r.push('¿Conduce repetido?');
  const x = invCross(i, D);
  if (x.over) r.push('Cobra más que sus conduces');
  if (x.missing.length) r.push('Falta conduce');
  if (x.qty.length) r.push('Más que la orden');
  if (x.est) r.push('Pasa lo estimado');
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
function orderCandidates(i, D) {
  const names = [i.supplier, ...((i.rnc && D.namesByRnc.get(i.rnc)) || [])].filter(Boolean);
  if (!names.length) return [];
  const used = (o) => ((D.invByOrder.get(o.id) || []).length ? 1 : 0);
  return D.orders.filter((o) => o.status !== 'anulada' && (!i.projectId || o.projectId === i.projectId) && names.some((n) => sameName(o.supplier, n)))
    .sort((a, b) => used(a) - used(b) || (Number(b.number) || 0) - (Number(a.number) || 0));
}
function needsOrder(i, D) { return !!(D.firstOrderAt && !i.order && !i.noOrder && !isCreditNcf(i.number) && String(i.createdAt || '') >= D.firstOrderAt); }
function fmtQty(q) { if (typeof q === 'number') return new Intl.NumberFormat('es-DO', { maximumFractionDigits: 3 }).format(q); return String(q == null ? '' : q); }
// Número de orden escrito por el proveedor ("OC-0012", "0012"), por ejemplo en <NumeroOrdenCompra> del XML.
function orderByNumberText(text, projectId) {
  const nums = (String(text || '').match(/\d+/g) || []).map(Number).filter((n) => n > 0).reverse();
  for (const n of nums) {
    const o = S.orders.find((x) => Number(x.number) === n && x.status !== 'anulada' && (!projectId || !x.projectId || x.projectId === projectId));
    if (o) return o;
  }
  return null;
}
// En el texto de un PDF: "Orden de compra: 0012", "Número Orden Compra 12", "O/C 12", "OC-0012" o el prefijo
// propio de la empresa. No toma fechas ("Fecha orden de compra: 03-11-2026") ni números largos (RNC, NCF).
function orderMentionIn(text, projectId) {
  const pre = orderPrefix().replace(/[-\s./#]+$/, '').trim();
  const labels = ['orden\\s+(?:de\\s+)?compra', '\\bo\\s*/\\s*c\\b', '\\boc\\b'];
  if (/[a-z]/i.test(pre) && !/^oc$/i.test(pre)) labels.push((/^\w/.test(pre) ? '\\b' : '') + pre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(`(?:${labels.join('|')})[^\\d\\n]{0,8}?(\\d{1,8})(?!\\d|[/.\\-]\\d)`, 'gi');
  const t = String(text || '');
  let m;
  while ((m = re.exec(t))) { const o = orderByNumberText(m[1], projectId); if (o) return o; }
  return null;
}
// Al escoger la orden de una factura: en la lista, qué se pidió; y al escogerla, su ficha para reconocerla.
const itemLine = (it) => [it.qty !== '' && it.qty != null ? fmtQty(it.qty) : '', it.unit || '', it.desc || ''].filter(Boolean).join(' ');
function orderOptLabel(o) {
  const its = (o.items || []).filter((x) => x && (x.desc || x.qty));
  const what = its.length ? itemLine(its[0]) + (its.length > 1 ? ` y ${plural(its.length - 1, 'más', 'más')}` : '') : '';
  return [orderNo(o), what, fmtDate(o.date), o.project ? o.project.name : '', orderEst(o) ? money(orderEst(o)) : ''].filter(Boolean).join(' · ');
}
function orderPreviewHTML(o, D, invId) {
  if (!o) return '';
  const its = (o.items || []).filter((x) => x && (x.desc || x.qty));
  const others = (D.invByOrder.get(o.id) || []).filter((x) => x.id !== invId);
  const head = [ORDER_LABEL[o.status] || '', o.date ? 'del ' + fmtDate(o.date) : '', o.project ? o.project.name : '', o.supplier || '', o.requestedBy ? 'la pidió ' + o.requestedBy : ''].filter(Boolean).join(' · ');
  const list = its.slice(0, 8).map((it) => `<li>${esc(itemLine(it))}${isNum(it.price) ? ` <small>· ${esc(money(it.price))} c/u</small>` : ''}</li>`).join('') + (its.length > 8 ? `<li><small>y ${plural(its.length - 8, 'artículo más', 'artículos más')}</small></li>` : '');
  return `<div class="o-prev"><div><b class="mono">${esc(orderNo(o))}</b> <small>${esc(head)}</small></div>${list ? `<ul>${list}</ul>` : '<p class="usage">La orden no tiene artículos anotados.</p>'}${orderEst(o) ? `<p class="usage">Estimado: ${esc(money(orderEst(o)))} sin ITBIS.</p>` : ''}${o.notes ? `<p class="usage">${esc(o.notes)}</p>` : ''}${others.length ? `<div class="msg"><span>Esta orden también tiene ${others.length === 1 ? 'la factura' : 'las facturas'} ${esc(others.map(invShort).join('; '))}. Si la ferretería la facturó por partes, está bien; si no, revisa que sea la orden correcta.</span></div>` : ''}</div>`;
}
// Pedidos separados (cada uno con su orden) que la ferretería mandó juntos en una sola factura: la factura tiene su orden
// principal y las demás en moreOrders. Cada orden cuenta como facturada, y lo estimado se compara con todas juntas.
const orderIdsOf = (i) => [i.orderId, ...(Array.isArray(i.moreOrders) ? i.moreOrders : [])].filter((x, k, a) => x && a.indexOf(x) === k);
function moreOrdersHTML(i, D, edit) {
  if (!i.order) return '';
  const more = (i.orders || []).slice(1);
  const same = (o) => sameName(o.supplier, i.supplier) || sameName(o.supplier, i.order.supplier) || (!!i.rnc && (D.namesByRnc.get(i.rnc) || []).some((n) => sameName(o.supplier, n)));
  const cands = edit ? D.orders.filter((o) => o.status !== 'anulada' && !(i.orders || []).some((x) => x.id === o.id) && !(D.invByOrder.get(o.id) || []).length && same(o)).sort((a, b) => (Number(b.number) || 0) - (Number(a.number) || 0)).slice(0, 20) : [];
  if (!more.length && !cands.length) return '';
  const rows = more.map((o) => `<div class="ab-row"><button type="button" class="link" data-act="open-order" data-id="${esc(o.id)}">${esc([orderNo(o), o.project ? o.project.name : '', orderEst(o) ? 'estimado ' + money(orderEst(o)) : ''].filter(Boolean).join(' · '))}</button>${edit ? `<button type="button" class="icon-btn plain" data-act="mo-rm" data-id="${esc(i.id)}" data-o="${esc(o.id)}" aria-label="Quitar esta orden">${ICON.close}</button>` : ''}</div>`).join('');
  const ests = (i.orders || []).map(orderEst);
  const sub = isNum(i.amount) ? round2(i.amount - (isNum(i.itbis) ? i.itbis : 0)) : null;
  const sum = more.length && ests.every((e) => e) && sub != null ? `<p class="usage">Las ${i.orders.length} órdenes suman ${esc(money(round2(ests.reduce((a, b) => a + b, 0))))} estimado (sin ITBIS); la factura, ${esc(money(sub, i.currency))} sin ITBIS.</p>` : '';
  const add = cands.length ? `<div class="tc-link"><select id="mo-add" aria-label="Otra orden"><option value="">Elige la otra orden</option>${cands.map((o) => `<option value="${esc(o.id)}">${esc(orderOptLabel(o))}</option>`).join('')}</select><button type="button" class="btn sm" data-act="mo-add" data-id="${esc(i.id)}">${ICON.plus} Agregar</button></div><div id="mo-prev"></div>` : '';
  return `<div class="field full" id="inv-more-orders"><label${add ? ' for="mo-add"' : ''}>${more.length ? 'Otras órdenes que vinieron en esta factura' : '¿La ferretería mandó juntos otros pedidos en esta factura? Agrega sus órdenes'}</label>${rows}${add}${sum}</div>`;
}
function refreshMoreOrders(invId) {
  setTimeout(() => {
    const box = $('#inv-more-orders');
    if (!S.sheet || S.sheet.type !== 'inv' || S.sheet.id !== invId) return;
    const D = derive(), i = D.invoices.find((x) => x.id === invId);
    if (!i) return;
    const html = moreOrdersHTML(i, D, canEdit());
    if (box) box.outerHTML = html || '<div id="inv-more-orders" hidden></div>';
  }, 150);
}
async function addMoreOrder(invId, orderId) {
  const raw = S.invoices.find((x) => x.id === invId), o = S.orders.find((x) => x.id === orderId);
  if (!raw || !o) return false;
  if (!raw.orderId) return linkOrder(invId, orderId, 'Orden asignada');
  const moreOrders = orderIdsOf({ moreOrders: [...(raw.moreOrders || []), orderId] }).filter((x) => x !== raw.orderId);
  return write(() => db.doc('invoices/' + invId).update({ moreOrders, noOrder: false, hist: histAdd(raw, histEntry('Se le agregó la orden ' + orderNo(o))) }), `Agregada la orden ${orderNo(o)}`);
}
// Quitar una orden de la factura: si es la principal, la siguiente pasa a ser la principal.
async function removeOrderFromInv(invId, orderId) {
  const raw = S.invoices.find((x) => x.id === invId);
  if (!raw) return false;
  const ids = orderIdsOf(raw).filter((x) => x !== orderId);
  return write(() => db.doc('invoices/' + invId).update({ orderId: ids[0] || null, moreOrders: ids.slice(1), orderAuto: false }), 'Orden quitada de la factura');
}
// La orden completa lo que la factura no trae (el QR no dice el nombre del proveedor ni la obra).
function fillFromOrder(target, inv, o) {
  target.orderId = o.id;
  if (!(inv.projectId || target.projectId) && o.projectId) { target.projectId = o.projectId; target.projectHint = ''; }
  if (!(inv.supplier || target.supplier) && o.supplier) target.supplier = o.supplier;
  if (!(inv.concept || target.concept) && Array.isArray(o.items) && o.items.length) target.concept = itemsSummary(o.items);
  return target;
}
// "Cemento gris 42.5 kg y 3 artículos más"
function itemsSummary(items) {
  const its = (items || []).filter((x) => x && x.desc);
  if (!its.length) return '';
  return (its.length > 1 ? `${its[0].desc} y ${plural(its.length - 1, 'artículo más', 'artículos más')}` : its[0].desc).slice(0, 140);
}
// Una sola orden abierta (por firmar o firmada, todavía sin facturas) de este proveedor, en su obra si ya la tiene: se enlaza sola.
// Una orden que otra factura acaba de tomar (y todavía se está guardando) ya no cuenta como abierta.
const autoClaims = new Map();
function soleOpenOrder(inv, D) {
  const names = [inv.supplier, ...((inv.rnc && D.namesByRnc.get(inv.rnc)) || [])].filter(Boolean);
  if (!names.length) return null;
  const open = D.orders.filter((o) => (o.status === 'enviada' || o.status === 'autorizada') && !(D.invByOrder.get(o.id) || []).some((x) => x.id !== inv.id)
    && !(autoClaims.has(o.id) && autoClaims.get(o.id) !== inv.id)
    && (!inv.projectId || o.projectId === inv.projectId) && names.some((n) => sameName(o.supplier, n)));
  return open.length === 1 ? open[0] : null;
}
// La obra escrita en el texto de un PDF (por ejemplo "Obra: Caperuza 2"), entre los proyectos que ya existen.
function projectMentionIn(text) {
  const t = ' ' + projKey(String(text || '').slice(0, 12000)) + ' ';
  let best = null, bestLen = 0;
  for (const p of S.projects) {
    const k = projKey(p.name);
    if (k.length >= 4 && k.length > bestLen && t.includes(' ' + k + ' ')) { best = p; bestLen = k.length; }
  }
  return best;
}
// Código QR de la orden de compra: "OC1:<id>:<número>".
const orderQrText = (o) => `OC1:${o.id}:${Number(o.number) || 0}`;
function parseOrderQr(t) {
  const m = /^OC1:([0-9a-z]{6,40}):(\d{1,7})$/i.exec(String(t || '').trim());
  return m ? { kind: 'order', id: m[1], number: Number(m[2]) } : null;
}
// Nombre del proveedor según facturas anteriores con el mismo RNC.
function knownSupplier(rnc) {
  if (!rnc) return '';
  let best = null;
  for (const x of S.invoices) if (x.rnc === rnc && x.supplier && (!best || String(x.createdAt || '') > String(best.createdAt || ''))) best = x;
  return best ? best.supplier : '';
}
function matchOrderRefs(text, projectId) {
  const t = String(text || '');
  const pre = orderPrefix().trim();
  if (!(/\b(o\s*\/\s*c|oc|ordenes|órdenes|orden)\b/i.test(t) || (pre && t.toUpperCase().includes(pre.toUpperCase())))) return [];
  const out = [];
  for (const n of (t.match(/\d+/g) || []).map(Number)) {
    const o = S.orders.find((x) => Number(x.number) === n && x.status !== 'anulada' && (!projectId || !x.projectId || x.projectId === projectId));
    if (o && !out.includes(o)) out.push(o);
  }
  return out;
}
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
/* ---------- conduces: utilidades ---------- */
// El conduce es la nota de entrega del material (agregados, blocks, etc.) que viene con la factura.
const condNum = (s) => String(s || '').replace(/\D/g, '').replace(/^0+/, '');
const condSort = (a, b) => String(a.date || '').localeCompare(String(b.date || '')) || (Number(condNum(a.number)) || 0) - (Number(condNum(b.number)) || 0) || String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
const condTitle = (c) => (c.number ? 'Conduce ' + c.number : 'Conduce sin número');
function condMeta(c) { return [fmtDate(c.date), [c.material, c.qty].filter(Boolean).join(' '), isNum(c.trips) ? plural(c.trips, 'viaje', 'viajes') : ''].filter(Boolean).join(' · '); }
const sameAmount = (c, i) => isNum(c.total) && c.total > 0 && isNum(i.amount) && (Math.abs(i.amount - c.total) < 0.005 || (isNum(i.itbis) && Math.abs(i.amount - i.itbis - c.total) < 0.005));
function condSameSup(c, i, D) {
  if (c.rnc && i.rnc && RD.normRnc(c.rnc) === RD.normRnc(i.rnc)) return true;
  const names = [i.supplier, ...((i.rnc && D.namesByRnc.get(i.rnc)) || [])].filter(Boolean);
  return !!c.supplier && names.some((n) => sameName(c.supplier, n));
}
// Una factura que junta varios conduces sin decir sus números: si los conduces que esperan de ese proveedor, del más
// viejo al más nuevo, suman lo mismo que la factura (con o sin ITBIS), son esos. No entran los de después de la factura.
function condSumSet(i, D, claimed = new Set()) {
  if (i.status === 'pagada' || i.ai === 'pending' || i.notInvoice || (i.conduces || []).length || (i.conduceRefs || []).length || !isNum(i.amount) || i.amount <= 0) return null;
  const wait = D.conduces.filter((c) => !c.invoiceId && !c.noAuto && c.ai !== 'pending' && !claimed.has(c.id) && isNum(c.total) && c.total > 0
      && normCur(c.currency) === normCur(i.currency) && (!c.projectId || !i.projectId || c.projectId === i.projectId)
      && !(ymd(c.date) && ymd(i.date) && c.date > i.date) && condSameSup(c, i, D))
    .sort((a, b) => String(a.date || a.createdAt || '').localeCompare(String(b.date || b.createdAt || '')) || String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
  if (wait.length < 2) return null;
  const targets = [i.amount, isNum(i.itbis) && i.itbis > 0 ? round2(i.amount - i.itbis) : null].filter(isNum);
  let sum = 0;
  for (let k = 0; k < wait.length; k++) {
    sum = round2(sum + wait[k].total);
    if (k > 0 && targets.some((t) => Math.abs(t - sum) < 0.005)) return wait.slice(0, k + 1);
  }
  return null;
}
// A qué factura va un conduce que llegó solo: la que menciona su número; si no, la única del mismo proveedor con
// el mismo monto; si no, la del mismo proveedor que se agregó junto con él (en los mismos 15 minutos).
// Una factura que ya cuadra: sus conduces suman lo mismo que ella (con o sin ITBIS).
function condComplete(i) {
  const cs = i.conduces || [];
  if (!cs.length || !isNum(i.amount) || !cs.every((c) => isNum(c.total))) return false;
  const sum = round2(cs.reduce((t, c) => t + c.total, 0));
  return Math.abs(sum - i.amount) < 0.005 || (isNum(i.itbis) && i.itbis > 0 && Math.abs(sum - round2(i.amount - i.itbis)) < 0.005);
}
function conduceMatch(c, D, filled = new Set()) {
  const open = D.invoices.filter((i) => i.status !== 'pagada' && (!c.projectId || !i.projectId || i.projectId === c.projectId));
  const num = condNum(c.number);
  if (num) {
    const byRef = open.filter((i) => (i.conduceRefs || []).some((r) => condNum(r) === num));
    const sameS = byRef.filter((i) => condSameSup(c, i, D));
    if (sameS.length === 1) return { inv: sameS[0], why: 'numero' };
    if (byRef.length === 1) return { inv: byRef[0], why: 'numero' };
  }
  const cands = open.filter((i) => condSameSup(c, i, D) && !filled.has(i.id) && !condComplete(i));
  if (!cands.length) return null;
  const byAmt = cands.filter((i) => sameAmount(c, i));
  if (byAmt.length === 1) return { inv: byAmt[0], why: 'monto' };
  const ct = Date.parse(c.createdAt) || 0;
  const near = cands.map((i) => ({ i, d: Math.abs((Date.parse(i.createdAt) || 0) - ct) })).filter((x) => x.d <= 15 * 60000).sort((a, b) => a.d - b.d);
  if (near.length === 1 || (near.length > 1 && near[0].d < near[1].d)) return { inv: near[0].i, why: 'lote' };
  return null;
}
// Conduces esperando factura que pueden ser de esta (para sugerirlos en la factura).
function condSuggestions(i, D) {
  const it = Date.parse(i.createdAt) || 0;
  return D.conduces.filter((c) => !c.invoiceId && c.ai !== 'pending').map((c) => {
    let s = 0;
    if (condSameSup(c, i, D)) s += 2;
    if (sameAmount(c, i)) s += 2;
    if (c.projectId && c.projectId === i.projectId) s += 1;
    if (Math.abs((Date.parse(c.createdAt) || 0) - it) <= 15 * 60000) s += 1;
    if (condNum(c.number) && (i.conduceRefs || []).some((r) => condNum(r) === condNum(c.number))) s += 3;
    return { c, s };
  }).filter((x) => x.s >= 2).sort((a, b) => b.s - a.s || String(b.c.createdAt || '').localeCompare(String(a.c.createdAt || ''))).map((x) => x.c);
}
// Nota de crédito (B04 o E34): resta. Su monto y su ITBIS se guardan en negativo; los de las demás, en positivo.
const isCreditNcf = (n) => { const p = RD.parseNcf(n); return p.ok && (p.code === '04' || p.code === '34'); };
function signAmounts(doc, base) {
  const changesNumber = doc.number !== undefined;
  const credit = isCreditNcf(changesNumber ? doc.number : base && base.number);
  for (const f of ['amount', 'itbis']) {
    const v = doc[f] !== undefined ? doc[f] : changesNumber && base ? base[f] : undefined;
    if (isNum(v) && v !== 0 && (credit ? v > 0 : v < 0)) doc[f] = -v;
  }
  return doc;
}
// Las notas de crédito que se guardaron antes de esto (con el monto en positivo) se arreglan una vez.
// Reglas guardadas antes: hasta la 1.11 la tardanza no descontaba (ahora descuenta medio día) y de la 1.11 a la 1.19
// el sábado valía medio día (ahora es día entero, hasta las 5; el medio día se escoge en cada día de la planilla).
async function fixAttRules() {
  if (!canEdit()) return;
  const snap = await db.doc('settings/asistencia').get();
  const r = snap.exists ? snap.data() : null;
  if (!r || (r.rev || 0) >= 3) return;
  const up = { ...r, rev: 3, updatedAt: new Date().toISOString() };
  if (!r.rev && r.late === 0) up.late = 0.5;
  if (r.saturday === 0.5) up.saturday = 1;
  await db.doc('settings/asistencia').set(up);
}
async function fixCreditSigns() {
  if (!canEdit()) return;
  for (const i of S.invoices) {
    const fixed = signAmounts({ number: i.number, amount: i.amount, itbis: i.itbis });
    if (fixed.amount !== i.amount || fixed.itbis !== i.itbis) await db.doc('invoices/' + i.id).update({ amount: fixed.amount, itbis: fixed.itbis }).catch((e) => console.warn(e));
  }
}
/* ---------- cruce orden, conduce y factura ---------- */
// Cantidad escrita ("5 mts", "400 uds", "2.5") en número y unidad comparables.
function unitKey(u) {
  const s = norm(String(u || '').replace(/³/g, '3').replace(/²/g, '2'));
  if (!s) return '';
  if (/^(m3|m 3|mt3|mts3|mts|mt|mc|metros?( cubicos?)?)$/.test(s)) return 'm3';
  if (/^viajes?$/.test(s)) return 'viaje';
  if (/^(uds?|unds?|und|u|unidad(es)?|pzas?|piezas?)$/.test(s)) return 'ud';
  return s.replace(/(es|s)$/, '');
}
function qtyOf(v, unit) {
  const s = String(v ?? '').replace(',', '.');
  const m = /(\d+(?:\.\d+)?)/.exec(s);
  if (!m) return null;
  return { n: Number(m[1]), u: unitKey(unit != null ? unit : s.slice(m.index + m[0].length)) };
}
const MAT_STOP = new Set(['para', 'con', 'sin', 'tipo', 'color', 'pulgadas', 'pulgada', 'metros', 'metro', 'lavada', 'lavado']);
const matWords = (t) => norm(t).split(' ').map((w) => w.replace(/(es|s)$/, '')).filter((w) => w.length >= 4 && !MAT_STOP.has(w) && !/^\d/.test(w));
// Lo que traen los conduces de las facturas de una orden, contra lo que pidió la orden (mismo material y unidad).
function orderQtyIssues(o, D) {
  const oinvs = D.invByOrder.get(o.id) || [];
  const conds = oinvs.flatMap((i) => i.conduces || []);
  if (!conds.length) return [];
  const others = [...new Map(oinvs.flatMap((i) => i.orders || []).filter((x) => x.id !== o.id).map((x) => [x.id, x])).values()].flatMap((x) => x.items || []);
  const out = [];
  for (const it of o.items || []) {
    const oq0 = qtyOf(it.qty, it.unit);
    const words = matWords(it.desc);
    if (!oq0 || !oq0.n || !words.length) continue;
    const extra = others.reduce((t, x) => { const q = qtyOf(x.qty, x.unit); return q && q.n && q.u === oq0.u && matWords(x.desc).some((w) => words.includes(w)) ? t + q.n : t; }, 0);
    const oq = { ...oq0, n: oq0.n + extra };
    let sum = 0, any = false;
    for (const c of conds) {
      if (!matWords(c.material).some((w) => words.includes(w))) continue;
      if (oq.u === 'viaje') { if (isNum(c.trips)) { sum += c.trips; any = true; } continue; }
      const cq = qtyOf(c.qty);
      if (!cq || (cq.u && oq.u && cq.u !== oq.u)) continue;
      sum += cq.n; any = true;
    }
    if (any && sum > oq.n + 1e-6) out.push({ desc: it.desc, ordered: oq.n, delivered: round2(sum), unit: it.unit || '' });
  }
  return out;
}
// Lo que no cuadra en una factura: cobra más que sus conduces, menciona un conduce que no está, o la orden se pasó.
function invCross(i, D) {
  const r = { over: null, missing: [], qty: [] };
  const list = i.conduces || [];
  if (!i.condOverOk && list.length && list.every((c) => isNum(c.total)) && isNum(i.amount) && i.amount > 0) {
    const sum = round2(list.reduce((t, c) => t + c.total, 0));
    const charged = isNum(i.itbis) ? round2(i.amount - i.itbis) : i.amount;
    if (charged - sum > 1) r.over = { sum, charged, diff: round2(charged - sum), sinItbis: isNum(i.itbis) && i.itbis > 0 };
  }
  if (!i.condRefsOk) {
    const have = new Set(list.map((c) => condNum(c.number)).filter(Boolean));
    r.missing = uniqList((i.conduceRefs || []).map(condNum).filter((n) => n && !have.has(n)));
  }
  if (i.order && !i.qtyOk) r.qty = orderQtyIssues(i.order, D);
  if (i.order && !i.estOk) {
    const ests = (i.orders || [i.order]).map(orderEst);
    const est = ests.every((e) => e) ? round2(ests.reduce((a, b) => a + b, 0)) : null;
    if (est) {
      const invs = [...new Map((i.orders || [i.order]).flatMap((o) => D.invByOrder.get(o.id) || []).concat([i]).map((x) => [x.id, x])).values()];
      const sub = round2(invs.reduce((t, x) => t + (isNum(x.amount) ? x.amount - (isNum(x.itbis) ? x.itbis : 0) : 0), 0));
      if (sub > est * 1.05 + 1) r.est = { est, sub, many: invs.length > 1 };
    }
  }
  return r;
}
function crossMsgsHTML(i, D, edit) {
  const x = invCross(i, D);
  const ok = (f, label = 'Está bien') => (edit ? ` <button type="button" class="link" data-act="ack" data-f="${f}" data-id="${esc(i.id)}">${label}</button>` : '');
  const out = [];
  if (x.over) out.push(`<div class="msg warn">${ICON.alert}<span>La factura cobra <b>${esc(money(x.over.charged, i.currency))}</b>${x.over.sinItbis ? ' sin ITBIS' : ''} y sus conduces suman <b>${esc(money(x.over.sum, i.currency))}</b>: ${esc(money(x.over.diff, i.currency))} más.${ok('condOverOk')}</span></div>`);
  if (x.missing.length) out.push(`<div class="msg warn">${ICON.alert}<span>La factura menciona ${x.missing.length === 1 ? 'el conduce' : 'los conduces'} <b>${esc(x.missing.join(', '))}</b>, que no ${x.missing.length === 1 ? 'está adjunto' : 'están adjuntos'}.${edit ? ` <button type="button" class="link" data-act="cond-add" data-inv="${esc(i.id)}">Agregar conduce</button>` : ''}${ok('condRefsOk', 'No hace falta')}</span></div>`);
  if (x.qty.length) out.push(`<div class="msg warn">${ICON.alert}<span>${x.qty.map((q) => `Los conduces de la orden ${esc(orderNo(i.order))} traen <b>${esc(fmtQty(q.delivered))}${q.unit ? ' ' + esc(q.unit) : ''}</b> de ${esc(q.desc)} y la orden pidió ${esc(fmtQty(q.ordered))}.`).join(' ')}${ok('qtyOk')}</span></div>`);
  if (x.est) { const ords = i.orders && i.orders.length ? i.orders : [i.order], several = ords.length > 1, nos = ords.map(orderNo).join(' y '); out.push(`<div class="msg warn">${ICON.alert}<span>${x.est.many ? (several ? 'Las facturas de las órdenes' : 'Las facturas de la orden') : several ? 'La factura de las órdenes' : 'La factura de la orden'} ${esc(nos)} ${x.est.many ? 'suman' : 'cobra'} <b>${esc(money(x.est.sub))}</b> sin ITBIS y ${several ? 'las órdenes estimaron' : 'la orden estimó'} <b>${esc(money(x.est.est))}</b>.${ok('estOk')}</span></div>`); }
  return out.join('');
}
/* ---------- fechas ---------- */
const invDay = (i) => (ymd(i.date) ? i.date : String(i.createdAt || '').slice(0, 10));
const monthFmt = new Intl.DateTimeFormat('es-DO', { month: 'long', year: 'numeric' });
function monthName(ym) { const [y, m] = String(ym).split('-').map(Number); const t = monthFmt.format(new Date(y, m - 1, 1)); return t.charAt(0).toUpperCase() + t.slice(1); }
function inDates(i) {
  if (!S.dateFilter) return true;
  const d = invDay(i);
  if (S.dateFilter === 'range') return (!S.dateFrom || d >= S.dateFrom) && (!S.dateTo || d <= S.dateTo);
  return d.slice(0, 7) === S.dateFilter;
}
function dateLabel() {
  if (!S.dateFilter) return '';
  if (S.dateFilter !== 'range') return monthName(S.dateFilter);
  return [S.dateFrom ? 'Del ' + fmtDate(S.dateFrom) : '', S.dateTo ? (S.dateFrom ? 'al ' : 'Hasta el ') + fmtDate(S.dateTo) : ''].filter(Boolean).join(' ');
}
/* ---------- vencimientos, estimado de la orden y presupuesto ---------- */
function dueInfo(i) {
  if (!i.due || i.status === 'pagada' || !ymd(i.due)) return null;
  const days = Math.round((ymd(i.due) - ymd(todayISO())) / 864e5);
  return { days, overdue: days < 0 };
}
const dueText = (d) => (d.overdue ? `Vencida hace ${plural(-d.days, 'día', 'días')}` : d.days === 0 ? 'Vence hoy' : `Vence en ${plural(d.days, 'día', 'días')}`);
// Lo estimado de una orden: cantidad por precio de los artículos que tienen precio.
function orderEst(o) {
  let t = 0, any = false;
  for (const it of (o && o.items) || []) if (isNum(it.qty) && isNum(it.price)) { t += it.qty * it.price; any = true; }
  return any ? round2(t) : null;
}
const estText = (items) => { const e = orderEst({ items }); return e ? `Estimado: ${money(e)} (sin ITBIS, según los precios escritos; no sale en el PDF de la orden).` : 'El precio de cada artículo es opcional: sirve para comparar con la factura y no sale en el PDF de la orden.'; };
function laborCost(pid) {
  const R = attRules();
  let t = 0;
  for (const sh of attSheetsOf(pid)) for (const w of attSheetWorkers(sh)) if (isNum(w.pay)) t += attTotals(sh, w.id, R).days * w.pay;
  return round2(t);
}
function projCosts(p, D) {
  const invs = D.invoices.filter((i) => i.projectId === p.id);
  const dop = round2(invs.filter((i) => normCur(i.currency) === 'DOP').reduce((t, i) => t + (isNum(i.amount) ? i.amount : 0), 0));
  const other = invs.filter((i) => normCur(i.currency) !== 'DOP' && isNum(i.amount));
  const labor = laborCost(p.id);
  const pendingOrders = round2(D.orders.filter((o) => o.projectId === p.id && o.status !== 'anulada' && !(D.invByOrder.get(o.id) || []).length).reduce((t, o) => t + (orderEst(o) || 0), 0));
  const tr = trOfProject(p.id);
  return { dop, other, labor, pendingOrders, trIn: tr.inn, trOut: tr.out, total: round2(dop + labor + tr.inn - tr.out) };
}
function budgetHTML(p, D) {
  const c = projCosts(p, D);
  const b = isNum(p.budget) && p.budget > 0 ? p.budget : null;
  const pct = b ? Math.round((c.total / b) * 100) : null;
  return `<div class="card budget"><div class="b-top"><span>Gastado${b ? ` · ${pct} %` : ''}</span><b>${esc(money(c.total))}</b></div>${b ? `<div class="b-bar"><i style="width:${Math.min(100, pct)}%" class="${pct > 100 ? 'over' : pct >= 85 ? 'near' : ''}"></i></div><small>de ${esc(money(b))} · ${c.total > b ? 'se pasó por ' + esc(money(round2(c.total - b))) : 'quedan ' + esc(money(round2(b - c.total)))}</small>` : ''}<small>Facturas ${esc(money(c.dop))}${c.labor ? ' · mano de obra ' + esc(money(c.labor)) : ''}${c.other.length ? ' · más ' + esc(totalStr(c.other)) : ''}${c.trIn ? ' · materiales de otras obras ' + esc(money(c.trIn)) : ''}${c.trOut ? ' · materiales dados a otras obras −' + esc(money(c.trOut)) : ''}${c.pendingOrders ? ' · órdenes por facturar ' + esc(money(c.pendingOrders)) : ''}</small></div>`;
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
const FOCUS = {
  revisar: (i, D) => reviewFlags(i, D).some((f) => f !== 'Sin orden'),
  sinorden: (i, D) => needsOrder(i, D),
  vencidas: (i) => { const d = dueInfo(i); return !!d && d.overdue; },
  porvencer: (i) => { const d = dueInfo(i); return !!d && !d.overdue && d.days <= 7; },
};
const FOCUS_LABEL = { revisar: 'facturas con algo que revisar', sinorden: 'facturas sin orden de compra', vencidas: 'facturas vencidas', porvencer: 'facturas que vencen esta semana' };
function visibleList(D) {
  const q = norm(S.search);
  let list = D.invoices.filter((i) => inProject(i) && (!!S.focus || inDates(i)));
  if (S.focus) list = list.filter((i) => i.status !== 'pagada' && (FOCUS[S.focus] || FOCUS.sinorden)(i, D));
  else list = list.filter((i) => S.filter === 'todas' || GROUP_OF[i.status] === S.filter);
  if (!S.focus && D.orders.length && S.invOrder !== 'all') list = list.filter((i) => (S.invOrder === 'con' ? !!i.order : !i.order));
  if (q) list = list.filter((i) => norm([i.supplier, i.number, i.rnc, i.concept, i.ref, i.project && i.project.name, i.fileName, (i.orders || []).map(orderNo).join(' '), (i.conduces || []).map((c) => c.number).join(' ')].join(' ')).includes(q));
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
// Busca el QR de la DGII en la imagen original (sin reducir): primero completa y luego por partes, porque en
// muchas facturas el QR es pequeño (2 a 3 cm) y va abajo a la izquierda, al centro o a la derecha.
const QR_REGIONS = [
  [0, 0, 1, 1],
  [0, 0.45, 0.6, 0.55], [0.4, 0.45, 0.6, 0.55], [0.2, 0.45, 0.6, 0.55], [0, 0, 0.6, 0.55], [0.4, 0, 0.6, 0.55],
  [0, 0.6, 0.42, 0.4], [0.29, 0.6, 0.42, 0.4], [0.58, 0.6, 0.42, 0.4],
];
async function scanQr(src) {
  try { await loadScript(LIB.jsqr); } catch (e) { return null; }
  if (typeof window.jsQR !== 'function') return null;
  const W = src.naturalWidth || src.width, H = src.naturalHeight || src.height;
  if (!W || !H) return null;
  let orderHit = null;
  for (const [fx, fy, fw, fh] of QR_REGIONS) {
    const sx = Math.round(W * fx), sy = Math.round(H * fy);
    const sw = Math.round(W * fw), sh = Math.round(H * fh);
    const k = Math.min(2.5, 1400 / Math.max(sw, sh));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(sw * k)); c.height = Math.max(1, Math.round(sh * k));
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(src, sx, sy, sw, sh, 0, 0, c.width, c.height);
    const img = ctx.getImageData(0, 0, c.width, c.height);
    const code = window.jsQR(img.data, c.width, c.height, { inversionAttempts: 'dontInvert' });
    if (code && code.data) { const qr = RD.parseQr(code.data); if (qr) return qr; if (!orderHit) orderHit = parseOrderQr(code.data); }
  }
  return orderHit;
}
async function prepImage(file) {
  const img = await loadImage(file);
  const big = scaledCanvas(img, 2000);
  const blob = await canvasToJpeg(big, 0.85);
  const qr = await scanQr(img);
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
    // Páginas con el código de una orden (factura y orden engrapadas y escaneadas juntas).
    const orderPages = qr && qr.kind === 'order' ? [1] : [];
    let orderQr = qr && qr.kind === 'order' ? qr : null;
    for (let n = 2; n <= Math.min(pdf.numPages, 8); n++) {
      try { const q = await scanQr(await renderPdfCanvas(pdf, n, 1600)); if (q && q.kind === 'order' && (!orderQr || q.id === orderQr.id)) { orderPages.push(n); orderQr = orderQr || q; } } catch (e) { /* página sin código */ }
    }
    const thumb = await canvasToJpeg(scaledCanvas(page, 1400), 0.85);
    let creator = '';
    try { const md = await pdf.getMetadata(); creator = String((md && md.info && md.info.Creator) || ''); } catch (e) { /* sin metadatos */ }
    return { pages: pdf.numPages, text: text.replace(/[ \t]+/g, ' ').slice(0, 12000), thumb, qr, creator, orderPages, orderQr };
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
// Aviso con un botón (por ejemplo «Deshacer»); dura un poco más.
function toastAct(msg, label, fn) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(msg)}</span><button type="button" class="toast-act">${esc(label)}</button>`;
  el.hidden = false;
  el.querySelector('.toast-act').onclick = () => { el.hidden = true; fn(); };
  clearTimeout(toastT);
  toastT = setTimeout(() => { el.hidden = true; }, 7000);
}

/* ---------- pantallas ---------- */
let rq = 0;
function scheduleRender() { if (rq) return; rq = requestAnimationFrame(() => { rq = 0; if (typingInView()) { heldRender = true; return; } renderAll(); }); }
// Mientras se escribe en algo que la pantalla vuelve a dibujar (la nota para devolver un pago, el nombre del pago, la hora
// de entrada), lo que llega de fondo (la nube, otro aparato) espera a que termine: así no se borra lo escrito ni se cierra el teclado.
let staticFields = new Set(), heldRender = false;
function typingInView() {
  const a = document.activeElement, v = $('#v-' + S.tab);
  if (!a || !v || !v.contains(a) || staticFields.has(a)) return false;
  return a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && /^(text|search|email|number|tel|url|password)$/.test(a.type));
}
const canEdit = () => S.dbState === 'ready';
const canUpload = () => canEdit() && !!assets;
const isStandalone = () => !!(navigator.standalone || (window.matchMedia && matchMedia('(display-mode: standalone)').matches));
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/* ---------- teclado (computadora) ---------- */
// «/» busca, «N» agrega, flechas para moverse por la tabla, «Esc» cierra.
function onKeys(e) {
  if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target, typing = t && (t.isContentEditable || /^(TEXTAREA|SELECT)$/.test(t.tagName) || (t.tagName === 'INPUT' && !/^(checkbox|radio|button|submit|reset|file|range|color)$/.test(t.type)));
  if (!$('#lock').hidden) return;
  if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && t && t.classList && t.classList.contains('row-btn')) {
    const all = $$('.view:not([hidden]) .tbl .row-btn').filter((x) => x.offsetParent !== null);
    const k = all.indexOf(t) + (e.key === 'ArrowDown' ? 1 : -1);
    if (all[k]) { e.preventDefault(); all[k].focus(); all[k].closest('tr').scrollIntoView({ block: 'nearest' }); }
    return;
  }
  if (typing || S.sheet || !$('#viewer').hidden) return;
  if (e.key === '/') {
    const box = { facturas: '#f-search', conduces: '#c-search', ordenes: '#o-search', traslados: '#t-search' }[S.tab];
    if (box && $(box)) { e.preventDefault(); $(box).focus(); }
  } else if (e.key === 'n' || e.key === 'N') {
    if (!canEdit()) return;
    if (S.tab === 'facturas' && canUpload()) { e.preventDefault(); pickFiles(); }
    else if (S.tab === 'conduces' && canUpload()) { e.preventDefault(); condTarget = null; $('#cond-input').click(); }
    else if (S.tab === 'ordenes') { e.preventDefault(); $('#o-new').click(); }
    else if (S.tab === 'traslados' && S.projects.length > 1) { e.preventDefault(); openTraslado(null); }
  }
}
const deviceWord = () => (wide() ? 'esta computadora' : 'este teléfono');

/* ---------- espacio de la nube ---------- */
// El plan gratis de Supabase trae alrededor de 1 GB para archivos; las fotos y PDF de aquí son los mismos de la nube.
const CLOUD_FREE_BYTES = 1024 * 1048576;
async function measureStorage() {
  try { const { usage } = await assets.list(); S.fileBytes = usage.bytes || 0; scheduleRender(); } catch (e) { /* sin dato */ }
}

function renderAll() {
  const D = derive();
  $$('.tabs [data-tab]').forEach((b) => { if (b.dataset.tab === S.tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  { const m = $('.tabs .more-tab'); if (m) { if (S.tab === 'asistencia' || S.tab === 'proyectos' || S.tab === 'traslados') m.setAttribute('aria-current', 'page'); else m.removeAttribute('aria-current'); } }
  for (const t of ['facturas', 'conduces', 'ordenes', 'traslados', 'pagos', 'asistencia', 'proyectos']) $('#v-' + t).hidden = S.tab !== t;
  const pay = S.tab === 'pagos' && S.paymentId ? S.payments.find((p) => p.id === S.paymentId) : null;
  $('#back').hidden = !pay;
  $('#title').textContent = pay ? (pay.name || 'Pago') : { facturas: 'Facturas', conduces: 'Conduces', ordenes: 'Órdenes', pagos: 'Pagos', asistencia: 'Pase de lista', proyectos: 'Proyectos', traslados: 'Traslados' }[S.tab];
  renderBanner(D);
  if (S.tab === 'facturas') renderFacturas(D);
  else if (S.tab === 'ordenes') renderOrdenes(D);
  else if (S.tab === 'pagos') renderPagos(D, pay);
  else if (S.tab === 'asistencia') renderAsistencia(D);
  else if (S.tab === 'conduces') renderConduces(D);
  else if (S.tab === 'traslados') renderTraslados(D);
  else renderProyectos(D);
  // En Conduces, el botón de abajo agrega conduces.
  const fab = $('#fab'), condTab = S.tab === 'conduces';
  fab.hidden = !((S.tab === 'facturas' || condTab) && canUpload());
  fab.dataset.act = condTab ? 'cond-add' : 'add';
  $('#fab-label').textContent = condTab ? 'Agregar conduces' : 'Agregar facturas';
  $('#settings-btn').hidden = S.dbState === 'absent';
  renderSyncChip();
  renderSelBar(D);
  refreshInvoiceSheet(D);
  refreshOrderSheet(D);
  refreshCondSheet(D);
  refreshTrSheet();
}

function renderBanner(D) {
  const parts = [];
  if (S.dbState === 'absent') parts.push('<div class="note warn"><span class="grow"><b>Este navegador no deja guardar datos.</b> Si estás en modo privado, ábrela en una ventana normal.</span></div>');
  else if (S.dbState === 'error') parts.push('<div class="note warn"><span class="grow">No se pudieron cargar tus datos. Cierra la app y vuelve a abrirla.</span></div>');
  if (S.updateReg) parts.push('<div class="note example"><span class="grow"><b>Hay una versión nueva.</b> Se instala sola la próxima vez que abras la app, o actualízala ahora.</span><span class="acts"><button type="button" class="btn sm" data-act="update-app">Actualizar</button></span></div>');
  if (isIOS() && !isStandalone() && !lsGet('facturas.installHintOff')) parts.push('<div class="note example"><span class="grow"><b>Instálala antes de empezar:</b> toca Compartir y luego <b>Agregar a pantalla de inicio</b>. En iPhone, lo que guardes en Safari no pasa a la app instalada.</span><span class="acts"><button type="button" class="btn sm" data-act="install-off">Entendido</button></span></div>');
  { const ns = RT.sync.status(); if (ns.on && ns.code === 'auth') parts.push('<div class="note warn"><span class="grow"><b>La nube pide que vuelvas a entrar</b> para seguir compartiendo los datos con tus otros aparatos.</span><span class="acts"><button type="button" class="btn sm" data-act="settings">Entrar</button></span></div>'); }
  { const ns = RT.sync.status(); if (ns.on && ns.status === 'error' && ['paused', 'unreachable', 'limited'].includes(ns.code)) parts.push(`<div class="note warn"><span class="grow"><b>${ns.code === 'paused' ? 'La nube está en pausa.' : ns.code === 'limited' ? 'La nube tiene una restricción.' : 'No se pudo llegar a la nube.'}</b> ${esc(ns.error)}</span><span class="acts"><button type="button" class="btn sm" data-act="nube-sync">Probar otra vez</button></span></div>`); }
  if (RT.sync.status().on && S.fileBytes > CLOUD_FREE_BYTES * 0.8) parts.push(`<div class="note warn"><span class="grow"><b>La nube se está llenando:</b> tus fotos y PDF ocupan ${esc(fmtBytes(S.fileBytes))} de alrededor de ${esc(fmtBytes(CLOUD_FREE_BYTES))} que trae el plan gratis de Supabase. Cuando se llene, las fotos nuevas no subirán; el plan Pro de Supabase trae mucho más espacio.</span></div>`);
  if (S.aiState && S.aiState !== 'ok') parts.push(`<div class="note warn"><span class="grow"><b>Las facturas no se están leyendo solas.</b> ${esc(AI_ERR[S.aiState === 'badkey' ? 'bad_key' : S.aiState] || AI_ERR.bad_key)}</span><span class="acts"><button type="button" class="btn sm" data-act="settings">Revisar</button></span></div>`);
  const last = Number(lsGet('facturas.lastBackup')) || 0;
  const snooze = Number(lsGet('facturas.backupSnooze')) || 0;
  // Con la nube también: la nube copia lo que se borra o se cambia por error, así que un archivo de vez en cuando (cada mes).
  const cloudOn = RT.sync.status().on;
  if (S.dbState === 'ready' && S.invoices.length && Date.now() - last > (cloudOn ? 30 : 7) * 864e5 && Date.now() > snooze) {
    parts.push(`<div class="note warn"><span class="grow"><b>${last ? 'Haz un respaldo:' : 'Todavía no tienes respaldo en un archivo.'}</b> ${cloudOn ? 'La nube copia también lo que se borra o se cambia por error. Una vez al mes, guarda un respaldo en tu computadora o en Drive.' : `Tus facturas solo están en ${deviceWord()}. ${wide() ? 'Guarda una copia en Drive o en una memoria USB.' : 'Guarda una copia en iCloud Drive o en tu computadora.'}`}</span><span class="acts"><button type="button" class="btn sm" data-act="backup">Respaldar ahora</button><button type="button" class="btn sm ghost" data-act="backup-later">Mañana</button></span></div>`);
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
// Las etiquetas de una factura (proyecto, estado, orden, conduces, digitadora, avisos…).
function invTags(i, D, opts = {}) {
  const tags = [], reading = i.ai === 'pending';
  if (!opts.hideProject && i.project) tags.push(`<span class="proj"><i class="dot" style="--c:${i.project.color}"></i><span>${esc(i.project.name)}</span></span>`);
  if (!opts.hideStatus) tags.push(`<span class="pill ${i.status}">${INV_LABEL[i.status]}</span>`);
  const minor = []; // lo que casi todas tienen o es solo informativo: va al final, como texto suave
  if (i.fiscal === 'qr' || i.fiscal === 'xml') minor.push(`<span class="pill official minor">${i.fiscal === 'xml' ? 'XML' : 'QR'} DGII</span>`);
  if (isCreditNcf(i.number)) tags.push('<span class="pill nc">Nota de crédito</span>');
  if (i.payMode === 'reponer') tags.push(`<span class="pill enpago" title="Se pagó al contado: hay que reponérselo">Reponer a ${esc(i.paidBy || '…')}</span>`);
  else if (i.payMode === 'directo' && !i.pay) minor.push(`<span class="pill nooc minor" title="${esc(payText(i))}">${esc(i.payMethod || 'Pagada aparte')}</span>`);
  if (i.changeOf) minor.push('<span class="pill nooc minor" title="Factura por el cambio de otra factura">Cambio</span>');
  if (((i.struck || []).length || i.struckFixed) && !struckPending(i)) minor.push('<span class="pill nooc minor" title="Artículos tachados (devueltos o cambiados), ya revisada">Con tachados</span>');
  if (reading) tags.push('<span class="pill reading">Leyendo…</span>');
  if (D.orders.length && (i.order || !isCreditNcf(i.number))) {
    if (i.order) {
      for (const o of i.orders || [i.order]) {
        const st = o.status;
        const cls = st === 'autorizada' ? 'ok' : st === 'anulada' ? 'bad' : 'pend';
        tags.push(`<span class="pill oc ${cls}" title="Orden de compra ${esc(orderNo(o))}: ${esc(ORDER_LABEL[st] || '')}"><b>${esc(orderNo(o))}</b>${st === 'autorizada' ? '' : `<span> ${esc((ORDER_LABEL[st] || '').toLowerCase())}</span>`}</span>`);
      }
    }
    else if (i.noOrder) minor.push('<span class="pill nooc minor">No lleva orden</span>');
    else if (!needsOrder(i, D)) minor.push('<span class="pill nooc minor">Sin orden</span>');
  }
  const nc = (i.conduces || []).length;
  if (nc) minor.push(`<span class="pill cond minor">${nc === 1 ? (i.conduces[0].number ? 'Conduce <b>' + esc(i.conduces[0].number) + '</b>' : 'Conduce') : nc + ' conduces'}</span>`);
  if (!i.envio && !i.notInvoice && !opts.hideDigi) minor.push('<span class="pill digi minor" title="Todavía no se ha mandado a la digitadora">Por digitar</span>');
  if (i.abonado > 0 && i.status !== 'pagada') tags.push(`<span class="pill pendiente">Balance ${esc(money(i.toPay, i.currency))}</span>`);
  const di = dueInfo(i);
  if (di && (di.overdue || di.days <= 7)) tags.push(`<span class="pill ${di.overdue ? 'warn' : 'pendiente'}">${dueText(di)}</span>`);
  for (const r of reviewFlags(i, D)) tags.push(`<span class="pill warn">${esc(r)}</span>`);
  return [...tags, ...minor];
}
function cardHTML(i, D, opts = {}) {
  const reading = i.ai === 'pending';
  const name = i.supplier || (reading ? 'Leyendo factura…' : 'Factura sin datos');
  const meta = [i.number ? 'NCF ' + RD.normNcf(i.number) : '', fmtDate(i.date)].filter(Boolean).join(' · ') || i.fileName || '';
  const tags = invTags(i, D, opts);
  return `<button type="button" class="inv" data-act="open-inv" data-id="${esc(i.id)}">${thumbHTML(i)}<span class="inv-main"><span class="inv-top"><span class="supplier${i.supplier ? '' : ' muted'}">${esc(name)}</span><span class="amount">${esc(money(i.amount, i.currency))}</span></span><span class="inv-meta">${esc(meta)}</span><span class="tags">${tags.join('')}</span></span></button>`;
}

/* ---------- en la computadora: tablas que se ordenan tocando el encabezado ---------- */
const wideMQ = window.matchMedia ? window.matchMedia('(min-width: 960px)') : null;
const wide = () => !!(wideMQ && wideMQ.matches);
function sortRows(scope, items, val) {
  const s = S.sort[scope];
  if (!s) return items;
  return [...items].sort((a, b) => {
    const x = val(a, s.k), y = val(b, s.k);
    const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? ''), 'es', { numeric: true });
    return c * s.dir;
  });
}
function thHTML(scope, k, label, cls = '') {
  if (!k) return `<th class="${cls}"><span class="th-txt">${label}</span></th>`;
  const s = S.sort[scope], on = !!s && s.k === k;
  return `<th class="${cls}" aria-sort="${on ? (s.dir > 0 ? 'ascending' : 'descending') : 'none'}"><button type="button" class="th-sort${on ? ' on' : ''}" data-act="sort" data-scope="${scope}" data-k="${k}">${label}<span class="th-dir" aria-hidden="true">${on ? (s.dir > 0 ? '▲' : '▼') : ''}</span></button></th>`;
}
// Primer toque: de mayor a menor en montos y fechas, de la A a la Z en lo demás; segundo, al revés; tercero, como venía.
function toggleSort(scope, k) {
  const cur = S.sort[scope], first = ['amount', 'total', 'est', 'date'].includes(k) ? -1 : 1;
  S.sort[scope] = !cur || cur.k !== k ? { k, dir: first } : cur.dir === first ? { k, dir: -first } : null;
}
const invVal = (i, k) => (k === 'amount' ? (isNum(i.amount) ? i.amount : -Infinity) : k === 'date' ? i.date || '' : k === 'number' ? RD.normNcf(i.number) || '' : k === 'status' ? INV_LABEL[i.status] || '' : norm(i.supplier || ''));
function invTableHTML(items, D, gk = 'g', opts = {}) {
  const pick = canEdit() && !opts.noPick, rm = !!opts.rm;
  const rows = sortRows('inv', items, invVal).map((i) => {
    const name = i.supplier || (i.ai === 'pending' ? 'Leyendo factura…' : 'Factura sin datos');
    return `<tr data-act="open-inv" data-id="${esc(i.id)}"${S.sel.has(i.id) ? ' class="sel"' : ''}>${pick ? `<td class="c-sel" data-act="sel-cell"><input type="checkbox" data-act="sel" data-sel="inv" data-g="${esc(gk)}" value="${esc(i.id)}" aria-label="Elegir"${S.sel.has(i.id) ? ' checked' : ''}></td>` : ''}<td class="c-main"><span class="c-th">${thumbHTML(i)}</span><button type="button" class="row-btn${i.supplier ? '' : ' muted'}" data-act="open-inv" data-id="${esc(i.id)}">${esc(name)}</button></td><td class="mono">${esc(i.number ? RD.normNcf(i.number) : '—')}</td><td>${esc(fmtDate(i.date) || '—')}</td><td><span class="pill ${i.status}">${INV_LABEL[i.status]}</span></td><td class="c-tags">${invTags(i, D, { hideProject: true, hideStatus: true }).join('')}</td><td class="r mono">${esc(money(i.amount, i.currency))}</td>${rm ? `<td class="c-rm"><button type="button" class="icon-btn sm" data-act="pay-rm" data-id="${esc(i.id)}" aria-label="Quitar del pago" title="Quitar del pago">${ICON.close}</button></td>` : ''}</tr>`;
  }).join('');
  return `<table class="tbl inv-tbl"><colgroup>${pick ? '<col class="w-sel">' : ''}<col class="w-main"><col class="w-ncf"><col class="w-date"><col class="w-st"><col><col class="w-amt">${rm ? '<col class="w-rm">' : ''}</colgroup><thead><tr>${pick ? `<th class="c-sel"><input type="checkbox" data-act="sel" data-sel="all" data-g="${esc(gk)}" aria-label="Elegir todas"></th>` : ''}${thHTML('inv', 'supplier', 'Proveedor')}${thHTML('inv', 'number', 'NCF')}${thHTML('inv', 'date', 'Fecha')}${thHTML('inv', 'status', 'Estado')}${thHTML('inv', '', 'Etiquetas')}${thHTML('inv', 'amount', 'Monto', 'r')}${rm ? '<th class="c-rm"></th>' : ''}</tr></thead><tbody>${rows}</tbody></table>`;
}
function condTableHTML(items, D, invById) {
  const invOf = (c) => { const inv = c.invoiceId ? invById.get(c.invoiceId) : null; return inv ? (inv.number ? RD.normNcf(inv.number) : inv.supplier || 'sin NCF') : ''; };
  const val = (c, k) => (k === 'total' ? (isNum(c.total) ? c.total : -Infinity) : k === 'date' ? c.date || '' : k === 'factura' ? invOf(c) : k === 'material' ? norm([c.material, c.qty].filter(Boolean).join(' ')) : String(c.number || ''));
  const rows = sortRows('cond', items, val).map((c) => {
    const p = c.projectId ? D.projById.get(c.projectId) : null, inv = invOf(c);
    return `<tr data-act="open-cond" data-id="${esc(c.id)}"><td class="c-main"><span class="c-th">${condThumbHTML(c)}</span><button type="button" class="row-btn" data-act="open-cond" data-id="${esc(c.id)}">${esc(c.number || 'Sin número')}</button>${c.dup ? ' <span class="pill warn">¿Repetido?</span>' : ''}</td><td>${esc(fmtDate(c.date) || '—')}</td><td>${esc([c.material, c.qty].filter(Boolean).join(' ') || '—')}</td><td class="r mono">${isNum(c.trips) ? esc(String(c.trips)) : '—'}</td><td>${esc(p ? p.name : '—')}</td><td>${inv ? `<span class="mono">${esc(inv)}</span>` : '<span class="pill pendiente">Sin factura</span>'}</td><td class="r mono">${c.ai === 'pending' ? '<span class="pill reading">Leyendo…</span>' : isNum(c.total) ? esc(money(c.total, c.currency)) : '—'}</td></tr>`;
  }).join('');
  return `<table class="tbl cond-tbl"><colgroup><col class="w-cmain"><col class="w-date"><col><col class="w-trips"><col class="w-proj"><col class="w-ncf"><col class="w-amt"></colgroup><thead><tr>${thHTML('cond', 'number', 'Conduce')}${thHTML('cond', 'date', 'Fecha')}${thHTML('cond', 'material', 'Material')}${thHTML('cond', '', 'Viajes', 'r')}${thHTML('cond', '', 'Proyecto')}${thHTML('cond', 'factura', 'Factura')}${thHTML('cond', 'total', 'Total', 'r')}</tr></thead><tbody>${rows}</tbody></table>`;
}
function orderTableHTML(items, D) {
  const val = (o, k) => (k === 'est' ? orderEst(o) || -Infinity : k === 'date' ? o.date || '' : k === 'supplier' ? norm(o.supplier || '') : k === 'status' ? ORDER_LABEL[o.status] || '' : orderNo(o));
  const rows = sortRows('ord', items, val).map((o) => {
    const invs = D.invByOrder.get(o.id) || [], est = orderEst(o);
    return `<tr data-act="open-order" data-id="${esc(o.id)}"><td class="c-main"><button type="button" class="row-btn mono" data-act="open-order" data-id="${esc(o.id)}">${esc(orderNo(o))}</button></td><td>${esc(fmtDate(o.date) || '—')}</td><td>${esc(o.supplier || '—')}</td><td><span class="pill o-${o.status}">${ORDER_LABEL[o.status]}</span></td><td class="r mono">${(o.items || []).length}</td><td class="r mono">${est ? esc(money(est)) : '—'}</td><td>${invs.length ? esc(plural(invs.length, 'factura', 'facturas')) : '—'}</td></tr>`;
  }).join('');
  return `<table class="tbl ord-tbl"><colgroup><col class="w-ord"><col class="w-date"><col><col class="w-st"><col class="w-trips"><col class="w-amt"><col class="w-ncf"></colgroup><thead><tr>${thHTML('ord', 'number', 'Orden')}${thHTML('ord', 'date', 'Fecha')}${thHTML('ord', 'supplier', 'Proveedor')}${thHTML('ord', 'status', 'Estado')}${thHTML('ord', '', 'Artículos', 'r')}${thHTML('ord', 'est', 'Estimado', 'r')}${thHTML('ord', '', 'Facturas')}</tr></thead><tbody>${rows}</tbody></table>`;
}

/* ---------- en la computadora: marcar varias facturas y hacer algo con todas ---------- */
// Varias de una vez (en la computadora): las que ya se pagaron por fuera de la app salen de pendientes.
async function markPaidDirect(ids) {
  const D = derive();
  const list = ids.map((x) => D.invoices.find((i) => i.id === x)).filter((i) => i && i.status === 'pendiente' && !i.pay);
  if (!list.length) { toast('Ninguna de las elegidas está pendiente.'); return; }
  const ok = await write(async () => { for (const i of list) { const raw = S.invoices.find((x) => x.id === i.id); await db.doc('invoices/' + i.id).update({ payMode: 'directo', termsCheck: false, paidDate: raw.paidDate || raw.date || todayISO(), hist: histAdd(raw, histEntry('Marcada como ya pagada')) }); } });
  if (ok) { for (const i of list) S.sel.delete(i.id); toastAct(`${plural(list.length, 'factura marcada', 'facturas marcadas')} como ya pagada${list.length === 1 ? '' : 's'}`, 'Deshacer', () => write(async () => { for (const i of list) await db.doc('invoices/' + i.id).update({ payMode: '' }); }, 'Vuelven a pendientes')); renderAll(); }
}
function renderSelBar(D) {
  const el = $('#sel-bar');
  if (!el) return;
  const ids = [...S.sel];
  if (!wide() || S.tab !== 'facturas' || !ids.length || !canEdit()) { el.hidden = true; el.innerHTML = ''; return; }
  const invs = ids.map((id) => D.invoices.find((i) => i.id === id)).filter(Boolean);
  const pend = invs.filter((i) => i.status === 'pendiente').length, toDigi = invs.filter((i) => !i.envio && !i.notInvoice).length;
  el.hidden = false;
  el.innerHTML = `<span class="grow"><b>${plural(invs.length, 'factura elegida', 'facturas elegidas')}</b> · <span class="mono">${esc(totalStr(invs, 'toPay'))}</span></span>`
    + `<button type="button" class="btn sm primary" data-act="sel-pay"${pend ? '' : ' disabled title="Ninguna está pendiente"'}>Armar pago${pend && pend < invs.length ? ' (' + pend + ')' : ''}</button>`
    + `<button type="button" class="btn sm" data-act="sel-digi"${toDigi ? '' : ' disabled title="Ya se le mandaron todas"'}>Mandar a la digitadora${toDigi && toDigi < invs.length ? ' (' + toDigi + ')' : ''}</button>`
    + `<button type="button" class="btn sm" data-act="sel-paid"${pend ? '' : ' disabled title="Ninguna está pendiente"'} title="Las que ya se pagaron al contado o por fuera de la app">Ya se pagaron${pend && pend < invs.length ? ' (' + pend + ')' : ''}</button>`
    + `<button type="button" class="btn sm" data-act="sel-xlsx">${ICON.sheet} Excel</button>`
    + `<button type="button" class="btn sm ghost" data-act="sel-clear">Quitar</button>`;
}
function syncSelBoxes() {
  for (const b of $$('#f-list input[data-sel="inv"]')) b.checked = S.sel.has(b.value);
  for (const g of $$('#f-list input[data-sel="all"]')) {
    const kids = $$(`#f-list input[data-sel="inv"][data-g="${g.dataset.g}"]`);
    const on = kids.filter((b) => b.checked).length;
    g.checked = on > 0 && on === kids.length;
    g.indeterminate = on > 0 && on < kids.length;
  }
  renderSelBar(derive());
}

/* ---------- «Más» en el teléfono: lo que no cabe en la barra de abajo ---------- */
function openMoreMenu() {
  const row = (attrs, icon, title, sub) => `<button type="button" class="menu-row" ${attrs}><span class="menu-ic">${icon}</span><span class="grow"><b>${title}</b><small>${sub}</small></span></button>`;
  const IC = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  openSheet(`${sheetHead('Más')}<div class="sheet-b"><div class="menu-list">
    ${row('data-act="go-tab" data-go="asistencia"', IC('<rect x="4" y="4" width="16" height="17" rx="2"/><path d="M8 2.5v3M16 2.5v3M8 13l2.5 2.5L16 10"/>'), 'Pase de lista', 'Asistencia de los obreros, por quincena')}
    ${row('data-act="go-tab" data-go="proyectos"', IC('<path d="M3 7.5A1.5 1.5 0 0 1 4.5 6H9l2 2h8.5A1.5 1.5 0 0 1 21 9.5v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z"/>'), 'Proyectos', 'Obras, presupuesto y lo gastado')}
    ${row('data-act="go-tab" data-go="traslados"', IC('<path d="M4 8h14l-3.5-3.5M20 16H6l3.5 3.5"/>'), 'Traslados de materiales', 'De una obra a otra, y lo que se deben')}
    ${row('data-act="sups"', IC('<path d="M4 20V9l8-5 8 5v11"/><path d="M9 20v-6h6v6"/>'), 'Proveedores', 'Crédito, banco y cuenta de cada uno')}
    ${row('data-act="digi-open"', IC('<path d="M4 6h16v12H4z"/><path d="M4 7l8 6 8-6"/>'), 'Digitadora', 'Lo que falta por mandar y los envíos')}
    ${row('data-act="trash-open"', ICON.trash, 'Papelera', S.papelera.length ? plural(S.papelera.length, 'cosa', 'cosas') + ' para recuperar' : 'Lo borrado se queda aquí 30 días')}
    ${row('data-act="settings"', IC('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>'), 'Ajustes', 'Empresa, lectura automática, nube y respaldos')}
  </div></div>`, { type: 'more', id: 'more' });
}

function renderFacturas(D) {
  renderTodo(D);
  if (S.projectFilter !== 'all' && S.projectFilter !== 'none' && !D.projById.has(S.projectFilter) && S.got.projects) S.projectFilter = 'all';
  const base = D.invoices.filter((i) => inProject(i) && inDates(i));
  const counts = { pendientes: 0, tramite: 0, pagadas: 0, todas: base.length };
  for (const i of base) counts[GROUP_OF[i.status]]++;
  $('#f-seg').innerHTML = SEGS.map(([k, label]) => `<button type="button" data-act="filter" data-f="${k}" aria-pressed="${S.filter === k}"><span>${label}</span><span class="n">${counts[k]}</span></button>`).join('');
  const noneN = D.invoices.filter((i) => !i.project).length;
  const chips = [`<button type="button" class="chip" data-act="projf" data-p="all" aria-pressed="${S.projectFilter === 'all'}"><span>Todos los proyectos</span></button>`];
  if (noneN || S.projectFilter === 'none') chips.push(`<button type="button" class="chip" data-act="projf" data-p="none" aria-pressed="${S.projectFilter === 'none'}"><i class="dot ring"></i><span>Sin proyecto</span></button>`);
  for (const p of D.projects) chips.push(`<button type="button" class="chip" data-act="projf" data-p="${esc(p.id)}" aria-pressed="${S.projectFilter === p.id}"><i class="dot" style="--c:${p.color}"></i><span>${esc(p.name)}</span></button>`);
  $('#f-chips').innerHTML = chips.join('');
  const och = $('#f-ochips');
  if (D.orders.length && !S.focus) {
    const pool = base.filter((i) => S.filter === 'todas' || GROUP_OF[i.status] === S.filter);
    const con = pool.filter((i) => i.order).length;
    och.hidden = false;
    och.innerHTML = [['all', 'Todas', pool.length], ['con', 'Con orden', con], ['sin', 'Sin orden', pool.length - con]]
      .map(([k, label, n]) => `<button type="button" class="chip" data-act="invorder" data-o="${k}" aria-pressed="${S.invOrder === k}"><span>${label}</span><span class="n">${n}</span></button>`).join('');
  } else { och.hidden = true; och.innerHTML = ''; }
  // Fechas: por mes (de la fecha de la factura) o de un día a otro.
  const fd = $('#f-dates');
  if (D.invoices.length && !S.focus) {
    const months = [...new Set(D.invoices.map((i) => invDay(i).slice(0, 7)).filter((m) => /^\d{4}-\d{2}$/.test(m)))].sort().reverse();
    if (S.dateFilter && S.dateFilter !== 'range' && !months.includes(S.dateFilter)) months.unshift(S.dateFilter);
    const opts = [['', 'Todas las fechas'], ...months.map((m) => [m, monthName(m)]), ['range', 'Elegir fechas…']];
    const sig = JSON.stringify([opts, S.dateFilter, S.dateFrom, S.dateTo]);
    fd.hidden = false;
    if (fd.dataset.sig !== sig) {
      fd.dataset.sig = sig;
      fd.innerHTML = `<label class="date-pick"><span class="sr">Fechas</span><select id="f-month">${opts.map(([v, l]) => `<option value="${esc(v)}"${v === S.dateFilter ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>${S.dateFilter === 'range' ? `<label class="date-in"><span>Desde</span><input type="date" id="f-from" value="${esc(S.dateFrom)}"></label><label class="date-in"><span>Hasta</span><input type="date" id="f-to" value="${esc(S.dateTo)}"></label>` : ''}`;
    }
  } else { fd.hidden = true; fd.innerHTML = ''; fd.dataset.sig = ''; }

  const q = norm(S.search);
  const list = visibleList(D);
  const sum = $('#f-sum');
  if (S.got.invoices && base.length) {
    const canMake = !S.focus && S.filter === 'pendientes' && list.length && canEdit();
    const acts = (list.length ? `<button type="button" class="btn sm" data-act="list-xlsx">${ICON.sheet} Excel</button>` : '') + (canMake ? `<button type="button" class="btn sm" data-act="new-pay-from">Armar pago con estas ${ICON.right}</button>` : '');
    const focusLine = S.focus ? `<div class="focus-line"><span class="grow">Mostrando: <b>${FOCUS_LABEL[S.focus] || FOCUS_LABEL.sinorden}</b></span><button type="button" class="btn sm" data-act="focus-off">Ver todas</button></div>` : '';
    sum.innerHTML = `${focusLine}<div class="sumline"><span>${plural(list.length, 'factura', 'facturas')} · <b class="mono">${esc(totalStr(list, 'toPay'))}</b></span>${acts ? `<span class="acts">${acts}</span>` : ''}</div>`;
  } else sum.innerHTML = '';

  const el = $('#f-list');
  if (!S.got.invoices) { el.innerHTML = S.dbState === 'absent' ? '' : '<p class="loading">Cargando tus facturas…</p>'; return; }
  if (!D.invoices.length) {
    el.innerHTML = `<div class="empty"><h2>Aquí van a aparecer tus facturas</h2><ol><li>Toca <b>Agregar facturas</b> y elige las fotos, PDF o XML que te mandaron.</li><li>Si la factura es electrónica, la app lee su código QR o su XML y toma el e-NCF, el RNC, la fecha y el monto. Si agregas tu clave de API en <b>Ajustes</b>, también lee las de papel.</li><li>Cuando toque pagar, ve a <b>Pagos</b>, elige cuáles entran y comparte el PDF o el Excel.</li></ol>${canUpload() ? `<button type="button" class="btn primary" data-act="add">${ICON.plus} Agregar facturas</button>` : ''}</div>`;
    return;
  }
  if (!list.length) {
    const what = { pendientes: 'pendientes', tramite: 'en trámite', pagadas: 'pagadas', todas: '' }[S.filter];
    const oc = !S.focus && D.orders.length && S.invOrder !== 'all' ? (S.invOrder === 'con' ? 'con orden de compra' : 'sin orden de compra') : '';
    const proj = S.projectFilter !== 'all' ? 'en este proyecto' : '';
    const when = !S.focus && S.dateFilter ? (S.dateFilter === 'range' ? 'en esas fechas' : 'en ' + monthName(S.dateFilter).toLowerCase()) : '';
    el.innerHTML = `<div class="empty"><p>${q ? 'Nada coincide con tu búsqueda.' : ['No hay facturas', what, oc, proj, when].filter(Boolean).join(' ') + '.'}</p></div>`;
    return;
  }
  const LIM = wide() ? 150 : 60;
  const vis = new Set(list.map((i) => i.id));
  for (const id of [...S.sel]) if (!vis.has(id)) S.sel.delete(id);
  const cards = (items, key) => ((sh) => (wide() ? invTableHTML(sh, D, key) : sh.map((i) => cardHTML(i, D, { hideProject: true })).join('')))(items.length <= LIM || S.showAll.has(key) ? items : items.slice(0, LIM))
    + (items.length > LIM && !S.showAll.has(key) ? `<button type="button" class="btn sm more" data-act="more" data-k="${esc(key)}">Ver ${items.length - LIM} más</button>` : '');
  if (S.projectFilter === 'all') {
    el.innerHTML = groupByProject(list, D).map((g) => `<section class="group"><h2 class="group-h">${g.color ? `<i class="dot" style="--c:${g.color}"></i>` : '<i class="dot ring"></i>'}<span class="gname">${esc(g.name)}</span><span class="gmeta">${g.items.length} · ${esc(totalStr(g.items, 'toPay'))}</span></h2><div class="list">${cards(g.items, g.id)}</div></section>`).join('');
  } else {
    el.innerHTML = `<div class="list">${cards(list, 'p:' + S.projectFilter)}</div>`;
  }
}

/* ---------- para hacer ---------- */
function needsReading(i) { return (i.ai === 'off' || i.ai === 'failed') && !i.notInvoice && i.status !== 'pagada' && !!i.fileId && (i.fileType === 'application/pdf' || String(i.fileType || '').startsWith('image/')); }
function readyToPay(i, D) { return i.status === 'pendiente' && isNum(i.amount) && !reviewFlags(i, D).length && !(i.order && i.order.status !== 'autorizada'); }
function renderTodo(D) {
  const el = $('#todo');
  if (!el) return;
  if (!S.got.invoices || !S.got.orders || !S.got.payments || !S.got.conduces || !S.got.envios || !canEdit()) { el.hidden = true; el.innerHTML = ''; return; }
  const live = D.invoices.filter((i) => i.status !== 'pagada');
  const unread = live.filter((i) => needsReading(i) && i.ai !== 'pending');
  const review = live.filter((i) => reviewFlags(i, D).some((f) => f !== 'Sin orden'));
  const noOrd = live.filter((i) => needsOrder(i, D));
  const toSign = D.orders.filter((o) => o.status === 'borrador' || o.status === 'enviada');
  const waiting = D.orders.filter((o) => o.status !== 'anulada' && !orderHasInv(o, D));
  const ready = D.invoices.filter((i) => readyToPay(i, D));
  const presented = S.payments.filter((p) => p.status === 'presentado');
  const row = (n, text, btn, cls = '') => `<div class="todo-row ${cls}"><span class="n">${n}</span><span class="grow">${text}</span>${btn}</div>`;
  const b = (act, label, extra = '', cls = '') => `<button type="button" class="btn sm${cls}" data-act="${act}"${extra}>${label}</button>`;
  const rows = [];
  if (unread.length) rows.push(ai.hasKey() ? row(unread.length, plural(unread.length, 'factura sin leer', 'facturas sin leer'), b('read-all', 'Leer todas'))
    : row(unread.length, `${plural(unread.length, 'factura', 'facturas')} sin datos. Con la clave de API se llenan solas.`, b('settings', 'Ajustes')));
  if (review.length) rows.push(row(review.length, plural(review.length, 'factura con algo que revisar', 'facturas con algo que revisar'), b('focus', 'Ver', ' data-f="revisar"'), 'warn'));
  if (noOrd.length) rows.push(row(noOrd.length, plural(noOrd.length, 'factura sin orden de compra', 'facturas sin orden de compra'), b('focus', 'Ver', ' data-f="sinorden"'), 'warn'));
  const condWait = D.conduces.filter((c) => !c.invoiceId && c.ai !== 'pending');
  if (condWait.length) rows.push(row(condWait.length, plural(condWait.length, 'conduce esperando su factura', 'conduces esperando su factura'), b('cond-list', 'Ver')));
  // Digitadora: se le mandan las de cada día al final del día.
  const toDigi = pendingDigi(D), today = todayISO(), late = digiLate();
  const digiToday = toDigi.filter((i) => addedDay(i) === today).length, digiOld = toDigi.length - digiToday;
  const sentToday = D.envios.filter((e) => e.date === today).sort((x, y) => (Number(x.number) || 0) - (Number(y.number) || 0));
  const nSent = sentToday.reduce((s, e) => s + (e.invoiceIds || []).length, 0);
  const oldTxt = plural(digiOld, 'factura', 'facturas') + ' de días anteriores';
  const digiRows = [];
  if (toDigi.length && late && digiToday) digiRows.push(row(toDigi.length, `Manda las de hoy a la digitadora: ${plural(digiToday, 'factura', 'facturas')}${digiOld ? ' y ' + oldTxt : ''}`, b('digi-open', 'Mandar', '', ' primary'), 'now'));
  else if (toDigi.length && late) digiRows.push(row(toDigi.length, `${oldTxt} sin mandar a la digitadora`, b('digi-open', 'Mandar', '', ' primary'), 'warn'));
  else if (toDigi.length) digiRows.push(row(toDigi.length, plural(toDigi.length, 'factura por mandar a la digitadora', 'facturas por mandar a la digitadora') + (digiOld ? (digiToday ? ` · ${digiOld} de días anteriores` : ' · de días anteriores') : ''), b('digi-open', 'Mandar'), digiOld ? 'warn' : ''));
  if (nSent) digiRows.push(row(nSent, `Hoy ya le mandaste ${plural(nSent, 'factura', 'facturas')} a la digitadora (${sentToday.length > 1 ? 'envíos ' + sentToday.map((e) => e.number).join(', ') : 'envío ' + sentToday[0].number})`, b('envio-view', 'Ver', ` data-id="${esc(sentToday[sentToday.length - 1].id)}"`), 'ok'));
  if (late) rows.unshift(...digiRows); else rows.push(...digiRows);
  const overdue = live.filter((i) => FOCUS.vencidas(i)), soon = live.filter((i) => FOCUS.porvencer(i));
  if (overdue.length) rows.push(row(overdue.length, `${plural(overdue.length, 'factura vencida', 'facturas vencidas')} · <b class="mono">${esc(totalStr(overdue))}</b>`, b('focus', 'Ver', ' data-f="vencidas"'), 'warn'));
  if (soon.length) rows.push(row(soon.length, `${plural(soon.length, 'factura vence', 'facturas vencen')} esta semana · <b class="mono">${esc(totalStr(soon))}</b>`, b('focus', 'Ver', ' data-f="porvencer"')));
  if (toSign.length) rows.push(row(toSign.length, plural(toSign.length, 'orden por firmar', 'órdenes por firmar'), b('go-orders', 'Ver', ' data-f="porfirmar"')));
  if (waiting.length) rows.push(row(waiting.length, plural(waiting.length, 'orden sin factura: te falta esa factura', 'órdenes sin factura: te faltan esas facturas'), b('go-orders', 'Ver', ' data-f="sinfactura"')));
  if (ready.length) rows.push(row(ready.length, `${plural(ready.length, 'factura lista', 'facturas listas')} para pagar · <b class="mono">${esc(totalStr(ready, 'toPay'))}</b>`, b('pay-ready', 'Armar pago', '', ' primary'), 'ok'));
  if (approvalOn()) {
    const waitAp = presented.filter((p) => !p.approvedAt), apOk = presented.filter((p) => p.approvedAt);
    if (waitAp.length) rows.push(amOwner() ? row(waitAp.length, plural(waitAp.length, 'pago esperando tu aprobación', 'pagos esperando tu aprobación'), b('tab', 'Ver', ' data-tab="pagos"', ' primary'), 'now') : row(waitAp.length, plural(waitAp.length, 'pago esperando la aprobación del dueño', 'pagos esperando la aprobación del dueño'), b('tab', 'Ver', ' data-tab="pagos"')));
    if (apOk.length) rows.push(row(apOk.length, plural(apOk.length, 'pago aprobado, falta pagarlo', 'pagos aprobados, falta pagarlos'), b('tab', 'Ver', ' data-tab="pagos"'), 'ok'));
  } else if (presented.length) rows.push(row(presented.length, plural(presented.length, 'pago presentado, esperando que lo paguen', 'pagos presentados, esperando que los paguen'), b('tab', 'Ver', ' data-tab="pagos"')));
  // Traslados: los que llegaron con diferencia y los que falta anotar lo que llegó.
  const trBad = S.traslados.filter((t) => trState(t) === 'diferencia'), trWait = S.traslados.filter((t) => trState(t) === 'porrecibir');
  if (trBad.length) rows.push(row(trBad.length, plural(trBad.length, 'traslado llegó con diferencia (no llegó lo mismo que salió)', 'traslados llegaron con diferencia (no llegó lo mismo que salió)'), b('tab', 'Ver', ' data-tab="traslados"'), 'warn'));
  if (trWait.length) rows.push(row(trWait.length, plural(trWait.length, 'traslado por recibir: falta anotar lo que llegó', 'traslados por recibir: falta anotar lo que llegó'), b('tab', 'Ver', ' data-tab="traslados"')));
  const repPend = D.invoices.filter((i) => i.payMode === 'reponer' && i.status === 'pendiente');
  if (repPend.length) { const who = uniqList(repPend.map((i) => i.paidBy || '')); rows.push(row(repPend.length, `${plural(repPend.length, 'factura', 'facturas')} por reponer${who.length === 1 ? ' a ' + esc(who[0]) : ` a ${who.length} personas`} · <b class="mono">${esc(totalStr(repPend, 'toPay'))}</b>`, b('tab', 'Ver', ' data-tab="pagos"'))); }
  el.hidden = !rows.length;
  // Lo urgente arriba; si son muchas, se ven las primeras y «Ver todo».
  const RANK = { now: 0, warn: 1, ok: 2 };
  const ranked = rows.map((h, k) => ({ h, k, r: (RANK[(/class="todo-row ([a-z]*)/.exec(h) || [])[1]] ?? 3) })).sort((a, b) => a.r - b.r || a.k - b.k).map((x) => x.h);
  const LIMIT = 4, shown = S.todoAll || ranked.length <= LIMIT + 1 ? ranked : ranked.slice(0, LIMIT);
  const more = ranked.length > LIMIT + 1 ? `<div class="todo-more"><button type="button" class="link" data-act="todo-all">${S.todoAll ? 'Ver menos' : `Ver todo (${ranked.length})`}</button></div>` : '';
  el.innerHTML = rows.length ? `<div class="todo"><h2>Para hacer</h2>${shown.join('')}${more}</div>` : '';
}

function renderQueue() {
  const el = $('#queue');
  const q = S.queue;
  if (!q.length) { el.hidden = true; el.innerHTML = ''; return; }
  const left = q.filter((x) => !x.done).length;
  const cls = { espera: 'q-busy', preparando: 'q-busy', subiendo: 'q-busy', leyendo: 'q-busy', lista: 'q-ok', qr: 'q-ok', xml: 'q-ok', orden: 'q-ok', conduce: 'q-ok', manual: 'q-manual', error: 'q-error' };
  el.hidden = false;
  el.innerHTML = `<div class="q-head"><b>${left ? `Procesando ${left} de ${q.length}…` : `Listo: ${plural(q.length, 'archivo', 'archivos')}`}</b>${left ? '' : '<button type="button" class="btn sm ghost" data-act="queue-clear">Ocultar</button>'}</div><ul class="q-list">${q.map((x) => `<li class="${cls[x.state]}"><span class="q-dot"></span><span class="q-name">${esc(x.name)}</span><span class="q-state">${esc(Q_LABEL[x.state] + (x.msg ? ': ' + x.msg : ''))}</span></li>`).join('')}</ul>`;
}

// Por reponer: lo que se pagó al contado y hay que devolverle a quien pagó (de su bolsillo o de la caja chica), por persona.
function reponerGroups(D) {
  const m = new Map();
  for (const i of D.invoices) {
    if (i.payMode !== 'reponer' || i.status === 'pagada') continue;
    const who = String(i.paidBy || 'Sin nombre').trim(), k = norm(who);
    if (!m.has(k)) m.set(k, { who, pend: [], inPay: [] });
    (i.status === 'pendiente' ? m.get(k).pend : m.get(k).inPay).push(i);
  }
  return [...m.values()].sort((a, b) => b.pend.length - a.pend.length || a.who.localeCompare(b.who));
}
function reponerHTML(D) {
  const gs = reponerGroups(D);
  if (!gs.length) return '';
  const edit = canEdit();
  return `<div class="card rep-card" id="rep-card"><h2>Por reponer</h2><p class="hint">Lo que se pagó al contado y hay que devolverle a quien pagó, por persona. «Armar la reposición» hace el pago con lo que le falta.</p>${gs.map((g) => {
    const rows = [...g.pend, ...g.inPay].sort(sortByDateDesc).map((i) => `<button type="button" class="o-inv rep-inv" data-act="open-inv" data-id="${esc(i.id)}"><span class="grow">${esc([i.supplier || 'Factura', i.number ? RD.normNcf(i.number) : '', fmtDate(i.date), i.project ? i.project.name : ''].filter(Boolean).join(' · '))}${i.status !== 'pendiente' ? `<small>${esc(INV_LABEL[i.status])}${i.pay ? ' en «' + esc(i.pay.name || 'Pago') + '»' : ''}</small>` : ''}</span><b class="mono">${esc(money(i.toPay, i.currency))}</b></button>`).join('');
    const sub = [g.pend.length ? `${plural(g.pend.length, 'factura', 'facturas')} por reponer: ${totalStr(g.pend, 'toPay')}` : '', g.inPay.length ? `${plural(g.inPay.length, 'factura', 'facturas')} ya en un pago: ${totalStr(g.inPay, 'toPay')}` : ''].filter(Boolean).join(' · ');
    return `<div class="rep-g"><div class="rep-top"><b>${esc(g.who)}</b><b class="mono">${esc(totalStr(g.pend.length ? g.pend : g.inPay, 'toPay'))}</b></div><small class="rep-sub">${esc(sub)}</small><div class="rep-list">${rows}</div>${edit && g.pend.length ? `<div><button type="button" class="btn sm primary" data-act="rep-pay" data-who="${esc(g.who)}">Armar la reposición</button></div>` : ''}</div>`;
  }).join('')}</div>`;
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
  const rep = reponerHTML(D);
  if (!pays.length) {
    el.innerHTML = head + rep + '<div class="empty"><h2>Todavía no hay pagos</h2><p>Cuando te toque presentar facturas, crea un pago, elige cuáles entran y comparte el PDF o el Excel. Después lo marcas como presentado y, cuando paguen, como pagado.</p></div>';
    return;
  }
  el.innerHTML = head + rep + `<div class="list">${pays.map((p) => {
    const invs = payInvoices(p, D);
    const projN = new Set(invs.map((i) => (i.project ? i.project.id : 'none'))).size;
    const st = PAY_LABEL[p.status] ? p.status : 'armando';
    return `<button type="button" class="pay" data-act="open-pay" data-id="${esc(p.id)}"><span class="pay-name">${esc(p.name || 'Pago')}</span><span class="stamp ${st}">${PAY_LABEL[st]}</span><span class="pay-meta">${[fmtDate(p.date), plural(invs.length, 'factura', 'facturas'), invs.length ? plural(projN, 'proyecto', 'proyectos') : ''].filter(Boolean).join(' · ')}</span><span class="pay-total">${esc(totalStr(invs, 'toPay'))}</span></button>`;
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
  const needAp = approvalOn() && st === 'presentado' && !pay.approvedAt;
  if (edit && st === 'presentado') {
    if (needAp && amOwner()) statusBtns.push(`<button type="button" class="btn primary" data-act="pay-approve">${ICON.check} Aprobar el pago</button><button type="button" class="btn" data-act="pay-return">Devolver con una nota</button>`);
    else statusBtns.push(`<button type="button" class="btn" data-act="pay-status" data-s="pagado"${needAp ? ' disabled title="Falta la aprobación del dueño"' : ''}>${ICON.check} Marcar como pagado</button>`);
  }
  const apMsg = approvalOn() && st === 'presentado' ? (pay.approvedAt ? `<div class="msg ok">${ICON.check}<span>Aprobado por <b>${esc(pay.approvedBy || 'el dueño')}</b> el ${esc(fmtDate(String(pay.approvedAt).slice(0, 10)))}.</span></div>` : `<div class="msg warn">${ICON.alert}<span>${amOwner() ? 'Este pago espera <b>tu aprobación</b>.' : `Esperando la aprobación del dueño (${esc(S.settings.ownerEmail)}). Cuando lo apruebe desde su ${'teléfono'}, se puede marcar como pagado.`}</span></div>`) : '';
  const retMsg = st === 'armando' && pay.returnNote ? `<div class="msg warn">${ICON.alert}<span>El dueño lo devolvió${pay.returnedAt ? ' el ' + esc(fmtDate(String(pay.returnedAt).slice(0, 10))) : ''}: «${esc(pay.returnNote)}»</span></div>` : '';
  const ret = S.payRet && S.payRet.id === pay.id ? S.payRet : null;
  const retBox = `<div id="pay-ret-box"${ret ? '' : ' hidden'}><div class="confirm"><div class="field full"><label for="pay-ret-note">¿Qué hay que corregir?</label><textarea id="pay-ret-note" rows="2" maxlength="300">${esc(ret ? ret.note : '')}</textarea></div><div class="actions"><button type="button" class="btn danger solid" data-act="pay-return-yes">Devolver</button><button type="button" class="btn" data-act="pay-return-no">No</button></div></div></div>`;
  const pdfBtn = `<button type="button" class="btn primary" data-act="pay-pdf" ${invs.length && !S.busyPdf ? '' : 'disabled'}>${ICON.down} ${S.busyPdf ? esc(S.pdfMsg || 'Preparando PDF…') : 'PDF para presentar'}</button>`;
  const xlsBtn = `<button type="button" class="btn" data-act="pay-xlsx" ${invs.length ? '' : 'disabled'}>${ICON.sheet} Excel</button>`;
  const undo = edit && st !== 'armando' ? `<button type="button" class="btn ghost sm" data-act="pay-status" data-s="${st === 'pagado' ? 'presentado' : 'armando'}">Regresar a “${st === 'pagado' ? 'Presentado' : 'Por presentar'}”</button>` : '';
  const dates = [pay.date ? 'Fecha del pago: ' + fmtDate(pay.date) : '', pay.presentedAt ? 'presentado el ' + fmtDate(pay.presentedAt) : '', pay.paidAt ? 'pagado el ' + fmtDate(pay.paidAt) : ''].filter(Boolean).join(' · ');
  const canRemove = edit && st !== 'pagado';
  const dot = (g) => (g.color ? `<i class="dot" style="--c:${g.color}"></i>` : '<i class="dot ring"></i>');
  const warnN = invs.filter((i) => reviewFlags(i, D).some((f) => f !== 'Sin orden')).length;
  const noOrd = invs.filter((i) => needsOrder(i, D)).length;
  const unsignedOrd = new Set(invs.filter((i) => i.order && i.order.status !== 'autorizada').map((i) => i.order.id)).size;
  const listHTML = groups.map((g) => `<section class="group"><h2 class="group-h">${dot(g)}<span class="gname">${esc(g.name)}</span><span class="gmeta">${g.items.length} · ${esc(totalStr(g.items, 'toPay'))}</span></h2>${wide() ? invTableHTML(g.items.sort(sortByDateDesc), D, 'pay', { noPick: true, rm: canRemove }) : `<div class="list">${g.items.sort(sortByDateDesc).map((i) => (canRemove ? `<div class="rowx">${cardHTML(i, D, { hideProject: true, hideStatus: true })}<button type="button" class="icon-btn" data-act="pay-rm" data-id="${esc(i.id)}" aria-label="Quitar del pago">${ICON.close}</button></div>` : cardHTML(i, D, { hideProject: true, hideStatus: true }))).join('')}</div>`}</section>`).join('');
  $('#pd-body').innerHTML = `
    <ol class="steps" aria-label="Avance del pago"><li class="${stepCls('armando')}">Por presentar</li><li class="${stepCls('presentado')}">Presentado</li><li class="${stepCls('pagado')}">Pagado</li></ol>
    <div class="bigtotal"><span>Total del pago · ${plural(invs.length, 'factura', 'facturas')}</span><b>${esc(totalStr(invs, 'toPay'))}</b><span>ITBIS incluido: ${esc(totalStr(invs, 'itbis'))}</span>${dates ? `<span>${esc(dates)}</span>` : ''}</div>
    ${warnN ? `<div class="msg warn">${ICON.alert}<span>${plural(warnN, 'factura tiene', 'facturas tienen')} algo que revisar antes de presentar (por ejemplo, falta el NCF o es de consumo).</span></div>` : ''}
    ${noOrd || unsignedOrd ? `<div class="msg warn">${ICON.alert}<span>${[noOrd ? plural(noOrd, 'factura no tiene', 'facturas no tienen') + ' orden de compra' : '', unsignedOrd ? plural(unsignedOrd, 'orden no tiene', 'órdenes no tienen') + ' la copia firmada y sellada' : ''].filter(Boolean).join(' y ')}. En el PDF van marcadas.</span></div>` : ''}
    ${apMsg}${retMsg}
    <div class="actions">${pdfBtn}${xlsBtn}${statusBtns.join('')}</div>${retBox}${undo ? `<div>${undo}</div>` : ''}
    ${groups.length ? `<div class="card"><h2>Por proyecto</h2><div class="table-wrap"><table class="sum"><thead><tr><th>Proyecto</th><th class="num">Facturas</th><th class="num">ITBIS</th><th class="num">Total</th></tr></thead><tbody>${groups.map((g) => `<tr><td><span class="pname">${dot(g)}${esc(g.name)}</span></td><td class="num">${g.items.length}</td><td class="num">${esc(totalStr(g.items, 'itbis'))}</td><td class="num">${esc(totalStr(g.items, 'toPay'))}</td></tr>`).join('')}</tbody><tfoot><tr><td>Total</td><td class="num">${invs.length}</td><td class="num">${esc(totalStr(invs, 'itbis'))}</td><td class="num">${esc(totalStr(invs, 'toPay'))}</td></tr></tfoot></table></div></div>` : ''}
    <div class="sumline"><span class="h2">Facturas en este pago</span>${edit && st === 'armando' ? `<button type="button" class="btn sm" data-act="pick-more">${ICON.plus} Agregar pendientes</button>` : ''}</div>
    ${invs.length ? listHTML : '<div class="empty"><p>Este pago todavía no tiene facturas.</p></div>'}`;
  if (renderedPayFields !== pay.id) {
    renderedPayFields = pay.id;
    $('#pd-fields').innerHTML = `<div class="field"><label for="pd-name">Nombre</label><input id="pd-name" maxlength="80" value="${esc(pay.name || '')}" ${edit ? '' : 'disabled'}></div><div class="field"><label for="pd-date">Fecha del pago</label><input id="pd-date" type="date" value="${esc(pay.date || '')}" ${edit ? '' : 'disabled'}></div>`;
    $('#pd-edit').open = false;
  }
  $('#pd-edit').hidden = !edit;
  $('#pd-foot').innerHTML = !edit || st === 'pagado' ? '' : S.payDel
    ? `<div class="confirm"><p>¿Eliminar este pago? Sus facturas regresan a <b>Pendientes</b>; no se borra ninguna. El pago queda en la papelera 30 días.</p><div class="actions"><button type="button" class="btn danger solid" data-act="pay-del-yes">Eliminar pago</button><button type="button" class="btn" data-act="pay-del-no">Cancelar</button></div></div>`
    : `<button type="button" class="btn danger sm" data-act="pay-del">${ICON.trash} Eliminar pago</button>`;
}

// Las facturas que faltan: órdenes sin factura de un proveedor (y sus conduces sin factura), en un mensaje para pedírselas.
const orderHasInv = (o, D) => (D.invByOrder.get(o.id) || []).length > 0;
const daysSince = (iso) => (ymd(iso) ? Math.round((ymd(todayISO()) - ymd(iso)) / 864e5) : null);
const agoText = (iso) => { const d = daysSince(iso); return d == null || d < 0 ? '' : d === 0 ? 'de hoy' : d === 1 ? 'de ayer' : `hace ${d} días`; };
function missingBySupplier(list, D) {
  const m = new Map();
  for (const o of list) { const k = supKey(o.supplier) || '?'; if (!m.has(k)) m.set(k, { key: k, name: o.supplier || 'Sin proveedor', items: [] }); m.get(k).items.push(o); }
  return [...m.values()].sort((a, b) => b.items.length - a.items.length || a.name.localeCompare(b.name));
}
function askInvoicesText(g, D) {
  const st = S.settings || {};
  const conds = D.conduces.filter((c) => !c.invoiceId && sameName(c.supplier, g.name));
  const lines = [...g.items].sort((a, b) => String(a.date || '').localeCompare(String(b.date || ''))).map((o) => `• ${orderNo(o)} del ${fmtDate(o.date) || 's/f'}${o.project ? ' (' + o.project.name + ')' : ''}: ${(o.items || []).filter((x) => x && (x.desc || x.qty)).map(itemLine).join('; ') || 'sin detalle'}`);
  return [`Buenas. Le escribe ${st.preparedBy || 'el encargado de compras'}${st.company ? ' de ' + st.company : ''}${st.companyRnc ? ' (RNC ' + RD.fmtRnc(st.companyRnc) + ')' : ''}.`,
    `Nos ${g.items.length === 1 ? 'falta la factura de este pedido' : 'faltan las facturas de estos pedidos'}:`, ...lines,
    conds.length ? `También tenemos ${conds.length === 1 ? 'este conduce' : 'estos conduces'} sin su factura: ${conds.map((c) => c.number || 's/n').join(', ')}.` : '',
    'Por favor, envíenoslas. Gracias.'].filter(Boolean).join('\n');
}
function openAskInvoices(key) {
  const D = derive();
  const g = missingBySupplier(D.orders.filter((o) => o.status !== 'anulada' && !orderHasInv(o, D)), D).find((x) => x.key === key);
  if (!g) return;
  const sup = D.suppliers.find((s) => s.name && sameName(s.name, g.name));
  const tel = sup && sup.phone ? String(sup.phone).replace(/\D/g, '') : '';
  const wa = tel.length === 10 ? '1' + tel : tel.length === 11 ? tel : '';
  const text = askInvoicesText(g, D);
  const canShare = !!navigator.share;
  openSheet(`${sheetHead('Pedir las facturas')}<div class="sheet-b">
    <p class="hint">Mensaje para <b>${esc(g.name)}</b> con ${plural(g.items.length, 'orden que no tiene', 'órdenes que no tienen')} factura. Puedes cambiarlo antes de mandarlo.</p>
    <div class="field"><label for="ask-text">Mensaje</label><textarea id="ask-text" rows="${Math.min(14, 5 + g.items.length * 2)}">${esc(text)}</textarea></div>
    ${wa ? '' : '<p class="usage">Si guardas el teléfono del proveedor en su ficha (Más → Proveedores), aquí sale el botón para abrir su WhatsApp.</p>'}
  </div><div class="sheet-f">${wa ? `<button type="button" class="btn primary" data-act="ask-wa" data-tel="${esc(wa)}">Abrir WhatsApp</button>` : ''}${canShare ? `<button type="button" class="btn${wa ? '' : ' primary'}" data-act="ask-share">${ICON.share} Compartir</button>` : ''}<button type="button" class="btn${wa || canShare ? '' : ' primary'}" data-act="ask-copy">Copiar</button></div>`, { type: 'ask', id: key });
}

function orderCardHTML(o, D, opts = {}) {
  const invs = D.invByOrder.get(o.id) || [];
  const n = (o.items || []).length;
  const its = (o.items || []).filter((x) => x && (x.desc || x.qty));
  const what = its.length ? itemLine(its[0]) + (n > 1 ? ` y ${n - 1} más` : '') : '';
  const meta = [opts.hideProject ? '' : o.project ? o.project.name : 'Sin proyecto', fmtDate(o.date), orderEst(o) ? 'estimado ' + money(orderEst(o)) : '', invs.length ? plural(invs.length, 'factura', 'facturas') : o.status === 'anulada' ? '' : ['sin factura', agoText(o.date)].filter(Boolean).join(', ')].filter(Boolean).join(' · ');
  return `<button type="button" class="ord" data-act="open-order" data-id="${esc(o.id)}"><span class="ord-top"><b class="mono">${esc(orderNo(o))}</b><span class="pill o-${o.status}">${ORDER_LABEL[o.status]}</span></span><span class="ord-sup">${esc(opts.hideSupplier ? what || 'Sin detalle' : o.supplier || 'Sin proveedor')}</span>${!opts.hideSupplier && what ? `<span class="ord-what">${esc(what)}</span>` : ''}<span class="ord-meta">${esc(meta)}</span></button>`;
}
function renderOrdenes(D) {
  const el = $('#o-list');
  $('#o-new').hidden = !canEdit();
  if (S.orderProject !== 'all' && S.orderProject !== 'none' && !D.projById.has(S.orderProject) && S.got.projects) S.orderProject = 'all';
  const inProj = (o) => S.orderProject === 'all' || (S.orderProject === 'none' ? !o.project : o.projectId === S.orderProject);
  const base = D.orders.filter(inProj);
  const groupOf = (o) => (o.status === 'anulada' ? 'anuladas' : orderHasInv(o, D) ? 'confactura' : 'sinfactura');
  const toSignOf = (o) => o.status === 'borrador' || o.status === 'enviada';
  if (!['sinfactura', 'confactura', 'todas', 'porfirmar'].includes(S.orderFilter)) S.orderFilter = 'todas';
  const counts = { sinfactura: 0, confactura: 0, todas: base.length };
  for (const o of base) if (counts[groupOf(o)] != null) counts[groupOf(o)]++;
  $('#o-seg').innerHTML = ORDER_SEGS.map(([k, label]) => `<button type="button" data-act="ofilter" data-f="${k}" aria-pressed="${S.orderFilter === k}"><span>${label}</span><span class="n">${counts[k]}</span></button>`).join('');
  // Proyectos que tienen órdenes (y el elegido), para filtrar.
  const och = $('#o-chips');
  const withOrders = D.projects.filter((p) => D.orders.some((o) => o.projectId === p.id) || S.orderProject === p.id);
  const noneN = D.orders.filter((o) => !o.project).length;
  if (D.orders.length && withOrders.length + (noneN ? 1 : 0) > 1) {
    och.hidden = false;
    const chips = [`<button type="button" class="chip" data-act="oprojf" data-p="all" aria-pressed="${S.orderProject === 'all'}"><span>Todos los proyectos</span></button>`];
    for (const p of withOrders) chips.push(`<button type="button" class="chip" data-act="oprojf" data-p="${esc(p.id)}" aria-pressed="${S.orderProject === p.id}"><i class="dot" style="--c:${p.color}"></i><span>${esc(p.name)}</span></button>`);
    if (noneN || S.orderProject === 'none') chips.push(`<button type="button" class="chip" data-act="oprojf" data-p="none" aria-pressed="${S.orderProject === 'none'}"><i class="dot ring"></i><span>Sin proyecto</span></button>`);
    och.innerHTML = chips.join('');
  } else { och.hidden = true; och.innerHTML = ''; }
  if (!S.got.orders) { el.innerHTML = S.dbState === 'absent' ? '' : '<p class="loading">Cargando órdenes…</p>'; return; }
  if (!D.orders.length) {
    el.innerHTML = `<div class="empty"><h2>Aquí van tus órdenes de compra</h2><ol><li>Cuando te pidan materiales, toca <b>Nueva orden de compra</b> y llénala. Si tienes la clave de API, puedes pegar el mensaje del pedido y se llena sola.</li><li>Comparte el PDF para que la firmen y la sellen.</li><li>Cuando vuelva firmada y sellada, agrega la foto con <b>+</b> en Facturas: la app reconoce el código QR de la orden y la adjunta sola.</li><li>Cuando llegue la factura, se enlaza sola a su orden si es la única abierta de ese proveedor (si no, te sugiere cuál). En el PDF del pago salen juntas.</li></ol></div>`;
    return;
  }
  const q = norm(S.orderSearch);
  let list = base.filter((o) => S.orderFilter === 'todas' || (S.orderFilter === 'porfirmar' ? toSignOf(o) : groupOf(o) === S.orderFilter));
  const note = S.orderFilter === 'porfirmar' ? `<p class="hint o-note">Solo las que faltan por firmar (${list.length}). <button type="button" class="link" data-act="ofilter" data-f="todas">Ver todas</button></p>` : S.orderFilter === 'sinfactura' && list.length ? `<p class="hint o-note">Estas son las facturas que te faltan: ${plural(list.length, 'orden no tiene', 'órdenes no tienen')} factura${(() => { const e = round2(list.reduce((t, o) => t + (orderEst(o) || 0), 0)); return e ? ' (estimado ' + esc(money(e)) + ')' : ''; })()}. Van por proveedor, para pedírselas.</p>` : '';
  if (q) list = list.filter((o) => norm([orderNo(o), o.supplier, o.requestedBy, o.project && o.project.name, (o.items || []).map((x) => x.desc).join(' ')].join(' ')).includes(q));
  if (!list.length) { el.innerHTML = `<div class="empty"><p>${q ? 'Nada coincide con tu búsqueda.' : S.orderProject !== 'all' ? 'No hay órdenes de este proyecto en esta lista.' : 'No hay órdenes en esta lista.'}</p></div>`; return; }
  // Sin factura: por proveedor (la más vieja primero), con el botón para pedirle las facturas.
  if (S.orderFilter === 'sinfactura') {
    el.innerHTML = note + missingBySupplier(list, D).map((g) => { const e = round2(g.items.reduce((t, o) => t + (orderEst(o) || 0), 0)); const items = [...g.items].sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
      return `<section class="group"><h2 class="group-h"><span class="gname">${esc(g.name)}</span><span class="gmeta">${esc([plural(g.items.length, 'orden', 'órdenes'), e ? money(e) : ''].filter(Boolean).join(' · '))}</span></h2><div class="list">${items.map((o) => orderCardHTML(o, D, { hideSupplier: true })).join('')}</div>${canEdit() ? `<div><button type="button" class="btn sm" data-act="ask-inv" data-k="${esc(g.key)}">Pedirle ${g.items.length === 1 ? 'la factura' : 'las facturas'}</button></div>` : ''}</section>`; }).join('');
    return;
  }
  if (S.orderProject !== 'all') { el.innerHTML = note + (wide() ? orderTableHTML(list, D) : `<div class="list">${list.map((o) => orderCardHTML(o, D, { hideProject: true })).join('')}</div>`); return; }
  // Divididas por proyecto, en el mismo orden que en Facturas; dentro de cada uno, la más nueva primero.
  const groups = D.projects.map((p) => ({ name: p.name, color: p.color, items: list.filter((o) => o.projectId === p.id) })).filter((g) => g.items.length);
  const none = list.filter((o) => !o.project);
  if (none.length) groups.push({ name: 'Sin proyecto', color: null, items: none });
  el.innerHTML = note + groups.map((g) => {
    const toSign = g.items.filter((o) => o.status === 'borrador' || o.status === 'enviada').length;
    return `<section class="group"><h2 class="group-h">${g.color ? `<i class="dot" style="--c:${g.color}"></i>` : '<i class="dot ring"></i>'}<span class="gname">${esc(g.name)}</span><span class="gmeta">${esc([plural(g.items.length, 'orden', 'órdenes'), toSign && S.orderFilter !== 'porfirmar' ? `${toSign} por firmar` : ''].filter(Boolean).join(' · '))}</span></h2>${wide() ? orderTableHTML(g.items, D) : `<div class="list">${g.items.map((o) => orderCardHTML(o, D, { hideProject: true })).join('')}</div>`}</section>`;
  }).join('');
}

/* ---------- traslados de materiales entre obras ---------- */
// Cuando se sacan materiales de una obra y se llevan a otra (por ejemplo, 3 m³ de tierra del ENZO para el Monaco): la hoja
// de traslado (qué, cuánto, a qué precio, quién lo pidió, lo autorizó, lo entregó, se lo llevó y lo recibió) y la cuenta
// entre las dos obras. En la cuenta, la obra que entrega (materiales o dinero) queda con eso a su favor: la que recibió
// los materiales le debe a la que los entregó, y un pago entre obras (o una compensación) rebaja esa deuda.
// Muchos materiales ya estaban en la obra y no tienen orden de compra: el precio se escribe a mano (el acordado); la app
// solo lo sugiere si ya lo conoce de otro traslado o de una orden, y anota de dónde salió.
const trNo = (t) => (t && Number(t.number) > 0 ? 'TR-' + String(t.number).padStart(4, '0') : 'Traslado nuevo');
const nextTrNumber = () => S.traslados.reduce((m, t) => (Number(t.number) > m ? Number(t.number) : m), 0) + 1;
const trProj = (id) => { const p = S.projects.find((x) => x.id === id); return p ? p.name : 'obra borrada'; };
const isTrPago = (t) => !!t && t.kind === 'pago';
const trLine = (it) => (isNum(it.qty) && isNum(it.price) ? round2(it.qty * it.price) : null);
const trTotal = (items) => round2((items || []).reduce((s, it) => s + (trLine(it) || 0), 0));
const trNoPrice = (items) => (items || []).filter((it) => trLine(it) == null).length;
const trWhen = (t) => String(t.date || '') + '|' + String(t.createdAt || '');
const trSigned = (t) => !!(t && t.signedFileId);
// Recepción: quien recibe cuenta lo que llegó y se anota; la app lo compara con lo que salió.
// A la obra que recibe solo se le cuenta lo que llegó; lo que faltó se queda en la obra de donde salió hasta que se aclare.
const trRecvQty = (t, k) => (t && t.received && Array.isArray(t.received.qty) && isNum(t.received.qty[k]) ? t.received.qty[k] : null);
function trEffTotal(t) {
  if (!t.received) return trTotal(t.items);
  return round2((t.items || []).reduce((s, it, k) => { const q = trRecvQty(t, k), qq = q == null ? it.qty : q; return s + (isNum(qq) && isNum(it.price) ? qq * it.price : 0); }, 0));
}
function trDiffs(t) {
  if (!t || !t.received) return [];
  return (t.items || []).map((it, k) => {
    const q = trRecvQty(t, k);
    if (q == null || !isNum(it.qty)) return null;
    const diff = round2(it.qty - q);
    return Math.abs(diff) < 0.0005 ? null : { k, it, got: q, diff, value: isNum(it.price) ? round2(diff * it.price) : null };
  }).filter(Boolean);
}
const trShortValue = (t) => round2(trDiffs(t).filter((x) => x.diff > 0).reduce((s, x) => s + (x.value || 0), 0));
const trState = (t) => (isTrPago(t) ? 'pago' : !t.received ? 'porrecibir' : trDiffs(t).length && !t.shortOk ? 'diferencia' : 'recibido');
const TR_ST = { porrecibir: ['o-enviada', 'Por recibir'], recibido: ['o-autorizada', 'Recibido'], diferencia: ['warn', 'Con diferencia'], pago: ['pagada', 'Pago'] };
const trWhenTxt = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString('es-DO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }); };
const localDT = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const trDiffTxt = (x) => { const u = x.it.unit ? ' ' + x.it.unit : ''; return x.diff > 0 ? `Faltan ${fmtQty(x.diff)}${u} de ${x.it.desc || 'material'}${x.value ? ' (' + money(x.value) + ')' : ''}` : `Llegaron ${fmtQty(-x.diff)}${u} de más de ${x.it.desc || 'material'}`; };
function trRecvHTML(t, edit) {
  const from = trProj(t.fromId), to = trProj(t.toId), rec = t.received, items = t.items || [];
  const box = edit ? `<div id="tr-recv-box"${rec ? ' hidden' : ' hidden'}><div class="tr-recv-rows">${items.map((it, k) => `<label class="tr-recv-row"><span>${esc([it.qty !== '' && it.qty != null ? fmtQty(it.qty) : '', it.unit, it.desc].filter(Boolean).join(' '))}</span><span class="tr-recv-in">llegó <input class="mono" inputmode="decimal" maxlength="12" data-rq="${k}" aria-label="Cuánto llegó" value="${esc(rec ? (trRecvQty(t, k) == null ? '' : String(trRecvQty(t, k))) : isNum(it.qty) ? String(it.qty) : '')}"></span></label>`).join('')}</div>
    <div class="fields"><div class="field"><label for="tr-rcv-by">Lo recibió</label><input id="tr-rcv-by" maxlength="80" value="${esc((rec && rec.by) || t.receivedBy || '')}"></div><div class="field"><label for="tr-rcv-when">Llegó el</label><input id="tr-rcv-when" type="datetime-local" value="${esc(rec && rec.at ? localDT(new Date(rec.at)) : localDT())}"></div><div class="field full"><label for="tr-rcv-note">Nota de la recepción</label><input id="tr-rcv-note" maxlength="160" value="${esc((rec && rec.note) || '')}" placeholder="Ej. se contó al bajarlo del camión"></div></div>
    <div class="actions"><button type="button" class="btn primary" data-act="tr-recv-save" data-id="${esc(t.id)}">Guardar lo que llegó</button></div></div>` : '';
  const ph = [['out', 'Foto de la carga al salir', t.outPhotoId, t.outPhotoType, t.outPhotoAt], ['in', 'Foto de lo que llegó', t.inPhotoId, t.inPhotoType, t.inPhotoAt]]
    .map(([k, label, id, type, at]) => (id ? `<button type="button" class="preview" data-act="tr-photo-view" data-id="${esc(t.id)}" data-k="${k}">${String(type).startsWith('image/') ? `<img src="${esc(assetUrl(id))}" alt="">` : '<span class="ph">PDF</span>'}<span class="preview-tag">${esc(k === 'out' ? 'Al salir' : 'Al llegar')}${at ? ' · ' + esc(trWhenTxt(at)) : ''}</span></button>` : edit ? `<button type="button" class="btn sm" data-act="tr-photo" data-k="${k}">${ICON.plus} ${esc(label)}</button>` : '')).join('');
  let body;
  if (!rec) {
    body = `<p class="hint">La hoja viaja con el que se lo lleva. Quien recibe en ${esc(to)} cuenta lo que llegó, lo escribe en la columna «Recibido» y firma. Cuando te llegue la hoja (o la foto por WhatsApp), anota aquí lo que llegó: la app lo compara con lo que salió de ${esc(from)}.</p>${edit ? '<div><button type="button" class="btn sm primary" data-act="tr-recv-open">Anotar lo que llegó</button></div>' : ''}`;
  } else {
    const d = trDiffs(t), sv = trShortValue(t);
    const who = [rec.at ? 'Llegó el ' + trWhenTxt(rec.at) : 'Llegó', rec.by ? 'lo recibió ' + rec.by : ''].filter(Boolean).join(' · ');
    const diffMsg = d.length ? `<div class="msg warn">${ICON.alert}<span>${esc(d.map(trDiffTxt).join('. '))}.${sv ? ` A ${esc(to)} solo se le cuenta lo que llegó; lo que faltó (${esc(money(sv))}) se queda en ${esc(from)} hasta que se aclare.` : ''}</span></div>` : `<div class="msg ok">${ICON.check}<span>Llegó completo: lo mismo que salió.</span></div>`;
    const clear = d.length ? (t.shortOk ? `<p class="usage">Diferencia aclarada${t.shortNote ? ': ' + esc(t.shortNote) : ''}.</p>` : edit ? `<p class="hint">Si al final sí llegó, toca «Corregir lo que llegó». Si se devolvió, se perdió o ya se habló con el chofer, anótalo y toca «Ya se aclaró».</p><div class="ab-add"><input id="tr-short-note" maxlength="120" placeholder="Cómo se aclaró" aria-label="Cómo se aclaró"><button type="button" class="btn sm" data-act="tr-short-ok" data-id="${esc(t.id)}">Ya se aclaró</button></div>` : '') : '';
    body = `<p class="usage">${esc(who)}${rec.note ? ' · ' + esc(rec.note) : ''}</p>${diffMsg}${clear}${edit ? '<div><button type="button" class="btn sm" data-act="tr-recv-open">Corregir lo que llegó</button></div>' : ''}`;
  }
  return `<div class="card" id="tr-recv"><h2>Recepción en ${esc(to)}</h2>${body}${box}${ph ? `<div class="tr-photos">${ph}</div>` : ''}</div>`;
}
function refreshTrRecv(id) {
  setTimeout(() => {
    const c = $('#tr-recv');
    const t = S.traslados.find((x) => x.id === id);
    if (!c || !t || !S.sheet || S.sheet.type !== 'tr' || S.sheet.id !== id) return;
    c.outerHTML = trRecvHTML(t, canEdit());
    const sl = $('#tr-form .status-line');
    if (sl) sl.innerHTML = trStatusHTML(t);
    if (S.sheet && !S.sheet.dirty) S.sheet.sig = trSig(t);
  }, 150);
}
async function saveTrRecv(id) {
  const t = S.traslados.find((x) => x.id === id);
  if (!t) return;
  const qty = (t.items || []).map((it, k) => { const inp = $(`#tr-recv-box [data-rq="${k}"]`); const v = inp ? inp.value.trim() : ''; const n = v === '' ? null : parseAmount(v); return isNum(n) && n >= 0 ? round2(n) : null; });
  if (qty.some((q, k) => q == null && isNum(t.items[k].qty))) { toast('Escribe cuánto llegó de cada material (0 si no llegó nada).'); return; }
  const raw = $('#tr-rcv-when').value;
  const received = { at: raw && !isNaN(Date.parse(raw)) ? new Date(raw).toISOString() : new Date().toISOString(), by: $('#tr-rcv-by').value.trim().slice(0, 80), qty, note: $('#tr-rcv-note').value.trim().slice(0, 160), savedBy: whoAmI() };
  const next = { ...t, received };
  const upd = { received, receivedBy: received.by || t.receivedBy || '', sentTotal: trTotal(t.items), total: trEffTotal(next), shortOk: false, shortNote: '', updatedAt: new Date().toISOString() };
  if (await write(() => db.doc('traslados/' + id).update(upd), trDiffs(next).length ? 'Guardado: no llegó lo mismo que salió' : 'Guardado: llegó completo')) refreshTrRecv(id);
}
const trStatusHTML = (t) => `${trPill(t)}${isTrPago(t) ? '' : `<span class="pill ${trSigned(t) ? 'o-autorizada' : 'o-enviada'}">${trSigned(t) ? 'Firmado' : 'Sin firmar'}</span>`}<span>${esc(trAccLine(t))}</span>`;
function trAccLine(t) {
  const acc = trAccOf(t.fromId, t.toId);
  return acc && acc.amount >= 0.01 ? `Cuenta entre ${trProj(t.fromId)} y ${trProj(t.toId)}: ${trOwes(acc)}.` : `${trProj(t.fromId)} y ${trProj(t.toId)} están a mano.`;
}
// Cuentas entre obras: por cada par, lo que entregó una menos lo que entregó la otra.
function trAccounts(list = S.traslados) {
  const m = new Map();
  for (const t of list) {
    if (!t.fromId || !t.toId || t.fromId === t.toId || !isNum(t.total) || !t.total) continue;
    const [a, b] = [t.fromId, t.toId].sort();
    const k = a + '|' + b;
    if (!m.has(k)) m.set(k, { a, b, net: 0, moves: [] });
    const acc = m.get(k);
    acc.net = round2(acc.net + (t.fromId === a ? 1 : -1) * t.total);
    acc.moves.push(t);
  }
  return [...m.values()].map((x) => {
    x.moves.sort((p, q) => trWhen(p).localeCompare(trWhen(q)));
    const last = x.moves[x.moves.length - 1];
    return { ...x, last: last ? last.date : '', creditor: x.net >= 0 ? x.a : x.b, debtor: x.net >= 0 ? x.b : x.a, amount: Math.abs(x.net) };
  }).sort((p, q) => q.amount - p.amount);
}
const trAccOf = (a, b, list) => trAccounts(list).find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a)) || null;
const trOwes = (x) => `${trProj(x.debtor)} le debe ${money(x.amount)} a ${trProj(x.creditor)}`;
// Lo que una obra recibió y dio en materiales (cambia lo que cuesta cada obra).
function trOfProject(pid) {
  let inn = 0, out = 0;
  for (const t of S.traslados) if (!isTrPago(t) && isNum(t.total)) { if (t.toId === pid) inn += t.total; if (t.fromId === pid) out += t.total; }
  return { inn: round2(inn), out: round2(out) };
}
// El último precio conocido de un material: de un traslado anterior o de una orden de compra.
function lastPriceOf(desc, skipId) {
  const k = norm(desc);
  if (!k) return null;
  const byDate = (a, b) => String(b.date || '').localeCompare(String(a.date || ''));
  const pools = [
    ...S.traslados.filter((t) => !isTrPago(t) && t.id !== skipId).sort(byDate).map((t) => ({ items: t.items, src: trNo(t) })),
    ...[...S.orders].sort(byDate).map((o) => ({ items: o.items, src: orderNo(o) })),
  ];
  for (const p of pools) for (const it of p.items || []) if (isNum(it.price) && it.price > 0 && norm(it.desc) === k) return { price: it.price, unit: it.unit || '', src: p.src };
  return null;
}
const trPriceSrc = (it) => (trLine(it) == null ? 'Sin precio' : it.priceSrc ? 'Precio de ' + it.priceSrc : 'Escrito a mano');

// Apartado Traslados: las cuentas entre obras arriba y la lista de traslados y pagos.
const trAccRowHTML = (x, edit) => `<div class="tr-acc-row"><div class="grow"><span><b>${esc(trProj(x.debtor))}</b> le debe a <b>${esc(trProj(x.creditor))}</b></span><small>A favor de ${esc(trProj(x.creditor))} · ${plural(x.moves.length, 'movimiento', 'movimientos')}${x.last ? ' · el último el ' + esc(fmtDate(x.last)) : ''}</small></div><b class="mono tr-amt">${esc(money(x.amount))}</b><div class="acts"><button type="button" class="btn sm" data-act="tr-acc" data-a="${esc(x.creditor)}" data-b="${esc(x.debtor)}">Ver la cuenta</button>${edit ? `<button type="button" class="btn sm" data-act="tr-pay" data-from="${esc(x.debtor)}" data-to="${esc(x.creditor)}">Registrar pago</button>` : ''}</div></div>`;
const trPill = (t) => { const [c, l] = TR_ST[trState(t)]; return `<span class="pill ${c}">${l}</span>`; };
function trWhat(t) {
  if (isTrPago(t)) return [t.notes || ''].filter(Boolean).join('');
  const its = t.items || [], it = its[0];
  if (!it) return '';
  return `${it.qty !== '' && it.qty != null ? fmtQty(it.qty) + ' ' : ''}${it.unit ? it.unit + ' ' : ''}${it.desc || ''}`.trim() + (its.length > 1 ? ` y ${plural(its.length - 1, 'material', 'materiales')} más` : '');
}
function trCardHTML(t) {
  if (isTrPago(t)) return `<button type="button" class="ord tr-card" data-act="tr-open" data-id="${esc(t.id)}"><span class="ord-top"><b>Pago entre obras</b>${trPill(t)}</span><span class="ord-sup">${esc(trProj(t.fromId))} le pagó a ${esc(trProj(t.toId))}</span><span class="ord-meta">${esc([fmtDate(t.date), money(t.total || 0), t.notes || ''].filter(Boolean).join(' · '))}</span></button>`;
  const np = trNoPrice(t.items);
  return `<button type="button" class="ord tr-card" data-act="tr-open" data-id="${esc(t.id)}"><span class="ord-top"><b class="mono">${esc(trNo(t))}</b>${trPill(t)}</span><span class="ord-sup">${esc(trProj(t.fromId))} → ${esc(trProj(t.toId))}</span><span class="ord-meta">${esc([fmtDate(t.date), trWhat(t), money(t.total || 0), np ? np + ' sin precio' : '', trSigned(t) ? 'hoja firmada' : 'sin la hoja firmada'].filter(Boolean).join(' · '))}</span></button>`;
}
function trTableHTML(list) {
  const val = (t, k) => (k === 'total' ? (isNum(t.total) ? t.total : -Infinity) : k === 'date' ? trWhen(t) : k === 'from' ? norm(trProj(t.fromId)) : k === 'to' ? norm(trProj(t.toId)) : isTrPago(t) ? 0 : Number(t.number) || 0);
  const rows = sortRows('tr', list, val).map((t) => `<tr data-act="tr-open" data-id="${esc(t.id)}"><td class="c-main"><button type="button" class="row-btn mono" data-act="tr-open" data-id="${esc(t.id)}">${esc(isTrPago(t) ? 'Pago' : trNo(t))}</button></td><td>${esc(fmtDate(t.date) || '—')}</td><td>${esc(trProj(t.fromId))}</td><td>${esc(trProj(t.toId))}</td><td class="c-what">${esc(trWhat(t) || '—')}</td><td>${trPill(t)}</td><td class="r mono">${esc(money(t.total || 0))}</td></tr>`).join('');
  return `<table class="tbl tr-tbl"><colgroup><col class="w-ord"><col class="w-date"><col class="w-cmain"><col class="w-cmain"><col><col class="w-st"><col class="w-amt"></colgroup><thead><tr>${thHTML('tr', 'number', 'No.')}${thHTML('tr', 'date', 'Fecha')}${thHTML('tr', 'from', 'Sale de')}${thHTML('tr', 'to', 'Va para')}${thHTML('tr', '', 'Materiales o pago')}${thHTML('tr', '', 'Estado')}${thHTML('tr', 'total', 'Total', 'r')}</tr></thead><tbody>${rows}</tbody></table>`;
}
function renderTraslados(D) {
  const el = $('#t-list'), edit = canEdit();
  $('#t-new').hidden = !edit || D.projects.length < 2;
  if (S.trProject !== 'all' && !D.projById.has(S.trProject) && S.got.projects) S.trProject = 'all';
  if (!S.got.traslados || !S.got.projects) { $('#t-acc').innerHTML = ''; $('#t-bar').innerHTML = ''; el.innerHTML = S.dbState === 'absent' ? '' : '<p class="loading">Cargando traslados…</p>'; return; }
  const inProj = (t) => S.trProject === 'all' || t.fromId === S.trProject || t.toId === S.trProject;
  const accs = trAccounts().filter((x) => x.amount >= 0.01 && (S.trProject === 'all' || x.a === S.trProject || x.b === S.trProject));
  $('#t-acc').innerHTML = S.traslados.length ? `<div class="card tr-acc"><h2>Cuentas entre obras</h2>${accs.length ? accs.map((x) => trAccRowHTML(x, edit)).join('') : `<p class="hint">${S.trProject === 'all' ? 'Las obras están a mano: ninguna le debe a otra.' : 'Esta obra está a mano con las demás.'}</p>`}</div>` : '';
  $('#t-bar').innerHTML = S.traslados.length ? `<button type="button" class="btn sm" data-act="tr-xlsx">${ICON.sheet} Excel</button>${edit ? '<button type="button" class="btn sm ghost" data-act="tr-pay">Registrar pago entre obras</button>' : ''}` : '';
  const ch = $('#t-chips');
  const withTr = D.projects.filter((p) => S.traslados.some((t) => t.fromId === p.id || t.toId === p.id) || S.trProject === p.id);
  if (withTr.length > 1) {
    ch.hidden = false;
    ch.innerHTML = [`<button type="button" class="chip" data-act="tr-projf" data-p="all" aria-pressed="${S.trProject === 'all'}"><span>Todas las obras</span></button>`, ...withTr.map((p) => `<button type="button" class="chip" data-act="tr-projf" data-p="${esc(p.id)}" aria-pressed="${S.trProject === p.id}"><i class="dot" style="--c:${p.color}"></i><span>${esc(p.name)}</span></button>`)].join('');
  } else { ch.hidden = true; ch.innerHTML = ''; }
  if (!S.traslados.length) {
    el.innerHTML = D.projects.length < 2
      ? '<div class="empty"><h2>Traslados de materiales</h2><p>Para pasar materiales de una obra a otra, primero agrega las dos obras en <b>Proyectos</b>.</p><button type="button" class="btn" data-act="go-tab" data-go="proyectos">Ir a Proyectos</button></div>'
      : `<div class="empty"><h2>Traslados de materiales</h2><ol><li>Cuando saquen materiales de una obra para llevarlos a otra, toca <b>Nuevo traslado</b>: de qué obra salen, para cuál van, cada material con su cantidad, unidad y precio, y quién lo pidió, lo entregó, se lo llevó y lo recibió.</li><li>Saca la <b>hoja de traslado</b> en PDF: viaja con el que se lo lleva, y quien recibe cuenta lo que llegó, lo escribe en «Recibido» y firma.</li><li>Anota <b>lo que llegó</b>: la app lo compara con lo que salió y avisa si falta algo. Adjunta la hoja firmada y, si puedes, una foto de la carga al salir y otra al llegar.</li><li>Aquí arriba sale la cuenta entre las obras: cuánto le debe una a la otra. Cuando se salde, toca <b>Registrar pago</b>.</li></ol>${edit ? '<button type="button" class="btn primary" data-act="tr-new">Nuevo traslado</button>' : ''}</div>`;
    return;
  }
  const q = norm(S.trSearch);
  let list = S.traslados.filter(inProj);
  if (q) list = list.filter((t) => norm([trNo(t), isTrPago(t) ? 'pago' : 'traslado', trProj(t.fromId), trProj(t.toId), t.requestedBy, t.authorizedBy, t.deliveredBy, t.carriedBy, t.vehicle, t.receivedBy, t.notes, (t.items || []).map((x) => x.desc).join(' ')].join(' ')).includes(q));
  list.sort((a, b) => trWhen(b).localeCompare(trWhen(a)) || (Number(b.number) || 0) - (Number(a.number) || 0));
  if (!list.length) { el.innerHTML = `<div class="empty"><p>${q ? 'Nada coincide con tu búsqueda.' : 'Esta obra no tiene traslados.'}</p></div>`; return; }
  const LIM = wide() ? 150 : 60, key = 'tr';
  const shown = list.length <= LIM || S.showAll.has(key) ? list : list.slice(0, LIM);
  el.innerHTML = (wide() ? trTableHTML(shown) : `<div class="list">${shown.map(trCardHTML).join('')}</div>`) + (shown.length < list.length ? `<button type="button" class="btn sm more" data-act="more" data-k="${key}">Ver ${list.length - shown.length} más</button>` : '');
}

// La hoja de traslado (formulario).
const TR_PEOPLE = [['requestedBy', 't-req', 'Lo pidió'], ['authorizedBy', 't-auth', 'Lo autorizó'], ['deliveredBy', 't-dlv', 'Lo entregó'], ['carriedBy', 't-car', 'Se lo llevó (chofer o persona)'], ['vehicle', 't-veh', 'Vehículo o placa'], ['receivedBy', 't-rcv', 'Lo recibió']];
function trPeopleLabel(k, fromId, toId) {
  if (k === 'deliveredBy') return fromId ? 'Lo entregó en ' + trProj(fromId) : 'Lo entregó (en la obra de donde sale)';
  if (k === 'receivedBy') return toId ? 'Lo recibió en ' + trProj(toId) : 'Lo recibió (en la obra a donde va)';
  return (TR_PEOPLE.find((x) => x[0] === k) || ['', '', ''])[2];
}
function trSumText(items, fromId, toId) {
  const list = (items || []).filter((x) => x.desc || (x.qty !== '' && x.qty != null));
  if (!list.length) return 'Escribe la cantidad, la unidad (m³, metro, saco, viaje…), el precio por unidad y la descripción de cada material. Si ya estaba en la obra y no tiene orden de compra (la tierra, por ejemplo), escribe el precio acordado.';
  const tot = trTotal(list), np = trNoPrice(list);
  const who = fromId && toId && fromId !== toId && tot ? ` Con este traslado, ${trProj(toId)} le queda debiendo ${money(tot)} a ${trProj(fromId)}.` : '';
  return `Total: ${money(tot)}${np ? ` · ${plural(np, 'material', 'materiales')} sin precio (no ${np === 1 ? 'suma' : 'suman'})` : ''}.${who}`;
}
function trFormRefresh() {
  const from = $('#t-from') ? $('#t-from').value : '', to = $('#t-to') ? $('#t-to').value : '';
  const s = $('#t-sum');
  if (s) s.textContent = trSumText(collectItems('#t-items'), from, to);
  for (const [k, idn] of TR_PEOPLE) { const l = $(`label[for="${idn}"]`); if (l) l.textContent = trPeopleLabel(k, from, to); }
  // Para que se pueda comprobar, quien entrega, quien se lo lleva y quien recibe deben ser personas distintas.
  const w = $('#t-who-warn');
  if (w) {
    const v = (id) => norm(($('#' + id) || {}).value || '');
    const m = v('t-dlv') && v('t-dlv') === v('t-rcv') ? 'La misma persona entrega y recibe: para poder comprobar el traslado, que sean personas distintas.' : v('t-car') && v('t-car') === v('t-rcv') ? 'El que se lo lleva no debería ser el mismo que lo recibe: así otro cuenta lo que llegó.' : '';
    w.textContent = m; w.hidden = !m;
  }
}
// Al escribir el material, si no tiene precio y ya se conoce uno, se pone (y se dice de dónde salió).
function trFillPrice(inp) {
  const row = inp.closest('[data-row]');
  if (!row) return;
  const pr = row.querySelector('[data-f="price"]'), un = row.querySelector('[data-f="unit"]');
  if (!pr || pr.value.trim()) return;
  const f = $('#tr-form');
  const hit = lastPriceOf(inp.value, f && f.dataset.id);
  if (!hit) return;
  pr.value = String(hit.price);
  pr.dataset.src = hit.src;
  if (un && !un.value.trim() && hit.unit) un.value = hit.unit;
  trFormRefresh();
  toast(`Precio de ${hit.src}: ${money(hit.price)} por ${hit.unit || 'unidad'}. Revísalo.`);
}
const trSig = (t) => JSON.stringify([t.updatedAt, t.signedFileId, t.signedAt, t.number]);
function refreshTrSheet() {
  const sh = S.sheet;
  if (!sh || sh.type !== 'tr' || !sh.id || sh.dirty) return;
  const t = S.traslados.find((x) => x.id === sh.id);
  if (!t) { if (S.got.traslados && sh.sig) closeSheet(); return; }
  if (trSig(t) !== sh.sig) openTraslado(t.id, true);
}
function openTraslado(id, keepScroll) {
  const D = derive();
  const t = id ? S.traslados.find((x) => x.id === id) : null;
  if (id && !t) return;
  if (isTrPago(t)) { openTrPago('', '', t.id); return; }
  if (!t && D.projects.length < 2) { toast('Primero agrega las dos obras en Proyectos.'); return; }
  const edit = canEdit(), dis = edit ? '' : 'disabled';
  const data = t || { number: nextTrNumber(), date: todayISO(), fromId: S.trProject !== 'all' ? S.trProject : '', toId: '', items: [], notes: '' };
  const items = (data.items || []).slice();
  if (edit) for (let k = Math.max(1, 3 - items.length); k > 0; k--) items.push({});
  const opt = (sel) => D.projects.map((p) => `<option value="${esc(p.id)}"${p.id === sel ? ' selected' : ''}>${esc(p.name)}</option>`).join('');
  const dl = (idn, arr) => `<datalist id="${idn}">${arr.map((v) => `<option value="${esc(v)}"></option>`).join('')}</datalist>`;
  const trItems = S.traslados.flatMap((x) => x.items || []);
  const thumb = t && t.signedFileId ? t.signedThumbId || (String(t.signedFileType).startsWith('image/') ? t.signedFileId : null) : null;
  const signedBox = t ? `<div class="card"><h2>Hoja firmada</h2>${trSigned(t) ? `<button type="button" class="preview" data-act="tr-view-signed" data-id="${esc(t.id)}">${thumb ? `<img src="${esc(assetUrl(thumb))}" alt="">` : '<span class="ph">PDF</span>'}<span class="preview-tag">Ver</span></button><p class="usage">Firmada el ${esc(fmtDate(t.signedAt) || '')}.</p>` : '<p class="hint">Saca la hoja en PDF, que la firmen quien entrega, quien se lo lleva y quien lo recibe, y adjunta aquí la foto. Esa es la prueba del traslado.</p>'}${edit ? `<div><button type="button" class="btn sm" data-act="tr-signed">${trSigned(t) ? 'Cambiar la hoja firmada' : 'Adjuntar la hoja firmada'}</button></div>` : ''}</div>` : '';
  const prevScroll = keepScroll && $('.sheet-b') ? $('.sheet-b').scrollTop : 0;
  openSheet(`<form id="tr-form" data-id="${t ? esc(t.id) : ''}" autocomplete="off">${sheetHead(t ? esc(trNo(t)) : 'Traslado de materiales')}
    <div class="sheet-b">
      ${t ? `<div class="status-line">${trStatusHTML(t)}</div>` : ''}
      <div class="fields">
        <div class="field"><label for="t-no">No. de traslado</label><input id="t-no" class="mono" value="${esc(trNo(data))}" disabled></div>
        <div class="field"><label for="t-date">Fecha</label><input id="t-date" type="date" value="${esc(data.date || '')}" ${dis}></div>
        <div class="field"><label for="t-from">Sale de (obra)</label><select id="t-from" ${dis}><option value="">Elige la obra</option>${opt(data.fromId)}</select></div>
        <div class="field"><label for="t-to">Va para (obra)</label><select id="t-to" ${dis}><option value="">Elige la obra</option>${opt(data.toId)}</select></div>
      </div>
      <h3 class="h2">Materiales</h3>
      <div id="t-items" class="o-items">${items.map((it, k) => itemRowHTML(it, k + 1, dis)).join('')}</div>
      ${edit ? `<div><button type="button" class="btn sm" data-act="tr-add-item">${ICON.plus} Agregar material</button></div>` : ''}
      <p class="usage" id="t-sum">${esc(trSumText(data.items, data.fromId, data.toId))}</p>
      <h3 class="h2">Quiénes</h3>
      <div class="fields">${TR_PEOPLE.map(([k, idn]) => `<div class="field"><label for="${idn}">${esc(trPeopleLabel(k, data.fromId, data.toId))}</label><input id="${idn}"${k === 'vehicle' ? '' : ' list="dl-trpeople"'} maxlength="80" value="${esc(data[k] || '')}" ${dis}></div>`).join('')}</div>
      <p class="usage warn-txt" id="t-who-warn" hidden></p>
      <div class="field"><label for="t-notes">Notas (para qué es, de dónde se sacó…)</label><textarea id="t-notes" rows="2" maxlength="300" ${dis}>${esc(data.notes || '')}</textarea></div>
      ${t ? trRecvHTML(t, edit) : ''}
      ${signedBox}
      ${t && edit ? `<div><button type="button" class="btn danger sm" data-act="tr-del" data-id="${esc(t.id)}">${ICON.trash} Eliminar traslado</button></div>` : ''}
    </div>
    <div class="sheet-f">${edit ? '<button type="submit" class="btn">Guardar</button>' : ''}<button type="button" class="btn primary" data-act="tr-pdf">${ICON.down} ${edit ? 'Guardar y sacar la hoja' : 'Sacar la hoja'}</button></div>
  </form>${dl('dl-units', uniqList([...UNITS, ...D.orders.flatMap((x) => (x.items || []).map((it) => it.unit)), ...trItems.map((it) => it.unit)]))}${dl('dl-items', uniqList([...trItems.map((it) => it.desc), ...D.orders.flatMap((x) => (x.items || []).map((it) => it.desc)), ...S.conduces.map((c) => c.material)]).slice(0, 400))}${dl('dl-trpeople', uniqList([...S.traslados.flatMap((x) => TR_PEOPLE.filter(([k]) => k !== 'vehicle').map(([k]) => x[k])), ...D.orders.map((x) => x.requestedBy), ...S.workers.map((w) => w.name)]).slice(0, 300))}`, { type: 'tr', id: t ? t.id : null, dirty: false, sig: t ? trSig(t) : '' });
  if (keepScroll && $('.sheet-b')) $('.sheet-b').scrollTop = prevScroll;
  trFormRefresh();
}
async function saveTraslado(thenPdf) {
  const f = $('#tr-form');
  if (!f) return null;
  const id = f.dataset.id;
  const prev = id ? S.traslados.find((x) => x.id === id) : null;
  const items = collectItems('#t-items');
  const fromId = $('#t-from').value, toId = $('#t-to').value;
  if (!fromId) { toast('Elige la obra de donde salen los materiales.'); $('#t-from').focus(); return null; }
  if (!toId) { toast('Elige la obra para donde van.'); $('#t-to').focus(); return null; }
  if (fromId === toId) { toast('La obra de donde salen y la obra para donde van tienen que ser distintas.'); $('#t-to').focus(); return null; }
  if (!items.length) { toast('Agrega al menos un material.'); return null; }
  const date = $('#t-date').value;
  const data = { kind: 'material', date: ymd(date) ? date : todayISO(), fromId, toId, items: items.slice(0, 200), total: prev && prev.received ? trEffTotal({ ...prev, items }) : trTotal(items), sentTotal: trTotal(items), notes: $('#t-notes').value.trim().slice(0, 300), updatedAt: new Date().toISOString() };
  for (const [k, idn] of TR_PEOPLE) data[k] = $('#' + idn).value.trim().slice(0, 80);
  let full = null;
  const ok = await write(async () => {
    if (prev) { await db.doc('traslados/' + id).update(data); full = { ...prev, ...data }; }
    else {
      const ref = db.collection('traslados').doc();
      full = { ...data, number: nextTrNumber(), createdAt: new Date().toISOString(), by: whoAmI() };
      await ref.set(full);
      full.id = ref.id;
    }
  }, thenPdf ? '' : 'Traslado guardado');
  if (!ok) return null;
  if (S.sheet && S.sheet.type === 'tr') { S.sheet.dirty = false; S.sheet.id = full.id; S.sheet.sig = trSig(full); f.dataset.id = full.id; }
  if (thenPdf) await makeTrPdf(full); else closeSheet();
  return full;
}
async function trPdfAction() {
  const f = $('#tr-form');
  if (!f) return;
  if (canEdit()) { await saveTraslado(true); return; }
  const t = S.traslados.find((x) => x.id === f.dataset.id);
  if (t) await makeTrPdf(t);
}
async function makeTrPdf(t) {
  try {
    const bytes = await buildTrPdf(t);
    deliverFile(new Blob([bytes], { type: 'application/pdf' }), fileSafe(`Traslado ${trNo(t)} - ${trProj(t.fromId)} a ${trProj(t.toId)}`) + '.pdf');
  } catch (e) {
    console.error(e);
    toast('No se pudo preparar la hoja de traslado.');
  }
}
async function attachTrSigned(id, file, kind = 'signed') {
  const t = S.traslados.find((x) => x.id === id);
  if (!t) return;
  toast('Guardando la hoja firmada…');
  try {
    const name = String(file.name || ''), type = String(file.type || '').toLowerCase();
    const isPdf = type === 'application/pdf' || /\.pdf$/i.test(name);
    let blob, ftype, thumb = null;
    if (isPdf) {
      const bytes = await file.arrayBuffer();
      blob = new Blob([bytes], { type: 'application/pdf' });
      ftype = 'application/pdf';
      let r = null;
      try { r = await inspectPdf(bytes); thumb = r.thumb; } catch (e) { console.warn('miniatura', e); }
      if (r && r.creator === PDF_CREATOR && kind === 'signed') throw new UserError('Ese es el PDF que hizo la app, sin firmar. Adjunta la foto o el escaneo de la hoja ya firmada.');
    } else {
      blob = (await prepImage(file)).blob;
      ftype = 'image/jpeg';
    }
    const up = await assets.upload(blob, { type: ftype });
    let thumbId = null;
    if (thumb) { try { thumbId = (await assets.upload(thumb, { type: 'image/jpeg' })).id; } catch (e) { console.warn('miniatura', e); } }
    if (kind !== 'signed') {
      const at = file.lastModified && Date.now() - file.lastModified < 30 * 864e5 && file.lastModified <= Date.now() ? new Date(file.lastModified).toISOString() : new Date().toISOString();
      const old = t[kind + 'PhotoId'];
      await dbw(() => db.doc('traslados/' + id).update({ [kind + 'PhotoId']: up.id, [kind + 'PhotoType']: ftype, [kind + 'PhotoAt']: at }));
      if (old) { try { await assets.delete(old); } catch (e) { /* ya no existe */ } }
      if (thumbId) { try { await assets.delete(thumbId); } catch (e) { /* nada */ } }
      toast(kind === 'out' ? 'Foto de la carga al salir guardada' : 'Foto de lo que llegó guardada');
      refreshTrRecv(id);
      return;
    }
    const old = [t.signedFileId, t.signedThumbId].filter(Boolean);
    await dbw(() => db.doc('traslados/' + id).update({ signedFileId: up.id, signedFileType: ftype, signedThumbId: thumbId, signedAt: todayISO() }));
    for (const a of old) { try { await assets.delete(a); } catch (e) { /* ya no existe */ } }
    toast('Hoja firmada guardada');
  } catch (e) {
    console.error(e);
    toast(e instanceof UserError ? e.message : 'No se pudo guardar la hoja firmada. Intenta de nuevo.');
  }
}
async function deleteTr(id) {
  const t = S.traslados.find((x) => x.id === id);
  if (!t) return;
  const kind = isTrPago(t) ? 'trpago' : 'traslado';
  const label = `${isTrPago(t) ? 'Pago' : trNo(t)} · ${trProj(t.fromId)} → ${trProj(t.toId)} · ${money(t.total || 0)}`;
  if (await write(async () => { await toTrash(kind, t, label); await db.doc('traslados/' + id).delete(); })) {
    closeSheet();
    toastAct(isTrPago(t) ? 'Pago movido a la papelera' : 'Traslado movido a la papelera', 'Deshacer', () => undoTrash(kind, id));
  }
}

// Pago entre obras (o compensación): rebaja la cuenta.
function openTrPago(fromId, toId, id) {
  const D = derive();
  const t = id ? S.traslados.find((x) => x.id === id) : null;
  if (id && !t) return;
  const edit = canEdit(), dis = edit ? '' : 'disabled';
  let a = fromId, b = toId;
  if (!t && (!a || !b)) { const top = trAccounts().filter((x) => x.amount >= 0.01 && (S.trProject === 'all' || x.a === S.trProject || x.b === S.trProject))[0]; if (top) { a = top.debtor; b = top.creditor; } }
  const acc = !t && a && b ? trAccOf(a, b) : null;
  const data = t || { date: todayISO(), fromId: a || '', toId: b || '', total: acc && acc.debtor === a ? acc.amount : null, notes: '' };
  const opt = (sel) => D.projects.map((p) => `<option value="${esc(p.id)}"${p.id === sel ? ' selected' : ''}>${esc(p.name)}</option>`).join('');
  openSheet(`<form id="tp-form" data-id="${t ? esc(t.id) : ''}" autocomplete="off">${sheetHead(t ? 'Pago entre obras' : 'Registrar pago entre obras')}<div class="sheet-b">
    <p class="hint">Cuando una obra le paga a otra lo que le debe por materiales (con dinero, una transferencia o compensándolo con otra cosa), anótalo aquí: rebaja la cuenta entre las dos.</p>
    <div class="fields">
      <div class="field"><label for="tp-from">Paga (la obra que debe)</label><select id="tp-from" ${dis}><option value="">Elige la obra</option>${opt(data.fromId)}</select></div>
      <div class="field"><label for="tp-to">Recibe</label><select id="tp-to" ${dis}><option value="">Elige la obra</option>${opt(data.toId)}</select></div>
      <div class="field"><label for="tp-date">Fecha</label><input id="tp-date" type="date" value="${esc(data.date || '')}" ${dis}></div>
      <div class="field"><label for="tp-amt">Monto (RD$)</label><input id="tp-amt" class="mono" inputmode="decimal" maxlength="18" value="${esc(amountInput(data.total))}" ${dis}></div>
      <div class="field full"><label for="tp-note">Cómo se pagó</label><input id="tp-note" maxlength="200" placeholder="Transferencia, cheque, compensado con…" value="${esc(data.notes || '')}" ${dis}></div>
    </div>
    <p class="usage" id="tp-msg"></p>
    ${t && edit ? `<div><button type="button" class="btn danger sm" data-act="tr-del" data-id="${esc(t.id)}">${ICON.trash} Eliminar este pago</button></div>` : ''}
  </div><div class="sheet-f">${edit ? '<button type="submit" class="btn primary block">Guardar</button>' : ''}</div></form>`, { type: 'tp', id: t ? t.id : null });
  tpRefresh();
}
function tpRefresh() {
  const el = $('#tp-msg');
  if (!el) return;
  const a = $('#tp-from').value, b = $('#tp-to').value, amt = parseAmount($('#tp-amt').value);
  if (!a || !b || a === b) { el.textContent = 'Elige la obra que paga y la que recibe.'; return; }
  const id = $('#tp-form').dataset.id;
  const acc = trAccOf(a, b, S.traslados.filter((x) => x.id !== id));
  const owed = acc ? (acc.debtor === a ? acc.amount : -acc.amount) : 0;
  const now = owed > 0.004 ? `Ahora ${trProj(a)} le debe ${money(owed)} a ${trProj(b)}.` : owed < -0.004 ? `Ahora ${trProj(b)} le debe ${money(-owed)} a ${trProj(a)}.` : `Ahora ${trProj(a)} y ${trProj(b)} están a mano.`;
  const after = isNum(amt) && amt > 0 ? round2(owed - amt) : null;
  const then = after == null ? '' : after > 0.004 ? ` Con este pago, ${trProj(a)} queda debiendo ${money(after)}.` : after < -0.004 ? ` Ojo: con este pago, ${trProj(b)} quedaría debiéndole ${money(-after)} a ${trProj(a)}.` : ' Con este pago quedan a mano.';
  el.textContent = now + then;
}
async function saveTrPago() {
  const f = $('#tp-form');
  if (!f) return;
  const id = f.dataset.id;
  const prev = id ? S.traslados.find((x) => x.id === id) : null;
  const fromId = $('#tp-from').value, toId = $('#tp-to').value, amt = parseAmount($('#tp-amt').value);
  if (!fromId || !toId) { toast('Elige la obra que paga y la que recibe.'); return; }
  if (fromId === toId) { toast('La obra que paga y la que recibe tienen que ser distintas.'); return; }
  if (!isNum(amt) || amt <= 0) { toast('Escribe el monto solo con números.'); $('#tp-amt').focus(); return; }
  const date = $('#tp-date').value;
  const data = { kind: 'pago', date: ymd(date) ? date : todayISO(), fromId, toId, total: round2(amt), notes: $('#tp-note').value.trim().slice(0, 200), updatedAt: new Date().toISOString() };
  const ok = await write(async () => {
    if (prev) await db.doc('traslados/' + id).update(data);
    else await db.collection('traslados').doc().set({ ...data, createdAt: new Date().toISOString(), by: whoAmI() });
  }, 'Pago entre obras guardado');
  if (ok) closeSheet();
}

// La cuenta entre dos obras, movimiento por movimiento.
function openTrAccount(a, b) {
  const x = trAccOf(a, b);
  const na = trProj(a), nb = trProj(b);
  let bal = 0;
  const rows = (x ? x.moves : []).map((t) => {
    const s = t.fromId === a ? 1 : -1;
    bal = round2(bal + s * t.total);
    const what = isTrPago(t) ? `Pago: ${trProj(t.fromId)} le pagó a ${trProj(t.toId)}` : `${trNo(t)}: materiales de ${trProj(t.fromId)} para ${trProj(t.toId)}`;
    const saldo = Math.abs(bal) < 0.005 ? 'A mano' : money(Math.abs(bal)) + ' a favor de ' + (bal > 0 ? na : nb);
    // En el teléfono, cada movimiento en su renglón; en la computadora, en tabla.
    if (!wide()) return `<div class="tr-mv"><div class="tr-mv-top"><span>${esc(fmtDate(t.date) || '—')}</span><b class="mono">${esc(money(t.total))}</b></div><button type="button" class="link" data-act="tr-open" data-id="${esc(t.id)}">${esc(what)}</button><small>A favor de ${esc(s > 0 ? na : nb)} · queda ${esc(saldo === 'A mano' ? 'a mano' : saldo)}</small></div>`;
    return `<tr><td>${esc(fmtDate(t.date) || '—')}</td><td><button type="button" class="link" data-act="tr-open" data-id="${esc(t.id)}">${esc(what)}</button></td><td class="num">${s > 0 ? esc(money(t.total)) : ''}</td><td class="num">${s < 0 ? esc(money(t.total)) : ''}</td><td class="num">${esc(saldo)}</td></tr>`;
  }).join('');
  const result = x && x.amount >= 0.01 ? `<p class="tr-result"><b>${esc(trProj(x.debtor))}</b> le debe <b class="mono">${esc(money(x.amount))}</b> a <b>${esc(trProj(x.creditor))}</b></p>` : `<p class="tr-result">${esc(na)} y ${esc(nb)} están a mano.</p>`;
  openSheet(`${sheetHead('Cuenta entre obras')}<div class="sheet-b">
    <p class="hint">Cada obra queda con a su favor lo que entrega: los materiales que le da a la otra y lo que le paga.</p>
    <div class="card"><h2>${esc(na)} y ${esc(nb)}</h2>${result}
    ${rows && !wide() ? `<div class="tr-mvs">${rows}</div>` : rows ? `<div class="table-wrap"><table class="sum"><thead><tr><th>Fecha</th><th>Movimiento</th><th class="num">A favor de ${esc(na)}</th><th class="num">A favor de ${esc(nb)}</th><th class="num">Saldo</th></tr></thead><tbody>${rows}</tbody></table></div>` : ''}</div>
  </div><div class="sheet-f">${canEdit() && x && x.amount >= 0.01 ? `<button type="button" class="btn primary" data-act="tr-pay" data-from="${esc(x.debtor)}" data-to="${esc(x.creditor)}">Registrar pago</button>` : ''}<button type="button" class="btn" data-act="sheet-close">Cerrar</button></div>`, { type: 'tr-acc', id: a + '|' + b });
}
// En la ficha de la obra: lo que recibió y dio, y cómo está con las demás.
function trProjBoxHTML(pid) {
  if (!S.traslados.some((t) => t.fromId === pid || t.toId === pid)) return '';
  const { inn, out } = trOfProject(pid);
  const lines = trAccounts().filter((x) => x.amount >= 0.01 && (x.a === pid || x.b === pid)).map((x) => (x.creditor === pid ? `${trProj(x.debtor)} le debe ${money(x.amount)} a esta obra` : `Esta obra le debe ${money(x.amount)} a ${trProj(x.creditor)}`));
  return `<div class="card"><h2>Traslados de materiales</h2><p class="usage">Recibió de otras obras ${esc(money(inn))} · dio a otras obras ${esc(money(out))}</p>${lines.length ? `<ul class="tr-lines">${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : '<p class="hint">Está a mano con las demás obras.</p>'}<button type="button" class="btn sm" data-act="tr-go-proj" data-id="${esc(pid)}">Ver sus traslados ${ICON.right}</button></div>`;
}

// PDF de la hoja de traslado (carta), para firmar.
async function buildTrPdf(t) {
  const { PDFDocument, StandardFonts, rgb } = await pdflib();
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  doc.setTitle(pdfSafe('Traslado de materiales ' + trNo(t)));
  doc.setCreator(PDF_CREATOR);
  const st = S.settings || {};
  const W = 612, H = 792, X0 = 38, X1 = 574;
  const NAVY = rgb(0.137, 0.255, 0.353), INK = rgb(0.1, 0.11, 0.13), VAL = rgb(0.04, 0.1, 0.3), GREY = rgb(0.42, 0.45, 0.5);
  const GRID = rgb(0.62, 0.67, 0.74), WHITE = rgb(1, 1, 1), BAND = rgb(0.93, 0.95, 0.97);
  const items = (t.items || []).filter((x) => x && (x.desc || (x.qty !== '' && x.qty != null)));
  const per = 14;
  const nPages = Math.max(1, Math.ceil(items.length / per));
  const yy = (top) => H - top;
  const fitT = (s, f, size, w) => { let x = pdfSafe(s); if (f.widthOfTextAtSize(x, size) <= w) return x; while (x.length > 1 && f.widthOfTextAtSize(x + '…', size) > w) x = x.slice(0, -1); return x + '…'; };
  const from = trProj(t.fromId), to = trProj(t.toId), total = trTotal(items), np = trNoPrice(items);
  for (let pg = 0; pg < nPages; pg++) {
    const p = doc.addPage([W, H]);
    const text = (s, x, top, size, f = font, color = INK) => p.drawText(pdfSafe(s), { x, y: yy(top), size, font: f, color });
    const center = (s, cx, top, size, f = font, color = INK) => { const v = pdfSafe(s); p.drawText(v, { x: cx - f.widthOfTextAtSize(v, size) / 2, y: yy(top), size, font: f, color }); };
    const right = (s, xr, top, size, f = font, color = INK) => { const v = pdfSafe(s); p.drawText(v, { x: xr - f.widthOfTextAtSize(v, size), y: yy(top), size, font: f, color }); };
    const hline = (a, b, top, th = 0.6, color = GRID) => p.drawLine({ start: { x: a, y: yy(top) }, end: { x: b, y: yy(top) }, thickness: th, color });
    if (st.company) center(st.company.toUpperCase(), W / 2, 50, 13.5, bold, NAVY);
    center('TRASLADO DE MATERIALES ENTRE OBRAS', W / 2, st.company ? 70 : 54, 10.5, font, INK);
    if (nPages > 1) text(`Página ${pg + 1} de ${nPages}`, X0, 28, 8, font, GREY);
    const field = (label, value, x, top, xEnd) => {
      text(label, x, top, 9, font, INK);
      const lx = x + font.widthOfTextAtSize(pdfSafe(label), 9) + 4;
      hline(lx, xEnd, top + 2, 0.6, INK);
      if (value) text(fitT(value, bold, 9.5, xEnd - lx - 4), lx + 2, top - 1, 9.5, bold, VAL);
    };
    [['No. de traslado:', trNo(t), 'Fecha:', fmtDmy(t.date)], ['Sale de (obra):', from, 'Va para (obra):', to], ['Lo pidió:', t.requestedBy || '', 'Lo autorizó:', t.authorizedBy || '']].forEach(([l1, v1, l2, v2], k) => {
      const top = 104 + 26 * k;
      field(l1, v1, 44, top, 300);
      field(l2, v2, 322, top, X1 - 2);
    });
    const tTop = 184, hH = 22, rH = 24, cols = [X0, 60, 112, 160, 384, 446, 512, X1];
    const bodyTop = tTop + hH, bottom = bodyTop + rH * per;
    p.drawRectangle({ x: X0, y: yy(bodyTop), width: X1 - X0, height: hH, color: NAVY });
    [['No.', 0], ['Cantidad', 1], ['Unidad', 2]].forEach(([l, k]) => center(l, (cols[k] + cols[k + 1]) / 2, tTop + 14.5, 8.5, bold, WHITE));
    text('Material / descripción', cols[3] + 6, tTop + 14.5, 8.5, bold, WHITE);
    right('Precio', cols[5] - 6, tTop + 14.5, 8.5, bold, WHITE);
    right('Total', cols[6] - 6, tTop + 14.5, 8.5, bold, WHITE);
    center('Recibido', (cols[6] + cols[7]) / 2, tTop + 14.5, 8.5, bold, WHITE);
    for (let r = 0; r < per; r++) {
      const top = bodyTop + rH * r, n = pg * per + r, it = items[n];
      if (r % 2) p.drawRectangle({ x: X0, y: yy(top + rH), width: X1 - X0, height: rH, color: BAND });
      center(String(n + 1), (cols[0] + cols[1]) / 2, top + 15.5, 8.5, font, GREY);
      if (!it) continue;
      if (it.qty !== '' && it.qty != null) center(fitT(fmtQty(it.qty), bold, 9.5, cols[2] - cols[1] - 6), (cols[1] + cols[2]) / 2, top + 15.5, 9.5, bold, VAL);
      if (it.unit) center(fitT(it.unit, font, 9, cols[3] - cols[2] - 6), (cols[2] + cols[3]) / 2, top + 15.5, 9, font, VAL);
      const lines = wrapText(it.desc || '', font, 9, cols[4] - cols[3] - 10);
      if (lines.length <= 1) text(lines[0] || '', cols[3] + 6, top + 15.5, 9, font, VAL);
      else { text(lines[0], cols[3] + 6, top + 10.5, 8.5, font, VAL); text(fitT(lines.slice(1).join(' '), font, 8.5, cols[4] - cols[3] - 10), cols[3] + 6, top + 20.5, 8.5, font, VAL); }
      if (isNum(it.price)) right(fitT(money(it.price), font, 8.5, cols[5] - cols[4] - 8), cols[5] - 6, top + 15.5, 8.5, font, VAL);
      const ln = trLine(it);
      right(ln == null ? 'sin precio' : fitT(money(ln), bold, 8.5, cols[6] - cols[5] - 8), cols[6] - 6, top + 15.5, ln == null ? 7.5 : 8.5, ln == null ? font : bold, ln == null ? GREY : VAL);
      const rq = trRecvQty(t, (t.items || []).indexOf(it));
      if (rq != null) center(fitT(fmtQty(rq), bold, 9.5, cols[7] - cols[6] - 6), (cols[6] + cols[7]) / 2, top + 15.5, 9.5, bold, isNum(it.qty) && Math.abs(it.qty - rq) >= 0.0005 ? rgb(0.75, 0.15, 0.12) : VAL);
    }
    p.drawRectangle({ x: X0, y: yy(bottom), width: X1 - X0, height: bottom - tTop, borderColor: GRID, borderWidth: 0.8 });
    for (const cx of cols.slice(1, -1)) p.drawLine({ start: { x: cx, y: yy(tTop) }, end: { x: cx, y: yy(bottom) }, thickness: 0.5, color: GRID });
    if (pg < nPages - 1) continue;
    const yT = bottom + 18;
    const got = t.received ? trEffTotal({ ...t, items: t.items || [] }) : null, short = t.received ? trShortValue(t) : 0;
    right(got == null ? 'TOTAL DEL TRASLADO:' : 'TOTAL QUE SALIÓ:', cols[4] - 6, yT, 9.5, bold, INK);
    right(money(total), cols[6] - 6, yT, 10, bold, VAL);
    const sentence = !total
      ? `Estos materiales no tienen precio: no cambian la cuenta entre ${from} y ${to}.`
      : got == null
        ? `${from} entrega estos materiales a ${to} por ${money(total)}. Ese monto queda a favor de ${from} en la cuenta entre las dos obras.${np ? ` ${plural(np, 'material', 'materiales')} sin precio no se ${np === 1 ? 'sumó' : 'sumaron'}.` : ''}`
        : `Salieron materiales por ${money(total)} y llegaron por ${money(got)}${short ? ` (faltaron ${money(short)})` : ''}. A ${to} se le cuenta lo que llegó: ${money(got)} quedan a favor de ${from} en la cuenta entre las dos obras.`;
    wrapText(sentence, font, 9, X1 - X0 - 12).slice(0, 3).forEach((ln, k) => text(ln, 44, yT + 20 + 12 * k, 9, font, INK));
    const nLabel = 'Notas:';
    text(nLabel, 44, yT + 66, 9, bold, INK);
    const nx = 44 + bold.widthOfTextAtSize(nLabel, 9) + 4;
    hline(nx, X1 - 2, yT + 68, 0.6, INK);
    const notes = wrapText(t.notes || '', font, 9, X1 - nx - 6);
    if (notes[0]) text(notes[0], nx + 2, yT + 65, 9, font, VAL);
    if (notes.length > 1) { hline(44, X1 - 2, yT + 82, 0.6, INK); text(fitT(notes.slice(1).join(' '), font, 9, X1 - 50), 46, yT + 79, 9, font, VAL); }
    text(`Salida: ${t.outPhotoAt ? trWhenTxt(t.outPhotoAt) : 'fecha ______  hora ______'}`, 44, 666, 9, font, INK);
    text(`Llegada: ${t.received && t.received.at ? trWhenTxt(t.received.at) : 'fecha ______  hora ______'}`, 322, 666, 9, font, INK);
    text('Quien recibe: cuente lo que llegó, escríbalo en la columna «Recibido» y firme. Si falta algo, anótelo en Notas.', 44, 681, 8, font, GREY);
    const sigs = [['Lo entregó', t.deliveredBy, 'en ' + from], ['Se lo llevó', t.carriedBy, t.vehicle ? 'Vehículo: ' + t.vehicle : ''], ['Lo recibió', t.receivedBy, 'en ' + to], ['Lo autorizó', t.authorizedBy, '']];
    const gap = 16, sw = (X1 - X0 - gap * 3) / 4;
    sigs.forEach(([lbl, name, sub], k) => {
      const a = X0 + k * (sw + gap), b = a + sw, cx = (a + b) / 2;
      hline(a, b, 716, 0.8, INK);
      center(lbl, cx, 728, 9, bold, INK);
      if (name) center(fitT(name, font, 8.5, sw), cx, 740, 8.5, font, VAL);
      if (sub) center(fitT(sub, font, 7.5, sw), cx, name ? 751 : 740, 7.5, font, GREY);
    });
    text(`Generado el ${fmtDmy(todayISO())}`, X0, 772, 7.5, font, GREY);
  }
  return doc.save();
}

// Excel: las cuentas entre obras, cada material trasladado y los pagos.
function trWorkbook(list, title) {
  const { XS, sheetXml, buildXlsx, excelDate } = FILES;
  const st = S.settings || {};
  const Dt = (s) => { const d = excelDate(String(s || '').slice(0, 10)); return d == null ? { v: '' } : { v: d, s: XS.date }; };
  const top = (name) => [[{ v: st.company || 'Traslados de materiales', s: XS.title }], [{ v: name, s: XS.bold }], [{ v: 'Generado el ' + fmtDate(todayISO()), s: XS.muted }], []];
  const ac = top(title);
  ac.push(['Obra que debe', 'Le debe a', 'Monto', 'Movimientos', 'Último'].map((v, j) => ({ v, s: j < 2 ? XS.head : XS.headR })));
  const accs = trAccounts(list).filter((x) => x.amount >= 0.01);
  for (const x of accs) ac.push([{ v: trProj(x.debtor) }, { v: trProj(x.creditor) }, { v: x.amount, s: XS.money }, { v: x.moves.length, s: XS.int }, Dt(x.last)]);
  if (!accs.length) ac.push([{ v: 'Las obras están a mano.' }]);
  ac.push([]);
  ac.push(['Obra', 'Recibió en materiales', 'Dio en materiales', 'Diferencia'].map((v, j) => ({ v, s: j ? XS.headR : XS.head })));
  for (const pid of [...new Set(list.flatMap((t) => [t.fromId, t.toId]))].filter(Boolean)) {
    let inn = 0, out = 0;
    for (const t of list) if (!isTrPago(t) && isNum(t.total)) { if (t.toId === pid) inn += t.total; if (t.fromId === pid) out += t.total; }
    ac.push([{ v: trProj(pid) }, { v: round2(inn), s: XS.money }, { v: round2(out), s: XS.money }, { v: round2(inn - out), s: XS.money }]);
  }
  const mats = list.filter((t) => !isTrPago(t)).sort((a, b) => trWhen(a).localeCompare(trWhen(b)));
  const tr = top('Materiales trasladados');
  const heads = ['Fecha', 'No.', 'Sale de', 'Va para', 'Cantidad', 'Unidad', 'Material', 'Precio', 'Total', 'De dónde salió el precio', 'Llegó', 'Estado', 'Lo pidió', 'Lo autorizó', 'Lo entregó', 'Se lo llevó', 'Vehículo', 'Lo recibió', 'Hoja firmada', 'Notas'];
  tr.push(heads.map((v, j) => ({ v, s: j === 4 || j === 7 || j === 8 || j === 10 ? XS.headR : XS.head })));
  let sum = 0;
  for (const t of mats) for (const [k, it] of (t.items || []).entries()) {
    const ln = trLine(it);
    if (ln) sum = round2(sum + ln);
    tr.push([Dt(t.date), { v: trNo(t) }, { v: trProj(t.fromId) }, { v: trProj(t.toId) }, isNum(it.qty) ? { v: it.qty } : { v: String(it.qty == null ? '' : it.qty) }, { v: it.unit || '' }, { v: it.desc || '' }, isNum(it.price) ? { v: it.price, s: XS.money } : { v: '' }, ln == null ? { v: '' } : { v: ln, s: XS.money }, { v: trPriceSrc(it) }, trRecvQty(t, k) == null ? { v: '' } : { v: trRecvQty(t, k) }, { v: TR_ST[trState(t)][1] }, { v: t.requestedBy || '' }, { v: t.authorizedBy || '' }, { v: t.deliveredBy || '' }, { v: t.carriedBy || '' }, { v: t.vehicle || '' }, { v: t.receivedBy || '' }, { v: trSigned(t) ? 'Sí' : 'No' }, { v: t.notes || '' }]);
  }
  tr.push([{ v: 'Total', s: XS.totLabel }, ...Array(7).fill(0).map(() => ({ v: '', s: XS.totBlank })), { v: sum, s: XS.totMoney }]);
  const pg = top('Pagos entre obras');
  pg.push(['Fecha', 'Pagó', 'Le pagó a', 'Monto', 'Cómo se pagó'].map((v, j) => ({ v, s: j === 3 ? XS.headR : XS.head })));
  for (const t of list.filter(isTrPago).sort((a, b) => trWhen(a).localeCompare(trWhen(b)))) pg.push([Dt(t.date), { v: trProj(t.fromId) }, { v: trProj(t.toId) }, { v: t.total, s: XS.money }, { v: t.notes || '' }]);
  const footer = `&L${(st.company || 'Traslados').replace(/&/g, '&&')}&C${title.replace(/&/g, '&&')}&RPágina &P de &N`;
  return buildXlsx([
    { name: 'Cuentas', xml: sheetXml(ac, { widths: [28, 28, 16, 14, 13], selected: true, footer }) },
    { name: 'Materiales', xml: sheetXml(tr, { widths: [11, 9, 20, 20, 9, 9, 34, 12, 13, 20, 9, 14, 16, 16, 16, 16, 12, 16, 11, 30], freeze: 5, landscape: true, footer }) },
    { name: 'Pagos', xml: sheetXml(pg, { widths: [11, 24, 24, 14, 34], footer }) },
  ], { title, creator: st.preparedBy || 'Facturas de Proyectos', names: [] });
}
function trExcel() {
  const list = S.trProject === 'all' ? S.traslados : S.traslados.filter((t) => t.fromId === S.trProject || t.toId === S.trProject);
  const title = 'Traslados de materiales' + (S.trProject === 'all' ? '' : ' - ' + trProj(S.trProject));
  try { deliverFile(trWorkbook(list, title), fileSafe(title + ' ' + todayISO()) + '.xlsx'); } catch (e) { console.error(e); toast('No se pudo preparar el Excel.'); }
}

/* ---------- apartado de conduces ---------- */
const COND_SEGS = [['esperando', 'Sin factura'], ['confactura', 'Con factura'], ['todos', 'Todos']];
const condSupKey = (c) => (c.rnc && RD.normRnc(c.rnc) ? 'r:' + RD.normRnc(c.rnc) : 'n:' + norm(c.supplier || ''));
const condWhen = (c) => String(c.date || '') + '|' + String(c.createdAt || '');
function renderConduces(D) {
  const el = $('#c-list');
  if (S.condProject !== 'all' && S.condProject !== 'none' && !D.projById.has(S.condProject) && S.got.projects) S.condProject = 'all';
  const inProj = (c) => S.condProject === 'all' || (S.condProject === 'none' ? !c.projectId : c.projectId === S.condProject);
  const base = D.conduces.filter(inProj);
  const counts = { esperando: base.filter((c) => !c.invoiceId).length, confactura: base.filter((c) => c.invoiceId).length, todos: base.length };
  $('#c-seg').innerHTML = COND_SEGS.map(([k, label]) => `<button type="button" data-act="cfilter" data-f="${k}" aria-pressed="${S.condFilter === k}"><span>${label}</span><span class="n">${counts[k]}</span></button>`).join('');
  const ch = $('#c-chips');
  const withC = D.projects.filter((p) => D.conduces.some((c) => c.projectId === p.id) || S.condProject === p.id);
  const noneN = D.conduces.filter((c) => !c.projectId).length;
  if (D.conduces.length && withC.length + (noneN ? 1 : 0) > 1) {
    ch.hidden = false;
    const chips = [`<button type="button" class="chip" data-act="cprojf" data-p="all" aria-pressed="${S.condProject === 'all'}"><span>Todos los proyectos</span></button>`];
    for (const p of withC) chips.push(`<button type="button" class="chip" data-act="cprojf" data-p="${esc(p.id)}" aria-pressed="${S.condProject === p.id}"><i class="dot" style="--c:${p.color}"></i><span>${esc(p.name)}</span></button>`);
    if (noneN || S.condProject === 'none') chips.push(`<button type="button" class="chip" data-act="cprojf" data-p="none" aria-pressed="${S.condProject === 'none'}"><i class="dot ring"></i><span>Sin proyecto</span></button>`);
    ch.innerHTML = chips.join('');
  } else { ch.hidden = true; ch.innerHTML = ''; }
  const sum = $('#c-sum');
  if (!S.got.conduces) { el.innerHTML = S.dbState === 'absent' ? '' : '<p class="loading">Cargando conduces…</p>'; sum.innerHTML = ''; return; }
  if (!D.conduces.length) {
    sum.innerHTML = '';
    el.innerHTML = `<div class="empty"><h2>Aquí van los conduces</h2><ol><li>Cuando te entreguen un conduce (la nota de entrega del material), toca <b>Agregar conduces</b> y tómale una foto. Con la clave de API se lee solo.</li><li>Queda esperando su factura. Cuando llegue la factura, se le adjunta solo si la factura menciona su número, si el monto coincide o si los conduces de ese proveedor suman lo mismo que la factura. Si no, en la factura los marcas y se adjuntan.</li></ol></div>`;
    return;
  }
  const invById = new Map(D.invoices.map((i) => [i.id, i]));
  const q = norm(S.condSearch || '');
  let list = base.filter((c) => S.condFilter === 'todos' || (S.condFilter === 'esperando' ? !c.invoiceId : !!c.invoiceId));
  if (q) list = list.filter((c) => { const inv = invById.get(c.invoiceId), p = D.projById.get(c.projectId); return norm([c.number, c.supplier, c.material, c.qty, p && p.name, inv && inv.supplier, inv && inv.number, fmtDate(c.date)].filter(Boolean).join(' ')).includes(q); });
  list.sort((a, b) => condWhen(b).localeCompare(condWhen(a)));
  sum.innerHTML = list.length ? `<span>${plural(list.length, 'conduce', 'conduces')} · <b class="mono">${esc(totalStr(list, 'total'))}</b></span>` : '';
  if (!list.length) { el.innerHTML = `<div class="empty"><p>${q ? 'Nada coincide con tu búsqueda.' : S.condFilter === 'esperando' ? 'No hay conduces esperando factura.' : S.condFilter === 'confactura' ? 'Todavía no hay conduces con su factura.' : 'No hay conduces.'}</p></div>`; return; }
  const key = 'conds-' + S.condFilter, LIM = 60;
  const all = list.length;
  if (all > LIM && !S.showAll.has(key)) list = list.slice(0, LIM);
  // Por proveedor, con lo que suman: así se compara con la factura cuando llegue.
  const groups = new Map();
  for (const c of list) { const k = condSupKey(c); if (!groups.has(k)) groups.set(k, { name: c.supplier || 'Proveedor sin nombre', items: [] }); groups.get(k).items.push(c); }
  const more = (c) => {
    const p = S.condProject === 'all' && c.projectId ? D.projById.get(c.projectId) : null;
    const inv = c.invoiceId ? invById.get(c.invoiceId) : null;
    return [p ? p.name : '', inv ? 'Factura ' + (inv.number ? RD.normNcf(inv.number) : inv.supplier || 'sin NCF') : S.condFilter === 'todos' ? 'esperando factura' : ''].filter(Boolean).join(' · ');
  };
  el.innerHTML = (S.condFilter === 'esperando' ? '<p class="hint c-hint">Cuando llegue la factura, se le adjuntan solos si la factura menciona sus números o si suman lo mismo que la factura. Si no, ábrela y marca los que son.</p>' : '')
    + [...groups.values()].map((g) => `<section class="group"><h2 class="group-h"><span class="gname">${esc(g.name)}</span><span class="gmeta">${g.items.length} · ${esc(totalStr(g.items, 'total'))}</span></h2>${wide() ? condTableHTML(g.items, D, invById) : `<div class="cond-list">${g.items.map((c) => condRowHTML(c, false, more(c))).join('')}</div>`}</section>`).join('')
    + (all > list.length ? `<button type="button" class="btn sm more" data-act="more" data-k="${esc(key)}">Ver ${all - list.length} más</button>` : '');
}

function renderProyectos(D) {
  $('#proj-add').hidden = !canEdit();
  const sb = $('#sup-bar');
  const nDigi = S.got.envios ? pendingDigi(D).length : 0;
  if (sb) sb.innerHTML = `<button type="button" class="btn sm" data-act="sups">Proveedores (${S.suppliers.length})</button><button type="button" class="btn sm" data-act="digi-open">Digitadora${nDigi ? ` (${nDigi} por mandar)` : ''}</button>`;
  const el = $('#p-list');
  if (!S.got.projects) { el.innerHTML = S.dbState === 'absent' ? '' : '<p class="loading">Cargando proyectos…</p>'; return; }
  const rows = D.projects.map((p) => {
    const invs = D.invoices.filter((i) => i.projectId === p.id);
    const pend = invs.filter((i) => i.status === 'pendiente'), tram = invs.filter((i) => GROUP_OF[i.status] === 'tramite'), paid = invs.filter((i) => i.status === 'pagada');
    const sub = [pend.length ? plural(pend.length, 'pendiente', 'pendientes') : '', tram.length ? `${tram.length} en trámite` : '', paid.length ? plural(paid.length, 'pagada', 'pagadas') : ''].filter(Boolean).join(' · ') || 'Sin facturas todavía';
    return `<button type="button" class="prow" data-act="open-proj" data-id="${esc(p.id)}"><i class="dot" style="--c:${p.color}"></i><span class="pr-mid"><b>${esc(p.name)}</b><small>${esc(sub)}</small>${isNum(p.budget) && p.budget > 0 ? (() => { const c = projCosts(p, D); const pct = Math.round((c.total / p.budget) * 100); return `<span class="b-bar sm"><i style="width:${Math.min(100, pct)}%" class="${pct > 100 ? 'over' : pct >= 85 ? 'near' : ''}"></i></span><small>${pct} % del presupuesto (${esc(money(c.total))} de ${esc(money(p.budget))})</small>`; })() : ''}</span><span class="pr-total">${pend.length ? `${esc(totalStr(pend))}<small>por pagar</small>` : ''}</span></button>`;
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
  const fresh = !root.classList.contains('still'), inside = root.contains(document.activeElement);
  if (fresh && !S.sheet) lastFocus = document.activeElement;
  root.innerHTML = `<div class="scrim" data-act="sheet-close"></div><div class="sheet" role="dialog" aria-modal="true" tabindex="-1">${html}</div>`;
  root.hidden = false;
  S.sheet = data;
  lockBody();
  // En la computadora, el teclado sigue dentro del panel (al abrirlo, y si se redibuja mientras se usa).
  if (wide() && (fresh || inside)) { const sh = root.querySelector('.sheet'); if (sh) sh.focus({ preventScroll: true }); }
}
let lastFocus = null;
// Al cerrar el panel, el foco vuelve a lo que lo abrió (o a su igual, si la lista se redibujó mientras tanto).
function restoreFocus() {
  let el = lastFocus;
  lastFocus = null;
  if (!el || !wide()) return;
  if (!el.isConnected && el.dataset && el.dataset.act) el = $(`[data-act="${CSS.escape(el.dataset.act)}"]${el.dataset.id ? `[data-id="${CSS.escape(el.dataset.id)}"]` : ''}`);
  if (el && el.isConnected) { try { el.focus({ preventScroll: true }); } catch (e) { /* nada */ } }
}
function closeSheet() { const root = $('#sheet-root'); const had = !!S.sheet; root.hidden = true; root.innerHTML = ''; S.sheet = null; S.ready = null; lockBody(); if (had) restoreFocus(); else lastFocus = null; if (S.updateReg) setTimeout(tryAutoUpdate, 300); }
function lockBody() { document.body.classList.toggle('locked', !!S.sheet || !$('#viewer').hidden); }
const sheetHead = (title) => `<div class="sheet-h"><h2>${title}</h2><button type="button" class="icon-btn plain" data-act="sheet-close" aria-label="Cerrar">${ICON.close}</button></div>`;

function invSig(i, D) { return JSON.stringify([(i.moreOrders || []).join(','), i.payMode, i.termsCheck, i.paidBy, i.payMethod, i.paidDate, i.orderId, i.orderAuto, i.noOrder, i.order && i.order.status, i.ncfExpiry, i.supplier, i.number, i.rnc, i.date, i.amount, i.itbis, i.currency, i.concept, i.ref, i.projectId, i.projectHint, i.ai, i.notInvoice, i.pay && i.pay.id, i.pay && i.pay.status, i.dup, i.fiscal, i.xmlId, i.fileId, i.origFileId, i.abonado, i.envio && [i.envio.id, i.envio.date, i.envio.number], i.pages, (i.extraPages || []).length, i.buyerRnc, i.condOverOk, i.condRefsOk, i.qtyOk, i.estOk, i.due, i.sup && [i.sup.id, i.sup.name, i.sup.creditDays, i.sup.bank, i.sup.account], orderEst(i.order), (i.conduceRefs || []).join(), (i.order && i.order.items || []).length, (i.conduces || []).map((c) => [c.id, c.number, c.date, c.total, c.material, c.qty, c.ai, c.auto, c.dup]), D ? D.conduces.filter((c) => !c.invoiceId).map((c) => c.id + c.ai).join() : '']); }
// En la computadora: el documento grande a la izquierda y los datos a la derecha, para revisarlos sin abrir y cerrar.
const revCache = { key: '', node: null };
function mountReviewDoc(i) {
  const sheet = $('#sheet-root .sheet'), form = $('#inv-form');
  if (!sheet || !form) return;
  const files = [{ fileId: i.fileId, fileType: i.fileType }, ...(i.extraPages || [])].filter((f) => f.fileId && f.fileType !== 'application/xml');
  if (!files.length) return;
  sheet.classList.add('review');
  const key = i.id + '|' + files.map((f) => f.fileId).join(',');
  let node = revCache.key === key ? revCache.node : null;
  if (!node) {
    node = document.createElement('div');
    node.className = 'rev-doc';
    node.innerHTML = files.map((f, n) => (f.fileType === 'application/pdf' ? `<div class="rev-pdf" data-n="${n}"><p class="viewer-msg">Abriendo…</p></div>` : `<img src="${esc(assetUrl(f.fileId))}" alt="Página ${n + 1} de la factura">`)).join('');
    revCache.key = key;
    revCache.node = node;
    renderRevPdfs(node, files).catch((e) => console.warn(e));
  }
  form.prepend(node);
}
async function renderRevPdfs(node, files) {
  for (let n = 0; n < files.length; n++) {
    if (files[n].fileType !== 'application/pdf') continue;
    const box = node.querySelector(`.rev-pdf[data-n="${n}"]`);
    try {
      const doc = await openPdf(await (await getBlob(files[n].fileId)).arrayBuffer());
      box.innerHTML = '';
      for (let p = 1; p <= doc.numPages; p++) { const c = await renderPdfCanvas(doc, p, 1100); c.className = 'rev-page'; box.appendChild(c); }
    } catch (e) { console.warn(e); box.innerHTML = '<p class="viewer-msg">No se pudo abrir el PDF.</p>'; }
  }
}
/* ---------- historial de cada factura ---------- */
// Quién cambió qué y cuándo. Se guarda en la misma factura (los últimos 40 cambios).
const HIST_FIELDS = [['supplier', 'Proveedor'], ['rnc', 'RNC'], ['number', 'NCF'], ['date', 'Fecha'], ['amount', 'Monto'], ['itbis', 'ITBIS'], ['currency', 'Moneda'], ['projectId', 'Proyecto'], ['orderId', 'Orden'], ['concept', 'Concepto'], ['ref', 'Referencia']];
const whoAmI = () => [RT.sync.status().email || (S.settings && S.settings.preparedBy) || '', wide() ? 'computadora' : 'teléfono'].filter(Boolean).join(' · ');
function histEntry(what, ch) { return { at: new Date().toISOString(), by: whoAmI(), what, ...(ch && Object.keys(ch).length ? { ch } : {}) }; }
const histAdd = (doc, e) => [...((doc && doc.hist) || []), e].slice(-40);
function histDiff(before, after) {
  const ch = {};
  for (const [k] of HIST_FIELDS) {
    if (!(k in after)) continue;
    const a = before[k] ?? null, b = after[k] ?? null;
    if (String(a ?? '') !== String(b ?? '')) ch[k] = [a, b];
  }
  return ch;
}
function histVal(k, v, D) {
  if (v === null || v === undefined || v === '') return '(vacío)';
  if (k === 'amount' || k === 'itbis') return isNum(v) ? money(v) : String(v);
  if (k === 'date') return fmtDate(v) || String(v);
  if (k === 'projectId') { const p = D.projById.get(v); return p ? p.name : 'otro proyecto'; }
  if (k === 'orderId') { const o = D.orderById.get(v); return o ? orderNo(o) : 'otra orden'; }
  if (k === 'number') return RD.normNcf(v);
  return String(v);
}
function histHTML(i, D) {
  const ev = [];
  if (i.createdAt) ev.push({ at: i.createdAt, what: 'Agregada a la app' });
  for (const e of i.hist || []) ev.push(e);
  if (i.envio) ev.push({ at: i.envio.createdAt || i.envio.date, what: `Mandada a la digitadora (envío ${i.envio.number || ''})`, by: i.envio.to ? 'a ' + i.envio.to : '' });
  if (i.pay) {
    if (i.pay.createdAt) ev.push({ at: i.pay.createdAt, what: `En el pago «${i.pay.name || 'Pago'}»` });
    if (i.pay.presentedAt) ev.push({ at: i.pay.presentedAt + 'T12:00:00', what: 'Pago presentado', day: true });
    if (i.pay.approvedAt) ev.push({ at: i.pay.approvedAt, what: 'Pago aprobado por el dueño', by: i.pay.approvedBy || '' });
    if (i.pay.paidAt) ev.push({ at: i.pay.paidAt + 'T12:00:00', what: 'Pagada', day: true });
  }
  for (const a of i.abonos || []) ev.push({ at: (a.date || '') + 'T12:00:00', what: `Abono de ${money(a.amount, i.currency)}${a.note ? ' (' + a.note + ')' : ''}`, day: true });
  ev.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const when = (e) => { const d = new Date(e.at); return isNaN(d) ? '' : e.day ? fmtDate(String(e.at).slice(0, 10)) : `${fmtDate(String(e.at).slice(0, 10))} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  const rows = ev.map((e) => `<li><span class="h-when">${esc(when(e))}</span><span class="h-what"><b>${esc(e.what)}</b>${e.by ? ` <small>${esc(e.by)}</small>` : ''}${e.ch ? `<small class="h-ch">${Object.entries(e.ch).map(([k, [a, b]]) => `${esc((HIST_FIELDS.find((f) => f[0] === k) || [k, k])[1])}: ${esc(histVal(k, a, D))} → ${esc(histVal(k, b, D))}`).join('<br>')}</small>` : ''}</span></li>`).join('');
  return `<details class="edit hist" id="inv-hist"><summary>Historial (${ev.length})</summary><ul class="hist-list">${rows}</ul></details>`;
}

/* ---------- candado con PIN (en este aparato) ---------- */
const PIN_KEY = 'facturas.pin', LOCK_AFTER = 5 * 60000;
const pinConf = () => { try { const j = JSON.parse(lsGet(PIN_KEY) || 'null'); return j && j.salt && j.hash ? j : null; } catch (e) { return null; } };
async function pinHash(salt, pin) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + ':' + pin));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
async function setPin(pin) {
  const salt = [...crypto.getRandomValues(new Uint8Array(12))].map((b) => b.toString(16).padStart(2, '0')).join('');
  lsSet(PIN_KEY, JSON.stringify({ salt, hash: await pinHash(salt, pin), at: new Date().toISOString() }));
}
let pinFails = 0, pinWaitUntil = 0, hiddenAt = 0;
function showLock() {
  if (!pinConf()) return;
  const el = $('#lock');
  el.hidden = false;
  document.body.classList.add('pin-locked');
  const cloud = RT.sync.status().on;
  el.innerHTML = `<form class="lock-box" id="lock-form" autocomplete="off"><div class="lock-ic">${ICON.lock}</div><h2>Facturas de proyectos</h2><p>Escribe tu PIN para entrar.</p><input id="lock-pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="off" aria-label="PIN"><p class="lock-msg" id="lock-msg" role="alert"></p><button type="submit" class="btn primary block">Entrar</button><button type="button" class="link" data-act="pin-forgot">Olvidé el PIN</button><div id="lock-forgot" hidden>${cloud ? `<p class="hint">Entra con la contraseña de tu cuenta de la nube (${esc(RT.sync.status().email)}) y se quita el PIN.</p><input id="lock-pass" type="password" autocomplete="current-password" aria-label="Contraseña de la nube"><button type="button" class="btn block" data-act="pin-reset">Quitar el PIN con la contraseña</button>` : '<p class="hint">Sin la nube, para entrar sin el PIN hay que borrar los datos de esta app en el navegador (Configuración del sitio → Eliminar datos) y después restaurar un respaldo.</p>'}</div></form>`;
  setTimeout(() => { const i = $('#lock-pin'); if (i) i.focus(); }, 50);
}
function hideLock() { const el = $('#lock'); el.hidden = true; el.innerHTML = ''; document.body.classList.remove('pin-locked'); }
async function tryUnlock() {
  const conf = pinConf();
  const msg = $('#lock-msg');
  if (!conf) { hideLock(); return; }
  if (Date.now() < pinWaitUntil) { msg.textContent = `Demasiados intentos. Espera ${Math.ceil((pinWaitUntil - Date.now()) / 1000)} segundos.`; return; }
  const pin = $('#lock-pin').value.trim();
  if (pin && (await pinHash(conf.salt, pin)) === conf.hash) { pinFails = 0; hideLock(); return; }
  pinFails++;
  if (pinFails >= 5) { pinWaitUntil = Date.now() + 30000; pinFails = 0; }
  msg.textContent = pinWaitUntil > Date.now() ? 'Demasiados intentos. Espera 30 segundos.' : 'PIN equivocado.';
  $('#lock-pin').value = '';
  $('#lock-form').classList.remove('shake'); void $('#lock-form').offsetWidth; $('#lock-form').classList.add('shake');
}
function openPinSheet() {
  const has = !!pinConf();
  openSheet(`<form id="pin-form" autocomplete="off">${sheetHead(has ? 'Cambiar el PIN' : 'Poner un PIN')}<div class="sheet-b">
    <p class="hint">Al abrir la app (y después de 5 minutos sin usarla) se pide el PIN. Es solo para este ${wide() ? 'aparato' : 'teléfono'}: cada uno tiene el suyo. Evita que alguien con tu teléfono o tu computadora abiertos vea o cambie tus facturas.</p>
    <div class="fields"><div class="field"><label for="pin-a">PIN nuevo (4 a 8 números)</label><input id="pin-a" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="new-password"></div><div class="field"><label for="pin-b">Repítelo</label><input id="pin-b" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="new-password"></div></div>
    <p class="usage" id="pin-msg"></p>
  </div><div class="sheet-f"><button type="submit" class="btn primary">${has ? 'Cambiar el PIN' : 'Poner el PIN'}</button>${has ? '<button type="button" class="btn danger" data-act="pin-off">Quitar el PIN</button>' : ''}</div></form>`, { type: 'pin' });
}
function initPinLock() {
  if (pinConf()) showLock();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') hiddenAt = Date.now();
    else if (hiddenAt && Date.now() - hiddenAt > LOCK_AFTER && pinConf()) showLock();
  });
}

/* ---------- aprobación del dueño ---------- */
const approvalOn = () => { const g = S.settings || {}; return !!g.needApproval && !!String(g.ownerEmail || '').trim(); };
const amOwner = () => { const me = String(RT.sync.status().email || '').toLowerCase(); return approvalOn() && !!me && me === String(S.settings.ownerEmail).trim().toLowerCase(); };

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
  if (ncf.ok && (ncf.code === '04' || ncf.code === '34')) msgs.push(`<div class="msg ok">${ICON.check}<span>Es una <b>nota de crédito</b>: su monto resta del total del pago y de lo que se le paga al proveedor.</span></div>`);
  if (ncfExpired(i)) msgs.push(`<div class="msg warn">${ICON.alert}<span>El NCF venció el ${esc(fmtDate(i.ncfExpiry))} y la factura es del ${esc(fmtDate(i.date))}: no sirve para crédito fiscal. Pide al proveedor que la reemita.</span></div>`);
  if (i.number && !ncf.ok) msgs.push(`<div class="msg warn">${ICON.alert}<span>El NCF no tiene el formato correcto: debe ser B + 10 dígitos (ej. B0100004521) o, si es electrónica, E + 12 dígitos (ej. E310000000123).</span></div>`);
  if (rnc.kind === 'rnc' && rnc.checkOk === false) msgs.push(`<div class="msg warn">${ICON.alert}<span>El dígito verificador del RNC no cuadra. Revisa que esté bien escrito.</span></div>`);
  if (i.buyerRnc && D.companyRnc && RD.normRnc(i.buyerRnc) !== D.companyRnc) msgs.push(`<div class="msg warn">${ICON.alert}<span>Esta factura está a nombre del RNC ${esc(RD.fmtRnc(i.buyerRnc))}, no del de tu empresa (${esc(RD.fmtRnc(D.companyRnc))}).</span></div>`);
  if (i.notInvoice) msgs.push(`<div class="msg warn">${ICON.alert}<span>Este archivo no parece una factura. Revísalo antes de meterlo a un pago.</span></div>`);
  if (i.dup) msgs.push(`<div class="msg warn">${ICON.alert}<span>Puede estar repetida: hay otra factura del mismo proveedor con el mismo NCF.</span></div>`);
  if (i.projectHint && !i.project && edit) msgs.push(`<div class="msg hint"><span>La factura dice que es del proyecto <b>${esc(i.projectHint)}</b>, que no está en tu lista.</span><button type="button" class="link" data-act="hint-create" data-id="${esc(i.id)}">Crear “${esc(i.projectHint)}” y asignarla</button></div>`);
  if (edit && !i.number && !i.fiscal && !i.pay && i.ai !== 'pending' && !(i.conduces || []).length) msgs.push(`<div class="msg"><span>¿Este archivo no es una factura sino un conduce (la nota de entrega del material) o la otra página de una factura? <button type="button" class="link" data-act="inv-to-cond" data-id="${esc(i.id)}">Es un conduce</button> <button type="button" class="link" data-act="inv-to-page" data-id="${esc(i.id)}">Es otra página</button></span></div>`);
  if (i.xmlId && i.fileType !== 'application/xml') msgs.push(`<div class="msg">${ICON.check}<span>También tiene su XML de factura electrónica. <button type="button" class="link" data-act="xml-view" data-id="${esc(i.id)}">Ver XML</button></span></div>`);
  const where = i.pay
    ? `<span class="pill ${i.status}">${INV_LABEL[i.status]}</span><span>En <button type="button" class="link" data-act="open-pay" data-id="${esc(i.pay.id)}">${esc(i.pay.name || 'Pago')}</button></span>`
    : '<span class="pill pendiente">Pendiente</span><span>Todavía no está en ningún pago.</span>';
  const opts = D.projects.map((p) => `<option value="${esc(p.id)}"${p.id === i.projectId ? ' selected' : ''}>${esc(p.name)}</option>`).join('');
  const ordList = D.orders.filter((o) => o.status !== 'anulada' || o.id === i.orderId).sort((a, b) => (b.projectId === i.projectId) - (a.projectId === i.projectId) || sameName(b.supplier, i.supplier) - sameName(a.supplier, i.supplier) || (Number(b.number) || 0) - (Number(a.number) || 0));
  const orderOpts = ordList.map((o) => `<option value="${esc(o.id)}"${o.id === i.orderId ? ' selected' : ''}>${esc(orderOptLabel(o) + (sameName(o.supplier, i.supplier) || !o.supplier ? '' : ' · ' + o.supplier))}</option>`).join('');
  const cand = !i.order && !i.noOrder && edit ? orderCandidates(i, D) : [];
  const noOrdBtn = edit ? ` <button type="button" class="link" data-act="no-order" data-id="${esc(i.id)}">No lleva orden</button>` : '';
  if (cand.length) msgs.push(`<div class="msg hint"><span>Hay ${cand.length === 1 ? 'una orden' : 'órdenes'} de este proveedor${i.projectId ? ' para esta obra' : ''}.</span>${cand.slice(0, 3).map((o) => `<button type="button" class="link" data-act="link-order" data-id="${esc(i.id)}" data-order="${esc(o.id)}">Asignar ${esc(orderNo(o))}${!i.projectId && o.project ? ' (' + esc(o.project.name) + ')' : ''}</button>`).join(' ')}${needsOrder(i, D) ? noOrdBtn : ''}</div>`);
  else if (needsOrder(i, D)) msgs.push(`<div class="msg warn">${ICON.alert}<span>Esta factura no tiene orden de compra. Debe presentarse con su orden firmada y sellada.${noOrdBtn}</span></div>`);
  if (i.order && i.orderAuto) msgs.push(`<div class="msg hint"><span>Se enlazó sola a la orden <b>${esc(orderNo(i.order))}</b>: es la única abierta de este proveedor. Si no es, cámbiala en «Orden de compra».</span></div>`);
  if (!i.order && i.noOrder) msgs.push(`<div class="msg"><span>Marcada como factura que no lleva orden de compra.${edit ? ` <button type="button" class="link" data-act="no-order-undo" data-id="${esc(i.id)}">Deshacer</button>` : ''}</span></div>`);
  for (const o of (i.orders || []).filter((x) => x.status !== 'autorizada')) msgs.push(`<div class="msg warn">${ICON.alert}<span>La orden ${esc(orderNo(o))} todavía no tiene la copia firmada y sellada.</span></div>`);
  msgs.push(crossMsgsHTML(i, D, edit));
  if (i.termsCheck && !i.payMode && !i.pay) msgs.push(`<div class="msg warn">${ICON.alert}<span>La factura dice que es <b>de contado</b>. ¿Ya se pagó?</span>${edit ? `<span class="acts"><button type="button" class="btn sm primary" data-act="pm-yes" data-id="${esc(i.id)}">Sí, ya se pagó</button><button type="button" class="btn sm" data-act="pm-reponer" data-id="${esc(i.id)}">Hay que reponérselo a quien pagó</button><button type="button" class="btn sm ghost" data-act="pm-no" data-id="${esc(i.id)}">No, va en un pago</button></span>` : ''}</div>`);
  else if (i.payMode && !i.pay) msgs.push(`<div class="msg${i.payMode === 'reponer' ? '' : ' ok'}">${i.payMode === 'reponer' ? '' : ICON.check}<span>${esc(payText(i))}.${i.payMode === 'reponer' ? ' Va en un pago como reposición a esa persona.' : ''}</span></div>`);
  if (i.envio) msgs.push(`<div class="msg">${ICON.check}<span>Se le mandó a la digitadora el ${esc(fmtDate(i.envio.date))}, ${esc(ENVIO_LABEL[i.envio.method] || '')}${i.envio.to ? ', a ' + esc(i.envio.to) : ''}. <button type="button" class="link" data-act="envio-view" data-id="${esc(i.envio.id)}">Ver envío ${esc(String(i.envio.number || ''))}</button>${edit ? ` <button type="button" class="link" data-act="digi-undo-one" data-id="${esc(i.id)}">No se la mandé</button>` : ''}</span></div>`);
  else if (!i.notInvoice) msgs.push(`<div class="msg"><span>Todavía no se la has mandado a la digitadora.${edit ? ` <button type="button" class="link" data-act="digi-open">Mandar</button> <button type="button" class="link" data-act="digi-one" data-id="${esc(i.id)}">Ya se la mandé</button>` : ''}</span></div>`);
  if (i.sup) {
    const di = dueInfo(i);
    const cred = isNum(i.sup.creditDays) && i.sup.creditDays > 0 ? `crédito de ${i.sup.creditDays} días${i.due ? ', vence el ' + esc(fmtDate(i.due)) : ''}` : 'de contado';
    msgs.push(`<div class="msg${di && di.overdue ? ' warn' : ''}"><span><b>${esc(i.sup.name)}</b>: ${cred}${di && di.overdue ? ` (${esc(dueText(di).toLowerCase())})` : ''}${i.sup.bank || i.sup.account ? ' · ' + esc([i.sup.bank, i.sup.account].filter(Boolean).join(' ')) : ''}. <button type="button" class="link" data-act="sup-open" data-id="${esc(i.sup.id)}">Ver ficha</button></span></div>`);
  } else if (edit && i.supplier && D.invoices.filter((x) => x.id !== i.id && sameName(x.supplier, i.supplier)).length) {
    msgs.push(`<div class="msg"><span>¿Este proveedor te da crédito o le pagas por transferencia? <button type="button" class="link" data-act="sup-new" data-name="${esc(i.supplier)}" data-rnc="${esc(RD.normRnc(i.rnc))}">Crear su ficha</button></span></div>`);
  }
  const t18 = edit && isNum(i.amount) && i.amount > 0 && !isNum(i.itbis) && (!ncf.ok || ['01', '02', '31', '32'].includes(ncf.code)) ? round2((i.amount * 18) / 118) : null;
  if (t18) msgs.push(`<div class="msg hint"><span>Si todo lleva ITBIS de 18 %, el ITBIS de esta factura es <b>${esc(money(t18, i.currency))}</b>.</span><button type="button" class="link" data-act="itbis18" data-id="${esc(i.id)}" data-v="${t18}">Usar ese ITBIS</button></div>`);
  const cur = normCur(i.currency);
  const histBox = histHTML(i, D);
  const delBtn = edit && i.status !== 'pagada' ? `<div><button type="button" class="btn danger sm" data-act="inv-del">${ICON.trash} Eliminar factura</button></div>` : '';
  const html = `<form id="inv-form" data-id="${esc(i.id)}" autocomplete="off">${sheetHead('Factura')}
    <div class="sheet-b">
      ${preview}
      ${pagesLineHTML(i, edit)}
      <div class="status-line">${where}</div>
      ${msgs.join('')}
      <div class="fields">
        <div class="field full"><label for="f-proj">Proyecto</label><select id="f-proj" ${dis}><option value="">Sin proyecto</option>${opts}${edit ? '<option value="__new">+ Proyecto nuevo…</option>' : ''}</select></div>
        <div class="field full" id="f-newproj-wrap" hidden><label for="f-newproj">Nombre del proyecto nuevo</label><input id="f-newproj" maxlength="80" placeholder="Ej. Torre Piantini" value="${esc(i.projectHint || '')}"></div>
        <div class="field full"><label for="f-sup">Proveedor</label><input id="f-sup" maxlength="120" value="${esc(i.supplier || '')}" ${dis}></div>
        <div class="field"><label for="f-rnc">RNC o cédula</label><input id="f-rnc" class="mono" inputmode="numeric" maxlength="15" value="${esc(RD.normRnc(i.rnc))}" ${dis}><small class="help" id="f-rnc-help">${esc(rnc.ok ? (rnc.kind === 'rnc' ? 'RNC ' : 'Cédula ') + RD.fmtRnc(rnc.value) : '9 dígitos (RNC) u 11 (cédula)')}</small></div>
        <div class="field"><label for="f-num">NCF o e-NCF</label><input id="f-num" class="mono" maxlength="20" autocapitalize="characters" value="${esc(RD.normNcf(i.number))}" ${dis}><small class="help" id="f-num-help">${esc(ncf.ok ? ncf.label + (i.ncfExpiry ? ' · válido hasta ' + fmtDmy(i.ncfExpiry) : '') : 'Ej. B0100004521 o E310000000123')}</small></div>
        <div class="field"><label for="f-date">Fecha</label><input id="f-date" type="date" value="${esc(i.date || '')}" ${dis}></div>
        <div class="field"><label for="f-cur">Moneda</label><select id="f-cur" ${dis}><option value="DOP"${cur === 'DOP' ? ' selected' : ''}>RD$ pesos</option><option value="USD"${cur === 'USD' ? ' selected' : ''}>US$ dólares</option><option value="EUR"${cur === 'EUR' ? ' selected' : ''}>€ euros</option></select></div>
        <div class="field"><label for="f-itbis">ITBIS</label><input id="f-itbis" class="mono" inputmode="decimal" maxlength="20" placeholder="0.00" value="${esc(amountInput(i.itbis))}" ${dis}></div>
        <div class="field"><label for="f-amt">Total a pagar</label><input id="f-amt" class="mono" inputmode="decimal" maxlength="20" placeholder="0.00" value="${esc(amountInput(i.amount))}" ${dis}></div>
        <div class="field full"><label for="f-con">Concepto</label><textarea id="f-con" maxlength="140" rows="2" ${dis}>${esc(i.concept || '')}</textarea></div>
        <div class="field full"><label for="f-order">Orden de compra</label><select id="f-order" ${dis}><option value="">Sin orden</option>${orderOpts}</select>${i.order ? `<button type="button" class="link" data-act="open-order" data-id="${esc(i.order.id)}">Abrir ${esc(orderNo(i.order))}</button>` : ''}</div>
        <div class="field full" id="f-order-prev"${i.order ? '' : ' hidden'}>${i.order ? orderPreviewHTML(i.order, D, i.id) : ''}</div>
        ${moreOrdersHTML(i, D, edit)}
        <div class="field full"><label for="f-ref">Otra referencia (cubicación, contrato)</label><input id="f-ref" maxlength="60" placeholder="Opcional" value="${esc(i.ref || '')}" ${dis}></div>
        <div class="field full"><label for="f-paymode">Cómo se paga</label><select id="f-paymode" ${dis}>${Object.entries(PAY_MODE_LABEL).map(([k, l]) => `<option value="${k}"${(i.payMode || '') === k ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
        <div class="field" id="f-pm-how"${i.payMode ? '' : ' hidden'}><label for="f-paymethod">Cómo se pagó</label><select id="f-paymethod" ${dis}><option value="">—</option>${PAY_METHODS.map((m) => `<option${i.payMethod === m ? ' selected' : ''}>${m}</option>`).join('')}</select></div>
        <div class="field" id="f-pm-when"${i.payMode ? '' : ' hidden'}><label for="f-paiddate">Se pagó el</label><input id="f-paiddate" type="date" value="${esc(i.paidDate || i.date || todayISO())}" ${dis}></div>
        <div class="field full" id="f-pm-who"${i.payMode ? '' : ' hidden'}><label for="f-paidby">${i.payMode === 'reponer' ? 'A quién hay que reponérselo' : 'Quién lo pagó'}</label><input id="f-paidby" maxlength="60" list="dl-paidby" placeholder="Ej. caja chica, Ing. Pérez" value="${esc(i.paidBy || '')}" ${dis}><datalist id="dl-paidby">${uniqList(S.invoices.map((x) => x.paidBy)).map((v) => `<option value="${esc(v)}"></option>`).join('')}</datalist></div>
      </div>
      ${invCondBoxHTML(i, D, edit)}
      ${tachHTML(i, edit)}
      ${abonosHTML(i, edit)}
      ${histBox}
      ${delBtn}
      <div id="inv-del-box" hidden><div class="confirm"><p>¿Eliminar esta factura? Se va a la papelera (ahí se puede recuperar por 30 días) y se quita del pago donde esté.${(i.conduces || []).length ? ' Sus conduces quedan guardados, esperando factura.' : ''}</p><div class="actions"><button type="button" class="btn danger solid" data-act="inv-del-yes" data-id="${esc(i.id)}">Eliminar factura</button><button type="button" class="btn" data-act="inv-del-no">Cancelar</button></div></div></div>
    </div>
    ${edit ? '<div class="sheet-f"><button type="submit" class="btn primary block" id="inv-save">Guardar</button></div>' : ''}
  </form>`;
  const prevScroll = keepScroll && $('.sheet-b') ? $('.sheet-b').scrollTop : 0;
  openSheet(html, { type: 'inv', id: i.id, dirty: false, sig: invSig(i, D) });
  if (wide()) mountReviewDoc(i);
  if (keepScroll && $('.sheet-b')) $('.sheet-b').scrollTop = prevScroll;
}
function refreshInvoiceSheet(D) {
  const sh = S.sheet;
  if (!sh || sh.type !== 'inv' || sh.dirty) return;
  const i = D.invoices.find((x) => x.id === sh.id);
  if (!i) { if (S.got.invoices) closeSheet(); return; }
  if (invSig(i, D) !== sh.sig) openInvoice(i.id, true);
}
function liveHelp(t) {
  if (t.id === 'f-rnc') { const r = RD.rncInfo(t.value); $('#f-rnc-help').textContent = r.ok ? (r.kind === 'rnc' ? 'RNC ' : 'Cédula ') + RD.fmtRnc(r.value) + (r.checkOk === false ? ' · revisa el dígito verificador' : '') : '9 dígitos (RNC) u 11 (cédula)'; }
  if (t.id === 'f-num') { const n = RD.parseNcf(t.value); $('#f-num-help').textContent = n.ok ? n.label + (n.consumo ? ' · no sirve para crédito fiscal' : '') : 'Ej. B0100004521 o E310000000123'; }
}

/* ---------- hojas de los conduces ---------- */
const AUTO_WHY = { numero: 'la factura menciona su número', monto: 'es del mismo proveedor y el monto coincide', lote: 'es del mismo proveedor y se agregaron juntos', suma: 'es del mismo proveedor y, con los otros conduces de la factura, suma lo mismo que ella' };
function condThumbHTML(c) {
  const tid = c.thumbId || (String(c.fileType || '').startsWith('image/') ? c.fileId : null);
  return `<span class="thumb sm">${tid ? `<img src="${esc(assetUrl(tid))}" alt="" loading="lazy" decoding="async">` : `<span class="ph">${c.fileType === 'application/pdf' ? 'PDF' : 'FOTO'}</span>`}</span>`;
}
function condRowHTML(c, withSupplier, more = '') {
  const sub = [withSupplier ? c.supplier || '' : '', condMeta(c), more].filter(Boolean).join(' · ');
  const right = c.ai === 'pending' ? '<span class="pill reading">Leyendo…</span>' : isNum(c.total) ? `<span class="num">${esc(money(c.total, c.currency))}</span>` : '';
  return `<button type="button" class="cond-row" data-act="open-cond" data-id="${esc(c.id)}">${condThumbHTML(c)}<span class="cond-mid"><b>${esc(condTitle(c))}</b><small>${esc(sub || 'Sin datos todavía')}</small></span>${c.dup ? '<span class="pill warn">¿Repetido?</span>' : ''}${right}</button>`;
}
// Varios conduces esperando que pueden ser de esta factura: se marcan los que son y se adjuntan de una vez.
function condPickHTML(i, sugg) {
  const amt = isNum(i.amount) ? i.amount : '', sub = isNum(i.amount) && isNum(i.itbis) && i.itbis > 0 ? round2(i.amount - i.itbis) : '';
  return `<div class="msg hint cpick" id="cpick" data-amt="${amt}" data-sub="${sub}" data-cur="${esc(normCur(i.currency))}">
    <span>Hay ${sugg.length} conduces esperando factura que pueden ser de esta. Marca los que son y toca <b>Adjuntar</b>:</span>
    ${sugg.length > 2 ? `<label class="check-row"><input type="checkbox" data-cpick="all"><span>Todos (${sugg.length})</span></label>` : ''}
    <div class="cpick-list">${sugg.map((c) => `<label class="check-row"><input type="checkbox" data-cpick="c" value="${esc(c.id)}" data-total="${isNum(c.total) ? c.total : ''}"><span>${esc(condTitle(c))}${c.supplier ? ' · ' + esc(c.supplier) : ''}<small>${esc([condMeta(c), isNum(c.total) ? money(c.total, c.currency) : ''].filter(Boolean).join(' · '))}</small></span></label>`).join('')}</div>
    <div class="cpick-foot"><span id="cpick-sum">${condPickSumText(0, 0, amt === '' ? null : amt, normCur(i.currency), false)}</span><button type="button" class="btn sm primary" data-act="cond-link-many" data-inv="${esc(i.id)}" disabled>Adjuntar</button></div>
  </div>`;
}
function condPickSumText(n, sum, amt, cur, match) {
  const fac = isNum(amt) ? ` · la factura: ${esc(money(amt, cur))}` : '';
  return n ? `${plural(n, 'marcado', 'marcados')}: <b>${esc(money(sum, cur))}</b>${match ? ' · suman lo mismo que la factura' : fac}` : `Ninguno marcado${fac}`;
}
function syncCondPick() {
  const box = $('#cpick');
  if (!box) return;
  const boxes = $$('#cpick input[data-cpick="c"]');
  const on = boxes.filter((b) => b.checked);
  const all = box.querySelector('input[data-cpick="all"]');
  if (all) { all.checked = on.length === boxes.length; all.indeterminate = on.length > 0 && on.length < boxes.length; }
  const sum = round2(on.reduce((t, b) => t + (Number(b.dataset.total) || 0), 0));
  const amt = box.dataset.amt === '' ? null : Number(box.dataset.amt), sub = box.dataset.sub === '' ? null : Number(box.dataset.sub);
  const match = on.length > 0 && [amt, sub].some((t) => isNum(t) && Math.abs(t - sum) < 0.005);
  $('#cpick-sum').innerHTML = condPickSumText(on.length, sum, amt, box.dataset.cur, match);
  const go = box.querySelector('[data-act="cond-link-many"]');
  if (go) { go.disabled = !on.length; go.textContent = on.length > 1 ? `Adjuntar ${on.length}` : 'Adjuntar'; }
}
// Mensajes de los conduces que se adjuntaron solos; los que se adjuntaron por la suma van en uno solo.
function condAutoMsgs(list) {
  const auto = list.filter((c) => c.auto);
  const bySum = auto.filter((c) => c.autoWhy === 'suma');
  const out = auto.filter((c) => c.autoWhy !== 'suma').map((c) => `<div class="msg hint"><span>El ${esc(condTitle(c).toLowerCase())} se adjuntó solo: ${esc(AUTO_WHY[c.autoWhy] || 'es del mismo proveedor')}. Si no es de esta factura, ábrelo y cámbialo.</span></div>`);
  if (bySum.length) out.push(`<div class="msg hint"><span>${bySum.length === 1 ? `El ${esc(condTitle(bySum[0]).toLowerCase())} se adjuntó solo` : `Los ${bySum.length} conduces se adjuntaron solos`}: son de este proveedor y suman lo mismo que la factura. Si alguno no es de esta factura, ábrelo y cámbialo.</span></div>`);
  return out.join('');
}
function invCondBoxHTML(i, D, edit) {
  const list = i.conduces || [];
  if (!list.length && !edit) return '';
  const sugg = edit ? condSuggestions(i, D) : [];
  const total = list.length > 1 && list.every((c) => isNum(c.total)) ? round2(list.reduce((t, c) => t + c.total, 0)) : null;
  return `<div class="card" id="inv-conds"><h2>Conduces</h2>
    ${list.length ? `<div class="cond-list">${list.map((c) => condRowHTML(c, false)).join('')}</div>` : '<p class="hint">Si la factura vino con conduces (la nota de entrega del material), agrégalos aquí. En el PDF del pago van detrás de la factura.</p>'}
    ${isNum(total) ? `<p class="usage">Los ${list.length} conduces suman ${esc(money(total, list[0].currency))}.</p>` : ''}
    ${condAutoMsgs(list)}
    ${sugg.length > 1 ? condPickHTML(i, sugg) : ''}
    ${sugg.length === 1 ? `<div class="msg hint"><span>Hay un conduce esperando factura que puede ser de esta:</span>${sugg.map((c) => `<button type="button" class="link" data-act="cond-link" data-id="${esc(c.id)}" data-inv="${esc(i.id)}">Adjuntar ${esc(c.number ? 'el ' + c.number : 'el conduce')}${isNum(c.total) ? ' (' + esc(money(c.total, c.currency)) + ')' : ''}</button>`).join(' ')}</div>` : ''}
    ${edit ? `<div><button type="button" class="btn sm" data-act="cond-add" data-inv="${esc(i.id)}">${ICON.plus} Agregar conduce</button></div>` : ''}
  </div>`;
}
// Con cambios sin guardar en la factura, solo se redibuja la tarjeta de conduces.
function refreshInvCondBox(invId) {
  setTimeout(() => {
    const card = $('#inv-conds');
    if (!card || !S.sheet || S.sheet.type !== 'inv' || S.sheet.id !== invId || !S.sheet.dirty) return;
    const D = derive();
    const i = D.invoices.find((x) => x.id === invId);
    if (i) card.outerHTML = invCondBoxHTML(i, D, canEdit());
  }, 150);
}
function condSig(c) { return JSON.stringify([c.number, c.date, c.supplier, c.rnc, c.total, c.currency, c.material, c.qty, c.trips, c.invoiceId, c.projectId, c.projectHint, c.ai, c.auto, c.fileId, c.thumbId, c.dup]); }
function openConduce(id, keepScroll) {
  const D = derive();
  const c = D.conduces.find((x) => x.id === id);
  if (!c) return;
  const edit = canEdit();
  const dis = edit ? '' : 'disabled';
  const inv = c.invoiceId ? D.invoices.find((x) => x.id === c.invoiceId) : null;
  const tid = c.thumbId || (String(c.fileType || '').startsWith('image/') ? c.fileId : null);
  const kind = c.fileType === 'application/pdf' ? 'PDF' : 'Foto';
  const preview = `<button type="button" class="preview" data-act="cond-view" data-id="${esc(c.id)}" aria-label="Ver archivo completo">${tid ? `<img src="${esc(assetUrl(tid))}" alt="">` : `<span class="ph">${kind.toUpperCase()}</span>`}<span class="preview-tag">${kind === 'PDF' ? `PDF · ${plural(c.pages || 1, 'página', 'páginas')}` : kind} · Ver</span></button>`;
  const msgs = [];
  const aiLink = edit && c.ai !== 'pending' && ai.hasKey() ? ` <button type="button" class="link" data-act="cond-ai" data-id="${esc(c.id)}">${c.ai === 'done' ? 'Leer otra vez' : 'Leer automáticamente'}</button>` : '';
  if (c.ai === 'pending') msgs.push(`<div class="msg ok">${ICON.spark}<span>Leyendo el conduce… Los datos aparecen aquí en unos segundos.</span></div>`);
  else if (c.ai === 'done') msgs.push(`<div class="msg ok">${ICON.spark}<span>Datos leídos automáticamente. Revisa que estén bien.${aiLink}</span></div>`);
  else if (c.ai === 'failed') msgs.push(`<div class="msg warn">${ICON.alert}<span>No se pudo leer automáticamente. Llena los datos o intenta otra vez.${aiLink}</span></div>`);
  else if (aiLink) msgs.push(`<div class="msg">${ICON.spark}<span>¿Quieres que la app lea los datos de este conduce?${aiLink}</span></div>`);
  if (c.dup) msgs.push(`<div class="msg warn">${ICON.alert}<span>Hay otro conduce de este proveedor con el mismo número. Si es la misma foto dos veces, elimina uno para que no se pague doble.</span></div>`);
  if (inv && c.auto) msgs.push(`<div class="msg hint"><span>Se adjuntó solo a esta factura: ${esc(AUTO_WHY[c.autoWhy] || 'es del mismo proveedor')}. Si no es, elige otra en «Factura».</span></div>`);
  if (c.projectHint && !c.project) msgs.push(`<div class="msg hint"><span>El conduce dice que es del proyecto <b>${esc(c.projectHint)}</b>, que no está en tu lista.</span></div>`);
  const where = inv
    ? `<span class="pill cond">Conduce</span><span>De la factura <button type="button" class="link" data-act="open-inv" data-id="${esc(inv.id)}">${esc([inv.supplier || 'Factura', inv.number ? RD.normNcf(inv.number) : '', money(inv.amount, inv.currency)].filter(Boolean).join(' · '))}</button></span>`
    : '<span class="pill warn">Sin factura</span><span>Esperando su factura.</span>';
  const same = (i) => (condSameSup(c, i, D) ? 1 : 0);
  const invList = D.invoices.slice().sort((a, b) => (b.id === c.invoiceId) - (a.id === c.invoiceId) || (b.status !== 'pagada') - (a.status !== 'pagada') || same(b) - same(a) || String(b.date || b.createdAt || '').localeCompare(String(a.date || a.createdAt || ''))).slice(0, 300);
  const invOpts = invList.map((i) => `<option value="${esc(i.id)}"${i.id === c.invoiceId ? ' selected' : ''}>${esc([i.supplier || 'Factura sin datos', i.number ? RD.normNcf(i.number) : fmtDate(i.date), money(i.amount, i.currency), i.status === 'pagada' ? 'pagada' : ''].filter(Boolean).join(' · '))}</option>`).join('');
  const opts = D.projects.map((p) => `<option value="${esc(p.id)}"${p.id === c.projectId ? ' selected' : ''}>${esc(p.name)}</option>`).join('');
  const cur = normCur(c.currency);
  const html = `<form id="cond-form" data-id="${esc(c.id)}" autocomplete="off">${sheetHead(esc(condTitle(c)))}
    <div class="sheet-b">
      ${preview}
      <div class="status-line">${where}</div>
      ${msgs.join('')}
      <div class="fields">
        <div class="field full"><label for="c-inv">Factura</label><select id="c-inv" ${dis}><option value="">Sin factura (esperando)</option>${invOpts}</select></div>
        <div class="field"><label for="c-num">No. de conduce</label><input id="c-num" class="mono" maxlength="30" value="${esc(c.number || '')}" ${dis}></div>
        <div class="field"><label for="c-date">Fecha</label><input id="c-date" type="date" value="${esc(c.date || '')}" ${dis}></div>
        <div class="field full"><label for="c-sup">Proveedor</label><input id="c-sup" maxlength="120" list="dl-csups" value="${esc(c.supplier || '')}" ${dis}></div>
        <div class="field full"><label for="c-proj">Proyecto</label><select id="c-proj" ${dis}><option value="">Sin proyecto</option>${opts}</select></div>
        <div class="field"><label for="c-mat">Material</label><input id="c-mat" maxlength="60" placeholder="Ej. Grava" value="${esc(c.material || '')}" ${dis}></div>
        <div class="field"><label for="c-qty">Cantidad</label><input id="c-qty" maxlength="30" placeholder="Ej. 5 m³" value="${esc(c.qty || '')}" ${dis}></div>
        <div class="field"><label for="c-trips">Viajes</label><input id="c-trips" class="mono" inputmode="numeric" maxlength="4" value="${esc(isNum(c.trips) ? String(c.trips) : '')}" ${dis}></div>
        <div class="field"><label for="c-total">Total (${esc(CUR_PREFIX[cur] || cur)})</label><input id="c-total" class="mono" inputmode="decimal" maxlength="20" placeholder="0.00" value="${esc(amountInput(c.total))}" ${dis}></div>
      </div>
      ${edit ? `<div><button type="button" class="btn danger sm" data-act="cond-del">${ICON.trash} Eliminar conduce</button></div><div id="cond-del-box" hidden><div class="confirm"><p>¿Eliminar este conduce? Se va a la papelera, con su foto o PDF, y ahí se puede recuperar por 30 días.</p><div class="actions"><button type="button" class="btn danger solid" data-act="cond-del-yes" data-id="${esc(c.id)}">Eliminar conduce</button><button type="button" class="btn" data-act="cond-del-no">Cancelar</button></div></div></div>` : ''}
    </div>
    ${edit ? '<div class="sheet-f"><button type="submit" class="btn primary block" id="cond-save">Guardar</button></div>' : ''}
  </form><datalist id="dl-csups">${uniqList([...S.conduces.map((x) => x.supplier), ...S.invoices.map((x) => x.supplier)]).slice(0, 300).map((v) => `<option value="${esc(v)}"></option>`).join('')}</datalist>`;
  const prevScroll = keepScroll && $('.sheet-b') ? $('.sheet-b').scrollTop : 0;
  openSheet(html, { type: 'cond', id: c.id, dirty: false, sig: condSig(c) });
  if (keepScroll && $('.sheet-b')) $('.sheet-b').scrollTop = prevScroll;
}
function refreshCondSheet(D) {
  const sh = S.sheet;
  if (!sh) return;
  if (sh.type !== 'cond' || sh.dirty) return;
  const c = D.conduces.find((x) => x.id === sh.id);
  if (!c) { if (S.got.conduces) closeSheet(); return; }
  if (condSig(c) !== sh.sig) openConduce(c.id, true);
}

function openPicker(mode, preselect) {
  const D = derive();
  const pending = D.invoices.filter((i) => i.status === 'pendiente').sort(sortByDateDesc);
  const pre = new Set(preselect || []);
  const groups = groupByProject(pending, D);
  const isNew = mode === 'new';
  const body = pending.length
    ? groups.map((g, k) => `<div class="pick-group"><label class="pick-row head"><input type="checkbox" data-pick="group" data-g="${k}"><span class="pr-name"><span>${esc(g.name)}</span><small>${plural(g.items.length, 'pendiente', 'pendientes')}</small></span><span class="num">${esc(totalStr(g.items))}</span></label>${g.items.map((i) => `<label class="pick-row"><input type="checkbox" data-pick="inv" data-g="${k}" value="${esc(i.id)}" data-amt="${isNum(i.toPay) ? i.toPay : ''}" data-cur="${esc(normCur(i.currency))}"${pre.has(i.id) ? ' checked' : ''}><span class="pr-name"><span>${esc(i.supplier || 'Factura sin datos')}</span><small>${esc([i.number ? 'NCF ' + RD.normNcf(i.number) : '', fmtDate(i.date)].filter(Boolean).join(' · '))}</small></span><span class="num">${esc(money(i.amount, i.currency))}</span></label>`).join('')}</div>`).join('')
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
  const ords = D.orders.filter((o) => o.projectId === id);
  const by = (k) => invs.filter((i) => GROUP_OF[i.status] === k);
  openSheet(`<form id="proj-form" data-id="${esc(id)}" autocomplete="off">${sheetHead(esc(p.name))}
    <div class="sheet-b">
      <div class="field"><label for="pe-name">Nombre del proyecto</label><input id="pe-name" maxlength="80" value="${esc(p.name)}" required></div>
      <div class="field"><label for="pe-budget">Presupuesto (RD$)</label><input id="pe-budget" class="mono" inputmode="decimal" maxlength="18" placeholder="Opcional" value="${esc(amountInput(p.budget))}"></div>
      ${budgetHTML(p, D)}
      ${trProjBoxHTML(id)}
      <div class="stats card"><div><span>Pendientes (${by('pendientes').length})</span><b>${esc(totalStr(by('pendientes')))}</b></div><div><span>En trámite (${by('tramite').length})</span><b>${esc(totalStr(by('tramite')))}</b></div><div><span>Pagadas (${by('pagadas').length})</span><b>${esc(totalStr(by('pagadas')))}</b></div></div>
      <button type="button" class="btn block" data-act="proj-view" data-id="${esc(id)}">Ver las facturas de este proyecto ${ICON.right}</button>
      <div id="proj-del-box" hidden>${invs.length || ords.length ? `<div class="confirm"><p>Este proyecto tiene ${[invs.length ? plural(invs.length, 'factura', 'facturas') : '', ords.length ? plural(ords.length, 'orden de compra', 'órdenes de compra') : ''].filter(Boolean).join(' y ')}. Para eliminarlo, primero cámbialas a otro proyecto o bórralas.</p><div class="actions"><button type="button" class="btn" data-act="proj-del-no">Entendido</button></div></div>` : `<div class="confirm"><p>¿Eliminar el proyecto “${esc(p.name)}”?</p><div class="actions"><button type="button" class="btn danger solid" data-act="proj-del-yes" data-id="${esc(id)}">Eliminar proyecto</button><button type="button" class="btn" data-act="proj-del-no">Cancelar</button></div></div>`}</div>
    </div>
    <div class="sheet-f"><button type="submit" class="btn primary">Guardar</button><button type="button" class="btn danger" data-act="proj-del">${ICON.trash} Eliminar</button></div>
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
      <p class="hint">Las facturas electrónicas se leen solas por su QR o su XML. Para que la app lea también las de papel y llene las órdenes desde el mensaje del pedido, pon una clave de API (se crea en platform.claude.com y se paga por uso; al crearla, asígnala a un espacio de trabajo y elige que no venza; los pasos están en la guía de la app). La clave se guarda solo en ${deviceWord()}: no va en los respaldos ni se comparte con los otros aparatos.</p>
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
        <label class="field full check-row"><input type="checkbox" id="st-oc-qr"${st.orderQr !== false ? ' checked' : ''}><span>Poner un código QR en la orden. Así, al agregar con <b>+</b> la foto de la orden firmada, la app la reconoce y la adjunta sola a su orden.</span></label>
      </div>
      <h3 class="h2">Respaldo</h3>
      <p class="hint">${RT.sync.status().on ? `Tus datos están en ${deviceWord()} y en la nube del equipo. Igual conviene un respaldo en un archivo de vez en cuando:` : `Tus facturas solo están en ${deviceWord()}.`} Descarga un respaldo cada semana y guárdalo en iCloud Drive o en tu computadora. ${last ? 'Último respaldo: ' + esc(fmtDate(new Date(last).toISOString().slice(0, 10))) + '.' : 'Todavía no has hecho ninguno.'}</p>
      <div class="actions"><button type="button" class="btn" data-act="backup">${ICON.down} Descargar respaldo</button><button type="button" class="btn" data-act="restore">Restaurar un respaldo</button></div>
      <div id="restore-box" hidden></div>
      ${RT.sync.status().on ? `<div class="msg"><span><b>Respaldo automático en la nube:</b> cada semana se guarda uno y quedan los últimos 8. ${S.bk && S.bk.last ? 'El último es del ' + esc(fmtDate(String(S.bk.last).slice(0, 10))) + '.' : 'El primero se hace solo en cuanto la nube esté al día.'} <button type="button" class="link" data-act="cloud-bk">Ver los respaldos</button></span></div>` : ''}
      <div class="actions"><button type="button" class="btn" data-act="trash-open">${ICON.trash} Papelera${S.papelera.length ? ' (' + S.papelera.length + ')' : ''}</button></div>
      <h3 class="h2">Seguridad de este ${wide() ? 'aparato' : 'teléfono'}</h3>
      <p class="hint">${pinConf() ? 'La app pide el PIN al abrirse y después de 5 minutos sin usarla.' : 'Puedes poner un PIN para que la app lo pida al abrirse.'}</p>
      <div class="actions"><button type="button" class="btn" data-act="pin-open">${ICON.lock} ${pinConf() ? 'Cambiar o quitar el PIN' : 'Poner un PIN'}</button></div>
      <h3 class="h2">Aprobación del dueño</h3>
      <p class="hint">Si lo activas, un pago presentado no se puede marcar como pagado hasta que el dueño lo apruebe desde su teléfono, entrando a la nube con su cuenta. Queda anotado quién lo aprobó y cuándo. ${RT.sync.status().on ? '' : '<b>Necesita la nube conectada.</b>'}</p>
      <div class="fields">
        <label class="field full check-row"><input type="checkbox" id="st-ap"${st.needApproval ? ' checked' : ''}><span>Los pagos necesitan la aprobación del dueño</span></label>
        <div class="field full"><label for="st-owner">Correo del dueño (el de su cuenta en la nube)</label><input id="st-owner" type="email" inputmode="email" autocapitalize="off" spellcheck="false" maxlength="120" value="${esc(st.ownerEmail || '')}"></div>
      </div>
      <h3 class="h2">Nube: teléfono y computadora</h3>
      <div id="nube-box" data-k="${nubeKey(RT.sync.status())}">${nubeBoxHTML()}</div>
      <p class="usage" id="st-usage">Calculando espacio…</p>
      ${(() => { const l = errList(); return l.length ? `<details class="edit" id="err-box"><summary>Registro de errores (${l.length})</summary><div class="err-list">${l.slice(-8).reverse().map((x) => `<p class="usage"><b>${esc(fmtDate(String(x.t).slice(0, 10)))} ${esc(String(x.t).slice(11, 16))}</b> ${esc(x.m)}${x.n > 1 ? ` (×${x.n})` : ''}</p>`).join('')}</div><div class="actions"><button type="button" class="btn sm" data-act="err-share">Compartir el registro</button><button type="button" class="btn sm ghost" data-act="err-clear">Borrar</button></div></details>` : ''; })()}
      <p class="usage">Versión ${APP_VERSION}. Se actualiza sola.<br>© 2026 AngelixVrobles. Uso gratuito; no se permite venderla ni copiarla sin permiso del autor.</p>
    </div>
    <div class="sheet-f"><button type="submit" class="btn primary block">Guardar</button></div>
  </form>`, { type: 'settings' });
  refreshUsage();
}
// Cuánto ocupan las fotos y los PDF: aquí y, con la nube, contra el espacio del plan gratis (son los mismos archivos).
async function refreshUsage() {
  if (!$('#st-usage') || !assets) return;
  try {
    const { usage: u } = await assets.list();
    const persisted = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : null;
    S.fileBytes = u.bytes || 0;
    const here = `${plural(u.files || 0, 'archivo', 'archivos')} · ${fmtBytes(u.bytes)}${isNum(u.maxBytes) ? ` (el navegador permite hasta ${fmtBytes(u.maxBytes)})` : ''}${persisted ? ' · protegido contra borrado automático' : ''}`;
    const el = $('#st-usage');
    if (el) el.textContent = RT.sync.status().on ? `En la nube: ${fmtBytes(S.fileBytes)} de alrededor de ${fmtBytes(CLOUD_FREE_BYTES)} del plan gratis (${Math.min(100, Math.round((S.fileBytes / CLOUD_FREE_BYTES) * 100))} %). En ${deviceWord()}: ${here}.` : `${here}.`;
  } catch (e) { const el = $('#st-usage'); if (el) el.textContent = ''; }
}

/* ---------- compartir con los otros aparatos (nube del equipo) ---------- */
const nubeKey = (s) => `${s.on}|${s.code === 'auth'}`;
function relTime(ms) {
  if (!ms) return '';
  const sec = Math.round((Date.now() - ms) / 1000);
  if (sec < 45) return 'hace un momento';
  if (sec < 3600) return `hace ${Math.max(1, Math.round(sec / 60))} min`;
  const d = new Date(ms);
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return `el ${fmtDate(day)} a las ${d.toLocaleTimeString('es-DO', { hour: 'numeric', minute: '2-digit' })}`;
}
function nubeLine(s) {
  const pend = s.pendingDocs || s.pendingFiles ? ` Falta subir: ${[s.pendingDocs ? plural(s.pendingDocs, 'cambio', 'cambios') : '', s.pendingFiles ? plural(s.pendingFiles, 'archivo', 'archivos') : ''].filter(Boolean).join(' y ')}.` : '';
  if (s.status === 'syncing') return esc(s.progress || 'Poniéndose al día…');
  if (s.status === 'error') return esc(s.error + pend);
  if (s.status === 'ok') return esc(`Al día (${relTime(s.at)}).${pend}`);
  return esc('Conectado.' + pend);
}
function nubeBoxHTML() {
  const s = RT.sync.status();
  if (!s.on) {
    return `<p class="hint">Conecta tu teléfono, tu computadora y el teléfono del dueño a la nube del equipo para que todos vean lo mismo: lo que agregas en uno aparece solo en los demás. Cada aparato sigue funcionando sin internet y se pone al día cuando hay conexión. La nube se crea una sola vez; los pasos están en la guía de la app.</p>
      <div class="fields">
        <div class="field full"><label for="nb-code">Datos de conexión</label><textarea id="nb-code" rows="2" spellcheck="false" autocapitalize="off" placeholder="Pega el código FACTURAS-NUBE que te mandaron, o la URL del proyecto"></textarea></div>
        <div class="field full"><label for="nb-key">Clave pública del proyecto (solo si pegaste la URL)</label><input id="nb-key" spellcheck="false" autocapitalize="off" autocomplete="off"></div>
        <div class="field"><label for="nb-email">Correo</label><input id="nb-email" type="email" inputmode="email" autocapitalize="off" autocomplete="username" spellcheck="false"></div>
        <div class="field"><label for="nb-pass">Contraseña</label><input id="nb-pass" type="password" autocomplete="current-password"></div>
      </div>
      <div class="actions"><button type="button" class="btn primary" data-act="nube-connect">Conectar ${deviceWord()}</button></div>
      <p class="usage" id="nb-msg"></p>`;
  }
  const relog = s.code === 'auth' ? `<div class="fields"><div class="field full"><label for="nb-pass">Contraseña de ${esc(s.email)}</label><input id="nb-pass" type="password" autocomplete="current-password"></div></div><div class="actions"><button type="button" class="btn primary" data-act="nube-relogin">Volver a entrar</button></div>` : '';
  return `<p class="nube-line ${esc(s.status)}" id="nb-status">${nubeLine(s)}</p>
    <p class="hint">Conectado como <b>${esc(s.email)}</b>. Lo que se agrega o cambia en un aparato les aparece a los demás conectados.</p>
    ${relog}
    <div class="actions"><button type="button" class="btn" data-act="nube-sync">Sincronizar ahora</button><button type="button" class="btn" data-act="nube-share">${ICON.share} Datos para conectar otro aparato</button></div>
    <div><button type="button" class="btn danger sm" data-act="nube-off">Desconectar ${deviceWord()}</button></div>
    <div id="nb-confirm" hidden></div>
    <p class="usage" id="nb-msg"></p>`;
}
function refreshNubeBox(s) {
  const box = $('#nube-box');
  if (!box) return;
  if (box.dataset.k !== nubeKey(s)) { box.dataset.k = nubeKey(s); box.innerHTML = nubeBoxHTML(); refreshUsage(); return; }
  const line = $('#nb-status');
  if (line) { line.className = 'nube-line ' + s.status; line.innerHTML = nubeLine(s); }
}
async function nubeConnect(btn) {
  const msg = $('#nb-msg');
  const raw = $('#nb-code').value.trim();
  const code = RT.sync.parseShareCode(raw);
  const url = code ? code.url : raw;
  const key = code ? code.key : $('#nb-key').value.trim();
  const email = $('#nb-email').value.trim(), password = $('#nb-pass').value;
  if (!code && /facturas-nube/i.test(raw)) { msg.textContent = 'El código se dañó al pegarlo (pasa a veces al copiarlo de WhatsApp o de Notas). Cópialo otra vez entero, o en Datos de conexión pon solo la URL del proyecto (https://….supabase.co) y en Clave pública la clave que empieza con sb_publishable_.'; return; }
  if (!code && url && !/^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?(\/\S*)?$/i.test(url) && !/^[a-z0-9]{20}$/i.test(url)) { msg.textContent = 'Eso no parece la URL del proyecto. Debe ser como https://abcdefghijklmnopqrst.supabase.co (está en supabase.com, en el botón Connect del proyecto), o el código FACTURAS-NUBE que te mandaron.'; return; }
  if (!url || !key || !email || !password) { msg.textContent = 'Faltan datos: el código (o la URL y la clave), el correo y la contraseña.'; return; }
  btn.disabled = true;
  msg.textContent = 'Conectando…';
  try {
    await RT.sync.connect({ url, key, email, password });
    toast('Conectado. Los datos se están poniendo al día.');
  } catch (e) {
    if (msg.isConnected) msg.textContent = { auth: 'El correo o la contraseña no son correctos, o falta crear ese usuario en la nube.', offline: 'No se pudo llegar a la nube. Revisa el internet (prueba también con datos móviles) y la URL. Si en tus otros aparatos la nube dice «En pausa» o «Sin conexión», entra a supabase.com, abre el proyecto y toca «Restore».', bad_input: 'Faltan datos.' }[e && e.code] || 'No se pudo conectar. Revisa la URL y la clave.';
    btn.disabled = false;
  }
}
async function nubeRelogin(btn) {
  const pass = $('#nb-pass') ? $('#nb-pass').value : '';
  const msg = $('#nb-msg');
  if (!pass) { if (msg) msg.textContent = 'Escribe la contraseña.'; return; }
  btn.disabled = true;
  try { await RT.sync.relogin(pass); toast('Listo, conectado otra vez.'); } catch (e) { if (msg) msg.textContent = e && e.code === 'offline' ? 'Sin internet.' : 'La contraseña no es correcta.'; btn.disabled = false; }
}
async function nubeShare() {
  const code = RT.sync.shareCode();
  let ok = false;
  try { await navigator.clipboard.writeText(code); ok = true; } catch (e) { ok = false; }
  if (ok) toast('Copiado. Mándatelo por WhatsApp o correo para abrirlo en el otro aparato.');
  const msg = $('#nb-msg');
  if (msg) msg.innerHTML = `${ok ? 'Copiado.' : 'Copia este código.'} En el otro aparato: abre la app, ve a Ajustes → Nube, pega el código y entra con el correo y la contraseña de esa persona. El código no lleva tu contraseña.<span class="nube-code">${esc(code)}</span>`;
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
  if (!forceXml && (i.extraPages || []).length) { showFiles(i.supplier || i.fileName || 'Factura', [{ fileId: i.fileId, fileType: i.fileType }, ...i.extraPages]); return; }
  showFile({ title: i.supplier || i.fileName || 'Factura', fileId: forceXml ? i.xmlId : i.fileId, fileType: forceXml ? 'application/xml' : i.fileType });
}
// Varias páginas (fotos y PDF) una debajo de otra.
async function showFiles(title, files) {
  const v = $('#viewer');
  const token = Symbol('v');
  v._token = token;
  v.innerHTML = `<div class="viewer-h"><span>${esc(title)}</span><button type="button" class="icon-btn" data-act="viewer-close" aria-label="Cerrar">${ICON.close}</button></div><div class="viewer-b" id="viewer-b">${files.map((f, n) => (f.fileType === 'application/pdf' ? `<div class="viewer-pdf" data-n="${n}"><p class="viewer-msg">Abriendo…</p></div>` : `<img src="${esc(assetUrl(f.fileId))}" alt="${esc(title)}">`)).join('')}</div>`;
  v.hidden = false;
  lockBody();
  const body = $('#viewer-b');
  const w = Math.min(1800, Math.max(600, (body.clientWidth || 800) * Math.min(2, window.devicePixelRatio || 1)));
  for (let n = 0; n < files.length; n++) {
    if (files[n].fileType !== 'application/pdf') continue;
    const box = body.querySelector(`.viewer-pdf[data-n="${n}"]`);
    try {
      const doc = await openPdf(await (await getBlob(files[n].fileId)).arrayBuffer());
      if (v._token !== token) return;
      box.innerHTML = '';
      for (let p = 1; p <= doc.numPages; p++) {
        if (v._token !== token || v.hidden) return;
        const c = await renderPdfCanvas(doc, p, w);
        c.className = 'viewer-page';
        box.appendChild(c);
      }
    } catch (e) { console.error(e); if (box) box.innerHTML = '<p class="viewer-msg">No se pudo abrir esta página.</p>'; }
  }
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
  const okStates = ['lista', 'qr', 'xml', 'orden', 'conduce'];
  if (S.queue.every((x) => x.done) && S.queue.every((x) => okStates.includes(x.state))) {
    setTimeout(() => { if (S.queue.every((x) => x.done)) { S.queue = S.queue.filter((x) => !okStates.includes(x.state)); renderQueue(); } }, 5000);
  }
  scheduleRender();
  scheduleLink();
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
    let blob, ftype, thumb = null, text = '', pages = 1, aiImage = null, qr = null, creator = '', staple = null;
    if (isPdf) {
      if (f.size > 25 * 1048576) throw new UserError('El PDF pesa más de 25 MB');
      let bytes = await f.arrayBuffer();
      blob = new Blob([bytes], { type: 'application/pdf' });
      ftype = 'application/pdf';
      let r = null;
      try { r = await inspectPdf(bytes); pages = r.pages; text = r.text; thumb = r.thumb; qr = r.qr; creator = r.creator; } catch (e) { console.warn('PDF', e); }
      if (creator === PDF_CREATOR) throw new UserError(qr && qr.kind === 'order' ? 'Es el PDF de la orden sin firmar. Agrega la foto o el escaneo de la orden ya firmada y sellada' : 'Este PDF lo hizo esta app; no es una factura');
      // Factura y orden firmada engrapadas en un solo PDF: la orden va a su orden y lo demás sigue como factura enlazada a ella.
      const so = r && r.orderPages && r.orderPages.length && r.orderPages.length < r.pages ? S.orders.find((x) => x.id === r.orderQr.id) : null;
      if (so) {
        setQ(item, 'subiendo');
        const keep = Array.from({ length: r.pages }, (_, k) => k + 1).filter((n) => !r.orderPages.includes(n));
        const ob = await pdfPick(bytes, r.orderPages);
        const oi = await inspectPdf(ob).catch(() => null);
        await saveSignedCopy(so, new Blob([ob], { type: 'application/pdf' }), 'application/pdf', oi ? oi.thumb : null);
        bytes = await pdfPick(bytes, keep);
        blob = new Blob([bytes], { type: 'application/pdf' });
        const rr = await inspectPdf(bytes).catch(() => null);
        pages = rr ? rr.pages : keep.length; text = rr ? rr.text : ''; thumb = rr ? rr.thumb : null; qr = rr ? rr.qr : null;
        if (qr && qr.kind === 'order') qr = null;
        staple = so;
      }
      if (thumb && !hasText(text)) aiImage = thumb;
    } else {
      const r = await prepImage(f);
      blob = r.blob; qr = r.qr; ftype = 'image/jpeg'; aiImage = blob;
    }
    if (qr && qr.kind === 'order') {
      const o = S.orders.find((x) => x.id === qr.id);
      if (o) {
        setQ(item, 'subiendo');
        await saveSignedCopy(o, blob, ftype, thumb);
        item.file = null;
        finishQ(item, 'orden', `${orderNo(o)} quedó adjunta a su orden`);
        return;
      }
      qr = null;
    }
    setQ(item, 'subiendo');
    // Si ya existe la misma factura electrónica cargada por XML, se le agrega la foto o el PDF.
    const twin = qr && qr.encf ? S.invoices.find((x) => x.fileType === 'application/xml' && RD.normNcf(x.number) === qr.encf) : null;
    const up = await assets.upload(blob, { type: ftype });
    let thumbId = null;
    if (thumb) { try { thumbId = (await assets.upload(thumb, { type: 'image/jpeg' })).id; } catch (e) { console.warn('miniatura', e); } }
    if (twin) {
      const tw = { fileId: up.id, fileType: ftype, thumbId, pages, fileName: name.slice(0, 120), xmlId: twin.xmlId || twin.fileId, qrUrl: qr.url, secCode: qr.codigo || '' };
      const tom = !twin.orderId && text ? orderMentionIn(text, twin.projectId) : null;
      if (tom) fillFromOrder(tw, twin, tom);
      await dbw(() => db.doc('invoices/' + twin.id).update(tw));
      item.invId = twin.id;
      finishQ(item, 'qr');
      return;
    }
    const note = staple ? `con la orden ${orderNo(staple)} firmada, ya adjunta a su orden` : '';
    const willRead = ai.hasKey() && (!!aiImage || hasText(text));
    const doc = {
      projectId: item.projectId || null, supplier: '', rnc: '', number: '', date: '', amount: null, itbis: null, currency: 'DOP',
      concept: '', ref: '', buyerRnc: '', qrUrl: '', secCode: '', fiscal: '', notInvoice: false,
      fileId: up.id, fileType: ftype, thumbId, pages, fileName: name.slice(0, 120), xmlId: null,
      createdAt: new Date().toISOString(), ai: willRead ? 'pending' : 'off',
    };
    if (qr) Object.assign(doc, qrFields(qr));
    signAmounts(doc);
    if (doc.rnc && !doc.supplier) doc.supplier = knownSupplier(doc.rnc);
    if (!doc.projectId && text) { const pm = projectMentionIn(text); if (pm) doc.projectId = pm.id; }
    const om = staple || (text ? orderMentionIn(text, doc.projectId) : null);
    if (om) fillFromOrder(doc, doc, om);
    else { const so = soleOpenOrder(doc, derive()); if (so) { fillFromOrder(doc, doc, so); doc.orderAuto = true; } }
    const ref = db.collection('invoices').doc();
    await dbw(() => ref.set(doc));
    item.invId = ref.id;
    item.file = null;
    if (willRead) {
      setQ(item, 'leyendo');
      enqueueAI({ invId: ref.id, input: { image: aiImage, text } }).then((r) => {
        if (r === 'conduce') { item.condId = convertedTo.get(ref.id) || null; finishQ(item, 'conduce', 'esperando su factura'); return; }
        finishQ(item, r === 'done' ? (qr ? 'qr' : 'lista') : qr ? 'qr' : 'manual', note);
      });
    } else finishQ(item, qr ? 'qr' : 'manual', note);
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
  signAmounts(fields);
  const same = S.invoices.find((i) => RD.normNcf(i.number) === x.encf && (!i.rnc || RD.normRnc(i.rnc) === x.rncEmisor));
  const xo = x.ordenCompra ? orderByNumberText(x.ordenCompra, (same && same.projectId) || item.projectId) : null;
  if (same) {
    const upd = { ...fields, xmlId: up.id };
    if (!same.supplier && x.emisor) upd.supplier = x.emisor.slice(0, 120);
    if (xo && !same.orderId) fillFromOrder(upd, same, xo);
    else if (!same.orderId) { const so = soleOpenOrder({ ...same, ...upd }, derive()); if (so) { fillFromOrder(upd, same, so); upd.orderAuto = true; } }
    await dbw(() => db.doc('invoices/' + same.id).update(upd));
    item.invId = same.id;
    finishQ(item, 'xml');
    return;
  }
  const ref = db.collection('invoices').doc();
  const nd = {
    projectId: item.projectId || null, supplier: (x.emisor || knownSupplier(x.rncEmisor) || '').slice(0, 120), rnc: '', number: '', date: '', amount: null, itbis: null,
    concept: '', ref: '', buyerRnc: '', qrUrl: '', secCode: '', notInvoice: false, ...fields,
    fileId: up.id, fileType: 'application/xml', thumbId: null, pages: 1, fileName: String(f.name || '').slice(0, 120), xmlId: up.id,
    createdAt: new Date().toISOString(), ai: 'off',
  };
  if (xo) fillFromOrder(nd, nd, xo);
  else if (x.ordenCompra) nd.ref = ('OC ' + x.ordenCompra).slice(0, 60);
  if (!nd.orderId) { const so = soleOpenOrder(nd, derive()); if (so) { fillFromOrder(nd, nd, so); nd.orderAuto = true; } }
  await dbw(() => ref.set(nd));
  item.invId = ref.id;
  item.file = null;
  finishQ(item, 'xml');
}

const aiJobs = [];
const aiActive = new Set();
let aiRunning = 0;
const jobKey = (j) => (j.condId ? 'c:' + j.condId : j.invId);
const aiBusy = (key) => aiActive.has(key) || aiJobs.some((j) => jobKey(j) === key);
function enqueueAI(job) { return new Promise((res) => { aiJobs.push({ ...job, res }); runAI(); }); }
function runAI() {
  while (aiRunning < 2 && aiJobs.length) {
    const job = aiJobs.shift();
    const key = jobKey(job);
    aiRunning++;
    aiActive.add(key);
    (job.condId ? readConduceWithAI(job.condId, job.input) : readWithAI(job.invId, job.input)).catch((e) => { console.error(e); return 'failed'; }).then((r) => { aiRunning--; aiActive.delete(key); job.res(r); runAI(); });
  }
}
const AI_FIELDS = ['es_factura', 'tipo_documento', 'proveedor', 'rnc_proveedor', 'ncf', 'ncf_vence', 'fecha', 'itbis', 'total', 'total_corregido', 'tachados', 'cambio_de', 'condicion_pago', 'moneda', 'concepto', 'proyecto', 'rnc_cliente', 'referencia', 'conduces', 'conduce_numero', 'material', 'cantidad', 'viajes'];
const AI_SCHEMA = {
  type: 'object',
  properties: {
    es_factura: { type: 'boolean' }, proveedor: { type: 'string' }, rnc_proveedor: { type: 'string' }, ncf: { type: 'string' }, ncf_vence: { type: 'string' },
    fecha: { type: 'string' }, itbis: { type: 'string' }, total: { type: 'string' }, moneda: { type: 'string', enum: ['DOP', 'USD', 'EUR', ''] },
    total_corregido: { type: 'string' }, cambio_de: { type: 'string' }, condicion_pago: { type: 'string', enum: ['contado', 'credito', ''] },
    tachados: { type: 'array', items: { type: 'object', properties: { descripcion: { type: 'string' }, monto: { type: 'string' } }, required: ['descripcion', 'monto'], additionalProperties: false } },
    concepto: { type: 'string' }, proyecto: { type: 'string' }, rnc_cliente: { type: 'string' }, referencia: { type: 'string' },
    tipo_documento: { type: 'string', enum: ['factura', 'conduce', 'otro'] }, conduces: { type: 'string' }, conduce_numero: { type: 'string' },
    material: { type: 'string' }, cantidad: { type: 'string' }, viajes: { type: 'string' },
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
    withImage ? (withImage > 1 ? 'Las imágenes adjuntas son las páginas de la misma factura, en orden.' : 'La imagen adjunta es una foto o captura de la factura (o nota/recibo) que mandó el proveedor.') : `Este es el texto de la factura en PDF:\n<<<\n${t.slice(0, 9000)}\n>>>`,
    'A veces el archivo no es la factura sino el conduce (la nota de entrega del material) que viene con ella.',
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
    '- total: el total de la factura que aparece al pie (Total DOP, Total RD$ o Total a pagar), solo el número con punto decimal. No uses "Balance" ni "Saldo": ese es el saldo de la cuenta del cliente, no el total de esta factura. Aunque el total esté corregido a mano, aquí va el impreso.',
    '- tachados: los renglones (artículos) que están tachados a mano, con una raya encima, porque se devolvieron o se cambiaron por otra cosa. Pon cada uno con su descripción y su importe (el monto de ese renglón, solo el número con punto decimal; "" si no se lee). Si no hay ninguno tachado, deja la lista vacía. Un renglón solo subrayado, marcado con un cotejo o con una nota al lado no está tachado.',
    '- condicion_pago: "contado" si la factura dice que la venta es de contado (Condición: Contado, Venta al contado, Pagado en efectivo); "credito" si dice crédito (Condición: Crédito, a 30 días…); "" si no lo dice.',
    '- cambio_de: si esta factura es por un cambio o una devolución de otra factura (dice cambio, sustitución o reemplazo, o menciona la factura original), el número o NCF de esa factura original; si no, "".',
    '- total_corregido: si el total se corrigió a mano (tachado y escrito otro, por renglones devueltos, cambiados o agregados a mano), el total nuevo escrito a mano, solo el número; si no, "".',
    '- moneda: "DOP" si está en pesos (RD$), "USD" si está en dólares (US$).',
    '- concepto: qué se está cobrando, máximo 80 caracteres.',
    '- proyecto: la obra o proyecto; suele venir en campos como Nota, Obra, Proyecto o Referencia (ej. "Nota: CAPERUZA 2"). Si coincide con uno de los proyectos que ya existen (aunque esté escrito distinto, por ejemplo "caperuza II" y "Caperuza 2"), escribe el nombre exactamente como está en la lista; si no, escríbelo tal cual.',
    '- rnc_cliente: RNC del cliente o comprador al que va dirigida la factura, solo números.',
    '- referencia: número de orden de compra (OC), contrato o cubicación, si aparece, con su etiqueta (ej. "OC-0012" o "Cubicación 4"). Si menciona varias órdenes, ponlas todas (ej. "OC-0012, OC-0013").',
    '- es_factura: false solo si el archivo claramente no es una factura, nota ni recibo.',
    '- tipo_documento: "conduce" si es un conduce (nota de entrega o despacho de material: suele decir CONDUCE, viajes, chofer, placa, despachado por y recibido por) y no una factura; "factura" si es una factura, nota o recibo; "otro" si no es ninguno.',
    '- conduce_numero, material, cantidad y viajes: solo si es un conduce: su número (ej. 39807), el material (ej. Grava), la cantidad con su unidad (ej. "5 m³") y la cantidad de viajes (solo el número). En un conduce, total es el total en dinero del conduce.',
    '- conduces: si es una factura y menciona números de conduce, escríbelos separados por coma (ej. "39807, 39811").',
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
  const ordRefs = refx && !(inv && inv.orderId && !inv.orderAuto) ? matchOrderRefs(refx, pid) : [];
  const ordRef = ordRefs[0] || null;
  if (ordRefs.length > 1) upd.moreOrders = ordRefs.slice(1).map((x) => x.id);
  if (ordRef) { upd.orderId = ordRef.id; upd.orderAuto = false; if (!pid && ordRef.projectId) { upd.projectId = ordRef.projectId; upd.projectHint = ''; } if (!upd.supplier && !(inv && inv.supplier) && ordRef.supplier) upd.supplier = ordRef.supplier; }
  else if (refx && !(inv && inv.ref)) upd.ref = refx;
  // Renglones tachados a mano (se devolvieron o se cambiaron): se anotan, el impreso queda aparte y, si hay un total corregido a mano, ese es el que se paga.
  const tach = (Array.isArray(o.tachados) ? o.tachados : []).map((x) => ({ desc: s(x && x.descripcion, 120), amount: parseAmount(s(x && x.monto, 40)) })).filter((x) => x.desc || isNum(x.amount)).slice(0, 40).map((x) => ({ desc: x.desc, amount: isNum(x.amount) && x.amount >= 0 && x.amount < 1e12 ? round2(x.amount) : null }));
  const fixed = parseAmount(s(o.total_corregido, 40));
  const printed = isNum(upd.amount) ? upd.amount : inv && isNum(inv.amount) ? inv.amount : null;
  const hasFix = isNum(fixed) && fixed > 0 && fixed < 1e12 && printed != null && Math.abs(fixed - printed) >= 0.01;
  if (tach.length || hasFix) {
    upd.struck = tach; upd.struckOk = false; upd.struckFixed = hasFix; upd.printedTotal = printed;
    if (hasFix && !keep('amount')) upd.amount = round2(fixed);
  }
  // Si la factura dice contado, se pregunta si ya se pagó (no se da por pagada sola).
  if (o.condicion_pago === 'contado' && inv && !inv.payMode && !S.payments.some((p) => (p.invoiceIds || []).includes(inv.id))) upd.termsCheck = true;
  // Si dice que es por el cambio de otra factura, se enlaza con ella (primero las del mismo proveedor).
  const cref = s(o.cambio_de, 60);
  if (cref && inv && !inv.changeOf) {
    const n = RD.normNcf(cref), dg = cref.replace(/\D/g, '');
    const sup = upd.supplier || inv.supplier || '', rn = upd.rnc || inv.rnc || '';
    const hits = S.invoices.filter((x) => x.id !== inv.id && x.number && (RD.normNcf(x.number) === n || (dg.length >= 4 && RD.normNcf(x.number).replace(/\D/g, '').endsWith(dg))));
    const hit = hits.find((x) => (rn && x.rnc && RD.normRnc(x.rnc) === RD.normRnc(rn)) || sameName(x.supplier, sup)) || (hits.length === 1 && RD.normNcf(hits[0].number) === n ? hits[0] : null);
    if (hit) upd.changeOf = hit.id; else upd.changeRef = cref;
  }
  const crefs = (s(o.conduces, 300).match(/\d{3,12}/g) || []).slice(0, 40);
  if (crefs.length) upd.conduceRefs = crefs;
  return signAmounts(upd, inv);
}
async function readWithAI(invId, input) {
  const ref = db.doc('invoices/' + invId);
  const imgs = input.images || (input.image ? [input.image] : []);
  if (!ai.hasKey() || (!imgs.length && !hasText(input.text))) { await ref.update({ ai: 'off' }).catch(() => {}); return 'off'; }
  let out;
  try {
    out = await ai.json(buildPrompt(input.text, imgs.length), { images: imgs, schema: AI_SCHEMA });
  } catch (e) {
    console.warn('lectura', e);
    if (e && AI_STOP.has(e.code)) { S.aiState = e.code === 'bad_key' ? 'badkey' : e.code; scheduleRender(); }
    await ref.update({ ai: e && e.code === 'no_key' ? 'off' : 'failed', aiErr: String((e && e.code) || '') }).catch(() => {});
    return 'failed';
  }
  if (S.aiState !== 'ok') { S.aiState = 'ok'; scheduleRender(); }
  const cur = S.invoices.find((x) => x.id === invId);
  if (!cur) return 'failed';
  if (out && out.tipo_documento === 'conduce' && canBeConduce(cur, out)) {
    try { await convertToConduce(cur, out); return 'conduce'; } catch (e) { console.error(e); }
  }
  const upd = parseAI(out, cur);
  upd.aiErr = '';
  if (!upd.orderId && !(cur.orderId && !cur.orderAuto)) {
    const merged = { ...cur, ...upd, orderId: null };
    const so = soleOpenOrder(merged, derive());
    if (so) {
      fillFromOrder(upd, merged, so);
      upd.orderAuto = true;
      // Mientras se guarda, otra lectura que termine al mismo tiempo no se lleva la misma orden.
      autoClaims.set(so.id, invId);
      setTimeout(() => { if (autoClaims.get(so.id) === invId) autoClaims.delete(so.id); }, 5000);
    }
  }
  { const ch = histDiff(cur, upd); upd.hist = histAdd(cur, histEntry('Datos leídos solos', ch)); }
  await dbw(() => ref.update(upd)).catch((e) => console.error(e));
  scheduleLink();
  return 'done';
}
async function aiInputFor(i) {
  let input = null;
  if (i.fileType === 'application/pdf') {
    const r = await inspectPdf(await (await getBlob(i.fileId)).arrayBuffer());
    input = { text: r.text, image: hasText(r.text) ? null : r.thumb };
  } else if (i.fileType && i.fileType.startsWith('image/')) input = { image: await getBlob(i.fileId), text: '' };
  if (!input) return null;
  // Las otras páginas de la factura también se leen (hasta 3 más).
  const extra = [];
  for (const x of (i.extraPages || []).slice(0, 3)) {
    try {
      if (String(x.fileType || '').startsWith('image/')) extra.push(await getBlob(x.fileId));
      else if (x.fileType === 'application/pdf') { const r = await inspectPdf(await (await getBlob(x.fileId)).arrayBuffer()); if (hasText(r.text)) input.text = (input.text || '') + '\n' + r.text; else if (r.thumb) extra.push(r.thumb); }
    } catch (e) { console.warn('página', e); }
  }
  if (extra.length) input.images = [...(input.image ? [input.image] : []), ...extra];
  return input;
}
let readingMany = false;
async function readMany(list, quiet) {
  if (!ai.hasKey()) { openSettings(); return; }
  if (readingMany || !list.length) return;
  readingMany = true;
  try {
    if (!quiet) toast(`Leyendo ${plural(list.length, 'factura', 'facturas')}…`);
    const jobs = [];
    for (const i of list) {
      try {
        const input = await aiInputFor(i);
        if (!input) continue;
        await db.doc('invoices/' + i.id).update({ ai: 'pending', aiErr: '' });
        jobs.push(enqueueAI({ invId: i.id, input }));
      } catch (e) { console.warn('lectura en lote', e); }
    }
    const res = await Promise.all(jobs);
    const ok = res.filter((r) => r === 'done' || r === 'conduce').length;
    const conv = res.filter((r) => r === 'conduce').length;
    const note = conv ? (conv === 1 ? ' Una era un conduce y quedó guardada como conduce.' : ` ${conv} eran conduces y quedaron guardados como conduces.`) : '';
    if (jobs.length) toast((ok === jobs.length ? `Listo: ${plural(ok, 'factura leída', 'facturas leídas')}.` : `Se leyeron ${ok} de ${jobs.length}. Las demás puedes intentarlas otra vez.`) + note);
  } finally { readingMany = false; }
}
// Las que no se pudieron leer por falta de internet se leen solas cuando vuelve la conexión.
function retryOffline() {
  if (!ai.hasKey() || !navigator.onLine || S.dbState !== 'ready') return;
  const list = S.invoices.filter((i) => i.ai === 'failed' && i.aiErr === 'offline');
  for (const c of S.conduces.filter((x) => x.ai === 'failed' && x.aiErr === 'offline')) {
    aiInputFor(c).then((input) => (input ? db.doc('conduces/' + c.id).update({ ai: 'pending', aiErr: '' }).then(() => enqueueAI({ condId: c.id, input })) : null)).catch((e) => console.warn(e));
  }
  if (!list.length) return;
  toast(`Volvió el internet: leyendo ${plural(list.length, 'factura pendiente', 'facturas pendientes')}…`);
  readMany(list, true);
}
async function rereadInvoice(id, btn) {
  const i = S.invoices.find((x) => x.id === id);
  if (!i) return;
  if (!ai.hasKey()) { openSettings(); return; }
  btn.disabled = true;
  btn.textContent = 'Leyendo…';
  try {
    const input = await aiInputFor(i);
    if (!input) { toast('Esta factura viene del XML; no hace falta leerla.'); return; }
    await db.doc('invoices/' + id).update({ ai: 'pending' });
    if (S.sheet && S.sheet.type === 'inv' && S.sheet.id === id) S.sheet.dirty = false;
    const r = await enqueueAI({ invId: id, input });
    toast(r === 'done' ? 'Listo: datos leídos otra vez' : r === 'conduce' ? 'Era un conduce, no una factura: quedó guardado como conduce.' : 'No se pudo leer esta factura');
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
      ...(() => {
        const m = $('#f-paymode') ? $('#f-paymode').value : inv.payMode || '';
        if (!m) return { payMode: '', termsCheck: false };
        const pd = $('#f-paiddate').value;
        return { payMode: m, payMethod: $('#f-paymethod').value, paidBy: $('#f-paidby').value.trim().slice(0, 60), paidDate: ymd(pd) ? pd : $('#f-date').value || todayISO(), termsCheck: false };
      })(),
    };
    if (upd.payMode === 'reponer' && !upd.paidBy) { toast('Escribe a quién hay que reponérselo.'); $('#f-paidby').focus(); btn.disabled = false; return; }
    if (upd.payMode && (inv.payMode || '') !== upd.payMode && S.payments.some((p) => (p.invoiceIds || []).includes(id))) { const p = S.payments.find((x) => (x.invoiceIds || []).includes(id)); toast(`Está en el pago «${p.name || 'Pago'}». Si ya se pagó aparte, primero quítala de ese pago.`); btn.disabled = false; return; }
    signAmounts(upd);
    { const more = Array.isArray(inv.moreOrders) ? inv.moreOrders : []; if (more.length) { if (!upd.orderId) { upd.orderId = more[0]; upd.moreOrders = more.slice(1); } else upd.moreOrders = more.filter((x) => x !== upd.orderId); } }
    const ordSel = upd.orderId ? S.orders.find((x) => x.id === upd.orderId) : null;
    if (ordSel) { if (!upd.projectId && ordSel.projectId) upd.projectId = ordSel.projectId; if (!upd.supplier && ordSel.supplier) upd.supplier = ordSel.supplier; if (!upd.concept) upd.concept = itemsSummary(ordSel.items); }
    upd.orderAuto = false;
    if (upd.projectId) upd.projectHint = '';
    if (inv.ai === 'pending' || inv.ai === 'failed') upd.ai = 'off';
    const ch = histDiff(inv, upd), pmCh = (inv.payMode || '') !== upd.payMode;
    if (Object.keys(ch).length || pmCh) upd.hist = histAdd(inv, histEntry('Cambiada a mano' + (pmCh ? ' · ' + payText(upd).toLowerCase() : ''), ch));
    await dbw(() => db.doc('invoices/' + id).update(upd));
    closeSheet();
    toast('Factura guardada');
    scheduleLink();
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
  const raw = S.invoices.find((x) => x.id === id);
  const condIds = S.conduces.filter((x) => x.invoiceId === id).map((c) => c.id);
  const ok = await write(async () => {
    if (i.pay) await db.doc('payments/' + i.pay.id).update({ invoiceIds: (i.pay.invoiceIds || []).filter((x) => x !== id) });
    for (const cid of condIds) await db.doc('conduces/' + cid).update({ invoiceId: null, auto: false });
    await toTrash('invoice', raw, [i.supplier || 'Sin proveedor', i.number ? 'NCF ' + RD.normNcf(i.number) : '', isNum(i.amount) ? money(i.amount, i.currency) : ''].filter(Boolean).join(' · '), { condIds, payId: i.pay ? i.pay.id : null });
    await db.doc('invoices/' + id).delete();
  });
  if (!ok) return;
  closeSheet();
  // Los archivos se quedan mientras esté en la papelera.
  toastAct('Factura movida a la papelera', 'Deshacer', () => undoTrash('invoice', id));
}
/* ---------- conduces: guardar, leer y enlazar ---------- */
let condTarget = null;
const convertedTo = new Map();
// Foto o PDF listos para guardar (lo mismo que se hace con las facturas).
async function prepFile(f) {
  const name = String(f.name || ''), type = String(f.type || '').toLowerCase();
  const isPdf = type === 'application/pdf' || /\.pdf$/i.test(name);
  const isImg = !isPdf && (type.startsWith('image/') || /\.(jpe?g|png|webp|gif|heic|heif|bmp)$/i.test(name));
  if (!isPdf && !isImg) throw new UserError('Solo se pueden agregar fotos o PDF');
  if (isPdf) {
    if (f.size > 25 * 1048576) throw new UserError('El PDF pesa más de 25 MB');
    const bytes = await f.arrayBuffer();
    let r = null;
    try { r = await inspectPdf(bytes); } catch (e) { console.warn('PDF', e); }
    if (r && r.creator === PDF_CREATOR) throw new UserError('Este PDF lo hizo esta app; no es un conduce');
    return { blob: new Blob([bytes], { type: 'application/pdf' }), ftype: 'application/pdf', thumb: r ? r.thumb : null, pages: r ? r.pages : 1, text: r ? r.text : '', aiImage: r && r.thumb && !hasText(r.text) ? r.thumb : null };
  }
  const r = await prepImage(f);
  return { blob: r.blob, ftype: 'image/jpeg', thumb: null, pages: 1, text: '', aiImage: r.blob };
}
async function addConduceFiles(files, invId) {
  if (!canUpload()) { toast('Espera a que carguen tus datos.'); return; }
  const inv = invId ? S.invoices.find((x) => x.id === invId) : null;
  const list = [...files].filter((f) => f && f.size > 0);
  if (!list.length) return;
  toast(list.length === 1 ? 'Guardando el conduce…' : `Guardando ${list.length} conduces…`);
  let n = 0;
  for (const f of list) {
    try {
      const p = await prepFile(f);
      const up = await assets.upload(p.blob, { type: p.ftype });
      let thumbId = null;
      if (p.thumb) { try { thumbId = (await assets.upload(p.thumb, { type: 'image/jpeg' })).id; } catch (e) { console.warn('miniatura', e); } }
      const willRead = ai.hasKey() && (!!p.aiImage || hasText(p.text));
      const pf = S.projectFilter !== 'all' && S.projectFilter !== 'none' ? S.projectFilter : null;
      const doc = {
        invoiceId: inv ? inv.id : null, projectId: (inv && inv.projectId) || pf, projectHint: '', supplier: (inv && inv.supplier) || '', rnc: (inv && RD.normRnc(inv.rnc)) || '',
        number: '', date: '', total: null, currency: inv ? normCur(inv.currency) : 'DOP', material: '', qty: '', trips: null,
        fileId: up.id, fileType: p.ftype, thumbId, pages: p.pages, fileName: String(f.name || '').slice(0, 120), createdAt: new Date().toISOString(), ai: willRead ? 'pending' : 'off', aiErr: '', auto: false,
      };
      const ref = db.collection('conduces').doc();
      await dbw(() => ref.set(doc));
      n++;
      if (willRead) enqueueAI({ condId: ref.id, input: { image: p.aiImage, text: p.text } });
    } catch (e) {
      if (e instanceof UserError) console.warn(e.message); else console.error(e);
      toast(list.length > 1 ? `${f.name || 'Un archivo'}: ${upErr(e)}` : upErr(e));
    }
  }
  if (!n) return;
  toast(inv ? (n === 1 ? 'Conduce agregado a la factura' : `${n} conduces agregados a la factura`) : (n === 1 ? 'Conduce guardado; espera su factura' : `${n} conduces guardados; esperan su factura`));
  if (inv) refreshInvCondBox(inv.id); else scheduleLink();
}
const COND_FIELDS = ['numero', 'fecha', 'proveedor', 'rnc_proveedor', 'proyecto', 'material', 'cantidad', 'viajes', 'total', 'moneda'];
const COND_SCHEMA = {
  type: 'object',
  properties: {
    numero: { type: 'string' }, fecha: { type: 'string' }, proveedor: { type: 'string' }, rnc_proveedor: { type: 'string' }, proyecto: { type: 'string' },
    material: { type: 'string' }, cantidad: { type: 'string' }, viajes: { type: 'string' }, total: { type: 'string' }, moneda: { type: 'string', enum: ['DOP', 'USD', 'EUR', ''] },
  },
  required: COND_FIELDS,
  additionalProperties: false,
};
function buildCondPrompt(text, withImage) {
  const names = S.projects.map((p) => p.name).filter(Boolean);
  const t = String(text || '').trim();
  return [
    'Lee este conduce de República Dominicana (la nota de entrega o despacho de material que acompaña una factura) y saca sus datos.',
    withImage ? 'La imagen adjunta es una foto del conduce; puede estar llenado a mano.' : `Este es el texto del conduce en PDF:\n<<<\n${t.slice(0, 9000)}\n>>>`,
    withImage && t ? `Texto que se pudo sacar del mismo archivo (puede estar incompleto):\n<<<\n${t.slice(0, 4000)}\n>>>` : '',
    'Proyectos u obras que ya existen: ' + (names.length ? JSON.stringify(names.slice(0, 200)) : '(todavía ninguno)'),
    'Llena cada campo así (usa "" si el dato no aparece):',
    '- numero: el número del conduce (ej. 39807), solo el número.',
    '- fecha: la fecha del conduce en formato AAAA-MM-DD (en el conduce suele estar como DD-MM-AAAA).',
    '- proveedor: el nombre de la empresa que despacha (la del membrete), no el del cliente.',
    '- rnc_proveedor: el RNC de esa empresa si aparece, solo números.',
    '- proyecto: el proyecto u obra; si coincide con uno de la lista (aunque esté escrito distinto), escríbelo exactamente como en la lista.',
    '- material: el material o servicio (ej. Grava, Arena lavada, Relleno).',
    '- cantidad: la cantidad con su unidad, como está escrita (ej. "5 m³").',
    '- viajes: la cantidad de viajes, solo el número.',
    '- total: el total en dinero del conduce, solo el número con punto decimal (ej. 8000.00).',
    '- moneda: "DOP" si está en pesos (RD$), "USD" si está en dólares.',
  ].filter(Boolean).join('\n');
}
function parseCondAI(out, c, force) {
  const o = out && typeof out === 'object' && !Array.isArray(out) ? out : {};
  const s = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : typeof v === 'number' ? String(v) : '');
  const upd = { ai: 'done', aiErr: '' };
  const num = s(o.numero, 30).replace(/^(no\.?|n[º°o]\.?|#)\s*/i, ''); if (num && (force || !c.number)) upd.number = num;
  let f = s(o.fecha, 10); if (!ymd(f)) f = RD.dmyToIso(f); if (ymd(f) && (force || !c.date)) upd.date = f;
  const sup = s(o.proveedor, 120); if (sup && (force || !c.supplier)) upd.supplier = sup;
  const rnc = RD.normRnc(o.rnc_proveedor); if ((rnc.length === 9 || rnc.length === 11) && (force || !c.rnc)) upd.rnc = rnc;
  const mat = s(o.material, 60); if (mat) upd.material = mat;
  const qty = s(o.cantidad, 30); if (qty) upd.qty = qty;
  const tr = parseAmount(s(o.viajes, 10)); if (isNum(tr) && tr > 0 && tr < 1000) upd.trips = tr;
  const tot = parseAmount(s(o.total, 40)); if (isNum(tot) && tot >= 0 && tot < 1e12) upd.total = round2(tot);
  if (o.moneda) upd.currency = normCur(o.moneda);
  const pname = s(o.proyecto, 80);
  if (pname && !(c.projectId && S.projects.some((p) => p.id === c.projectId))) { const m = matchProject(pname); if (m) { upd.projectId = m.id; upd.projectHint = ''; } else upd.projectHint = pname; }
  return upd;
}
async function readConduceWithAI(condId, input) {
  const ref = db.doc('conduces/' + condId);
  const useImg = !!input.image;
  if (!ai.hasKey() || (!useImg && !hasText(input.text))) { await ref.update({ ai: 'off' }).catch(() => {}); return 'off'; }
  let out;
  try {
    out = await ai.json(buildCondPrompt(input.text, useImg), { images: useImg ? [input.image] : [], schema: COND_SCHEMA });
  } catch (e) {
    console.warn('lectura del conduce', e);
    if (e && AI_STOP.has(e.code)) { S.aiState = e.code === 'bad_key' ? 'badkey' : e.code; scheduleRender(); }
    await ref.update({ ai: e && e.code === 'no_key' ? 'off' : 'failed', aiErr: String((e && e.code) || '') }).catch(() => {});
    return 'failed';
  }
  if (S.aiState !== 'ok') { S.aiState = 'ok'; scheduleRender(); }
  const cur = S.conduces.find((x) => x.id === condId);
  if (!cur) return 'failed';
  await dbw(() => ref.update(parseCondAI(out, cur, !!input.force))).catch((e) => console.error(e));
  scheduleLink();
  return 'done';
}
async function rereadConduce(id, btn) {
  const c = S.conduces.find((x) => x.id === id);
  if (!c) return;
  if (!ai.hasKey()) { openSettings(); return; }
  btn.disabled = true;
  btn.textContent = 'Leyendo…';
  try {
    const input = await aiInputFor(c);
    if (!input) return;
    await db.doc('conduces/' + id).update({ ai: 'pending', aiErr: '' });
    if (S.sheet && S.sheet.type === 'cond' && S.sheet.id === id) S.sheet.dirty = false;
    const r = await enqueueAI({ condId: id, input: { ...input, force: true } });
    toast(r === 'done' ? 'Listo: datos leídos otra vez' : 'No se pudo leer este conduce');
  } catch (e) {
    console.error(e);
    toast('No se pudo leer este conduce');
    await db.doc('conduces/' + id).update({ ai: 'failed' }).catch(() => {});
  }
}
// Una "factura" que en realidad es un conduce: se guarda como conduce con el mismo archivo.
const canBeConduce = (inv, out) => !inv.fiscal && !RD.normNcf(out && out.ncf) && !S.payments.some((p) => (p.invoiceIds || []).includes(inv.id));
async function convertToConduce(inv, out) {
  const c = {
    invoiceId: null, projectId: inv.projectId || null, projectHint: inv.projectHint || '', supplier: inv.supplier || '', rnc: RD.normRnc(inv.rnc) || '',
    number: '', date: inv.date || '', total: isNum(inv.amount) ? inv.amount : null, currency: normCur(inv.currency), material: '', qty: '', trips: null,
    fileId: inv.fileId, fileType: inv.fileType, thumbId: inv.thumbId || null, pages: inv.pages || 1, fileName: inv.fileName || '',
    createdAt: inv.createdAt || new Date().toISOString(), ai: 'off', aiErr: '', auto: false, fromInvoice: true,
  };
  if (out) Object.assign(c, parseCondAI({ numero: out.conduce_numero, fecha: out.fecha, proveedor: out.proveedor, rnc_proveedor: out.rnc_proveedor, proyecto: out.proyecto, material: out.material, cantidad: out.cantidad, viajes: out.viajes, total: out.total, moneda: out.moneda }, c, true));
  const ref = db.collection('conduces').doc();
  await dbw(async () => { await ref.set(c); await db.doc('invoices/' + inv.id).delete(); });
  convertedTo.set(inv.id, ref.id);
  scheduleLink();
  return ref.id;
}
async function invoiceToConduce(id) {
  const i = S.invoices.find((x) => x.id === id);
  if (!i) return;
  if (S.payments.some((p) => (p.invoiceIds || []).includes(id))) { toast('Está en un pago; quítala del pago primero.'); return; }
  try {
    const cid = await convertToConduce(i, null);
    closeSheet();
    toast('Listo: quedó guardado como conduce');
    if (ai.hasKey()) {
      const input = await aiInputFor(i).catch(() => null);
      if (input) { await db.doc('conduces/' + cid).update({ ai: 'pending' }); enqueueAI({ condId: cid, input: { ...input, force: true } }); }
    }
    setTimeout(() => openConduce(cid), 450);
  } catch (e) {
    console.error(e);
    toast(dbErr(e));
  }
}
const linkConduce = (condId, invId) => linkConduces([condId], invId);
async function linkConduces(ids, invId) {
  const inv = S.invoices.find((x) => x.id === invId);
  const cs = ids.map((id) => S.conduces.find((x) => x.id === id)).filter(Boolean);
  if (!inv || !cs.length) return;
  const ok = await write(async () => {
    for (const c of cs) await db.doc('conduces/' + c.id).update({ invoiceId: invId, auto: false, noAuto: false, projectId: c.projectId || inv.projectId || null });
    const withP = cs.find((c) => c.projectId);
    if (!inv.projectId && withP) await db.doc('invoices/' + invId).update({ projectId: withP.projectId, projectHint: '' });
  }, cs.length > 1 ? `${cs.length} conduces adjuntados a la factura` : 'Conduce adjuntado a la factura');
  if (ok) refreshInvCondBox(invId);
}
async function saveConduce(form) {
  const id = form.dataset.id;
  const c = S.conduces.find((x) => x.id === id);
  if (!c) return;
  const btn = $('#cond-save');
  btn.disabled = true;
  const totRaw = $('#c-total').value.trim(), trRaw = $('#c-trips').value.trim();
  const tot = parseAmount(totRaw), tr = parseAmount(trRaw);
  if ((totRaw && tot == null) || (trRaw && tr == null)) { toast('Revisa el total y los viajes: escribe solo números.'); btn.disabled = false; return; }
  const date = $('#c-date').value;
  const invoiceId = $('#c-inv').value || null;
  const upd = {
    invoiceId, number: $('#c-num').value.trim().slice(0, 30), date: ymd(date) ? date : '', supplier: $('#c-sup').value.trim().slice(0, 120), projectId: $('#c-proj').value || null,
    material: $('#c-mat').value.trim().slice(0, 60), qty: $('#c-qty').value.trim().slice(0, 30), trips: tr == null ? null : tr, total: tot == null ? null : round2(tot),
  };
  if (upd.projectId) upd.projectHint = '';
  // Si se cambió (o se quitó) la factura a mano, la app no lo vuelve a enlazar sola.
  if (invoiceId !== (c.invoiceId || null)) { upd.auto = false; upd.noAuto = !invoiceId; }
  if (c.ai === 'pending' || c.ai === 'failed') upd.ai = 'off';
  const inv = invoiceId ? S.invoices.find((x) => x.id === invoiceId) : null;
  const ok = await write(async () => {
    await db.doc('conduces/' + id).update(upd);
    if (inv && !inv.projectId && upd.projectId) await db.doc('invoices/' + inv.id).update({ projectId: upd.projectId, projectHint: '' });
  }, 'Conduce guardado');
  if (ok) { closeSheet(); scheduleLink(); } else btn.disabled = false;
}
async function deleteConduce(id) {
  const c = S.conduces.find((x) => x.id === id);
  if (!c) return;
  if (!(await write(async () => { await toTrash('conduce', c, [condTitle(c), c.supplier, isNum(c.total) ? money(c.total, c.currency) : ''].filter(Boolean).join(' · ')); await db.doc('conduces/' + id).delete(); }))) return;
  closeSheet();
  toastAct('Conduce movido a la papelera', 'Deshacer', () => undoTrash('conduce', id));
}
// Después de leer o guardar algo: los conduces que esperan factura se enlazan solos si la encuentran.
let linkT = 0;
function scheduleLink() { clearTimeout(linkT); linkT = setTimeout(() => { linkPendingConduces().catch((e) => console.warn('conduces', e)); }, 400); }
async function linkPendingConduces() {
  if (!db || !S.got.conduces || !S.got.invoices || !canEdit()) return;
  const D = derive(), claimed = new Set(), filled = new Set();
  // 1) Facturas que juntan varios conduces sin decir sus números: los que suman lo mismo que la factura.
  for (const inv of D.invoices) {
    const set = condSumSet(inv, D, claimed);
    if (!set) continue;
    filled.add(inv.id);
    for (const c of set) {
      claimed.add(c.id);
      const upd = { invoiceId: inv.id, auto: true, autoWhy: 'suma' };
      if (!c.projectId && inv.projectId) upd.projectId = inv.projectId;
      await dbw(() => db.doc('conduces/' + c.id).update(upd));
    }
    const withP = set.find((c) => c.projectId);
    if (!inv.projectId && withP) await dbw(() => db.doc('invoices/' + inv.id).update({ projectId: withP.projectId, projectHint: '' }));
  }
  // 2) Cada conduce que espera: la factura que menciona su número, la del mismo monto o la que se agregó junto con él.
  for (const c of D.conduces) {
    if (c.invoiceId || c.noAuto || c.ai === 'pending' || claimed.has(c.id)) continue;
    const m = conduceMatch(c, D, filled);
    if (!m) continue;
    const upd = { invoiceId: m.inv.id, auto: true, autoWhy: m.why };
    if (!c.projectId && m.inv.projectId) upd.projectId = m.inv.projectId;
    await dbw(() => db.doc('conduces/' + c.id).update(upd));
    if (!m.inv.projectId && c.projectId) await dbw(() => db.doc('invoices/' + m.inv.id).update({ projectId: c.projectId, projectHint: '' }));
    const q = S.queue.find((x) => x.condId === c.id);
    if (q) { q.msg = `adjuntado a la factura de ${m.inv.supplier || 'su proveedor'}`; renderQueue(); }
  }
}

/* ---------- pase de lista (asistencia) ---------- */
// Cada obra tiene sus obreros y una planilla por quincena: entrada (✓ a tiempo, T tarde, x no vino), pase sorpresa
// (✓ estaba, x no estaba) y salida (✓ estaba, C corrido y se fue antes, 1½ corrido hasta la salida, x se fue antes).
const ATT_DAYS = 14;
const DOW = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
const DOW_LONG = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const ATT_E = [['ok', '✓'], ['t', 'T'], ['x', 'x']];
const ATT_P = [['ok', '✓'], ['x', 'x']];
const ATT_S = [['ok', '✓'], ['c', 'C'], ['cc', '1½'], ['x', 'x']];
const ATT_SHOW = { ok: '✓', t: 'T', x: 'x', c: 'C', cc: '1½' };
const ATT_RULES = { late: 0.5, surpriseMiss: 0, leftEarly: 0.5, corrido: 1, corridoFull: 1.5, saturday: 1, sunday: 1 };
const ROLES = ['Ayudante', 'Terminador', 'Albañil', 'Maestro', 'Carpintero', 'Varillero', 'Plomero', 'Electricista', 'Pintor', 'Ceramista', 'Soldador', 'Operador', 'Chofer', 'Sereno'];
const attRules = () => ({ ...ATT_RULES, ...(S.attRules || {}) });
function addDays(iso, n) { const d = ymd(iso); if (!d) return iso; d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
const weekStart = (iso) => { const d = ymd(iso); return d ? addDays(iso, -d.getDay()) : iso; };
const attLen = (sh) => Number(sh.days) || ATT_DAYS;
const attDate = (sh, k) => addDays(sh.start, k);
const attDow = (sh, k) => { const d = ymd(attDate(sh, k)); return d ? d.getDay() : k % 7; };
const attEnd = (sh) => attDate(sh, attLen(sh) - 1);
const fmtDays = (n) => (isNum(n) ? new Intl.NumberFormat('es-DO', { maximumFractionDigits: 2 }).format(n) : '—');
function attPeriodLabel(sh) {
  const a = ymd(sh.start), b = ymd(attEnd(sh));
  if (!a || !b) return '';
  const mon = (d) => d.toLocaleDateString('es-DO', { month: 'short' }).replace('.', '');
  return a.getMonth() === b.getMonth() ? `Del ${a.getDate()} al ${b.getDate()} de ${mon(b)} de ${b.getFullYear()}` : `Del ${a.getDate()} de ${mon(a)} al ${b.getDate()} de ${mon(b)} de ${b.getFullYear()}`;
}
// Lo que cuenta un día según las marcas y las reglas. Si ese día se trabajó medio día, todo cuenta la mitad.
function attDayValue(m, R, dow, half) {
  if (!m || !m.e) return null;
  if (m.e === 'x') return 0;
  let v = m.s === 'c' ? R.corrido : m.s === 'cc' ? R.corridoFull : m.s === 'x' ? R.leftEarly : 1;
  if (m.e === 't') v -= R.late;
  if (m.p === 'x') v -= R.surpriseMiss;
  if (dow === 6) v *= R.saturday;
  if (dow === 0) v *= R.sunday;
  if (half) v *= 0.5;
  return Math.max(0, round2(v));
}
// Días de medio día de la planilla (por ejemplo, un feriado en que se trabaja hasta el mediodía).
const attHalf = (sh, k) => !!(sh && sh.half && sh.half[k]);
const attIdxOf = (sh, iso) => Math.round((ymd(iso) - ymd(sh.start)) / 864e5);
const attHalfDays = (sh) => Array.from({ length: attLen(sh) }, (_, j) => j).filter((j) => attHalf(sh, j));
// Cambios que se están guardando (se ven al instante, se guardan un momento después).
let attPend = null, attTimer = 0, attJustMade = '';
const attMarks = (sh) => (attPend && attPend.id === sh.id ? attPend.marks : sh.marks || {});
const attSurprise = (sh) => (attPend && attPend.id === sh.id ? attPend.surprise : sh.surprise || {});
function attTotals(sh, wid, R) {
  const t = { days: 0, worked: 0, late: 0, absent: 0, surpriseMiss: 0, corrido: 0, corridoFull: 0, leftEarly: 0, noExit: 0 };
  const ms = attMarks(sh)[wid] || {};
  const today = todayISO();
  for (let k = 0; k < attLen(sh); k++) {
    const m = ms[k];
    if (!m || !m.e) continue;
    t.days = round2(t.days + attDayValue(m, R, attDow(sh, k), attHalf(sh, k)));
    if (m.e !== 'x') t.worked++;
    if (m.e === 't') t.late++;
    if (m.e === 'x') t.absent++;
    if (m.p === 'x') t.surpriseMiss++;
    if (m.s === 'c') t.corrido++;
    if (m.s === 'cc') t.corridoFull++;
    if (m.s === 'x') t.leftEarly++;
    if (m.e !== 'x' && !m.s && attDate(sh, k) < today) t.noExit++;
  }
  return t;
}
const attSheetsOf = (pid) => S.asistencia.filter((a) => a.projectId === pid && ymd(a.start)).sort((a, b) => String(b.start).localeCompare(String(a.start)));
const attWorkersOf = (pid, all) => S.workers.filter((w) => w.projectId === pid && (all || w.active !== false)).sort((a, b) => (a.seq || 0) - (b.seq || 0) || String(a.name || '').localeCompare(String(b.name || '')));
function attSheetWorkers(sh) {
  const byId = new Map(S.workers.map((w) => [w.id, w]));
  const ids = Array.isArray(sh.workers) ? sh.workers : [];
  return ids.map((id) => byId.get(id)).filter(Boolean);
}
function attTodayIdx(sh) { const k = Math.round((ymd(todayISO()) - ymd(sh.start)) / 864e5); return k >= 0 && k < attLen(sh) ? k : 0; }
function attEdit(sh, fn) {
  if (!attPend || attPend.id !== sh.id) { flushAtt(); attPend = { id: sh.id, v: 0, marks: JSON.parse(JSON.stringify(sh.marks || {})), surprise: { ...(sh.surprise || {}) } }; }
  fn(attPend.marks, attPend.surprise);
  attPend.v++;
  clearTimeout(attTimer);
  attTimer = setTimeout(flushAtt, 350);
  renderAll();
}
function flushAtt() {
  clearTimeout(attTimer);
  const p = attPend;
  if (!p || !db) return Promise.resolve();
  const v = p.v;
  return dbw(() => db.doc('asistencia/' + p.id).update({ marks: p.marks, surprise: p.surprise, updatedAt: new Date().toISOString() }))
    .then(() => { if (attPend === p && p.v === v) attPend = null; })
    .catch((e) => { console.error(e); toast(dbErr(e)); });
}
function attCurrent(D) {
  const pid = S.attProject;
  const sheets = attSheetsOf(pid);
  let sh = sheets.find((x) => x.id === S.attSheet);
  // La quincena que se acaba de crear todavía no llega a la lista: se sigue esperando por ella.
  if (!sh && S.attSheet && S.attSheet === attJustMade) return { pid, sheets, sh: sheets[0] || null };
  if (!sh) {
    const today = todayISO();
    sh = sheets.find((x) => x.start <= today && today <= attEnd(x)) || sheets[0] || null;
    S.attSheet = sh ? sh.id : '';
    if (sh) S.attDay = attTodayIdx(sh);
  }
  if (sh && (S.attDay < 0 || S.attDay >= attLen(sh))) S.attDay = 0;
  return { pid, sheets, sh };
}
const markBtns = (wid, f, opts, cur, dis) => opts.map(([v, l]) => `<button type="button" class="am am-${v}" data-act="att-mark" data-w="${esc(wid)}" data-f="${f}" data-v="${v}" aria-pressed="${cur === v}"${dis}>${l}</button>`).join('');
function renderAsistencia(D) {
  const el = $('#v-asistencia');
  if (!S.got.workers || !S.got.asistencia || !S.got.projects) { el.innerHTML = S.dbState === 'absent' ? '' : '<p class="loading">Cargando…</p>'; return; }
  if (!D.projects.length) { el.innerHTML = '<div class="empty"><h2>Pase de lista</h2><p>Primero agrega la obra en <b>Proyectos</b>. Después anotas sus obreros y pasas la lista cada día.</p><button type="button" class="btn" data-act="tab" data-tab="proyectos">Ir a Proyectos</button></div>'; return; }
  if (!D.projById.has(S.attProject)) { const withW = D.projects.find((p) => S.workers.some((w) => w.projectId === p.id && w.active !== false)); S.attProject = (withW || D.projects[0]).id; S.attSheet = ''; }
  const { pid, sheets, sh } = attCurrent(D);
  const edit = canEdit();
  const dis = edit ? '' : ' disabled';
  const workers = attWorkersOf(pid);
  const chips = `<div class="chips" role="group" aria-label="Obra">${D.projects.map((p) => `<button type="button" class="chip" data-act="att-proj" data-p="${esc(p.id)}" aria-pressed="${p.id === pid}"><i class="dot" style="--c:${p.color}"></i><span>${esc(p.name)}</span></button>`).join('')}</div>`;
  const bar = `<div class="att-bar"><button type="button" class="btn sm" data-act="att-workers">Obreros (${workers.length})</button><button type="button" class="btn sm ghost" data-act="att-rules">Reglas</button></div>`;
  if (!workers.length && !sh) { el.innerHTML = chips + bar + `<div class="empty"><h2>Anota los obreros de esta obra</h2><p>Nombre, función (ayudante, terminador…) y pago por día. Se anotan una sola vez; después cada día solo marcas la entrada, el pase sorpresa y la salida.</p>${edit ? '<button type="button" class="btn primary" data-act="att-workers">Agregar obreros</button>' : ''}</div>`; return; }
  if (!sh) { el.innerHTML = chips + bar + `<div class="empty"><h2>Empieza la quincena</h2><p>La planilla dura 14 días, de domingo a sábado dos veces, igual que la de papel.</p>${edit ? '<button type="button" class="btn primary" data-act="att-new">Empezar quincena</button>' : ''}</div>`; return; }
  const R = attRules();
  const k = S.attDay;
  const marks = attMarks(sh), surprise = attSurprise(sh);
  const rows = attSheetWorkers(sh);
  const idx = sheets.findIndex((x) => x.id === sh.id);
  const dayBtns = Array.from({ length: attLen(sh) }, (_, j) => {
    const d = ymd(attDate(sh, j));
    const done = rows.length && rows.every((w) => marks[w.id] && marks[w.id][j] && marks[w.id][j].e);
    return `<button type="button" class="att-day${attDate(sh, j) === todayISO() ? ' today' : ''}${done ? ' done' : ''}${attHalf(sh, j) ? ' half' : ''}" data-act="att-day" data-k="${j}" aria-pressed="${j === k}"${attHalf(sh, j) ? ' title="Medio día"' : ''}><span>${DOW[d.getDay()]}${attHalf(sh, j) ? ' ½' : ''}</span><b>${d.getDate()}</b></button>`;
  }).join('');
  const dayDate = ymd(attDate(sh, k));
  const ptime = surprise[k] || '';
  const list = rows.map((w) => {
    const m = (marks[w.id] || {})[k] || {};
    const v = attDayValue(m, R, attDow(sh, k), attHalf(sh, k));
    return `<div class="att-row"><div class="att-who"><b>${esc(w.name)}</b><small>${esc(w.role || '')}${w.active === false ? ' · ya no trabaja aquí' : ''}</small><span class="att-val${v === null ? ' empty' : ''}">${v === null ? '—' : fmtDays(v)}</span></div>
      <div class="att-marks"><div class="att-g" role="group" aria-label="Entrada"><span>E</span>${markBtns(w.id, 'e', ATT_E, m.e, dis)}</div><div class="att-g" role="group" aria-label="Pase sorpresa"><span>P</span>${markBtns(w.id, 'p', ATT_P, m.p, dis)}</div><div class="att-g" role="group" aria-label="Salida"><span>S</span>${markBtns(w.id, 's', ATT_S, m.s, dis)}</div></div></div>`;
  }).join('');
  const tots = rows.map((w) => ({ w, t: attTotals(sh, w.id, R) }));
  const payOf = (x) => (isNum(x.w.pay) ? round2(x.t.days * x.w.pay) : null);
  const totalPay = round2(tots.reduce((s, x) => s + (payOf(x) || 0), 0));
  const totalDays = round2(tots.reduce((s, x) => s + x.t.days, 0));
  const noExit = tots.reduce((s, x) => s + x.t.noExit, 0);
  const sumRows = tots.map((x) => `<tr><td><span class="pname">${esc(x.w.name)}</span><small class="att-sub">${esc([x.t.late ? plural(x.t.late, 'tarde', 'tardes') : '', x.t.absent ? plural(x.t.absent, 'falta', 'faltas') : '', x.t.surpriseMiss ? `${x.t.surpriseMiss} sin estar en el pase` : '', x.t.corrido ? `${x.t.corrido} C` : '', x.t.corridoFull ? `${x.t.corridoFull} de 1½` : '', x.t.leftEarly ? `${x.t.leftEarly} se fue antes` : ''].filter(Boolean).join(' · '))}</small></td><td class="num">${fmtDays(x.t.days)}</td><td class="num">${payOf(x) === null ? '—' : esc(money(payOf(x)))}</td></tr>`).join('');
  const ruleTxt = [R.late ? `T descuenta ${fmtDays(R.late)} día` : 'T no descuenta', R.surpriseMiss ? `x en el pase descuenta ${fmtDays(R.surpriseMiss)} día` : 'x en el pase no descuenta', `x en la salida cuenta ${fmtDays(R.leftEarly)}`, `C cuenta ${fmtDays(R.corrido)}`, `1½ cuenta ${fmtDays(R.corridoFull)}`, R.saturday !== 1 ? `el sábado vale ${fmtDays(R.saturday)}` : '', R.sunday !== 1 ? `el domingo vale ${fmtDays(R.sunday)}` : ''].filter(Boolean).join(' · ');
  // En la computadora: la quincena entera como la planilla de papel (obreros por días); tocando un día se marca abajo.
  const nDays = attLen(sh);
  const cellMark = (m) => (!m || !m.e ? '' : m.e === 'x' ? 'x' : [ATT_SHOW[m.e] || '', m.p ? ATT_SHOW[m.p] || '' : '·', m.s ? ATT_SHOW[m.s] || '' : '·'].join('\u2009'));
  const plan = wide() && rows.length ? `<div class="card att-plan"><div class="att-plan-in"><table class="tbl att-tbl"><colgroup><col class="w-aname">${'<col>'.repeat(nDays)}<col class="w-adays"><col class="w-apay"></colgroup><thead><tr><th><span class="th-txt">Obrero</span></th>${Array.from({ length: nDays }, (_, j) => { const d = ymd(attDate(sh, j)); return `<th class="att-h${j === k ? ' on' : ''}${attDate(sh, j) === todayISO() ? ' today' : ''}"><button type="button" class="th-sort" data-act="att-day" data-k="${j}" aria-pressed="${j === k}">${DOW[d.getDay()]} <b>${d.getDate()}</b>${attHalf(sh, j) ? ' <i class="att-half-mk" title="Medio día">½</i>' : ''}</button></th>`; }).join('')}<th class="r"><span class="th-txt">Días</span></th><th class="r"><span class="th-txt">Pago</span></th></tr></thead><tbody>${tots.map((x) => `<tr><td class="c-aname"><b>${esc(x.w.name)}</b><small>${esc(x.w.role || '')}</small></td>${Array.from({ length: nDays }, (_, j) => { const m = (marks[x.w.id] || {})[j]; const v = attDayValue(m, R, attDow(sh, j), attHalf(sh, j)); return `<td class="att-c${j === k ? ' on' : ''}${m && m.e === 'x' ? ' abs' : ''}" data-act="att-day" data-k="${j}"><span>${esc(cellMark(m))}</span>${v === null ? '' : `<small>${esc(fmtDays(v))}</small>`}</td>`; }).join('')}<td class="r mono">${esc(fmtDays(x.t.days))}</td><td class="r mono">${isNum(payOf(x)) ? esc(money(payOf(x))) : '—'}</td></tr>`).join('')}</tbody></table></div><p class="usage">En cada día: entrada · pase sorpresa · salida, y lo que cuenta. Toca un día para marcarlo abajo.</p></div>` : '';
  el.innerHTML = chips + bar + `
    <div class="card att-head">
      <div class="att-period"><button type="button" class="icon-btn" data-act="att-prev" aria-label="Quincena anterior"${idx < sheets.length - 1 ? '' : ' disabled'}>‹</button><b>${esc(attPeriodLabel(sh))}</b><button type="button" class="icon-btn" data-act="att-next" aria-label="Quincena siguiente"${idx > 0 ? '' : ' disabled'}>›</button></div>
      <div class="fields"><div class="field"><label for="att-in">Entrada hasta las</label><input id="att-in" maxlength="8" placeholder="7:30" value="${esc(sh.entryLimit || '')}"${dis}></div><div class="field"><label for="att-out">Salida desde las</label><input id="att-out" maxlength="8" placeholder="5:00" value="${esc(sh.exitFrom || '')}"${dis}></div></div>
      ${edit && idx === 0 ? '<button type="button" class="btn sm" data-act="att-new">Empezar la quincena siguiente</button>' : ''}
    </div>
    ${plan}
    <div class="att-days" role="group" aria-label="Día">${dayBtns}</div>
    <div class="att-quick"><b>${esc(DOW_LONG[dayDate.getDay()].replace(/^./, (c) => c.toUpperCase()) + ' ' + fmtDate(attDate(sh, k)))}${!edit && attHalf(sh, k) ? ' · medio día' : ''}</b>
      ${edit ? `<div class="seg att-jornada" role="group" aria-label="Jornada de este día"><button type="button" data-act="att-half" data-v="0" aria-pressed="${!attHalf(sh, k)}"><span>Día entero</span></button><button type="button" data-act="att-half" data-v="1" aria-pressed="${attHalf(sh, k)}"><span>Medio día</span></button></div>` : ''}
      ${edit && rows.length ? `<div class="actions"><button type="button" class="btn sm" data-act="att-all" data-f="e">Entrada: todos ✓</button><button type="button" class="btn sm" data-act="att-surprise">${ptime ? 'Pase sorpresa: ' + esc(ptime) : 'Pase sorpresa ahora'}</button><button type="button" class="btn sm" data-act="att-all" data-f="s">Salida: todos ✓</button></div>` : ''}
      ${ptime && edit ? `<label class="att-ptime">Hora del pase sorpresa <input type="time" id="att-ptime" value="${esc(/^\d{1,2}:\d{2}$/.test(ptime) ? ptime.padStart(5, '0') : '')}"></label>` : ''}
    </div>
    ${rows.length ? `<div class="att-list">${list}</div>` : '<div class="empty"><p>Esta planilla no tiene obreros. Agrégalos en <b>Obreros</b>.</p></div>'}
    ${rows.length ? `<div class="card"><h2>Resumen de la quincena</h2>${noExit ? `<div class="msg warn">${ICON.alert}<span>${plural(noExit, 'día tiene', 'días tienen')} la entrada marcada pero no la salida; cuentan como día completo hasta que la marques.</span></div>` : ''}<div class="table-wrap"><table class="sum"><thead><tr><th>Obrero</th><th class="num">Días</th><th class="num">Pago</th></tr></thead><tbody>${sumRows}</tbody><tfoot><tr><td>Total</td><td class="num">${fmtDays(totalDays)}</td><td class="num">${esc(money(totalPay))}</td></tr></tfoot></table></div>
      <div class="actions"><button type="button" class="btn" data-act="att-xlsx">${ICON.sheet} Excel</button><button type="button" class="btn" data-act="att-pdf">${ICON.down} PDF de la planilla</button><button type="button" class="btn ghost" data-act="att-blank">Planilla en blanco para imprimir</button></div>
      <p class="usage">${attHalfDays(sh).length ? `Medio día: ${esc(attHalfDays(sh).map((j) => { const d = ymd(attDate(sh, j)); return DOW_LONG[d.getDay()] + ' ' + d.getDate(); }).join(', '))}. ` : ''}${esc(ruleTxt)}. Se cambian en <b>Reglas</b>.</p></div>` : ''}`;
}
// Obreros de la obra: se anotan una vez; los que se van quedan en las planillas viejas.
function openWorkers() {
  const D = derive();
  const p = D.projById.get(S.attProject);
  if (!p) return;
  const all = attWorkersOf(p.id, true);
  const edit = canEdit();
  const row = (w) => `<div class="w-row" data-w="${esc(w.id)}"><input data-wf="name" maxlength="60" value="${esc(w.name || '')}" aria-label="Nombre"${edit ? '' : ' disabled'}><input data-wf="role" list="dl-roles" maxlength="40" value="${esc(w.role || '')}" placeholder="Función" aria-label="Función"${edit ? '' : ' disabled'}><input data-wf="pay" class="mono" inputmode="decimal" maxlength="10" value="${esc(amountInput(w.pay))}" placeholder="Pago/día" aria-label="Pago por día"${edit ? '' : ' disabled'}>${edit ? `<button type="button" class="btn ghost sm" data-act="att-w-toggle" data-id="${esc(w.id)}">${w.active === false ? 'Volver' : 'Ya no está'}</button>` : ''}</div>`;
  const act = all.filter((w) => w.active !== false), gone = all.filter((w) => w.active === false);
  openSheet(`${sheetHead('Obreros de ' + esc(p.name))}<div class="sheet-b">
    <p class="hint">Escribe y pasa a otra casilla: se guarda solo. El pago por día es para el resumen de la quincena (RD$).</p>
    <div class="w-list">${act.map(row).join('') || '<p class="hint">Todavía no hay obreros.</p>'}</div>
    ${edit ? `<form id="w-add" class="w-row add" autocomplete="off"><input id="w-name" maxlength="60" placeholder="Nombre" required><input id="w-role" list="dl-roles" maxlength="40" placeholder="Función"><input id="w-pay" class="mono" inputmode="decimal" maxlength="10" placeholder="Pago/día"><button type="submit" class="btn primary sm">Agregar</button></form>` : ''}
    ${gone.length ? `<details class="edit"><summary>Ya no trabajan aquí (${gone.length})</summary><div class="w-list">${gone.map(row).join('')}</div></details>` : ''}
  </div><datalist id="dl-roles">${uniqList([...ROLES, ...S.workers.map((w) => w.role)]).map((v) => `<option value="${esc(v)}"></option>`).join('')}</datalist>`, { type: 'workers', id: p.id });
}
async function addWorker() {
  const name = $('#w-name').value.trim();
  if (!name) return;
  const payRaw = $('#w-pay').value.trim();
  const pay = payRaw ? parseAmount(payRaw) : null;
  if (payRaw && pay == null) { toast('Escribe el pago por día solo con números.'); return; }
  const pid = S.attProject;
  const seq = S.workers.reduce((m, w) => Math.max(m, Number(w.seq) || 0), 0) + 1;
  const ref = db.collection('workers').doc();
  const ok = await write(async () => {
    await ref.set({ projectId: pid, name: name.slice(0, 60), role: $('#w-role').value.trim().slice(0, 40), pay: pay == null ? null : round2(pay), active: true, seq, createdAt: new Date().toISOString() });
    // Entra también en la quincena de ahora (y en las que vengan).
    const sh = attSheetsOf(pid)[0];
    if (sh && sh.start <= todayISO() && !(sh.workers || []).includes(ref.id)) await db.doc('asistencia/' + sh.id).update({ workers: [...(sh.workers || []), ref.id] });
    else if (sh && sh.start > todayISO() && !(sh.workers || []).includes(ref.id)) await db.doc('asistencia/' + sh.id).update({ workers: [...(sh.workers || []), ref.id] });
  }, 'Obrero agregado');
  if (!ok) return;
  setTimeout(() => { if (S.sheet && S.sheet.type === 'workers') { openWorkers(); const n = $('#w-name'); if (n) n.focus(); } }, 150);
}
async function saveWorkerField(input) {
  const row = input.closest('[data-w]');
  if (!row) return;
  const id = row.dataset.w, f = input.dataset.wf;
  let v = input.value.trim();
  if (f === 'name' && !v) { toast('El nombre no puede quedar vacío.'); return; }
  if (f === 'pay') { const n = v ? parseAmount(v) : null; if (v && n == null) { toast('Escribe el pago por día solo con números.'); return; } v = n == null ? null : round2(n); }
  await write(() => db.doc('workers/' + id).update({ [f]: f === 'name' ? v.slice(0, 60) : f === 'role' ? v.slice(0, 40) : v }), 'Guardado');
}
async function toggleWorker(id) {
  const w = S.workers.find((x) => x.id === id);
  if (!w) return;
  const back = w.active === false;
  const ok = await write(async () => {
    await db.doc('workers/' + id).update({ active: back });
    const sh = attSheetsOf(w.projectId)[0];
    if (!sh) return;
    const ids = sh.workers || [];
    const marked = Object.values(attMarks(sh)[id] || {}).some((m) => m && (m.e || m.p || m.s));
    if (back && !ids.includes(id)) await db.doc('asistencia/' + sh.id).update({ workers: [...ids, id] });
    if (!back && ids.includes(id) && !marked) await db.doc('asistencia/' + sh.id).update({ workers: ids.filter((x) => x !== id) });
  }, back ? 'Volvió a la lista' : 'Ya no sale en las planillas nuevas');
  if (ok) setTimeout(() => { if (S.sheet && S.sheet.type === 'workers') openWorkers(); }, 150);
}
async function newAttSheet() {
  const pid = S.attProject;
  const last = attSheetsOf(pid)[0];
  const start = last ? addDays(attEnd(last), 1) : weekStart(todayISO());
  const ref = db.collection('asistencia').doc();
  const ok = await write(() => ref.set({ projectId: pid, start, days: ATT_DAYS, entryLimit: last ? last.entryLimit || '' : '', exitFrom: last ? last.exitFrom || '' : '', workers: attWorkersOf(pid).map((w) => w.id), marks: {}, surprise: {}, createdAt: new Date().toISOString() }), 'Quincena lista');
  if (ok) { attJustMade = ref.id; S.attSheet = ref.id; S.attDay = attTodayIdx({ start, days: ATT_DAYS }); renderAll(); }
}
function attMark(wid, f, v) {
  const { sh } = attCurrent(derive());
  if (!sh || !canEdit()) return;
  const k = S.attDay;
  attEdit(sh, (marks) => {
    const day = ((marks[wid] = marks[wid] || {})[k] = { ...(marks[wid][k] || {}) });
    day[f] = day[f] === v ? '' : v;
    // Si no vino, no hay pase ni salida.
    if (f === 'e' && day.e === 'x') { day.p = ''; day.s = ''; }
    if ((f === 'p' || f === 's') && day[f] && !day.e) day.e = 'ok';
  });
}
function attAll(f) {
  const { sh } = attCurrent(derive());
  if (!sh || !canEdit()) return;
  const k = S.attDay;
  attEdit(sh, (marks) => {
    for (const w of attSheetWorkers(sh)) {
      const day = ((marks[w.id] = marks[w.id] || {})[k] = { ...(marks[w.id][k] || {}) });
      if (f === 'e' && !day.e) day.e = 'ok';
      if (f !== 'e' && day.e !== 'x' && !day[f]) { day[f] = 'ok'; if (!day.e) day.e = 'ok'; }
    }
  });
}
function attSurpriseNow() {
  const { sh } = attCurrent(derive());
  if (!sh || !canEdit()) return;
  const k = S.attDay;
  const now = new Date();
  attEdit(sh, (marks, surprise) => {
    if (!surprise[k]) surprise[k] = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
    for (const w of attSheetWorkers(sh)) {
      const day = ((marks[w.id] = marks[w.id] || {})[k] = { ...(marks[w.id][k] || {}) });
      if (day.e && day.e !== 'x' && !day.p) day.p = 'ok';
    }
  });
  toast('Pase sorpresa: los que llegaron quedan con ✓. Marca con x a los que no estaban.');
}
// Día entero o medio día: se escoge en cada día. Si otras obras tienen planilla ese día, se ofrece ponerles lo mismo.
async function attSetHalf(on) {
  const { sh } = attCurrent(derive());
  if (!sh || !canEdit()) return;
  const k = S.attDay, date = attDate(sh, k);
  if (attHalf(sh, k) === on) return;
  if (!(await setAttHalf(sh, k, on))) return;
  const d = ymd(date);
  const what = `${on ? 'Medio día' : 'Día entero'} el ${DOW_LONG[d.getDay()]} ${d.getDate()}`;
  const others = S.asistencia.filter((x) => x.id !== sh.id && ymd(x.start) && x.start <= date && date <= attEnd(x) && attHalf(x, attIdxOf(x, date)) !== on);
  if (!others.length) { toast(what + '.'); return; }
  toastAct(`${what} en esta obra.`, others.length === 1 ? 'También en la otra obra' : `También en las otras ${others.length}`, async () => {
    for (const x of others) if (!(await setAttHalf(x, attIdxOf(x, date), on))) return;
    toast(`${what} en todas las obras.`);
  });
}
function setAttHalf(sh, k, on) {
  const half = { ...(sh.half || {}) };
  if (on) half[k] = true; else delete half[k];
  return write(() => db.doc('asistencia/' + sh.id).update({ half, updatedAt: new Date().toISOString() }));
}
function openAttRules() {
  const R = attRules();
  const sel = (id, label, opts, v) => `<div class="field full"><label for="${id}">${label}</label><select id="${id}">${opts.map(([val, l]) => `<option value="${val}"${Number(val) === Number(v) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></div>`;
  const ded = [['0', 'No se descuenta'], ['0.25', 'Se descuenta ¼ de día'], ['0.5', 'Se descuenta ½ día'], ['1', 'No se paga el día']];
  openSheet(`<form id="att-rules-form" autocomplete="off">${sheetHead('Reglas del pase de lista')}<div class="sheet-b">
    <p class="hint">Así cuenta la app los días a pagar de cada obrero. Valen para todas las obras. Para un día de medio día (un feriado, por ejemplo), escoge <b>Medio día</b> en ese día de la planilla.</p>
    <div class="fields">
      ${sel('ar-late', 'Llegó después de la hora límite (T)', ded, R.late)}
      ${sel('ar-sm', 'No estaba en el pase sorpresa (x)', ded, R.surpriseMiss)}
      ${sel('ar-le', 'Se fue antes (x en la salida)', [['0.5', 'Cuenta ½ día'], ['0', 'No se paga el día'], ['1', 'Cuenta el día completo']], R.leftEarly)}
      ${sel('ar-c', 'Siguió corrido y se fue antes (C)', [['1', 'Cuenta 1 día'], ['0.5', 'Cuenta ½ día']], R.corrido)}
      ${sel('ar-cc', 'Siguió corrido hasta la salida (1½)', [['1.5', 'Cuenta día y medio'], ['1', 'Cuenta 1 día']], R.corridoFull)}
      ${sel('ar-sat', 'Sábado', [['1', 'Día entero, como cualquier día'], ['0.5', 'Todos los sábados valen medio día']], R.saturday)}
      ${sel('ar-sun', 'Domingo', [['1', 'Como cualquier día'], ['1.5', 'Vale día y medio'], ['2', 'Vale doble']], R.sunday)}
    </div></div><div class="sheet-f"><button type="submit" class="btn primary block">Guardar</button></div></form>`, { type: 'att-rules' });
}
async function saveAttRules() {
  const g = (id) => Number($(id).value);
  const data = { late: g('#ar-late'), surpriseMiss: g('#ar-sm'), leftEarly: g('#ar-le'), corrido: g('#ar-c'), corridoFull: g('#ar-cc'), saturday: g('#ar-sat'), sunday: g('#ar-sun'), rev: 3, updatedAt: new Date().toISOString() };
  if (await write(() => db.doc('settings/asistencia').set(data), 'Reglas guardadas')) { S.attRules = data; closeSheet(); renderAll(); }
}
// Excel de la quincena: la planilla con las marcas y el resumen para pagar.
function attWorkbook(sh, proj) {
  const { XS, sheetXml, buildXlsx } = FILES;
  const R = attRules();
  const st = S.settings || {};
  const rows = attSheetWorkers(sh);
  const marks = attMarks(sh), surprise = attSurprise(sh);
  const n = attLen(sh);
  const top = [[{ v: st.company || 'Pase de lista', s: XS.title }], [{ v: `Pase de lista · ${proj.name} · ${attPeriodLabel(sh)}`, s: XS.bold }], [{ v: [`Entrada hasta las ${sh.entryLimit || '—'}`, `Salida desde las ${sh.exitFrom || '—'}`, 'Generado el ' + fmtDate(todayISO())].join(' · '), s: XS.muted }]];
  const g = [...top];
  const h1 = [{ v: '', s: XS.head }, { v: '', s: XS.head }, { v: '', s: XS.head }], h2 = [{ v: 'No.', s: XS.head }, { v: 'Obrero', s: XS.head }, { v: 'Función', s: XS.head }];
  for (let k = 0; k < n; k++) { const d = ymd(attDate(sh, k)); h1.push({ v: `${DOW[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}${attHalf(sh, k) ? ' ½' : ''}`, s: XS.head }, { v: '', s: XS.head }, { v: '', s: XS.head }); h2.push({ v: 'E', s: XS.head }, { v: 'P', s: XS.head }, { v: 'S', s: XS.head }); }
  for (const x of ['Días a pagar', 'Pago por día', 'Total']) { h1.push({ v: '', s: XS.head }); h2.push({ v: x, s: XS.headR }); }
  g[3] = h1; g[4] = h2;
  let total = 0;
  rows.forEach((w, j) => {
    const t = attTotals(sh, w.id, R);
    const pay = isNum(w.pay) ? round2(t.days * w.pay) : null;
    if (pay) total = round2(total + pay);
    const r = [{ v: j + 1, s: XS.int }, { v: w.name || '' }, { v: w.role || '' }];
    for (let k = 0; k < n; k++) { const m = (marks[w.id] || {})[k] || {}; r.push({ v: ATT_SHOW[m.e] || '' }, { v: ATT_SHOW[m.p] || '' }, { v: ATT_SHOW[m.s] || '' }); }
    r.push({ v: t.days }, isNum(w.pay) ? { v: w.pay, s: XS.money } : { v: '' }, pay == null ? { v: '' } : { v: pay, s: XS.money });
    g.push(r);
  });
  const pr = [{ v: '' }, { v: 'Hora del pase sorpresa', s: XS.bold }, { v: '' }];
  for (let k = 0; k < n; k++) pr.push({ v: surprise[k] || '' }, { v: '' }, { v: '' });
  g.push(pr);
  const tr = [{ v: '' }, { v: 'Total', s: XS.totLabel }, { v: '' }];
  for (let k = 0; k < n * 3 + 2; k++) tr.push({ v: '', s: XS.totBlank });
  tr.push({ v: total, s: XS.totMoney });
  g.push(tr);
  g.push([]);
  g.push([{ v: 'E: ✓ llegó a tiempo · T llegó después de la hora límite · x no vino.   P: ✓ estaba · x no estaba.   S: ✓ estaba a la salida · C siguió corrido sin almorzar y se fue antes · 1½ siguió corrido hasta la salida · x se fue antes.' + (attHalfDays(sh).length ? '   ½ = ese día se trabajó medio día y todo cuenta la mitad.' : ''), s: XS.muted }]);
  const widths = [5, 24, 14, ...Array(n * 3).fill(3.6), 12, 13, 14];
  // Resumen para pagar.
  const rs = [...top];
  rs[4] = ['Obrero', 'Función', 'Días a pagar', 'Tardanzas', 'Faltas', 'No estaba en el pase', 'Se fue antes', 'C', '1½', 'Pago por día', 'Total'].map((v, j) => ({ v, s: j < 2 ? XS.head : XS.headR }));
  rows.forEach((w) => {
    const t = attTotals(sh, w.id, R);
    rs.push([{ v: w.name || '' }, { v: w.role || '' }, { v: t.days }, { v: t.late, s: XS.int }, { v: t.absent, s: XS.int }, { v: t.surpriseMiss, s: XS.int }, { v: t.leftEarly, s: XS.int }, { v: t.corrido, s: XS.int }, { v: t.corridoFull, s: XS.int }, isNum(w.pay) ? { v: w.pay, s: XS.money } : { v: '' }, isNum(w.pay) ? { v: round2(t.days * w.pay), s: XS.money } : { v: '' }]);
  });
  rs.push([{ v: 'Total', s: XS.totLabel }, { v: '', s: XS.totBlank }, { v: round2(rows.reduce((s, w) => s + attTotals(sh, w.id, R).days, 0)), s: XS.totBlank }, ...Array(7).fill(0).map(() => ({ v: '', s: XS.totBlank })), { v: total, s: XS.totMoney }]);
  const footer = `&L${(st.company || 'Pase de lista').replace(/&/g, '&&')}&C${('Pase de lista ' + proj.name).replace(/&/g, '&&')}&RPágina &P de &N`;
  return buildXlsx([
    { name: 'Resumen', xml: sheetXml(rs, { widths: [26, 14, 12, 11, 9, 13, 12, 6, 6, 13, 15], selected: true, landscape: true, footer }) },
    { name: 'Planilla', xml: sheetXml(g, { widths, freeze: 5, landscape: true, fitWidth: 1, footer }) },
  ], { title: 'Pase de lista - ' + proj.name, creator: st.preparedBy || 'Facturas de Proyectos', names: [] });
}
// PDF como la planilla de papel (carta acostada). En blanco: con los nombres y sin marcas, para imprimir.
async function attPdf(sh, proj, blank) {
  const { PDFDocument, StandardFonts, rgb } = await pdflib();
  const out = await PDFDocument.create();
  const font = await out.embedFont(StandardFonts.Helvetica);
  const bold = await out.embedFont(StandardFonts.HelveticaBold);
  out.setTitle(pdfSafe('Pase de lista - ' + proj.name));
  out.setCreator(PDF_CREATOR);
  const R = attRules();
  const W = 792, H = 612, M = 24;
  const ink = rgb(0.08, 0.11, 0.16), grey = rgb(0.38, 0.42, 0.48), line = rgb(0.55, 0.58, 0.63), band = rgb(0.92, 0.93, 0.95);
  const n = attLen(sh);
  const people = attSheetWorkers(sh);
  const rows = blank ? [...people, ...Array(Math.max(0, 17 - people.length)).fill(null)] : people;
  const marks = blank ? {} : attMarks(sh), surprise = blank ? {} : attSurprise(sh);
  const cNo = 16, cName = 96, cRole = 56, cTot = blank ? 0 : 82;
  const dayW = (W - 2 * M - cNo - cName - cRole - cTot) / n, cw = dayW / 3;
  const rowH = 15, headH = 28;
  const T = (pg, s, x, y, size, f = font, color = ink) => pg.drawText(pdfSafe(s), { x, y, size, font: f, color });
  const C = (pg, s, cx, y, size, f = font, color = ink) => { const t = pdfSafe(s); pg.drawText(t, { x: cx - f.widthOfTextAtSize(t, size) / 2, y, size, font: f, color }); };
  const fit = (s, f, size, w) => { let t = pdfSafe(s); while (t.length > 1 && f.widthOfTextAtSize(t, size) > w) t = t.slice(0, -1); return t; };
  const check = (pg, cx, cy) => { pg.drawLine({ start: { x: cx - 2.6, y: cy }, end: { x: cx - 0.6, y: cy - 2.2 }, thickness: 1.1, color: ink }); pg.drawLine({ start: { x: cx - 0.6, y: cy - 2.2 }, end: { x: cx + 3, y: cy + 2.8 }, thickness: 1.1, color: ink }); };
  const perPage = Math.max(1, Math.floor((H - 2 * M - 70 - headH - 2 * rowH - 50) / rowH));
  const x0 = M, xDays = M + cNo + cName + cRole, xTot = xDays + n * dayW;
  for (let start = 0; start < Math.max(rows.length, 1); start += perPage) {
    const pg = out.addPage([W, H]);
    let y = H - M;
    T(pg, 'PASE DE LISTA — ' + proj.name, M, y - 12, 14, bold);
    T(pg, S.settings.company || '', W - M - font.widthOfTextAtSize(pdfSafe(S.settings.company || ''), 8), y - 10, 8, font, grey);
    y -= 28;
    T(pg, `Obreros por la casa   ·   Entrada hasta las: ${sh.entryLimit || '______'}   ·   Salida desde las: ${sh.exitFrom || '______'}   ·   ${attPeriodLabel(sh)}`, M, y, 9, font, ink);
    y -= 14;
    T(pg, 'E = entrada · P = pase sorpresa · S = salida' + (attHalfDays(sh).length ? ' · ½ = medio día (ese día todo cuenta la mitad)' : ''), M, y, 8, font, grey);
    y -= 12;
    const top = y;
    pg.drawRectangle({ x: x0, y: top - headH, width: W - 2 * M, height: headH, color: band });
    T(pg, 'No.', x0 + 2, top - 18, 7.5, bold);
    T(pg, 'Obreros', x0 + cNo + 3, top - 18, 7.5, bold);
    T(pg, 'Función', x0 + cNo + cName + 3, top - 18, 7.5, bold);
    for (let k = 0; k < n; k++) {
      const d = ymd(attDate(sh, k));
      const cx = xDays + k * dayW + dayW / 2;
      C(pg, `${DOW[d.getDay()]} ${d.getDate()}${attHalf(sh, k) ? ' ½' : ''}`, cx, top - 11, 7.5, bold);
      ['E', 'P', 'S'].forEach((l, j) => C(pg, l, xDays + k * dayW + cw * j + cw / 2, top - 23, 6, font, grey));
    }
    if (!blank) { C(pg, 'Días', xTot + 15, top - 18, 7.5, bold); C(pg, 'Pago', xTot + 15 + 41, top - 18, 7.5, bold); }
    const slice = rows.slice(start, start + perPage);
    let yy = top - headH;
    slice.forEach((w, j) => {
      const y1 = yy - rowH;
      T(pg, String(start + j + 1), x0 + 3, y1 + 4.5, 7.5);
      if (w) { T(pg, fit(w.name || '', bold, 7.5, cName - 5), x0 + cNo + 3, y1 + 4.5, 7.5, bold); T(pg, fit(w.role || '', font, 7, cRole - 5), x0 + cNo + cName + 3, y1 + 4.5, 7); }
      if (w && !blank) {
        const ms = marks[w.id] || {};
        for (let k = 0; k < n; k++) {
          const m = ms[k] || {};
          ['e', 'p', 's'].forEach((f, q) => {
            const v = m[f];
            if (!v) return;
            const cx = xDays + k * dayW + cw * q + cw / 2;
            if (v === 'ok') check(pg, cx, y1 + 7.2); else C(pg, ATT_SHOW[v], cx, y1 + 4.5, v === 'cc' ? 5.6 : 7, bold);
          });
        }
        const t = attTotals(sh, w.id, R);
        C(pg, fmtDays(t.days), xTot + 15, y1 + 4.5, 7.5, bold);
        if (isNum(w.pay)) { const s = money(round2(t.days * w.pay)); T(pg, fit(s, font, 7, 50), W - M - 3 - font.widthOfTextAtSize(fit(s, font, 7, 50), 7), y1 + 4.5, 7); }
      }
      pg.drawLine({ start: { x: x0, y: y1 }, end: { x: W - M, y: y1 }, thickness: 0.4, color: line });
      yy = y1;
    });
    // Hora del pase sorpresa.
    const ys = yy - rowH;
    T(pg, 'Hora del pase sorpresa', x0 + cNo + 3, ys + 4.5, 7.5, bold);
    for (let k = 0; k < n; k++) if (surprise[k]) C(pg, surprise[k], xDays + k * dayW + dayW / 2, ys + 4.5, 7.5, bold);
    pg.drawLine({ start: { x: x0, y: ys }, end: { x: W - M, y: ys }, thickness: 0.4, color: line });
    // Rejilla.
    const yb = ys;
    for (const x of [x0, x0 + cNo, x0 + cNo + cName, xDays, ...Array.from({ length: n }, (_, k) => xDays + (k + 1) * dayW), W - M]) pg.drawLine({ start: { x, y: top }, end: { x, y: yb }, thickness: 0.7, color: line });
    for (let k = 0; k < n; k++) for (let q = 1; q < 3; q++) { const x = xDays + k * dayW + cw * q; pg.drawLine({ start: { x, y: top - headH + 9 }, end: { x, y: yb + rowH }, thickness: 0.25, color: line, dashArray: [1, 1.5] }); }
    if (!blank) pg.drawLine({ start: { x: xTot + 30, y: top }, end: { x: xTot + 30, y: yb }, thickness: 0.5, color: line });
    pg.drawLine({ start: { x: x0, y: top }, end: { x: W - M, y: top }, thickness: 0.7, color: line });
    pg.drawLine({ start: { x: x0, y: top - headH }, end: { x: W - M, y: top - headH }, thickness: 0.7, color: line });
    let yl = yb - 14;
    T(pg, 'E: marca = llegó a tiempo · T = llegó después de la hora límite · x = no vino.     P: marca = estaba · x = no estaba.', M, yl, 7.5, font, grey);
    yl -= 10;
    T(pg, 'S: marca = estaba a la salida · C = siguió corrido sin almorzar y se fue antes (día completo) · 1½ = siguió corrido hasta la salida (día y medio) · x = se fue antes.', M, yl, 7.5, font, grey);
    if (start + perPage >= rows.length) {
      if (!blank) {
        const tot = round2(people.reduce((s, w) => s + (isNum(w.pay) ? round2(attTotals(sh, w.id, R).days * w.pay) : 0), 0));
        const s = 'Total a pagar: ' + money(tot);
        T(pg, s, W - M - bold.widthOfTextAtSize(pdfSafe(s), 9.5), yl - 14, 9.5, bold);
      }
      const ySig = M + 8, sw = 170;
      ['Encargado', 'Revisó', 'Autorizó'].forEach((l, j) => { const x = M + j * (sw + 60); pg.drawLine({ start: { x, y: ySig + 10 }, end: { x: x + sw, y: ySig + 10 }, thickness: 0.7, color: ink }); T(pg, l, x, ySig, 7.5, bold, grey); });
    }
  }
  return out.save();
}
async function attExport(kind) {
  // Lo último que se marcó se guarda primero, y el archivo sale con eso aunque la lista todavía no se haya puesto al día.
  const pend = attPend ? JSON.parse(JSON.stringify({ id: attPend.id, marks: attPend.marks, surprise: attPend.surprise })) : null;
  await flushAtt();
  const D = derive();
  const { sh: cur } = attCurrent(D);
  const sh = cur && pend && pend.id === cur.id ? { ...cur, marks: pend.marks, surprise: pend.surprise } : cur;
  const proj = D.projById.get(S.attProject);
  if (!sh || !proj) return;
  const name = fileSafe(`Pase de lista ${proj.name} ${sh.start} al ${attEnd(sh)}`);
  try {
    if (kind === 'xlsx') { deliverFile(attWorkbook(sh, proj), name + '.xlsx'); return; }
    const bytes = await attPdf(sh, proj, kind === 'blank');
    deliverFile(new Blob([bytes], { type: 'application/pdf' }), (kind === 'blank' ? 'Planilla en blanco ' : '') + name + '.pdf');
  } catch (e) { console.error(e); toast('No se pudo preparar el archivo.'); }
}

/* ---------- páginas de una factura y separar la grapa ---------- */
// Páginas elegidas (1, 2, …) de un PDF, en un PDF nuevo.
async function pdfPick(bytes, nums) {
  const { PDFDocument } = await pdflib();
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const out = await PDFDocument.create();
  (await out.copyPages(src, nums.map((n) => n - 1))).forEach((p) => out.addPage(p));
  return out.save();
}
function pagesLineHTML(i, edit) {
  if (i.fileType === 'application/xml') return '';
  const extra = i.extraPages || [];
  const total = (i.pages || 1) + extra.reduce((t, x) => t + (x.pages || 1), 0);
  const thumbs = extra.map((x, k) => {
    const tid = x.thumbId || (String(x.fileType || '').startsWith('image/') ? x.fileId : null);
    return `<span class="pg"><button type="button" class="pg-img" data-act="inv-view" data-id="${esc(i.id)}" aria-label="Ver la página ${k + 2}">${tid ? `<img src="${esc(assetUrl(tid))}" alt="" loading="lazy">` : '<span class="ph">PDF</span>'}</button>${edit ? `<button type="button" class="pg-x" data-act="page-rm" data-id="${esc(i.id)}" data-k="${k}" aria-label="Quitar la página ${k + 2}">${ICON.close}</button>` : ''}</span>`;
  }).join('');
  const split = edit && i.fileType === 'application/pdf' && (i.pages || 1) > 1 ? `<button type="button" class="link" data-act="split-open" data-id="${esc(i.id)}">Separar páginas</button>` : '';
  if (!extra.length && !edit) return '';
  return `<div class="pages-line">${extra.length ? `<span class="pg-n">${plural(total, 'página', 'páginas')}</span><span class="pg-list">${thumbs}</span>` : ''}<span class="pg-acts">${edit ? `<button type="button" class="link" data-act="page-add" data-id="${esc(i.id)}">${ICON.plus} Agregar página</button>` : ''}${split}${edit && String(i.fileType || '').startsWith('image/') && i.fileId ? `<button type="button" class="link" data-act="crop-open" data-id="${esc(i.id)}">Recortar la foto</button>` : ''}${edit && i.origFileId ? `<button type="button" class="link" data-act="crop-undo" data-id="${esc(i.id)}">Volver a la foto original</button>` : ''}</span></div>`;
}
let pageTarget = null;
async function addPages(invId, files) {
  const inv = S.invoices.find((x) => x.id === invId);
  if (!inv || !canUpload()) return;
  const list = [...files].filter((f) => f && f.size > 0);
  if (!list.length) return;
  toast(list.length === 1 ? 'Agregando la página…' : `Agregando ${list.length} páginas…`);
  const added = [];
  for (const f of list) {
    try {
      const p = await prepFile(f);
      const up = await assets.upload(p.blob, { type: p.ftype });
      let thumbId = null;
      if (p.thumb) { try { thumbId = (await assets.upload(p.thumb, { type: 'image/jpeg' })).id; } catch (e) { console.warn('miniatura', e); } }
      added.push({ fileId: up.id, fileType: p.ftype, thumbId, pages: p.pages || 1 });
    } catch (e) { console.error(e); toast(upErr(e)); }
  }
  if (!added.length) return;
  const cur = S.invoices.find((x) => x.id === invId) || inv;
  if (!(await write(() => db.doc('invoices/' + invId).update({ extraPages: [...(cur.extraPages || []), ...added] }), added.length === 1 ? 'Página agregada' : `${added.length} páginas agregadas`))) return;
  // Si a la factura le faltan datos, se lee otra vez con todas sus páginas.
  if (ai.hasKey() && (!isNum(cur.amount) || !cur.number)) setTimeout(() => readMany([S.invoices.find((x) => x.id === invId)].filter(Boolean), true), 400);
}
async function removePage(invId, k) {
  const inv = S.invoices.find((x) => x.id === invId);
  if (!inv || !inv.extraPages || !inv.extraPages[k]) return;
  const gone = inv.extraPages[k];
  if (await write(() => db.doc('invoices/' + invId).update({ extraPages: inv.extraPages.filter((_, j) => j !== k) }), 'Página quitada')) {
    for (const a of [gone.fileId, gone.thumbId]) if (a) assets.delete(a).catch(() => {});
  }
}
// Una foto que entró como factura aparte pero es la otra página de una factura.
function openPagePick(fromId) {
  const D = derive();
  const from = D.invoices.find((x) => x.id === fromId);
  if (!from) return;
  const t = Date.parse(from.createdAt) || 0;
  const list = D.invoices.filter((i) => i.id !== fromId && i.fileType !== 'application/xml').sort((a, b) => Math.abs((Date.parse(a.createdAt) || 0) - t) - Math.abs((Date.parse(b.createdAt) || 0) - t)).slice(0, 40);
  const rows = list.map((i) => `<button type="button" class="o-pick" data-act="page-merge" data-id="${esc(fromId)}" data-to="${esc(i.id)}"><span><b>${esc(i.supplier || 'Factura sin datos')}</b><small>${esc([i.number ? 'NCF ' + RD.normNcf(i.number) : '', fmtDate(i.date), i.project ? i.project.name : ''].filter(Boolean).join(' · '))}</small></span><span class="num">${esc(money(i.amount, i.currency))}</span></button>`).join('');
  openSheet(`${sheetHead('¿De qué factura es esta página?')}<div class="sheet-b"><p class="hint">Primero salen las que se agregaron más cerca de esta foto.</p>${rows ? `<div class="o-picks">${rows}</div>` : '<p class="hint">No hay otras facturas.</p>'}</div>`, { type: 'pagepick', id: fromId });
}
async function mergeAsPage(fromId, toId) {
  const from = S.invoices.find((x) => x.id === fromId), to = S.invoices.find((x) => x.id === toId);
  if (!from || !to) return;
  if (S.payments.some((p) => (p.invoiceIds || []).includes(fromId))) { toast('Está en un pago; quítala del pago primero.'); return; }
  const page = { fileId: from.fileId, fileType: from.fileType, thumbId: from.thumbId || null, pages: from.pages || 1 };
  const ok = await write(async () => {
    await db.doc('invoices/' + toId).update({ extraPages: [...(to.extraPages || []), page, ...(from.extraPages || [])] });
    for (const c of S.conduces.filter((x) => x.invoiceId === fromId)) await db.doc('conduces/' + c.id).update({ invoiceId: toId });
    await db.doc('invoices/' + fromId).delete();
  }, 'Página agregada a la factura');
  if (!ok) return;
  closeSheet();
  setTimeout(() => openInvoice(toId), 350);
  if (ai.hasKey() && (!isNum(to.amount) || !to.number)) setTimeout(() => readMany([S.invoices.find((x) => x.id === toId)].filter(Boolean), true), 700);
}
// Separar un PDF que trae varias cosas engrapadas: la factura, conduces, la orden firmada u otra factura.
let splitState = null;
async function openSplit(invId) {
  const i = S.invoices.find((x) => x.id === invId);
  if (!i || i.fileType !== 'application/pdf') return;
  openSheet(`${sheetHead('Separar páginas')}<div class="sheet-b" id="split-b"><p class="hint">Abriendo el PDF…</p></div><div class="sheet-f"><button type="button" class="btn primary block" data-act="split-go" disabled>Separar</button></div>`, { type: 'split', id: invId });
  try {
    const bytes = await (await getBlob(i.fileId)).arrayBuffer();
    const pdf = await openPdf(bytes);
    const total = pdf.numPages;
    const pages = [];
    for (let k = 1; k <= Math.min(total, 30); k++) {
      const c = await renderPdfCanvas(pdf, k, 1200);
      const q = await scanQr(c);
      const b = await canvasToJpeg(scaledCanvas(c, 360), 0.7);
      pages.push({ k, url: URL.createObjectURL(b), order: q && q.kind === 'order' ? S.orders.find((o) => o.id === q.id) || null : null });
    }
    try { pdf.destroy(); } catch (e) { /* nada */ }
    if (!S.sheet || S.sheet.type !== 'split' || S.sheet.id !== invId) return;
    const found = pages.find((p) => p.order);
    const order = (found && found.order) || (i.orderId && S.orders.find((o) => o.id === i.orderId)) || null;
    splitState = { invId, bytes, pages, total, order };
    const opts = (p) => {
      const def = p.order ? 'orden' : 'factura';
      const o = [['factura', 'Factura'], ['conduce', 'Conduce'], ...(order ? [['orden', 'Orden firmada ' + orderNo(order)]] : []), ['otra', 'Otra factura'], ['quitar', 'Quitar']];
      return `<select data-split="${p.k}" aria-label="Página ${p.k}">${o.map(([v, l]) => `<option value="${v}"${v === def ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    };
    $('#split-b').innerHTML = `<p class="hint">Di qué es cada página. Las de la factura se quedan aquí, cada conduce se adjunta a esta factura, la orden firmada va a su orden y «Otra factura» queda aparte.</p><div class="split-list">${pages.map((p) => `<div class="split-row"><img src="${p.url}" alt="Página ${p.k}"><div class="split-mid"><b>Página ${p.k}</b>${p.order ? `<small>Tiene el código de ${esc(orderNo(p.order))}</small>` : ''}${opts(p)}</div></div>`).join('')}</div>${total > pages.length ? `<p class="usage">Las páginas después de la ${pages.length} se quedan con la factura.</p>` : ''}`;
    const go = $('[data-act="split-go"]');
    if (go) go.disabled = false;
  } catch (e) {
    console.error(e);
    const b = $('#split-b');
    if (b) b.innerHTML = '<p class="hint">No se pudo abrir el PDF.</p>';
  }
}
async function applySplit(btn) {
  const st = splitState;
  const inv = st && S.invoices.find((x) => x.id === st.invId);
  if (!inv) return;
  const choice = {};
  for (const s of $$('#split-b select[data-split]')) choice[Number(s.dataset.split)] = s.value;
  const byKind = (k) => st.pages.filter((p) => choice[p.k] === k).map((p) => p.k);
  const fact = byKind('factura');
  for (let k = st.pages.length + 1; k <= st.total; k++) fact.push(k);
  if (!fact.length) { toast('Deja al menos una página como factura.'); return; }
  if (fact.length === st.total) { toast('No hay nada que separar: todas son de la factura.'); return; }
  btn.disabled = true;
  btn.textContent = 'Separando…';
  try {
    const mk = async (nums) => { const b = await pdfPick(st.bytes, nums); const r = await inspectPdf(b).catch(() => null); return { blob: new Blob([b], { type: 'application/pdf' }), r }; };
    const up = async (x) => {
      const f = await assets.upload(x.blob, { type: 'application/pdf' });
      let t = null;
      if (x.r && x.r.thumb) { try { t = (await assets.upload(x.r.thumb, { type: 'image/jpeg' })).id; } catch (e) { console.warn('miniatura', e); } }
      return { fileId: f.id, thumbId: t, pages: x.r ? x.r.pages : 1 };
    };
    const readable = (x) => ai.hasKey() && !!x.r && (hasText(x.r.text) || !!x.r.thumb);
    const aiIn = (x) => ({ text: x.r.text, image: hasText(x.r.text) ? null : x.r.thumb });
    const old = [inv.fileId, inv.thumbId];
    const main = await up(await mk(fact));
    await dbw(() => db.doc('invoices/' + inv.id).update({ fileId: main.fileId, thumbId: main.thumbId, pages: main.pages }));
    let nc = 0;
    for (const k of byKind('conduce')) {
      const x = await mk([k]);
      const u = await up(x);
      const ref = db.collection('conduces').doc();
      const read = readable(x);
      await dbw(() => ref.set({ invoiceId: inv.id, projectId: inv.projectId || null, projectHint: '', supplier: inv.supplier || '', rnc: RD.normRnc(inv.rnc) || '', number: '', date: '', total: null, currency: normCur(inv.currency), material: '', qty: '', trips: null, fileId: u.fileId, fileType: 'application/pdf', thumbId: u.thumbId, pages: 1, fileName: inv.fileName || '', createdAt: new Date().toISOString(), ai: read ? 'pending' : 'off', aiErr: '', auto: false }));
      if (read) enqueueAI({ condId: ref.id, input: aiIn(x) });
      nc++;
    }
    const ord = byKind('orden');
    if (ord.length && st.order) {
      const x = await mk(ord);
      await saveSignedCopy(st.order, x.blob, 'application/pdf', x.r ? x.r.thumb : null);
      if (!inv.orderId) await dbw(() => db.doc('invoices/' + inv.id).update({ ...fillFromOrder({}, inv, st.order), orderAuto: false }));
    }
    const otra = byKind('otra');
    if (otra.length) {
      const x = await mk(otra);
      const u = await up(x);
      const ref = db.collection('invoices').doc();
      const read = readable(x);
      await dbw(() => ref.set({ projectId: inv.projectId || null, supplier: '', rnc: '', number: '', date: '', amount: null, itbis: null, currency: 'DOP', concept: '', ref: '', buyerRnc: '', qrUrl: '', secCode: '', fiscal: '', notInvoice: false, fileId: u.fileId, fileType: 'application/pdf', thumbId: u.thumbId, pages: u.pages, fileName: inv.fileName || '', xmlId: null, createdAt: new Date().toISOString(), ai: read ? 'pending' : 'off' }));
      if (read) enqueueAI({ invId: ref.id, input: aiIn(x) });
    }
    for (const a of old) if (a && a !== main.fileId) assets.delete(a).catch(() => {});
    for (const p of st.pages) URL.revokeObjectURL(p.url);
    splitState = null;
    closeSheet();
    toast(['Listo: páginas separadas', nc ? plural(nc, 'conduce adjunto', 'conduces adjuntos') : '', ord.length && st.order ? `orden ${orderNo(st.order)} firmada` : '', otra.length ? 'otra factura aparte' : ''].filter(Boolean).join(' · '));
  } catch (e) {
    console.error(e);
    toast('No se pudo separar. Intenta de nuevo.');
    btn.disabled = false;
    btn.textContent = 'Separar';
  }
}

/* ---------- proveedores ---------- */
function openSuppliers() {
  const D = derive();
  const edit = canEdit();
  // De las facturas: proveedores que todavía no tienen ficha, primero los que más facturas tienen.
  const g = new Map();
  for (const i of D.invoices) {
    if (!i.supplier || i.sup) continue;
    const k = RD.normRnc(i.rnc) || supKey(i.supplier);
    if (!k) continue;
    const x = g.get(k) || { name: i.supplier, rnc: RD.normRnc(i.rnc), n: 0 };
    x.n++;
    g.set(k, x);
  }
  const sugg = [...g.values()].sort((a, b) => b.n - a.n).slice(0, 12);
  const rows = D.suppliers.map((s) => `<button type="button" class="o-pick" data-act="sup-open" data-id="${esc(s.id)}"><span><b>${esc(s.name || 'Sin nombre')}</b><small>${esc([s.rnc ? 'RNC ' + RD.fmtRnc(s.rnc) : '', isNum(s.creditDays) && s.creditDays > 0 ? `crédito ${s.creditDays} días` : 'de contado', s.bank || ''].filter(Boolean).join(' · '))}</small></span>${ICON.right}</button>`).join('');
  openSheet(`${sheetHead('Proveedores')}<div class="sheet-b">
    <p class="hint">La ficha guarda el RNC, el teléfono, la cuenta de banco (sale en el pago, para la transferencia) y los días de crédito (la app avisa las facturas por vencer y las vencidas).</p>
    ${rows ? `<div class="o-picks">${rows}</div>` : '<p class="hint">Todavía no hay fichas.</p>'}
    ${edit ? `<div><button type="button" class="btn sm" data-act="sup-new">${ICON.plus} Nuevo proveedor</button></div>` : ''}
    ${edit && sugg.length ? `<h3 class="h2">De tus facturas</h3><div class="o-picks">${sugg.map((x) => `<button type="button" class="o-pick" data-act="sup-new" data-name="${esc(x.name)}" data-rnc="${esc(x.rnc)}"><span><b>${esc(x.name)}</b><small>${esc([x.rnc ? 'RNC ' + RD.fmtRnc(x.rnc) : '', plural(x.n, 'factura', 'facturas')].filter(Boolean).join(' · '))}</small></span><span class="num">${ICON.plus}</span></button>`).join('')}</div>` : ''}
  </div>`, { type: 'sups', id: 'sups' });
}
function openSupplier(id, preset = {}) {
  const s = id ? S.suppliers.find((x) => x.id === id) : null;
  if (id && !s) return;
  const d = s || { name: preset.name || '', rnc: preset.rnc || '', phone: '', bank: '', accountType: '', account: '', personaFisica: false, creditDays: null, notes: '' };
  const edit = canEdit();
  const dis = edit ? '' : ' disabled';
  const D = derive();
  const invs = s ? D.invoices.filter((i) => i.sup && i.sup.id === s.id) : [];
  const pend = invs.filter((i) => i.status !== 'pagada');
  const banks = ['Banco Popular', 'Banreservas', 'BHD', 'Scotiabank', 'Banco Santa Cruz', 'Banesco', 'Banco Promerica', 'Banco BDI', 'Banco Caribe', 'Banco Vimenca', 'Asociación Popular', 'Asociación Cibao', 'Asociación La Nacional'];
  openSheet(`<form id="sup-form" data-id="${esc(s ? s.id : '')}" autocomplete="off">${sheetHead(s ? esc(s.name || 'Proveedor') : 'Nuevo proveedor')}<div class="sheet-b">
    ${s ? `<p class="hint">${plural(invs.length, 'factura', 'facturas')}${pend.length ? ` · por pagar ${esc(totalStr(pend))}` : ''}</p>` : ''}
    <div class="fields">
      <div class="field full"><label for="sp-name">Nombre</label><input id="sp-name" maxlength="120" value="${esc(d.name || '')}" required${dis}></div>
      <div class="field"><label for="sp-rnc">RNC o cédula</label><input id="sp-rnc" class="mono" inputmode="numeric" maxlength="15" value="${esc(RD.normRnc(d.rnc))}"${dis}></div>
      <div class="field"><label for="sp-phone">Teléfono</label><input id="sp-phone" inputmode="tel" maxlength="20" value="${esc(d.phone || '')}"${dis}></div>
      <div class="field"><label for="sp-bank">Banco</label><input id="sp-bank" list="dl-banks" maxlength="40" value="${esc(d.bank || '')}"${dis}></div>
      <div class="field"><label for="sp-acct-type">Tipo de cuenta</label><select id="sp-acct-type"${dis}><option value="">—</option>${['Ahorros', 'Corriente'].map((v) => `<option${d.accountType === v ? ' selected' : ''}>${v}</option>`).join('')}</select></div>
      <div class="field full"><label for="sp-acct">No. de cuenta</label><input id="sp-acct" class="mono" inputmode="numeric" maxlength="30" value="${esc(d.account || '')}"${dis}></div>
      <div class="field"><label for="sp-credit">Días de crédito</label><input id="sp-credit" class="mono" inputmode="numeric" maxlength="3" placeholder="0 = de contado" value="${esc(isNum(d.creditDays) ? String(d.creditDays) : '')}"${dis}></div>
      <label class="field check-row"><input type="checkbox" id="sp-pf"${d.personaFisica ? ' checked' : ''}${dis}><span>Es persona física</span></label>
      <div class="field full"><label for="sp-notes">Notas</label><textarea id="sp-notes" rows="2" maxlength="300"${dis}>${esc(d.notes || '')}</textarea></div>
    </div>
    ${s && edit ? `<div><button type="button" class="btn danger sm" data-act="sup-del" data-id="${esc(s.id)}">${ICON.trash} Eliminar ficha</button></div>` : ''}
  </div>${edit ? '<div class="sheet-f"><button type="submit" class="btn primary block">Guardar</button></div>' : ''}</form><datalist id="dl-banks">${banks.map((v) => `<option value="${v}"></option>`).join('')}</datalist>`, { type: 'sup', id: s ? s.id : 'new' });
}
async function saveSupplier(f) {
  const id = f.dataset.id;
  const name = $('#sp-name').value.trim();
  if (!name) return;
  const rnc = RD.normRnc($('#sp-rnc').value);
  if (rnc && rnc.length !== 9 && rnc.length !== 11) { toast('El RNC debe tener 9 dígitos (u 11 si es cédula).'); return; }
  const cr = $('#sp-credit').value.trim();
  const credit = cr === '' ? null : Math.max(0, Math.min(365, parseInt(cr, 10) || 0));
  const data = { name: name.slice(0, 120), rnc, phone: $('#sp-phone').value.trim().slice(0, 20), bank: $('#sp-bank').value.trim().slice(0, 40), accountType: $('#sp-acct-type').value, account: $('#sp-acct').value.trim().slice(0, 30), creditDays: credit, personaFisica: $('#sp-pf').checked, notes: $('#sp-notes').value.trim().slice(0, 300), updatedAt: new Date().toISOString() };
  const dupe = S.suppliers.find((s) => s.id !== id && ((rnc && RD.normRnc(s.rnc) === rnc) || sameName(s.name, name)));
  if (dupe) { toast(`Ya hay una ficha de ${dupe.name}.`); return; }
  const ok = await write(() => (id ? db.doc('suppliers/' + id).update(data) : db.collection('suppliers').doc().set({ ...data, createdAt: new Date().toISOString() })), 'Proveedor guardado');
  if (ok) { closeSheet(); setTimeout(openSuppliers, 250); }
}

/* ---------- recortar y enderezar la foto ---------- */
// Homografía: lleva el rectángulo de salida a las cuatro esquinas marcadas en la foto.
function solveLinear(A, B) {
  const n = B.length;
  const M = A.map((r, i) => [...r, B[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c] || 1e-12;
    for (let k = c; k <= n; k++) M[c][k] /= d;
    for (let r = 0; r < n; r++) if (r !== c && M[r][c]) { const f = M[r][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  return M.map((r) => r[n]);
}
function warpQuad(src, quad) {
  const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  let W = Math.max(d(quad[0], quad[1]), d(quad[3], quad[2])), H = Math.max(d(quad[0], quad[3]), d(quad[1], quad[2]));
  const k = Math.min(1, 2000 / Math.max(W, H));
  W = Math.max(1, Math.round(W * k)); H = Math.max(1, Math.round(H * k));
  const dst = [[0, 0], [W, 0], [W, H], [0, H]];
  const A = [], B = [];
  for (let j = 0; j < 4; j++) {
    const [x, y] = dst[j], [u, v] = quad[j];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); B.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); B.push(v);
  }
  const h = solveLinear(A, B);
  const sw = src.width, sh = src.height;
  const sd = src.getContext('2d').getImageData(0, 0, sw, sh).data;
  const out = document.createElement('canvas');
  out.width = W; out.height = H;
  const octx = out.getContext('2d');
  const od = octx.createImageData(W, H);
  const o = od.data;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const den = h[6] * x + h[7] * y + 1;
      const u = (h[0] * x + h[1] * y + h[2]) / den, v = (h[3] * x + h[4] * y + h[5]) / den;
      const i = (y * W + x) * 4;
      const x0 = Math.floor(u), y0 = Math.floor(v);
      if (x0 < 0 || y0 < 0 || x0 >= sw - 1 || y0 >= sh - 1) { o[i] = o[i + 1] = o[i + 2] = o[i + 3] = 255; continue; }
      const fx = u - x0, fy = v - y0;
      const p = (y0 * sw + x0) * 4, q = p + 4, r = p + sw * 4, s = r + 4;
      for (let c = 0; c < 3; c++) o[i + c] = (sd[p + c] * (1 - fx) + sd[q + c] * fx) * (1 - fy) + (sd[r + c] * (1 - fx) + sd[s + c] * fx) * fy;
      o[i + 3] = 255;
    }
  }
  octx.putImageData(od, 0, 0);
  return out;
}
let cropState = null;
async function openCrop(invId) {
  const i = S.invoices.find((x) => x.id === invId);
  if (!i || !String(i.fileType || '').startsWith('image/')) return;
  openSheet(`${sheetHead('Recortar y enderezar')}<div class="sheet-b"><p class="hint">Arrastra las cuatro esquinas a las esquinas de la factura: la app la endereza y quita lo que sobra. La foto original se guarda por si quieres volver a ella.</p><div class="crop-wrap" id="crop-wrap"><p class="hint">Abriendo la foto…</p></div><div class="actions"><button type="button" class="btn sm" data-act="crop-rot">Girar</button><button type="button" class="btn sm ghost" data-act="crop-all">Toda la foto</button></div></div><div class="sheet-f"><button type="button" class="btn primary block" data-act="crop-go" disabled>Recortar</button></div>`, { type: 'crop', id: invId });
  try {
    const img = await loadImage(await getBlob(i.fileId));
    if (!S.sheet || S.sheet.type !== 'crop' || S.sheet.id !== invId) return;
    cropState = { invId, src: scaledCanvas(img, 2000), pts: [[0.04, 0.04], [0.96, 0.04], [0.96, 0.96], [0.04, 0.96]] };
    $('#crop-wrap').innerHTML = '';
    drawCrop();
    const go = $('[data-act="crop-go"]');
    if (go) go.disabled = false;
  } catch (e) {
    console.error(e);
    const w = $('#crop-wrap');
    if (w) w.innerHTML = '<p class="hint">No se pudo abrir la foto.</p>';
  }
}
function drawCrop() {
  const w = $('#crop-wrap');
  if (!w || !cropState) return;
  const { src, pts } = cropState;
  if (!w.dataset.bound) {
    w.dataset.bound = '1';
    w.innerHTML = `<canvas></canvas><svg class="crop-poly" viewBox="0 0 1 1" preserveAspectRatio="none"><polygon points=""/></svg>${[0, 1, 2, 3].map((k) => `<span class="crop-h" data-h="${k}"></span>`).join('')}`;
    let drag = -1;
    const at = (e) => { const r = w.getBoundingClientRect(); return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))]; };
    w.addEventListener('pointerdown', (e) => {
      if (!cropState) return;
      const h = e.target.closest('.crop-h');
      if (h) drag = Number(h.dataset.h);
      else {
        const p = at(e);
        let best = -1, bd = 0.25;
        cropState.pts.forEach((q, k) => { const dd = Math.hypot(q[0] - p[0], q[1] - p[1]); if (dd < bd) { bd = dd; best = k; } });
        drag = best;
      }
      if (drag >= 0) { try { w.setPointerCapture(e.pointerId); } catch (er) { /* nada */ } e.preventDefault(); }
    });
    w.addEventListener('pointermove', (e) => { if (drag < 0 || !cropState) return; cropState.pts[drag] = at(e); drawCrop(); });
    const end = () => { drag = -1; };
    w.addEventListener('pointerup', end);
    w.addEventListener('pointercancel', end);
  }
  const c = w.querySelector('canvas');
  const k = Math.min(1, 900 / Math.max(src.width, src.height));
  const cw = Math.round(src.width * k), ch = Math.round(src.height * k);
  if (c.width !== cw || c.height !== ch) { c.width = cw; c.height = ch; }
  c.getContext('2d').drawImage(src, 0, 0, cw, ch);
  w.style.setProperty('--ar', String(src.width / src.height));
  w.querySelector('polygon').setAttribute('points', pts.map((p) => p.join(',')).join(' '));
  w.querySelectorAll('.crop-h').forEach((hd) => { const p = pts[Number(hd.dataset.h)]; hd.style.left = p[0] * 100 + '%'; hd.style.top = p[1] * 100 + '%'; });
}
function rotateCrop() {
  if (!cropState) return;
  const s = cropState.src;
  const c = document.createElement('canvas');
  c.width = s.height; c.height = s.width;
  const ctx = c.getContext('2d');
  ctx.translate(c.width, 0);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(s, 0, 0);
  const m = cropState.pts.map(([x, y]) => [1 - y, x]);
  cropState.src = c;
  cropState.pts = [m[3], m[0], m[1], m[2]];
  drawCrop();
}
async function applyCrop(btn) {
  const st = cropState;
  const i = st && S.invoices.find((x) => x.id === st.invId);
  if (!i) return;
  btn.disabled = true;
  btn.textContent = 'Enderezando…';
  try {
    await new Promise((r) => setTimeout(r, 30));
    const W = st.src.width, H = st.src.height;
    const out = warpQuad(st.src, st.pts.map(([x, y]) => [x * W, y * H]));
    const up = await assets.upload(await canvasToJpeg(out, 0.88), { type: 'image/jpeg' });
    const orig = i.origFileId || i.fileId;
    const drop = i.origFileId && i.fileId !== i.origFileId ? i.fileId : null;
    if (!(await write(() => db.doc('invoices/' + i.id).update({ fileId: up.id, fileType: 'image/jpeg', thumbId: null, origFileId: orig }), 'Foto recortada y enderezada'))) { btn.disabled = false; btn.textContent = 'Recortar'; return; }
    if (drop) assets.delete(drop).catch(() => {});
    cropState = null;
    closeSheet();
  } catch (e) {
    console.error(e);
    toast('No se pudo recortar la foto.');
    btn.disabled = false;
    btn.textContent = 'Recortar';
  }
}
async function undoCrop(invId) {
  const i = S.invoices.find((x) => x.id === invId);
  if (!i || !i.origFileId) return;
  const cur = i.fileId;
  if (await write(() => db.doc('invoices/' + invId).update({ fileId: i.origFileId, fileType: 'image/jpeg', thumbId: null, origFileId: null }), 'Volvió la foto original') && cur !== i.origFileId) assets.delete(cur).catch(() => {});
}

/* ---------- artículos tachados (devueltos o cambiados) ---------- */
// A veces el plomero (o quien sea) devolvió o cambió algo y en la factura lo tacharon a mano: eso no se paga.
// Se anota qué se tachó y cuánto, el total impreso se guarda aparte y el monto a pagar queda rebajado.
const struckSum = (i) => round2((i.struck || []).reduce((s, x) => s + (isNum(x.amount) ? x.amount : 0), 0));
const struckPending = (i) => !!((i.struck || []).length || i.struckFixed) && !i.struckOk;
// Cuando se cambia algo, en la factura lo tachan y dan otra factura con lo que se cambió: las dos quedan enlazadas.
// La primera se paga sin lo tachado y la del cambio se paga completa.
const changesOf = (i) => S.invoices.filter((x) => x.changeOf === i.id);
const invShort = (x) => [x.supplier || 'Factura', x.number ? RD.normNcf(x.number) : '', isNum(x.amount) ? money(x.amount, x.currency) : ''].filter(Boolean).join(' · ');
function tachChangeHTML(i, edit) {
  let h = '';
  if (i.changeOf) {
    const parent = S.invoices.find((x) => x.id === i.changeOf);
    h += `<div class="msg hint"><span>Es la factura del cambio de ${parent ? `<button type="button" class="link" data-act="open-inv" data-id="${esc(parent.id)}">${esc(invShort(parent))}</button>` : 'una factura que ya no está'}: lo que se cambió se paga en esta, y lo tachado en aquella no se paga.</span>${edit ? `<button type="button" class="btn sm" data-act="tc-unlink" data-id="${esc(i.id)}">Quitar el enlace</button>` : ''}</div>`;
  }
  const kids = changesOf(i);
  if (kids.length) {
    const ks = round2(kids.reduce((s, k) => s + (isNum(k.amount) ? k.amount : 0), 0)), st = struckSum(i), d = round2(ks - st);
    h += `<div class="msg ok">${ICON.check}<span>Lo cambiado vino en ${kids.map((k) => `<button type="button" class="link" data-act="open-inv" data-id="${esc(k.id)}">${esc(invShort(k))}</button>`).join(', ')}.${st && ks ? ` Se tachó ${esc(money(st, i.currency))} y lo cambiado costó ${esc(money(ks, i.currency))}${Math.abs(d) >= 0.01 ? ` (${esc(money(Math.abs(d), i.currency))} ${d > 0 ? 'más' : 'menos'})` : ''}.` : ''}</span></div>`;
  }
  if (edit && !i.changeOf && ((i.struck || []).length || i.struckFixed)) {
    const same = (x) => (i.rnc && x.rnc && RD.normRnc(x.rnc) === RD.normRnc(i.rnc)) || sameName(x.supplier, i.supplier);
    const cands = S.invoices.filter((x) => x.id !== i.id && !x.changeOf && !x.notInvoice && same(x) && (!i.date || !x.date || x.date >= addDays(i.date, -3)))
      .sort((a, b) => String(a.date || '').localeCompare(String(b.date || ''))).slice(0, 20);
    h += cands.length
      ? `<div class="field"><label for="tc-chg">¿Te dieron otra factura con lo que se cambió? Enlázala</label><div class="tc-link"><select id="tc-chg"><option value="">Elige la factura</option>${cands.map((x) => `<option value="${esc(x.id)}">${esc([x.number ? RD.normNcf(x.number) : 'Sin NCF', fmtDate(x.date), isNum(x.amount) ? money(x.amount, x.currency) : ''].filter(Boolean).join(' · '))}</option>`).join('')}</select><button type="button" class="btn sm" data-act="tc-link" data-id="${esc(i.id)}">Enlazar</button></div></div>`
      : '<p class="hint">Si por lo cambiado te dan otra factura, cuando la agregues enlázala aquí. Si esa factura dice que es por el cambio de esta, se enlaza sola.</p>';
  }
  return h;
}
function tachHTML(i, edit) {
  const list = i.struck || [];
  const linked = !!i.changeOf || changesOf(i).length > 0;
  if (!list.length && !i.struckFixed && !edit && !linked) return '';
  const cur = i.currency;
  const sum = struckSum(i);
  const official = i.fiscal === 'qr' || i.fiscal === 'xml';
  const base = isNum(i.printedTotal) ? i.printedTotal : i.amount;
  const rows = list.map((x, k) => `<div class="ab-row"><span>${esc(x.desc || 'Artículo tachado')}</span><b class="mono">${isNum(x.amount) ? esc(money(x.amount, cur)) : 'sin monto'}</b>${edit ? `<button type="button" class="icon-btn plain" data-act="tc-rm" data-id="${esc(i.id)}" data-k="${k}" aria-label="Quitar">${ICON.close}</button>` : ''}</div>`).join('');
  let calc = '';
  if (isNum(base) && sum > 0) {
    const net = round2(base - sum), netTax = isNum(i.itbis) && i.itbis > 0 ? round2(base - sum * 1.18) : null;
    calc = `<p class="usage">Total impreso ${esc(money(base, cur))} − tachado ${esc(money(sum, cur))} = <b>${esc(money(net, cur))}</b>${netTax != null ? `. Si los precios de los renglones no traen el ITBIS, con el 18 % queda en ${esc(money(netTax, cur))}` : ''}.</p>`;
    if (official) calc += `<div class="msg warn">${ICON.alert}<span>Es una factura electrónica: el monto es el que registró la DGII. Para que baje, pídele al proveedor la nota de crédito.</span></div>`;
    else if (edit) calc += `<div class="actions"><button type="button" class="btn sm${Math.abs(i.amount - net) < 0.005 ? '' : ' primary'}" data-act="tc-apply" data-id="${esc(i.id)}" data-v="${net}">A pagar ${esc(money(net, cur))}</button>${netTax != null ? `<button type="button" class="btn sm" data-act="tc-apply" data-id="${esc(i.id)}" data-v="${netTax}">A pagar ${esc(money(netTax, cur))} (con ITBIS)</button>` : ''}</div>`;
  } else if (i.struckFixed && isNum(i.printedTotal)) calc = `<p class="usage">El total se corrigió a mano: el impreso era ${esc(money(i.printedTotal, cur))} y el corregido es ${esc(money(i.amount, cur))}.</p>`;
  const state = struckPending(i)
    ? `<div class="msg warn">${ICON.alert}<span>Tiene artículos tachados: revisa que el total a pagar sea el de lo que de verdad se quedó.</span>${edit ? `<button type="button" class="btn sm" data-act="tc-ok" data-id="${esc(i.id)}">El monto está bien</button>` : ''}</div>`
    : list.length || i.struckFixed ? `<p class="usage">Monto revisado.</p>` : '';
  const add = edit ? `<div class="ab-add"><input id="tc-desc" maxlength="120" placeholder="Qué se tachó (ej. 2 codos de 1/2)" aria-label="Artículo tachado"><input id="tc-amt" class="mono" inputmode="decimal" maxlength="18" placeholder="Monto" aria-label="Monto del artículo"><button type="button" class="btn sm" data-act="tc-add" data-id="${esc(i.id)}">${ICON.plus} Anotar</button></div>` : '';
  const note = edit ? `<div class="field"><label for="tc-note">Quién lo devolvió o lo cambió, y por qué</label><input id="tc-note" maxlength="120" value="${esc(i.struckNote || '')}" placeholder="Ej. el plomero los cambió por codos de 3/4"></div>` : i.struckNote ? `<p class="usage">${esc(i.struckNote)}</p>` : '';
  const sumTxt = (list.length ? ` · ${list.length} · ${money(sum, cur)}` : i.struckFixed ? ' · total corregido a mano' : '') + (i.changeOf ? ' · es un cambio' : changesOf(i).length ? ' · con la factura del cambio' : '');
  return `<details class="edit" id="inv-tach"${list.length || i.struckFixed || linked ? ' open' : ''}><summary>Artículos tachados (devueltos o cambiados)${esc(sumTxt)}</summary><div class="ab-box">${rows || (i.struckFixed || i.changeOf ? '' : '<p class="hint">Si en la factura tacharon algo porque se devolvió o se cambió por otra cosa, anótalo aquí: no se paga lo tachado.</p>')}${state}${calc}${tachChangeHTML(i, edit)}${i.changeOf ? '' : add + note}</div></details>`;
}
function refreshTach(invId) {
  setTimeout(() => {
    const box = $('#inv-tach');
    if (!box || !S.sheet || S.sheet.type !== 'inv' || S.sheet.id !== invId) return;
    const i = derive().invoices.find((x) => x.id === invId);
    if (i) box.outerHTML = tachHTML(i, canEdit());
  }, 150);
}
async function addTach(invId) {
  const raw = S.invoices.find((x) => x.id === invId);
  if (!raw) return;
  const desc = $('#tc-desc').value.trim().slice(0, 120), amt = parseAmount($('#tc-amt').value);
  if (!desc && !isNum(amt)) { toast('Escribe qué se tachó y su monto.'); return; }
  const upd = { struck: [...(raw.struck || []), { desc, amount: isNum(amt) && amt >= 0 ? round2(amt) : null }].slice(0, 40), struckOk: false };
  if (!isNum(raw.printedTotal) && isNum(raw.amount)) upd.printedTotal = raw.amount;
  if (await write(() => db.doc('invoices/' + invId).update(upd), 'Anotado')) refreshTach(invId);
}
async function removeTach(invId, k) {
  const raw = S.invoices.find((x) => x.id === invId);
  if (!raw || !raw.struck || !raw.struck[k]) return;
  const struck = raw.struck.filter((_, j) => j !== k);
  if (await write(() => db.doc('invoices/' + invId).update({ struck, ...(struck.length || raw.struckFixed ? {} : { struckOk: false, printedTotal: null }) }), 'Quitado')) refreshTach(invId);
}
async function applyTach(invId, v) {
  const raw = S.invoices.find((x) => x.id === invId);
  if (!raw || !isNum(v) || v < 0) return;
  const upd = { amount: round2(v), struckOk: true };
  if (!isNum(raw.printedTotal) && isNum(raw.amount)) upd.printedTotal = raw.amount;
  upd.hist = histAdd(raw, histEntry('Rebajada por artículos tachados', histDiff(raw, upd)));
  if (await write(() => db.doc('invoices/' + invId).update(upd), `A pagar: ${money(upd.amount, raw.currency)}`)) {
    const f = $('#f-amt');
    if (f && S.sheet && S.sheet.id === invId) f.value = amountInput(upd.amount);
    refreshTach(invId);
  }
}

/* ---------- abonos (pagos parciales) ---------- */
function abonosHTML(i, edit) {
  if (!isNum(i.amount) || i.amount <= 0) return '';
  const list = i.abonos || [];
  if (!list.length && !edit) return '';
  const rows = list.map((a, k) => `<div class="ab-row"><span>${esc(fmtDate(a.date) || '')}${a.note ? ' · ' + esc(a.note) : ''}</span><b class="mono">${esc(money(a.amount, i.currency))}</b>${edit ? `<button type="button" class="icon-btn plain" data-act="ab-rm" data-id="${esc(i.id)}" data-k="${k}" aria-label="Quitar abono">${ICON.close}</button>` : ''}</div>`).join('');
  const sum = list.length ? ` · abonado ${esc(money(i.abonado, i.currency))} · balance ${esc(money(i.toPay, i.currency))}` : '';
  return `<details class="edit" id="inv-abonos"${list.length ? ' open' : ''}><summary>Abonos${sum}</summary><div class="ab-box">${rows || '<p class="hint">Si a esta factura ya se le pagó una parte (un abono o un avance), anótalo aquí: el pago toma solo el balance.</p>'}${edit && i.toPay > 0 ? `<div class="ab-add"><input type="date" id="ab-date" value="${todayISO()}" aria-label="Fecha del abono"><input id="ab-amt" class="mono" inputmode="decimal" maxlength="16" placeholder="Monto" aria-label="Monto del abono"><input id="ab-note" maxlength="60" placeholder="Nota (cheque, transferencia…)" aria-label="Nota del abono"><button type="button" class="btn sm" data-act="ab-add" data-id="${esc(i.id)}">Anotar abono</button></div>` : ''}</div></details>`;
}
function refreshAbonos(invId) {
  setTimeout(() => {
    const box = $('#inv-abonos');
    if (!box || !S.sheet || S.sheet.type !== 'inv' || S.sheet.id !== invId) return;
    const i = derive().invoices.find((x) => x.id === invId);
    if (i) box.outerHTML = abonosHTML(i, canEdit());
  }, 150);
}
async function addAbono(invId) {
  const D = derive();
  const i = D.invoices.find((x) => x.id === invId);
  if (!i) return;
  const amt = parseAmount($('#ab-amt').value);
  if (!isNum(amt) || amt <= 0) { toast('Escribe el monto del abono.'); return; }
  if (isNum(i.toPay) && amt > i.toPay + 0.005) { toast(`El abono pasa el balance (${money(i.toPay, i.currency)}).`); return; }
  const date = $('#ab-date').value;
  const raw = S.invoices.find((x) => x.id === invId) || i;
  const list = [...(raw.abonos || []), { date: ymd(date) ? date : todayISO(), amount: round2(amt), note: $('#ab-note').value.trim().slice(0, 60) }];
  if (await write(() => db.doc('invoices/' + invId).update({ abonos: list }), 'Abono anotado')) refreshAbonos(invId);
}
async function removeAbono(invId, k) {
  const raw = S.invoices.find((x) => x.id === invId);
  if (!raw || !raw.abonos || !raw.abonos[k]) return;
  if (await write(() => db.doc('invoices/' + invId).update({ abonos: raw.abonos.filter((_, j) => j !== k) }), 'Abono quitado')) refreshAbonos(invId);
}

/* ---------- envíos a la digitadora ---------- */
// Cada envío guarda qué facturas se mandaron, cuándo y cómo; así cada factura sabe si ya se mandó.
const ENVIO_LABEL = { archivo: 'en PDF', papel: 'en papel', manual: 'marcada a mano' };
const digiName = () => String((S.digi && S.digi.name) || '').trim();
const pendingDigi = (D) => D.invoices.filter((i) => !i.envio && !i.notInvoice).sort(sortByDateDesc);
function nextEnvioNumber() { return S.envios.reduce((m, e) => Math.max(m, Number(e.number) || 0), 0) + 1; }
// Se le mandan las de cada día al final del día: cuenta el día en que la factura se agregó a la app (hora del teléfono).
function addedDay(i) { const d = new Date(i.createdAt || ''); return isNaN(d) ? (ymd(i.date) ? i.date : '') : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
const dayGroupName = (iso) => (!iso ? 'Sin fecha' : iso === todayISO() ? 'De hoy' : iso === addDays(todayISO(), -1) ? 'De ayer' : 'Del ' + fmtDate(iso));
const monthLong = new Intl.DateTimeFormat('es-DO', { month: 'long' });
const longDate = (iso) => { const d = ymd(iso); if (!d) return ''; const t = `${DOW_LONG[d.getDay()]} ${d.getDate()} de ${monthLong.format(d)} de ${d.getFullYear()}`; return t.charAt(0).toUpperCase() + t.slice(1); };
// En la tarde (desde las 3, también el sábado) toca mandarle las del día.
const digiLate = () => new Date().getHours() >= 15;
// Por el día en que se agregaron, el más nuevo primero; dentro de cada día, por proyecto y proveedor.
function digiByDay(list) {
  const m = new Map();
  for (const i of list) { const k = addedDay(i); if (!m.has(k)) m.set(k, []); m.get(k).push(i); }
  const pn = (i) => (i.project ? i.project.name : '\uffff');
  return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([day, items]) => ({ day, items: items.sort((a, b) => pn(a).localeCompare(pn(b), 'es') || String(a.supplier || '').localeCompare(String(b.supplier || ''), 'es')) }));
}
function openDigi(pre) {
  const D = derive();
  const pend = pendingDigi(D);
  const edit = canEdit();
  const groups = digiByDay(pend);
  const row = (i, k) => `<label class="pick-row"><input type="checkbox" data-digi="inv" data-g="${k}" value="${esc(i.id)}"${!pre || pre.has(i.id) ? ' checked' : ''}><span class="pr-name"><span>${esc(i.supplier || 'Factura sin datos')}</span><small>${esc([i.number ? 'NCF ' + RD.normNcf(i.number) : 'sin NCF', i.project ? i.project.name : 'Sin proyecto'].join(' · '))}</small></span><span class="num">${esc(money(i.amount, i.currency))}</span></label>`;
  const list = pend.length ? groups.map((g, k) => `<div class="pick-group"><label class="pick-row head"><input type="checkbox" data-digi="group" data-g="${k}" checked><span class="pr-name"><span>${esc(dayGroupName(g.day))}</span><small>${plural(g.items.length, 'factura', 'facturas')}${g.day && g.day < todayISO() ? ' · sin mandar' : ''}</small></span><span class="num">${esc(totalStr(g.items))}</span></label>${g.items.map((i) => row(i, k)).join('')}</div>`).join('') : '<div class="empty"><p>No hay facturas por mandar. Las nuevas salen aquí hasta que se las mandes.</p></div>';
  const envs = [...D.envios].sort((a, b) => (Number(b.number) || 0) - (Number(a.number) || 0)).slice(0, 12);
  const hist = envs.map((e) => `<div class="o-inv"><button type="button" class="link" data-act="envio-view" data-id="${esc(e.id)}">Envío ${esc(String(e.number || ''))} · ${esc(fmtDate(e.date))} · ${plural((e.invoiceIds || []).length, 'factura', 'facturas')} · ${esc(ENVIO_LABEL[e.method] || '')}${e.to ? ' · a ' + esc(e.to) : ''}</button>${edit ? `<button type="button" class="btn ghost sm" data-act="envio-undo" data-id="${esc(e.id)}">Deshacer</button>` : ''}</div>`).join('');
  openSheet(`${sheetHead('Mandar a la digitadora')}<div class="sheet-b">
    <div class="field"><label for="digi-name">Digitadora</label><input id="digi-name" maxlength="60" placeholder="Nombre (opcional)" value="${esc(digiName())}"${edit ? '' : ' disabled'}></div>
    <p class="hint">Elige las facturas y mándalas en PDF (por WhatsApp o correo) o en papel con una lista para que firme de recibido. Cada factura queda marcada con la fecha en que se mandó, y deja de salir aquí.${!D.envios.length && pend.length ? ' Si algunas ya se las habías mandado antes de tener esto, márcalas y toca «Ya se las mandé».' : ''}</p>
    ${pend.length > 1 ? `<label class="check-row"><input type="checkbox" id="digi-all" checked><span>Todas (${pend.length})</span></label>` : ''}
    ${list}
    ${hist ? `<h3 class="h2">Envíos anteriores</h3><div class="list">${hist}</div>` : ''}
  </div>${edit && pend.length ? `<div class="sheet-f"><span class="grow" id="digi-sum">${plural(pend.length, 'factura', 'facturas')}</span><button type="button" class="btn primary" data-act="digi-pdf">${ICON.share} Mandar en PDF</button><button type="button" class="btn" data-act="digi-paper">Lista en papel</button><button type="button" class="btn ghost" data-act="digi-mark">Ya se las mandé</button></div>` : ''}`, { type: 'digi', id: 'digi' });
}
const digiChecked = () => $$('#sheet-root input[data-digi="inv"]').filter((b) => b.checked).map((b) => b.value);
function syncDigi() {
  const boxes = $$('#sheet-root input[data-digi="inv"]');
  const on = boxes.filter((b) => b.checked).length;
  for (const g of $$('#sheet-root input[data-digi="group"]')) {
    const kids = boxes.filter((b) => b.dataset.g === g.dataset.g);
    const n = kids.filter((b) => b.checked).length;
    g.checked = n === kids.length && n > 0;
    g.indeterminate = n > 0 && n < kids.length;
  }
  const all = $('#digi-all');
  if (all) { all.checked = on === boxes.length; all.indeterminate = on > 0 && on < boxes.length; }
  const s = $('#digi-sum');
  if (s) s.textContent = on ? plural(on, 'factura', 'facturas') : 'Ninguna elegida';
  for (const b of $$('[data-act="digi-pdf"], [data-act="digi-paper"], [data-act="digi-mark"]')) b.disabled = !on;
}
// PDF para la digitadora: la lista de las facturas (con firma de recibido) y, si va en PDF, cada factura detrás.
async function buildDigiPdf(invs, { number, date = todayISO(), to = digiName(), withFiles }, rep = {}) {
  const { PDFDocument, StandardFonts, rgb } = await pdflib();
  const out = await PDFDocument.create();
  const font = await out.embedFont(StandardFonts.Helvetica);
  const bold = await out.embedFont(StandardFonts.HelveticaBold);
  out.setTitle(pdfSafe(`Facturas para digitar - ${fmtDate(date)} - envío ${number}`));
  out.setCreator(PDF_CREATOR);
  const st = S.settings || {};
  const W = 612, H = 792, M = 42;
  const C = { ink: rgb(0.08, 0.11, 0.16), grey: rgb(0.38, 0.42, 0.48), line: rgb(0.84, 0.86, 0.9), band: rgb(0.94, 0.95, 0.97), accent: rgb(0.13, 0.26, 0.75) };
  let page, y;
  const T = (s, x, yy, size, f = font, color = C.ink) => page.drawText(pdfSafe(s), { x, y: yy, size, font: f, color });
  const R = (s, xr, yy, size, f = font, color = C.ink) => { const t = pdfSafe(s); page.drawText(t, { x: xr - f.widthOfTextAtSize(t, size), y: yy, size, font: f, color }); };
  const fit = (s, f, size, w) => { let t = pdfSafe(s); if (f.widthOfTextAtSize(t, size) <= w) return t; while (t.length > 1 && f.widthOfTextAtSize(t + '…', size) > w) t = t.slice(0, -1); return t + '…'; };
  const newPage = () => { page = out.addPage([W, H]); y = H - M; };
  const cols = [{ k: '#', x: M + 2, w: 14 }, { k: 'Proyecto', x: M + 18, w: 70 }, { k: 'Proveedor', x: M + 92, w: 108 }, { k: 'RNC', x: M + 204, w: 54 }, { k: 'NCF', x: M + 262, w: 66 }, { k: 'Fecha', x: M + 332, w: 46 }, { k: 'ITBIS', xr: M + 444, w: 60 }, { k: 'Total', xr: W - M - 2, w: 76 }];
  const head = () => { page.drawRectangle({ x: M, y: y - 6, width: W - 2 * M, height: 19, color: C.band }); cols.forEach((c) => (c.xr ? R(c.k, c.xr, y, 8, bold, C.grey) : T(c.k, c.x, y, 8, bold, C.grey))); y -= 21; };
  newPage();
  if (st.company) { T(fit(st.company, bold, 11, W - 2 * M - 180), M, y - 8, 11, bold); if (st.companyRnc) T('RNC ' + RD.fmtRnc(st.companyRnc), M, y - 21, 9, font, C.grey); }
  R('FACTURAS PARA DIGITAR', W - M, y - 8, 9, bold, C.accent);
  y -= 56;
  T(longDate(date), M, y, 20, bold); y -= 20;
  T([`Envío ${number}`, to ? 'Para: ' + to : '', st.preparedBy ? 'Entrega: ' + st.preparedBy : '', plural(invs.length, 'factura', 'facturas')].filter(Boolean).join('   ·   '), M, y, 9, font, C.grey); y -= 30;
  head();
  const days = new Set(invs.map(addedDay));
  let lastDay = null;
  invs.forEach((i, n) => {
    const day = addedDay(i);
    if (days.size > 1 && day !== lastDay) {
      if (y < M + 60) { newPage(); head(); }
      lastDay = day;
      T(`${day ? 'Recibidas el ' + fmtDate(day) : 'Sin fecha'} · ${plural(invs.filter((x) => addedDay(x) === day).length, 'factura', 'facturas')}`, M + 2, y, 8.5, bold, C.accent);
      y -= 16;
    }
    if (y < M + 40) { newPage(); head(); }
    const vals = [String(n + 1), i.project ? i.project.name : 'Sin proyecto', i.supplier || 'Sin nombre', RD.normRnc(i.rnc) || '-', RD.normNcf(i.number) || '-', fmtDmy(i.date) || '-', isNum(i.itbis) ? money(i.itbis, i.currency) : '-', money(i.amount, i.currency)];
    cols.forEach((c, k) => { const t = fit(vals[k], font, 8, c.w); if (c.xr) R(t, c.xr, y, 8); else T(t, c.x, y, 8); });
    y -= 7; page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.5, color: C.line }); y -= 12;
  });
  if (y < M + 110) newPage();
  y -= 8;
  // Un renglón para cada total, alineados a la derecha: así no se montan aunque haya pesos y dólares.
  R(`Total  ${totalStr(invs)}`, W - M - 2, y, 10, bold);
  y -= 14;
  R(`ITBIS  ${totalStr(invs, 'itbis')}`, W - M - 2, y, 9, font, C.grey);
  y -= 80;
  const sw = (W - 2 * M - 40) / 2;
  [['Entregó', st.preparedBy || ''], ['Recibió (nombre y fecha)', digiName()]].forEach(([lbl, who], k) => {
    const x = M + k * (sw + 40);
    page.drawLine({ start: { x, y }, end: { x: x + sw, y }, thickness: 0.8, color: C.ink });
    T(lbl, x, y - 13, 9, bold, C.grey);
    if (who) T(fit(who, font, 9, sw), x, y - 25, 9);
  });
  if (!withFiles) return out.save();
  for (const [n, i] of invs.entries()) {
    const label = `${n + 1} de ${invs.length} · ${i.supplier || 'Sin nombre'}${i.number ? ' · NCF ' + RD.normNcf(i.number) : ''} · ${money(i.amount, i.currency)}`;
    for (const f of [{ fileId: i.fileId, fileType: i.fileType }, ...(i.extraPages || [])]) {
      if (!f.fileId) continue;
      try {
        if (f.fileType === 'application/xml') continue;
        const b = await (await getBlob(f.fileId)).arrayBuffer();
        if (f.fileType === 'application/pdf') { const src = await PDFDocument.load(b, { ignoreEncryption: true }); (await out.copyPages(src, src.getPageIndices())).forEach((p) => out.addPage(p)); continue; }
        const img = isPng(b) ? await out.embedPng(b) : await out.embedJpg(b);
        newPage();
        T(fit(label, font, 8.5, W - 2 * M), M, H - M + 12, 8.5, font, C.grey);
        const bw = W - 2 * M, bh = H - 2 * M - 8, s = Math.min(bw / img.width, bh / img.height);
        page.drawImage(img, { x: M + (bw - img.width * s) / 2, y: M + (bh - img.height * s), width: img.width * s, height: img.height * s });
      } catch (e) { console.warn('PDF digitadora', e); (rep.missing = rep.missing || new Set()).add(i.supplier || i.fileName || 'Sin nombre'); }
    }
  }
  return out.save();
}
async function digiSend(method, btn) {
  const ids = digiChecked();
  if (!ids.length) return;
  const D = derive();
  const invs = ids.map((id) => D.invoices.find((i) => i.id === id)).filter(Boolean);
  const number = nextEnvioNumber();
  if (method === 'manual') { btn.disabled = true; if (!(await saveEnvio(ids, 'manual', number))) btn.disabled = false; return; }
  const label = btn.innerHTML;
  btn.disabled = true;
  btn.textContent = 'Preparando…';
  try {
    const rep = {};
    const bytes = await buildDigiPdf(invs, { number, withFiles: method === 'archivo' }, rep);
    const miss = rep.missing ? [...rep.missing] : [];
    S.envioPending = { ids, method, number };
    deliverFile(new Blob([bytes], { type: 'application/pdf' }), fileSafe(`Facturas para digitar - ${fmtDate(todayISO())} - envío ${number} - ${plural(invs.length, 'factura', 'facturas')}`) + '.pdf');
    // Se marca cuando se confirma que se mandó, no antes: así no queda marcada una que no salió.
    const b = $('.sheet-b');
    if (b && miss.length) b.insertAdjacentHTML('beforeend', `<div class="msg warn">${ICON.alert}<span>No se pudo poner en el PDF el archivo de ${esc(miss.join(', '))}; va solo en la lista. Mándaselo aparte.</span></div>`);
    if (b) b.insertAdjacentHTML('beforeend', `<div class="msg hint" id="envio-confirm"><span>${method === 'papel' ? 'Imprímela y entrégala con las facturas. Cuando se las entregues' : 'Cuando se lo mandes'}, toca aquí para que queden marcadas:</span><button type="button" class="btn primary sm" data-act="envio-ok">Ya se las ${method === 'papel' ? 'entregué' : 'mandé'}: marcar ${plural(ids.length, 'factura', 'facturas')}</button></div>`);
    if (S.ready) S.ready.onDone = () => { const c = $('#envio-confirm'); if (c) { c.classList.add('pulse'); c.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } };
  } catch (e) {
    console.error(e);
    toast('No se pudo preparar el PDF. Intenta de nuevo.');
    btn.innerHTML = label;
    btn.disabled = false;
  }
}
async function saveEnvio(ids, method, number) {
  const D = derive();
  const fresh = ids.filter((id) => { const i = D.invoices.find((x) => x.id === id); return i && !i.envio; });
  if (!fresh.length) { toast('Esas facturas ya estaban marcadas como enviadas.'); closeSheet(); return true; }
  const ok = await write(() => db.collection('envios').doc().set({ number: number || nextEnvioNumber(), date: todayISO(), method, to: digiName(), invoiceIds: fresh, createdAt: new Date().toISOString() }), `Listo: ${plural(fresh.length, 'factura marcada', 'facturas marcadas')} como ${method === 'papel' ? 'entregadas' : 'enviadas'}`);
  if (ok) { S.envioPending = null; closeSheet(); }
  return ok;
}
async function digiOne(invId, btn) {
  const i = derive().invoices.find((x) => x.id === invId);
  if (!i || i.envio) return;
  if (btn) btn.disabled = true;
  if (await write(() => db.collection('envios').doc().set({ number: nextEnvioNumber(), date: todayISO(), method: 'manual', to: digiName(), invoiceIds: [invId], createdAt: new Date().toISOString() }), 'Marcada como enviada a la digitadora')) scheduleRender();
  else if (btn) btn.disabled = false;
}
async function digiUndoOne(invId) {
  const e = S.envios.find((x) => (x.invoiceIds || []).includes(invId));
  if (!e) return;
  const left = (e.invoiceIds || []).filter((x) => x !== invId);
  await write(() => (left.length ? db.doc('envios/' + e.id).update({ invoiceIds: left }) : db.doc('envios/' + e.id).delete()), 'Quitada del envío: sale otra vez como por mandar');
}
function openEnvio(id) {
  const D = derive();
  const e = D.envios.find((x) => x.id === id);
  if (!e) return;
  const invs = (e.invoiceIds || []).map((x) => D.invoices.find((i) => i.id === x)).filter(Boolean);
  openSheet(`${sheetHead('Envío ' + esc(String(e.number || '')))}<div class="sheet-b">
    <p class="hint">${esc(fmtDate(e.date))} · ${esc(ENVIO_LABEL[e.method] || '')}${e.to ? ' · a ' + esc(e.to) : ''} · ${plural(invs.length, 'factura', 'facturas')} · ${esc(totalStr(invs))}</p>
    <div class="list">${invs.map((i) => cardHTML(i, D)).join('') || '<p class="hint">Las facturas de este envío ya no están.</p>'}</div>
  </div><div class="sheet-f">${invs.length ? `<button type="button" class="btn" data-act="envio-pdf" data-id="${esc(e.id)}">${ICON.down} Sacar el PDF otra vez</button>` : ''}<button type="button" class="btn ghost" data-act="digi-open">Todos los envíos</button></div>`, { type: 'envio', id: e.id });
}
async function envioPdfAgain(id) {
  const D = derive();
  const e = D.envios.find((x) => x.id === id);
  if (!e) return;
  const invs = digiByDay((e.invoiceIds || []).map((x) => D.invoices.find((i) => i.id === x)).filter(Boolean)).flatMap((g) => g.items);
  try { deliverFile(new Blob([await buildDigiPdf(invs, { number: e.number, date: e.date, to: e.to || '', withFiles: e.method !== 'papel' })], { type: 'application/pdf' }), fileSafe(`Facturas para digitar - ${fmtDate(e.date)} - envío ${e.number}`) + '.pdf'); }
  catch (er) { console.error(er); toast('No se pudo preparar el PDF.'); }
}

/* ---------- papelera: lo que se borra se queda 30 días y se puede recuperar ---------- */
const TRASH_DAYS = 30;
const TRASH_KIND = { invoice: ['invoices', 'Factura', 'Factura recuperada'], conduce: ['conduces', 'Conduce', 'Conduce recuperado'], order: ['orders', 'Orden de compra', 'Orden recuperada'], payment: ['payments', 'Pago', 'Pago recuperado'], traslado: ['traslados', 'Traslado de materiales', 'Traslado recuperado'], trpago: ['traslados', 'Pago entre obras', 'Pago entre obras recuperado'] };
const rawDoc = (o) => { const { id, ...rest } = o; return rest; };
function toTrash(kind, doc, label, extra = {}) {
  return db.collection('papelera').doc().set({ kind, srcId: doc.id, data: rawDoc(doc), label: String(label || '').slice(0, 160), extra, deletedAt: new Date().toISOString() });
}
const trashFiles = (e) => { const d = e.data || {}; return [d.fileId, d.thumbId, d.xmlId, d.origFileId, d.signedFileId, d.signedThumbId, d.outPhotoId, d.inPhotoId, ...(d.extraPages || []).flatMap((x) => [x.fileId, x.thumbId])].filter(Boolean); };
const trashLeft = (e) => Math.max(0, TRASH_DAYS - Math.floor((Date.now() - (Date.parse(e.deletedAt || '') || 0)) / 864e5));
async function restoreTrash(entryId) {
  const e = S.papelera.find((x) => x.id === entryId);
  if (!e || !TRASH_KIND[e.kind]) return false;
  const [coll, , done] = TRASH_KIND[e.kind];
  const data = { ...e.data };
  if (e.kind === 'invoice') data.hist = histAdd(data, histEntry('Recuperada de la papelera'));
  if (e.kind === 'conduce' && data.invoiceId && !S.invoices.some((i) => i.id === data.invoiceId)) data.invoiceId = null;
  if (e.kind === 'payment') { const taken = new Set(S.payments.flatMap((p) => p.invoiceIds || [])); data.invoiceIds = (data.invoiceIds || []).filter((id) => S.invoices.some((i) => i.id === id) && !taken.has(id)); }
  const ok = await write(async () => {
    await db.doc(coll + '/' + e.srcId).set(data);
    if (e.kind === 'invoice') for (const cid of (e.extra && e.extra.condIds) || []) { const c = S.conduces.find((x) => x.id === cid); if (c && !c.invoiceId) await db.doc('conduces/' + cid).update({ invoiceId: e.srcId, auto: false }); }
    await db.doc('papelera/' + e.id).delete();
  }, done + (e.kind === 'invoice' && e.extra && e.extra.payId ? ' (vuelve como pendiente)' : ''));
  if (ok) { scheduleRender(); setTimeout(() => { if (S.sheet && S.sheet.type === 'trash') openTrash(); }, 200); }
  return ok;
}
// Deshacer justo después de borrar: la entrada más nueva de ese documento.
function undoTrash(kind, srcId) {
  const e = S.papelera.filter((x) => x.kind === kind && x.srcId === srcId).sort((a, b) => String(b.deletedAt).localeCompare(String(a.deletedAt)))[0];
  if (e) restoreTrash(e.id);
}
async function purgeTrash(all) {
  if (!canEdit()) return;
  const lim = Date.now() - TRASH_DAYS * 864e5;
  for (const e of S.papelera.filter((x) => all || (Date.parse(x.deletedAt || '') || 0) < lim)) {
    await dbw(() => db.doc('papelera/' + e.id).delete()).catch((er) => console.warn(er));
    for (const a of trashFiles(e)) { try { await assets.delete(a); } catch (er) { /* ya no está */ } }
  }
}
function openTrash() {
  const list = [...S.papelera].sort((a, b) => String(b.deletedAt).localeCompare(String(a.deletedAt)));
  const edit = canEdit();
  const rows = list.map((e) => `<div class="o-inv trash-row"><span class="grow"><b>${esc((TRASH_KIND[e.kind] || ['', 'Documento'])[1])}</b> · ${esc(e.label || '')}<small>Borrado ${esc(relTime(Date.parse(e.deletedAt)))} · se elimina para siempre en ${plural(trashLeft(e), 'día', 'días')}</small></span>${edit ? `<button type="button" class="btn sm" data-act="trash-restore" data-id="${esc(e.id)}">Recuperar</button>` : ''}</div>`).join('');
  openSheet(`${sheetHead('Papelera')}<div class="sheet-b">
    <p class="hint">Lo que borras (facturas, conduces, órdenes, pagos y traslados) se queda aquí ${TRASH_DAYS} días con sus archivos, y se puede recuperar. Después se elimina para siempre.</p>
    ${rows ? `<div class="list">${rows}</div>` : '<div class="empty"><p>La papelera está vacía.</p></div>'}
  </div>${edit && list.length ? `<div class="sheet-f"><span class="grow">${plural(list.length, 'cosa', 'cosas')} en la papelera</span><button type="button" class="btn danger sm" data-act="trash-empty">Vaciar la papelera</button></div>` : ''}`, { type: 'trash', id: 'trash' });
}

/* ---------- respaldo automático en la nube ---------- */
let cloudBkBusy = false;
async function maybeCloudBackup(s) {
  if (!s || !s.on || s.status !== 'ok' || cloudBkBusy || !canEdit() || !S.invoices.length) return;
  const last = Date.parse((S.bk && S.bk.last) || '') || 0;
  if (Date.now() - last < 7 * 864e5) return;
  cloudBkBusy = true;
  try { const r = await RT.sync.backupNow(); await dbw(() => db.doc('settings/respaldos').set({ last: r.at, slot: r.slot, docs: r.docs })); }
  catch (e) { console.warn('respaldo en la nube', e); }
  finally { setTimeout(() => { cloudBkBusy = false; }, 60000); }
}
const bkName = (b) => (b.name === 'antes-de-restaurar.json' ? 'Antes de la última restauración' : 'Semana del ' + fmtDate(String(b.at).slice(0, 10)));
async function openCloudBackups() {
  openSheet(`${sheetHead('Respaldos en la nube')}<div class="sheet-b"><p class="loading">Buscando los respaldos…</p></div>`, { type: 'cloudbk', id: 'cloudbk' });
  let list = [];
  try { list = await RT.sync.listBackups(); } catch (e) { console.warn(e); }
  if (!S.sheet || S.sheet.type !== 'cloudbk') return;
  list.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const edit = canEdit();
  const rows = list.map((b) => `<div class="o-inv trash-row"><span class="grow"><b>${esc(bkName(b))}</b><small>${esc(fmtDate(String(b.at).slice(0, 10)))} ${esc(String(b.at).slice(11, 16))}${b.size ? ' · ' + esc(fmtBytes(b.size)) : ''}</small></span>${edit ? `<button type="button" class="btn sm" data-act="cloud-bk-restore" data-name="${esc(b.name)}">Restaurar</button>` : ''}</div>`).join('');
  openSheet(`${sheetHead('Respaldos en la nube')}<div class="sheet-b">
    <p class="hint">Cada semana la app guarda solos tus datos en la nube y quedan los últimos 8. Si algo se borra o se cambia por error, aquí se vuelve a como estaba ese día, en todos los aparatos conectados. Las fotos y los PDF no se tocan.</p>
    ${rows ? `<div class="list">${rows}</div>` : '<div class="empty"><p>Todavía no hay respaldos en la nube. El primero se hace solo, o tócale «Hacer uno ahora».</p></div>'}
    <div id="cbk-confirm" hidden></div>
  </div>${edit ? '<div class="sheet-f"><button type="button" class="btn" data-act="cloud-bk-now">Hacer uno ahora</button></div>' : ''}`, { type: 'cloudbk', id: 'cloudbk' });
}
let cloudRestore = null;
async function askCloudRestore(name, btn) {
  btn.disabled = true;
  btn.textContent = 'Abriendo…';
  try {
    const bk = await RT.sync.getBackup(name);
    const docs = Array.isArray(bk && bk.docs) ? bk.docs : null;
    if (!docs) throw new Error('vacío');
    const n = (c) => docs.filter((d) => String(d.path).startsWith(c + '/')).length;
    cloudRestore = { name, docs };
    const box = $('#cbk-confirm');
    box.hidden = false;
    box.innerHTML = `<div class="confirm"><p>Este respaldo es del ${esc(fmtDate(String(bk.exportedAt || '').slice(0, 10)))} y tiene ${plural(n('invoices'), 'factura', 'facturas')}, ${plural(n('orders'), 'orden', 'órdenes')} y ${plural(n('payments'), 'pago', 'pagos')}. Al restaurarlo, <b>todo vuelve a como estaba ese día</b>, en este y en los otros aparatos conectados. Antes se guarda una copia de cómo está ahora, por si acaso.</p><div class="actions"><button type="button" class="btn danger" data-act="cloud-bk-yes">Sí, restaurar</button><button type="button" class="btn" data-act="cloud-bk-no">No</button></div></div>`;
    box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  } catch (e) {
    console.warn(e);
    toast('No se pudo abrir ese respaldo. Revisa el internet.');
  }
  btn.disabled = false;
  btn.textContent = 'Restaurar';
}
async function doCloudRestore(btn) {
  if (!cloudRestore) return;
  btn.disabled = true;
  btn.textContent = 'Restaurando…';
  try {
    await RT.sync.backupNow({ slot: 'antes-de-restaurar' });
    await RT.importDocs(cloudRestore.docs, ['settings/respaldos']);
    cloudRestore = null;
    closeSheet();
    toast('Listo: los datos volvieron a como estaban en ese respaldo');
  } catch (e) {
    console.error(e);
    toast('No se pudo restaurar. Revisa el internet e intenta de nuevo.');
    btn.disabled = false;
    btn.textContent = 'Sí, restaurar';
  }
}

/* ---------- indicador de la nube (arriba) ---------- */
function renderSyncChip() {
  const el = $('#sync-chip');
  if (!el) return;
  const s = RT.sync.status();
  if (!s.on) { el.hidden = true; return; }
  const pend = (s.pendingDocs || 0) + (s.pendingFiles || 0);
  const ERR = { offline: ['off', 'Sin internet'], auth: ['bad', 'Entrar de nuevo'], paused: ['bad', 'En pausa'], unreachable: ['bad', 'Sin conexión'], limited: ['bad', 'Con límite'] };
  const [cls, txt] = s.status === 'syncing' ? ['busy', 'Sincronizando'] : s.status === 'error' ? ERR[s.code] || ['bad', 'Error'] : pend ? ['pend', `${pend} por subir`] : ['ok', 'Al día'];
  el.hidden = false;
  el.className = 'sync-chip ' + cls;
  el.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 18.5h10.2a4.3 4.3 0 0 0 .6-8.56A6.2 6.2 0 0 0 5.9 9.6 4.5 4.5 0 0 0 7 18.5z"/></svg><span>${esc(txt)}</span>`;
  el.title = s.status === 'error' ? s.error : s.at ? `Nube: ${txt.toLowerCase()} (${relTime(s.at)})` : txt;
  el.setAttribute('aria-label', 'Nube: ' + txt);
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
  if (s === 'armando') { upd.presentedAt = ''; upd.paidAt = ''; upd.approvedAt = ''; upd.approvedBy = ''; }
  if (s === 'presentado') { upd.paidAt = ''; upd.returnNote = ''; if (pay.status === 'armando' || !pay.presentedAt) upd.presentedAt = todayISO(); }
  if (s === 'pagado' && approvalOn() && !pay.approvedAt) { toast('Falta la aprobación del dueño.'); return; }
  if (s === 'pagado') upd.paidAt = todayISO();
  await write(() => db.doc('payments/' + payId).update(upd), { presentado: 'Marcado como presentado', pagado: 'Marcado como pagado', armando: 'Regresó a por presentar' }[s]);
}
async function removeFromPayment(payId, invId) {
  const pay = S.payments.find((p) => p.id === payId);
  if (pay) await write(() => db.doc('payments/' + payId).update({ invoiceIds: (pay.invoiceIds || []).filter((x) => x !== invId) }), 'Factura quitada del pago');
}
async function deletePayment(payId) {
  const p = S.payments.find((x) => x.id === payId);
  if (!p) return;
  if (await write(async () => { await toTrash('payment', p, [p.name || 'Pago', plural((p.invoiceIds || []).length, 'factura', 'facturas')].join(' · ')); await db.doc('payments/' + payId).delete(); })) {
    S.paymentId = null; S.payDel = false; renderAll();
    toastAct('Pago movido a la papelera', 'Deshacer', () => undoTrash('payment', payId));
  }
}

/* ---------- órdenes de compra ---------- */
function itemRowHTML(it, n, dis) {
  return `<div class="o-row" data-row><span class="o-n mono">${n}</span><input data-f="qty" class="mono" inputmode="decimal" maxlength="12" placeholder="Cant." aria-label="Cantidad" value="${esc(it.qty != null ? String(it.qty) : '')}" ${dis}><input data-f="unit" list="dl-units" maxlength="20" placeholder="Unidad" aria-label="Unidad" value="${esc(it.unit || '')}" ${dis}><input data-f="price" class="mono" inputmode="decimal" maxlength="12" placeholder="Precio" aria-label="Precio por unidad" value="${esc(isNum(it.price) ? String(it.price) : '')}"${it.priceSrc ? ` data-src="${esc(it.priceSrc)}"` : ''} ${dis}><input data-f="desc" list="dl-items" maxlength="160" placeholder="Descripción y especificaciones" aria-label="Descripción" value="${esc(it.desc || '')}" ${dis}>${dis ? '' : `<button type="button" class="icon-btn plain" data-act="order-rm-item" aria-label="Quitar artículo">${ICON.close}</button>`}</div>`;
}
function uniqList(list) { const seen = new Set(); const out = []; for (const v of list) { const s = String(v || '').trim(); const k = norm(s); if (s && !seen.has(k)) { seen.add(k); out.push(s); } } return out; }
function orderSig(o, D) { return JSON.stringify([o.status, o.signedFileId, o.signedAt, o.updatedAt, o.number, (D.invByOrder.get(o.id) || []).map((i) => [i.id, i.supplier, i.number, i.amount, (i.conduces || []).map((c) => [c.id, c.material, c.qty, c.trips])])]); }
function refreshOrderSheet(D) {
  const sh = S.sheet;
  if (!sh || sh.type !== 'order' || !sh.id || sh.dirty) return;
  const o = D.orderById.get(sh.id);
  if (!o) { if (S.got.orders && sh.sig) closeSheet(); return; }
  if (orderSig(o, D) !== sh.sig) openOrder(o.id, true);
}
function openOrder(id, keepScroll, copyFrom) {
  const D = derive();
  const o = id ? D.orderById.get(id) : null;
  if (id && !o) return;
  const src = !o && copyFrom ? D.orderById.get(copyFrom) : null;
  const edit = canEdit() && (!o || o.status !== 'anulada');
  const dis = edit ? '' : 'disabled';
  const pf = S.tab === 'ordenes' ? S.orderProject : S.projectFilter;
  const projId = o ? o.projectId : src ? src.projectId : pf !== 'all' && pf !== 'none' ? pf : '';
  // Lo que se repite de la última orden de la misma obra: lugar de entrega, quién pide y departamento.
  const lastOf = (pid, f) => { const p = D.orders.find((x) => x.projectId === pid && x[f]); return p ? p[f] : ''; };
  const data = o || (src
    ? { number: nextOrderNumber(), date: todayISO(), projectId: src.projectId, requestedBy: src.requestedBy || '', supplier: src.supplier || '', neededDate: '', place: src.place || '', department: src.department || '', items: (src.items || []).map((x) => ({ ...x })), notes: src.notes || '' }
    : { number: nextOrderNumber(), date: todayISO(), projectId: projId, requestedBy: projId ? lastOf(projId, 'requestedBy') : '', supplier: '', neededDate: '', place: projId ? lastOf(projId, 'place') : '', department: (projId && lastOf(projId, 'department')) || (D.orders[0] && D.orders[0].department) || '', items: [], notes: '' });
  const items = (data.items || []).slice();
  if (edit) for (let k = Math.max(1, 3 - items.length); k > 0; k--) items.push({});
  const opts = D.projects.map((p) => `<option value="${esc(p.id)}"${p.id === data.projectId ? ' selected' : ''}>${esc(p.name)}</option>`).join('');
  const invs = o ? D.invByOrder.get(o.id) || [] : [];
  const dl = (idn, arr) => `<datalist id="${idn}">${arr.map((v) => `<option value="${esc(v)}"></option>`).join('')}</datalist>`;
  const signed = o && o.signedFileId;
  const signedThumb = signed ? o.signedThumbId || (String(o.signedFileType).startsWith('image/') ? o.signedFileId : null) : null;
  const statusText = !o ? '' : o.status === 'autorizada' ? 'Firmada y sellada' + (o.signedAt ? ' el ' + fmtDate(o.signedAt) : '') + '.' : o.status === 'enviada' ? 'Falta adjuntar la copia firmada y sellada.' : o.status === 'anulada' ? 'Esta orden está anulada.' : 'Todavía no has sacado el PDF.';
  const fill = edit && ai.hasKey() ? `<details class="edit" id="o-fill"${!o && !src ? ' open' : ''}><summary>Llenar desde el mensaje del pedido</summary><div class="fields"><div class="field full"><label for="o-msg">Pega aquí el mensaje (por ejemplo, de WhatsApp)</label><textarea id="o-msg" rows="4" maxlength="4000" placeholder="Ej.: Necesito para mañana en Caperuza 2: 10 fundas de cemento, 20 varillas de 3/8 y 2 galones de pintura blanca"></textarea></div><div class="actions full"><button type="button" class="btn primary" data-act="order-paste">Pegar y llenar</button><button type="button" class="btn" data-act="order-fill">Llenar con el mensaje</button><button type="button" class="btn" data-act="order-fill-photo">Usar una foto de la lista</button></div><p class="usage full" id="o-fill-status"></p></div></details>` : '';
  const signedBox = o ? `<div class="card"><h2>Orden firmada y sellada</h2>${signed ? `<button type="button" class="preview" data-act="order-view-signed" data-id="${esc(o.id)}">${signedThumb ? `<img src="${esc(assetUrl(signedThumb))}" alt="">` : '<span class="ph">PDF</span>'}<span class="preview-tag">Ver</span></button>` : `<p class="hint">Cuando la firmen y la sellen, tómale una foto y adjúntala aquí${S.settings.orderQr !== false ? ', o agrégala con <b>+</b> desde Facturas: la app reconoce el código QR de la orden y la adjunta sola' : ''}. Esa copia es la que va con la factura en el PDF del pago.</p>`}<div class="actions">${signed ? `<button type="button" class="btn" data-act="order-share-signed" data-id="${esc(o.id)}">${ICON.share} Compartir la firmada</button>` : ''}${edit ? `<button type="button" class="btn" data-act="order-signed">${ICON.plus} ${signed ? 'Cambiar la copia firmada' : 'Adjuntar la orden firmada'}</button>` : ''}</div></div>` : '';
  const repeat = o && canEdit() ? `<div><button type="button" class="btn sm" data-act="order-repeat" data-id="${esc(o.id)}">Repetir esta orden</button></div>` : '';
  const copyNote = src ? `<div class="msg hint"><span>Copia de la orden <b>${esc(orderNo(src))}</b>. Revisa las cantidades antes de guardar.</span></div>` : '';
  const invBox = o ? orderInvBoxHTML(o, D, edit) : '';
  const prevScroll = keepScroll && $('.sheet-b') ? $('.sheet-b').scrollTop : 0;
  const danger = o && canEdit() ? `<div>${invs.length ? (o.status !== 'anulada' ? '<button type="button" class="btn danger sm" data-act="order-annul">Anular orden</button>' : '') : `<button type="button" class="btn danger sm" data-act="order-del">${ICON.trash} Eliminar orden</button>`}</div><div id="o-confirm" hidden></div>` : '';
  openSheet(`<form id="order-form" data-id="${o ? esc(o.id) : ''}" autocomplete="off">${sheetHead(o ? esc(orderNo(o)) : 'Nueva orden de compra')}
    <div class="sheet-b">
      ${copyNote}
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
      <p class="usage" id="o-est">${esc(estText(data.items || []))}</p>
      <div class="field"><label for="o-notes">Observaciones / instrucciones especiales</label><textarea id="o-notes" rows="2" maxlength="300" ${dis}>${esc(data.notes || '')}</textarea></div>
      ${signedBox}
      ${invBox}
      ${repeat}
      ${danger}
    </div>
    <div class="sheet-f">${edit ? '<button type="submit" class="btn">Guardar</button>' : ''}<button type="button" class="btn primary" data-act="order-pdf">${ICON.down} ${edit ? 'Guardar y sacar PDF' : 'Sacar PDF'}</button></div>
  </form>${dl('dl-units', uniqList([...UNITS, ...D.orders.flatMap((x) => (x.items || []).map((it) => it.unit))]))}${dl('dl-people', uniqList(D.orders.map((x) => x.requestedBy)))}${dl('dl-sups', uniqList([...D.orders.map((x) => x.supplier), ...S.invoices.map((x) => x.supplier)]))}${dl('dl-depts', uniqList(D.orders.map((x) => x.department)))}${dl('dl-items', uniqList(D.orders.flatMap((x) => (x.items || []).map((it) => it.desc))).slice(0, 400))}`, { type: 'order', id: o ? o.id : null, dirty: !!src, sig: o ? orderSig(o, D) : null });
  if (keepScroll && $('.sheet-b')) $('.sheet-b').scrollTop = prevScroll;
}
// Facturas de la orden: abrirlas, quitarlas, o enlazar una que llegó por separado.
function orderInvBoxHTML(o, D, edit) {
  const invs = D.invByOrder.get(o.id) || [];
  const rows = invs.map((i) => `<div class="o-inv"><button type="button" class="link" data-act="open-inv" data-id="${esc(i.id)}">${esc((i.supplier || 'Factura') + (i.number ? ' · ' + RD.normNcf(i.number) : '') + ' · ' + money(i.amount, i.currency))}</button>${edit ? `<button type="button" class="btn ghost sm" data-act="order-unlink-inv" data-id="${esc(i.id)}" data-order="${esc(o.id)}">Quitar</button>` : ''}</div>`).join('');
  const linkBtn = edit ? `<div><button type="button" class="btn sm" data-act="order-link-open" data-id="${esc(o.id)}">${ICON.plus} Enlazar una factura</button></div><div id="o-link-box" hidden></div>` : '';
  if (!invs.length && !linkBtn) return '';
  const qi = orderQtyIssues(o, D);
  const qmsg = qi.length ? `<div class="msg warn">${ICON.alert}<span>${qi.map((x) => `Los conduces traen <b>${esc(fmtQty(x.delivered))}${x.unit ? ' ' + esc(x.unit) : ''}</b> de ${esc(x.desc)} y la orden pidió ${esc(fmtQty(x.ordered))}.`).join(' ')}</span></div>` : '';
  return `<div class="card" id="o-invs"><h2>Facturas de esta orden</h2>${qmsg}${invs.length ? `<div class="list">${rows}</div>` : '<p class="hint">Todavía no tiene facturas. Si la factura llegó por separado, enlázala aquí.</p>'}${linkBtn}</div>`;
}
function orderLinkResultsHTML(orderId, q) {
  const D = derive();
  const o = D.orderById.get(orderId);
  if (!o) return '';
  const same = (i) => sameName(o.supplier, i.supplier) || (!!i.rnc && (D.namesByRnc.get(i.rnc) || []).some((n) => sameName(o.supplier, n)));
  const score = (i) => (same(i) ? 2 : 0) + (o.projectId && i.projectId === o.projectId ? 1 : 0);
  const nq = norm(q);
  let list = D.invoices.filter((i) => !i.orderId || (same(i) && !(i.orders || []).some((x) => x.id === o.id)));
  if (nq) list = list.filter((i) => norm([i.supplier, i.number, i.rnc, i.concept, i.project && i.project.name, isNum(i.amount) ? String(i.amount) : ''].join(' ')).includes(nq));
  list.sort((a, b) => score(b) - score(a) || String(b.date || b.createdAt || '').localeCompare(String(a.date || a.createdAt || '')));
  const rows = list.slice(0, 30).map((i) => `<button type="button" class="o-pick" data-act="order-link-inv" data-id="${esc(i.id)}" data-order="${esc(o.id)}"><span><b>${esc(i.supplier || 'Factura sin datos')}</b><small>${esc([i.number ? 'NCF ' + RD.normNcf(i.number) : '', fmtDate(i.date), i.project ? i.project.name : 'Sin proyecto'].filter(Boolean).join(' · '))}</small></span><span class="num">${esc(money(i.amount, i.currency))}</span></button>`).join('');
  if (!rows) return `<p class="hint">${nq ? 'Ninguna factura sin orden coincide con la búsqueda.' : 'No hay facturas sin orden. Si la factura está en otra orden, cámbiala desde la factura.'}</p>`;
  return `<div class="o-picks">${rows}</div>${list.length > 30 ? `<p class="usage">Se muestran 30 de ${list.length}; usa el buscador.</p>` : ''}`;
}
function openOrderLinkBox(orderId) {
  const box = $('#o-link-box');
  if (!box) return;
  box.hidden = false;
  box.innerHTML = `<div class="field"><label for="o-link-q">Facturas sin orden (primero las de este proveedor y esta obra)</label><input id="o-link-q" type="search" placeholder="Buscar proveedor, NCF o monto" autocomplete="off" data-order="${esc(orderId)}"></div><div id="o-link-results">${orderLinkResultsHTML(orderId, '')}</div>`;
  box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
// Después de enlazar o quitar: se redibuja la tarjeta de facturas (aunque haya cambios sin guardar en la orden).
function refreshOrderInvBox(orderId) {
  setTimeout(() => {
    const card = $('#o-invs');
    if (!card || !S.sheet || S.sheet.type !== 'order' || S.sheet.id !== orderId) return;
    const D = derive();
    const o = D.orderById.get(orderId);
    if (!o) return;
    card.outerHTML = orderInvBoxHTML(o, D, canEdit() && o.status !== 'anulada');
    if (S.sheet) S.sheet.sig = S.sheet.dirty ? S.sheet.sig : orderSig(o, D);
  }, 80);
}
function renumberItems(box) { $$('[data-row]', box || $('#o-items') || document).forEach((r, k) => { r.querySelector('.o-n').textContent = String(k + 1); }); }
function addItemRow(it = {}, sel = '#o-items') { const box = $(sel); if (!box) return; box.insertAdjacentHTML('beforeend', itemRowHTML(it, box.children.length + 1, '')); renumberItems(box); }
function collectItems(box = '#o-items') {
  return $$(box + ' [data-row]').map((r) => {
    const qtyRaw = r.querySelector('[data-f="qty"]').value.trim();
    const qty = /^\d+([.,]\d+)?$/.test(qtyRaw) ? parseAmount(qtyRaw) : qtyRaw.slice(0, 12);
    const pr = r.querySelector('[data-f="price"]');
    const price = pr && pr.value.trim() ? parseAmount(pr.value) : null;
    return { qty, unit: r.querySelector('[data-f="unit"]').value.trim().slice(0, 20), desc: r.querySelector('[data-f="desc"]').value.trim().slice(0, 160), price: isNum(price) && price >= 0 ? round2(price) : null, ...(pr && pr.dataset.src && isNum(price) ? { priceSrc: pr.dataset.src } : {}) };
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
  if (S.invoices.some((i) => orderIdsOf(i).includes(id))) { toast('Tiene facturas enlazadas; mejor anúlala.'); return; }
  if (!(await write(async () => { await toTrash('order', o, [orderNo(o), o.supplier].filter(Boolean).join(' · ')); await db.doc('orders/' + id).delete(); }))) return;
  closeSheet();
  toastAct('Orden movida a la papelera', 'Deshacer', () => undoTrash('order', id));
}
async function saveSignedCopy(o, blob, ftype, thumb) {
  const up = await assets.upload(blob, { type: ftype });
  let thumbId = null;
  if (thumb) { try { thumbId = (await assets.upload(thumb, { type: 'image/jpeg' })).id; } catch (e) { console.warn('miniatura', e); } }
  const old = [o.signedFileId, o.signedThumbId].filter(Boolean);
  await dbw(() => db.doc('orders/' + o.id).update({ signedFileId: up.id, signedFileType: ftype, signedThumbId: thumbId, signedAt: todayISO(), status: o.status === 'anulada' ? 'anulada' : 'autorizada' }));
  for (const a of old) { try { await assets.delete(a); } catch (e) { /* ya no existe */ } }
}
async function attachSigned(orderId, file) {
  let o = S.orders.find((x) => x.id === orderId);
  if (!o) return;
  toast('Guardando la copia firmada…');
  try {
    const name = String(file.name || ''), type = String(file.type || '').toLowerCase();
    const isPdf = type === 'application/pdf' || /\.pdf$/i.test(name);
    let blob, ftype, thumb = null, qr = null;
    if (isPdf) {
      const bytes = await file.arrayBuffer();
      blob = new Blob([bytes], { type: 'application/pdf' });
      ftype = 'application/pdf';
      let r = null;
      try { r = await inspectPdf(bytes); thumb = r.thumb; qr = r.qr; } catch (e) { console.warn('miniatura', e); }
      if (r && r.creator === PDF_CREATOR) throw new UserError('Ese es el PDF de la orden sin firmar. Adjunta la foto o el escaneo de la orden ya firmada y sellada.');
    } else {
      const r = await prepImage(file);
      blob = r.blob; qr = r.qr;
      ftype = 'image/jpeg';
    }
    // Si la foto trae el código QR de otra orden, se adjunta a esa.
    const other = qr && qr.kind === 'order' && qr.id !== o.id ? S.orders.find((x) => x.id === qr.id) : null;
    if (other) o = other;
    await saveSignedCopy(o, blob, ftype, thumb);
    toast(other ? `Esa foto es de la orden ${orderNo(other)}: quedó adjunta a esa.` : 'Copia firmada guardada');
  } catch (e) {
    console.error(e);
    toast(e instanceof UserError ? e.message : 'No se pudo guardar la copia. Intenta de nuevo.');
  }
}
async function pasteOrderMessage(btn) {
  const box = $('#o-msg');
  if (!box) return;
  let txt = '';
  try { if (navigator.clipboard && navigator.clipboard.readText) txt = await navigator.clipboard.readText(); } catch (e) { txt = ''; }
  if (!String(txt).trim()) {
    const st = $('#o-fill-status');
    if (st) st.textContent = 'No se pudo leer lo que copiaste. Mantén presionado el cuadro, toca Pegar y luego «Llenar con el mensaje».';
    box.focus();
    return;
  }
  box.value = String(txt).slice(0, 4000);
  fillOrderFromMessage(btn, null);
}
async function shareSigned(id) {
  const o = S.orders.find((x) => x.id === id);
  if (!o || !o.signedFileId) return;
  try {
    const b = await getBlob(o.signedFileId);
    const pdf = o.signedFileType === 'application/pdf';
    deliverFile(new Blob([await b.arrayBuffer()], { type: pdf ? 'application/pdf' : 'image/jpeg' }), fileSafe(`Orden de compra ${orderNo(o)} firmada${o.supplier ? ' - ' + o.supplier : ''}`) + (pdf ? '.pdf' : '.jpg'));
  } catch (e) {
    console.error(e);
    toast('No se pudo preparar el archivo.');
  }
}
async function linkOrder(invId, orderId, okMsg = 'Orden asignada') {
  const inv = S.invoices.find((x) => x.id === invId), o = S.orders.find((x) => x.id === orderId);
  if (!inv || !o) return;
  const upd = fillFromOrder({}, inv, o);
  upd.orderAuto = false;
  upd.noOrder = false;
  if (!(await write(() => db.doc('invoices/' + invId).update(upd), okMsg))) return;
  if (S.sheet && S.sheet.type === 'inv' && S.sheet.id === invId && S.sheet.dirty) {
    if ($('#f-order')) $('#f-order').value = orderId;
    if (upd.projectId && $('#f-proj') && !$('#f-proj').value) $('#f-proj').value = upd.projectId;
    if (upd.supplier && $('#f-sup') && !$('#f-sup').value.trim()) $('#f-sup').value = upd.supplier;
  }
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
  doc.setCreator(PDF_CREATOR);
  const st = S.settings || {};
  const proj = S.projects.find((p) => p.id === o.projectId);
  const W = 612, H = 792, X0 = 38, X1 = 574;
  const NAVY = rgb(0.137, 0.255, 0.353), INK = rgb(0.1, 0.11, 0.13), VAL = rgb(0.04, 0.1, 0.3), GREY = rgb(0.42, 0.45, 0.5);
  const SEP = rgb(0.8, 0.82, 0.86), GRID = rgb(0.62, 0.67, 0.74), WHITE = rgb(1, 1, 1), RED = rgb(0.75, 0.15, 0.12), BLACK = rgb(0, 0, 0);
  let qrm = null;
  if (st.orderQr !== false && o.id) { try { await loadScript(LIB.qrgen); qrm = window.QR.encode(orderQrText(o)); } catch (e) { console.warn('QR de la orden', e); } }
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
    if (nPages > 1) text(`Página ${pg + 1} de ${nPages}`, X0, 28, 8, font, GREY);
    if (opts.unsigned) text('COPIA SIN FIRMA', X0, 40, 9, bold, RED);
    if (qrm) {
      // Código de la orden: con él, la foto de la orden firmada se reconoce y se adjunta sola.
      const side = 56, m = side / qrm.size, qx = X1 - side, qtop = 20;
      for (let r = 0; r < qrm.size; r++) {
        for (let c = 0; c < qrm.size;) {
          if (!qrm.isDark(r, c)) { c++; continue; }
          let e = c;
          while (e < qrm.size && qrm.isDark(r, e)) e++;
          p.drawRectangle({ x: qx + c * m, y: yy(qtop + (r + 1) * m) - 0.04, width: (e - c) * m + 0.04, height: m + 0.08, color: BLACK });
          c = e;
        }
      }
      center(orderNo(o), qx + side / 2, qtop + side + 9, 6.5, font, GREY);
    }
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
  out.setCreator(PDF_CREATOR);
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
  // Un archivo guardado (foto o PDF) en páginas nuevas; la foto lleva arriba qué es.
  const addFile = async (fileId, type, label) => {
    const b = await (await getBlob(fileId)).arrayBuffer();
    if (type === 'application/pdf') {
      const src = await PDFDocument.load(b, { ignoreEncryption: true });
      (await out.copyPages(src, src.getPageIndices())).forEach((p) => out.addPage(p));
      return;
    }
    const img = isPng(b) ? await out.embedPng(b) : await out.embedJpg(b);
    newPage();
    T(fit(label, font, 8.5, W - 2 * M), M, H - M + 12, 8.5, font, C.grey);
    const bw = W - 2 * M, bh = H - 2 * M - 8;
    const s = Math.min(bw / img.width, bh / img.height);
    page.drawImage(img, { x: M + (bw - img.width * s) / 2, y: M + (bh - img.height * s), width: img.width * s, height: img.height * s });
  };
  const condN = invs.reduce((t, i) => t + (i.conduces || []).length, 0);

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
  T('Total a pagar', M, y, 10, font, C.grey); R(plural(invs.length, 'factura', 'facturas') + ' · ' + plural(groups.length, 'proyecto', 'proyectos') + (condN ? ' · ' + plural(condN, 'conduce', 'conduces') : ''), W - M, y, 10, font, C.grey); y -= 28;
  T(fit(totalStr(invs, 'toPay'), bold, 26, W - 2 * M), M, y, 26, bold); y -= 16;
  T('ITBIS incluido: ' + totalStr(invs, 'itbis'), M, y - 2, 9.5, font, C.grey); y -= 12; hr(y, C.ink, 1.2); y -= 28;

  T('Por proyecto', M, y, 11.5, bold); y -= 20;
  page.drawRectangle({ x: M, y: y - 6, width: W - 2 * M, height: 19, color: C.band });
  T('Proyecto', M + 6, y, 9, bold, C.grey); R('Facturas', 360, y, 9, bold, C.grey); R('ITBIS', 460, y, 9, bold, C.grey); R('Total', W - M - 6, y, 9, bold, C.grey); y -= 21;
  for (const g of groups) { ensure(20); T(fit(g.name, font, 10, 260), M + 6, y, 10); R(String(g.items.length), 360, y, 10); R(totalStr(g.items, 'itbis'), 460, y, 10); R(totalStr(g.items, 'toPay'), W - M - 6, y, 10, bold); y -= 8; hr(y); y -= 13; }
  y -= 18;

  // Por proveedor: lo que se le transfiere a cada uno.
  const supHead = () => { page.drawRectangle({ x: M, y: y - 6, width: W - 2 * M, height: 19, color: C.band }); T('Proveedor', M + 6, y, 9, bold, C.grey); T('RNC', 300, y, 9, bold, C.grey); R('Facturas', 418, y, 9, bold, C.grey); R('Total a pagar', W - M - 6, y, 9, bold, C.grey); y -= 21; };
  ensure(60); T('Por proveedor', M, y, 11.5, bold); y -= 20; supHead();
  for (const g of supplierGroups(invs)) {
    const sp = D.supFor(g.items[0]);
    const bank = sp && (sp.bank || sp.account) ? [sp.bank, sp.accountType, sp.account ? 'Cta. ' + sp.account : ''].filter(Boolean).join(' · ') : '';
    ensure(bank ? 30 : 20, supHead);
    T(fit(g.name || 'Sin nombre', font, 10, 245), M + 6, y, 10); T(g.rnc ? RD.fmtRnc(g.rnc) : '-', 300, y, 10); R(String(g.items.length), 418, y, 10); R(totalStr(g.items, 'toPay'), W - M - 6, y, 10, bold);
    if (bank) { y -= 11; T(fit(bank, font, 8, 380), M + 6, y, 8, font, C.grey); }
    y -= 8; hr(y); y -= 13;
  }
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
    const vals = [String(n + 1), i.project ? i.project.name : 'Sin proyecto', i.supplier || 'Sin nombre', RD.normRnc(i.rnc) || '-', RD.normNcf(i.number) || '-', i.order ? (i.orders || [i.order]).map(orderNo).join(', ') : !D.orders.length ? '-' : i.noOrder ? 'No lleva' : 'Sin OC', fmtDmy(i.date) || '-', isNum(i.itbis) ? money(i.itbis, i.currency) : '-', money(i.toPay, i.currency)];
    cols.forEach((c, k) => { const t = fit(vals[k], font, 8, c.w); if (c.xr) R(t, c.xr, y, 8); else T(t, c.x, y, 8); });
    y -= 7; hr(y, C.line, 0.5); y -= 12;
  });
  ensure(30); y -= 6;
  T('Total', M + 294, y, 10, bold); R(totalStr(invs, 'itbis'), M + 454, y, 10, bold); R(totalStr(invs, 'toPay'), W - M - 2, y, 10, bold);
  const rep = invs.filter((i) => i.payMode === 'reponer');
  if (rep.length) { y -= 16; T(fit('Reposición (se pagó al contado): ' + rep.map((i) => `${i.supplier || 'Factura'} ${RD.normNcf(i.number)} por ${money(i.toPay, i.currency)}, se le repone a ${i.paidBy || 'quien lo pagó'}`).join('; '), font, 8, W - 2 * M), M, y, 8, font, C.grey); }
  const withAb = invs.filter((i) => i.abonado > 0);
  if (withAb.length) { y -= 16; T(fit('Con abonos (se paga el balance): ' + withAb.map((i) => `${i.supplier || 'Factura'} ${RD.normNcf(i.number)} por ${money(i.amount, i.currency)}, abonado ${money(i.abonado, i.currency)}`).join('; '), font, 8, W - 2 * M), M, y, 8, font, C.grey); }
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
    for (const [n, x] of (i.extraPages || []).entries()) {
      try { await addFile(x.fileId, x.fileType, `${label} · página ${n + 2}`); } catch (e) { console.warn('PDF página', e); }
    }
    // Los conduces de la factura van detrás de ella.
    for (const c of i.conduces || []) {
      try { await addFile(c.fileId, c.fileType, `${condTitle(c)} · ${c.supplier || i.supplier || ''} · de la factura${i.number ? ' NCF ' + RD.normNcf(i.number) : ''} (${k} de ${invs.length})`); }
      catch (e) { console.warn('PDF conduce', e); }
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
function supplierGroups(invs, byCur) {
  const m = new Map();
  for (const i of invs) {
    const rnc = RD.normRnc(i.rnc);
    const k = (rnc || 'n:' + (supKey(i.supplier) || norm(i.supplier) || '?')) + (byCur ? '|' + normCur(i.currency) : '');
    if (!m.has(k)) m.set(k, { name: i.supplier || '', rnc, cur: normCur(i.currency), items: [] });
    const g = m.get(k);
    if (!g.name && i.supplier) g.name = i.supplier;
    g.items.push(i);
  }
  const tot = (g) => g.items.reduce((t, i) => t + (isNum(i.amount) ? i.amount : 0), 0);
  return [...m.values()].sort((a, b) => tot(b) - tot(a));
}
function invoicesWorkbook({ heading, scope, invs, D, isPayment }) {
  const { XS, colName, excelDate, sheetXml, buildXlsx } = FILES;
  const st = S.settings || {};
  const list = packageGroups(invs, D).flatMap((g) => g.items);
  const curs = [...new Set(list.map((i) => normCur(i.currency)))];
  if (!curs.length) curs.push('DOP');
  const multi = curs.length > 1;
  const mStyle = (cur, total) => (normCur(cur) === 'USD' ? (total ? XS.totMoneyUsd : XS.moneyUsd) : total ? XS.totMoney : XS.money);
  const company = [st.company, st.companyRnc ? 'RNC ' + RD.fmtRnc(st.companyRnc) : ''].filter(Boolean).join(' · ');
  const generated = ['Generado el ' + fmtDate(todayISO()), st.preparedBy ? 'Elaboró: ' + st.preparedBy : ''].filter(Boolean).join(' · ');
  const top = (title) => [
    [{ v: company || heading, s: XS.title }],
    [{ v: (company ? heading : scope) + (title ? ' · ' + title : ''), s: company ? XS.bold : XS.muted }],
    [{ v: [company ? scope : '', st.area || '', generated].filter(Boolean).join(' · '), s: XS.muted }],
  ];
  const footer = `&L${(st.company || 'Facturas de Proyectos').replace(/&/g, '&&')}&C${heading.replace(/&/g, '&&')}&RPágina &P de &N`;
  const H = 5;
  const M = (v, cur) => (isNum(v) ? { v: round2(v), s: mStyle(cur) } : { v: '' });
  const Dt = (s) => { const d = excelDate(String(s || '').slice(0, 10)); return d == null ? { v: '' } : { v: d, s: XS.date }; };
  const subOf = (i) => (isNum(i.amount) && isNum(i.itbis) ? round2(i.amount - i.itbis) : null);
  const sheets = [], names = [];

  // Tabla: encabezado en la fila 5, filtro, encabezado fijo al desplazarse y fila de totales (SUBTOTAL, o SUMIF por moneda).
  function addSheet(name, cols, rows, o = {}) {
    const out = top(o.title);
    out[H - 1] = cols.map((c) => ({ v: c.k, s: c.money || c.num ? XS.headR : c.ind ? XS.headInd : XS.head }));
    rows.forEach((r, n) => { out[H + n] = cols.map((c) => c.v(r, n)); });
    const first = H + 1, last = H + Math.max(rows.length, 1);
    const col = (k) => colName(cols.findIndex((c) => c.k === k));
    const lab = cols.findIndex((c) => c.money || c.sumInt) - 1;
    if (rows.length && lab >= 0) {
      const groups = multi && o.curKey ? curs : [null];
      groups.forEach((cur, g) => {
        const tot = cols.map(() => ({ v: '', s: XS.totBlank }));
        tot[lab] = { v: cur ? 'Total ' + (CUR_PREFIX[cur] || cur) : 'Total', s: XS.totLabel };
        if (!cur && o.countKey) tot[cols.findIndex((c) => c.k === (o.countAt || o.countKey))] = { f: `SUBTOTAL(3,${col(o.countKey)}${first}:${col(o.countKey)}${last})`, v: rows.length, s: XS.totInt };
        cols.forEach((c, j) => {
          if (c.sumInt) { if (!cur) tot[j] = { f: `SUBTOTAL(9,${colName(j)}${first}:${colName(j)}${last})`, v: rows.reduce((t, r) => t + (Number(c.raw(r)) || 0), 0), s: XS.totInt }; return; }
          if (!c.money) return;
          const rng = `${colName(j)}${first}:${colName(j)}${last}`;
          const val = round2(rows.reduce((t, r) => t + ((!cur || o.curOf(r) === cur) && isNum(c.raw(r)) ? c.raw(r) : 0), 0));
          tot[j] = cur ? { f: `SUMIF(${col(o.curKey)}${first}:${col(o.curKey)}${last},"${cur}",${rng})`, v: val, s: mStyle(cur, true) } : { f: `SUBTOTAL(9,${rng})`, v: val, s: mStyle(curs[0], true) };
        });
        out[last + g] = tot;
      });
    }
    const lastCol = colName(cols.length - 1);
    const idx = sheets.length;
    sheets.push({ name, xml: sheetXml(out, { widths: cols.map((c) => c.w), freeze: H, autoFilter: rows.length ? `A${H}:${lastCol}${last}` : null, landscape: o.landscape !== false, footer, fitWidth: o.fitWidth }) });
    const q = `'${name.replace(/'/g, "''")}'`;
    if (rows.length) names.push({ name: '_xlnm._FilterDatabase', sheet: idx, hidden: true, ref: `${q}!$A$${H}:$${lastCol}$${last}` });
    // Al imprimir: el encabezado se repite en cada hoja y, si la tabla ocupa varias de ancho, también las primeras columnas.
    names.push({ name: '_xlnm.Print_Titles', sheet: idx, ref: o.titleCols ? `${q}!$A:$${colName(o.titleCols - 1)},${q}!$${H}:$${H}` : `${q}!$${H}:$${H}` });
  }

  // Resumen (primera hoja): por proyecto, por estado y control de lo que falta.
  const rs = top();
  rs[H - 1] = [{ v: 'Proyecto', s: XS.head }, { v: 'Facturas', s: XS.headR }, { v: 'Subtotal', s: XS.headR }, { v: 'ITBIS', s: XS.headR }, { v: 'Total', s: XS.headR }];
  let r = H;
  const line = (label, its, c, total) => [{ v: label, s: total ? XS.totLabel : undefined }, { v: its.length, s: total ? XS.totInt : XS.int },
    { v: round2(its.reduce((t, i) => t + (isNum(subOf(i)) ? subOf(i) : 0), 0)), s: mStyle(c, total) },
    { v: round2(its.reduce((t, i) => t + (isNum(i.itbis) ? i.itbis : 0), 0)), s: mStyle(c, total) },
    { v: round2(its.reduce((t, i) => t + (isNum(i.amount) ? i.amount : 0), 0)), s: mStyle(c, total) }];
  for (const g of packageGroups(invs, D)) {
    for (const c of curs) {
      const its = g.items.filter((i) => normCur(i.currency) === c);
      if (its.length) rs[r++] = line(g.name + (multi ? ` (${CUR_PREFIX[c] || c})` : ''), its, c);
    }
  }
  for (const c of curs) rs[r++] = line('Total' + (multi ? ' ' + (CUR_PREFIX[c] || c) : ''), list.filter((i) => normCur(i.currency) === c), c, true);
  if (!isPayment) {
    r++;
    rs[r++] = [{ v: 'Estado', s: XS.head }, { v: 'Facturas', s: XS.headR }, { v: 'Subtotal', s: XS.headR }, { v: 'ITBIS', s: XS.headR }, { v: 'Total', s: XS.headR }];
    for (const k of ['pendiente', 'enpago', 'presentada', 'pagada']) {
      for (const c of curs) {
        const its = list.filter((i) => i.status === k && normCur(i.currency) === c);
        if (its.length) rs[r++] = line(XL_STATUS[k] + (multi ? ` (${CUR_PREFIX[c] || c})` : ''), its, c);
      }
    }
  }
  r++;
  rs[r++] = [{ v: 'Control', s: XS.head }, { v: 'Facturas', s: XS.headR }];
  // [texto, cantidad, en rojo]: "Sin orden de compra" va en rojo solo si alguna la debía llevar.
  const sinOc = list.filter((i) => !i.order && !i.noOrder);
  const ctl = [
    ...(D.orders.length ? [
      ['Con orden de compra', list.filter((i) => i.order).length, false],
      ['Sin orden de compra', sinOc.length, sinOc.some((i) => needsOrder(i, D))],
      ['Marcadas como que no llevan orden', list.filter((i) => !i.order && i.noOrder).length, false],
    ] : []),
    ['Con la orden todavía sin firmar', list.filter((i) => i.order && i.order.status !== 'autorizada').length],
    ['Con otros avisos por revisar', list.filter((i) => reviewFlags(i, D).some((f) => f !== 'Sin orden')).length],
    ['De consumo (no sirven para crédito fiscal)', list.filter((i) => RD.parseNcf(i.number).consumo).length],
    ['Electrónicas verificables (QR o XML de la DGII)', list.filter((i) => i.fiscal === 'qr' || i.fiscal === 'xml').length],
    ['Proveedores distintos', supplierGroups(list).length],
  ];
  for (const [label, n, red] of ctl) rs[r++] = [{ v: label }, { v: n, s: n && (red ?? /sin firmar|avisos|consumo/.test(label)) ? XS.warn : XS.int }];
  sheets.push({ name: 'Resumen', xml: sheetXml(rs, { widths: [46, 12, 18, 18, 18], selected: true, footer }) });

  // Facturas: una fila por factura con todo su detalle.
  const ORIGIN = (i) => (i.fiscal === 'xml' ? 'XML de la DGII' : i.fiscal === 'qr' ? (i.ai === 'done' ? 'QR de la DGII y lectura automática' : 'QR de la DGII') : i.ai === 'done' ? 'Lectura automática' : 'A mano');
  const facturaCols = [
    { k: '#', w: 5, num: true, v: (i, n) => ({ v: n + 1, s: XS.int }) },
    { k: 'Proyecto', w: 22, ind: true, v: (i) => ({ v: i.project ? i.project.name : 'Sin proyecto', s: XS.ind }) },
    { k: 'Proveedor', w: 30, v: (i) => ({ v: i.supplier || '' }) },
    { k: 'RNC', w: 13, v: (i) => ({ v: RD.normRnc(i.rnc) }) },
    { k: 'NCF', w: 16, v: (i) => ({ v: RD.normNcf(i.number) }) },
    { k: 'Tipo', w: 26, v: (i) => { const n = RD.parseNcf(i.number); return { v: n.ok ? n.label : '' }; } },
    { k: 'Vence NCF', w: 11, v: (i) => Dt(i.ncfExpiry) },
    { k: 'Fecha', w: 11, v: (i) => Dt(i.date) },
    { k: 'Vence', w: 11, v: (i) => Dt(i.due) },
    { k: 'Forma de pago', w: 26, v: (i) => ({ v: payText(i) }) },
    { k: 'Concepto', w: 36, v: (i) => ({ v: i.concept || '' }) },
    { k: 'Orden de compra', w: 15, v: (i) => ({ v: (i.orders || []).map(orderNo).join(', ') }) },
    { k: 'Estado de la orden', w: 16, v: (i) => (i.order ? { v: ORDER_LABEL[i.order.status] || '', s: i.order.status === 'autorizada' ? undefined : XS.warn } : !D.orders.length ? { v: '' } : i.noOrder ? { v: 'No lleva' } : { v: 'Sin orden', s: needsOrder(i, D) ? XS.warn : undefined }) },
    { k: 'Solicitado por', w: 20, v: (i) => ({ v: (i.order && i.order.requestedBy) || '' }) },
    { k: 'Referencia', w: 14, v: (i) => ({ v: i.ref || '' }) },
    { k: 'Conduces', w: 16, v: (i) => ({ v: (i.conduces || []).map((c) => c.number || 's/n').join(', ') }) },
    { k: 'Subtotal', w: 15, money: true, raw: subOf, v: (i) => M(subOf(i), i.currency) },
    { k: 'ITBIS', w: 14, money: true, raw: (i) => i.itbis, v: (i) => M(i.itbis, i.currency) },
    { k: 'Total', w: 15, money: true, raw: (i) => i.amount, v: (i) => M(i.amount, i.currency) },
    ...(list.some((i) => i.abonado > 0) ? [
      { k: 'Abonado', w: 14, money: true, raw: (i) => i.abonado || null, v: (i) => M(i.abonado || null, i.currency) },
      { k: 'Por pagar', w: 15, money: true, raw: (i) => i.toPay, v: (i) => M(i.toPay, i.currency) },
    ] : []),
    ...(multi ? [{ k: 'Moneda', w: 9, v: (i) => ({ v: normCur(i.currency) }) }] : []),
    { k: 'Estado', w: 21, ind: true, v: (i) => ({ v: XL_STATUS[i.status] || '', s: XS.ind }) },
    { k: 'Pago', w: 24, v: (i) => ({ v: i.pay ? i.pay.name || 'Pago' : '' }) },
    { k: 'Fecha del pago', w: 13, v: (i) => Dt(i.pay ? (i.pay.status === 'pagado' && i.pay.paidAt ? i.pay.paidAt : i.pay.date) : '') },
    { k: 'Datos tomados de', w: 30, v: (i) => ({ v: ORIGIN(i) }) },
    { k: 'Avisos', w: 32, v: (i) => { const f = reviewFlags(i, D); return f.length ? { v: f.join('; '), s: XS.warn } : { v: '' }; } },
    { k: 'Verificar en la DGII', w: 17, v: (i) => (RD.isDgiiUrl(i.qrUrl) && i.qrUrl.length < 250 && !/"/.test(i.qrUrl) ? { f: `HYPERLINK("${i.qrUrl}","Verificar")`, v: 'Verificar', s: XS.link } : { v: '' }) },
    { k: 'Agregada', w: 11, v: (i) => Dt(i.createdAt) },
    { k: 'Mandada a digitar', w: 14, v: (i) => Dt(i.envio ? i.envio.date : '') },
  ];
  addSheet('Facturas', facturaCols, list, { fitWidth: 3, titleCols: 5, countKey: 'Proyecto', countAt: '#', curKey: multi ? 'Moneda' : null, curOf: (i) => normCur(i.currency) });

  // Por proveedor: para las transferencias.
  const sups = supplierGroups(list, multi);
  const sumF = (its, f) => round2(its.reduce((t, i) => t + (isNum(f(i)) ? f(i) : 0), 0));
  addSheet('Por proveedor', [
    { k: 'Proveedor', w: 34, v: (g) => ({ v: g.name || 'Sin nombre' }) },
    { k: 'RNC', w: 13, v: (g) => ({ v: g.rnc || '' }) },
    { k: 'Banco', w: 20, v: (g) => { const sp = D.supFor(g.items[0]); return { v: sp ? [sp.bank, sp.accountType].filter(Boolean).join(' · ') : '' }; } },
    { k: 'Cuenta', w: 18, v: (g) => { const sp = D.supFor(g.items[0]); return { v: (sp && sp.account) || '' }; } },
    { k: 'Facturas', w: 10, num: true, sumInt: true, raw: (g) => g.items.length, v: (g) => ({ v: g.items.length, s: XS.int }) },
    { k: 'NCF', w: 40, v: (g) => ({ v: g.items.map((i) => RD.normNcf(i.number)).filter(Boolean).join(', ') }) },
    { k: 'Proyectos', w: 30, v: (g) => ({ v: uniqList(g.items.map((i) => (i.project ? i.project.name : 'Sin proyecto'))).join(', ') }) },
    ...(multi ? [{ k: 'Moneda', w: 9, v: (g) => ({ v: g.cur }) }] : []),
    { k: 'Subtotal', w: 16, money: true, raw: (g) => sumF(g.items, subOf), v: (g) => M(sumF(g.items, subOf), g.cur) },
    { k: 'ITBIS', w: 15, money: true, raw: (g) => sumF(g.items, (i) => i.itbis), v: (g) => M(sumF(g.items, (i) => i.itbis), g.cur) },
    { k: 'Total a pagar', w: 16, money: true, raw: (g) => sumF(g.items, (i) => i.toPay), v: (g) => M(sumF(g.items, (i) => i.toPay), g.cur) },
  ], sups, { curKey: multi ? 'Moneda' : null, curOf: (g) => g.cur, title: 'Por proveedor' });

  // Órdenes de compra de estas facturas y sus artículos.
  const ords = [...new Map(list.filter((i) => i.order).map((i) => [i.order.id, i.order])).values()].sort((a, b) => (Number(a.number) || 0) - (Number(b.number) || 0));
  if (ords.length) {
    const invOf = (o) => D.invByOrder.get(o.id) || [];
    addSheet('Órdenes', [
      { k: 'No. de orden', w: 13, v: (o) => ({ v: orderNo(o) }) },
      { k: 'Fecha', w: 11, v: (o) => Dt(o.date) },
      { k: 'Proyecto', w: 22, v: (o) => ({ v: o.project ? o.project.name : '' }) },
      { k: 'Proveedor', w: 30, v: (o) => ({ v: o.supplier || '' }) },
      { k: 'Solicitado por', w: 20, v: (o) => ({ v: o.requestedBy || '' }) },
      { k: 'Departamento', w: 15, v: (o) => ({ v: o.department || '' }) },
      { k: 'Fecha requerida', w: 13, v: (o) => Dt(o.neededDate) },
      { k: 'Lugar de entrega', w: 28, v: (o) => ({ v: o.place || '' }) },
      { k: 'Estado', w: 12, v: (o) => ({ v: ORDER_LABEL[o.status] || '', s: o.status === 'autorizada' ? undefined : XS.warn }) },
      { k: 'Firmada el', w: 11, v: (o) => Dt(o.signedAt) },
      { k: 'Artículos', w: 10, num: true, v: (o) => ({ v: (o.items || []).length, s: XS.int }) },
      { k: 'Estimado', w: 15, money: true, raw: (o) => orderEst(o), v: (o) => M(orderEst(o), 'DOP') },
      { k: 'Facturas', w: 10, num: true, v: (o) => ({ v: invOf(o).length, s: XS.int }) },
      { k: 'NCF de las facturas', w: 36, v: (o) => ({ v: invOf(o).map((i) => RD.normNcf(i.number)).filter(Boolean).join(', ') }) },
      { k: 'Observaciones', w: 30, v: (o) => ({ v: o.notes || '' }) },
    ], ords, { title: 'Órdenes de compra', fitWidth: 2, titleCols: 1 });
    const items = ords.flatMap((o) => (o.items || []).map((it, k) => ({ o, it, k })));
    addSheet('Artículos', [
      { k: 'No. de orden', w: 13, v: (x) => ({ v: orderNo(x.o) }) },
      { k: 'Proyecto', w: 22, v: (x) => ({ v: x.o.project ? x.o.project.name : '' }) },
      { k: 'Proveedor', w: 30, v: (x) => ({ v: x.o.supplier || '' }) },
      { k: '#', w: 5, num: true, v: (x) => ({ v: x.k + 1, s: XS.int }) },
      { k: 'Cantidad', w: 10, num: true, v: (x) => ({ v: isNum(x.it.qty) ? x.it.qty : String(x.it.qty ?? '') }) },
      { k: 'Unidad', w: 12, v: (x) => ({ v: x.it.unit || '' }) },
      { k: 'Descripción', w: 60, v: (x) => ({ v: x.it.desc || '' }) },
      { k: 'Precio', w: 13, money: true, raw: (x) => x.it.price, v: (x) => M(x.it.price, 'DOP') },
      { k: 'Importe', w: 14, money: true, raw: (x) => (isNum(x.it.qty) && isNum(x.it.price) ? round2(x.it.qty * x.it.price) : null), v: (x) => M(isNum(x.it.qty) && isNum(x.it.price) ? round2(x.it.qty * x.it.price) : null, 'DOP') },
    ], items, { title: 'Artículos de las órdenes' });
  }
  // Conduces de estas facturas.
  const conds = list.flatMap((i) => (i.conduces || []).map((c) => ({ c, i })));
  if (conds.length) {
    addSheet('Conduces', [
      { k: 'Conduce', w: 12, v: (x) => ({ v: x.c.number || '' }) },
      { k: 'Fecha', w: 11, v: (x) => Dt(x.c.date) },
      { k: 'Proveedor', w: 30, v: (x) => ({ v: x.c.supplier || x.i.supplier || '' }) },
      { k: 'Proyecto', w: 22, v: (x) => ({ v: x.i.project ? x.i.project.name : x.c.project ? x.c.project.name : '' }) },
      { k: 'Material', w: 22, v: (x) => ({ v: x.c.material || '' }) },
      { k: 'Cantidad', w: 12, v: (x) => ({ v: x.c.qty || '' }) },
      { k: 'Viajes', w: 8, num: true, v: (x) => (isNum(x.c.trips) ? { v: x.c.trips, s: XS.int } : { v: '' }) },
      { k: 'Factura (NCF)', w: 16, v: (x) => ({ v: RD.normNcf(x.i.number) }) },
      { k: 'Total del conduce', w: 16, money: true, raw: (x) => x.c.total, v: (x) => M(x.c.total, x.c.currency) },
    ], conds, { title: 'Conduces' });
  }
  return buildXlsx(sheets, {
    title: heading + ' - ' + scope, creator: st.preparedBy || 'Facturas de Proyectos',
    names: names.sort((a, b) => a.sheet - b.sheet || a.name.localeCompare(b.name)),
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
function exportListExcel(only) {
  const D = derive();
  const invs = only ? D.invoices.filter((i) => only.has(i.id)) : visibleList(D);
  if (!invs.length) { toast('No hay facturas en esta lista.'); return; }
  const heading = { pendientes: 'Facturas pendientes', tramite: 'Facturas en trámite', pagadas: 'Facturas pagadas', todas: 'Todas las facturas' }[S.filter] || 'Facturas';
  const proj = S.projectFilter === 'all' ? 'Todos los proyectos' : S.projectFilter === 'none' ? 'Sin proyecto' : (D.projById.get(S.projectFilter) || {}).name || 'Proyecto';
  const ocScope = D.orders.length && !S.focus && S.invOrder !== 'all' ? (S.invOrder === 'con' ? 'Con orden de compra' : 'Sin orden de compra') : '';
  const when = dateLabel();
  const scope = only ? `${plural(invs.length, 'factura elegida', 'facturas elegidas')} a mano` : [proj, when, ocScope, S.search.trim() ? `Búsqueda: "${S.search.trim()}"` : ''].filter(Boolean).join(' · ');
  deliverFile(invoicesWorkbook({ heading, scope, invs, D, isPayment: false }), fileSafe(`${heading} - ${proj}${when ? ' - ' + when : ''} - ${todayISO()}`) + '.xlsx');
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
      box.innerHTML = `<div class="confirm"><p>Este respaldo es del ${esc(fmtDate(String(meta.exportedAt || '').slice(0, 10)) || 'día desconocido')} y tiene ${plural(invN, 'factura', 'facturas')}${ordN ? ' y ' + plural(ordN, 'orden de compra', 'órdenes de compra') : ''}. Al restaurarlo se <b>reemplaza todo</b> lo que hay ahora en la app.${RT.sync.status().on ? ` Como ${deviceWord()} está ${wide() ? 'conectada' : 'conectado'} a la nube, lo restaurado también se sube y les llega a los otros aparatos.` : ''}</p><div class="actions"><button type="button" class="btn danger solid" data-act="restore-yes">Reemplazar y restaurar</button><button type="button" class="btn" data-act="restore-no">Cancelar</button></div></div>`;
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
    case 'tab': if (S.tab === 'asistencia') flushAtt(); S.tab = t.dataset.tab; if (S.tab !== 'pagos') S.paymentId = null; S.payDel = false; renderAll(); window.scrollTo(0, 0); break;
    case 'filter': S.filter = t.dataset.f; S.focus = null; renderAll(); break;
    case 'invorder': S.invOrder = t.dataset.o; renderAll(); break;
    case 'projf': S.projectFilter = t.dataset.p; renderAll(); break;
    case 'add': pickFiles(); break;
    case 'open-inv': openInvoice(id); break;
    case 'open-pay': closeSheet(); S.tab = 'pagos'; S.paymentId = id; S.payDel = false; renderAll(); window.scrollTo(0, 0); break;
    case 'back': S.paymentId = null; S.payDel = false; renderAll(); window.scrollTo(0, 0); break;
    case 'new-pay': openPicker('new'); break;
    case 'new-pay-from': { const D = derive(); openPicker('new', visibleList(D).filter((i) => i.status === 'pendiente').map((i) => i.id)); break; }
    case 'more': S.showAll.add(t.dataset.k); renderAll(); break;
    case 'ack': { const f = t.dataset.f; if (['condOverOk', 'condRefsOk', 'qtyOk', 'estOk'].includes(f)) write(() => db.doc('invoices/' + id).update({ [f]: true }), 'Listo'); break; }
    case 'pick-more': openPicker('add'); break;
    case 'pay-status': setPayStatus(S.paymentId, t.dataset.s); break;
    case 'pay-approve': if (amOwner()) write(() => db.doc('payments/' + S.paymentId).update({ approvedAt: new Date().toISOString(), approvedBy: RT.sync.status().email }), 'Pago aprobado'); break;
    case 'pay-return': { S.payRet = { id: S.paymentId, note: (S.payRet && S.payRet.id === S.paymentId && S.payRet.note) || '' }; const b = $('#pay-ret-box'); if (b) { b.hidden = false; $('#pay-ret-note').focus(); } break; }
    case 'pay-return-no': S.payRet = null; if (document.activeElement) document.activeElement.blur(); $('#pay-ret-box').hidden = true; break;
    case 'pay-return-yes': { const note = $('#pay-ret-note').value.trim().slice(0, 300); if (!note) { toast('Escribe qué hay que corregir.'); break; } S.payRet = null; if (document.activeElement) document.activeElement.blur(); if (amOwner()) write(() => db.doc('payments/' + S.paymentId).update({ status: 'armando', presentedAt: '', approvedAt: '', approvedBy: '', returnNote: note, returnedAt: new Date().toISOString(), returnedBy: RT.sync.status().email }), 'Pago devuelto con la nota'); break; }
    case 'pin-open': closeSheet(); openPinSheet(); break;
    case 'pin-off': lsSet(PIN_KEY, ''); closeSheet(); toast('PIN quitado'); break;
    case 'pin-forgot': { const f = $('#lock-forgot'); if (f) f.hidden = !f.hidden; break; }
    case 'pin-reset': { const pw = $('#lock-pass').value; t.disabled = true; RT.sync.relogin(pw).then(() => { lsSet(PIN_KEY, ''); hideLock(); toast('PIN quitado. Puedes poner uno nuevo en Ajustes.'); }).catch(() => { $('#lock-msg').textContent = 'Esa no es la contraseña de la nube.'; t.disabled = false; }); break; }
    case 'pay-rm': removeFromPayment(S.paymentId, id); break;
    case 'pay-pdf': makePdf(S.paymentId); break;
    case 'pay-xlsx': exportPaymentExcel(S.paymentId); break;
    case 'list-xlsx': exportListExcel(); break;
    case 'pay-del': S.payDel = true; renderAll(); break;
    case 'pay-del-no': S.payDel = false; renderAll(); break;
    case 'pay-del-yes': deletePayment(S.paymentId); break;
    case 'sheet-close': closeSheet(); break;
    case 'inv-view': openViewer(id); break;
    case 'open-cond': openConduce(id); break;
    case 'att-proj': flushAtt(); S.attProject = t.dataset.p; S.attSheet = ''; renderAll(); break;
    case 'att-day': S.attDay = Number(t.dataset.k) || 0; renderAll(); break;
    case 'att-mark': attMark(t.dataset.w, t.dataset.f, t.dataset.v); break;
    case 'att-all': attAll(t.dataset.f); break;
    case 'att-surprise': attSurpriseNow(); break;
    case 'att-half': attSetHalf(t.dataset.v === '1'); break;
    case 'att-new': newAttSheet(); break;
    case 'att-prev': case 'att-next': { flushAtt(); const sheets = attSheetsOf(S.attProject); const k = sheets.findIndex((x) => x.id === S.attSheet) + (a === 'att-prev' ? 1 : -1); if (sheets[k]) { S.attSheet = sheets[k].id; S.attDay = attTodayIdx(sheets[k]); renderAll(); } break; }
    case 'att-workers': openWorkers(); break;
    case 'att-w-toggle': toggleWorker(id); break;
    case 'att-rules': openAttRules(); break;
    case 'att-xlsx': attExport('xlsx'); break;
    case 'att-pdf': attExport('pdf'); break;
    case 'att-blank': attExport('blank'); break;
    case 'cond-list': closeSheet(); S.tab = 'conduces'; S.condFilter = 'esperando'; S.paymentId = null; renderAll(); window.scrollTo(0, 0); break;
    case 'cfilter': S.condFilter = t.dataset.f; renderAll(); break;
    case 'sort': toggleSort(t.dataset.scope, t.dataset.k); renderAll(); break;
    case 'sel': break; // la casilla se maneja en «change»
    case 'sel-cell': { const b = t.querySelector('input'); if (b && e.target === t) { b.checked = !b.checked; b.dispatchEvent(new Event('change', { bubbles: true })); } break; }
    case 'sel-pay': { const D = derive(); openPicker('new', [...S.sel].filter((id) => (D.invoices.find((i) => i.id === id) || {}).status === 'pendiente')); break; }
    case 'sel-digi': closeSheet(); openDigi(new Set(S.sel)); syncDigi(); break;
    case 'sel-xlsx': exportListExcel(new Set(S.sel)); break;
    case 'sel-paid': markPaidDirect([...S.sel]); break;
    case 'rep-pay': { const g = reponerGroups(derive()).find((x) => x.who === t.dataset.who); if (g && g.pend.length) createPayment('Reposición a ' + g.who, todayISO(), g.pend.map((i) => i.id)); break; }
    case 'pm-yes': { const raw = S.invoices.find((x) => x.id === id); if (raw) write(() => db.doc('invoices/' + id).update({ payMode: 'directo', termsCheck: false, paidDate: raw.paidDate || raw.date || todayISO(), hist: histAdd(raw, histEntry('Marcada como ya pagada (al contado)')) }), 'Marcada como ya pagada'); break; }
    case 'pm-reponer': write(() => db.doc('invoices/' + id).update({ payMode: 'reponer', termsCheck: false })).then((ok) => { if (ok) toast('Escribe a quién hay que reponérselo y toca Guardar.'); }); break;
    case 'pm-no': write(() => db.doc('invoices/' + id).update({ termsCheck: false }), 'Queda para pagarla en un pago'); break;
    case 'sel-clear': S.sel.clear(); renderAll(); break;
    case 'todo-all': S.todoAll = !S.todoAll; renderAll(); break;
    case 'more-menu': openMoreMenu(); break;
    case 'go-tab': closeSheet(); if (S.tab === 'asistencia') flushAtt(); S.tab = t.dataset.go; S.paymentId = null; S.payDel = false; renderAll(); window.scrollTo(0, 0); break;
    case 'cprojf': S.condProject = t.dataset.p; renderAll(); break;
    case 'cond-link-many': { const ids = $$('#cpick input[data-cpick="c"]').filter((b) => b.checked).map((b) => b.value); if (ids.length) { t.disabled = true; linkConduces(ids, t.dataset.inv); } break; }
    case 'cond-add': condTarget = t.dataset.inv || null; $('#cond-input').click(); break;
    case 'cond-view': { const c = S.conduces.find((x) => x.id === id); if (c) showFile({ title: condTitle(c), fileId: c.fileId, fileType: c.fileType }); break; }
    case 'cond-ai': rereadConduce(id, t); break;
    case 'cond-del': $('#cond-del-box').hidden = false; $('#cond-del-box').scrollIntoView({ block: 'nearest', behavior: 'smooth' }); break;
    case 'cond-del-no': $('#cond-del-box').hidden = true; break;
    case 'cond-del-yes': deleteConduce(id); break;
    case 'cond-link': linkConduce(id, t.dataset.inv); break;
    case 'inv-to-cond': invoiceToConduce(id); break;
    case 'inv-to-page': openPagePick(id); break;
    case 'digi-open': closeSheet(); openDigi(); break;
    case 'digi-pdf': digiSend('archivo', t); break;
    case 'digi-paper': digiSend('papel', t); break;
    case 'digi-mark': digiSend('manual', t); break;
    case 'envio-ok': if (S.envioPending) { t.disabled = true; saveEnvio(S.envioPending.ids, S.envioPending.method, S.envioPending.number).then((ok) => { if (!ok) t.disabled = false; }); } break;
    case 'envio-view': openEnvio(id); break;
    case 'envio-undo':
      // Dos toques: deshacer un envío hace que sus facturas salgan otra vez como por mandar.
      if (t.dataset.armed !== '1') { t.dataset.armed = '1'; t.textContent = '¿Deshacer? Toca otra vez'; t.classList.add('danger'); setTimeout(() => { if (t.isConnected) { t.dataset.armed = ''; t.textContent = 'Deshacer'; t.classList.remove('danger'); } }, 4000); break; }
      write(() => db.doc('envios/' + id).delete(), 'Envío deshecho: sus facturas salen otra vez como por mandar').then((ok) => { if (ok) { closeSheet(); setTimeout(openDigi, 250); } });
      break;
    case 'envio-pdf': envioPdfAgain(id); break;
    case 'digi-one': digiOne(id, t); break;
    case 'digi-undo-one': digiUndoOne(id); break;
    case 'ab-add': addAbono(id); break;
    case 'tc-add': addTach(id); break;
    case 'mo-add': { const v = ($('#mo-add') || {}).value; if (!v) { toast('Elige la otra orden.'); break; } addMoreOrder(id, v).then((ok) => { if (ok) refreshMoreOrders(id); }); break; }
    case 'mo-rm': removeOrderFromInv(id, t.dataset.o).then((ok) => { if (ok) refreshMoreOrders(id); }); break;
    case 'tc-link': { const v = ($('#tc-chg') || {}).value; if (!v) { toast('Elige la factura del cambio.'); break; } write(() => db.doc('invoices/' + v).update({ changeOf: id, changeRef: '' }), 'Enlazada: es la factura del cambio').then((ok) => { if (ok) refreshTach(id); }); break; }
    case 'tc-unlink': write(() => db.doc('invoices/' + id).update({ changeOf: null }), 'Enlace quitado').then((ok) => { if (ok) refreshTach(id); }); break;
    case 'tc-rm': removeTach(id, Number(t.dataset.k)); break;
    case 'tc-apply': applyTach(id, Number(t.dataset.v)); break;
    case 'tc-ok': write(() => db.doc('invoices/' + id).update({ struckOk: true }), 'Listo: monto revisado').then((ok) => { if (ok) refreshTach(id); }); break;
    case 'ab-rm': removeAbono(id, Number(t.dataset.k)); break;
    case 'crop-open': openCrop(id); break;
    case 'crop-rot': rotateCrop(); break;
    case 'crop-all': if (cropState) { cropState.pts = [[0, 0], [1, 0], [1, 1], [0, 1]]; drawCrop(); } break;
    case 'crop-go': applyCrop(t); break;
    case 'crop-undo': undoCrop(id); break;
    case 'err-share': deliverFile(new Blob([errList().map((x) => `${x.t} [${x.v}] ${x.m}${x.n > 1 ? ` (x${x.n})` : ''}`).join('\n')], { type: 'text/plain' }), 'registro-de-errores.txt'); break;
    case 'err-clear': lsSet(ERR_KEY, ''); toast('Registro borrado'); { const b = $('#err-box'); if (b) b.remove(); } break;
    case 'sups': openSuppliers(); break;
    case 'sup-open': openSupplier(id); break;
    case 'sup-new': openSupplier(null, { name: t.dataset.name || '', rnc: t.dataset.rnc || '' }); break;
    case 'sup-del': write(() => db.doc('suppliers/' + id).delete(), 'Ficha eliminada').then((ok) => { if (ok) { closeSheet(); setTimeout(openSuppliers, 250); } }); break;
    case 'page-merge': mergeAsPage(id, t.dataset.to); break;
    case 'page-add': pageTarget = id; $('#page-input').click(); break;
    case 'page-rm': removePage(id, Number(t.dataset.k)); break;
    case 'split-open': openSplit(id); break;
    case 'split-go': applySplit(t); break;
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
    case 'ask-inv': openAskInvoices(t.dataset.k); break;
    case 'ask-copy': { const v = ($('#ask-text') || {}).value || ''; (navigator.clipboard ? navigator.clipboard.writeText(v) : Promise.reject()).then(() => toast('Copiado. Pégalo en WhatsApp o en un correo.')).catch(() => { const a = $('#ask-text'); if (a) { a.focus(); a.select(); } toast('Selecciónalo y cópialo.'); }); break; }
    case 'ask-share': navigator.share({ text: ($('#ask-text') || {}).value || '' }).catch(() => {}); break;
    case 'ask-wa': window.open('https://wa.me/' + t.dataset.tel + '?text=' + encodeURIComponent(($('#ask-text') || {}).value || ''), '_blank', 'noopener'); break;
    case 'oprojf': S.orderProject = t.dataset.p; renderAll(); break;
    case 'new-order': openOrder(null); break;
    case 'open-order': openOrder(id); break;
    case 'order-add-item': { addItemRow(); const rows = $$('#o-items [data-row]'); const last = rows[rows.length - 1]; if (last) last.querySelector('[data-f="qty"]').focus(); if (S.sheet) S.sheet.dirty = true; break; }
    case 'order-rm-item': { const row = t.closest('[data-row]'); if (row) { const box = row.parentElement; row.remove(); renumberItems(box); if (S.sheet) S.sheet.dirty = true; if (box && box.id === 't-items') trFormRefresh(); } break; }
    case 'tr-new': closeSheet(); openTraslado(null); break;
    case 'tr-open': openTraslado(id); break;
    case 'tr-add-item': { addItemRow({}, '#t-items'); const rows = $$('#t-items [data-row]'); const last = rows[rows.length - 1]; if (last) last.querySelector('[data-f="qty"]').focus(); if (S.sheet) S.sheet.dirty = true; break; }
    case 'tr-pdf': trPdfAction(); break;
    case 'tr-signed': S.trPhotoKind = 'signed'; $('#signed-input').click(); break;
    case 'tr-photo': S.trPhotoKind = t.dataset.k; $('#signed-input').click(); break;
    case 'tr-photo-view': { const x = S.traslados.find((y) => y.id === id), k = t.dataset.k; if (x && x[k + 'PhotoId']) showFile({ title: trNo(x) + (k === 'out' ? ' al salir' : ' al llegar'), fileId: x[k + 'PhotoId'], fileType: x[k + 'PhotoType'] }); break; }
    case 'tr-recv-open': { const bx = $('#tr-recv-box'); if (bx) { bx.hidden = false; const f1 = bx.querySelector('[data-rq]'); if (f1) f1.focus(); } break; }
    case 'tr-recv-save': saveTrRecv(id); break;
    case 'tr-short-ok': { const note = ($('#tr-short-note') || {}).value || ''; write(() => db.doc('traslados/' + id).update({ shortOk: true, shortNote: note.trim().slice(0, 120), updatedAt: new Date().toISOString() }), 'Diferencia aclarada').then((ok) => { if (ok) refreshTrRecv(id); }); break; }
    case 'tr-view-signed': { const x = S.traslados.find((y) => y.id === id); if (x && x.signedFileId) showFile({ title: trNo(x) + ' firmado', fileId: x.signedFileId, fileType: x.signedFileType }); break; }
    case 'tr-del': deleteTr(id); break;
    case 'tr-acc': openTrAccount(t.dataset.a, t.dataset.b); break;
    case 'tr-pay': openTrPago(t.dataset.from || '', t.dataset.to || '', null); break;
    case 'tr-projf': S.trProject = t.dataset.p; renderAll(); break;
    case 'tr-xlsx': trExcel(); break;
    case 'tr-go-proj': closeSheet(); S.tab = 'traslados'; S.trProject = id; S.paymentId = null; S.payDel = false; renderAll(); window.scrollTo(0, 0); break;
    case 'order-pdf': orderPdfAction(); break;
    case 'order-signed': $('#signed-input').click(); break;
    case 'order-view-signed': { const o = S.orders.find((x) => x.id === id); if (o && o.signedFileId) showFile({ title: orderNo(o) + ' firmada', fileId: o.signedFileId, fileType: o.signedFileType }); break; }
    case 'order-annul': orderConfirm('¿Anular esta orden? Queda en el registro como anulada.', 'order-annul-yes', 'Anular orden'); break;
    case 'order-annul-yes': write(() => db.doc('orders/' + S.sheet.id).update({ status: 'anulada' }), 'Orden anulada').then((ok) => { if (ok) closeSheet(); }); break;
    case 'order-del': orderConfirm('¿Eliminar esta orden? Se va a la papelera y ahí se puede recuperar por 30 días.', 'order-del-yes', 'Eliminar orden'); break;
    case 'order-del-yes': deleteOrder(S.sheet && S.sheet.id); break;
    case 'order-confirm-no': $('#o-confirm').hidden = true; break;
    case 'order-fill': fillOrderFromMessage(t, null); break;
    case 'order-fill-photo': $('#fill-photo-input').click(); break;
    case 'link-order': linkOrder(id, t.dataset.order); break;
    case 'order-link-open': openOrderLinkBox(id); break;
    case 'order-link-inv': { const raw = S.invoices.find((x) => x.id === id); (raw && raw.orderId && raw.orderId !== t.dataset.order ? addMoreOrder(id, t.dataset.order) : linkOrder(id, t.dataset.order, 'Factura enlazada a la orden')).then(() => refreshOrderInvBox(t.dataset.order)); break; }
    case 'order-unlink-inv': removeOrderFromInv(id, t.dataset.order).then(() => refreshOrderInvBox(t.dataset.order)); break;
    case 'nube-connect': nubeConnect(t); break;
    case 'nube-relogin': nubeRelogin(t); break;
    case 'nube-sync': RT.sync.syncNow(); break;
    case 'sync-chip': closeSheet(); openSettings(); RT.sync.syncNow(); setTimeout(() => { const b = $('#nube-box'); if (b) b.scrollIntoView({ block: 'center' }); }, 350); break;
    case 'trash-open': closeSheet(); openTrash(); break;
    case 'trash-restore': t.disabled = true; restoreTrash(id); break;
    case 'trash-empty':
      if (t.dataset.armed !== '1') { t.dataset.armed = '1'; t.textContent = '¿Vaciar? Toca otra vez'; setTimeout(() => { if (t.isConnected) { t.dataset.armed = ''; t.textContent = 'Vaciar la papelera'; } }, 4000); break; }
      t.disabled = true; purgeTrash(true).then(() => { toast('Papelera vacía'); closeSheet(); }); break;
    case 'cloud-bk': closeSheet(); openCloudBackups(); break;
    case 'cloud-bk-now': t.disabled = true; t.textContent = 'Guardando…'; RT.sync.backupNow().then((r) => dbw(() => db.doc('settings/respaldos').set({ last: r.at, slot: r.slot, docs: r.docs }))).then(() => { toast('Respaldo guardado en la nube'); openCloudBackups(); }).catch((e) => { console.warn(e); toast('No se pudo guardar el respaldo. Revisa el internet.'); t.disabled = false; t.textContent = 'Hacer uno ahora'; }); break;
    case 'cloud-bk-restore': askCloudRestore(t.dataset.name, t); break;
    case 'cloud-bk-yes': doCloudRestore(t); break;
    case 'cloud-bk-no': cloudRestore = null; $('#cbk-confirm').hidden = true; break;
    case 'nube-share': nubeShare(); break;
    case 'nube-off': { const b = $('#nb-confirm'); if (b) { b.hidden = false; b.innerHTML = '<div class="confirm"><p>¿Desconectar ' + deviceWord() + ' de la nube? Sus datos se quedan aquí, pero ya no se ponen al día con los otros aparatos.</p><div class="actions"><button type="button" class="btn danger solid" data-act="nube-off-yes">Desconectar</button><button type="button" class="btn" data-act="nube-off-no">Cancelar</button></div></div>'; } break; }
    case 'nube-off-yes': RT.sync.disconnect(); toast('Este teléfono ya no se sincroniza. Sus datos se quedan aquí.'); break;
    case 'nube-off-no': { const b = $('#nb-confirm'); if (b) b.hidden = true; break; }
    case 'itbis18': {
      const v = Number(t.dataset.v);
      if (S.sheet && S.sheet.type === 'inv' && S.sheet.id === id && S.sheet.dirty) { if ($('#f-itbis')) $('#f-itbis').value = String(v); const m = t.closest('.msg'); if (m) m.remove(); }
      else write(() => db.doc('invoices/' + id).update({ itbis: v }), 'ITBIS guardado');
      break;
    }
    case 'read-all': { const D = derive(); readMany(D.invoices.filter((i) => needsReading(i) && i.ai !== 'pending')); break; }
    case 'focus': S.focus = t.dataset.f; S.projectFilter = 'all'; S.search = ''; if ($('#f-search')) $('#f-search').value = ''; renderAll(); { const l = $('#f-sum'); if (l) l.scrollIntoView({ block: 'start', behavior: 'smooth' }); } break;
    case 'focus-off': S.focus = null; renderAll(); break;
    case 'go-orders': S.tab = 'ordenes'; S.orderFilter = t.dataset.f; S.orderProject = 'all'; S.paymentId = null; renderAll(); window.scrollTo(0, 0); break;
    case 'pay-ready': { const D = derive(); openPicker('new', D.invoices.filter((i) => readyToPay(i, D)).map((i) => i.id)); break; }
    case 'order-repeat': openOrder(null, false, id); break;
    case 'order-paste': pasteOrderMessage(t); break;
    case 'order-share-signed': shareSigned(id); break;
    case 'no-order': write(() => db.doc('invoices/' + id).update({ noOrder: true }), 'Listo: no lleva orden'); break;
    case 'no-order-undo': write(() => db.doc('invoices/' + id).update({ noOrder: false })); break;
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
    status.textContent = AI_ERR[e && e.code] || 'No se pudo comprobar la clave. Intenta de nuevo.';
    if (e && AI_STOP.has(e.code)) S.aiState = e.code === 'bad_key' ? 'badkey' : e.code;
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
  if (t.id === 'f-order' || t.id === 'mo-add') {
    const box = $(t.id === 'f-order' ? '#f-order-prev' : '#mo-prev'), D = derive(), o = t.value ? D.orderById.get(t.value) : null;
    if (box) { box.innerHTML = o ? orderPreviewHTML(o, D, S.sheet && S.sheet.id) : ''; if (t.id === 'f-order') box.hidden = !o; }
  }
  if (t.id === 'f-paymode') { for (const w of ['#f-pm-how', '#f-pm-when', '#f-pm-who']) $(w).hidden = !t.value; const l = $('label[for="f-paidby"]'); if (l) l.textContent = t.value === 'reponer' ? 'A quién hay que reponérselo' : 'Quién lo pagó'; if (t.value === 'reponer') $('#f-paidby').focus(); }
  if (t.dataset && t.dataset.f === 'desc' && t.closest && t.closest('#t-items')) trFillPrice(t);
  if (t.id === 't-from' || t.id === 't-to') trFormRefresh();
  if (t.id === 'tp-from' || t.id === 'tp-to') tpRefresh();
  if (t.dataset && t.dataset.wf) saveWorkerField(t);
  if (t.id === 'tc-note' && S.sheet && S.sheet.type === 'inv' && S.sheet.id) write(() => db.doc('invoices/' + S.sheet.id).update({ struckNote: t.value.trim().slice(0, 120) }));
  if ((t.id === 'att-in' || t.id === 'att-out') && S.attSheet) write(() => db.doc('asistencia/' + S.attSheet).update({ [t.id === 'att-in' ? 'entryLimit' : 'exitFrom']: t.value.trim().slice(0, 8) }), 'Guardado');
  if (t.id === 'att-ptime' && S.attSheet) { const sh = S.asistencia.find((x) => x.id === S.attSheet); const v = t.value.replace(/^0(\d)/, '$1'); if (sh) attEdit(sh, (m, sp) => { if (v) sp[S.attDay] = v; else delete sp[S.attDay]; }); }
  if (t.id === 'f-month') {
    S.dateFilter = t.value;
    if (t.value === 'range' && !S.dateFrom && !S.dateTo) { S.dateFrom = todayISO().slice(0, 8) + '01'; S.dateTo = todayISO(); }
    renderAll();
  }
  if (t.id === 'f-from' || t.id === 'f-to') { S[t.id === 'f-from' ? 'dateFrom' : 'dateTo'] = ymd(t.value) ? t.value : ''; renderAll(); }
  if (t.id === 'o-proj' && t.value) {
    const prev = derive().orders.filter((x) => x.projectId === t.value);
    for (const [sel, f] of [['#o-place', 'place'], ['#o-by', 'requestedBy'], ['#o-dept', 'department']]) {
      const hit = prev.find((x) => x[f]);
      if (hit && $(sel) && !$(sel).value.trim()) $(sel).value = hit[f];
    }
  }
  // Artículo conocido: se pone la unidad que se usó la última vez.
  if (t.matches && t.matches('#o-items [data-f="desc"]') && t.value.trim()) {
    const u = t.closest('[data-row]').querySelector('[data-f="unit"]');
    if (u && !u.value.trim()) {
      const k = norm(t.value);
      for (const o of derive().orders) { const it = (o.items || []).find((x) => x.unit && norm(x.desc) === k); if (it) { u.value = it.unit; break; } }
    }
  }
  if (t.dataset && t.dataset.sel === 'inv') { if (t.checked) S.sel.add(t.value); else S.sel.delete(t.value); const tr = t.closest('tr'); if (tr) tr.classList.toggle('sel', t.checked); syncSelBoxes(); }
  else if (t.dataset && t.dataset.sel === 'all') { for (const b of $$(`#f-list input[data-sel="inv"][data-g="${t.dataset.g}"]`)) { if (t.checked) S.sel.add(b.value); else S.sel.delete(b.value); const tr = b.closest('tr'); if (tr) tr.classList.toggle('sel', t.checked); } syncSelBoxes(); }
  if (t.dataset && t.dataset.cpick === 'all') { for (const b of $$('#cpick input[data-cpick="c"]')) b.checked = t.checked; syncCondPick(); }
  else if (t.dataset && t.dataset.cpick === 'c') syncCondPick();
  if (t.id === 'digi-all') { for (const b of $$('#sheet-root input[data-digi="inv"]')) b.checked = t.checked; syncDigi(); }
  if (t.dataset && t.dataset.digi === 'group') { for (const b of $$(`#sheet-root input[data-digi="inv"][data-g="${t.dataset.g}"]`)) b.checked = t.checked; syncDigi(); }
  if (t.dataset && t.dataset.digi === 'inv') syncDigi();
  if (t.id === 'digi-name' && canEdit()) write(() => db.doc('settings/digitacion').set({ ...(S.digi || {}), name: t.value.trim().slice(0, 60), updatedAt: new Date().toISOString() }), 'Guardado');
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
  if (t.id === 'c-search') { S.condSearch = t.value; renderAll(); return; }
  if (t.id === 't-search') { S.trSearch = t.value; renderAll(); return; }
  if (S.sheet && S.sheet.type === 'tr' && t.closest && t.closest('#tr-form') && !t.closest('#tr-recv')) { S.sheet.dirty = true; if (t.dataset && t.dataset.f === 'price') delete t.dataset.src; trFormRefresh(); }
  if (t.id === 'tp-amt') tpRefresh();
  if (t.id === 'pay-ret-note' && S.payRet) S.payRet.note = t.value;
  if (t.id === 'o-link-q') { const r = $('#o-link-results'); if (r) r.innerHTML = orderLinkResultsHTML(t.dataset.order, t.value); return; }
  if (S.sheet && S.sheet.type === 'order' && t.closest && t.closest('#order-form') && t.id !== 'o-msg') S.sheet.dirty = true;
  if (t.closest && t.closest('#o-items') && $('#o-est')) $('#o-est').textContent = estText(collectItems());
  if (t.id === 'f-rnc' || t.id === 'f-num') liveHelp(t);
  if (S.sheet && S.sheet.type === 'inv' && t.closest && t.closest('#inv-form') && !/^(ab|tc|mo)-/.test(String(t.id || '')) && !(t.dataset && t.dataset.cpick)) S.sheet.dirty = true;
  if (S.sheet && S.sheet.type === 'cond' && t.closest && t.closest('#cond-form')) S.sheet.dirty = true;
}
function onSubmit(e) {
  const f = e.target;
  e.preventDefault();
  if (f.id === 'inv-form') saveInvoice(f);
  else if (f.id === 'w-add') addWorker();
  else if (f.id === 'sup-form') saveSupplier(f);
  else if (f.id === 'att-rules-form') saveAttRules();
  else if (f.id === 'cond-form') saveConduce(f);
  else if (f.id === 'order-form') saveOrder(false);
  else if (f.id === 'tr-form') saveTraslado(false);
  else if (f.id === 'tp-form') saveTrPago();
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
    const bRaw = $('#pe-budget') ? $('#pe-budget').value.trim() : '';
    const budget = bRaw ? parseAmount(bRaw) : null;
    if (bRaw && (budget == null || budget < 0)) { toast('Escribe el presupuesto solo con números.'); return; }
    write(() => db.doc('projects/' + f.dataset.id).update({ name: name.slice(0, 80), budget: budget == null ? null : round2(budget) }), 'Proyecto guardado').then((ok) => { if (ok) closeSheet(); });
  } else if (f.id === 'lock-form') {
    tryUnlock();
  } else if (f.id === 'pin-form') {
    const a = $('#pin-a').value.trim(), b = $('#pin-b').value.trim();
    if (!/^\d{4,8}$/.test(a)) { $('#pin-msg').textContent = 'El PIN debe tener de 4 a 8 números.'; return; }
    if (a !== b) { $('#pin-msg').textContent = 'Los dos PIN no son iguales.'; return; }
    setPin(a).then(() => { closeSheet(); toast('PIN puesto: se pedirá al abrir la app'); });
  } else if (f.id === 'settings-form') {
    const rncv = RD.normRnc($('#st-rnc').value);
    if (rncv && rncv.length !== 9 && rncv.length !== 11) { toast('El RNC debe tener 9 dígitos (u 11 si es cédula).'); return; }
    const data = { needApproval: $('#st-ap').checked, ownerEmail: $('#st-owner').value.trim().toLowerCase().slice(0, 120), company: $('#st-company').value.trim().slice(0, 100), companyRnc: rncv, area: $('#st-area').value.trim().slice(0, 80), preparedBy: $('#st-name').value.trim().slice(0, 80), orderPrefix: $('#st-oc-prefix').value.trim().slice(0, 8), orderNext: Math.max(1, parseInt($('#st-oc-next').value, 10) || 1), orderNote: $('#st-oc-note').value.trim().slice(0, 500), orderQr: $('#st-oc-qr').checked, updatedAt: new Date().toISOString() };
    const key = $('#st-key').value.trim();
    if (key !== ai.getKey()) S.aiState = 'ok';
    ai.setKey(key);
    ai.setModel($('#st-model').value);
    write(() => db.doc('settings/general').set(data), 'Ajustes guardados').then((ok) => { if (ok) { S.settings = data; closeSheet(); renderAll(); } });
  }
}
function bind() {
  document.addEventListener('click', onClick);
  staticFields = new Set($$('.view input, .view textarea'));
  document.addEventListener('focusout', () => { if (heldRender) setTimeout(() => { if (heldRender && !typingInView()) { heldRender = false; scheduleRender(); } }, 250); });
  document.addEventListener('change', onChange);
  document.addEventListener('input', onInput);
  document.addEventListener('submit', onSubmit);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (!$('#viewer').hidden) closeViewer(); else if (S.sheet) closeSheet(); } });
  document.addEventListener('keydown', onKeys);
  $('#file-input').addEventListener('change', (e) => { const files = [...e.target.files]; e.target.value = ''; if (files.length) addFiles(files); });
  $('#restore-input').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) restoreBackup(f); });
  $('#signed-input').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f && S.sheet && S.sheet.type === 'order' && S.sheet.id) attachSigned(S.sheet.id, f); else if (f && S.sheet && S.sheet.type === 'tr' && S.sheet.id) { attachTrSigned(S.sheet.id, f, S.trPhotoKind || 'signed'); S.trPhotoKind = null; } });
  $('#page-input').addEventListener('change', (e) => { const files = [...e.target.files]; e.target.value = ''; const inv = pageTarget; pageTarget = null; if (files.length && inv) addPages(inv, files); });
  $('#cond-input').addEventListener('change', (e) => { const files = [...e.target.files]; e.target.value = ''; const inv = condTarget; condTarget = null; if (files.length) addConduceFiles(files, inv); });
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
  window.addEventListener('online', () => { if (S.aiState !== 'ok') scheduleRender(); retryOffline(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushAtt(); else scheduleRender(); });
  if (wideMQ && wideMQ.addEventListener) wideMQ.addEventListener('change', () => scheduleRender());
  setInterval(() => { if (document.visibilityState === 'visible') renderTodo(derive()); }, 300000);
  window.addEventListener('pagehide', () => { flushAtt(); });
}

/* ---------- service worker (funciona sin internet y se actualiza sola) ---------- */
// Actualización sola: la versión nueva se instala al abrir la app o al volver a ella, siempre que no se esté
// llenando nada (ninguna hoja abierta, sin archivos en proceso, sin lecturas ni PDF en curso).
let lastShown = Date.now();
function busyNow() {
  return !!(S.sheet || !$('#viewer').hidden || S.busyPdf || S.queue.some((x) => !x.done) || aiRunning || aiJobs.length || readingMany || attPend);
}
function tryAutoUpdate() {
  const reg = S.updateReg;
  if (!reg || !reg.waiting || S.updating || Date.now() - lastShown > 60000 || busyNow()) return false;
  S.updating = true;
  lsSet('facturas.justUpdated', '1');
  reg.waiting.postMessage('skipWaiting');
  return true;
}
function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('sw.js').then((reg) => {
    S.swReg = reg;
    const check = () => { if (reg.waiting && navigator.serviceWorker.controller) { S.updateReg = reg; if (!tryAutoUpdate()) renderAll(); } };
    check();
    reg.addEventListener('updatefound', () => { const w = reg.installing; if (w) w.addEventListener('statechange', () => { if (w.state === 'installed') check(); }); });
    setInterval(() => reg.update().catch(() => {}), 3600000);
  }).catch((e) => console.warn('SW', e));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    lastShown = Date.now();
    if (S.swReg) S.swReg.update().catch(() => {});
    tryAutoUpdate();
  });
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (S.updating && !reloaded) { reloaded = true; location.reload(); } });
}

/* ---------- arranque ---------- */
function subscribe() {
  db.doc('settings/general').onSnapshot((snap) => { S.settings = (snap.exists && snap.data()) || {}; scheduleRender(); }, (err) => console.warn(err));
  db.doc('settings/asistencia').onSnapshot((snap) => { S.attRules = (snap.exists && snap.data()) || {}; scheduleRender(); }, (err) => console.warn(err));
  db.doc('settings/respaldos').onSnapshot((snap) => { S.bk = (snap.exists && snap.data()) || {}; scheduleRender(); }, (err) => console.warn(err));
  db.doc('settings/digitacion').onSnapshot((snap) => { S.digi = (snap.exists && snap.data()) || {}; scheduleRender(); }, (err) => console.warn(err));
  const done = () => { if (S.got.projects && S.got.invoices && S.got.payments && S.got.orders && S.got.conduces && S.got.workers && S.got.asistencia && S.got.suppliers && S.got.envios && S.got.papelera && S.got.traslados && S.dbState === 'loading') { S.dbState = 'ready'; setTimeout(retryOffline, 1500); setTimeout(() => { fixCreditSigns().catch((e) => console.warn(e)); fixAttRules().catch((e) => console.warn(e)); scheduleLink(); purgeTrash(false).catch((e) => console.warn(e)); measureStorage(); }, 2500); } };
  for (const name of ['projects', 'invoices', 'payments', 'orders', 'conduces', 'workers', 'asistencia', 'suppliers', 'envios', 'papelera', 'traslados']) {
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
  initPinLock();
  // Cada sincronización cambia el indicador; la pantalla entera se redibuja solo si cambió algo que ella muestra
  // (conectada o no, el usuario, un error). Los datos que llegan la redibujan por su cuenta.
  let syncKey = '';
  RT.sync.onChange((s) => { refreshNubeBox(s); const k = [s.on, s.email, s.status === 'error' ? s.code : ''].join('|'); if (k !== syncKey) { syncKey = k; scheduleRender(); } else renderSyncChip(); maybeCloudBackup(s); });
  renderAll();
  RT.use('db').then((d) => {
    db = d;
    if (!d) { S.dbState = 'absent'; renderAll(); return; }
    subscribe();
  });
  RT.use('assets').then((a) => { assets = a; renderAll(); });
  registerSW();
  if (lsGet('facturas.justUpdated')) { lsSet('facturas.justUpdated', ''); setTimeout(() => toast(`La app se actualizó sola (versión ${APP_VERSION})`), 600); }
}
boot();
})();
