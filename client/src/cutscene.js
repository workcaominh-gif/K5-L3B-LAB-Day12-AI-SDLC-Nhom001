// Timeline-driven cutscenes. A script is a flat list of steps; blocking steps pause the timeline.
// Audio steps: { music }, { sfx }, { stinger: name, arg } (synth cinematic FX), { duck: seconds }, { musicCue: 0..2 }.
// Action-cut steps: { punch: zoom } (freeze-frame zoom punch), { aura: kind|null, col } (backdrop swap), { reward: {...} }
// (paper card + red seal + CTA), { call: fn(cs) }. cam.z now zooms the bg about the screen centre.
// Cards play "swish" in/out and hero_hit / title_hit on the impact; a "riser" is armed to end on the impact
// whenever the step before the card has a known length (see armRiser).
// Meme kit (meme_fx.js header lists every type): { meme: "vineboom" | "freeze" | "shades" | "impact" | ..., ...opts },
// { msfx: sound }, { opts: { skipAny, hint } } (change options mid-script), say lines with auto: true | s (advance by themselves).
import { W, H, screen, input, fx, ease, clamp, lerp, txt, wrap, panel, measure, reduceMotion } from "./engine.js";
import { sfx, music, voice, duck, musicCue } from "./audio.js";
import { MemeLayer } from "./meme_fx.js";
import { msfx } from "./meme_sfx.js";

const IMPACT = { intro: 0.3, title: 0.14 }; // seconds into a card where the name slams in
const RISER = 1.1; // riser length that ends on a card impact
import { portrait, R } from "./art.js";

// ---------- shared comic-style effects ----------
export function speedLines(c, cx, cy, t, col = "rgba(255,255,255,.55)", n = 28) {
  c.save(); c.fillStyle = col;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + t * 0.6 + Math.sin(i * 12.9) * 0.08;
    const r0 = 70 + ((i * 37) % 40) + Math.sin(t * 9 + i) * 8, r1 = 420;
    const w = 0.012 + ((i * 7) % 5) * 0.004;
    c.beginPath();
    c.moveTo(cx + Math.cos(a - w) * r1, cy + Math.sin(a - w) * r1);
    c.lineTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
    c.lineTo(cx + Math.cos(a + w) * r1, cy + Math.sin(a + w) * r1);
    c.fill();
  }
  c.restore();
}
export function halftone(c, x, y, w, h, col, step = 6, grow = true) {
  c.fillStyle = col;
  for (let yy = 0; yy < h; yy += step) for (let xx = (yy / step) % 2 ? step / 2 : 0; xx < w; xx += step) {
    const r = grow ? Math.max(0, (xx / w) * step * 0.45) : step * 0.3;
    if (r >= 0.5) c.fillRect(Math.round(x + xx - r / 2), Math.round(y + yy - r / 2), Math.ceil(r), Math.ceil(r));
  }
}
// Big comic title with chromatic split + thick outline (UI layer).
export function slamText(str, x, y, size, o = {}) {
  const rot = o.rot ?? -0.06;
  if (!reduceMotion && o.split !== false) {
    txt(str, x - 1.6, y, { size, italic: true, weight: 900, color: "rgba(255,40,90,.75)", align: o.align || "center", rot, scale: o.scale });
    txt(str, x + 1.6, y, { size, italic: true, weight: 900, color: "rgba(40,220,255,.75)", align: o.align || "center", rot, scale: o.scale });
  }
  txt(str, x, y, { size, italic: true, weight: 900, color: o.color || "#fff", stroke: o.stroke || "#1a1220", sw: o.sw || size * 0.22, align: o.align || "center", rot, scale: o.scale, alpha: o.alpha });
}

