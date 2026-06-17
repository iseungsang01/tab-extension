(async function () {
  'use strict';

  const STORAGE_KEY_SCOPE = 'tabFinder.scope';
  const STORAGE_KEY_NOTES = 'tabFinder.tabNotes.v1';
  const STORAGE_KEY_TITLES = 'tabFinder.tabTitles.v1';
  const STORAGE_KEY_FAVORITES = 'tabFinder.favorites.v1';
  const DEFAULT_SCOPE = 'current-window';
  const VALID_SCOPES = new Set(['current-window', 'all-windows']);
  const DEFAULT_VIEW_MODE = 'search';
  const VALID_VIEW_MODES = new Set(['search', 'favorites']);
  const SAVE_DELAY_MS = 350;
  const TITLE_MAX_LENGTH = 160;
  const NOTE_MAX_LENGTH = 2000;

  const searchInput = document.getElementById('searchInput');
  const clearBtn = document.getElementById('clearBtn');
  const refreshBtn = document.getElementById('refreshBtn');
  const resultsEl = document.getElementById('results');
  const emptyState = document.getElementById('emptyState');
  const resultCount = document.getElementById('resultCount');
  const favoriteCount = document.getElementById('favoriteCount');
  const headerStats = document.getElementById('headerStats');
  const scopeLabel = document.getElementById('scopeLabel');
  const scopeButtons = Array.from(document.querySelectorAll('.scope-btn'));
  const modeButtons = Array.from(document.querySelectorAll('.mode-tab[data-view-mode]'));
  const resetAllTitlesBtn = document.getElementById('resetAllTitlesBtn');
  const resetAllMemosBtn = document.getElementById('resetAllMemosBtn');
  const bulkResetStatus = document.getElementById('bulkResetStatus');

  let tabs = [];
  let notesByTabId = {};
  let titlesByTabId = {};
  let favoritesByTabId = {};
  let saveTimer = null;
  let scope = DEFAULT_SCOPE;
  let viewMode = DEFAULT_VIEW_MODE;
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

  function setModeButtons() {
    for (const button of modeButtons) {
      const active = button.dataset.viewMode === viewMode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    }
  }

  function scopeText() {
    return scope === 'all-windows' ? '모든 창' : '현재 창';
  }

  function visibleTabsForScope() {
    if (scope === 'all-windows' || typeof currentWindowId !== 'number') return tabs;
    return tabs.filter(tab => tab.windowId === currentWindowId);
  }

  function setViewMode(nextMode) {
    viewMode = VALID_VIEW_MODES.has(nextMode) ? nextMode : DEFAULT_VIEW_MODE;
    selectedIndex = 0;
    setModeButtons();
    render();
  }

  function updateSummaryCounts(
    resultLength = currentResults.length,
    searchResultLength = null,
    favoriteResultLength = null
  ) {
    if (searchResultLength === null || favoriteResultLength === null) {
      const searchResults = window.TabSearch.searchTabs(tabs, searchInput.value, {
        scope,
        currentWindowId,
      });
      const favoriteResults = searchResults.filter(result => result.tab.favorite === true);
      searchResultLength = searchResults.length;
      favoriteResultLength = favoriteResults.length;
    }

    const visibleTabs = visibleTabsForScope();
    const visibleCount = visibleTabs.length;
    const memoTotal = visibleTabs.filter(tab => (tab.note || '').trim()).length;
    const titleTotal = visibleTabs.filter(tab => (tab.customTitle || '').trim()).length;
    const autoTitleTotal = visibleTabs.filter(tab => !(tab.customTitle || '').trim() && (tab.autoTitle || '').trim()).length;
    const favoriteTotal = visibleTabs.filter(tab => tab.favorite).length;
    const denominator = viewMode === 'favorites' ? favoriteTotal : visibleCount;
    const modeText = viewMode === 'favorites' ? '즐겨찾기' : '검색';

    if (resultCount) resultCount.textContent = `${searchResultLength}건`;
    if (favoriteCount) favoriteCount.textContent = String(favoriteResultLength ?? favoriteTotal);
    if (headerStats) headerStats.textContent = `탭 ${visibleCount} · 즐겨찾기 ${favoriteTotal} · 메모 ${memoTotal} · 수동 ${titleTotal} · 자동 ${autoTitleTotal}`;
    if (scopeLabel) scopeLabel.textContent = `${scopeText()} · ${modeText} ${resultLength}/${denominator}`;
    updateBulkResetControls(titleTotal, memoTotal);
  }

  function updateBulkResetControls(titleTotal = null, memoTotal = null) {
    const visibleTabs = visibleTabsForScope();
    const manualTitleCount = titleTotal ?? visibleTabs.filter(tab => (tab.customTitle || '').trim()).length;
    const memoCount = memoTotal ?? visibleTabs.filter(tab => (tab.note || '').trim()).length;

    if (resetAllTitlesBtn) {
      resetAllTitlesBtn.disabled = manualTitleCount === 0;
      resetAllTitlesBtn.title = `${scopeText()}의 수동 제목 ${manualTitleCount}개 초기화 (자동 제목은 유지)`;
    }

    if (resetAllMemosBtn) {
      resetAllMemosBtn.disabled = memoCount === 0;
      resetAllMemosBtn.title = `${scopeText()}의 메모 ${memoCount}개 초기화`;
    }

    if (bulkResetStatus && !bulkResetStatus.dataset.locked) {
      bulkResetStatus.textContent = `${scopeText()} 기준`;
      bulkResetStatus.classList.remove('error');
    }
  }

  function showBulkResetStatus(text, isError = false) {
    if (!bulkResetStatus) return;

    bulkResetStatus.dataset.locked = 'true';
    bulkResetStatus.textContent = text;
    bulkResetStatus.classList.toggle('error', isError);
    window.setTimeout(() => {
      if (!bulkResetStatus) return;
      delete bulkResetStatus.dataset.locked;
      updateBulkResetControls();
    }, 1400);
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

  function normalizeStoredBooleanMap(value) {
    const normalized = {};
    if (!value || typeof value !== 'object' || Array.isArray(value)) return normalized;

    for (const [key, storedValue] of Object.entries(value)) {
      if (/^\d+$/.test(key) && storedValue === true) {
        normalized[key] = true;
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

  function favoriteForTab(tabOrId) {
    const key = tabKey(tabOrId);
    return key ? favoritesByTabId[key] === true : false;
  }

  function displayTitle(tab) {
    return tab.customTitle || tab.autoTitle || tab.originalTitle || tab.title || 'Untitled';
  }

  function fallbackTitle(tab) {
    return tab?.autoTitle || tab?.originalTitle || tab?.title || 'Untitled';
  }

  function originalTitleForKey(key) {
    const tab = tabs.find(candidate => tabKey(candidate) === key);
    return tab?.originalTitle || '';
  }

  function applySavedTabData(tab) {
    const key = tabKey(tab);
    tab.originalTitle = tab.originalTitle || tab.title || 'Untitled';
    tab.autoTitle = tab.autoTitle || '';
    tab.customTitle = key ? titleForTab(key) : '';
    tab.title = displayTitle(tab);
    tab.note = key ? noteForTab(key) : '';
    tab.favorite = key ? favoriteForTab(key) : false;
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
      tab.favorite = favoriteForTab(key);
    }
  }

  function setInMemoryTitle(tabOrId, value) {
    const key = tabKey(tabOrId);
    if (!key) return;

    const baseTitle = (tabOrId && typeof tabOrId === 'object'
      ? fallbackTitle(tabOrId)
      : fallbackTitle(tabs.find(candidate => tabKey(candidate) === key)) || originalTitleForKey(key)) || '';
    const text = String(value ?? '').slice(0, TITLE_MAX_LENGTH).trim();

    if (text && text !== baseTitle.trim()) {
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

  function setInMemoryFavorite(tabOrId, value) {
    const key = tabKey(tabOrId);
    if (!key) return;

    if (value === true) {
      favoritesByTabId[key] = true;
    } else {
      delete favoritesByTabId[key];
    }
    updateOpenTabData(key);
  }

  async function resetAllTitlesInScope() {
    const scopedKeys = new Set(visibleTabsForScope().map(tabKey).filter(Boolean));
    let changed = 0;

    for (const key of scopedKeys) {
      if (!Object.prototype.hasOwnProperty.call(titlesByTabId, key)) continue;
      delete titlesByTabId[key];
      updateOpenTabData(key);
      changed += 1;
    }

    if (changed === 0) {
      updateBulkResetControls();
      return;
    }

    selectedIndex = 0;
    const saved = await persistTabData();
    render();
    showBulkResetStatus(saved ? `제목 ${changed}개 초기화됨` : '저장 실패', !saved);
  }

  async function resetAllMemosInScope() {
    const scopedKeys = new Set(visibleTabsForScope().map(tabKey).filter(Boolean));
    let changed = 0;

    for (const key of scopedKeys) {
      if (!Object.prototype.hasOwnProperty.call(notesByTabId, key)) continue;
      delete notesByTabId[key];
      updateOpenTabData(key);
      changed += 1;
    }

    if (changed === 0) {
      updateBulkResetControls();
      return;
    }

    selectedIndex = 0;
    const saved = await persistTabData();
    render();
    showBulkResetStatus(saved ? `메모 ${changed}개 초기화됨` : '저장 실패', !saved);
  }

  async function persistTabData() {
    try {
      await chrome.storage.local.set({
        [STORAGE_KEY_NOTES]: notesByTabId,
        [STORAGE_KEY_TITLES]: titlesByTabId,
        [STORAGE_KEY_FAVORITES]: favoritesByTabId,
      });
      return true;
    } catch (_) {
      return false;
    }
  }

  async function loadTabData() {
    try {
      const data = await chrome.storage.local.get([STORAGE_KEY_NOTES, STORAGE_KEY_TITLES, STORAGE_KEY_FAVORITES]);
      notesByTabId = normalizeStoredTextMap(data[STORAGE_KEY_NOTES], NOTE_MAX_LENGTH);
      titlesByTabId = normalizeStoredTextMap(data[STORAGE_KEY_TITLES], TITLE_MAX_LENGTH);
      favoritesByTabId = normalizeStoredBooleanMap(data[STORAGE_KEY_FAVORITES]);
    } catch (_) {
      notesByTabId = {};
      titlesByTabId = {};
      favoritesByTabId = {};
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

    for (const key of Object.keys(favoritesByTabId)) {
      if (!openKeys.has(key)) {
        delete favoritesByTabId[key];
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
    const hasAutoTitle = !hasCustomTitle && Boolean((tab.autoTitle || '').trim());
    const hasFavorite = tab.favorite === true;
    const primaryTag = (tab.tags || [])[0] || (hasAutoTitle ? 'auto' : hasNote ? 'memo' : 'tab');

    const row = document.createElement('div');
    row.className = 'result-row';
    row.dataset.index = String(index);
    row.tabIndex = index === selectedIndex ? 0 : -1;
    row.setAttribute('role', 'option');
    row.setAttribute('aria-selected', String(index === selectedIndex));
    row.classList.toggle('selected', index === selectedIndex);
    row.classList.toggle('has-note', hasNote);
    row.classList.toggle('has-custom-title', hasCustomTitle);
    row.classList.toggle('has-auto-title', hasAutoTitle);
    row.classList.toggle('is-favorite', hasFavorite);

    const main = document.createElement('div');
    main.className = 'tab-main';

    const rowHead = document.createElement('div');
    rowHead.className = 'row-head';

    const meta = document.createElement('div');
    meta.className = 'row-meta';

    const typeBadge = makeBadge(primaryTag, primaryTag);
    typeBadge.classList.add('type-badge');

    const host = document.createElement('span');
    host.className = 'row-host';
    host.textContent = tab.host || 'local tab';
    host.title = tab.host || tab.url || displayTitle(tab);

    meta.append(typeBadge, faviconFor(tab), host);
    if (scope === 'all-windows' && typeof currentWindowId === 'number' && tab.windowId !== currentWindowId) {
      meta.append(makeBadge('다른 창', 'window'));
    }
    if (tab.active) meta.append(makeBadge('active', 'active'));

    const favoriteButton = document.createElement('button');
    favoriteButton.type = 'button';
    favoriteButton.className = 'favorite-tab-btn';
    favoriteButton.textContent = hasFavorite ? '★' : '☆';
    favoriteButton.title = hasFavorite ? '즐겨찾기 해제' : '즐겨찾기 추가';
    favoriteButton.setAttribute('aria-label', favoriteButton.title);
    favoriteButton.setAttribute('aria-pressed', String(hasFavorite));
    favoriteButton.addEventListener('click', event => {
      event.stopPropagation();
      const nextFavorite = !tab.favorite;
      setInMemoryFavorite(tab, nextFavorite);
      favoriteButton.textContent = nextFavorite ? '★' : '☆';
      favoriteButton.title = nextFavorite ? '즐겨찾기 해제' : '즐겨찾기 추가';
      favoriteButton.setAttribute('aria-label', favoriteButton.title);
      favoriteButton.setAttribute('aria-pressed', String(nextFavorite));
      favoriteButton.classList.toggle('active', nextFavorite);
      syncRowState();
      scheduleSave(status);
      render();
    });
    favoriteButton.classList.toggle('active', hasFavorite);

    const openButton = document.createElement('button');
    openButton.type = 'button';
    openButton.className = 'open-tab-btn';
    openButton.textContent = '열기';
    openButton.addEventListener('click', event => {
      event.stopPropagation();
      openResult(index);
    });

    const actions = document.createElement('div');
    actions.className = 'row-actions';
    actions.append(favoriteButton, openButton);

    rowHead.append(meta, actions);

    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.className = 'tab-title-input';
    titleInput.maxLength = TITLE_MAX_LENGTH;
    titleInput.value = displayTitle(tab);
    titleInput.placeholder = tab.originalTitle || '탭 제목';
    titleInput.title = hasCustomTitle
      ? `수동 제목 · 원래 탭 제목: ${tab.originalTitle}`
      : hasAutoTitle
        ? `자동 제목 적용됨 · 원래 탭 제목: ${tab.originalTitle}`
        : displayTitle(tab);
    titleInput.setAttribute('aria-label', '탭 제목 수정');
    titleInput.classList.toggle('custom-title', hasCustomTitle);
    titleInput.classList.toggle('auto-title', hasAutoTitle);

    const noteTextarea = document.createElement('textarea');
    noteTextarea.className = 'tab-note-input';
    noteTextarea.maxLength = NOTE_MAX_LENGTH;
    noteTextarea.rows = 2;
    noteTextarea.value = tab.note || '';
    noteTextarea.placeholder = '메모 입력...';
    noteTextarea.setAttribute('aria-label', '탭 메모');

    const rowFooter = document.createElement('div');
    rowFooter.className = 'row-footer';

    const badges = document.createElement('span');
    badges.className = 'badges';
    if (hasFavorite) badges.append(makeBadge('즐겨찾기', 'favorite'));
    if (hasCustomTitle) {
      badges.append(makeBadge('수동 제목', 'custom-title'));
    } else if (hasAutoTitle) {
      badges.append(makeBadge('자동 제목', 'auto-title'));
    }
    if (tab.pinned) badges.append(makeBadge('pinned', 'pinned'));
    if (tab.audible) badges.append(makeBadge('audio', 'audible'));
    if (tab.discarded) badges.append(makeBadge('sleep', 'discarded'));
    for (const tag of tab.tags || []) {
      badges.append(makeBadge(tag, tag));
    }

    const status = document.createElement('span');
    status.className = 'row-status';
    status.textContent = hasNote || hasCustomTitle || hasFavorite ? '저장됨' : hasAutoTitle ? '자동 적용' : '';

    const resetActions = document.createElement('div');
    resetActions.className = 'row-reset-actions';

    const resetTitleButton = document.createElement('button');
    resetTitleButton.type = 'button';
    resetTitleButton.className = 'reset-btn';
    resetTitleButton.textContent = '제목 초기화';
    resetTitleButton.title = '수동 제목만 지우고 자동 제목은 유지';
    resetTitleButton.setAttribute('aria-label', resetTitleButton.title);

    const resetMemoButton = document.createElement('button');
    resetMemoButton.type = 'button';
    resetMemoButton.className = 'reset-btn';
    resetMemoButton.textContent = '메모 초기화';
    resetMemoButton.title = '이 탭의 메모 지우기';
    resetMemoButton.setAttribute('aria-label', resetMemoButton.title);

    resetActions.append(resetTitleButton, resetMemoButton);

    const refreshBadges = () => {
      const edited = Boolean((tab.customTitle || '').trim());
      const autoApplied = !edited && Boolean((tab.autoTitle || '').trim());

      badges.textContent = '';
      if (tab.favorite) badges.append(makeBadge('즐겨찾기', 'favorite'));
      if (edited) {
        badges.append(makeBadge('수동 제목', 'custom-title'));
      } else if (autoApplied) {
        badges.append(makeBadge('자동 제목', 'auto-title'));
      }
      if (tab.pinned) badges.append(makeBadge('pinned', 'pinned'));
      if (tab.audible) badges.append(makeBadge('audio', 'audible'));
      if (tab.discarded) badges.append(makeBadge('sleep', 'discarded'));
      for (const tag of tab.tags || []) {
        badges.append(makeBadge(tag, tag));
      }
    };

    const syncRowState = () => {
      const noteExists = Boolean((tab.note || '').trim());
      const edited = Boolean((tab.customTitle || '').trim());
      const autoApplied = !edited && Boolean((tab.autoTitle || '').trim());

      titleInput.classList.toggle('custom-title', edited);
      titleInput.classList.toggle('auto-title', autoApplied);
      row.classList.toggle('has-note', noteExists);
      row.classList.toggle('has-custom-title', edited);
      row.classList.toggle('has-auto-title', autoApplied);
      row.classList.toggle('is-favorite', tab.favorite === true);
      resetTitleButton.disabled = !edited;
      resetMemoButton.disabled = !noteExists;
      status.textContent = noteExists || edited || tab.favorite ? '저장됨' : autoApplied ? '자동 적용' : '';
      refreshBadges();
    };

    syncRowState();

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
      syncRowState();
      scheduleSave(status);
      updateSummaryCounts();
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
      syncRowState();
      scheduleSave(status);
      updateSummaryCounts();
    });

    resetTitleButton.addEventListener('click', event => {
      event.stopPropagation();
      setInMemoryTitle(tab, '');
      titleInput.value = displayTitle(tab);
      syncRowState();
      scheduleSave(status);
      updateSummaryCounts();
    });

    resetMemoButton.addEventListener('click', event => {
      event.stopPropagation();
      setInMemoryNote(tab, '');
      noteTextarea.value = '';
      syncRowState();
      scheduleSave(status);
      updateSummaryCounts();
    });

    rowFooter.append(badges, status);
    main.append(rowHead, titleInput, noteTextarea, rowFooter, resetActions);
    row.append(main);

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
    const searchResults = window.TabSearch.searchTabs(tabs, searchInput.value, {
      scope,
      currentWindowId,
    });
    const favoriteResults = searchResults.filter(result => result.tab.favorite === true);
    currentResults = viewMode === 'favorites' ? favoriteResults : searchResults;
    if (selectedIndex >= currentResults.length) selectedIndex = Math.max(0, currentResults.length - 1);

    updateSummaryCounts(currentResults.length, searchResults.length, favoriteResults.length);
    setScopeButtons();
    setModeButtons();

    resultsEl.textContent = '';
    if (emptyState) {
      const emptyTitle = emptyState.querySelector('strong');
      const emptyMessage = emptyState.querySelector('span');
      const hasQuery = Boolean(searchInput.value.trim());
      if (viewMode === 'favorites') {
        if (emptyTitle) emptyTitle.textContent = '즐겨찾기 없음';
        if (emptyMessage) emptyMessage.textContent = hasQuery
          ? '즐겨찾기 안에서 다른 검색어를 입력하세요.'
          : '별표 버튼으로 즐겨찾기를 추가하세요.';
      } else {
        if (emptyTitle) emptyTitle.textContent = '결과 없음';
        if (emptyMessage) emptyMessage.textContent = '다른 검색어를 입력하세요.';
      }
    }
    emptyState.hidden = currentResults.length > 0;
    resultsEl.hidden = currentResults.length === 0;

    for (let i = 0; i < currentResults.length; i += 1) {
      resultsEl.append(renderResult(currentResults[i], i));
    }
  }

  function canReadPageTitleSignals(tab) {
    return Boolean(
      chrome.scripting?.executeScript &&
      typeof tab?.id === 'number' &&
      /^https?:\/\//i.test(tab.url || '') &&
      !tab.discarded
    );
  }

  function collectPageTitleSignals() {
    const compact = value => String(value || '').replace(/\s+/g, ' ').trim();
    const first = values => values.map(compact).find(Boolean) || '';
    const metaByName = (...names) => {
      for (const name of names) {
        const node = document.querySelector(`meta[name="${name}"], meta[name="${name.toLowerCase()}"], meta[name="${name.toUpperCase()}"]`);
        const content = compact(node?.getAttribute('content'));
        if (content) return content;
      }
      return '';
    };
    const metaByProperty = (...properties) => {
      for (const property of properties) {
        const node = document.querySelector(`meta[property="${property}"], meta[name="${property}"]`);
        const content = compact(node?.getAttribute('content'));
        if (content) return content;
      }
      return '';
    };
    const schemaTitles = [];
    const visitSchema = value => {
      if (!value || schemaTitles.length >= 6) return;
      if (Array.isArray(value)) {
        value.forEach(visitSchema);
        return;
      }
      if (typeof value !== 'object') return;

      const type = String(value['@type'] || '').toLowerCase();
      const scholarly = /scholarlyarticle|article|creativework|publicationissue|report|techarticle/.test(type);
      if (typeof value.headline === 'string') schemaTitles.push(value.headline);
      if (scholarly && typeof value.name === 'string') schemaTitles.push(value.name);
      if (value['@graph']) visitSchema(value['@graph']);
      if (value.mainEntity) visitSchema(value.mainEntity);
    };

    for (const script of Array.from(document.querySelectorAll('script[type="application/ld+json"]')).slice(0, 12)) {
      try {
        visitSchema(JSON.parse(script.textContent || ''));
      } catch (_) {
        // Ignore malformed page-provided JSON-LD.
      }
    }

    const headingTitle = first([
      document.querySelector('h1')?.textContent,
      document.querySelector('[data-testid*="title" i]')?.textContent,
      document.querySelector('.paper-title')?.textContent,
      document.querySelector('.citation__title')?.textContent,
      document.querySelector('#title')?.textContent,
    ]);

    return {
      documentTitle: compact(document.title),
      citationTitle: metaByName('citation_title', 'bepress_citation_title'),
      dcTitle: metaByName('dc.title', 'dcterms.title', 'DC.Title'),
      schemaTitle: first(schemaTitles),
      headingTitle,
      ogTitle: metaByProperty('og:title'),
      twitterTitle: metaByName('twitter:title') || metaByProperty('twitter:title'),
    };
  }

  async function readTitleSignals(tab) {
    if (!canReadPageTitleSignals(tab)) return null;

    try {
      const [result] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: collectPageTitleSignals,
      });
      return result?.result || null;
    } catch (_) {
      return null;
    }
  }

  async function applyAutoTitles(openTabs) {
    const sourceTabs = Array.isArray(openTabs) ? openTabs : [];
    const enrichedTabs = await Promise.all(sourceTabs.map(async tab => {
      const titleSignals = await readTitleSignals(tab);
      const autoTitle = window.TabSearch.inferAutoTitle({ ...tab, titleSignals });
      if (!titleSignals && !autoTitle) return tab;
      return { ...tab, titleSignals, autoTitle };
    }));
    return enrichedTabs;
  }

  async function refreshTabs() {
    if (refreshBtn) refreshBtn.disabled = true;
    try {
      const [activeTabs, currentWindowTabs, allTabs] = await Promise.all([
        chrome.tabs.query({ active: true, currentWindow: true }),
        chrome.tabs.query({ currentWindow: true }),
        chrome.tabs.query({}),
      ]);
      currentWindowId = activeTabs[0]?.windowId ?? currentWindowTabs[0]?.windowId ?? null;
      await pruneTabDataForTabs(allTabs);
      const titledTabs = await applyAutoTitles(allTabs);
      tabs = titledTabs.map(tab => applySavedTabData(window.TabSearch.normalizeTab(tab)));
      selectedIndex = 0;
      render();
    } finally {
      if (refreshBtn) refreshBtn.disabled = false;
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

    refreshBtn?.addEventListener('click', refreshTabs);

    for (const button of scopeButtons) {
      button.addEventListener('click', () => {
        saveScope(button.dataset.scope);
        searchInput.focus();
      });
    }

    for (const button of modeButtons) {
      button.addEventListener('click', () => {
        setViewMode(button.dataset.viewMode);
        searchInput.focus();
      });
    }

    resetAllTitlesBtn?.addEventListener('click', () => {
      resetAllTitlesInScope();
      searchInput.focus();
    });

    resetAllMemosBtn?.addEventListener('click', () => {
      resetAllMemosInScope();
      searchInput.focus();
    });

    window.addEventListener('beforeunload', () => {
      if (!saveTimer) return;
      clearTimeout(saveTimer);
      saveTimer = null;
      chrome.storage.local.set({
        [STORAGE_KEY_NOTES]: notesByTabId,
        [STORAGE_KEY_TITLES]: titlesByTabId,
        [STORAGE_KEY_FAVORITES]: favoritesByTabId,
      });
    });
  }

  bindEvents();
  await Promise.all([loadScope(), loadTabData()]);
  await refreshTabs();
  searchInput.focus();
})();
