# LinkCheck TODO

## Bugs

- [ ] **001 - innerHTML XSS in redirect display** — `popup.js:282` uses `innerHTML` with `r.finalUrl` to render the redirect arrow. A malicious redirect URL could inject HTML. Spec explicitly requires no `innerHTML` with unsanitized data. Must use `textContent` + DOM construction.
- [ ] **002 - innerHTML XSS in showError** — `popup.js:427` uses `innerHTML` to display error messages. Should use `textContent` with styled spans created via DOM API.
- [ ] **003 - Orphaned markdown table headers in export** — `popup.js:373-374` emits `| Status | URL | Text |` and a separator row, but actual entries below use plain text format. These table headers are never populated and don't match the spec export format. Remove them.
- [ ] **004 - Magic number for highlight batch size** — Spec defines `HIGHLIGHT_BATCH = 10` as a named constant. Code uses hardcoded `10` at `popup.js:178`. Should be a named constant for clarity and maintainability.
- [ ] **005 - Popup closes and loses scan results** — Chrome popups vanish when you click outside them. A 30-second scan is lost if the user clicks the page. Persist scan results to `chrome.storage.session` so reopening the popup restores the last scan (results, stats, tab filter state).

## Features (v1.0 — Publishing Requirements)

- [ ] **006 - Chrome Web Store listing assets** — Need store description, screenshots (1280x800), promotional images (440x280 small tile, 920x680 large tile), and category selection for publishing.
- [ ] **007 - Privacy policy page** — Chrome Web Store requires a privacy policy URL. Extension collects no data, but a simple policy page is still required. Will live in the GitHub repo (e.g. `PRIVACY.md`) and be served via GitHub Pages.
- [ ] **008 - Bundle fonts locally** — `popup.html` loads JetBrains Mono and IBM Plex Sans from Google Fonts CDN. This means: (a) popup needs internet just to look right, (b) Google gets a request every time the popup opens, (c) Chrome Web Store reviewers may flag external resource loads. Fix: download the font files into a `fonts/` folder and reference them with `@font-face` in the CSS. Adds ~150KB but makes the extension fully self-contained.
- [ ] **009 - LICENSE file** — Add an open source license (MIT or Apache 2.0) to the repo root. Required for open source publishing and good practice.
- [ ] **010 - README.md** — Project README with: what it does, screenshot, install instructions (unpacked + Web Store link), build/dev notes, license badge. This is the first thing users and contributors see.
- [ ] **011 - .gitignore** — Ignore `.claude/`, `*.zip`, `.DS_Store`, `node_modules/`, etc.
- [ ] **012 - Git repository init** — Project has no git repo yet. Initialize, make first commit, push to GitHub.

## Features (UX Polish — Make Users Love It)

- [ ] **013 - Persist scan results across popup close** — Store the last scan's results, stats, and page URL in `chrome.storage.session`. When the popup reopens on the same tab, restore everything instantly instead of showing the empty state. Clear when the tab navigates to a new page.
- [ ] **014 - Light / dark theme** — Add a light theme and a toggle (sun/moon icon) in the header. Default to system preference via `prefers-color-scheme`. Persist choice. Dark-only alienates users who work in bright environments.
- [ ] **015 - Copy URL to clipboard** — Click-to-copy icon on each result row. When fixing broken links you need the URL — having to right-click → copy is friction. Show a brief "Copied!" flash.
- [ ] **016 - Copy all broken links** — Button (next to Export) that copies all broken URLs to clipboard as a newline-separated list. Great for pasting into issues, PRs, or Slack.
- [ ] **017 - Tab counts in labels** — Show result counts in tab labels: "Broken (3)" instead of just "Broken". Gives instant overview without clicking each tab.
- [ ] **018 - Badge counter on toolbar icon** — Show broken link count as a red badge on the extension icon in the toolbar via `chrome.action.setBadgeText`. Users see at a glance if there are problems without opening the popup.
- [ ] **019 - Scan complete notification** — If the user switches to another tab during a long scan, show a browser notification when done (e.g. "LinkCheck: 3 broken links found on example.com"). Uses `chrome.notifications` API. Only fire if popup is not focused.
- [ ] **020 - Keyboard shortcut to scan** — Register a Chrome keyboard shortcut (e.g. `Ctrl+Shift+L`) via manifest `commands` to open the popup. Power users expect this.
- [ ] **021 - Result sorting** — Allow sorting results by status code, URL, or link text. Click column-style sort indicators. Helps find patterns in large result sets.
- [ ] **022 - Search / filter within results** — Small search input above the results list. Filters visible results by URL or link text as you type. Essential when a page has 200+ links.

## Features (v1.x Roadmap — High Priority)

- [ ] **023 - Configurable timeout** — Expose the 15s fetch timeout as a user setting. Currently hardcoded in `background.js:34`.
- [ ] **024 - Configurable concurrency** — Slider or numeric input for parallel check workers. Currently hardcoded `CONCURRENCY = 5` in `popup.js:152`.
- [ ] **025 - Ignore list / allowlist** — Persist URLs or patterns to always skip (e.g. localhost, internal domains). Stored in `chrome.storage.local`.

## Features (v1.x Roadmap — Medium Priority)

- [ ] **026 - Retry logic** — Exponential back-off for transient 503/504 errors before marking as broken.
- [ ] **027 - Right-click context menu** — Trigger scan from right-click context menu on page via `chrome.contextMenus` API.
- [ ] **028 - JSON export format** — Export results as JSON in addition to Markdown.
- [ ] **029 - Link deduplication option** — User toggle to check each unique URL only once (vs checking every anchor occurrence). Off by default.

## Features (v1.x Roadmap — Low Priority)

- [ ] **030 - Scan multiple tabs** — Queue and scan a list of open tabs sequentially.
- [ ] **031 - Scheduled scans** — Alarm-based periodic scanning with `chrome.alarms` API and notifications.

---

## Done

_(Completed items move here with date)_
