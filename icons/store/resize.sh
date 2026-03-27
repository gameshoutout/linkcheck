#!/bin/bash
# Resize screenshots to 1280x800 for Chrome Web Store
# Centers each image on a matching background color canvas

DIR="$(cd "$(dirname "$0")" && pwd)"
OUT="$DIR/final"
mkdir -p "$OUT"

LIGHT="#f8f8fc"
DARK="#13131a"

# screenshot-0: light theme — scale up to fit, center on light bg
convert "$DIR/screenshot-0-open-extension.png" \
  -resize 1200x720 \
  -background "$LIGHT" -gravity center -extent 1280x800 \
  "$OUT/screenshot-1-check-links.png"

# screenshot-1: light theme results — tall, so scale to fit width, crop height, center
convert "$DIR/screenshot-1-results.png" \
  -resize 680x \
  -background "$LIGHT" -gravity north -extent 680x760 \
  -background "$LIGHT" -gravity center -extent 1280x800 \
  "$OUT/screenshot-2-scan-results.png"

# screenshot-2: page highlights — scale up, center on white bg
convert "$DIR/screenshot-2-page-highlights.png" \
  -resize 1100x700 \
  -background white -gravity center -extent 1280x800 \
  "$OUT/screenshot-3-page-highlights.png"

# screenshot-3: dark theme — tall, so scale to fit width, crop height, center
convert "$DIR/screenshot-3-dark-theme.png" \
  -resize 680x \
  -background "$DARK" -gravity north -extent 680x760 \
  -background "$DARK" -gravity center -extent 1280x800 \
  "$OUT/screenshot-4-dark-theme.png"

# screenshot-4: export + markdown side by side — scale down to fit
convert "$DIR/screenshot-4-export-markdown.png" \
  -resize 1240x760 \
  -background "$LIGHT" -gravity center -extent 1280x800 \
  "$OUT/screenshot-5-export-markdown.png"

echo "Done! Files in $OUT/"
ls -lh "$OUT/"
