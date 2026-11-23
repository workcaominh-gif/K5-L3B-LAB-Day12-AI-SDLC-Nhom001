// Side-view drawing helpers for the night floating restaurant (nhà bè) in scene_quan.js.
// Everything draws on the low-res `px` canvas with integer rects so it reads as pixel art.
import { W, txt } from "./engine.js";
import { P, R, ghe, lantern, dishIcon, ripple } from "./art.js";

const TAU = Math.PI * 2;

// ---------- live décor preview / reveal animation (meta.previewDecor, action_cut.js) ----------
// The quán scene passes its own (stale while an overlay is open) décor values into these helpers. While decorFx.show is
// set (a preview or a purchase cut is running) the helpers draw decorFx.show instead, and add / hide the flower pieces
// the scene gates itself (pots / garland / arch), judged from what the scene drew on the previous frame.
// decorFx.anim = { slot, from, to, k: 0..1, revealX } animates one slot (lanterns light up left→right up to revealX,
// tablecloths unfurl, flowers bloom, the sign flips). decorFx.inject = false while action_cut.js draws its own diorama.
export const decorFx = { show: null, anim: null, inject: true };
// what the quán drew: stamp (performance.now() of the last raft frame), lantern xs, sign centre, rail / landing spots
export const raftSeen = { stamp: 0, lanterns: [], sign: null, rail: null, land: null, deckY: null, prev: { pots: false, garland: false, arch: false }, cur: { pots: false, garland: false, arch: false } };
const nowMs = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
export const raftLive = (ms = 250) => raftSeen.stamp > 0 && nowMs() - raftSeen.stamp < ms; // true while the quán raft is drawn behind us
const sceneCtx = () => decorFx.inject && decorFx.show;
const animOf = (slot) => (decorFx.anim && decorFx.anim.slot === slot ? decorFx.anim : null);
const easeBack = (t) => { t = Math.max(0, Math.min(1, t)); const c = 1.9; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; };
// bloom scale for a flower piece that needs level `lv`: grows in when a purchase cut crosses that level
function bloomK(lv) { const a = animOf("flowers"); return a && (a.from | 0) < lv && (a.to | 0) >= lv ? easeBack(a.k) : 1; }
function grown(c, x, y, k, fn) { if (Math.abs(k - 1) < 0.001) return fn(); if (k <= 0.01) return; c.save(); c.translate(x, y); c.scale(k, k); c.translate(-x, -y); fn(); c.restore(); }
// quán pot spots (scene_quan: X0 = DECK_L + 22 = 34, XS = 24, Y0 = front edge − 6, ZS = 6): contract x 6.6 / 11.1 / 15.3
// on the front edge (z .25) and one by Bà Tư (x .5, z 6.5)
function injectPots(c, t) {
  const yf = raftSeen.deckY ?? 244;
  [[6.6, 7, 0], [11.1, 7, 1], [15.3, 7, 2], [0.5, 45, 3]].forEach(([x, dy, k]) => flowerPotRaw(c, Math.round(34 + x * 24), yf - dy, t, k));
}

// ---------- depth scaling: draw into a scratch canvas, blit back nearest-neighbour ----------
let scratch = null;
const SW = 128, SH = 112, AX = 64, AY = 100; // anchor (feet) inside the scratch canvas
export function scaled(c, s, ax, ay, fn) {
  if (s >= 0.999) return fn(c, ax, ay);
  if (!scratch) { scratch = document.createElement("canvas"); scratch.width = SW; scratch.height = SH; }
  const sc = scratch.getContext("2d");
  sc.clearRect(0, 0, SW, SH); sc.imageSmoothingEnabled = false;
  fn(sc, AX, AY);
  c.imageSmoothingEnabled = false;
  c.drawImage(scratch, 0, 0, SW, SH, Math.round(ax - AX * s), Math.round(ay - AY * s), Math.round(SW * s), Math.round(SH * s));
}

