"""Build local, synthetic browser harnesses without a server or dependencies.

Usage: python3 tests/build-browser-harness.py /tmp/x-on-the-go-tests
Open browser.html for DOM checks, bookmarks.html for the mock Chrome UI,
or editor.html for the original manual-paste flow. Production sources are
inlined solely to allow module execution from file:// during sandboxed QA.
"""
import json
import re
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
out = Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/x-on-the-go-tests')
out.mkdir(parents=True, exist_ok=True)
imports = re.compile(r"^import .+? from ['\"](.+?)['\"];\s*$", re.M)


def bundle(path, seen):
    path = path.resolve()
    if path in seen:
        return ''
    seen.add(path)
    text = path.read_text()
    dependencies = ''.join(bundle(path.parent / match, seen) for match in imports.findall(text))
    return dependencies + '\n' + imports.sub('', text).replace('export ', '')


def inline_page(name, mock=''):
    page = (root / 'extension' / f'{name}.html').read_text()
    page = re.sub(r'<link rel="stylesheet" href="([^"]+)">', lambda m: '<style>' + (root / 'extension' / m[1]).read_text() + '</style>', page)
    code = mock + '\n' + bundle(root / 'extension' / f'{name}.js', set())
    code = code.replace('</script', '<\\/script')
    page = page.replace(f'<script type="module" src="{name}.js"></script>', '<script type="module">' + code + '</script>')
    (out / f'{name}.html').write_text(page)


inline_page('bookmarks', (root / 'tests/bookmarks-ui-mock.js').read_text())
inline_page('editor')
page = (root / 'tests/browser.html').read_text()
page = page.replace("import {scanBookmarkPage, inspectArticlePage} from '../extension/bookmarks-dom.js';", bundle(root / 'extension/bookmarks-dom.js', set()))
page = page.replace("await (await fetch('../extension/extract.js')).text()", json.dumps((root / 'extension/extract.js').read_text()).replace('</', '<\\/'))
(out / 'browser.html').write_text(page)
print(out)
