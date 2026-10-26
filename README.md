# x-on-the-go

**Your X articles. Ready to read anywhere.**

Turn an open X article into an EPUB you can read on your favorite e-reader or send to Kindle yourself. Preview the content, download the file, and take your reading with you.

Conversion happens locally in your browser. No delivery account, backend, API keys, or subscription required.

## Features

- Export a full, loaded X article or a selection of its text.
- List bookmarked articles from your signed-in X account, select them, and bulk-download individual EPUBs.
- Review the content and edit the title and author before downloading.
- Preserve headings, paragraphs, emphasis, lists, quotes, code, links, and tables.
- Embed supported article images, or choose a text-only export.
- Paste article text when automatic extraction is unavailable.
- Generate EPUB files without installing dependencies or running a server.

## Install in Chrome

1. Download or clone this repository.
2. Open `chrome://extensions`.
3. Enable **Developer mode** in the top-right corner.
4. Click **Load unpacked** and select the repository's **extension** folder.
5. Pin the extension using Chrome's extensions menu.

The current manifest still displays **X Article EPUB — Local** in Chrome. **x-on-the-go** is the project's new name; the installed display name and package filename have not yet been renamed.

You can also run `npm run package`, extract `dist/x-article-epub-local.zip`, and load that extracted folder. No Chrome Web Store listing is linked here yet.

## Export an article

