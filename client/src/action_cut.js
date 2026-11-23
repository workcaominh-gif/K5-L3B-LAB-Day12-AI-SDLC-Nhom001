// Action cutscenes (GUI only, "Sáng tạo của nhóm"): skippable, over-the-top meme sketches in the Dave-the-Diver spirit
// (hammy, anime parody, self-aware) that celebrate a player action — hiring / training staff, buying décor, buying gear,
// claiming a chore reward, Bà Tư learning a new dish. Built from the meme kit (meme_fx.js: slowmo, vineboom, kanji, shades,
// freeze, airhorn, stonks, tears, ascend, saltbae, …). They play as an overlay on top of whatever is on screen (the scene
// behind stays frozen because the overlay that triggered them is open), queue when several fire, and every scene ends on a
// reward token (paper card + red seal + "use it now" button). The first play of each kind is the FULL sketch (5–8 s);
// repeats play a SHORT version (2.5–3.5 s) with the single funniest beat. Skipping still flashes the reward card.
//
// API
//   playAction(kind, data)   queue a cut: "hire" {id} · "train" {id} · "decor" {slot, from, to} · "gear" {name, stat, glyph, cta}
//                            · "chore" {title, money, rep} · "research" {id, name, price, recipe, cook_s}. Returns false when
//                            cuts are switched off.
//   pumpActionCut(dt[, host]) call at the top of an overlay's update(); true = a cut consumed this frame (skip your own input)
//   drawActionCut()          call at the end of an overlay's draw()
//   actionCutActive()        a cut is playing or queued
//   cutsEnabled() / setCutsEnabled(on) / toggleCuts()   "Cảnh cắt ngắn: Bật/Tắt" (localStorage "chonoi.actionCuts")
//   drawRaftThumb(u, x, y, w, h)  live mini raft (preview-aware décor) for places where the real raft is not visible
// Hosts wired here: Bà Tư's dialog (batu.js), the phone (phone.js), Chợ Chú Sáu pop-up (shop_popup.js).
import { W, H, screen, clamp, lerp, ease, txt, panel, measure, reduceMotion } from "./engine.js";
import { Cutscene, slamText, speedLines, halftone, confetti, sparkles, coinRain, comicSplit, bubble, drawAura } from "./cutscene.js";
import { sfx, voiceLine } from "./audio.js";
import { portrait, P, R, lantern, icon, dishIcon, KIND_NAME } from "./art.js";
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
export const actionCutScene = () => cur?.cs || null; // tests / debug: the playing Cutscene (card, memes, steps)
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
  // research: one "seen" flag for the whole kind (every dish is learned once, so a per-dish key would always play FULL)
  const full = firstTime(q.kind + ":" + (q.kind === "research" ? "" : (q.data.id || q.data.slot || "")));
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
function chibiBig(c, id, x, y, s, t, o = {}) { c.save(); c.translate(Math.round(x), Math.round(y)); c.scale(s, s); personSide(c, 0, 0, { face: o.face ?? 1, ...STAFF_LOOK[id], arm: o.arm, carry: o.carry, t, walk: o.walk || 0 }); c.restore(); }
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
// Dave-the-Diver tone: every FULL cut (first time, 5–8 s) is a little hammy meme sketch built from the meme kit
// (meme_fx.js header); the SHORT repeat (2.5–3.5 s) keeps the single funniest beat. Every cut ends on the reward card.
const ROLE = { waiter: { name: "BÉ TÍ", colA: "#2f8f5b", line: "Dạ con chạy bàn lẹ lắm, bưng năm tô hổng đổ một giọt!" },
  cook: { name: "CHÚ BẢY", colA: "#a33a2a", line: "Bếp để Bảy lo, lửa lớn tay nhanh nghen con." } };
