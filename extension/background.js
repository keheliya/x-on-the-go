chrome.action.onClicked.addListener(async (tab) => {
  if (/^https:\/\/x\.com\/i\/(?:bookmarks|history)\/?(?:[?#].*)?$/.test(tab.url || '')) {
    await chrome.tabs.create({url: chrome.runtime.getURL('bookmarks.html')});
    return;
  }
  let article;
  try {
    if (!/^https:\/\/(www\.)?(x\.com|twitter\.com)\//.test(tab.url || '')) {
      throw new Error('Open an X article in a tab and click the extension again, or paste its text below.');
    }
    const results = await chrome.scripting.executeScript({target: {tabId: tab.id}, files: ['extract.js']});
    article = results[0]?.result;
    if (!article) throw new Error('The page did not return any content. Reload the article and try again.');
  } catch (error) {
    article = {error: error.message};
  }
  const id = crypto.randomUUID();
  // Keep a small, session-only cache so the editor can be reloaded.
  const cached = await chrome.storage.session.get(null);
  const keys = Object.keys(cached).filter(key => key.startsWith('article:'));
  if (keys.length >= 10) await chrome.storage.session.remove(keys.slice(0, keys.length - 9));
  await chrome.storage.session.set({['article:' + id]: article});
  await chrome.tabs.create({url: chrome.runtime.getURL('editor.html') + '?id=' + id});
});

// Close only automation tabs created by a library page when that page closes.
// Session storage survives service-worker suspension, but not browser restart.
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const cached = await chrome.storage.session.get(null);
  await chrome.storage.session.remove('worktab:' + tabId);
  for (const [key, value] of Object.entries(cached)) {
    if (key.startsWith('worktab:') && value.owner === tabId) {
      await chrome.tabs.remove(Number(key.slice(8))).catch(() => {});
      await chrome.storage.session.remove(key);
    }
  }
});
