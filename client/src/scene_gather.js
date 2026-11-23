// GATHER scene — GUI ONLY. Local mock physics so it's playable now; swap `st` for the server snapshot later.
// World units: contract x in [0,100], d in [0,30], d=0 is the surface. BIG MAP (gui_tuning.js, GUI only): x ∈ [0,300] =
// 3 "reaches" that each repeat the contract layout (nodes, spawn columns, croc lanes), d ∈ [0,150] in 4 zones (Nước nông,
// Vùng sâu, Tầng chạng vạng, Vực thẳm), 3 docks (any one ends the dive), O₂ ×3, 6-minute dive. Camera follows the diver.
// Core rules mirrored from Test Contract v1.1 (numbers from tuning.gather): swimming fish schools + scheduled
// spawns, Cá Sấu Năm Chèo (croc.js), HP / faint, oxygen / choke, docking, the day's NEEDED list.
// Sáng tạo (creative extras, never change the core numbers above): harpoon aiming, sprint, deep zone 30–60 m
// with big fish (deep.js), water snakes (creatures.js). Hunting: deep fish have HP (deep.js), the spear deals
// stats().spearDmg (upgrade "Mũi lao"); contract schools have 1 HP so one hit still catches them exactly as before.
// Boss Cá Tra Dầu (52–58 m) charges when hit and is sold to the trader (+300k) — no ingredients. Croc / snake can't
// be killed in the contract; in the GUI they have HP too (croc 24, snake 6): every spear hit stuns (croc 2 s + 3 m
// push, numbers of the contract "Lao xua" extension) AND deals damage; at 0 HP they are defeated for this dive.
// Inventory (I or the bag icon): freezes the dive; throw items out of the basket to free space.
// Đặc sản (menu.js, GUI only): deep fish also drop 1 premium item of their own kind, Cá Tra Dầu 1 cá tra dầu (bounty kept),
// a defeated croc 1 thịt cá sấu (+100k), a snake 1 thịt rắn (+20k); a full basket lets the item float away (toast).
// Terrain (terrain.js, creative, GUI only): deep zone rock / mountains / pillars / ledge / cave (diver, spear, deep fish
// collide); contract zone: bank cliffs + pillars / mounds / shelves in the gaps between spawn columns — background layer,
// only the diver and the spear collide (contract fish / croc movement unchanged). Dòng nước lũ (current.js, v1.2 §2) + 2 permanent deep channels.
import { W, H, screen, input, clamp, lerp, fx, Particles, txt, panel, measure, reduceMotion } from "./engine.js";
import { sfx, music, voiceLine } from "./audio.js";
import { P, R, bands, sky, sun, cloud, bank, hyacinth, godRays, kelp, rock, WATER, diver, fish, nodeArt, dock, KIND_NAME, icon } from "./art.js";
import { speedLines } from "./cutscene.js";
import { DEEP, preloadDeep, makeDeepFish, updateDeepFish, drawDeepFish, drawDeepScenery, hurtDeepFish, deepBox, placeDeep, leanKelp, drawPlankton } from "./deep.js";
import { DIVE_TIME_S, MAP_WIDTH_M, MAP_DEPTH_M, REACH_M, REACHES, ZONES, DOCKS, FISH_MUL, zoneIndex, zoneTop, reachOf, nearestDock } from "./gui_tuning.js"; // GUI scaling knobs
import { Terrain, preloadTerrain } from "./terrain.js";           // creative: deep-zone rock with collision + parallax ridges
import { Flood, ChannelFx, updateFloodFx, drawFloodFx } from "./current.js"; // v1.2 §2 Dòng nước lũ + deep current channels
import { SNAKE, makeSnakes, updateSnakes, drawSnake, snakeInReach, stunSnake, damageSnake } from "./creatures.js";
import { stats, recordCatch, recordHunt, recordDefeat, save, persist } from "./progress.js";
import { makeCrocs, updateCrocs, crocHit, startRecoil, crocNear, drawCroc, stunCroc, crocAt, damageCroc, CROC_HUNT } from "./croc.js";
import * as meta from "./meta.js";
import { freshCfg, newItem, decay, plain, freshBar } from "./fresh.js";
import { menuAll, SPECIES_PREMIUM, MONSTER_DROP, isPremiumKind } from "./menu.js"; // GUI-only premium drops (Đặc sản) // chores tracker (sibling module); every call is optional-chained

// accessibility (hub module a11y.js): loaded defensively so the dive still runs if the module is missing
let A11Y = {}; import("./a11y.js").then((m) => { A11Y = m; }).catch(() => {});
// GUI-only pacing (the headless sim keeps the contract's fish_spawn_ticks / regrow_s)
const GUI_SPAWN_MUL = 0.5, GUI_REGROW_MUL = 0.5;
const hcOn = () => !!(A11Y.isHC ? A11Y.isHC() : A11Y.highContrast ?? false);
const HURT_CAP = { croc: "[Cá Sấu cắn]", choke: "[ngạt nước]", fish: "[bị cá húc]", snake: "[rắn cắn]" }; // SFX captions per cause
const hcCol = (k, d) => A11Y.HC?.[k] ?? d; // a11y.HC palette: warn / danger / outline / light

const VS = 10; // vertical px per metre (camera scrolls with depth)
// labels on the zone boundary lines (index = zone below the line)
const ZONE_LINE = ["", "— VÙNG SÂU · cá to —", "— TẦNG CHẠNG VẠNG · tối, cá lạ —", "— VỰC THẲM · O₂ ×" + ZONES[3].pressure + " · Cá Tra Dầu —"];

const TAU = Math.PI * 2;