// ---------- side-view chibi (faces right when face = 1) ----------
// o: { face, shirt, pants, hair, skin, hat, bun, apron, walk, sit, carry, arm: "stir"|"eat"|"wave"|"talk", t, angry,
//      band (headband colour), cap (cap colour), mustache, towel (towel over the shoulder colour) }
export function personSide(c, x, y, o = {}) {
  const f = o.face < 0 ? -1 : 1;
  const walk = o.walk || 0, moving = walk > 0 && !o.sit;
  const bob = moving ? (Math.abs(Math.sin(walk * 10)) > 0.6 ? 1 : 0) : 0;
  const Y = y - bob;
  const r = (dx, dy, w, h, col) => R(c, f === 1 ? x + dx : x - dx - w + 1, Y + dy, w, h, col);
  const skin = o.skin || P.skin, shirt = o.shirt || P.suit, pants = o.pants || "#2a2238", hair = o.hair || P.hair;
  c.fillStyle = "rgba(0,0,0,.28)"; c.beginPath(); c.ellipse(x, y, 6, 1.5, 0, 0, TAU); c.fill();
  if (o.sit) {
    r(-1, -6, 5, 2, pants); r(3, -4, 2, 3, pants); r(3, -1, 3, 1, P.ink);
  } else {
    const sw = moving ? Math.round(Math.sin(walk * 10) * 2) : 0;
    r(-2 - sw, -5, 2, 4, pants); r(-2 - sw, -1, 3, 1, P.ink);
    r(0 + sw, -5, 2, 4, pants); r(0 + sw, -1, 3, 1, P.ink);
  }
  // torso
  r(-3, -12, 7, 7, shirt); r(-3, -12, 1, 7, "rgba(0,0,0,.18)");
  if (o.apron) { r(0, -11, 4, 6, P.white); r(-3, -10, 7, 1, P.orange); }
  // arm
  const t = o.t || 0;
  if (o.carry) { r(1, -12, 3, 2, shirt); r(2, -19, 2, 7, skin); r(-3, -21, 9, 1, P.woodD); }
  else if (o.arm === "stir") { const k = Math.round(Math.sin(t * 6) * 1.5); r(1, -11, 3, 2, shirt); r(3, -10, 4, 2, skin); r(6 + k, -15, 1, 7, P.woodD); r(5 + k, -9, 3, 1, P.woodL); }
  else if (o.arm === "eat") { const k = Math.sin(t * 5) > 0 ? 1 : 0; r(1, -11, 3, 2, shirt); r(3, -10 - k, 4, 2, skin); r(6, -13 - k, 1, 4, P.straw); r(7, -13 - k, 1, 4, P.straw); }
  else if (o.arm === "wave") { const k = Math.sin(t * 8) > 0 ? 1 : 0; r(1, -12, 3, 2, shirt); r(3 + k, -18, 2, 6, skin); }
  else if (o.arm === "talk") { const k = Math.round(Math.sin(t * 5) * 1); r(1, -11, 3, 2, shirt); r(3, -12 + k, 3, 2, skin); r(5, -13 + k, 1, 2, skin); }
  else { const as = moving ? Math.round(Math.sin(walk * 10 + Math.PI)) : 0; r(-1 + as, -11, 2, 5, shirt); r(-1 + as, -6, 2, 1, skin); }
  // head
  r(-4, -21, 9, 9, skin); r(-4, -13, 9, 1, "rgba(0,0,0,.12)");
  if (o.hat) {
    c.fillStyle = P.straw; c.beginPath(); c.moveTo(x - 9, Y - 19); c.lineTo(x, Y - 29); c.lineTo(x + 10, Y - 19); c.closePath(); c.fill();
    R(c, x - 9, Y - 19, 20, 1, P.strawD); r(-5, -19, 3, 4, hair);
  } else {
    r(-5, -23, 10, 3, hair); r(-5, -21, 3, 6, hair); r(3, -21, 2, 2, hair);
    if (o.bun) { r(-8, -24, 4, 4, hair); r(-5, -22, 1, 1, o.bunTie || P.orange); }
  }
  if (o.towel) { r(-3, -12, 3, 2, o.towel); r(-3, -10, 2, 5, o.towel); }
  if (o.band) { r(-5, -21, 10, 2, o.band); r(-7, -20, 2, 3, o.band); }
  if (o.cap) { r(-5, -23, 10, 3, o.cap); r(4, -21, 4, 1, o.cap); r(-5, -21, 10, 1, "rgba(0,0,0,.2)"); }
  if (o.mustache) r(2, -15, 4, 1, o.hairCol || "#3a2a22");
  if (o.angry) { r(1, -19, 3, 1, P.ink); r(2, -17, 1, 1, P.ink); r(3, -14, 2, 1, P.redD); }
  else { r(2, -18, 1, 2, P.ink); r(3, -15, 1, 1, "#f07a7a"); }
  if (o.carry) c.drawImage(dishIcon(o.carry), x - 8 + f, Y - 37);
}

