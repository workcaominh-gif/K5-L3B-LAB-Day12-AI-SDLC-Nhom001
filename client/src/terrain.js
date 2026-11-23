// "Sáng tạo của nhóm" — GUI-only underwater terrain (never in headless / Test Contract).
// Big map (gui_tuning.js): x ∈ [0, MAP_WIDTH_M=300] = 3 contract-sized "reaches" of 100 m, d ∈ [0, MAP_DEPTH_M=150].
// Contract zone d ∈ [0,30]: rocks only as edge / background decoration (diver + spear collide; fish bands, croc depths
// untouched), the reach-local layout repeats every 100 m (bank cliffs only at x≈0 and x≈300). Creative deep zone
// d ∈ (30,~63]: per reach a seabed with mountains, 3 rock pillars, a ledge (reach 0 also the cave pocket with crystals +
// a clam worth +30k once per dive) ending in a rock SHELF (~57–63 m) with a neutral shaft and an upwelling lift column.
// Tầng chạng vạng (63–100 m): stalactites under the shelf, tall pillars, a grotto with a tunnel, floor at ~100 m with
// a shaft. Vực thẳm (104–150 m): open to the 150 m bed with rock mounds, thin spires and glowing crystals.
// Current channels: a +x river-bottom stream at 44–47 m (one segment per reach), an upwelling beside a pillar and a
// lift column 58→145 m per reach. Everything is SOLID for the diver / deep fish / spear.
// The shape is analytic (solid(x,d)), deterministic per day seed. Drawing: baked lazily into CHUNK_W_M × CHUNK_H_M
// offscreen canvases near the camera (at most one bake per frame beyond what is on screen), LRU-cached.
// Backdrop: 3 parallax layers of underwater ridges (uw_far.png + ridgeline, uw_mid.png arches, near ridges).
import { MAP_WIDTH_M as MW, MAP_DEPTH_M as MD, REACH_M, REACHES, CHUNK_W_M, CHUNK_H_M, CHUNK_CACHE } from "./gui_tuning.js";

const ZONE = 30, BOT = 60, TWI = 100;

