// Mobile touch controls (iPhone Safari / Android Chrome). Game logic is NOT touched: every control only dispatches
// synthetic KeyboardEvent keydown/keyup on window with the same `key` values the keyboard sends, so all scenes
// (engine.js input map, main.js T/phone, scene_gather I/X, scene_shop N, summary name entry) work unchanged.
// Taps on the canvas outside the controls stay normal pointer events (harpoon aims/fires where you tap, menus confirm).
//   ?touch=1 forces the overlay on a desktop (testing), ?touch=0 forces it off.
import { unlock } from "./audio.js";

const q = new URLSearchParams(location.search).get("touch");
const coarse = matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
const forced = q === "1";
const want = forced || (q !== "0" && coarse);

const send = (key, type) => window.dispatchEvent(new KeyboardEvent(type, { key, bubbles: true, cancelable: true }));
const held = new Map(); // key -> count of controls holding it
function hold(key) { const n = held.get(key) || 0; held.set(key, n + 1); if (!n) send(key, "keydown"); }
function release(key) { const n = held.get(key) || 0; if (n <= 1) { held.delete(key); if (n) send(key, "keyup"); } else held.set(key, n - 1); }
function releaseAll() { for (const k of [...held.keys()]) { held.set(k, 1); release(k); } }
const tap = (key) => { send(key, "keydown"); send(key, "keyup"); };
const mode = () => window.__chonoi?.state?.mode; // only present with ?debug; otherwise the overlay shows a universal set

const CSS = `
html.tc-on, html.tc-on body { overscroll-behavior: none; touch-action: none; -webkit-user-select: none; user-select: none;
  -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent; }
#tc { position: fixed; inset: 0; z-index: 30; pointer-events: none; font: 800 12px "Trebuchet MS", system-ui, sans-serif;
  --b: 56px; --pad-l: max(10px, env(safe-area-inset-left)); --pad-r: max(10px, env(safe-area-inset-right));
  --pad-t: max(8px, env(safe-area-inset-top)); --pad-b: max(10px, env(safe-area-inset-bottom)); }
#tc * { box-sizing: border-box; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
#tc .b { position: absolute; width: var(--b); height: var(--b); border-radius: 50%; pointer-events: auto; touch-action: none;
  display: flex; flex-direction: column; align-items: center; justify-content: center; line-height: 1;
  color: #ffd23f; background: rgba(8,14,32,.42); border: 2px solid rgba(255,210,63,.55);
  box-shadow: 0 2px 8px rgba(0,0,0,.35); text-shadow: 0 1px 2px #000; transition: transform .06s, background .06s; }
#tc .b i { font-style: normal; font-size: 22px; }
#tc .b small { font-size: 9px; letter-spacing: .5px; color: #fff; opacity: .9; margin-top: 3px; }
#tc .b.on { transform: scale(.9); background: rgba(255,210,63,.42); border-color: #ffd23f; }
#tc .b.big { width: 74px; height: 74px; } #tc .b.big i { font-size: 28px; }
#tc .b.sm { width: 46px; height: 46px; } #tc .b.sm i { font-size: 18px; }
#tc .b.ctx { border-color: rgba(120,230,160,.8); color: #9ff0b8; }
#tc .hide { display: none !important; }
#tc-joy { position: absolute; left: 0; top: 24%; bottom: 0; width: 40%; pointer-events: auto; touch-action: none; }
#tc-base { position: absolute; width: 120px; height: 120px; margin: -60px 0 0 -60px; border-radius: 50%;
  border: 2px solid rgba(255,255,255,.35); background: radial-gradient(rgba(255,255,255,.08), rgba(8,14,32,.25)); opacity: .4;
  left: calc(var(--pad-l) + 74px); bottom: calc(var(--pad-b) + 14px); top: auto; margin: 0 0 0 -60px; }
#tc-base.live { opacity: 1; bottom: auto; margin: -60px 0 0 -60px; }
#tc-base.sprint { border-color: #ffd23f; box-shadow: 0 0 12px rgba(255,210,63,.6); }
#tc-knob { position: absolute; left: 50%; top: 50%; width: 52px; height: 52px; margin: -26px 0 0 -26px; border-radius: 50%;
  background: rgba(255,210,63,.55); border: 2px solid #ffd23f; box-shadow: 0 2px 6px rgba(0,0,0,.4); }
#tc-tray { position: absolute; left: calc(var(--pad-l) + 54px); top: var(--pad-t); display: flex; gap: 8px; pointer-events: none; }
#tc-tray .b { position: relative; }
#tc-toast { position: absolute; left: 50%; top: 18%; transform: translateX(-50%); max-width: 80%; padding: 10px 16px; border-radius: 14px;
  background: rgba(8,14,32,.9); border: 1px solid #ffd23f; color: #fff; font-size: 14px; text-align: center; pointer-events: none;
  transition: opacity .3s; opacity: 0; }
#tc-type { position: absolute; left: -9999px; top: 0; width: 10px; height: 10px; opacity: 0; font-size: 16px; }
#tc-rot { position: fixed; inset: 0; z-index: 40; display: none; flex-direction: column; align-items: center; justify-content: center;
  gap: 18px; background: #070b1a; color: #ffd23f; font: 900 20px "Trebuchet MS", system-ui, sans-serif; text-align: center; padding: 24px; }
#tc-rot .ph { width: 64px; height: 108px; border: 4px solid #ffd23f; border-radius: 12px; position: relative; animation: tc-rot 2.2s ease-in-out infinite; }
#tc-rot .ph::after { content: ""; position: absolute; left: 50%; bottom: 6px; width: 14px; height: 4px; margin-left: -7px; border-radius: 2px; background: #ffd23f; }
#tc-rot small { display: block; color: #9fb3c0; font-size: 13px; font-weight: 700; margin-top: 6px; }
@keyframes tc-rot { 0%, 25% { transform: rotate(0); } 55%, 85% { transform: rotate(-90deg); } 100% { transform: rotate(0); } }
@media (orientation: portrait) { html.tc-on #tc-rot { display: flex; } html.tc-on #tc { display: none; } }
@media (prefers-reduced-motion: reduce) { #tc-rot .ph { animation: none; transform: rotate(-90deg); } }
`;

