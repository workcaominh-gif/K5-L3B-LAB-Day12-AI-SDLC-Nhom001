import { W, H, screen, input, fx, clamp, lerp, ease, txt, panel, measure, reduceMotion, setFont } from "./engine.js";
import { playIntroVideo } from "./intro_video.js";
import { unlock, music, sfx, toggleMute, isMuted, registerAudio } from "./audio.js";
import { P, R, portrait, diver, fish, bands, godRays, WATER, kelp, hyacinth, lantern, ghe, chibiSide, KIND_NAME } from "./art.js";
import { riverWorld, introScript, duskScript } from "./story.js";
import { Cutscene, slamText, speedLines, halftone } from "./cutscene.js";
import { GatherScene } from "./scene_gather.js";
import { QuanScene } from "./scene_quan.js";
import { DayIntro, EveningIntro, DayResult, Shop, Summary, drawPause, PAUSE_ITEMS, PAUSE_ITEMS_QUAN, planFor, planDays, deliveryText, dueOn } from "./scene_day.js";
import { newItem, plain, freshCfg } from "./fresh.js";
import { DockHub } from "./hub.js";
import * as progress from "./progress.js";
import * as meta from "./meta.js";
import { toggleHighContrast, applyFilter, hcLabel, highContrast } from "./a11y.js";
import { toggleCaptions, ccLabel, bindMuted, updateCaptions, drawCaptions } from "./captions.js";

let CONTRACT = null, MANIFEST = [];
// haul null = demo stock (title-menu shortcut), {} = empty basket (fainted).
// campaign = the saved day loop (day card → morning prep → gather → dusk → evening prep → quán → results);
// false = demo shortcuts (no prep screens, all dishes), never written to the save.
// v1.1 day loop: DayIntro → gather → (dusk) → EveningIntro → quán → DayResult → Shop → next DayIntro / Summary.
// v1.3 hubs (GUI): DayIntro → MORNING DOCK HUB (walk our ghe: Chú Sáu's shop pop-up, Bà Tư, ladder "Lặn ▶") → gather → dusk →
// quán PRE-OPEN (walk the raft: menu board pop-up, Bà Tư, bell "Mở quán") → service → DayResult pop-up over the raft →
// NIGHT DOCK HUB (shop pop-up sells leftovers / orders for tomorrow, hammock "Đi ngủ ▶") → next DayIntro / Summary.
// EveningIntro (full screen) and Shop (full screen) remain for the debug shortcuts go("evening") / go("shop").
// paused = { sel } while the pause overlay is open (Esc/P in gather, quán, shop): scene.update is skipped, so
// every gameplay timer (clock, O₂, cooldowns, shop auto-close) is frozen.
// overlay = meta overlay ({ update, draw, done }: phone / Bà Tư) opened from main; it freezes the scene like pause.
// haulItems = v1.2 freshness handover from gather ([{ id, kind, fresh }], spoiled included); null = quán makes fresh items from haul
// portions = menu-board targets { dish: n } (EveningIntro → quán); delivered = item ids Chợ Chú Sáu delivered tonight;
// leftover = tonight's leftover quán items for the Shop's Chợ tab (discarded when the Shop closes)
const state = { scene: null, mode: "boot", t: 0, haul: null, haulItems: null, menu: null, portions: null, delivered: null, leftover: null, campaign: false, dayPaid: false, paused: null, overlay: null };

