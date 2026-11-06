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
const APP_VERSION = '1.6.0';
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

const PAY_LABEL = { armando: 'Por presentar', presentado: 'Presentado', pagado: 'Pagado' };
const INV_LABEL = { pendiente: 'Pendiente', enpago: 'En pago', presentada: 'Presentada', pagada: 'Pagada' };
const GROUP_OF = { pendiente: 'pendientes', enpago: 'tramite', presentada: 'tramite', pagada: 'pagadas' };
const SEGS = [['pendientes', 'Pendientes'], ['tramite', 'En trámite'], ['pagadas', 'Pagadas'], ['todas', 'Todas']];
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
const ORDER_SEGS = [['porfirmar', 'Por firmar'], ['sinfactura', 'Sin factura'], ['completas', 'Completas'], ['todas', 'Todas']];
const UNITS = ['Unidad', 'Funda', 'Saco', 'Galón', 'Cubeta', 'Caja', 'Rollo', 'Metro', 'Pie', 'Pulgada', 'Libra', 'Quintal', 'Plancha', 'Varilla', 'Tubo', 'Lámina', 'Juego', 'Par', 'Litro', 'm²', 'm³', 'Viaje', 'Servicio'];
const DEFAULT_ORDER_NOTE = 'Toda factura recibida por compras deberá estar acompañada, como mínimo, de una fotocopia de la orden de compra debidamente autorizada y sellada. Esta orden debe presentarse junto con la factura para su recepción, verificación y trámite.';

