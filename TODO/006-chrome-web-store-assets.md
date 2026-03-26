# 006 — Chrome Web Store Listing Assets

Everything you need to submit LinkCheck to the Chrome Web Store.

---

## Before You Start

- **Developer account:** Register at https://chrome.google.com/webstore/devconsole ($5 one-time fee)
- **2-Step Verification:** Must be enabled on your Google account before you can publish

---

## Required Images

### 1. Store Icon
- **Dimensions:** 128x128 px
- **Format:** PNG
- **Notes:** 96x96 artwork centered with 16px transparent padding on each side. Must look good on both light and dark backgrounds.
- **You already have:** `icons/icon128.png` — verify it meets the padding requirement.

### 2. Screenshots (at least 1, up to 5)
- **Dimensions:** 1280x800 px (preferred) or 640x400 px
- **Format:** JPEG or 24-bit PNG (no transparency/alpha)
- **Notes:** Full bleed, square corners, no extra padding. Should show the extension in action.

**Suggested screenshots to create:**

| # | What to capture | Why |
|---|-----------------|-----|
| 1 | Popup showing scan results with a mix of broken, redirect, and OK links | Shows the core value — this is your hero image |
| 2 | Page with red/orange highlight overlays and a hover tooltip visible | Shows the in-page highlighting feature |
| 3 | Popup in light theme with the options chips visible | Shows customization and light theme |
| 4 | Export button clicked, showing the downloaded Markdown file | Shows the export feature |
| 5 | Empty state with "Check Links" button prominent | Shows how clean and simple it is to start |

**How to capture:** Open the extension on a real page with broken links (e.g. a test page you control). Use Chrome DevTools device toolbar or a screenshot tool to get exactly 1280x800. Crop browser chrome out — show only the page + popup.

### 3. Small Promotional Tile
- **Dimensions:** 440x280 px
- **Format:** PNG or JPEG
- **Notes:** This appears on the Web Store homepage, category pages, and search results. Not locale-specific.
- **Content suggestion:** LinkCheck logo + tagline "Scan any page for broken links" on the dark background (#13131a). Keep it clean, no tiny text.

### 4. Marquee Promotional Image (optional)
- **Dimensions:** 1400x560 px
- **Format:** PNG or JPEG
- **Notes:** Only needed if you want to be featured in the marquee carousel. Can skip for initial launch.

---

## Required Text Fields

### 1. Extension Name
- **Max:** 75 characters
- **Current value (from manifest.json):** `LinkCheck`

### 2. Summary
- **Max:** 132 characters
- **This shows in search results and category pages — make it count.**
- **Suggested:** `Scan any webpage for broken and redirected links. One click to audit, highlights on-page, exports to Markdown.`
- (110 characters)

### 3. Description
- **No hard character limit**, but keep it scannable. Bullet points work well.
- **Suggested draft:**

```
LinkCheck scans any webpage for broken and redirected links with a single click.

HOW IT WORKS
• Click the LinkCheck icon and press Check Links
• Results stream in as each link is checked — no waiting
• Broken links get a red badge, redirects get orange, OK links get green
• Filter results by status using the tab bar
• Search and sort results to find what you need fast

ON-PAGE HIGHLIGHTS
• Broken links are outlined in red directly on the page
• Redirected links are outlined in orange
• Hover over highlighted links to see status codes and redirect targets

EXPORT & SHARE
• Export results as a Markdown report
• Copy all broken URLs to clipboard with one click
• Paste into GitHub issues, PRs, Slack, or email

OPTIONS
• Skip image links to focus on content
• Skip 403 errors (common for sites that block automated requests)
• Toggle redirect visibility
• Toggle page highlights on/off
• Light and dark theme

PRIVACY
• No analytics, tracking, or data collection
• No data leaves your browser except link check requests
• Only stores 4 boolean preferences locally
• Open source under MIT license

Works on Chrome, Edge, Brave, and all Chromium browsers (88+).
```

---

## Required Privacy Fields

### 1. Single Purpose Description
- **What to enter:** `Scans the active webpage for broken and redirected hyperlinks.`

### 2. Permission Justifications
Fill these in on the dashboard for each permission:

| Permission | Justification |
|------------|---------------|
| `activeTab` | Reads anchor elements from the currently active tab to extract links for checking. Only activates when the user opens the popup. |
| `scripting` | Injects highlight overlays (CSS outlines and tooltips) onto the active page to visually mark broken and redirected links. |
| `storage` | Stores 5 user preferences (skip images, skip 403, show redirects, highlight toggle, theme) locally between sessions. |
| `notifications` | Shows a browser notification when a scan completes and the popup is not focused, so the user knows results are ready. |
| `tabs` | Reads the active tab's URL and ID to display the page hostname in the popup header and to scope scan results to the correct tab. |
| `host_permissions: <all_urls>` | Sends HTTP HEAD/GET requests to any URL found on the scanned page to verify whether the link is reachable. Without this, the extension could only check links on pre-approved domains. |

### 3. Data Usage Disclosure
- **Does your extension collect or use data?** No
- **Does it use remote code?** No
- Check all boxes that apply: **None** — no personal data, browsing history, or sensitive data is collected.

### 4. Privacy Policy URL
- **Value:** `https://computerscienceiscool.github.io/linkcheck/privacy.html`

---

## Other Dashboard Fields

### Category
- **Recommended:** `Developer Tools`
- **Alternative:** `Productivity`

### Language
- **Primary:** English

### Visibility
- **Public** (anyone can find and install)

### Distribution
- **All regions** (unless you have a reason to restrict)

---

## Checklist

- [ ] Verify `icons/icon128.png` meets 96x96 artwork + 16px padding requirement
- [ ] Create screenshot 1: scan results (1280x800, PNG/JPEG)
- [ ] Create screenshot 2: page highlights with tooltip (1280x800, PNG/JPEG)
- [ ] Create screenshot 3: light theme with options (1280x800, PNG/JPEG)
- [ ] Create screenshot 4: export/markdown file (1280x800, PNG/JPEG)
- [ ] Create screenshot 5: empty state (1280x800, PNG/JPEG)
- [ ] Create small promotional tile (440x280, PNG/JPEG)
- [ ] Register Chrome Web Store developer account ($5)
- [ ] Enable 2-Step Verification on Google account
- [ ] Fill in all text fields (summary, description, privacy)
- [ ] Fill in permission justifications
- [ ] Set privacy policy URL
- [ ] Upload ZIP of extension files
- [ ] Submit for review