// ---------- title screen ----------
// key art for the title screen (16:9, drawn on the hi-res UI layer); falls back to the procedural title if missing
const KEY_ART = new Image(); KEY_ART.src = "assets/ui/title_key_art.webp";
class Title {
  constructor() {
    this.t = 0; this.sel = 0; this.cam = { x: 0, y: 40 }; this.started = false;
    // [label, action, sub-label, demo?]
    // main menu (v1.1): Chơi (continue the saved run, else a new one) · Thoát; demo shortcuts below
    this.items = [];
    this.saved = progress.hasSave() ? progress.load() : null;
    if (this.saved) {
      this.items.push(["Chơi", "continue", `Chơi tiếp Ngày ${this.saved.day} · Ví ${this.saved.money}k · Kỷ lục ${this.saved.best} điểm`]);
      this.items.push(["Chơi mới", "new", "Xoá sổ cũ, bắt đầu lại từ Ngày 1"]);
    } else this.items.push(["Chơi", "new", "Mở màn rồi vào Ngày 1"]);
    this.items.push(["Thoát", "quit", "Rời quán"]);
    this.items.push(["Buổi sáng — Lặn", "gather", null, true], ["Buổi tối — Quán", "quan", null, true], ["Xem mở màn", "intro", null, true]);
    this.bye = false;
    this.press = 0; this.confirmNew = 0;
    music("theme");
  }
  update(dt) {
    this.t += dt; this.cam.x += dt * 6;
    if (this.bye) { if (this.t - this.bye > 0.4 && input.anyKey()) this.bye = false; return; }
    if (input.hit("up")) { this.sel = (this.sel + this.items.length - 1) % this.items.length; sfx("click"); this.confirmNew = 0; }
    if (input.hit("down")) { this.sel = (this.sel + 1) % this.items.length; sfx("click"); this.confirmNew = 0; }
    if (input.hit("mute")) toggleMute();
    if (this.confirmNew > 0) this.confirmNew -= dt;
    if (!this.leaving && (input.hit("confirm") || input.hit("interact") || input.hit("catch"))) {
      const act = this.items[this.sel][1];
      // overwriting an existing save needs a second press
      if (act === "new" && this.saved && this.confirmNew <= 0) { this.confirmNew = 3; sfx("hurt"); return; }
      if (act === "quit") { sfx("select"); this.bye = this.t; try { window.close(); } catch (e) {} return; }
      sfx("select"); this.press = 0.2; this.leaving = true; go(act);
    }
    if (this.press > 0) this.press -= dt;
  }
  draw() {
    const c = screen.px, t = this.t, u = screen.ui;
    const art = KEY_ART.complete && KEY_ART.naturalWidth > 0;
    if (art) {
      c.fillStyle = "#1a0f24"; c.fillRect(0, 0, W, H);
      const z = 1.03 + Math.sin(t * 0.12) * 0.02, w = W * z, h = H * z, dx = Math.sin(t * 0.07) * 4;
      u.save(); u.imageSmoothingEnabled = true; u.imageSmoothingQuality = "high";
      u.drawImage(KEY_ART, (W - w) / 2 + dx, (H - h) / 2, w, h);
      // soft dark wash behind the menu column (lower-left: river + boats)
      const gm = u.createLinearGradient(0, 0, 200, 0); gm.addColorStop(0, "rgba(14,6,24,.72)"); gm.addColorStop(0.7, "rgba(14,6,24,.35)"); gm.addColorStop(1, "rgba(14,6,24,0)");
      u.fillStyle = gm; u.fillRect(0, 118, 210, H - 118);
      const gb = u.createLinearGradient(0, H - 30, 0, H); gb.addColorStop(0, "rgba(8,4,16,0)"); gb.addColorStop(1, "rgba(8,4,16,.75)"); u.fillStyle = gb; u.fillRect(0, H - 30, W, 30);
      u.restore();
    } else this.drawProcedural(c, t, u);
    this.drawMenu(c, t, u, art);
  }
  drawProcedural(c, t, u) {
    riverWorld(c, { t, cam: this.cam, v: { school: true, sunUp: 0.4 } }, "dusk");
    // dark gradient for legibility
    const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "rgba(6,12,28,.2)"); g.addColorStop(1, "rgba(6,12,28,.75)"); c.fillStyle = g; c.fillRect(0, 0, W, H);
    // floating diver mascot
    diver(c, W / 2 + Math.sin(t) * 10, 92 + Math.cos(t * 1.3) * 5, 1, t, 0.4, { tilt: Math.sin(t) * 0.1 });
    for (let i = 0; i < 3; i++) fish(c, i % 2 ? "ca_linh" : "ca_loc", W / 2 - 40 + i * 50 + Math.sin(t + i) * 20, 130 + i * 8, Math.cos(t + i) > 0 ? 1 : -1, t + i);

