/* vDocs for Obsidian: open your encrypted vDocs vault (Vault.vdocs) inside Obsidian.
 * Unlock once on each device with your vDocs password (or recovery key), choose a PIN, and from then on the
 * PIN opens it. Text documents only; it uses your Obsidian theme. Documents stay encrypted on disk. */

const VD_VIEW = 'vdocs-view';
const VD_SET = { vaultPath: '', idle: 5, device: '' };
const VD_LOCAL = 'vdocs-local';

class VDocsPlugin extends Plugin {
  async onload() {
    this.set = Object.assign({}, VD_SET, (await this.loadData()) || {});
    this.registerView(VD_VIEW, leaf => new VDocsView(leaf, this));
    this.addRibbonIcon('lock-keyhole', 'Open vDocs', () => this.open());
    this.addCommand({ id: 'open', name: 'Open vDocs', callback: () => this.open() });
    this.addCommand({ id: 'lock', name: 'Lock vDocs now', callback: () => this.lock() });
    this.addCommand({ id: 'new', name: 'New vDocs document', callback: async () => { await this.open(); const v = this.view(); if (v && this.key) v.newDoc(); } });
    this.addSettingTab(new VDocsSettings(this.app, this));
    // anything you do in Obsidian counts as being here; the idle lock starts counting when you stop
    const here = () => { this.lastActive = Date.now(); };
    this.registerDomEvent(document, 'keydown', here, true);
    this.registerDomEvent(document, 'pointerdown', here, true);
    this.registerInterval(window.setInterval(() => {
      if (this.key && this.set.idle > 0 && Date.now() - (this.lastActive || 0) > this.set.idle * 60000) this.lock();
    }, 15000));
    // the vDocs app (or a sync service) changed the vault: read it again
    this.registerEvent(this.app.vault.on('modify', f => { if (this.store && f && f.path === this.store.path) this.soonReload(); }));
  }
  onunload() { this.forget(); }
  save() { return this.saveData(this.set); }

  /* ---------- this device: its id, its name, and the PIN copy of the key (never synced) ---------- */
  local() { try { return JSON.parse(this.app.loadLocalStorage ? this.app.loadLocalStorage(VD_LOCAL) || '{}' : window.localStorage.getItem(VD_LOCAL + ':' + this.app.vault.getName()) || '{}'); } catch (e) { return {}; } }
  saveLocal(o) {
    const s = JSON.stringify(o);
    if (this.app.saveLocalStorage) this.app.saveLocalStorage(VD_LOCAL, s); else window.localStorage.setItem(VD_LOCAL + ':' + this.app.vault.getName(), s);
  }
  deviceId() { const o = this.local(); if (!o.device) { o.device = vdId().slice(1, 13); this.saveLocal(o); } return o.device; }
  deviceName() { return this.set.device || (Platform.isMobile ? 'Phone or tablet' : 'Obsidian') + ' (' + this.deviceId().slice(0, 4) + ')'; }
  pinRec() { const o = this.local(); return this.store && o.pins ? o.pins[this.store.header.id] || null : null; }
  savePinRec(rec) { const o = this.local(); o.pins = o.pins || {}; if (rec) o.pins[this.store.header.id] = rec; else delete o.pins[this.store.header.id]; this.saveLocal(o); }

  view() { const l = this.app.workspace.getLeavesOfType(VD_VIEW)[0]; return l && l.view instanceof VDocsView ? l.view : null; }
  async open() {
    let leaf = this.app.workspace.getLeavesOfType(VD_VIEW)[0];
    if (!leaf) { leaf = this.app.workspace.getLeaf('tab'); await leaf.setViewState({ type: VD_VIEW, active: true }); }
    this.app.workspace.revealLeaf(leaf);
  }

  // where the vault is: the one in settings, or the only .vdocs file in this Obsidian vault
  findVaults() { return this.app.vault.getFiles().filter(f => f.extension === 'vdocs').map(f => f.path).sort(); }
  vaultPath() {
    if (this.set.vaultPath && this.app.vault.getAbstractFileByPath(this.set.vaultPath)) return this.set.vaultPath;
    const all = this.findVaults();
    return all.length === 1 ? all[0] : null;
  }
  async openStore(path) {
    const st = new VDStore(this, path);
    await st.read();
    this.store = st;
    if (this.set.vaultPath !== path) { this.set.vaultPath = path; await this.save(); }
  }

