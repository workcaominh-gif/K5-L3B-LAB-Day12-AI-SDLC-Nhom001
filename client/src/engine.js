// Core: two stacked canvases. `px` = low-res pixel world (crisp upscaled), `ui` = full-res text/HUD layer.
import { highContrast } from "./a11y.js";
export const W = 480, H = 270;

export const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const coarsePointer = matchMedia("(pointer: coarse)").matches || /[?&]touch=1\b/.test(location.search);

export const screen = {
  S: 1, ox: 0, oy: 0,
  init() {
    this.pc = document.getElementById("px");
    this.uc = document.getElementById("ui");
    this.pc.width = W; this.pc.height = H;
    this.px = this.pc.getContext("2d");
    this.ui = this.uc.getContext("2d");
    this.px.imageSmoothingEnabled = false;
    const refit = () => this.fit();
    addEventListener("resize", refit);
    // phones: the visual viewport changes when browser bars slide in/out or the soft keyboard opens; rotation settles late
    window.visualViewport?.addEventListener("resize", refit);
    addEventListener("orientationchange", () => { refit(); setTimeout(refit, 250); setTimeout(refit, 700); });
    document.addEventListener("fullscreenchange", refit);
    this.fit();
  },
  fit() {
    const dpr = devicePixelRatio || 1;
    // fill the *visual* viewport (what is actually visible on a phone), not the layout viewport
    const vv = window.visualViewport;
    const vw = Math.round(vv?.width || innerWidth), vh = Math.round(vv?.height || innerHeight);
    const stage = this.pc.parentElement;
    if (stage && stage.id === "stage") { stage.style.width = vw + "px"; stage.style.height = vh + "px"; }
    const s = Math.min(vw / W, vh / H);
    // desktop: quarter-step scales keep the pixel art even; touch screens use every pixel (no letterbox shrink)
    const S = s >= 1 && !coarsePointer ? Math.floor(s * 4) / 4 : s;
    const cw = W * S, ch = H * S;
    for (const c of [this.pc, this.uc]) {
      c.style.width = cw + "px"; c.style.height = ch + "px";
      c.style.left = (vw - cw) / 2 + "px"; c.style.top = (vh - ch) / 2 + "px";
    }
    this.uc.width = Math.round(cw * dpr); this.uc.height = Math.round(ch * dpr);
    this.S = S * dpr;
  },
  beginUI() {
    const u = this.ui;
    u.setTransform(1, 0, 0, 1, 0, 0);
    u.clearRect(0, 0, this.uc.width, this.uc.height);
    u.setTransform(this.S, 0, 0, this.S, 0, 0);
  },
};

// ---------- input ----------
const held = new Set(), hit = new Set();
const MAP = {
  arrowleft: "left", a: "left", arrowright: "right", d: "right",
  arrowup: "up", w: "up", arrowdown: "down", s: "down",
  e: "interact", " ": "catch", shift: "sprint", enter: "confirm", escape: "back", m: "mute", r: "restart", p: "pause", c: "close",
  n: "next", tab: "tab", // N = "Mở quán" on the menu board · Tab = switch Shop tabs
  h: "contrast", // H = toggle high-contrast mode (a11y.js, handled by main.js)
  u: "captions", // U = toggle SFX captions (captions.js, handled by main.js)
  o: "open", // O = "Mở quán" button on the pre-open raft (N works too)
};
addEventListener("keydown", (e) => {
  const k = MAP[e.key.toLowerCase()];
  if (!k) return;
  e.preventDefault();
  if (!held.has(k)) hit.add(k);
  held.add(k);
});
addEventListener("keyup", (e) => { const k = MAP[e.key.toLowerCase()]; if (k) held.delete(k); });
addEventListener("blur", () => held.clear());
addEventListener("pointerdown", () => { hit.add("confirm"); });

export const input = {
  down: (k) => held.has(k),
  hit: (k) => hit.has(k),
  any: () => hit.has("confirm") || hit.has("catch") || hit.has("interact"),
  anyKey: () => hit.size > 0, // any mapped key or a click this frame
  // ?debug / tests: inject a key press for the next frame (same path as a real keydown + keyup)
  press(k) { hit.add(k); },
  axis() {
    return [(held.has("right") ? 1 : 0) - (held.has("left") ? 1 : 0),
            (held.has("down") ? 1 : 0) - (held.has("up") ? 1 : 0)];
  },
  endFrame() { hit.clear(); },
};

// ---------- math / easing ----------
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const ease = {
  out: (t) => 1 - (1 - t) ** 3,
  in: (t) => t ** 3,
  inOut: (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2),
  back: (t) => { const c = 1.9; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; },
  elastic: (t) => (t === 0 || t === 1 ? t : 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI / 3)) + 1),
};
export const rnd = (a, b) => a + Math.random() * (b - a);