    // title logo
    const bob = Math.sin(t * 1.5) * 2;
    halftone(c, W / 2 - 120, 30, 240, 44, "rgba(255,180,80,.06)", 6);
    slamText("QUÁN ĂN", W / 2, 42 + bob, 34, { color: "#ffd23f", stroke: "#3a1410", sw: 7, rot: -0.04 });
    slamText("CHỢ NỔI", W / 2, 72 + bob, 38, { color: "#ff8a3d", stroke: "#3a1410", sw: 7, rot: -0.04 });
    txt("Lặn sông · Hái bông · Mở quán", W / 2, 92 + bob, { size: 9, align: "center", color: "#dff4ff", weight: 800, shadow: "rgba(0,0,0,.6)" });
  }
  drawMenu(c, t, u, art) {
    const cx = art ? 98 : W / 2, foot = art ? 98 : W / 2;

    // menu: main entries (campaign) first, then the demo shortcuts in a smaller, dimmer style
    const main = this.items.filter((it) => !it[3]).length;
    let y = art ? 146 - (main - 1) * 4 : 152 - (main - 1) * 4;
    if (art) { const demoN = this.items.length - main, hgt = main * 20 + demoN * 16 + 9 + 10; panel(cx - 94, y - 14, 188, hgt, { fill: "rgba(24,10,34,.62)", border: "rgba(255,210,63,.45)", bw: 1, r: 9 }); }
    this.items.forEach(([label0, act, sub, demo], i) => {
      const sel = i === this.sel, size = demo ? 10 : 12;
      if (demo && i === main) { txt("— CHƠI THỬ (không lưu) —", cx, y - 1, { size: 7, align: "center", color: "rgba(255,255,255,.42)", weight: 800 }); y += 9; }
      const label = act === "new" && this.confirmNew > 0 && sel ? "Nhấn lần nữa để xoá sổ cũ!" : label0;
      const pulse = sel ? Math.sin(t * 6) * 0.08 + 1 : 1;
      const pw = art ? 172 : Math.max(150, measure(label, size, 900) + 50), bh = demo ? 15 : 18;
      if (sel) { panel(cx - pw / 2, y - bh / 2 - 1, pw, bh, { fill: "rgba(255,160,60,.22)", border: act === "new" && this.confirmNew > 0 ? "#ff6b5a" : "#ffd23f", bw: 1.5, r: 8 }); txt("▶", cx - pw / 2 + 12, y + 3, { size: 9, color: "#ffd23f", weight: 900 }); }
      txt(label, cx, y + size * 0.35, { size: size * pulse, align: "center", color: sel ? (act === "new" && this.confirmNew > 0 ? "#ffb0a0" : "#fff") : demo ? "rgba(255,255,255,.5)" : "rgba(255,255,255,.75)", weight: 900, shadow: "rgba(0,0,0,.6)" });
      y += demo ? 16 : 20;
    });
    // footer: sub-label of the selected entry, then key hints
    const cur = this.items[this.sel];
    const note = cur[3] ? "Chơi thử: dùng đồ nghề hiện có, không tính ngày, không lưu tiến trình" : cur[2] || "";
    if (note) txt(note, art ? 12 : foot, H - 26, { size: 7.5, align: art ? "left" : "center", color: cur[3] ? "rgba(255,255,255,.55)" : "#ffe2a8", weight: 700, shadow: "rgba(0,0,0,.6)" });
    txt("↑↓ chọn · Enter/Space chơi · M tắt tiếng · H " + hcLabel().toLowerCase() + " · U phụ đề", art ? 12 : foot, H - 15, { size: 8, align: art ? "left" : "center", color: "rgba(255,255,255,.6)", weight: 700 });
    txt(isMuted() ? "🔇" : "🔊", W - 12, 14, { size: 10, align: "right" });
    txt("Nhóm 001 · Day 12 AI-SDLC · Test Contract v1.2", art ? W - 8 : W / 2, H - 5, { size: 7, align: art ? "right" : "center", color: "rgba(255,255,255,.4)", weight: 700 });
    if (this.press > 0) { u.save(); u.fillStyle = `rgba(255,255,255,${this.press})`; u.fillRect(0, 0, W, H); u.restore(); }
    if (this.bye) {
      u.save(); u.fillStyle = "rgba(4,8,20,.8)"; u.fillRect(0, 0, W, H); u.restore();
      panel(W / 2 - 120, H / 2 - 36, 240, 72, { fill: "rgba(30,12,16,.95)", border: "#ffd23f", r: 10, bw: 1.5 });
      txt("Tạm biệt! Hẹn gặp lại ở chợ nổi", W / 2, H / 2 - 10, { size: 11, align: "center", color: "#ffd23f", weight: 900 });
      txt("Đóng tab trình duyệt để thoát hẳn · phím bất kỳ: quay lại", W / 2, H / 2 + 12, { size: 8, align: "center", color: "#fff", weight: 700 });
    }
  }
}

// ---------- scene transitions ----------
let wipe = null;
function transition(next, kind = "iris") { wipe = { k: 0, phase: "in", next, kind }; }

// where: "continue" | "new" ("play" = old alias) | "gather" | "quan" | "intro"
//        debug only: "shop" | "evening" | "summary" | "hub" (morning dock) | "night" (night dock) | "preopen" (on the real save)
function go(where) {
  if (where === "continue") { campaign(); progress.resume(); transition(startDay); }
  else if (where === "new" || where === "play") {
    campaign(); progress.newGame();
    transition(() => { state.mode = "cut"; state.scene = new Cutscene(introScript(), startDay); });
  } else if (where === "intro") {
    demo(); transition(() => { state.mode = "cut"; state.scene = new Cutscene(introScript(), toTitle); });
  } else if (where === "gather") { demo(); transition(startGather); }
  else if (where === "quan") { demo(); state.haul = null; state.haulItems = null; state.menu = null; state.portions = null; transition(() => startQuan(null)); }
  else if (where === "evening") { campaign(); if (!state.haul) state.haulItems = null; state.haul = state.haul || {}; transition(startEvening); }
  else if (where === "shop") { campaign(); transition(startShop); }
  else if (where === "hub") { campaign(); transition(startMorningHub); }
  else if (where === "night") { campaign(); state.leftover = state.leftover || []; transition(startNightHub); }
  else if (where === "preopen") { campaign(); if (!state.haul) state.haulItems = null; state.haul = state.haul || {}; transition(startPreopen); }
  else if (where === "summary") { campaign(); transition(startSummary); }
}
function campaign() { progress.setDemo(false); state.campaign = true; }
function demo() { progress.setDemo(true); state.campaign = false; }