  /* ---------- unlocking ---------- */
  async unlockedWith(raw) {
    this.key = await vdAesKey(raw);
    await this.loadDocs();
    this.lastActive = Date.now();
  }
  async loadDocs() {
    const docs = new Map(), bad = [];
    for (const [id, it] of this.store.merged('doc')) {
      try { const d = await vdOpenJson(this.key, it.data, 'vdocs:doc:' + id); if (d.id === id) docs.set(id, d); else bad.push(id); } catch (e) { bad.push(id); }
    }
    let folders = [];
    for (const [, it] of this.store.merged('folders')) { try { const o = await vdOpenJson(this.key, it.data, 'vdocs:folders'); folders = o.folders || []; } catch (e) { /* none */ } }
    this.docs = docs; this.folders = folders; this.bad = bad.length;
  }
  async lock() {
    const v = this.view();
    if (v && v.dirty) await v.flush();
    if (this.store) this.store.save().catch(() => { });
    this.forget();
    if (v) v.render();
  }
  forget() { this.key = null; this.docs = null; this.folders = null; }

  // the vault changed on disk (the vDocs app saved, or another device synced): read it again
  soonReload() {
    window.clearTimeout(this.reloadT);
    this.reloadT = window.setTimeout(async () => {
      if (this.store.saving || (await this.store.stat()) === this.store.seen) return;   // our own save
      try { await this.store.read(); } catch (e) { return; }
      if (!this.key) return;
      await this.loadDocs();
      const v = this.view(); if (v) v.fromDisk();
    }, 1200);
  }

  onStoreState() { const v = this.view(); if (v && this.key) v.paintFoot(); }
  async writeDoc(d) {
    await this.store.put({ id: d.id, kind: 'doc', updated: d.updated, data: await vdSealJson(this.key, d, 'vdocs:doc:' + d.id) });
  }
  async snapshot(d) {
    const id = vdId(), created = Date.now();
    const v = { id, doc: d.id, title: d.title || '', html: d.html || '', words: d.words || 0, created };
    await this.store.putVersion({ id, doc: d.id, created, named: false, data: await vdSealJson(this.key, v, 'vdocs:ver:' + id) });
  }
}

/* ---------- the view ---------- */
class VDocsView extends ItemView {
  constructor(leaf, plugin) { super(leaf); this.p = plugin; this.open_ = {}; this.q = ''; }
  getViewType() { return VD_VIEW; }
  getDisplayText() { return 'vDocs'; }
  getIcon() { return 'lock-keyhole'; }
  async onOpen() { this.render(); }
  async onClose() { if (this.dirty) await this.flush(); }

  async render() {
    const el = this.contentEl; el.empty(); el.addClass('vdo');
    this.page = null; this.cur = null;
    const p = this.p;
    if (!p.store) {
      const path = p.vaultPath();
      if (!path) return this.pickVault();
      try { await p.openStore(path); } catch (e) { return this.message('Couldn’t read ' + path, String(e.message || e), true); }
    }
    if (!p.key) return p.pinRec() ? this.pinScreen() : this.passwordScreen();
    this.main();
  }
  box(title) {
    const el = this.contentEl; el.empty();
    const b = el.createDiv({ cls: 'vdo-lock' }).createDiv({ cls: 'vdo-lockbox' });
    const ic = b.createDiv({ cls: 'vdo-lockic' }); setIcon(ic, 'lock-keyhole');
    b.createEl('h2', { text: title });
    return b;
  }
  message(title, text, pick) {
    const b = this.box(title); b.createEl('p', { text });
    if (pick) b.createEl('button', { text: 'Choose another vault', cls: 'mod-cta' }).onclick = () => { this.p.store = null; this.pickVault(); };
  }
  pickVault() {
    const p = this.p, all = p.findVaults();
    const b = this.box('Find your vDocs vault');
    if (!all.length) {
      b.createEl('p', { text: 'Put your Vault.vdocs file (and its Vault.vdocs-photos folder, if it has one) inside this Obsidian vault, or make your vault there from the vDocs app with Settings → Open another vault. Then come back here.' });
      b.createEl('button', { text: 'Look again', cls: 'mod-cta' }).onclick = () => this.render();
      return;
    }
    b.createEl('p', { text: all.length === 1 ? 'Found one vault:' : 'Which vault should open here?' });
    for (const path of all) b.createEl('button', { text: path, cls: 'vdo-wide' }).onclick = async () => { p.set.vaultPath = path; await p.save(); p.store = null; this.render(); };
  }

