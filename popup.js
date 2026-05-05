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
  optDedup:       $('opt-dedup'),
  rangeTimeout:   $('range-timeout'),
  timeoutVal:     $('timeout-val'),
  rangeConcurrency:$('range-concurrency'),
  concurrencyVal: $('concurrency-val'),
  btnExportJson:  $('btn-export-json'),
  ignorePatterns: $('ignore-patterns'),
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
  statSkipped:    $('stat-skipped'),
  sectionTabs:    $('section-tabs'),
  results:        $('results'),
  emptyState:     $('empty-state'),
  btnTheme:       $('btn-theme'),
  iconMoon:       $('icon-moon'),
  iconSun:        $('icon-sun'),
  footer:         $('footer'),
  version:        $('version'),
  btnClear:       $('btn-clear'),
  sectionSearch:  $('section-search'),
  searchInput:    $('search-input'),
  btnSort:        $('btn-sort'),
  sortLabel:      $('sort-label')
};

// ─── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // Load saved options
  const saved = await chrome.storage.local.get([
    'skipImages','skip403','showRedirects','highlight','theme',
    'timeout','concurrency','dedup','ignorePatterns'
  ]);
  dom.optSkipImages.checked = saved.skipImages ?? false;
  dom.optSkip403.checked    = saved.skip403    ?? false;
  dom.optShowRedirs.checked = saved.showRedirects ?? true;
  dom.optHighlight.checked  = saved.highlight    ?? true;
  dom.optDedup.checked      = saved.dedup        ?? false;
  dom.rangeTimeout.value    = saved.timeout      ?? 15;
  dom.timeoutVal.textContent = `${dom.rangeTimeout.value}s`;
  dom.rangeConcurrency.value = saved.concurrency ?? 5;
  dom.concurrencyVal.textContent = dom.rangeConcurrency.value;
  dom.ignorePatterns.value = saved.ignorePatterns ?? '';

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

  // Save checkbox options on change
  ['optSkipImages','optSkip403','optShowRedirs','optHighlight','optDedup'].forEach(k => {
    const keyMap = {
      optSkipImages: 'skipImages', optSkip403: 'skip403',
      optShowRedirs: 'showRedirects', optHighlight: 'highlight',
      optDedup: 'dedup'
    };
    dom[k].addEventListener('change', () => {
      chrome.storage.local.set({ [keyMap[k]]: dom[k].checked });
      // Live-react to toggle changes
      if (k === 'optShowRedirs') filterResults();
      if (k === 'optHighlight' && state.results.length > 0) {
        if (dom[k].checked) { pushHighlights(); }
        else { sendHighlights([], [], true); }
      }
    });
  });

  // Save range options on change
  dom.rangeTimeout.addEventListener('input', () => {
    dom.timeoutVal.textContent = `${dom.rangeTimeout.value}s`;
    chrome.storage.local.set({ timeout: parseInt(dom.rangeTimeout.value) });
  });
  dom.rangeConcurrency.addEventListener('input', () => {
    dom.concurrencyVal.textContent = dom.rangeConcurrency.value;
    chrome.storage.local.set({ concurrency: parseInt(dom.rangeConcurrency.value) });
  });
  dom.ignorePatterns.addEventListener('change', () => {
    chrome.storage.local.set({ ignorePatterns: dom.ignorePatterns.value });
  });

  // Buttons
  dom.btnStart.addEventListener('click', startScan);
  dom.btnStop.addEventListener('click', stopScan);
  dom.btnExport.addEventListener('click', exportResults);
  dom.btnCopyBroken.addEventListener('click', copyBrokenLinks);
  dom.btnExportJson.addEventListener('click', exportJson);
  dom.btnClear.addEventListener('click', clearResults);
  dom.btnTheme.addEventListener('click', toggleTheme);

  // Show version
  const manifest = chrome.runtime.getManifest();
  dom.version.textContent = `v${manifest.version}`;
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
const UNSCANNABLE = /^(chrome|chrome-extension|edge|brave|about|devtools|file):\/\//;
const STATUS_TEXT = {
  0: 'Network Error', 200: 'OK', 201: 'Created', 204: 'No Content',
  301: 'Moved Permanently', 302: 'Found', 307: 'Temporary Redirect', 308: 'Permanent Redirect',
  400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found',
  405: 'Method Not Allowed', 408: 'Request Timeout', 410: 'Gone', 429: 'Too Many Requests',
  500: 'Internal Server Error', 502: 'Bad Gateway', 503: 'Service Unavailable', 504: 'Gateway Timeout'
};

