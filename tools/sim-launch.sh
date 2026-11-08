#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_SRC="${APP_SRC:-$ROOT/app}"
APP_ID="${APP_ID:-$(sed -n 's/.*"id": *"\([^"]*\)".*/\1/p' "$APP_SRC/appinfo.json" | head -1)}"
SERVICE_ID="${SERVICE_ID:-$(sed -n 's/.*"name": *"\([^"]*\)".*/\1/p' "$ROOT/service/package.json" | head -1)}"
VERSION="${VERSION:-$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$APP_SRC/appinfo.json" | head -1)}"
OUT_DIR="${OUT_DIR:-$ROOT/build}"
DEV="${DEV:-emulator}"

cd "$ROOT"
sh tools/package.sh >/dev/null 2>&1 || node tools/build.mjs
echo "==> devices"
ares-setup-device
IPK="$OUT_DIR/${APP_ID}_${VERSION}_all.ipk"
if [ ! -f "$IPK" ]; then IPK="$(ls -t "$OUT_DIR"/${APP_ID}_*_all.ipk | head -1)"; fi
ares-install --device "$DEV" "$IPK" 2>&1 | tail -n 5
ares-launch --device "$DEV" "$APP_ID" 2>&1 | tail -n 5
echo "launched; inspect with: ares-inspect --device $DEV $APP_ID"
echo "sim logs: ares-log --device $DEV --service $SERVICE_ID"
