// popup.js — Main popup controller

// ─── State ────────────────────────────────────────────────────
const SORT_MODES = ['default', 'status', 'url', 'text'];
const state = {
  tabId: null,
  tabUrl: null,
  results: [],        // Array of result objects
  scanning: false,
  aborted: false,
  checked: 0,
  total: 0,
  currentTab: 'all',
  sortMode: 'default',
  searchQuery: ''
};

// ─── DOM refs ─────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const dom = {
  pageHost:       $('page-host'),
  optSkipImages:  $('opt-skip-images'),
  optSkip403:     $('opt-skip-403'),
  optShowRedirs:  $('opt-show-redirects'),
  optHighlight:   $('opt-highlight'),
  btnStart:       $('btn-start'),
  btnStartLabel:  $('btn-start-label'),
  btnStop:        $('btn-stop'),
  btnExport:      $('btn-export'),
  btnCopyBroken:  $('btn-copy-broken'),
  sectionProgress:$('section-progress'),
  progressLabel:  $('progress-label'),
  progressCount:  $('progress-count'),
  progressBar:    $('progress-bar'),
  sectionStats:   $('section-stats'),
  statTotal:      $('stat-total'),
  statBroken:     $('stat-broken'),
  statRedirects:  $('stat-redirects'),
  statOk:         $('stat-ok'),
  sectionTabs:    $('section-tabs'),
  results:        $('results'),
  emptyState:     $('empty-state'),
  btnTheme:       $('btn-theme'),
  iconMoon:       $('icon-moon'),
  iconSun:        $('icon-sun'),
  sectionSearch:  $('section-search'),
  searchInput:    $('search-input'),
  btnSort:        $('btn-sort'),
  sortLabel:      $('sort-label')
};

// ─── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // Load saved options
  const saved = await chrome.storage.local.get(['skipImages','skip403','showRedirects','highlight','theme']);
  dom.optSkipImages.checked = saved.skipImages ?? false;
  dom.optSkip403.checked    = saved.skip403    ?? false;
  dom.optShowRedirs.checked = saved.showRedirects ?? true;
  dom.optHighlight.checked  = saved.highlight    ?? true;

  // Apply theme
  const theme = saved.theme ?? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  applyTheme(theme);

  // Get current tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    state.tabId  = tab.id;
    state.tabUrl = tab.url;
    try {
      const host = new URL(tab.url).hostname;
      dom.pageHost.textContent = host;
      dom.pageHost.title = tab.url;
    } catch (_) {
      dom.pageHost.textContent = tab.url?.slice(0, 40) ?? '';
    }
  }

  // Save options on change
  ['optSkipImages','optSkip403','optShowRedirs','optHighlight'].forEach(k => {
    const keyMap = {
      optSkipImages: 'skipImages', optSkip403: 'skip403',
      optShowRedirs: 'showRedirects', optHighlight: 'highlight'
    };
    dom[k].addEventListener('change', () => {
      chrome.storage.local.set({ [keyMap[k]]: dom[k].checked });
    });
  });

  // Buttons
  dom.btnStart.addEventListener('click', startScan);
  dom.btnStop.addEventListener('click', stopScan);
  dom.btnExport.addEventListener('click', exportResults);
  dom.btnCopyBroken.addEventListener('click', copyBrokenLinks);
  dom.btnTheme.addEventListener('click', toggleTheme);
  dom.searchInput.addEventListener('input', () => {
    state.searchQuery = dom.searchInput.value.toLowerCase();
    filterResults();
  });
  dom.btnSort.addEventListener('click', cycleSort);

  // Tabs
  document.querySelectorAll('.tab').forEach(t => {
    t.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      state.currentTab = t.dataset.tab;
      filterResults();
      saveSession();
    });
  });

  // Restore previous scan if popup was closed and reopened
  await restoreSession();
});

