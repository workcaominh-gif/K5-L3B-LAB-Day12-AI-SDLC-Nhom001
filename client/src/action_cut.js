// Action cutscenes (GUI only, "Sáng tạo của nhóm"): short (2.5–6 s), skippable mini-scenes that celebrate a player action —
// hiring / training staff, buying décor, buying gear, claiming a chore reward. They play as an overlay on top of whatever
// is on screen (the scene behind stays frozen because the overlay that triggered them is open), queue when several fire,
// and follow docs/design/cutscene-study.md §3: a hold beat before the payoff, zoom punch + flash at the payoff, a backdrop
// swap for reactions, and every scene ends on a reward token (paper card + red seal + "use it now" button). The first
// play of each kind is the FULL version; repeats play a 2-beat SHORT version. Skipping still flashes the reward card.
//
// API
//   playAction(kind, data)   queue a cut: "hire" {id} · "train" {id} · "decor" {slot, from, to} · "gear" {name, stat, glyph, cta}
//                            · "chore" {title, money, rep}. Returns false when cuts are switched off.
//   pumpActionCut(dt[, host]) call at the top of an overlay's update(); true = a cut consumed this frame (skip your own input)
//   drawActionCut()          call at the end of an overlay's draw()
//   actionCutActive()        a cut is playing or queued
//   cutsEnabled() / setCutsEnabled(on) / toggleCuts()   "Cảnh cắt ngắn: Bật/Tắt" (localStorage "chonoi.actionCuts")
//   drawRaftThumb(u, x, y, w, h)  live mini raft (preview-aware décor) for places where the real raft is not visible
// Hosts wired here: Bà Tư's dialog (batu.js), the phone (phone.js), Chợ Chú Sáu pop-up (shop_popup.js).
import { W, H, screen, clamp, lerp, ease, txt, panel } from "./engine.js";
import { Cutscene, slamText, speedLines, halftone, confetti, sparkles, coinRain, comicSplit, bubble, drawAura } from "./cutscene.js";
import { sfx, voiceLine } from "./audio.js";
import { portrait, P, R, lantern } from "./art.js";
import { decorFx, raftSeen, raftLive, roofAndPosts, backRail, deck, quanSign, flowerGarland, sideTable, stool, flowerPot,
  flowerArch, landing, lanternString, glow, personSide, LANTERN_SETS } from "./raft.js";
import * as meta from "./meta.js";

// ---------------- settings + "seen" (full first time, short after) ----------------
const KEY = "chonoi.actionCuts", SEEN = "chonoi.actionCutsSeen";
const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
let enabled = lsGet(KEY) !== "off";
let seen = (() => { try { return new Set(JSON.parse(lsGet(SEEN) || "[]")); } catch (e) { return new Set(); } })();
export const cutsEnabled = () => enabled;
export function setCutsEnabled(on) { enabled = !!on; lsSet(KEY, enabled ? "on" : "off"); if (!enabled) { queue = []; } return enabled; }
export const toggleCuts = () => setCutsEnabled(!enabled);
function firstTime(key) { if (seen.has(key)) return false; seen.add(key); lsSet(SEEN, JSON.stringify([...seen])); return true; }
export function resetSeen() { seen = new Set(); lsSet(SEEN, "[]"); } // tests / "xem lại"