export class GatherScene {
  // opts.day: campaign day (monster from_day filter; standalone = 1); opts.need: { kind: count } from day_plan
  constructor(contract, onEnd, opts = {}) {
    this.t = contract.tuning.gather; this.menu = menuAll(contract); this.onEnd = onEnd;
    this.hz = contract.tuning.tick_hz || 60; this.day = opts.day || 1; this.need = opts.need || null;
    const t = this.t;
    this.p = { x: t.start_pos[0], d: 0, vx: 0, vd: 0, heading: 0, face: 1, phase: 0 };
    // harpoon (GUI creative layer): aim with movement or the mouse, Space/click fires a spear on a rope
    this.aim = 0; this.tilt = 0; this.harp = null; this.mouseT = -1; this.mouse = { x: 0, y: 0 };
    this._onMove = (e) => { const r = screen.pc.getBoundingClientRect(); this.mouse.x = (e.clientX - r.left) / r.width * W; this.mouse.y = (e.clientY - r.top) / r.height * H; this.mouseT = performance.now(); if (e.type === "pointerdown") this.onClick(this.mouse.x, this.mouse.y); };
    addEventListener("pointermove", this._onMove); addEventListener("pointerdown", this._onMove);
    // inventory keys not in the engine map: I (open/close), X (throw out); consumed in update()
    this._onKey = (e) => { const k = (e.key || "").toLowerCase(); this.keyAny = true; if (k === "i") this.keyI = true; else if (k === "x") this.keyX = true; };
    addEventListener("keydown", this._onKey);
    this.inv = null; this.holdFrom = []; this.sinks = []; this.tossed = []; this.bagRect = [W - 108 - 6 - 19, 6, 15, 15];
    // effective tuning = contract base + shop upgrades (progress.js); a fresh save gives exactly the contract values
    const st = this.stats = stats(contract);
    this.oxyMax = st.oxygenMax; this.oxy = st.oxygenMax;
    this.swim = st.swimSpeed; this.catchR = st.catchRadius;
    this.hpMax = st.hpMax ?? t.hp_max; this.hp = this.hpMax;
    this.hold = []; this.cap = st.holdCap;
    // v1.2 freshness: items[i] = { id, kind, fresh, spoiled } kept in step with hold[i] (syncFrom), pick order
    this.items = []; this.fresh = freshCfg(contract);
    this.dmg = st.spearDmg ?? 1; this.pops = []; this.bossSeen = false; // hunting: spear damage, floating damage numbers
    this.time = DIVE_TIME_S; this.invuln = 0; this.catchCd = 0; this.zeroOxy = 0; // GUI dive length (contract duration_s = headless base)
    // big map: the contract layout repeats in every 100 m reach (ids N1… in reach 0, N1-2… / N1-3… further out)
    this.maxX = MAP_WIDTH_M; this.fishMax = (t.fish_max ?? 12) * FISH_MUL;
    this.spawnXs = []; for (let k = 0; k < REACHES; k++) for (const x of t.fish_spawn_x || []) this.spawnXs.push(x + k * REACH_M);
    this.nodes = []; for (let k = 0; k < REACHES; k++) for (const n of t.nodes) this.nodes.push({ ...n, id: k ? n.id + "-" + (k + 1) : n.id, pos: [n.pos[0] + k * REACH_M, n.pos[1]], ready: true, regrow: 0, pop: 0 });
    // v1.0: fish_initial is a list of schools; v1.1: a count, each placed with the same weighted procedure as the
    // scheduled spawn (pickSpawn: fish_weights over species with a free point, uniform point, clearance)
    this.fishSeq = 0; this.fish = [];
    if (Array.isArray(t.fish_initial)) this.fish = t.fish_initial.map((f) => this.newSchool(f.kind, f.pos[0], f.pos[1]));
    else for (let i = 0; i < t.fish_initial * FISH_MUL; i++) { const q = this.pickSpawn(this.fish); if (!q) break; this.fish.push(this.newSchool(q.kind, q.pos[0], q.pos[1])); }
    // quest guarantee (GUI): top up with the needed kinds right away (within fish_max)
    for (let guard = 0; guard < 6 && Array.isArray(this.fish) && this.fish.length < this.fishMax; guard++) {
      const k = this.questKind(this.fish); if (!k) break; const q = this.pickSpawn(this.fish, k); if (!q) break; this.fish.push(this.newSchool(q.kind, q.pos[0], q.pos[1]));
    }
    this.fullHintT = 0; // "river full" guidance toast, at most once per 30 s
    this.spawnT = 0;
    // Cá Sấu Năm Chèo: M1 from day 1, M2 only from_day 3 (standalone gather = day-1 layout)
    // big map: the M1 / M2 patrols repeat in every reach (still filtered by from_day in makeCrocs)
    this.mon = t.monsters ? { ...t.monsters, spawns: [] } : null;
    if (this.mon) for (let k = 0; k < REACHES; k++) for (const sp of t.monsters.spawns || []) this.mon.spawns.push({ ...sp, id: k ? sp.id + "-" + (k + 1) : sp.id, pos: [sp.pos[0] + k * REACH_M, sp.pos[1]], waypoints: sp.waypoints.map((w) => [w[0] + k * REACH_M, w[1]]) });
    this.crocs = makeCrocs(this.mon, this.day); this.crocWarn = 0;
    this.yield = t.fish_yield || {};
    // creative extension: the client river goes deeper than the contract (see deep.js)
    this.maxD = Math.max(t.bounds.d[1], MAP_DEPTH_M); preloadDeep(); this.deep = makeDeepFish(); this.camY = 0; this.deepSeen = false;
    this.zone = 0; this.zoneMax = 0; this.banner = null; this.darkCv = null; // depth zones (gui_tuning.ZONES): banner on change
    this.deepEnv = { px: 0, pd: 0, contact: (f, nx, nd) => this.bossRam(f, nx, nd), blocked: (x, d, r) => this.ter.fishBlocked(x, d, r) };
    // terrain (deterministic per day): every deep spawn / patrol in open water; GUI only, d > 30 m
    this.ter = new Terrain(this.day * 7919 + 17); preloadTerrain(); placeDeep(this.deep, this.ter, this.maxD);
    this.chFx = new ChannelFx(this.ter.channels); this.clamTold = false;
    // Dòng nước lũ (Test Contract v1.2 §2): gather.current or the defaults; direction seeded per dive
    this.flood = new Flood(t.current, (Math.random() * 2147483647) | 0, this.hz, {
      warning: (n, dir) => { this.floodWarn = 2; sfx("riser", 1.2); sfx("bubble"); },
      start: (dir) => { sfx("whoosh"); sfx("swish", 1); fx.shake(2, 0.3); this.toast("Dòng lũ! " + (dir > 0 ? "⇢" : "⇠"), "#f0d9a0"); },
      end: (dir, reason) => { if (reason === "elapsed") { sfx("swish", 0.6); this.toast("Dòng lũ đã qua", "#f0d9a0"); } } });
    if (t.current?.enabled === false || t.random_current === false) this.flood.next = Infinity;
    this._leanAt = (x, d) => (d >= this.flood.c.min_depth ? this.flood.lean * this.flood.vis : 0) + (d > DEEP.zone && this.ter.chanAt(x, d)?.vx ? 0.6 * Math.sign(this.ter.chanAt(x, d).vx) : 0);
    this._rays = () => godRays(screen.px, this.cam * this._scale(), this._surfaceY(), this._sy(this.maxD) - this._surfaceY(), this.t_now || 0, 0.08);
    // aggressive creature (creatures.js); env is reused every frame (no per-frame allocation)
    this.snakes = makeSnakes(DEEP.zone); this.snakeSeen = !!save.catalog[SNAKE.id];
    for (const s of this.snakes) if (s.d > DEEP.zone) { const [x, d] = this.ter.openSpot(s.x, s.d, 1.2); const dx = x - s.x, dd = d - s.d; s.x = x; s.d = d; if (s.hx != null) { s.hx += dx; s.hd += dd; } if (s.seg) for (let k = 0; k < s.seg.length; k += 2) { s.seg[k] += dx; s.seg[k + 1] += dd; } }
    this.snakeEnv = { px: 0, pd: 0, underwater: false, swim: this.swim, deepZone: DEEP.zone, maxD: this.maxD, maxX: this.maxX, sx: W / 26, sy: VS,
      bite: (s, nx, nd) => this.snakeBite(s, nx, nd), seen: () => this.onSnakeSeen() };
    this.cam = t.start_pos[0]; this.ps = new Particles(); this.psUI = new Particles();
    this.toasts = []; this.ended = false; this.hintT = 4; this.danger = 0; this.flashHurt = 0;
    this.score = 0; this.result = null; this.started = false; this.dockPulse = 0;
    music("underwater");
  }
  worth(kind) { // rough value of a caught item, for the end tally
    for (const m of Object.values(this.menu)) if (m.recipe[kind]) return m.price / (Object.values(m.recipe).reduce((a, b) => a + b, 0));
    return 10;
  }
  // swimming school (v1.1): fish_speed along a random heading, re-rolled every fish_turn_ticks, reflected at edges
  newSchool(kind, x, d) {
    const f = { id: "F" + (++this.fishSeq), kind, x, d, ox: reachOf(x) * REACH_M, face: 1, caught: false, phase: Math.random() * 6, vx: 1, vd: 0, turn: (this.t.fish_turn_ticks || 120) / this.hz }; // ox: its reach (fish_x is reach-local)
    this.heading(f); return f;
  }
  heading(f) { const a = Math.random() * TAU; f.vx = Math.cos(a); f.vd = Math.sin(a); f.face = f.vx >= 0 ? 1 : -1; }
  swimFish(dt) {
    const t = this.t, sp = t.fish_speed ?? 0, fx0 = t.fish_x || [1, t.bounds.x[1] - 1], turnS = (t.fish_turn_ticks || 120) / this.hz;
    for (const f of this.fish) {
      if (f.caught || f.hooked) continue;
      f.phase += dt; f.turn -= dt;
      if (f.turn <= 0) { f.turn += turnS; this.heading(f); }
      const band = (t.fish_depths || {})[f.kind] || [1, t.bounds.d[1] - 1];
      let nx = f.x + f.vx * sp * dt, nd = f.d + f.vd * sp * dt;
      const xa = fx0[0] + (f.ox || 0), xb = fx0[1] + (f.ox || 0);
      if (nx < xa) { nx = 2 * xa - nx; f.vx = -f.vx; } else if (nx > xb) { nx = 2 * xb - nx; f.vx = -f.vx; }
      if (nd < band[0]) { nd = 2 * band[0] - nd; f.vd = -f.vd; } else if (nd > band[1]) { nd = 2 * band[1] - nd; f.vd = -f.vd; }
      f.x = Math.max(xa, Math.min(xb, nx)); f.d = Math.max(band[0], Math.min(band[1], nd));
      if (Math.abs(f.vx) > 0.05) f.face = f.vx > 0 ? 1 : -1;
    }
    // scheduled spawn: every fish_spawn_ticks, at most one school, under fish_max, clearance from every live school
    if (!t.fish_spawn_ticks) return;
    this.spawnT += dt;
    // GUI tuning (Sáng tạo): spawns twice as often as the contract (headless keeps fish_spawn_ticks)
    const every = t.fish_spawn_ticks / this.hz * GUI_SPAWN_MUL;
    if (this.spawnT < every) return;
    this.spawnT -= every;
    let alive = this.fish.filter((f) => !f.caught);
    const want = this.questKind(alive);
    if (alive.length >= this.fishMax) {
      // river full but a quest fish is missing: swap out the farthest off-screen school the quest doesn't need
      if (!want) return;
      const need = this.need || {}, p = this.p;
      const spare = alive.filter((f) => !f.hooked && !(f.kind in need) && (this._sx(f.x) < -30 || this._sx(f.x) > W + 30 || this._sy(f.d) < -30 || this._sy(f.d) > H + 30))
        .sort((a, b) => Math.hypot(b.x - p.x, b.d - p.d) - Math.hypot(a.x - p.x, a.d - p.d))[0];
      if (!spare) return;
      this.fish = this.fish.filter((f) => f !== spare); alive = alive.filter((f) => f !== spare);
    }
    const q = this.pickSpawn(alive, want); if (!q) return; // no free point: skip this turn
    this.fish.push(this.newSchool(q.kind, q.pos[0], q.pos[1]));
  }
  // quest guarantee (GUI): the needed fish kind whose live schools can't cover what is still missing (null = all covered)
  questKind(alive) {
    if (!this.need) return null;
    const have = {}; for (const k of this.hold) have[k] = (have[k] || 0) + 1;
    const fy = this.t.fish_yield || {};
    for (const [kind, n] of Object.entries(this.need)) {
      if (!(this.t.fish_depths || {})[kind]) continue;
      const left = n - (have[kind] || 0); if (left <= 0) continue;
      const schools = alive.filter((f) => f.kind === kind).length;
      if (schools * (fy[kind] || 1) < left + (fy[kind] || 1)) return kind; // keep one school of slack
    }
    return null;
  }
  // one spawn draw (v1.1): species by fish_weights renormalised over the species that still have a spawn point at
  // more than fish_spawn_clearance from every live school, then a uniform point of that species. null = no point.
  pickSpawn(alive, prefer = null) {
    const t = this.t, clear = t.fish_spawn_clearance ?? 1, ok = {};
    for (const [kind, ds] of Object.entries(t.fish_spawn_depths || {})) {
      const pts = []; for (const x of this.spawnXs || t.fish_spawn_x || []) for (const d of ds) if (alive.every((f) => f.caught || Math.hypot(f.x - x, f.d - d) > clear)) pts.push([x, d]);
      if (pts.length) ok[kind] = pts;
    }
    const kinds = Object.keys(ok); if (!kinds.length) return null;
    if (prefer && ok[prefer]) { // quest fish: spawn in the diver's own reach when it has a free point (big map)
      const rc = reachOf(this.p?.x ?? 0), mine = ok[prefer].filter((q) => reachOf(q[0]) === rc), pts = mine.length ? mine : ok[prefer];
      return { kind: prefer, pos: pts[Math.floor(Math.random() * pts.length)] }; }
    const wts = kinds.map((k) => (t.fish_weights || {})[k] ?? 1), sum = wts.reduce((a, b) => a + b, 0);
    let r = Math.random() * sum, kind = kinds[kinds.length - 1];
    for (let i = 0; i < kinds.length; i++) { r -= wts[i]; if (r < 0) { kind = kinds[i]; break; } }
    return { kind, pos: ok[kind][Math.floor(Math.random() * ok[kind].length)] };
  }
  // fish radar: for each needed fish kind still short, the nearest live school of that kind (for the edge arrows)
  radarTargets() {
    if (!this.need) return [];
    const have = {}; for (const k of this.hold) have[k] = (have[k] || 0) + 1;
    const out = [], p = this.p;
    for (const [kind, n] of Object.entries(this.need)) {
      if ((have[kind] || 0) >= n) continue;
      if (!(this.t.fish_depths || {})[kind]) { // a plant: point at the nearest ready node (else the one regrowing soonest)
        const mine = this.nodes.filter((q) => q.kind === kind);
        const ready = mine.filter((q) => q.ready).sort((a, b2) => Math.abs(a.pos[0] - p.x) - Math.abs(b2.pos[0] - p.x));
        const nb = ready[0] || mine.slice().sort((a, b2) => a.regrow - b2.regrow)[0];
        if (nb) out.push({ kind, f: { x: nb.pos[0], d: 0 }, dist: Math.hypot(nb.pos[0] - p.x, p.d), node: true, wait: nb.ready ? null : nb.regrow });
        continue;
      }
      let best = null, bd = 1e9;
      for (const f of this.fish) { if (f.caught || f.hooked || f.kind !== kind) continue; const r = Math.hypot(f.x - p.x, f.d - p.d); if (r < bd) { bd = r; best = f; } }
      out.push({ kind, f: best, dist: best ? bd : null });
    }
    return out;
  }
  // guidance: a needed kind has no live school and the river is at fish_max → only catching other fish makes room
  riverFullHint(dt) {
    if (this.fullHintT > 0) { this.fullHintT -= dt; return; }
    const alive = this.fish.filter((f) => !f.caught).length;
    if (alive < this.fishMax) return;
    const miss = this.radarTargets().find((r) => !r.f && !r.node);
    if (miss) { this.toast("Sông đầy cá rồi — bắt bớt cá khác để " + KIND_NAME[miss.kind] + " ghé tới", "#9fd8ff"); this.fullHintT = 30; }
  }
  crocBite(m) {
    const p = this.p, ratio = this.mon.loss_ratio ?? 0.5;
    const lose = Math.floor(this.hold.length * ratio), lost = lose ? this.hold.splice(this.hold.length - lose, lose) : []; // LIFO
    this.syncFrom();
    startRecoil(m, p.x, p.d, this.hz);
    this.toast("Cá Sấu Năm Chèo cắn! −1 Máu", "#ff6b6b");
    if (lost.length) { const by = {}; for (const k of lost) by[k] = (by[k] || 0) + 1; this.toast("Rơi mất: " + Object.entries(by).map(([k, n]) => KIND_NAME[k] + " ×" + n).join(", "), "#ffb36b"); }
    sfx("slam"); fx.shake(7, 0.45);
    this.hurt("croc");
  }
  toast(txt, col) { this.toasts.push({ txt, col, life: 1.6, y: 0 }); }
  nearestNode() { let best = null, bd = 1e9; for (const n of this.nodes) { if (!n.ready) continue; const dx = n.pos[0] - this.p.x, dd = (0) - this.p.d; const r = Math.hypot(dx, dd); if (r < bd) { bd = r; best = n; } } return bd <= this.t.interact_radius ? best : null; }
  // reach = upgraded catch radius; big deep fish keep their larger body radius plus the same net bonus
  nearestFish() { const cr = this.catchR, bonus = cr - this.t.catch_radius; let best = null, bd = 1e9; for (const f of [...this.fish, ...this.deep]) { if (f.caught) continue; const r = Math.hypot(f.x - this.p.x, f.d - this.p.d) - (f.sp ? Math.max(cr, f.sp.radius + bonus) : cr); if (r < bd) { bd = r; best = f; } } return bd <= 0 ? best : null; }
  // big map: DOCKS (gui_tuning.js) — the contract dock x=2 plus moored ghe at 150 / 298; any one ends the dive the same way
  atDock() { return this.dockAt() != null; }
  dockAt() { for (const x of DOCKS) if (Math.hypot(this.p.x - x, this.p.d - this.t.dock_pos[1]) <= this.t.dock_radius) return x; return null; }

  endRun(reason) {
    if (this.ended) return; this.ended = true; this.flood?.stop("phase_end");
    removeEventListener("pointermove", this._onMove); removeEventListener("pointerdown", this._onMove); removeEventListener("keydown", this._onKey); this.inv = null;
    if (this.harp?.hit) this.harp.hit.hooked = false; this.harp = null;
    if (reason === "fainted") this.hold = [];
    this.syncFrom();
    let val = 0; const by = {}; for (const k of this.hold) { by[k] = (by[k] || 0) + 1; val += this.worth(k); }
    this.result = { reason, by, val: Math.round(val), t: 0, items: this.items.map(plain) }; // items: v1.2 handover (ids + fresh, spoiled included)
    music(reason === "fainted" ? "theme" : "theme");
    sfx(reason === "fainted" ? "hurt" : "ding");
    if (reason !== "fainted") sfx("fanfare");
  }

  // kind: "choke" (goes through invulnerability, sets none), "croc" (invuln_ticks), "snake" (creative, 1.2 s)
  hurt(kind = "snake") {
    if (kind !== "choke" && this.invuln > 0) return;
    this.hp--; this.flashHurt = 0.4;
    if (kind === "croc") this.invuln = (this.mon?.invuln_ticks ?? 90) / this.hz; else if (kind === "snake" || kind === "fish") this.invuln = 1.2;
    fx.shake(5, 0.4); fx.flash("rgba(220,60,60,.5)", 0.2); sfx("hurt", undefined, HURT_CAP[kind]);
    this.toast("-1 ♥", "#ff6b6b");
    if (this.hp <= 0) this.endRun("fainted");
  }

  snakeBite(s, nx, nd) {
    const p = this.p;
    this.hurt(); fx.shake(4, 0.3); sfx("slam");
    this.toast(SNAKE.name + " cắn!", "#ff9a5a");
    p.x = clamp(p.x + nx * SNAKE.push, 0, this.maxX); p.d = clamp(p.d + nd * SNAKE.push, this.t.surface_depth + 0.1, this.maxD);
    p.vx = nx * this.swim * 2; p.vd = nd * this.swim * 2; this.unstick();
    const sx = this._sx(p.x), sy = this._sy(p.d);
    for (let i = 0; i < 6; i++) this.ps.add({ x: sx, y: sy, vx: (Math.random() - .5) * 50, vy: (Math.random() - .5) * 50, size: 1, life: 0.35, color: "#ff8a8a" });
  }
  // push the diver along (nx,nd) by dist m (clamped to the river), with a matching velocity kick
  shove(nx, nd, dist) {
    const p = this.p;
    p.x = clamp(p.x + nx * dist, 0, this.maxX); p.d = clamp(p.d + nd * dist, this.t.surface_depth + 0.1, this.maxD);
    p.vx = nx * this.swim * 2; p.vd = nd * this.swim * 2; this.unstick();
  }
  // diver body vs terrain: axis-separated so the diver slides along rock (contract zone d < 30: never blocked,
  // so movement there is exactly clamp(p + v·dt) as before)
  moveDiver(dx, dd) {
    const p = this.p, ter = this.ter, R = 0.45;
    const nx = clamp(p.x + dx, 0, this.maxX);
    if (!ter.hits(nx, p.d, R)) p.x = nx;
    else if (!this.slip(nx, p.d, 0, 1, R, p.vd)) p.vx *= 0.2; // blocked: try sliding around a bump (step along d)
    const nd = clamp(p.d + dd, 0, this.maxD);
    if (!ter.hits(p.x, nd, R)) p.d = nd;
    else if (!this.slip(p.x, nd, 1, 0, R, p.vx)) p.vd *= 0.2;
  }
  // blocked move to (x,d): accept it shifted sideways along (ax,ad) by up to 0.3 m (rounded rock bumps / slopes)
  // pref: velocity along the slip axis — slide only that way when the player is steering along it
  slip(x, d, ax, ad, R, pref = 0) {
    const p = this.p, ter = this.ter, s0 = pref > 0.3 ? 1 : -1, both = Math.abs(pref) <= 0.3;
    for (let k = 1; k <= 10; k++) for (let m = 0; m < (both ? 2 : 1); m++) { const s = m ? -s0 : s0;
      const o = s * k * 0.05, xx = clamp(x + ax * o, 0, this.maxX), dd = clamp(d + ad * o, 0, this.maxD);
      if (!ter.hits(xx, dd, R)) { p.x = xx; p.d = dd; return true; }
    }
    return false;
  }
  // pushed into rock (knockback): pop out to the nearest open spot, upward first
  unstick() {
    const p = this.p, ter = this.ter, R = 0.45; if (!ter || !ter.hits(p.x, p.d, R)) return;
    for (let k = 1; k <= 80; k++) for (const [ax, ad] of [[0, -1], [1, 0], [-1, 0], [0, 1]]) { const x = p.x + ax * k * 0.25, d = p.d + ad * k * 0.25; if (d <= this.maxD && x >= 0 && x <= this.maxX && !ter.hits(x, d, R)) { p.x = x; p.d = d; return; } }
  }
  openClam(k) {
    k.open = true; k.t = 0; const bonus = 30;
    recordHunt(bonus); this.huntK = (this.huntK || 0) + bonus; meta.trackChore?.("cave_clam");
    this.toast("Sò ngọc trong hang! +" + bonus + "k", "#ffe14d"); sfx("coin"); sfx("ding"); fx.flash("rgba(255,240,180,.3)", 0.15);
    const sx = this._sx(k.x), sy = this._sy(k.d);
    this.ps.add({ x: sx, y: sy, ring: true, size: 4, life: 0.5, color: "#fff2b0", fade: false });
    for (let i = 0; i < 12; i++) this.ps.add({ x: sx, y: sy, vx: (Math.random() - .5) * 60, vy: -20 - Math.random() * 40, g: 40, size: 1 + (i % 2), life: 0.8, color: i % 2 ? "#ffe14d" : "#bffff0" });
  }
  // boss contact while charging: −1 Máu (1.2 s invulnerability) + knockback
  bossRam(f, nx, nd) {
    const hit = this.invuln <= 0;
    this.shove(nx, nd, f.sp.push || 2); fx.shake(8, 0.4); sfx("slam");
    if (hit) { this.toast(f.sp.name + " húc!", "#ff9a5a"); this.hurt("fish"); }
  }
  onSnakeSeen() {
    if (this.snakeSeen) return; this.snakeSeen = true;
    if (recordCatch(SNAKE.id, SNAKE.name)) this.discover(SNAKE.name);
    this.toast("Cẩn thận! Rắn nước cắn — Space làm choáng", "#ffb36b");
  }
  discover(name) { this.toast("Mới! Sổ tay: " + name, "#7dffb0"); fx.flash("rgba(160,255,200,.3)", 0.15); sfx("ding"); }