// ---------- furniture ----------
export function stool(c, x, y) {
  R(c, x - 4, y - 5, 8, 2, P.woodL); R(c, x - 4, y - 4, 8, 1, P.woodD);
  R(c, x - 3, y - 3, 1, 3, P.woodD); R(c, x + 2, y - 3, 1, 3, P.woodD);
}
export function sideTable(c, x, y, cloth = null) {
  c.fillStyle = "rgba(0,0,0,.25)"; c.beginPath(); c.ellipse(x, y, 16, 2, 0, 0, TAU); c.fill();
  R(c, x - 12, y - 11, 2, 11, P.woodD); R(c, x + 10, y - 11, 2, 11, P.woodD);
  R(c, x - 11, y - 5, 22, 1, P.woodD);
  R(c, x - 15, y - 14, 30, 2, P.woodL); R(c, x - 15, y - 12, 30, 2, P.woodD);
  R(c, x - 13, y - 14, 6, 1, "#d9a86a");
  if (cloth) tableCloth(c, x, y, cloth);
  // chopstick cup + chili jar
  R(c, x - 10, y - 18, 3, 4, "#c9c2d4"); R(c, x - 10, y - 21, 1, 3, P.straw); R(c, x - 8, y - 20, 1, 2, P.straw);
  R(c, x - 5, y - 17, 3, 3, P.red); R(c, x - 5, y - 18, 3, 1, "#f2efe6");
}
// clay stove (lò đất) with a wok, side view
export function clayStove(c, x, y, state, t) {
  c.fillStyle = "rgba(0,0,0,.3)"; c.beginPath(); c.ellipse(x, y, 16, 2.5, 0, 0, TAU); c.fill();
  R(c, x - 13, y - 18, 26, 18, "#9a4a30"); R(c, x - 14, y - 19, 28, 2, "#c06a45");
  R(c, x - 13, y - 3, 26, 3, "#6a2e1c"); R(c, x + 10, y - 17, 3, 14, "#7e3a25");
  R(c, x - 6, y - 12, 12, 9, P.ink); R(c, x - 4, y - 13, 8, 1, P.ink);
  const lit = state !== "idle";
  if (lit) {
    const fl = Math.round(Math.sin(t * 22) * 1);
    R(c, x - 5, y - 8 + fl, 10, 5, P.orange); R(c, x - 3, y - 11 - fl, 6, 4, P.yellow); R(c, x - 1, y - 12 + fl, 2, 2, "#fff6c8");
  } else { R(c, x - 5, y - 5, 10, 2, "#5a2018"); R(c, x - 3, y - 6, 2, 1, "#d9582a"); }
  R(c, x - 10, y - 5, 7, 2, P.woodD); R(c, x + 4, y - 4, 7, 2, P.wood);
  // wok
  R(c, x - 11, y - 22, 22, 3, "#3a3a44"); R(c, x - 12, y - 23, 24, 1, "#6a6a78"); R(c, x + 12, y - 23, 5, 1, P.woodD);
  if (state === "cooking") R(c, x - 7, y - 24 + (Math.sin(t * 9) > 0 ? 0 : 1), 14, 1, "#c97a52");
  if (state === "ready") R(c, x - 9, y - 24, 18, 1, P.gold);
}
// the pass: a small counter where finished dishes wait
export function passCounter(c, x, y) {
  c.fillStyle = "rgba(0,0,0,.25)"; c.beginPath(); c.ellipse(x, y, 14, 2, 0, 0, TAU); c.fill();
  R(c, x - 12, y - 15, 24, 15, P.wood); R(c, x - 13, y - 17, 26, 2, P.woodL);
  for (let i = -9; i < 12; i += 6) R(c, x + i, y - 14, 1, 13, P.woodD);
  R(c, x - 12, y - 1, 24, 1, P.woodD);
  R(c, x + 6, y - 20, 4, 3, P.gold); R(c, x + 7, y - 21, 2, 1, P.yellowD); // service bell
}
// back shelf + hanging pots behind the kitchen (x0..x1, standing on the back edge yb)
export function kitchenBack(c, x0, x1, yb, t) {
  const top = yb - 30;
  R(c, x0, top, x1 - x0, 30, "#4a2c18"); R(c, x0, top, x1 - x0, 2, P.woodL);
  R(c, x0, top + 14, x1 - x0, 2, P.woodL);
  const jar = ["#c97a52", "#e9cf8a", "#7a4fa0", "#3f9a4a", "#d94a3d", "#d4e8f2"];
  for (let i = 0, x = x0 + 4; x < x1 - 6; i++, x += 9) {
    const col = jar[i % jar.length];
    R(c, x, top + 7, 5, 7, col); R(c, x + 1, top + 5, 3, 2, col); R(c, x + 1, top + 4, 3, 1, P.woodD);
    if (i % 2) { R(c, x - 1, top + 22, 7, 6, "#8a6a3a"); R(c, x, top + 20, 2, 2, P.leafL); R(c, x + 3, top + 19, 2, 3, P.leaf); }
    else { R(c, x, top + 23, 5, 5, "#e8e2d0"); R(c, x, top + 23, 5, 1, "#a09a88"); }
  }
  // frame with hanging pots
  R(c, x0 + 2, top - 26, 2, 26, P.woodD); R(c, x1 - 4, top - 26, 2, 26, P.woodD);
  R(c, x0 + 2, top - 26, x1 - x0 - 4, 2, P.woodD);
  for (let i = 0, x = x0 + 12; x < x1 - 10; i++, x += 18) {
    const sw = Math.round(Math.sin(t * 1.5 + i) * 1);
    R(c, x, top - 24, 1, 4, "#2a2230");
    if (i % 3 === 0) { R(c, x - 5 + sw, top - 20, 11, 6, "#5a5a66"); R(c, x - 6 + sw, top - 20, 13, 1, "#8a8a96"); R(c, x + 6 + sw, top - 19, 3, 1, P.woodD); }
    else if (i % 3 === 1) { R(c, x + sw, top - 20, 1, 9, P.woodD); R(c, x - 2 + sw, top - 11, 5, 3, "#8a8a96"); }
    else { R(c, x - 4 + sw, top - 20, 9, 8, "#c97a52"); R(c, x - 4 + sw, top - 20, 9, 1, "#e8a070"); }
  }
}

