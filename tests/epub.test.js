import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {buildEpub, plainTextHTML, xml, filename} from '../extension/epub.js';

test('plain text and metadata escape markup and invalid XML characters', () => {
  assert.equal(xml('<script>&"\u0000\ud800'), '&lt;script&gt;&amp;&quot;�');
  assert.equal(plainTextHTML('One & two\nNext\n\n<script>alert(1)</script>'), '<p>One &amp; two<br />Next</p>\n<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
  assert.equal(filename('a/b:c?d'), 'a-b-c-d.epub');
  assert.equal(filename('...'), 'X article.epub');
});

test('EPUB opens in independent ZIP reader; CRC, XML, metadata, navigation and images are consistent', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'epub-test-'));
  const png = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aK1sAAAAASUVORK5CYII=', 'base64'));
  const book = buildEpub({title: 'An article & café 📚', author: 'A < B', source: 'https://x.com/a/status/123?a=1&b=2', language: 'en-US', html: '<h2>Heading</h2><p>Hello <strong>world</strong>.</p><img src="images/test.png" alt="test" />', assets: [{path:'images/test.png', type:'image/png', bytes:png}]});
  try {
    const path = join(directory, 'book.epub');
    writeFileSync(path, Buffer.from(await book.arrayBuffer()));
    execFileSync('python3', ['-c', `
import sys, zipfile, xml.etree.ElementTree as ET
z=zipfile.ZipFile(sys.argv[1])
assert z.testzip() is None
assert z.infolist()[0].filename == 'mimetype'
assert z.infolist()[0].compress_type == 0
assert z.infolist()[0].extra == b''
assert z.read('mimetype') == b'application/epub+zip'
for name in z.namelist():
 if name.endswith(('.xml', '.opf', '.xhtml')): ET.fromstring(z.read(name))
ns={'o':'http://www.idpf.org/2007/opf','dc':'http://purl.org/dc/elements/1.1/','h':'http://www.w3.org/1999/xhtml'}
opf=ET.fromstring(z.read('EPUB/package.opf'))
assert opf.find('o:metadata/dc:title',ns).text == 'An article & café 📚'
assert opf.find('o:metadata/dc:creator',ns).text == 'A < B'
for item in opf.findall('o:manifest/o:item',ns): assert 'EPUB/'+item.attrib['href'] in z.namelist()
ids={item.attrib['id'] for item in opf.findall('o:manifest/o:item',ns)}
for item in opf.findall('o:spine/o:itemref',ns): assert item.attrib['idref'] in ids
page=ET.fromstring(z.read('EPUB/article.xhtml'))
for img in page.findall('.//h:img',ns): assert 'EPUB/'+img.attrib['src'] in z.namelist()
assert len(z.read('EPUB/images/test.png')) > 50
nav=ET.fromstring(z.read('EPUB/nav.xhtml'))
assert nav.find('.//h:nav/h:ol/h:li/h:a',ns).attrib['href'] == 'article.xhtml'
`, path]);
  } finally { rmSync(directory, {recursive: true, force: true}); }
});

test('empty books fail and unsafe source URLs are excluded', async () => {
  assert.throws(() => buildEpub({title:'', html:'<p>ok</p>'}), /title/);
  const book = buildEpub({title:'ok', html:'<p>ok</p>', source:'javascript:alert(1)', language:'en" bad'});
  const contents = Buffer.from(await book.arrayBuffer()).toString();
  assert.ok(!contents.includes('javascript:'));
  assert.ok(contents.includes('<dc:language>en</dc:language>'));
});
