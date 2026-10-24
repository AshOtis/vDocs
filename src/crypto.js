/* vDocs: the same encryption as the vDocs app.
 * - Each item in the vault is AES-256-GCM with a fresh nonce and its id bound in as associated data.
 * - The vault's master key is locked with your password and with your recovery key (scrypt N=2^17, r=8, p=1).
 * - On this device, once you've unlocked with your password, the master key is locked again under your PIN
 *   plus a random device key that never leaves this device (it isn't in the vault, so it never syncs).
 *   Five wrong PINs and that copy is wiped; your password or recovery key opens it again. */

const VD_ENC = new TextEncoder(), VD_DEC = new TextDecoder();
const vdB64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const vdUnB64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const vdRandom = n => crypto.getRandomValues(new Uint8Array(n));
const vdCleanRK = s => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
function vdId() { const b = vdRandom(9); let s = ''; for (const x of b) s += x.toString(36).padStart(2, '0').slice(-2); return 'd' + Date.now().toString(36) + s.slice(0, 10); }

async function vdAesKey(raw) { return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']); }
async function vdSeal(key, bytes, aad) {
  const iv = vdRandom(12);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: VD_ENC.encode(aad) }, key, bytes));
  return { iv: vdB64(iv), ct: vdB64(ct) };
}
async function vdOpen(key, box, aad) {
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: vdUnB64(box.iv), additionalData: VD_ENC.encode(aad) }, key, vdUnB64(box.ct)));
}
async function vdSealJson(key, obj, aad) { return JSON.stringify(Object.assign({ v: 1 }, await vdSeal(key, VD_ENC.encode(JSON.stringify(obj)), aad))); }
async function vdOpenJson(key, text, aad) { return JSON.parse(VD_DEC.decode(await vdOpen(key, JSON.parse(text), aad))); }

