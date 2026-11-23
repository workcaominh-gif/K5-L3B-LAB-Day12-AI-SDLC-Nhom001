// MEME KIT — over-the-top "Dave the Diver" reaction beats for cutscenes. Original pixel art drawn in code + synth sound
// (meme_sfx.js); no copyrighted images or audio. Drawn on the UI canvas (screen.ui) above the cutscene bg and cards, below
// captions / dialogue / skip hint / fade, so a `say` line can play over a reaction.
//
// ---------------------------------------------------------------------------------------------------------------------
// USE IN A CUTSCENE SCRIPT (cutscene.js steps)
//   { meme: "<type>", ...options }      play a meme beat. Blocks the timeline for its `dur` unless told otherwise.
//   { msfx: "<sound>", delay?, dur? }    play one meme sound now (names: see meme_sfx.js: vineboom scratch airhorn choir
//                                        whoosh_hit dundun sparkle kaching sadtrombone boing crack stab slowmo drip tick
//                                        sprinkle)
//   { meme: "clear" }                   remove every running meme now
//   { opts: { skipAny: true, hint } }   change Cutscene options mid-script (e.g. "any key skips" for short scenes)
//   { say: ..., auto: true | seconds, cps: 42 }   (cutscene.js) dialogue line that advances by itself after it is read
//
// COMMON OPTIONS (every type)
//   dur: seconds the effect stays on screen            hold: seconds the timeline waits (default = dur; 0 = don't wait)
//   async: true  → same as hold: 0 (fire and forget, e.g. a galaxy behind the next `say` line)
//   who: "sen" | "ba" | "khach" | "sau"  big pixel portrait as the subject      item: ingredient kind (icon) as subject
//   dish: dish id (dish icon) as subject      at: [x, y] screen point (480×270) when the effect targets the scene itself
//   art: (g, k) => draw  custom subject drawn in pixel units with its bottom-centre at (0, 0), about 24 px tall (e.g. a
//        raft.js personSide staff sprite); k = the meme's own time. face: { eyes: [[x, y], [x, y]], mouth: [x, y] } in
//        that 24×24 box (0..24, bottom-centre at (12, 24)) lets shades / star eyes / tears / sweat land on an art subject
//   on: "face" (the last speaker's portrait) | "sen" | "ba" | ... | "center" | [x, y]   shorthand for who / at
//   size: subject scale (screen px per portrait px)    text / sub: strings (use "\n" for a second line)
//   sound: false → silent (each type has its own synth sound)
//
// TYPES (default dur) — options — one-line example
//   vineboom (1.3) snap-zoom on a face / point, desaturate, deep boom, shake. zoom (2.6, for `at`), text
//       { meme: "vineboom", on: "face", text: "…" }      { meme: "vineboom", at: [214, 160], zoom: 3 }
//   freeze (3.4)  record scratch + sepia freeze-frame + narrator box. text, name (narrator tag), me: [x, y] + meLabel
//       { meme: "freeze", me: [196, 160] }   (default text: "Ừ, là tui đó. Chắc bạn đang thắc mắc sao tui ra nông nỗi này…")
//   shades (2.6)  pixel "deal with it" sunglasses step down onto the face, then impact text. text ("ĐỈNH CỦA CHÓP"), sub, land
//       { meme: "shades", who: "sen" }        (without who: at: [x, y], px: pixel size → glasses land on a scene sprite)
//   impact (1.4)  giant tilted outlined text + speed lines + starburst + shake. text, sub, col, stroke, size, rot, bg:false,
//                 bgCol, vhs:true (scanlines + ◀◀ look)
//       { meme: "impact", text: "LẶN THÔI!!", col: "#7ee8ff" }
//   ascend (3.2)  heavenly beam + choir, subject floats up with halo and sparkles. text, stars: true (galaxy star eyes)
//       { meme: "ascend", who: "ba", text: "NGON XỈU UP XỈU DOWN" }      { meme: "ascend", who: "ba", stars: true }
//   galaxy (3.0)  background becomes a swirling rainbow galaxy, subject with star eyes. text
//       { meme: "galaxy", item: "ca_loc_kl", text: "VŨ TRỤ CÁ LÓC" }
//   tears (2.8)   comic waterfall tears + gloom lines + puddle, sad trombone. text (default "Ối dồi ôi…"), happy: true (pink
//                 sunburst instead of gloom: tears of joy), sound: "<msfx name>" (instead of the sad trombone)
//       { meme: "tears", who: "sen", text: "Khum có cá…" }
//   sweat (1.6)   giant sweat drop slides down + awkward "…". text
//       { meme: "sweat", who: "sen" }          { meme: "sweat", at: [214, 180] }
//   shock (1.4)   "!!" + screen-crack lines + stab. text ("!!"), at (crack origin)
//       { meme: "shock", who: "ba" }
//   airhorn (2.2) three airhorn blasts, confetti from both corners, rainbow flashing text. text ("MÃI ĐỈNH"), sub
//       { meme: "airhorn", text: "MÃI ĐỈNH" }
//   stonks (2.4) / notstonks (2.6)  chart arrow shoots up (ka-ching, coin rain) / dives down (sad trombone). text, amount
//       { meme: "stonks", amount: "+350k" }    { meme: "notstonks", amount: "-120k" }   (notstonks text: "CÒN CÁI NỊT")
//   slowmo (3.4)  letterboxed slow-mo walk away from an explosion (sunglasses on; shades:false to remove). text
//       { meme: "slowmo", who: "sen", text: "Người ngầu không ngoái lại nhìn" }
//   chibi (1.0)   squash-and-stretch chibi bounce with a sparkle, over the scene. text, at (bottom-centre)
//       { meme: "chibi", who: "sen", at: [400, 230], text: "hihi" }
//   kanji (2.8)   huge brush words behind the subject, flame or wave backdrop, "dun dun duuun". text, sub, bg: "flames"|"waves",
//                 col (ink), rim (outline)
//       { meme: "kanji", who: "ba", text: "LỬA", sub: "Bà Tư · 40 năm giữ lửa", bg: "flames" }
//   saltbae (1.8) moody spotlight, a raised elbow drops in from the top and flicks salt off the fingertips onto the dish
//                 (grains slide down the forearm too), "rắc muối" sound. text ("RẮC MUỐI KIỂU CÁCH"), sub, dish / item
//                 (default: dish "" → a generic bowl), who (a portrait as the "dish", for laughs)
//       { meme: "saltbae", dish: "ca_loc_nuong_trui", text: "NGON BÁ CHÁY!!", sub: "Cá lóc nướng trui" }
//
// REDUCE MOTION (engine.reduceMotion): no snap zooms, no shakes, no flashes, no flicker; subjects stand still and every
// joke stays readable as text.
//
// OUTSIDE A CUTSCENE (plain scenes like DayResult): const L = new MemeLayer(); L.start({ meme: "airhorn" }); then call
// L.update(dt) in update() and L.draw() at the end of draw(). L.active is true while anything is on screen.
// ---------------------------------------------------------------------------------------------------------------------
import { W, H, screen, fx, ease, clamp, lerp, txt, panel, wrap, measure, reduceMotion } from "./engine.js";
import { portrait, icon, dishIcon } from "./art.js";
import { speedLines, halftone, confetti, sparkles, coinRain } from "./cutscene.js";
import { msfx } from "./meme_sfx.js";
import { sfx } from "./audio.js";