// one campaign day (v1.1 §2): DayIntro → gather → dusk → EveningIntro → quán → DayResult → Shop → next day / Summary
function curDay() { return state.campaign ? progress.save.day : 1; }
function startDay() {
  const s = progress.save;
  if (s.day > planDays(CONTRACT)) return startSummary();
  progress.activateUpgrades(); // levels bought in yesterday's Shop take effect now
  if (s.day > 1) { const w = meta.payWages(); if (!w.skipped && !w.owed && s.day % 2 === 0) meta.pushMessage("Bà Tư", BA_TU_REMIND[s.day % BA_TU_REMIND.length]); } // yesterday's wages (once per day)
  state.mode = "intro"; state.haul = {}; state.haulItems = null; state.menu = null; state.portions = null; state.delivered = null; state.leftover = null; state.dayPaid = false;
  // the very first day of a new game goes straight into the water (no dock hub yet); the hub opens from Day 2
  state.scene = new DayIntro(CONTRACT, s.day, progress.stats(CONTRACT), () => transition(s.day === 1 ? startGather : startMorningHub));
}
// morning dock hub: shop pop-up (orders arrive TOMORROW evening, contract upgrades from tomorrow), Bà Tư, ladder → dive
function startMorningHub() {
  state.mode = "hub";
  const hub = new DockHub(CONTRACT, { phase: "dawn", meta, openPhone: () => openPhoneOverlay(), onDive: () => {
    const got = Object.entries(hub.bought).flatMap(([k, n]) => Array.from({ length: n }, () => ({ kind: k })));
    if (got.length) meta.pushMessage("Chú Sáu", `Chú ghi sổ ${deliveryText(got)} rồi nghen. Tối Ngày ${progress.save.day + 1} Chú chèo ghe giao tận quán!`);
    transition(startGather);
  } });
  state.scene = hub;
}
// night dock hub (after the result): sell tonight's leftovers, order for tomorrow, hammock → next day (leftovers discarded)
function startNightHub() {
  state.mode = "hub";
  const last = progress.save.day > planDays(CONTRACT);
  const hub = new DockHub(CONTRACT, { phase: "night", meta, leftover: state.leftover || [], last, openPhone: () => openPhoneOverlay(), onSleep: ({ bought }) => {
    state.leftover = null; // contract: leftover goods are discarded once the shop phase ends
    const got = Object.entries(bought || {}).flatMap(([k, n]) => Array.from({ length: n }, () => ({ kind: k })));
    if (got.length) meta.pushMessage("Chú Sáu", `Chú gom đủ ${deliveryText(got)} rồi nghen. Tối Ngày ${progress.save.day} Chú chèo ghe giao tận quán, hàng tươi rói!`);
    transition(startDay);
  } });
  state.scene = hub;
}
function startGather() {
  state.mode = "gather"; meta.beginPhase();
  const plan = planFor(CONTRACT, curDay());
  state.scene = new GatherScene(CONTRACT, onGatherEnd, { day: curDay(), need: plan ? plan.ingredients : null });
}
function onGatherEnd(res) {
  if (res.restart) return transition(startGather);
  meta.gatherFallback(res.by); // chore progress from the haul, unless the gather scene reported it itself
  state.haul = res.by || {}; // fainted = {} (basket lost); quán still opens
  state.haulItems = Array.isArray(res.items) ? res.items : null; // v1.2: same tick handover, ids + fresh kept
  transition(() => { state.mode = "cut"; state.scene = new Cutscene(duskScript(flat(state.haul)), () => state.campaign ? startPreopen() : startQuan(state.haul)); });
}
// Chợ Chú Sáu: yesterday's purchases (save.pendingDelivery, fresh 100, own ids) join tonight's quán stock after the gather
// haul, separate from the gather inventory; only goods due tonight are taken (a morning order tagged for tomorrow waits)
function takeDelivery() {
  state.delivered = null;
  const all = progress.save.pendingDelivery;
  if (!state.campaign || !Array.isArray(all) || !all.length) return;
  const today = progress.save.day, pend = dueOn(all, today);
  if (!pend.length) return;
  const haul = state.haul = { ...(state.haul || {}) };
  const items = state.haulItems ? [...state.haulItems] : flat(haul).map((k) => plain(newItem(k, freshCfg(CONTRACT))));
  for (const it of pend) { items.push({ id: it.id, kind: it.kind, fresh: it.fresh ?? freshCfg(CONTRACT).initial }); haul[it.kind] = (haul[it.kind] || 0) + 1; }
  state.haulItems = items; state.delivered = pend.map((it) => it.id);
  progress.save.pendingDelivery = all.filter((it) => !pend.includes(it)); progress.persist();
}
// campaign evening: the quán opens in its PRE-OPEN phase with the menu board as a pop-up (EveningIntro, popup mode)
function startPreopen() {
  takeDelivery();
  const board = new EveningIntro(CONTRACT, progress.save.day, state.haul || {}, () => {}, state.haulItems, { delivered: state.delivered, popup: true });
  const sel0 = board.selection(); state.menu = sel0.menu; state.portions = sel0.portions;
  startQuan(state.haul || {}, null, { preopen: true, board, openPhone: () => openPhoneOverlay(), onOpen: (sel) => { state.menu = sel.menu; state.portions = sel.portions; } });
}
function startEvening() {
  state.mode = "evening";
  takeDelivery();
  // menu board: res = { menu: [dish ids], portions: { dish: target } | null } (an array = menu only, older callers)
  state.scene = new EveningIntro(CONTRACT, progress.save.day, state.haul || {}, (res) => {
    state.menu = Array.isArray(res) ? res : res?.menu || null; state.portions = Array.isArray(res) ? null : res?.portions || null;
    transition(() => startQuan(state.haul, state.menu));
  }, state.haulItems, { delivered: state.delivered });
}
// opts.menu = dish ids allowed tonight (menu board); opts.portions = target per dish; opts.rep = reputation carried from the previous day
function startQuan(stock, menu = null, extra = null) {
  state.mode = "quan"; meta.beginPhase();
  const opts = { ...(extra || {}) }; if (menu) opts.menu = menu; if (menu && state.portions) opts.portions = state.portions;
  if (stock && state.haulItems) opts.items = state.haulItems; // QuanScene copies them (R replays the same items)
  if (state.campaign) opts.rep = progress.repNow(CONTRACT);
  state.scene = new QuanScene(CONTRACT, stock, onQuanEnd, opts);
}
function onQuanEnd(res) {
  // R on the result screen replays the evening with the same stock; the day is only paid once, below
  if (res.restart) return transition(() => startQuan(state.haul, state.menu));
  if (!state.campaign || state.dayPaid) return transition(toTitle);
  state.dayPaid = true; state.leftover = Array.isArray(res.leftover) ? res.leftover.map((it) => ({ ...it })) : [];
  const day = progress.save.day;
  const summary = { day, haulCount: flat(state.haul || {}).length, earned: res.money ?? 0, rep: res.rep, rep0: res.rep0, served: res.served ?? 0, left: res.left ?? 0, score: res.score, tips: res.tips ?? 0, sold: res.sold || {}, closedEarly: !!res.closedEarly, missed: res.missed ?? 0 };
  progress.finishDay(summary);
  meta.quanFallback(res); meta.trackChore("day_done"); shiftMessages(summary);
  // result as a pop-up over the frozen raft (no wipe), then the night dock hub
  const raft = state.scene; if (raft) raft.hudOff = true;
  state.mode = "result"; state.scene = new DayResult(summary, () => transition(startNightHub), { under: raft, next: "Enter: lên ghe nghỉ đêm ▶" });
}
function startShop() {
  state.mode = "shop";
  const last = progress.save.day > planDays(CONTRACT);
  const sh = new Shop(CONTRACT, last ? "Xong — xem tổng kết ▶" : `Xong — sang Ngày ${progress.save.day} ▶`, () => {
    state.leftover = null; // contract: leftover goods are discarded once the Shop closes
    const got = Object.entries(sh.bought).flatMap(([k, n]) => Array.from({ length: n }, () => ({ kind: k })));
    if (got.length) meta.pushMessage("Chú Sáu", `Chú gom đủ ${deliveryText(got)} rồi nghen. Tối Ngày ${progress.save.day} Chú chèo ghe giao tận quán, hàng tươi rói!`);
    transition(startDay);
  }, { leftover: state.leftover || [] });
  state.scene = sh;
}
function startSummary() {
  state.mode = "summary";
  state.scene = new Summary(CONTRACT, () => { progress.newGame(); transition(toTitle); });
}
function toTitle() { state.paused = null; state.overlay = null; progress.setDemo(false); state.campaign = false; state.mode = "title"; state.scene = new Title(); }
// ---------- meta life: phone (T), messages after a shift ----------
const BA_TU_REMIND = ["Nhớ ăn sáng rồi hẵng lặn nghen con.", "Bà mới nghe ghe hàng nói cá kèo về nhiều lắm.", "Đèn lồng ngoài mũi ghe cũ rồi, rảnh thì ghé Bà coi đổi cái mới.", "Mấy đứa nhỏ trong xóm hỏi quán có cần người phụ hông kìa."];
const REVIEWERS = ["Chú Năm ghe dừa", "Cô Út bán bông", "Anh Hai ghe khóm", "Dì Bảy Cái Răng", "Khách Sài Gòn", "Ông Sáu khô cá"];
function shiftMessages(sum) {
  const who = REVIEWERS[(sum.day * 5 + (sum.served | 0)) % REVIEWERS.length];
  const text = sum.served === 0 ? "Tối qua ghé mà quán hổng có món gì... Mai ghé lại nghen." :
    sum.left > sum.served / 2 ? `Món ngon mà chờ lâu quá, ${sum.left} người bỏ về rồi đó. Thêm người phụ đi con!` :
    sum.tips > 0 ? `Ăn ngon, phục vụ lẹ! Có boa ${sum.tips}k cho quán nè. ★★★★★` : `Quán dễ thương, đồ ăn vừa miệng. Phục vụ ${sum.served} khách mà vẫn tươi cười. ★★★★`;
  meta.pushMessage(who, text);
  const st = meta.getStaff();
  if (st.waiter && Math.random() < 0.5) meta.pushMessage("Bé Tí", "Tối nay con chạy bàn mỏi giò mà vui ghê chị Sen ơi!");
  if (st.cook && Math.random() < 0.5) meta.pushMessage("Chú Bảy", "Than còn nửa bao, mai Bảy mua thêm nghen.");
}
// T key: engine.js does not map it, so main listens itself and consumes it on the next frame
const PHONE_MODES = new Set(["gather", "quan", "intro", "evening", "result", "shop", "hub"]);
let phoneKey = false;
addEventListener("keydown", (e) => { if (e.key && e.key.toLowerCase() === "t" && !e.repeat) phoneKey = true; });
function openPhoneOverlay(opts) {
  if (state.overlay || !PHONE_MODES.has(state.mode) || state.paused) return false;
  state.overlay = meta.openPhone(() => {}, opts); return true;
}
// completion toasts outside the quán (the quán scene shows meta.popCompletions() itself)
let toastT = 0;
function drawGlobalToast(dt) {
  const q = meta.globalToasts;
  if (state.mode === "quan" || state.mode === "title" || state.mode === "boot") { q.length = 0; toastT = 0; return; }
  if (!q.length) return;
  toastT += dt; const k = Math.min(1, toastT * 4, (3 - toastT) * 3);
  const t0 = q[0], w = Math.max(measure(t0.text, 9, 900), measure(t0.sub, 7.5, 700)) + 24, x = W / 2 - w / 2, y = 6 + (k - 1) * 20;
  panel(x, y, w, 28, { fill: "rgba(20,50,30,.94)", border: "#7be08a", r: 6, bw: 1.4, alpha: Math.max(0, k) });
  txt(t0.text, W / 2, y + 12, { size: 9, align: "center", color: "#fff", weight: 900, alpha: Math.max(0, k) });
  txt(t0.sub, W / 2, y + 23, { size: 7.5, align: "center", color: "#ffd23f", weight: 700, alpha: Math.max(0, k) });
  if (toastT >= 3) { q.shift(); toastT = 0; }
}
function flat(by) { const a = []; for (const k in by) for (let i = 0; i < by[k]; i++) a.push(k); return a; }

