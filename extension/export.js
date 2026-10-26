import {buildEpub} from './epub.js';
export function articleDocument(article) {
  // Extraction emits only allowlisted tags. Parse as XML so malformed fragments
  // cannot silently become broken XHTML inside the EPUB.
  const doc = new DOMParser().parseFromString(`<div xmlns="http://www.w3.org/1999/xhtml">${article.html}</div>`, 'application/xhtml+xml');
  if (doc.querySelector('parsererror')) throw new Error('The extracted formatting could not be read. Use the plain-text option below.');
  return doc;
}
export function imagePlaceholder(doc, img, label = 'Image') {
  const p = doc.createElementNS('http://www.w3.org/1999/xhtml', 'p');
  p.textContent = `[${label}${img.getAttribute('alt') ? ': ' + img.getAttribute('alt') : ''}]`;
  img.replaceWith(p);
}
export function bodyHTML(doc) { return [...doc.documentElement.childNodes].map(n => new XMLSerializer().serializeToString(n)).join(''); }
async function imageAsset(image, index, signal) {
  const url = new URL(image.url);
  if (url.protocol !== 'https:' || url.hostname !== 'pbs.twimg.com' || url.port || url.username || url.password) throw new Error('unsupported image host');
  const response = await fetch(url, {credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(12000)]) : AbortSignal.timeout(12000)});
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

export async function prepareEpub(article, {includeImages = true, onProgress = () => {}, signal} = {}) {
  signal?.throwIfAborted();
  const doc = articleDocument(article), assets = [], cache = new Map();
  let skipped = 0, totalBytes = 0;
  const nodes = [...doc.querySelectorAll('img')];
  for (const [index, img] of nodes.entries()) {
    signal?.throwIfAborted();
    if (!includeImages) { img.remove(); continue; }
    onProgress(`Embedding image ${index + 1} of ${nodes.length}…`);
    try {
      const source = article.images?.[Number(img.getAttribute('data-image'))];
      if (!source) throw new Error('Missing image');
      let asset = cache.get(source.url);
      if (!asset) {
        if (assets.length >= 100 || totalBytes >= 30 * 1024 * 1024) throw new Error('Image budget exceeded');
        asset = await imageAsset(source, index, signal);
        if (totalBytes + asset.bytes.length > 30 * 1024 * 1024) throw new Error('Image budget exceeded');
        totalBytes += asset.bytes.length; assets.push(asset); cache.set(source.url, asset);
      }
      img.setAttribute('src', asset.path); img.removeAttribute('data-image');
    } catch (error) {
      signal?.throwIfAborted();
      skipped++; imagePlaceholder(doc, img, 'Image unavailable');
    }
  }
  signal?.throwIfAborted();
  return {blob: buildEpub({...article, html: bodyHTML(doc), assets}), skipped};
}
