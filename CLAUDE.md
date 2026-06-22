# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Chrome Manifest V3 extension ("Tab Finder for Papers") whose only surface is a browser-action popup for searching across many open research/PDF/document tabs. There is no background service worker and no content script bundle — the popup is the whole app. There is **no build step**; Chrome loads the source files directly.

## Commands

```powershell
npm test          # runs node --test test/  (pure unit tests, no browser/Chrome needed)
```

To run a single test, pass the name filter to the test runner:

```powershell
node --test --test-name-pattern "searches by title" test/
```

Loading the extension for manual testing: `chrome://extensions` → enable Developer mode → **Load unpacked** → select this repository folder.

## Architecture

Two source layers, deliberately separated so the search logic stays testable without a DOM or Chrome APIs:

- **`lib/tab_search.js`** — pure, dependency-free module exposing `normalizeTab`, `searchTabs`, `inferAutoTitle`, `classifyTab`, `cleanPaperTitle`, `extractArxivId`, `extractDoi`, `extractPubmedId`, `tokenize`, `formatUrl`. Uses a UMD wrapper so it works both as a CommonJS `require` (tests) and as a `window.TabSearch` global (popup). **All logic that can be tested without a browser lives here**, and `test/tab_search.test.js` is the contract for it. When changing search ranking, title cleaning, or tab classification, update/extend these tests.
- **`popup/popup.js`** — the DOM + Chrome-API layer. Queries tabs (`chrome.tabs.query`), injects `collectPageTitleSignals` into pages via `chrome.scripting.executeScript` to read citation/OpenGraph/JSON-LD metadata, renders rows, and persists user data through `chrome.storage.local`. It depends on `window.TabSearch` for all ranking/normalization.

`popup/popup.html` loads `lib/tab_search.js` **before** `popup/popup.js` — order matters because the global must exist first.

### Title model (the core domain concept)

Each tab carries three title fields, and display/search precedence is always `customTitle` → `autoTitle` → `originalTitle`:

- **`originalTitle`** — the raw `chrome.tab.title`.
- **`autoTitle`** — derived by `inferAutoTitle`, which scores candidate titles from page metadata signals (`citationTitle`, `dcTitle`, `schemaTitle`, `ogTitle`, headings, filename) and strips site-name suffixes / arXiv-id noise via `cleanPaperTitle` + the `SITE_TITLE_PATTERNS` / `GENERIC_TITLES` heuristics. The goal is turning "Semantic Scholar - RAG Systems" into "RAG Systems". The highest-priority candidate is `paperTitle` — an authoritative title fetched out of band (see arXiv lookup below) — so any source that can resolve a real title just sets `paperTitle` and lets the existing ranking take over.
- **`customTitle`** — a user-typed override, persisted per tab.

**External title lookup (popup layer).** The built-in PDF viewer and discarded tabs can't be read with `chrome.scripting.executeScript`, so `arxiv.org/pdf/<id>`, `doi.org/<doi>`, and `pubmed.ncbi.nlm.nih.gov/<pmid>` tabs would otherwise fall back to a bare id or filename. When `inferAutoTitle` yields nothing for such a tab, `applyAutoTitles` calls `resolveExternalTitle`, which walks the `TITLE_RESOLVERS` registry — each entry pairs a pure URL→id extractor (`extractArxivId` / `extractDoi` / `extractPubmedId`) with a popup-layer fetcher (arXiv Atom API / Crossref `api.crossref.org/works` / NCBI `esummary`). The first source whose id appears in the URL wins; its title feeds back in as `paperTitle`. To add a source, add an extractor (with tests) and append one registry entry — nothing else changes. Results are cached by `"<source>:<id>"` in `chrome.storage.local` (`tabFinder.resolvedTitles.v1`, capped at `RESOLVED_TITLE_CACHE_LIMIT`); unlike tab-id-keyed data this cache survives close/reopen. Pages whose metadata already resolves a title (e.g. arXiv `/abs/` pages) skip the network call.

`looksLikePaperTitle` / `isGenericTitle` gate what gets promoted to an auto title — be careful editing them, since loosening them surfaces junk titles and tightening them drops real ones.

### Search semantics

`searchTabs` tokenizes the query on whitespace and requires **every** token to match (AND across tokens), but a token may match **any** of title / autoTitle / originalTitle / note (OR across fields). A single non-matching token drops the tab entirely (`scoreTab` returns `null`). Scoring favors title fields over notes and rewards prefix matches. Results sort by: active → favorite → pinned → score → current-window → windowId → tab index. **URL host/path are normalized and classified but intentionally NOT searched** (see the "does not search hidden URL details" test).

### Persistence

All user state is in `chrome.storage.local` under versioned keys defined at the top of `popup.js` (`tabFinder.tabNotes.v1`, `tabFinder.tabTitles.v1`, `tabFinder.favorites.v1`, plus scope/language prefs). Keyed by stringified Chrome tab id. Notes/titles/favorites are pruned on refresh for tabs that are no longer open (`pruneTabDataForTabs`). The one exception is the resolved-title cache (`tabFinder.resolvedTitles.v1`), which is keyed by `"<source>:<id>"` rather than tab id, is not pruned, and is bounded only by a size cap. Saves are debounced (`SAVE_DELAY_MS`) and flushed on `beforeunload` and before navigating to a tab. Because keys are tab ids, stored data does not survive tab close/reopen — this is intentional, not a bug.

### i18n

UI strings live in the `MESSAGES` object in `popup.js` (`ko` default, `en`). Static markup is translated via `data-i18n*` attributes in `popup.html` (`data-i18n`, `data-i18n-placeholder`, `data-i18n-aria-label`, `data-i18n-title`). When adding UI text, add the key to **both** `ko` and `en` and wire the element with the matching attribute — do not hardcode strings in JS or HTML.
