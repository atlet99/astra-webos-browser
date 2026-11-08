// Verify IPK is compliant with webOS TV packaging (ares-package -i semantics).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const dir = process.argv[2] || path.join(root, 'build');
const ipkName = fs.readdirSync(dir).filter(f => f.endsWith('.ipk')).map(f => ({ f, at: fs.statSync(path.join(dir, f)).mtimeMs })).sort((a, b) => b.at - a.at)[0]?.f;
if (!ipkName) { console.error('no ipk in ' + dir); process.exit(1); }
const buf = fs.readFileSync(path.join(dir, ipkName));
const members = [];
let pos = 8;
while (pos + 60 <= buf.length) {
  const h = buf.slice(pos, pos + 60).toString('ascii');
  const name = h.slice(0, 16).trim();
  const size = parseInt(h.slice(48, 58).trim() || '0', 10);
  pos += 60;
  const data = buf.slice(pos, pos + size);
  pos += size + (size % 2 ? 1 : 0);
  members.push({ name, data });
}
function tarList(gz) {
  const tar = zlib.gunzipSync(gz);
  const files = [];
  let off = 0;
  while (off + 512 <= tar.length) {
    const name = tar.slice(off, off + 100).toString('utf8').replace(/\0.*$/, '').trim();
    const size = tar.slice(off + 124, off + 136).toString('ascii').replace(/\0.*$/, '').trim();
    const sz = parseInt(size || '0', 8) || 0;
    if (name) files.push(name);
    off += 512 + Math.ceil(sz / 512) * 512;
    if (off > tar.length) break;
  }
  return files;
}
const dataGz = members.find(m => m.name === 'data.tar.gz').data;
const files = tarList(dataGz);
const svc = files.find(f => f.includes('/services/com.personal.tvwebbrowser.service/service.js'));
const pkg = files.find(f => f.includes('/packages/com.personal.tvwebbrowser/packageinfo.json'));
const appinfo = files.find(f => f.endsWith('/applications/com.personal.tvwebbrowser/appinfo.json'));
const checks = [
  ['ar members debian-binary/control.tar.gz/data.tar.gz', members.map(m => m.name).join(',') === 'debian-binary,control.tar.gz,data.tar.gz'],
  ['appinfo.json present', !!appinfo],
  ['service.js present', !!svc],
  ['packageinfo.json present', !!pkg],
];
let ok = true;
for (const [name, pass] of checks) { console.log((pass ? 'PASS' : 'FAIL') + ' ' + name); if (!pass) ok = false; }
console.log('files: ' + files.length + ' entries in data.tar.gz');
if (!ok) process.exit(1);
console.log('IPK compliant: ' + ipkName);
