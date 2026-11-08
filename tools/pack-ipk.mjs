// Minimal webOS IPK packer for the standalone browser project.
// Usage: node tv-browser/tools/pack-ipk.mjs <app-dir> [out-dir]
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const appDir = path.resolve(process.argv[2] || path.join(root, 'app'));
const outDir = path.resolve(process.argv[3] || path.join(root, 'build'));
const serviceDir = path.resolve(process.argv[4] || path.join(root, 'service'));
const hasService = fs.existsSync(path.join(serviceDir, 'services.json'));

function tarEntry(name, content, isDir, mtime = Math.floor(Date.now() / 1000)) {
  const h = Buffer.alloc(512, 0);
  h.write(isDir && !name.endsWith('/') ? name + '/' : name, 0, 100, 'utf8');
  h.write(isDir ? '0000755\0' : '0000644\0', 100, 8, 'ascii');
  h.write('0000000\0', 108, 8, 'ascii');
  h.write('0000000\0', 116, 8, 'ascii');
  h.write(`${(isDir ? 0 : content.length).toString(8).padStart(11, '0')}\0`, 124, 12, 'ascii');
  h.write(`${mtime.toString(8).padStart(11, '0')}\0`, 136, 12, 'ascii');
  h.write('        ', 148, 8, 'ascii');
  h.write(isDir ? '5' : '0', 156, 1, 'ascii');
  h.write('ustar\0', 257, 6, 'ascii');
  h.write('00', 263, 2, 'ascii');
  h.write('root\0', 265, 5, 'ascii');
  h.write('root\0', 297, 5, 'ascii');
  let sum = 0;
  for (let i = 0; i < 512; i++) sum += h[i];
  h.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii');
  if (isDir || content.length === 0) return h;
  const pad = content.length % 512 === 0 ? Buffer.alloc(0) : Buffer.alloc(512 - (content.length % 512), 0);
  return Buffer.concat([h, content, pad]);
}

function walk(base, rel = '') {
  const out = [];
  for (const ent of fs.readdirSync(path.join(base, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${ent.name}` : ent.name;
    if (ent.isDirectory()) { out.push({ rel: r, dir: true }); out.push(...walk(base, r)); }
    else if (ent.isFile()) out.push({ rel: r, dir: false });
  }
  return out;
}

function arMember(name, data) {
  const h = Buffer.alloc(60, 0x20);
  h.write(name.slice(0, 16), 0, 16, 'ascii');
  h.write(String(Math.floor(Date.now() / 1000)), 16, 12, 'ascii');
  h.write('0', 28, 6, 'ascii');
  h.write('0', 34, 6, 'ascii');
  h.write('100644', 40, 8, 'ascii');
  h.write(String(data.length), 48, 10, 'ascii');
  h[58] = 0x60; h[59] = 0x0a;
  return Buffer.concat([h, data, data.length % 2 ? Buffer.from('\n') : Buffer.alloc(0)]);
}

const appinfo = JSON.parse(fs.readFileSync(path.join(appDir, 'appinfo.json'), 'utf8'));
const appId = appinfo.id;
const version = appinfo.version || '0.1.0';
const entries = [];
for (const d of ['./usr', './usr/palm', './usr/palm/applications', `./usr/palm/applications/${appId}`]) {
  entries.push(tarEntry(d, Buffer.alloc(0), true));
}
for (const f of walk(appDir)) {
  const p = `./usr/palm/applications/${appId}/${f.rel}`;
  if (f.dir) entries.push(tarEntry(p, Buffer.alloc(0), true));
  else entries.push(tarEntry(p, fs.readFileSync(path.join(appDir, f.rel)), false));
}
const serviceId = `${appId}.service`;
if (hasService) {
  entries.push(tarEntry('./usr/palm/services', Buffer.alloc(0), true));
  entries.push(tarEntry(`./usr/palm/services/${serviceId}`, Buffer.alloc(0), true));
  for (const f of walk(serviceDir)) {
    const p = `./usr/palm/services/${serviceId}/${f.rel}`;
    if (f.dir) entries.push(tarEntry(p, Buffer.alloc(0), true));
    else entries.push(tarEntry(p, fs.readFileSync(path.join(serviceDir, f.rel)), false));
  }
}
const packageInfo = Buffer.from(JSON.stringify(Object.assign(
  { app: appId, id: appId, loc_name: appinfo.title || 'ASTRA', package_format_version: 2, vendor: appinfo.vendor || 'Personal', version },
  hasService ? { services: [serviceId] } : {}
), null, 2) + '\n');
entries.push(tarEntry('./usr/palm/packages', Buffer.alloc(0), true));
entries.push(tarEntry(`./usr/palm/packages/${appId}`, Buffer.alloc(0), true));
entries.push(tarEntry(`./usr/palm/packages/${appId}/packageinfo.json`, packageInfo, false));
const dataGz = zlib.gzipSync(Buffer.concat([...entries, Buffer.alloc(1024)]), { level: 9 });

const control = [
  `Package: ${appId}`, `Version: ${version}`, 'Section: misc', 'Priority: optional',
  'Architecture: all', 'Installed-Size: 0', 'Maintainer: TV Browser <dev@local>',
  `Description: ${appinfo.title || appId}`, 'webOS-Package-Format-Version: 2',
  'webOS-Packager-Version: 1.12.0', ''
].join('\n');
const controlGz = zlib.gzipSync(Buffer.concat([tarEntry('./control', Buffer.from(control), false), Buffer.alloc(1024)]), { level: 9 });
const ipk = Buffer.concat([
  Buffer.from('!<arch>\n'),
  arMember('debian-binary', Buffer.from('2.0\n')),
  arMember('control.tar.gz', controlGz),
  arMember('data.tar.gz', dataGz)
]);
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, `${appId}_${version}_all.ipk`);
fs.writeFileSync(out, ipk);
console.log(out);