// ─── Scan ──────────────────────────────────────────────────────
async function startScan() {
  if (!state.tabId) return;

  // Reset
  state.results  = [];
  state.scanning = true;
  state.aborted  = false;
  state.checked  = 0;
  state.total    = 0;

  dom.emptyState.classList.add('hidden');
  dom.results.querySelectorAll('.result-row').forEach(r => r.remove());
  dom.btnStart.disabled = true;
  dom.btnStart.classList.add('scanning');
  dom.btnStop.classList.remove('hidden');
  dom.btnExport.disabled = true;
  dom.sectionProgress.classList.remove('hidden');
  dom.sectionStats.classList.add('hidden');
  dom.sectionTabs.classList.add('hidden');

  setProgress('Extracting links…', 0, 0);
  updateStats(0, 0, 0, 0);

  // Clear old highlights
  if (dom.optHighlight.checked) {
    sendHighlights([], [], true);
  }

  // Extract links
  let links = [];
  try {
    const resp = await chrome.runtime.sendMessage({ type: 'GET_LINKS', tabId: state.tabId });
    if (resp.error) throw new Error(resp.error);
    links = resp.links;
  } catch (err) {
    showError(`Could not extract links: ${err.message}`);
    resetUI();
    return;
  }

  // Apply filters
  const skipImages = dom.optSkipImages.checked;
  const skip403    = dom.optSkip403.checked;

  if (skipImages) {
    links = links.filter(l => !l.isImage);
  }

  if (links.length === 0) {
    showError('No HTTP links found on this page.');
    resetUI();
    return;
  }

  state.total = links.length;
  dom.sectionStats.classList.remove('hidden');
  dom.sectionTabs.classList.remove('hidden');
  dom.sectionSearch.classList.remove('hidden');
  updateStats(links.length, 0, 0, 0);

  // Check links with concurrency pool
  const CONCURRENCY = 5;
  const HIGHLIGHT_BATCH = 10;
  let idx = 0;

  async function worker() {
    while (idx < links.length && !state.aborted) {
      const link = links[idx++];
      setProgress(`Checking: ${truncate(link.url, 48)}`, state.checked, state.total);

      const result = await chrome.runtime.sendMessage({ type: 'CHECK_LINK', url: link.url });
      result.text = link.text;

      // Apply skip-403 filter
      if (skip403 && result.statusCode === 403) {
        result.isBroken = false;
        result.skipped  = true;
      }

      state.results.push(result);
      state.checked++;

      updateProgress();
      appendResult(result);
      updateStats();

      // Push page highlights periodically
      if (dom.optHighlight.checked && state.checked % HIGHLIGHT_BATCH === 0) {
        pushHighlights();
      }
    }
  }

  const workers = Array.from({ length: CONCURRENCY }, worker);
  await Promise.all(workers);

  // Final highlight push
  if (dom.optHighlight.checked && !state.aborted) {
    pushHighlights();
  }

  if (!state.aborted) {
    setProgress('Done!', state.total, state.total);
    setTimeout(() => dom.sectionProgress.classList.add('hidden'), 1500);
    notifyScanComplete();
  }

  dom.btnExport.disabled = state.results.length === 0;
  dom.btnCopyBroken.classList.toggle('hidden',
    state.results.filter(r => r.isBroken && !r.skipped).length === 0);
  saveSession();
  resetUI();
}

function stopScan() {
  state.aborted = true;
  setProgress('Stopped.', state.checked, state.total);
  setTimeout(() => dom.sectionProgress.classList.add('hidden'), 1200);
  resetUI();
}

function resetUI() {
  state.scanning = false;
  dom.btnStart.disabled = false;
  dom.btnStart.classList.remove('scanning');
  dom.btnStartLabel.textContent = 'Re-check';
  dom.btnStop.classList.add('hidden');
  if (state.results.length === 0) dom.emptyState.classList.remove('hidden');
}

// ─── Progress ──────────────────────────────────────────────────
function setProgress(label, done, total) {
  dom.progressLabel.textContent = label;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  dom.progressBar.style.width = pct + '%';
  dom.progressCount.textContent = total > 0 ? `${done} / ${total}` : '';
}

function updateProgress() {
  const hasBroken = state.results.some(r => r.isBroken);
  dom.progressBar.classList.toggle('has-broken', hasBroken);
  setProgress(
    `Checking… (${state.results.filter(r => r.isBroken).length} broken)`,
    state.checked,
    state.total
  );
}