function el(tag, attrs = {}, parent) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (k === "style") e.style.cssText = v; else if (k === "html") e.innerHTML = v; else e.setAttribute(k, v); }
  if (parent) parent.appendChild(e);
  return e;
}
// keep control touches away from the game's window listeners (engine pointerdown = "confirm", harpoon aim/fire)
const swallow = (e) => { e.stopPropagation(); if (e.cancelable) e.preventDefault(); };

let root = null, built = false;
function build() {
  if (built) return; built = true;
  document.documentElement.classList.add("tc-on");
  el("style", { html: CSS }, document.head);
  const stage = document.getElementById("stage") || document.body;
  root = el("div", { id: "tc", "aria-label": "Điều khiển cảm ứng" }, document.body);

  // --- generic button: hold (keydown on press, keyup on release) or tap (fn) ---
  const btn = (o) => {
    const b = el("div", { class: "b " + (o.cls || ""), role: "button", "aria-label": o.aria || o.label || o.key, style: o.pos || "", html: `<i>${o.icon}</i>${o.label ? `<small>${o.label}</small>` : ""}` }, o.parent || root);
    const ids = new Set();
    const up = (e) => {
      if (!ids.has(e.pointerId)) return; swallow(e); ids.delete(e.pointerId);
      if (!ids.size) { b.classList.remove("on"); if (o.key) release(o.key); }
    };
    b.addEventListener("pointerdown", (e) => {
      swallow(e); try { b.setPointerCapture(e.pointerId); } catch (_) {}
      if (!ids.size) { b.classList.add("on"); if (o.key) hold(o.key); else o.fn?.(); if (navigator.vibrate) try { navigator.vibrate(8); } catch (_) {} }
      ids.add(e.pointerId);
    });
    b.addEventListener("pointerup", (e) => { up(e); unlock(); });
    b.addEventListener("pointercancel", up); b.addEventListener("lostpointercapture", up);
    b.addEventListener("pointermove", swallow);
    return b;
  };

  // right side: action cluster (bottom) + menu column (top)
  const R = (r, b) => `right:calc(var(--pad-r) + ${r}px);bottom:calc(var(--pad-b) + ${b}px)`;
  const T = (r, t) => `right:calc(var(--pad-r) + ${r}px);top:calc(var(--pad-t) + ${t}px)`;
  btn({ key: " ", icon: "🎯", label: "BẮN", aria: "Bắn lao / chọn (Space)", cls: "big", pos: R(0, 0) });
  btn({ key: "e", icon: "E", label: "LÀM", aria: "Tương tác (E)", pos: R(84, 86) }); // above the in-game close button
  btn({ key: "Enter", icon: "✔", label: "OK", aria: "Xác nhận (Enter)", pos: R(9, 86) });
  const sprint = btn({ key: "Shift", icon: "⚡", label: "CHẠY", aria: "Chạy nhanh (giữ Shift)", pos: R(84, 156) });
  const close = btn({ key: "c", icon: "C", label: "ĐÓNG", aria: "Đóng quán (C)", cls: "ctx hide", pos: R(84, 226) });
  const open = btn({ key: "o", icon: "O", label: "MỞ", aria: "Mở quán (O)", cls: "ctx hide", pos: R(84, 226) });
  btn({ key: "Escape", icon: "⏸", label: "DỪNG", aria: "Tạm dừng / quay lại (Esc)", pos: T(0, 0) });
  btn({ key: "i", icon: "🎒", label: "TÚI", aria: "Túi đồ (I)", pos: T(0, 62) });
  btn({ key: "t", icon: "📱", label: "ĐT", aria: "Điện thoại (T)", pos: T(0, 124) });

  // top-left: "…" tray (rare keys) + fullscreen
  const L = (t) => `left:var(--pad-l);top:calc(var(--pad-t) + ${t}px)`; // stacked in the left margin
  const tray = el("div", { id: "tc-tray", class: "hide" }, root);
  btn({ icon: "⋯", aria: "Thêm nút", cls: "sm", pos: L(0), fn: () => tray.classList.toggle("hide") });
  btn({ icon: "⛶", aria: "Toàn màn hình", cls: "sm", pos: L(54), fn: fullscreen });
  btn({ key: "c", icon: "C", label: "ĐÓNG", aria: "Đóng quán (C)", cls: "ctx", parent: tray });
  btn({ key: "o", icon: "O", label: "MỞ", aria: "Mở quán (O)", cls: "ctx", parent: tray });
  btn({ key: "n", icon: "N", label: "TIẾP", aria: "Tiếp / mở quán (N)", parent: tray });
  btn({ key: "m", icon: "🔇", label: "TIẾNG", aria: "Tắt/bật tiếng (M)", parent: tray });
  btn({ key: "h", icon: "◐", label: "HC", aria: "Tương phản cao (H)", parent: tray });
  btn({ key: "u", icon: "CC", label: "PHỤ ĐỀ", aria: "Phụ đề (U)", parent: tray });
  btn({ icon: "⌨", label: "GÕ", aria: "Bàn phím (gõ tên)", parent: tray, fn: openTyping });

  // --- joystick: floating, appears where the left thumb lands (left 40%, below the top HUD strip) ---
  const zone = el("div", { id: "tc-joy" }, root);
  const base = el("div", { id: "tc-base" }, zone), knob = el("div", { id: "tc-knob" }, base);
  const RAD = 50, DEAD = 12;
  let joy = null, lastUp = 0, dirs = new Set();
  const setDirs = (next) => {
    for (const k of dirs) if (!next.has(k)) release(k);
    for (const k of next) if (!dirs.has(k)) hold(k);
    dirs = next;
  };
  zone.addEventListener("pointerdown", (e) => {
    swallow(e);
    if (joy) return; // one thumb at a time
    try { zone.setPointerCapture(e.pointerId); } catch (_) {}
    const r = zone.getBoundingClientRect();
    joy = { id: e.pointerId, ox: e.clientX - r.left, oy: e.clientY - r.top, x0: e.clientX, y0: e.clientY, t0: performance.now(), moved: false, sprint: performance.now() - lastUp < 300 };
    base.classList.add("live"); base.classList.toggle("sprint", joy.sprint);
    base.style.left = joy.ox + "px"; base.style.top = joy.oy + "px"; knob.style.transform = "";
    if (joy.sprint) hold("Shift");
  });
  zone.addEventListener("pointermove", (e) => {
    swallow(e);
    if (!joy || e.pointerId !== joy.id) return;
    const r = zone.getBoundingClientRect();
    let dx = e.clientX - r.left - joy.ox, dy = e.clientY - r.top - joy.oy, d = Math.hypot(dx, dy);
    if (d > RAD * 1.6) { // drag the base along so the stick never "runs out"
      const k = (d - RAD * 1.6) / d; joy.ox += dx * k; joy.oy += dy * k; dx = e.clientX - r.left - joy.ox; dy = e.clientY - r.top - joy.oy; d = Math.hypot(dx, dy);
      base.style.left = joy.ox + "px"; base.style.top = joy.oy + "px";
    }
    if (d > DEAD) joy.moved = true;
    const c = Math.min(1, RAD / (d || 1));
    knob.style.transform = `translate(${dx * c}px, ${dy * c}px)`;
    const next = new Set();
    if (d > DEAD) { // 8-way: each axis on when within 67.5° of it
      const ux = dx / d, uy = dy / d, T8 = 0.3827; // sin(22.5°)
      if (ux > T8) next.add("ArrowRight"); else if (ux < -T8) next.add("ArrowLeft");
      if (uy > T8) next.add("ArrowDown"); else if (uy < -T8) next.add("ArrowUp");
    }
    setDirs(next);
  });
  const joyEnd = (e) => {
    if (!joy || e.pointerId !== joy.id) return;
    swallow(e);
    const j = joy; joy = null; lastUp = performance.now();
    setDirs(new Set()); if (j.sprint) release("Shift");
    base.classList.remove("live", "sprint"); base.style.left = ""; base.style.top = ""; knob.style.transform = "";
    // a quick tap (no drag) is passed through to whatever is under it: menus confirm, the harpoon fires there
    if (e.type === "pointerup" && !j.moved && performance.now() - j.t0 < 280) tapThrough(e.clientX, e.clientY);
  };
  zone.addEventListener("pointerup", (e) => { joyEnd(e); unlock(); });
  zone.addEventListener("pointercancel", joyEnd); zone.addEventListener("lostpointercapture", joyEnd);

  // portrait: rotate hint
  el("div", { id: "tc-rot", html: `<div class="ph"></div><div>Xoay ngang điện thoại để chơi ↻<small>Quán Ăn Chợ Nổi chơi ở màn hình ngang</small></div>` }, document.body);
  el("div", { id: "tc-toast" }, root);

  // mode-aware context buttons (only when the ?debug hook exposes the state; otherwise C/O live in the "…" tray)
  const tick = () => {
    const m = mode(), sc = window.__chonoi?.state?.scene;
    const inQuan = m === "quan", pre = inQuan && sc?.phase === "preopen";
    close.classList.toggle("hide", !(inQuan && !pre));
    open.classList.toggle("hide", !pre);
    sprint.classList.toggle("hide", m !== undefined && !["gather", "quan", "hub"].includes(m));
  };
  setInterval(tick, 250); tick();

  // no page scroll / pinch / double-tap zoom / long-press menu
  const stop = (e) => { if (e.cancelable) e.preventDefault(); };
  document.addEventListener("touchmove", stop, { passive: false });
  document.addEventListener("gesturestart", stop); document.addEventListener("dblclick", stop);
  stage.addEventListener("contextmenu", stop); root.addEventListener("contextmenu", stop);
  addEventListener("blur", releaseAll);
  document.addEventListener("visibilitychange", () => { if (document.hidden) releaseAll(); });
}