// a staff sprite as a meme subject: side-view personSide, ~24 px tall; eye anchors so shades / star eyes land on the head
const STAFF_FACE = { eyes: [[10, 6.5], [15, 6.5]], mouth: [15, 9.5] };
const staffSubj = (id, o = {}) => ({ art: (g, k) => personSide(g, 0, 0, { face: 1, ...STAFF_LOOK[id], t: k, arm: o.arm, carry: o.carry, walk: o.walk ? k + 0.01 : 0 }), face: STAFF_FACE });
const DARK = (col = "#14101c") => (c) => { c.fillStyle = col; c.fillRect(0, 0, W, H); };
// split a long name into two balanced lines (for the brush-word kanji card)
function twoLines(s) {
  const w = s.split(" "); if (s.length <= 10 || w.length < 2) return s;
  let best = 1, bd = 1e9;
  for (let i = 1; i < w.length; i++) { const d = Math.abs(w.slice(0, i).join(" ").length - w.slice(i).join(" ").length); if (d < bd) { bd = d; best = i; } }
  return w.slice(0, best).join(" ") + "\n" + w.slice(best).join(" ");
}
const upper = (s) => { try { return s.toLocaleUpperCase("vi"); } catch (e) { return s.toUpperCase(); } };
const END = (reward) => [{ meme: "clear" }, { reward }];