// ---------- roof, posts, lantern strings ----------
export function roofAndPosts(c, xl, xr, yFront, t) {
  if (decorFx.inject) { raftSeen.stamp = nowMs(); raftSeen.prev = raftSeen.cur; raftSeen.cur = { pots: false, garland: false, arch: false }; raftSeen.lanterns = []; }
  // side posts (behind everything on the deck)
  R(c, xl, 16, 5, yFront - 16, P.woodD); R(c, xl + 1, 16, 1, yFront - 16, P.wood);
  R(c, xr - 5, 16, 5, yFront - 16, P.woodD); R(c, xr - 4, 16, 1, yFront - 16, P.wood);
  // thatch
  R(c, 0, 0, W, 13, "#5a3a1c");
  for (let x = 0; x < W; x += 3) { const h = 3 + ((x * 7) % 5); R(c, x, 11, 2, h, x % 2 ? P.strawD : "#a8834a"); R(c, x, 2 + (x * 5) % 8, 1, 3, "#7a5426"); }
  R(c, 0, 16, W, 3, "#3a2212"); R(c, 0, 16, W, 1, P.woodL);
}
// sagging string of lanterns from (x0,y0) to (x1,y0); returns lantern positions (for glows/reflections)
// décor lantern sets: [lantern colour, glow "r,g,b"]; "do" is the original red/orange/gold string
export const LANTERN_SETS = {
  do: [[P.red, "255,170,80"], [P.orange, "255,170,80"], ["#f3c454", "255,190,90"], [P.red, "255,160,80"]],
  vang: [["#f3c454", "255,205,110"], ["#ffd23a", "255,215,120"], ["#e9a23a", "255,190,90"]],
  xanh: [["#2fb8a8", "110,230,210"], ["#5fd6c4", "140,240,220"], ["#1a8f86", "90,210,200"]],
  bay_mau: [[P.red, "255,110,90"], [P.orange, "255,160,80"], ["#ffd23a", "255,220,110"], [P.leafL, "150,240,120"], ["#3fb6c4", "110,220,240"], ["#5a6ad8", "140,150,255"], ["#b060d0", "220,140,255"]],
};
export function lanternString(c, x0, x1, y0, sag, n, t, out, set = "do", phase = 0) {
  if (sceneCtx()) set = decorFx.show.lanterns ?? set;
  const an = animOf("lanterns");
  for (let x = x0; x <= x1; x++) { const u = (x - x0) / (x1 - x0); R(c, x, y0 + Math.round(sag * 4 * u * (1 - u)), 1, 1, "#2a1a12"); }
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n, x = Math.round(x0 + (x1 - x0) * u), y = y0 + Math.round(sag * 4 * u * (1 - u));
    if (decorFx.inject) raftSeen.lanterns.push(x);
    // purchase cut: unlit until the reveal sweep reaches this lantern, then it pops in with the new colour
    let st = set, lit = true, pop = 0;
    if (an) { st = an.to; const d = (an.revealX ?? 1e9) - x; lit = d >= 0; pop = lit && d < 24 ? 1 - d / 24 : 0; }
    const cols = LANTERN_SETS[st] || LANTERN_SETS.do;
    // bảy màu: colours chase slowly along the string
    const k = st === "bay_mau" ? (i + phase + Math.floor(t * 1.5)) % cols.length : (i + phase) % cols.length;
    if (!lit) { lantern(c, x, y, 0, "#3a2c2a"); continue; }
    if (pop > 0) grown(c, x, y + 4, 1 + pop * 0.5, () => lantern(c, x, y, t, cols[k][0])); else lantern(c, x, y, t, cols[k][0]);
    if (out) out.push([x, y + 7, pop > 0 ? 22 + pop * 26 : undefined, pop > 0 ? 0.1 + pop * 0.2 : undefined, cols[k][1]]);
  }
}
// additive warm glow
export function glow(c, x, y, r, a = 0.12, col = "255,170,80") {
  c.save(); c.globalCompositeOperation = "lighter";
  for (let k = 3; k >= 1; k--) { c.fillStyle = `rgba(${col},${a / k})`; c.beginPath(); c.arc(Math.round(x), Math.round(y), r * k / 3, 0, TAU); c.fill(); }
  c.restore();
}

