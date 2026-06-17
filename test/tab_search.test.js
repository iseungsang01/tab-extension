const { test } = require('node:test');
const assert = require('node:assert/strict');

const TabSearch = require('../lib/tab_search.js');

function tab(overrides) {
  return TabSearch.normalizeTab({
    id: overrides.id,
    windowId: overrides.windowId ?? 1,
    index: overrides.index ?? 0,
    title: overrides.title,
    url: overrides.url,
    active: overrides.active,
    pinned: overrides.pinned,
    audible: overrides.audible,
    discarded: overrides.discarded,
    favIconUrl: overrides.favIconUrl,
  });
}

const tabs = [
  tab({
    id: 1,
    windowId: 1,
    index: 0,
    title: 'Attention Is All You Need',
    url: 'https://arxiv.org/abs/1706.03762',
    active: true,
  }),
  tab({
    id: 2,
    windowId: 1,
    index: 1,
    title: 'Graph Neural Network Survey.pdf',
    url: 'https://example.com/files/gnn-survey.pdf',
  }),
  tab({
    id: 3,
    windowId: 2,
    index: 0,
    title: 'Semantic Scholar - RAG Systems',
    url: 'https://www.semanticscholar.org/paper/rag-systems/abc',
  }),
  tab({
    id: 4,
    windowId: 2,
    index: 1,
    title: 'OpenReview discussion',
    url: 'https://openreview.net/forum?id=test',
    pinned: true,
  }),
  tab({
    id: 5,
    windowId: 1,
    index: 2,
    title: 'Encoded paper note',
    url: 'https://example.com/research/space%20paper',
  }),
];

test('normalizes URL host, decoded URL, and paper tags', () => {
  assert.equal(tabs[0].host, 'arxiv.org');
  assert.ok(tabs[0].decodedUrl.includes('1706.03762'));
  assert.deepEqual(tabs[1].tags, ['pdf']);
  assert.ok(tabs[2].tags.includes('semantic'));
});

test('searches by title case-insensitively', () => {
  const results = TabSearch.searchTabs(tabs, 'attention', {
    scope: 'current-window',
    currentWindowId: 1,
  });
  assert.deepEqual(results.map(result => result.tab.id), [1]);
});

test('searches by hostname and URL path', () => {
  const arxiv = TabSearch.searchTabs(tabs, 'arxiv 1706', {
    scope: 'all-windows',
    currentWindowId: 1,
  });
  assert.deepEqual(arxiv.map(result => result.tab.id), [1]);

  const path = TabSearch.searchTabs(tabs, 'rag systems', {
    scope: 'all-windows',
    currentWindowId: 1,
  });
  assert.deepEqual(path.map(result => result.tab.id), [3]);
});

test('requires every query token to match', () => {
  const results = TabSearch.searchTabs(tabs, 'graph survey', {
    scope: 'current-window',
    currentWindowId: 1,
  });
  assert.deepEqual(results.map(result => result.tab.id), [2]);

  const miss = TabSearch.searchTabs(tabs, 'graph transformer', {
    scope: 'current-window',
    currentWindowId: 1,
  });
  assert.equal(miss.length, 0);
});

test('searches decoded URLs', () => {
  const results = TabSearch.searchTabs(tabs, 'space paper', {
    scope: 'current-window',
    currentWindowId: 1,
  });
  assert.deepEqual(results.map(result => result.tab.id), [5]);
});

test('filters current window by default and can search all windows', () => {
  const current = TabSearch.searchTabs(tabs, '', {
    scope: 'current-window',
    currentWindowId: 1,
  });
  assert.deepEqual(current.map(result => result.tab.id), [1, 2, 5]);

  const all = TabSearch.searchTabs(tabs, '', {
    scope: 'all-windows',
    currentWindowId: 1,
  });
  assert.deepEqual(all.map(result => result.tab.id), [1, 4, 2, 5, 3]);
});

test('sorts title matches above weaker URL matches when status is equal', () => {
  const sample = [
    tab({ id: 10, windowId: 1, index: 0, title: 'Unrelated', url: 'https://example.com/graph' }),
    tab({ id: 11, windowId: 1, index: 1, title: 'Graph database paper', url: 'https://example.com/db' }),
  ];
  const results = TabSearch.searchTabs(sample, 'graph', {
    scope: 'current-window',
    currentWindowId: 1,
  });
  assert.deepEqual(results.map(result => result.tab.id), [11, 10]);
});

test('classifies common paper destinations', () => {
  const doi = tab({ id: 20, title: 'DOI', url: 'https://doi.org/10.1145/test' });
  const scholar = tab({ id: 21, title: 'Scholar', url: 'https://scholar.google.com/scholar?q=test' });
  const openreview = tab({ id: 22, title: 'Review', url: 'https://openreview.net/forum?id=abc' });

  assert.ok(doi.tags.includes('doi'));
  assert.ok(scholar.tags.includes('scholar'));
  assert.ok(openreview.tags.includes('openreview'));
});