// ---------- action-cut primitives (action_cut.js; usable by any cutscene bg) ----------
// All are pure functions of time (no state) so a frozen or skipped scene never leaks particles.
const hash = (i, s = 0) => { const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return x - Math.floor(x); };
// paper confetti bursting from (x, y) at time t (seconds since the burst), falling with flutter
export function confetti(c, x, y, t, n = 40, cols = ["#ffd23f", "#ff5a7a", "#5fd6c4", "#ffffff", "#7be08a", "#b060d0"]) {
  if (t < 0) return;
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (hash(i, 1) - 0.5) * 2.4, v = 90 + hash(i, 2) * 160;
    const px = x + Math.cos(a) * v * t + Math.sin(t * 6 + i) * 6, py = y + Math.sin(a) * v * t + 140 * t * t;
    const al = clamp(2.6 - t, 0, 1); if (al <= 0) continue;
    const w = 2 + (i % 3), h = Math.max(1, Math.abs(Math.cos(t * 9 + i)) * 4);
    c.globalAlpha = al; c.fillStyle = cols[i % cols.length]; c.fillRect(Math.round(px), Math.round(py), w, h);
  }
  c.globalAlpha = 1;
}
// twinkling 4-point sparkles scattered round (x, y) within radius r
export function sparkles(c, x, y, t, n = 12, r = 60, col = "#fff6c0") {
  c.fillStyle = col;
  for (let i = 0; i < n; i++) {
    const ph = t * (2 + hash(i, 3) * 2) + hash(i, 4) * 6.28, k = Math.max(0, Math.sin(ph));
    if (k < 0.05) continue;
    const sx = x + (hash(i, 5) - 0.5) * 2 * r, sy = y + (hash(i, 6) - 0.5) * 2 * r * 0.6, L = 1 + k * 4;
    c.globalAlpha = k; c.fillRect(Math.round(sx - L), Math.round(sy), Math.round(L * 2 + 1), 1); c.fillRect(Math.round(sx), Math.round(sy - L), 1, Math.round(L * 2 + 1));
    c.fillRect(Math.round(sx - 1), Math.round(sy - 1), 3, 3);
  }
  c.globalAlpha = 1;
}
// coins raining from the top for t seconds, spinning (width = |cos|)
export function coinRain(c, t, n = 26, w = W, h = H) {
  for (let i = 0; i < n; i++) {
    const t0 = hash(i, 7) * 0.9, tt = t - t0; if (tt < 0) continue;
    const x = 20 + hash(i, 8) * (w - 40), y = -10 + tt * (150 + hash(i, 9) * 90) + 60 * tt * tt;
    if (y > h + 10) continue;
    const sw = Math.max(1, Math.abs(Math.cos(tt * 8 + i)) * 6);
    c.fillStyle = "#b8860b"; c.fillRect(Math.round(x - sw / 2), Math.round(y - 6), Math.round(sw), 12);
    c.fillStyle = "#ffd23f"; c.fillRect(Math.round(x - sw / 2 + 0.5), Math.round(y - 5), Math.max(1, Math.round(sw - 1)), 10);
    if (sw > 3) { c.fillStyle = "#fff3a8"; c.fillRect(Math.round(x - 1), Math.round(y - 3), 1, 6); }
  }
}
// comic-panel split: two slanted panels sliding in from the sides (k: 0..1 in, then held); each panel's content is drawn
// clipped by left(c, box) / right(c, box), box = { x, y, w, h }
export function comicSplit(c, k, colA, colB, left, right, t = 0) {
  const e = ease.out(clamp(k, 0, 1)), gap = 6, mid = W * 0.5, sl = 40, top = 26, bot = H - 26;
  const offA = (1 - e) * -W, offB = (1 - e) * W;
  const pane = (pts, col, off, fn, box) => {
    c.save(); c.translate(off, 0);
    c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) c.lineTo(p[0], p[1]); c.closePath();
    c.fillStyle = "#14101c"; c.fill(); c.save(); c.clip(); c.fillStyle = col; c.fillRect(box.x - 40, box.y - 10, box.w + 80, box.h + 20);
    halftone(c, box.x, box.y, box.w, box.h, "rgba(0,0,0,.16)", 7); speedLines(c, box.x + box.w / 2, box.y + box.h / 2, t, "rgba(255,255,255,.12)", 18);
    fn?.(c, box); c.restore();
    c.strokeStyle = "#fff"; c.lineWidth = 3; c.stroke(); c.restore();
  };
  pane([[12, top], [mid + sl / 2 - gap, top], [mid - sl / 2 - gap, bot], [12, bot]], colA, offA, left, { x: 12, y: top, w: mid - 12, h: bot - top });
  pane([[mid + sl / 2 + gap, top], [W - 12, top], [W - 12, bot], [mid - sl / 2 + gap, bot]], colB, offB, right, { x: mid - sl / 2, y: top, w: W - 12 - mid + sl / 2, h: bot - top });
}
// zoom punch: scale that kicks to `amt` at t = 0 and settles back to 1 (multiply into a transform)
export const zoomPunch = (t, amt = 0.12, len = 0.35) => (t < 0 || t > len ? 1 : 1 + amt * Math.sin((t / len) * Math.PI) * (1 - t / len));
// freeze-frame flash: white frame + inverted tint that cuts off after `len` seconds
export function freezeFlash(c, t, len = 0.18, col = "#fff") {
  if (t < 0 || t > len) return;
  c.save(); c.globalAlpha = (1 - t / len) * 0.85; c.fillStyle = col; c.fillRect(0, 0, W, H); c.restore();
}
// speech bubble with a tail (UI layer friendly), text wrapped to maxW
export function bubble(c, x, y, text, o = {}) {
  const size = o.size || 9, lines = wrap(text, o.maxW || 150, size), w = Math.max(...lines.map((l) => measure(l, size, 800))) + 14, h = lines.length * (size + 3) + 10;
  const bx = Math.round(x - (o.tail === "right" ? w - 16 : 16)), by = Math.round(y - h - 8);
  panel(bx, by, w, h, { fill: o.fill || "#fffaf0", border: o.border || "#1a1220", bw: 1.5, r: 6, alpha: o.alpha });
  c.save(); c.globalAlpha = o.alpha ?? 1; c.fillStyle = o.fill || "#fffaf0"; c.beginPath(); c.moveTo(x - 4, by + h - 1); c.lineTo(x + 4, by + h - 1); c.lineTo(x, y); c.closePath(); c.fill(); c.restore();
  lines.forEach((l, i) => txt(l, bx + 7, by + 6 + size + i * (size + 3) - 2, { size, color: o.color || "#2a1a12", weight: 800, alpha: o.alpha }));
}