// ---------- water ----------
export function nightWater(c, y0, y1, t, lights = [], moonX = null) {
  const h = y1 - y0;
  const cols = ["#1a2650", "#121c40", "#0b1330", "#070c22"];
  for (let i = 0; i < 4; i++) R(c, 0, y0 + Math.round(h * i / 4), W, Math.ceil(h / 4) + 1, cols[i]);
  c.fillStyle = "rgba(160,190,255,.18)";
  for (let i = 0; i < 46; i++) {
    const x = ((i * 59 + t * (5 + (i % 4) * 3)) % (W + 30)) - 15, y = y0 + 2 + ((i * 17) % Math.max(1, h - 3));
    c.fillRect(Math.round(x), Math.round(y), 2 + (i % 4), 1);
  }
  if (moonX != null) for (let y = y0 + 2, k = 0; y < y1; y += 3, k++) {
    const w = 3 + ((k * 7 + Math.floor(t * 3)) % 5); R(c, moonX - w / 2 + Math.round(Math.sin(t * 2 + k) * 2), y, w, 1, "rgba(246,241,214,.35)");
  }
  for (const [lx, top, len] of lights) for (let y = Math.max(y0, top) + 1, k = 0; y < Math.min(y1, top + len); y += 2, k++) {
    const w = 2 + ((k * 3 + Math.floor(t * 4 + lx)) % 4); R(c, lx - w / 2 + Math.round(Math.sin(t * 3 + k + lx) * 1.5), y, w, 1, `rgba(255,170,80,${0.45 - k * 0.03})`);
  }
}

// ---------- deck ----------
export function deck(c, xl, xr, yBack, yFront, t) {
  if (decorFx.inject) raftSeen.deckY = yFront;
  let y = yBack, row = 0;
  while (y < yFront) {
    const h = Math.min(6, 3 + Math.floor((y - yBack) / 18));
    R(c, xl, y, xr - xl, h, row % 2 ? "#a87a48" : "#b8874f");
    R(c, xl, y + h - 1, xr - xl, 1, "#7a5230");
    for (let k = xl + ((row * 23) % 41); k < xr; k += 41) R(c, k, y, 1, h - 1, "#7a5230");
    y += h; row++;
  }
  // warm wash
  c.fillStyle = "rgba(255,170,90,.06)"; c.fillRect(xl, yBack, xr - xl, yFront - yBack);
  // front beam + floats
  R(c, xl - 2, yFront, xr - xl + 4, 6, "#5e3a20"); R(c, xl - 2, yFront, xr - xl + 4, 1, P.woodL);
  for (let x = xl + 6; x < xr - 4; x += 30) R(c, x, yFront + 2, 2, 2, "#2a1a12");
  for (let x = xl + 2; x < xr - 10; x += 26) {
    R(c, x, yFront + 6, 22, 6, "#4a5a3a"); R(c, x, yFront + 6, 22, 1, "#6a7a4a"); R(c, x + 7, yFront + 6, 1, 6, "#2f3826"); R(c, x + 15, yFront + 6, 1, 6, "#2f3826");
  }
}
export function backRail(c, x0, x1, y) {
  if (decorFx.inject) raftSeen.rail = { x0, x1, y };
  R(c, x0, y - 12, x1 - x0, 2, P.woodD); R(c, x0, y - 12, x1 - x0, 1, P.wood);
  for (let x = x0 + 2; x < x1; x += 10) R(c, x, y - 10, 2, 10, P.woodD);
}
// gangway + mooring post at the right edge
export function landing(c, x, y, t) {
  R(c, x, y - 2, 16, 3, P.woodL); R(c, x, y + 1, 16, 1, P.woodD);
  R(c, x + 12, y - 22, 3, 26, P.woodD); R(c, x + 12, y - 22, 3, 1, P.woodL);
  R(c, x + 10, y - 10, 7, 1, P.straw);
  lantern(c, x + 13, y - 34, t, P.orange);
  if (decorFx.inject) raftSeen.land = { x, y };
  // preview / reveal: add the flower pieces the scene does not draw at its own (older) level
  if (sceneCtx()) {
    const fl = decorFx.show.flowers | 0, pv = raftSeen.prev;
    if (fl >= 2 && !pv.arch) flowerArchRaw(c, x - 6, 26, y, 40, t, bloomK(2));
    if (fl >= 1 && !pv.pots) injectPots(c, t);
  }
}
// small sampan; face -1 = bow pointing left
export function sampan(c, x, y, face, t, s = 0.7, o = {}) {
  c.save(); c.translate(Math.round(x), 0); if (face < 0) c.scale(-1, 1);
  ghe(c, 0, y, s, { roof: o.roof || null, hull: o.hull, beo: o.beo });
  c.restore();
  ripple(c, x - 14, y + 2, t, 0.3); ripple(c, x + 12, y + 2, t, 0.7);
}