// re-dispatch a tap at (x, y) to the element under the joystick zone (canvas → window listeners, intro video skip…)
function tapThrough(x, y) {
  const zone = document.getElementById("tc-joy"); zone.style.pointerEvents = "none";
  const t = document.elementFromPoint(x, y) || window; zone.style.pointerEvents = "";
  const o = { clientX: x, clientY: y, bubbles: true, cancelable: true, pointerType: "touch", isPrimary: true, pointerId: 99 };
  t.dispatchEvent(new PointerEvent("pointermove", o));
  t.dispatchEvent(new PointerEvent("pointerdown", o));
  t.dispatchEvent(new PointerEvent("pointerup", o));
}

let toastT = 0;
function toast(msg, ms = 3200) {
  const t = document.getElementById("tc-toast"); if (!t) return;
  t.textContent = msg; t.style.opacity = "1"; clearTimeout(toastT); toastT = setTimeout(() => (t.style.opacity = "0"), ms);
}

function fullscreen() {
  const d = document, de = d.documentElement;
  if (d.fullscreenElement || d.webkitFullscreenElement) { (d.exitFullscreen || d.webkitExitFullscreen)?.call(d); return; }
  const req = de.requestFullscreen || de.webkitRequestFullscreen;
  if (!req) { toast("iPhone: bấm Chia sẻ ⬆ → “Thêm vào MH chính” để chơi toàn màn hình", 4500); return; }
  try {
    const p = req.call(de, { navigationUI: "hide" });
    const lock = () => { try { window.screen.orientation?.lock?.("landscape").catch(() => {}); } catch (_) {} };
    if (p && p.then) p.then(lock).catch(() => toast("Trình duyệt chặn toàn màn hình")); else lock();
  } catch (_) { toast("Trình duyệt chặn toàn màn hình"); }
}