// ---------- aura: full-screen "reaction" backdrop swap (our own patterns) ----------
// kind: "rays" (radial sun rays) | "lotus" (drifting lotus-petal tiles) | "lanterns" (lantern bokeh) | "bubbles" (rising
// bubbles) | "waves" (wave stripes). reduceMotion → flat colour.
export function drawAura(c, kind, col, t) {
  c.save(); c.fillStyle = col || "#ffcf8a"; c.fillRect(0, 0, W, H);
  if (reduceMotion) { c.restore(); return; }
  const cx = W / 2, cy = H / 2;
  if (kind === "rays") {
    c.fillStyle = "rgba(255,255,255,.22)";
    for (let i = 0; i < 18; i++) { const a = (i / 18) * Math.PI * 2 + t * 0.35; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a) * 500, cy + Math.sin(a) * 500); c.lineTo(cx + Math.cos(a + 0.17) * 500, cy + Math.sin(a + 0.17) * 500); c.fill(); }
  } else if (kind === "lotus") {
    for (let i = 0; i < 26; i++) {
      const x = ((hash(i, 11) * W + t * 18 * (0.5 + hash(i, 12))) % (W + 40)) - 20, y = ((hash(i, 13) * H - t * 22 * (0.5 + hash(i, 14))) % (H + 40) + H + 40) % (H + 40) - 20;
      const r = 4 + hash(i, 15) * 5; c.fillStyle = i % 3 ? "rgba(255,150,190,.55)" : "rgba(255,240,245,.6)";
      c.beginPath(); c.ellipse(x, y, r, r * 0.45, t * 0.8 + i, 0, Math.PI * 2); c.fill();
    }
    halftone(c, 0, 0, W, H, "rgba(255,255,255,.12)", 9, false);
  } else if (kind === "lanterns") {
    for (let i = 0; i < 22; i++) { const x = hash(i, 16) * W, y = hash(i, 17) * H + Math.sin(t + i) * 4, r = 6 + hash(i, 18) * 14; c.fillStyle = `rgba(255,${150 + (i % 4) * 25},80,${0.18 + 0.1 * Math.sin(t * 2 + i)})`; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); }
  } else if (kind === "bubbles") {
    c.strokeStyle = "rgba(220,250,255,.6)"; c.lineWidth = 1.5;
    for (let i = 0; i < 30; i++) { const x = hash(i, 19) * W + Math.sin(t * 2 + i) * 5, y = H + 20 - ((t * (40 + hash(i, 20) * 60) + hash(i, 21) * H) % (H + 40)), r = 2 + hash(i, 22) * 6; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.stroke(); }
    speedLines(c, cx, cy, t, "rgba(255,255,255,.14)", 20);
  } else if (kind === "waves") {
    for (let y = 0; y < H; y += 14) { c.fillStyle = (y / 14) % 2 ? "rgba(255,255,255,.12)" : "rgba(0,0,0,.08)"; for (let x = 0; x < W; x += 4) c.fillRect(x, y + Math.round(Math.sin(x / 18 + t * 3 + y) * 3), 4, 7); }
  }
  c.restore();
}