  passwordScreen(recovery) {
    const p = this.p;
    const b = this.box(recovery ? 'Use your recovery key' : 'Unlock your vault');
    b.createEl('p', { text: recovery ? 'The 26-letter key from your recovery sheet. Dashes and spaces don’t matter.' : 'Type your vDocs password once on this device. Then you’ll choose a PIN, and the PIN opens it from then on.' });
    const i = b.createEl('input', { cls: 'vdo-input', attr: { type: recovery ? 'text' : 'password', placeholder: recovery ? 'XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XX' : 'Your vDocs password', autocomplete: 'off', spellcheck: 'false' } });
    const err = b.createDiv({ cls: 'vdo-err' });
    const row = b.createDiv({ cls: 'vdo-row' });
    row.createEl('button', { cls: 'vdo-link', text: recovery ? 'Use my password instead' : 'Forgot it? Use your recovery key' }).onclick = () => this.passwordScreen(!recovery);
    const go = row.createEl('button', { text: 'Unlock', cls: 'mod-cta' });
    const tryIt = async () => {
      if (!i.value) return;
      go.disabled = true; go.setText('Unlocking…'); err.setText('');
      const raw = recovery ? await VDKeys.withRecovery(p.store.header, i.value) : await VDKeys.withPassword(p.store.header, i.value);
      if (!raw) { err.setText(recovery ? 'That isn’t the recovery key for this vault.' : 'That password isn’t right.'); go.disabled = false; go.setText('Unlock'); i.select(); return; }
      i.value = '';
      this.choosePin(raw);
    };
    go.onclick = tryIt; i.addEventListener('keydown', e => { if (e.key === 'Enter') tryIt(); });
    window.setTimeout(() => i.focus(), 30);
  }
  choosePin(raw) {
    const p = this.p;
    const b = this.box('Choose a PIN for this device');
    b.createEl('p', { text: '4 to 8 digits. It opens vDocs here from now on, and only works on this device: the key it unlocks is kept on this device and never syncs.' });
    const a = b.createEl('input', { cls: 'vdo-input vdo-pin', attr: { type: 'password', inputmode: 'numeric', placeholder: 'PIN', maxlength: '8' } });
    const c = b.createEl('input', { cls: 'vdo-input vdo-pin', attr: { type: 'password', inputmode: 'numeric', placeholder: 'PIN again', maxlength: '8' } });
    const err = b.createDiv({ cls: 'vdo-err' });
    const go = b.createDiv({ cls: 'vdo-row' }).createEl('button', { text: 'Save PIN', cls: 'mod-cta' });
    const save = async () => {
      if (!/^\d{4,8}$/.test(a.value)) { err.setText('Use 4 to 8 digits.'); return; }
      if (/^(\d)\1+$/.test(a.value) || '0123456789'.includes(a.value) || '9876543210'.includes(a.value)) { err.setText('That one’s too easy to guess. Try another.'); return; }
      if (a.value !== c.value) { err.setText('The two PINs are different.'); return; }
      go.disabled = true;
      p.savePinRec(await VDKeys.makePin(raw, a.value, p.store.header.id));
      await p.unlockedWith(raw); raw.fill(0);
      new Notice('vDocs: PIN saved for this device.');
      this.render();
    };
    go.onclick = save; c.addEventListener('keydown', e => { if (e.key === 'Enter') save(); });
    window.setTimeout(() => a.focus(), 30);
  }
  pinScreen() {
    const p = this.p, rec = p.pinRec();
    const b = this.box('vDocs is locked');
    const left = 5 - (rec.tries || 0);
    b.createEl('p', { text: left < 5 ? `Type your PIN. ${left} ${left === 1 ? 'try' : 'tries'} left before it asks for your password.` : 'Type your PIN.' });
    const i = b.createEl('input', { cls: 'vdo-input vdo-pin', attr: { type: 'password', inputmode: 'numeric', placeholder: 'PIN', maxlength: '8', autocomplete: 'off' } });
    const err = b.createDiv({ cls: 'vdo-err' });
    const row = b.createDiv({ cls: 'vdo-row' });
    row.createEl('button', { cls: 'vdo-link', text: 'Use my password' }).onclick = () => this.passwordScreen();
    const go = row.createEl('button', { text: 'Unlock', cls: 'mod-cta' });
    const tryIt = async () => {
      if (!i.value) return;
      go.disabled = true;
      const raw = await VDKeys.openPin(rec, i.value);
      if (!raw) {
        rec.tries = (rec.tries || 0) + 1;
        if (rec.tries >= 5) { p.savePinRec(null); new Notice('vDocs: too many wrong PINs, so this device has forgotten its key. Use your password.'); this.passwordScreen(); return; }
        p.savePinRec(rec); this.pinScreen(); return;
      }
      if (rec.tries) { rec.tries = 0; p.savePinRec(rec); }
      await p.unlockedWith(raw); raw.fill(0);
      this.render();
    };
    go.onclick = tryIt; i.addEventListener('keydown', e => { if (e.key === 'Enter') tryIt(); });
    window.setTimeout(() => i.focus(), 30);
  }

