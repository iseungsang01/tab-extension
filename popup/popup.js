(async function () {
  'use strict';

  const STORAGE_KEY_SCOPE = 'tabFinder.scope';
  const STORAGE_KEY_NOTES = 'tabFinder.tabNotes.v1';
  const STORAGE_KEY_TITLES = 'tabFinder.tabTitles.v1';
  const DEFAULT_SCOPE = 'current-window';
  const VALID_SCOPES = new Set(['current-window', 'all-windows']);
  const SAVE_DELAY_MS = 350;
  const TITLE_MAX_LENGTH = 160;
  const NOTE_MAX_LENGTH = 2000;

  const searchInput = document.getElementById('searchInput');
  const clearBtn = document.getElementById('clearBtn');
  const refreshBtn = document.getElementById('refreshBtn');
  const resultsEl = document.getElementById('results');
  const emptyState = document.getElementById('emptyState');
  const resultCount = document.getElementById('resultCount');
  const scopeLabel = document.getElementById('scopeLabel');
  const scopeButtons = Array.from(document.querySelectorAll('.scope-btn'));

  let tabs = [];
  let notesByTabId = {};
  let titlesByTabId = {};
  let saveTimer = null;
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

  function tabKey(tabOrId) {
    let id = tabOrId;
    if (tabOrId && typeof tabOrId === 'object') id = tabOrId.id;
    if (typeof id === 'number' && id >= 0) return String(id);
    if (typeof id === 'string' && /^\d+$/.test(id)) return id;
    return '';
  }

  function normalizeStoredTextMap(value, maxLength) {
    const normalized = {};
    if (!value || typeof value !== 'object' || Array.isArray(value)) return normalized;

    for (const [key, storedValue] of Object.entries(value)) {
      const text = typeof storedValue === 'string'
        ? storedValue
        : storedValue && typeof storedValue.note === 'string'
          ? storedValue.note
          : storedValue && typeof storedValue.title === 'string'
            ? storedValue.title
            : '';

      if (/^\d+$/.test(key) && text.trim()) {
        normalized[key] = text.slice(0, maxLength);
      }
    }
    return normalized;
  }

  function noteForTab(tabOrId) {
    const key = tabKey(tabOrId);
    return key ? notesByTabId[key] || '' : '';
  }

  function titleForTab(tabOrId) {
    const key = tabKey(tabOrId);
    return key ? titlesByTabId[key] || '' : '';
  }

  function displayTitle(tab) {
    return tab.customTitle || tab.originalTitle || tab.title || 'Untitled';
  }

  function originalTitleForKey(key) {
    const tab = tabs.find(candidate => tabKey(candidate) === key);
    return tab?.originalTitle || '';
  }

  function applySavedTabData(tab) {
    const key = tabKey(tab);
    tab.originalTitle = tab.originalTitle || tab.title || 'Untitled';
    tab.customTitle = key ? titleForTab(key) : '';
    tab.title = displayTitle(tab);
    tab.note = key ? noteForTab(key) : '';
    return tab;
  }

  function updateOpenTabData(tabOrId) {
    const key = tabKey(tabOrId);
    if (!key) return;

    for (const tab of tabs) {
      if (tabKey(tab) !== key) continue;
      tab.customTitle = titleForTab(key);
      tab.title = displayTitle(tab);
      tab.note = noteForTab(key);
    }
  }

  function setInMemoryTitle(tabOrId, value) {
    const key = tabKey(tabOrId);
    if (!key) return;

    const originalTitle = (tabOrId && typeof tabOrId === 'object'
      ? tabOrId.originalTitle
      : originalTitleForKey(key)) || '';
    const text = String(value ?? '').slice(0, TITLE_MAX_LENGTH).trim();

    if (text && text !== originalTitle.trim()) {
      titlesByTabId[key] = text;
    } else {
      delete titlesByTabId[key];
    }
    updateOpenTabData(key);
  }

  function setInMemoryNote(tabOrId, value) {
    const key = tabKey(tabOrId);
    if (!key) return;

    const text = String(value ?? '').slice(0, NOTE_MAX_LENGTH);
    if (text.trim()) {
      notesByTabId[key] = text;
    } else {
      delete notesByTabId[key];
    }
    updateOpenTabData(key);
  }

  async function persistTabData() {
    try {
      await chrome.storage.local.set({
        [STORAGE_KEY_NOTES]: notesByTabId,
        [STORAGE_KEY_TITLES]: titlesByTabId,
      });
      return true;
    } catch (_) {
      return false;
    }
  }

  async function loadTabData() {
    try {
      const data = await chrome.storage.local.get([STORAGE_KEY_NOTES, STORAGE_KEY_TITLES]);
      notesByTabId = normalizeStoredTextMap(data[STORAGE_KEY_NOTES], NOTE_MAX_LENGTH);
      titlesByTabId = normalizeStoredTextMap(data[STORAGE_KEY_TITLES], TITLE_MAX_LENGTH);
    } catch (_) {
      notesByTabId = {};
      titlesByTabId = {};
    }
  }

  async function pruneTabDataForTabs(openTabs) {
    const openKeys = new Set((openTabs || []).map(tabKey).filter(Boolean));
    let changed = false;

    for (const key of Object.keys(notesByTabId)) {
      if (!openKeys.has(key)) {
        delete notesByTabId[key];
        changed = true;
      }
    }

    for (const key of Object.keys(titlesByTabId)) {
      if (!openKeys.has(key)) {
        delete titlesByTabId[key];
        changed = true;
      }
    }

    if (changed) await persistTabData();
  }

  function scheduleSave(statusEl) {
    if (statusEl) {
      statusEl.textContent = '저장 중...';
      statusEl.classList.remove('error');
    }

    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      saveTimer = null;
      const saved = await persistTabData();
      if (!statusEl || !statusEl.isConnected) return;

      statusEl.textContent = saved ? '저장됨' : '저장 실패';
      statusEl.classList.toggle('error', !saved);
    }, SAVE_DELAY_MS);
  }

  async function flushPendingSaves() {
    if (!saveTimer) return;
    clearTimeout(saveTimer);
    saveTimer = null;
    await persistTabData();
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
    fallback.textContent = (tab.host || displayTitle(tab) || '?').slice(0, 1).toUpperCase();
    return fallback;
  }

  function stopRowAction(event) {
    event.stopPropagation();
  }

  function renderResult(result, index) {
    const tab = result.tab;
    const hasNote = Boolean((tab.note || '').trim());
    const hasCustomTitle = Boolean((tab.customTitle || '').trim());

    const row = document.createElement('div');
    row.className = 'result-row';
    row.dataset.index = String(index);
    row.tabIndex = index === selectedIndex ? 0 : -1;
    row.setAttribute('role', 'option');
    row.setAttribute('aria-selected', String(index === selectedIndex));
    row.classList.toggle('selected', index === selectedIndex);
    row.classList.toggle('has-note', hasNote);
    row.classList.toggle('has-custom-title', hasCustomTitle);

    const main = document.createElement('div');
    main.className = 'tab-main';

    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.className = 'tab-title-input';
    titleInput.maxLength = TITLE_MAX_LENGTH;
    titleInput.value = displayTitle(tab);
    titleInput.placeholder = tab.originalTitle || '탭 제목';
    titleInput.title = hasCustomTitle ? `원래 제목: ${tab.originalTitle}` : displayTitle(tab);
    titleInput.setAttribute('aria-label', '탭 제목 수정');
    titleInput.classList.toggle('custom-title', hasCustomTitle);

    const noteTextarea = document.createElement('textarea');
    noteTextarea.className = 'tab-note-input';
    noteTextarea.maxLength = NOTE_MAX_LENGTH;
    noteTextarea.rows = 2;
    noteTextarea.value = tab.note || '';
    noteTextarea.placeholder = '메모 입력...';
    noteTextarea.setAttribute('aria-label', '탭 메모');

    const controls = document.createElement('div');
    controls.className = 'row-controls';

    const badges = document.createElement('span');
    badges.className = 'badges';
    if (scope === 'all-windows' && typeof currentWindowId === 'number' && tab.windowId !== currentWindowId) {
      badges.append(makeBadge('다른 창', 'window'));
    }
    if (hasCustomTitle) badges.append(makeBadge('제목', 'custom-title'));
    if (tab.active) badges.append(makeBadge('active', 'active'));
    if (tab.pinned) badges.append(makeBadge('pinned', 'pinned'));
    if (tab.audible) badges.append(makeBadge('audio', 'audible'));
    if (tab.discarded) badges.append(makeBadge('sleep', 'discarded'));
    for (const tag of tab.tags || []) {
      badges.append(makeBadge(tag, tag));
    }

    const status = document.createElement('span');
    status.className = 'row-status';
    status.textContent = hasNote || hasCustomTitle ? '저장됨' : '';

    const openButton = document.createElement('button');
    openButton.type = 'button';
    openButton.className = 'open-tab-btn';
    openButton.textContent = '열기';
    openButton.addEventListener('click', event => {
      event.stopPropagation();
      openResult(index);
    });

    titleInput.addEventListener('click', stopRowAction);
    titleInput.addEventListener('keydown', event => {
      event.stopPropagation();
      if (event.key === 'Enter') {
        event.preventDefault();
        if (event.ctrlKey || event.metaKey) {
          openResult(index);
        } else {
          titleInput.blur();
        }
      }
    });
    titleInput.addEventListener('input', () => {
      setInMemoryTitle(tab, titleInput.value);
      const edited = Boolean(tab.customTitle);
      titleInput.classList.toggle('custom-title', edited);
      row.classList.toggle('has-custom-title', edited);
      scheduleSave(status);
    });
    titleInput.addEventListener('blur', () => {
      if (!titleInput.value.trim()) {
        titleInput.value = displayTitle(tab);
      }
    });

    noteTextarea.addEventListener('click', stopRowAction);
    noteTextarea.addEventListener('keydown', event => {
      event.stopPropagation();
      if (event.key === 'Escape') {
        noteTextarea.blur();
      } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        openResult(index);
      }
    });
    noteTextarea.addEventListener('input', () => {
      setInMemoryNote(tab, noteTextarea.value);
      row.classList.toggle('has-note', Boolean(tab.note.trim()));
      scheduleSave(status);
    });

    main.append(titleInput, noteTextarea);
    controls.append(badges, status, openButton);
    row.append(faviconFor(tab), main, controls);

    row.addEventListener('click', event => {
      if (event.target.closest('input, textarea, button')) return;
      openResult(index);
    });

    row.addEventListener('keydown', event => {
      if (event.target.closest('input, textarea, button')) return;
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openResult(index);
      }
    });

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
      await pruneTabDataForTabs(allTabs);
      tabs = allTabs.map(tab => applySavedTabData(window.TabSearch.normalizeTab(tab)));
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
      await flushPendingSaves();
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
      row.tabIndex = selected ? 0 : -1;
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

    window.addEventListener('beforeunload', () => {
      if (!saveTimer) return;
      clearTimeout(saveTimer);
      saveTimer = null;
      chrome.storage.local.set({
        [STORAGE_KEY_NOTES]: notesByTabId,
        [STORAGE_KEY_TITLES]: titlesByTabId,
      });
    });
  }

  bindEvents();
  await Promise.all([loadScope(), loadTabData()]);
  await refreshTabs();
  searchInput.focus();
})();