// ---------- pause (Esc / P) ----------
const PAUSABLE = new Set(["gather", "quan", "shop", "hub"]);
// pause menu: the quán adds "Đóng quán sớm" once it is open for service; every pause menu ends with the a11y toggle
const pauseItems = () => [...(state.mode === "quan" && state.scene?.phase !== "preopen" ? PAUSE_ITEMS_QUAN : PAUSE_ITEMS), hcLabel(), ccLabel()];
function updatePause() {
  const p = state.paused, items = pauseItems();
  if (input.hit("pause") || input.hit("back")) { state.paused = null; sfx("click"); return; }
  if (input.hit("up")) { p.sel = (p.sel + items.length - 1) % items.length; sfx("click"); }
  if (input.hit("down")) { p.sel = (p.sel + 1) % items.length; sfx("click"); }
  if (input.hit("confirm") || input.hit("interact") || input.hit("catch")) {
    if (items[p.sel].startsWith("Tương phản cao")) { toggleHighContrast(); sfx("select"); return; } // stays paused
    if (items[p.sel].startsWith("Phụ đề âm thanh")) { toggleCaptions(); sfx("select"); return; }
    sfx("select"); state.paused = null;
    if (items[p.sel] === "Đóng quán sớm") { state.scene?.closeEarly?.(); return; } // the menu choice is the confirmation
    if (items[p.sel] === "Về menu") { state.scene?.dispose?.(); const m = state.scene?._onMove; if (m) { removeEventListener("pointermove", m); removeEventListener("pointerdown", m); } transition(toTitle); }
  }
}

