// Generate a real topographic contour field via marching squares over a
// gaussian height map, plus a sparse star layer. Spliced into app.css.
import fs from "node:fs";

const W = 1600, H = 1000;
const COLS = 100, ROWS = 62;
const STEP = W / COLS;

/* Peaks: x, y, sigmaX, sigmaY, amplitude. One ridge is elongated. */
const peaks = [
  [120, 150, 260, 170, 0.9],
  [880, 700, 340, 240, 0.8],
  [1380, 180, 210, 190, 0.75],
  [1180, 880, 260, 140, 0.6],
  [520, 900, 180, 160, 0.5],
  [-60, 620, 220, 260, 0.45]
];

function height(x, y) {
  let h = 0;
  for (const [px, py, sx, sy, amp] of peaks) {
    const dx = (x - px) / sx;
    const dy = (y - py) / sy;
    h += amp * Math.exp(-(dx * dx + dy * dy));
  }
  // Low-frequency warp so the contours meander instead of staying elliptical.
  h += 0.05 * Math.sin(x / 260) * Math.cos(y / 210);
  h += 0.03 * Math.sin((x + y) / 170);
  return h;
}

const grid = [];
for (let r = 0; r <= ROWS; r++) {
  const row = [];
  for (let c = 0; c <= COLS; c++) row.push(height(c * STEP, r * (H / ROWS)));
  grid.push(row);
}

const levels = [0.14, 0.24, 0.34, 0.44, 0.55, 0.66, 0.77, 0.88];

function lerp(v0, v1, l) {
  return (l - v0) / (v1 - v0);
}

let paths = "";
let segs = 0;
for (const level of levels) {
  let d = "";
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const x0 = c * STEP, y0 = r * (H / ROWS);
      const x1 = x0 + STEP, y1 = y0 + (H / ROWS);
      const v00 = grid[r][c], v10 = grid[r][c + 1], v11 = grid[r + 1][c + 1], v01 = grid[r + 1][c];
      const idx = (v00 > level ? 8 : 0) | (v10 > level ? 4 : 0) | (v11 > level ? 2 : 0) | (v01 > level ? 1 : 0);
      if (idx === 0 || idx === 15) continue;
      const top = [x0 + STEP * lerp(v00, v10, level), y0];
      const right = [x1, y0 + (H / ROWS) * lerp(v10, v11, level)];
      const bottom = [x0 + STEP * lerp(v01, v11, level), y1];
      const left = [x0, y0 + (H / ROWS) * lerp(v00, v01, level)];
      const pairs = {
        1: [left, bottom], 2: [bottom, right], 3: [left, right], 4: [top, right],
        5: [left, top, bottom, right], 6: [top, bottom], 7: [left, top],
        8: [top, left], 9: [top, bottom], 10: [top, right, bottom, left],
        11: [top, right], 12: [left, right], 13: [bottom, right], 14: [left, bottom]
      }[idx];
      for (let i = 0; i < pairs.length; i += 2) {
        const a = pairs[i], b = pairs[i + 1];
        d += `M${a[0].toFixed(1)} ${a[1].toFixed(1)}L${b[0].toFixed(1)} ${b[1].toFixed(1)}`;
        segs++;
      }
    }
  }
  if (d) paths += `<path d='${d}'/>`;
}

const contourSvg =
  `<svg xmlns='http://www.w3.org/2000/svg' width='${W}' height='${H}' viewBox='0 0 ${W} ${H}'>` +
  `<g fill='none' stroke='#e9e3d6' stroke-width='1' stroke-opacity='.55' stroke-linecap='round'>${paths}</g></svg>`;

/* Sparse stars: 16 across 1600x1000, wide size range. */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(777);
let stars = "";
for (let i = 0; i < 16; i++) {
  const x = (rnd() * W).toFixed(0);
  const y = (rnd() * H).toFixed(0);
  const r = (0.8 + rnd() * 1.6).toFixed(2);
  const o = (0.35 + rnd() * 0.55).toFixed(2);
  stars += `<circle cx='${x}' cy='${y}' r='${r}' opacity='${o}'/>`;
}
const starSvg =
  `<svg xmlns='http://www.w3.org/2000/svg' width='${W}' height='${H}' viewBox='0 0 ${W} ${H}'>` +
  `<g fill='#f4eee1'>${stars}</g></svg>`;

const enc = (s) => s.replace(/</g, "%3C").replace(/>/g, "%3E").replace(/#/g, "%23");

const css = `/* Topographic contour field: one non-repeating SVG, painted once. */
body::before {
  content: "";
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  opacity: 0.17;
  background-image: url("data:image/svg+xml,${enc(contourSvg)}");
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
}

/* Sparse stars, tiled: points never show a seam. */
body::after {
  content: "";
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  opacity: 0.8;
  background-image: url("data:image/svg+xml,${enc(starSvg)}");
  background-size: 1600px 1000px;
  background-position: 0 0;
}`;

const p = "app/app.css";
let src = fs.readFileSync(p, "utf8");
const start = src.indexOf("/* Topographic contour field");
const end = src.indexOf("button, input, select {");
if (start < 0 || end < 0) throw new Error("markers " + start + " " + end);
src = src.slice(0, start) + css + "\n\n" + src.slice(end);
fs.writeFileSync(p, src);
console.log("segments:", segs, "css bytes:", src.length);