// ─── Stats ─────────────────────────────────────────────────────
function updateStats(total, broken, redirects, ok) {
  if (arguments.length === 0) {
    const r = state.results;
    total     = state.total;
    broken    = r.filter(x => x.isBroken && !x.skipped).length;
    redirects = r.filter(x => x.isRedirect && !x.isBroken).length;
    ok        = r.filter(x => !x.isBroken && !x.isRedirect && !x.skipped && x.statusCode > 0).length;
  }
  dom.statTotal.textContent     = total;
  dom.statBroken.textContent    = broken;
  dom.statRedirects.textContent = redirects;
  dom.statOk.textContent        = ok;

  // Update tab counts
  updateTabCounts(broken, redirects, ok);

  // Update toolbar badge
  updateBadge(broken);
}

// ─── Result rows ───────────────────────────────────────────────
function appendResult(r) {
  const row = document.createElement('div');
  row.className = 'result-row';
  row.dataset.category = getCategory(r);
  row.dataset.url = r.url;
  row.dataset.text = r.text || '';
  row.dataset.status = r.statusCode || 0;

  const badge = makeBadge(r);
  const content = document.createElement('div');
  content.className = 'result-content';

  // Link text
  if (r.text && r.text !== r.url) {
    const textEl = document.createElement('div');
    textEl.className = 'result-text';
    textEl.textContent = truncate(r.text, 60);
    content.appendChild(textEl);
  }

  // URL row with copy button
  const urlRow = document.createElement('div');
  urlRow.className = 'result-url-row';
  const urlEl = document.createElement('div');
  urlEl.className = 'result-url';
  const a = document.createElement('a');
  a.href = r.url;
  a.target = '_blank';
  a.rel = 'noopener';
  a.textContent = truncate(r.url, 56);
  urlEl.appendChild(a);
  urlRow.appendChild(urlEl);

  const copyBtn = document.createElement('button');
  copyBtn.className = 'btn-copy';
  copyBtn.title = 'Copy URL';
  copyBtn.innerHTML = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
  copyBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(r.url);
    copyBtn.innerHTML = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
    setTimeout(() => {
      copyBtn.innerHTML = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
    }, 1200);
  });
  urlRow.appendChild(copyBtn);
  content.appendChild(urlRow);

  // Redirect arrow
  if (r.isRedirect && r.finalUrl !== r.url) {
    const rdEl = document.createElement('div');
    rdEl.className = 'result-redirect';
    rdEl.textContent = '↪ ';
    const rdSpan = document.createElement('span');
    rdSpan.style.opacity = '.7';
    rdSpan.textContent = truncate(r.finalUrl, 58);
    rdEl.appendChild(rdSpan);
    content.appendChild(rdEl);
  }

  // Error text
  if (r.error) {
    const errEl = document.createElement('div');
    errEl.className = 'result-error';
    errEl.textContent = r.error;
    content.appendChild(errEl);
  }

  row.appendChild(badge);
  row.appendChild(content);
  dom.results.appendChild(row);

  // Apply current tab filter immediately
  applyTabFilter(row);
}

function makeBadge(r) {
  const b = document.createElement('span');
  b.className = 'badge';
  if (r.skipped) {
    b.classList.add('badge-error');
    b.textContent = '403';
  } else if (r.isBroken) {
    b.classList.add('badge-broken');
    b.textContent = r.statusCode > 0 ? String(r.statusCode) : 'ERR';
  } else if (r.isRedirect) {
    b.classList.add('badge-redirect');
    b.textContent = String(r.statusCode);
  } else {
    b.classList.add('badge-ok');
    b.textContent = String(r.statusCode);
  }
  return b;
}

function getCategory(r) {
  if (r.isBroken && !r.skipped) return 'broken';
  if (r.isRedirect && !r.isBroken) return 'redirects';
  return 'ok';
}

// ─── Tab counts ─────────────────────────────────────────────────
function updateTabCounts(broken, redirects, ok) {
  const tabs = document.querySelectorAll('.tab');
  tabs.forEach(t => {
    const key = t.dataset.tab;
    const base = { all: 'All', broken: 'Broken', redirects: 'Redirects', ok: 'OK' }[key];
    const count = { all: null, broken, redirects, ok }[key];
    t.textContent = count != null && count > 0 ? `${base} (${count})` : base;
  });
}

