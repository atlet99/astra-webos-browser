// Sync start-page -> service/public, then package with official ares-package if present.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const app = path.join(root, 'app');
const pub = path.join(root, 'service', 'public');
/* parity gate runs in package.sh via verify-ipk */
fs.mkdirSync(pub, { recursive: true });
for (const f of ['index.html', 'app.css', 'app.js', 'config.js', 'i18n.js', 'icon.png', 'largeIcon.png']) {
  fs.copyFileSync(path.join(app, f), path.join(pub, f));
}
fs.mkdirSync(path.join(pub, 'i18n'), { recursive: true });
for (const f of fs.readdirSync(path.join(app, 'i18n'))) {
  fs.copyFileSync(path.join(app, 'i18n', f), path.join(pub, 'i18n', f));
}

function tryAres() {
  const candidates = [
    '/opt/homebrew/bin/ares-package',
    '/usr/local/bin/ares-package',
    'ares-package'
  ];
  for (const bin of candidates) {
    try {
      const out = execFileSync(bin, ['-o', path.join(root, 'build'), app, path.join(root, 'service')], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      process.stdout.write(out || '');
      return true;
    } catch (e) {
      if (e.code === 'ENOENT') continue;
      process.stderr.write(String(e.stderr || e.message || e) + '\n');
    }
  }
  return false;
}

if (!tryAres()) {
  process.stderr.write('[build] ares-package not found, falling back to built-in packer (Simulator may reject this).\n');
  const out = execFileSync('node', [path.join(here, 'pack-ipk.mjs'), app, path.join(root, 'build'), path.join(root, 'service')], { encoding: 'utf8' });
  process.stdout.write(out);
} else {
  const out = execFileSync('node', [path.join(here, 'verify-ipk.mjs'), path.join(root, 'build')], { encoding: 'utf8' });
  process.stdout.write(out);
}
