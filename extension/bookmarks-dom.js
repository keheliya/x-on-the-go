// These functions are serialized by chrome.scripting; keep them self-contained.
export function scanBookmarkPage(pageLocation = location) {
  if (document.readyState === 'loading' || pageLocation.href === 'about:blank') return {ready: false};
  if (pageLocation.origin === 'https://x.com' && /^\/(?:i\/flow\/login|login)(?:\/|$)/.test(pageLocation.pathname)) {
    return {error: 'Sign in to X in the scan tab, then click Load bookmarks again.'};
  }
  // X redirects Bookmarks to /i/history for some accounts. Accept both exact
  // routes, while still refusing unrelated timelines or other origins.
  if (pageLocation.origin !== 'https://x.com' || !/^\/i\/(?:bookmarks|history)\/?$/.test(pageLocation.pathname)) {
    return {error: 'The scan tab left X Bookmarks. Click Load bookmarks to start again.'};
  }
  const primary = document.querySelector('[data-testid="primaryColumn"]') || document.querySelector('main');
  const switcher = document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]');
  const account = switcher?.textContent.match(/@[A-Za-z0-9_]+/)?.[0] || '';
  // X can briefly render a login link before restoring its signed-in UI.
  // A link alone is not evidence of logout; wait for content or a login form.
  if (document.querySelector('input[autocomplete="username"], input[name="password"]')) {
    return {error: 'Sign in to X in the scan tab, then click Load bookmarks again.'};
  }
  if (primary?.querySelector('[data-testid="error-detail"]')) return {error: 'X could not load bookmarks. Check the scan tab and try again.'};
  const items = [];
  for (const tweet of primary?.querySelectorAll('article[data-testid="tweet"]') || []) {
    // Quoted posts can contain an article, but that does not make the outer post
    // an article bookmark. Ignore markers and permalinks in those quoted areas.
    const own = node => node.closest('article[data-testid="tweet"]') === tweet && !node.closest('[data-testid="quoteTweet"], [data-testid="quotedTweet"]');
    const markers = [...tweet.querySelectorAll('[data-testid*="article" i]')].filter(own);
    const direct = [...tweet.querySelectorAll('a[href]')].filter(own).find(a => /^\/i\/article\/\d+\/?$/.test(new URL(a.href).pathname));
    if (!markers.length && !direct) continue;
    const permalink = [...tweet.querySelectorAll('a[href]')].filter(own).find(a => a.querySelector('time') && /^\/\w+\/status\/\d+$/.test(new URL(a.href).pathname));
    const fallback = [...tweet.querySelectorAll('a[href]')].filter(own).find(a => /^\/\w+\/status\/\d+$/.test(new URL(a.href).pathname));
    const link = permalink || fallback || direct;
    if (!link) continue;
    const cleanText = node => node?.textContent.replace(/\s+/g, ' ').trim() || '';
    const visibleTitle = node => own(node) && !node.closest('[hidden], [aria-hidden="true"], [data-testid="tweetText"]')
      && getComputedStyle(node).display !== 'none';
    const titleNode = [...tweet.querySelectorAll('[data-testid="twitter-article-title"], [data-testid="twitterArticleTitle"], [data-testid="article-title"], [data-testid="articleTitle"]')].find(visibleTitle);
    const cards = [...new Set([
      markers.find(el => /preview/i.test(el.dataset.testid)),
      ...markers.map(el => el.closest('article')),
      ...markers.map(el => el.closest('[role="link"], a')),
      direct?.closest('article'),
      direct
    ])].filter(card => card && card !== tweet && own(card) && !card.querySelector('[data-testid="tweetText"]'));
    let title = cleanText(titleNode);
    // The bookmark card's cover is followed by a text panel. Its first row
    // contains the title; the summary is a separate direct child of the panel.
    // Anchor on that observed structure, not CSS classes or font weight.
    for (const cover of markers.filter(node => node.dataset.testid === 'article-cover-image')) {
      if (title) break;
      const textPanel = cover.nextElementSibling;
      if (!textPanel || !own(textPanel)) continue;
      const cardTitle = [...textPanel.querySelectorAll(':scope > div > div[dir="auto"]')].find(visibleTitle);
      title = cleanText(cardTitle);
    }
    for (const card of cards) {
      if (title) break;
      const heading = [...card.querySelectorAll('h1, h2, h3, [role="heading"]')].find(visibleTitle);
      title = cleanText(heading);
      if (title) break;
      // In X's nested <article> card, the title is a plain span at this
      // relative depth. It need not be bold or have a test ID. Scope to the
      // nested article rather than generated classes or the outer tweet.
      if (card.matches('article')) {
        const nestedTitle = [...card.querySelectorAll(':scope > div > div > div > span')]
          .find(node => visibleTitle(node) && cleanText(node) && !node.closest('[data-testid="article-cover-image"]'));
        title = cleanText(nestedTitle);
        if (title) break;
      }
      // X also renders card headings as ordinary bold divs/spans. Restrict this
      // fallback to the article card so the author and post introduction cannot
      // be mistaken for its title. Never use the whole card's text (summary).
      const candidates = [...card.querySelectorAll('[dir], strong, b, span')].filter(node => {
        const value = cleanText(node);
        return visibleTitle(node) && value && value.length <= 500
          && !/^(article|read article|read more)$/i.test(value)
          && parseInt(getComputedStyle(node).fontWeight, 10) >= 600;
      });
      const candidate = candidates.find(node => !candidates.some(child => child !== node && node.contains(child) && cleanText(child) !== cleanText(node)));
      title = cleanText(candidate);
    }
    title = title.slice(0, 500);
    const author = tweet.querySelector('[data-testid="User-Name"] a')?.textContent.trim() || '';
    items.push({url: link.href, articleUrl: direct?.href || link.href, title, author});
  }
  const empty = !!primary?.querySelector('[data-testid="emptyState"]');
  return {items, account, ready: empty || !!primary?.querySelector('[data-testid="tweet"]'), empty,
    atBottom: innerHeight + scrollY >= document.documentElement.scrollHeight - 20};
}