// ---------------- queue ----------------
let queue = [], cur = null, mainHosted = false;
export const stats = { started: 0, finished: 0, skipped: 0, byKind: {} };
const OPTS = { layer: "ui", overlay: true, skipAny: true, bars: 14, hint: "Bấm phím bất kỳ để bỏ qua" };
export function playAction(kind, data = {}) {
  if (!enabled || !BUILD[kind]) return false;
  queue.push({ kind, data, at: nowMs() });
  return true;
}
const nowMs = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
export const actionCutActive = () => !!cur || queue.length > 0;
export const actionCutKind = () => cur?.kind || null;
// host = "main" marks a top-level host (main.js hook) so gameplay events (e.g. chore done mid-dive) may queue cuts too
export function pumpActionCut(dt, host) {
  if (host === "main") mainHosted = true;
  if (!cur) {
    // drop stale entries that were queued with no host pumping (e.g. a debug call), so they never pop up much later
    queue = queue.filter((q) => nowMs() - q.at < 4000);
    const q = queue.shift(); if (!q) return false;
    if (!enabled) { queue = []; return false; }
    startCut(q);
  }
  const c = cur;
  // entries waiting behind a playing cut are not stale: a host is pumping, so keep their clock fresh
  for (const q of queue) q.at = nowMs();
  try { c.def.tick?.(c.cs, dt); c.cs.update(dt); } catch (e) { console.warn("action cut", e); c.cs.done = true; }
  if (c.cs.done) endCut(c);
  return true; // also true on the finishing frame, so the key that skipped is not reused by the host
}
export function drawActionCut() {
  if (!cur) return;
  const u = screen.ui;
  u.save();
  try { cur.cs.draw(); } catch (e) { console.warn("action cut draw", e); }
  u.restore();
}
export const hostedByMain = () => mainHosted;
function startCut(q) {
  const full = firstTime(q.kind + ":" + (q.data.id || q.data.slot || ""));
  const def = BUILD[q.kind](q.data, full);
  const c = { kind: q.kind, data: q.data, def, full };
  c.cs = new Cutscene(def.steps, null, OPTS);
  cur = c; stats.started++; stats.byKind[q.kind] = (stats.byKind[q.kind] || 0) + 1;
}
function endCut(c) {
  if (c.cs.skipped) stats.skipped++;
  stats.finished++;
  try { c.def.end?.(); } catch (e) {}
  if (cur === c) cur = null;
}
// test helper: finish everything now
export function skipAllCuts() { if (cur) { cur.cs.done = true; endCut(cur); } queue = []; }