// ---------- juice: shake, flash, hitstop ----------
export const fx = {
  shakeT: 0, shakeMag: 0, flashT: 0, flashCol: "#fff", stop: 0,
  shake(mag = 4, t = 0.35) { if (reduceMotion) mag *= 0.2; this.shakeMag = Math.max(this.shakeMag, mag); this.shakeT = Math.max(this.shakeT, t); },
  flash(col = "#fff", t = 0.18) { if (reduceMotion) return; this.flashCol = col; this.flashT = t; },
  hitstop(t = 0.08) { this.stop = Math.max(this.stop, t); },
  update(dt) {
    this.shakeT = Math.max(0, this.shakeT - dt);
    if (!this.shakeT) this.shakeMag = 0;
    this.flashT = Math.max(0, this.flashT - dt);
  },
  offset() {
    if (!this.shakeT) return [0, 0];
    const m = this.shakeMag * Math.min(1, this.shakeT * 4);
    return [Math.round(rnd(-m, m)), Math.round(rnd(-m, m))];
  },
};

// ---------- particles (pixel space) ----------
export class Particles {
  constructor() { this.list = []; }
  add(p) { this.list.push({ life: 1, vx: 0, vy: 0, g: 0, size: 1, ...p, max: p.life || 1 }); }
  update(dt) {
    for (const p of this.list) {
      p.life -= dt; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.wobble) p.x += Math.sin((p.max - p.life) * 6 + p.seed) * p.wobble * dt;
    }
    this.list = this.list.filter((p) => p.life > 0);
  }
  draw(ctx, cx = 0, cy = 0) {
    for (const p of this.list) {
      ctx.globalAlpha = p.fade === false ? 1 : Math.min(1, p.life / p.max * 1.5);
      ctx.fillStyle = p.color;
      if (p.ring) {
        ctx.strokeStyle = p.color; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(Math.round(p.x - cx), Math.round(p.y - cy), p.size, 0, Math.PI * 2); ctx.stroke();
      } else ctx.fillRect(Math.round(p.x - cx), Math.round(p.y - cy), p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }
}

// ---------- hi-res text on the UI layer (coords in pixel-world units) ----------
export let FONT = '"Trebuchet MS", "Segoe UI", system-ui, sans-serif';
export function setFont(family) { FONT = `"${family}", ${FONT}`; }
export function txt(str, x, y, o = {}) {
  const u = screen.ui;
  u.save();
  u.font = `${o.italic ? "italic " : ""}${o.weight || 800} ${o.size || 10}px ${o.font || FONT}`;
  u.textAlign = o.align || "left";
  u.textBaseline = o.base || "alphabetic";
  u.globalAlpha = o.alpha ?? 1;
  if (o.rot) { u.translate(x, y); u.rotate(o.rot); x = 0; y = 0; }
  if (o.scale && o.scale !== 1) { u.translate(x, y); u.scale(o.scale, o.scale); x = 0; y = 0; }
  if (o.shadow) { u.fillStyle = o.shadow; u.fillText(str, x + (o.sd || 1.2), y + (o.sd || 1.2)); }
  let col = o.color || "#fff";
  if (highContrast) { // a11y: no faint tints, solid outlines
    if (u.globalAlpha < 0.85 && u.globalAlpha > 0.05) u.globalAlpha = 0.95;
    const m = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*[\d.]+\)$/.exec(col); if (m) col = `rgb(${m[1]},${m[2]},${m[3]})`;
    if (o.stroke) { u.lineJoin = "round"; u.strokeStyle = "#000"; u.lineWidth = Math.max(o.sw || 3, 3); u.strokeText(str, x, y); }
  } else if (o.stroke) { u.lineJoin = "round"; u.strokeStyle = o.stroke; u.lineWidth = o.sw || 3; u.strokeText(str, x, y); }
  u.fillStyle = col;
  u.fillText(str, x, y);
  u.restore();
}
export function measure(str, size = 10, weight = 800) {
  const u = screen.ui; u.save();
  u.font = `${weight} ${size}px ${FONT}`;
  const w = u.measureText(str).width; u.restore(); return w;
}
export function wrap(str, maxW, size) {
  const words = str.split(" "), lines = []; let line = "";
  for (const w of words) {
    const t = line ? line + " " + w : w;
    if (measure(t, size) > maxW && line) { lines.push(line); line = w; } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}
// rounded panel on the UI layer
export function panel(x, y, w, h, o = {}) {
  const u = screen.ui; const r = o.r ?? 4;
  u.save(); u.globalAlpha = o.alpha ?? 1;
  u.beginPath(); u.roundRect(x, y, w, h, r);
  u.fillStyle = o.fill || "rgba(8,20,38,.82)"; u.fill();
  if (o.border !== false) {
    if (highContrast) { // a11y: black outer outline + opaque border (faint rgba borders become white)
      const b = o.border || "#f3d27a", faint = typeof b === "string" && b.startsWith("rgba");
      u.lineWidth = (o.bw || 1.2) + 2; u.strokeStyle = "#000"; u.stroke();
      u.lineWidth = Math.max(o.bw || 1.2, 1.5); u.strokeStyle = faint ? "#fff" : b; u.stroke();
    } else { u.lineWidth = o.bw || 1.2; u.strokeStyle = o.border || "#f3d27a"; u.stroke(); }
  }
  u.restore();
}
