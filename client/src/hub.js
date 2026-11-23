// Walk-around DOCK HUB (GUI only): our ghe moored at the floating-market dock, seen side-on like the quán raft.
// Morning ("dawn"): after DayIntro — shop (Chú Sáu's market boat), Bà Tư (dialog), ladder "Lặn ▶" starts the dive.
// Night ("night"): after the day result — shop (sell tonight's leftovers, order for tomorrow), Bà Tư, hammock "Đi ngủ ▶".
// Player Út Sen walks x∈[0,16] (left/right) with a little depth z∈[0,2.4]. Interactables show a floating prompt tag
// (key hint + icon + label) when near; E/Enter/Space uses the nearest. Phone: T (main.js) or click the corner icon.
// The scene exposes menuOpen (true while its own overlay — shop popup / Bà Tư — is open) so main.js leaves Esc to it.
import { W, H, screen, input, clamp, lerp, txt, panel, measure } from "./engine.js";
import { sfx, music, voiceLine } from "./audio.js";
import { P, R, icon, ghe, lantern, ripple, KIND_NAME } from "./art.js";
import { riverWorld } from "./story.js";
import { personSide, scaled, sampan, glow, steam } from "./raft.js";
import { ShopPopup } from "./shop_popup.js";
import { planFor, deliveryText, dueOn } from "./scene_day.js";
import * as progress from "./progress.js";
import { DIVE_TIME_S, SERVICE_TIME_S, MAP_WIDTH_M, MAP_DEPTH_M, fmtClock } from "./gui_tuning.js"; // GUI scaling knobs
import { highContrast } from "./a11y.js";

const HORIZON = 112, X0 = 30, XS = 26, Y0 = 228, ZS = 6;
const kindName = (k) => KIND_NAME[k] || k;
const ucfirst = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// floating prompt tag (UI layer): [key] icon label — shared with the pre-open raft (scene_quan.js)
// glyph: "shop" | "talk" | "dive" | "sleep" | "board" | "bell"
export function promptTag(x, y, key, label, col = "#ffe9c4", glyph = null, alpha = 1, t = 0) {
  const u = screen.ui, kw = 11, gw = glyph ? 11 : 0, lw = Math.ceil(measure(label, 8, 900));
  const w = kw + gw + lw + 12, h = 15, bx = Math.round(clamp(x - w / 2, 2, W - w - 2)), by = Math.round(y - h + Math.sin(t * 3) * 1.2);
  panel(bx, by, w, h, { fill: "rgba(24,14,8,.92)", border: col, bw: 1.2, r: 5, alpha });
  u.save(); u.globalAlpha = alpha; u.fillStyle = "rgba(24,14,8,.92)"; u.beginPath(); u.moveTo(x - 4, by + h); u.lineTo(x + 4, by + h); u.lineTo(x, by + h + 4); u.fill(); u.restore();
  panel(bx + 3, by + 2.5, kw, 10, { fill: "#ffe9c4", border: false, r: 2.5, alpha });
  txt(key, bx + 3 + kw / 2, by + 10.5, { size: 7.5, align: "center", color: "#2a1608", weight: 900, alpha });
  if (glyph) { u.save(); u.globalAlpha = alpha; tagGlyph(u, glyph, bx + kw + 6, by + 3); u.restore(); }
  txt(label, bx + kw + gw + 7, by + 11, { size: 8, color: col, weight: 900, alpha });
}
function tagGlyph(u, g, x, y) {
  const r = (dx, dy, w, h, c) => R(u, x + dx, y + dy, w, h, c);
  if (g === "shop") { r(0, 3, 9, 6, "#c97a3a"); r(0, 1, 9, 2, P.red); r(2, 1, 1, 2, "#fff"); r(6, 1, 1, 2, "#fff"); r(3, 5, 3, 4, "#5e3a20"); }
  else if (g === "talk") { r(0, 0, 9, 6, "#fff"); r(2, 6, 2, 2, "#fff"); r(2, 2, 1, 1, "#555"); r(4, 2, 1, 1, "#555"); r(6, 2, 1, 1, "#555"); }
  else if (g === "dive") { r(3, 0, 3, 6, "#a6f0ff"); r(1, 4, 7, 2, "#a6f0ff"); r(3, 6, 3, 1, "#a6f0ff"); r(0, 8, 9, 1, "#3fb6c4"); }
  else if (g === "sleep") { r(0, 4, 9, 3, "#c9a6ff"); r(0, 3, 1, 5, P.woodL); r(8, 3, 1, 5, P.woodL); r(5, 0, 3, 1, "#fff"); r(7, 1, 1, 1, "#fff"); r(5, 2, 3, 1, "#fff"); }
  else if (g === "board") { r(0, 0, 9, 8, P.woodL); r(1, 1, 7, 6, "#5e3a20"); r(2, 2, 5, 1, "#fff"); r(2, 4, 4, 1, "#fff"); r(4, 8, 1, 1, P.woodD); }
  else if (g === "bell") { r(3, 0, 3, 1, P.yellowD); r(2, 1, 5, 5, P.yellow); r(1, 6, 7, 1, P.yellowD); r(4, 7, 1, 2, P.yellowD); }
}
// phone icon (bottom-left, all hubs + the pre-open raft): returns its rect for clicks
export const PHONE_BTN = { x: 6, y: H - 34, w: 22, h: 28 };
export function drawPhoneIcon(unread = 0, t = 0) {
  const u = screen.ui, b = PHONE_BTN;
  panel(b.x, b.y, b.w, b.h, { fill: "#140a06", border: "#f3d27a", r: 5, bw: 1.2 });
  panel(b.x + 3, b.y + 4, b.w - 6, b.h - 9, { fill: "#14284a", border: false, r: 2 });
  panel(b.x + b.w / 2 - 4, b.y + b.h - 4, 8, 1.5, { fill: "rgba(255,255,255,.5)", border: false, r: 1 });
  if (unread > 0) { panel(b.x + b.w - 7, b.y - 4, 10, 9, { fill: "#d94a3d", border: "#fff", r: 4, bw: 0.8 }); txt(String(unread), b.x + b.w - 2, b.y + 3, { size: 6.5, align: "center", color: "#fff", weight: 900 }); }
  panel(b.x + b.w + 3, b.y + 9, 11, 10, { fill: "#ffe9c4", border: false, r: 2.5 });
  txt("T", b.x + b.w + 8.5, b.y + 17, { size: 7.5, align: "center", color: "#2a1608", weight: 900 });
}

