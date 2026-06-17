(async function () {
  'use strict';

  const STORAGE_KEY_SCOPE = 'tabFinder.scope';
  const DEFAULT_SCOPE = 'current-window';
  const VALID_SCOPES = new Set(['current-window', 'all-windows']);

  const searchInput = document.getElementById('searchInput');
  const clearBtn = document.getElementById('clearBtn');
  const refreshBtn = document.getElementById('refreshBtn');
  const resultsEl = document.getElementById('results');
  const emptyState = document.getElementById('emptyState');
  const resultCount = document.getElementById('resultCount');
  const scopeLabel = document.getElementById('scopeLabel');
  const scopeButtons = Array.from(document.querySelectorAll('.scope-btn'));

  let tabs = [];
  let scope = DEFAULT_SCOPE;
  let currentWindowId = null;
  let selectedIndex = 0;
  let currentResults = [];
  let composing = false;

  function setScopeButtons() {
    for (const button of scopeButtons) {
      const active = button.dataset.scope === scope;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    }
  }

  function scopeText() {
    return scope === 'all-windows' ? '모든 창' : '현재 창';
  }

  function baseVisibleCount() {
    if (scope === 'all-windows' || typeof currentWindowId !== 'number') return tabs.length;
    return tabs.filter(tab => tab.windowId === currentWindowId).length;
  }

  function displayPath(tab) {
    const pathWithoutNoise = (tab.path || '').split(/[?#]/, 1)[0];
    const path = pathWithoutNoise && pathWithoutNoise !== '/' ? pathWithoutNoise : '';
    if (!tab.host) return tab.decodedUrl || tab.url || '';
    return `${tab.host}${path}`;
  }

  function makeBadge(text, extraClass) {
    const badge = document.createElement('span');
    badge.className = `badge${extraClass ? ` ${extraClass}` : ''}`;
    badge.textContent = text;
    return badge;
  }

  function faviconFor(tab) {
    if (tab.favIconUrl) {
      const img = document.createElement('img');
      img.className = 'favicon';
      img.src = tab.favIconUrl;
      img.alt = '';
      img.addEventListener('error', () => {
        img.replaceWith(fallbackIcon(tab));
      }, { once: true });
      return img;
    }
    return fallbackIcon(tab);
  }

  function fallbackIcon(tab) {
    const fallback = document.createElement('span');
    fallback.className = 'favicon-fallback';
    fallback.textContent = (tab.host || tab.title || '?').slice(0, 1).toUpperCase();
    return fallback;
  }

  function renderResult(result, index) {
    const tab = result.tab;
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'result-row';
    row.dataset.index = String(index);
    row.setAttribute('role', 'option');
    row.setAttribute('aria-selected', String(index === selectedIndex));
    row.classList.toggle('selected', index === selectedIndex);

    const main = document.createElement('span');
    main.className = 'tab-main';

    const title = document.createElement('span');
    title.className = 'tab-title';
    title.textContent = tab.title || 'Untitled';

    const url = document.createElement('span');
    url.className = 'tab-url';
    url.textContent = displayPath(tab);
    url.title = tab.decodedUrl || tab.url || '';

    main.append(title, url);

    const badges = document.createElement('span');
    badges.className = 'badges';
    if (scope === 'all-windows' && typeof currentWindowId === 'number' && tab.windowId !== currentWindowId) {
      badges.append(makeBadge('다른 창', 'window'));
    }
    if (tab.active) badges.append(makeBadge('active', 'active'));
    if (tab.pinned) badges.append(makeBadge('pinned', 'pinned'));
    if (tab.audible) badges.append(makeBadge('audio', 'audible'));
    if (tab.discarded) badges.append(makeBadge('sleep', 'discarded'));
    for (const tag of tab.tags || []) {
      badges.append(makeBadge(tag, tag));
    }

    row.append(faviconFor(tab), main, badges);
    row.addEventListener('click', () => openResult(index));
    return row;
  }

  function render() {
    currentResults = window.TabSearch.searchTabs(tabs, searchInput.value, {
      scope,
      currentWindowId,
    });
    if (selectedIndex >= currentResults.length) selectedIndex = Math.max(0, currentResults.length - 1);

    const visibleCount = baseVisibleCount();
    resultCount.textContent = `${currentResults.length}/${visibleCount}`;
    scopeLabel.textContent = scopeText();
    setScopeButtons();

    resultsEl.textContent = '';
    emptyState.hidden = currentResults.length > 0;
    resultsEl.hidden = currentResults.length === 0;

    for (let i = 0; i < currentResults.length; i += 1) {
      resultsEl.append(renderResult(currentResults[i], i));
    }
  }

  async function refreshTabs() {
    refreshBtn.disabled = true;
    try {
      const [activeTabs, currentWindowTabs, allTabs] = await Promise.all([
        chrome.tabs.query({ active: true, currentWindow: true }),
        chrome.tabs.query({ currentWindow: true }),
        chrome.tabs.query({}),
      ]);
      currentWindowId = activeTabs[0]?.windowId ?? currentWindowTabs[0]?.windowId ?? null;
      tabs = allTabs.map(window.TabSearch.normalizeTab);
      selectedIndex = 0;
      render();
    } finally {
      refreshBtn.disabled = false;
    }
  }

  async function loadScope() {
    try {
      const data = await chrome.storage.local.get(STORAGE_KEY_SCOPE);
      const saved = data[STORAGE_KEY_SCOPE];
      scope = VALID_SCOPES.has(saved) ? saved : DEFAULT_SCOPE;
    } catch (_) {
      scope = DEFAULT_SCOPE;
    }
  }

  async function saveScope(nextScope) {
    scope = VALID_SCOPES.has(nextScope) ? nextScope : DEFAULT_SCOPE;
    selectedIndex = 0;
    setScopeButtons();
    render();
    try {
      await chrome.storage.local.set({ [STORAGE_KEY_SCOPE]: scope });
    } catch (_) {
      // The popup still works if persistence is unavailable.
    }
  }

  async function openResult(index) {
    const result = currentResults[index];
    if (!result) return;
    const tab = result.tab;
    try {
      if (typeof tab.id === 'number' && tab.id >= 0) {
        await chrome.tabs.update(tab.id, { active: true });
      }
      if (typeof tab.windowId === 'number' && tab.windowId >= 0) {
        await chrome.windows.update(tab.windowId, { focused: true });
      }
      window.close();
    } catch (error) {
      scopeLabel.textContent = error?.message || '탭을 열 수 없음';
    }
  }

  function setSelectedIndex(nextIndex) {
    if (!currentResults.length) {
      selectedIndex = 0;
      return;
    }
    selectedIndex = (nextIndex + currentResults.length) % currentResults.length;
    const rows = Array.from(resultsEl.querySelectorAll('.result-row'));
    rows.forEach((row, index) => {
      const selected = index === selectedIndex;
      row.classList.toggle('selected', selected);
      row.setAttribute('aria-selected', String(selected));
    });
    rows[selectedIndex]?.scrollIntoView({ block: 'nearest' });
  }

  function bindEvents() {
    searchInput.addEventListener('compositionstart', () => {
      composing = true;
    });
    searchInput.addEventListener('compositionend', () => {
      composing = false;
      selectedIndex = 0;
      render();
    });
    searchInput.addEventListener('input', () => {
      if (composing) return;
      selectedIndex = 0;
      render();
    });
    searchInput.addEventListener('keydown', event => {
      if (event.isComposing) return;
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSelectedIndex(selectedIndex + 1);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSelectedIndex(selectedIndex - 1);
      } else if (event.key === 'Enter') {
        event.preventDefault();
        openResult(selectedIndex);
      } else if (event.key === 'Escape' && searchInput.value) {
        searchInput.value = '';
        selectedIndex = 0;
        render();
      }
    });

    clearBtn.addEventListener('click', () => {
      searchInput.value = '';
      selectedIndex = 0;
      render();
      searchInput.focus();
    });

    refreshBtn.addEventListener('click', refreshTabs);

    for (const button of scopeButtons) {
      button.addEventListener('click', () => {
        saveScope(button.dataset.scope);
        searchInput.focus();
      });
    }
  }

  bindEvents();
  await loadScope();
  await refreshTabs();
  searchInput.focus();
})();
