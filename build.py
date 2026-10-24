"""Build vDocs for Obsidian into dist/ (main.js, styles.css, manifest.json). No dependencies: python3 build.py"""
import pathlib, shutil, base64
R = pathlib.Path(__file__).resolve().parent; src = R / 'src'; out = R / 'dist'; out.mkdir(exist_ok=True)
read = lambda f: (src / f).read_text(encoding='utf-8')
main = ("'use strict';\nconst { Plugin, ItemView, Modal, Notice, PluginSettingTab, Setting, setIcon, Menu, Platform, FuzzySuggestModal } = require('obsidian');\n\n"
        + '\n'.join(read(f) for f in ['crypto.js', 'passwords.js', 'sqlite.js', 'sqlite-write.js', 'clean.js', 'store.js', 'main.js', 'share.js']) + '\nmodule.exports = VDocsPlugin;\n')
(out / 'main.js').write_text(main, encoding='utf-8')
css = (src / 'styles.css').read_text(encoding='utf-8')
for key, f in (('VD_DUSK', 'bg-dusk.jpg'), ('VD_NORTH', 'bg-north.jpg')):   # the built-in pictures, inside styles.css so the plugin stays 3 files
    css = css.replace(key, 'data:image/jpeg;base64,' + base64.b64encode((src / f).read_bytes()).decode())
(out / 'styles.css').write_text(css, encoding='utf-8')
shutil.copy(R / 'manifest.json', out / 'manifest.json')
print('dist/ ready: main.js, manifest.json, styles.css')