const RM = () => reduceMotion;
const hash = (i, s = 0) => { const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return x - Math.floor(x); };
const shake = (m, t = 0.35) => { if (!RM()) fx.shake(m, t); };
// portrait anchors in portrait pixels (24×24 art.js PORTRAITS): eye centres + mouth
const FACE = {
  sen: { eyes: [[8, 9], [15, 9]], mouth: [12, 12.5] },
  ba: { eyes: [[9.5, 9.5], [14.5, 9.5]], mouth: [13, 12.5] },
  khach: { eyes: [[9, 10.5], [15, 10.5]], mouth: [13, 14.5] },
};
FACE.sau = FACE.khach;
const hasSubject = (e) => !!(e.who || e.item || e.dish || e.art);
// "has a face" (portrait, or a custom art subject that gave face anchors): face overlays (glasses, star eyes, tears) apply
const isPortrait = (e) => (e.art ? !!e.face : !!e.who && !e.item && !e.dish);
const faceOf = (e) => (e.art ? e.face : FACE[e.who] || FACE.sen);
function subjImg(e) {
  try { if (e.item) return icon(e.item); if (e.dish) return dishIcon(e.dish); return portrait(FACE[e.who] ? e.who : "sen"); } catch (err) { return null; }
}
// draw the subject with its bottom-centre at (x, y), S screen px per portrait px (icons are scaled to the same 24-px box).
// fn(g, face) draws extra pixel art in portrait coordinates (0..24) inside the same transform.
function subject(u, e, x, y, S, o = {}, fn = null) {
  if (e.art) { // custom pixel subject: drawn in pixel units, bottom-centre at the origin, ~24 px tall
    u.save(); u.translate(Math.round(x), Math.round(y)); if (o.rot) u.rotate(o.rot); u.scale(S * (o.sx || 1), S * (o.sy || 1));
    u.imageSmoothingEnabled = false; if (o.alpha !== undefined) u.globalAlpha *= o.alpha;
    try { e.art(u, RM() ? 0 : e.k || 0); } catch (err) {}
    if (fn && e.face) { u.translate(-12, -24); fn(u, e.face); }
    u.restore(); return;
  }
  const im = subjImg(e); if (!im) return;
  const n = im.width || 24, k = (S * 24) / n;
  u.save(); u.translate(Math.round(x), Math.round(y)); if (o.rot) u.rotate(o.rot); u.scale(k * (o.sx || 1), k * (o.sy || 1));
  u.imageSmoothingEnabled = false; if (o.alpha !== undefined) u.globalAlpha *= o.alpha;
  if (o.shadow) { u.save(); u.globalAlpha *= 0.35; u.fillStyle = "#000"; u.fillRect(-n / 2 + 1, -n + 1, n, n - 1); u.restore(); }
  u.drawImage(im, -n / 2, -n, n, n);
  if (fn && isPortrait(e)) { u.scale(n / 24, n / 24); u.translate(-12, -24); fn(u, faceOf(e)); }
  u.restore();
}
// y offset (from the bottom) of the face centre, in portrait px
const faceUp = (e) => (e.art && e.face ? 24 - (e.face.eyes[0][1] + e.face.eyes[1][1]) / 2 : isPortrait(e) ? 14 : 12);
const fadeOut = (e, k, len = 0.18) => clamp((e.dur - k) / len, 0, 1) * clamp(k / 0.05 + (RM() ? 1 : 0.6), 0, 1);
function fitSize(str, size, maxW) { const w = measure(str, size, 900) * 1.08; return w > maxW ? Math.max(8, size * maxW / w) : size; }
// big outlined italic text with a chromatic split (no split under reduce motion)
function bigText(str, x, y, size, o = {}) {
  const rot = RM() ? 0 : o.rot ?? -0.08, sc = o.scale || 1, al = o.alpha ?? 1;
  if (!RM() && o.split !== false) {
    txt(str, x - 2, y, { size, italic: true, weight: 900, color: "rgba(255,40,90,.8)", align: "center", rot, scale: sc, alpha: al * 0.8 });
    txt(str, x + 2, y, { size, italic: true, weight: 900, color: "rgba(40,220,255,.8)", align: "center", rot, scale: sc, alpha: al * 0.8 });
  }
  txt(str, x, y, { size, italic: o.italic !== false, weight: 900, color: o.color || "#fff", stroke: o.stroke || "#1a1220", sw: o.sw || size * 0.2, align: "center", rot, scale: sc, alpha: al });
}
function lines(str) { return String(str ?? "").split("\n").filter((l) => l.length); }
function desat(u, amt = 1) { u.save(); u.globalCompositeOperation = "saturation"; u.globalAlpha *= amt; u.fillStyle = "#808080"; u.fillRect(0, 0, W, H); u.restore(); }
function vignette(u, a = 0.6, rgb = "0,0,0") {
  const g = u.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.62);
  g.addColorStop(0, `rgba(${rgb},0)`); g.addColorStop(1, `rgba(${rgb},${a})`); u.fillStyle = g; u.fillRect(0, 0, W, H);
}
function fill(u, col) { u.fillStyle = col; u.fillRect(0, 0, W, H); }
// k = time since the hit; before the hit (k < 0) nothing is drawn (a negative k used to give alpha > 1 = solid white)
function whiteFlash(u, k, len = 0.1, a = 0.85) { if (!RM() && k >= 0 && k < len) fill(u, `rgba(255,255,255,${(1 - k / len) * a})`); }
function rays(u, cx, cy, rot, col, n = 16, R = 520) {
  u.fillStyle = col;
  for (let i = 0; i < n; i++) { const a = rot + (i / n) * Math.PI * 2, w = Math.PI / n; u.beginPath(); u.moveTo(cx, cy); u.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); u.lineTo(cx + Math.cos(a + w) * R, cy + Math.sin(a + w) * R); u.fill(); }
}
function burst(u, cx, cy, r0, r1, n, col, rot = 0, sy = 0.55) {
  u.fillStyle = col; u.beginPath();
  for (let i = 0; i < n * 2; i++) { const a = rot + (i * Math.PI) / n, r = i % 2 ? r0 : r1 * (0.8 + 0.2 * hash(i, 3)); const px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r * sy; i ? u.lineTo(px, py) : u.moveTo(px, py); }
  u.closePath(); u.fill();
}
function gloom(u, col = "rgba(10,16,40,.55)", n = 20) { u.fillStyle = col; for (let i = 0; i < n; i++) u.fillRect(Math.round(i * (W / n) + hash(i, 4) * 8), 0, 2 + (i % 2), Math.round(30 + hash(i, 5) * 70)); }
function star4(u, x, y, r, col = "#fff") {
  u.fillStyle = col; u.beginPath(); u.moveTo(x, y - r); u.lineTo(x + r * 0.25, y - r * 0.25); u.lineTo(x + r, y); u.lineTo(x + r * 0.25, y + r * 0.25);
  u.lineTo(x, y + r); u.lineTo(x - r * 0.25, y + r * 0.25); u.lineTo(x - r, y); u.lineTo(x - r * 0.25, y - r * 0.25); u.closePath(); u.fill();
}
function dropShape(u, x, y, r, lw) {
  u.beginPath(); u.arc(x, y, r, 0, Math.PI); u.lineTo(x, y - r * 2.3); u.closePath();
  u.fillStyle = "#9fe4ff"; u.fill(); u.lineWidth = lw; u.strokeStyle = "#1a3050"; u.stroke();
  u.fillStyle = "rgba(255,255,255,.85)"; u.fillRect(x + r * 0.25, y - r * 0.6, r * 0.3, r * 0.5);
}
// classic pixel sunglasses, in pixel units, centred between two eyes at (lx, y) / (rx, y)
function glasses(g, lx, rx, y) {
  g.fillStyle = "#0b0b10";
  g.fillRect(lx - 3.5, y, rx - lx + 7, 1);
  for (const cx of [lx, rx]) { g.fillRect(cx - 3, y + 1, 6, 2); g.fillRect(cx - 2, y + 3, 4, 1); }
  g.fillStyle = "#fff"; for (const cx of [lx, rx]) { g.fillRect(cx - 2, y + 1, 1, 1); g.fillRect(cx - 1, y + 2, 1, 1); }
}
// what the cutscene drew this frame (the px canvas, or the ui canvas for layer:"ui" action cuts)
function srcCanvas(L) { const ui = L?.host?.o?.layer === "ui"; return ui ? { cv: screen.uc, k: screen.S } : { cv: screen.pc, k: 1 }; }
function zoomCopy(u, L, ax, ay, z, dx = 0) {
  const { cv, k } = srcCanvas(L); if (!cv) return;
  const sw = W / z, sh = H / z, sx = clamp(ax - sw / 2, 0, W - sw), sy = clamp(ay - sh / 2, 0, H - sh);
  u.imageSmoothingEnabled = false; u.drawImage(cv, sx * k, sy * k, sw * k, sh * k, dx, 0, W, H);
}
function grab(L) {
  try {
    const { cv, k } = srcCanvas(L); if (!cv) return null;
    const oc = document.createElement("canvas"); oc.width = W; oc.height = H;
    const g = oc.getContext("2d"); g.imageSmoothingEnabled = false; g.drawImage(cv, 0, 0, W * k, H * k, 0, 0, W, H); return oc;
  } catch (err) { return null; }
}
function cornerText(e, k, y = 30, col = "#fff", stroke = "#1a1220", size = 26, at = 0.15) {
  const ls = lines(e.text); if (!ls.length || k < at) return;
  const kk = RM() ? 1 : ease.out(clamp((k - at) / 0.14, 0, 1)), a = fadeOut(e, k);
  ls.forEach((l, i) => bigText(l, W / 2, y + i * size * 1.05, fitSize(l, size, W - 40), { scale: lerp(2, 1, kk), color: col, stroke, alpha: a, rot: -0.05 }));
}
function subText(e, k, y, at = 0.35, col = "#fff") {
  if (!e.sub || k < at) return;
  txt(e.sub, W / 2, y, { size: 10, align: "center", color: col, weight: 900, stroke: "rgba(10,6,20,.9)", sw: 3, alpha: clamp((k - at) * 4, 0, 1) * fadeOut(e, k) });
}

