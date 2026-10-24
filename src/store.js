/* vDocs: the vault in Obsidian. Reads Vault.vdocs and saves your changes into it.
 * Saving: read the vault again if anything changed it since we last looked, put our changes in (an item
 * only replaces one that's older), build a complete fresh vault file, read that back to check it, then
 * swap it in. On a PC, if the vDocs app has the vault open the swap is refused by Windows, so nothing
 * gets written over: your changes wait (encrypted, on this device) and save once the app is closed. */

class VDStore {
  constructor(plugin, path) { this.p = plugin; this.path = path; this.pending = { items: {}, versions: {} }; this.blocked = false; }
  get adapter() { return this.p.app.vault.adapter; }

  async stat() { try { const s = await this.adapter.stat(this.path); return s ? s.mtime + ':' + s.size : ''; } catch (e) { return ''; } }
  async read() {
    let last;
    for (let i = 0; i < 6; i++) {
      try {
        if (await this.adapter.exists(this.path + '-journal')) throw new Error('the vDocs app is saving');
        const before = await this.stat();
        const db = new VDSqlite(await this.adapter.readBinary(this.path));
        const meta = {}; for (const m of db.all('meta', ['k', 'v'])) meta[m.k] = m.v;
        if (meta.format !== 'vdocs-1' || !meta.header) throw new Error('this isn’t a vDocs vault');
        if (db.schema.some(s => (s.type === 'table' && !VD_ROW_TYPES[s.name]) || (s.type === 'index' && !vdIndexCols(s)) || s.type === 'trigger' || s.type === 'view')) this.readOnly = 'This vault has parts this version doesn’t know, so it opens read-only.';
        this.db = db; this.header = JSON.parse(meta.header); this.meta = meta;
        this.rows = { meta: db.all('meta', VD_ROW_TYPES.meta), items: db.all('items', VD_ROW_TYPES.items), versions: db.all('versions', VD_ROW_TYPES.versions) };
        this.seen = before;
        this.restorePending();
        return true;
      } catch (e) { last = e; await new Promise(r => window.setTimeout(r, 400 * (i + 1))); }
    }
    throw last;
  }
  // the newest copy of every item of a kind: the vault's, or a change of ours still waiting to be saved
  merged(kind) {
    const out = new Map();
    for (const it of this.rows.items) if (it.kind === kind) out.set(it.id, it);
    for (const it of Object.values(this.pending.items)) if (it.kind === kind && (!out.has(it.id) || out.get(it.id).updated < it.updated)) out.set(it.id, it);
    return out;
  }
  waiting() { return Object.keys(this.pending.items).length; }

  async put(item) { this.pending.items[item.id] = item; this.keepPending(); this.soon(); }
  async putVersion(v) { this.pending.versions[v.id] = v; this.keepPending(); this.soon(); }
  soon(ms) { window.clearTimeout(this.saveT); this.saveT = window.setTimeout(() => this.save().catch(e => this.fail(e)), ms || 1500); }
  fail(e) { this.lastError = String(e.message || e); this.p.onStoreState(); this.soon(30000); }

  // changes not saved yet are kept on this device (they're already encrypted), so closing Obsidian doesn't lose them
  pendingKey() { return 'pending:' + (this.header ? this.header.id : ''); }
  keepPending() { const o = this.p.local(); o[this.pendingKey()] = this.waiting() || Object.keys(this.pending.versions).length ? this.pending : undefined; this.p.saveLocal(o); }
  restorePending() {
    const saved = this.p.local()[this.pendingKey()];
    if (!saved) return;
    for (const it of Object.values(saved.items || {})) if (!this.pending.items[it.id] || this.pending.items[it.id].updated < it.updated) this.pending.items[it.id] = it;
    for (const v of Object.values(saved.versions || {})) this.pending.versions[v.id] = v;
    if (this.waiting() || Object.keys(this.pending.versions).length) this.soon(800);
  }

  async save() {
    if (this.saving) { this.soon(); return; }
    if (this.readOnly) return;
    const items = Object.values(this.pending.items), versions = Object.values(this.pending.versions);
    if (!items.length && !versions.length) return;
    this.saving = true;
    try {
      if (await this.adapter.exists(this.path + '-journal')) { this.soon(3000); return; }     // the app is mid-save
      if ((await this.stat()) !== this.seen) await this.read();                               // someone else changed it: start from theirs
      // our changes on top of what's in the vault
      const rows = { meta: this.rows.meta, items: this.rows.items.map(r => Object.assign({}, r)), versions: this.rows.versions.slice() };
      const byId = new Map(rows.items.map(r => [r.id, r]));
      let next = rows.items.reduce((a, r) => Math.max(a, r.rowid), 0) + 1;
      for (const it of items) {
        const have = byId.get(it.id);
        if (!have) rows.items.push({ rowid: next++, id: it.id, kind: it.kind, updated: it.updated, data: it.data });
        else if (have.updated < it.updated) Object.assign(have, { kind: it.kind, updated: it.updated, data: it.data });
      }
      const vIds = new Set(rows.versions.map(r => r.id));
      let nextV = rows.versions.reduce((a, r) => Math.max(a, r.rowid), 0) + 1;
      for (const v of versions) if (!vIds.has(v.id)) rows.versions.push({ rowid: nextV++, id: v.id, doc: v.doc, created: v.created, named: v.named ? 1 : 0, data: v.data });
      // build it, and check it reads back right before it goes anywhere near the vault
      const buf = vdBuildVault(this.db, rows);
      const check = new VDSqlite(buf);
      const got = check.all('items', VD_ROW_TYPES.items), gotV = check.all('versions', VD_ROW_TYPES.versions, ['id']);
      if (got.length !== rows.items.length || gotV.length !== rows.versions.length || check.all('meta', VD_ROW_TYPES.meta).length !== rows.meta.length) throw new Error('the new vault file didn’t check out');
      const want = new Map(rows.items.map(r => [r.id, r]));
      for (const r of got) { const w = want.get(r.id); if (!w || w.data !== r.data || w.updated !== r.updated || w.kind !== r.kind) throw new Error('the new vault file didn’t check out'); }
      await this.swapIn(buf);
      if (this.blocked) return;
      this.db = check; this.rows = { meta: rows.meta, items: got, versions: check.all('versions', VD_ROW_TYPES.versions) };
      for (const it of items) if (this.pending.items[it.id] === it) delete this.pending.items[it.id];
      for (const v of versions) delete this.pending.versions[v.id];
      this.keepPending(); this.lastError = '';
      this.p.onStoreState();
    } finally { this.saving = false; }
  }

  // write the new file next to the vault, then put it in the vault's place
  async swapIn(buf) {
    const tmp = this.path + '.vdtmp', ad = this.adapter;
    this.selfWrite = Date.now();
    await ad.writeBinary(tmp, buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    let fs = null; try { fs = !Platform.isMobile && typeof require === 'function' && ad.getFullPath ? require('fs') : null; } catch (e) { fs = null; }
    if (fs) {
      try { fs.renameSync(ad.getFullPath(tmp), ad.getFullPath(this.path)); }
      catch (e) {
        // Windows won't replace a file another program has open: the vDocs app is using the vault
        try { await ad.remove(tmp); } catch (x) { /* gone */ }
        this.blocked = true; this.p.onStoreState(); this.soon(20000);
        return;
      }
    } else {
      await ad.writeBinary(this.path, buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
      try { await ad.remove(tmp); } catch (e) { /* fine */ }
    }
    this.blocked = false;
    this.seen = await this.stat();
  }
}