// ---------- tiny bits ----------
export function steam(c, x, y, t, n = 3, h = 12) {
  for (let i = 0; i < n; i++) {
    const k = (t * 0.7 + i / n) % 1;
    c.globalAlpha = 0.55 * (1 - k);
    R(c, x - n + i * 2 + Math.round(Math.sin(k * 8 + i * 2) * 1.5), y - k * h, 1, 2, "#f4f0ff");
  }
  c.globalAlpha = 1;
}
export function smoke(c, x, y, t, n = 4) {
  for (let i = 0; i < n; i++) {
    const k = (t * 0.35 + i / n) % 1, r = 2 + k * 5;
    c.fillStyle = `rgba(150,140,160,${0.35 * (1 - k)})`;
    c.beginPath(); c.arc(Math.round(x + Math.sin(k * 5 + i) * 4 + k * 6), Math.round(y - k * 42), r, 0, TAU); c.fill();
  }
}
export function coin(c, x, y, spin) {
  const w = Math.max(1, Math.round(5 * Math.abs(Math.cos(spin))));
  R(c, x - w / 2, y - 2, w, 5, P.yellow); R(c, x - w / 2, y + 2, w, 1, P.yellowD);
  if (w > 2) R(c, x - 0.5, y - 1, 1, 3, P.yellowD);
}
export function moon(c, x, y) {
  c.fillStyle = "rgba(246,241,214,.08)"; c.beginPath(); c.arc(x, y, 16, 0, TAU); c.fill();
  c.fillStyle = "rgba(246,241,214,.12)"; c.beginPath(); c.arc(x, y, 11, 0, TAU); c.fill();
  c.fillStyle = "#f6f1d6"; c.beginPath(); c.arc(x, y, 7, 0, TAU); c.fill();
  R(c, x - 3, y - 2, 2, 2, "#ddd6b4"); R(c, x + 2, y + 2, 2, 1, "#ddd6b4");
}

