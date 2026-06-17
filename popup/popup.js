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
  let expandedEditorTabId = null;
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
    return typeof id === 'number' && id >= 0 ? String(id) : '';
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

    const text = String(value ?? '').slice(0, TITLE_MAX_LENGTH).trim();
    if (text) {
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

  async function saveNow(statusEl) {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }

    if (statusEl) {
      statusEl.textContent = '저장 중...';
      statusEl.classList.remove('error');
    }

    const saved = await persistTabData();
    if (statusEl && statusEl.isConnected) {
      statusEl.textContent = saved ? '저장됨' : '저장 실패';
      statusEl.classList.toggle('error', !saved);
    }
    return saved;
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

  function notePreviewText(note) {
    return String(note || '').replace(/\s+/g, ' ').trim();
  }

  function focusEditorField(tabOrId, field) {
    const key = tabKey(tabOrId);
    if (!key) return;

    requestAnimationFrame(() => {
      const selector = `[data-tab-id="${key}"][data-editor-field="${field || 'title'}"]`;
      const fieldEl = resultsEl.querySelector(selector);
      if (!fieldEl) return;
      fieldEl.focus();
      if (typeof fieldEl.setSelectionRange === 'function') {
        fieldEl.setSelectionRange(fieldEl.value.length, fieldEl.value.length);
      }
    });
  }

  function closeEditor() {
    expandedEditorTabId = null;
    render();
    searchInput.focus();
  }

  function toggleEditor(tab, index, focusField = 'title') {
    const key = tabKey(tab);
    if (!key) return;

    selectedIndex = index;
    expandedEditorTabId = expandedEditorTabId === key ? null : key;
    render();

    if (expandedEditorTabId === key) {
      focusEditorField(key, focusField);
    } else {
      searchInput.focus();
    }
  }

  function handleEditorKeydown(event, index) {
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      closeEditor();
    } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      openResult(index);
    }
  }

  function renderEditor(tab, index, titleEl) {
    const key = tabKey(tab);
    const editor = document.createElement('div');
    editor.className = 'tab-editor';
    editor.addEventListener('click', event => event.stopPropagation());

    const titleLabel = document.createElement('label');
    titleLabel.className = 'editor-label';
    titleLabel.htmlFor = `title-${key}`;
    titleLabel.textContent = '탭 제목';

    const titleInput = document.createElement('input');
    titleInput.id = `title-${key}`;
    titleInput.className = 'title-input';
    titleInput.dataset.tabId = key;
    titleInput.dataset.editorField = 'title';
    titleInput.maxLength = TITLE_MAX_LENGTH;
    titleInput.placeholder = tab.originalTitle || '원래 제목';
    titleInput.value = tab.customTitle || '';

    const noteLabel = document.createElement('label');
    noteLabel.className = 'editor-label';
    noteLabel.htmlFor = `note-${key}`;
    noteLabel.textContent = '탭 메모';

    const noteTextarea = document.createElement('textarea');
    noteTextarea.id = `note-${key}`;
    noteTextarea.className = 'note-textarea';
    noteTextarea.dataset.tabId = key;
    noteTextarea.dataset.editorField = 'note';
    noteTextarea.maxLength = NOTE_MAX_LENGTH;
    noteTextarea.rows = 3;
    noteTextarea.placeholder = '이 탭에 대한 메모를 입력하세요.';
    noteTextarea.value = tab.note || '';

    const footer = document.createElement('div');
    footer.className = 'editor-footer';

    const hint = document.createElement('span');
    hint.className = 'editor-hint';
    hint.textContent = '자동 저장 · 제목을 비우면 원래 제목 사용';

    const status = document.createElement('span');
    status.className = 'editor-status';
    status.textContent = '입력하면 자동 저장됩니다.';

    const resetTitleBtn = document.createElement('button');
    resetTitleBtn.type = 'button';
    resetTitleBtn.className = 'editor-action';
    resetTitleBtn.textContent = '제목 초기화';
    resetTitleBtn.disabled = !titleInput.value.trim();

    const deleteNoteBtn = document.createElement('button');
    deleteNoteBtn.type = 'button';
    deleteNoteBtn.className = 'editor-action';
    deleteNoteBtn.textContent = '메모 삭제';
    deleteNoteBtn.disabled = !noteTextarea.value.trim();

    titleInput.addEventListener('input', () => {
      setInMemoryTitle(key, titleInput.value);
      titleEl.textContent = displayTitle(tab);
      titleEl.classList.toggle('custom-title', Boolean(tab.customTitle));
      resetTitleBtn.disabled = !titleInput.value.trim();
      scheduleSave(status);
    });

    titleInput.addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        saveNow(status);
        titleInput.blur();
        return;
      }
      handleEditorKeydown(event, index);
    });

    noteTextarea.addEventListener('input', () => {
      setInMemoryNote(key, noteTextarea.value);
      deleteNoteBtn.disabled = !noteTextarea.value.trim();
      scheduleSave(status);
    });

    noteTextarea.addEventListener('keydown', event => {
      handleEditorKeydown(event, index);
    });

    resetTitleBtn.addEventListener('click', async event => {
      event.stopPropagation();
      titleInput.value = '';
      resetTitleBtn.disabled = true;
      setInMemoryTitle(key, '');
      await saveNow(status);
      render();
      focusEditorField(key, 'title');
    });

    deleteNoteBtn.addEventListener('click', async event => {
      event.stopPropagation();
      noteTextarea.value = '';
      deleteNoteBtn.disabled = true;
      setInMemoryNote(key, '');
      await saveNow(status);
      render();
      focusEditorField(key, 'note');
    });

    footer.append(hint, status, resetTitleBtn, deleteNoteBtn);
    editor.append(titleLabel, titleInput, noteLabel, noteTextarea, footer);
    return editor;
  }

  function renderResult(result, index) {
    const tab = result.tab;
    const key = tabKey(tab);
    const isExpanded = key && expandedEditorTabId === key;
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
    row.classList.toggle('editing-tab', Boolean(isExpanded));

    const main = document.createElement('span');
    main.className = 'tab-main';

    const title = document.createElement('span');
    title.className = 'tab-title';
    title.classList.toggle('custom-title', hasCustomTitle);
    title.textContent = displayTitle(tab);
    title.title = hasCustomTitle ? `원래 제목: ${tab.originalTitle}` : displayTitle(tab);

    main.append(title);

    if (hasNote) {
      const note = document.createElement('span');
      note.className = 'tab-note-preview';
      note.textContent = notePreviewText(tab.note);
      note.title = tab.note;
      main.append(note);
    }

    const controls = document.createElement('span');
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

    const editToggle = document.createElement('button');
    editToggle.type = 'button';
    editToggle.className = `edit-toggle${hasNote || hasCustomTitle ? ' has-edit' : ''}`;
    editToggle.textContent = '편집';
    editToggle.title = '탭 제목/메모 편집';
    editToggle.setAttribute('aria-expanded', String(Boolean(isExpanded)));
    editToggle.addEventListener('click', event => {
      event.stopPropagation();
      toggleEditor(tab, index, 'title');
    });

    controls.append(badges, editToggle);
    row.append(faviconFor(tab), main, controls);

    if (isExpanded) {
      row.append(renderEditor(tab, index, title));
    }

    row.addEventListener('click', event => {
      if (event.target.closest('.tab-editor, .edit-toggle')) return;
      openResult(index);
    });

    row.addEventListener('keydown', event => {
      if (event.target.closest('.tab-editor, .edit-toggle')) return;
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
    if (expandedEditorTabId && !currentResults.some(result => tabKey(result.tab) === expandedEditorTabId)) {
      expandedEditorTabId = null;
    }

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
      if (expandedEditorTabId && !tabs.some(tab => tabKey(tab) === expandedEditorTabId)) {
        expandedEditorTabId = null;
      }
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