// ---------------- the raft view: live px capture (quán behind) or our own diorama ----------------
let dio = null;
function dioCanvas() {
  if (dio) return dio;
  try { const cv = document.createElement("canvas"); cv.width = W; cv.height = H; const g = cv.getContext("2d"); if (!g) return null; g.imageSmoothingEnabled = false; dio = { cv, g }; } catch (e) { dio = null; }
  return dio;
}
const STRINGS = [[104, 232, 19, 14, 5, 0], [248, 372, 19, 14, 5, 2], [18, 98, 54, 6, 3, 1], [380, 436, 44, 8, 2, 3]];
export const LANTERN_XS = STRINGS.flatMap(([x0, x1, , , n]) => Array.from({ length: n }, (_, i) => Math.round(x0 + (x1 - x0) * ((i + 0.5) / n)))).sort((a, b) => a - b);
const DIO_TABLES = [176, 264, 352];
// our own night raft (same geometry as the quán scene), drawn with the raft.js helpers; d = décor values to show
function drawDiorama(c, t, d) {
  const prevInject = decorFx.inject; decorFx.inject = false;
  try {
    const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#070b1f"); g.addColorStop(0.45, "#16224a"); g.addColorStop(1, "#0b1530");
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    for (let y = 120; y < H; y += 5) R(c, (y * 37 + Math.floor(t * 8)) % 60 - 30, y, W + 60, 1, "rgba(120,150,220,.08)");
    roofAndPosts(c, 12, 440, 244, t);
    backRail(c, 150, 436, 172);
    deck(c, 12, 436, 172, 244, t);
    R(c, 16, 120, 130, 52, "#3a2414"); R(c, 16, 120, 130, 2, P.woodL); // kitchen wall
    const lights = [];
    const sg = quanSign(c, 80, 96, d.sign, t, false); if (sg) lights.push([80, 103, 40, 0.06, sg]);
    if ((d.flowers | 0) >= 2) flowerGarland(c, 152, 432, 158, t);
    landing(c, 436, 214, t);
    if ((d.flowers | 0) >= 2) flowerArch(c, 430, 26, 214, 40, t);
    for (const x of DIO_TABLES) { stool(c, x - 19, 222); stool(c, x + 19, 222); sideTable(c, x, 222, d.cloth); }
    if ((d.flowers | 0) >= 1) [[192, 237, 0], [300, 237, 1], [401, 237, 2], [46, 199, 3]].forEach(([x, y, k]) => flowerPot(c, x, y, t, k));
    for (const [x0, x1, y0, sag, n, ph] of STRINGS) lanternString(c, x0, x1, y0, sag, n, t, lights, d.lanterns, ph);
    for (const L of lights) glow(c, L[0], L[1], L[2] || 22, L[3] || 0.1, L[4]);
  } finally { decorFx.inject = prevInject; }
}
const signCol = (st) => (st === "den_neon_tre" ? "#ff8cd2" : st === "son_mai" ? "#ffd86a" : "#ffe9c4");
// draws the raft (live capture of the quán when it is behind us, else the diorama) on the UI layer with a camera:
// focus (fx, fy) in raft pixels at zoom zz
function raftView(c, t, fx = W / 2, fy = H / 2, zz = 1) {
  const live = raftLive() && screen.pc;
  let src = null;
  if (live) src = screen.pc;
  else { const D = dioCanvas(); if (D) { D.g.clearRect(0, 0, W, H); drawDiorama(D.g, t, meta.getDecor()); src = D.cv; } }
  zz = Math.max(1, zz);
  fx = clamp(fx, W / (2 * zz), W - W / (2 * zz)); fy = clamp(fy, H / (2 * zz), H - H / (2 * zz));
  c.save(); c.imageSmoothingEnabled = false;
  c.fillStyle = "#070b1f"; c.fillRect(0, 0, W, H);
  c.translate(Math.round(W / 2 - fx * zz), Math.round(H / 2 - fy * zz)); c.scale(zz, zz);
  if (src) { try { c.drawImage(src, 0, 0, W, H); } catch (e) {} }
  // the sign's label lives on the UI layer in the quán (hidden while an overlay is open): redraw it here
  const sg = live ? raftSeen.sign : { cx: 80, y: 96 };
  const an = decorFx.anim, flipping = an && an.slot === "sign" && an.k < 1;
  if (sg && !flipping) txt("QUÁN ĂN CHỢ NỔI", sg.cx, sg.y + 11, { size: 8.5, align: "center", color: signCol(meta.getDecor().sign), weight: 900, stroke: "#2a1208", sw: 2.5 });
  c.restore();
}
// small live raft for the phone / dock (preview-aware décor)
export function drawRaftThumb(u, x, y, w, h, t = nowMs() / 1000) {
  const D = dioCanvas();
  panel(x - 2, y - 2, w + 4, h + 4, { fill: "#070b1f", border: "#f3d27a", r: 4, bw: 1.2 });
  if (!D) return;
  D.g.clearRect(0, 0, W, H); drawDiorama(D.g, t, meta.getDecor());
  // crop the interesting band of the raft (y 0..250) to the box's aspect
  const sh = Math.min(250, W * h / w), sw = sh * w / h, sx = (W - sw) / 2;
  u.save(); u.imageSmoothingEnabled = false;
  try { u.drawImage(D.cv, sx, 250 - sh, sw, sh, x, y, w, h); } catch (e) {}
  u.restore();
  if (meta.previewing()) {
    const pulse = 0.75 + 0.25 * Math.sin(t * 5);
    panel(x + 3, y + 3, 44, 11, { fill: `rgba(181,70,46,${pulse})`, border: "#fff", r: 3, bw: 0.8 });
    txt("XEM THỬ", x + 25, y + 11, { size: 7, align: "center", color: "#fff", weight: 900 });
  }
}