// ---------- reward card: paper card + red seal (con dấu) slammed on, with a "use it now" button ----------
// def: { icon(c, x, y, s) | null, label, name, sub, cta, seal: text in the seal (default "ĐẸP") }
const REWARD_IMPACT = 0.32;
function drawRewardCard(c, card, k, t) {
  const D = card.dur, inK = ease.back(clamp(k / 0.28, 0, 1)), outK = clamp((k - (D - 0.2)) / 0.2, 0, 1);
  c.save(); c.globalAlpha = 0.55 * clamp(k * 5, 0, 1) * (1 - outK); c.fillStyle = "#0a0610"; c.fillRect(0, 0, W, H); c.restore();
  const w = 230, h = 120, x = W / 2 - w / 2, y = H / 2 - h / 2 + (1 - inK) * 40 + outK * 20;
  c.save(); c.globalAlpha = clamp(inK, 0, 1) * (1 - outK);
  c.translate(W / 2, y + h / 2); c.rotate(-0.02 + (1 - clamp(inK, 0, 1)) * 0.08); c.translate(-W / 2, -(y + h / 2));
  c.fillStyle = "rgba(0,0,0,.35)"; c.fillRect(x + 5, y + 6, w, h);
  c.fillStyle = "#f4e6c4"; c.fillRect(x, y, w, h); c.fillStyle = "#e6d2a4"; c.fillRect(x, y + h - 6, w, 6);
  c.strokeStyle = "#8a5a33"; c.lineWidth = 1.5; c.strokeRect(x + 4, y + 4, w - 8, h - 8);
  for (let i = 0; i < 6; i++) { c.fillStyle = "rgba(138,90,51,.08)"; c.fillRect(x + 8, y + 14 + i * 16, w - 16, 1); }
  if (card.icon) { c.save(); c.imageSmoothingEnabled = false; try { card.icon(c, x + 18, y + 26, 3); } catch (e) {} c.restore(); }
  c.restore();
  const a = clamp(inK, 0, 1) * (1 - outK);
  txt(card.label || "PHẦN THƯỞNG", x + 78, y + 22, { size: 8, color: "#b5462e", weight: 900, alpha: a });
  // name: shrink to fit (13 → 9 px), then wrap to 2 lines at 9 px for very long dish names
  const name = card.name || "", nameW = w - 90; let ns = 13;
  while (ns > 9 && measure(name, ns, 900) > nameW) ns -= 0.5;
  const nl = measure(name, ns, 900) > nameW ? wrap(name, nameW, ns).slice(0, 2) : [name];
  nl.forEach((l, i) => txt(l, x + 78, y + (nl.length > 1 ? 36 : 42) + i * (ns + 1), { size: ns, color: "#2a1a12", weight: 900, alpha: a }));
  wrap(card.sub || "", w - 92, 8).slice(0, 2).forEach((l, i) => txt(l, x + 78, y + 58 + i * 10, { size: 8, color: "#5a3a20", weight: 800, alpha: a }));
  if (card.cta) {
    const bw = measure(card.cta, 9, 900) + 20, bx = x + w - bw - 12, by = y + h - 28, pulse = 1 + Math.sin(t * 6) * 0.04;
    panel(bx, by, bw, 17, { fill: "#b5462e", border: "#3a1208", bw: 1.4, r: 5, alpha: a });
    txt(card.cta + " ▶", bx + bw / 2, by + 12, { size: 9 * pulse, align: "center", color: "#fff", weight: 900, alpha: a });
  }
  // seal: slams in from big at REWARD_IMPACT
  const sk = clamp((k - REWARD_IMPACT + 0.12) / 0.12, 0, 1);
  if (sk > 0) {
    const sc = lerp(2.6, 1, ease.out(sk)), sx = x + 44, sy = y + h - 30;
    c.save(); c.globalAlpha = a * (0.5 + 0.5 * sk); c.translate(sx, sy); c.rotate(-0.22); c.scale(sc, sc);
    c.strokeStyle = "#c8281e"; c.lineWidth = 2.5; c.strokeRect(-20, -13, 40, 26); c.lineWidth = 1; c.strokeRect(-17, -10, 34, 20);
    c.restore();
    txt(card.seal || "ĐẸP", sx, sy + 4, { size: 10 * sc, align: "center", color: "#c8281e", weight: 900, rot: -0.22, alpha: a * (0.5 + 0.5 * sk) });
  }
}

