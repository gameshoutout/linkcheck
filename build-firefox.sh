#!/usr/bin/env bash
# build-firefox.sh — Package LinkCheck for AMO (addons.mozilla.org)
#
# Usage:  bash build-firefox.sh
# Output: linkcheck-firefox.zip in the repo root

set -euo pipefail

DIST="dist-firefox"
OUT="linkcheck-firefox.zip"

# Files needed at the extension root
FILES=(
  background.js
  popup.html
  popup.css
  popup.js
)

# Directories needed at the extension root
DIRS=(
  icons
  fonts
)

if [[ ! -f manifest.firefox.json ]]; then
  echo "Error: manifest.firefox.json not found. Run from repo root." >&2
  exit 1
fi

rm -rf "$DIST" "$OUT"
mkdir -p "$DIST"

# Copy files
for f in "${FILES[@]}"; do
  if [[ ! -e "$f" ]]; then
    echo "Error: missing file $f" >&2
    exit 1
  fi
  cp "$f" "$DIST/"
done

# Copy directories (skip /icons/store which is gitignored screenshots)
for d in "${DIRS[@]}"; do
  if [[ -d "$d" ]]; then
    cp -R "$d" "$DIST/"
  fi
done
rm -rf "$DIST/icons/store" 2>/dev/null || true

# Use the Firefox manifest
cp manifest.firefox.json "$DIST/manifest.json"

# Zip from inside the dist folder so manifest.json sits at the archive root
( cd "$DIST" && zip -qr "../$OUT" . -x "*.DS_Store" )

echo "Built $OUT"
echo "  Upload to: https://addons.mozilla.org/developers/addon/submit/"
echo "  Or test locally: about:debugging → This Firefox → Load Temporary Add-on → pick $DIST/manifest.json"