const BUILD = {
  // hire — full: slow-mo walk away from an explosion · Bà Tư vine-boom squint "Ủa alo?" · flaming brush-word name card ·
  // shades drop "ĐỈNH CỦA CHÓP" · reward. Short: name card · reward.
  hire(d, full) {
    const id = d.id === "cook" ? "cook" : "waiter", R0 = ROLE[id], S = meta.STAFF[id], L = S.levels[1];
    const reward = { icon: (c, x, y) => chibiBig(c, id, x + 14, y + 32, 1.6, 0), label: "NHÂN VIÊN MỚI", name: `${S.short} · ${S.role}`, sub: `Công ${L.wage}k/ngày · ${L.desc}`, cta: "Vô làm!", seal: "NHẬN", dur: 1.3 };
    const kanji = (dur) => ({ meme: "kanji", ...staffSubj(id, { arm: "wave" }), text: R0.name, sub: `${S.role} · công ${L.wage}k/ngày`, bg: "flames", col: "#160606", dur });
    const steps = full ? [
      { duck: 7.5, amt: 0.4 }, { bg: DARK() },
      { meme: "slowmo", ...staffSubj(id, { walk: true }), shades: false, text: `${S.short} tới nhận việc. Người ngầu không ngoái lại.`, dur: 1.6 },
      { call: () => voiceLine("Bà Tư", "Ủa alo? Ai đây?") },
      { meme: "vineboom", who: "ba", text: "Ủa alo? Ai đây?", dur: 1.0 },
      kanji(1.6),
      { meme: "shades", ...staffSubj(id, { arm: "wave" }), text: "ĐỈNH CỦA CHÓP", sub: `"${R0.line}"`, land: 0.7, dur: 1.8 },
      { stinger: "jingle", arg: "hire" },
      ...END(reward),
    ] : [
      { duck: 3, amt: 0.4 }, { bg: DARK() }, kanji(1.6), { stinger: "jingle", arg: "hire" }, ...END({ ...reward, dur: 1.1 }),
    ];
    return { steps };
  },
  // train — full: anime training montage (speed lines, rep counter, sweat flying) · sweat "Ét o ét…" · impact "LÊN TRÌNH!!" ·
  // ascend with choir + star eyes · reward. Short: ascend · reward.
  train(d, full) {
    const id = d.id === "cook" ? "cook" : "waiter", S = meta.STAFF[id], L = S.levels[2];
    const DRILLS = id === "cook"
      ? [["THÁI 100 CỌNG SẢ", { arm: "stir" }], ["QUẠT LÒ 100 LẦN", { arm: "wave" }], ["NÊM 100 NỒI LẨU", { arm: "stir" }], ["BƯNG 100 TÔ", { carry: true }]]
      : [["BƯNG 100 TÔ", { carry: true }], ["CHẠY 100 VÒNG GHE", { walk: true }], ["LAU 100 CÁI BÀN", { arm: "stir" }], ["CƯỜI 100 LẦN", { arm: "wave" }]];
    const bg = (c, cs) => {
      const t = cs.t, m = clamp(cs.v.mont || 0, 0, 0.999), rt = reduceMotion ? 0 : t, i = Math.floor(m * DRILLS.length), [label, o] = DRILLS[i];
      c.fillStyle = i % 2 ? "#2a1040" : "#401a10"; c.fillRect(0, 0, W, H);
      speedLines(c, W / 2, H / 2 + 20, rt * 3, "rgba(255,210,63,.2)", 30); halftone(c, 0, 0, W, H, "rgba(255,255,255,.05)", 8, false);
      const bob = reduceMotion ? 0 : Math.abs(Math.sin(t * 14)) * 4;
      chibiBig(c, id, W / 2, H - 24 - bob, 6, rt, { ...o, walk: o.walk ? rt + 0.01 : 0 });
      if (!reduceMotion) for (let k = 0; k < 6; k++) { // sweat flying off the head
        const ph = (t * 2.2 + k / 6) % 1, sx = W / 2 + (k % 2 ? 1 : -1) * (20 + ph * 70), sy = H - 150 - Math.sin(ph * Math.PI) * 40 + ph * 60;
        c.fillStyle = "#9fe4ff"; c.fillRect(Math.round(sx), Math.round(sy), 4, 5); c.fillStyle = "#fff"; c.fillRect(Math.round(sx) + 1, Math.round(sy) + 1, 1, 2);
      }
      const within = (m * DRILLS.length) % 1, reps = Math.max(1, Math.round(within * within * 100));
      slamText(label, W / 2, 50, 24, { color: "#ffd23f", rot: -0.05 });
      txt(`×${reps}`, W - 40, H - 40, { size: 30, align: "right", color: "#fff", weight: 900, italic: true, stroke: "#1a1220", sw: 6 });
      txt("● REC  MONTAGE LUYỆN CÔNG", 22, 30, { size: 8, color: Math.floor(t * 2) % 2 && !reduceMotion ? "#ff4a4a" : "#ff9a9a", weight: 900 });
    };
    const reward = { icon: (c, x, y) => chibiBig(c, id, x + 14, y + 32, 1.6, 0), label: "LÊN BẬC 2", name: `${S.short} ★★`, sub: `${L.desc} · công ${L.wage}k/ngày`, cta: "Làm tiếp", seal: "GIỎI", dur: 1.2 };
    const ascend = (dur) => ({ meme: "ascend", ...staffSubj(id, { arm: "wave" }), stars: true, text: `★★ ${upper(S.short)} LÊN BẬC 2`, dur });
    const steps = full ? [
      { duck: 7, amt: 0.4 }, { bg }, { set: { mont: 0 } }, { stinger: "riser", arg: 1.6 }, { msfx: "whoosh_hit" },
      { tween: { mont: 1 }, dur: 1.6, wait: true },
      { meme: "sweat", ...staffSubj(id), text: "Ét o ét…", dur: 1.0 },
      { meme: "impact", text: "LÊN TRÌNH!!", sub: `${S.short} · ${L.desc}`, col: "#ffd23f", dur: 1.0 },
      ascend(1.7), { stinger: "jingle", arg: "level" },
      ...END(reward),
    ] : [
      { duck: 3, amt: 0.4 }, { bg: DARK("#1a1030") }, ascend(1.6), { stinger: "jingle", arg: "level" }, ...END({ ...reward, dur: 1.1 }),
    ];
    return { steps };
  },
  // décor — full: camera pushes in while the new piece appears (lanterns light one by one with bells, cloths unfurl, flowers
  // bloom, the sign flips) · record scratch freeze-frame "Ừ, cái đó là tui mua đó…" · wide shot + airhorn "QUÁN XỊN XÒ" · reward.
  // Short: quick reveal · airhorn · reward.
  decor(d, full) {
    const slot = meta.DECOR[d.slot] ? d.slot : "lanterns", it = meta.decorItem(slot, d.to) || meta.DECOR[slot].items[0];
    const anim = { slot, from: d.from ?? meta.DECOR[slot].def, to: it.id, k: 0, revealX: -1e9 };
    const CAM = { lanterns: [[96, 40, 2.4], [384, 40, 2.4]], cloth: [[180, 200, 1.7], [330, 200, 1.7]], flowers: [[200, 205, 1.5], [420, 195, 1.8]], sign: [[80, 100, 2.8], [80, 100, 2.8]] }[slot];
    const NOUN = { lanterns: "dàn đèn", cloth: "bộ khăn bàn", flowers: "mấy chậu bông", sign: "cái bảng hiệu" }[slot];
    const xs = LANTERN_XS; let bell = 0, fxDone = false;
    const tick = (cs) => {
      const k = clamp(cs.v.ak || 0, 0, 1); anim.k = k;
      if (slot === "lanterns") {
        anim.revealX = lerp(xs[0] - 12, xs[xs.length - 1] + 2, k);
        while (bell < xs.length && xs[bell] <= anim.revealX) { sfx("bell" + Math.min(14, bell)); bell++; }
      } else if (!fxDone && k > 0.02) { fxDone = true; sfx(slot === "cloth" ? "unfurl" : slot === "sign" ? "flip" : "sparkle"); }
    };
    const bg = (c, cs) => { const v = cs.v; raftView(c, cs.t, v.fx, v.fy, v.zz); };
    const pct = Math.round((meta.decorBonus() - 1) * 100);
    const reward = { icon: decorIcon(slot, it.id), label: "TRANG TRÍ MỚI", name: it.name, sub: `Khách kiên nhẫn hơn +${pct}%`, cta: "Xem quán", seal: "ĐẸP", dur: 1.3 };
    const horn = (dur) => ({ meme: "airhorn", text: "QUÁN XỊN XÒ", sub: `${it.name} · khách kiên nhẫn hơn +${pct}%`, dur });
    const [a, b] = CAM;
    const steps = full ? [
      { duck: 7, amt: 0.4 }, { call: () => meta.setDecorAnim(anim) }, { bg }, { set: { fx: W / 2, fy: H / 2, zz: 1, ak: 0 } },
      { tween: { fx: a[0], fy: a[1], zz: a[2] }, dur: 0.35, wait: true },
      { tween: { ak: 1, fx: b[0], fy: b[1], zz: b[2] }, dur: 1.2, ease: "inOut", wait: true },
      { meme: "freeze", me: [W / 2, H / 2], meLabel: "đồ mới nè", name: "ÚT SEN (kể)", text: `Ừ, ${NOUN} đó là tui mua đó. Đẹp hông? Còn ví tui thì… khum đẹp lắm.`, dur: 2.1 },
      { tween: { fx: W / 2, fy: H / 2, zz: 1 }, dur: 0.25, ease: "out", wait: true },
      { punch: 1.12, sound: false }, horn(1.5), { stinger: "jingle", arg: "warm" },
      ...END(reward),
    ] : [
      { duck: 3, amt: 0.4 }, { call: () => meta.setDecorAnim(anim) }, { bg }, { set: { fx: W / 2, fy: H / 2, zz: 1, ak: 0 } },
      { tween: { ak: 1 }, dur: 0.8, wait: true }, { punch: 1.1, sound: false }, horn(1.3), { stinger: "jingle", arg: "warm" },
      ...END({ ...reward, dur: 1.1 }),
    ];
    return { steps, tick, end: () => meta.setDecorAnim(null) };
  },
  // gear — full: the item spins in on a riser · brush-word "THỦY" over waves with the item · Út Sen's shades drop on the stat
  // line ("deal with it" + airhorn) · the wallet chart dives "CÒN CÁI NỊT" · reward. Short: shades + stat · reward.
  gear(d, full) {
    const glyph = typeof d.glyph === "function" ? d.glyph : null, water = /oxy|O₂|phao|Máu|lao|vịt|giỏ|vợt/i.test((d.name || "") + (d.stat || ""));
    const drawItem = (c, x, y, s, spin) => {
      c.save(); c.translate(x, y); c.scale(Math.max(0.08, Math.abs(Math.cos(spin))) * s, s);
      if (glyph) { try { glyph(c, -5, -5); } catch (e) {} } else { R(c, -4, -5, 8, 10, "#3fb6c4"); }
      c.restore();
    };
    const itemArt = (g, k) => { g.save(); g.translate(0, -11); drawItem(g, 0, 0, 2.2, reduceMotion ? 0 : Math.sin(k * 3) * 0.4); g.restore(); };
    const bg = (c, cs) => {
      const k = clamp(cs.v.spin || 0, 0, 1);
      c.fillStyle = "#0b1a2a"; c.fillRect(0, 0, W, H); speedLines(c, W / 2, H / 2, reduceMotion ? 0 : cs.t, "rgba(120,220,255,.16)", 30);
      c.save(); c.globalCompositeOperation = "lighter"; c.fillStyle = `rgba(160,240,255,${0.18 * k})`; c.beginPath(); c.arc(W / 2, H / 2 - 6, 54, 0, Math.PI * 2); c.fill(); c.restore();
      drawItem(c, W / 2, lerp(H + 60, H / 2 - 6, ease.out(k)), 5 + k * 3, reduceMotion ? 0 : (1 - k) * 9);
      if (k > 0.6) slamText(d.name || "Đồ nghề mới", W / 2, 52, 22, { color: "#fff", alpha: clamp((k - 0.6) * 4, 0, 1) });
    };
    const reward = { icon: (c, x, y) => drawItem(c, x + 16, y + 16, 3, 0), label: water ? "ĐỒ LẶN MỚI" : "ĐỒ NGHỀ MỚI", name: d.name || "Đồ nghề", sub: d.stat || "", cta: d.cta || (water ? "Đeo ngay" : "Dùng ngay"), seal: "MỚI", dur: 1.2 };
    const shades = (dur) => ({ meme: "shades", who: "sen", text: d.stat || "ĐỒ XỊN", sub: `${d.name || "Đồ mới"} · ngầu vậy đó, chịu hông?`, land: 0.7, dur });
    const steps = full ? [
      { duck: 7, amt: 0.35 }, { bg }, { set: { spin: 0 } }, { stinger: "riser", arg: 0.9 }, { sfx: "swish" },
      { tween: { spin: 1 }, dur: 0.8, ease: "out", wait: true },
      { meme: "kanji", art: itemArt, size: 7, text: water ? "THỦY" : "HỎA", sub: d.name || "Đồ nghề mới", bg: water ? "waves" : "flames", col: water ? "#0b1a3a" : "#160606", dur: 1.7 },
      shades(1.9),
      { meme: "notstonks", who: "sen", text: "VÍ: CÒN CÁI NỊT", amount: d.price ? `-${d.price}k` : "", dur: 1.6 },
      ...END(reward),
    ] : [
      { duck: 3, amt: 0.35 }, { bg: DARK("#0b1a2a") }, shades(1.8), ...END({ ...reward, dur: 1.1 }),
    ];
    return { steps };
  },
  // chore — full: Bà Tư inspects with a magnifier (heartbeat) · Út Sen sweats · Bà Tư shock "!!" · tears of joy "Ối dồi ôi" ·
  // stonks with the reward money · reward. Short: stonks · reward.
  chore(d, full) {
    const money = d.money | 0, rep = +d.rep || 0;
    const bg = (c, cs) => {
      const t = cs.t, img = portrait("ba"), S = 5.4;
      c.fillStyle = "#2a1a14"; c.fillRect(0, 0, W, H); halftone(c, 0, 0, W, H, "rgba(255,200,140,.06)", 8, false);
      portraitAt(c, "ba", W * 0.3 - img.width * S / 2, H - img.height * S + 4, S);
      txt("…", W * 0.3 + 50, 70, { size: 20, color: "#fff", weight: 900 });
      const mx = reduceMotion ? W * 0.68 : W * 0.6 + Math.sin(t * 3) * 70, my = H * 0.52 + (reduceMotion ? 0 : Math.cos(t * 4.3) * 24); // magnifier sweeping the work
      c.save(); c.fillStyle = "rgba(200,235,255,.25)"; c.beginPath(); c.arc(mx, my, 26, 0, Math.PI * 2); c.fill();
      c.strokeStyle = "#3a2a1a"; c.lineWidth = 5; c.stroke(); c.lineWidth = 7; c.beginPath(); c.moveTo(mx + 19, my + 19); c.lineTo(mx + 46, my + 46); c.stroke(); c.restore();
      txt(d.title ? `Kiểm tra: ${d.title}` : "Kiểm tra…", W * 0.66, 40, { size: 11, align: "center", color: "#ffe2a8", weight: 900, stroke: "#1a0e08", sw: 3 });
    };
    const reward = { icon: (c, x, y) => { R(c, x, y + 8, 30, 22, "#b8860b"); R(c, x + 2, y + 10, 26, 18, "#ffd23f"); R(c, x + 12, y + 12, 6, 14, "#fff3a8"); }, label: "PHẦN THƯỞNG", name: `+${money}k${rep ? ` · +${rep} uy tín` : ""}`, sub: d.title ? `Xong việc: ${d.title}` : "", cta: "Nhận", seal: "THƯỞNG", dur: 1.2 };
    const stonks = (dur) => ({ meme: "stonks", who: "sen", text: "STONKS", amount: `+${money}k${rep ? ` · +${rep} uy tín` : ""}`, dur });
    const steps = full ? [
      { duck: 7, amt: 0.35 }, { bg }, { sfx: "pick" }, { sfx: "heartbeat" }, { wait: 0.9 },             // the stern inspection
      { meme: "sweat", who: "sen", text: "Bà… bà coi kỹ dữ vậy…", dur: 1.0 },
      { meme: "shock", who: "ba", text: "!!", sub: "Làm xong thiệt hả?!", dur: 1.0 },
      { call: () => voiceLine("Bà Tư", "Giỏi lắm con!") },
      { meme: "tears", who: "ba", happy: true, sound: "sparkle", text: "Ối dồi ôi…\nGIỎI QUÁ CON ƠI", dur: 1.5 },
      stonks(1.6),
      ...END(reward),
    ] : [
      { duck: 3, amt: 0.35 }, { bg: DARK("#2a1a14") }, stonks(1.6), ...END({ ...reward, dur: 1.2 }),
    ];
    return { steps };
  },
  // research (the big one, cooking-anime parody) — full: flaming brush-word dish name · ingredients fly into the pot in
  // slow-mo · Salt Bae elbow sprinkle · taste → vine boom on Bà Tư · she ascends with star eyes + choir · impact
  // "NGON BÁ CHÁY!!" · reward "ĐÃ HỌC MÓN". Short: Salt Bae "NGON BÁ CHÁY!!" · reward.
  research(d, full) {
    const id = d.id || "", name = d.name || id || "Món mới", price = d.price | 0, recipe = d.recipe || {};
    const kinds = Object.entries(recipe).flatMap(([k, q]) => Array(clamp(q | 0, 0, 4)).fill(k)).slice(0, 4);
    const need = Object.entries(recipe).map(([k, q]) => `${KIND_NAME[k] || k} ×${q}`).join(" + ");
    const PX = Math.round(W * 0.62), PY = H - 64; // pot mouth
    let landed = 0;
    const tick = (cs) => { const k = cs.v.ing || 0; while (landed < kinds.length && k >= landed + 0.98) { landed++; sfx("bubble"); } };
    const pot = (c, t) => {
      R(c, PX - 34, PY + 8, 68, 30, "#9a4a30"); R(c, PX - 36, PY + 6, 72, 4, "#c06a45"); R(c, PX - 12, PY + 18, 24, 14, P.ink); // clay stove
      const fl = Math.round(Math.sin(t * 22)); R(c, PX - 9, PY + 24 + fl, 18, 8, P.orange); R(c, PX - 5, PY + 20 - fl, 10, 6, P.yellow);
      R(c, PX - 28, PY - 14, 56, 22, "#2a2a32"); R(c, PX - 30, PY - 16, 60, 4, "#5a5a68"); R(c, PX - 22, PY - 13, 44, 3, "#c97a52"); // pot + broth
      for (let i = 0; i < 7; i++) { // steam puffs
        const k = (t * 0.6 + i / 7) % 1, x = PX - 18 + i * 6 + Math.sin(k * 7 + i) * 5, y = PY - 18 - k * 70, r = 3 + k * 7;
        c.globalAlpha = 0.45 * (1 - k); c.fillStyle = "#f4f0ff"; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
      }
      c.globalAlpha = 1;
    };
    // slow-mo shot: ingredients drift in on long arcs, spinning, letterboxed with a "QUAY CHẬM" tag
    const bg = (c, cs) => {
      const v = cs.v, t = reduceMotion ? 0 : cs.t * 0.25; // everything in the shot runs at quarter speed
      c.fillStyle = "#2a1a14"; c.fillRect(0, 0, W, H); halftone(c, 0, 0, W, H, "rgba(255,180,120,.06)", 8, false); R(c, 0, H - 34, W, 34, "#3a2414");
      const img = portrait("ba"), S = 5;
      portraitAt(c, "ba", 34, H - img.height * S + 4, S);
      pot(c, t);
      c.save(); c.imageSmoothingEnabled = false;
      kinds.forEach((k, i) => {
        const p = clamp((v.ing || 0) - i, 0, 1); if (p <= 0 || p >= 1) return;
        const x = lerp(W + 16, PX, p), y = lerp(40, PY - 18, p) - Math.sin(p * Math.PI) * 60;
        c.save(); c.translate(Math.round(x), Math.round(y)); if (!reduceMotion) c.rotate(p * 4); try { c.drawImage(icon(k), -16, -16, 32, 32); } catch (e) {} c.restore();
        c.fillStyle = "rgba(255,255,255,.35)"; for (let j = 1; j <= 3; j++) c.fillRect(Math.round(x + j * 10), Math.round(y - 2 + j), 6, 1); // motion streaks
      });
      c.restore();
      const bh = 30; c.fillStyle = "#000"; c.fillRect(0, 0, W, bh); c.fillRect(0, H - bh, W, bh);
      txt("● QUAY CHẬM ×0.25", W - 14, 20, { size: 9, align: "right", color: Math.floor(cs.t * 2) % 2 && !reduceMotion ? "#ff4a4a" : "#ff8a8a", weight: 900 });
      txt(need, W / 2, H - 11, { size: 9, align: "center", color: "#ffe2a8", weight: 800, italic: true });
    };
    const reward = { icon: (c, x, y) => { try { c.drawImage(dishIcon(id), x, y - 2, 48, 48); } catch (e) {} }, label: "ĐÃ HỌC MÓN", name,
      sub: `Cần: ${need}${d.cook_s ? ` · ${d.cook_s} s` : ""} · bán ${price}k`, cta: "Nấu thôi!", seal: "NGON", dur: 1.2 };
    const steps = full ? [
      { duck: 7.5, amt: 0.4 }, { bg: DARK("#2a1a14") },
      { meme: "kanji", who: "ba", text: twoLines(upper(name)), sub: `Món mới · bán ${price}k/phần`, bg: "flames", dur: 1.3 },
      { bg }, { set: { ing: 0 } }, { msfx: "slowmo", dur: 1.3 }, { sfx: "sizzle" },
      { tween: { ing: kinds.length }, dur: 1.2, wait: true },
      { meme: "saltbae", dish: id, text: "RẮC MUỐI KIỂU CÁCH", sub: "(bí truyền 40 năm của Bà Tư)", dur: 1.3 },
      { call: () => voiceLine("Bà Tư", "Ừm…") },
      { meme: "vineboom", who: "ba", text: "(nếm thử một miếng…)", dur: 0.75 },
      { call: () => voiceLine("Bà Tư", "Ngon! Ra món rồi nè con!") },
      { bg: DARK("#fff1c8") }, // heaven: drop the slow-mo shot (its tag + portrait showed through the light beam)
      { meme: "ascend", who: "ba", stars: true, text: "NGON XỈU UP XỈU DOWN", dur: 1.6, hold: 0.9 },
      { meme: "impact", text: "NGON BÁ CHÁY!!", sub: name, col: "#ffd23f", bgCol: "rgba(90,20,10,.6)", dur: 0.9 },
      { stinger: "jingle", arg: "warm" },
      ...END(reward),
    ] : [
      { duck: 3, amt: 0.4 }, { bg: DARK("#1a0e0a") },
      { meme: "saltbae", dish: id, text: "NGON BÁ CHÁY!!", sub: name, dur: 1.6 }, { stinger: "jingle", arg: "warm" },
      ...END({ ...reward, dur: 1.2 }),
    ];
    return { steps, tick };
  },
};
export const ACTION_KINDS = Object.keys(BUILD);
