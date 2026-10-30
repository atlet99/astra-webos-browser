// Sync the start-page assets into the service bundle and build the IPK.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const app = path.join(root, 'app');
const pub = path.join(root, 'service', 'public');
fs.mkdirSync(pub, { recursive: true });
for (const f of ['index.html', 'app.css', 'app.js', 'config.js', 'icon.png', 'largeIcon.png']) {
  fs.copyFileSync(path.join(app, f), path.join(pub, f));
}
const out = execFileSync('node', [path.join(here, 'pack-ipk.mjs'), app, path.join(root, 'build'), path.join(root, 'service')], { encoding: 'utf8' });
process.stdout.write(out);
