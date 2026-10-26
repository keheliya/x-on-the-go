import {mergeBookmarks, runBatch, MAX_BATCH} from './bookmarks-model.js';
import {XSession, saveDownload} from './x-session.js';
import {prepareEpub} from './export.js';
import {filename} from './epub.js';

const $ = id => document.getElementById(id);
const session = new XSession();
let articles = [], selected = new Set(), states = new Map(), controller = null;
const rows = new Map();
function say(message) { $('progress').textContent = message; }
function controls() {
  const busy = !!controller;
  $('load').disabled = busy; $('more').disabled = busy || !session.bookmarkTab;
  $('show-x').disabled = !session.bookmarkTab;
  $('stop').hidden = !busy; $('images').disabled = busy;
  $('download').disabled = busy || !selected.size || selected.size > MAX_BATCH;
  $('select-all').disabled = busy || !articles.length;
  $('select-all').checked = !!articles.length && selected.size === articles.length;
  $('select-all').indeterminate = selected.size > 0 && selected.size < articles.length;
  $('selected').textContent = `${selected.size} selected${selected.size > MAX_BATCH ? ` — choose up to ${MAX_BATCH}` : ''}`;
  for (const [id, row] of rows) { row.checkbox.disabled = busy; row.checkbox.checked = selected.has(id); }
}
function render() {
  $('empty').hidden = !!articles.length;
  for (const item of articles) {
    if (rows.has(item.id)) {
      rows.get(item.id).label.textContent = item.title;
      rows.get(item.id).author.textContent = item.author;
      continue;
    }
    const li = document.createElement('li'); li.className = 'article-row';
    const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.id = 'article-' + item.id;
    checkbox.addEventListener('change', () => { checkbox.checked ? selected.add(item.id) : selected.delete(item.id); controls(); });
    const content = document.createElement('div'), label = document.createElement('label');
    label.htmlFor = checkbox.id; label.textContent = item.title;
    const meta = document.createElement('div'); meta.className = 'article-meta';
    const author = document.createElement('span'); author.textContent = item.author;
    const link = document.createElement('a'); link.href = item.url; link.target = '_blank'; link.rel = 'noreferrer'; link.textContent = 'Open on X ↗';
    meta.append(author, link);
    const status = document.createElement('p'); status.className = 'article-state'; status.textContent = 'Ready';
    content.append(label, meta, status); li.append(checkbox, content); $('articles').append(li);
    rows.set(item.id, {checkbox, status, label, author});
  }
  controls();
}
function update(id, state) {
  states.set(id, state);
  const row = rows.get(id);
  if (row) { row.status.textContent = state.message; row.status.dataset.state = state.state; }
  if (state.state === 'done') selected.delete(id);
  controls();
}
async function scan(fresh) {
  if (controller) return;
  // Request from the click handler, before other asynchronous work.
  const permission = chrome.permissions.request({origins: ['https://x.com/*']});
  controller = new AbortController(); controls();
  const signal = controller.signal;
  try {
    if (!await permission) throw new Error('X access was not granted. You can still use single-article export.');
    signal.throwIfAborted();
    if (fresh) {
      articles = []; selected.clear(); states.clear(); rows.clear(); $('articles').replaceChildren(); render();
      $('account').textContent = 'Waiting for your X Bookmarks page…';
      say('Opening your X Bookmarks page…');
      await session.startBookmarks(signal);
    }
    $('account').textContent = session.account ? `Bookmarks for ${session.account}` : 'Using the account signed in to the X scan tab';
    const before = articles.length;
    const result = await session.scanMore(page => {
      articles = mergeBookmarks(articles, page.items);
      say(`Found ${articles.length} article bookmark(s). Scanning…`); render();
    }, signal);
    say(result.empty ? 'X shows no bookmarks for this account.' : `${articles.length} article bookmark(s) listed; ${articles.length - before} added in this scan. Use Load more to scan older bookmarks. This is not a complete-account count.`);
    if (!articles.length) $('empty').querySelector('p').textContent = 'No article cards found in the scanned pages. Try Load more, or open the X tab to check that bookmarks loaded.';
  } catch (error) {
    $('account').textContent = session.account ? `Bookmarks for ${session.account}` : 'Account not identified yet';
    say(signal.aborted ? 'Scan stopped. Articles already found are ready to select.' :
      `${error.message}${session.bookmarkTab != null ? '\nThe X tab is still open. Click Show X tab to check it, then retry Load bookmarks.' : ''}`);
  } finally { controller = null; controls(); }
}
async function download() {
  if (controller || !selected.size || selected.size > MAX_BATCH) return;
  const permission = chrome.permissions.request({permissions: ['downloads'], origins: ['https://x.com/*']});
  const includeImages = $('images').checked;
  const items = articles.filter(item => selected.has(item.id));
  controller = new AbortController(); controls();
  const signal = controller.signal;
  try {
    if (!await permission) throw new Error('Download permission was not granted. No files were downloaded.');
    signal.throwIfAborted();
    await session.verifyAccount();
    say(`Downloading ${items.length} article(s). Keep this tab open. Temporary X tabs will open and close as articles load.`);
    const results = await runBatch(items, async item => {
      const article = await session.extract(item, signal);
      update(item.id, {state: 'working', message: 'Creating EPUB…'});
      const {blob, skipped} = await prepareEpub(article, {includeImages, signal, onProgress: message => update(item.id, {state: 'working', message})});
      update(item.id, {state: 'working', message: 'Saving EPUB…'});
      await saveDownload(blob, `x-on-the-go/${filename(article.title).replace(/\.epub$/, '')}-${item.id}.epub`, signal);
      return {message: skipped ? `Downloaded · ${skipped} image(s) unavailable` : 'Downloaded'};
    }, update, signal);
    const done = results.filter(r => r.state === 'done').length, failed = results.filter(r => r.state === 'failed').length;
    say(`${signal.aborted ? 'Batch stopped. ' : ''}${done} downloaded, ${failed} failed${items.length - results.length ? `, ${items.length - results.length} unfinished` : ''}. Failed or unfinished articles remain selected for retry.`);
  } catch (error) { say(signal.aborted ? 'Batch stopped.' : error.message); }
  finally { controller = null; controls(); }
}
$('load').addEventListener('click', () => scan(true));
$('more').addEventListener('click', () => scan(false));
$('download').addEventListener('click', download);
$('stop').addEventListener('click', () => { controller?.abort(new DOMException('Stopped', 'AbortError')); say('Stopping…'); });
$('select-all').addEventListener('change', () => { selected = $('select-all').checked ? new Set(articles.map(a => a.id)) : new Set(); controls(); });
$('show-x').addEventListener('click', async () => {
  try { await chrome.tabs.update(session.bookmarkTab, {active: true}); }
  catch { say('The X tab was closed. Load bookmarks again.'); }
});
controls();