// ---------------- shared drawing bits ----------------
const STAFF_LOOK = {
  waiter: { shirt: "#e84a5a", pants: "#2a3a5a", hair: "#1a1218", cap: "#2a8f5a" },
  cook: { shirt: "#f2efe6", pants: "#3a3a44", hair: "#2a1d2b", band: P.red, mustache: true, towel: "#9fd8ff" },
};
function chibiBig(c, id, x, y, s, t, o = {}) { c.save(); c.translate(Math.round(x), Math.round(y)); c.scale(s, s); personSide(c, 0, 0, { face: o.face ?? 1, ...STAFF_LOOK[id], arm: o.arm, t, walk: o.walk || 0 }); c.restore(); }
function portraitAt(c, key, x, y, S) { const img = portrait(key); c.save(); c.imageSmoothingEnabled = false; c.drawImage(img, Math.round(x), Math.round(y), img.width * S, img.height * S); c.restore(); return img; }
const decorIcon = (slot, id) => (c, x, y, s) => {
  s = slot === "sign" ? 0.5 : slot === "cloth" ? 1.6 : s;
  c.save(); c.translate(x, y); c.scale(s, s);
  if (slot === "lanterns") { const cols = LANTERN_SETS[id] || LANTERN_SETS.do; for (let i = 0; i < 3; i++) lantern(c, 3 + i * 6, 4 + (i % 2) * 2, 0, cols[i % cols.length][0]); }
  else if (slot === "cloth") { sideTable(c, 10, 22, id); }
  else if (slot === "flowers") { flowerPot(c, 10, 20, 0, 1); }
  else { c.translate(-46, 0); quanSign(c, 56, 4, id, 0, false); }
  c.restore();
};

// ---------------- the cuts ----------------
const ROLE = { waiter: { name: "BÉ TÍ", sub: "Chạy bàn mới!", colA: "#2f8f5b", colB: "#ffcf4a", line: "Dạ con chạy bàn lẹ lắm, bưng năm tô hổng đổ một giọt!" },
  cook: { name: "CHÚ BẢY", sub: "Phụ bếp mới!", colA: "#a33a2a", colB: "#f3d27a", line: "Bếp để Bảy lo, lửa lớn tay nhanh nghen con." } };