// soft keyboard for the leaderboard name entry: a hidden input whose text is replayed as key events
let typer = null;
function openTyping() {
  if (!typer) {
    typer = el("input", { id: "tc-type", type: "text", autocomplete: "off", autocorrect: "off", autocapitalize: "characters", spellcheck: "false", enterkeyhint: "done" }, root);
    const reset = () => { typer.value = "~~"; try { typer.setSelectionRange(2, 2); } catch (_) {} };
    typer.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") { e.preventDefault(); tap("Enter"); typer.blur(); } });
    typer.addEventListener("keyup", (e) => e.stopPropagation());
    typer.addEventListener("input", (e) => {
      if ((e.inputType || "").startsWith("delete")) tap("Backspace");
      else for (const ch of (e.data || typer.value.replace(/~/g, ""))) tap(ch);
      reset();
    });
    typer.addEventListener("focus", reset);
  }
  typer.style.left = "0"; typer.focus();
}

if (want) {
  if (document.readyState === "loading") addEventListener("DOMContentLoaded", build, { once: true }); else build();
} else if (q !== "0") {
  // hybrid laptops / devices that only reveal touch on use: switch the overlay on at the first real touch
  addEventListener("touchstart", build, { once: true, passive: true });
}
// iOS/Android only grant audio on touchend/pointerup, not on pointerdown: retry the unlock on every touch release
addEventListener("touchend", () => unlock(), { passive: true, capture: true });
window.__touch = { held, tap, enabled: () => built };
