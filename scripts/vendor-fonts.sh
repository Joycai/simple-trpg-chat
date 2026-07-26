#!/usr/bin/env bash
#
# Regenerate the vendored web fonts in src/fonts/.
#
# Pulls the latin-subset woff2 files out of the Fontsource npm packages, which
# repackage exactly what Google Fonts serves. Needs the npm registry, NOT
# fonts.googleapis.com — that is the whole point of vendoring these.
#
# Usage: ./scripts/vendor-fonts.sh
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="$REPO_ROOT/src/fonts"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

VARIABLE_PKGS=(
  @fontsource-variable/inter
  @fontsource-variable/space-grotesk
  @fontsource-variable/jetbrains-mono
  @fontsource-variable/cinzel
  @fontsource-variable/cormorant-garamond
  @fontsource-variable/lora
)
STATIC_PKGS=(
  @fontsource/crimson-text
  @fontsource/courier-prime
  @fontsource/marcellus
  @fontsource/special-elite
  @fontsource/noto-serif-sc
  @fontsource/shippori-mincho
)

echo "==> Installing Fontsource packages into $TMP"
cd "$TMP"
npm init -y >/dev/null
# Not added to package.json on purpose: these are a build-time source of woff2
# files, not a runtime dependency of the app.
npm install --no-audit --no-fund --silent "${VARIABLE_PKGS[@]}" "${STATIC_PKGS[@]}"

N="$TMP/node_modules"
mkdir -p "$DEST"

# variable: <dest name> <package> <source basename>
copy() { cp "$N/$2/files/$3" "$DEST/$1"; echo "    $1"; }

echo "==> Copying latin subsets into $DEST"
copy inter-wght.woff2               @fontsource-variable/inter               inter-latin-wght-normal.woff2
copy space-grotesk-wght.woff2       @fontsource-variable/space-grotesk       space-grotesk-latin-wght-normal.woff2
copy jetbrains-mono-wght.woff2      @fontsource-variable/jetbrains-mono      jetbrains-mono-latin-wght-normal.woff2
copy cinzel-wght.woff2              @fontsource-variable/cinzel              cinzel-latin-wght-normal.woff2
copy cormorant-garamond-wght.woff2  @fontsource-variable/cormorant-garamond  cormorant-garamond-latin-wght-normal.woff2
copy lora-wght.woff2                @fontsource-variable/lora                lora-latin-wght-normal.woff2
copy lora-wght-italic.woff2         @fontsource-variable/lora                lora-latin-wght-italic.woff2

for w in 400 600 700; do
  copy "crimson-text-$w.woff2"        @fontsource/crimson-text "crimson-text-latin-$w-normal.woff2"
  copy "crimson-text-$w-italic.woff2" @fontsource/crimson-text "crimson-text-latin-$w-italic.woff2"
done
for w in 400 700; do
  copy "courier-prime-$w.woff2" @fontsource/courier-prime "courier-prime-latin-$w-normal.woff2"
done
copy marcellus-400.woff2     @fontsource/marcellus     marcellus-latin-400-normal.woff2
copy special-elite-400.woff2 @fontsource/special-elite special-elite-latin-400-normal.woff2
for w in 400 500 700; do
  copy "noto-serif-sc-$w.woff2" @fontsource/noto-serif-sc "noto-serif-sc-latin-$w-normal.woff2"
done
for w in 400 600 800; do
  copy "shippori-mincho-$w.woff2" @fontsource/shippori-mincho "shippori-mincho-latin-$w-normal.woff2"
done

cp "$N/@fontsource/crimson-text/LICENSE" "$DEST/OFL.txt"

echo "==> Done. $(ls -1 "$DEST"/*.woff2 | wc -l | tr -d ' ') woff2 files, $(du -sh "$DEST" | cut -f1) total."
echo "    Review with: git diff --stat -- src/fonts"
