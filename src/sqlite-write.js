/* vDocs: writing the vault file. Rather than patching pages in place, this builds a complete, fresh SQLite
 * file from every row (the same tables, indexes and schema text the vDocs app made), then it's read back
 * and checked before it replaces the vault. Every row of every table is kept, including the ones this plugin
 * can't open (photos, settings, the activity log). */

const VD_ROW_TYPES = { meta: ['k', 'v'], items: ['id', 'kind', 'updated', 'data'], versions: ['id', 'doc', 'created', 'named', 'data'] };

function vdVarint(v) {
  if (v < 0) throw new Error('negative varint');
  if (v <= 0x7f) return [v];
  const out = []; let n = BigInt(v);
  if (n > 0xffffffffffffffn) {          // 9-byte form (never needed for our values, but correct)
    const last = Number(n & 0xffn); n >>= 8n; const head = [];
    for (let i = 0; i < 8; i++) { head.unshift(Number(n & 0x7fn) | (i ? 0x80 : 0x80)); n >>= 7n; }
    return head.concat([last]);
  }
  while (n > 0n) { out.unshift(Number(n & 0x7fn)); n >>= 7n; }
  for (let i = 0; i < out.length - 1; i++) out[i] |= 0x80;
  return out;
}

// one row as a SQLite record
function vdRecord(vals) {
  const enc = new TextEncoder(), types = [], bodies = [];
  for (const v of vals) {
    if (v === null || v === undefined) { types.push(0); bodies.push([]); }
    else if (typeof v === 'number' && Number.isInteger(v)) {
      if (v === 0) { types.push(8); bodies.push([]); continue; }
      if (v === 1) { types.push(9); bodies.push([]); continue; }
      const sizes = [[1, 1], [2, 2], [3, 3], [4, 4], [5, 6], [6, 8]];
      let t = 6, sz = 8;
      for (const [tt, s] of sizes) { const lim = 2 ** (8 * s - 1); if (v >= -lim && v < lim) { t = tt; sz = s; break; } }
      let x = BigInt(v); if (x < 0n) x += 1n << BigInt(8 * sz);
      const b = []; for (let i = 0; i < sz; i++) { b.unshift(Number(x & 0xffn)); x >>= 8n; }
      types.push(t); bodies.push(b);
    } else if (typeof v === 'number') { const dv = new DataView(new ArrayBuffer(8)); dv.setFloat64(0, v); types.push(7); bodies.push([...new Uint8Array(dv.buffer)]); }
    else if (v instanceof Uint8Array) { types.push(12 + v.length * 2); bodies.push(v); }
    else { const b = enc.encode(String(v)); types.push(13 + b.length * 2); bodies.push(b); }
  }
  const tv = types.map(vdVarint);
  let hl = tv.reduce((a, x) => a + x.length, 0) + 1;
  if (vdVarint(hl).length > 1) hl += vdVarint(hl).length - 1;      // the header size counts itself
  const head = vdVarint(hl);
  const len = hl + bodies.reduce((a, b) => a + b.length, 0);
  const out = new Uint8Array(len); let o = 0;
  out.set(head, o); o += head.length;
  for (const t of tv) { out.set(t, o); o += t.length; }
  for (const b of bodies) { out.set(b, o); o += b.length; }
  return out;
}

// SQLite's order for index keys: NULL < numbers < text (bytewise UTF-8) < blobs, then the rowid
function vdCmp(a, b) {
  const rank = v => v === null || v === undefined ? 0 : typeof v === 'number' ? 1 : v instanceof Uint8Array ? 3 : 2;
  const ra = rank(a), rb = rank(b); if (ra !== rb) return ra - rb;
  if (ra === 0) return 0;
  if (ra === 1) return a < b ? -1 : a > b ? 1 : 0;
  const x = ra === 2 ? new TextEncoder().encode(a) : a, y = rb === 2 ? new TextEncoder().encode(b) : b;
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return x.length - y.length;
}