// ---------- transition draw ----------
function drawWipe(dt) {
  if (!wipe) return;
  const c = screen.px;
  wipe.k += dt * 2.6;
  if (wipe.phase === "in" && wipe.k >= 1) { wipe.next(); wipe.phase = "out"; wipe.k = 0; }
  if (wipe.phase === "out" && wipe.k >= 1) { wipe = null; return; }
  const closing = wipe.phase === "in";
  const k = closing ? wipe.k : 1 - wipe.k;
  c.save();
  if (wipe.kind === "iris") {
    const r = (1 - ease.inOut(k)) * Math.hypot(W, H) * 0.6;
    c.fillStyle = "#070b1a"; c.beginPath(); c.rect(0, 0, W, H); c.arc(W / 2, H / 2, r, 0, Math.PI * 2, true); c.fill("evenodd");
  } else { c.fillStyle = "#070b1a"; c.globalAlpha = ease.inOut(k); c.fillRect(0, 0, W, H); }
  c.restore();
}

// ---------- boot + loop ----------
const FALLBACK_CONTRACT = { tuning: {
  tick_hz: 60,
  gather: { duration_s: 180, bounds: { x: [0, 100], d: [0, 30] }, dock_pos: [2, 0], dock_radius: 3, start_pos: [2, 0], swim_speed: 4, surface_depth: 0.5, oxygen_max_s: 30, oxygen_refill_per_tick: 6, choke_interval_ticks: 60, hp_max: 3, hold_capacity: 12, interact_radius: 2, node_yield: 1, regrow_s: 20, catch_radius: 2, catch_cooldown_s: 0.5, fish_yield: { ca_linh: 3, ca_loc: 1 },
    nodes: [{ id: "N1", kind: "bong_dien_dien", pos: [12, 0] }, { id: "N2", kind: "bong_dien_dien", pos: [28, 0] }, { id: "N3", kind: "bong_sung", pos: [44, 0] }, { id: "N4", kind: "bong_sung", pos: [60, 0] }],
    fish_initial: [{ id: "F1", kind: "ca_linh", pos: [15, 5] }, { id: "F2", kind: "ca_loc", pos: [30, 10] }, { id: "F3", kind: "ca_linh", pos: [45, 10] }, { id: "F4", kind: "ca_loc", pos: [60, 16] }, { id: "F5", kind: "ca_linh", pos: [75, 5] }, { id: "F6", kind: "ca_loc", pos: [90, 16] }] },
  quan: { duration_s: 180, bounds: { x: [0, 16], z: [0, 10] }, start_pos: [8, 5], walk_speed: 4, interact_radius: 1.5, stoves: [{ id: "B1", pos: [2, 8] }], tables: [{ id: "T1", pos: [9, 2] }], first_customer_tick: 120, customer_interval_s: 15, patience_s: 60, eat_s: 10, carry_limit: 1, tip_rate: 0.2, tip_min_patience_ratio: 0.5, tip_reputation: 0.2, left_reputation_delta: -0.5, reputation_initial: 3, reputation_min: 0, reputation_max: 5 },
  menu: { ca_loc_nuong_trui: { recipe: { ca_loc: 1 }, cook_s: 6, price: 60 }, goi_bong_sung: { recipe: { bong_sung: 2 }, cook_s: 4, price: 40 }, lau_ca_linh_dien_dien: { recipe: { ca_linh: 3, bong_dien_dien: 1 }, cook_s: 10, price: 120 } },
  score: { reputation_multiplier: 100 },
} };

