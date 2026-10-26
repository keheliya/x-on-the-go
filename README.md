# X Article EPUB — Local

A small Chrome extension that turns an **open, readable X article** into a downloadable EPUB. No delivery account, subscription, server, API keys, or build step. EPUB creation happens on your computer.

## Install

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode** (top right).
3. Click **Load unpacked** and select this project's **extension** folder.
4. Pin **X Article EPUB — Local** using Chrome's extensions menu.

If using `dist/x-article-epub-local.zip`, extract it first and load the extracted folder instead.

## Use

1. Open an X article while signed into your usual Chrome profile. For example: <https://x.com/thorstenball/status/2114386050638336082>.
2. Open the full article, let it load, and scroll to its end so any lazy-loaded content is present.
3. Click the extension icon. A preview opens in a new tab.
4. Check the title, author, and **last paragraph**. Edit the title/author if necessary.
5. Click **Download EPUB**.
6. Upload the `.epub` at [Amazon Send to Kindle](https://www.amazon.com/sendtokindle), or use your own delivery method. Amazon converts supported EPUB uploads for Kindle; this is not a native AZW/MOBI generator or a USB sideloading workflow.

If extraction fails, select the article text on X and click the extension again. Selections of at least 40 characters take precedence over automatic extraction. You can also use **Paste or replace article text** in the preview. Clear your selection before exporting the whole article.

## What “local” means

- No article content is uploaded by the extension. No connection to the original extension's service.
- No cookie access, X API calls, bookmark sync, analytics, or email credentials.
- You still need internet to initially load an article on X. It must be content you can already read.
- Conversion of loaded text works offline. Uncheck **Include article images** for an export with no network requests.
- With images enabled, the editor fetches images only from `https://pbs.twimg.com`, without credentials or a referrer, and embeds them in the EPUB. It never includes remotely loaded images in the EPUB. Unsupported/failed images become labeled placeholders with a visible download warning.
- The last ten extracted articles are kept in Chrome's **session** storage for preview reloads. This is not a permanent archive; the cache is cleared with the browser session or extension reload. Downloaded EPUBs are ordinary files on your disk.

## Supported content and limitations

Preserves headings, paragraphs, emphasis, lists, quotes, code, links, tables, and supported inline images in the loaded article body. WebP images are converted to JPEG. Images are limited to 10 MB each and 30 MB total (up to 100 unique images). No video/audio embedding, external embeds, paywall bypass, or automatic retrieval from a pasted URL. Images outside the detected article body, such as some cover images, may be omitted.

X can change its markup. The extractor prefers the expanded article body and Draft.js content, and deliberately fails instead of using an entire timeline as a book. It cannot prove completeness of an article or retrieve content X hasn't loaded. Always inspect the preview. Author/title detection is best-effort and editable.

## Permissions

| Permission | Purpose |
| --- | --- |
| `activeTab` | Read the page only when you click the extension. |
| `scripting` | Extract the article from that page in an isolated script. |
| `storage` | Keep temporary previews in session storage. |
| `https://pbs.twimg.com/*` | Embed X-hosted images on download. |

## Development and verification

No npm packages are required. Node.js 22+ and Python 3 are used for tests/packaging only.

```sh
npm test
npm run package
python3 -m http.server 8765 --bind 127.0.0.1
```

Open `http://127.0.0.1:8765/tests/browser.html` to run browser extraction regression checks. `http://127.0.0.1:8765/extension/editor.html` supports the paste/download flow for local development without extension APIs. Stop the server with Ctrl+C when finished.

Automated tests validate ZIP CRCs with Python's independent ZIP reader, EPUB ordering and manifest references, XML parsing, metadata escaping, images, and navigation. Browser fixtures exercise article detection, selection, formatting, and sanitization. They do not replace a live X/Chrome extension test or Kindle ingestion test. The supplied X example returned HTTP 403 in the development browser, so its actual DOM and export could not be verified there.

## Relationship to the original extension

Inspired by [X Articles to Kindle](https://chromewebstore.google.com/detail/x-articles-to-kindle/hnipkjnedahfhpacgimlhlidhcpbcgnd), version 0.2.8. Its distributed code was inspected to understand the service boundary: it obtains remote GraphQL configuration and submits raw article data for server-side processing/delivery. This project is independently implemented; none of that extension's code, branding, API configuration, or assets is bundled here.