// ---------- intro card: "character name slam" ----------
function drawIntroCard(c, card, k, t) {
  const D = card.dur;
  const inK = ease.out(clamp(k / 0.35, 0, 1));
  const outK = ease.in(clamp((k - (D - 0.35)) / 0.35, 0, 1));
  const sweep = -outK * (W + 200);
  // backdrop: two diagonal panels + halftone + speed lines
  c.save(); c.translate(sweep, 0);
  c.fillStyle = card.colA; c.beginPath(); c.moveTo(-40, 0); c.lineTo(lerp(-40, W * 0.72, inK), 0); c.lineTo(lerp(-40, W * 0.48, inK), H); c.lineTo(-40, H); c.fill();
  c.fillStyle = card.colB; c.beginPath(); c.moveTo(W + 40, 0); c.lineTo(lerp(W + 40, W * 0.72, inK), 0); c.lineTo(lerp(W + 40, W * 0.48, inK), H); c.lineTo(W + 40, H); c.fill();
  c.save(); c.beginPath(); c.moveTo(-40, 0); c.lineTo(W * 0.72, 0); c.lineTo(W * 0.48, H); c.lineTo(-40, H); c.clip();
  speedLines(c, 120, H / 2, t, "rgba(255,255,255,.22)");
  halftone(c, 0, 0, W * 0.7, H, "rgba(0,0,0,.18)", 7);
  c.restore();
  // diagonal stripe
  c.fillStyle = card.stripe || "#fff";
  c.beginPath(); c.moveTo(W * 0.72, 0); c.lineTo(W * 0.735, 0); c.lineTo(W * 0.495, H); c.lineTo(W * 0.48, H); c.fill();
  // portrait, huge chunky pixels
  const pk = ease.back(clamp((k - 0.08) / 0.45, 0, 1));
  if (card.art) card.art(c, lerp(-200, 40, pk) + Math.sin(t * 2) * 1.5, k, t); // custom big art (e.g. a staff chibi)
  else {
    const img = portrait(card.portrait), S = 7;
    const px = lerp(-200, 40, pk) + Math.sin(t * 2) * 1.5, py = H - img.height * S + 6;
    c.imageSmoothingEnabled = false;
    c.globalAlpha = 0.35; c.fillStyle = "#000"; c.fillRect(px + 8, py + 8, img.width * S, img.height * S - 8); c.globalAlpha = 1;
    c.drawImage(img, Math.round(px), Math.round(py), img.width * S, img.height * S);
  }
  c.restore();
  // text on UI layer
  const nk = clamp((k - 0.28) / 0.22, 0, 1);
  if (nk > 0) {
    const sc = lerp(2.4, 1, ease.out(nk));
    slamText(card.name, W * 0.68 + sweep, H * 0.5, card.nameSize || 44, { scale: sc, color: card.nameCol || "#fff", alpha: Math.min(1, nk * 2) });
  }
  const sk = clamp((k - 0.55) / 0.3, 0, 1);
  if (sk > 0) {
    const n = Math.floor(card.sub.length * sk);
    panel(W * 0.42 + sweep, H * 0.6, W * 0.52, 22, { fill: "rgba(20,10,30,.85)", border: card.nameCol || "#fff", r: 2 });
    txt(card.sub.slice(0, n), W * 0.68 + sweep, H * 0.6 + 15, { size: 10, align: "center", color: "#fff" });
  }
  // tag sits clear above the slammed name (the name's cap height is about its font size)
  if (card.tag && k > 0.7) txt(card.tag, W * 0.68 + sweep, H * 0.5 - (card.nameSize || 44) - 6, { size: 9, align: "center", color: card.tagCol || "#ffe08a", weight: 900, stroke: "rgba(20,10,30,.85)", sw: 3 });
}

// ---------- title card ----------
function drawTitleCard(c, card, k, t) {
  const D = card.dur;
  const inK = ease.out(clamp(k / 0.25, 0, 1));
  const outK = ease.in(clamp((k - (D - 0.3)) / 0.3, 0, 1));
  const bandH = 64 * inK * (1 - outK);
  c.fillStyle = card.band || "rgba(10,10,20,.85)";
  c.fillRect(0, H / 2 - bandH / 2, W, bandH);
  for (let i = 0; i < 14; i++) {
    const y = H / 2 - bandH / 2 + ((i * 13) % Math.max(1, bandH));
    const x = ((t * 600 + i * 97) % (W + 100)) - 50;
    R(c, x, y, 30 + (i % 3) * 20, 1, "rgba(255,255,255,.25)");
  }
  if (bandH > 4) {
    c.fillStyle = card.color || "#ffd23f";
    c.fillRect(0, H / 2 - bandH / 2, W, 2); c.fillRect(0, H / 2 + bandH / 2 - 2, W, 2);
  }
  const tk = clamp((k - 0.12) / 0.18, 0, 1);
  if (tk > 0 && outK < 1) {
    slamText(card.text, W / 2 - outK * 300, H / 2 + 8, 30, { scale: lerp(2, 1, ease.out(tk)), color: card.color || "#ffd23f", rot: -0.03, alpha: 1 - outK });
    if (card.sub) txt(card.sub, W / 2 + outK * 300, H / 2 + 24, { size: 9, align: "center", color: "#fff", alpha: clamp((k - 0.4) * 3, 0, 1) * (1 - outK) });
  }
}

