/* vDocs: a small, read-only SQLite reader. Enough to read the vault file the vDocs app writes
 * (rowid tables, any page size, overflow pages). Saving is in sqlite-write.js. */

class VDSqlite {
  constructor(buf) {
    this.b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    const b = this.b;
    if (b.length < 100 || new TextDecoder().decode(b.subarray(0, 15)) !== 'SQLite format 3') throw new Error('not a SQLite file');
    let ps = (b[16] << 8) | b[17]; if (ps === 1) ps = 65536;
    this.ps = ps; this.usable = ps - b[20];
    if (this.be32(56) > 1) throw new Error('unsupported text encoding');
    if (b[18] === 2 || b[19] === 2) throw new Error('the vault is in WAL mode');
    this.td = new TextDecoder();
    this.tables = {}; this.schema = [];
    for (const r of this.rows(1)) { this.schema.push({ type: r[0], name: r[1], tbl_name: r[2], rootpage: r[3], sql: r[4], rowid: r.rowid }); if (r[0] === 'table') this.tables[r[1]] = r[3]; }
  }
  be16(o) { return (this.b[o] << 8) | this.b[o + 1]; }
  be32(o) { return ((this.b[o] << 24) >>> 0) + (this.b[o + 1] << 16) + (this.b[o + 2] << 8) + this.b[o + 3]; }
  page(n) { if (n < 1 || n * this.ps > this.b.length) throw new Error('page out of range'); return (n - 1) * this.ps; }
  varint(o) {
    let v = 0;
    for (let i = 0; i < 8; i++) { const c = this.b[o + i]; v = v * 128 + (c & 0x7f); if (!(c & 0x80)) return [v, i + 1]; }
    return [v * 256 + this.b[o + 8], 9];
  }
  // every row of the table whose b-tree starts at page `root`, as arrays of column values
  *rows(root, want) {
    const stack = [root], seen = new Set();
    while (stack.length) {
      const n = stack.pop();
      if (seen.has(n)) throw new Error('page loop'); seen.add(n);
      const base = this.page(n), h = n === 1 ? base + 100 : base, type = this.b[h], cells = this.be16(h + 3);
      if (type === 5) {                          // interior: children left to right, then the right-most
        const kids = [];
        for (let i = 0; i < cells; i++) kids.push(this.be32(base + this.be16(h + 12 + i * 2)));
        kids.push(this.be32(h + 8));
        for (let i = kids.length - 1; i >= 0; i--) stack.push(kids[i]);
      } else if (type === 13) {                  // leaf
        for (let i = 0; i < cells; i++) {
          let o = base + this.be16(h + 8 + i * 2);
          const [len, a] = this.varint(o); o += a;
          const [rowid, c] = this.varint(o); o += c;
          yield this.record(this.payload(o, len), rowid, want);
        }
      } else throw new Error('unexpected page type ' + type);
    }
  }
  payload(o, len) {
    const U = this.usable, X = U - 35;
    if (len <= X) return this.b.subarray(o, o + len);
    const M = Math.floor((U - 12) * 32 / 255) - 23, K = M + ((len - M) % (U - 4)), local = K <= X ? K : M;
    const out = new Uint8Array(len); out.set(this.b.subarray(o, o + local));
    let at = local, next = this.be32(o + local), guard = 0;
    while (at < len) {
      if (!next || guard++ > 1e6) throw new Error('overflow chain broken');
      const p = this.page(next), take = Math.min(U - 4, len - at);
      out.set(this.b.subarray(p + 4, p + 4 + take), at); at += take; next = this.be32(p);
    }
    return out;
  }
  record(p, rowid, want) {
    const dv = new DataView(p.buffer, p.byteOffset, p.byteLength);
    let [hs, a] = this.varintIn(p, 0), o = a, body = hs; const out = [];
    while (o < hs) {
      const [t, n] = this.varintIn(p, o); o += n;
      if (want && !want.has(out.length)) { body += t >= 12 ? Math.floor((t - 12) / 2) : [0, 1, 2, 3, 4, 6, 8, 8, 0, 0][t] || 0; out.push(null); continue; }
      if (t === 0) out.push(null);
      else if (t >= 1 && t <= 6) { const sz = [0, 1, 2, 3, 4, 6, 8][t]; let v = 0; for (let i = 0; i < sz; i++) v = v * 256 + p[body + i]; if (p[body] & 0x80) v -= 2 ** (8 * sz); out.push(v); body += sz; }
      else if (t === 7) { out.push(dv.getFloat64(body)); body += 8; }
      else if (t === 8) out.push(0); else if (t === 9) out.push(1);
      else if (t >= 12 && t % 2 === 0) { const l = (t - 12) / 2; out.push(p.slice(body, body + l)); body += l; }
      else if (t >= 13) { const l = (t - 13) / 2; out.push(this.td.decode(p.subarray(body, body + l))); body += l; }
      else throw new Error('bad record');
    }
    out.rowid = rowid;
    return out;
  }
  varintIn(p, o) { let v = 0; for (let i = 0; i < 8; i++) { const c = p[o + i]; v = v * 128 + (c & 0x7f); if (!(c & 0x80)) return [v, i + 1]; } return [v * 256 + p[o + 8], 9]; }
  // a table as objects, using the column names given
  all(table, cols, only) {
    const root = this.tables[table]; if (!root) return [];
    const out = [], want = only ? new Set(only.map(c => cols.indexOf(c))) : null;
    for (const r of this.rows(root, want)) { const o = {}; cols.forEach((c, i) => { o[c] = r[i] === undefined ? null : r[i]; }); o.rowid = r.rowid; out.push(o); }
    return out;
  }
}