const S = {
  tab: 'facturas', filter: 'pendientes', projectFilter: 'all', search: '', paymentId: null,
  projects: [], invoices: [], payments: [], orders: [], conduces: [], workers: [], asistencia: [], settings: {}, attRules: {}, got: { projects: false, invoices: false, payments: false, orders: false, conduces: false, workers: false, asistencia: false },
  attProject: '', attSheet: '', attDay: 0, orderFilter: 'todas', orderSearch: '', orderProject: 'all', focus: null, invOrder: 'all', dateFilter: '', dateFrom: '', dateTo: '', showAll: new Set(),
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
  const invIds = new Set(S.invoices.map((i) => i.id));
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
    const status = !pay ? 'pendiente' : pay.status === 'pagado' ? 'pagada' : pay.status === 'presentado' ? 'presentada' : 'enpago';
    let aiSt = i.ai || 'off';
    if (aiSt === 'pending' && !S.queue.some((q) => q.invId === i.id && !q.done) && !aiBusy(i.id) && now - (Date.parse(i.createdAt) || 0) > 120000) aiSt = 'failed';
    const k = dupKey(i);
    return { ...i, ai: aiSt, pay, status, project: projById.get(i.projectId) || null, order: orderById.get(i.orderId) || null, dup: k ? dups.get(k) > 1 : false, conduces: condByInv.get(i.id) || [] };
  });
  const invByOrder = new Map();
  const namesByRnc = new Map();
  for (const i of S.invoices) if (i.rnc && i.supplier) { const a = namesByRnc.get(i.rnc) || []; if (!a.includes(i.supplier)) a.push(i.supplier); namesByRnc.set(i.rnc, a); }
  for (const i of invoices) if (i.order) { const a = invByOrder.get(i.order.id) || []; a.push(i); invByOrder.set(i.order.id, a); }
  return { projects: projects.map((p) => projById.get(p.id)), projById, invoices, orders, orderById, invByOrder, namesByRnc, firstOrderAt, conduces, condByInv, companyRnc: RD.normRnc(S.settings.companyRnc) };
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
  if ((i.conduces || []).some((c) => c.dup)) r.push('¿Conduce repetido?');
  const x = invCross(i, D);
  if (x.over) r.push('Cobra más que sus conduces');
  if (x.missing.length) r.push('Falta conduce');
  if (x.qty.length) r.push('Más que la orden');
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
// A qué factura va un conduce que llegó solo: la que menciona su número; si no, la única del mismo proveedor con
// el mismo monto; si no, la del mismo proveedor que se agregó junto con él (en los mismos 15 minutos).
function conduceMatch(c, D) {
  const open = D.invoices.filter((i) => i.status !== 'pagada' && (!c.projectId || !i.projectId || i.projectId === c.projectId));
  const num = condNum(c.number);
  if (num) {
    const byRef = open.filter((i) => (i.conduceRefs || []).some((r) => condNum(r) === num));
    const sameS = byRef.filter((i) => condSameSup(c, i, D));
    if (sameS.length === 1) return { inv: sameS[0], why: 'numero' };
    if (byRef.length === 1) return { inv: byRef[0], why: 'numero' };
  }
  const cands = open.filter((i) => condSameSup(c, i, D));
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
  const conds = (D.invByOrder.get(o.id) || []).flatMap((i) => i.conduces || []);
  if (!conds.length) return [];
  const out = [];
  for (const it of o.items || []) {
    const oq = qtyOf(it.qty, it.unit);
    const words = matWords(it.desc);
    if (!oq || !oq.n || !words.length) continue;
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
  return r;
}
function crossMsgsHTML(i, D, edit) {
  const x = invCross(i, D);
  const ok = (f, label = 'Está bien') => (edit ? ` <button type="button" class="link" data-act="ack" data-f="${f}" data-id="${esc(i.id)}">${label}</button>` : '');
  const out = [];
  if (x.over) out.push(`<div class="msg warn">${ICON.alert}<span>La factura cobra <b>${esc(money(x.over.charged, i.currency))}</b>${x.over.sinItbis ? ' sin ITBIS' : ''} y sus conduces suman <b>${esc(money(x.over.sum, i.currency))}</b>: ${esc(money(x.over.diff, i.currency))} más.${ok('condOverOk')}</span></div>`);
  if (x.missing.length) out.push(`<div class="msg warn">${ICON.alert}<span>La factura menciona ${x.missing.length === 1 ? 'el conduce' : 'los conduces'} <b>${esc(x.missing.join(', '))}</b>, que no ${x.missing.length === 1 ? 'está adjunto' : 'están adjuntos'}.${edit ? ` <button type="button" class="link" data-act="cond-add" data-inv="${esc(i.id)}">Agregar conduce</button>` : ''}${ok('condRefsOk', 'No hace falta')}</span></div>`);
  if (x.qty.length) out.push(`<div class="msg warn">${ICON.alert}<span>${x.qty.map((q) => `Los conduces de la orden ${esc(orderNo(i.order))} traen <b>${esc(fmtQty(q.delivered))}${q.unit ? ' ' + esc(q.unit) : ''}</b> de ${esc(q.desc)} y la orden pidió ${esc(fmtQty(q.ordered))}.`).join(' ')}${ok('qtyOk')}</span></div>`);
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
  let list = D.invoices.filter((i) => inProject(i) && (!!S.focus || inDates(i)));
  if (S.focus) list = list.filter((i) => i.status !== 'pagada' && (S.focus === 'revisar' ? reviewFlags(i, D).some((f) => f !== 'Sin orden') : needsOrder(i, D)));
  else list = list.filter((i) => S.filter === 'todas' || GROUP_OF[i.status] === S.filter);
  if (!S.focus && D.orders.length && S.invOrder !== 'all') list = list.filter((i) => (S.invOrder === 'con' ? !!i.order : !i.order));
  if (q) list = list.filter((i) => norm([i.supplier, i.number, i.rnc, i.concept, i.ref, i.project && i.project.name, i.fileName, i.order ? orderNo(i.order) : '', (i.conduces || []).map((c) => c.number).join(' ')].join(' ')).includes(q));
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
    const thumb = await canvasToJpeg(scaledCanvas(page, 1400), 0.85);
    let creator = '';
    try { const md = await pdf.getMetadata(); creator = String((md && md.info && md.info.Creator) || ''); } catch (e) { /* sin metadatos */ }
    return { pages: pdf.numPages, text: text.replace(/[ \t]+/g, ' ').slice(0, 12000), thumb, qr, creator };
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
  for (const t of ['facturas', 'ordenes', 'pagos', 'asistencia', 'proyectos']) $('#v-' + t).hidden = S.tab !== t;
  const pay = S.tab === 'pagos' && S.paymentId ? S.payments.find((p) => p.id === S.paymentId) : null;
  $('#back').hidden = !pay;
  $('#title').textContent = pay ? (pay.name || 'Pago') : { facturas: 'Facturas', ordenes: 'Órdenes', pagos: 'Pagos', asistencia: 'Pase de lista', proyectos: 'Proyectos' }[S.tab];
  renderBanner(D);
  if (S.tab === 'facturas') renderFacturas(D);
  else if (S.tab === 'ordenes') renderOrdenes(D);
  else if (S.tab === 'pagos') renderPagos(D, pay);
  else if (S.tab === 'asistencia') renderAsistencia(D);
  else renderProyectos(D);
  $('#fab').hidden = !(S.tab === 'facturas' && canUpload());
  $('#settings-btn').hidden = S.dbState === 'absent';
  refreshInvoiceSheet(D);
  refreshOrderSheet(D);
  refreshCondSheet(D);
}

function renderBanner(D) {
  const parts = [];
  if (S.dbState === 'absent') parts.push('<div class="note warn"><span class="grow"><b>Este navegador no deja guardar datos.</b> Si estás en modo privado, ábrela en una ventana normal.</span></div>');
  else if (S.dbState === 'error') parts.push('<div class="note warn"><span class="grow">No se pudieron cargar tus datos. Cierra la app y vuelve a abrirla.</span></div>');
  if (S.updateReg) parts.push('<div class="note example"><span class="grow"><b>Hay una versión nueva.</b> Se instala sola la próxima vez que abras la app, o actualízala ahora.</span><span class="acts"><button type="button" class="btn sm" data-act="update-app">Actualizar</button></span></div>');
  if (isIOS() && !isStandalone() && !lsGet('facturas.installHintOff')) parts.push('<div class="note example"><span class="grow"><b>Instálala antes de empezar:</b> toca Compartir y luego <b>Agregar a pantalla de inicio</b>. En iPhone, lo que guardes en Safari no pasa a la app instalada.</span><span class="acts"><button type="button" class="btn sm" data-act="install-off">Entendido</button></span></div>');
  { const ns = RT.sync.status(); if (ns.on && ns.code === 'auth') parts.push('<div class="note warn"><span class="grow"><b>La nube pide que vuelvas a entrar</b> para seguir compartiendo los datos con los otros teléfonos.</span><span class="acts"><button type="button" class="btn sm" data-act="settings">Entrar</button></span></div>'); }
  if (S.aiState && S.aiState !== 'ok') parts.push(`<div class="note warn"><span class="grow"><b>Las facturas no se están leyendo solas.</b> ${esc(AI_ERR[S.aiState === 'badkey' ? 'bad_key' : S.aiState] || AI_ERR.bad_key)}</span><span class="acts"><button type="button" class="btn sm" data-act="settings">Revisar</button></span></div>`);
  const last = Number(lsGet('facturas.lastBackup')) || 0;
  const snooze = Number(lsGet('facturas.backupSnooze')) || 0;
  const synced = (() => { const ns = RT.sync.status(); return ns.on && ns.at && Date.now() - ns.at < 7 * 864e5; })(); // con la nube al día, el recordatorio no hace falta
  if (S.dbState === 'ready' && S.invoices.length && !synced && Date.now() - last > 7 * 864e5 && Date.now() > snooze) {
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
  if (isCreditNcf(i.number)) tags.push('<span class="pill nc">Nota de crédito</span>');
  if (reading) tags.push('<span class="pill reading">Leyendo…</span>');
  if (D.orders.length && (i.order || !isCreditNcf(i.number))) {
    if (i.order) {
      const st = i.order.status;
      const cls = st === 'autorizada' ? 'ok' : st === 'anulada' ? 'bad' : 'pend';
      tags.push(`<span class="pill oc ${cls}" title="Orden de compra ${esc(orderNo(i.order))}: ${esc(ORDER_LABEL[st] || '')}"><b>${esc(orderNo(i.order))}</b>${st === 'autorizada' ? '' : `<span> ${esc((ORDER_LABEL[st] || '').toLowerCase())}</span>`}</span>`);
    }
    else if (i.noOrder) tags.push('<span class="pill nooc">No lleva orden</span>');
    else if (!needsOrder(i, D)) tags.push('<span class="pill nooc">Sin orden</span>');
  }
  const nc = (i.conduces || []).length;
  if (nc) tags.push(`<span class="pill cond">${nc === 1 ? (i.conduces[0].number ? 'Conduce <b>' + esc(i.conduces[0].number) + '</b>' : 'Conduce') : nc + ' conduces'}</span>`);
  for (const r of reviewFlags(i, D)) tags.push(`<span class="pill warn">${esc(r)}</span>`);
  return `<button type="button" class="inv" data-act="open-inv" data-id="${esc(i.id)}">${thumbHTML(i)}<span class="inv-main"><span class="inv-top"><span class="supplier${i.supplier ? '' : ' muted'}">${esc(name)}</span><span class="amount">${esc(money(i.amount, i.currency))}</span></span><span class="inv-meta">${esc(meta)}</span><span class="tags">${tags.join('')}</span></span></button>`;
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
    const focusLine = S.focus ? `<div class="focus-line"><span class="grow">Mostrando: <b>${S.focus === 'revisar' ? 'facturas con algo que revisar' : 'facturas sin orden de compra'}</b></span><button type="button" class="btn sm" data-act="focus-off">Ver todas</button></div>` : '';
    sum.innerHTML = `${focusLine}<div class="sumline"><span>${plural(list.length, 'factura', 'facturas')} · <b class="mono">${esc(totalStr(list))}</b></span>${acts ? `<span class="acts">${acts}</span>` : ''}</div>`;
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
  const LIM = 60;
  const cards = (items, key) => (items.length <= LIM || S.showAll.has(key) ? items : items.slice(0, LIM)).map((i) => cardHTML(i, D, { hideProject: true })).join('')
    + (items.length > LIM && !S.showAll.has(key) ? `<button type="button" class="btn sm more" data-act="more" data-k="${esc(key)}">Ver ${items.length - LIM} más</button>` : '');
  if (S.projectFilter === 'all') {
    el.innerHTML = groupByProject(list, D).map((g) => `<section class="group"><h2 class="group-h">${g.color ? `<i class="dot" style="--c:${g.color}"></i>` : '<i class="dot ring"></i>'}<span class="gname">${esc(g.name)}</span><span class="gmeta">${g.items.length} · ${esc(totalStr(g.items))}</span></h2><div class="list">${cards(g.items, g.id)}</div></section>`).join('');
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
  if (!S.got.invoices || !S.got.orders || !S.got.payments || !S.got.conduces || !canEdit()) { el.hidden = true; el.innerHTML = ''; return; }
  const live = D.invoices.filter((i) => i.status !== 'pagada');
  const unread = live.filter((i) => needsReading(i) && i.ai !== 'pending');
  const review = live.filter((i) => reviewFlags(i, D).some((f) => f !== 'Sin orden'));
  const noOrd = live.filter((i) => needsOrder(i, D));
  const toSign = D.orders.filter((o) => o.status === 'borrador' || o.status === 'enviada');
  const waiting = D.orders.filter((o) => o.status === 'autorizada' && !(D.invByOrder.get(o.id) || []).length);
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
  if (toSign.length) rows.push(row(toSign.length, plural(toSign.length, 'orden por firmar', 'órdenes por firmar'), b('go-orders', 'Ver', ' data-f="porfirmar"')));
  if (waiting.length) rows.push(row(waiting.length, plural(waiting.length, 'orden firmada esperando factura', 'órdenes firmadas esperando factura'), b('go-orders', 'Ver', ' data-f="sinfactura"')));
  if (ready.length) rows.push(row(ready.length, `${plural(ready.length, 'factura lista', 'facturas listas')} para pagar · <b class="mono">${esc(totalStr(ready))}</b>`, b('pay-ready', 'Armar pago', '', ' primary'), 'ok'));
  if (presented.length) rows.push(row(presented.length, plural(presented.length, 'pago presentado, esperando que lo paguen', 'pagos presentados, esperando que los paguen'), b('tab', 'Ver', ' data-tab="pagos"')));
  el.hidden = !rows.length;
  el.innerHTML = rows.length ? `<div class="todo"><h2>Para hacer</h2>${rows.join('')}</div>` : '';
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

function orderCardHTML(o, D, opts = {}) {
  const invs = D.invByOrder.get(o.id) || [];
  const n = (o.items || []).length;
  const meta = [opts.hideProject ? '' : o.project ? o.project.name : 'Sin proyecto', fmtDate(o.date), plural(n, 'artículo', 'artículos'), invs.length ? plural(invs.length, 'factura', 'facturas') : o.status === 'autorizada' ? 'esperando factura' : ''].filter(Boolean).join(' · ');
  return `<button type="button" class="ord" data-act="open-order" data-id="${esc(o.id)}"><span class="ord-top"><b class="mono">${esc(orderNo(o))}</b><span class="pill o-${o.status}">${ORDER_LABEL[o.status]}</span></span><span class="ord-sup">${esc(o.supplier || 'Sin proveedor')}</span><span class="ord-meta">${esc(meta)}</span></button>`;
}
function renderOrdenes(D) {
  const el = $('#o-list');
  $('#o-new').hidden = !canEdit();
  if (S.orderProject !== 'all' && S.orderProject !== 'none' && !D.projById.has(S.orderProject) && S.got.projects) S.orderProject = 'all';
  const inProj = (o) => S.orderProject === 'all' || (S.orderProject === 'none' ? !o.project : o.projectId === S.orderProject);
  const base = D.orders.filter(inProj);
  const groupOf = (o) => (o.status === 'anulada' ? 'anuladas' : o.status !== 'autorizada' ? 'porfirmar' : (D.invByOrder.get(o.id) || []).length ? 'completas' : 'sinfactura');
  const counts = { porfirmar: 0, sinfactura: 0, completas: 0, todas: base.length };
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
  let list = base.filter((o) => S.orderFilter === 'todas' || groupOf(o) === S.orderFilter);
  if (q) list = list.filter((o) => norm([orderNo(o), o.supplier, o.requestedBy, o.project && o.project.name, (o.items || []).map((x) => x.desc).join(' ')].join(' ')).includes(q));
  if (!list.length) { el.innerHTML = `<div class="empty"><p>${q ? 'Nada coincide con tu búsqueda.' : S.orderProject !== 'all' ? 'No hay órdenes de este proyecto en esta lista.' : 'No hay órdenes en esta lista.'}</p></div>`; return; }
  if (S.orderProject !== 'all') { el.innerHTML = `<div class="list">${list.map((o) => orderCardHTML(o, D, { hideProject: true })).join('')}</div>`; return; }
  // Divididas por proyecto, en el mismo orden que en Facturas; dentro de cada uno, la más nueva primero.
  const groups = D.projects.map((p) => ({ name: p.name, color: p.color, items: list.filter((o) => o.projectId === p.id) })).filter((g) => g.items.length);
  const none = list.filter((o) => !o.project);
  if (none.length) groups.push({ name: 'Sin proyecto', color: null, items: none });
  el.innerHTML = groups.map((g) => {
    const toSign = g.items.filter((o) => o.status === 'borrador' || o.status === 'enviada').length;
    return `<section class="group"><h2 class="group-h">${g.color ? `<i class="dot" style="--c:${g.color}"></i>` : '<i class="dot ring"></i>'}<span class="gname">${esc(g.name)}</span><span class="gmeta">${esc([plural(g.items.length, 'orden', 'órdenes'), toSign && S.orderFilter !== 'porfirmar' ? `${toSign} por firmar` : ''].filter(Boolean).join(' · '))}</span></h2><div class="list">${g.items.map((o) => orderCardHTML(o, D, { hideProject: true })).join('')}</div></section>`;
  }).join('');
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
function closeSheet() { const root = $('#sheet-root'); root.hidden = true; root.innerHTML = ''; S.sheet = null; S.ready = null; lockBody(); if (S.updateReg) setTimeout(tryAutoUpdate, 300); }
function lockBody() { document.body.classList.toggle('locked', !!S.sheet || !$('#viewer').hidden); }
const sheetHead = (title) => `<div class="sheet-h"><h2>${title}</h2><button type="button" class="icon-btn plain" data-act="sheet-close" aria-label="Cerrar">${ICON.close}</button></div>`;

function invSig(i, D) { return JSON.stringify([i.orderId, i.orderAuto, i.noOrder, i.order && i.order.status, i.ncfExpiry, i.supplier, i.number, i.rnc, i.date, i.amount, i.itbis, i.currency, i.concept, i.ref, i.projectId, i.projectHint, i.ai, i.notInvoice, i.pay && i.pay.id, i.pay && i.pay.status, i.dup, i.fiscal, i.xmlId, i.fileId, i.buyerRnc, i.condOverOk, i.condRefsOk, i.qtyOk, (i.conduceRefs || []).join(), (i.order && i.order.items || []).length, (i.conduces || []).map((c) => [c.id, c.number, c.date, c.total, c.material, c.qty, c.ai, c.auto, c.dup]), D ? D.conduces.filter((c) => !c.invoiceId).map((c) => c.id + c.ai).join() : '']); }
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
  if (edit && !i.number && !i.fiscal && !i.pay && i.ai !== 'pending' && !(i.conduces || []).length) msgs.push(`<div class="msg"><span>¿Este archivo es un conduce (la nota de entrega del material) y no una factura? <button type="button" class="link" data-act="inv-to-cond" data-id="${esc(i.id)}">Es un conduce</button></span></div>`);
  if (i.xmlId && i.fileType !== 'application/xml') msgs.push(`<div class="msg">${ICON.check}<span>También tiene su XML de factura electrónica. <button type="button" class="link" data-act="xml-view" data-id="${esc(i.id)}">Ver XML</button></span></div>`);
  const where = i.pay
    ? `<span class="pill ${i.status}">${INV_LABEL[i.status]}</span><span>En <button type="button" class="link" data-act="open-pay" data-id="${esc(i.pay.id)}">${esc(i.pay.name || 'Pago')}</button></span>`
    : '<span class="pill pendiente">Pendiente</span><span>Todavía no está en ningún pago.</span>';
  const opts = D.projects.map((p) => `<option value="${esc(p.id)}"${p.id === i.projectId ? ' selected' : ''}>${esc(p.name)}</option>`).join('');
  const ordList = D.orders.filter((o) => o.status !== 'anulada' || o.id === i.orderId).sort((a, b) => (b.projectId === i.projectId) - (a.projectId === i.projectId) || sameName(b.supplier, i.supplier) - sameName(a.supplier, i.supplier) || (Number(b.number) || 0) - (Number(a.number) || 0));
  const orderOpts = ordList.map((o) => `<option value="${esc(o.id)}"${o.id === i.orderId ? ' selected' : ''}>${esc([orderNo(o), o.supplier, o.project && o.project.name].filter(Boolean).join(' · '))}</option>`).join('');
  const cand = !i.order && !i.noOrder && edit ? orderCandidates(i, D) : [];
  const noOrdBtn = edit ? ` <button type="button" class="link" data-act="no-order" data-id="${esc(i.id)}">No lleva orden</button>` : '';
  if (cand.length) msgs.push(`<div class="msg hint"><span>Hay ${cand.length === 1 ? 'una orden' : 'órdenes'} de este proveedor${i.projectId ? ' para esta obra' : ''}.</span>${cand.slice(0, 3).map((o) => `<button type="button" class="link" data-act="link-order" data-id="${esc(i.id)}" data-order="${esc(o.id)}">Asignar ${esc(orderNo(o))}${!i.projectId && o.project ? ' (' + esc(o.project.name) + ')' : ''}</button>`).join(' ')}${needsOrder(i, D) ? noOrdBtn : ''}</div>`);
  else if (needsOrder(i, D)) msgs.push(`<div class="msg warn">${ICON.alert}<span>Esta factura no tiene orden de compra. Debe presentarse con su orden firmada y sellada.${noOrdBtn}</span></div>`);
  if (i.order && i.orderAuto) msgs.push(`<div class="msg hint"><span>Se enlazó sola a la orden <b>${esc(orderNo(i.order))}</b>: es la única abierta de este proveedor. Si no es, cámbiala en «Orden de compra».</span></div>`);
  if (!i.order && i.noOrder) msgs.push(`<div class="msg"><span>Marcada como factura que no lleva orden de compra.${edit ? ` <button type="button" class="link" data-act="no-order-undo" data-id="${esc(i.id)}">Deshacer</button>` : ''}</span></div>`);
  if (i.order && i.order.status !== 'autorizada') msgs.push(`<div class="msg warn">${ICON.alert}<span>La orden ${esc(orderNo(i.order))} todavía no tiene la copia firmada y sellada.</span></div>`);
  msgs.push(crossMsgsHTML(i, D, edit));
  const t18 = edit && isNum(i.amount) && i.amount > 0 && !isNum(i.itbis) && (!ncf.ok || ['01', '02', '31', '32'].includes(ncf.code)) ? round2((i.amount * 18) / 118) : null;
  if (t18) msgs.push(`<div class="msg hint"><span>Si todo lleva ITBIS de 18 %, el ITBIS de esta factura es <b>${esc(money(t18, i.currency))}</b>.</span><button type="button" class="link" data-act="itbis18" data-id="${esc(i.id)}" data-v="${t18}">Usar ese ITBIS</button></div>`);
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
        <div class="field"><label for="f-rnc">RNC o cédula</label><input id="f-rnc" class="mono" inputmode="numeric" maxlength="15" value="${esc(RD.normRnc(i.rnc))}" ${dis}><small class="help" id="f-rnc-help">${esc(rnc.ok ? (rnc.kind === 'rnc' ? 'RNC ' : 'Cédula ') + RD.fmtRnc(rnc.value) : '9 dígitos (RNC) u 11 (cédula)')}</small></div>
        <div class="field"><label for="f-num">NCF o e-NCF</label><input id="f-num" class="mono" maxlength="20" autocapitalize="characters" value="${esc(RD.normNcf(i.number))}" ${dis}><small class="help" id="f-num-help">${esc(ncf.ok ? ncf.label + (i.ncfExpiry ? ' · válido hasta ' + fmtDmy(i.ncfExpiry) : '') : 'Ej. B0100004521 o E310000000123')}</small></div>
        <div class="field"><label for="f-date">Fecha</label><input id="f-date" type="date" value="${esc(i.date || '')}" ${dis}></div>
        <div class="field"><label for="f-cur">Moneda</label><select id="f-cur" ${dis}><option value="DOP"${cur === 'DOP' ? ' selected' : ''}>RD$ pesos</option><option value="USD"${cur === 'USD' ? ' selected' : ''}>US$ dólares</option><option value="EUR"${cur === 'EUR' ? ' selected' : ''}>€ euros</option></select></div>
        <div class="field"><label for="f-itbis">ITBIS</label><input id="f-itbis" class="mono" inputmode="decimal" maxlength="20" placeholder="0.00" value="${esc(amountInput(i.itbis))}" ${dis}></div>
        <div class="field"><label for="f-amt">Total a pagar</label><input id="f-amt" class="mono" inputmode="decimal" maxlength="20" placeholder="0.00" value="${esc(amountInput(i.amount))}" ${dis}></div>
        <div class="field full"><label for="f-con">Concepto</label><textarea id="f-con" maxlength="140" rows="2" ${dis}>${esc(i.concept || '')}</textarea></div>
        <div class="field full"><label for="f-order">Orden de compra</label><select id="f-order" ${dis}><option value="">Sin orden</option>${orderOpts}</select>${i.order ? `<button type="button" class="link" data-act="open-order" data-id="${esc(i.order.id)}">Abrir ${esc(orderNo(i.order))}</button>` : ''}</div>
        <div class="field full"><label for="f-ref">Otra referencia (cubicación, contrato)</label><input id="f-ref" maxlength="60" placeholder="Opcional" value="${esc(i.ref || '')}" ${dis}></div>
      </div>
      ${invCondBoxHTML(i, D, edit)}
      ${delBtn}
      <div id="inv-del-box" hidden><div class="confirm"><p>¿Eliminar esta factura? También se borran sus archivos y se quita del pago donde esté.${(i.conduces || []).length ? ' Sus conduces quedan guardados, esperando factura.' : ''}</p><div class="actions"><button type="button" class="btn danger solid" data-act="inv-del-yes" data-id="${esc(i.id)}">Eliminar factura</button><button type="button" class="btn" data-act="inv-del-no">Cancelar</button></div></div></div>
    </div>
    ${edit ? '<div class="sheet-f"><button type="submit" class="btn primary block" id="inv-save">Guardar</button></div>' : ''}
  </form>`;
  const prevScroll = keepScroll && $('.sheet-b') ? $('.sheet-b').scrollTop : 0;
  openSheet(html, { type: 'inv', id: i.id, dirty: false, sig: invSig(i, D) });
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
const AUTO_WHY = { numero: 'la factura menciona su número', monto: 'es del mismo proveedor y el monto coincide', lote: 'es del mismo proveedor y se agregaron juntos' };
function condThumbHTML(c) {
  const tid = c.thumbId || (String(c.fileType || '').startsWith('image/') ? c.fileId : null);
  return `<span class="thumb sm">${tid ? `<img src="${esc(assetUrl(tid))}" alt="" loading="lazy" decoding="async">` : `<span class="ph">${c.fileType === 'application/pdf' ? 'PDF' : 'FOTO'}</span>`}</span>`;
}
function condRowHTML(c, withSupplier) {
  const sub = [withSupplier ? c.supplier || '' : '', condMeta(c)].filter(Boolean).join(' · ');
  const right = c.ai === 'pending' ? '<span class="pill reading">Leyendo…</span>' : isNum(c.total) ? `<span class="num">${esc(money(c.total, c.currency))}</span>` : '';
  return `<button type="button" class="cond-row" data-act="open-cond" data-id="${esc(c.id)}">${condThumbHTML(c)}<span class="cond-mid"><b>${esc(condTitle(c))}</b><small>${esc(sub || 'Sin datos todavía')}</small></span>${c.dup ? '<span class="pill warn">¿Repetido?</span>' : ''}${right}</button>`;
}
function invCondBoxHTML(i, D, edit) {
  const list = i.conduces || [];
  if (!list.length && !edit) return '';
  const sugg = edit ? condSuggestions(i, D).slice(0, 3) : [];
  const total = list.length > 1 && list.every((c) => isNum(c.total)) ? round2(list.reduce((t, c) => t + c.total, 0)) : null;
  return `<div class="card" id="inv-conds"><h2>Conduces</h2>
    ${list.length ? `<div class="cond-list">${list.map((c) => condRowHTML(c, false)).join('')}</div>` : '<p class="hint">Si la factura vino con conduces (la nota de entrega del material), agrégalos aquí. En el PDF del pago van detrás de la factura.</p>'}
    ${isNum(total) ? `<p class="usage">Los ${list.length} conduces suman ${esc(money(total, list[0].currency))}.</p>` : ''}
    ${list.filter((c) => c.auto).map((c) => `<div class="msg hint"><span>El ${esc(condTitle(c).toLowerCase())} se adjuntó solo: ${esc(AUTO_WHY[c.autoWhy] || 'es del mismo proveedor')}. Si no es de esta factura, ábrelo y cámbialo.</span></div>`).join('')}
    ${sugg.length ? `<div class="msg hint"><span>${sugg.length === 1 ? 'Hay un conduce esperando factura que puede ser de esta:' : 'Hay conduces esperando factura que pueden ser de esta:'}</span>${sugg.map((c) => `<button type="button" class="link" data-act="cond-link" data-id="${esc(c.id)}" data-inv="${esc(i.id)}">Adjuntar ${esc(c.number ? 'el ' + c.number : 'el conduce')}${isNum(c.total) ? ' (' + esc(money(c.total, c.currency)) + ')' : ''}</button>`).join(' ')}</div>` : ''}
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
      ${edit ? `<div><button type="button" class="btn danger sm" data-act="cond-del">${ICON.trash} Eliminar conduce</button></div><div id="cond-del-box" hidden><div class="confirm"><p>¿Eliminar este conduce? También se borra su foto o PDF.</p><div class="actions"><button type="button" class="btn danger solid" data-act="cond-del-yes" data-id="${esc(c.id)}">Eliminar conduce</button><button type="button" class="btn" data-act="cond-del-no">Cancelar</button></div></div></div>` : ''}
    </div>
    ${edit ? '<div class="sheet-f"><button type="submit" class="btn primary block" id="cond-save">Guardar</button></div>' : ''}
  </form><datalist id="dl-csups">${uniqList([...S.conduces.map((x) => x.supplier), ...S.invoices.map((x) => x.supplier)]).slice(0, 300).map((v) => `<option value="${esc(v)}"></option>`).join('')}</datalist>`;
  const prevScroll = keepScroll && $('.sheet-b') ? $('.sheet-b').scrollTop : 0;
  openSheet(html, { type: 'cond', id: c.id, dirty: false, sig: condSig(c) });
  if (keepScroll && $('.sheet-b')) $('.sheet-b').scrollTop = prevScroll;
}
const condListSig = (D) => D.conduces.filter((c) => !c.invoiceId).map(condSig).join('|');
function openCondList(keepScroll) {
  const D = derive();
  const list = D.conduces.filter((c) => !c.invoiceId).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  const html = `${sheetHead('Conduces sin factura')}<div class="sheet-b">
    <p class="hint">Estos conduces todavía no tienen su factura. Cuando llegue, se adjuntan solos si la factura menciona el número del conduce, si el monto coincide o si los agregas juntos. Si no, abre el conduce y elige su factura.</p>
    ${list.length ? `<div class="cond-list">${list.map((c) => condRowHTML(c, true)).join('')}</div>` : '<div class="empty"><p>No hay conduces esperando factura.</p></div>'}
    ${canUpload() ? `<div><button type="button" class="btn sm" data-act="cond-add">${ICON.plus} Agregar un conduce sin factura</button></div>` : ''}
  </div>`;
  const prevScroll = keepScroll && $('.sheet-b') ? $('.sheet-b').scrollTop : 0;
  openSheet(html, { type: 'conds', id: 'conds', sig: condListSig(D) });
  if (keepScroll && $('.sheet-b')) $('.sheet-b').scrollTop = prevScroll;
}
function refreshCondSheet(D) {
  const sh = S.sheet;
  if (!sh) return;
  if (sh.type === 'conds') { if (condListSig(D) !== sh.sig) openCondList(true); return; }
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
  const ords = D.orders.filter((o) => o.projectId === id);
  const by = (k) => invs.filter((i) => GROUP_OF[i.status] === k);
  openSheet(`<form id="proj-form" data-id="${esc(id)}" autocomplete="off">${sheetHead(esc(p.name))}
    <div class="sheet-b">
      <div class="field"><label for="pe-name">Nombre del proyecto</label><input id="pe-name" maxlength="80" value="${esc(p.name)}" required></div>
      <div class="stats card"><div><span>Pendientes (${by('pendientes').length})</span><b>${esc(totalStr(by('pendientes')))}</b></div><div><span>En trámite (${by('tramite').length})</span><b>${esc(totalStr(by('tramite')))}</b></div><div><span>Pagadas (${by('pagadas').length})</span><b>${esc(totalStr(by('pagadas')))}</b></div></div>
      <button type="button" class="btn block" data-act="proj-view" data-id="${esc(id)}">Ver las facturas de este proyecto ${ICON.right}</button>
      <div id="proj-del-box" hidden>${invs.length || ords.length ? `<div class="confirm"><p>Este proyecto tiene ${[invs.length ? plural(invs.length, 'factura', 'facturas') : '', ords.length ? plural(ords.length, 'orden de compra', 'órdenes de compra') : ''].filter(Boolean).join(' y ')}. Para eliminarlo, primero cámbialas a otro proyecto o bórralas.</p><div class="actions"><button type="button" class="btn" data-act="proj-del-no">Entendido</button></div></div>` : `<div class="confirm"><p>¿Eliminar el proyecto “${esc(p.name)}”?</p><div class="actions"><button type="button" class="btn danger solid" data-act="proj-del-yes" data-id="${esc(id)}">Eliminar proyecto</button><button type="button" class="btn" data-act="proj-del-no">Cancelar</button></div></div>`}</div>
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
      <p class="hint">Las facturas electrónicas se leen solas por su QR o su XML. Para que la app lea también las de papel y llene las órdenes desde el mensaje del pedido, pon una clave de API (se crea en platform.claude.com y se paga por uso; al crearla, asígnala a un espacio de trabajo y elige que no venza; los pasos están en la guía de la app). La clave se guarda solo en este teléfono: no va en los respaldos ni se comparte con los otros teléfonos.</p>
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
      <p class="hint">${RT.sync.status().on ? "Tus datos están en este teléfono y en la nube del equipo. Igual conviene un respaldo de vez en cuando:" : "Tus facturas solo están en este teléfono."} Descarga un respaldo cada semana y guárdalo en iCloud Drive o en tu computadora. ${last ? 'Último respaldo: ' + esc(fmtDate(new Date(last).toISOString().slice(0, 10))) + '.' : 'Todavía no has hecho ninguno.'}</p>
      <div class="actions"><button type="button" class="btn" data-act="backup">${ICON.down} Descargar respaldo</button><button type="button" class="btn" data-act="restore">Restaurar un respaldo</button></div>
      <div id="restore-box" hidden></div>
      <h3 class="h2">Compartir con otros teléfonos (prueba)</h3>
      <div id="nube-box" data-k="${nubeKey(RT.sync.status())}">${nubeBoxHTML()}</div>
      <p class="usage" id="st-usage">Calculando espacio…</p>
      <p class="usage">Versión ${APP_VERSION}. Se actualiza sola.<br>© 2026 AngelixVrobles. Uso gratuito; no se permite venderla ni copiarla sin permiso del autor.</p>
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

/* ---------- compartir con otros teléfonos (nube del equipo) ---------- */
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
    return `<p class="hint">Conecta tu teléfono y el del dueño a la nube del equipo para que los dos vean lo mismo: lo que agregas aquí le aparece solo, y al revés. Cada teléfono sigue funcionando sin internet y se pone al día cuando hay conexión. La nube se crea una sola vez; los pasos están en la guía de la app.</p>
      <div class="fields">
        <div class="field full"><label for="nb-code">Datos de conexión</label><textarea id="nb-code" rows="2" spellcheck="false" autocapitalize="off" placeholder="Pega el código FACTURAS-NUBE que te mandaron, o la URL del proyecto"></textarea></div>
        <div class="field full"><label for="nb-key">Clave pública del proyecto (solo si pegaste la URL)</label><input id="nb-key" spellcheck="false" autocapitalize="off" autocomplete="off"></div>
        <div class="field"><label for="nb-email">Correo</label><input id="nb-email" type="email" inputmode="email" autocapitalize="off" autocomplete="username" spellcheck="false"></div>
        <div class="field"><label for="nb-pass">Contraseña</label><input id="nb-pass" type="password" autocomplete="current-password"></div>
      </div>
      <div class="actions"><button type="button" class="btn primary" data-act="nube-connect">Conectar este teléfono</button></div>
      <p class="usage" id="nb-msg"></p>`;
  }
  const relog = s.code === 'auth' ? `<div class="fields"><div class="field full"><label for="nb-pass">Contraseña de ${esc(s.email)}</label><input id="nb-pass" type="password" autocomplete="current-password"></div></div><div class="actions"><button type="button" class="btn primary" data-act="nube-relogin">Volver a entrar</button></div>` : '';
  return `<p class="nube-line ${esc(s.status)}" id="nb-status">${nubeLine(s)}</p>
    <p class="hint">Conectado como <b>${esc(s.email)}</b>. Lo que se agrega o cambia en un teléfono les aparece a los demás conectados.</p>
    ${relog}
    <div class="actions"><button type="button" class="btn" data-act="nube-sync">Sincronizar ahora</button><button type="button" class="btn" data-act="nube-share">${ICON.share} Datos para otro teléfono</button></div>
    <div><button type="button" class="btn danger sm" data-act="nube-off">Desconectar este teléfono</button></div>
    <div id="nb-confirm" hidden></div>
    <p class="usage" id="nb-msg"></p>`;
}
function refreshNubeBox(s) {
  const box = $('#nube-box');
  if (!box) return;
  if (box.dataset.k !== nubeKey(s)) { box.dataset.k = nubeKey(s); box.innerHTML = nubeBoxHTML(); return; }
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
  if (!url || !key || !email || !password) { msg.textContent = 'Faltan datos: el código (o la URL y la clave), el correo y la contraseña.'; return; }
  btn.disabled = true;
  msg.textContent = 'Conectando…';
  try {
    await RT.sync.connect({ url, key, email, password });
    toast('Conectado. Los datos se están poniendo al día.');
  } catch (e) {
    if (msg.isConnected) msg.textContent = { auth: 'El correo o la contraseña no son correctos, o falta crear ese usuario en la nube.', offline: 'No se pudo llegar a la nube. Revisa el internet y la URL.', bad_input: 'Faltan datos.' }[e && e.code] || 'No se pudo conectar. Revisa la URL y la clave.';
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
  if (ok) toast('Copiado. Mándalo por WhatsApp al otro teléfono.');
  const msg = $('#nb-msg');
  if (msg) msg.innerHTML = `${ok ? 'Copiado.' : 'Copia este código.'} En el otro teléfono: instala la app, ve a Ajustes → Compartir con otros teléfonos, pega el código y entra con el correo y la contraseña de esa persona. El código no lleva tu contraseña.<span class="nube-code">${esc(code)}</span>`;
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
    let blob, ftype, thumb = null, text = '', pages = 1, aiImage = null, qr = null, creator = '';
    if (isPdf) {
      if (f.size > 25 * 1048576) throw new UserError('El PDF pesa más de 25 MB');
      const bytes = await f.arrayBuffer();
      blob = new Blob([bytes], { type: 'application/pdf' });
      ftype = 'application/pdf';
      try { const r = await inspectPdf(bytes); pages = r.pages; text = r.text; thumb = r.thumb; qr = r.qr; creator = r.creator; } catch (e) { console.warn('PDF', e); }
      if (creator === PDF_CREATOR) throw new UserError(qr && qr.kind === 'order' ? 'Es el PDF de la orden sin firmar. Agrega la foto o el escaneo de la orden ya firmada y sellada' : 'Este PDF lo hizo esta app; no es una factura');
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
    const om = text ? orderMentionIn(text, doc.projectId) : null;
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
        finishQ(item, r === 'done' ? (qr ? 'qr' : 'lista') : qr ? 'qr' : 'manual');
      });
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
const AI_FIELDS = ['es_factura', 'tipo_documento', 'proveedor', 'rnc_proveedor', 'ncf', 'ncf_vence', 'fecha', 'itbis', 'total', 'moneda', 'concepto', 'proyecto', 'rnc_cliente', 'referencia', 'conduces', 'conduce_numero', 'material', 'cantidad', 'viajes'];
const AI_SCHEMA = {
  type: 'object',
  properties: {
    es_factura: { type: 'boolean' }, proveedor: { type: 'string' }, rnc_proveedor: { type: 'string' }, ncf: { type: 'string' }, ncf_vence: { type: 'string' },
    fecha: { type: 'string' }, itbis: { type: 'string' }, total: { type: 'string' }, moneda: { type: 'string', enum: ['DOP', 'USD', 'EUR', ''] },
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
    withImage ? 'La imagen adjunta es una foto o captura de la factura (o nota/recibo) que mandó el proveedor.' : `Este es el texto de la factura en PDF:\n<<<\n${t.slice(0, 9000)}\n>>>`,
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
    '- total: el total de la factura que aparece al pie (Total DOP, Total RD$ o Total a pagar), solo el número con punto decimal. No uses "Balance" ni "Saldo": ese es el saldo de la cuenta del cliente, no el total de esta factura.',
    '- moneda: "DOP" si está en pesos (RD$), "USD" si está en dólares (US$).',
    '- concepto: qué se está cobrando, máximo 80 caracteres.',
    '- proyecto: la obra o proyecto; suele venir en campos como Nota, Obra, Proyecto o Referencia (ej. "Nota: CAPERUZA 2"). Si coincide con uno de los proyectos que ya existen (aunque esté escrito distinto, por ejemplo "caperuza II" y "Caperuza 2"), escribe el nombre exactamente como está en la lista; si no, escríbelo tal cual.',
    '- rnc_cliente: RNC del cliente o comprador al que va dirigida la factura, solo números.',
    '- referencia: número de orden de compra (OC), contrato o cubicación, si aparece, con su etiqueta (ej. "OC-0012" o "Cubicación 4").',
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
  const ordRef = refx && !(inv && inv.orderId && !inv.orderAuto) ? matchOrderRef(refx, pid) : null;
  if (ordRef) { upd.orderId = ordRef.id; upd.orderAuto = false; if (!pid && ordRef.projectId) { upd.projectId = ordRef.projectId; upd.projectHint = ''; } if (!upd.supplier && !(inv && inv.supplier) && ordRef.supplier) upd.supplier = ordRef.supplier; }
  else if (refx && !(inv && inv.ref)) upd.ref = refx;
  const crefs = (s(o.conduces, 300).match(/\d{3,12}/g) || []).slice(0, 40);
  if (crefs.length) upd.conduceRefs = crefs;
  return signAmounts(upd, inv);
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
  await dbw(() => ref.update(upd)).catch((e) => console.error(e));
  scheduleLink();
  return 'done';
}
async function aiInputFor(i) {
  if (i.fileType === 'application/pdf') {
    const r = await inspectPdf(await (await getBlob(i.fileId)).arrayBuffer());
    return { text: r.text, image: hasText(r.text) ? null : r.thumb };
  }
  if (i.fileType && i.fileType.startsWith('image/')) return { image: await getBlob(i.fileId), text: '' };
  return null;
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
    };
    signAmounts(upd);
    const ordSel = upd.orderId ? S.orders.find((x) => x.id === upd.orderId) : null;
    if (ordSel) { if (!upd.projectId && ordSel.projectId) upd.projectId = ordSel.projectId; if (!upd.supplier && ordSel.supplier) upd.supplier = ordSel.supplier; if (!upd.concept) upd.concept = itemsSummary(ordSel.items); }
    upd.orderAuto = false;
    if (upd.projectId) upd.projectHint = '';
    if (inv.ai === 'pending' || inv.ai === 'failed') upd.ai = 'off';
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
  const ok = await write(async () => {
    if (i.pay) await db.doc('payments/' + i.pay.id).update({ invoiceIds: (i.pay.invoiceIds || []).filter((x) => x !== id) });
    for (const c of S.conduces.filter((x) => x.invoiceId === id)) await db.doc('conduces/' + c.id).update({ invoiceId: null, auto: false });
    await db.doc('invoices/' + id).delete();
  }, 'Factura eliminada');
  if (!ok) return;
  closeSheet();
  for (const a of new Set([i.fileId, i.thumbId, i.xmlId])) if (a) { try { await assets.delete(a); } catch (e) { console.warn(e); } }
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
async function linkConduce(condId, invId) {
  const c = S.conduces.find((x) => x.id === condId), inv = S.invoices.find((x) => x.id === invId);
  if (!c || !inv) return;
  const ok = await write(async () => {
    await db.doc('conduces/' + condId).update({ invoiceId: invId, auto: false, noAuto: false, projectId: c.projectId || inv.projectId || null });
    if (!inv.projectId && c.projectId) await db.doc('invoices/' + invId).update({ projectId: c.projectId, projectHint: '' });
  }, 'Conduce adjuntado a la factura');
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
  if (!(await write(() => db.doc('conduces/' + id).delete(), 'Conduce eliminado'))) return;
  closeSheet();
  for (const a of new Set([c.fileId, c.thumbId])) if (a) { try { await assets.delete(a); } catch (e) { console.warn(e); } }
}
// Después de leer o guardar algo: los conduces que esperan factura se enlazan solos si la encuentran.
let linkT = 0;
function scheduleLink() { clearTimeout(linkT); linkT = setTimeout(() => { linkPendingConduces().catch((e) => console.warn('conduces', e)); }, 400); }
async function linkPendingConduces() {
  if (!db || !S.got.conduces || !S.got.invoices || !canEdit()) return;
  const D = derive();
  for (const c of D.conduces) {
    if (c.invoiceId || c.noAuto || c.ai === 'pending') continue;
    const m = conduceMatch(c, D);
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
const ATT_RULES = { late: 0, surpriseMiss: 0, leftEarly: 0.5, corrido: 1, corridoFull: 1.5, saturday: 1, sunday: 1 };
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
// Lo que cuenta un día según las marcas y las reglas.
function attDayValue(m, R, dow) {
  if (!m || !m.e) return null;
  if (m.e === 'x') return 0;
  let v = m.s === 'c' ? R.corrido : m.s === 'cc' ? R.corridoFull : m.s === 'x' ? R.leftEarly : 1;
  if (m.e === 't') v -= R.late;
  if (m.p === 'x') v -= R.surpriseMiss;
  if (dow === 6) v *= R.saturday;
  if (dow === 0) v *= R.sunday;
  return Math.max(0, round2(v));
}
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
    t.days = round2(t.days + attDayValue(m, R, attDow(sh, k)));
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
    return `<button type="button" class="att-day${attDate(sh, j) === todayISO() ? ' today' : ''}${done ? ' done' : ''}" data-act="att-day" data-k="${j}" aria-pressed="${j === k}"><span>${DOW[d.getDay()]}</span><b>${d.getDate()}</b></button>`;
  }).join('');
  const dayDate = ymd(attDate(sh, k));
  const ptime = surprise[k] || '';
  const list = rows.map((w) => {
    const m = (marks[w.id] || {})[k] || {};
    const v = attDayValue(m, R, attDow(sh, k));
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
  el.innerHTML = chips + bar + `
    <div class="card att-head">
      <div class="att-period"><button type="button" class="icon-btn" data-act="att-prev" aria-label="Quincena anterior"${idx < sheets.length - 1 ? '' : ' disabled'}>‹</button><b>${esc(attPeriodLabel(sh))}</b><button type="button" class="icon-btn" data-act="att-next" aria-label="Quincena siguiente"${idx > 0 ? '' : ' disabled'}>›</button></div>
      <div class="fields"><div class="field"><label for="att-in">Entrada hasta las</label><input id="att-in" maxlength="8" placeholder="7:30" value="${esc(sh.entryLimit || '')}"${dis}></div><div class="field"><label for="att-out">Salida desde las</label><input id="att-out" maxlength="8" placeholder="5:00" value="${esc(sh.exitFrom || '')}"${dis}></div></div>
      ${edit && idx === 0 ? '<button type="button" class="btn sm" data-act="att-new">Empezar la quincena siguiente</button>' : ''}
    </div>
    <div class="att-days" role="group" aria-label="Día">${dayBtns}</div>
    <div class="att-quick"><b>${esc(DOW_LONG[dayDate.getDay()].replace(/^./, (c) => c.toUpperCase()) + ' ' + fmtDate(attDate(sh, k)))}</b>
      ${edit && rows.length ? `<div class="actions"><button type="button" class="btn sm" data-act="att-all" data-f="e">Entrada: todos ✓</button><button type="button" class="btn sm" data-act="att-surprise">${ptime ? 'Pase sorpresa: ' + esc(ptime) : 'Pase sorpresa ahora'}</button><button type="button" class="btn sm" data-act="att-all" data-f="s">Salida: todos ✓</button></div>` : ''}
      ${ptime && edit ? `<label class="att-ptime">Hora del pase sorpresa <input type="time" id="att-ptime" value="${esc(/^\d{1,2}:\d{2}$/.test(ptime) ? ptime.padStart(5, '0') : '')}"></label>` : ''}
    </div>
    ${rows.length ? `<div class="att-list">${list}</div>` : '<div class="empty"><p>Esta planilla no tiene obreros. Agrégalos en <b>Obreros</b>.</p></div>'}
    ${rows.length ? `<div class="card"><h2>Resumen de la quincena</h2>${noExit ? `<div class="msg warn">${ICON.alert}<span>${plural(noExit, 'día tiene', 'días tienen')} la entrada marcada pero no la salida; cuentan como día completo hasta que la marques.</span></div>` : ''}<div class="table-wrap"><table class="sum"><thead><tr><th>Obrero</th><th class="num">Días</th><th class="num">Pago</th></tr></thead><tbody>${sumRows}</tbody><tfoot><tr><td>Total</td><td class="num">${fmtDays(totalDays)}</td><td class="num">${esc(money(totalPay))}</td></tr></tfoot></table></div>
      <div class="actions"><button type="button" class="btn" data-act="att-xlsx">${ICON.sheet} Excel</button><button type="button" class="btn" data-act="att-pdf">${ICON.down} PDF de la planilla</button><button type="button" class="btn ghost" data-act="att-blank">Planilla en blanco para imprimir</button></div>
      <p class="usage">${esc(ruleTxt)}. Se cambian en <b>Reglas</b>.</p></div>` : ''}`;
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
function openAttRules() {
  const R = attRules();
  const sel = (id, label, opts, v) => `<div class="field full"><label for="${id}">${label}</label><select id="${id}">${opts.map(([val, l]) => `<option value="${val}"${Number(val) === Number(v) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></div>`;
  const ded = [['0', 'No se descuenta'], ['0.25', 'Se descuenta ¼ de día'], ['0.5', 'Se descuenta ½ día'], ['1', 'No se paga el día']];
  openSheet(`<form id="att-rules-form" autocomplete="off">${sheetHead('Reglas del pase de lista')}<div class="sheet-b">
    <p class="hint">Así cuenta la app los días a pagar de cada obrero. Valen para todas las obras.</p>
    <div class="fields">
      ${sel('ar-late', 'Llegó después de la hora límite (T)', ded, R.late)}
      ${sel('ar-sm', 'No estaba en el pase sorpresa (x)', ded, R.surpriseMiss)}
      ${sel('ar-le', 'Se fue antes (x en la salida)', [['0.5', 'Cuenta ½ día'], ['0', 'No se paga el día'], ['1', 'Cuenta el día completo']], R.leftEarly)}
      ${sel('ar-c', 'Siguió corrido y se fue antes (C)', [['1', 'Cuenta 1 día'], ['0.5', 'Cuenta ½ día']], R.corrido)}
      ${sel('ar-cc', 'Siguió corrido hasta la salida (1½)', [['1.5', 'Cuenta día y medio'], ['1', 'Cuenta 1 día']], R.corridoFull)}
      ${sel('ar-sat', 'Sábado', [['1', 'Como cualquier día'], ['0.5', 'Vale medio día']], R.saturday)}
      ${sel('ar-sun', 'Domingo', [['1', 'Como cualquier día'], ['1.5', 'Vale día y medio'], ['2', 'Vale doble']], R.sunday)}
    </div></div><div class="sheet-f"><button type="submit" class="btn primary block">Guardar</button></div></form>`, { type: 'att-rules' });
}
async function saveAttRules() {
  const g = (id) => Number($(id).value);
  const data = { late: g('#ar-late'), surpriseMiss: g('#ar-sm'), leftEarly: g('#ar-le'), corrido: g('#ar-c'), corridoFull: g('#ar-cc'), saturday: g('#ar-sat'), sunday: g('#ar-sun'), updatedAt: new Date().toISOString() };
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
  for (let k = 0; k < n; k++) { const d = ymd(attDate(sh, k)); h1.push({ v: `${DOW[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`, s: XS.head }, { v: '', s: XS.head }, { v: '', s: XS.head }); h2.push({ v: 'E', s: XS.head }, { v: 'P', s: XS.head }, { v: 'S', s: XS.head }); }
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
  g.push([{ v: 'E: ✓ llegó a tiempo · T llegó después de la hora límite · x no vino.   P: ✓ estaba · x no estaba.   S: ✓ estaba a la salida · C siguió corrido sin almorzar y se fue antes · 1½ siguió corrido hasta la salida · x se fue antes.', s: XS.muted }]);
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
    T(pg, 'E = entrada · P = pase sorpresa · S = salida', M, y, 8, font, grey);
    y -= 12;
    const top = y;
    pg.drawRectangle({ x: x0, y: top - headH, width: W - 2 * M, height: headH, color: band });
    T(pg, 'No.', x0 + 2, top - 18, 7.5, bold);
    T(pg, 'Obreros', x0 + cNo + 3, top - 18, 7.5, bold);
    T(pg, 'Función', x0 + cNo + cName + 3, top - 18, 7.5, bold);
    for (let k = 0; k < n; k++) {
      const d = ymd(attDate(sh, k));
      const cx = xDays + k * dayW + dayW / 2;
      C(pg, `${DOW[d.getDay()]} ${d.getDate()}`, cx, top - 11, 7.5, bold);
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
  await flushAtt();
  const D = derive();
  const { sh } = attCurrent(D);
  const proj = D.projById.get(S.attProject);
  if (!sh || !proj) return;
  const name = fileSafe(`Pase de lista ${proj.name} ${sh.start} al ${attEnd(sh)}`);
  try {
    if (kind === 'xlsx') { deliverFile(attWorkbook(sh, proj), name + '.xlsx'); return; }
    const bytes = await attPdf(sh, proj, kind === 'blank');
    deliverFile(new Blob([bytes], { type: 'application/pdf' }), (kind === 'blank' ? 'Planilla en blanco ' : '') + name + '.pdf');
  } catch (e) { console.error(e); toast('No se pudo preparar el archivo.'); }
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
  return `<div class="o-row" data-row><span class="o-n mono">${n}</span><input data-f="qty" class="mono" inputmode="decimal" maxlength="12" placeholder="Cant." aria-label="Cantidad" value="${esc(it.qty != null ? String(it.qty) : '')}" ${dis}><input data-f="unit" list="dl-units" maxlength="20" placeholder="Unidad" aria-label="Unidad" value="${esc(it.unit || '')}" ${dis}><input data-f="desc" list="dl-items" maxlength="160" placeholder="Descripción y especificaciones" aria-label="Descripción" value="${esc(it.desc || '')}" ${dis}>${dis ? '' : `<button type="button" class="icon-btn plain" data-act="order-rm-item" aria-label="Quitar artículo">${ICON.close}</button>`}</div>`;
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
  let list = D.invoices.filter((i) => !i.orderId);
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
  T(fit(totalStr(invs), bold, 26, W - 2 * M), M, y, 26, bold); y -= 16;
  T('ITBIS incluido: ' + totalStr(invs, 'itbis'), M, y - 2, 9.5, font, C.grey); y -= 12; hr(y, C.ink, 1.2); y -= 28;

  T('Por proyecto', M, y, 11.5, bold); y -= 20;
  page.drawRectangle({ x: M, y: y - 6, width: W - 2 * M, height: 19, color: C.band });
  T('Proyecto', M + 6, y, 9, bold, C.grey); R('Facturas', 360, y, 9, bold, C.grey); R('ITBIS', 460, y, 9, bold, C.grey); R('Total', W - M - 6, y, 9, bold, C.grey); y -= 21;
  for (const g of groups) { ensure(20); T(fit(g.name, font, 10, 260), M + 6, y, 10); R(String(g.items.length), 360, y, 10); R(totalStr(g.items, 'itbis'), 460, y, 10); R(totalStr(g.items), W - M - 6, y, 10, bold); y -= 8; hr(y); y -= 13; }
  y -= 18;

  // Por proveedor: lo que se le transfiere a cada uno.
  const supHead = () => { page.drawRectangle({ x: M, y: y - 6, width: W - 2 * M, height: 19, color: C.band }); T('Proveedor', M + 6, y, 9, bold, C.grey); T('RNC', 300, y, 9, bold, C.grey); R('Facturas', 418, y, 9, bold, C.grey); R('Total a pagar', W - M - 6, y, 9, bold, C.grey); y -= 21; };
  ensure(60); T('Por proveedor', M, y, 11.5, bold); y -= 20; supHead();
  for (const g of supplierGroups(invs)) { ensure(20, supHead); T(fit(g.name || 'Sin nombre', font, 10, 245), M + 6, y, 10); T(g.rnc ? RD.fmtRnc(g.rnc) : '-', 300, y, 10); R(String(g.items.length), 418, y, 10); R(totalStr(g.items), W - M - 6, y, 10, bold); y -= 8; hr(y); y -= 13; }
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
    const vals = [String(n + 1), i.project ? i.project.name : 'Sin proyecto', i.supplier || 'Sin nombre', RD.normRnc(i.rnc) || '-', RD.normNcf(i.number) || '-', i.order ? orderNo(i.order) : !D.orders.length ? '-' : i.noOrder ? 'No lleva' : 'Sin OC', fmtDmy(i.date) || '-', isNum(i.itbis) ? money(i.itbis, i.currency) : '-', money(i.amount, i.currency)];
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
    { k: 'Concepto', w: 36, v: (i) => ({ v: i.concept || '' }) },
    { k: 'Orden de compra', w: 15, v: (i) => ({ v: i.order ? orderNo(i.order) : '' }) },
    { k: 'Estado de la orden', w: 16, v: (i) => (i.order ? { v: ORDER_LABEL[i.order.status] || '', s: i.order.status === 'autorizada' ? undefined : XS.warn } : !D.orders.length ? { v: '' } : i.noOrder ? { v: 'No lleva' } : { v: 'Sin orden', s: needsOrder(i, D) ? XS.warn : undefined }) },
    { k: 'Solicitado por', w: 20, v: (i) => ({ v: (i.order && i.order.requestedBy) || '' }) },
    { k: 'Referencia', w: 14, v: (i) => ({ v: i.ref || '' }) },
    { k: 'Conduces', w: 16, v: (i) => ({ v: (i.conduces || []).map((c) => c.number || 's/n').join(', ') }) },
    { k: 'Subtotal', w: 15, money: true, raw: subOf, v: (i) => M(subOf(i), i.currency) },
    { k: 'ITBIS', w: 14, money: true, raw: (i) => i.itbis, v: (i) => M(i.itbis, i.currency) },
    { k: 'Total', w: 15, money: true, raw: (i) => i.amount, v: (i) => M(i.amount, i.currency) },
    ...(multi ? [{ k: 'Moneda', w: 9, v: (i) => ({ v: normCur(i.currency) }) }] : []),
    { k: 'Estado', w: 21, ind: true, v: (i) => ({ v: XL_STATUS[i.status] || '', s: XS.ind }) },
    { k: 'Pago', w: 24, v: (i) => ({ v: i.pay ? i.pay.name || 'Pago' : '' }) },
    { k: 'Fecha del pago', w: 13, v: (i) => Dt(i.pay ? (i.pay.status === 'pagado' && i.pay.paidAt ? i.pay.paidAt : i.pay.date) : '') },
    { k: 'Datos tomados de', w: 30, v: (i) => ({ v: ORIGIN(i) }) },
    { k: 'Avisos', w: 32, v: (i) => { const f = reviewFlags(i, D); return f.length ? { v: f.join('; '), s: XS.warn } : { v: '' }; } },
    { k: 'Verificar en la DGII', w: 17, v: (i) => (RD.isDgiiUrl(i.qrUrl) && i.qrUrl.length < 250 && !/"/.test(i.qrUrl) ? { f: `HYPERLINK("${i.qrUrl}","Verificar")`, v: 'Verificar', s: XS.link } : { v: '' }) },
    { k: 'Agregada', w: 11, v: (i) => Dt(i.createdAt) },
  ];
  addSheet('Facturas', facturaCols, list, { fitWidth: 3, titleCols: 5, countKey: 'Proyecto', countAt: '#', curKey: multi ? 'Moneda' : null, curOf: (i) => normCur(i.currency) });

  // Por proveedor: para las transferencias.
  const sups = supplierGroups(list, multi);
  const sumF = (its, f) => round2(its.reduce((t, i) => t + (isNum(f(i)) ? f(i) : 0), 0));
  addSheet('Por proveedor', [
    { k: 'Proveedor', w: 34, v: (g) => ({ v: g.name || 'Sin nombre' }) },
    { k: 'RNC', w: 13, v: (g) => ({ v: g.rnc || '' }) },
    { k: 'Facturas', w: 10, num: true, sumInt: true, raw: (g) => g.items.length, v: (g) => ({ v: g.items.length, s: XS.int }) },
    { k: 'NCF', w: 40, v: (g) => ({ v: g.items.map((i) => RD.normNcf(i.number)).filter(Boolean).join(', ') }) },
    { k: 'Proyectos', w: 30, v: (g) => ({ v: uniqList(g.items.map((i) => (i.project ? i.project.name : 'Sin proyecto'))).join(', ') }) },
    ...(multi ? [{ k: 'Moneda', w: 9, v: (g) => ({ v: g.cur }) }] : []),
    { k: 'Subtotal', w: 16, money: true, raw: (g) => sumF(g.items, subOf), v: (g) => M(sumF(g.items, subOf), g.cur) },
    { k: 'ITBIS', w: 15, money: true, raw: (g) => sumF(g.items, (i) => i.itbis), v: (g) => M(sumF(g.items, (i) => i.itbis), g.cur) },
    { k: 'Total a pagar', w: 16, money: true, raw: (g) => sumF(g.items, (i) => i.amount), v: (g) => M(sumF(g.items, (i) => i.amount), g.cur) },
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
function exportListExcel() {
  const D = derive();
  const invs = visibleList(D);
  if (!invs.length) { toast('No hay facturas en esta lista.'); return; }
  const heading = { pendientes: 'Facturas pendientes', tramite: 'Facturas en trámite', pagadas: 'Facturas pagadas', todas: 'Todas las facturas' }[S.filter] || 'Facturas';
  const proj = S.projectFilter === 'all' ? 'Todos los proyectos' : S.projectFilter === 'none' ? 'Sin proyecto' : (D.projById.get(S.projectFilter) || {}).name || 'Proyecto';
  const ocScope = D.orders.length && !S.focus && S.invOrder !== 'all' ? (S.invOrder === 'con' ? 'Con orden de compra' : 'Sin orden de compra') : '';
  const when = dateLabel();
  const scope = [proj, when, ocScope, S.search.trim() ? `Búsqueda: "${S.search.trim()}"` : ''].filter(Boolean).join(' · ');
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
      box.innerHTML = `<div class="confirm"><p>Este respaldo es del ${esc(fmtDate(String(meta.exportedAt || '').slice(0, 10)) || 'día desconocido')} y tiene ${plural(invN, 'factura', 'facturas')}${ordN ? ' y ' + plural(ordN, 'orden de compra', 'órdenes de compra') : ''}. Al restaurarlo se <b>reemplaza todo</b> lo que hay ahora en la app.${RT.sync.status().on ? ' Como este teléfono está conectado a la nube, lo restaurado también se sube y les llega a los otros teléfonos.' : ''}</p><div class="actions"><button type="button" class="btn danger solid" data-act="restore-yes">Reemplazar y restaurar</button><button type="button" class="btn" data-act="restore-no">Cancelar</button></div></div>`;
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
    case 'ack': { const f = t.dataset.f; if (['condOverOk', 'condRefsOk', 'qtyOk'].includes(f)) write(() => db.doc('invoices/' + id).update({ [f]: true }), 'Listo'); break; }
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
    case 'open-cond': openConduce(id); break;
    case 'att-proj': flushAtt(); S.attProject = t.dataset.p; S.attSheet = ''; renderAll(); break;
    case 'att-day': S.attDay = Number(t.dataset.k) || 0; renderAll(); break;
    case 'att-mark': attMark(t.dataset.w, t.dataset.f, t.dataset.v); break;
    case 'att-all': attAll(t.dataset.f); break;
    case 'att-surprise': attSurpriseNow(); break;
    case 'att-new': newAttSheet(); break;
    case 'att-prev': case 'att-next': { flushAtt(); const sheets = attSheetsOf(S.attProject); const k = sheets.findIndex((x) => x.id === S.attSheet) + (a === 'att-prev' ? 1 : -1); if (sheets[k]) { S.attSheet = sheets[k].id; S.attDay = attTodayIdx(sheets[k]); renderAll(); } break; }
    case 'att-workers': openWorkers(); break;
    case 'att-w-toggle': toggleWorker(id); break;
    case 'att-rules': openAttRules(); break;
    case 'att-xlsx': attExport('xlsx'); break;
    case 'att-pdf': attExport('pdf'); break;
    case 'att-blank': attExport('blank'); break;
    case 'cond-list': openCondList(); break;
    case 'cond-add': condTarget = t.dataset.inv || null; $('#cond-input').click(); break;
    case 'cond-view': { const c = S.conduces.find((x) => x.id === id); if (c) showFile({ title: condTitle(c), fileId: c.fileId, fileType: c.fileType }); break; }
    case 'cond-ai': rereadConduce(id, t); break;
    case 'cond-del': $('#cond-del-box').hidden = false; $('#cond-del-box').scrollIntoView({ block: 'nearest', behavior: 'smooth' }); break;
    case 'cond-del-no': $('#cond-del-box').hidden = true; break;
    case 'cond-del-yes': deleteConduce(id); break;
    case 'cond-link': linkConduce(id, t.dataset.inv); break;
    case 'inv-to-cond': invoiceToConduce(id); break;
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
    case 'oprojf': S.orderProject = t.dataset.p; renderAll(); break;
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
    case 'order-link-open': openOrderLinkBox(id); break;
    case 'order-link-inv': linkOrder(id, t.dataset.order, 'Factura enlazada a la orden').then(() => refreshOrderInvBox(t.dataset.order)); break;
    case 'order-unlink-inv': write(() => db.doc('invoices/' + id).update({ orderId: null, orderAuto: false }), 'Factura quitada de la orden').then(() => refreshOrderInvBox(t.dataset.order)); break;
    case 'nube-connect': nubeConnect(t); break;
    case 'nube-relogin': nubeRelogin(t); break;
    case 'nube-sync': RT.sync.syncNow(); break;
    case 'nube-share': nubeShare(); break;
    case 'nube-off': { const b = $('#nb-confirm'); if (b) { b.hidden = false; b.innerHTML = '<div class="confirm"><p>¿Desconectar este teléfono de la nube? Sus datos se quedan aquí, pero ya no se ponen al día con los otros teléfonos.</p><div class="actions"><button type="button" class="btn danger solid" data-act="nube-off-yes">Desconectar</button><button type="button" class="btn" data-act="nube-off-no">Cancelar</button></div></div>'; } break; }
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
  if (t.dataset && t.dataset.wf) saveWorkerField(t);
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
  if (t.id === 'o-link-q') { const r = $('#o-link-results'); if (r) r.innerHTML = orderLinkResultsHTML(t.dataset.order, t.value); return; }
  if (S.sheet && S.sheet.type === 'order' && t.closest && t.closest('#order-form') && t.id !== 'o-msg') S.sheet.dirty = true;
  if (t.id === 'f-rnc' || t.id === 'f-num') liveHelp(t);
  if (S.sheet && S.sheet.type === 'inv' && t.closest && t.closest('#inv-form')) S.sheet.dirty = true;
  if (S.sheet && S.sheet.type === 'cond' && t.closest && t.closest('#cond-form')) S.sheet.dirty = true;
}
function onSubmit(e) {
  const f = e.target;
  e.preventDefault();
  if (f.id === 'inv-form') saveInvoice(f);
  else if (f.id === 'w-add') addWorker();
  else if (f.id === 'att-rules-form') saveAttRules();
  else if (f.id === 'cond-form') saveConduce(f);
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
    const data = { company: $('#st-company').value.trim().slice(0, 100), companyRnc: rncv, area: $('#st-area').value.trim().slice(0, 80), preparedBy: $('#st-name').value.trim().slice(0, 80), orderPrefix: $('#st-oc-prefix').value.trim().slice(0, 8), orderNext: Math.max(1, parseInt($('#st-oc-next').value, 10) || 1), orderNote: $('#st-oc-note').value.trim().slice(0, 500), orderQr: $('#st-oc-qr').checked, updatedAt: new Date().toISOString() };
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
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushAtt(); });
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
  const done = () => { if (S.got.projects && S.got.invoices && S.got.payments && S.got.orders && S.got.conduces && S.got.workers && S.got.asistencia && S.dbState === 'loading') { S.dbState = 'ready'; setTimeout(retryOffline, 1500); setTimeout(() => { fixCreditSigns().catch((e) => console.warn(e)); }, 2500); } };
  for (const name of ['projects', 'invoices', 'payments', 'orders', 'conduces', 'workers', 'asistencia']) {
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
  RT.sync.onChange((s) => { refreshNubeBox(s); scheduleRender(); });
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