// ─── Badge counter ──────────────────────────────────────────────
function updateBadge(brokenCount) {
  if (brokenCount > 0) {
    chrome.action.setBadgeText({ text: String(brokenCount), tabId: state.tabId });
    chrome.action.setBadgeBackgroundColor({ color: '#ef4444', tabId: state.tabId });
  } else {
    chrome.action.setBadgeText({ text: '', tabId: state.tabId });
  }
}

// ─── Tab filtering ─────────────────────────────────────────────
function applyTabFilter(row) {
  const cat = row.dataset.category;
  const tab = state.currentTab;
  const showRedirects = dom.optShowRedirs.checked;

  let visible = true;
  if (tab === 'broken')    visible = cat === 'broken';
  else if (tab === 'redirects') visible = cat === 'redirects';
  else if (tab === 'ok')   visible = cat === 'ok';
  else visible = true; // 'all' tab

  // Honour showRedirects toggle in 'all' view
  if (tab === 'all' && cat === 'redirects' && !showRedirects) visible = false;

  // Apply search filter
  if (visible && state.searchQuery) {
    const url = (row.dataset.url || '').toLowerCase();
    const text = (row.dataset.text || '').toLowerCase();
    visible = url.includes(state.searchQuery) || text.includes(state.searchQuery);
  }

  row.classList.toggle('hidden', !visible);
}

function filterResults() {
  document.querySelectorAll('.result-row').forEach(applyTabFilter);
}

// ─── Sort ───────────────────────────────────────────────────────
function cycleSort() {
  const idx = SORT_MODES.indexOf(state.sortMode);
  state.sortMode = SORT_MODES[(idx + 1) % SORT_MODES.length];
  dom.sortLabel.textContent = state.sortMode.charAt(0).toUpperCase() + state.sortMode.slice(1);
  applySortAndFilter();
}

function applySortAndFilter() {
  const rows = Array.from(dom.results.querySelectorAll('.result-row'));
  rows.sort((a, b) => {
    if (state.sortMode === 'status') {
      return (parseInt(a.dataset.status) || 0) - (parseInt(b.dataset.status) || 0);
    }
    if (state.sortMode === 'url') {
      return (a.dataset.url || '').localeCompare(b.dataset.url || '');
    }
    if (state.sortMode === 'text') {
      return (a.dataset.text || '').localeCompare(b.dataset.text || '');
    }
    return 0; // default = insertion order
  });
  rows.forEach(r => dom.results.appendChild(r));
  filterResults();
}

// ─── Highlights ────────────────────────────────────────────────
function pushHighlights() {
  const broken    = state.results.filter(r => r.isBroken && !r.skipped)
                               .map(r => ({ url: r.url, statusCode: r.statusCode, error: r.error }));
  const redirects = state.results.filter(r => r.isRedirect && !r.isBroken)
                               .map(r => ({ url: r.url, statusCode: r.statusCode, finalUrl: r.finalUrl }));
  sendHighlights(broken, redirects, false);
}

function sendHighlights(broken, redirects, clear) {
  chrome.runtime.sendMessage({
    type: 'INJECT_HIGHLIGHTS',
    tabId: state.tabId,
    broken,
    redirects,
    clear
  }).catch(() => {}); // Tab may have navigated away
}