export class DockHub {
  // opts: { phase: "dawn" | "night", day, leftover (night: tonight's leftovers, mutated by sales), last (night of the
  //         final day), onDive(), onSleep({ bought }), openPhone(), meta (meta.js module) }
  constructor(contract, opts = {}) {
    this.c = contract; this.o = opts; this.phase = opts.phase === "night" ? "night" : "dawn";
    this.t = 0; this.p = { x: 4.2, z: 1.2, vx: 0, vz: 0, face: 1, walk: 0 };
    this.cs = { t: 0, cam: { x: 0, y: -HORIZON }, v: { sunUp: 0.6 } };
    this.overlay = null; this.msg = null; this.confirm = 0; this.bought = {}; this.leftover = Array.isArray(opts.leftover) ? opts.leftover : [];
    this.gulls = Array.from({ length: 4 }, (_, i) => ({ x: 60 + i * 110, y: 34 + (i % 2) * 14, v: 8 + i * 3, ph: i }));
    // interactables (x along the deck/dock; the tag floats above `top` screen px over the object)
    this.spots = [
      { id: "batu", x: 1.4, label: "Nói chuyện", glyph: "talk", col: "#e8c8ff", top: 34 },
      { id: this.phase === "dawn" ? "dive" : "sleep", x: this.phase === "dawn" ? 8.2 : 6.4, label: this.phase === "dawn" ? "Lặn ▶" : opts.last ? "Đi ngủ — tổng kết ▶" : "Đi ngủ ▶", glyph: this.phase === "dawn" ? "dive" : "sleep", col: this.phase === "dawn" ? "#a6f0ff" : "#c9a6ff", top: 30 },
      { id: "shop", x: 14.6, label: "Cửa hàng", glyph: "shop", col: "#ffd23f", top: 40 },
    ];
    this._click = null;
    this._onDown = (e) => {
      const pc = screen.pc; if (!pc?.getBoundingClientRect) return;
      const r = pc.getBoundingClientRect(); this._click = { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H };
    };
    addEventListener("pointerdown", this._onDown);
    this.hintT = 5;
    music(this.phase === "dawn" ? "theme" : "theme");
  }
  get menuOpen() { return !!this.overlay; }
  dispose() { removeEventListener("pointerdown", this._onDown); }
  sx(x) { return Math.round(X0 + x * XS); }
  sy(z) { return Math.round(Y0 - z * ZS); }
  near() {
    let best = null, bd = 1.3;
    for (const s of this.spots) { const d = Math.abs(s.x - this.p.x); if (d <= bd) { bd = d; best = s; } }
    return best;
  }
  use(s) {
    if (s.id === "shop") return this.openShop();
    if (s.id === "batu") return this.openBaTu();
    if (s.id === "dive") { sfx("select"); this.dispose(); return this.o.onDive?.(); }
    if (s.id === "sleep") {
      if (this.confirm <= 0) { this.confirm = 3; sfx("click"); this.msg = { text: "Nhấn E lần nữa để đi ngủ (kết thúc ngày)", col: "#c9a6ff", life: 3 }; return; }
      sfx("select"); this.dispose(); return this.o.onSleep?.({ bought: this.bought });
    }
  }
  openShop() {
    const deliverDay = this.phase === "dawn" ? progress.save.day + 1 : progress.save.day; // always "tomorrow evening"
    this.overlay = new ShopPopup(this.c, { phase: this.phase, leftover: this.leftover, deliverDay, tab: this.phase === "night" && this.leftover.length ? 1 : 0,
      onClose: (r) => { for (const [k, n] of Object.entries(r?.bought || {})) this.bought[k] = (this.bought[k] || 0) + n; } });
  }
  openBaTu() {
    const f = this.o.meta?.openBaTuDialog;
    if (typeof f !== "function") { this.msg = { text: "Bà Tư đang nhóm bếp…", col: "#e8c8ff", life: 2 }; return; }
    try { this.overlay = f(() => {}); sfx("select"); } catch (e) { this.overlay = null; }
  }
  update(dt) {
    this.t += dt; this.cs.t = this.t; this.cs.cam.x += dt * 4; // market boats drift past (riverWorld parallax)
    for (const g of this.gulls) { g.x += g.v * dt; if (g.x > W + 20) { g.x = -20; g.y = 26 + Math.random() * 30; } }
    if (this.msg) { this.msg.life -= dt; if (this.msg.life <= 0) this.msg = null; }
    if (this.confirm > 0) this.confirm -= dt;
    if (this.overlay) {
      const ov = this.overlay;
      try { ov.update(dt); } catch (e) { console.warn("hub overlay", e); ov.done = true; }
      if (ov.done && this.overlay === ov) this.overlay = null;
      this._click = null; return;
    }
    if (this._click) { const c = this._click, b = PHONE_BTN; this._click = null; if (c.x >= b.x && c.x <= b.x + b.w + 16 && c.y >= b.y && c.y <= b.y + b.h) { this.o.openPhone?.(); return; } }
    const p = this.p; let [mx, mz] = input.axis(); mz = -mz;
    if (mx || mz) { const n = Math.hypot(mx, mz) || 1; mx /= n; mz /= n; this.hintT = 0; }
    p.vx = lerp(p.vx, mx * 4, 0.25); p.vz = lerp(p.vz, mz * 2.5, 0.25);
    p.x = clamp(p.x + p.vx * dt, 0.4, 15.4); p.z = clamp(p.z + p.vz * dt, 0.2, 2.4);
    if (Math.abs(mx) > 0.01) p.face = mx > 0 ? 1 : -1;
    p.walk = mx || mz ? p.walk + dt : 0;
    if (this.hintT > 0) this.hintT -= dt;
    if (input.hit("interact") || input.hit("confirm") || input.hit("catch")) { const s = this.near(); if (s) this.use(s); }
  }
  // ---- draw ----
  draw() {
    const c = screen.px, t = this.t, night = this.phase === "night";
    c.imageSmoothingEnabled = false;
    riverWorld(c, this.cs, night ? "night" : "dawn");
    const lights = [];
    // gulls (dawn) / fireflies (night)
    if (!night) for (const g of this.gulls) { const f = Math.sin(t * 8 + g.ph) > 0 ? 1 : 0; R(c, g.x - 3, g.y + f, 3, 1, "#fff"); R(c, g.x, g.y + 1, 1, 1, "#fff"); R(c, g.x + 1, g.y + f, 3, 1, "#fff"); }
    else for (let i = 0; i < 7; i++) { const x = (i * 71 + Math.sin(t * 0.7 + i) * 20) % W, y = 120 + Math.sin(t + i * 2) * 8 + (i % 3) * 10; R(c, x, y, 1, 1, `rgba(255,240,140,${0.4 + 0.4 * Math.sin(t * 3 + i)})`); }
    // near water band under the boats
    const wy = 196;
    // silty Mekong water (phù sa): warm brown by day, deep umber with a cool tint at night
    { const g = c.createLinearGradient(0, wy, 0, H); if (night) { g.addColorStop(0, "#2a2030"); g.addColorStop(1, "#140e16"); } else { g.addColorStop(0, "#9c7a4c"); g.addColorStop(1, "#6a4e30"); } c.fillStyle = g; c.fillRect(0, wy, W, H - wy);
      c.fillStyle = night ? "rgba(255,190,110,.10)" : "rgba(255,236,190,.18)"; for (let i = 0; i < 26; i++) c.fillRect(((i * 37 + t * 9) % W) | 0, wy + 4 + ((i * 23) % (H - wy - 8)), 6 + (i % 3) * 4, 1); }
    for (let i = 0; i < 9; i++) ripple(c, 20 + i * 56, wy + 18 + (i % 3) * 14, t, i * 0.17);
    // a passing sampan in front (ambient life)
    const sp = ((t * 14) % (W + 160)) - 80; sampan(c, W - sp, wy + 30, -1, t, 0.7, { roof: "#6b3d22", beo: 2 });
    // the wooden dock (left) — Bà Tư sits by her little stove
    const dy = this.sy(0.6);
    R(c, 0, dy - 34, this.sx(3.2), 6, P.woodL); R(c, 0, dy - 28, this.sx(3.2), 2, P.woodD);
    for (let x = 6; x < this.sx(3.2); x += 18) R(c, x, dy - 28, 3, 40, P.woodD);
    // our ghe (centre): long hull, roof over the stern, gear rack, crates, lanterns, ladder on the side
    const gx0 = this.sx(3.0), gx1 = this.sx(12.6), gy = this.sy(0) + 2, bob = Math.round(Math.sin(t * 1.4));
    c.fillStyle = P.woodD; c.beginPath(); c.moveTo(gx0 - 8, gy - 34 + bob); c.lineTo(gx1 + 14, gy - 40 + bob); c.lineTo(gx1 - 6, gy + 4 + bob); c.lineTo(gx0 + 8, gy + 4 + bob); c.closePath(); c.fill();
    R(c, gx0, gy - 30 + bob, gx1 - gx0, 4, P.wood); R(c, gx0 - 4, gy - 34 + bob, gx1 - gx0 + 12, 2, P.red);
    R(c, gx1 - 2, gy - 30 + bob, 8, 6, P.white); R(c, gx1 + 1, gy - 29 + bob, 4, 4, P.ink); // painted bow eye
    for (let x = gx0 + 6; x < gx1; x += 16) R(c, x, gy - 26 + bob, 1, 26, "rgba(0,0,0,.18)");
    // roof (mui ghe) over the stern
    c.fillStyle = "#6b3d22"; c.beginPath(); c.moveTo(gx0 + 10, gy - 34 + bob); c.quadraticCurveTo(gx0 + 70, gy - 96 + bob, gx0 + 130, gy - 34 + bob); c.fill();
    c.fillStyle = "#8a5a33"; c.beginPath(); c.moveTo(gx0 + 20, gy - 34 + bob); c.quadraticCurveTo(gx0 + 70, gy - 84 + bob, gx0 + 120, gy - 34 + bob); c.fill();
    // hammock under the roof (night: the sleep spot)
    const hx = this.sx(6.4); c.strokeStyle = night ? "#c9a6ff" : "#b38ad8"; c.lineWidth = 2; c.beginPath(); c.moveTo(hx - 22, gy - 62 + bob); c.quadraticCurveTo(hx, gy - 42 + bob, hx + 22, gy - 62 + bob); c.stroke();
    // diving gear rack + crates + ladder
    const rx = this.sx(10.2); R(c, rx - 10, gy - 60 + bob, 20, 2, P.woodD); R(c, rx - 10, gy - 60 + bob, 2, 26, P.woodD); R(c, rx + 8, gy - 60 + bob, 2, 26, P.woodD);
    R(c, rx - 6, gy - 57 + bob, 5, 12, "#3fb6c4"); R(c, rx - 5, gy - 56 + bob, 1, 10, "#a6f0ff"); R(c, rx + 1, gy - 56 + bob, 6, 4, P.mask); R(c, rx + 2, gy - 55 + bob, 4, 2, P.lens); R(c, rx + 1, gy - 48 + bob, 3, 8, P.orange); R(c, rx + 4, gy - 48 + bob, 3, 8, P.orange);
    for (const [cx, w, col] of [[11.6, 14, "#a0703e"], [12.1, 10, "#8a5a33"]]) { const x = this.sx(cx); R(c, x - w / 2, gy - 34 - w * 0.8 + bob, w, w * 0.8, col); R(c, x - w / 2, gy - 34 - w * 0.4 + bob, w, 1, P.woodD); }
    if (!night) { const lx = this.sx(8.2); for (let k = 0; k < 6; k++) R(c, lx - 4, gy - 28 + k * 6 + bob, 9, 1, P.woodL); R(c, lx - 4, gy - 30 + bob, 1, 38, P.woodL); R(c, lx + 4, gy - 30 + bob, 1, 38, P.woodL); }
    lantern(c, gx0 + 22, gy - 70 + bob, t, P.red); lantern(c, gx0 + 118, gy - 70 + bob, t, P.orange); lantern(c, rx + 30, gy - 56 + bob, t, P.red);
    lights.push([gx0 + 22, gy - 62, 22], [gx0 + 118, gy - 62, 22], [rx + 30, gy - 48, 18]);
    // Chú Sáu's market boat alongside (right) with a cây bẹo of goods; Chú Sáu idles (stretches, waves)
    const mx = this.sx(14.8), my = this.sy(0) + 6, mb = Math.round(Math.sin(t * 1.7 + 1));
    ghe(c, mx, my + mb, 1.25, { beo: 1, roof: "#7a4a2a" });
    for (let i = 0; i < 5; i++) R(c, mx - 26 + i * 7, my - 14 + mb, 5, 4, [P.orange, P.yellow, P.leafL, P.pink, "#3fb6c4"][i]);
    const near = this.near(), wave = near?.id === "shop" || Math.sin(t * 0.9) > 0.8;
    personSide(c, mx + 10, my - 9 + mb, { face: -1, shirt: "#3f9a4a", pants: "#3a3a44", hat: true, arm: wave ? "wave" : Math.sin(t * 0.5) > 0 ? "talk" : null, walk: 0, t });
    lantern(c, mx - 18, my - 50 + mb, t, P.orange); lights.push([mx - 18, my - 42, 20]);
    // Bà Tư on the dock by a clay pot
    const bx = this.sx(1.4), by = dy - 34;
    R(c, bx + 12, by - 7, 9, 7, "#8a4a2a"); R(c, bx + 13, by - 9, 7, 2, "#5e3a20"); steam(c, bx + 16, by - 10, t, 2, 8);
    personSide(c, bx, by, { face: 1, shirt: "#7a4fa0", pants: "#3a2a4a", hair: "#c9c2d4", bun: true, bunTie: P.red, apron: true, arm: near?.id === "batu" ? "wave" : "stir", t });
    // Út Sen (player): on the dock left of x=3, on the ghe deck otherwise
    const p = this.p, onDock = p.x < 3.1, px = this.sx(p.x), py = onDock ? dy - 34 + Math.round(p.z) : this.sy(p.z) - 30 + bob;
    personSide(c, px, py, { face: p.face, shirt: P.suit, hair: P.hair, bun: true, walk: p.walk, t });
    if (night) { c.fillStyle = "rgba(10,14,40,.28)"; c.fillRect(0, 0, W, H); for (const L of lights) glow(c, L[0], L[1], L[2], 0.16); }
    else for (const L of lights) glow(c, L[0], L[1], L[2], 0.06);
    this.drawUI(near, onDock ? dy - 34 : this.sy(0) - 30);
    if (this.overlay) { try { this.overlay.draw(); } catch (e) { console.warn("hub overlay draw", e); } }
  }
  drawUI(near) {
    const t = this.t, s = progress.save, night = this.phase === "night";
    if (!this.overlay) for (const sp of this.spots) {
      const x = this.sx(sp.x), isNear = near === sp, y = (sp.id === "batu" ? this.sy(0.6) - 34 : this.sy(0) - 30) - sp.top - (sp.id === "shop" ? 10 : 0);
      if (isNear) promptTag(x, y, "E", sp.id === "sleep" && this.confirm > 0 ? "Nhấn E lần nữa" : sp.label, sp.col, sp.glyph, 1, t);
      else { const a = highContrast ? 0.9 : 0.55; panel(x - 5, y - 9, 10, 10, { fill: "rgba(24,14,8,.8)", border: sp.col, r: 5, alpha: a }); txt("!", x, y - 1.5, { size: 7.5, align: "center", color: sp.col, weight: 900, alpha: a }); }
    }
    // top-left: day + wallet
    panel(6, 5, 112, 15, { fill: "rgba(42,24,14,.88)", border: "#e8b04a", r: 6 });
    txt(`${night ? "Đêm" : "Sáng"} · Ngày ${night ? s.day - 1 : s.day}`, 12, 15.5, { size: 8, color: "#ffd23a", weight: 900 });
    txt(`Ví ${s.money | 0}k`, 112, 15.5, { size: 8, align: "right", color: "#ffe14d", weight: 900 });
    { let oxy = "?"; try { oxy = progress.stats(this.c).oxygenMax; } catch (e) {} // today's dive / shift card (gui_tuning.js)
      panel(6, 22, 146, 13, { fill: "rgba(8,20,38,.82)", border: "#7ac0ff", r: 5 });
      txt(night ? `Quán tối ${fmtClock(SERVICE_TIME_S)}` : `Lặn ${fmtClock(DIVE_TIME_S)} · O₂ ${oxy}s · ${MAP_WIDTH_M}×${MAP_DEPTH_M}m`, 12, 31.5, { size: 7, color: "#bff3ff", weight: 800 }); }
    // top-right: today's plan / needed list (dawn) or tomorrow's plan + deliveries (night)
    const day = s.day, plan = planFor(this.c, day), ing = plan ? Object.entries(plan.ingredients || {}) : [];
    const due = dueOn(s.pendingDelivery, night ? day : day).filter((it) => (it.day ?? day) <= day);
    const tom = (s.pendingDelivery || []).filter((it) => it.day != null && it.day > day);
    const cw = 150, ch = 18 + Math.max(1, Math.ceil(ing.length / 2)) * 11 + (due.length || tom.length ? 12 : 0) + (night && this.leftover.length ? 11 : 0), cx = W - cw - 6;
    panel(cx, 5, cw, ch, { fill: "rgba(8,20,38,.86)", border: "#7ac0ff", r: 6 });
    txt(night ? `NGÀY MAI (NGÀY ${day}) CẦN` : `HÔM NAY CẦN LẤY`, cx + 6, 14, { size: 7, color: "#9fd8ff", weight: 900 });
    const u = screen.ui; u.imageSmoothingEnabled = false;
    if (!ing.length) txt(plan ? "—" : "Lặn kiếm thật nhiều!", cx + 6, 25, { size: 7, color: "#fff", weight: 800 });
    ing.forEach(([k, n], i) => { const x = cx + 6 + (i % 2) * 72, y = 17 + Math.floor(i / 2) * 11; u.drawImage(icon(k), x, y, 9, 9); txt(`${ucfirst(kindName(k))} ×${n}`, x + 12, y + 8, { size: 7, color: "#fff", weight: 800 }); });
    let yy = 18 + Math.max(1, Math.ceil(ing.length / 2)) * 11 + 7;
    if (due.length && !night) { txt("Chú Sáu giao tối nay: " + deliveryText(due), cx + 6, yy, { size: 7, color: "#d8ffc0", weight: 800 }); yy += 11; }
    else if (tom.length || (night && due.length)) { txt("Giao tối mai: " + deliveryText(night ? due : tom), cx + 6, yy, { size: 7, color: "#d8ffc0", weight: 800 }); yy += 11; }
    if (night && this.leftover.length) txt(`Đồ dư tối nay: ${this.leftover.length} (bán cho Chú Sáu)`, cx + 6, yy, { size: 7, color: "#ffd23f", weight: 800 });
    // phone icon bottom-left
    let unread = 0; try { unread = this.o.meta?.unreadCount?.() || 0; } catch (e) {}
    drawPhoneIcon(unread, t);
    if (this.msg) txt(this.msg.text, W / 2, H - 22, { size: 9, align: "center", color: this.msg.col, weight: 900, stroke: "#1a1220", sw: 2.5 });
    if (this.hintT > 0 && !this.overlay) txt(night ? "Đêm trên ghe: ghé Chú Sáu bán đồ dư, đặt hàng mai, rồi lên võng ngủ" : "Sáng ở bến chợ nổi: ghé Chú Sáu, hỏi Bà Tư, rồi xuống thang để lặn", W / 2, 50, { size: 8.5, align: "center", color: "#fff", weight: 900, stroke: "#1a1220", sw: 2.5, alpha: clamp(this.hintT, 0, 1) });
    txt("←→ đi · E/Enter dùng · T điện thoại · Esc/P tạm dừng · H tương phản", W / 2, H - 4, { size: 7, align: "center", color: "rgba(255,233,196,.7)", weight: 700, stroke: "rgba(10,8,20,.6)", sw: 2 });
  }
}