// ---------- the player ----------
export class Cutscene {
  // opts (action cuts): { layer: "ui" (draw over overlays) | "px", overlay: true (no black fade-in, scene shows through),
  //   skipAny: true (any key / tap after .3 s skips; Esc too), bars: letterbox height (22), hint: skip hint text }
  constructor(steps, onDone, opts = {}) {
    this.steps = steps; this.i = 0; this.onDone = onDone; this.o = opts;
    this.t = 0; this.cam = { x: 0, y: 0, z: 1 }; this.v = {};
    this.bg = null; this.tweens = []; this.cur = null; this.curT = 0;
    this.bars = 0; this.fade = { a: 1, to: 1, col: "#000", spd: 2 }; this.skipHold = 0; this.done = false;
    this.say = null; this.caption = null; this.card = null;
    this.o = { ...opts }; this.memes = new MemeLayer(this); this.lastWho = "sen";
    if (opts.overlay) { this.fade.a = 0; this.fade.to = 0; }
    this.advance();
  }
  tween(obj, to, dur, e = ease.inOut) {
    const from = {}; for (const k in to) from[k] = obj[k] ?? 0;
    this.tweens.push({ obj, from, to, dur, t: 0, e });
  }
  // impact time of the card that follows the current blocking step (instant steps skipped), else null
  nextCardImpact() {
    for (let j = this.i; j < this.steps.length; j++) {
      const s = this.steps[j];
      if (s.intro) return IMPACT.intro;
      if (s.title) return IMPACT.title;
      if (s.caption || s.say || s.wait !== undefined || (s.meme && s.meme !== "clear" && !s.async && s.hold !== 0)) return null;
    }
    return null;
  }
  // arm a riser so it ends on the next card's impact; D = how long the current blocking step lasts
  armRiser(D) {
    this.riser = null;
    const imp = this.nextCardImpact();
    if (imp === null || !(D > 0)) return;
    const at = Math.max(0, D + imp - RISER), dur = D + imp - at;
    if (dur >= 0.6) this.riser = { at, dur };
  }
  startCard(type, def) {
    const dur = def.dur || (type === "intro" ? 2.9 : 2.2);
    this.card = { type, ...def, dur, k: 0, hit: false, out: false };
    sfx("swish");
    sfx(def.stinger || (type === "intro" ? "hero_hit" : "title_hit"), IMPACT[type]); // swell now, hit lands on the impact
    this.armRiser(dur);
  }
  advance() {
    this.cur = null; this.curT = 0; this.riser = null;
    while (this.i < this.steps.length) {
      const s = this.steps[this.i++];
      // meme kit (meme_fx.js): blocks for its hold (default = its dur) unless async / hold: 0
      if (s.meme) { const hold = this.memes.start(s); if (hold > 0) { this.cur = { wait: hold }; return; } continue; }
      if (s.msfx) { msfx(s.msfx, s); continue; }
      if (s.opts) { Object.assign(this.o, s.opts); continue; }
      if (s.bg) { this.bg = s.bg; continue; }
      if (s.music !== undefined) { music(s.music); continue; }
      if (s.sfx) { sfx(s.sfx); continue; }
      if (s.stinger) { sfx(s.stinger, s.arg); continue; }
      if (s.duck !== undefined) { duck(s.duck); continue; }
      if (s.musicCue !== undefined) { musicCue(s.musicCue); continue; }
      if (s.shake) { fx.shake(s.shake, s.t || 0.4); continue; }
      if (s.flash) { fx.flash(s.flash, s.t || 0.2); continue; }
      if (s.set) { Object.assign(this.v, s.set); continue; }
      if (s.call) { try { s.call(this); } catch (e) { console.warn("cutscene call", e); } continue; } // instant callback (voice lines, state)
      // zoom punch + freeze frame: snap cam.z, hitstop, white flash, slam, then ease back to 1 (no zoom with reduceMotion)
      if (s.punch) { if (!reduceMotion) { this.cam.z = s.punch; this.tween(this.cam, { z: 1 }, s.dur || 0.35, ease.out); } fx.hitstop(0.08); fx.flash("#fff", 0.08); if (s.sound !== false) sfx("slam"); continue; }
      if (s.aura !== undefined) { this.aura = s.aura ? { kind: s.aura, col: s.col } : null; continue; }
      if (s.reward) { this.cur = s; this.card = { type: "reward", ...s.reward, dur: s.reward.dur || 1.8, k: 0, hit: false, out: false }; sfx("swish"); return; }
      if (s.fade) { this.fade.to = s.fade === "out" ? 1 : 0; this.fade.col = s.color || "#000"; this.fade.spd = 1 / (s.dur || 0.5); if (s.wait) { this.cur = s; return this.armRiser(s.dur || 0.5); } continue; }
      if (s.cam) { this.tween(this.cam, s.cam, s.dur, s.ease ? ease[s.ease] : ease.inOut); if (s.wait) { this.cur = { wait: s.dur }; return this.armRiser(s.dur); } continue; }
      if (s.tween) { this.tween(this.v, s.tween, s.dur, s.ease ? ease[s.ease] : ease.inOut); if (s.wait) { this.cur = { wait: s.dur }; return this.armRiser(s.dur); } continue; }
      if (s.caption) { this.caption = { ...s, k: 0 }; this.cur = s; return this.armRiser(s.dur || 2.6); }
      if (s.say) { this.say = { ...s, k: 0, shown: 0, held: 0 }; this.cur = s; if (s.portrait) this.lastWho = s.portrait; return; }
      if (s.intro) { this.cur = s; return this.startCard("intro", s.intro); }
      if (s.title) { this.cur = s; return this.startCard("title", s.title); }
      if (s.wait !== undefined) { this.cur = s; return this.armRiser(s.wait); }
    }
    this.finish();
  }
  finish() { if (this.done) return; this.done = true; this.onDone?.(); }
  update(dt) {
    if (this.done) return;
    this.t += dt; this.curT += dt;
    this.bars = Math.min(1, this.bars + dt * 2.5);
    const f = this.fade; f.a += Math.sign(f.to - f.a) * Math.min(Math.abs(f.to - f.a), dt * f.spd);
    for (const tw of this.tweens) {
      tw.t = Math.min(tw.dur, tw.t + dt); const k = tw.e(tw.t / tw.dur);
      for (const key in tw.to) tw.obj[key] = lerp(tw.from[key], tw.to[key], k);
    }
    this.tweens = this.tweens.filter((tw) => tw.t < tw.dur);
    this.memes.update(dt);
    // any key skips (M / U / H toggles excluded so muting or captions never skip a scene)
    const toggle = input.hit("mute") || input.hit("captions") || input.hit("contrast");
    if (this.o.skipAny && this.t > 0.3 && !toggle && (input.anyKey?.() || input.hit("back") || input.hit("confirm"))) {
      sfx("click");
      // skipping still shows the reward card briefly (so the player sees what they got); a second press ends it
      const ri = this.steps.findIndex((st, j) => j >= this.i && st.reward);
      if (!this.skipped && ri >= 0 && this.card?.type !== "reward") {
        this.skipped = true; this.tweens = []; this.cam = { x: 0, y: 0, z: 1 }; this.card = null; this.say = null; this.caption = null; this.memes.clear();
        for (let j = this.i; j < ri; j++) { const st = this.steps[j]; if (st.set) Object.assign(this.v, st.set); if (st.aura !== undefined) this.aura = st.aura ? { kind: st.aura, col: st.col } : null; if (st.tween) Object.assign(this.v, st.tween); }
        this.steps = [...this.steps.slice(0, ri), { reward: { ...this.steps[ri].reward, dur: 0.9 } }]; this.i = ri; this.advance(); return;
      }
      this.skipped = true; this.finish(); return;
    }
    // skip: hold Esc
    if (input.down("back")) { this.skipHold += dt; if (this.skipHold > 0.7) { sfx("click"); this.finish(); return; } } else this.skipHold = 0;

    const s = this.cur; if (!s) return;
    if (this.riser && this.curT >= this.riser.at) { sfx("riser", Math.max(0.3, this.riser.dur - (this.curT - this.riser.at))); this.riser = null; }
    if (s.wait !== undefined && this.curT >= s.wait) return this.advance();
    if (s.fade && Math.abs(f.a - f.to) < 0.001) return this.advance();
    if (s.caption) {
      const c = this.caption; c.k = this.curT;
      if (this.curT >= (s.dur || 2.6) || (this.curT > 0.4 && input.hit("confirm"))) { this.caption = null; return this.advance(); }
    }
    if (s.say) {
      const d = this.say;
      const before = Math.floor(d.shown);
      d.shown = Math.min(d.text.length, d.shown + dt * (s.cps || 42));
      for (let k = before; k < Math.floor(d.shown); k++) voice(d.say, d.text[k], d.text, k); // babble (skips spaces/punct itself)
      if (input.hit("confirm") || input.hit("catch") || input.hit("interact")) {
        if (d.shown < d.text.length) d.shown = d.text.length;
        else { sfx("click"); this.say = null; return this.advance(); }
      }
      // auto: true (reading time from the length) or seconds to hold after the line is fully shown
      if (s.auto && d.shown >= d.text.length) { d.held += dt; if (d.held >= (s.auto === true ? 0.55 + d.text.length * 0.022 : s.auto)) { this.say = null; return this.advance(); } }
    }
    if (this.card && this.card.type === "reward") {
      const c = this.card; c.k = this.curT;
      if (!c.hit && c.k >= REWARD_IMPACT) { c.hit = true; sfx("slam"); sfx("bell", 4); fx.shake(3, 0.2); }
      if (c.k >= c.dur) { this.card = null; return this.advance(); }
      return;
    }
    if (this.card) {
      const c = this.card; c.k = this.curT;
      if (!c.hit && c.k >= IMPACT[c.type]) { c.hit = true; fx.shake(c.type === "intro" ? 6 : 4, 0.35); fx.flash("#fff", 0.1); fx.hitstop(0.06); } // hit sound was scheduled in startCard
      if (!c.out && c.k >= c.dur - (c.type === "intro" ? 0.35 : 0.3)) { c.out = true; sfx("swish", 0.6); }
      if (c.k >= c.dur) { this.card = null; return this.advance(); }
    }
  }
  draw() {
    const c = this.o.layer === "ui" ? screen.ui : screen.px;
    if (this.aura) drawAura(c, this.aura.kind, this.aura.col, this.t);
    // camera zoom (cam.z) about the screen centre, integer-snapped. cam.x / cam.y stay the bg's own parallax pan (story.js
    // reads them itself), so they are not applied here.
    const z = this.cam.z || 1, panned = Math.abs(z - 1) > 0.001;
    if (panned) { c.save(); c.translate(Math.round(W / 2), Math.round(H / 2)); c.scale(z, z); c.translate(-W / 2, -H / 2); }
    if (this.bg) this.bg(c, this);
    if (panned) c.restore();
    if (this.card) (this.card.type === "intro" ? drawIntroCard : this.card.type === "reward" ? drawRewardCard : drawTitleCard)(c, this.card, this.card.k, this.t);
    this.memes.draw(); // meme kit: UI layer, above bg + cards, below caption / dialogue / fade
    // letterbox
    const bh = Math.round((this.o.bars ?? 22) * ease.out(this.bars));
    c.fillStyle = "#000"; c.fillRect(0, 0, W, bh); c.fillRect(0, H - bh, W, bh);
    // caption (location/time card)
    if (this.caption) {
      const cp = this.caption, n = Math.floor(cp.caption.length * clamp(cp.k / 1.0, 0, 1));
      const a = clamp(cp.k * 3, 0, 1) * clamp(((cp.dur || 2.6) - cp.k) * 3, 0, 1);
      txt(cp.caption.slice(0, n), cp.x ?? 18, cp.y ?? 44, { size: cp.size || 13, color: "#fff", shadow: "rgba(0,0,0,.6)", alpha: a, align: cp.align || "left" });
      if (cp.sub) txt(cp.sub, cp.x ?? 18, (cp.y ?? 44) + 13, { size: 8, color: "#ffe2a8", alpha: a * clamp(cp.k - 0.8, 0, 1), align: cp.align || "left", weight: 700 });
    }
    if (this.say) this.drawSay(this.say);
    if (this.skipHold > 0) {
      const u = screen.ui; u.save(); u.strokeStyle = "#fff"; u.lineWidth = 1.5;
      u.beginPath(); u.arc(W - 16, H - 11, 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (this.skipHold / 0.7)); u.stroke(); u.restore();
    }
    txt(this.o.hint || "Giữ Esc để bỏ qua", W - 26, H - 8, { size: 7, align: "right", color: "rgba(255,255,255,.55)", weight: 700 });
    if (this.fade.a > 0.001) { const u = screen.ui; u.save(); u.globalAlpha = this.fade.a; u.fillStyle = this.fade.col; u.fillRect(0, 0, W, H); u.restore(); }
  }
  drawSay(d) {
    const right = d.side === "right";
    const bx = 14, by = H - 22 - 62, bw = W - 28, bh = 58;
    panel(bx, by, bw, bh, { fill: "rgba(14,12,28,.92)", border: "#f3d27a", bw: 1.5, r: 5 });
    const img = portrait(d.portrait || "sen"), S = 2.2;
    const pw = img.width * S;
    const ix = right ? bx + bw - pw - 8 : bx + 8;
    const u = screen.ui; u.save(); u.imageSmoothingEnabled = false;
    u.fillStyle = "rgba(255,255,255,.07)"; u.fillRect(ix - 2, by + 4, pw + 4, bh - 8);
    u.drawImage(img, ix, by + bh - img.height * S - 3, pw, img.height * S); u.restore();
    const tx = right ? bx + 12 : bx + pw + 18, tw = bw - pw - 34;
    const nameW = measure(d.say, 9, 900) + 12;
    panel(tx - 2, by - 8, nameW, 13, { fill: d.color || "#d94a3d", border: "#fff", r: 2 });
    txt(d.say, tx + 4, by + 2, { size: 9, weight: 900, color: "#fff" });
    const lines = wrap(d.text, tw, 10);
    let left = Math.floor(d.shown);
    lines.forEach((ln, i) => { const part = ln.slice(0, Math.max(0, left)); left -= ln.length + 1; txt(part, tx, by + 18 + i * 13, { size: 10, color: "#f6efe0", weight: 700 }); });
    if (d.shown >= d.text.length && Math.floor(this.t * 3) % 2) txt("▼", bx + bw - 12, by + bh - 6, { size: 8, color: "#f3d27a" });
  }
}