// ─── Export ────────────────────────────────────────────────────
function exportResults() {
  const lines = [`# LinkCheck Results\n`];
  lines.push(`**Page:** ${state.tabUrl}`);
  lines.push(`**Date:** ${new Date().toLocaleString()}\n`);

  const broken    = state.results.filter(r => r.isBroken && !r.skipped);
  const redirects = state.results.filter(r => r.isRedirect && !r.isBroken);
  const ok        = state.results.filter(r => !r.isBroken && !r.isRedirect && !r.skipped);

  if (broken.length) {
    lines.push(`\n## Broken Links\n`);
    broken.forEach(r => {
      lines.push(`${r.url} (${r.statusCode || 'ERR'}) - "${r.text}"${r.error ? ` [${r.error}]` : ''}`);
    });
  } else {
    lines.push(`\n## Broken Links\n\nNone found ✓`);
  }

  if (dom.optShowRedirs.checked) {
    if (redirects.length) {
      lines.push(`\n## Redirects (Update Recommended)\n`);
      redirects.forEach(r => {
        lines.push(`${r.url} (${r.statusCode}) - "${r.text}" → ${r.finalUrl}`);
      });
    } else {
      lines.push(`\n## Redirects (Update Recommended)\n\nNone found ✓`);
    }
  }

  lines.push(`\n---\n`);
  lines.push(`Total: ${state.total} | Broken: ${broken.length} | Redirects: ${redirects.length} | OK: ${ok.length}`);

  const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  const safe = (state.tabUrl ? new URL(state.tabUrl).hostname : 'page').replace(/[^a-z0-9]/gi, '_');
  a.href     = url;
  a.download = `linkcheck_${safe}_${dateStamp()}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Copy broken ────────────────────────────────────────────────
function copyBrokenLinks() {
  const broken = state.results.filter(r => r.isBroken && !r.skipped);
  if (broken.length === 0) return;
  const text = broken.map(r => r.url).join('\n');
  navigator.clipboard.writeText(text);
  const label = dom.btnCopyBroken.querySelector('.btn-copy-label');
  const prev = label.textContent;
  label.textContent = 'Copied!';
  setTimeout(() => { label.textContent = prev; }, 1200);
}

// ─── Notification ───────────────────────────────────────────────
function notifyScanComplete() {
  // Only notify if the popup isn't focused (user switched tabs)
  if (document.hasFocus()) return;
  const broken = state.results.filter(r => r.isBroken && !r.skipped).length;
  const host = state.tabUrl ? new URL(state.tabUrl).hostname : 'page';
  const msg = broken > 0
    ? `${broken} broken link${broken > 1 ? 's' : ''} found on ${host}`
    : `All links OK on ${host}`;
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: 'LinkCheck',
    message: msg
  });
}

// ─── Theme ──────────────────────────────────────────────────────
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  dom.iconMoon.classList.toggle('hidden', theme === 'light');
  dom.iconSun.classList.toggle('hidden', theme === 'dark');
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  chrome.storage.local.set({ theme: next });
}

// ─── Persist / restore results ──────────────────────────────────
function saveSession() {
  chrome.storage.session.set({
    scanData: {
      tabId: state.tabId,
      tabUrl: state.tabUrl,
      results: state.results,
      total: state.total,
      checked: state.checked,
      currentTab: state.currentTab
    }
  });
}

async function restoreSession() {
  const { scanData } = await chrome.storage.session.get('scanData');
  if (!scanData || scanData.tabId !== state.tabId || scanData.results.length === 0) return false;

  state.results = scanData.results;
  state.total = scanData.total;
  state.checked = scanData.checked;
  state.currentTab = scanData.currentTab;

  // Restore UI
  dom.emptyState.classList.add('hidden');
  dom.sectionStats.classList.remove('hidden');
  dom.sectionTabs.classList.remove('hidden');
  dom.sectionSearch.classList.remove('hidden');
  dom.btnStartLabel.textContent = 'Re-check';
  dom.btnExport.disabled = false;

  // Set active tab
  document.querySelectorAll('.tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === state.currentTab);
  });

  // Render all results
  state.results.forEach(r => appendResult(r));
  updateStats();

  // Show copy broken if applicable
  dom.btnCopyBroken.classList.toggle('hidden',
    state.results.filter(r => r.isBroken && !r.skipped).length === 0);

  return true;
}

// ─── Helpers ───────────────────────────────────────────────────
function truncate(str, n) {
  return str.length <= n ? str : str.slice(0, n - 1) + '…';
}

function dateStamp() {
  const d = new Date();
  return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

function pad(n) { return String(n).padStart(2, '0'); }

function showError(msg) {
  dom.emptyState.classList.remove('hidden');
  const p = dom.emptyState.querySelector('p');
  p.textContent = '';
  const errSpan = document.createElement('span');
  errSpan.style.color = 'var(--broken)';
  errSpan.textContent = msg;
  p.appendChild(errSpan);
  dom.sectionProgress.classList.add('hidden');
}