  /* ---------- the documents ---------- */
  titleOf(d) { return (d.title || '').trim() || d.autoTitle || 'Untitled document'; }
  folder(id) { return id ? (this.p.folders || []).find(f => f.id === id && !f.deleted) || null : null; }
  binned(d) { if (d.deleted) return true; let f = (this.p.folders || []).find(x => x.id === d.folder), n = 0; while (f && n++ < 64) { if (f.deleted) return true; f = (this.p.folders || []).find(x => x.id === f.parent); } return false; }
  visible() { return [...this.p.docs.values()].filter(d => !this.binned(d)).sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.updated - a.updated); }

  main() {
    const p = this.p, el = this.contentEl; el.empty();
    const wrap = el.createDiv({ cls: 'vdo-main' });
    const side = this.side = wrap.createDiv({ cls: 'vdo-side' });
    const top = side.createDiv({ cls: 'vdo-sidetop' });
    const q = top.createEl('input', { cls: 'vdo-search', attr: { type: 'search', placeholder: 'Search titles' } });
    q.value = this.q; q.oninput = () => { this.q = q.value.trim().toLowerCase(); this.paintList(); };
    const nb = top.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': 'New document' } }); setIcon(nb, 'file-plus'); nb.onclick = () => this.newDoc();
    const lb = top.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': 'Lock' } }); setIcon(lb, 'lock'); lb.onclick = () => p.lock();
    this.list = side.createDiv({ cls: 'vdo-list' });
    this.foot = side.createDiv({ cls: 'vdo-foot' });
    const doc = this.docEl = wrap.createDiv({ cls: 'vdo-doc' });
    this.paintList();
    const last = p.docs.get(this.lastId) || this.visible()[0];
    if (last) this.openDoc(last.id); else this.empty();
    if (p.bad) new Notice(`vDocs: ${p.bad} item${p.bad === 1 ? '' : 's'} couldn’t be opened and ${p.bad === 1 ? 'was' : 'were'} left alone.`);
    void doc;
  }
  empty() { this.docEl.empty(); this.docEl.createDiv({ cls: 'vdo-none', text: 'No documents yet. Make one with the + button.' }); }

  paintList() {
    const p = this.p, L = this.list; if (!L) return;
    L.empty();
    const docs = this.visible(), q = this.q;
    const row = (d, depth) => {
      const r = L.createDiv({ cls: 'vdo-item' + (this.cur && this.cur.id === d.id ? ' is-on' : '') });
      r.style.setProperty('--depth', String(depth));
      const ic = r.createSpan({ cls: 'vdo-ic' }); setIcon(ic, d.pinned ? 'pin' : 'file-text');
      r.createSpan({ cls: 'vdo-t', text: this.titleOf(d) });
      r.onclick = () => this.openDoc(d.id);
    };
    if (q) { docs.filter(d => this.titleOf(d).toLowerCase().includes(q)).forEach(d => row(d, 0)); }
    else {
      const fs = (p.folders || []).filter(f => !f.deleted && f.kind !== 'gallery');
      const kids = parent => fs.filter(f => (f.parent || null) === (parent || null)).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
      const walk = (parent, depth) => {
        for (const f of kids(parent)) {
          const open = this.open_[f.id] != null ? this.open_[f.id] : !!f.open;
          const r = L.createDiv({ cls: 'vdo-item vdo-folder' + (this.sel === f.id ? ' is-sel' : '') });
          r.style.setProperty('--depth', String(depth));
          const ic = r.createSpan({ cls: 'vdo-ic' }); setIcon(ic, open ? 'folder-open' : 'folder'); if (f.color) ic.style.color = f.color;
          r.createSpan({ cls: 'vdo-t', text: f.name });
          r.onclick = () => { this.open_[f.id] = !open; this.sel = f.id; this.paintList(); };
          if (open) { walk(f.id, depth + 1); docs.filter(d => d.folder === f.id).forEach(d => row(d, depth + 1)); }
        }
      };
      walk(null, 0);
      docs.filter(d => !this.folder(d.folder)).forEach(d => row(d, 0));
    }
    if (!docs.length) L.createDiv({ cls: 'vdo-small', text: 'Nothing here yet.' });
    const bin = [...p.docs.values()].filter(d => d.deleted && !this.binnedFolder(d));
    const F = this.foot; F.empty();
    const b = F.createEl('button', { cls: 'vdo-binlink', text: `Bin (${bin.length})` }); b.onclick = () => this.showBin();
    this.footState = F.createDiv({ cls: 'vdo-small' });
    this.paintFoot();
  }
  paintFoot() {
    const st = this.p.store, el = this.footState; if (!el || !st) return;
    const w = st.waiting();
    el.toggleClass('vdo-warn', !!(st.blocked || st.lastError || st.readOnly));
    if (st.readOnly) el.setText(st.readOnly);
    else if (st.blocked) el.setText(`The vDocs app has this vault open. Close it there and ${w ? (w === 1 ? 'your change saves' : 'your ' + w + ' changes save') : 'saving carries on'}.`);
    else if (st.lastError) el.setText('Not saved yet: ' + st.lastError + '. Trying again shortly.');
    else el.setText(w ? 'Saving…' : 'Saved in your vault');
  }
  binnedFolder(d) { let f = (this.p.folders || []).find(x => x.id === d.folder), n = 0; while (f && n++ < 64) { if (f.deleted) return true; f = (this.p.folders || []).find(x => x.id === f.parent); } return false; }

  openDoc(id) {
    if (this.dirty) this.flush();
    const d = this.p.docs.get(id); if (!d) return;
    this.cur = d; this.lastId = id; this.snapped = false;
    const el = this.docEl; el.empty();
    const bar = el.createDiv({ cls: 'vdo-bar' });
    const tool = (icon, label, fn) => { const b = bar.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': label } }); setIcon(b, icon); b.onmousedown = e => e.preventDefault(); b.onclick = () => { fn(); this.page.focus(); this.changed(); }; return b; };
    const cmd = (c, v) => document.execCommand(c, false, v);
    tool('heading-1', 'Heading 1', () => cmd('formatBlock', 'H1'));
    tool('heading-2', 'Heading 2', () => cmd('formatBlock', 'H2'));
    tool('pilcrow', 'Normal text', () => cmd('formatBlock', 'P'));
    tool('bold', 'Bold', () => cmd('bold'));
    tool('italic', 'Italic', () => cmd('italic'));
    tool('underline', 'Underline', () => cmd('underline'));
    tool('list', 'Bulleted list', () => cmd('insertUnorderedList'));
    tool('list-ordered', 'Numbered list', () => cmd('insertOrderedList'));
    tool('list-checks', 'Checklist', () => this.checklist());
    tool('quote', 'Quote', () => cmd('formatBlock', 'BLOCKQUOTE'));
    bar.createSpan({ cls: 'vdo-sp' });
    this.status = bar.createSpan({ cls: 'vdo-small' });
    const more = bar.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': 'More' } }); setIcon(more, 'more-vertical');
    more.onclick = e => {
      const m = new Menu();
      m.addItem(i => i.setTitle(d.pinned ? 'Unpin' : 'Pin to the top').setIcon('pin').onClick(() => { d.pinned = !d.pinned || undefined; this.save(d); }));
      m.addItem(i => i.setTitle('Move to Bin').setIcon('trash-2').onClick(() => this.binDoc(d)));
      m.showAtMouseEvent(e);
    };
    const paper = el.createDiv({ cls: 'vdo-paper' });
    const title = this.titleEl = paper.createEl('input', { cls: 'vdo-title', attr: { placeholder: 'Untitled document' } });
    title.value = d.title || '';
    title.oninput = () => { d.title = title.value; this.changed(); };
    title.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); this.page.focus(); } });
    const page = this.page = paper.createDiv({ cls: 'vdo-page', attr: { contenteditable: this.p.store.readOnly ? 'false' : 'true', spellcheck: 'true' } });
    if (this.p.store.readOnly) title.readOnly = true;
    this.setHtml(d.html);
    page.addEventListener('input', () => this.changed());
    page.addEventListener('paste', e => {
      const dt = e.clipboardData; if (!dt) return;
      e.preventDefault();
      const html = dt.getData('text/html');
      if (html && !e.shiftKey) cmd('insertHTML', vdClean(html, true)); else cmd('insertText', dt.getData('text/plain'));
      this.changed();
    });
    page.addEventListener('drop', e => e.preventDefault());
    page.addEventListener('mousedown', e => {       // ticking a checklist item: click its box
      const li = e.target.closest && e.target.closest('ul.vd-check > li');
      if (li && e.clientX - li.getBoundingClientRect().left < 4) { e.preventDefault(); if (li.getAttribute('data-done') === '1') li.removeAttribute('data-done'); else li.setAttribute('data-done', '1'); this.changed(); }
    });
    this.paintStatus('');
    this.paintList();
  }
  setHtml(html) { const c = vdCleanEl(html || '', false); this.page.replaceChildren(...c.childNodes); if (!this.page.firstChild) { const pp = this.page.createEl('p'); pp.createEl('br'); } }
  getHtml() { return vdClean(this.page.innerHTML, false); }
  checklist() {
    const s = window.getSelection(); if (!s.rangeCount) return;
    let n = s.anchorNode; while (n && n !== this.page && !(n.nodeType === 1 && /^(UL|OL)$/.test(n.tagName))) n = n.parentNode;
    if (n && n !== this.page && n.tagName === 'UL') { n.classList.toggle('vd-check'); return; }
    document.execCommand('insertUnorderedList');
    n = s.anchorNode; while (n && n !== this.page && !(n.nodeType === 1 && n.tagName === 'UL')) n = n.parentNode;
    if (n && n !== this.page) n.classList.add('vd-check');
  }
  paintStatus(state) {
    if (!this.status || !this.page) return;
    const w = vdWords(this.page.innerText || '');
    this.status.setText(`${w.toLocaleString()} word${w === 1 ? '' : 's'}${state ? ' · ' + state : ''}`);
  }

  changed() {
    const d = this.cur; if (!d) return;
    // keep the version you started from, once each time you open a document and change it
    if (!this.snapped) { this.snapped = true; const before = Object.assign({}, d); if (before.html && before.html !== '<p><br></p>') this.p.snapshot(before).catch(() => { }); }
    this.dirty = true; this.paintStatus('Editing…');
    window.clearTimeout(this.saveT); this.saveT = window.setTimeout(() => this.flush(), 800);
  }
  async flush() {
    window.clearTimeout(this.saveT);
    const d = this.cur; if (!d || !this.dirty || !this.page) return;
    this.dirty = false;
    d.html = this.getHtml(); d.words = vdWords(this.page.innerText || ''); d.updated = Date.now();
    if (!(d.title || '').trim()) d.autoTitle = ((this.page.innerText || '').split('\n').find(l => l.trim()) || '').trim().slice(0, 80);
    await this.save(d, true);
  }
  async save(d, quiet) {
    if (!quiet) d.updated = Date.now();
    try { await this.p.writeDoc(d); this.paintStatus('Saved'); } catch (e) { this.dirty = true; this.paintStatus('Not saved!'); new Notice('vDocs: could not save. ' + (e.message || e)); }
    this.paintList();
  }
  async newDoc() {
    if (this.dirty) await this.flush();
    const now = Date.now(), id = vdId();
    const d = { id, title: '', html: '<p><br></p>', created: now, updated: now, words: 0 };
    const f = this.folder(this.sel); if (f) d.folder = f.id;
    this.p.docs.set(id, d);
    await this.p.writeDoc(d);
    this.openDoc(id);
    window.setTimeout(() => this.titleEl && this.titleEl.focus(), 30);
  }
  async binDoc(d) {
    if (this.dirty) await this.flush();
    d.deleted = Date.now(); await this.save(d);
    const next = this.visible()[0];
    if (next) this.openDoc(next.id); else { this.cur = null; this.empty(); this.paintList(); }
    new Notice(`Moved “${this.titleOf(d)}” to the Bin. Restore it from the Bin at the bottom of the list.`);
  }
  showBin() {
    const v = this, m = new Modal(this.app);
    m.titleEl.setText('Bin');
    const paint = () => {
      const c = m.contentEl; c.empty();
      c.createEl('p', { cls: 'vdo-small', text: 'Documents here are still encrypted in your vault. Restore puts them back. To delete for good, empty the Bin in the vDocs app.' });
      const list = [...v.p.docs.values()].filter(d => d.deleted && !v.binnedFolder(d)).sort((a, b) => b.deleted - a.deleted);
      if (!list.length) c.createEl('p', { text: 'The Bin is empty.' });
      for (const d of list) {
        const r = c.createDiv({ cls: 'vdo-binrow' });
        r.createSpan({ text: v.titleOf(d) }); r.createSpan({ cls: 'vdo-small', text: ' · ' + new Date(d.deleted).toLocaleDateString() });
        r.createSpan({ cls: 'vdo-sp' });
        r.createEl('button', { text: 'Restore' }).onclick = async () => { delete d.deleted; await v.save(d); paint(); };
      }
    };
    paint(); m.open();
  }
  // the vault changed on disk: keep what you're typing, refresh the rest
  fromDisk() {
    const id = this.cur && this.cur.id;
    if (this.dirty && this.cur) { this.p.docs.set(this.cur.id, this.cur); this.paintList(); return; }
    const d = id && this.p.docs.get(id);
    if (d && this.page && document.activeElement !== this.page && document.activeElement !== this.titleEl) { this.openDoc(id); return; }
    if (d) this.cur = d;
    this.paintList();
  }
}

