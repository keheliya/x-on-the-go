import {buildEpub, plainTextHTML, xml, filename, bookCSS} from './epub.js';
const $ = id => document.getElementById(id);
let article = {html: '', images: [], language: 'en'};
let busy = false;

function documentForArticle() {
  // Extraction emits only allowlisted tags. Parse as XML so malformed fragments
  // cannot silently become broken XHTML inside the EPUB.
  const doc = new DOMParser().parseFromString(`<div xmlns="http://www.w3.org/1999/xhtml">${article.html}</div>`, 'application/xhtml+xml');
  if (doc.querySelector('parsererror')) throw new Error('The extracted formatting could not be read. Use the plain-text option below.');
  return doc;
}
function imagePlaceholder(doc, img, label = 'Image') {
  const p = doc.createElementNS('http://www.w3.org/1999/xhtml', 'p');
  p.textContent = `[${label}${img.getAttribute('alt') ? ': ' + img.getAttribute('alt') : ''}]`;
  img.replaceWith(p);
}
function bodyHTML(doc) { return [...doc.documentElement.childNodes].map(n => new XMLSerializer().serializeToString(n)).join(''); }
function render() {
  const hasContent = !!article.html;
  $('download').disabled = !hasContent || !$('title').value.trim() || busy;
  $('preview').hidden = !hasContent; $('empty').hidden = hasContent;
  if (!hasContent) return;
  const doc = documentForArticle();
  for (const img of doc.querySelectorAll('img')) imagePlaceholder(doc, img);
  const words = doc.documentElement.textContent.trim().split(/\s+/).filter(Boolean).length;
  $('count').textContent = `${words.toLocaleString()} words · ${Math.max(1, Math.ceil(words / 220))} min`;
  $('preview').srcdoc = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><style>${bookCSS}body{margin:40px auto;padding:0 34px;max-width:720px;font-size:17px}h1{font-size:32px}a{color:#315b41;pointer-events:none}</style></head><body><h1>${xml($('title').value)}</h1><p class="byline">${xml($('author').value)}</p>${bodyHTML(doc)}</body></html>`;
}
function showError(error) { $('notice').textContent = error.message; }
async function imageAsset(image, index) {
  const url = new URL(image.url);
  if (url.protocol !== 'https:' || url.hostname !== 'pbs.twimg.com' || url.port || url.username || url.password) throw new Error('unsupported image host');
  const response = await fetch(url, {credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error', signal: AbortSignal.timeout(12000)});
  if (!response.ok) throw new Error('image unavailable');
  const type = response.headers.get('content-type')?.split(';')[0];
  if (!['image/jpeg','image/png','image/gif','image/webp'].includes(type)) throw new Error('unsupported image format');
  // Bound the stream, not just Content-Length (which can be missing or wrong).
  const reader = response.body.getReader();
  const chunks = []; let size = 0;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 10 * 1024 * 1024) throw new Error('image exceeds 10 MB');
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  let blob = new Blob(chunks, {type}), finalType = type;
  // EPUB readers consistently support JPEG/PNG/GIF. Normalize WebP to JPEG.
  if (type === 'image/webp') {
    const bitmap = await createImageBitmap(blob);
    try {
      if (bitmap.width * bitmap.height > 32_000_000) throw new Error('image dimensions too large');
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width; canvas.height = bitmap.height;
      const context = canvas.getContext('2d');
      context.fillStyle = 'white'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(bitmap, 0, 0);
      blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .9));
      if (!blob) throw new Error('image conversion failed');
      finalType = 'image/jpeg';
    } finally { bitmap.close(); }
  }
  const ext = {'image/jpeg':'jpg','image/png':'png','image/gif':'gif'}[finalType];
  return {path: `images/image-${index}.${ext}`, type: finalType, bytes: new Uint8Array(await blob.arrayBuffer())};
}
async function download() {
  if (busy) return;
  busy = true; $('download').disabled = true;
  $('progress').textContent = 'Preparing your EPUB…';
  // Freeze this export's inputs while the user can continue reviewing the page.
  const metadata = {title: $('title').value.trim(), author: $('author').value.trim(), source: $('source').value.trim(), language: article.language};
  const includeImages = $('images').checked;
  const sourceImages = [...article.images];
  try {
    const doc = documentForArticle(), assets = [], cache = new Map();
    let skipped = 0, totalBytes = 0;
    const imageNodes = [...doc.querySelectorAll('img')];
    for (const [index, img] of imageNodes.entries()) {
      if (!includeImages) { img.remove(); continue; }
      $('progress').textContent = `Embedding image ${index + 1} of ${imageNodes.length}…`;
      try {
        const sourceImage = sourceImages[Number(img.getAttribute('data-image'))];
        if (!sourceImage) throw new Error('missing image');
        let asset = cache.get(sourceImage.url);
        if (!asset) {
          if (assets.length >= 100 || totalBytes >= 30 * 1024 * 1024) throw new Error('image budget exceeded');
          asset = await imageAsset(sourceImage, index);
          if (totalBytes + asset.bytes.length > 30 * 1024 * 1024) throw new Error('image budget exceeded');
          totalBytes += asset.bytes.length; assets.push(asset); cache.set(sourceImage.url, asset);
        }
        img.setAttribute('src', asset.path); img.removeAttribute('data-image');
      } catch { skipped++; imagePlaceholder(doc, img, 'Image unavailable'); }
    }
    const blob = buildEpub({...metadata, html: bodyHTML(doc), assets});
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = filename(metadata.title); document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    $('progress').textContent = `EPUB download started (${(blob.size / 1024).toFixed(0)} KB).${skipped ? `\n${skipped} image(s) could not be included; placeholders were added.` : ''}`;
  } catch (error) { $('progress').textContent = 'Export failed: ' + error.message; }
  finally { busy = false; render(); }
}
$('download').addEventListener('click', download);
for (const id of ['title','author']) $(id).addEventListener('input', () => { try { render(); } catch (error) { showError(error); } });
$('use-text').addEventListener('click', () => {
  if (!$('text').value.trim()) { showError(new Error('Paste some article text first.')); return; }
  article = {...article, html: plainTextHTML($('text').value), images: []};
  $('notice').textContent = 'Using the text you pasted. Check the preview before downloading.';
  render();
});
try {
  const id = new URLSearchParams(location.search).get('id');
  if (id && globalThis.chrome?.storage?.session) {
    const key = 'article:' + id;
    const data = (await chrome.storage.session.get(key))[key];
    if (!data) throw new Error('This preview has expired. Click the extension on the article again, or paste its text.');
    article = {...article, ...data};
    for (const field of ['title','author','source']) $(field).value = article[field] || '';
    $('notice').textContent = article.error || (article.warnings || []).join('\n\n');
    if (article.error) $('manual').open = true;
    render();
  }
} catch (error) { showError(error); $('manual').open = true; }
