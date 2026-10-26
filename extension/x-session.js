import {articleURL} from './bookmarks-model.js';
import {scanBookmarkPage, advanceBookmarks, inspectArticlePage, advanceArticle} from './bookmarks-dom.js';

export function pause(ms, signal) {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const done = () => { signal?.removeEventListener('abort', abort); resolve(); };
    const timer = setTimeout(done, ms);
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    signal?.addEventListener('abort', abort, {once: true});
  });
}

export class XSession {
  constructor(api = chrome) { this.api = api; this.bookmarkTab = null; this.account = ''; }
  async createTab(url) {
    const owner = await this.api.tabs.getCurrent();
    const tab = await this.api.tabs.create({url, active: false});
    try { await this.api.storage.session.set({['worktab:' + tab.id]: {owner: owner.id}}); }
    catch (error) { await this.api.tabs.remove(tab.id).catch(() => {}); throw error; }
    return tab.id;
  }
  async closeTab(id) {
    if (id == null) return;
    await this.api.tabs.remove(id).catch(() => {});
    await this.api.storage.session.remove('worktab:' + id);
  }
  async execute(tabId, func) {
    const results = await this.api.scripting.executeScript({target: {tabId}, func});
    if (!results[0]?.result) return null;
    return results[0].result;
  }
  async wait(tabId, inspect, signal, timeout = 45000) {
    const deadline = Date.now() + timeout;
    let lastError;
    while (Date.now() < deadline) {
      signal?.throwIfAborted();
      let tab;
      try { tab = await this.api.tabs.get(tabId); }
      catch { throw new Error('The X tab was closed. Click Load bookmarks to open it again.'); }
      if (tab.status === 'loading' || tab.pendingUrl || !tab.url || tab.url === 'about:blank') {
        await pause(700, signal);
        continue;
      }
      let result;
      try { result = await this.execute(tabId, inspect); }
      catch (error) { lastError = error; }
      if (result?.error) throw new Error(result.error);
      if (result?.ready) return result;
      await pause(700, signal);
    }
    throw new Error('X did not finish loading. Click Show X tab to check sign-in or loading, then retry Load bookmarks.' + (lastError ? ` Browser detail: ${lastError.message}` : ''));
  }
  async startBookmarks(signal) {
    // Keep a failed scan tab available for sign-in/debugging and reuse it on
    // retry. Never close the page the user is trying to inspect or sign in to.
    if (this.bookmarkTab != null) {
      try { await this.api.tabs.get(this.bookmarkTab); }
      catch { this.bookmarkTab = null; }
    }
    if (this.bookmarkTab == null) this.bookmarkTab = await this.createTab('https://x.com/i/bookmarks');
    else await this.api.tabs.update(this.bookmarkTab, {url: 'https://x.com/i/bookmarks'});
    this.account = '';
    const first = await this.wait(this.bookmarkTab, scanBookmarkPage, signal);
    this.account = first.account;
    return first;
  }
  async scanMore(onPage, signal, steps = 10) {
    if (!this.bookmarkTab) throw new Error('Load bookmarks first.');
    let quietBottom = 0;
    for (let i = 0; i < steps; i++) {
      signal?.throwIfAborted();
      const page = await this.execute(this.bookmarkTab, scanBookmarkPage);
      if (!page || page.error) throw new Error(page?.error || 'Could not read the bookmarks tab.');
      if (page.account !== this.account) throw new Error('The X account changed. Load bookmarks again to start a fresh list.');
      onPage(page);
      if (page.empty) return {empty: true};
      quietBottom = page.atBottom ? quietBottom + 1 : 0;
      // This is only a loading pause, not proof that all bookmarks were scanned.
      if (quietBottom >= 3) return {paused: true};
      await this.execute(this.bookmarkTab, advanceBookmarks);
      await pause(1200, signal);
    }
    // Collect the viewport reached by the final scroll as well.
    const last = await this.execute(this.bookmarkTab, scanBookmarkPage);
    if (last?.error || !last || last.account !== this.account) throw new Error(last?.error || 'The X account changed. Load bookmarks again.');
    onPage(last);
    return {paused: true};
  }
  async verifyAccount() {
    if (!this.bookmarkTab) throw new Error('Load bookmarks before downloading.');
    const page = await this.execute(this.bookmarkTab, scanBookmarkPage);
    if (!page || page.error || page.account !== this.account) throw new Error(page?.error || 'The X account changed. Load bookmarks again.');
  }
  async extract(item, signal) {
    const target = articleURL(item.articleUrl || item.url);
    if (!target) throw new Error('Invalid article URL.');
    await this.verifyAccount();
    const id = await this.createTab(target.url);
    const allowedURLs = new Set([target.url]);
    try {
      const deadline = Date.now() + 30000;
      let ready = false, followed = false;
      while (Date.now() < deadline) {
        signal?.throwIfAborted();
        let state;
        try { state = await this.execute(id, inspectArticlePage); } catch { /* Navigation may replace the document. */ }
        if (state?.error) throw new Error(state.error);
        if (state?.ready) { ready = true; break; }
        const expanded = articleURL(state?.openURL);
        if (expanded && !followed) { followed = true; allowedURLs.add(expanded.url); await this.api.tabs.update(id, {url: expanded.url}); }
        await pause(700, signal);
      }
      if (!ready) throw new Error('Could not open the full article. Open it on X and use single-article export.');
      let stable = 0, previousLength = -1, finished = false;
      for (let step = 0; step < 100; step++) {
        signal?.throwIfAborted();
        const state = await this.execute(id, advanceArticle);
        stable = state?.done && state.length === previousLength ? stable + 1 : 0;
        previousLength = state?.length;
        if (stable >= 2) { finished = true; break; }
        await pause(350, signal);
      }
      if (!finished) throw new Error('Could not reach a stable article ending. Use single-article export to review it.');
      // Check account again after navigation/loading, before handing out content.
      await this.verifyAccount();
      signal?.throwIfAborted();
      const tab = await this.api.tabs.get(id);
      if (!allowedURLs.has(articleURL(tab.url)?.url)) throw new Error('The article tab navigated elsewhere. Select the article to retry.');
      const results = await this.api.scripting.executeScript({target: {tabId: id}, files: ['extract.js']});
      const article = results[0]?.result;
      if (!article || article.error || !article.html) throw new Error(article?.error || 'No article body was found.');
      return {...article, title: article.title || item.title, author: article.author || item.author, source: item.url};
    } finally { await this.closeTab(id); }
  }
}

export async function saveDownload(blob, name, signal, api = chrome) {
  signal?.throwIfAborted();
  const url = URL.createObjectURL(blob);
  let id;
  try {
    id = await api.downloads.download({url, filename: name, saveAs: false, conflictAction: 'uniquify'});
    const deadline = Date.now() + 120000;
    while (Date.now() < deadline) {
      signal?.throwIfAborted();
      const [download] = await api.downloads.search({id});
      if (download?.state === 'complete') return;
      if (!download || download.state === 'interrupted') throw new Error('Download was cancelled or interrupted. Select this article to retry.');
      await pause(500, signal);
    }
    throw new Error('Download did not finish in time. Check Chrome Downloads before retrying.');
  } catch (error) {
    if (id != null) await api.downloads.cancel(id).catch(() => {});
    throw error;
  } finally { URL.revokeObjectURL(url); }
}
