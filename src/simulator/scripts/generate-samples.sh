#!/usr/bin/env bash
# generate-samples.sh — Generate or replace sample images for the LitCrop simulator
#
# Usage:
#   ./generate-samples.sh            # generate minimal placeholder JPEGs (default)
#   ./generate-samples.sh --real     # print instructions for adding real farm photos
#
# Real images (recommended for demo purposes):
#   1. Take or source farm photos (tomatoes, basil, cucumber, lettuce, etc.)
#   2. Resize to ~640x480: convert input.jpg -resize 640x480 output.jpg
#   3. Copy to src/simulator/sample-images/ using the naming convention below:
#        tomato-healthy-01.jpg
#        basil-growing-01.jpg
#        cucumber-seedling-01.jpg
#        lettuce-mature-01.jpg
#        strawberry-flowering-01.jpg
#        eggplant-young-01.jpg
#
# Requirements for real image generation via ImageMagick:
#   apt-get install imagemagick   (Debian/Ubuntu)
#   brew install imagemagick      (macOS)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_DIR="$SCRIPT_DIR/../sample-images"

if [[ "${1:-}" == "--real" ]]; then
  echo "To add real images, see the comments at the top of this script."
  exit 0
fi

mkdir -p "$OUTPUT_DIR"

# Generate placeholder JPEGs using ImageMagick if available
IMAGES=(
  "tomato-healthy-01:Tomato+Healthy"
  "basil-growing-01:Basil+Growing"
  "cucumber-seedling-01:Cucumber+Seedling"
  "lettuce-mature-01:Lettuce+Mature"
  "strawberry-flowering-01:Strawberry+Flowering"
  "eggplant-young-01:Eggplant+Young"
)

if command -v convert &>/dev/null; then
  echo "ImageMagick found — generating labeled placeholder images..."
  for entry in "${IMAGES[@]}"; do
    name="${entry%%:*}"
    label="${entry##*:}"
    outfile="$OUTPUT_DIR/${name}.jpg"
    convert -size 320x240 xc:green \
      -fill white -font Helvetica -pointsize 18 \
      -gravity Center -annotate 0 "${label/+/ }" \
      "$outfile"
    echo "  Created: ${name}.jpg"
  done
else
  echo "ImageMagick not found — placeholder JPEGs already created by generate-sample-images.mjs"
  echo "Run: node src/simulator/scripts/generate-sample-images.mjs"
fi

echo "Done. Sample images are in: $OUTPUT_DIR"