// ---------------------------------------------------------------------------------------------------------------------
const MEMES = {
  vineboom: {
    def: { dur: 1.3, zoom: 2.6 },
    start(e) { if (e.sound !== false) msfx("vineboom"); shake(6, 0.4); },
    draw(u, e, k, t, L) {
      u.globalAlpha = fadeOut(e, k, 0.15);
      const snap = RM() ? 1 : ease.out(clamp(k / 0.07, 0, 1)), wob = RM() ? 0 : Math.sin(k * 55) * 3 * Math.max(0, 1 - k * 4);
      if (hasSubject(e)) {
        fill(u, "#262626"); rays(u, W / 2, H / 2, RM() ? 0 : t * 0.15, "rgba(255,255,255,.07)", 14);
        const S = RM() ? e.size || 10 : lerp(3, e.size || 10, snap);
        subject(u, e, W / 2 + wob, H / 2 + faceUp(e) * S, S);
      } else { const [ax, ay] = e.at || [W / 2, H / 2]; zoomCopy(u, L, ax, ay, RM() ? 1 : lerp(1, e.zoom, snap), wob); }
      desat(u); vignette(u, 0.8);
      const ls = lines(e.text); ls.forEach((l, i) => txt(l, W / 2, H - 46 + i * 14, { size: 12, align: "center", color: "#fff", weight: 900, stroke: "#000", sw: 4, alpha: clamp((k - 0.15) * 5, 0, 1) * fadeOut(e, k) }));
    },
  },
  freeze: {
    def: { dur: 3.4, text: "Ừ, là tui đó. Chắc bạn đang thắc mắc sao tui ra nông nỗi này…", name: "ÚT SEN (kể)", meLabel: "tui nè" },
    start(e) { if (e.sound !== false) msfx("scratch"); },
    draw(u, e, k, t, L) {
      if (e.snap === undefined) e.snap = grab(L);
      u.globalAlpha = fadeOut(e, k, 0.2);
      if (e.snap) { u.imageSmoothingEnabled = false; u.drawImage(e.snap, 0, 0, W, H); } else fill(u, "#6a5236");
      desat(u); u.save(); u.globalCompositeOperation = "multiply"; u.fillStyle = "#eac590"; u.fillRect(0, 0, W, H); u.restore();
      whiteFlash(u, k, 0.12);
      if (!RM()) { // film scratches + grain, re-rolled 12×/s
        const f = Math.floor(t * 12);
        for (let i = 0; i < 4; i++) if (hash(f, i) > 0.45) { u.fillStyle = "rgba(60,36,14,.4)"; u.fillRect(Math.round(hash(f, i + 9) * W), 0, 1, H); }
        u.fillStyle = "rgba(40,24,8,.35)"; for (let i = 0; i < 70; i++) u.fillRect(Math.round(hash(f * 3 + i, 2) * W), Math.round(hash(f + i, 5) * H), 1, 1);
      }
      vignette(u, 0.6, "40,22,6");
      u.strokeStyle = "rgba(255,246,226,.92)"; u.lineWidth = 3; u.strokeRect(8, 8, W - 16, H - 16);
      txt("❚❚", 20, 26, { size: 12, color: "#fff6e2", weight: 900, stroke: "#3a2410", sw: 3, alpha: u.globalAlpha });
      if (e.me && k > 0.4) { // hand-drawn red circle + arrow on "me"
        const [mx, my] = e.me, p = RM() ? 1 : clamp((k - 0.4) / 0.35, 0, 1);
        u.strokeStyle = "#d4261c"; u.lineWidth = 2.5; u.beginPath();
        for (let i = 0; i <= 40 * p; i++) { const a = -1 + (i / 36) * Math.PI * 2, r = 20 + Math.sin(i * 0.7) * 1.5; const px = mx + Math.cos(a) * r * 1.1, py = my + Math.sin(a) * r * 0.9; i ? u.lineTo(px, py) : u.moveTo(px, py); }
        u.stroke();
        if (p >= 1) {
          const lx = clamp(mx + 70, 60, W - 60), ly = clamp(my - 46, 30, H - 90);
          u.beginPath(); u.moveTo(lx - 20, ly + 4); u.quadraticCurveTo(mx + 40, ly + 6, mx + 22, my - 12); u.stroke();
          u.beginPath(); u.moveTo(mx + 22, my - 12); u.lineTo(mx + 30, my - 14); u.moveTo(mx + 22, my - 12); u.lineTo(mx + 25, my - 4); u.stroke();
          txt(e.meLabel, lx - 16, ly + 2, { size: 13, color: "#d4261c", weight: 900, italic: true, stroke: "#fff3dc", sw: 3, rot: -0.08 });
        }
      }
      const n = RM() ? 999 : Math.floor(clamp((k - 0.35) * 40, 0, 999)), bx = 22, by = H - 66, bw = W - 44;
      panel(bx, by, bw, 44, { fill: "rgba(24,14,6,.9)", border: "#f3d9a8", r: 3, bw: 1.5, alpha: u.globalAlpha });
      txt(e.name, bx + 8, by - 3, { size: 8, color: "#f3d9a8", weight: 900, stroke: "#24140a", sw: 3, alpha: u.globalAlpha });
      wrap(e.text.slice(0, n), bw - 20, 10).slice(0, 3).forEach((l, i) => txt(l, bx + 10, by + 16 + i * 13, { size: 10, color: "#fff4dc", weight: 800, italic: true, alpha: u.globalAlpha }));
    },
  },
  shades: {
    def: { dur: 2.6, text: "ĐỈNH CỦA CHÓP", land: 0.9, who: null },
    start(e, L) {
      if (!e.who && !e.at && !e.item && !e.dish) e.who = "sen";
      e.land = RM() ? 0.05 : e.land;
      if (e.sound !== false) {
        if (!RM()) for (let i = 1; i < 6; i++) L.cue(e, (e.land * i) / 6, () => msfx("tick"));
        L.cue(e, Math.max(0, e.land - 0.16), () => msfx("whoosh_hit"));
        L.cue(e, e.land + 0.22, () => msfx("airhorn", { len: 0.13 })); L.cue(e, e.land + 0.4, () => msfx("airhorn", { len: 0.5 }));
      }
      L.cue(e, e.land, () => shake(6, 0.3));
    },
    draw(u, e, k, t, L) {
      const a = fadeOut(e, k); u.globalAlpha = a;
      const p = clamp(k / e.land, 0, 1);
      if (isPortrait(e)) {
        fill(u, "#ff8a2a"); rays(u, W / 2, H * 0.45, RM() ? 0 : t * 0.4, "rgba(255,226,110,.55)", 14); halftone(u, 0, 0, W, H, "rgba(120,30,0,.12)", 8, false);
        const S = e.size || 8;
        subject(u, e, W / 2, H + 8, S, {}, (g, F) => { const ey = (F.eyes[0][1] + F.eyes[1][1]) / 2 - 1.5; glasses(g, F.eyes[0][0], F.eyes[1][0], Math.round(lerp(-14, ey, p))); });
      } else {
        const [ax, ay] = e.at || [W / 2, H / 2], s = e.px || 2;
        u.save(); u.translate(ax, Math.round(lerp(-20, ay, p) / s) * s); u.scale(s, s); glasses(u, -3.5, 3.5, -1); u.restore();
      }
      whiteFlash(u, k - e.land, 0.08, 0.6);
      cornerText(e, k, 46, "#ffe14d", "#3a1410", 34, e.land + 0.2);
      subText(e, k, 82, e.land + 0.4);
    },
  },
  impact: {
    def: { dur: 1.4, text: "ĐỈNH!", col: "#ffe14d", stroke: "#1a1220", size: 48, rot: -0.1 },
    start(e, L) { if (e.sound !== false) msfx("whoosh_hit"); L.cue(e, 0.16, () => shake(7, 0.35)); },
    draw(u, e, k, t) {
      const a = fadeOut(e, k), [cx, cy] = e.at || [W / 2, H / 2]; u.globalAlpha = a;
      if (e.bg !== false) {
        fill(u, e.bgCol || "rgba(10,6,20,.6)");
        speedLines(u, cx, cy, RM() ? 0 : t * 3, "rgba(255,255,255,.32)", 34);
        burst(u, cx, cy, 70, 150, 14, "rgba(255,255,255,.16)", RM() ? 0 : t * 0.5);
      }
      if (e.vhs) { u.fillStyle = "rgba(0,0,0,.25)"; for (let y = 0; y < H; y += 3) u.fillRect(0, y, W, 1); if (!RM()) { const yy = (t * 90) % H; u.fillStyle = "rgba(255,255,255,.12)"; u.fillRect(0, yy, W, 6); } }
      whiteFlash(u, k - 0.16, 0.08, 0.5);
      const kk = RM() ? 1 : clamp((k - 0.04) / 0.12, 0, 1), jig = RM() ? 0 : Math.sin(k * 31) * 1.5 * Math.max(0, 1 - (k - 0.16) * 3);
      const sc = lerp(3, 1, ease.out(kk)), ls = lines(e.text), n = ls.length;
      ls.forEach((l, i) => { const s = fitSize(l, e.size, W - 30); bigText(l, cx + jig, cy + s * 0.35 + (i - (n - 1) / 2) * s * 1.02, s, { scale: sc, color: e.col, stroke: e.stroke, rot: e.rot, alpha: kk > 0 ? a : 0 }); });
      subText(e, k, cy + e.size * 0.35 + (n / 2) * e.size + 6, 0.3, e.subCol || "#fff");
    },
  },
  ascend: {
    def: { dur: 3.2, text: "NGON XỈU UP XỈU DOWN", who: null },
    start(e) { if (!hasSubject(e)) e.who = "sen"; if (e.sound !== false) { msfx("choir", { dur: e.dur }); msfx("sparkle", { delay: 0.5 }); } },
    draw(u, e, k, t) {
      const a = fadeOut(e, k, 0.3); u.globalAlpha = a;
      const p = clamp(k / e.dur, 0, 1), cx = W / 2;
      fill(u, `rgba(255,236,190,${0.6 * clamp(k * 3, 0, 1)})`);
      const bw = (RM() ? 1 : ease.out(clamp(k / 0.5, 0, 1))) * 170;
      const g = u.createLinearGradient(cx - bw / 2, 0, cx + bw / 2, 0);
      g.addColorStop(0, "rgba(255,255,240,0)"); g.addColorStop(0.5, "rgba(255,255,245,.92)"); g.addColorStop(1, "rgba(255,255,240,0)");
      u.fillStyle = g; u.beginPath(); u.moveTo(cx - bw * 0.3, 0); u.lineTo(cx + bw * 0.3, 0); u.lineTo(cx + bw / 2, H); u.lineTo(cx - bw / 2, H); u.fill();
      const S = e.size || 6, rise = RM() ? 30 : ease.inOut(p) * 80, sway = RM() ? 0 : Math.sin(k * 2.2) * 4, x = cx + sway, y = H + 22 - rise;
      const hx = x, hy = y - 24 * S - 4 + (RM() ? 0 : Math.sin(k * 3) * 2);
      u.strokeStyle = "#ffd23f"; u.lineWidth = 3; u.beginPath(); u.ellipse(hx, hy, 6 * S * 0.5, 1.4 * S * 0.5, 0, 0, Math.PI * 2); u.stroke();
      subject(u, e, x, y, S, {}, e.stars ? (gg, F) => { const pl = RM() ? 1 : 1 + Math.sin(k * 10) * 0.25; for (const [ex, ey] of F.eyes) { star4(gg, ex, ey, 2.4 * pl, "#fff"); star4(gg, ex, ey, 1.2 * pl, "#ffe14d"); } } : null);
      sparkles(u, x, y - 12 * S, RM() ? 1 : t, 20, 80, "#fffbe0"); u.globalAlpha = a;
      if (!RM()) for (let i = 0; i < 8; i++) { const fx2 = (hash(i, 1) * W + Math.sin(t + i) * 10), fy = ((hash(i, 2) * H + t * 25) % H); u.fillStyle = "rgba(255,255,255,.8)"; u.beginPath(); u.ellipse(fx2, fy, 3, 1.3, Math.sin(t * 2 + i), 0, Math.PI * 2); u.fill(); }
      const ls = lines(e.text);
      ls.forEach((l, i) => bigText(l, W / 2, 40 + i * 26, fitSize(l, 26, W - 40), { color: "#fff3b0", stroke: "#a0601a", rot: -0.04, split: false, alpha: clamp((k - 0.3) * 3, 0, 1) * a }));
    },
  },
  galaxy: {
    def: { dur: 3, text: "", who: null },
    start(e) { if (!hasSubject(e)) e.who = "sen"; if (e.sound !== false) { msfx("sparkle"); msfx("choir", { dur: Math.max(1.2, e.dur * 0.9), delay: 0.1 }); } },
    draw(u, e, k, t) {
      const a = fadeOut(e, k, 0.25); u.globalAlpha = a * clamp(k / 0.12 + (RM() ? 1 : 0), 0, 1);
      const cx = W / 2, cy = H * 0.46, rt = RM() ? 0 : t;
      const g = u.createRadialGradient(cx, cy, 8, cx, cy, W * 0.7); g.addColorStop(0, "#6a2aa8"); g.addColorStop(0.4, "#2a0c5a"); g.addColorStop(1, "#06021a"); u.fillStyle = g; u.fillRect(0, 0, W, H);
      for (let i = 0; i < 60; i++) { const tw = 0.4 + 0.6 * Math.abs(Math.sin(rt * 3 + i)); u.fillStyle = `rgba(255,255,255,${tw})`; u.fillRect(Math.round(hash(i, 8) * W), Math.round(hash(i, 9) * H), 1, 1); }
      for (let i = 0; i < 280; i++) {
        const f = i / 280, arm = i % 4, r = 6 + f * 300, ang = (arm * Math.PI) / 2 + f * 7 + rt * 0.9 + (hash(i, 1) - 0.5) * 0.3;
        u.fillStyle = `hsl(${(f * 360 + rt * 90) % 360},95%,${62 + (i % 3) * 8}%)`;
        u.fillRect(Math.round(cx + Math.cos(ang) * r), Math.round(cy + Math.sin(ang) * r * 0.6), 1 + (i % 3), 1 + (i % 3));
      }
      for (let j = 0; j < 4; j++) { const rr = RM() ? 60 + j * 60 : (k * 150 + j * 70) % 280; u.strokeStyle = `hsla(${(j * 90 + rt * 120) % 360},100%,65%,${0.5 * (1 - rr / 280)})`; u.lineWidth = 3; u.beginPath(); u.ellipse(cx, cy, rr, rr * 0.6, 0, 0, Math.PI * 2); u.stroke(); }
      const S = e.size || 7, pulse = RM() ? 1 : 1 + Math.sin(k * 10) * 0.25;
      subject(u, e, cx, H + 8, S, {}, (gg, F) => { for (const [ex, ey] of F.eyes) { star4(gg, ex, ey, 2.4 * pulse, "#fff"); star4(gg, ex, ey, 1.2 * pulse, "#ffe14d"); } });
      if (!isPortrait(e)) { sparkles(u, cx, H - 12 * S, rt, 14, 60, "#fff"); u.globalAlpha = a; }
      const ls = lines(e.text);
      ls.forEach((l, i) => bigText(l, W / 2, 40 + i * 28, fitSize(l, 28, W - 40), { color: `hsl(${(rt * 220) % 360},100%,72%)`, stroke: "#14062a", rot: -0.05, alpha: clamp((k - 0.2) * 4, 0, 1) * a }));
    },
  },
  tears: {
    def: { dur: 2.8, text: "Ối dồi ôi…", who: null },
    start(e) { if (!hasSubject(e)) e.who = "sen"; if (e.sound !== false) msfx(typeof e.sound === "string" ? e.sound : "sadtrombone"); },
    draw(u, e, k, t) {
      const a = fadeOut(e, k, 0.25); u.globalAlpha = a;
      const g = u.createLinearGradient(0, 0, 0, H);
      if (e.happy) { g.addColorStop(0, "#ff9ac0"); g.addColorStop(1, "#ffd98a"); } else { g.addColorStop(0, "#1c2f55"); g.addColorStop(1, "#3c6aa8"); }
      u.fillStyle = g; u.fillRect(0, 0, W, H);
      if (e.happy) { rays(u, W / 2, H * 0.4, RM() ? 0 : t * 0.3, "rgba(255,255,255,.22)", 14); sparkles(u, W / 2, H * 0.35, RM() ? 1 : t, 16, 200, "#fff"); u.globalAlpha = a; } else gloom(u);
      const S = e.size || 8, kk = RM() ? 0.5 : k * 1.8;
      subject(u, e, W / 2, H + 8, S, RM() ? {} : { sx: 1 + Math.sin(k * 20) * 0.01 }, (gg, F) => {
        F.eyes.forEach(([ex, ey], side) => {
          const s = side ? 1 : -1;
          gg.strokeStyle = "rgba(150,225,255,.9)"; gg.lineWidth = 2.2; gg.beginPath(); gg.moveTo(ex, ey + 0.5); gg.quadraticCurveTo(ex + s * 9, ey - 4, ex + s * 16, ey + 28); gg.stroke();
          gg.fillStyle = "#c8f2ff";
          for (let j = 0; j < 36; j++) { const ph = (kk + j / 36) % 1, dx = s * (1 + ph * 16 + hash(j, side) * 2), dy = ph * ph * 32 - ph * 5; gg.fillRect(ex + dx, ey + 1 + dy, 1.2, 1.2); }
        });
      });
      const ph = RM() ? 0.6 : clamp(k / e.dur, 0, 1), pyH = 6 + ph * 26;
      u.fillStyle = "rgba(120,205,255,.75)"; u.beginPath(); u.moveTo(0, H);
      for (let x = 0; x <= W; x += 8) u.lineTo(x, H - pyH + Math.sin(x / 20 + (RM() ? 0 : t * 4)) * 2);
      u.lineTo(W, H); u.fill();
      const ls = lines(e.text); ls.forEach((l, i) => bigText(l, W / 2, 40 + i * 28 + (RM() ? 0 : Math.sin(k * 3) * 2), fitSize(l, 28, W - 40), { color: "#d8f2ff", stroke: "#10203a", rot: 0.04, split: false, alpha: clamp((k - 0.25) * 4, 0, 1) * a }));
    },
  },
  sweat: {
    def: { dur: 1.6, text: "…" },
    start(e) { if (e.sound !== false) msfx("drip", { delay: 0.25 }); },
    draw(u, e, k, t) {
      const a = fadeOut(e, k); u.globalAlpha = a;
      const slide = RM() ? 0.4 : ease.in(clamp(k / 1.3, 0, 1));
      let tx = W / 2, ty = 44;
      if (hasSubject(e)) {
        fill(u, "rgba(196,212,236,.94)"); gloom(u, "rgba(40,60,110,.4)");
        const S = e.size || 7;
        subject(u, e, W / 2, H + 8, S, {}, (gg) => dropShape(gg, 20.5, 4 + slide * 7, 2.2, 0.35));
        if (!isPortrait(e)) dropShape(u, W / 2 + 12 * S, H - 22 * S + slide * 40, 16, 2.5);
      } else {
        const [ax, ay] = e.at || [W / 2, H / 2];
        dropShape(u, ax + 10, ay - 14 + slide * 16, e.r || 9, 1.8); tx = ax; ty = Math.max(30, ay - 40);
      }
      const str = e.text === "…" ? ".".repeat(1 + Math.min(2, Math.floor(k * 3))) : e.text;
      txt(str, tx, ty, { size: hasSubject(e) ? 24 : 14, align: "center", color: "#24305a", weight: 900, stroke: "#fff", sw: 4, alpha: clamp((k - 0.2) * 5, 0, 1) * a });
    },
  },
  shock: {
    def: { dur: 1.4, text: "!!" },
    start(e) { if (e.sound !== false) { msfx("stab"); msfx("crack", { delay: 0.05 }); } shake(9, 0.4); },
    draw(u, e, k, t) {
      const a = fadeOut(e, k); u.globalAlpha = a;
      const [ox, oy] = e.at || [W * 0.64, H * 0.36];
      if (hasSubject(e)) {
        fill(u, "#4a0812"); speedLines(u, W * 0.36, H * 0.5, RM() ? 0 : t * 4, "rgba(255,255,255,.3)", 30);
        const S = e.size || 8, jit = RM() ? 0 : Math.sin(k * 70) * 2 * Math.max(0, 1 - k * 3);
        subject(u, e, W * 0.36 + jit, H + 8, S, {}, (gg, F) => {
          for (const [ex, ey] of F.eyes) { gg.fillStyle = "#fff"; gg.fillRect(ex - 1.5, ey - 1.5, 3, 3); gg.fillStyle = "#000"; gg.fillRect(ex - 0.3, ey - 0.3, 0.6, 0.6); }
          gg.fillStyle = "#1a1220"; for (let i = 0; i < 3; i++) gg.fillRect(19 + i * 1.6, 1 - i * 0.8, 0.5, 2.5);
        });
      }
      whiteFlash(u, k, 0.08, 0.9);
      const grow = RM() ? 1 : ease.out(clamp(k / 0.1, 0, 1));
      for (let i = 0; i < 9; i++) {
        let x = ox, y = oy, ang = (i / 9) * Math.PI * 2 + hash(i, 1) * 0.5; const pts = [[x, y]];
        for (let s = 0; s < 5; s++) { ang += (hash(i, s + 2) - 0.5) * 0.9; const len = (14 + hash(i, s + 7) * 30) * grow; x += Math.cos(ang) * len; y += Math.sin(ang) * len; pts.push([x, y]); }
        for (const [lw, col] of [[3.5, "rgba(20,10,20,.7)"], [1.4, "#fff"]]) { u.lineWidth = lw; u.strokeStyle = col; u.beginPath(); pts.forEach(([px, py], j) => (j ? u.lineTo(px, py) : u.moveTo(px, py))); u.stroke(); }
      }
      const bounce = RM() ? 1 : 1 + 0.3 * Math.max(0, 1 - k * 4) * Math.abs(Math.sin(k * 25));
      bigText(e.text, ox + 30, oy + 10, 64, { scale: bounce, color: "#ff3b3b", stroke: "#fff", sw: 10, rot: 0.12, alpha: a });
      subText(e, k, oy + 40, 0.2);
    },
  },
  airhorn: {
    def: { dur: 2.2, text: "MÃI ĐỈNH" },
    start(e, L) {
      e.blasts = [[0, 0.16], [0.24, 0.16], [0.48, 0.7]]; e.last = 0;
      for (const [at, len] of e.blasts) L.cue(e, at, () => { if (e.sound !== false) msfx("airhorn", { len }); shake(5, 0.2); e.last = e.k; });
    },
    draw(u, e, k, t) {
      const a = fadeOut(e, k, 0.25); u.globalAlpha = a;
      if (!RM()) fill(u, `hsla(${(Math.floor(k * 12) * 47) % 360},90%,60%,.2)`);
      for (const [at] of e.blasts) { confetti(u, 30, H - 6, k - at, 34); confetti(u, W - 30, H - 6, k - at, 34); }
      u.globalAlpha = a;
      const kick = RM() ? 0 : Math.max(0, 1 - (k - (e.last || 0)) * 5);
      for (const dir of [-1, 1]) {
        u.save(); u.translate(W / 2 + dir * (W / 2 - 46), H - 40); u.rotate(dir * -0.7 + dir * kick * 0.1); u.scale(1 + kick * 0.15, 1 + kick * 0.15);
        u.fillStyle = "#d7262e"; u.fillRect(-7, 0, 14, 24); u.fillStyle = "#ff6a6a"; u.fillRect(-5, 2, 3, 20);
        u.fillStyle = "#8a96a4"; u.fillRect(-4, -5, 8, 5);
        u.fillStyle = "#d8dee6"; u.beginPath(); u.moveTo(-2, -5); u.lineTo(-9, -34); u.lineTo(9, -34); u.lineTo(2, -5); u.fill();
        u.fillStyle = "#f4f7fa"; u.fillRect(-10, -36, 20, 3);
        if (kick > 0) { u.strokeStyle = "#fff"; u.lineWidth = 2; for (let i = -1; i <= 1; i++) { u.beginPath(); u.moveTo(i * 8, -40); u.lineTo(i * 14, -40 - 14 * kick); u.stroke(); } }
        u.restore();
      }
      const str = lines(e.text)[0] || "", size = fitSize(str, 44, W - 60), sc = 1 + kick * 0.25, chars = [...str];
      const tw = measure(str, size, 900) * 1.05; let x = W / 2 - (tw * sc) / 2;
      chars.forEach((ch, i) => {
        const cw = measure(ch, size, 900) * 1.05 * sc, wob = RM() ? 0 : Math.sin(t * 12 + i) * 3;
        txt(ch, x + cw / 2, H / 2 + 10 + wob, { size: size * sc, align: "center", italic: true, weight: 900, color: RM() ? "#ffe14d" : `hsl(${(i * 40 + t * 500) % 360},100%,62%)`, stroke: "#1a1220", sw: size * 0.2, alpha: a });
        x += cw;
      });
      subText(e, k, H / 2 + 36, 0.3);
    },
  },
  stonks: {
    def: { dur: 2.4, text: "STONKS", amount: "", up: true, who: null },
    start(e) {
      if (!hasSubject(e)) e.who = "sen";
      if (e.sound === false) return;
      if (e.up) { sfx("riser", 0.8); msfx("kaching", { delay: 0.65 }); } else { msfx("drip"); msfx("sadtrombone", { delay: 0.4 }); }
    },
    draw(u, e, k, t) {
      const a = fadeOut(e, k, 0.25); u.globalAlpha = a;
      fill(u, "rgba(6,14,30,.9)"); u.fillStyle = "rgba(80,140,200,.18)";
      for (let x = 0; x < W; x += 24) u.fillRect(x, 0, 1, H); for (let y = 0; y < H; y += 24) u.fillRect(0, y, W, 1);
      const up = e.up, col = up ? "#3dff7a" : "#ff3b4a", n = 9, pts = [];
      for (let i = 0; i < n; i++) { const f = i / (n - 1), base = up ? lerp(H - 40, 46, f) : lerp(60, H - 50, f); pts.push([lerp(150, W - 40, f), base + (i % 2 && i < n - 1 ? (up ? 26 : -26) : 0)]); }
      const p = RM() ? 1 : ease.inOut(clamp(k / 0.8, 0, 1)), segs = (n - 1) * p, m = Math.floor(segs);
      const path = pts.slice(0, m + 1); if (m < n - 1) { const [x0, y0] = pts[m], [x1, y1] = pts[m + 1], f = segs - m; path.push([lerp(x0, x1, f), lerp(y0, y1, f)]); }
      for (const [lw, c] of [[9, "#08101e"], [5, col]]) { u.lineWidth = lw; u.lineJoin = "round"; u.strokeStyle = c; u.beginPath(); path.forEach(([x, y], j) => (j ? u.lineTo(x, y) : u.moveTo(x, y))); u.stroke(); }
      if (path.length > 1) {
        const [x1, y1] = path[path.length - 1], [x0, y0] = path[path.length - 2], ang = Math.atan2(y1 - y0, x1 - x0);
        u.save(); u.translate(x1, y1); u.rotate(ang); u.fillStyle = col; u.strokeStyle = "#08101e"; u.lineWidth = 2;
        u.beginPath(); u.moveTo(12, 0); u.lineTo(-8, -10); u.lineTo(-8, 10); u.closePath(); u.fill(); u.stroke(); u.restore();
      }
      if (up && k > 0.8) coinRain(u, k - 0.8, 22);
      subject(u, e, 74, H + 4, e.size || 4.5, { rot: up ? -0.05 : 0.3, shadow: true });
      if (k > 0.8 || RM()) {
        const kk = RM() ? 1 : ease.out(clamp((k - 0.8) / 0.14, 0, 1));
        const str = e.text || (up ? "STONKS" : "CÒN CÁI NỊT");
        bigText(str, W / 2 + 50, up ? 70 : H - 70, fitSize(str, 40, W - 150), { scale: lerp(2.2, 1, kk), color: col, stroke: "#08101e", rot: up ? -0.12 : 0.1, alpha: a });
        if (e.amount) txt(e.amount, W / 2 + 50, up ? 96 : H - 42, { size: 18, align: "center", color: up ? "#ffe14d" : "#ff9a9a", weight: 900, stroke: "#08101e", sw: 4, alpha: a * kk });
      }
    },
  },
  slowmo: {
    def: { dur: 3.4, text: "Người ngầu không ngoái lại nhìn", who: null, shades: true },
    start(e, L) { if (!hasSubject(e)) e.who = "sen"; if (e.sound !== false) { sfx("boom"); msfx("slowmo", { dur: e.dur }); } L.cue(e, 0.05, () => shake(7, 0.6)); },
    draw(u, e, k, t) {
      const a = fadeOut(e, k, 0.3); u.globalAlpha = a;
      const g = u.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#ffb050"); g.addColorStop(0.55, "#c2401c"); g.addColorStop(1, "#3a0d10"); u.fillStyle = g; u.fillRect(0, 0, W, H);
      u.fillStyle = "#24100e"; u.fillRect(0, H * 0.7, W, H * 0.3);
      const ex = W / 2 + 10, ey = H * 0.6, kk = RM() ? 0.6 : 0.25 + k * 0.3, R = 50 + 150 * ease.out(clamp(kk, 0, 1)), fl = Math.floor(t * 10);
      for (let i = 0; i < 9; i++) { const ang = Math.PI + (i / 8) * Math.PI, rr = R * (0.8 + hash(i, 3) * 0.4); u.fillStyle = "rgba(40,22,22,.85)"; u.beginPath(); u.arc(ex + Math.cos(ang) * rr * 0.7, ey + Math.sin(ang) * rr * 0.6 - (RM() ? 0 : k * 8), rr * 0.38, 0, Math.PI * 2); u.fill(); }
      [["#d42a1a", 1], ["#ff7a1a", 0.78], ["#ffd23f", 0.56], ["#fff6d0", 0.3]].forEach(([c, f], j) => { u.fillStyle = c; u.beginPath(); u.arc(ex, ey, R * f * (RM() ? 1 : 0.95 + hash(fl, j) * 0.1), Math.PI, Math.PI * 2); u.lineTo(ex + R * f, ey + 6); u.lineTo(ex - R * f, ey + 6); u.fill(); });
      if (!RM()) for (let i = 0; i < 14; i++) { const ang = -Math.PI * (0.1 + hash(i, 6) * 0.8), d = 40 + k * (30 + hash(i, 7) * 60); u.fillStyle = "#2a1410"; u.fillRect(ex + Math.cos(ang) * d * 1.6, ey + Math.sin(ang) * d, 3, 3); }
      const S = lerp(5, 6.4, RM() ? 0.5 : clamp(k / e.dur, 0, 1)), x = W / 2 + (RM() ? 0 : Math.sin(k * 2.2) * 3), y = H + 12 - (RM() ? 0 : Math.abs(Math.sin(k * 3.2)) * 3);
      subject(u, e, x, y, S, {}, e.shades ? (gg, F) => glasses(gg, F.eyes[0][0], F.eyes[1][0], Math.round((F.eyes[0][1] + F.eyes[1][1]) / 2 - 1.5)) : null);
      const rim = u.createLinearGradient(0, 0, 0, H); rim.addColorStop(0, "rgba(255,150,60,.25)"); rim.addColorStop(1, "rgba(255,150,60,0)"); u.fillStyle = rim; u.fillRect(0, 0, W, H);
      const bh = 34; u.fillStyle = "#000"; u.fillRect(0, 0, W, bh); u.fillRect(0, H - bh, W, bh);
      txt("● QUAY CHẬM ×0.25", W - 14, 22, { size: 9, align: "right", color: (Math.floor(t * 2) % 2 && !RM()) ? "#ff4a4a" : "#ff8a8a", weight: 900, alpha: a });
      const ls = lines(e.text); if (ls[0]) txt(ls[0], W / 2, H - 13, { size: 12, align: "center", color: "#fff", weight: 900, italic: true, alpha: clamp((k - 0.5) * 2, 0, 1) * a });
    },
  },
  chibi: {
    def: { dur: 1.0, text: "", who: null },
    start(e) { if (!hasSubject(e)) e.who = "sen"; if (e.sound !== false) { msfx("boing"); msfx("sparkle", { delay: 0.2 }); } },
    draw(u, e, k, t) {
      const a = fadeOut(e, k); u.globalAlpha = a;
      const [x, y] = e.at || [W / 2, H - 26], S = e.size || 3.4, w = RM() ? 0 : Math.exp(-k * 5);
      const pop = RM() ? 1 : ease.back(clamp(k / 0.15, 0, 1)), hop = RM() ? 0 : Math.abs(Math.sin(k * 8)) * 18 * Math.exp(-k * 3);
      const g = u.createRadialGradient(x, y - 12 * S, 2, x, y - 12 * S, 20 * S); g.addColorStop(0, "rgba(255,190,220,.75)"); g.addColorStop(1, "rgba(255,190,220,0)");
      u.fillStyle = g; u.beginPath(); u.arc(x, y - 12 * S, 20 * S, 0, Math.PI * 2); u.fill();
      subject(u, e, x, y - hop, S * pop, { sx: 1 - 0.25 * Math.sin(k * 20) * w, sy: 1 + 0.35 * Math.sin(k * 20) * w });
      const sp = RM() ? 6 : 4 + Math.abs(Math.sin(k * 9)) * 6;
      star4(u, x + 11 * S, y - 22 * S - hop, sp, "#fff"); star4(u, x + 11 * S, y - 22 * S - hop, sp * 0.45, "#ffe14d");
      star4(u, x - 12 * S, y - 16 * S - hop, sp * 0.6, "#ffd0ea");
      if (e.text) txt(e.text, x, y - 26 * S - hop, { size: 11, align: "center", color: "#ff5aa0", weight: 900, stroke: "#fff", sw: 4, alpha: clamp((k - 0.1) * 6, 0, 1) * a });
    },
  },
  kanji: {
    def: { dur: 2.8, text: "LỬA", sub: "", who: null, bg: "flames", col: "#160606", rim: "#fff6dc" },
    start(e, L) { if (!hasSubject(e)) e.who = "ba"; if (e.sound !== false) msfx("dundun"); L.cue(e, 0.64, () => shake(8, 0.4)); },
    draw(u, e, k, t) {
      const a = fadeOut(e, k, 0.25); u.globalAlpha = a; const rt = RM() ? 0 : t;
      if (e.bg === "waves") {
        fill(u, "#f3ead8"); halftone(u, 0, 0, W, H, "rgba(160,120,60,.12)", 8, false);
        for (let j = 0; j < 3; j++) {
          const base = H * 0.58 + j * 30, cols = ["#3a6aa8", "#24497e", "#132c55"];
          u.fillStyle = cols[j]; u.beginPath(); u.moveTo(0, H);
          for (let x = 0; x <= W; x += 6) u.lineTo(x, base + Math.sin(x / 38 + rt * 2 + j * 1.7) * 12);
          u.lineTo(W, H); u.fill();
          u.fillStyle = "#fff"; for (let x = 0; x <= W; x += 12) { const s = Math.sin(x / 38 + rt * 2 + j * 1.7); if (s < -0.6) { u.beginPath(); u.arc(x, base + s * 12 - 2, 3, 0, Math.PI * 2); u.fill(); } }
        }
      } else {
        const g = u.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#ffd25a"); g.addColorStop(0.5, "#f2602a"); g.addColorStop(1, "#5a0d0d"); u.fillStyle = g; u.fillRect(0, 0, W, H);
        for (let i = 0; i < 15; i++) {
          const bx = i * 34 - 10, h = 90 + 50 * Math.sin(rt * 6 + i * 1.3) + hash(i, 2) * 40;
          u.fillStyle = i % 2 ? "rgba(255,210,70,.85)" : "rgba(230,70,20,.85)";
          u.beginPath(); u.moveTo(bx - 22, H); u.quadraticCurveTo(bx - 10 + Math.sin(rt * 5 + i) * 8, H - h * 0.6, bx + Math.sin(rt * 4 + i) * 10, H - h); u.quadraticCurveTo(bx + 14, H - h * 0.5, bx + 22, H); u.fill();
        }
      }
      // brush words: revealed left→right like a stroke, ink passes + splatter + drips
      const rev = RM() ? 1 : ease.out(clamp(k / 0.32, 0, 1)), ls = lines(e.text), n = ls.length;
      u.save(); u.beginPath(); u.rect(0, 0, W * rev + 30, H); u.clip();
      ls.forEach((l, i) => {
        const size = Math.min(n > 1 ? 80 : 120, fitSize(l, 120, W - 40)), x = W / 2 + 40, y = H / 2 + size * 0.35 + (i - (n - 1) / 2) * size * 0.95;
        for (let j = 0; j < 4; j++) txt(l, x + (hash(j, i + 1) - 0.5) * 6, y + (hash(j, i + 5) - 0.5) * 5, { size, weight: 900, color: e.col, align: "center", rot: -0.05 + (hash(j, 9) - 0.5) * 0.03, alpha: 0.3 * a });
        txt(l, x, y, { size, weight: 900, color: e.col, stroke: e.rim, sw: size * 0.1, align: "center", rot: -0.05, alpha: a });
        u.fillStyle = e.col;
        for (let d = 0; d < 7; d++) { const dx = x + (hash(d, i + 11) - 0.5) * measure(l, size, 900) * 0.9, len = (8 + hash(d, i + 13) * 26) * (RM() ? 1 : clamp((k - 0.3) * 2, 0, 1)); u.fillRect(Math.round(dx), Math.round(y - 4), 3, Math.round(len)); }
      });
      u.fillStyle = e.col; for (let d = 0; d < 18; d++) { u.beginPath(); u.arc(hash(d, 21) * W, hash(d, 22) * H * 0.8 + 20, 1 + hash(d, 23) * 4, 0, Math.PI * 2); u.fill(); }
      u.restore();
      const sk = RM() ? 1 : ease.out(clamp((k - 0.15) / 0.3, 0, 1));
      subject(u, e, lerp(-120, 92, sk), H + 6, e.size || 7, { shadow: true });
      whiteFlash(u, k - 0.64, 0.08, 0.5);
      if (e.sub && k > 0.6) {
        const sa = clamp((k - 0.6) * 4, 0, 1) * a, sw = measure(e.sub, 10, 900) + 24, sx = W - sw - 16, sy = H - 40;
        panel(sx, sy, sw, 20, { fill: "#f4e6c4", border: "#8a2a1a", r: 2, bw: 2, alpha: sa });
        txt(e.sub, sx + sw / 2, sy + 14, { size: 10, align: "center", color: "#8a2a1a", weight: 900, alpha: sa });
      }
    },
  },
};
// Salt Bae parody: raised elbow, salt rolling off the forearm and fingertips onto the dish (all drawn in code)
MEMES.saltbae = {
  def: { dur: 1.8, text: "RẮC MUỐI KIỂU CÁCH", sub: "", drop: 0.28 },
  start(e, L) {
    e.drop = RM() ? 0.02 : e.drop;
    if (e.sound !== false) { L.cue(e, Math.max(0, e.drop - 0.14), () => msfx("whoosh_hit")); L.cue(e, e.drop + 0.05, () => msfx("sprinkle", { dur: Math.max(0.5, e.dur - e.drop - 0.2) })); }
    L.cue(e, e.drop, () => shake(4, 0.2));
  },
  draw(u, e, k, t) {
    const a = fadeOut(e, k, 0.2), rm = RM(), rt = rm ? 0 : t; u.globalAlpha = a;
    const bg = u.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, "#1a0e0a"); bg.addColorStop(1, "#3a1e12"); u.fillStyle = bg; u.fillRect(0, 0, W, H);
    const cx = 196, by = H - 30, S = e.size || 4.5, top = by - 4 - 24 * S * 0.8;
    const sg = u.createLinearGradient(0, 0, 0, H); sg.addColorStop(0, "rgba(255,220,160,.04)"); sg.addColorStop(1, "rgba(255,220,160,.3)");
    u.fillStyle = sg; u.beginPath(); u.moveTo(cx - 26, 0); u.lineTo(cx + 26, 0); u.lineTo(cx + 150, H); u.lineTo(cx - 150, H); u.fill();
    halftone(u, 0, 0, W, H, "rgba(0,0,0,.2)", 8, false);
    u.fillStyle = "#6a3a1e"; u.fillRect(cx - 110, by - 6, 220, 14); u.fillStyle = "#8a5230"; u.fillRect(cx - 110, by - 6, 220, 3);
    if (hasSubject(e)) subject(u, e, cx, by - 4, S);
    else { u.fillStyle = "#e8e0d0"; u.beginPath(); u.ellipse(cx, by - 30, 48, 30, 0, 0, Math.PI); u.fill(); u.fillStyle = "#c97a52"; u.fillRect(cx - 44, by - 34, 88, 6); }
    const landed = k >= e.drop;
    if (landed) { sparkles(u, cx, top + 30, rt + 1, 10, 60, "#fff"); u.globalAlpha = a; }
    // the arm: shoulder off-screen right, elbow raised high, forearm hanging down, wrist bent, fingers pinched
    const p = rm ? 1 : ease.out(clamp(k / e.drop, 0, 1)), flick = landed && !rm ? Math.max(0, Math.sin((k - e.drop) * 9)) : 0;
    const tx = cx + 4, ty = lerp(-90, top - 26, p) - flick * 4; // fingertips
    const wx = tx + 12, wy = ty - 16 - flick * 2, ex = tx + 104, ey = ty - 58, shx = W + 30, shy = ty - 20;
    const limb = (x0, y0, x1, y1, w, col) => { u.lineCap = "round"; u.strokeStyle = "#1a0a06"; u.lineWidth = w + 4; u.beginPath(); u.moveTo(x0, y0); u.lineTo(x1, y1); u.stroke(); u.strokeStyle = col; u.lineWidth = w; u.beginPath(); u.moveTo(x0, y0); u.lineTo(x1, y1); u.stroke(); };
    limb(shx, shy, ex, ey, 20, "#c88a5a");
    limb(shx, shy, lerp(shx, ex, 0.45), lerp(shy, ey, 0.45), 26, "#f2f2f2"); // white tee sleeve
    limb(ex, ey, wx, wy, 15, "#c88a5a");
    u.strokeStyle = "rgba(255,230,200,.5)"; u.lineWidth = 2; u.beginPath(); u.moveTo(ex - 6, ey - 5); u.lineTo(wx + 2, wy - 6); u.stroke(); // forearm shine
    u.fillStyle = "#1a0a06"; u.beginPath(); u.arc(wx - 2, wy + 2, 10, 0, Math.PI * 2); u.fill();
    u.fillStyle = "#c88a5a"; u.beginPath(); u.arc(wx - 2, wy + 2, 8, 0, Math.PI * 2); u.fill();
    for (const [dx, len] of [[-6, 12], [-1, 15], [4, 11]]) limb(wx + dx - 2, wy + 4, tx + dx * 0.3, ty + len - 12, 3, "#c88a5a"); // pinched fingers
    if (landed) { // salt: off the fingertips onto the dish, and a trickle rolling down the forearm
      u.fillStyle = "#ffffff";
      for (let i = 0; i < 46; i++) {
        const ph = rm ? hash(i, 1) : (rt * 1.7 + hash(i, 1)) % 1, sx = tx + (hash(i, 2) - 0.5) * 6 + ph * (hash(i, 3) - 0.5) * 26, sy = ty + 2 + ph * (top + 24 - ty);
        u.fillRect(Math.round(sx), Math.round(sy), 1 + (i % 2), 1 + (i % 2));
      }
      for (let i = 0; i < 14; i++) {
        const ph = rm ? hash(i, 4) : (rt * 1.2 + hash(i, 4)) % 1;
        u.fillRect(Math.round(lerp(ex, wx, ph) + (hash(i, 5) - 0.5) * 4), Math.round(lerp(ey, wy, ph) - 9), 2, 2);
      }
    }
    if (k >= e.drop + 0.1) {
      const kk = rm ? 1 : ease.out(clamp((k - e.drop - 0.1) / 0.14, 0, 1));
      lines(e.text).forEach((l, i) => bigText(l, 128, 40 + i * 26, fitSize(l, 26, 230), { scale: lerp(2, 1, kk), color: "#fff3d8", stroke: "#3a1a08", rot: -0.06, alpha: a }));
      if (e.sub) txt(e.sub, 128, 40 + lines(e.text).length * 26 + 2, { size: 10, align: "center", color: "#ffd98a", weight: 900, stroke: "rgba(10,6,20,.9)", sw: 3, alpha: clamp((k - e.drop - 0.3) * 4, 0, 1) * a });
    }
  },
};
MEMES.notstonks = { ...MEMES.stonks, def: { ...MEMES.stonks.def, dur: 2.6, text: "CÒN CÁI NỊT", up: false } };
export const MEME_TYPES = Object.keys(MEMES);

