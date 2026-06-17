(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.TabSearch = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const VALID_SCOPES = new Set(['current-window', 'all-windows']);
  const AUTO_TITLE_MAX_LENGTH = 220;

  const HTML_ENTITIES = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    '#39': "'",
  };

  const SITE_TITLE_PATTERNS = [
    /\s+\|\s*(?:Semantic Scholar|OpenReview|arXiv(?:\.org)?|arXiv e-prints|Google Scholar|Papers With Code|ACM Digital Library|IEEE Xplore|SpringerLink|ScienceDirect|PubMed|PubMed Central|ResearchGate|JSTOR|MDPI|Frontiers|Nature|Science|Wiley Online Library|Taylor & Francis Online|Oxford Academic|Cambridge Core|ACL Anthology)\s*$/i,
    /\s+-\s*(?:Semantic Scholar|OpenReview|arXiv(?:\.org)?|Google Scholar|Papers With Code|ACM Digital Library|IEEE Xplore|SpringerLink|ScienceDirect|PubMed|PubMed Central|ResearchGate|JSTOR|MDPI|Frontiers|Wiley Online Library|Taylor & Francis Online|Oxford Academic|Cambridge Core|ACL Anthology)\s*$/i,
    /^(?:Semantic Scholar|OpenReview|Google Scholar|arXiv(?:\.org)?|Papers With Code)\s*[-:|]\s*/i,
  ];

  const GENERIC_TITLES = new Set([
    'arxiv.org e-print archive',
    'google scholar',
    'semantic scholar',
    'openreview',
    'papers with code',
    'pdf',
    'untitled',
    'just a moment',
    'access denied',
    'forbidden',
    'not found',
    'page not found',
    'error',
    'sign in',
    'login',
  ]);

  function toText(value) {
    return value == null ? '' : String(value);
  }

  function lower(value) {
    return toText(value).toLowerCase();
  }

  function normalizeSpaces(value) {
    return toText(value)
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function decodeBasicHtmlEntities(value) {
    return normalizeSpaces(value).replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
      const key = lower(entity);
      if (Object.prototype.hasOwnProperty.call(HTML_ENTITIES, key)) return HTML_ENTITIES[key];
      if (key.startsWith('#x')) {
        const codePoint = Number.parseInt(key.slice(2), 16);
        return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
      }
      if (key.startsWith('#')) {
        const codePoint = Number.parseInt(key.slice(1), 10);
        return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
      }
      return match;
    });
  }

  function trimTitlePunctuation(value) {
    return normalizeSpaces(value)
      .replace(/^[\s"'“”‘’`([{<]+/, '')
      .replace(/[\s"'“”‘’`)\]}>.,;:|/-]+$/, '')
      .trim();
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

  function humanizeFileTitle(value) {
    const text = normalizeSpaces(value).replace(/\.(?:pdf|html?|aspx?)$/i, '');
    if (!text || /\s/.test(text) || !/[_-]/.test(text)) return text;
    return normalizeSpaces(text.replace(/[_-]+/g, ' '));
  }

  function titleFromUrl(url) {
    const raw = toText(url);
    if (!raw) return '';

    try {
      const parsed = new URL(raw);
      const pathParts = safeDecode(parsed.pathname || '').split('/').filter(Boolean);
      const filename = pathParts[pathParts.length - 1] || '';
      if (!/\.(?:pdf|html?)$/i.test(filename)) return '';
      return humanizeFileTitle(filename);
    } catch (_) {
      return '';
    }
  }

  function cleanPaperTitle(value) {
    let text = decodeBasicHtmlEntities(value);
    if (!text) return '';

    text = text
      .replace(/^\s*\[(?:pdf|html|citation|book|all versions)\]\s*/i, '')
      .replace(/^\s*(?:pdf|full text|download pdf)\s*[:|-]\s*/i, '')
      .replace(/^\[\s*(?:arXiv:)?[a-z.-]*\/?\d{4}\.\d{4,5}(?:v\d+)?\s*\]\s*/i, '')
      .replace(/^arXiv:\s*[a-z.-]*\/?\d{4}\.\d{4,5}(?:v\d+)?\s*[-:]\s*/i, '')
      .replace(/\s*\[(?:pdf|html)\]\s*$/i, '')
      .replace(/\s*\[\s*(?:arXiv:)?[a-z.-]*\/?\d{4}\.\d{4,5}(?:v\d+)?\s*\]\s*$/i, '');

    for (let i = 0; i < 4; i += 1) {
      const before = text;
      for (const pattern of SITE_TITLE_PATTERNS) {
        text = text.replace(pattern, '');
      }
      text = trimTitlePunctuation(text);
      if (text === before) break;
    }

    const hadPdfExtension = /\.pdf(?:\s*[-–—]\s*.*)?$/i.test(text);
    if (hadPdfExtension) {
      text = text.replace(/\.pdf(?:\s*[-–—]\s*.*)?$/i, '');
      text = humanizeFileTitle(text);
    }

    return trimTitlePunctuation(text).slice(0, AUTO_TITLE_MAX_LENGTH);
  }

  function titleKey(value) {
    return lower(cleanPaperTitle(value))
      .normalize('NFKD')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function isGenericTitle(value) {
    const key = titleKey(value);
    if (!key) return true;
    if (GENERIC_TITLES.has(key)) return true;
    if (/^(?:\d{3,}|[a-z.-]*\/?\d{4}\.\d{4,5}(?:v\d+)?)$/i.test(key)) return true;
    if (/^(?:403|404|500)\b/.test(key)) return true;
    return false;
  }

  function looksLikePaperTitle(value) {
    const text = cleanPaperTitle(value);
    if (!text || text.length < 4 || text.length > AUTO_TITLE_MAX_LENGTH) return false;
    if (isGenericTitle(text)) return false;
    if (/^https?:\/\//i.test(text)) return false;
    if (/^[\d\s.,;:[\](){}_-]+$/.test(text)) return false;

    const letterMatches = text.match(/\p{L}/gu) || [];
    if (letterMatches.length < 4) return false;

    const wordMatches = text.match(/\p{L}[\p{L}\p{M}\p{N}'’:-]*/gu) || [];
    if (wordMatches.length >= 2) return true;

    return /^[A-Z][A-Z0-9-]{3,}$/.test(text) || /[\uAC00-\uD7A3]{4,}/.test(text);
  }

  function pushTitleCandidate(candidates, value) {
    const text = Array.isArray(value) ? value.find(Boolean) : value;
    if (text) candidates.push(text);
  }

  function inferAutoTitle(source) {
    const tab = source || {};
    const signals = tab.titleSignals && typeof tab.titleSignals === 'object' ? tab.titleSignals : {};
    const originalTitle = toText(tab.originalTitle || tab.title);
    const originalKey = titleKey(originalTitle);
    const originalCleaned = cleanPaperTitle(originalTitle);
    const originalAlreadyClean = titleKey(originalCleaned) === originalKey && originalCleaned === trimTitlePunctuation(decodeBasicHtmlEntities(originalTitle));
    const candidates = [];

    pushTitleCandidate(candidates, tab.paperTitle);
    pushTitleCandidate(candidates, tab.inferredTitle);
    pushTitleCandidate(candidates, tab.autoTitle);
    pushTitleCandidate(candidates, signals.citationTitle);
    pushTitleCandidate(candidates, signals.dcTitle);
    pushTitleCandidate(candidates, signals.schemaTitle);
    pushTitleCandidate(candidates, signals.headingTitle);
    pushTitleCandidate(candidates, signals.ogTitle);
    pushTitleCandidate(candidates, signals.twitterTitle);
    pushTitleCandidate(candidates, signals.documentTitle);
    pushTitleCandidate(candidates, tab.title);
    pushTitleCandidate(candidates, titleFromUrl(tab.url));

    const seen = new Set();
    for (const candidate of candidates) {
      const cleaned = cleanPaperTitle(candidate);
      const key = titleKey(cleaned);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      if (!looksLikePaperTitle(cleaned)) continue;
      if (key === originalKey && originalAlreadyClean) continue;
      return cleaned;
    }

    return '';
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
    const originalTitle = toText(source.originalTitle || source.title || source.url || 'Untitled');
    const customTitle = toText(source.customTitle || source.titleAlias).trim();
    const autoTitle = inferAutoTitle({ ...source, originalTitle });
    const tab = {
      id: typeof source.id === 'number' ? source.id : -1,
      windowId: typeof source.windowId === 'number' ? source.windowId : -1,
      index: typeof source.index === 'number' ? source.index : 0,
      title: customTitle || autoTitle || originalTitle,
      originalTitle,
      customTitle,
      autoTitle,
      url: toText(source.url),
      favIconUrl: toText(source.favIconUrl),
      active: source.active === true,
      favorite: source.favorite === true || source.favorited === true,
      pinned: source.pinned === true,
      audible: source.audible === true,
      discarded: source.discarded === true,
      note: toText(source.note),
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
    const autoTitle = lower(tab.autoTitle);
    const originalTitle = lower(tab.originalTitle);
    const note = lower(tab.note);

    return Math.max(
      fieldScore(title, token, 100),
      fieldScore(autoTitle, token, 95),
      fieldScore(originalTitle, token, 75),
      fieldScore(note, token, 65)
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
    if (a.tab.favorite !== b.tab.favorite) return a.tab.favorite ? -1 : 1;
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
    cleanPaperTitle,
    inferAutoTitle,
    tokenize,
  };
});
