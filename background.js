// background.js — Service Worker
// Handles cross-origin fetch requests and link extraction

const BROKEN_CODES = new Set([403, 404, 410, 500, 502, 503, 504]);
const DEFAULT_TIMEOUT = 15000;

// ─── Context menu ─────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'linkcheck-scan',
    title: 'Scan page with LinkCheck',
    contexts: ['page']
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'linkcheck-scan' && tab?.id) {
    chrome.action.openPopup().catch(() => {});
  }
});

// ─── Message handler ──────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'CHECK_LINK') {
    checkLink(msg.url, msg.timeout || DEFAULT_TIMEOUT)
      .then(sendResponse)
      .catch(err => sendResponse({
        url: msg.url, statusCode: 0, finalUrl: msg.url,
        isRedirect: false, isBroken: true, error: err.message
      }));
    return true; // Keep message channel open for async response
  }

  if (msg.type === 'GET_LINKS') {
    extractLinksFromTab(msg.tabId)
      .then(sendResponse)
      .catch(err => sendResponse({ error: err.message, links: [] }));
    return true;
  }

  if (msg.type === 'INJECT_HIGHLIGHTS') {
    injectHighlights(msg.tabId, msg.broken, msg.redirects, msg.clear)
      .then(sendResponse)
      .catch(() => sendResponse({ ok: false }));
    return true;
  }
});

const RETRY_CODES = new Set([503, 504]);
const MAX_RETRIES = 2;

async function checkLink(url, timeout) {
  let lastResult;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    lastResult = await attemptCheck(url, timeout);
    // Only retry on transient errors
    if (!RETRY_CODES.has(lastResult.statusCode)) break;
    // Exponential back-off: 1s, 2s
    if (attempt < MAX_RETRIES) {
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  return lastResult;
}

async function attemptCheck(url, timeout) {
  const startTime = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  const fetchOpts = {
    signal: controller.signal,
    redirect: 'follow',
    credentials: 'omit',
    cache: 'no-store',
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LinkCheck/1.0)' }
  };

  try {
    let resp;
    try {
      resp = await fetch(url, { ...fetchOpts, method: 'HEAD' });
      // Some servers return 405 for HEAD — fall back to GET
      if (resp.status === 405 || resp.status === 501) {
        resp = await fetch(url, { ...fetchOpts, method: 'GET' });
      }
    } catch (_) {
      resp = await fetch(url, { ...fetchOpts, method: 'GET' });
    }

    clearTimeout(timeoutId);

    const statusCode = resp.status;
    const finalUrl = resp.url;

    // Normalize trailing slash differences — not a real redirect
    const normalize = u => u.replace(/\/$/, '');
    const isRedirect = normalize(finalUrl) !== normalize(url) && resp.ok;
    const isBroken = BROKEN_CODES.has(statusCode);

    return { url, statusCode, finalUrl, isRedirect, isBroken, error: null, responseTime: Date.now() - startTime };
  } catch (err) {
    clearTimeout(timeoutId);
    return {
      url,
      statusCode: 0,
      finalUrl: url,
      isRedirect: false,
      isBroken: true,
      error: err.name === 'AbortError' ? 'Timed out' : 'Connection failed',
      responseTime: Date.now() - startTime
    };
  }
}

async function extractLinksFromTab(tabId) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const anchors = Array.from(document.querySelectorAll('a[href]'));
      return anchors
        .filter(a => a.href.startsWith('http://') || a.href.startsWith('https://'))
        .map(a => {
          const img = a.querySelector('img');
          const text = img
            ? (img.alt || img.src || 'image').trim()
            : (a.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 120);
          const href = a.href;
          const isImage = /\.(png|jpe?g|gif|svg|webp|bmp|ico)(\?.*)?$/i.test(href);
          return { url: href, text: text || href, isImage };
        });
    }
  });
  return { links: results[0].result };
}

async function injectHighlights(tabId, broken, redirects, clear) {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (broken, redirects, clear) => {
      const STYLE_ID = 'linkcheck-highlight-styles';
      const ATTR = 'data-linkcheck';

      // Remove previous highlights
      document.querySelectorAll(`[${ATTR}]`).forEach(el => {
        el.removeAttribute(ATTR);
        el.style.removeProperty('outline');
        el.style.removeProperty('outline-offset');
        // Remove any injected tooltip
        const tip = el.querySelector('.linkcheck-tip');
        if (tip) tip.remove();
      });

      if (clear) return;

      // Inject styles once
      if (!document.getElementById(STYLE_ID)) {
        const s = document.createElement('style');
        s.id = STYLE_ID;
        s.textContent = `
          [data-linkcheck="broken"] {
            outline: 2px dashed #ef4444 !important;
            outline-offset: 3px !important;
          }
          [data-linkcheck="redirect"] {
            outline: 2px dashed #f97316 !important;
            outline-offset: 3px !important;
          }
          .linkcheck-tip {
            display: none;
            position: absolute;
            background: #1e1e2e;
            color: #cdd6f4;
            font: 11px/1.4 monospace;
            padding: 4px 8px;
            border-radius: 4px;
            z-index: 2147483647;
            white-space: nowrap;
            pointer-events: none;
            border: 1px solid #45475a;
            top: calc(100% + 4px);
            left: 0;
            box-shadow: 0 4px 12px rgba(0,0,0,.5);
          }
          [data-linkcheck]:hover { position: relative !important; }
          [data-linkcheck]:hover .linkcheck-tip { display: block !important; }
        `;
        document.head.appendChild(s);
      }

      // Build lookup maps for O(1) access per anchor
      const brokenMap = new Map(broken.map(b => [b.url, b]));
      const redirectMap = new Map(redirects.map(r => [r.url, r]));

      const anchors = document.querySelectorAll('a[href]');
      anchors.forEach(a => {
        const url = a.href;
        const brokenEntry = brokenMap.get(url);
        const redirectEntry = redirectMap.get(url);

        if (brokenEntry) {
          a.setAttribute(ATTR, 'broken');
          const tip = document.createElement('span');
          tip.className = 'linkcheck-tip';
          tip.textContent = `⛔ ${brokenEntry.statusCode || 'ERR'} — ${brokenEntry.error || 'Broken'}`;
          a.appendChild(tip);
        } else if (redirectEntry) {
          a.setAttribute(ATTR, 'redirect');
          const tip = document.createElement('span');
          tip.className = 'linkcheck-tip';
          tip.textContent = `↪ ${redirectEntry.statusCode} → ${redirectEntry.finalUrl.slice(0, 60)}`;
          a.appendChild(tip);
        }
      });
    },
    args: [broken, redirects, clear]
  });
  return { ok: true };
}
