/* vDocs: one document as its own .vdoc file, with a password just for it. Exactly the vDocs app's format,
 * so a .vdoc made here opens in the app and the other way round. Your vault's key is never in it. */

const VD_KDF = { alg: 'scrypt', logN: 17, r: 8, p: 1 };

async function vdSealShare(doc, password, hint) {
  const salt = vdRandom(16), key = await vdAesKey(await vdScrypt(password, salt, VD_KDF.logN));
  const box = await vdSeal(key, VD_ENC.encode(JSON.stringify(Object.assign({ from: 'vDocs' }, doc))), 'vdocs:share');
  return JSON.stringify({ app: 'vDocs', type: 'vdoc', v: 1, kdf: Object.assign({ salt: vdB64(salt) }, VD_KDF), hint: hint || undefined, box });
}
async function vdOpenShare(f, password) {
  try {
    if (!(f.kdf.logN >= 14 && f.kdf.logN <= 20)) return null;
    const key = await vdAesKey(await vdScrypt(password, vdUnB64(f.kdf.salt), f.kdf.logN));
    return JSON.parse(VD_DEC.decode(await vdOpen(key, f.box, 'vdocs:share')));
  } catch (e) { return null; }
}

class VDShareModal extends Modal {
  constructor(view, d) { super(view.app); this.v = view; this.d = d; }
  onOpen() {
    const v = this.v, d = this.d, c = this.contentEl; c.addClass('vdo-share');
    this.titleEl.setText(`Export “${v.titleOf(d)}” as a .vdoc`);
    c.createEl('p', { cls: 'vdo-small', text: 'Saves this one document as its own encrypted file, with a password just for it. Send it however you like, and tell them the password another way, not in the same message.' });
    const lr = c.createDiv({ cls: 'vdo-row vdo-row-l' }); lr.createSpan({ text: 'Password for this file' }); lr.createSpan({ cls: 'vdo-sp' });
    const gen = lr.createEl('button', { cls: 'vdo-link', text: 'Make one for me' });
    const p1 = c.createEl('input', { cls: 'vdo-input vdo-left', attr: { type: 'password', autocomplete: 'new-password', 'aria-label': 'Password' } });
    const p2 = c.createEl('input', { cls: 'vdo-input vdo-left', attr: { type: 'password', placeholder: 'Password again', autocomplete: 'new-password', 'aria-label': 'Password again' } });
    gen.onclick = () => { p1.value = p2.value = vdPassphrase(); p1.type = p2.type = 'text'; err.setText(''); };
    c.createDiv({ text: 'Hint (optional, not encrypted)', cls: 'vdo-label' });
    const hint = c.createEl('input', { cls: 'vdo-input vdo-left', attr: { placeholder: 'e.g. the café where we met', maxlength: '120', 'aria-label': 'Hint' } });
    c.createEl('p', { cls: 'vdo-small', text: 'Anyone who gets the file can read the hint, so keep it vague.' });
    const err = c.createDiv({ cls: 'vdo-err' });
    const row = c.createDiv({ cls: 'vdo-row' });
    row.createEl('button', { text: 'Cancel' }).onclick = () => this.close();
    const go = row.createEl('button', { text: 'Save .vdoc', cls: 'mod-cta' });
    go.onclick = async () => {
      err.setText('');
      const prob = vdPasswordProblem(p1.value); if (prob) { err.setText(prob); return; }
      if (p1.value !== p2.value) { err.setText('The two passwords are different.'); return; }
      go.disabled = true; go.setText('Encrypting…');
      try {
        if (v.dirty) await v.flush();
        const text = await vdSealShare({ title: v.titleOf(d), html: d.html, created: d.created, updated: d.updated }, p1.value, hint.value.trim());
        const path = await v.p.exportPath(v.titleOf(d));
        await v.app.vault.adapter.write(path, text);
        this.close();
        new Notice(`Saved ${path}. Remember to send the password separately.`, 8000);
      } catch (e) { err.setText('Could not save: ' + (e.message || e)); go.disabled = false; go.setText('Save .vdoc'); }
    };
    window.setTimeout(() => p1.focus(), 30);
  }
  onClose() { this.contentEl.empty(); }
}