class VDSqliteBuilder {
  constructor(pageSize) { this.ps = pageSize; this.U = pageSize; this.pages = [null, null]; }   // page 1 is filled last
  alloc() { this.pages.push(new Uint8Array(this.ps)); return this.pages.length - 1; }
  // split a payload into the part kept in the cell and overflow pages; returns { local, first }
  spill(payload, index) {
    const U = this.U, P = payload.length;
    const X = index ? Math.floor((U - 12) * 64 / 255) - 23 : U - 35, M = Math.floor((U - 12) * 32 / 255) - 23;
    if (P <= X) return { local: payload, first: 0 };
    const K = M + ((P - M) % (U - 4)), keep = K <= X ? K : M;
    let at = keep, first = 0, prev = null;
    while (at < P) {
      const n = this.alloc(), pg = this.pages[n], take = Math.min(U - 4, P - at);
      pg.set(payload.subarray(at, at + take), 4); at += take;
      if (prev) { new DataView(prev.buffer).setUint32(0, n); } else first = n;
      prev = pg;
    }
    return { local: payload.subarray(0, keep), first };
  }
  cellBytes(parts) { const n = parts.reduce((a, p) => a + p.length, 0), c = new Uint8Array(n); let o = 0; for (const p of parts) { c.set(p, o); o += p.length; } return c; }
  u32(v) { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v); return b; }
  // write cells into a page; returns false if they don't fit
  fits(cells, interior, base) { const hdr = interior ? 12 : 8; return (base || 0) + hdr + cells.length * 2 + cells.reduce((a, c) => a + c.length, 0) <= this.U; }
  writePage(n, type, cells, right, base) {
    const pg = n === 1 ? (this.pages[1] = this.pages[1] || new Uint8Array(this.ps)) : this.pages[n];
    const dv = new DataView(pg.buffer), h = base || 0, interior = type === 2 || type === 5;
    let end = this.U;
    const ptrs = [];
    for (const c of cells) { end -= c.length; pg.set(c, end); ptrs.push(end); }
    pg[h] = type; dv.setUint16(h + 1, 0); dv.setUint16(h + 3, cells.length); dv.setUint16(h + 5, end === 65536 ? 0 : end); pg[h + 7] = 0;
    if (interior) dv.setUint32(h + 8, right);
    const pa = h + (interior ? 12 : 8);
    ptrs.forEach((p, i) => dv.setUint16(pa + i * 2, p));
  }

  // pack cells into pages greedily: returns groups of item indexes (each group = one page)
  groups(cellsOf, interior) {
    const out = []; let g = [], acc = [];
    for (let i = 0; i < cellsOf.length; i++) {
      if (g.length && !this.fits(acc.concat([cellsOf[i]]), interior)) { out.push(g); g = []; acc = []; }
      g.push(i); acc.push(cellsOf[i]);
    }
    if (g.length) out.push(g);
    return out;
  }

  // a rowid table from rows [{rowid, rec}]; returns the root page
  table(rows, onPage1) {
    rows = [...rows].sort((a, b) => a.rowid - b.rowid);
    const cells = rows.map(r => { const { local, first } = this.spill(r.rec, false); return this.cellBytes([new Uint8Array(vdVarint(r.rec.length)), new Uint8Array(vdVarint(r.rowid)), local].concat(first ? [this.u32(first)] : [])); });
    if (onPage1 && this.fits(cells, false, 100)) { this.writePage(1, 13, cells, 0, 100); return 1; }   // the schema, small: one page
    let level = [];
    for (const g of (cells.length ? this.groups(cells, false) : [[]])) { const n = this.alloc(); this.writePage(n, 13, g.map(i => cells[i])); level.push({ page: n, max: g.length ? rows[g[g.length - 1]].rowid : 0 }); }
    while (level.length > 1) {
      // each page: cells for all its children but the last, which is the right-most pointer
      const kc = level.map(k => this.cellBytes([this.u32(k.page), new Uint8Array(vdVarint(k.max))]));
      let gs = this.groupsInterior(kc);
      const up = [];
      for (const g of gs) {
        const right = level[g[g.length - 1]], cs = g.slice(0, -1).map(i => kc[i]);
        const top = onPage1 && gs.length === 1 && this.fits(cs, true, 100);
        const n = top ? 1 : this.alloc();
        this.writePage(n, 5, cs, right.page, top ? 100 : 0);
        up.push({ page: n, max: right.max });
      }
      level = up;
    }
    return level[0].page;
  }
  // children per interior page: every page gets at least two children (one cell + the right-most pointer)
  groupsInterior(kc) {
    const out = []; let g = [], acc = [];
    for (let i = 0; i < kc.length; i++) {
      // the child about to become "right-most" doesn't take a cell; the previous one does
      if (g.length && !this.fits(acc.concat([kc[g[g.length - 1]]]), true)) { out.push(g); g = []; acc = []; }
      if (g.length) acc.push(kc[g[g.length - 1]]);
      g.push(i);
    }
    if (g.length) out.push(g);
    const L = out.length;
    if (L > 1 && out[L - 1].length < 2) out[L - 1].unshift(out[L - 2].pop());
    return out;
  }

  // an index from keys [col..., rowid]; returns the root page. Index b-trees keep each key once:
  // keys between two child pages sit in the parent.
  index(keys) {
    keys = [...keys].sort((a, b) => { for (let i = 0; i < a.length; i++) { const c = vdCmp(a[i], b[i]); if (c) return c; } return 0; });
    const recs = keys.map(k => vdRecord(k));
    const leafCell = i => { const { local, first } = this.spillCache(i, recs[i]); return this.cellBytes([new Uint8Array(vdVarint(recs[i].length)), local].concat(first ? [this.u32(first)] : [])); };
    this.spills = new Map();
    // leaves: fill one, hold the next key back as the separator, fill the next...
    let items = [], cur = [], acc = [];
    for (let i = 0; i < keys.length; i++) {
      const c = leafCell(i);
      if (cur.length && !this.fits(acc.concat([c]), false)) {
        if (i < keys.length - 1) { const n = this.alloc(); this.writePage(n, 10, acc); items.push({ page: n }, { sep: i }); cur = []; acc = []; continue; }
        // the very last key doesn't fit: the leaf's own last key becomes the separator instead
        if (cur.length < 2) throw new Error('index page too small');
        const lastKey = cur.pop(); acc.pop();
        const n = this.alloc(); this.writePage(n, 10, acc); items.push({ page: n }, { sep: lastKey });
        cur = []; acc = [];
      }
      cur.push(i); acc.push(c);
    }
    { const n = this.alloc(); this.writePage(n, 10, acc); items.push({ page: n }); }
    // interior levels: items alternate child, sep, child, ..., child
    const sepCell = (sep, child) => { const { local, first } = this.spillCache(sep, recs[sep]); return this.cellBytes([this.u32(child), new Uint8Array(vdVarint(recs[sep].length)), local].concat(first ? [this.u32(first)] : [])); };
    while (items.length > 1) {
      const kids = items.filter((x, i) => i % 2 === 0), seps = items.filter((x, i) => i % 2 === 1), m = kids.length - 1;
      const cellAt = k => sepCell(seps[k].sep, kids[k].page);      // cell for child k with the separator after it
      // plan: pages cover children [a..b]; cells for a..b-1; right-most = b; separator b goes up between pages
      const plan = []; let a = 0;
      while (a <= m) {
        let b = a, acc = [];
        while (b < m && (!acc.length || this.fits(acc.concat([cellAt(b)]), true))) { acc.push(cellAt(b)); b++; }
        if (b === a) throw new Error('index page too small');
        if (b + 1 === m) { if (b - a >= 2) b--; else throw new Error('index layout'); }   // never leave one child on its own
        plan.push([a, b]); a = b + 1;
        if (a === m + 1) break;
        if (a === m) throw new Error('index layout');
      }
      const up = [];
      plan.forEach(([a, b], pi) => {
        const n = this.alloc(), cells = [];
        for (let k = a; k < b; k++) cells.push(cellAt(k));
        this.writePage(n, 2, cells, kids[b].page);
        up.push({ page: n });
        if (pi < plan.length - 1) up.push(seps[b]);
      });
      items = up;
    }
    return items[0].page;
  }
  spillCache(i, rec) { if (!this.spills.has(i)) this.spills.set(i, this.spill(rec, true)); return this.spills.get(i); }
}