/* ---------- scrypt: Node's on desktop, our own (below) on phones and tablets ---------- */
async function vdScrypt(password, salt, logN) {
  if (!(logN >= 14 && logN <= 20) || salt.length < 16) throw new Error('bad key settings');
  const pw = VD_ENC.encode(password);
  let node = null;
  try { node = typeof require === 'function' ? require('crypto') : null; } catch (e) { node = null; }
  if (node && node.scrypt) {
    return new Promise((ok, no) => node.scrypt(pw, salt, 32, { N: 2 ** logN, r: 8, p: 1, maxmem: 300 * 1024 * 1024 }, (e, k) => e ? no(e) : ok(new Uint8Array(k))));
  }
  return vdScryptJs(pw, salt, 2 ** logN, 8, 1, 32);
}
async function vdPbkdf2(pw, salt, iters, len) {
  const k = await crypto.subtle.importKey('raw', pw, 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iters }, k, len * 8));
}
async function vdScryptJs(pw, salt, N, r, p, len) {
  const B = await vdPbkdf2(pw, salt, 1, p * 128 * r);
  const W = 32 * r, X = new Uint32Array(W), V = new Uint32Array(W * N), Y = new Uint32Array(W), x = new Uint32Array(16);
  const salsa = (B16) => {
    for (let i = 0; i < 16; i++) x[i] = B16[i];
    for (let i = 0; i < 8; i += 2) {
      const R = (a, b) => (a << b) | (a >>> (32 - b));
      x[4] ^= R(x[0] + x[12], 7); x[8] ^= R(x[4] + x[0], 9); x[12] ^= R(x[8] + x[4], 13); x[0] ^= R(x[12] + x[8], 18);
      x[9] ^= R(x[5] + x[1], 7); x[13] ^= R(x[9] + x[5], 9); x[1] ^= R(x[13] + x[9], 13); x[5] ^= R(x[1] + x[13], 18);
      x[14] ^= R(x[10] + x[6], 7); x[2] ^= R(x[14] + x[10], 9); x[6] ^= R(x[2] + x[14], 13); x[10] ^= R(x[6] + x[2], 18);
      x[3] ^= R(x[15] + x[11], 7); x[7] ^= R(x[3] + x[15], 9); x[11] ^= R(x[7] + x[3], 13); x[15] ^= R(x[11] + x[7], 18);
      x[1] ^= R(x[0] + x[3], 7); x[2] ^= R(x[1] + x[0], 9); x[3] ^= R(x[2] + x[1], 13); x[0] ^= R(x[3] + x[2], 18);
      x[6] ^= R(x[5] + x[4], 7); x[7] ^= R(x[6] + x[5], 9); x[4] ^= R(x[7] + x[6], 13); x[5] ^= R(x[4] + x[7], 18);
      x[11] ^= R(x[10] + x[9], 7); x[8] ^= R(x[11] + x[10], 9); x[9] ^= R(x[8] + x[11], 13); x[10] ^= R(x[9] + x[8], 18);
      x[12] ^= R(x[15] + x[14], 7); x[13] ^= R(x[12] + x[15], 9); x[14] ^= R(x[13] + x[12], 13); x[15] ^= R(x[14] + x[13], 18);
    }
    for (let i = 0; i < 16; i++) B16[i] = (B16[i] + x[i]) >>> 0;
  };
  const T = new Uint32Array(16);
  const blockMix = (Bin, Bout) => {          // BlockMix(salsa20/8)
    for (let i = 0; i < 16; i++) T[i] = Bin[(2 * r - 1) * 16 + i];
    for (let i = 0; i < 2 * r; i++) {
      for (let j = 0; j < 16; j++) T[j] ^= Bin[i * 16 + j];
      salsa(T);
      const o = ((i & 1) ? r : 0) * 16 + (i >> 1) * 16;
      for (let j = 0; j < 16; j++) Bout[o + j] = T[j];
    }
  };
  const dv = new DataView(B.buffer);
  for (let pi = 0; pi < p; pi++) {
    const off = pi * 128 * r;
    for (let i = 0; i < W; i++) X[i] = dv.getUint32(off + i * 4, true);
    for (let i = 0; i < N; i++) {
      V.set(X, i * W); blockMix(X, Y); X.set(Y);
      if ((i & 4095) === 0) await new Promise(res => setTimeout(res, 0));   // keep the screen responsive
    }
    for (let i = 0; i < N; i++) {
      const j = X[(2 * r - 1) * 16] & (N - 1);
      for (let k = 0; k < W; k++) X[k] ^= V[j * W + k];
      blockMix(X, Y); X.set(Y);
      if ((i & 4095) === 0) await new Promise(res => setTimeout(res, 0));
    }
    for (let i = 0; i < W; i++) dv.setUint32(off + i * 4, X[i], true);
  }
  V.fill(0);
  return vdPbkdf2(pw, B, 1, len);
}

/* ---------- the vault header ---------- */
const VDKeys = {
  async openWith(kdf, box, secret) {
    const k = await vdAesKey(await vdScrypt(secret, vdUnB64(kdf.salt), kdf.logN));
    try { return await vdOpen(k, box, 'vdocs:master'); } catch (e) { return null; }
  },
  async withPassword(header, pw) { return this.openWith(header.kdf, header.wrap, pw); },
  async withRecovery(header, rk) { return header.rkdf && header.wrapR ? this.openWith(header.rkdf, header.wrapR, vdCleanRK(rk)) : null; },

  // the PIN copy on this device: PBKDF2(PIN, salt) mixed with the device key, then AES-GCM
  async pinKey(pin, rec) {
    const bits = await vdPbkdf2(VD_ENC.encode(pin), vdUnB64(rec.salt), rec.iters, 32);
    const dev = vdUnB64(rec.dev), mixed = new Uint8Array(32);
    for (let i = 0; i < 32; i++) mixed[i] = bits[i] ^ dev[i];
    const h = new Uint8Array(await crypto.subtle.digest('SHA-256', mixed)); mixed.fill(0); bits.fill(0);
    return vdAesKey(h);
  },
  async makePin(raw, pin, vaultId) {
    const rec = { v: 1, vault: vaultId, salt: vdB64(vdRandom(16)), dev: vdB64(vdRandom(32)), iters: 310000, tries: 0 };
    rec.wrap = await vdSeal(await this.pinKey(pin, rec), raw, 'vdocs:pin:' + vaultId);
    return rec;
  },
  async openPin(rec, pin) {
    try { return await vdOpen(await this.pinKey(pin, rec), rec.wrap, 'vdocs:pin:' + rec.vault); } catch (e) { return null; }
  }
};
