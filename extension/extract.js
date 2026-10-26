/* Runs on demand in Chrome's isolated world. Never reads cookies or calls X APIs. */
(() => {
  const esc = (s) => String(s).toWellFormed().replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&apos;'}[c]));
  const text = el => el?.textContent?.trim() || '';
  const safeURL = value => {
    try { const u = new URL(value, location.href); return /^https?:$/.test(u.protocol) ? u.href : ''; } catch { return ''; }
  };
  const source = location.href.split('?')[0].split('#')[0];
  const selection = window.getSelection();
  const selected = selection?.toString().trim();
  const readView = document.querySelector('[data-testid="twitterArticleReadView"]');
  const root = document.querySelector('[data-testid="twitterArticleRichTextView"]')
    || readView?.querySelector('.DraftEditor-root, [data-contents="true"]')
    || document.querySelector('main .DraftEditor-root');
  const scope = readView || root?.closest('[data-testid="primaryColumn"]') || document.querySelector('main');
  const title = text(scope?.querySelector('[data-testid="twitter-article-title"], [data-testid="twitterArticleTitle"], h1'))
    || document.title.replace(/\s*\/\s*X$/, '').replace(/ on X: /, ': ').replace(/^\(\d+\) /, '').slice(0, 300);
  const authorNode = scope?.querySelector('[data-testid="User-Name"]');
  const handle = location.pathname.match(/^\/([^/]+)\/status\//)?.[1];
  const author = text(authorNode?.querySelector('a')) || (handle && handle !== 'i' ? '@' + handle : '');
  const warnings = ['Only content currently loaded in this page can be exported. Check the preview against the article’s ending before downloading.'];
  const images = [];
  const allowed = new Set(['p','div','span','h1','h2','h3','h4','h5','h6','blockquote','pre','code','strong','b','em','i','u','s','del','ul','ol','li','br','hr','figure','figcaption','table','thead','tbody','tr','td','th','a']);
  const skip = new Set(['SCRIPT','STYLE','IFRAME','BUTTON','INPUT','TEXTAREA','SELECT','SVG','NAV','NOSCRIPT']);
  function serialize(node) {
    if (node.nodeType === Node.TEXT_NODE) return esc(node.textContent);
    if (node.nodeType !== Node.ELEMENT_NODE || skip.has(node.tagName) || node.hidden || node.getAttribute('aria-hidden') === 'true') return '';
    if (['VIDEO','AUDIO'].includes(node.tagName)) {
      warnings.push('Embedded video/audio is not included. Use the source link to view it.');
      return '<p>[Embedded media: see original article]</p>';
    }
    if (node.tagName === 'IMG') {
      if ((node.getAttribute('src') || '').includes('/emoji/')) return esc(node.alt);
      const url = safeURL(node.currentSrc || node.src);
      if (!url) return '';
      const index = images.length;
      images.push({url, alt: node.alt || ''});
      return `<img data-image="${index}" alt="${esc(node.alt || 'Article image')}" />`;
    }
    const children = [...node.childNodes].map(serialize).join('');
    let tag = node.tagName.toLowerCase();
    if (!allowed.has(tag)) return children;
    let attrs = '';
    if (tag === 'a') {
      const href = safeURL(node.getAttribute('href') || '');
      if (!href) return children;
      attrs = ` href="${esc(href)}"`;
    }
    // Draft.js sometimes uses styled spans instead of semantic emphasis.
    if (tag === 'span' && /bold|[6-9]00/.test(node.style.fontWeight)) tag = 'strong';
    else if (tag === 'span' && node.style.fontStyle === 'italic') tag = 'em';
    if (tag === 'br' || tag === 'hr') return `<${tag} />`;
    if (!children.trim()) return '';
    return `<${tag}${attrs}>${children}</${tag}>`;
  }
  let html, mode;
  if (selected && selected.length >= 40) {
    const fragment = selection.getRangeAt(0).cloneContents();
    html = [...fragment.childNodes].map(serialize).join('');
    mode = 'Selected text';
    warnings.unshift('Exporting your selection only. Clear the selection and click the extension again to extract the whole article.');
  } else if (root && text(root).length >= 80) {
    html = serialize(root);
    mode = 'Article';
  } else {
    return {error: 'No expanded article was found. Open the full article, let it load, and try again. You can also select its text before clicking the extension, or paste it below.', title, author, source};
  }
  return {title, author, source, language: root?.closest('[lang]')?.lang || document.documentElement.lang || 'en', html, images, mode, warnings: [...new Set(warnings)]};
})();