/* Build a whole vault file from what was read: schema rows, and every table's rows.
 * old = the VDSqlite we read (for the header values to carry over); tables = { meta: [...], items: [...], versions: [...] } */
function vdBuildVault(old, tables) {
  const b = new VDSqliteBuilder(old.ps);
  b.pages[1] = new Uint8Array(old.ps);
  const schema = old.schema;
  const roots = {};
  // tables first, then their indexes
  const rowsOf = {};
  for (const s of schema.filter(s => s.type === 'table')) {
    const cols = VD_ROW_TYPES[s.name]; if (!cols) throw new Error('unknown table ' + s.name);
    const rows = tables[s.name] || [];
    rowsOf[s.name] = rows;
    roots[s.name] = b.table(rows.map(r => ({ rowid: r.rowid, rec: vdRecord(cols.map(c => r[c])) })));
  }
  for (const s of schema.filter(s => s.type === 'index')) {
    const cols = vdIndexCols(s); if (!cols) throw new Error('unknown index ' + s.name);
    const rows = rowsOf[s.tbl_name] || [];
    roots[s.name] = b.index(rows.map(r => cols.map(c => r[c]).concat([r.rowid])));
  }
  // page 1: the schema table, in the order it was
  const sRows = schema.map((s, i) => ({ rowid: s.rowid || i + 1, rec: vdRecord([s.type, s.name, s.tbl_name, roots[s.name] || 0, s.sql]) }));
  if (b.table(sRows, true) !== 1) throw new Error('schema layout');
  // the 100-byte header
  const n = b.pages.length - 1, pg1 = b.pages[1], dv = new DataView(pg1.buffer);
  pg1.set(old.b.subarray(0, 100), 0);
  const change = (old.be32(24) + 1) >>> 0;
  dv.setUint32(24, change); dv.setUint32(28, n); dv.setUint32(32, 0); dv.setUint32(36, 0);
  dv.setUint32(40, (old.be32(40) + 1) >>> 0); dv.setUint32(92, change);
  pg1[18] = 1; pg1[19] = 1; pg1[20] = 0;
  const out = new Uint8Array(n * old.ps);
  for (let i = 1; i <= n; i++) out.set(b.pages[i], (i - 1) * old.ps);
  return out;
}
// which columns an index covers (the vault's own indexes only)
function vdIndexCols(s) {
  const pk = { meta: ['k'], items: ['id'], versions: ['id'] };
  if (/^sqlite_autoindex_(\w+)_1$/.test(s.name)) return pk[s.tbl_name] || null;
  const m = /ON\s+"?(\w+)"?\s*\(([^)]+)\)/i.exec(s.sql || '');
  if (!m) return null;
  const cols = m[2].split(',').map(c => c.trim().replace(/"/g, ''));
  const known = VD_ROW_TYPES[m[1]];
  return cols.every(c => known && known.includes(c)) ? cols : null;
}
