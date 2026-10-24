/* vDocs: the same clean-up the vDocs app uses, so documents look the same in both and nothing unsafe gets in:
 * a short list of tags and styles is kept, everything else goes (scripts, outside images, odd attributes). */

const VD_KEEP = new Set(['P', 'BR', 'H1', 'H2', 'H3', 'BLOCKQUOTE', 'PRE', 'CODE', 'B', 'I', 'U', 'S', 'MARK', 'SPAN', 'A', 'UL', 'OL', 'LI', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TD', 'TH', 'IMG', 'HR', 'SUB', 'SUP']);
const VD_RENAME = { STRONG: 'B', EM: 'I', STRIKE: 'S', DEL: 'S', INS: 'U', DIV: 'P', H4: 'H3', H5: 'H3', H6: 'H3', FONT: 'SPAN', TFOOT: 'TBODY', ARTICLE: 'P', SECTION: 'P', HEADER: 'P', FOOTER: 'P', ADDRESS: 'P', FIGURE: 'P', FIGCAPTION: 'P', DT: 'P', DD: 'P', KBD: 'CODE', SAMP: 'CODE', TT: 'CODE' };
const VD_DROP = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'MATH', 'HEAD', 'META', 'LINK', 'TITLE', 'TEMPLATE', 'NOSCRIPT', 'FORM', 'INPUT', 'BUTTON', 'SELECT', 'TEXTAREA', 'VIDEO', 'AUDIO', 'CANVAS', 'BASE', 'FRAME', 'FRAMESET', 'APPLET', 'COLGROUP', 'COL']);
const VD_BLOCK = new Set(['P', 'H1', 'H2', 'H3', 'BLOCKQUOTE', 'PRE', 'UL', 'OL', 'TABLE', 'HR']);
const vdColour = v => { v = (v || '').trim().toLowerCase(); return /^(#[0-9a-f]{3,8}|rgba?\(\s*[\d.]+%?\s*,\s*[\d.]+%?\s*,\s*[\d.]+%?\s*(,\s*[\d.]+\s*)?\)|[a-z]{3,20})$/.test(v) && !/^(transparent|inherit|initial|unset|currentcolor|windowtext|black|rgb\(0,\s*0,\s*0\))$/.test(v) ? v : null; };

// html: a string; paste: true for outside content (squash its whitespace, drop page colours)
function vdCleanEl(html, paste) {
  const src = new DOMParser().parseFromString('<body>' + html + '</body>', 'text/html').body;
  const out = document.createElement('div');
  const walk = (from, to, inPre) => {
    for (const n of [...from.childNodes]) {
      if (n.nodeType === 3) {
        let t = n.nodeValue;
        if (!t.trim() && /^(UL|OL|TABLE|THEAD|TBODY|TR)$/.test(to.tagName || '')) continue;   // gaps between list items and cells
        if (paste && !inPre) t = t.replace(/[\s ]+/g, ' ');
        if (t) to.appendChild(document.createTextNode(t));
        continue;
      }
      if (n.nodeType !== 1) continue;
      let tag = n.tagName.toUpperCase();
      if (VD_DROP.has(tag)) continue;
      const st = n.getAttribute('style') || '';
      // Google Docs and Word paste: their bold/italic/underline arrive as styled spans
      if (tag === 'B' && /font-weight\s*:\s*(normal|400)/i.test(st)) tag = 'SPAN';
      tag = VD_RENAME[tag] || tag;
      if (!VD_KEEP.has(tag)) { walk(n, to, inPre); continue; }   // unknown tags: keep what's inside
      let el = document.createElement(tag);
      // attributes, from a short list
      const css = [];
      const align = /text-align\s*:\s*(left|center|right|justify)/i.exec(st);
      if (align && VD_BLOCK.has(tag) || align && (tag === 'LI' || tag === 'TD' || tag === 'TH')) css.push('text-align:' + align[1].toLowerCase());
      if (!paste || tag === 'SPAN' || tag === 'MARK') {
        const c = /(?:^|;)\s*color\s*:\s*([^;]+)/i.exec(st), bg = /background(?:-color)?\s*:\s*([^;]+)/i.exec(st);
        const cv = c && vdColour(c[1]), bv = bg && vdColour(bg[1]);
        if (cv && !(paste && /^(#000|#000000|rgb\(0, 0, 0\))$/.test(cv))) css.push('color:' + cv);
        if (bv && !/^(#fff|#ffffff|white|rgb\(255, 255, 255\))$/.test(bv)) css.push('background-color:' + bv);
      }
      if (tag === 'P' || tag === 'BLOCKQUOTE') { const ml = /margin-left\s*:\s*(\d+)px/i.exec(st) || /padding-left\s*:\s*(\d+)px/i.exec(st); if (ml && !paste) css.push('margin-left:' + Math.min(400, +ml[1]) + 'px'); }
      if (tag === 'FONT' || n.tagName === 'FONT') { const fc = vdColour(n.getAttribute('color')); if (fc) css.push('color:' + fc); }
      if (tag === 'IMG') {
        if (paste) continue;   // pictures stay in the vDocs app; Obsidian keeps the ones already there
        const s = n.getAttribute('src') || '';
        if (!/^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(s)) continue;   // outside images never load
        el.setAttribute('src', s.replace(/\s+/g, '')); el.setAttribute('alt', (n.getAttribute('alt') || '').slice(0, 200));
        const w = /width\s*:\s*(\d{1,3})%/.exec(st); if (w) css.push('width:' + Math.min(100, +w[1]) + '%');
      }
      if (tag === 'A') { const h = n.getAttribute('href') || ''; if (/^(https?:|mailto:)/i.test(h.trim())) el.setAttribute('href', h.trim()); else { walk(n, to, inPre); continue; } }
      if (tag === 'UL' && n.classList && n.classList.contains('vd-check')) el.className = 'vd-check';
      if (tag === 'LI' && (n.getAttribute('data-done') === '1' || (n.classList && n.classList.contains('is-done')))) el.setAttribute('data-done', '1');
      if (tag === 'TD' || tag === 'TH') for (const a of ['colspan', 'rowspan']) { const v = parseInt(n.getAttribute(a), 10); if (v > 1 && v < 50) el.setAttribute(a, String(v)); }
      if (css.length) el.setAttribute('style', css.join(';'));
      // the remaining styles from pasted spans: weight, slant, underline become real tags
      if (tag === 'SPAN' && paste) {
        let inner = el;
        const wrap = t => { const w = document.createElement(t); inner.appendChild(w); inner = w; };
        if (/font-weight\s*:\s*(bold|[6-9]00)/i.test(st)) wrap('B');
        if (/font-style\s*:\s*italic/i.test(st)) wrap('I');
        if (/text-decoration[^;]*underline/i.test(st)) wrap('U');
        if (/text-decoration[^;]*line-through/i.test(st)) wrap('S');
        to.appendChild(el); walk(n, inner, inPre);
        if (!el.attributes.length && el.firstChild) { while (el.firstChild) to.insertBefore(el.firstChild, el); el.remove(); }
        continue;
      }
      to.appendChild(el);
      walk(n, el, inPre || tag === 'PRE');
      if (tag === 'SPAN' && !el.attributes.length) { while (el.firstChild) to.insertBefore(el.firstChild, el); el.remove(); }
    }
  };
  walk(src, out, false);
  // loose text and inline bits at the top level go into paragraphs
  const fixed = document.createElement('div');
  let p = null;
  for (const n of [...out.childNodes]) {
    const block = n.nodeType === 1 && (VD_BLOCK.has(n.tagName) || n.tagName === 'LI');
    if (block) { p = null; if (n.tagName === 'LI') { const ul = document.createElement('ul'); ul.appendChild(n); fixed.appendChild(ul); } else fixed.appendChild(n); }
    else { if (n.nodeType === 3 && !n.nodeValue.trim() && !p) continue; if (!p) { p = document.createElement('p'); fixed.appendChild(p); } p.appendChild(n); }
  }
  for (const e of fixed.querySelectorAll('p, h1, h2, h3, li, td, th, blockquote')) if (!e.textContent && !e.querySelector('img, br')) e.appendChild(document.createElement('br'));
  return fixed;
}
function vdClean(html, paste) { return vdCleanEl(html, paste).innerHTML; }


function vdWords(text) { const m = (text || '').match(/[\p{L}\p{N}][\p{L}\p{N}'’\-]*/gu); return m ? m.length : 0; }