async function boot() {
  screen.init(); applyFilter(); bindMuted(isMuted); // a11y: high-contrast CSS filter from the saved setting; captions follow mute
  try {
    const r = await fetch("../game.contract.json", { cache: "no-store" });
    CONTRACT = r.ok ? await r.json() : FALLBACK_CONTRACT;
  } catch (e) { CONTRACT = FALLBACK_CONTRACT; }
  if (!CONTRACT.tuning) CONTRACT = FALLBACK_CONTRACT;
  meta.setContract(CONTRACT);
  try {
    const r = await fetch("assets/manifest.json", { cache: "no-store" });
    if (r.ok) { MANIFEST = normalizeManifest(await r.json()); registerAudio(MANIFEST); const f = MANIFEST.find((a) => a.kind === "font"); if (f && f.family) await loadFont(f); }
  } catch (e) { /* no assets yet: procedural art + synth sfx still work */ }
  // splash video (skippable) before the title screen; its key presses also unlock audio
  document.getElementById("loading")?.remove();
  await playIntroVideo({ onGesture: unlock });
  input.endFrame();
  state.mode = "title"; state.scene = new Title();
  if (/[?&]debug\b/.test(location.search)) window.__chonoi = { state, manifest: MANIFEST, go, step, input, progress, meta, phone: openPhoneOverlay, contract: () => CONTRACT };
  // first input unlocks audio
  const kick = () => { unlock(); removeEventListener("keydown", kick); removeEventListener("pointerdown", kick); };
  addEventListener("keydown", kick); addEventListener("pointerdown", kick);
  document.getElementById("loading")?.remove();
  requestAnimationFrame(loop);
}
// manifest.json is { note, assets:[{path, kind, ...}] } without ids: id = file name, plus aliases for the
// names the game asks for (music "theme", synth-only sfx) so the sourced files actually play.
const ALIAS = { title: "theme", jingle_success: "fanfare", pop: "pick", stove_on: "sizzle", impact: "slam" };
function normalizeManifest(raw) {
  const list = (Array.isArray(raw) ? raw : raw?.assets || []).filter((a) => a && a.path);
  const out = list.map((a) => ({ ...a, id: a.id || a.path.split("/").pop().replace(/\.[^.]+$/, "") }));
  for (const a of [...out]) if (ALIAS[a.id] && !out.some((b) => b.kind === a.kind && b.id === ALIAS[a.id])) out.push({ ...a, id: ALIAS[a.id] });
  return out;
}
async function loadFont(f) {
  try { const face = new FontFace(f.family, `url(assets/${f.path})`); await face.load(); document.fonts.add(face); setFont(f.family); } catch (e) {}
}