async function startScan() {
  if (!state.tabId) return;

  // Detect unscannable pages early
  if (state.tabUrl && UNSCANNABLE.test(state.tabUrl)) {
    showError('Cannot scan this page. LinkCheck works on regular web pages (http/https).');
    return;
  }

  // Reset
  state.results  = [];
  state.scanning = true;
  state.aborted  = false;
  state.checked  = 0;
  state.total    = 0;

  state.scanStart = Date.now();
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
  const dedup      = dom.optDedup.checked;

  if (skipImages) {
    links = links.filter(l => !l.isImage);
  }

  // Filter out same-page fragment links (#section)
  const pageBase = state.tabUrl?.split('#')[0];
  if (pageBase) {
    links = links.filter(l => l.url.split('#')[0] !== pageBase);
  }

  if (dedup) {
    const seen = new Set();
    links = links.filter(l => {
      if (seen.has(l.url)) return false;
      seen.add(l.url);
      return true;
    });
  }

  // Apply ignore list
  const ignoreRaw = dom.ignorePatterns.value.trim();
  if (ignoreRaw) {
    const patterns = ignoreRaw.split('\n').map(p => p.trim()).filter(Boolean);
    links = links.filter(l => !patterns.some(p => l.url.includes(p)));
  }

  if (links.length === 0) {
    showError('No HTTP links found on this page.');
    resetUI();
    return;
  }

  state.total = links.length;
  setProgress(`Found ${links.length} links — starting…`, 0, links.length);
  dom.sectionStats.classList.remove('hidden');
  dom.sectionTabs.classList.remove('hidden');
  dom.sectionSearch.classList.remove('hidden');
  updateStats(links.length, 0, 0, 0);

  // Check links with concurrency pool
  const CONCURRENCY = parseInt(dom.rangeConcurrency.value) || 5;
  const TIMEOUT_MS = (parseInt(dom.rangeTimeout.value) || 15) * 1000;
  const HIGHLIGHT_BATCH = 10;
  let idx = 0;

  async function worker() {
    while (idx < links.length && !state.aborted) {
      const link = links[idx++];
      setProgress(`Checking: ${truncate(link.url, 48)}`, state.checked, state.total);

      const result = await chrome.runtime.sendMessage({ type: 'CHECK_LINK', url: link.url, timeout: TIMEOUT_MS });
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
    const elapsed = ((Date.now() - state.scanStart) / 1000).toFixed(1);
    setProgress(`Done in ${elapsed}s`, state.total, state.total);
    setTimeout(() => dom.sectionProgress.classList.add('hidden'), 2000);
    notifyScanComplete();
  }

  dom.btnExport.disabled = state.results.length === 0;
  dom.btnExportJson.disabled = state.results.length === 0;
  if (state.results.length > 0) dom.footer.classList.remove('hidden');
  dom.btnCopyBroken.classList.toggle('hidden',
    state.results.filter(r => r.isBroken && !r.skipped).length === 0);
  saveSession();
  resetUI();
}

function stopScan() {
  state.aborted = true;
  setProgress('Stopped.', state.checked, state.total);
  setTimeout(() => dom.sectionProgress.classList.add('hidden'), 1200);
  saveSession();
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
  dom.progressCount.textContent = total > 0 ? `${done} / ${total} (${pct}%)` : '';
}

function updateProgress() {
  const brokenCount = state.results.filter(r => r.isBroken).length;
  dom.progressBar.classList.toggle('has-broken', brokenCount > 0);
  const label = brokenCount > 0 ? `Checking… (${brokenCount} broken)` : 'Checking…';
  setProgress(label, state.checked, state.total);
}

// ─── Stats ─────────────────────────────────────────────────────
function updateStats(total, broken, redirects, ok) {
  let skipped = 0;
  if (arguments.length === 0) {
    const r = state.results;
    total     = state.total;
    broken    = r.filter(x => x.isBroken && !x.skipped).length;
    redirects = r.filter(x => x.isRedirect && !x.isBroken).length;
    ok        = r.filter(x => !x.isBroken && !x.isRedirect && !x.skipped && x.statusCode > 0).length;
    skipped   = r.filter(x => x.skipped).length;
  }
  dom.statTotal.textContent     = total;
  dom.statBroken.textContent    = broken;
  dom.statRedirects.textContent = redirects;
  dom.statOk.textContent        = ok;
  if (dom.statSkipped) {
    dom.statSkipped.textContent = skipped;
    dom.statSkipped.closest('.stat-cell').classList.toggle('hidden', skipped === 0);
    // Also toggle the divider before it
    const divider = dom.statSkipped.closest('.stat-cell').previousElementSibling;
    if (divider?.classList.contains('stat-divider')) divider.classList.toggle('hidden', skipped === 0);
  }

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
  a.title = r.url;
  urlEl.appendChild(a);

  // Response time
  if (r.responseTime != null) {
    const timeEl = document.createElement('span');
    timeEl.className = 'result-time';
    timeEl.textContent = r.responseTime < 1000 ? `${r.responseTime}ms` : `${(r.responseTime / 1000).toFixed(1)}s`;
    if (r.responseTime > 5000) timeEl.classList.add('result-time-slow');
    urlEl.appendChild(timeEl);
  }

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
  const code = r.statusCode || 0;
  const meaning = STATUS_TEXT[code] || `HTTP ${code}`;
  if (r.skipped) {
    b.classList.add('badge-error');
    b.textContent = '403';
    b.title = 'Forbidden (skipped)';
  } else if (r.isBroken) {
    b.classList.add('badge-broken');
    b.textContent = code > 0 ? String(code) : 'ERR';
    b.title = code > 0 ? meaning : (r.error || 'Network error');
  } else if (r.isRedirect) {
    b.classList.add('badge-redirect');
    b.textContent = String(code);
    b.title = meaning;
  } else {
    b.classList.add('badge-ok');
    b.textContent = String(code);
    b.title = meaning;
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

// ─── JSON export ────────────────────────────────────────────────
function exportJson() {
  const data = {
    page: state.tabUrl,
    date: new Date().toISOString(),
    total: state.total,
    results: state.results.map(r => ({
      url: r.url,
      text: r.text,
      statusCode: r.statusCode,
      finalUrl: r.finalUrl,
      isRedirect: r.isRedirect,
      isBroken: r.isBroken,
      skipped: r.skipped || false,
      error: r.error || null,
      responseTime: r.responseTime || null
    }))
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safe = (state.tabUrl ? new URL(state.tabUrl).hostname : 'page').replace(/[^a-z0-9]/gi, '_');
  a.href = url;
  a.download = `linkcheck_${safe}_${dateStamp()}.json`;
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

// ─── Clear results ──────────────────────────────────────────────
function clearResults() {
  state.results = [];
  state.checked = 0;
  state.total = 0;
  dom.results.querySelectorAll('.result-row').forEach(r => r.remove());
  dom.emptyState.classList.remove('hidden');
  dom.sectionStats.classList.add('hidden');
  dom.sectionTabs.classList.add('hidden');
  dom.sectionSearch.classList.add('hidden');
  dom.footer.classList.add('hidden');
  dom.btnExport.disabled = true;
  dom.btnExportJson.disabled = true;
  dom.btnCopyBroken.classList.add('hidden');
  dom.btnStartLabel.textContent = 'Check Links';
  if (dom.optHighlight.checked) sendHighlights([], [], true);
  updateBadge(0);
  chrome.storage.session.remove('scanData');
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
  if (!scanData || scanData.results.length === 0) return false;
  const sameTab = scanData.tabId === state.tabId;
  const samePage = (scanData.tabUrl || '').split('#')[0] === (state.tabUrl || '').split('#')[0];
  if (!sameTab || !samePage) {
    chrome.storage.session.remove('scanData');
    return false;
  }

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
  dom.btnExportJson.disabled = false;
  dom.footer.classList.remove('hidden');

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

  // Re-inject highlights
  if (dom.optHighlight.checked) pushHighlights();

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
