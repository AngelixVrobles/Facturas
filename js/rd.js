/* Reglas fiscales de República Dominicana que usa la app:
   NCF y e-NCF, RNC y cédula, el código QR de la factura electrónica (e-CF) y su XML. */
(function () {
  'use strict';

  // Tipos de comprobante (serie B tradicional y serie E electrónica).
  const NCF_TYPES = {
    '01': 'Crédito fiscal', '02': 'Consumo', '03': 'Nota de débito', '04': 'Nota de crédito',
    '11': 'Comprobante de compras', '12': 'Registro único de ingresos', '13': 'Gastos menores',
    '14': 'Regímenes especiales', '15': 'Gubernamental', '16': 'Exportaciones', '17': 'Pagos al exterior',
    '31': 'Crédito fiscal electrónica', '32': 'Consumo electrónica', '33': 'Nota de débito electrónica',
    '34': 'Nota de crédito electrónica', '41': 'Compras electrónico', '43': 'Gastos menores electrónico',
    '44': 'Regímenes especiales electrónico', '45': 'Gubernamental electrónico', '46': 'Exportaciones electrónico',
    '47': 'Pagos al exterior electrónico',
  };

  // Algunos sistemas imprimen el NCF con ceros delante (00000000B0100003467): se toma solo B + 10 dígitos o E + 12.
  const normNcf = (s) => {
    const raw = String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (/^(B\d{10}|E\d{12})$/.test(raw)) return raw;
    const m = /E\d{12}|B\d{10}/.exec(raw);
    return m ? m[0] : raw;
  };
  const normRnc = (s) => String(s || '').replace(/\D/g, '');

  // B + 2 dígitos de tipo + 8 de secuencia, o E + 2 de tipo + 10 de secuencia.
  function parseNcf(s) {
    const n = normNcf(s);
    let m = /^B(\d{2})(\d{8})$/.exec(n);
    if (m) return { ok: true, value: n, electronic: false, code: m[1], label: NCF_TYPES[m[1]] || 'Tipo ' + m[1], consumo: m[1] === '02' };
    m = /^E(\d{2})(\d{10})$/.exec(n);
    if (m) return { ok: true, value: n, electronic: true, code: m[1], label: NCF_TYPES[m[1]] || 'Tipo ' + m[1], consumo: m[1] === '32' };
    return { ok: false, value: n };
  }

  // Dígito verificador del RNC de 9 dígitos (módulo 11, pesos 7 9 8 6 5 4 3 2).
  function rncCheck(d) {
    if (!/^\d{9}$/.test(d)) return false;
    const w = [7, 9, 8, 6, 5, 4, 3, 2];
    const r = w.reduce((t, k, i) => t + k * Number(d[i]), 0) % 11;
    return String(((10 - r) % 9) + 1) === d[8];
  }
  function rncInfo(s) {
    const d = normRnc(s);
    if (!d) return { value: '', kind: null, ok: false, checkOk: null };
    if (d.length === 9) return { value: d, kind: 'rnc', ok: true, checkOk: rncCheck(d) };
    if (d.length === 11) return { value: d, kind: 'cedula', ok: true, checkOk: null };
    return { value: d, kind: null, ok: false, checkOk: null };
  }
  function fmtRnc(s) {
    const d = normRnc(s);
    if (d.length === 9) return `${d.slice(0, 1)}-${d.slice(1, 3)}-${d.slice(3, 8)}-${d.slice(8)}`;
    if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 10)}-${d.slice(10)}`;
    return d;
  }

  function dmyToIso(s) {
    const m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/.exec(String(s || '').trim());
    return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : '';
  }

  function isDgiiUrl(u) {
    try {
      const x = new URL(String(u || '').trim());
      return x.protocol === 'https:' && (x.hostname === 'dgii.gov.do' || x.hostname.endsWith('.dgii.gov.do'));
    } catch (e) { return false; }
  }

  // El QR de la representación impresa de una e-CF es un enlace de consulta de la DGII.
  // Se leen sus parámetros sin importar mayúsculas; el enlace completo sirve para verificar.
  function parseQr(text) {
    const t = String(text || '').trim();
    if (!isDgiiUrl(t)) return null;
    const u = new URL(t);
    const p = {};
    for (const [k, v] of u.searchParams) p[k.toLowerCase()] = String(v || '').trim();
    const raw = p.montototal != null ? Number(String(p.montototal).replace(/,/g, '')) : NaN;
    return {
      url: u.href,
      rncEmisor: normRnc(p.rncemisor),
      rncComprador: normRnc(p.rnccomprador),
      encf: normNcf(p.encf || p['e-ncf'] || p.ncf || ''),
      fecha: dmyToIso(p.fechaemision || ''),
      monto: Number.isFinite(raw) ? raw : null,
      codigo: String(p.codigoseguridad || '').slice(0, 16),
    };
  }

  // XML de la e-CF (formato DGII): se buscan las etiquetas por nombre, estén donde estén.
  function parseEcfXml(text) {
    let doc;
    try { doc = new DOMParser().parseFromString(String(text || ''), 'application/xml'); } catch (e) { return null; }
    if (!doc || doc.getElementsByTagName('parsererror').length) return null;
    const first = new Map();
    for (const el of doc.getElementsByTagName('*')) {
      if (el.children.length) continue;
      const k = String(el.localName || el.nodeName).toLowerCase();
      if (!first.has(k)) first.set(k, String(el.textContent || '').trim());
    }
    const g = (n) => first.get(n.toLowerCase()) || '';
    const num = (n) => { const v = g(n); if (!v) return null; const x = Number(v.replace(/,/g, '')); return Number.isFinite(x) ? x : null; };
    const encf = normNcf(g('eNCF'));
    if (!/^E\d{12}$/.test(encf)) return null;
    return {
      encf,
      tipo: g('TipoeCF'),
      vence: dmyToIso(g('FechaVencimientoSecuencia')),
      rncEmisor: normRnc(g('RNCEmisor')),
      emisor: g('RazonSocialEmisor') || g('NombreComercial'),
      fecha: dmyToIso(g('FechaEmision')),
      rncComprador: normRnc(g('RNCComprador')),
      comprador: g('RazonSocialComprador'),
      total: num('MontoTotal'),
      itbis: num('TotalITBIS'),
      ordenCompra: g('NumeroOrdenCompra').slice(0, 40),
      monedaExtranjera: g('TipoMoneda'),
    };
  }

  window.RD = { NCF_TYPES, normNcf, parseNcf, normRnc, rncInfo, fmtRnc, dmyToIso, isDgiiUrl, parseQr, parseEcfXml };
})();