let last = 0, hcToast = 0;
function loop(ts) {
  requestAnimationFrame(loop);
  const now = ts / 1000; const dt = now - (last || now); last = now;
  frame(Math.min(dt, 0.05));
}
// ?debug only: advance n frames synchronously (tests don't depend on rAF, which stalls in hidden tabs)
function step(n = 1, dt = 1 / 60) { for (let i = 0; i < n; i++) frame(dt); }
function frame(dt) {
  progress.topUp(); // debug: unlimited money (?money or phone → Cài đặt)
  if (fx.stop > 0) { fx.stop -= dt; dt *= 0.08; }
  fx.update(dt);
  const typing = !!state.scene?.typing; // Summary name entry: letters are text, not hotkeys
  if (input.hit("contrast") && !typing) { toggleHighContrast(); sfx("click"); meta.globalToasts.push({ text: hcLabel(), sub: "Phím H để đổi" }); hcToast = 1.6; }
  if (input.hit("captions") && !typing) { toggleCaptions(); sfx("click"); meta.globalToasts.push({ text: ccLabel(), sub: "Phím U để đổi" }); }
  updateCaptions(dt);

  // update: scene runs except while the wipe is closing over it
  if (!wipe || wipe.phase === "out") {
    const tKey = phoneKey && !typing; phoneKey = false;
    if (state.overlay) {
      if (tKey && state.overlay.isPhone) state.overlay.close(); // T again puts the phone away
      state.overlay.update(dt);
      if (state.overlay.done) state.overlay = null;
    }
    else if (tKey && !wipe && !state.scene?.result && !state.scene?.overlay && !state.scene?.boardOpen && openPhoneOverlay()) {}
    else if (state.paused) updatePause();
    else if (PAUSABLE.has(state.mode) && !wipe && !state.scene?.result && (input.hit("pause") || (input.hit("back") && !state.scene?.menuOpen && !state.scene?.overlay))) { state.paused = { sel: 0 }; sfx("click"); }
    else state.scene?.update(dt);
  }

  // draw with screen shake
  const px = screen.px;
  px.setTransform(1, 0, 0, 1, 0, 0);
  px.imageSmoothingEnabled = false;
  const [sx, sy] = fx.offset();
  px.save(); px.translate(sx, sy);
  screen.beginUI();
  state.scene?.draw();
  if (state.paused) drawPause(state.paused.sel, pauseItems());
  if (state.overlay) state.overlay.draw();
  drawGlobalToast(dt);
  drawCaptions({ txt, panel, measure, H, hc: highContrast });
  if (hcToast > 0) { hcToast -= dt; if (state.mode === "quan" || state.mode === "title") { const w = 150; panel(W / 2 - w / 2, 6, w, 16, { fill: "rgba(10,10,10,.92)", border: "#ffef00", r: 5, bw: 1.5 }); txt(hcLabel(), W / 2, 17.5, { size: 9, align: "center", color: "#ffef00", weight: 900 }); } }
  if (fx.flashT > 0) { px.globalAlpha = (fx.flashT / 0.2) * 0.6; px.fillStyle = fx.flashCol; px.fillRect(-8, -8, W + 16, H + 16); px.globalAlpha = 1; }
  drawWipe(dt);
  px.restore();

  input.endFrame();
}

boot();