/* ---------- settings ---------- */
class VDocsSettings extends PluginSettingTab {
  constructor(app, plugin) { super(app, plugin); this.p = plugin; }
  display() {
    const el = this.containerEl, p = this.p, s = p.set; el.empty();
    const all = p.findVaults();
    new Setting(el).setName('Vault file').setDesc(all.length ? 'Your Vault.vdocs file inside this Obsidian vault.' : 'No .vdocs file found in this Obsidian vault yet.')
      .addDropdown(d => { d.addOption('', all.length === 1 ? 'Find it for me' : 'Choose…'); for (const a of all) d.addOption(a, a); d.setValue(all.includes(s.vaultPath) ? s.vaultPath : '').onChange(async v => { s.vaultPath = v; await p.save(); p.forget(); p.store = null; const vw = p.view(); if (vw) vw.render(); }); });
    new Setting(el).setName('Lock after').setDesc('Locks itself when you’ve been away from Obsidian this long. Your PIN opens it again.')
      .addDropdown(d => d.addOptions({ 1: '1 minute', 5: '5 minutes', 15: '15 minutes', 30: '30 minutes', 60: '1 hour', 0: 'Never' }).setValue(String(s.idle)).onChange(async v => { s.idle = Number(v); await p.save(); }));
    new Setting(el).setName('This device’s name').setDesc('Shown in the vDocs app when it takes in changes from here.')
      .addText(t => t.setPlaceholder(p.deviceName()).setValue(s.device).onChange(async v => { s.device = v.trim().slice(0, 40); await p.save(); }));
    new Setting(el).setName('Forget the PIN on this device').setDesc('Next time it asks for your vDocs password, and you choose a new PIN.')
      .addButton(b => b.setButtonText('Forget').onClick(() => { if (p.store) p.savePinRec(null); p.lock(); new Notice('vDocs: this device has forgotten its PIN.'); }));
  }
}
