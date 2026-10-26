# x-on-the-go

**Your X articles. Ready to read anywhere.**

Turn an open X article into an EPUB you can read on your favorite e-reader or send to Kindle yourself. Preview the content, download the file, and take your reading with you.

Conversion happens locally in your browser. No delivery account, backend, API keys, or subscription required.

## Features

- Export a full, loaded X article or a selection of its text.
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

## Privacy and offline use

- Article content is not uploaded by the extension.
- No analytics, cookie access, X API calls, or email credentials are used.
- Internet access is needed to initially load the article on X. The extension reads content you can already access.
- Conversion of loaded text works offline. Uncheck **Include article images** to export without network requests.
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
  epub.js             EPUB 3 documents and ZIP writer
scripts/
  package.py          Extension ZIP packaging
tests/
  epub.test.js        EPUB structure and escaping tests
  browser.html        Browser extraction fixtures
```

Automated tests check ZIP CRCs using Python's independent ZIP reader, XML parsing, EPUB file ordering, manifest references, metadata escaping, images, and navigation. Browser fixtures cover extraction, selections, formatting, and sanitization. These checks are separate from a live Chrome/X test and Kindle ingestion testing. The initial version has also been manually tested successfully by the project owner.

For contributions, describe the user-visible change, include relevant regression coverage, and document any changes to permissions, networking, or supported content. See [AGENTS.md](AGENTS.md) for coding-agent guidance.

## Acknowledgment

Inspired by [X Articles to Kindle](https://chromewebstore.google.com/detail/x-articles-to-kindle/hnipkjnedahfhpacgimlhlidhcpbcgnd). This project implements local extraction and EPUB generation independently; it does not bundle that extension's code, assets, or service configuration.