// choose a .vdoc from this Obsidian vault, then its password
class VDVdocPicker extends FuzzySuggestModal {
  constructor(view) { super(view.app); this.v = view; this.setPlaceholder('Find a .vdoc file in your vault'); }
  getItems() { return this.app.vault.getFiles().filter(f => (f.extension || '').toLowerCase() === 'vdoc'); }
  getItemText(f) { return f.path; }
  async onChooseItem(f) { new VDOpenModal(this.v, await this.app.vault.adapter.read(f.path), f.path.split('/').pop()).open(); }
}
class VDOpenModal extends Modal {
  constructor(view, text, name) { super(view.app); this.v = view; this.text = text; this.name = name; }
  onOpen() {
    const c = this.contentEl, v = this.v;
    let f; try { f = JSON.parse(this.text); } catch (e) { f = null; }
    this.titleEl.setText(`Open “${this.name}”`);
    if (!f || f.type !== 'vdoc' || !f.box || !f.kdf) { c.createEl('p', { text: 'That isn’t a vDocs .vdoc file.' }); return; }
    c.createEl('p', { cls: 'vdo-small', text: 'This document was shared as an encrypted .vdoc. Type its password to open it.' });
    if (f.hint) c.createEl('p', { cls: 'vdo-hint', text: 'Hint: ' + f.hint });
    const i = c.createEl('input', { cls: 'vdo-input vdo-left', attr: { type: 'password', placeholder: 'Password', 'aria-label': 'Password' } });
    const err = c.createDiv({ cls: 'vdo-err' });
    const row = c.createDiv({ cls: 'vdo-row' });
    row.createEl('button', { text: 'Cancel' }).onclick = () => this.close();
    const go = row.createEl('button', { text: 'Open', cls: 'mod-cta' });
    const tryIt = async () => {
      if (!i.value) return;
      go.disabled = true; go.setText('Opening…'); err.setText('');
      const doc = await vdOpenShare(f, i.value);
      if (!doc) { err.setText('That password is not right.'); go.disabled = false; go.setText('Open'); i.select(); return; }
      this.close(); new VDPreviewModal(v, doc, this.name).open();
    };
    go.onclick = tryIt; i.addEventListener('keydown', e => { if (e.key === 'Enter') tryIt(); });
    window.setTimeout(() => i.focus(), 30);
  }
  onClose() { this.contentEl.empty(); }
}
class VDPreviewModal extends Modal {
  constructor(view, doc, name) { super(view.app); this.v = view; this.doc = doc; this.name = name; }
  onOpen() {
    const c = this.contentEl, v = this.v, doc = this.doc;
    this.modalEl.addClass('vdo-wide-modal');
    this.titleEl.setText(doc.title || this.name);
    c.createEl('p', { cls: 'vdo-small', text: `From ${this.name}` + (doc.updated ? ' · last changed ' + new Date(doc.updated).toLocaleString() : '') });
    const pg = c.createDiv({ cls: 'vdo-page vdo-preview' });
    pg.replaceChildren(...vdCleanEl(doc.html || '', false).childNodes);
    const row = c.createDiv({ cls: 'vdo-row' });
    row.createEl('button', { text: 'Close' }).onclick = () => this.close();
    if (!v.p.store.readOnly) row.createEl('button', { text: 'Add to my vault', cls: 'mod-cta' }).onclick = async () => {
      this.close();
      await v.newDoc(vdClean(doc.html || '', false), doc.title || this.name.replace(/\.vdoc$/i, ''));
      new Notice('Added to your vault and encrypted with your vault’s key. The .vdoc file is untouched.');
    };
  }
  onClose() { this.contentEl.empty(); }
}
