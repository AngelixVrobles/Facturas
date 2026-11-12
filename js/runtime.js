/* Motor local de la app.
   - Guarda los datos y los archivos en el propio teléfono (IndexedDB). No hay servidor.
   - Lee las facturas de papel con una API externa, con una clave que se guarda solo en este dispositivo.
   - Expone RT.use('db' | 'assets' | 'sample' | 'user') para la app.
   - Opcional: comparte los datos con otros teléfonos por la nube del equipo (RT.sync). */
(function () {
  'use strict';

  const DB_NAME = 'facturas-rd';
  const DB_VERSION = 1;
  const LS = { key: 'facturas.apiKey', model: 'facturas.model' };
  const MODELS = [
    { id: 'claude-opus-5-5', label: 'Más precisa (Opus 5.5)' },
    { id: 'claude-sonnet-5-5', label: 'Equilibrada (Sonnet 5.5)' },
    { id: 'claude-haiku-5-5', label: 'Más económica (Haiku 5.5)' },
  ];

  const lsGet = (k) => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } };
  const lsSet = (k, v) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch (e) { /* sin almacenamiento */ } };
  const freeze = (o) => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.values(o).forEach(freeze); Object.freeze(o); } return o; };
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const randomHex = (n) => [...crypto.getRandomValues(new Uint8Array(n / 2))].map((b) => b.toString(16).padStart(2, '0')).join('');
  const newId = () => Date.now().toString(36) + randomHex(10);

  /* ---------- IndexedDB ---------- */
  let dbp = null;
  function openIdb() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      let req;
      try { req = indexedDB.open(DB_NAME, DB_VERSION); } catch (e) { rej(e); return; }
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains('docs')) d.createObjectStore('docs');
        if (!d.objectStoreNames.contains('files')) d.createObjectStore('files');
      };
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
      req.onblocked = () => rej(new Error('blocked'));
    });
    dbp.catch(() => { dbp = null; });
    return dbp;
  }
  function storeErr(e) {
    const name = e && e.name;
    if (name === 'QuotaExceededError') return { code: 'quota_exceeded', message: 'Sin espacio en el dispositivo' };
    return { code: 'unavailable', message: String((e && e.message) || e || 'error') };
  }
  // Ejecuta fn(store) en una transacción y resuelve cuando termina.
  async function run(storeName, mode, fn) {
    const d = await openIdb();
    return new Promise((res, rej) => {
      let t;
      try { t = d.transaction(storeName, mode); } catch (e) { rej(storeErr(e)); return; }
      const out = fn(t.objectStore(storeName));
      t.oncomplete = () => res(out && typeof out === 'object' && 'result' in out ? out.result : out);
      t.onerror = () => rej(storeErr(t.error));
      t.onabort = () => rej(storeErr(t.error));
    });
  }
  async function readAll(storeName) {
    const d = await openIdb();
    return new Promise((res, rej) => {
      const rows = [];
      const t = d.transaction(storeName, 'readonly');
      const req = t.objectStore(storeName).openCursor();
      req.onsuccess = () => { const c = req.result; if (c) { rows.push({ key: c.key, value: c.value }); c.continue(); } };
      t.oncomplete = () => res(rows);
      t.onerror = () => rej(storeErr(t.error));
    });
  }

  /* ---------- Base de datos de documentos (misma forma que la app espera) ---------- */
  const cache = new Map();
  const listeners = new Set();
  let loaded = null;
  function loadAll() {
    if (!loaded) {
      loaded = readAll('docs').then((rows) => { cache.clear(); for (const r of rows) cache.set(r.key, freeze(r.value)); });
      loaded.catch(() => { loaded = null; });
    }
    return loaded;
  }
  const meta = { fromCache: false, hasPendingWrites: false };
  const snapDoc = (p, d) => ({ id: p.split('/').pop(), exists: d !== undefined, data: () => d, metadata: meta });
  const depth = (p) => p.split('/').length;
  const parentOf = (p) => p.split('/').slice(0, -1).join('/');
  function deliver(l) {
    if (l.kind === 'doc') { setTimeout(() => { if (listeners.has(l)) l.cb(snapDoc(l.path, cache.get(l.path))); }, 0); return; }
    const docs = [...cache.entries()]
      .filter(([p]) => p.startsWith(l.path + '/') && depth(p) === depth(l.path) + 1)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([p, d]) => snapDoc(p, d));
    setTimeout(() => { if (listeners.has(l)) l.cb({ docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: meta }); }, 0);
  }
  function notify(path) {
    const coll = parentOf(path);
    for (const l of listeners) if ((l.kind === 'coll' && l.path === coll) || (l.kind === 'doc' && l.path === path)) deliver(l);
  }
  function notifyAll() { for (const l of listeners) deliver(l); }
  // El cambio entra a la memoria al instante, para que otro cambio al mismo documento que llegue enseguida lo
  // tome en cuenta (si no, el segundo pisaba al primero). Si no se puede guardar, se deshace.
  async function putDoc(path, data) {
    const value = freeze(clone(data));
    const prev = cache.get(path);
    cache.set(path, value);
    try {
      await run('docs', 'readwrite', (s) => s.put(value, path));
    } catch (e) {
      if (cache.get(path) === value) { if (prev === undefined) cache.delete(path); else cache.set(path, prev); }
      throw e;
    }
    notify(path);
    markDirty(path);
  }
  function docRef(path) {
    return {
      id: path.split('/').pop(),
      path,
      async get() { await loadAll(); return snapDoc(path, cache.get(path)); },
      set: (data) => putDoc(path, data),
      async update(data) {
        await loadAll();
        const cur = cache.get(path);
        if (!cur) throw { code: 'invalid_argument', message: 'El documento no existe' };
        await putDoc(path, { ...clone(cur), ...clone(data) });
      },
      async delete() { await run('docs', 'readwrite', (s) => s.delete(path)); cache.delete(path); notify(path); markDirty(path); },
      onSnapshot(cb, err) {
        const l = { kind: 'doc', path, cb };
        listeners.add(l);
        loadAll().then(() => deliver(l), (e) => err && err(storeErr(e)));
        return () => listeners.delete(l);
      },
      collection: (sub) => collRef(path + '/' + sub),
    };
  }
  function collRef(path) {
    return {
      path,
      doc: (id) => docRef(path + '/' + (id || newId())),
      async add(data) { const r = docRef(path + '/' + newId()); await r.set(data); return r; },
      onSnapshot(cb, err) {
        const l = { kind: 'coll', path, cb };
        listeners.add(l);
        loadAll().then(() => deliver(l), (e) => err && err(storeErr(e)));
        return () => listeners.delete(l);
      },
    };
  }
  const db = { doc: docRef, collection: collRef };

  /* ---------- Archivos (fotos, PDF y XML) ---------- */
  const urlCache = new Map();
  const assets = {
    async upload(blob, opts = {}) {
      const type = opts.type || blob.type || 'application/octet-stream';
      const buf = await blob.arrayBuffer();
      const id = randomHex(32);
      await run('files', 'readwrite', (s) => s.put({ buf, type, size: buf.byteLength, createdAt: new Date().toISOString() }, id));
      markFile(id);
      return { id, url: './_blob/' + id, sizeBytes: buf.byteLength, contentType: type };
    },
    async get(id) {
      const rec = await run('files', 'readonly', (s) => s.get(id));
      if (rec) return new Blob([rec.buf], { type: rec.type });
      return fetchFile(id); // puede venir de otro teléfono
    },
    cachedUrl: (id) => urlCache.get(id) || null,
    async objectUrl(id) {
      if (urlCache.has(id)) return urlCache.get(id);
      const b = await assets.get(id);
      if (!b) return null;
      const u = URL.createObjectURL(b);
      urlCache.set(id, u);
      return u;
    },
    async list() {
      const rows = await readAll('files');
      const bytes = rows.reduce((t, r) => t + (r.value.size || 0), 0);
      let quota = null;
      try { quota = (await navigator.storage.estimate()).quota || null; } catch (e) { /* sin dato */ }
      return { assets: rows.map((r) => ({ id: r.key, contentType: r.value.type, sizeBytes: r.value.size, createdAt: r.value.createdAt })), usage: { files: rows.length, bytes, maxBytes: quota } };
    },
    async delete(id) {
      await run('files', 'readwrite', (s) => s.delete(id));
      if (pendingFiles.delete(id)) saveFiles();
      if (urlCache.has(id)) { URL.revokeObjectURL(urlCache.get(id)); urlCache.delete(id); }
      return { deleted: true };
    },
  };

  /* ---------- Lectura de facturas por API ---------- */
  let sdkP = null;
  function loadSdk() {
    if (!sdkP) {
      sdkP = import(new URL('vendor/anthropic-sdk.mjs', document.baseURI).href).then((m) => m.default);
      sdkP.catch(() => { sdkP = null; });
    }
    return sdkP;
  }
  function blobToBase64(blob) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result).split(',')[1] || '');
      r.onerror = () => rej(r.error);
      r.readAsDataURL(blob);
    });
  }
  function apiErr(e, A) {
    // Causas que el usuario puede arreglar en la consola: se reconocen por el mensaje de la API.
    const msg = String((e && e.message) || e || '');
    if (/credit balance/i.test(msg)) return { code: 'no_credit', message: msg };
    if (/anthropic-workspace-id|not scoped to a workspace/i.test(msg)) return { code: 'no_workspace', message: msg };
    if (/CORS requests are not allowed/i.test(msg)) return { code: 'cors_blocked', message: msg };
    if (A && A.NotFoundError && e instanceof A.NotFoundError && /model/i.test(msg)) return { code: 'bad_model', message: msg };
    if (A && e instanceof A.AuthenticationError) return { code: 'bad_key', message: e.message };
    if (A && e instanceof A.PermissionDeniedError) return { code: 'bad_key', message: e.message };
    if (A && e instanceof A.RateLimitError) return { code: 'rate_limited', message: e.message };
    if (A && e instanceof A.BadRequestError) return { code: 'bad_request', message: e.message };
    if (A && e instanceof A.APIConnectionError) return { code: 'offline', message: e.message };
    if (A && e instanceof A.APIError) return { code: 'upstream_error', message: e.message, status: e.status };
    return { code: 'upstream_error', message: String((e && e.message) || e) };
  }
  const ai = {
    MODELS,
    hasKey: () => !!lsGet(LS.key),
    getKey: () => lsGet(LS.key),
    setKey: (k) => lsSet(LS.key, String(k || '').trim()),
    getModel: () => (MODELS.some((m) => m.id === lsGet(LS.model)) ? lsGet(LS.model) : MODELS[0].id),
    setModel: (m) => lsSet(LS.model, MODELS.some((x) => x.id === m) ? m : ''),
    // Una llamada: imágenes + instrucciones -> objeto JSON con la forma de `schema`.
    async json(prompt, opts = {}) {
      const key = lsGet(LS.key);
      if (!key) throw { code: 'no_key', message: 'Falta la clave de API' };
      if (!navigator.onLine) throw { code: 'offline', message: 'Sin internet' };
      const Anthropic = await loadSdk();
      const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
      const model = ai.getModel();
      const content = [];
      for (const img of opts.images || []) content.push({ type: 'image', source: { type: 'base64', media_type: img.type || 'image/jpeg', data: await blobToBase64(img) } });
      content.push({ type: 'text', text: prompt });
      const params = {
        model,
        max_tokens: 16000,
        messages: [{ role: 'user', content }],
        output_config: { effort: 'medium', format: { type: 'json_schema', schema: opts.schema } },
      };
      let res;
      try {
        // Haiku no tiene respaldo del lado del servidor; Opus y Sonnet sí.
        res = model.startsWith('claude-haiku')
          ? await client.messages.create(params)
          : await client.beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' });
      } catch (e) { throw apiErr(e, Anthropic); }
      if (res.stop_reason === 'refusal') throw { code: 'refused', message: 'No se pudo leer este archivo' };
      if (res.stop_reason === 'max_tokens') throw { code: 'invalid_json', message: 'Respuesta incompleta' };
      const text = (res.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
      try { return JSON.parse(text); } catch (e) { throw { code: 'invalid_json', message: 'Respuesta no válida', text }; }
    },
    // Prueba corta de la clave (sin imágenes).
    async test() {
      return ai.json('Responde con {"ok": true}.', { schema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'], additionalProperties: false } });
    },
  };

  /* ---------- Compartir con otros teléfonos (nube del equipo, opcional) ----------
     Cada teléfono sigue guardando todo en sí mismo y funciona sin internet. Si se conecta a la nube del equipo
     (Supabase: tabla "docs" y carpeta privada "archivos"), sube sus cambios y baja los de los demás.
     Si dos teléfonos cambian el mismo documento, queda el último que llegó a la nube. */
  const SK = { conf: 'facturas.nube', dirty: 'facturas.nube.pendientes', files: 'facturas.nube.archivos', last: 'facturas.nube.ultimo', at: 'facturas.nube.hora' };
  const FILE_KEYS = ['fileId', 'thumbId', 'xmlId', 'signedFileId', 'signedThumbId'];
  const jget = (k, d) => { try { const v = JSON.parse(lsGet(k)); return v == null ? d : v; } catch (e) { return d; } };
  const jset = (k, v) => lsSet(k, v == null ? '' : JSON.stringify(v));
  // Horas de la nube con microsegundos ("…45.123456+00:00"): se recortan a milisegundos para leerlas en cualquier navegador.
  const tms = (t) => Date.parse(String(t || '').replace(/(\.\d{3})\d+/, '$1'));
  const stable = (v) => (Array.isArray(v) ? '[' + v.map(stable).join(',') + ']' : v && typeof v === 'object' ? '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}' : JSON.stringify(v));
  let nube = jget(SK.conf, null);
  const dirty = new Map(Object.entries(jget(SK.dirty, {})));
  const pendingFiles = new Set(jget(SK.files, []));
  let lastPulled = lsGet(SK.last);
  let seq = 0;
  const nubeState = { status: nube ? 'idle' : 'off', at: Number(lsGet(SK.at)) || 0, error: '', code: '', progress: '' };
  const nubeSubs = new Set();
  const saveDirty = () => jset(SK.dirty, Object.fromEntries(dirty));
  const saveFiles = () => jset(SK.files, [...pendingFiles]);
  const baseUrl = (c = nube) => String(c.url).replace(/\/+$/, '');
  function syncStatus() {
    return { on: !!nube, email: nube ? nube.email : '', url: nube ? nube.url : '', status: nubeState.status, at: nubeState.at, error: nubeState.error, code: nubeState.code, progress: nubeState.progress, pendingDocs: dirty.size, pendingFiles: pendingFiles.size };
  }
  function nubeEmit() { const st = syncStatus(); for (const f of nubeSubs) { try { f(st); } catch (e) { /* nada */ } } }
  function markDirty(path) { if (!nube) return; dirty.set(path, ++seq + '-' + Date.now()); saveDirty(); scheduleSync(); }
  function markFile(id) { if (!nube) return; pendingFiles.add(id); saveFiles(); scheduleSync(); }
  async function markEverything() {
    await loadAll();
    for (const path of cache.keys()) dirty.set(path, ++seq + '-' + Date.now());
    saveDirty();
    for (const k of await run('files', 'readonly', (st) => st.getAllKeys())) pendingFiles.add(k);
    saveFiles();
  }

  // Sesión (correo y contraseña). La contraseña no se guarda: solo la sesión, que se renueva sola.
  async function authCall(grant, body, conf) {
    let r;
    try { r = await fetch(baseUrl(conf) + '/auth/v1/token?grant_type=' + grant, { method: 'POST', headers: { apikey: conf.key, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); } catch (e) { throw { code: 'offline', message: 'No se pudo llegar a la nube' }; }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw { code: r.status >= 400 && r.status < 500 ? 'auth' : 'server', message: j.error_description || j.msg || j.message || 'Error ' + r.status };
    return j;
  }
  function keepSession(j) { nube.access = j.access_token; nube.refresh = j.refresh_token || nube.refresh; nube.exp = Date.now() + (Number(j.expires_in) || 3600) * 1000; jset(SK.conf, nube); }
  let refreshing = null;
  function ensureSession(force) {
    if (!nube) return Promise.reject({ code: 'off' });
    if (!force && nube.access && nube.exp - Date.now() > 90000) return Promise.resolve();
    if (!refreshing) refreshing = authCall('refresh_token', { refresh_token: nube.refresh }, nube).then(keepSession).finally(() => { refreshing = null; });
    return refreshing;
  }
  async function api(path, opts = {}, again = true) {
    await ensureSession(false);
    let r;
    try { r = await fetch(baseUrl() + path, { ...opts, headers: { apikey: nube.key, Authorization: 'Bearer ' + nube.access, ...(opts.headers || {}) } }); } catch (e) { throw { code: navigator.onLine === false ? 'offline' : 'unreachable', message: 'Sin conexión' }; }
    if ((r.status === 401 || r.status === 403) && again) { await ensureSession(true); return api(path, opts, false); }
    // 540: Supabase pausó el proyecto (el plan gratis lo hace tras una semana sin uso); 402: tiene restricciones.
    if (!r.ok) { const t = await r.text().catch(() => ''); throw { code: r.status === 401 || r.status === 403 ? 'auth' : r.status === 540 ? 'paused' : r.status === 402 ? 'limited' : 'server', status: r.status, message: t.slice(0, 300) }; }
    return r;
  }

  // Subir: primero los archivos y después los documentos que los usan.
  async function pushFiles() {
    const ids = [...pendingFiles];
    let n = 0;
    for (const id of ids) {
      n++;
      nubeState.progress = ids.length > 1 ? `Subiendo archivos: ${n} de ${ids.length}` : 'Subiendo un archivo';
      nubeEmit();
      const rec = await run('files', 'readonly', (st) => st.get(id));
      if (rec) await api('/storage/v1/object/archivos/' + encodeURIComponent(id), { method: 'POST', headers: { 'Content-Type': rec.type || 'application/octet-stream', 'x-upsert': 'true' }, body: rec.buf });
      pendingFiles.delete(id);
      saveFiles();
    }
  }
  async function pushDocs() {
    const entries = [...dirty.entries()];
    for (let i = 0; i < entries.length; i += 200) {
      const batch = entries.slice(i, i + 200);
      nubeState.progress = entries.length > 200 ? `Subiendo cambios: ${Math.min(i + 200, entries.length)} de ${entries.length}` : 'Subiendo cambios';
      nubeEmit();
      const rows = batch.map(([path]) => (cache.has(path) ? { path, data: cache.get(path), deleted: false } : { path, data: null, deleted: true }));
      await api('/rest/v1/docs?on_conflict=path', { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows) });
      for (const [path, v] of batch) if (dirty.get(path) === v) dirty.delete(path);
      saveDirty();
    }
  }
  // Bajar: lo que cambió en la nube desde la última vez (con 2 minutos de margen). Lo que este teléfono tiene
  // pendiente de subir no se pisa.
  async function applyRemote(rows) {
    rows = rows.filter((r) => !dirty.has(r.path));
    if (!rows.length) return;
    const d = await openIdb();
    await new Promise((res, rej) => {
      const t = d.transaction('docs', 'readwrite');
      const st = t.objectStore('docs');
      for (const r of rows) { if (r.deleted) st.delete(r.path); else st.put(clone(r.data), r.path); }
      t.oncomplete = () => res();
      t.onerror = () => rej(storeErr(t.error));
      t.onabort = () => rej(storeErr(t.error));
    });
    const late = [];
    for (const r of rows) {
      if (dirty.has(r.path)) { late.push(r.path); continue; } // se cambió aquí mientras se guardaba: manda lo de aquí
      if (r.deleted) cache.delete(r.path); else cache.set(r.path, freeze(clone(r.data)));
    }
    if (late.length) await run('docs', 'readwrite', (st) => { for (const path of late) { const v = cache.get(path); if (v === undefined) st.delete(path); else st.put(clone(v), path); } });
    const paths = new Set(rows.map((r) => r.path).filter((x) => !late.includes(x)));
    const colls = new Set([...paths].map(parentOf));
    for (const l of listeners) if ((l.kind === 'coll' && colls.has(l.path)) || (l.kind === 'doc' && paths.has(l.path))) deliver(l);
  }
  async function pull(seen) {
    const since = lastPulled ? new Date(tms(lastPulled) - 120000).toISOString() : '1970-01-01T00:00:00.000Z';
    let offset = 0, maxSeen = lastPulled;
    const wanted = [];
    for (;;) {
      nubeState.progress = 'Bajando cambios';
      nubeEmit();
      const r = await api(`/rest/v1/docs?select=path,data,deleted,updated_at&updated_at=gte.${encodeURIComponent(since)}&order=updated_at.asc,path.asc&limit=500&offset=${offset}`);
      const rows = await r.json();
      const apply = [];
      for (const row of rows) {
        if (!maxSeen || tms(row.updated_at) > tms(maxSeen)) maxSeen = row.updated_at;
        if (seen) seen.add(row.path);
        if (dirty.has(row.path)) continue;
        const cur = cache.get(row.path);
        if (row.deleted) { if (cur !== undefined) apply.push(row); continue; }
        if (cur !== undefined && stable(cur) === stable(row.data)) continue;
        apply.push(row);
        const x = row.data || {};
        for (const k of ['thumbId', 'signedThumbId']) if (x[k]) wanted.push(x[k]);
        if (String(x.fileType || '').startsWith('image/') && x.fileId) wanted.push(x.fileId);
        if (String(x.signedFileType || '').startsWith('image/') && x.signedFileId) wanted.push(x.signedFileId);
      }
      await applyRemote(apply);
      if (rows.length < 500) break;
      offset += rows.length;
    }
    if (maxSeen && maxSeen !== lastPulled) { lastPulled = maxSeen; lsSet(SK.last, lastPulled); }
    return wanted;
  }
  // Archivos que llegaron de otro teléfono: se bajan cuando hacen falta (y las fotos, de una vez).
  const fetching = new Map();
  function fetchFile(id) {
    if (!nube || !id) return Promise.resolve(null);
    if (!fetching.has(id)) {
      fetching.set(id, (async () => {
        try {
          const r = await api('/storage/v1/object/authenticated/archivos/' + encodeURIComponent(id));
          const buf = await r.arrayBuffer();
          const type = (r.headers.get('content-type') || 'application/octet-stream').split(';')[0];
          await run('files', 'readwrite', (st) => st.put({ buf, type, size: buf.byteLength, createdAt: new Date().toISOString() }, id));
          return new Blob([buf], { type });
        } catch (e) { return null; } finally { fetching.delete(id); }
      })());
    }
    return fetching.get(id);
  }
  async function prefetch(ids) {
    for (const id of [...new Set(ids)].slice(0, 300)) {
      if (!nube) return;
      const have = await run('files', 'readonly', (st) => st.count(id)).catch(() => 1);
      if (!have) await fetchFile(id);
    }
  }

  let syncTimer = 0, syncing = null, syncAgain = false;
  function scheduleSync(ms = 1500) { if (!nube) return; clearTimeout(syncTimer); syncTimer = setTimeout(() => { syncNow(); }, ms); }
  async function doSync() {
    nubeState.status = 'syncing'; nubeState.error = ''; nubeState.code = '';
    nubeEmit();
    let wanted = [];
    try {
      if (!navigator.onLine) throw { code: 'offline' };
      await loadAll();
      await pushFiles();
      await pushDocs();
      wanted = await pull();
      nubeState.status = 'ok';
      nubeState.at = Date.now();
      lsSet(SK.at, String(nubeState.at));
    } catch (e) {
      if (!nube) return syncStatus();
      nubeState.status = 'error';
      nubeState.code = (e && e.code) || 'server';
      nubeState.error = {
        offline: 'Sin internet: se pone al día sola cuando vuelva.',
        auth: 'Hay que volver a entrar con el correo y la contraseña.',
        paused: 'Supabase pausó la nube porque pasó una semana sin usarse. Entra a supabase.com, abre el proyecto y toca «Restore». Mientras tanto, todo se guarda aquí y se sube cuando vuelva.',
        limited: 'La nube tiene una restricción (puede ser que se llenó el espacio del plan gratis). Revísalo en supabase.com. Mientras tanto, todo se guarda aquí.',
        unreachable: 'No se pudo llegar a la nube. Si tienes internet, puede que Supabase la haya pausado: entra a supabase.com, abre el proyecto y toca «Restore».',
      }[nubeState.code] || 'No se pudo sincronizar; se vuelve a intentar sola.';
      if (nubeState.code !== 'offline') console.warn('nube', e);
    } finally {
      nubeState.progress = '';
      nubeEmit();
    }
    if (wanted.length) prefetch(wanted);
    return syncStatus();
  }
  // Una sola sincronización a la vez. La marca de "en curso" se quita cuando de verdad terminó (aunque termine
  // al instante, por ejemplo sin internet), para que la siguiente sí corra.
  function syncNow() {
    if (!nube) return Promise.resolve(syncStatus());
    if (syncing) { syncAgain = true; return syncing; }
    const p = doSync().finally(() => {
      if (syncing === p) syncing = null;
      if (syncAgain) { syncAgain = false; scheduleSync(800); }
    });
    syncing = p;
    return p;
  }
  // La URL del proyecto. Si se pega la del panel (supabase.com/dashboard/project/…), solo el código del proyecto
  // o una dirección de la API (….supabase.co/rest/v1), se saca la del proyecto.
  const normUrl = (u) => {
    const t = String(u || '').trim().replace(/\/+$/, '');
    const dash = /supabase\.com\/dashboard\/project\/([a-z0-9]+)/i.exec(t);
    if (dash) return `https://${dash[1].toLowerCase()}.supabase.co`;
    if (/^[a-z0-9]{20}$/.test(t)) return `https://${t}.supabase.co`;
    const api = /^(https?:\/\/[a-z0-9-]+\.supabase\.(?:co|in))(?:\/.*)?$/i.exec(t);
    if (api) return api[1].toLowerCase();
    return !t ? '' : /^https?:\/\//i.test(t) ? t : 'https://' + t;
  };
  async function connect({ url, key, email, password }) {
    const conf = { url: normUrl(url), key: String(key || '').trim(), email: String(email || '').trim().toLowerCase() };
    if (!conf.url || !conf.key || !conf.email || !password) throw { code: 'bad_input', message: 'Faltan datos' };
    const j = await authCall('password', { email: conf.email, password }, conf);
    nube = conf;
    keepSession(j);
    lastPulled = ''; lsSet(SK.last, '');
    dirty.clear(); saveDirty();
    // Primero se baja lo que ya hay en la nube (eso manda) y después se sube solo lo que la nube no tiene.
    await loadAll();
    const remote = new Set();
    try { prefetch(await pull(remote)); } catch (e) { nube = null; jset(SK.conf, null); throw e; }
    for (const path of cache.keys()) if (!remote.has(path)) dirty.set(path, ++seq + '-' + Date.now());
    saveDirty();
    for (const k of await run('files', 'readonly', (st) => st.getAllKeys())) pendingFiles.add(k);
    saveFiles();
    nubeState.status = 'idle';
    nubeEmit();
    return syncNow();
  }
  async function relogin(password) {
    if (!nube) throw { code: 'off' };
    keepSession(await authCall('password', { email: nube.email, password }, nube));
    return syncNow();
  }
  function disconnect() {
    nube = null;
    jset(SK.conf, null);
    dirty.clear(); saveDirty();
    pendingFiles.clear(); saveFiles();
    lastPulled = ''; lsSet(SK.last, ''); lsSet(SK.at, '');
    Object.assign(nubeState, { status: 'off', at: 0, error: '', code: '', progress: '' });
    nubeEmit();
  }
  // Respaldo automático en la nube: los datos (sin los archivos, que ya están en la nube) en uno de 8 lugares,
  // uno por semana; así siempre quedan las últimas 8 semanas sin tener que borrar nada.
  const BK_SLOTS = 8;
  const bkSlot = (t = Date.now()) => 'semana-' + ((Math.floor(t / (7 * 864e5)) % BK_SLOTS) + 1);
  async function backupNow(opts = {}) {
    if (!nube) throw { code: 'off' };
    await loadAll();
    const docs = [...cache.entries()].filter(([p]) => p !== 'settings/respaldos').map(([path, data]) => ({ path, data }));
    const at = new Date().toISOString();
    const slot = opts.slot || bkSlot();
    await api('/storage/v1/object/archivos/respaldos/' + slot + '.json', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-upsert': 'true' }, body: JSON.stringify({ app: 'facturas', v: 1, exportedAt: at, docs }) });
    return { slot, at, docs: docs.length };
  }
  async function listBackups() {
    const r = await api('/storage/v1/object/list/archivos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prefix: 'respaldos/', limit: 50, offset: 0, sortBy: { column: 'name', order: 'asc' } }) });
    const rows = await r.json();
    return (Array.isArray(rows) ? rows : []).filter((x) => /^(semana-\d+|antes-de-restaurar)\.json$/.test(x.name)).map((x) => ({ name: x.name, at: x.updated_at || x.created_at || '', size: (x.metadata && x.metadata.size) || 0 }));
  }
  async function getBackup(name) {
    const r = await api('/storage/v1/object/authenticated/archivos/respaldos/' + encodeURIComponent(name));
    return r.json();
  }
  // Código para conectar otro teléfono (URL y clave pública; sin la contraseña).
  const shareCode = () => (nube ? 'FACTURAS-NUBE:' + btoa(JSON.stringify({ url: nube.url, key: nube.key })) : '');
  // El código se acepta aunque al pegarlo el teléfono le cambie las mayúsculas del principio o le meta espacios o saltos de línea.
  function parseShareCode(text) {
    const m = /facturas-nube\s*:\s*([A-Za-z0-9+/=\s]+)/i.exec(String(text || ''));
    if (!m) return null;
    try { const o = JSON.parse(atob(m[1].replace(/\s+/g, ''))); return o && o.url && o.key ? { url: String(o.url), key: String(o.key) } : null; } catch (e) { return null; }
  }
  setInterval(() => { if (nube && document.visibilityState === 'visible') syncNow(); }, 30000);
  window.addEventListener('online', () => scheduleSync(500));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') scheduleSync(400); });
  if (nube) scheduleSync(1200);
  const sync = { status: syncStatus, onChange(f) { nubeSubs.add(f); return () => nubeSubs.delete(f); }, connect, relogin, disconnect, syncNow, shareCode, parseShareCode, backupNow, listBackups, getBackup };

  /* ---------- Respaldo completo ---------- */
  async function exportAll() {
    await loadAll();
    const files = await readAll('files');
    return { docs: [...cache.entries()].map(([path, data]) => ({ path, data })), files: files.map((r) => ({ id: r.key, type: r.value.type, createdAt: r.value.createdAt, buf: r.value.buf })) };
  }
  async function importAll({ docs, files }) {
    const d = await openIdb();
    await new Promise((res, rej) => {
      const t = d.transaction(['docs', 'files'], 'readwrite');
      const ds = t.objectStore('docs');
      const fs = t.objectStore('files');
      ds.clear();
      fs.clear();
      for (const x of docs) ds.put(x.data, x.path);
      for (const f of files) fs.put({ buf: f.buf, type: f.type, size: f.buf.byteLength, createdAt: f.createdAt || new Date().toISOString() }, f.id);
      t.oncomplete = () => res();
      t.onerror = () => rej(storeErr(t.error));
      t.onabort = () => rej(storeErr(t.error));
    });
    for (const u of urlCache.values()) URL.revokeObjectURL(u);
    urlCache.clear();
    loaded = null;
    await loadAll();
    notifyAll();
    if (nube) { await markEverything(); scheduleSync(500); } // con la nube activa, lo restaurado también se sube
  }

  // Restaurar solo los datos (los archivos se quedan). Lo que no está en el respaldo se borra, también en la nube.
  async function importDocs(docs, keep = []) {
    await loadAll();
    const before = new Set(cache.keys());
    const kept = keep.filter((p) => cache.has(p)).map((p) => ({ path: p, data: clone(cache.get(p)) }));
    const d = await openIdb();
    await new Promise((res, rej) => {
      const t = d.transaction('docs', 'readwrite');
      const ds = t.objectStore('docs');
      ds.clear();
      for (const x of docs) if (!keep.includes(x.path)) ds.put(x.data, x.path);
      for (const x of kept) ds.put(x.data, x.path);
      t.oncomplete = () => res();
      t.onerror = () => rej(storeErr(t.error));
      t.onabort = () => rej(storeErr(t.error));
    });
    loaded = null;
    await loadAll();
    notifyAll();
    if (nube) {
      for (const path of new Set([...before, ...cache.keys()])) if (!keep.includes(path)) dirty.set(path, ++seq + '-' + Date.now());
      saveDirty();
      scheduleSync(500);
    }
  }

  async function persist() {
    try {
      if (!navigator.storage || !navigator.storage.persist) return null;
      if (await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
    } catch (e) { return null; }
  }

  const user = { isOwner: async () => true, canEdit: async () => true, can: async () => true, id: async () => 'local', me: async () => ({ id: 'local', name: '', isOwner: true, canEdit: true }) };

  async function use(name) {
    if (name === 'db' || name === 'assets') { try { await loadAll(); } catch (e) { return null; } }
    return { db, assets, user, sample: ai }[name] || null;
  }

  window.RT = { db, assets, ai, sync, exportAll, importAll, importDocs, persist, openIdb, use };
})();
