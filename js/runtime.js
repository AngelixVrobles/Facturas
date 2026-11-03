/* Motor local de la app.
   - Guarda los datos y los archivos en el propio teléfono (IndexedDB). No hay servidor.
   - Lee las facturas de papel con una API externa, con una clave que se guarda solo en este dispositivo.
   - Expone RT.use('db' | 'assets' | 'sample' | 'user') para la app. */
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
  async function putDoc(path, data) {
    const value = clone(data);
    await run('docs', 'readwrite', (s) => s.put(value, path));
    cache.set(path, freeze(value));
    notify(path);
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
      async delete() { await run('docs', 'readwrite', (s) => s.delete(path)); cache.delete(path); notify(path); },
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
      return { id, url: './_blob/' + id, sizeBytes: buf.byteLength, contentType: type };
    },
    async get(id) {
      const rec = await run('files', 'readonly', (s) => s.get(id));
      return rec ? new Blob([rec.buf], { type: rec.type }) : null;
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

  window.RT = { db, assets, ai, exportAll, importAll, persist, openIdb, use };
})();
