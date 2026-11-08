#!/bin/sh
# package app+service into webOS IPK via ares-package + stage locally.
# Stable STAGE dir so Simulator JS-Services panel never points at a deleted path.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_SRC="${APP_SRC:-$ROOT/app}"
SVC_SRC="${SVC_SRC:-$ROOT/service}"
APP_ID="${APP_ID:-$(sed -n 's/.*"id": *"\([^"]*\)".*/\1/p' "$APP_SRC/appinfo.json" | head -1)}"
SERVICE_ID="${SERVICE_ID:-$(sed -n 's/.*"name": *"\([^"]*\)".*/\1/p' "$SVC_SRC/package.json" | head -1)}"
VERSION="${VERSION:-$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$APP_SRC/appinfo.json" | head -1)}"
STAGE="${STAGE:-$ROOT/build/pkg}"
APP_STAGE="$STAGE/apps/$APP_ID"
SVC_STAGE="$STAGE/services/$SERVICE_ID"
if [ -z "$APP_ID" ] || [ -z "$SERVICE_ID" ]; then
    echo "cannot read APP_ID/SERVICE_ID from $APP_SRC/appinfo.json or $SVC_SRC/package.json" >&2; exit 1
fi
if [ -d "$STAGE" ] && ! rm -rf "$STAGE" 2>/dev/null; then
    chmod -R u+rwX "$STAGE" 2>/dev/null || true
    rm -rf "$STAGE" 2>/dev/null || true
fi
if [ -d "$STAGE" ]; then
    echo "cannot clear staging $STAGE (close Simulator and retry)" >&2; exit 1
fi
mkdir -p "$APP_STAGE" "$SVC_STAGE"

# app files only — no tooling/docs/plans
cp "$APP_SRC/index.html" "$APP_SRC/appinfo.json" "$APP_SRC"/*.js "$APP_SRC"/*.css "$APP_STAGE/"
mkdir -p "$APP_STAGE/i18n"
cp "$APP_SRC"/i18n/*.js "$APP_STAGE/i18n/"
cp -R "$APP_SRC/webOSUserScripts" "$APP_STAGE/webOSUserScripts"
cp "$APP_SRC/icon.png" "$APP_SRC/largeIcon.png" "$APP_STAGE/"

# service (sync public first so stage matches runtime)
node "$ROOT/tools/build.mjs" >/dev/null
cp "$SVC_SRC/service.js" "$SVC_SRC/services.json" "$SVC_SRC/package.json" "$SVC_STAGE/"
mkdir -p "$SVC_STAGE/public/i18n"
cp "$SVC_SRC/public/index.html" "$SVC_SRC/public/app.css" "$SVC_SRC/public/app.js" "$SVC_SRC/public/config.js" "$SVC_SRC/public/i18n.js" "$SVC_SRC/public/icon.png" "$SVC_SRC/public/largeIcon.png" "$SVC_STAGE/public/"
find "$SVC_SRC/public/i18n" -type f -exec cp {} "$SVC_STAGE/public/i18n/" \;

# strip macOS junk
xattr -cr "$STAGE" 2>/dev/null || true
find "$STAGE" \( -name '.DS_Store' -o -name '._*' \) -delete

# validate then package with official CLI (-n: no minify — our JS is already clean, ares minifier can mangle)
for f in $(find "$APP_STAGE" -name '*.js'); do node --check "$f" || { echo "SYNTAX BROKEN: $f" >&2; exit 1; }; done
OUT_DIR="${OUT_DIR:-$ROOT/build}"
if command -v ares-package >/dev/null 2>&1; then
    ares-package -n "$APP_STAGE" "$SVC_STAGE" -o "$OUT_DIR"
    IPK="$OUT_DIR/${APP_ID}_${VERSION}_all.ipk"
    if [ ! -f "$IPK" ]; then IPK="$(ls -t "$OUT_DIR"/${APP_ID}_*_all.ipk | head -1)"; fi
    echo "IPK: $IPK"
else
    echo "ares-package missing — fallback: node tools/pack-ipk.mjs app build service" >&2
    node "$ROOT/tools/pack-ipk.mjs" "$APP_SRC" "$OUT_DIR" "$SVC_SRC"
fi

# verify staging files exist in IPK
node "$ROOT/tools/verify-ipk.mjs" "$OUT_DIR"

# Bind Simulator to this stage's service
STAGE="$STAGE" sh "$ROOT/tools/sim-bind.sh" || true