// ---------------------------------------------------------------------------------------------------------------------
export class MemeLayer {
  // host: the Cutscene (reads host.lastWho for on:"face", host.o.layer for scene grabs); null for plain scenes
  constructor(host = null) { this.host = host; this.list = []; this.t = 0; this.warned = false; }
  get active() { return this.list.length > 0; }
  // returns how long the timeline should wait (seconds)
  start(s) {
    const type = s.meme;
    if (type === "clear") { this.clear(); return 0; }
    const D = MEMES[type];
    if (!D) { console.warn("meme: unknown type", type); return 0; }
    const e = { ...D.def, ...s, type, k: 0, cues: [] };
    const on = s.on;
    if (Array.isArray(on)) e.at = on;
    else if (on === "face") e.who = e.who || this.host?.lastWho || "sen";
    else if (on === "center") e.at = [W / 2, H / 2];
    else if (typeof on === "string" && FACE[on]) e.who = on;
    try { D.start?.(e, this); } catch (err) { console.warn("meme start", type, err); }
    this.list.push(e);
    return s.hold ?? (s.async ? 0 : e.dur);
  }
  cue(e, at, fn) { e.cues.push([at, fn, false]); }
  update(dt) {
    this.t += dt;
    for (const e of this.list) {
      e.k += dt;
      for (const c of e.cues) if (!c[2] && e.k >= c[0]) { c[2] = true; try { c[1](); } catch (err) { console.warn("meme cue", err); } }
    }
    this.list = this.list.filter((e) => e.k < e.dur);
  }
  clear() { this.list = []; }
  draw() {
    if (!this.list.length) return;
    const u = screen.ui;
    for (const e of this.list) {
      u.save();
      try { MEMES[e.type].draw(u, e, e.k, this.t, this); } catch (err) { if (!this.warned) { this.warned = true; console.warn("meme draw", e.type, err); } }
      u.restore();
    }
  }
}
