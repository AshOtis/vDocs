"""Build vDocs for Obsidian into dist/ (main.js, styles.css, manifest.json). No dependencies: python3 build.py"""
import pathlib, shutil
R = pathlib.Path(__file__).resolve().parent; src = R / 'src'; out = R / 'dist'; out.mkdir(exist_ok=True)
read = lambda f: (src / f).read_text(encoding='utf-8')
main = ("'use strict';\nconst { Plugin, ItemView, Modal, Notice, PluginSettingTab, Setting, setIcon, Menu, Platform } = require('obsidian');\n\n"
        + '\n'.join(read(f) for f in ['crypto.js', 'sqlite.js', 'sqlite-write.js', 'clean.js', 'store.js', 'main.js']) + '\nmodule.exports = VDocsPlugin;\n')
(out / 'main.js').write_text(main, encoding='utf-8')
shutil.copy(src / 'styles.css', out / 'styles.css')
shutil.copy(R / 'manifest.json', out / 'manifest.json')
print('dist/ ready: main.js, manifest.json, styles.css')
