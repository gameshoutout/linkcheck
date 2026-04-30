# LinkCheck

A lightweight browser extension for **Chrome and Firefox** that scans any webpage for broken and redirected links. One click to audit, highlights issues directly on the page, and exports results as Markdown.

## Features

- Scans all anchor links on the active tab
- Classifies links as **Broken**, **Redirect**, or **OK**
- Real-time streaming results as links are checked
- Visual highlights on the page with hover tooltips
- Configurable options: skip images, skip 403, show redirects, toggle highlights
- Zero configuration — works out of the box
- Privacy-first — no data leaves your browser except outbound link checks

## Install

### Chrome / Edge / Brave

[Install LinkCheck from the Chrome Web Store](https://chromewebstore.google.com/detail/linkcheck/mcedpgkgnkcnaamkggligoahjackaghd)

### Firefox

[Install LinkCheck from Firefox Add-ons](https://addons.mozilla.org/firefox/addon/linkcheck/) (Firefox 115+)

### Load Unpacked (Development)

**Chrome:**
1. Clone this repo
2. Open Chrome and go to `chrome://extensions`
3. Enable **Developer Mode** (top-right toggle)
4. Click **Load unpacked** and select the project folder

**Firefox:**
1. Clone this repo
2. Run `bash build-firefox.sh` to produce `dist-firefox/` with the Firefox manifest
3. Open `about:debugging#/runtime/this-firefox`
4. Click **Load Temporary Add-on** and select `dist-firefox/manifest.json`

## How It Works

Click the extension icon on any webpage, then press **Check Links**. LinkCheck extracts all HTTP/HTTPS anchor links from the page, checks each one via HEAD request (falling back to GET), and streams results into the popup panel. Broken links get a red badge, redirects get orange, and OK links get green. If highlighting is enabled, broken and redirected links are outlined directly on the page with hover tooltips showing the status.

## Building Releases

The repo contains two manifests:

- `manifest.json` — Chrome / Edge / Brave (uses `background.service_worker`)
- `manifest.firefox.json` — Firefox (uses `background.scripts` and includes `browser_specific_settings.gecko`)

All other source files (`background.js`, `popup.*`, icons, fonts) are shared.

**Chrome:** zip the repo root (excluding `manifest.firefox.json`, `build-firefox.sh`, the website files, and `dist-firefox/`) and upload to the Chrome Web Store dashboard.

**Firefox:** run `bash build-firefox.sh` to produce `linkcheck-firefox.zip`. Upload that zip to [addons.mozilla.org](https://addons.mozilla.org/developers/addon/submit/).

### AMO reviewer notes

When submitting to AMO, you'll be asked about the `<all_urls>` host permission. A short justification:

> LinkCheck sends HTTP HEAD/GET requests to every anchor link on the page the user is currently scanning, in order to detect broken or redirected links. Because users can scan any page on the open web, the extension needs permission to make requests to any host. No page content is read or modified on third-party sites; only the URLs already present on the active tab are contacted.

Source code is under `Apache-2.0`; reviewers can build the same artifact with `bash build-firefox.sh`.

## Privacy

LinkCheck makes no external requests except to the URLs already present on the page you're scanning. No analytics, telemetry, or tracking of any kind. See [Privacy Policy](https://gameshoutout.github.io/linkcheck/privacy.html) for full details.

## License

[Apache 2.0](LICENSE)