1. Open the full article on X in your usual signed-in Chrome profile.
2. Let it load and scroll to the end so any lazy-loaded content is present.
3. Click the extension icon. The reading preview opens in a new tab.
4. Check the title, author, and **last paragraph**. Edit the metadata if needed.
5. Choose whether to include images, then click **Download EPUB**.
6. Open the file in an EPUB reader, or upload it to [Amazon Send to Kindle](https://www.amazon.com/sendtokindle).

The extension downloads the file; it does not send it to Amazon. Send to Kindle handles conversion for Kindle. The export is EPUB, not a native AZW or MOBI file for direct USB transfer.

### If extraction fails

Open the expanded article rather than its preview in a timeline. You can also select the article text before clicking the extension: selections of at least 40 characters take precedence over automatic extraction. Clear your selection to export the whole article again.

Alternatively, open **Paste or replace article text** in the editor. Pasting replaces the extracted content with plain text and removes its images and formatting.

## Bulk-download bookmarked articles

1. After updating the extension, click **Reload** on its card in `chrome://extensions`.
2. Open [X Bookmarks](https://x.com/i/bookmarks) while signed in and click the extension icon. Alternatively, click **Bookmarked articles** at the top of the single-article editor.
   X may redirect Bookmarks to `https://x.com/i/history`; both routes are supported.
3. Click **Load bookmarks** and grant the optional access to `x.com`. The extension opens its own temporary Bookmarks tab and scans article cards as it scrolls.
4. Use **Load more** to scan older bookmarks. The count is the number found so far, not the total in your account. **Show X tab** lets you inspect loading or sign-in problems.
5. Tick the articles you want (up to 20 per batch), choose whether to include images, then click **Download selected EPUBs**. Chrome will request the optional downloads permission the first time.
6. Find the separate EPUB files in the **x-on-the-go** subfolder of Chrome's download location. Each filename includes the article/post ID to distinguish similar titles.

Keep the library tab open while scanning or downloading. The extension opens a temporary tab for each article, expands its article card when possible, scrolls toward its ending, and exports it using the same EPUB generator as single-article downloads. Articles are processed sequentially. Successful downloads are deselected; failed articles remain selected so you can retry them. **Stop** cancels further work, leaving already completed files on disk.

The list is kept in the library tab's memory and resets when that page reloads. Temporary tabs created by the library are closed when it closes. Your existing X tabs and bookmarks are not modified. If you switch X accounts, click **Load bookmarks** again to start a fresh list.

This feature reads the rendered Bookmarks page, not a private X API. It recognizes article cards and skips ordinary posts and quoted article cards. X markup, slow loading, or hidden content can prevent detection. Loading more is deliberately incremental; the extension cannot guarantee a complete account-wide list. Bookmark folders are not separately enumerated. If an article cannot be opened automatically, use its **Open on X** link and the existing single-article workflow.

The picker reads titles from article-card headings, including bold text headings. If it cannot identify a title, it displays **Title unavailable — open on X** rather than using the surrounding post text or article summary.

## Privacy and offline use

- Article content is not uploaded by the extension.
- No analytics, cookie access, X API calls, or email credentials are used.
- Internet access is needed to initially load the article on X. The extension reads content you can already access.
- Conversion of loaded text works offline. Uncheck **Include article images** to export without network requests.
- Bookmark discovery and bulk article loading require internet access and your signed-in X session. X performs its normal page requests in temporary browser tabs; the extension does not read or copy authentication cookies. The offline text-conversion claim does not apply to loading those pages.
- With images enabled, the editor fetches images directly from `https://pbs.twimg.com`, without credentials or a referrer. Successfully fetched images are embedded in the EPUB, so reading them later does not require a connection.
- Unsupported or unavailable images become labeled placeholders, and the editor reports how many could not be included.
- Temporary previews use Chrome's session storage, with a cache capped at ten articles during normal sequential use. They are not a permanent archive and are cleared when the browser session ends or the extension reloads. Downloaded EPUBs remain on your disk.

### Permissions

| Permission | Purpose |
| --- | --- |
| `activeTab` | Access the current page when you click the extension. |
| `scripting` | Run the article extractor in that page's isolated world. |
| `storage` | Keep temporary previews in session storage. |
| `https://pbs.twimg.com/*` | Download X-hosted images for embedding. |
| `https://x.com/*` (optional) | Read and scroll extension-created X tabs for bookmark scanning and selected-article extraction. Requested when you use bookmarks. |
| `downloads` (optional) | Save separate bulk EPUB files and detect completion or interruption. Requested when you start a bulk download. |

## Limitations

X can change its markup. The extractor looks for the expanded article body and Draft.js content; it does not fall back to exporting an entire timeline. Only content already loaded in the page can be captured, and completeness cannot be guaranteed. Always check the preview against the article's ending.

Title and author detection are best-effort and editable. Images outside the detected body, including some cover images, may be omitted. Video, audio, and external embeds are not included. Pasting a URL does not fetch an article, and the extension does not bypass access restrictions.

Supported image formats are JPEG, PNG, GIF, and WebP; WebP is converted to JPEG. Image downloads are limited to 10 MB each, with a total embedding budget of 30 MB and up to 100 unique images.

## Development

The extension uses plain JavaScript, HTML, and CSS with Chrome Manifest V3. There is no build step and no npm dependency installation is needed. Development commands require Node.js 22+ and Python 3.

```sh
# Run EPUB generation tests
npm test

# Build the extension ZIP in dist/
npm run package

# Serve the editor and browser fixtures locally
python3 -m http.server 8765 --bind 127.0.0.1
```

With the local server running:

- Open `http://127.0.0.1:8765/tests/browser.html` for extraction regression checks.
- Open `http://127.0.0.1:8765/extension/editor.html` to exercise the paste, preview, and download flow without extension APIs.
- Stop the server with Ctrl+C when finished.

For extension changes, click **Reload** on its card in `chrome://extensions`, then click its toolbar icon on an article to create a fresh preview.

### Project layout

```text
extension/
  manifest.json       Permissions and extension entry points
  background.js       Toolbar action, extraction, and preview handoff
  extract.js          DOM extraction and allowlisted serialization
  editor.html         Preview and download interface
  editor.css          Interface styling
  editor.js           Preview, image embedding, and export flow
  export.js           Shared image processing and EPUB preparation
  epub.js             EPUB 3 documents and ZIP writer
  bookmarks.html      Bookmark library interface
  bookmarks.css       Bookmark library styling
  bookmarks.js        Selection, scanning controls, and download progress
  bookmarks-model.js  URL validation, deduplication, and sequential queue
  bookmarks-dom.js    Injected bookmark/article page readers
  x-session.js        Temporary X tabs and tracked bulk downloads
scripts/
  package.py          Extension ZIP packaging
tests/
  epub.test.js        EPUB structure and escaping tests
  bookmarks.test.js   Queue, URL, tab cleanup, and download tests
  browser.html        Browser extraction fixtures
  bookmarks-ui-mock.js Synthetic Chrome APIs for UI testing
  build-browser-harness.py Local browser harness generator
```

Automated tests check ZIP CRCs using Python's independent ZIP reader, XML parsing, EPUB file ordering, manifest references, metadata escaping, images, and navigation. Queue tests cover partial failures, cancellation, URL restrictions, account mismatch, tab cleanup, and download interruption. Browser fixtures cover extraction, selections, formatting, sanitization, and bookmark-card filtering. These checks are separate from a live Chrome/X test and Kindle ingestion testing. The initial single-article version has also been manually tested successfully by the project owner. The bookmark feature still needs verification in a signed-in Chrome profile: X returned HTTP 403 in the development browser.

To test without a local HTTP server, run:

```sh
python3 tests/build-browser-harness.py /tmp/x-on-the-go-tests
```

Open the generated `browser.html` for DOM assertions, `bookmarks.html` for a library backed by synthetic Chrome APIs, or `editor.html` for the manual-paste flow. The mock library includes one failing article to test partial failure and retry. These files are test harnesses, not extension builds, and never access your real bookmarks.

For contributions, describe the user-visible change, include relevant regression coverage, and document any changes to permissions, networking, or supported content. See [AGENTS.md](AGENTS.md) for coding-agent guidance.

## Acknowledgment

Inspired by [X Articles to Kindle](https://chromewebstore.google.com/detail/x-articles-to-kindle/hnipkjnedahfhpacgimlhlidhcpbcgnd). This project implements local extraction and EPUB generation independently; it does not bundle that extension's code, assets, or service configuration.