const BUILD = {
  // S1 — hiring: the new hand hops aboard (punch on landing) · hold · name-slam card · comic split with Bà Tư approving · token
  hire(d, full) {
    const id = d.id === "cook" ? "cook" : "waiter", R0 = ROLE[id], S = meta.STAFF[id], L = S.levels[1];
    const card = { name: R0.name, sub: R0.sub, tag: "★ NHÂN VIÊN MỚI", colA: R0.colA, colB: R0.colB, nameCol: "#fff", dur: full ? 2.2 : 1.8,
      art: (c, x, k, t) => { c.save(); c.globalAlpha = 0.35; chibiBig(c, id, x + 70, H + 4, 7, t); c.restore(); chibiBig(c, id, x + 62, H - 4, 7, t, { arm: "wave" }); } };
    const reward = { icon: (c, x, y, s) => chibiBig(c, id, x + 14, y + 32, 1.6, 0), label: "NHÂN VIÊN MỚI", name: `${S.short} · ${S.role}`, sub: `Công ${L.wage}k/ngày · ${L.desc}`, cta: "Vô làm!", seal: "NHẬN", dur: 1.4 };
    const split = (c, cs) => comicSplit(c, clamp((cs.t - (cs.v.splitAt ?? 99)) / 0.3, 0, 1), "#ffcf8a", R0.colA,
      (cc, b) => { portraitAt(cc, "ba", b.x + 30, b.y + b.h - 100, 5); bubble(cc, b.x + 120, b.y + 50, "Được! Mai đi làm sớm nghen.", { maxW: 110, size: 8.5 }); },
      (cc, b) => { chibiBig(cc, id, b.x + b.w - 70, b.y + b.h - 4, 5, cs.t, { face: -1, arm: "wave" }); bubble(cc, b.x + b.w - 90, b.y + 46, R0.line, { maxW: 120, size: 8, tail: "right" }); }, cs.t);
    const bg = (c, cs) => {
      const v = cs.v;
      if (v.splitAt != null) { c.fillStyle = "#14101c"; c.fillRect(0, 0, W, H); return split(c, cs); }
      raftView(c, cs.t, 380, 190, 1.6);
      const hk = clamp(v.hop || 0, 0, 1), hx = lerp(W + 30, W * 0.62, hk), hy = H - 40 - Math.sin(hk * Math.PI) * 60;
      chibiBig(c, id, hx, hy, 3, cs.t, { face: -1, walk: hk < 1 ? cs.t : 0 });
      if (v.bang) txt("!", hx, hy - 90, { size: 26, align: "center", color: "#ffd23f", weight: 900, stroke: "#1a1220", sw: 4 });
    };
    const steps = full ? [
      { duck: 5.5, amt: 0.4 }, { bg }, { set: { hop: 0 } }, { sfx: "splash" },
      { tween: { hop: 1 }, dur: 0.6, ease: "out", wait: true }, { punch: 1.3 }, { shake: 2 },
      { set: { bang: 1 } }, { wait: 0.45 },                                                     // hold beat before the payoff
      { intro: card },
      { call: (cs) => { cs.v.splitAt = cs.t; voiceLine("Bà Tư", "Được! Mai đi làm sớm nghen."); } }, { stinger: "sting_win" }, { stinger: "jingle", arg: "hire" },
      { wait: 1.2 },
      { reward },
    ] : [{ duck: 3, amt: 0.4 }, { bg: (c) => { c.fillStyle = "#14101c"; c.fillRect(0, 0, W, H); } }, { intro: card }, { stinger: "jingle", arg: "hire" }, { reward: { ...reward, dur: 1.1 } }];
    return { steps };
  },
  // training to level 2: glow-up with a riser, punch, gold rays, "★★ LÊN NGHỀ!" band, sparkles, token
  train(d, full) {
    const id = d.id === "cook" ? "cook" : "waiter", S = meta.STAFF[id], L = S.levels[2];
    const bg = (c, cs) => {
      const g = clamp(cs.v.glow || 0, 0, 1);
      if (!cs.aura) { c.fillStyle = "#1a1030"; c.fillRect(0, 0, W, H); halftone(c, 0, 0, W, H, "rgba(255,210,63,.08)", 8); }
      c.save(); c.globalCompositeOperation = "lighter"; c.fillStyle = `rgba(255,220,120,${0.25 * g})`; c.beginPath(); c.arc(W / 2, H / 2 + 20, 60 + g * 30, 0, Math.PI * 2); c.fill(); c.restore();
      chibiBig(c, id, W / 2, H / 2 + 70, 5 + g, cs.t, { arm: g >= 1 ? "wave" : null });
      sparkles(c, W / 2, H / 2, cs.t, 14 + Math.round(g * 10), 120);
    };
    const reward = { icon: (c, x, y) => chibiBig(c, id, x + 14, y + 32, 1.6, 0), label: "LÊN BẬC 2", name: `${S.short} ★★`, sub: `${L.desc} · công ${L.wage}k/ngày`, cta: "Làm tiếp", seal: "GIỎI", dur: 1.3 };
    const title = { text: "★★ LÊN NGHỀ!", sub: `${S.short} · ${L.desc}`, color: "#ffd23f", dur: full ? 1.7 : 1.4 };
    const steps = full ? [
      { duck: 4.5, amt: 0.4 }, { bg }, { set: { glow: 0 } }, { stinger: "riser", arg: 1.2 },
      { tween: { glow: 1 }, dur: 0.8, wait: true },
      { wait: 0.3 }, { aura: "rays", col: "#e0a020" }, { punch: 1.25 }, { stinger: "sparkle" },
      { title }, { stinger: "jingle", arg: "level" },
      { reward },
    ] : [{ duck: 3, amt: 0.4 }, { bg }, { set: { glow: 1 } }, { aura: "rays", col: "#e0a020" }, { title }, { stinger: "sparkle" }, { reward: { ...reward, dur: 1.1 } }];
    return { steps };
  },
  // S2 — décor: push in on the raft, the new piece appears (lanterns light one by one with bells, cloths unfurl, flowers
  // bloom, the sign flips) while the camera pans, a short still, then a wide reveal + "Quán đẹp hẳn ra!" + token
  decor(d, full) {
    const slot = meta.DECOR[d.slot] ? d.slot : "lanterns", it = meta.decorItem(slot, d.to) || meta.DECOR[slot].items[0];
    const anim = { slot, from: d.from ?? meta.DECOR[slot].def, to: it.id, k: 0, revealX: -1e9 };
    const CAM = { lanterns: [[96, 40, 2.4], [384, 40, 2.4]], cloth: [[180, 200, 1.7], [330, 200, 1.7]], flowers: [[200, 205, 1.5], [420, 195, 1.8]], sign: [[80, 100, 2.8], [80, 100, 2.8]] }[slot];
    const xs = LANTERN_XS; let bell = 0, fxDone = false;
    const tick = (cs) => {
      const k = clamp(cs.v.ak || 0, 0, 1); anim.k = k;
      if (slot === "lanterns") {
        anim.revealX = lerp(xs[0] - 12, xs[xs.length - 1] + 2, k);
        while (bell < xs.length && xs[bell] <= anim.revealX) { sfx("bell" + Math.min(14, bell)); bell++; }
      } else if (!fxDone && k > 0.02) { fxDone = true; sfx(slot === "cloth" ? "unfurl" : slot === "sign" ? "flip" : "sparkle"); }
    };
    const bg = (c, cs) => {
      const v = cs.v; raftView(c, cs.t, v.fx, v.fy, v.zz);
      if (v.slam != null) {
        const k = clamp((cs.t - v.slam) / 0.25, 0, 1);
        sparkles(c, W / 2, H / 2 - 20, cs.t, 18, 200);
        slamText("Quán đẹp hẳn ra!", W / 2, H * 0.42, 26, { scale: lerp(2.2, 1, ease.out(k)), color: "#ffd23f", alpha: k });
      }
    };
    const pct = Math.round((meta.decorBonus() - 1) * 100);
    const reward = { icon: decorIcon(slot, it.id), label: "TRANG TRÍ MỚI", name: it.name, sub: `Khách kiên nhẫn hơn +${pct}%`, cta: "Xem quán", seal: "ĐẸP", dur: 1.5 };
    const [a, b] = CAM;
    const steps = full ? [
      { duck: 5, amt: 0.4 }, { call: () => meta.setDecorAnim(anim) }, { bg }, { set: { fx: W / 2, fy: H / 2, zz: 1, ak: 0 } },
      { tween: { fx: a[0], fy: a[1], zz: a[2] }, dur: 0.5, wait: true },
      { tween: { ak: 1, fx: b[0], fy: b[1], zz: b[2] }, dur: 1.4, ease: "inOut", wait: true },
      { wait: 0.4 },                                                                            // still beat before the payoff
      { tween: { fx: W / 2, fy: H / 2, zz: 1 }, dur: 0.3, ease: "out", wait: true },
      { punch: 1.12, sound: false }, { flash: "#ffe9b0", t: 0.15 }, { stinger: "sting_win" }, { stinger: "jingle", arg: "warm" },
      { call: (cs) => { cs.v.slam = cs.t; } }, { wait: 1.0 },
      { reward },
    ] : [
      { duck: 3, amt: 0.4 }, { call: () => meta.setDecorAnim(anim) }, { bg }, { set: { fx: W / 2, fy: H / 2, zz: 1, ak: 0 } },
      { tween: { ak: 1 }, dur: 0.9, wait: true }, { punch: 1.1, sound: false }, { stinger: "jingle", arg: "warm" },
      { call: (cs) => { cs.v.slam = cs.t; } }, { wait: 0.6 },
      { reward: { ...reward, dur: 1.1 } },
    ];
    return { steps, tick, end: () => meta.setDecorAnim(null) };
  },
  // S3 — gear: the item spins in on a riser, hold, backdrop swap + punch + title_hit, stats "O₂ 90 → 135 s", token
  gear(d, full) {
    const glyph = typeof d.glyph === "function" ? d.glyph : null, water = /oxy|O₂|phao|Máu|lao|vịt|giỏ|vợt/i.test((d.name || "") + (d.stat || ""));
    const drawItem = (c, x, y, s, spin) => {
      c.save(); c.translate(x, y); c.scale(Math.max(0.08, Math.abs(Math.cos(spin))) * s, s);
      if (glyph) { try { glyph(c, -5, -5); } catch (e) {} } else { R(c, -4, -5, 8, 10, "#3fb6c4"); }
      c.restore();
    };
    const bg = (c, cs) => {
      const v = cs.v, k = clamp(v.spin || 0, 0, 1);
      if (!cs.aura) { c.fillStyle = "#0b1a2a"; c.fillRect(0, 0, W, H); speedLines(c, W / 2, H / 2, cs.t, "rgba(120,220,255,.16)", 30); }
      c.save(); c.globalCompositeOperation = "lighter"; c.fillStyle = `rgba(160,240,255,${0.18 * k})`; c.beginPath(); c.arc(W / 2, H / 2 - 6, 54, 0, Math.PI * 2); c.fill(); c.restore();
      drawItem(c, W / 2, lerp(H + 60, H / 2 - 6, ease.out(k)), 5 + k * 3, (1 - k) * 9 + (v.stats ? cs.t * 0.8 : 0));
      if (v.stats != null) {
        const sk = clamp((cs.t - v.stats) / 0.25, 0, 1);
        slamText(d.name || "Đồ nghề mới", W / 2, 52, 22, { scale: lerp(2, 1, ease.out(sk)), color: "#fff", alpha: sk });
        if (d.stat) { panel(W / 2 - 90, H - 62, 180, 24, { fill: "rgba(10,20,40,.85)", border: "#7ee8ff", r: 4, alpha: sk }); txt(d.stat, W / 2, H - 45, { size: 13, align: "center", color: "#7ee8ff", weight: 900, alpha: sk }); }
      }
    };
    const reward = { icon: (c, x, y) => drawItem(c, x + 16, y + 16, 3, 0), label: water ? "ĐỒ LẶN MỚI" : "ĐỒ NGHỀ MỚI", name: d.name || "Đồ nghề", sub: d.stat || "", cta: d.cta || (water ? "Đeo ngay" : "Dùng ngay"), seal: "MỚI", dur: 1.4 };
    const steps = full ? [
      { duck: 5, amt: 0.35 }, { bg }, { set: { spin: 0 } }, { stinger: "riser", arg: 1.3 }, { sfx: "swish" },
      { tween: { spin: 1 }, dur: 1.0, ease: "out", wait: true },
      { wait: 0.3 },                                                                            // still beat: the riser lands next
      { aura: water ? "bubbles" : "rays", col: water ? "#1a6f8a" : "#b5462e" }, { punch: 1.25, sound: false }, { stinger: "title_hit" }, { shake: 4 },
      { call: (cs) => { cs.v.stats = cs.t; } }, { wait: 1.4 },
      { reward },
    ] : [
      { duck: 3, amt: 0.35 }, { bg }, { set: { spin: 0 } }, { tween: { spin: 1 }, dur: 0.5, ease: "out", wait: true },
      { aura: water ? "bubbles" : "rays", col: water ? "#1a6f8a" : "#b5462e" }, { punch: 1.2, sound: false }, { stinger: "title_hit" },
      { call: (cs) => { cs.v.stats = cs.t; } }, { wait: 1.0 }, { reward: { ...reward, dur: 1.1 } },
    ];
    return { steps };
  },
  // S4 — chore: Bà Tư inspects (stern hold + heartbeat) · ting · smile, lotus backdrop, punch, coins rain, "Giỏi lắm con!" · token
  chore(d, full) {
    const money = d.money | 0, rep = +d.rep || 0;
    const bg = (c, cs) => {
      const v = cs.v;
      if (!cs.aura) { c.fillStyle = "#2a1a14"; c.fillRect(0, 0, W, H); halftone(c, 0, 0, W, H, "rgba(255,200,140,.06)", 8, false); }
      const S = v.happy ? 6 : 5.4, img = portrait("ba");
      portraitAt(c, "ba", W * 0.3 - img.width * S / 2, H - img.height * S + 4, S);
      if (!v.happy) txt("…", W * 0.3 + 50, 70, { size: 20, color: "#fff", weight: 900 });
      if (v.happy != null) {
        const k = clamp((cs.t - v.happy) / 0.25, 0, 1);
        coinRain(c, cs.t - v.happy);
        slamText("Giỏi lắm con!", W * 0.66, H * 0.38, 26, { scale: lerp(2.2, 1, ease.out(k)), color: "#fff6c0", alpha: k });
        const cnt = Math.round(money * clamp((cs.t - v.happy - 0.2) / 0.6, 0, 1));
        txt(`+${cnt}k`, W * 0.66, H * 0.56, { size: 20, align: "center", color: "#ffd23f", weight: 900, stroke: "#3a1a08", sw: 4, alpha: k });
        if (rep) txt(`+${rep} uy tín`, W * 0.66, H * 0.56 + 20, { size: 11, align: "center", color: "#bff3ff", weight: 900, stroke: "#1a1220", sw: 3, alpha: k });
        confetti(c, W * 0.66, H * 0.45, cs.t - v.happy, 30);
      }
    };
    const reward = { icon: (c, x, y) => { R(c, x, y + 8, 30, 22, "#b8860b"); R(c, x + 2, y + 10, 26, 18, "#ffd23f"); R(c, x + 12, y + 12, 6, 14, "#fff3a8"); }, label: "PHẦN THƯỞNG", name: `+${money}k${rep ? ` · +${rep} uy tín` : ""}`, sub: d.title ? `Xong việc: ${d.title}` : "", cta: "Nhận", seal: "THƯỞNG", dur: 1.3 };
    const payoff = [{ aura: "lotus", col: "#ffcf8a" }, { set: { happy: 0 } }, { call: (cs) => { cs.v.happy = cs.t; voiceLine("Bà Tư", "Giỏi lắm con!"); } }, { punch: 1.2, sound: false },
      { stinger: "sting_win" }, { stinger: "coin_shower", arg: 1.2 }];
    const steps = full ? [
      { duck: 4.5, amt: 0.35 }, { bg }, { sfx: "pick" }, { wait: 0.3 },
      { sfx: "heartbeat" }, { wait: 0.8 },                                                      // the stern inspection (hold beat)
      { stinger: "bell", arg: 5 }, { flash: "#fff", t: 0.06 }, { wait: 0.2 },
      ...payoff, { wait: 1.2 },
      { reward },
    ] : [{ duck: 3, amt: 0.35 }, { bg }, ...payoff, { wait: 1.35 }, { reward: { ...reward, dur: 1.25 } }];
    return { steps };
  },
};
export const ACTION_KINDS = Object.keys(BUILD);