  get menuOpen() { return !!this.inv; } // main.js: Esc closes the inventory instead of opening the pause menu
  update(dt) {
    { const kI = this.keyI || this.bagClick, kX = this.keyX, eat = this.clickEat; this.keyI = this.keyX = this.bagClick = this.clickEat = false;
      if (!this.result && !this.ended) { // inventory freezes the whole dive (timers, O₂, fish, monsters, particles)
        if (this.tutTip) return this.updateTutTip(dt, kI, eat); // inventory coach tip: small modal, any key closes
        if (this.inv) return this.updateInv(dt, kI, kX, eat);
        if (kI) return this.openInv();
      } }
    for (const a of [this.ps, this.psUI]) a.update(dt);
    if (this.sinks.length) { for (const q of this.sinks) { q.life -= dt; q.vd += 1.4 * dt; q.x += q.vx * dt; q.d += q.vd * dt; q.rot += q.vr * dt; const ch = q.d > DEEP.zone && this.ter.chanAt(q.x, q.d); if (ch) { q.x += ch.vx * dt; q.d += ch.vd * dt; } } this.sinks = this.sinks.filter((q) => q.life > 0); }
    if (!this.result) { updateFloodFx(this.flood, dt, W); this.chFx.update(dt); if (this.floodWarn > 0) this.floodWarn -= dt; if (this.ter.clam.open) this.ter.clam.t += dt; }
    this.toasts.forEach((t) => { t.life -= dt; t.y -= dt * 18; }); this.toasts = this.toasts.filter((t) => t.life > 0);
    if (this.result) { this.result.t += dt; if (input.hit("restart")) this.onEnd({ restart: true }); else if (this.result.t > 0.6 && input.any()) this.onEnd(this.result); return; }

    const t = this.t, p = this.p;
    this.decayHold(dt); // freshness of what is already in the basket (new items start decaying next step)
    // --- input / movement (eased velocity) ---
    let [mx, md] = input.axis();
    if (mx || md) { const n = Math.hypot(mx, md) || 1; mx /= n; md /= n; this.started = true; this.hintT = 0; }
    this.sprint = input.down("sprint") && (mx || md) ? 1 : 0;
    const sp = this.swim * (this.sprint ? 1.8 : 1);
    p.vx = lerp(p.vx, mx * sp, 0.18); p.vd = lerp(p.vd, md * sp, 0.18);
    // flood current (before movement, on the depth at the start of the step) + deep channels: displacement only,
    // never accumulated into p.vx / p.vd
    const push = this.flood.step(dt, p.d), ch = p.d > DEEP.zone ? this.ter.chanAt(p.x, p.d) : null;
    this.chanNow = ch;
    this.moveDiver((p.vx + push + (ch ? ch.vx : 0)) * dt, (p.vd + (ch ? ch.vd : 0)) * dt);
    if (mx || md) { p.heading = Math.atan2(md, mx); if (Math.abs(mx) > 0.01) p.face = mx > 0 ? 1 : -1; }
    // aim (world metres): mouse if it moved in the last 2.5 s, else the swim heading, else straight ahead
    const mouseAim = this.mouseT > 0 && performance.now() - this.mouseT < 2500;
    if (mouseAim) { const wx = this.cam + (this.mouse.x - W / 2) / this._scale(), wd = (this.mouse.y - this._surfaceY()) / VS; this.aim = Math.atan2(wd - p.d, wx - p.x); if (!(mx || md)) p.face = Math.cos(this.aim) >= 0 ? 1 : -1; }
    else if (mx || md) this.aim = p.heading;
    else this.aim = Math.cos(this.aim) * p.face >= 0 ? this.aim : (p.face > 0 ? 0 : Math.PI);
    // body tilt follows the swim direction on screen (or the aim while hovering with the mouse)
    { const vxs = p.vx * this._scale(), vys = p.vd * VS, moving = Math.hypot(p.vx, p.vd) > 0.4;
      let target = 0;
      if (moving) target = Math.atan2(vys, Math.abs(vxs) + 1e-3);
      else if (mouseAim && p.d > t.surface_depth) target = Math.atan2(Math.sin(this.aim) * VS, Math.abs(Math.cos(this.aim)) * this._scale() + 1e-3) * 0.6;
      if (p.d <= t.surface_depth) target = Math.min(target, 0.2);
      this.tilt = lerp(this.tilt, clamp(target, -1.4, 1.4), 0.15); }
    p.phase += dt * (1 + Math.hypot(p.vx, p.vd) * 0.3);
    const underwater = p.d > t.surface_depth;

    // --- oxygen / choke ---
    if (underwater) {
      const deepZone = p.d > DEEP.zone, zp = ZONES[zoneIndex(p.d)].pressure; // O₂ drain × the zone's pressure (gui_tuning.ZONES)
      if (deepZone && !this.deepSeen) { this.deepSeen = true; this.toast("Vùng nước sâu! Cá to có Máu ♥ — O₂ hao ×" + DEEP.pressure, "#9fd8ff"); sfx("whoosh"); }
      this.oxy = clamp(this.oxy - dt * (this.sprint ? 2 : 1) * zp, 0, this.oxyMax);
      if (this.oxy <= 0) { this.zeroOxy += dt; if (this.zeroOxy >= t.choke_interval_ticks / this.hz) { this.zeroOxy -= t.choke_interval_ticks / this.hz; this.hurt("choke"); if (this.ended) return; } }
      if (Math.random() < 0.3) this.ps.add({ x: this._sx(p.x), y: this._sy(p.d) - 2, vy: -14, g: 0, wobble: 6, seed: Math.random() * 6, size: 1, life: 1.1, color: "rgba(220,245,255,.7)" });
    } else { this.oxy = clamp(this.oxy + t.oxygen_refill_per_tick * dt, 0, this.oxyMax); this.zeroOxy = 0; }
    this.danger = this.oxy < this.oxyMax * 0.25 && underwater ? clamp(this.danger + dt * 2, 0, 1) : clamp(this.danger - dt * 3, 0, 1);
    // SFX captions: one heartbeat + caption each time oxygen drops below 25 % underwater (re-arms once refilled)
    if (this.oxy < this.oxyMax * 0.25 && underwater && this.oxy > 0) { if (!this.lowOCue) { this.lowOCue = true; sfx("heartbeat", undefined, "[tim đập nhanh — oxy sắp hết]"); } }
    else if (this.oxy >= this.oxyMax * 0.25) this.lowOCue = false;

    { const zi = zoneIndex(p.d); // zone banner whenever the diver crosses into another zone
      if (zi !== this.zone) { this.zone = zi; this.banner = { i: zi, t: 0, first: zi > this.zoneMax }; if (zi > this.zoneMax) { this.zoneMax = zi; sfx("riser", 0.8); sfx("whoosh"); } else sfx("swish", 0.6); }
      if (this.banner) { this.banner.t += dt; if (this.banner.t > 3) this.banner = null; } }
    if (this.invuln > 0) this.invuln -= dt;
    if (this.catchCd > 0) this.catchCd -= dt;

    // --- Cá Sấu Năm Chèo: move (patrol/chase/recoil), then at most one hit on the nearest ---
    if (!this.crocEnv) this.crocEnv = { px: 0, pd: 0, bx: [0, this.maxX] };
    this.crocEnv.px = p.x; this.crocEnv.pd = p.d; updateCrocs(this.crocs, dt, this.crocEnv);
    if (this.crocs.some((m) => m.gone)) this.crocs = this.crocs.filter((m) => !m.gone); // defeated: gone for this dive
    if (p.d >= 10 && this.invuln <= 0) { const m = crocHit(this.crocs, p.x, p.d); if (m) { this.crocBite(m); if (this.ended) return; } }
    { const n = crocNear(this.crocs, p.x, p.d); this.crocWarn = n && n.dist <= n.m.sp.detect_radius ? Math.min(1, this.crocWarn + dt * 4) : Math.max(0, this.crocWarn - dt * 3); }
    if (this.crocWarn > 0.5 && !this.crocCue) { this.crocCue = true; sfx("boom", 0, "[Cá Sấu gầm — đang đến gần]"); } else if (this.crocWarn <= 0) this.crocCue = false;
    // --- fish schools swim + scheduled spawns (v1.1) ---
    this.swimFish(dt); if (this.started) this.riverFullHint(dt);
    { const e = this.deepEnv; e.px = p.x; e.pd = p.d; updateDeepFish(this.deep.filter((f) => !f.hooked), dt, this.maxD, e); if (this.ended) return; }
    if (!this.bossSeen) { const b = this.deep.find((f) => f.sp.boss && !f.caught); if (b && Math.hypot(b.x - p.x, b.d - p.d) < 14) { this.bossSeen = true; this.toast(b.sp.name + "! ♥" + b.hp + " — cần mũi lao mạnh", "#ffb36b"); sfx("boom"); fx.shake(3, 0.5); } }
    for (const q of this.pops) { q.life -= dt; q.d -= dt * 0.8; } if (this.pops.length) this.pops = this.pops.filter((q) => q.life > 0);
    { const e = this.snakeEnv; e.px = p.x; e.pd = p.d; e.underwater = underwater; updateSnakes(this.snakes, dt, e); if (this.snakes.some((s) => s.gone)) this.snakes = this.snakes.filter((s) => !s.gone); }
    // --- node regrow ---
    for (const n of this.nodes) { if (!n.ready) { n.regrow -= dt; if (n.regrow <= 0) { n.ready = true; this.toast(KIND_NAME[n.kind] + " mọc lại", "#79c75a"); } } if (n.pop > 0) n.pop -= dt; }

    // --- actions ---
    if (input.hit("interact")) {
      if (this.atDock() && this.hold.length) { this.endRun("docked"); }
      else { const n = this.nearestNode(); if (n && !underwater && this.hold.length < this.cap) this.pick(n); else if (n && underwater) this.toast("Lên mặt nước để hái", "#ffd23a"); else if (n) { this.toast("Giỏ đầy! Về bến (E)", "#ff8a8a"); sfx("hurt"); } }
    }
    if ((input.hit("catch") || (input.hit("confirm") && this.mouseT > 0)) && underwater && !this.harp && this.catchCd <= 0) this.fire();
    this.updateHarpoon(dt);
    this.basketCoach(dt);
    { const k = this.ter.clam; if (!k.open && underwater && Math.hypot(p.x - k.x, p.d - k.d) < 1.8) this.openClam(k); }
    if (input.hit("restart")) this.onEnd({ restart: true });

    // --- timer ---
    this.time -= dt; this.dockPulse += dt;
    if (this.time <= 0) { this.time = 0; this.endRun(this.hold.length ? "timeup" : "timeup_empty"); }

    // --- camera ---
    this.cam = lerp(this.cam, clamp(p.x, W / 2 / this._scale(), this.maxX - W / 2 / this._scale()), 0.1);
    const maxCamY = 58 + this.maxD * VS + 14 - H;
    this.camY = lerp(this.camY, clamp(58 + p.d * VS - H * 0.45, 0, maxCamY), 0.12);
    if (this.hintT > 0) this.hintT -= dt;
  }