export function advanceBookmarks() {
  window.scrollBy(0, Math.max(400, innerHeight * .75));
}

export function inspectArticlePage(pageLocation = location) {
  window.getSelection()?.removeAllRanges();
  const root = document.querySelector('[data-testid="twitterArticleRichTextView"]')
    || document.querySelector('[data-testid="twitterArticleReadView"] .DraftEditor-root')
    || document.querySelector('main .DraftEditor-root');
  if (root && root.textContent.trim().length >= 80) return {ready: true, length: root.textContent.length};
  if (document.querySelector('input[autocomplete="username"], input[name="password"]')) return {error: 'Sign in to X and retry this article.'};
  const main = document.querySelector('[data-testid="primaryColumn"]') || document.querySelector('main');
  if (main?.querySelector('[data-testid="error-detail"]')) return {error: 'X could not load this article. Open it on X and retry.'};
  // Only open a card belonging to the focal post, never an article in replies.
  const id = pageLocation.pathname.match(/\/status\/(\d+)/)?.[1];
  const tweet = [...main?.querySelectorAll('article[data-testid="tweet"]') || []].find(el =>
    [...el.querySelectorAll('a[href]')].some(a => a.querySelector('time') && new URL(a.href).pathname.endsWith('/status/' + id)));
  const link = [...tweet?.querySelectorAll('a[href]') || []].find(a => /^\/i\/article\/\d+\/?$/.test(new URL(a.href).pathname) && !a.closest('[data-testid="quoteTweet"], [data-testid="quotedTweet"]'));
  if (link) return {openURL: link.href};
  const marker = tweet?.querySelector('[data-testid="twitterArticlePreview"], [data-testid="article-cover-image"], [data-testid="twitter-article-title"]');
  const clickable = marker?.closest('[role="link"]');
  if (clickable && !clickable.closest('[data-testid="quoteTweet"], [data-testid="quotedTweet"]') && !clickable.dataset.xotgOpened) {
    clickable.dataset.xotgOpened = 'true'; clickable.click();
  }
  return {ready: false};
}

export function advanceArticle() {
  const root = document.querySelector('[data-testid="twitterArticleRichTextView"]') || document.querySelector('main .DraftEditor-root');
  if (!root) return {done: false};
  const bottom = root.getBoundingClientRect().bottom;
  window.scrollBy(0, Math.max(400, innerHeight * .8));
  return {done: bottom <= innerHeight, length: root.textContent.length};
}