function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const hash = (i, j) => { let h = (i * 374761393 + j * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

const IMGS = {};
function img(path) { let im = IMGS[path]; if (!im) { im = new Image(); im.src = "assets/" + path; IMGS[path] = im; } return im; }
const ready = (im) => im && im.complete && im.naturalWidth > 0;
export function preloadTerrain() { img("bg/uw_tiles.png"); img("bg/uw_far.png"); img("bg/uw_mid.png"); }
const mkCanvas = (w, h) => { const cv = document.createElement("canvas"); cv.width = w; cv.height = h; return cv; };

// rock palettes per layer: mossy deep zone, darker contract background, slate twilight, near-black abyss
const PAL = ["#5b8a35", "#3f6028", "#4a3d26", "#3a2f1e", "#2e2417", "#221a10"];   // deep zone: mossy green top → olive-brown rock
const SPAL = ["#4d6233", "#3b4a2a", "#3f3627", "#342c20", "#2b241a", "#231d15"];  // contract zone: darker, desaturated (background)
const TPAL = ["#3d6a66", "#2c4d4c", "#24393c", "#1d2d31", "#172328", "#111a1f"];  // twilight: cold slate / teal
const APAL = ["#4a3a6a", "#33284a", "#251d36", "#1b1528", "#140f1e", "#0e0a15"];  // abyss: violet-black
const PADT = 8, PADB = 16, B = 2; // chunk canvas pads (moss overflow), block size (px)
const PREFETCH_MS = 3;            // per-frame time budget for baking chunks that are not on screen yet

export class Terrain {
  constructor(seed = 1) {
    const r = mulberry32((seed * 2654435761) ^ 0x9e3779b9);
    this.seed = seed;
    this.fa = r() * 6; this.fb = r() * 6;
    this.R = []; this.channels = [];
    for (let k = 0; k < REACHES; k++) this.R.push(this.genReach(k, k === 0 ? r : mulberry32(((seed + k * 7717) * 2654435761) ^ 0x51ed27)));
    // reach-0 aliases (older callers / smoke tests): seabed mountains, pillars, ledge, contract-zone rock
    const R0 = this.R[0]; this.mts = R0.mts; this.pil = R0.pil; this.ledge = R0.ledge; this.spil = R0.spil; this.smounds = R0.smounds; this.sshelf = R0.sshelf;
    // abyss crystals (drawn glowing over the darkness): on mound tops and spire tips, world coords
    this.acrys = [];
    for (const R of this.R) {
      for (const m of R.amounds) for (let i = 0; i < 3; i++) { const x = R.ox + m.x + (i - 1) * m.w * 0.35; this.acrys.push({ x, d: this.abyssFloor(x) + 0.2, s: 3 + ((i + m.x) % 3), ph: m.x + i * 1.9, up: true, hue: i % 2 }); }
      for (const p of R.spire) this.acrys.push({ x: R.ox + p.x, d: p.top + 0.3, s: 4, ph: p.x, up: true, hue: 2 });
      for (const q of R.tstal) this.acrys.push({ x: R.ox + q.x, d: R.ox >= 0 ? this.shelfBot(R.ox + q.x) + q.len * 0.85 : 0, s: 2, ph: q.x * 0.7, up: false, hue: 1, twi: true });
    }
    this.chunks = new Map(); this.chS = 0; this.bakes = 0; this.bakedFrame = -1; this.frame = 0; this.bg = null;
  }
  // one 100 m reach; reach 0 consumes the day rng in the original order (same layout as the 100 m river)
  genReach(k, r, cave0 = true) {
    const j = (a) => (r() - 0.5) * 2 * a, ox = k * REACH_M, R = { ox };
    R.mts = [{ x: 9 + j(3), h: 7 + r() * 4, w: 4.5 + r() * 2 }, { x: 52 + j(3), h: 6 + r() * 4, w: 4 + r() * 2 }, { x: 89 + j(3), h: 8 + r() * 4, w: 5 + r() * 2 }];
    R.pil = [{ x: 24 + j(2), hw: 1.6 + r() * 0.5, top: 36 + r() * 4, ph: r() * 6 }, { x: 63 + j(1.5), hw: 1.8 + r() * 0.4, top: 35 + r() * 3, ph: r() * 6 }, { x: 74.5 + j(1), hw: 1.5 + r() * 0.4, top: 37 + r() * 4, ph: r() * 6 }];
    const p2 = R.pil[1];
    R.ledge = { x0: p2.x - 11 - r() * 2, x1: p2.x, d0: 40.4 + j(0.4) };
    if (k === 0) { // cave pocket (reach 0): rock mass on the floor with a hollow interior, tunnel entrance on the right
      const cx = 39 + j(1);
      this.cave = { cx, hw: 7, top: 48, ix: cx - 0.5, id: 53.6, rx: 5, rd: 2.6, t0: 52.4, t1: 55, tx0: cx + 2, tx1: cx + 8.2 };
      this.clam = { x: cx - 2.6, d: 55.3, open: false, t: 0 };
      this.crystals = [];
      for (let i = 0; i < 7; i++) { const a = Math.PI * (0.15 + i * 0.12) + (i % 2 ? 0.05 : -0.05), up = i % 2 === 0; const kk = up ? -1 : 1; this.crystals.push({ x: this.cave.ix + Math.cos(a * 2.2) * this.cave.rx * 0.82, d: this.cave.id + kk * this.cave.rd * 0.86 * Math.max(0.5, Math.abs(Math.sin(a * 2.2))), up, s: 3 + (i % 3), ph: i * 1.7 }); }
    } else j(1);
    // contract zone (0–30 m), reach-local — collides with the DIVER and the SPEAR only. Everything sits in the gaps
    // between the spawn columns x∈{15,30,45,60,75,90}+ox (≥ 3 m clear), off the croc lanes, below 3 m (nodes / docks).
    R.spil = [{ x: 22.5, hw: 1.45, top: 9 + r() * 1.5, ph: r() * 6, wide: 0.03 }, { x: 52.5, hw: 1.55, top: 9.5 + r() * 1.5, ph: r() * 6, wide: 0.03 }, { x: 80, hw: 1.2, top: 11 + r() * 1.5, ph: r() * 6, wide: 0.02 }];
    R.smounds = [{ x: 37.5, h: 9 + r() * 2, w: 3.2, lim: 4.4 }, { x: 68.5, h: 2.8 + r() * 0.4, w: 2.5, lim: 3.4 }, { x: 8.5, h: 5 + r() * 2, w: 2.2, lim: 3.4 }];
    R.sshelf = [{ x0: 19, x1: 22.5, d0: 16 + r(), th: 1.1 }, { x0: 52.5, x1: 56.6, d0: 13 + r(), th: 1.0 }, { x0: 48.4, x1: 52.5, d0: 20 + r(), th: 0.9, left: true }];
    // ---- big map layers (reach-local x) ----
    R.shaft = { x: 15 + j(0.8), hw: 3 };                 // neutral hole through the deep shelf
    R.lift = { x0: 94.5, x1: 97.5 };                      // upwelling lift column 50 → 145 m (also the second hole)
    R.tstal = [30, 47, 63, 80].map((x) => ({ x: x + j(1.5), hw: 1.2 + r() * 0.8, len: 3 + r() * 5 }));        // stalactites
    R.tpil = [{ x: 28 + j(1.5), hw: 2 + r() * 0.6, top: 70 + r() * 8 }, { x: 46 + j(1), hw: 2.2 + r() * 0.5, top: 72 + r() * 8 }, { x: 84 + j(1), hw: 2 + r() * 0.6, top: 74 + r() * 6 }];
    R.grotto = { x: 64 + j(1), d: 87, rx: 7.5, rd: 7, ix: 64, id: 87.5, irx: 5, ird: 3.4, t0: 86, t1: 89, tx0: 66, tx1: 73 };
    R.grotto.ix = R.grotto.x; R.grotto.tx0 = R.grotto.x + 2; R.grotto.tx1 = R.grotto.x + 9;
    R.shaft2 = { x: 10 + j(0.8), hw: 3 };                 // neutral hole through the twilight floor
    R.amounds = [{ x: 22 + j(3), h: 9 + r() * 5, w: 5 + r() * 2 }, { x: 46 + j(3), h: 12 + r() * 6, w: 6 + r() * 3 }, { x: 72 + j(3), h: 7 + r() * 5, w: 4 + r() * 2 }];
    R.spire = [{ x: 34 + j(1.5), hw: 1.2 + r() * 0.4, top: 116 + r() * 10 }, { x: 59 + j(1.5), hw: 1.3 + r() * 0.4, top: 112 + r() * 10 }, { x: 86 + j(1.5), hw: 1.1 + r() * 0.4, top: 118 + r() * 10 }];
    // current channels of this reach (m/s), carved open through the rock
    const p3 = R.pil[2];
    R.chans = [
      { name: "stream", x0: ox + (k === 0 ? 2 : 0), x1: ox + REACH_M - (k === REACHES - 1 ? 2 : 0), d0: 44, d1: 47, vx: 2, vd: 0 },
      { name: "upwell", x0: ox + p3.x + p3.hw + 0.6, x1: ox + p3.x + p3.hw + 3.2, d0: 33, d1: 56.5, vx: 0, vd: -2.5 },
      { name: "lift", x0: ox + R.lift.x0, x1: ox + R.lift.x1, d0: 50, d1: 145, vx: 0, vd: -2.5 },
    ];
    this.channels.push(...R.chans);
    return R;
  }
  reach(x) { const k = Math.floor(x / REACH_M); return this.R[k < 0 ? 0 : k >= REACHES ? REACHES - 1 : k]; }
  // left bank stays thin under the dock (start x=2) so the diver can drop straight down; it widens below ~20 m
  bankL(d) { return (d < 20 ? 0.5 + d * 0.05 : 1.5 + (d - 20) * 0.1) + Math.sin(d * 0.7 + this.fa) * 0.2 + Math.sin(d * 2.1) * 0.1; }
  bankR(d) { return MW - (2.5 + Math.sin(d * 0.6 + this.fb) * 0.55 + Math.sin(d * 1.9 + 2) * 0.25 + (d > 18 ? (d - 18) * 0.035 : 0)); }
  // contract-zone rock (background layer): river-bank cliffs from 3 m, pillars, mounds on the 30 m floor, shelves
  shallow(x, d) {
    if (d < 3) return false;
    if (x < this.bankL(d) || x > this.bankR(d)) return true;
    if (d < 8.5) return false;
    const R = this.reach(x), lx = x - R.ox;
    for (const p of R.spil) { const dx = lx - p.x, hw = p.hw * (1 + 0.15 * Math.sin(d * 1.6 + p.ph)) + (d - p.top) * p.wide; if (d >= p.top && dx >= -hw && dx <= hw && d >= p.top + 1.2 * (dx / hw) * (dx / hw)) return true; }
    for (const m of R.smounds) { const dx = lx - m.x; if (dx >= -m.lim && dx <= m.lim) { const u = dx / m.w; if (d >= ZONE - m.h * Math.exp(-u * u) + Math.sin(x * 1.7) * 0.2) return true; } }
    for (const s of R.sshelf) if (lx >= s.x0 && lx <= s.x1) { const k = s.left ? (s.x1 - lx) / (s.x1 - s.x0) : (lx - s.x0) / (s.x1 - s.x0), top = s.d0 + Math.sin(x * 2.3) * 0.2; if (d >= top && d <= top + s.th * (0.45 + 0.55 * (1 - k))) return true; }
    return false;
  }

  floorAt(x) {
    const R = this.reach(x), lx = x - R.ox;
    let f = 57.6 + Math.sin(x * 0.23 + this.fa) * 1.0 + Math.sin(x * 0.61 + this.fb) * 0.6;
    for (const m of R.mts) { const u = (lx - m.x) / m.w; f -= m.h * Math.exp(-u * u); }
    return f < 44.5 ? 44.5 : f;
  }
  shelfBot(x) { return 63 + Math.sin(x * 0.37 + this.fa) * 0.8 + Math.sin(x * 1.3) * 0.3; }            // underside of the deep shelf
  twiFloor(x) { // top of the twilight floor (~100 m) with low mounds
    const R = this.reach(x), lx = x - R.ox; let f = TWI - 0.5 + Math.sin(x * 0.19 + this.fb) * 1.2 + Math.sin(x * 0.53) * 0.5;
    for (const p of R.tpil) { const u = (lx - p.x) / 4; f -= 2.5 * Math.exp(-u * u); } return f;
  }
  twiBot(x) { return 104 + Math.sin(x * 0.29 + this.fa) * 0.9; }
  abyssFloor(x) { // rock mounds rising from below the 150 m bed (open water down to MAP_DEPTH where there is no mound)
    const R = this.reach(x), lx = x - R.ox; let f = MD + 2;
    for (const m of R.amounds) { const u = (lx - m.x) / m.w; if (u * u < 6) f -= m.h * Math.exp(-u * u) + 2; }
    return f;
  }
  chanAt(x, d) { for (const ch of this.channels) if (x >= ch.x0 && x <= ch.x1 && d >= ch.d0 && d <= ch.d1) return ch; return null; }
  caveOpen(x, d) {
    const c = this.cave, u = (x - c.ix) / c.rx, v = (d - c.id) / c.rd;
    return u * u + v * v < 1 || (x >= c.tx0 && x <= c.tx1 && d >= c.t0 && d <= c.t1);
  }
  inCave(x, d) { const c = this.cave; return Math.abs(x - c.cx) <= c.hw + 1.5 && d >= c.top - 1 && d <= BOT + 4; }
  // solid rock? (contract zone: background layer, see shallow())
  solid(x, d) {
    if (d < 0 || d > MD || x < 0 || x > MW) return false;
    if (d < ZONE) return this.shallow(x, d);
    const R = this.reach(x), lx = x - R.ox;
    for (const ch of R.chans) if (x >= ch.x0 && x <= ch.x1 && d >= ch.d0 && d <= ch.d1) return false;
    const sb = this.shelfBot(x);
    if (d <= sb) { // ---- deep zone + its shelf ----
      if (R.ox === 0) { const c = this.cave, cu = (x - c.cx) / c.hw;
        if (cu >= -1 && cu <= 1 && d >= c.top + Math.sin(x * 1.1) * 0.5 + cu * cu * 2.2) return !this.caveOpen(x, d); }
      if (d >= this.floorAt(x)) { const s = R.shaft, hw = s.hw * (1 + 0.12 * Math.sin(d * 0.9 + lx)); return !(lx >= s.x - hw && lx <= s.x + hw); }
      for (const p of R.pil) {
        const dx = lx - p.x, hw = p.hw * (1 + 0.18 * Math.sin(d * 1.7 + p.ph)) + (d > p.top ? (d - p.top) * 0.05 : 0);
        if (dx >= -hw && dx <= hw && d >= p.top + 1.4 * (dx / hw) * (dx / hw)) return true;
      }
      const L = R.ledge, ll = lx;
      if (ll >= L.x0 && ll <= L.x1) { const k = (ll - L.x0) / (L.x1 - L.x0), top = L.d0 + Math.sin(x * 2.1) * 0.25 + (1 - k) * 0.4; if (d >= top && d <= L.d0 + 0.7 + 1.5 * k) return true; }
      return false;
    }
    const tb = this.twiBot(x);
    if (d <= tb) { // ---- twilight: stalactites, tall pillars, grotto, floor with a shaft ----
      if (d >= this.twiFloor(x)) { const s = R.shaft2, hw = s.hw * (1 + 0.12 * Math.sin(d * 0.9 + lx)); return !(lx >= s.x - hw && lx <= s.x + hw); }
      for (const q of R.tstal) { const dx = lx - q.x, k = (d - sb) / q.len; if (k < 1) { const hw = q.hw * (1 - k) * (1 + 0.15 * Math.sin(d * 2 + q.x)); if (dx >= -hw && dx <= hw) return true; } }
      for (const p of R.tpil) {
        const dx = lx - p.x, hw = p.hw * (1 + 0.16 * Math.sin(d * 1.3 + p.x)) + (d - p.top) * 0.06;
        if (d >= p.top && dx >= -hw && dx <= hw && d >= p.top + 1.6 * (dx / hw) * (dx / hw)) return true;
      }
      const g = R.grotto, u = (lx - g.x) / g.rx, v = (d - g.d) / g.rd;
      if (u * u + v * v < 1 + 0.08 * Math.sin(d * 1.7 + lx)) { const iu = (lx - g.ix) / g.irx, iv = (d - g.id) / g.ird; return !(iu * iu + iv * iv < 1 || (lx >= g.tx0 && lx <= g.tx1 && d >= g.t0 && d <= g.t1)); }
      return false;
    }
    // ---- abyss: mounds from the bed, thin spires ----
    if (d >= this.abyssFloor(x)) return true;
    for (const p of R.spire) { const dx = lx - p.x, hw = p.hw * (1 + 0.2 * Math.sin(d * 2.1 + p.x)) + (d - p.top) * 0.04; if (d >= p.top && dx >= -hw && dx <= hw && d >= p.top + 2 * (dx / hw) * (dx / hw)) return true; }
    return false;
  }
  // circle of radius r (m) touches rock?
  hits(x, d, r) {
    if (d + r < 3) return false;
    if (this.solid(x, d)) return true;
    for (let rr = r; rr > 0.05; rr -= 0.5) { // rings every 0.5 m so thin ledges are never stepped over
      const q = rr * 0.7071;
      if (this.solid(x + rr, d) || this.solid(x - rr, d) || this.solid(x, d + rr) || this.solid(x, d - rr) ||
        this.solid(x + q, d + q) || this.solid(x - q, d + q) || this.solid(x + q, d - q) || this.solid(x - q, d - q)) return true;
    }
    return false;
  }
  // fish avoid rock, channels (with margin) and the cave
  fishBlocked(x, d, r) {
    if (this.hits(x, d, r)) return true;
    for (const ch of this.channels) if (x >= ch.x0 - r && x <= ch.x1 + r && d >= ch.d0 - r && d <= ch.d1 + r) return true;
    return this.inCave(x, d);
  }
  // nearest open-water point to (x,d) for a body of radius r inside [dmin,dmax] (spiral search)
  openSpot(x, d, r, dmin = ZONE + 1, dmax = BOT - 1, pred = null) {
    const ok = (a, b) => b >= dmin && b <= dmax && a >= 1 && a <= MW - 1 && (pred ? pred(a, b) : !this.fishBlocked(a, b, r + 0.5));
    if (ok(x, d)) return [x, d];
    for (let rad = 0.5; rad <= 30; rad += 0.5) for (let k = 0; k < 24; k++) {
      const a = k / 24 * Math.PI * 2, nx = x + Math.cos(a) * rad, nd = d + Math.sin(a) * rad * 0.6;
      if (ok(nx, nd)) return [nx, nd];
    }
    return [x, Math.max(dmin, Math.min(dmax, d))];
  }
  // free horizontal span around x at depths d±dd (for a patrol of a body of radius r): [left, right] in m
  freeSpan(x, d, r, dd = 0.7, max = 14) {
    const bad = (a) => a < 1 || a > MW - 1 || this.fishBlocked(a, d - dd, r) || this.fishBlocked(a, d, r) || this.fishBlocked(a, d + dd, r);
    let L = 0, R = 0; if (bad(x)) return [0, 0];
    while (L < max && !bad(x - L - 0.25)) L += 0.25;
    while (R < max && !bad(x + R + 0.25)) R += 0.25;
    return [L, R];
  }
  // first rock below d=from at x (props on top of the terrain); `to` when there is none (a shaft)
  topAt(x, from = ZONE + 0.5, to = BOT) { for (let d = from; d < to; d += 0.25) if (this.solid(x, d)) return d; return to; }

  // ---------- drawing: lazy chunks ----------
  // bake one CHUNK_W_M × CHUNK_H_M chunk (ix, iy) at sx px/m horizontally, sy px/m vertically. Blocks of B px on the
  // GLOBAL block grid (seamless between chunks); solid() is sampled once per block into a grid with a 1-block margin.
  bakeChunk(ix, iy, sx, sy) { const it = this.bakeGen(ix, iy, sx, sy); let r = it.next(); while (!r.done) r = it.next(); return r.value; }
  // generator form: yields every few block rows so a prefetch can be spread over frames (time budget in draw())
  *bakeGen(ix, iy, sx, sy) {
    const tiles = img("bg/uw_tiles.png"), moss = ready(tiles);
    const X0 = Math.round(ix * CHUNK_W_M * sx), X1 = Math.round(Math.min(MW, (ix + 1) * CHUNK_W_M) * sx);
    const Y0 = Math.round(iy * CHUNK_H_M * sy), Y1 = Math.round(Math.min(MD, (iy + 1) * CHUNK_H_M) * sy);
    const w = X1 - X0, h = Y1 - Y0 + PADT + PADB, cv = mkCanvas(w, h), g = cv.getContext("2d");
    g.imageSmoothingEnabled = false;
    const i0 = Math.floor(X0 / B), i1 = Math.ceil(X1 / B), j0 = Math.floor(Y0 / B), j1 = Math.ceil(Y1 / B);
    const cols = i1 - i0, rows = j1 - j0, gw = cols + 2, grid = new Uint8Array(gw * (rows + 2));
    const bx = (i) => (i + 0.5) * B / sx, bd = (jj) => (jj + 0.5) * B / sy;
    for (let jj = -1; jj <= rows; jj++) { const d = bd(j0 + jj); for (let ii = -1; ii <= cols; ii++) grid[(jj + 1) * gw + ii + 1] = this.solid(bx(i0 + ii), d) ? 1 : 0; if ((jj & 7) === 7) yield; }
    const S = (ii, jj) => grid[(jj + 1) * gw + ii + 1];
    const above = new Int16Array(cols); // solid blocks directly above (edge distance), per column, seeded from above the chunk
    for (let ii = 0; ii < cols; ii++) { let n = 0; while (n < 8 && this.solid(bx(i0 + ii), bd(j0 - 1 - n))) n++; above[ii] = n; }
    const ox = -X0, oy = PADT - Y0; // global px → chunk px
    if (iy * CHUNK_H_M < ZONE && (iy + 1) * CHUNK_H_M >= ZONE - 1) { // background rock clumps on the contract floor edges (30 m line)
      g.globalAlpha = 0.6;
      for (let k = 0; k < REACHES; k++) for (const xm of [5, 13, 27, 71, 86, 94]) { const cx = (k * REACH_M + xm) * sx + ox, cy = ZONE * sy + oy; if (cx < -40 || cx > w + 40) continue; g.fillStyle = "#43331f"; g.beginPath(); g.ellipse(cx, cy, 14 + (xm % 3) * 5, 7 + (xm % 2) * 3, 0, Math.PI, 0); g.fill(); g.fillStyle = "#5a4630"; g.fillRect(Math.round(cx - 8), Math.round(cy - 6), 8, 1); }
      g.globalAlpha = 1;
    }
    const c0 = this.cave;
    for (let jj = 0; jj < rows; jj++) {
      if ((jj & 15) === 15) yield;
      const j = j0 + jj, d = bd(j); if (d < 2) { above.fill(0); continue; }
      const sh = d < ZONE, layer = sh ? SPAL : d <= 64 ? PAL : d <= 105 ? TPAL : APAL;
      const under0 = sh ? "#19140e" : layer === PAL ? "#1a130b" : layer === TPAL ? "#0c1316" : "#07050b", side0 = sh ? "#3d3528" : layer === PAL ? "#4f4129" : layer === TPAL ? "#2a3c40" : "#2a2038";
      for (let ii = 0; ii < cols; ii++) {
        const i = i0 + ii, px = i * B + ox, py = j * B + oy;
        if (!S(ii, jj)) {
          above[ii] = 0;
          if (d > ZONE && d < BOT + 2) { const x = bx(i); if (Math.abs(x - c0.cx) <= c0.hw + 1.5 && d >= c0.top - 1 && this.caveOpen(x, d)) { g.fillStyle = hash(i, j) < 0.15 ? "#1c140c" : "#130d07"; g.fillRect(px, py, B, B); } }
          continue;
        }
        const e = above[ii]++; const n = hash(i, j);
        let k = e === 0 ? 0 : e === 1 ? 1 : e < 4 ? 2 : e < 8 ? 3 : 4;
        if (k >= 3 && n < 0.12) k = 2; else if (k >= 2 && n > 0.9) k = 5;
        const side = !S(ii - 1, jj) || !S(ii + 1, jj), under = !S(ii, jj + 1);
        g.fillStyle = under ? under0 : side && k > 1 ? side0 : layer[k];
        g.fillRect(px, py, B, B);
        // mossy lumps on top edges from the uw_tiles sea-floor strip (4-px slices), else procedural moss (not in the dark layers)
        if (e === 0 && (layer === PAL ? d > ZONE + 0.3 : sh && d > 3.2)) {
          g.globalAlpha = sh ? 0.55 : 1;
          if (moss && i % 2 === 0) { const sxx = 16 + ((i * 2 + (j & 7) * 13) % 172); g.drawImage(tiles, sxx, 110, 4, 22, px, py - 7, 4, 22); }
          else if (!moss) { g.fillStyle = "#6a9a3c"; g.fillRect(px, py - (n < 0.3 ? 2 : 0), B, n < 0.3 ? 2 : 1); }
          g.globalAlpha = 1;
        } else if (e === 0 && !sh && layer !== PAL && n < 0.08) { g.fillStyle = layer === TPAL ? "#5fd6c8" : "#b08aff"; g.fillRect(px, py, 1, 1); } // pale polyps / lichen specks
      }
    }
    if (iy === 0) // hanging roots + water hyacinth clumps on the bank cliffs near the surface
      for (const [x0, x1, s] of [[0, 4.2, 1], [MW - 4.2, MW, 2]]) { if (x1 * sx < X0 - 20 || x0 * sx > X1 + 20) continue; for (let k = 0; k < 9; k++) {
        const x = (x0 + (x1 - x0) * (k + 0.5) / 9) * sx + ox, len = (2.5 + hash(k, s) * 4.5) * sy;
        g.fillStyle = k % 2 ? "#5a4026" : "#6e5232";
        for (let y = 0; y < len; y += 1) g.fillRect(Math.round(x + Math.sin(y * 0.15 + k) * 1.5), Math.round(y + oy), 1, 1);
        if (k % 3 === 0) { g.fillStyle = "#4f8a3a"; g.fillRect(Math.round(x) - 3, oy, 7, 2); g.fillStyle = "#79b04a"; g.fillRect(Math.round(x) - 2, oy, 3, 1); g.fillStyle = "#b98ac8"; g.fillRect(Math.round(x) + 1, oy, 1, 1); }
      } }
    this.bakes++;
    return { cv, X0, Y0, moss };
  }
  // one chunk (built on demand, finishing a pending prefetch job for it); key ix*1000+iy; LRU order = Map insertion order
  chunk(ix, iy, sx, sy) {
    const key = ix * 1000 + iy; let ch = this.chunks.get(key);
    if (ch) { this.chunks.delete(key); this.chunks.set(key, ch); return ch; }
    if (this.job && this.job.key === key) { let r = this.job.it.next(); while (!r.done) r = this.job.it.next(); ch = r.value; this.job = null; }
    else ch = this.bakeChunk(ix, iy, sx, sy);
    this.bakedFrame = this.frame; this.chunks.set(key, ch);
    while (this.chunks.size > CHUNK_CACHE) this.chunks.delete(this.chunks.keys().next().value);
    return ch;
  }
  // kept for older callers: bake everything visible at this scale
  bake(sx, sy) { this.chS = sx; }
  // ox, oy: screen position of world (0, 0); draws the visible chunks (baking missing ones), then prefetches at most one
  // neighbouring chunk (or refreshes one baked before the moss tiles loaded) when nothing was baked this frame
  draw(c, ox, oy, sx, sy, W, H) {
    this.frame++;
    if (this.chS !== sx) { this.chunks.clear(); this.chS = sx; this.job = null; }
    const nx = Math.ceil(MW / CHUNK_W_M), ny = Math.ceil(MD / CHUNK_H_M);
    const ixa = Math.max(0, Math.floor(-ox / sx / CHUNK_W_M)), ixb = Math.min(nx - 1, Math.floor((W - ox) / sx / CHUNK_W_M));
    const iya = Math.max(0, Math.floor((-oy - PADB) / sy / CHUNK_H_M)), iyb = Math.min(ny - 1, Math.floor((H - oy + PADT) / sy / CHUNK_H_M));
    const prev = c.imageSmoothingEnabled; c.imageSmoothingEnabled = false;
    const X = Math.round(ox), Y = Math.round(oy);
    for (let iy = iya; iy <= iyb; iy++) for (let ix = ixa; ix <= ixb; ix++) {
      const ch = this.chunk(ix, iy, sx, sy), cv = ch.cv, dx = X + ch.X0, dy = Y + ch.Y0 - PADT;
      const s0 = Math.max(0, -dx), t0 = Math.max(0, -dy), sw = Math.min(cv.width - s0, W - (dx + s0)), shh = Math.min(cv.height - t0, H - (dy + t0));
      if (sw > 0 && shh > 0) c.drawImage(cv, s0, t0, sw, shh, dx + s0, dy + t0, sw, shh);
    }
    c.imageSmoothingEnabled = prev;
    if (this.bakedFrame === this.frame) return;
    // background work, PREFETCH_MS per frame: continue the pending job, else start one (a visible chunk baked before the
    // moss tiles loaded, else a missing neighbour of the visible ones)
    if (!this.job) {
      const tilesOk = ready(img("bg/uw_tiles.png"));
      for (let iy = iya; iy <= iyb && !this.job; iy++) for (let ix = ixa; ix <= ixb; ix++) { const ch = this.chunks.get(ix * 1000 + iy);
        if (ch && !ch.moss && tilesOk) { this.job = { key: ix * 1000 + iy, it: this.bakeGen(ix, iy, sx, sy), stale: true }; break; } }
      for (let iy = iya - 1; iy <= iyb + 1 && !this.job; iy++) for (let ix = ixa - 1; ix <= ixb + 1; ix++) {
        if (ix < 0 || iy < 0 || ix >= nx || iy >= ny || this.chunks.has(ix * 1000 + iy)) continue;
        this.job = { key: ix * 1000 + iy, it: this.bakeGen(ix, iy, sx, sy) }; break;
      }
      if (!this.job) return;
    }
    const t0 = performance.now(), j = this.job;
    for (;;) { const r = j.it.next(); if (r.done) { this.job = null; this.chunks.delete(j.key); this.chunks.set(j.key, r.value); while (this.chunks.size > CHUNK_CACHE) this.chunks.delete(this.chunks.keys().next().value); return; }
      if (performance.now() - t0 > PREFETCH_MS) return; }
  }
  // abyss crystals + twilight stalactite glow (call AFTER the darkness overlay so they shine)
  drawGlow(c, ox, oy, sx, sy, t, W, H) {
    c.save(); c.globalCompositeOperation = "lighter";
    for (const q of this.acrys) {
      const x = Math.round(ox + q.x * sx), y = Math.round(oy + q.d * sy);
      if (x < -30 || x > W + 30 || y < -30 || y > H + 30) continue;
      const a = 0.5 + 0.4 * Math.sin(t * 1.7 + q.ph), s = q.s, dir = q.up ? -1 : 1;
      const col = q.hue === 0 ? "#9a7aff" : q.hue === 1 ? "#5ff0e0" : "#ff7ad9";
      c.globalAlpha = a * 0.22; c.fillStyle = col; c.beginPath(); c.arc(x, y + dir * s, s * 3, 0, Math.PI * 2); c.fill();
      c.globalAlpha = a; c.beginPath(); c.moveTo(x - s * 0.6, y); c.lineTo(x, y + dir * s * 2.2); c.lineTo(x + s * 0.6, y); c.closePath(); c.fill();
      c.fillStyle = "#ffffff"; c.fillRect(x, y + dir * s, 1, 2);
    }
    c.restore();
  }
  // crystals + clam (animated, a handful of draws)
  drawCave(c, ox, oy, sx, sy, t, W, H) {
    const cv = this.cave, px = ox + cv.cx * sx, py = oy + cv.id * sy;
    if (px < -200 || px > W + 200 || py < -100 || py > H + 100) return;
    c.save(); c.globalCompositeOperation = "lighter";
    for (const q of this.crystals) {
      const x = Math.round(ox + q.x * sx), y = Math.round(oy + q.d * sy), a = 0.55 + 0.35 * Math.sin(t * 2 + q.ph), s = q.s, dir = q.up ? -1 : 1;
      c.globalAlpha = a * 0.25; c.fillStyle = "#c8ff8a"; c.beginPath(); c.arc(x, y + dir * s, s * 2.6, 0, Math.PI * 2); c.fill();
      c.globalAlpha = a; c.fillStyle = "#e2ffa8";
      c.beginPath(); c.moveTo(x - s * 0.6, y); c.lineTo(x, y + dir * s * 2.2); c.lineTo(x + s * 0.6, y); c.closePath(); c.fill();
      c.fillStyle = "#fffbe0"; c.fillRect(x - 1, y + dir * s, 1, 2);
    }
    c.restore();
    const k = this.clam, x = Math.round(ox + k.x * sx), y = Math.round(oy + k.d * sy), open = k.open ? Math.min(1, k.t * 3) : 0.12 + 0.08 * Math.sin(t * 1.5);
    c.fillStyle = "#4a3a5a"; c.beginPath(); c.ellipse(x, y + 2, 9, 4, 0, 0, Math.PI); c.fill();          // bottom shell
    c.fillStyle = "#7a5f8a"; c.fillRect(x - 8, y + 1, 16, 1);
    if (!k.open || k.t < 3) { c.globalAlpha = k.open ? Math.max(0, 1 - k.t / 3) : 1; c.fillStyle = "#fff7e0"; c.beginPath(); c.arc(x, y, 2.5, 0, Math.PI * 2); c.fill(); c.globalAlpha = 0.3 + 0.2 * Math.sin(t * 4); c.fillStyle = "#ffe9a0"; c.beginPath(); c.arc(x, y, 5, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1; }
    c.save(); c.translate(x - 9, y + 1); c.rotate(-open * 1.1); c.fillStyle = "#5c4870"; c.beginPath(); c.ellipse(9, 0, 9, 4, 0, Math.PI, 0); c.fill(); c.fillStyle = "#8d72a0"; c.fillRect(3, -3, 12, 1); c.restore();
  }

  // ---------- parallax backdrop (3 layers), cached procedural ridgelines ----------
  ridge(w, h, seed, col, colL, rough) {
    const cv = mkCanvas(w, h), g = cv.getContext("2d"), r = mulberry32(seed);
    const pk = []; for (let i = 0; i < 6; i++) pk.push([r() * w, 0.35 + r() * 0.55, 40 + r() * 90]);
    const top = new Float32Array(w);
    for (let x = 0; x < w; x++) {
      let y = 0.15; for (const [px, hh, ww] of pk) for (const o of [-w, 0, w]) { const u = (x - px - o) / ww; y = Math.max(y, hh * Math.exp(-u * u)); }
      y += Math.sin(x * 0.09 + seed) * 0.03 * rough + Math.sin(x * 0.31) * 0.015 * rough;
      top[x] = Math.round(h - y * h);
    }
    for (let x = 0; x < w; x++) { g.fillStyle = col; g.fillRect(x, top[x], 1, h - top[x]); g.fillStyle = colL; g.fillRect(x, top[x], 1, 1); }
    // a few arch holes / texture streaks
    g.fillStyle = "rgba(0,0,0,.18)"; for (let i = 0; i < 40; i++) { const x = Math.floor(r() * w), y = top[x] + 4 + Math.floor(r() * (h - top[x])); g.fillRect(x, y, 2 + Math.floor(r() * 6), 1); }
    return cv;
  }
  bakeBg() {
    const far = img("bg/uw_far.png"), mid = img("bg/uw_mid.png");
    if (!this.bg) this.bg = { farRidge: this.ridge(640, 120, 11 + this.seed, "#5a4630", "#6e5a3e", 1), nearRidge: this.ridge(720, 120, 37 + this.seed, "#2e2217", "#43331f", 2.5), mid: null, far: null };
    if (!this.bg.mid && ready(mid)) { // uw_mid at half size, tinted into the water colour
      const cv = mkCanvas(480, 256), g = cv.getContext("2d"); g.imageSmoothingEnabled = false; g.drawImage(mid, 0, 0, 480, 256);
      g.globalCompositeOperation = "source-atop"; g.fillStyle = "rgba(74,54,30,.62)"; g.fillRect(0, 0, 480, 256); this.bg.mid = cv; // brown silt wash
    }
    if (!this.bg.far && ready(far)) { // uw_far with a sepia / silt wash baked in
      const w = far.naturalWidth, h = far.naturalHeight, cv = mkCanvas(w, h), g = cv.getContext("2d"); g.imageSmoothingEnabled = false; g.drawImage(far, 0, 0);
      g.globalCompositeOperation = "source-atop"; g.fillStyle = "rgba(88,62,32,.7)"; g.fillRect(0, 0, w, h); this.bg.far = cv; }
  }
  // camX = camera x in world px, camY = vertical camera (px), vis = 0..1 (fades in with depth)
  // fade (0..1): the scene fades the ridges out below the 60 m shelf; camY is capped at the old 60 m map bottom
  drawBackdrop(c, camX, camY, W, H, vis, t, rays, fade = 1) {
    if (fade <= 0.01) return;
    camY = Math.min(camY, 402);
    this.bakeBg(); const bg = this.bg, prev = c.imageSmoothingEnabled; c.imageSmoothingEnabled = false;
    const tile = (im, f, yb, a, fill) => {
      const w = im.width || im.naturalWidth, h = im.height || im.naturalHeight; if (!w) return;
      const y = Math.round(yb - h); if (y > H) return;
      let x = -Math.round((camX * f) % w); if (x > 0) x -= w;
      c.globalAlpha = a * fade; for (; x < W; x += w) c.drawImage(im, x, y, w, h);
      if (fill && yb < H) { c.fillStyle = fill; c.fillRect(0, Math.round(yb), W, H - Math.round(yb) + 1); }
    };
    if (bg.far) tile(bg.far, 0.12, 345 - camY * 0.16, 0.12 + 0.45 * vis, null);
    tile(bg.farRidge, 0.2, 330 - camY * 0.2, 0.25 + 0.55 * vis, "#5a4630");
    if (rays) rays();
    if (bg.mid) tile(bg.mid, 0.5, 420 - camY * 0.33, 0.15 + 0.6 * vis, null);
    tile(bg.nearRidge, 0.7, 520 - camY * 0.6, 0.2 + 0.7 * vis, "#2e2217");
    c.globalAlpha = 1; c.imageSmoothingEnabled = prev;
  }
}
