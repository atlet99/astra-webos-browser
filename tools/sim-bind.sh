#!/bin/sh
# Register our JS service in every webOS Simulator profile (25+26) so the
# Service panel loads service.js — without this the app launches but the service never exists.
# Env: ROOT, APP_SRC (override), TARGET (override), SIM_DIR (override)
set -e
ROOT="${ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
APP_SRC="${APP_SRC:-$ROOT/app}"
TARGET="${TARGET:-$ROOT/build/pkg/services/$(sed -n 's/.*"name": *"\([^"]*\)".*/\1/p' "$ROOT/service/package.json" | head -1)}"
[ -f "$TARGET/package.json" ] && [ -f "$TARGET/services.json" ] || { echo "sim-bind: bad service dir $TARGET" >&2; exit 1; }
SIM_DIR="${SIM_DIR:-$HOME/Library/Application Support/webos-simulator}"
[ -d "$SIM_DIR" ] || exit 0
python3 - "$TARGET" "$APP_SRC" <<'PYEOF'
import json, os, sys, glob
target, app_src = sys.argv[1], sys.argv[2]
sim_dir = os.path.expanduser('~/Library/Application Support/webos-simulator')
for path in glob.glob(os.path.join(sim_dir, 'webos-tv-simulator-*.json')):
    try:
        with open(path, encoding='utf-8') as fh: data = json.load(fh)
    except Exception: continue
    internal = data.setdefault('internal', {})
    svcs = internal.setdefault('jsServices', [])
    # replace any previous ASTRA entry with the stable stage dir; keep other entries untouched
    base = os.path.basename(target)
    svcs = [e for e in svcs if not (isinstance(e, dict) and os.path.basename(str(e.get('dirPath',''))) == base)]
    if target not in [e.get('dirPath') for e in svcs if isinstance(e, dict)]:
        svcs.append({'dirPath': target, 'isActive': True})
    # dedupe dirPaths (Simulator may duplicate on repeated binds)
    seen=set(); uniq=[]
    for e in svcs:
        if e.get('dirPath') in seen: continue
        seen.add(e.get('dirPath')); uniq.append(e)
    svcs = uniq
    internal['jsServices'] = svcs
    apps = internal.setdefault('appEntries', [])
    if app_src not in apps: apps.append(app_src)
    with open(path, 'w', encoding='utf-8') as fh:
        json.dump(data, fh, indent='\t', ensure_ascii=False)
    print('sim-bind', os.path.basename(path), 'entries now', len(svcs))
PYEOF