  harpRange() { return 5 + (this.catchR - this.t.catch_radius) * 2; }
  hitRadius(f) { return f.wps ? f.sp.hit_radius + 0.4 : f.seg ? 0.4 + SNAKE.bodyR : f.sp ? f.sp.hitR ?? f.sp.radius * 0.7 : 1.1; }
  // live (not defeated) snake whose body is at the spear tip — stunned ones can be hit again (stun overrides)
  snakeAt(x, d) { let best = null, bd = 1e9; for (const s of this.snakes) { if (s.state === "dead") continue; const r = Math.hypot(s.x - x, s.d - d); if (r <= 0.4 + SNAKE.bodyR && r < bd) { bd = r; best = s; } } return best; }
  fire() {
    const p = this.p, ax = Math.cos(this.aim), ad = Math.sin(this.aim);
    this.harp = { x: p.x + ax * 0.6, d: p.d + ad * 0.6, ax, ad, dist: 0, state: "out", hit: null };
    sfx("whoosh"); fx.shake(1, 0.08);
  }
  // first catchable thing along the aim ray (for the aim highlight)
  aimTarget() {
    const p = this.p, ax = Math.cos(this.aim), ad = Math.sin(this.aim), R = this.harpRange();
    let best = null, bt = 1e9;
    for (const f of [...this.fish, ...this.deep, ...this.crocs, ...this.snakes]) { if (f.caught || f.hooked || f.state === "dead") continue; const rx = f.x - p.x, rd = f.d - p.d, tt = rx * ax + rd * ad; if (tt < 0 || tt > R + this.hitRadius(f)) continue; const off = Math.abs(rx * ad - rd * ax); if (off <= this.hitRadius(f) && tt < bt) { bt = tt; best = f; } }
    return best;
  }
  updateHarpoon(dt) {
    const h = this.harp; if (!h) return; const p = this.p;
    if (h.state === "out") {
      const step = 24 * dt; h.x += h.ax * step; h.d += h.ad * step; h.dist += step;
      if (h.d < 0) { h.d = 0; h.state = "back"; }
      const rockHit = h.d > 2.5 && (this.ter.solid(h.x, h.d) || this.ter.solid(h.x - h.ax * step * 0.5, h.d - h.ad * step * 0.5));
      const sn = rockHit ? null : this.snakeAt(h.x, h.d), cr = sn || rockHit ? null : crocAt(this.crocs, h.x, h.d);
      if (rockHit) { // spear bounces off rock: back off to open water, "tink" spark, rope reels in
        for (let i = 0; i < 6 && this.ter.solid(h.x, h.d); i++) { h.x -= h.ax * step * 0.25; h.d -= h.ad * step * 0.25; }
        h.state = "back"; h.rock = true; sfx("click"); sfx("blip"); fx.shake(1, 0.06);
        const sx = this._sx(h.x), sy = this._sy(h.d);
        this.ps.add({ x: sx, y: sy, ring: true, size: 2, life: 0.2, color: "#fff6c0", fade: false });
        for (let i = 0; i < 7; i++) this.ps.add({ x: sx, y: sy, vx: -h.ax * 40 + (Math.random() - .5) * 60, vy: -h.ad * 40 + (Math.random() - .5) * 60, g: 40, size: 1, life: 0.25, color: i % 2 ? "#ffe9a0" : "#ffffff" });
      }
      else if (sn) { if (!this.hitMonster(sn, "snake")) this.stun(sn); h.state = "back"; }
      else if (cr) { if (!this.hitMonster(cr, "croc")) this.stunCroc(cr); h.state = "back"; }
      else for (const f of [...this.fish, ...this.deep]) {
        if (f.caught || f.hooked || Math.hypot(f.x - h.x, f.d - h.d) > this.hitRadius(f)) continue;
        const hp = f.hp ?? 1; // contract schools: 1 HP → any hit catches them (unchanged core rule)
        if (this.dmg < hp) this.wound(f, h);
        else if (!f.sp?.boss && this.hold.length + (f.sp ? 1 : this.yield[f.kind] || 1) > this.cap) { this.toast("Giỏ không đủ chỗ cho cả đàn! Về bến (E)", "#ff8a8a"); sfx("hurt"); }
        else { if (f.sp) { f.hp = 0; f.hpShow = 1.5; } f.hooked = true; h.hit = f; sfx("catch"); fx.hitstop(f.sp?.boss ? 0.12 : 0.05); fx.shake(f.sp ? (f.sp.boss ? 6 : 3) : 2, 0.15); }
        h.state = "back"; break;
      }
      if (h.dist >= this.harpRange()) h.state = "back";
      if (h.state === "back" && !h.hit) for (let i = 0; i < 4; i++) this.ps.add({ x: this._sx(h.x), y: this._sy(h.d), vx: (Math.random() - .5) * 30, vy: (Math.random() - .5) * 30, size: 1, life: 0.3, color: "rgba(255,255,255,.5)" });
    } else {
      const dx = p.x - h.x, dd = p.d - h.d, r = Math.hypot(dx, dd), step = (h.hit?.sp ? h.hit.sp.reel || 11 : 16) * dt; // bigger fish reel slower
      if (r <= step + 0.3) { const f = h.hit; this.harp = null; this.catchCd = this.t.catch_cooldown_s; if (f) { f.hooked = false; this.grab(f); } return; }
      h.x += dx / r * step; h.d += dd / r * step;
    }
    if (h.hit) { h.hit.x = h.x; h.hit.d = h.d; }
  }

  // non-lethal spear hit on a deep fish: HP down, flash + knockback + HP bar + damage number, spear comes back empty
  wound(f, h) {
    const p = this.p, dmg = this.dmg;
    hurtDeepFish(f, dmg, h.ax, h.ad);
    this.pops.push({ x: f.x, d: f.d - 1, txt: "-" + dmg, life: 0.9, col: f.sp.boss ? "#ffb36b" : "#ff6b6b" });
    sfx("slam"); fx.hitstop(0.04); fx.shake(f.sp.boss ? 4 : 2, 0.15);
    const sx = this._sx(h.x), sy = this._sy(h.d);
    for (let i = 0; i < 8; i++) this.ps.add({ x: sx, y: sy, vx: (Math.random() - .5) * 70, vy: (Math.random() - .5) * 70, size: 1 + (i % 2), life: 0.4, color: i % 2 ? "#ff6b6b" : "#ffffff" });
    if (f.sp.boss) this.toast(f.sp.name + " nổi giận! Tránh ra!", "#ff9a5a");
    else if (f.sp.biteR && Math.hypot(f.x - p.x, f.d - p.d) <= f.sp.biteR + 1) { // big snakehead bites back at close range
      const dx = p.x - f.x, dd = p.d - f.d, r = Math.hypot(dx, dd) || 1;
      this.toast(f.sp.name + " đớp trả!", "#ff9a5a"); this.shove(dx / r, dd / r, 1.5); this.hurt("fish");
    }
  }
  // spear damage on a monster (GUI hunting): pop + flash; true when this hit defeated it
  hitMonster(m, type) {
    const dmg = this.dmg, dead = type === "croc" ? damageCroc(m, dmg) : damageSnake(m, dmg);
    this.pops.push({ x: m.x, d: m.d - 1, txt: "-" + dmg, life: 0.9, col: "#ff6b6b" });
    if (dead) this.defeat(m, type);
    return dead;
  }
  defeat(m, type) {
    const info = type === "croc" ? CROC_HUNT : SNAKE, k = info.bounty;
    recordHunt(k); this.huntK = (this.huntK || 0) + k; recordDefeat(info.id, info.name);
    meta.trackChore?.("monster_defeated:" + info.id);
    this.toast("Hạ " + info.name + "! +" + k + "k", "#ffe14d");
    if (MONSTER_DROP[info.id]) this.addPremium(MONSTER_DROP[info.id], info.id, m.x, m.d);
    sfx("boom"); sfx("slam"); sfx("coin"); fx.hitstop(type === "croc" ? 0.15 : 0.06); fx.shake(type === "croc" ? 10 : 5, 0.6); fx.flash("rgba(255,220,120,.35)", 0.2);
    const sx = this._sx(m.x), sy = this._sy(m.d);
    this.ps.add({ x: sx, y: sy, ring: true, size: 4, life: 0.6, color: "#ffe14d", fade: false });
    for (let i = 0; i < 14; i++) this.ps.add({ x: sx, y: sy, vx: (Math.random() - .5) * 80, vy: -20 - Math.random() * 40, g: 70, size: 1 + (i % 2), life: 0.7, color: i % 3 ? "#ffe14d" : "#fff6c0" });
  }
  // Đặc sản drop: 1 premium item into the basket (★, tagged with its source in holdFrom); a full basket lets it float away
  addPremium(kind, from, x, d) {
    const nm = KIND_NAME[kind] || kind;
    if (this.hold.length >= this.cap) {
      this.toast("Giỏ đầy! " + nm.charAt(0).toUpperCase() + nm.slice(1) + " trôi mất…", "#ffb36b"); sfx("bubble");
      this.sinks.push({ kind, x, d, vx: (Math.random() - .5) * 0.8, vd: -1.2, rot: 0, vr: (Math.random() - .5) * 4, life: 2.2 });
      return false;
    }
    this.hold.push(kind); this.syncFrom(); this.holdFrom[this.hold.length - 1] = from;
    this.toast("+ ★ " + nm + " (đặc sản)", "#ffd23a"); sfx("pick");
    meta.trackChore?.("premium_got:" + kind);
    return true;
  }
  stunCroc(m) {
    stunCroc(m, this.p.x, this.p.d, 2, 3);
    sfx("slam"); fx.shake(4, 0.25); fx.hitstop(0.05);
    this.toast("Cá sấu choáng 2 s!", "#ffe14d");
    this.ps.add({ x: this._sx(m.x), y: this._sy(m.d), ring: true, size: 4, life: 0.4, color: "#ffe14d", fade: false });
  }
  pick(n) {
    n.ready = false; n.regrow = this.t.regrow_s * GUI_REGROW_MUL; n.pop = 0.4; // GUI: regrow twice as fast as the contract
    this.hold.push(n.kind); this.syncFrom(); sfx("pick"); meta.trackChore?.("picked:" + n.kind);
    this.toast("+ " + KIND_NAME[n.kind], "#ffd23a");
    fx.flash("rgba(255,220,120,.25)", 0.12);
    const sx = this._sx(n.pos[0]), sy = this._sy(0);
    for (let i = 0; i < 8; i++) this.ps.add({ x: sx, y: sy, vx: (Math.random() - .5) * 40, vy: -20 - Math.random() * 20, g: 60, size: 1 + (i % 2), life: 0.6, color: n.kind === "bong_sung" ? "#ff8fb1" : "#ffd23a" });
  }
  stun(s) {
    stunSnake(s); sfx("slam"); fx.shake(3, 0.2); fx.hitstop(0.04);
    this.toast("Choáng!", "#ffe14d");
    const sx = this._sx(s.x), sy = this._sy(s.d);
    this.ps.add({ x: sx, y: sy, ring: true, size: 3, life: 0.35, color: "#ffe14d", fade: false });
  }
  grab(f) {
    f.caught = true; this.catchCd = this.t.catch_cooldown_s;
    if (f.sp?.boss) return this.sellBoss(f);
    meta.trackChore?.("fish_caught:" + f.kind);
    const n = Math.min(f.sp ? f.sp.yield : this.yield[f.kind] || 1, this.cap - this.hold.length);
    if (!f.sp) this.fish = this.fish.filter((x) => x !== f);
    for (let i = 0; i < n; i++) this.hold.push(f.kind);
    this.syncFrom(); if (f.sp) for (let i = this.hold.length - n; i < this.hold.length; i++) this.holdFrom[i] = f.sp.id; // rare deep catch
    sfx("catch"); fx.hitstop(0.05); fx.flash("rgba(180,240,255,.3)", 0.1); fx.shake(2, 0.2);
    if (f.sp) { this.toast(f.sp.name + "!", "#ffe14d"); fx.shake(4, 0.3); }
    this.toast("+ " + KIND_NAME[f.kind] + (n > 1 ? " ×" + n : ""), f.kind === "ca_linh" ? "#d4e8f2" : f.kind === "ca_keo" ? "#c8b89a" : "#8a9a5a");
    if (f.sp && SPECIES_PREMIUM[f.sp.id]) this.addPremium(SPECIES_PREMIUM[f.sp.id], f.sp.id, f.x, f.d);
    // species catalog: contract fish log under their kind, deep fish under their species id
    const name = f.sp ? f.sp.name : KIND_NAME[f.kind].charAt(0).toUpperCase() + KIND_NAME[f.kind].slice(1);
    if (recordCatch(f.sp ? f.sp.id : f.kind, name)) this.discover(name);
    const sx = this._sx(f.x), sy = this._sy(f.d);
    this.ps.add({ x: sx, y: sy, ring: true, size: 2, life: 0.4, color: "#bdefff", fade: false });
    for (let i = 0; i < 10; i++) this.ps.add({ x: sx, y: sy, vx: (Math.random() - .5) * 60, vy: (Math.random() - .5) * 60, size: 1, life: 0.5, color: "#e8fbff" });
  }

  // boss: no ingredients — sold to the trader on the spot, money straight into the save
  sellBoss(f) {
    const k = f.sp.bounty || 300; recordHunt(k); this.huntK = (this.huntK || 0) + k;
    meta.trackChore?.("boss_killed");
    this.toast("Bán cho thương lái: +" + k + "k", "#ffe14d"); this.toast(f.sp.name + " hạ gục!", "#ffb36b");
    sfx("coin"); sfx("sting_win"); fx.hitstop(0.15); fx.flash("rgba(255,220,120,.45)", 0.25); fx.shake(8, 0.5);
    if (recordCatch(f.sp.id, f.sp.name)) this.discover(f.sp.name);
    if (SPECIES_PREMIUM[f.sp.id]) this.addPremium(SPECIES_PREMIUM[f.sp.id], f.sp.id, f.x, f.d); // Đặc sản: 1 cá tra dầu on top of the bounty
    const sx = this._sx(f.x), sy = this._sy(f.d);
    this.ps.add({ x: sx, y: sy, ring: true, size: 4, life: 0.6, color: "#ffe14d", fade: false });
    for (let i = 0; i < 18; i++) this.ps.add({ x: sx, y: sy, vx: (Math.random() - .5) * 90, vy: -30 - Math.random() * 50, g: 80, size: 1 + (i % 2), life: 0.8, color: i % 3 ? "#ffe14d" : "#fff6c0" });
  }

  // ---- screen transforms (world -> pixel canvas) ----
  _scale() { return W / 26; }               // show ~26m of river width
  _surfaceY() { return 58 - this.camY; }
  _sx(x) { return (x - this.cam) * this._scale() + W / 2; }
  _sy(d) { return this._surfaceY() + d * VS; }