// ---------- décor (Bà Tư's shop: meta.getDecor()) ----------
// tablecloth over the side table top: "tre" bamboo mat, "ca_ro" red/white check, "hoa" lotus-embroidered pink
export function tableCloth(c, x, y, kind) {
  if (sceneCtx()) kind = decorFx.show.cloth ?? kind;
  const an = animOf("cloth");
  if (an && an.k < 1) { // unfurl: the old cloth, then the new one sliding out left → right
    tableClothRaw(c, x, y, an.from);
    const w = Math.round(36 * Math.max(0, Math.min(1, an.k)));
    if (w > 0) { c.save(); c.beginPath(); c.rect(x - 18, y - 20, w, 14); c.clip(); tableClothRaw(c, x, y, an.to); c.restore(); R(c, x - 18 + w, y - 16, 1, 6, "rgba(255,255,255,.7)"); }
    return;
  }
  tableClothRaw(c, x, y, an ? an.to : kind);
}
function tableClothRaw(c, x, y, kind) {
  const top = y - 15;
  if (kind === "tre") {
    R(c, x - 14, top, 28, 3, "#d9bf7a");
    for (let i = -13; i < 14; i += 3) R(c, x + i, top, 1, 3, "#b39352");
    R(c, x - 14, top + 3, 28, 1, "#9a7a3e");
  } else if (kind === "ca_ro") {
    for (let i = 0; i < 16; i++) for (let j = 0; j < 3; j++) R(c, x - 16 + i * 2, top + j * 2, 2, 2, (i + j) % 2 ? "#f2efe6" : "#d94a3d");
    for (const dx of [-16, 14]) { R(c, x + dx, top + 6, 2, 4, (dx > 0) ? "#d94a3d" : "#f2efe6"); }
  } else if (kind === "hoa") {
    R(c, x - 16, top, 32, 5, "#ffd0de"); R(c, x - 16, top + 5, 32, 1, "#e0a0b8");
    R(c, x - 16, top + 6, 2, 4, "#ffd0de"); R(c, x + 14, top + 6, 2, 4, "#ffd0de");
    for (const dx of [-9, 1, 10]) { R(c, x + dx, top + 1, 3, 2, "#ff8fb1"); R(c, x + dx + 1, top, 1, 1, "#e0567f"); R(c, x + dx - 1, top + 3, 2, 1, P.leaf); }
  }
}
const BLOOM = ["#e0408a", "#ff6fb0", "#c42a78", "#ff9ccc"];
function blossom(c, x, y, t, i) {
  const sw = Math.round(Math.sin(t * 1.3 + i) * 0.6);
  R(c, x - 2 + sw, y - 1, 4, 3, BLOOM[i % 4]); R(c, x - 1 + sw, y - 2, 2, 1, BLOOM[(i + 1) % 4]); R(c, x + sw, y, 1, 1, "#fff0a8");
}
// terracotta pot of bougainvillea (bông giấy)
export function flowerPot(c, x, y, t, seed = 0) {
  if (decorFx.inject) raftSeen.cur.pots = true;
  if (sceneCtx() && (decorFx.show.flowers | 0) < 1) return;
  flowerPotRaw(c, x, y, t, seed);
}
function flowerPotRaw(c, x, y, t, seed = 0) {
  const g = bloomK(1); if (g < 0.999 || g > 1.001) return grown(c, x, y, g, () => flowerPotBody(c, x, y, t, seed));
  flowerPotBody(c, x, y, t, seed);
}
function flowerPotBody(c, x, y, t, seed) {
  c.fillStyle = "rgba(0,0,0,.25)"; c.beginPath(); c.ellipse(x, y, 7, 1.5, 0, 0, TAU); c.fill();
  R(c, x - 5, y - 7, 10, 7, "#b8582e"); R(c, x - 6, y - 8, 12, 2, "#d9743e"); R(c, x - 5, y - 2, 10, 2, "#8a3e20");
  R(c, x - 4, y - 14, 1, 6, P.leafD); R(c, x + 2, y - 15, 1, 7, P.leafD);
  for (let i = 0; i < 6; i++) {
    const dx = ((i * 5 + seed * 3) % 11) - 5, dy = -10 - ((i * 7 + seed) % 8);
    R(c, x + dx - 1, y + dy + 2, 3, 2, i % 2 ? P.leaf : P.leafD);
    blossom(c, x + dx, y + dy, t, i + seed);
  }
}
// bougainvillea arch over the gangway (x = left post, w = span, yb = deck level)
export function flowerArch(c, x, w, yb, h, t) {
  if (decorFx.inject) raftSeen.cur.arch = true;
  if (sceneCtx() && (decorFx.show.flowers | 0) < 2) return;
  flowerArchRaw(c, x, w, yb, h, t, bloomK(2));
}
function flowerArchRaw(c, x, w, yb, h, t, g = 1) {
  if (Math.abs(g - 1) > 0.001) return grown(c, x + w / 2, yb, g, () => flowerArchRaw(c, x, w, yb, h, t, 1));
  R(c, x, yb - h, 2, h, P.woodD); R(c, x + w - 2, yb - h, 2, h, P.woodD);
  for (let k = 0; k <= w; k++) { const u = k / w, yy = yb - h - Math.round(Math.sin(u * Math.PI) * 8); R(c, x + k, yy, 1, 2, P.woodD); }
  let i = 0;
  for (let yy = yb - 4; yy > yb - h; yy -= 5, i++) { R(c, x - 2, yy, 3, 2, P.leaf); blossom(c, x + 1, yy - 2, t, i); R(c, x + w - 2, yy + 2, 3, 2, P.leafD); blossom(c, x + w - 1, yy, t, i + 2); }
  for (let k = 2; k < w; k += 4, i++) { const u = k / w, yy = yb - h - Math.round(Math.sin(u * Math.PI) * 8); R(c, x + k - 1, yy + 1, 3, 2, P.leaf); blossom(c, x + k, yy - 1, t, i); }
}
// garland of blossoms along a beam (flowers level 2)
export function flowerGarland(c, x0, x1, y, t) {
  if (decorFx.inject) raftSeen.cur.garland = true;
  if (sceneCtx() && (decorFx.show.flowers | 0) < 2) return;
  flowerGarlandRaw(c, x0, x1, y, t);
}
function flowerGarlandRaw(c, x0, x1, y, t) {
  const g = bloomK(2); if (Math.abs(g - 1) > 0.001) return grown(c, (x0 + x1) / 2, y, g, () => flowerGarlandBody(c, x0, x1, y, t));
  flowerGarlandBody(c, x0, x1, y, t);
}
function flowerGarlandBody(c, x0, x1, y, t) {
  for (let x = x0, i = 0; x < x1; x += 7, i++) { R(c, x, y + (i % 2), 4, 2, i % 3 ? P.leaf : P.leafD); blossom(c, x + 2, y - 1 + (i % 2), t, i); }
}
// restaurant sign "QUÁN ĂN CHỢ NỔI": board on the pixel canvas, label on the UI layer (skip with label = false)
// style: "go" carved wood · "den_neon_tre" pink/cyan neon in a bamboo frame (flickers) · "son_mai" red lacquer, gold
export function quanSign(c, cx, y, style, t, label = true, text = "QUÁN ĂN CHỢ NỔI") {
  if (sceneCtx()) {
    style = decorFx.show.sign ?? style;
    // garland along the back rail (the scene draws it right after the sign when its own level is 2)
    const rl = raftSeen.rail;
    if ((decorFx.show.flowers | 0) >= 2 && !raftSeen.prev.garland && rl) flowerGarlandRaw(c, rl.x0 + 2, rl.x1 - 4, rl.y - 14, t);
  }
  if (decorFx.inject) raftSeen.sign = { cx, y };
  const an = animOf("sign");
  if (an && an.k < 1) { // flip around the horizontal axis: old face, edge-on at k = .5, new face
    const k = Math.max(0, Math.min(1, an.k)), sy = Math.max(0.06, Math.abs(Math.cos(k * Math.PI)));
    c.save(); c.translate(0, y + 7); c.scale(1, sy); c.translate(0, -(y + 7));
    const g = quanSignRaw(c, cx, y, k < 0.5 ? an.from : an.to, t, false, text);
    c.restore();
    return g;
  }
  return quanSignRaw(c, cx, y, an ? an.to : style, t, label, text);
}
function quanSignRaw(c, cx, y, style, t, label, text) {
  const w = 112, h = 15, x = Math.round(cx - w / 2);
  R(c, x + 14, y - 8, 1, 8, "#2a1a12"); R(c, x + w - 15, y - 8, 1, 8, "#2a1a12"); // hanging cords
  let col = "#ffe9c4", stroke = "#3a2210", glowCol = null;
  if (style === "den_neon_tre") {
    R(c, x - 2, y - 2, w + 4, h + 4, "#c4a35e"); R(c, x, y, w, h, "#120c1a");
    for (let k = x - 2; k < x + w + 2; k += 6) { R(c, k, y - 2, 1, 2, "#8a6a32"); R(c, k + 3, y + h, 1, 2, "#8a6a32"); }
    R(c, x - 2, y - 2, 2, h + 4, "#a8843e"); R(c, x + w, y - 2, 2, h + 4, "#a8843e");
    const flick = Math.sin(t * 23) > 0.96 ? 0.45 : 1;
    col = `rgba(255,140,210,${flick})`; stroke = `rgba(90,20,70,${0.9 * flick})`; glowCol = "255,110,200";
    c.save(); c.globalCompositeOperation = "lighter"; c.fillStyle = `rgba(255,110,200,${0.12 * flick})`; c.fillRect(x - 6, y - 6, w + 12, h + 12); c.restore();
    R(c, x + 3, y + h - 3, w - 6, 1, `rgba(120,230,255,${0.8 * flick})`);
  } else if (style === "son_mai") {
    R(c, x - 2, y - 2, w + 4, h + 4, "#1a0c0c"); R(c, x, y, w, h, "#8e1f1a"); R(c, x, y, w, 2, "#b8342a");
    R(c, x - 1, y - 1, w + 2, 1, P.gold); R(c, x - 1, y + h, w + 2, 1, P.gold); R(c, x - 1, y, 1, h, P.gold); R(c, x + w, y, 1, h, P.gold);
    R(c, x + 3, y + 3, 2, 2, P.gold); R(c, x + w - 5, y + 3, 2, 2, P.gold); R(c, x + 3, y + h - 5, 2, 2, P.gold); R(c, x + w - 5, y + h - 5, 2, 2, P.gold);
    col = "#ffd86a"; stroke = "#4a0e0a";
  } else { // gỗ
    R(c, x - 1, y - 1, w + 2, h + 2, "#3a2210"); R(c, x, y, w, h, P.wood); R(c, x, y, w, 1, P.woodL);
    for (let k = 0; k < 3; k++) R(c, x + 2, y + 4 + k * 4, w - 4, 1, "rgba(60,30,12,.35)");
    R(c, x + 2, y + 2, 2, 2, "#2a1a12"); R(c, x + w - 4, y + 2, 2, 2, "#2a1a12");
  }
  if (label) txt(text, cx, y + 11, { size: 8.5, align: "center", color: col, weight: 900, stroke, sw: 2.5 });
  return glowCol;
}
