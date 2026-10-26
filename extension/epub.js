const encoder = new TextEncoder();
export function xml(value) {
  return String(value ?? '').toWellFormed().replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&apos;'}[c]));
}
export function plainTextHTML(text) {
  return text.trim().split(/\n\s*\n/).map(p => `<p>${xml(p).replace(/\n/g, '<br />')}</p>`).join('\n');
}
export function filename(title) {
  return (title.replace(/[\u0000-\u001f<>:"/\\|?*]/g, '-').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '').slice(0, 120) || 'X article') + '.epub';
}
const crcTable = Array.from({length: 256}, (_, n) => {
  for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
// EPUB requires an uncompressed mimetype as the first ZIP entry. All files use
// STORE: dependency-free and particularly suitable for already-compressed images.
export function zip(files) {
  const local = [], central = [];
  let offset = 0, centralSize = 0;
  for (const [path, content] of files) {
    const name = encoder.encode(path), data = typeof content === 'string' ? encoder.encode(content) : content;
    const crc = crc32(data);
    const header = new Uint8Array(30 + name.length), h = new DataView(header.buffer);
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x800, true);
    h.setUint16(12, 33, true); h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true);
    h.setUint16(26, name.length, true); header.set(name, 30);
    const entry = new Uint8Array(46 + name.length), c = new DataView(entry.buffer);
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x800, true);
    c.setUint16(14, 33, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true);
    c.setUint16(28, name.length, true); c.setUint32(42, offset, true); entry.set(name, 46);
    local.push(header, data); central.push(entry); offset += header.length + data.length; centralSize += entry.length;
  }
  const end = new Uint8Array(22), e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
  e.setUint32(12, centralSize, true); e.setUint32(16, offset, true);
  return new Blob([...local, ...central, end], {type: 'application/epub+zip'});
}
export const bookCSS = 'body{font-family:serif;line-height:1.6;margin:5%;overflow-wrap:break-word}h1,h2,h3{line-height:1.2}img{max-width:100%;height:auto}blockquote{border-left:2px solid #888;padding-left:1em;margin-left:0}pre{white-space:pre-wrap}table{border-collapse:collapse}td,th{border:1px solid #888;padding:.4em}.byline,.source{font-family:sans-serif;font-size:.85em;color:#555}';
export function buildEpub({title, author, source, language = 'en', html, assets = [], id = crypto.randomUUID(), date = new Date()}) {
  if (!title.trim() || !html.trim()) throw new Error('Add a title and article text before downloading.');
  const lang = /^[a-z]{2,3}(-[a-z0-9]{2,8})*$/i.test(language) ? language : 'en';
  const sourceURL = /^https?:\/\//i.test(source || '') ? source : '';
  const page = body => `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${lang}" lang="${lang}"><head><title>${xml(title)}</title><link rel="stylesheet" type="text/css" href="style.css" /></head><body>${body}</body></html>`;
  const content = page(`<h1>${xml(title)}</h1>${author ? `<p class="byline">${xml(author)}</p>` : ''}${sourceURL ? `<p class="source"><a href="${xml(sourceURL)}">Original article</a></p>` : ''}${html}`);
  const modified = date.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const opf = `<?xml version="1.0" encoding="utf-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="book-id">urn:uuid:${xml(id)}</dc:identifier><dc:title>${xml(title)}</dc:title><dc:language>${lang}</dc:language>${author ? `<dc:creator>${xml(author)}</dc:creator>` : ''}${sourceURL ? `<dc:source>${xml(sourceURL)}</dc:source>` : ''}<meta property="dcterms:modified">${modified}</meta></metadata><manifest><item id="article" href="article.xhtml" media-type="application/xhtml+xml"/><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="style" href="style.css" media-type="text/css"/>${assets.map((a,i) => `<item id="image${i}" href="${xml(a.path)}" media-type="${xml(a.type)}"/>`).join('')}</manifest><spine><itemref idref="article"/></spine></package>`;
  return zip([
    ['mimetype', 'application/epub+zip'],
    ['META-INF/container.xml', '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="EPUB/package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'],
    ['EPUB/package.opf', opf], ['EPUB/article.xhtml', content],
    ['EPUB/nav.xhtml', page(`<nav epub:type="toc" id="toc"><h1>Contents</h1><ol><li><a href="article.xhtml">${xml(title)}</a></li></ol></nav>`)],
    ['EPUB/style.css', bookCSS], ...assets.map(a => ['EPUB/' + a.path, a.bytes])
  ]);
}