  draw() {
    const c = screen.px, t = this.t, p = this.p, time = this.t_now = performance.now() / 1000;
    const surY = this._surfaceY(), botY = this._sy(this.maxD);
    const cam = this.cam, sc = this._scale();
    // sky strip
    if (surY > 0) {
      c.save(); c.translate(0, -this.camY);
      sky(c, "day", 0, 58, time);
      sun(c, 360 - cam * 2, 20, 14, "#fff2c0", "rgba(255,210,140,.2)");
      for (let i = 0; i < 4; i++) cloud(c, ((i * 150 - cam * 6 + time * 4) % 600 + 600) % 600 - 60, 14 + (i % 2) * 10, 1, "rgba(255,255,255,.7)");
      bank(c, 57, cam * sc * 0.3, "#6a4d7b", 3, 0.7);
      c.restore();
    }
    // water body: the 0–60 m river exactly as before (bands + deep-zone gradient), then the big-map layers below 60 m
    const y60 = this._sy(60);
    if (y60 + 30 > 0) bands(c, 0, surY, W, y60 - surY + 30, WATER, 16);
    // deep zone: darker, colder water below DEEP.zone
    { const zy = this._sy(DEEP.zone); if (zy - 40 < H && y60 > 0) { const g = c.createLinearGradient(0, zy - 40, 0, y60); g.addColorStop(0, "rgba(30,20,12,0)"); g.addColorStop(0.25, "rgba(30,20,12,.45)"); g.addColorStop(1, "rgba(18,12,6,.8)"); c.fillStyle = g; c.fillRect(0, zy - 40, W, y60 - zy + 40); } }
    // Tầng chạng vạng → Vực thẳm: opaque cold water, darker with depth (only the visible slice is filled)
    if (y60 < H) { const g = c.createLinearGradient(0, y60, 0, botY); g.addColorStop(0, "#1c160e"); g.addColorStop(0.06, "#10181a"); g.addColorStop(0.4, "#08121a"); g.addColorStop(0.48, "#06070f"); g.addColorStop(1, "#020205");
      const y0 = Math.max(0, y60), y1 = Math.min(H, botY + 10); c.fillStyle = g; c.fillRect(0, y0, W, y1 - y0); }
    // parallax underwater mountains (far uw_far + ridgeline, god rays, mid uw_mid arches, near ridges); clearer with depth,
    // faded out below the 60 m shelf
    { const camD = (this.camY + H / 2 - 58) / VS; this.ter.drawBackdrop(c, cam * sc, this.camY, W, H, clamp((camD - 8) / 32, 0, 1), time, this._rays, clamp(1 - (camD - 56) / 12, 0, 1)); }
    for (let i = 1; i < ZONES.length; i++) { const zy = this._sy(ZONES[i - 1].to); if (zy < -4 || zy > H + 4) continue;
      R(c, 0, zy, W, 1, i === 1 ? "rgba(230,200,140,.22)" : i === 2 ? "rgba(140,220,255,.2)" : "rgba(200,160,255,.2)");
      txt(ZONE_LINE[i], W - 6, zy - 2, { size: 7, align: "right", color: i === 1 ? "rgba(240,215,160,.65)" : i === 2 ? "rgba(160,225,255,.7)" : "rgba(210,180,255,.75)", weight: 800 }); }
    // parallax weeds + hyacinth mats
    for (let i = 0; i < 8; i++) { const wx = ((i * 190 + 40) - cam * sc) ; if (wx > -40 && wx < W + 40) hyacinth(c, wx, surY, 24 + (i % 3) * 10, time, i); }
    if (botY < H + 80) { const ln = this.flood.lean * this.flood.vis; for (let i = 0; i < 24; i++) { const kx = (i * 46 - cam * sc * 1.1); const mx = ((kx % (W + 60)) + W + 60) % (W + 60) - 30; leanKelp(c, kelp, mx, botY, 24 + (i % 5) * 14, time, ln); } }
    if (botY < H + 20) { c.fillStyle = "#120e10"; c.fillRect(0, botY - 4, W, H - botY + 8); }
    if (botY < H + 20) for (let i = 0; i < 10; i++) { const rx = (i * 70 - cam * sc); const mx = ((rx % (W + 80)) + W + 80) % (W + 80) - 40; rock(c, mx, botY - 3, 10 + (i % 3) * 5, 6); }
    // terrain (cached): contract-zone edge decoration + solid deep-zone rock, cave, channels, props on top
    { const ox = W / 2 - cam * sc; this.ter.draw(c, ox, surY, sc, VS, W, H);
      if (this._sy(DEEP.zone) < H) {
        this.chFx.draw(c, ox, surY, sc, VS, W, H, time);
        this.ter.drawCave(c, ox, surY, sc, VS, time, W, H);
        drawDeepScenery(c, ox, surY, sc, VS, time, W, H, kelp, rock, this.ter, this._leanAt);
      } }
    // depth guides
    for (let d = 5; d <= this.maxD; d += 5) { const y = this._sy(d); if (y < -2 || y > H + 2) continue; R(c, 0, y, W, 1, "rgba(255,255,255,.05)"); txt(d + "m", 3, y - 1, { size: 7, color: "rgba(255,255,255,.3)", weight: 700 }); }
    // surface shimmer
    R(c, 0, surY, W, 1, "rgba(230,250,255,.85)");
    for (let x = 0; x < W; x += 8) R(c, x + Math.round(Math.sin(time * 2 + x) * 2), surY - 1, 4, 1, "rgba(255,255,255,.5)");

    // docks (big map: one per gui_tuning.DOCKS x; any one ends the dive)
    if (surY > -40) { const at = this.hold.length ? this.dockAt() : null;
      for (const dx of DOCKS) { const x = this._sx(dx); if (x < -60 || x > W + 60) continue; dock(c, x, surY, time);
        if (at === dx) { const pz = 0.5 + 0.5 * Math.sin(this.dockPulse * 6); txt("E: Cập bến ↑", x, surY - 26, { size: 8, align: "center", color: "#ffe14d", weight: 900, alpha: 0.6 + pz * 0.4, stroke: "#1a1220", sw: 2 }); } } }

    // nodes
    for (const n of this.nodes) { const x = this._sx(n.pos[0]); if (x < -20 || x > W + 20) continue; const near = !(p.d > t.surface_depth) && Math.hypot(n.pos[0] - p.x, p.d) <= t.interact_radius && n.ready; nodeArt(c, n.kind, x, surY, time, n.ready); if (near && this.hold.length < this.cap) txt("E: hái", x, surY - 26, { size: 8, align: "center", color: "#ffd23a", weight: 900, stroke: "#1a1220", sw: 2 }); }

    // fish
    for (const f of this.fish) { if (f.caught) continue; const x = this._sx(f.x), y = this._sy(f.d); if (x < -20 || x > W + 20 || y < -20 || y > H + 20) continue; fish(c, f.kind, x, y, f.face, time + f.phase, f.kind === "ca_loc" ? 1 : 1); }
    for (const f of this.deep) { if (f.caught) continue; const x = this._sx(f.x), y = this._sy(f.d); if (x < -90 || x > W + 90 || y < -50 || y > H + 50) continue; drawDeepFish(c, f, x, y, time + f.phase); }
    for (const f of this.deep) { // HP bar for ~3 s after a hit (boss: whenever wounded)
      if (f.caught || !(f.hpShow > 0 || (f.sp.boss && f.hp < f.hpMax))) continue;
      const b = deepBox(f);
      this.hpBar(c, this._sx(f.x), this._sy(f.d) - b.h - 7, Math.min(64, Math.max(22, b.w * 1.4)), f.hp, f.hpMax, f.sp.boss ? 1 : clamp(f.hpShow, 0, 1), f.sp.boss ? f.sp.name + " ♥" + f.hp : null);
    }
    for (const m of this.crocs) if (m.state !== "dead" && (m.hpShow > 0 || m.hp < m.hpMax)) this.hpBar(c, this._sx(m.x), this._sy(m.d) - 14, 40, m.hp, m.hpMax, m.hpShow > 0 ? 1 : 0.6, m.hpShow > 0 ? "♥" + m.hp : null);
    for (const s of this.snakes) if (s.state !== "dead" && s.hpShow > 0) this.hpBar(c, this._sx(s.x), this._sy(s.d) - 9, 20, s.hp, s.hpMax, clamp(s.hpShow, 0, 1), null);
    for (const q of this.pops) txt(q.txt, this._sx(q.x), this._sy(q.d), { size: 11, align: "center", color: q.col, weight: 900, stroke: "#1a1220", sw: 2.5, alpha: clamp(q.life * 2, 0, 1) });

    for (const s of this.snakes) drawSnake(c, s, W / 2 - cam * sc, surY, sc, VS, time);
    for (const m of this.crocs) { const x = this._sx(m.x), y = this._sy(m.d); if (x > -60 && x < W + 60 && y > -30 && y < H + 30) drawCroc(c, m, x, y, time + m.t); }
    const under0 = p.d > t.surface_depth, px0 = this._sx(p.x), py0 = this._sy(p.d);
    const tgt = under0 && !this.harp ? this.aimTarget() : null;
    if (under0 && !this.harp) { // dotted aim guide
      const RR = this.harpRange(), ax = Math.cos(this.aim), ad = Math.sin(this.aim);
      for (let k = 1.2; k <= RR; k += 0.6) { if (this.ter.solid(p.x + ax * k, p.d + ad * k)) break; R(c, Math.round(this._sx(p.x + ax * k)), Math.round(this._sy(p.d + ad * k)), 1, 1, `rgba(255,240,180,${0.5 - k / RR * 0.35})`); }
      const ex = this._sx(p.x + ax * RR), ey = this._sy(p.d + ad * RR); c.strokeStyle = "rgba(255,240,180,.4)"; c.strokeRect(Math.round(ex) - 2, Math.round(ey) - 2, 4, 4);
    }
    if (tgt) { // aim label: name + HP (+ yield or bounty); "(N phát)" = hits still needed with the current spear
      const mon = tgt.wps ? CROC_HUNT : tgt.seg ? SNAKE : null;
      const fx2 = this._sx(tgt.x), fy2 = this._sy(tgt.d), rr = tgt.wps ? 22 : tgt.seg ? 10 : tgt.sp ? Math.max(20, deepBox(tgt).h + 4) : 9; c.strokeStyle = "rgba(255,225,80,.85)"; c.beginPath(); c.arc(fx2, fy2, rr + Math.sin(time * 8), 0, TAU); c.stroke();
      const hits = tgt.hp ? Math.ceil(tgt.hp / this.dmg) : 1;
      const lab = mon ? `${mon.name} ♥${tgt.hp}` + (hits > 1 ? ` (${hits} phát)` : "") : tgt.sp ? `${tgt.sp.name} ♥${tgt.hp}` + (tgt.sp.boss ? ` · ${tgt.sp.bounty}k` : " ×" + tgt.sp.yield) + (hits > 1 ? ` (${hits} phát)` : "") : "Space";
      txt(lab, fx2, fy2 - rr - 3, { size: 7, align: "center", color: hits > 1 ? "#ffb36b" : "#ffe14d", weight: 900, stroke: "#1a1220", sw: 2 }); }
    if (this.harp) { // rope + spear tip
      const h = this.harp, hx = this._sx(h.x), hy = this._sy(h.d);
      c.strokeStyle = "rgba(230,225,200,.75)"; c.lineWidth = 1; c.beginPath(); c.moveTo(px0, py0); c.lineTo(hx, hy); c.stroke();
      const a = Math.atan2(h.ad * VS, h.ax * this._scale()); c.save(); c.translate(Math.round(hx), Math.round(hy)); c.rotate(h.state === "out" ? a : a + Math.PI);
      R(c, -6, 0, 6, 1, "#8a8f99"); R(c, 0, -1, 2, 3, "#e8eef5"); R(c, 2, 0, 2, 1, "#e8eef5"); c.restore();
    }
    // catch radius + player
    const px = this._sx(p.x), py = this._sy(p.d), under = p.d > t.surface_depth;
    const sn = under ? snakeInReach(this.snakes, p.x, p.d, this.catchR) : null;
    if (sn && !tgt && !this.harp) txt("Space · choáng", this._sx(sn.x), this._sy(sn.d) + 14, { size: 7, align: "center", color: "#ffe14d", weight: 900, stroke: "#1a1220", sw: 2 });
    const blink = this.invuln > 0 && Math.floor(time * 16) % 2;
    if (!blink) { // speargun in hand along the aim, then the diver rotated to the swim direction
      if (under && !this.harp) { const ax = Math.cos(this.aim) * this._scale(), ay = Math.sin(this.aim) * VS, n = Math.hypot(ax, ay) || 1; c.strokeStyle = "#5a5f6a"; c.lineWidth = 2; c.beginPath(); c.moveTo(px + ax / n * 3, py + ay / n * 3); c.lineTo(px + ax / n * 11, py + ay / n * 11); c.stroke(); c.lineWidth = 1; }
      diver(c, px, py, p.face, p.phase, Math.hypot(p.vx, p.vd) / this.swim, { grab: !!this.harp, tilt: this.tilt * p.face, basket: this.cap ? this.hold.length / this.cap : 0 }); }
    this.drawDark(c, time); // Tầng chạng vạng / Vực thẳm: darkness with a light around the diver (+ flashlight cone)
    this.ps.draw(c, 0, 0);
    for (const q of this.sinks) { // thrown-out items sinking / drifting away from the diver
      c.save(); c.globalAlpha = clamp(q.life, 0, 1); c.translate(Math.round(this._sx(q.x)), Math.round(this._sy(q.d))); c.rotate(q.rot); c.drawImage(icon(q.kind), -5, -5, 10, 10); c.restore();
    }

    drawFloodFx(c, this.flood, W, H, this._sy(this.flood.c.min_depth), time); // flood streaks below 10 m
    // danger vignette
    if (this.danger > 0.01) {
      const g = c.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.75);
      g.addColorStop(0, "rgba(220,30,30,0)"); g.addColorStop(1, `rgba(200,10,10,${0.5 * this.danger * (0.6 + 0.4 * Math.sin(time * 10))})`);
      c.fillStyle = g; c.fillRect(0, 0, W, H);
    }
    if (this.flashHurt > 0) { this.flashHurt -= 0.016; }

