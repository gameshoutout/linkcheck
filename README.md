# LinkCheck

A lightweight Chrome extension that scans any webpage for broken and redirected links. One click to audit, highlights issues directly on the page, and exports results as Markdown.

## Features

- Scans all anchor links on the active tab
- Classifies links as **Broken**, **Redirect**, or **OK**
- Real-time streaming results as links are checked
- Visual highlights on the page with hover tooltips
- Configurable options: skip images, skip 403, show redirects, toggle highlights
- Zero configuration — works out of the box
- Privacy-first — no data leaves your browser except outbound link checks

## Install

### Chrome Web Store

_Coming soon._

### Load Unpacked (Development)

1. Clone this repo
2. Open Chrome and go to `chrome://extensions`
3. Enable **Developer Mode** (top-right toggle)
4. Click **Load unpacked** and select the project folder
5. The LinkCheck icon appears in your toolbar

## How It Works

Click the extension icon on any webpage, then press **Check Links**. LinkCheck extracts all HTTP/HTTPS anchor links from the page, checks each one via HEAD request (falling back to GET), and streams results into the popup panel. Broken links get a red badge, redirects get orange, and OK links get green. If highlighting is enabled, broken and redirected links are outlined directly on the page with hover tooltips showing the status. 

## Privacy

LinkCheck makes no external requests except to the URLs already present on the page you're scanning. No analytics, telemetry, or tracking of any kind. See [Privacy Policy](https://gameshoutout.github.io/linkcheck/privacy.html)
  for full details.

## License

[Apache 2.0](LICENSE)
