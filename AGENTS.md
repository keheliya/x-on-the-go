# x-on-the-go

## Project purpose

Build and maintain a Chrome extension that turns an open, readable X article into a local EPUB download. The core flow is: open article → click extension → review preview → download EPUB. Users handle delivery to Kindle or another reader themselves.

The chosen project name is **x-on-the-go**. Use that spelling in new project documentation. The current manifest name, npm package name, ZIP filename, and editor branding still use earlier names; inspect actual files before describing those values. Keep documentation and implementation aligned when renaming them.

## Architecture

- `extension/manifest.json`: Manifest V3 configuration, permissions, CSP, and module service worker.
- `extension/background.js`: handles toolbar clicks, injects the extractor, stores the result under an `article:<uuid>` session key, and opens the editor.
- `extension/extract.js`: self-contained IIFE injected in Chrome's isolated world. Returns a serializable article object; it cannot depend on imported modules or page-owned JavaScript variables.
- `extension/editor.js`: reads the session result, renders a sandboxed preview, fetches optional images, and triggers an EPUB download. Supports manual pasted text without Chrome APIs for development.
- `extension/epub.js`: browser-compatible ES module for escaped XML, EPUB 3 packaging, and a dependency-free ZIP writer. Also imported by Node tests.
- `extension/editor.html` and `editor.css`: interface structure and styling.
- `tests/epub.test.js`: Node tests with Python ZIP/XML validation.
- `tests/browser.html`: browser-based DOM extraction fixtures.
- `scripts/package.py`: packages files directly inside `extension/` into `dist/x-article-epub-local.zip`. It currently does not recurse into subdirectories; update it if adding nested assets.

Successful extraction returns `title`, `author`, `source`, `language`, `html`, `images`, `mode`, and `warnings`. Failure returns an `error`, optionally with metadata. Image placeholders use `data-image` indexes into the `images` array until export replaces them with packaged asset paths or explanatory text.

## Implementation principles

- Keep local EPUB export usable without an account, backend, or delivery service.
- Use plain JavaScript, HTML, and CSS. Avoid adding dependencies or a build system unless the requested feature warrants them.
- Keep `epub.js` independent of DOM and Chrome APIs so it remains testable in Node.
- Preserve the selected-text and manual-paste fallbacks when changing extraction.
- Prefer explicit article-body selectors. Do not silently export a timeline, replies, or unrelated page content when article detection fails.
- Do not claim that extraction guarantees a complete article. Keep the preview and completeness reminder useful.
- Keep title and author editable and report image failures visibly.
- Treat the existing forest-green and warm-cream interface as the visual baseline. Preserve keyboard access, labels, focus states, and status announcements.

## Privacy and content boundaries

- Treat page content as untrusted. Preserve allowlisted markup, safe HTTP(S) links, XML escaping, and invalid-character handling. Do not copy arbitrary `innerHTML` into the preview or EPUB.
- Preserve the sandboxed preview and restrictive content security policies. Do not enable scripts inside article previews.
- Do not read cookies, credentials, or private X APIs for the current extraction workflow.
- Keep networking limited to optional image fetching from the declared X image host. Text-only conversion must not make network requests.
- Preserve credential-free image requests, timeouts, streaming size limits, format checks, and the total embedding budget.
- Embed image bytes in the EPUB rather than external image references.
- Keep article previews in session storage; do not introduce persistent archives, analytics, uploads, or broader host access as incidental implementation changes.
- When a requested feature changes these behaviors, make the change explicit and update permissions documentation and tests accordingly.

## EPUB invariants

- `mimetype` must be the first ZIP entry, uncompressed, with exactly `application/epub+zip` and no extra header fields.
- Generated XML and XHTML must parse correctly, including Unicode titles and escaped user content.
- Container paths, manifest items, spine references, navigation links, and embedded assets must agree.
- Keep the output readable without network access. External source links may remain clickable.
- Preserve independent ZIP/CRC verification when changing archive generation.

## Commands and validation

No dependency installation is needed. Use Node.js 22+ and Python 3.

```sh
npm test
npm run package
python3 -m http.server 8765 --bind 127.0.0.1
```

Choose validation appropriate to the change:

- EPUB generation: run `npm test`; extend tests for meaningful format or escaping regressions.
- Extraction: run `tests/browser.html` through the local server and add fixtures for changed selectors or content handling. Include ordinary tweets, replies, selections, and unsafe markup where relevant.
- Editor or image handling: exercise preview and download, including text-only mode, unavailable images, and pasted text.
- Manifest, worker, or permission changes: reload the unpacked extension in Chrome and test the toolbar-to-editor handoff.
- Packaging or new assets: run `npm run package` and inspect the archive contents.
- Documentation-only edits: check commands, paths, and claims against the source; runtime tests are unnecessary unless behavior also changes.

A local editor page does not test Chrome extension APIs. Fixtures do not establish compatibility with current live X markup. Report those distinctions and any blocked checks honestly. The development browser previously received HTTP 403 for the sample X article; the project owner subsequently reported successful real-world use. Neither observation guarantees future X compatibility.

## Browser tooling

For all web browsing, use the **gstack `/browse` skill** and read its instructions before use. Never use `mcp__claude-in-chrome__*` tools. Use the other available gstack skills when explicitly requested or when their workflow is appropriate to the task.

## Repository hygiene

- Keep changes focused on the requested feature or fix.
- Do not commit generated `dist/` packages, `.gstack/` browser state, dependency folders, or temporary files; they are ignored.
- Do not commit captured private articles, browser cookies, or credentials as fixtures. Use synthetic content for regression tests.
- Update the README when installation, commands, permissions, behavior, or limitations change.
- Do not invent a repository URL, Chrome Web Store listing, license, or release status. Use confirmed project metadata.
- Summarize what changed, how it was checked, and any remaining limitations when handing work back.