    this.drawHUD(c, time);
    if (this.inv) this.drawInv(time);
    else if (this.tutTip) this.drawTutTip(time);
    if (this.result) this.drawResult(c, time);
    else if (this.hintT > 0 && !this.started && !this.inv) this.drawHint(c);
  }

  // darkness of the water at depth d (0 above 58 m → ZONES[2].dark in twilight → ZONES[3].dark in the abyss)
  darkAt(d) { const a = ZONES[2].dark, b = ZONES[3].dark; return d < 58 ? 0 : d < 68 ? a * (d - 58) / 10 : d < 100 ? a : d < 110 ? a + (b - a) * (d - 100) / 10 : b; }
  // darkness layer on a reused offscreen canvas: fill, cut a soft light circle around the diver (destination-out) and in
  // the abyss a flashlight cone along the aim; then glowing things (crystals, plankton, lure lights) on top
  drawDark(c, time) {
    const p = this.p, dk = this.darkAt(p.d) * (hcOn() ? 0.65 : 1); if (dk < 0.01) return; // high contrast: lighter darkness
    if (!this.darkCv) { this.darkCv = document.createElement("canvas"); this.darkCv.width = W; this.darkCv.height = H; }
    const g = this.darkCv.getContext("2d"), px = this._sx(p.x), py = this._sy(p.d), abyss = p.d >= 100, k = clamp((p.d - 100) / 10, 0, 1);
    g.globalCompositeOperation = "source-over"; g.clearRect(0, 0, W, H); g.fillStyle = `rgba(2,4,12,${dk})`; g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = "destination-out";
    const r1 = 120 - 45 * k, rg = g.createRadialGradient(px, py, 12, px, py, r1); rg.addColorStop(0, "rgba(0,0,0,1)"); rg.addColorStop(0.55, "rgba(0,0,0,.75)"); rg.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = rg; g.beginPath(); g.arc(px, py, r1, 0, TAU); g.fill();
    const ang = Math.atan2(Math.sin(this.aim) * VS, Math.cos(this.aim) * this._scale());
    if (abyss) { // flashlight cone
      g.save(); g.translate(px, py); g.rotate(ang);
      const lg = g.createLinearGradient(0, 0, 190, 0); lg.addColorStop(0, "rgba(0,0,0,.95)"); lg.addColorStop(0.7, "rgba(0,0,0,.6)"); lg.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = lg; g.globalAlpha = k; g.beginPath(); g.moveTo(4, -3); g.lineTo(190, -52); g.lineTo(190, 52); g.lineTo(4, 3); g.closePath(); g.fill(); g.restore(); g.globalAlpha = 1;
    }
    c.drawImage(this.darkCv, 0, 0);
    if (abyss) { c.save(); c.globalCompositeOperation = "lighter"; c.translate(px, py); c.rotate(ang); c.globalAlpha = 0.07 * k * (0.9 + 0.1 * Math.sin(time * 13)); c.fillStyle = "#fff0c0"; c.beginPath(); c.moveTo(4, -2); c.lineTo(170, -40); c.lineTo(170, 40); c.lineTo(4, 2); c.closePath(); c.fill(); c.restore(); }
    const ox = W / 2 - this.cam * this._scale(), sy0 = this._surfaceY();
    drawPlankton(c, ox, sy0, this._scale(), VS, time, W, H);
    this.ter.drawGlow(c, ox, sy0, this._scale(), VS, time, W, H);
    c.save(); c.globalCompositeOperation = "lighter"; // lure lights of the twilight species (so they can be spotted in the dark)
    for (const f of this.deep) { if (f.caught || !f.sp.glow) continue; const x = this._sx(f.x), y = this._sy(f.d); if (x < -20 || x > W + 20 || y < -20 || y > H + 20) continue;
      const a = 0.45 + 0.35 * Math.sin(time * 3 + f.phase); c.globalAlpha = a * 0.3; c.fillStyle = f.sp.glow; c.beginPath(); c.arc(x + f.face * 8, y - 2, 6, 0, TAU); c.fill(); c.globalAlpha = a; c.fillRect(Math.round(x + f.face * 8) - 1, Math.round(y - 3), 2, 2); }
    c.restore();
  }
  drawHUD(c, time) {
    const u = screen.ui, p = this.p, under = p.d > this.t.surface_depth;
    // "Thủy quái!" — purple screen border while a monster is within its detect radius
    const HC = hcOn();
    if (this.crocWarn > 0.01) { // icon + text + border (HC: thick yellow/black border, bigger icon, white outlined text)
      const a = this.crocWarn * (0.65 + 0.35 * Math.sin(time * 9));
      u.save();
      if (HC) { u.globalAlpha = Math.max(0.85, this.crocWarn); u.lineWidth = 10; u.strokeStyle = hcCol("outline", "#000"); u.strokeRect(5, 5, W - 10, H - 10); u.lineWidth = 5; u.strokeStyle = hcCol("warn", "#ffef00"); u.strokeRect(5, 5, W - 10, H - 10); }
      else { u.strokeStyle = `rgba(170,70,255,${a})`; u.lineWidth = 6; u.strokeRect(3, 3, W - 6, H - 6); }
      u.restore();
      const sz = HC ? 16 : 12, tw = measure("Thủy quái!", sz, 900), ix = W / 2 - tw / 2 - (HC ? 14 : 10), iy = HC ? 38 : 30;
      this.warnIcon(u, ix, iy, HC ? 1.5 : 1, HC ? hcCol("warn", "#ffef00") : "#b46cff", HC ? "#000" : "#1a0830", HC ? 1 : this.crocWarn);
      txt("Thủy quái!", W / 2, HC ? 44 : 34, HC ? { size: sz, align: "center", color: "#fff", weight: 900, stroke: "#000", sw: 5 } : { size: sz, align: "center", color: "#d9a6ff", weight: 900, stroke: "#1a0830", sw: 3, alpha: this.crocWarn });
    }
    // timer pill (colour change at ≤ 30 s)
    const mm = Math.floor(Math.ceil(this.time) / 60), ss = Math.ceil(this.time) % 60;
    const low = this.time <= 30;
    panel(W / 2 - 26, 4, 52, 15, { fill: "rgba(8,20,38,.8)", border: low ? "#ff6b6b" : "#f3d27a", r: 7 });
    txt(`${mm}:${String(ss).padStart(2, "0")}`, W / 2, 15, { size: 11, align: "center", color: low ? "#ff8a8a" : "#fff", weight: 900, alpha: low && this.time < 10 && Math.floor(time * 4) % 2 ? 0.5 : 1 });
    // oxygen (< 25 %: red + blink)
    const ox = 8, oy = 6, ow = 92, oh = 11, fr = this.oxy / this.oxyMax;
    const lowO = fr < 0.25, blinkO = lowO && Math.floor(time * 5) % 2;
    panel(ox, oy, ow, oh, HC ? { fill: "#000", border: hcCol("warn", "#ffef00"), r: 5 } : { fill: "rgba(4,16,30,.8)", border: lowO ? "#ff5a5a" : "#2a5a7a", r: 5 });
    const ocol = HC ? (lowO && blinkO ? hcCol("warn", "#ffef00") : "#ff2a2a") : lowO ? "#ff5a5a" : fr < 0.5 ? "#ffd23a" : "#4fd0ff";
    u.save(); u.globalAlpha = blinkO ? 0.45 : 1; u.beginPath(); u.roundRect(ox + 1.5, oy + 1.5, Math.max(0, (ow - 3) * fr), oh - 3, 4); u.clip();
    u.fillStyle = ocol; u.fillRect(ox, oy, ow, oh);
    u.fillStyle = "rgba(255,255,255,.3)"; u.fillRect(ox, oy + 1, ow, 2); u.restore();
    if (HC) { u.strokeStyle = hcCol("warn", "#ffef00"); u.lineWidth = 2; u.strokeRect(ox - 1, oy - 1, ow + 2, oh + 2); }
    txt("O₂", ox + 5, oy + 9, HC ? { size: 7, color: "#000", weight: 900, stroke: "#fff", sw: 2 } : { size: 7, color: "#dff4ff", weight: 900 });
    txt(Math.ceil(this.oxy) + "/" + this.oxyMax + "s", ox + ow - 4, oy + 9, HC ? { size: 7, color: "#000", align: "right", weight: 900, stroke: "#fff", sw: 2 } : { size: 7, color: "#fff", align: "right", weight: 900 });
    if (lowO && under && this.oxy > 0) txt("Sắp hết hơi!", ox + ow + 5, oy + (HC ? 11 : 9), HC ? { size: 11, color: "#fff", weight: 900, stroke: "#000", sw: 4 } : { size: 8, color: "#ff8a8a", weight: 900, stroke: "#1a1220", sw: 2, alpha: blinkO ? 0.55 : 1 });
    if (this.oxy <= 0 && under) txt("Hết hơi!", W / 2, H / 2 - 40, HC ? { size: 22, align: "center", color: "#fff", weight: 900, stroke: "#000", sw: 6 } : { size: 16, align: "center", color: "#ff5a5a", weight: 900, stroke: "#1a1220", sw: 3, alpha: 0.6 + 0.4 * Math.sin(time * 10) });
    // HP hearts + depth
    for (let i = 0; i < this.hpMax; i++) { const hx = ox + 6 + i * 12, hy = oy + oh + 8; this.heart(u, hx, hy, i < this.hp, time); }
    const zi = zoneIndex(p.d), Z = ZONES[zi];
    txt("Máu " + this.hp + "/" + this.hpMax, ox + 6, oy + oh + 24, { size: 7, color: "#ff6b6b", weight: 900, stroke: "#06101e", sw: 2 });
    { const dx = ox + 6 + this.hpMax * 12 + 4, lab = "↓ " + Math.round(p.d) + "m"; // depth meter + zone name (+ O₂ pressure)
      txt(lab, dx, oy + oh + 12, { size: 8, color: zi ? Z.col : "#fff3dc", weight: 900, stroke: "#06101e", sw: 2 });
      txt(Z.name + (Z.pressure > 1 ? " · O₂×" + Z.pressure : ""), dx + measure(lab, 8, 900) + 4, oy + oh + 12, { size: 7, color: Z.col, weight: 800, stroke: "#06101e", sw: 2 }); }
    // nearest dock: when the basket already holds the day's list, or O₂ runs low
    { const dh = this.dockHint(); if (dh) { const lowO2 = this.oxy < this.oxyMax * 0.35 && under, lab = "⚓ Bến gần nhất " + Math.round(dh.dist) + "m " + (dh.x > p.x + 1 ? "→" : dh.x < p.x - 1 ? "←" : "↑");
      panel(ox, oy + oh + 30, 128, 12, { fill: "rgba(8,20,38,.85)", border: lowO2 ? "#ff8a8a" : "#7dffb0", r: 5 });
      txt(lab, ox + 64, oy + oh + 39, { size: 7, align: "center", color: lowO2 ? "#ffb0b0" : "#c8ffd8", weight: 900 }); } }
    if (this.banner) this.drawBanner(u, time);
    // catch cooldown (harpoon in flight counts as busy)
    { const cdMax = this.t.catch_cooldown_s || 0.5, busy = !!this.harp, k = busy ? 0 : 1 - clamp(this.catchCd / cdMax, 0, 1);
      const cx = ox + 50, cy = oy + oh + 18; panel(cx, cy, 50, 9, { fill: "rgba(4,16,30,.8)", border: k >= 1 ? "#7dffb0" : "#5a6a7a", r: 4 });
      u.fillStyle = k >= 1 ? "#7dffb0" : "#ffd23a"; u.fillRect(cx + 1.5, cy + 1.5, 47 * k, 6);
      txt("Lao ⚔" + this.dmg + (k >= 1 ? " ✓" : "…"), cx + 25, cy + 7, { size: 7, align: "center", color: "#08131f", weight: 900 }); }
    // basket: one row for the contract's 12 slots, two rows once the "Giỏ lưới lớn" upgrade adds more
    const big = this.cap > 26; // 10× basket: newest items + a fill bar instead of one tiny square per slot
    const bw = 108, bx = W - bw - 6, by = 6, cap = big ? 10 : this.cap, rows = big ? 2 : cap > 12 ? 2 : 1, perRow = big ? 10 : Math.ceil(cap / rows);
    const slotw = (bw - 10) / perRow, ic = Math.min(10, slotw + 1), bh = 6 + rows * 10 - 1;
    panel(bx, by, bw, bh, { fill: "rgba(8,20,38,.8)", border: "#f3d27a", r: 6 });
    u.imageSmoothingEnabled = false;
    const off = big ? Math.max(0, this.hold.length - 10) : 0;
    if (big) { const k = this.hold.length / this.cap, fx = bx + 5, fy = by + 14, fw = bw - 10; u.fillStyle = "rgba(255,255,255,.1)"; u.fillRect(fx, fy, fw, 4); u.fillStyle = k >= 1 ? "#ff6b6b" : k > 0.8 ? "#ffd23a" : "#7dffb0"; u.fillRect(fx, fy, fw * Math.min(1, k), 4); }
    for (let i = 0; i < (big ? 10 : cap); i++) { const row = big ? 0 : Math.floor(i / perRow), col = i % perRow, sxx = bx + 5 + col * slotw, syy = by + 3 + row * 10; const hi = i + off; if (this.hold[hi]) { u.drawImage(icon(this.hold[hi]), sxx + (slotw - 1 - ic) / 2, syy + 4.5 - ic / 2, ic, ic); const it = this.items[hi]; if (it) { // v1.2 freshness bar / spoiled tint
        if (it.spoiled) { u.fillStyle = "rgba(90,90,90,.65)"; u.fillRect(sxx, syy, slotw - 1, 9); u.fillStyle = "#ff5a5a"; u.fillRect(sxx + 1, syy + 1, 2, 2); }
        freshBar(u, sxx, syy + 8, slotw - 1, 1.5, it.fresh, it.spoiled); } } else { u.fillStyle = "rgba(255,255,255,.08)"; u.fillRect(sxx, syy, slotw - 1, 9); } }
    { const [gx, gy, gw, gh] = this.bagRect; // clickable bag icon (I)
      panel(gx, gy, gw, gh, { fill: "rgba(58,36,20,.9)", border: "#f3d27a", r: 4 });
      u.fillStyle = "#c8955a"; u.fillRect(gx + 4, gy + 5, 7, 7); u.fillStyle = "#8a5a2a"; u.fillRect(gx + 5, gy + 3, 5, 2); u.fillRect(gx + 4, gy + 7, 7, 1);
      txt("I", gx + gw / 2, gy + gh + 8, { size: 7, align: "center", color: "#f3d27a", weight: 900 }); }
    { const nSp = this.items.filter((it) => it.spoiled).length;
      txt(`Giỏ ${this.hold.length}/${this.cap}` + (nSp ? ` · ${nSp} ươn` : ""), bx + bw / 2, by + bh + 9, { size: 7, align: "center", color: nSp ? "#ff9a9a" : this.hold.length >= this.cap ? "#ff8a8a" : "#cfe", weight: 900 }); }
    // basket by kind + the day's NEEDED list (collected / needed, ✓ when met)
    const have = {}; for (const k of this.hold) have[k] = (have[k] || 0) + 1;
    const kinds = this.need ? Object.keys(this.need) : Object.keys(have);
    for (const k of Object.keys(have)) if (!kinds.includes(k)) kinds.push(k);
    if (kinds.length) {
      const ly = by + bh + 13, lh = 11, ph = 12 + kinds.length * lh;
      panel(bx, ly, bw, ph, { fill: "rgba(8,20,38,.78)", border: "#7ac0ff", r: 6 });
      txt(this.need ? "CẦN LẤY HÔM NAY" : "TRONG GIỎ", bx + bw / 2, ly + 9, { size: 7, align: "center", color: "#9fd8ff", weight: 900 });
      kinds.forEach((k, i) => {
        const yy = ly + 12 + i * lh, n = have[k] || 0, need = this.need?.[k], met = need != null && n >= need;
        u.drawImage(icon(k), bx + 4, yy, 9, 9);
        txt(KIND_NAME[k] || k, bx + 16, yy + 8, { size: 7, color: met ? "#7dffb0" : "#fff", weight: 800 });
        const band = (this.t.fish_depths || {})[k]; if (band && !met) txt(`${band[0]}–${band[1]} m`, bx + 52, yy + 8, { size: 6, color: "#9fd8ff", weight: 700 });
        txt(need != null ? `${n}/${need}${met ? " ✓" : ""}` : "×" + n, bx + bw - 4, yy + 8, { size: 7, align: "right", color: met ? "#7dffb0" : need != null ? "#ffd23a" : "#cfe", weight: 900 });
      });
    }

    this.drawRadar(u, time);
    this.drawFloodHUD(u, time);
    // toasts near player
    const px = this._sx(p.x), py = this._sy(p.d);
    this.toasts.forEach((t, i) => txt(t.txt, px, py - 14 + t.y - (this.toasts.length - 1 - i) * 11, { size: 9, align: "center", color: t.col, weight: 900, stroke: "#1a1220", sw: 2.5, alpha: clamp(t.life, 0, 1) }));
    // controls hint (bottom)
    txt("WASD bơi · E hái/cập bến · Space/chuột: bắn lao · Shift bơi nhanh · I: túi đồ · Esc/P tạm dừng", W / 2, H - 5, { size: 7, align: "center", color: "rgba(255,255,255,.55)", weight: 700 });
  }
  // warning triangle with "!" (monster-near icon), centre-left at (x,y)
  warnIcon(u, x, y, k, fill, ink, a) {
    u.save(); u.globalAlpha = a; u.translate(Math.round(x), Math.round(y)); u.scale(k, k);
    u.fillStyle = ink; u.beginPath(); u.moveTo(0, -8); u.lineTo(8, 6); u.lineTo(-8, 6); u.closePath(); u.fill();
    u.fillStyle = fill; u.beginPath(); u.moveTo(0, -6); u.lineTo(6, 4.5); u.lineTo(-6, 4.5); u.closePath(); u.fill();
    u.fillStyle = ink; u.fillRect(-1, -3, 2, 4); u.fillRect(-1, 2, 2, 1.5); u.restore();
  }
  // Dòng lũ: warning banner (text + arrow icon, 2 s before) and the active pill "Dòng lũ ⇢ 6s"
  drawFloodHUD(u, time) {
    const fl = this.flood, warn = fl.warning();
    const arrow = (x, y, dir, col) => { u.save(); u.translate(x, y); u.scale(dir, 1); u.fillStyle = col; u.fillRect(-7, -2, 8, 4); u.beginPath(); u.moveTo(1, -6); u.lineTo(8, 0); u.lineTo(1, 6); u.closePath(); u.fill(); u.restore(); };
    if (warn) {
      const a = 0.7 + 0.3 * Math.sin(time * 10), y = 52;
      panel(W / 2 - 78, y - 13, 156, 20, { fill: "rgba(40,26,12,.9)", border: "#f0c870", r: 7, alpha: a });
      txt("Dòng lũ sắp tới! " + (warn > 0 ? "⇢" : "⇠"), W / 2 + 8, y + 1, { size: 10, align: "center", color: "#ffe9b8", weight: 900, stroke: "#1a1208", sw: 2, alpha: a });
      arrow(W / 2 - 64, y - 3, warn, "#f0c870");
    }
    if (fl.active) {
      const s = Math.ceil(fl.secondsLeft()), y = 22, under = this.p.d >= fl.c.min_depth;
      panel(W / 2 - 34, y, 68, 13, { fill: "rgba(40,26,12,.85)", border: under ? "#f0c870" : "#7a6a50", r: 6 });
      txt("Dòng lũ " + (fl.dir > 0 ? "⇢" : "⇠") + " " + s + "s", W / 2, y + 10, { size: 8, align: "center", color: under ? "#ffe9b8" : "#c4b08f", weight: 900 });
    }
    if (this.chanNow && this.p.d > DEEP.zone) txt(this.chanNow.vx ? "Dòng ngầm ⇢ đi nhanh!" : "Dòng trồi ↑", W / 2, H - 16, { size: 8, align: "center", color: "#f0d9a0", weight: 900, stroke: "#1a1208", sw: 2, alpha: 0.8 });
  }
  // edge-of-screen arrow + fish icon + distance to the nearest school of each needed kind that is off-screen
  // nearest dock hint (big map): { x, dist } when the basket has the needed items or O₂ is low (< 35 %, underwater), else null
  dockHint() {
    if (!this.hold.length || this.ended) return null;
    const lowO2 = this.oxy < this.oxyMax * 0.35 && this.p.d > this.t.surface_depth;
    if (!lowO2 && !(this.need && this.needMet())) return null;
    const nd = nearestDock(this.p.x); return { x: nd.x, dist: Math.hypot(nd.dist, this.p.d) };
  }
  // zone banner (3 s) when the diver enters another depth zone
  drawBanner(u, time) {
    const b = this.banner, Z = ZONES[b.i], a = clamp(Math.min(b.t / 0.3, (3 - b.t) / 0.6), 0, 1), y = 78;
    panel(W / 2 - 110, y - 18, 220, 34, { fill: "rgba(4,10,24,.82)", border: Z.col, r: 8, alpha: a });
    txt(Z.name.toUpperCase(), W / 2, y - 1, { size: 15, align: "center", color: Z.col, weight: 900, italic: true, stroke: "#06101e", sw: 3, alpha: a });
    txt(zoneTop(b.i) + "–" + Z.to + " m" + (Z.pressure > 1 ? " · O₂ hao ×" + Z.pressure : "") + (b.i >= 2 ? " · tối — đèn quanh người" : ""), W / 2, y + 11, { size: 7, align: "center", color: "#e8f4ff", weight: 800, alpha: a });
  }
  drawRadar(u, time) {
    const cx = W / 2, cy = H / 2, m = 22;
    for (const r of this.radarTargets()) {
      if (!r.f) continue;
      const tx = this._sx(r.f.x), ty = this._sy(r.f.d);
      if (tx >= 0 && tx <= W && ty >= 0 && ty <= H) continue; // on screen: no arrow
      const dx = tx - cx, dy = ty - cy, k = Math.min((W / 2 - m) / Math.abs(dx || 1e-6), (H / 2 - m) / Math.abs(dy || 1e-6));
      const ax = cx + dx * k, ay = cy + dy * k, ang = Math.atan2(dy, dx), a = 0.7 + 0.3 * Math.sin(time * 4);
      u.save(); u.globalAlpha = a;
      u.fillStyle = "rgba(8,20,38,.85)"; u.beginPath(); u.arc(ax, ay, 9, 0, TAU); u.fill(); u.strokeStyle = "#ffd23a"; u.lineWidth = 1; u.stroke();
      u.translate(ax, ay); u.rotate(ang); u.fillStyle = "#ffd23a"; u.beginPath(); u.moveTo(15, 0); u.lineTo(9, -4); u.lineTo(9, 4); u.closePath(); u.fill();
      u.restore(); u.save(); u.globalAlpha = a; u.imageSmoothingEnabled = false; u.drawImage(icon(r.kind), ax - 5, ay - 5, 10, 10); u.restore();
      txt(Math.round(r.dist) + "m" + (r.wait ? " · mọc " + Math.ceil(r.wait) + "s" : ""), ax, ay + (ay > cy ? -12 : 18), { size: 7, align: "center", color: "#ffe9b0", weight: 900, stroke: "#1a1220", sw: 2, alpha: a });
    }
    const dh = this.dockHint(); // nearest dock arrow (big map) when it is off screen
    if (dh) { const tx = this._sx(dh.x), ty = this._surfaceY();
      if (!(tx >= 0 && tx <= W && ty >= 0 && ty <= H)) {
        const dx = tx - cx, dy = ty - cy, k = Math.min((W / 2 - m) / Math.abs(dx || 1e-6), (H / 2 - m) / Math.abs(dy || 1e-6)), ax = cx + dx * k, ay = cy + dy * k, a = 0.75 + 0.25 * Math.sin(time * 5);
        u.save(); u.globalAlpha = a; u.fillStyle = "rgba(8,20,38,.9)"; u.beginPath(); u.arc(ax, ay, 9, 0, TAU); u.fill(); u.strokeStyle = "#7dffb0"; u.lineWidth = 1; u.stroke();
        u.translate(ax, ay); u.rotate(Math.atan2(dy, dx)); u.fillStyle = "#7dffb0"; u.beginPath(); u.moveTo(15, 0); u.lineTo(9, -4); u.lineTo(9, 4); u.closePath(); u.fill(); u.restore();
        txt("⚓", ax, ay + 3, { size: 9, align: "center", color: "#c8ffd8", weight: 900, alpha: a });
        txt("Bến " + Math.round(dh.dist) + "m", ax, ay + (ay > cy ? -12 : 18), { size: 7, align: "center", color: "#c8ffd8", weight: 900, stroke: "#1a1220", sw: 2, alpha: a }); } }
  }
  hpBar(c, x, y, w, hp, max, a = 1, label = null) {
    const bw = Math.round(w), bx = Math.round(x - bw / 2), by = Math.round(y);
    if (x < -40 || x > W + 40 || by < -10 || by > H) return;
    const k = hp / max; c.globalAlpha = a;
    R(c, bx - 1, by - 1, bw + 2, 5, "#1a1220"); R(c, bx, by, bw, 3, "#4a1c24"); R(c, bx, by, Math.round(bw * k), 3, k > 0.5 ? "#7dffb0" : k > 0.25 ? "#ffd23a" : "#ff5a5a");
    c.globalAlpha = 1;
    if (label) txt(label, x, by - 2, { size: 7, align: "center", color: "#ffb36b", weight: 900, stroke: "#1a1220", sw: 2, alpha: a });
  }

  // ---------------- inventory (I / bag icon): basket grid, throw items out ----------------
  // holdFrom[i] = deep species id for a rare catch, null otherwise; kept in step with hold (LIFO splices from the end)
  syncFrom() { const a = this.holdFrom; while (a.length < this.hold.length) a.push(null); if (a.length > this.hold.length) a.length = this.hold.length;
    const it = this.items; while (it.length < this.hold.length) it.push(newItem(this.hold[it.length], this.fresh)); if (it.length > this.hold.length) it.length = this.hold.length; }
  // v1.2: basket items lose gather_decay_per_s; "Ươn!" toast once when an item drops below spoiled_below
  decayHold(dt) {
    this.syncFrom();
    for (const it of decay(this.items, this.fresh.gather_decay_per_s, dt, this.fresh.spoiled_below)) this.toast("Ươn! " + (KIND_NAME[it.kind] || it.kind) + " " + it.id + " đã ươn", "#b0b0b0");
  }
  itemName(i) { const k = this.hold[i]; if (isPremiumKind(k)) { const nm = KIND_NAME[k] || k; return nm.charAt(0).toUpperCase() + nm.slice(1); }
    const id = this.holdFrom[i], sp = id && DEEP.species.find((s) => s.id === id); return sp ? sp.name : KIND_NAME[k] || k; }
  isRare(i) { return !!this.holdFrom[i] || isPremiumKind(this.hold[i]); }
  openInv() { this.syncFrom(); this.inv = { sel: Math.max(0, this.hold.length - 1), confirm: null, t: 0, msg: null, tutor: !this.tutDone() }; this.tossed = []; sfx("click"); }
  // ---- inventory tutorial (until the player has thrown an item out once; flag in save.tutorial.inventory) ----
  tutDone() { return !!save.tutorial?.inventory; }
  needMet() { if (!this.need) return true; const have = {}; for (const k of this.hold) have[k] = (have[k] || 0) + 1; for (const [k, n] of Object.entries(this.need)) if ((have[k] || 0) < n) return false; return true; }
  basketCoach(dt) {
    if (this.fullTipT > 0) this.fullTipT -= dt;
    if (this.ended || this.hold.length < this.cap - 2 || this.needMet()) return;
    if (!this.tutDone() && !this.tutShown) {
      this.tutShown = true; this.tutTip = { t: 0 }; sfx("ding");
      try { voiceLine("Út Sen", "Giỏ sắp đầy rồi! Mở túi đồ vứt bớt món không cần nghen!"); } catch (e) {}
    } else if (this.hold.length >= this.cap && !(this.fullTipT > 0)) { this.fullTipT = 20; this.toast("Giỏ đầy! I: mở túi → X vứt món không cần", "#ffd23a"); }
  }
  updateTutTip(dt, kI, eat) {
    const tp = this.tutTip; tp.t += dt;
    if (kI) { this.tutTip = null; return this.openInv(); }
    const anyK = this.keyAny || input.anyKey() || eat; this.keyAny = false;
    if (tp.t > 0.35 && anyK) { this.tutTip = null; sfx("click"); }
    else if (tp.t > 8) this.tutTip = null;
  }
  drawTutTip(time) {
    const u = screen.ui, [gx, gy, gw, gh] = this.bagRect, cx = gx + gw / 2, cy = gy + gh / 2, a = Math.min(1, this.tutTip.t * 4), pr = 14 + Math.sin(time * 6) * 2;
    u.save(); u.globalAlpha = a; u.fillStyle = "rgba(4,8,16,.62)"; u.beginPath(); u.rect(0, 0, W, H); u.arc(cx, cy, pr + 3, 0, TAU, true); u.fill("evenodd");
    u.strokeStyle = "#ffe14d"; u.lineWidth = 2; u.beginPath(); u.arc(cx, cy, pr, 0, TAU); u.stroke();
    u.globalAlpha = a * 0.4; u.beginPath(); u.arc(cx, cy, pr + 5 + Math.sin(time * 6) * 2, 0, TAU); u.stroke(); u.restore();
    const bx = W - 250, by = 52, bw = 228, bh = 46, bob = Math.sin(time * 5) * 2;
    u.save(); u.globalAlpha = a; u.strokeStyle = "#ffe14d"; u.lineWidth = 2; u.beginPath(); u.moveTo(bx + bw - 20, by); u.lineTo(cx - 4, cy + pr + 4 + bob); u.stroke();
    u.fillStyle = "#ffe14d"; u.beginPath(); u.moveTo(cx - 4, cy + pr + 2 + bob); u.lineTo(cx - 9, cy + pr + 10 + bob); u.lineTo(cx + 2, cy + pr + 9 + bob); u.closePath(); u.fill(); u.restore();
    panel(bx, by, bw, bh, { fill: "rgba(62,38,20,.96)", border: "#f3d27a", r: 7, alpha: a });
    txt("Út Sen: Giỏ sắp đầy!", bx + 8, by + 12, { size: 9, color: "#ffe14d", weight: 900, alpha: a });
    txt("Nhấn I để mở túi đồ → chọn món không cần → X để vứt", bx + 8, by + 25, { size: 7, color: "#fff", weight: 800, alpha: a });
    txt("(phím bất kỳ để đóng · I mở túi ngay)", bx + 8, by + 38, { size: 7, color: "rgba(255,240,200,.7)", weight: 700, alpha: a });
  }
  closeInv() {
    this.inv = null; sfx("click");
    if (!this.tossed.length) return;
    sfx("splash"); const p = this.p;
    this.tossed.forEach((kind, i) => this.sinks.push({ kind, x: p.x - p.face * 0.4, d: p.d, vx: -p.face * (0.6 + Math.random() * 0.8) + (Math.random() - .5) * 0.6, vd: -0.8 - i * 0.15, rot: 0, vr: (Math.random() - .5) * 5, life: 1.8 + i * 0.1 }));
    const sx = this._sx(p.x), sy = this._sy(p.d);
    for (let i = 0; i < 10; i++) this.ps.add({ x: sx, y: sy, vy: -14 - Math.random() * 10, vx: (Math.random() - .5) * 20, g: 0, wobble: 6, seed: Math.random() * 6, size: 1, life: 1, color: "rgba(220,245,255,.8)" });
    this.toast("Vứt bỏ " + this.tossed.length + " món", "#9fd8ff"); this.tossed = [];
  }
  // geometry shared by drawInv and clicks
  invGeo() { const pw = 300, ph = 222, px = W / 2 - pw / 2, py = 24, cols = 4, sw = 70, sh = 18; return { pw, ph, px, py, cols, sw, sh, gx: px + 10, gy: py + 24 }; }
  invTop() { const g = this.invGeo(), rows = Math.ceil(Math.max(this.hold.length, 1) / g.cols); return Math.max(0, Math.min(Math.floor((this.inv?.sel || 0) / g.cols) - 3, rows - 8)); }
  onClick(mx, my) {
    const [bx, by, bw, bh] = this.bagRect;
    if (this.result || this.ended) return;
    if (mx >= bx - 2 && mx <= bx + bw + 2 && my >= by - 2 && my <= by + bh + 10) { this.bagClick = true; this.clickEat = true; return; }
    if (this.tutTip) { this.clickEat = true; return; }
    if (!this.inv) return;
    this.clickEat = true; const g = this.invGeo();
    const col = Math.floor((mx - g.gx) / g.sw), row = Math.floor((my - g.gy) / (g.sh + 1)), i = (row + this.invTop()) * g.cols + col;
    if (col < 0 || col >= g.cols || row < 0 || row >= 8 || i >= this.hold.length) return;
    if (i === this.inv.sel) this.inv.clickThrow = true; else { this.inv.sel = i; this.inv.confirm = null; sfx("click"); }
  }
  updateInv(dt, toggle, kX, eat) {
    const v = this.inv; v.t += dt; if (v.msg) { v.msg.life -= dt; if (v.msg.life <= 0) v.msg = null; }
    if (toggle || input.hit("back")) return this.closeInv();
    this.syncFrom();
    const n = this.hold.length, cols = this.invGeo().cols, old = v.sel;
    if (n) {
      if (input.hit("left")) v.sel = Math.max(0, v.sel - 1);
      if (input.hit("right")) v.sel = Math.min(n - 1, v.sel + 1);
      if (input.hit("up") && v.sel - cols >= 0) v.sel -= cols;
      if (input.hit("down")) v.sel = Math.min(n - 1, v.sel + cols);
      if (v.sel !== old) { v.confirm = null; sfx("click"); }
    }
    const all = input.down("sprint") && input.hit("interact");
    const one = !all && (input.hit("interact") || (input.hit("confirm") && !eat) || kX || v.clickThrow);
    v.clickThrow = false;
    if (!n || !(all || one)) return;
    const kind = this.hold[v.sel], idx = all ? this.hold.map((k, i) => (k === kind ? i : -1)).filter((i) => i >= 0) : [v.sel];
    const rare = idx.some((i) => this.isRare(i));
    const key = (all ? "all:" : "one:") + v.sel;
    if (rare && v.confirm !== key) { v.confirm = key; sfx("hurt"); return; } // rare catch: press again to confirm
    v.confirm = null; this.throwOut(idx);
  }
  throwOut(idx) {
    const v = this.inv;
    for (const i of [...idx].sort((a, b) => b - a)) { this.tossed.push(this.hold[i]); this.hold.splice(i, 1); this.holdFrom.splice(i, 1); this.items.splice(i, 1); }
    sfx("bubble"); sfx("pick");
    if (!this.tutDone()) { save.tutorial = { ...(save.tutorial || {}), inventory: true }; persist(); }
    if (v) { v.sel = clamp(v.sel, 0, Math.max(0, this.hold.length - 1)); v.msg = { text: "Đã vứt " + (idx.length > 1 ? idx.length + " món" : "1 món") + " — giỏ còn " + this.hold.length + "/" + this.cap, life: 1.4 }; }
  }
  drawInv(time) {
    const u = screen.ui, v = this.inv, g = this.invGeo(), cap = this.cap;
    u.fillStyle = "rgba(4,8,16,.6)"; u.fillRect(0, 0, W, H);
    panel(g.px, g.py, g.pw, g.ph, { fill: "rgba(62,38,20,.96)", border: "#f3d27a", r: 8 });
    u.fillStyle = "rgba(255,220,150,.06)"; for (let y = g.py + 6; y < g.py + g.ph - 4; y += 6) u.fillRect(g.px + 4, y, g.pw - 8, 1); // wood grain
    txt("TÚI ĐỒ", g.px + 12, g.py + 16, { size: 12, color: "#f3d27a", weight: 900, italic: true, stroke: "#2a1408", sw: 3 });
    txt(`Giỏ ${this.hold.length}/${cap}`, g.px + g.pw - 12, g.py + 16, { size: 9, align: "right", color: this.hold.length >= cap ? "#ff8a8a" : "#ffe9b0", weight: 900 });
    u.imageSmoothingEnabled = false;
    const VR = 8, top = this.invTop(); // scrolling window of VR rows (the 10× basket doesn't fit on one panel)
    if (top > 0) txt("▲", g.px + g.pw - 10, g.gy + 6, { size: 8, align: "right", color: "#ffe14d", weight: 900 });
    if ((top + VR) * g.cols < Math.max(this.hold.length, 1)) txt("▼", g.px + g.pw - 10, g.gy + VR * (g.sh + 1) - 2, { size: 8, align: "right", color: "#ffe14d", weight: 900 });
    for (let i = top * g.cols; i < Math.min(cap, (top + VR) * g.cols); i++) {
      const col = i % g.cols, row = Math.floor(i / g.cols) - top, x = g.gx + col * g.sw, y = g.gy + row * (g.sh + 1), sel = i === v.sel && i < this.hold.length;
      const has = i < this.hold.length, rare = has && this.isRare(i), prem = has && isPremiumKind(this.hold[i]);
      panel(x, y, g.sw - 3, g.sh, { fill: sel ? "rgba(255,170,60,.32)" : has ? "rgba(30,18,8,.75)" : "rgba(30,18,8,.35)", border: sel ? "#ffe14d" : rare ? "#ffb36b" : "rgba(243,210,122,.3)", r: 3 });
      if (!has) continue;
      u.drawImage(icon(this.hold[i]), x + 3, y + 4, 10, 10);
      const it = this.items[i]; // v1.2: id · kind, fresh % with a bar; spoiled = grey + "ươn"
      if (it && it.spoiled) { u.fillStyle = "rgba(90,90,90,.55)"; u.fillRect(x + 1, y + 1, g.sw - 5, g.sh - 2); }
      let nm = (it ? it.id + " " : "") + (rare ? "★" : "") + this.itemName(i); if (nm.length > 14) nm = nm.slice(0, 13) + "…";
      txt(nm, x + 15, y + 8, { size: 7, color: it?.spoiled ? "#c8c8c8" : prem ? "#ffd23a" : rare ? "#ffb36b" : "#fff", weight: 800 });
      if (it) { freshBar(u, x + 15, y + 11, 26, 3, it.fresh, it.spoiled); txt(it.spoiled ? "ươn" : Math.floor(it.fresh) + "%", x + g.sw - 6, y + 16, { size: 7, align: "right", color: it.spoiled ? "#ff7a7a" : "#e8f0d8", weight: 900 }); }
    }
    if (!this.hold.length) txt("Giỏ trống", W / 2, g.gy + 14, { size: 9, align: "center", color: "rgba(255,255,255,.6)", weight: 800 });
    // summary by kind vs today's needed list
    const have = {}; for (const k of this.hold) have[k] = (have[k] || 0) + 1;
    const kinds = this.need ? Object.keys(this.need) : []; for (const k of Object.keys(have)) if (!kinds.includes(k)) kinds.push(k);
    const sy = g.gy + Math.min(VR, Math.ceil(cap / g.cols)) * (g.sh + 1) + 4, cw = Math.min(48, (g.pw - 20) / Math.max(1, kinds.length));
    txt(this.need ? "CẦN HÔM NAY" : "THEO LOẠI", g.px + 12, sy + 7, { size: 6, color: "#9fd8ff", weight: 900 });
    kinds.forEach((k, i) => {
      const x = g.px + 10 + i * cw, y = sy + 10, nh = have[k] || 0, need = this.need?.[k], met = need != null && nh >= need;
      u.drawImage(icon(k), x, y, 9, 9);
      txt(need != null ? `${nh}/${need}${met ? "✓" : ""}` : "×" + nh, x + 11, y + 8, { size: 7, color: met ? "#7dffb0" : need != null ? "#ffd23a" : "#cfe", weight: 900 });
    });
    const my = g.py + g.ph - 22;
    if (v.confirm && this.hold.length) txt(`Vứt cá hiếm ${this.itemName(v.sel)}${v.confirm.startsWith("all") ? " (cả loại)" : ""}? Nhấn lần nữa để xác nhận`, W / 2, my, { size: 8, align: "center", color: "#ffb36b", weight: 900, alpha: 0.7 + 0.3 * Math.sin(time * 8) });
    else if (v.msg) txt(v.msg.text, W / 2, my, { size: 8, align: "center", color: "#9fd8ff", weight: 900 });
    else if (this.hold.length) { const sel = this.items[v.sel], nSp = this.items.filter((it) => it.spoiled).length;
      if (sel?.spoiled) txt("Chọn: " + sel.id + " " + this.itemName(v.sel) + " — đã ươn, không nấu được: nên vứt bỏ (E/X)", W / 2, my, { size: 8, align: "center", color: "#ff9a9a", weight: 900 });
      else txt("Chọn: " + (sel ? sel.id + " " : "") + this.itemName(v.sel) + (sel ? " · tươi " + Math.floor(sel.fresh) + "%" : "") + (nSp ? ` · ${nSp} món ươn — nên vứt bỏ` : ""), W / 2, my, { size: 8, align: "center", color: nSp ? "#ffb0a0" : "#ffe9b0", weight: 800 }); }
    txt("←↑↓→ chọn · E/Enter/X: Vứt bỏ · Shift+E: vứt cả loại · I/Esc: đóng", W / 2, g.py + g.ph - 7, { size: 7, align: "center", color: "rgba(255,240,200,.75)", weight: 700 });
    if (v.tutor) { // first-time inline coach strip (until an item has been thrown out once)
      const ty = g.py + g.ph + 4, pz = 0.75 + 0.25 * Math.sin(time * 6);
      panel(W / 2 - 130, ty, 260, 16, { fill: "rgba(255,225,80,.95)", border: "#1a1220", r: 6, alpha: pz });
      txt("Hướng dẫn: ←↑↓→ chọn · X vứt · Shift+E vứt cả loại · I đóng", W / 2, ty + 11, { size: 8, align: "center", color: "#1a1220", weight: 900 });
    }
  }

  heart(u, x, y, full, time) {
    u.save(); u.translate(x, y); u.scale(0.95, 0.95);
    const beat = full && this.hp === 1 ? 1 + Math.sin(time * 8) * 0.12 : 1; u.scale(beat, beat);
    u.fillStyle = full ? "#ff2a2a" : "rgba(40,20,30,.75)";
    for (const [dx, dy, w, h] of [[-4, -3, 3, 3], [1, -3, 3, 3], [-5, 0, 10, 3], [-4, 3, 8, 2], [-2, 5, 4, 2]]) u.fillRect(dx, dy, w, h);
    if (full) u.fillStyle = "rgba(255,255,255,.6)", u.fillRect(-3, -2, 2, 2);
    u.restore();
  }
  drawHint(c) {
    const a = clamp(this.hintT, 0, 1);
    panel(W / 2 - 92, H / 2 - 20, 184, 40, { fill: `rgba(8,18,34,${0.85 * a})`, border: "#f3d27a", r: 6, alpha: a });
    txt("Lặn xuống bắt cá & hái bông", W / 2, H / 2 - 4, { size: 10, align: "center", color: "#fff", weight: 900, alpha: a });
    txt("Sông rộng " + MAP_WIDTH_M + " m, sâu " + MAP_DEPTH_M + " m · 3 bến ⚓ · canh O₂!", W / 2, H / 2 + 10, { size: 8, align: "center", color: "#ffd23a", weight: 700, alpha: a });
  }
  drawResult(c, time) {
    const r = this.result, k = clamp(r.t / 0.5, 0, 1);
    c.fillStyle = `rgba(4,10,22,${0.72 * k})`; c.fillRect(0, 0, W, H);
    const win = r.reason !== "fainted";
    if (win && r.t < 1.2) speedLines(screen.px, W / 2, H / 2, time, "rgba(255,220,120,.14)");
    const yc = H / 2 - 30;
    const title = r.reason === "fainted" ? "NGẤT XỈU!" : r.reason === "docked" ? "VỀ BẾN AN TOÀN" : "HẾT GIỜ";
    const col = r.reason === "fainted" ? "#ff5a5a" : "#7ee8ff";
    txt(title, W / 2, yc, { size: 26 * lerp(1.6, 1, k), align: "center", color: col, weight: 900, italic: true, stroke: "#1a1220", sw: 5, rot: -0.03 });
    if (r.reason === "fainted") txt("Hết máu — giỏ đã mất. Về bến sớm hơn lần sau!", W / 2, yc + 20, { size: 9, align: "center", color: "#ffb0b0", weight: 700 });
    else {
      const names = Object.keys(r.by), two = names.length > 6, rows = two ? Math.ceil(names.length / 2) : names.length, pw = two ? 320 : 200;
      panel(W / 2 - pw / 2, yc + 14, pw, 20 + rows * 11, { fill: "rgba(8,20,38,.9)", border: "#f3d27a", r: 4 });
      txt("GIỎ HÔM NAY", W / 2, yc + 26, { size: 8, align: "center", color: "#ffd23a", weight: 900 });
      names.forEach((kk, i) => { const col = two ? Math.floor(i / rows) : 0, cx = two ? W / 2 - pw / 2 + 8 + col * (pw / 2) : W / 2 - 86, cw = two ? pw / 2 - 16 : 172, yy = yc + 38 + (i - col * rows) * 11, prem = isPremiumKind(kk);
        screen.ui.imageSmoothingEnabled = false; screen.ui.drawImage(icon(kk), cx, yy - 8, 9, 9); txt((prem ? "★ " : "") + KIND_NAME[kk], cx + 14, yy, { size: 8, color: prem ? "#ffd23a" : "#fff", weight: 700 }); txt("×" + r.by[kk], cx + cw, yy, { size: 8, align: "right", color: "#cfe", weight: 900 }); });
    }
    if (r.t > 0.8) txt(Math.floor(r.t * 2) % 2 ? "Enter: nấu quán →   R: lặn lại" : "", W / 2, H - 22, { size: 9, align: "center", color: "#fff", weight: 900 });
  }
}
