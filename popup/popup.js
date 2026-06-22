(async function () {
  'use strict';

  const STORAGE_KEY_SCOPE = 'tabFinder.scope';
  const STORAGE_KEY_LANGUAGE = 'tabFinder.language';
  const STORAGE_KEY_NOTES = 'tabFinder.tabNotes.v1';
  const STORAGE_KEY_TITLES = 'tabFinder.tabTitles.v1';
  const STORAGE_KEY_FAVORITES = 'tabFinder.favorites.v1';
  const STORAGE_KEY_RESOLVED_TITLES = 'tabFinder.resolvedTitles.v1';
  const RESOLVED_TITLE_CACHE_LIMIT = 1000;
  const DEFAULT_SCOPE = 'current-window';
  const DEFAULT_LANGUAGE = 'ko';
  const VALID_SCOPES = new Set(['current-window', 'all-windows']);
  const VALID_LANGUAGES = new Set(['ko', 'en']);
  const DEFAULT_VIEW_MODE = 'search';
  const VALID_VIEW_MODES = new Set(['search', 'favorites']);
  const SAVE_DELAY_MS = 350;
  const TITLE_MAX_LENGTH = 160;
  const NOTE_MAX_LENGTH = 2000;
  const MESSAGES = {
    ko: {
      subtitle: '논문·문서 탭 빠른 검색',
      languageLabel: '언어',
      languageSelect: '언어 선택',
      languageKorean: '한국어',
      languageEnglish: 'English',
      searchSectionLabel: '탭 검색',
      searchPlaceholder: '제목·자동 제목·메모 검색',
      clearSearch: '검색어 지우기',
      scopeSearchLabel: '검색 범위',
      currentWindow: '현재 창',
      allWindows: '모든 창',
      resultsSummaryLabel: '결과 요약',
      modeSearch: '검색',
      modeFavorites: '즐겨찾기',
      resultCount: ({ count }) => `${count}건`,
      headerStats: ({ visibleCount, favoriteTotal, memoTotal, titleTotal, autoTitleTotal }) => `탭 ${visibleCount} · 즐겨찾기 ${favoriteTotal} · 메모 ${memoTotal} · 수동 ${titleTotal} · 자동 ${autoTitleTotal}`,
      scopeSummary: ({ scopeText, modeText, resultLength, denominator }) => `${scopeText} · ${modeText} ${resultLength}/${denominator}`,
      bulkResetLabel: '전체 초기화',
      bulkResetAllTitles: '전체 제목 초기화',
      bulkResetAllMemos: '전체 메모 초기화',
      bulkResetAllTitlesTitle: '현재 검색 범위의 수동 제목만 지우고 자동 제목은 유지',
      bulkResetAllMemosTitle: '현재 검색 범위의 모든 메모 지우기',
      bulkResetTitlesTitle: ({ scopeText, count }) => `${scopeText}의 수동 제목 ${count}개 초기화 (자동 제목은 유지)`,
      bulkResetMemosTitle: ({ scopeText, count }) => `${scopeText}의 메모 ${count}개 초기화`,
      scopeBase: ({ scopeText }) => `${scopeText} 기준`,
      titlesResetDone: ({ count }) => `제목 ${count}개 초기화됨`,
      memosResetDone: ({ count }) => `메모 ${count}개 초기화됨`,
      saving: '저장 중...',
      saved: '저장됨',
      saveFailed: '저장 실패',
      otherWindow: '다른 창',
      openTab: '열기',
      tabTitlePlaceholder: '탭 제목',
      manualTitleTooltip: ({ originalTitle }) => `수동 제목 · 원래 탭 제목: ${originalTitle}`,
      autoTitleTooltip: ({ originalTitle }) => `자동 제목 적용됨 · 원래 탭 제목: ${originalTitle}`,
      editTabTitle: '탭 제목 수정',
      memoPlaceholder: '메모 입력...',
      tabMemo: '탭 메모',
      favorite: '즐겨찾기',
      favoriteAdd: '즐겨찾기 추가',
      favoriteRemove: '즐겨찾기 해제',
      manualTitle: '수동 제목',
      autoTitle: '자동 제목',
      autoApplied: '자동 적용',
      resetTitle: '제목 초기화',
      resetTitleTooltip: '수동 제목만 지우고 자동 제목은 유지',
      resetMemo: '메모 초기화',
      resetMemoTooltip: '이 탭의 메모 지우기',
      emptyFavoritesTitle: '즐겨찾기 없음',
      emptyFavoritesFiltered: '즐겨찾기 안에서 다른 검색어를 입력하세요.',
      emptyFavoritesDefault: '별표 버튼으로 즐겨찾기를 추가하세요.',
      emptySearchTitle: '결과 없음',
      emptySearchDefault: '다른 검색어를 입력하세요.',
      searchResultsLabel: '검색 결과',
      openTabError: '탭을 열 수 없음',
      localTab: '로컬 탭',
      untitled: '제목 없음',
      badgeAuto: '자동',
      badgeMemo: '메모',
      badgeTab: '탭',
      badgeActive: '활성',
      badgePinned: '고정',
      badgeAudio: '오디오',
      badgeSleep: '절전',
    },
    en: {
      subtitle: 'Fast search for paper and document tabs',
      languageLabel: 'Lang',
      languageSelect: 'Select language',
      languageKorean: '한국어',
      languageEnglish: 'English',
      searchSectionLabel: 'Tab search',
      searchPlaceholder: 'Search title, auto title, or memo',
      clearSearch: 'Clear search',
      scopeSearchLabel: 'Search scope',
      currentWindow: 'Current',
      allWindows: 'All windows',
      resultsSummaryLabel: 'Result summary',
      modeSearch: 'Search',
      modeFavorites: 'Favorites',
      resultCount: ({ count }) => String(count),
      headerStats: ({ visibleCount, favoriteTotal, memoTotal, titleTotal, autoTitleTotal }) => `Tabs ${visibleCount} · Fav ${favoriteTotal} · Memo ${memoTotal} · M ${titleTotal} · A ${autoTitleTotal}`,
      scopeSummary: ({ scopeText, modeText, resultLength, denominator }) => `${scopeText} · ${modeText} ${resultLength}/${denominator}`,
      bulkResetLabel: 'Bulk reset',
      bulkResetAllTitles: 'Reset titles',
      bulkResetAllMemos: 'Reset memos',
      bulkResetAllTitlesTitle: 'Clear manual titles in the current search scope and keep auto titles',
      bulkResetAllMemosTitle: 'Clear every memo in the current search scope',
      bulkResetTitlesTitle: ({ scopeText, count }) => `Reset ${count} manual title(s) in ${scopeText} and keep auto titles`,
      bulkResetMemosTitle: ({ scopeText, count }) => `Reset ${count} memo(s) in ${scopeText}`,
      scopeBase: ({ scopeText }) => `${scopeText} scope`,
      titlesResetDone: ({ count }) => `${count} title(s) reset`,
      memosResetDone: ({ count }) => `${count} memo(s) reset`,
      saving: 'Saving...',
      saved: 'Saved',
      saveFailed: 'Save failed',
      otherWindow: 'Other window',
      openTab: 'Open',
      tabTitlePlaceholder: 'Tab title',
      manualTitleTooltip: ({ originalTitle }) => `Manual title · Original tab title: ${originalTitle}`,
      autoTitleTooltip: ({ originalTitle }) => `Auto title applied · Original tab title: ${originalTitle}`,
      editTabTitle: 'Edit tab title',
      memoPlaceholder: 'Add memo...',
      tabMemo: 'Tab memo',
      favorite: 'Favorite',
      favoriteAdd: 'Add favorite',
      favoriteRemove: 'Remove favorite',
      manualTitle: 'Manual title',
      autoTitle: 'Auto title',
      autoApplied: 'Auto applied',
      resetTitle: 'Reset title',
      resetTitleTooltip: 'Clear only the manual title and keep the auto title',
      resetMemo: 'Reset memo',
      resetMemoTooltip: 'Clear this tab memo',
      emptyFavoritesTitle: 'No favorites',
      emptyFavoritesFiltered: 'Try a different search inside favorites.',
      emptyFavoritesDefault: 'Use the star button to add favorites.',
      emptySearchTitle: 'No results',
      emptySearchDefault: 'Try a different search.',
      searchResultsLabel: 'Search results',
      openTabError: 'Could not open tab',
      localTab: 'Local tab',
      untitled: 'Untitled',
      badgeAuto: 'auto',
      badgeMemo: 'memo',
      badgeTab: 'tab',
      badgeActive: 'active',
      badgePinned: 'pinned',
      badgeAudio: 'audio',
      badgeSleep: 'sleep',
    },
  };
  const BADGE_LABEL_KEYS = {
    auto: 'badgeAuto',
    memo: 'badgeMemo',
    tab: 'badgeTab',
    active: 'badgeActive',
    pinned: 'badgePinned',
    audible: 'badgeAudio',
    discarded: 'badgeSleep',
  };

  const appVersionEl = document.getElementById('appVersion');
  const searchInput = document.getElementById('searchInput');
  const clearBtn = document.getElementById('clearBtn');
  const refreshBtn = document.getElementById('refreshBtn');
  const resultsEl = document.getElementById('results');
  const emptyState = document.getElementById('emptyState');
  const resultCount = document.getElementById('resultCount');
  const favoriteCount = document.getElementById('favoriteCount');
  const headerStats = document.getElementById('headerStats');
  const scopeLabel = document.getElementById('scopeLabel');
  const languageSelect = document.getElementById('languageSelect');
  const scopeButtons = Array.from(document.querySelectorAll('.scope-btn'));
  const modeButtons = Array.from(document.querySelectorAll('.mode-tab[data-view-mode]'));
  const resetAllTitlesBtn = document.getElementById('resetAllTitlesBtn');
  const resetAllMemosBtn = document.getElementById('resetAllMemosBtn');
  const bulkResetStatus = document.getElementById('bulkResetStatus');

  let tabs = [];
  let notesByTabId = {};
  let titlesByTabId = {};
  let favoritesByTabId = {};
  let resolvedTitlesByRef = {};
  let saveTimer = null;
  let scope = DEFAULT_SCOPE;
  let viewMode = DEFAULT_VIEW_MODE;
  let language = DEFAULT_LANGUAGE;
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

  function translate(key, params = {}) {
    const messages = MESSAGES[language] || MESSAGES[DEFAULT_LANGUAGE];
    const fallback = MESSAGES[DEFAULT_LANGUAGE];
    const template = Object.prototype.hasOwnProperty.call(messages, key)
      ? messages[key]
      : fallback[key];

    if (typeof template === 'function') return template(params);
    return template == null ? key : template;
  }

  function showAppVersion() {
    if (!appVersionEl) return;
    try {
      const version = chrome.runtime.getManifest().version;
      if (version) appVersionEl.textContent = `v${version}`;
    } catch (_) {
      // Version display is non-essential; ignore if the manifest is unavailable.
    }
  }

  function applyStaticLanguage() {
    document.documentElement.lang = language;

    for (const element of document.querySelectorAll('[data-i18n]')) {
      element.textContent = translate(element.dataset.i18n);
    }

    for (const element of document.querySelectorAll('[data-i18n-placeholder]')) {
      element.placeholder = translate(element.dataset.i18nPlaceholder);
    }

    for (const element of document.querySelectorAll('[data-i18n-aria-label]')) {
      element.setAttribute('aria-label', translate(element.dataset.i18nAriaLabel));
    }

    for (const element of document.querySelectorAll('[data-i18n-title]')) {
      element.title = translate(element.dataset.i18nTitle);
    }

    if (languageSelect) languageSelect.value = language;
  }

  function badgeLabel(tag) {
    const key = BADGE_LABEL_KEYS[tag];
    return key ? translate(key) : tag;
  }

  function scopeText() {
    return scope === 'all-windows' ? translate('allWindows') : translate('currentWindow');
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
    const modeText = viewMode === 'favorites' ? translate('modeFavorites') : translate('modeSearch');

    if (resultCount) resultCount.textContent = translate('resultCount', { count: searchResultLength });
    if (favoriteCount) favoriteCount.textContent = String(favoriteResultLength ?? favoriteTotal);
    if (headerStats) {
      headerStats.textContent = translate('headerStats', {
        visibleCount,
        favoriteTotal,
        memoTotal,
        titleTotal,
        autoTitleTotal,
      });
    }
    if (scopeLabel) {
      scopeLabel.textContent = translate('scopeSummary', {
        scopeText: scopeText(),
        modeText,
        resultLength,
        denominator,
      });
    }
    updateBulkResetControls(titleTotal, memoTotal);
  }

  function updateBulkResetControls(titleTotal = null, memoTotal = null) {
    const visibleTabs = visibleTabsForScope();
    const manualTitleCount = titleTotal ?? visibleTabs.filter(tab => (tab.customTitle || '').trim()).length;
    const memoCount = memoTotal ?? visibleTabs.filter(tab => (tab.note || '').trim()).length;

    if (resetAllTitlesBtn) {
      resetAllTitlesBtn.disabled = manualTitleCount === 0;
      resetAllTitlesBtn.title = translate('bulkResetTitlesTitle', {
        scopeText: scopeText(),
        count: manualTitleCount,
      });
    }

    if (resetAllMemosBtn) {
      resetAllMemosBtn.disabled = memoCount === 0;
      resetAllMemosBtn.title = translate('bulkResetMemosTitle', {
        scopeText: scopeText(),
        count: memoCount,
      });
    }

    if (bulkResetStatus && !bulkResetStatus.dataset.locked) {
      bulkResetStatus.textContent = translate('scopeBase', { scopeText: scopeText() });
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
    return tab.customTitle || tab.autoTitle || tab.originalTitle || tab.title || translate('untitled');
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
    showBulkResetStatus(saved ? translate('titlesResetDone', { count: changed }) : translate('saveFailed'), !saved);
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
    showBulkResetStatus(saved ? translate('memosResetDone', { count: changed }) : translate('saveFailed'), !saved);
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
      statusEl.textContent = translate('saving');
      statusEl.classList.remove('error');
    }

    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      saveTimer = null;
      const saved = await persistTabData();
      if (!statusEl || !statusEl.isConnected) return;

      statusEl.textContent = saved ? translate('saved') : translate('saveFailed');
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

    const typeBadge = makeBadge(badgeLabel(primaryTag), primaryTag);
    typeBadge.classList.add('type-badge');

    const host = document.createElement('span');
    host.className = 'row-host';
    host.textContent = tab.host || translate('localTab');
    host.title = tab.host || tab.url || displayTitle(tab);

    meta.append(typeBadge, faviconFor(tab), host);
    if (scope === 'all-windows' && typeof currentWindowId === 'number' && tab.windowId !== currentWindowId) {
      meta.append(makeBadge(translate('otherWindow'), 'window'));
    }
    if (tab.active) meta.append(makeBadge(badgeLabel('active'), 'active'));

    const favoriteButton = document.createElement('button');
    favoriteButton.type = 'button';
    favoriteButton.className = 'favorite-tab-btn';
    favoriteButton.textContent = hasFavorite ? '★' : '☆';
    favoriteButton.title = hasFavorite ? translate('favoriteRemove') : translate('favoriteAdd');
    favoriteButton.setAttribute('aria-label', favoriteButton.title);
    favoriteButton.setAttribute('aria-pressed', String(hasFavorite));
    favoriteButton.addEventListener('click', event => {
      event.stopPropagation();
      const nextFavorite = !tab.favorite;
      setInMemoryFavorite(tab, nextFavorite);
      favoriteButton.textContent = nextFavorite ? '★' : '☆';
      favoriteButton.title = nextFavorite ? translate('favoriteRemove') : translate('favoriteAdd');
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
    openButton.textContent = translate('openTab');
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
    titleInput.placeholder = tab.originalTitle || translate('tabTitlePlaceholder');
    titleInput.title = hasCustomTitle
      ? translate('manualTitleTooltip', { originalTitle: tab.originalTitle })
      : hasAutoTitle
        ? translate('autoTitleTooltip', { originalTitle: tab.originalTitle })
        : displayTitle(tab);
    titleInput.setAttribute('aria-label', translate('editTabTitle'));
    titleInput.classList.toggle('custom-title', hasCustomTitle);
    titleInput.classList.toggle('auto-title', hasAutoTitle);

    const noteTextarea = document.createElement('textarea');
    noteTextarea.className = 'tab-note-input';
    noteTextarea.maxLength = NOTE_MAX_LENGTH;
    noteTextarea.rows = 2;
    noteTextarea.value = tab.note || '';
    noteTextarea.placeholder = translate('memoPlaceholder');
    noteTextarea.setAttribute('aria-label', translate('tabMemo'));

    const rowFooter = document.createElement('div');
    rowFooter.className = 'row-footer';

    const badges = document.createElement('span');
    badges.className = 'badges';
    if (hasFavorite) badges.append(makeBadge(translate('favorite'), 'favorite'));
    if (hasCustomTitle) {
      badges.append(makeBadge(translate('manualTitle'), 'custom-title'));
    } else if (hasAutoTitle) {
      badges.append(makeBadge(translate('autoTitle'), 'auto-title'));
    }
    if (tab.pinned) badges.append(makeBadge(badgeLabel('pinned'), 'pinned'));
    if (tab.audible) badges.append(makeBadge(badgeLabel('audible'), 'audible'));
    if (tab.discarded) badges.append(makeBadge(badgeLabel('discarded'), 'discarded'));
    for (const tag of tab.tags || []) {
      badges.append(makeBadge(badgeLabel(tag), tag));
    }

    const status = document.createElement('span');
    status.className = 'row-status';
    status.textContent = hasNote || hasCustomTitle || hasFavorite ? translate('saved') : hasAutoTitle ? translate('autoApplied') : '';

    const resetActions = document.createElement('div');
    resetActions.className = 'row-reset-actions';

    const resetTitleButton = document.createElement('button');
    resetTitleButton.type = 'button';
    resetTitleButton.className = 'reset-btn';
    resetTitleButton.textContent = translate('resetTitle');
    resetTitleButton.title = translate('resetTitleTooltip');
    resetTitleButton.setAttribute('aria-label', resetTitleButton.title);

    const resetMemoButton = document.createElement('button');
    resetMemoButton.type = 'button';
    resetMemoButton.className = 'reset-btn';
    resetMemoButton.textContent = translate('resetMemo');
    resetMemoButton.title = translate('resetMemoTooltip');
    resetMemoButton.setAttribute('aria-label', resetMemoButton.title);

    resetActions.append(resetTitleButton, resetMemoButton);

    const refreshBadges = () => {
      const edited = Boolean((tab.customTitle || '').trim());
      const autoApplied = !edited && Boolean((tab.autoTitle || '').trim());

      badges.textContent = '';
      if (tab.favorite) badges.append(makeBadge(translate('favorite'), 'favorite'));
      if (edited) {
        badges.append(makeBadge(translate('manualTitle'), 'custom-title'));
      } else if (autoApplied) {
        badges.append(makeBadge(translate('autoTitle'), 'auto-title'));
      }
      if (tab.pinned) badges.append(makeBadge(badgeLabel('pinned'), 'pinned'));
      if (tab.audible) badges.append(makeBadge(badgeLabel('audible'), 'audible'));
      if (tab.discarded) badges.append(makeBadge(badgeLabel('discarded'), 'discarded'));
      for (const tag of tab.tags || []) {
        badges.append(makeBadge(badgeLabel(tag), tag));
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
      status.textContent = noteExists || edited || tab.favorite ? translate('saved') : autoApplied ? translate('autoApplied') : '';
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
        if (emptyTitle) emptyTitle.textContent = translate('emptyFavoritesTitle');
        if (emptyMessage) emptyMessage.textContent = hasQuery
          ? translate('emptyFavoritesFiltered')
          : translate('emptyFavoritesDefault');
      } else {
        if (emptyTitle) emptyTitle.textContent = translate('emptySearchTitle');
        if (emptyMessage) emptyMessage.textContent = translate('emptySearchDefault');
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
      !tab.discarded &&
      // Non-paper SPA hosts (YouTube, etc.) never get an auto title, so there
      // is nothing to gain from injecting the metadata reader into them.
      !window.TabSearch.isNonPaperTitleHost(window.TabSearch.formatUrl(tab.url).host)
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

  async function fetchArxivTitle(arxivId) {
    try {
      const response = await fetch(
        `https://export.arxiv.org/api/query?id_list=${encodeURIComponent(arxivId)}&max_results=1`
      );
      if (!response.ok) return '';

      const xml = await response.text();
      const doc = new DOMParser().parseFromString(xml, 'application/xml');
      // getElementsByTagName ignores the Atom namespace, unlike querySelector.
      const entry = doc.getElementsByTagName('entry')[0];
      const titleNode = entry ? entry.getElementsByTagName('title')[0] : null;
      return (titleNode?.textContent || '').replace(/\s+/g, ' ').trim();
    } catch (_) {
      return '';
    }
  }

  async function fetchCrossrefTitle(doi) {
    try {
      const response = await fetch(`https://api.crossref.org/works/${doi}`);
      if (!response.ok) return '';

      const data = await response.json();
      const title = data?.message?.title;
      const text = Array.isArray(title) ? title.find(Boolean) : title;
      return String(text || '').replace(/\s+/g, ' ').trim();
    } catch (_) {
      return '';
    }
  }

  async function fetchPubmedTitle(pmid) {
    try {
      const response = await fetch(
        `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${encodeURIComponent(pmid)}&retmode=json`
      );
      if (!response.ok) return '';

      const data = await response.json();
      const title = data?.result?.[pmid]?.title;
      return String(title || '').replace(/\s+/g, ' ').trim();
    } catch (_) {
      return '';
    }
  }

  // Each resolver turns a tab URL into an authoritative paper title when page
  // metadata is unreadable (PDF viewer, discarded tabs). Probed in order; the
  // first source whose id is present in the URL wins.
  const TITLE_RESOLVERS = [
    { source: 'arxiv', extract: url => window.TabSearch.extractArxivId(url), fetch: fetchArxivTitle },
    { source: 'doi', extract: url => window.TabSearch.extractDoi(url), fetch: fetchCrossrefTitle },
    { source: 'pmid', extract: url => window.TabSearch.extractPubmedId(url), fetch: fetchPubmedTitle },
  ];

  async function loadResolvedTitleCache() {
    try {
      const data = await chrome.storage.local.get(STORAGE_KEY_RESOLVED_TITLES);
      const stored = data[STORAGE_KEY_RESOLVED_TITLES];
      resolvedTitlesByRef = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
    } catch (_) {
      resolvedTitlesByRef = {};
    }
  }

  async function persistResolvedTitleCache() {
    try {
      const refs = Object.keys(resolvedTitlesByRef);
      if (refs.length > RESOLVED_TITLE_CACHE_LIMIT) {
        // Object key order is insertion order, so drop the oldest entries first.
        for (const ref of refs.slice(0, refs.length - RESOLVED_TITLE_CACHE_LIMIT)) {
          delete resolvedTitlesByRef[ref];
        }
      }
      await chrome.storage.local.set({ [STORAGE_KEY_RESOLVED_TITLES]: resolvedTitlesByRef });
    } catch (_) {
      // Cache persistence is best-effort; auto titles still work without it.
    }
  }

  async function resolveExternalTitle(url) {
    for (const resolver of TITLE_RESOLVERS) {
      const id = resolver.extract(url);
      if (!id) continue;

      const ref = `${resolver.source}:${id}`;
      if (Object.prototype.hasOwnProperty.call(resolvedTitlesByRef, ref)) {
        return { title: resolvedTitlesByRef[ref], cached: true };
      }

      const title = await resolver.fetch(id);
      if (title) resolvedTitlesByRef[ref] = title;
      // The URL maps to a single source, so stop once one matched.
      return { title, cached: false };
    }
    return { title: '', cached: false };
  }

  async function applyAutoTitles(openTabs) {
    const sourceTabs = Array.isArray(openTabs) ? openTabs : [];
    let cacheChanged = false;

    const enrichedTabs = await Promise.all(sourceTabs.map(async tab => {
      const titleSignals = await readTitleSignals(tab);
      let autoTitle = window.TabSearch.inferAutoTitle({ ...tab, titleSignals });
      let paperTitle = '';

      // Page metadata is unreadable on the built-in PDF viewer and discarded
      // tabs, so arXiv / DOI / PubMed pages there fall back to a bare id or
      // filename. Resolve the real title from the matching public API instead.
      if (!autoTitle) {
        const resolved = await resolveExternalTitle(tab.url);
        if (resolved.title) {
          paperTitle = resolved.title;
          if (!resolved.cached) cacheChanged = true;
          autoTitle = window.TabSearch.inferAutoTitle({ ...tab, paperTitle, titleSignals });
        }
      }

      if (!titleSignals && !autoTitle && !paperTitle) return tab;
      return { ...tab, paperTitle, titleSignals, autoTitle };
    }));

    if (cacheChanged) await persistResolvedTitleCache();
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

  async function loadLanguage() {
    try {
      const data = await chrome.storage.local.get(STORAGE_KEY_LANGUAGE);
      const saved = data[STORAGE_KEY_LANGUAGE];
      language = VALID_LANGUAGES.has(saved) ? saved : DEFAULT_LANGUAGE;
    } catch (_) {
      language = DEFAULT_LANGUAGE;
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

  async function saveLanguage(nextLanguage) {
    language = VALID_LANGUAGES.has(nextLanguage) ? nextLanguage : DEFAULT_LANGUAGE;
    applyStaticLanguage();
    render();
    try {
      await chrome.storage.local.set({ [STORAGE_KEY_LANGUAGE]: language });
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
      scopeLabel.textContent = error?.message || translate('openTabError');
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

    languageSelect?.addEventListener('change', () => {
      saveLanguage(languageSelect.value);
      searchInput.focus();
    });

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
  await Promise.all([loadScope(), loadLanguage(), loadTabData(), loadResolvedTitleCache()]);
  applyStaticLanguage();
  showAppVersion();
  await refreshTabs();
  searchInput.focus();
})();
