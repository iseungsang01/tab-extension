(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.TabSearch = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const VALID_SCOPES = new Set(['current-window', 'all-windows']);

  function toText(value) {
    return value == null ? '' : String(value);
  }

  function lower(value) {
    return toText(value).toLowerCase();
  }

  function safeDecode(value) {
    const text = toText(value);
    try {
      return decodeURIComponent(text);
    } catch (_) {
      return text;
    }
  }

  function parseUrl(url) {
    const raw = toText(url);
    const decodedUrl = safeDecode(raw);
    if (!raw) {
      return { host: '', path: '', decodedUrl };
    }

    try {
      const parsed = new URL(raw);
      const protocol = parsed.protocol.replace(':', '');
      const host = parsed.hostname || protocol;
      const path = safeDecode(`${parsed.pathname || ''}${parsed.search || ''}${parsed.hash || ''}`);
      return { host, path, decodedUrl };
    } catch (_) {
      return { host: '', path: decodedUrl, decodedUrl };
    }
  }

  function hasPdfSignal(tab) {
    const url = lower(tab.url);
    const title = lower(tab.title);
    return (
      title.endsWith('.pdf') ||
      url.endsWith('.pdf') ||
      url.includes('.pdf?') ||
      url.includes('/pdf/') ||
      url.includes('type=pdf')
    );
  }

  function classifyTab(tab) {
    const url = lower(tab.url);
    const host = lower(tab.host);
    const tags = [];

    if (hasPdfSignal(tab)) tags.push('pdf');
    if (host.includes('arxiv.org')) tags.push('arxiv');
    if (host.includes('scholar.google.')) tags.push('scholar');
    if (host.includes('semanticscholar.org')) tags.push('semantic');
    if (host.includes('openreview.net')) tags.push('openreview');
    if (host === 'doi.org' || host.endsWith('.doi.org') || url.includes('/doi/')) tags.push('doi');

    return [...new Set(tags)];
  }

  function normalizeTab(chromeTab) {
    const source = chromeTab || {};
    const parsed = parseUrl(source.url);
    const tab = {
      id: typeof source.id === 'number' ? source.id : -1,
      windowId: typeof source.windowId === 'number' ? source.windowId : -1,
      index: typeof source.index === 'number' ? source.index : 0,
      title: toText(source.title || source.url || 'Untitled'),
      url: toText(source.url),
      favIconUrl: toText(source.favIconUrl),
      active: source.active === true,
      pinned: source.pinned === true,
      audible: source.audible === true,
      discarded: source.discarded === true,
      host: parsed.host,
      path: parsed.path,
      decodedUrl: parsed.decodedUrl,
      tags: [],
    };
    tab.tags = classifyTab(tab);
    return tab;
  }

  function tokenize(query) {
    return lower(query).trim().split(/\s+/).filter(Boolean);
  }

  function fieldScore(field, token, base) {
    if (!field || !token) return 0;
    const index = field.indexOf(token);
    if (index < 0) return 0;
    return base + (index === 0 ? Math.round(base * 0.35) : 0);
  }

  function scoreToken(tab, token) {
    const title = lower(tab.title);
    const host = lower(tab.host);
    const url = lower(tab.decodedUrl || tab.url);
    const tags = (tab.tags || []).join(' ').toLowerCase();

    return (
      fieldScore(title, token, 100) ||
      fieldScore(host, token, 70) ||
      fieldScore(tags, token, 55) ||
      fieldScore(url, token, 35)
    );
  }

  function scoreTab(tab, tokens) {
    if (!tokens.length) return 0;
    let total = 0;
    for (const token of tokens) {
      const score = scoreToken(tab, token);
      if (score === 0) return null;
      total += score;
    }
    return total;
  }

  function normalizeScope(scope) {
    return VALID_SCOPES.has(scope) ? scope : 'current-window';
  }

  function inScope(tab, options) {
    const scope = normalizeScope(options && options.scope);
    if (scope === 'all-windows') return true;
    if (typeof options.currentWindowId !== 'number') return true;
    return tab.windowId === options.currentWindowId;
  }

  function compareResults(a, b, options) {
    const currentWindowId = options && options.currentWindowId;

    if (a.tab.active !== b.tab.active) return a.tab.active ? -1 : 1;
    if (a.tab.pinned !== b.tab.pinned) return a.tab.pinned ? -1 : 1;
    if (a.score !== b.score) return b.score - a.score;

    const aCurrent = a.tab.windowId === currentWindowId;
    const bCurrent = b.tab.windowId === currentWindowId;
    if (aCurrent !== bCurrent) return aCurrent ? -1 : 1;

    if (a.tab.windowId !== b.tab.windowId) return a.tab.windowId - b.tab.windowId;
    return a.tab.index - b.tab.index;
  }

  function searchTabs(tabs, query, options) {
    const normalizedOptions = {
      scope: normalizeScope(options && options.scope),
      currentWindowId: options && options.currentWindowId,
    };
    const tokens = tokenize(query);
    const results = [];

    for (const tab of Array.isArray(tabs) ? tabs : []) {
      if (!inScope(tab, normalizedOptions)) continue;
      const score = scoreTab(tab, tokens);
      if (score === null) continue;
      results.push({ tab, score });
    }

    results.sort((a, b) => compareResults(a, b, normalizedOptions));
    return results;
  }

  function formatUrl(url) {
    const parsed = parseUrl(url);
    return {
      host: parsed.host,
      path: parsed.path,
    };
  }

  return {
    normalizeTab,
    searchTabs,
    classifyTab,
    formatUrl,
    tokenize,
  };
});
