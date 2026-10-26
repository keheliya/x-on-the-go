import {plainTextHTML, xml, filename, bookCSS} from './epub.js';
import {articleDocument, imagePlaceholder, bodyHTML, prepareEpub} from './export.js';
const $ = id => document.getElementById(id);
let article = {html: '', images: [], language: 'en'};
let busy = false;

function render() {
  const hasContent = !!article.html;
  $('download').disabled = !hasContent || !$('title').value.trim() || busy;
  $('preview').hidden = !hasContent; $('empty').hidden = hasContent;
  if (!hasContent) return;
  const doc = articleDocument(article);
  for (const img of doc.querySelectorAll('img')) imagePlaceholder(doc, img);
  const words = doc.documentElement.textContent.trim().split(/\s+/).filter(Boolean).length;
  $('count').textContent = `${words.toLocaleString()} words · ${Math.max(1, Math.ceil(words / 220))} min`;
  $('preview').srcdoc = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><style>${bookCSS}body{margin:40px auto;padding:0 34px;max-width:720px;font-size:17px}h1{font-size:32px}a{color:#315b41;pointer-events:none}</style></head><body><h1>${xml($('title').value)}</h1><p class="byline">${xml($('author').value)}</p>${bodyHTML(doc)}</body></html>`;
}
function showError(error) { $('notice').textContent = error.message; }
async function download() {
  if (busy) return;
  busy = true; $('download').disabled = true;
  $('progress').textContent = 'Preparing your EPUB…';
  // Freeze this export's inputs while the user can continue reviewing the page.
  const metadata = {title: $('title').value.trim(), author: $('author').value.trim(), source: $('source').value.trim(), language: article.language};
  const includeImages = $('images').checked;
  const sourceImages = [...article.images];
  try {
    const {blob, skipped} = await prepareEpub({...article, ...metadata, images: sourceImages}, {
      includeImages, onProgress: message => { $('progress').textContent = message; }
    });
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
