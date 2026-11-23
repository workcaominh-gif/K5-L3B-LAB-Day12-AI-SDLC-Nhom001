// QUÁN scene — GUI ONLY. Local mock; swap `st` for the server snapshot later.
// Side view of a floating restaurant raft (nhà bè) at night, seen from the river.
// Gameplay still lives in contract units: x in [0,16] runs left→right along the deck, z in [0,10] is depth
// (z = 0 front edge, z = 10 back rail). Screen: sx = X0 + x·XS, sy = Y0 − z·ZS (back rows higher and smaller).
import { W, H, screen, input, clamp, lerp, fx, Particles, txt, panel, measure, wrap } from "./engine.js";
import { SERVICE_TIME_S } from "./gui_tuning.js"; // GUI scaling knobs (night shift length)
import { sfx, music, voiceLine } from "./audio.js";
import { P, R, ripple, dishIcon, icon, DISH_NAME, KIND_NAME, premiumBadge } from "./art.js";
import { menuKnown, isPremiumDish, isPremiumKind, lockedDishes, GUI_MENU_EXTRA } from "./menu.js"; // contract menu + the Đặc sản Bà Tư has learned (GUI only)
import { speedLines } from "./cutscene.js";
import { highContrast, hc, HC } from "./a11y.js";
import { promptTag, drawPhoneIcon, PHONE_BTN } from "./hub.js";
const dishName = (k) => DISH_NAME[k] || k;
import { riverWorld } from "./story.js";
import { save, stats } from "./progress.js";
import { freshCfg, newItem, decay, freshestFirst, freshBar, freshColor } from "./fresh.js";
import { scaled, personSide, stool, sideTable, clayStove, passCounter, kitchenBack, roofAndPosts, lanternString, glow,
  nightWater, deck, backRail, landing, sampan, steam, smoke, coin, moon, quanSign, flowerPot, flowerArch, flowerGarland } from "./raft.js";
// meta layer (staff, décor, chores, Bà Tư's dialog, phone messages). Loaded defensively: if meta.js (or one of its
// overlays) is missing, the quán still runs with no staff, default décor and no dialog.
let META = {};
try { META = await import("./meta.js"); } catch (e) { META = {}; }

const TAU = Math.PI * 2;
const ANGRY_AT = 0.25; // patience fraction under which a waiting guest shows the "Sắp giận!" warning

// Customer types (GUI-only "Sáng tạo của nhóm"; the headless sim knows one customer kind).
// Multipliers apply on top of contract numbers (tuning.quan / tuning.menu), never replace them.
//   patMul   × patience_s            priceMul × menu price (floored)
//   tipMul   × floor(price×tip_rate) leaveMul × left_reputation_delta
export const CUST_TYPES = {
  quen: { name: "Khách quen", badge: "Quen", col: "#9fd8ff", bubble: "#ffffff", patMul: 1,   priceMul: 1,   tipMul: 1, leaveMul: 1, priciest: false },
  voi:  { name: "Khách vội",  badge: "Vội",  col: "#ff9a5a", bubble: "#ffe2cf", patMul: 0.6, priceMul: 1,   tipMul: 1, leaveMul: 1, priciest: false },
  sop:  { name: "Khách sộp",  badge: "Sộp",  col: "#ffd23a", bubble: "#fff1b8", patMul: 1,   priceMul: 1.5, tipMul: 2, leaveMul: 2, priciest: true },
};
// Spawn weights by day: day 1 = 60/25/15; each later day moves 3% to "vội" and 2% to "sộp", capped at day 7 (30/43/27).
export function customerWeights(day = 1) {
  const d = clamp((day | 0) - 1, 0, 6);
  const voi = 0.25 + 0.03 * d, sop = 0.15 + 0.02 * d;
  return { quen: 1 - voi - sop, voi, sop };
}
function pickType(day) {
  const w = customerWeights(day); let r = Math.random();
  for (const k of Object.keys(w)) { if ((r -= w[k]) < 0) return k; }
  return "quen";
}
const SHIRTS = { quen: ["#3a6fd8", "#2a8f5a", "#7a5aa8"], voi: ["#e8572a"], sop: ["#f3c454"] };
const HAIRS = { quen: "#2a1d2b", voi: "#3a2418", sop: "#5a2a1a" };
const fmtS = (s) => (Number.isInteger(s) ? s : s.toFixed(1)) + "s";

// ---- busy-quán creative layer (GUI only; contract numbers stay the base) ----
// arrivals every customer_interval_s × 0.33–0.47 (15 s → ~5–7 s), sometimes a second guest right behind (a pair);
// when every table is taken, guests queue on the gangway with their own short patience and go home (left_queue, no rep loss)
const ARRIVE_MUL = [0.33, 0.47], QUEUE_PAT = 18, QUEUE_CALM = 5, TALK_S = 2.6, CHARM = 0.1;
const QSPOTS = [[15.4, 4.4], [15.4, 3.0], [15.4, 5.8], [15.4, 1.6], [15.4, 7.2]];
const NAMES = {
  quen: ["Chú Ba", "Cô Năm", "Anh Tư Lúa", "Dì Sáu", "Bác Hai Đờn", "Chị Bảy Bông", "Bé Út", "Cô Mười Bánh"],
  voi: ["Anh Tám Ghe", "Chú Út Lẹ", "Cô Chín Chợ", "Anh Hai Xe Lôi"],
  sop: ["Ông Hai Sầu Riêng", "Bà Năm Vàng", "Anh Ba Khóm", "Ông Bảy Lúa Giống"],
};
const LINES = {
  quen: ["Sáng nay chợ nổi đông dữ thần, ghe khóm đậu kín khúc sông!", "Tối nay gió sông mát rượi, ngồi đây sướng ghê.",
    "Nước lên rồi đó con, mùa này cá linh về nhiều lắm.", "Hồi chiều mưa một trận, giờ trăng sáng trưng.",
    "Ghe bẹo bên kia treo trái gì mà thơm quá trời.", "Quán con ấm cúng ghê, chú ghé hoài nè.",
    "Mai chú chở lúa lên chợ sớm, ghé ăn sáng nữa nghen."],
  voi: ["Lẹ lẹ giùm chú nghen con!", "Chút nữa chú phải chạy ghe lên tỉnh rồi.", "Nhanh nhanh chút nha, bụng kêu rột rột rồi!",
    "Con nấu lẹ tay giùm, chú gấp lắm.", "Ghe chú còn đậu chờ ngoài kia, đừng để lâu nghen!"],
  sop: ["Bữa nay chú bán hết nguyên ghe sầu riêng đó!", "Món nào ngon nhứt quán cứ mang ra, tiền hổng thành vấn đề.",
    "Ghe chú mới sơn lại, đẹp nhứt khúc sông này đó.", "Chú mới mua thêm hai công vườn xoài, hên dữ lắm."],
  queue: ["Còn bàn hông con? Chú chờ chút cũng được.", "Quán đông quá ha, phải xếp hàng luôn!", "Đứng đây hóng gió sông cũng vui."],
  eating: ["Ngon quá trời!", "Nêm vừa miệng ghê!", "Ăn xong về ngủ ngon luôn.", "Cá tươi rói, ngọt thịt ghê!"],
  nodish: ["Hết món rồi hả? Thôi bữa khác chú ghé.", "Tiếc ghê, mai chú quay lại sớm."],
};
// a guest who orders an Đặc sản dish says so once seated (menu.js GUI_MENU_EXTRA)
const PREMIUM_LINES = {
  ca_sau_nuong_sa_ot: "Có cá sấu hả? Cho một dĩa!",
  ran_xao_sa_ot: "Rắn xào sả ớt hả? Lâu lắm mới gặp, cho chú một dĩa!",
  ca_loc_bong_hap_bau: "Cá lóc bông hấp bầu! Món này đãi khách sang nè.",
  ca_loc_kl_nuong_trui: "Con cá lóc bự cỡ đó hả? Nướng trui liền cho chú!",
  goi_ca_linh_lon: "Gỏi cá linh lớn, đúng mùa nước nổi luôn! Cho một dĩa.",
  lau_ca_tra_dau: "Lẩu cá tra dầu?! Dọn ra đây, bao nhiêu cũng được!",
};
const WAITER_HOME = { x: 7.4, z: 7.2 };
const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

// screen mapping (see header) + set dressing positions, all in contract units
const X0 = 34, XS = 24, Y0 = 238, ZS = 6;
const DECK_L = 12, DECK_R = 436, Y_BACK = 172, Y_FRONT = 244, HORIZON = 118;
const DOCK = { x: 16.6, z: 4 }, BOAT_X = 17.6, SEAT_DX = 0.8, WALK = 4.5;
const BA_TU = { x: 1.1, z: 9.2 }, PASS = { x: 3.6, z: 8.4 };
// pre-open walk (campaign evening): the menu board hangs on the back rail beside the kitchen, the bell at the gangway
const BOARD = { x: 5.8, z: 9.3 }, BELL = { x: 15.0, z: 4.2 };
const depthScale = (z) => Math.round((1 - clamp(z, 0, 10) * 0.02) * 16) / 16;
// warm-wood HUD palette
const HUD = { fill: "rgba(42,24,14,.88)", border: "#e8b04a", dim: "#7a5232", text: "#ffe9c4" };

// tiny pixel icons (drawn with R on either canvas layer; ~5×6 world px)
function pixIcon(c, kind, x, y) {
  if (kind === "voi") { // stopwatch
    R(c, x + 2, y, 1, 1, "#cfd8e0"); R(c, x + 1, y + 1, 3, 1, "#fff"); R(c, x, y + 2, 5, 3, "#fff"); R(c, x + 1, y + 5, 3, 1, "#fff");
    R(c, x + 2, y + 2, 1, 2, "#d94a3d"); R(c, x + 3, y + 3, 1, 1, "#d94a3d");
  } else if (kind === "sop") { // coin
    R(c, x + 1, y, 3, 1, "#e0a21a"); R(c, x, y + 1, 5, 4, "#ffd23a"); R(c, x + 1, y + 5, 3, 1, "#e0a21a"); R(c, x + 2, y + 1, 1, 4, "#e0a21a");
  } else { // heart
    R(c, x, y + 1, 2, 2, "#ff8fb1"); R(c, x + 3, y + 1, 2, 2, "#ff8fb1"); R(c, x + 1, y + 2, 3, 2, "#ff8fb1"); R(c, x + 2, y + 4, 1, 1, "#ff8fb1");
  }
}

export class QuanScene {
  // opts.menu: array of dish ids allowed tonight (default: every contract dish)
  // opts.preopen (campaign): the evening starts in a PRE-OPEN phase — no guests, clock/arrivals frozen; the player walks the
  // raft, sets the menu on the board (opts.board = an EveningIntro in popup mode), talks to Bà Tư, then rings the bell.
  // opts.onOpen({ menu, portions }) tells main.js what the bell opened with (R on the result replays it).
  constructor(contract, stock, onEnd, opts = {}) {
    this.t = contract.tuning.quan; this.onEnd = onEnd;
    const t = this.t; this.contract = contract; // allMenu (getter) = contract dishes + learned Đặc sản (GUI only)
    this.setMenu(opts && opts.menu, opts && opts.portions);
    this.phase = opts && opts.preopen ? "preopen" : "open";
    this.board = (opts && opts.board) || null; this.boardOpen = false; this.boardSel = null; this.onOpen = opts && opts.onOpen; this.openOpts = opts;
    this.bellConfirm = 0; this.openAsk = false; // openAsk = the "Mở quán bây giờ?" confirm box (HUD button O/N/click, or the bell)
    this.openBtn = { x: W - 104, y: H - 32, w: 98, h: 18 };
    this.p = { x: t.start_pos[0], z: t.start_pos[1], vx: 0, vz: 0, face: 1, walk: 0 };
    const counts = stock ? { ...stock } : { ca_loc: 3, ca_linh: 6, bong_sung: 4, bong_dien_dien: 3, ca_keo: 4, keo_neo: 1 }; // null = demo stock; {} = empty basket
    // v1.2 freshness: item-level stock { id, kind, fresh, spoiled, res } (res = id of the guest holding it). opts.items =
    // the gather handover (ids + fresh kept, spoiled included); without it (demo / shortcuts) fresh items are made from counts.
    // this.stock stays the per-kind count of USABLE items (not reserved, not spoiled) so the rest of the quán reads it as before.
    this.fresh = freshCfg(contract);
    this.items = Array.isArray(opts.items)
      ? opts.items.map((it) => ({ id: it.id, kind: it.kind, fresh: it.fresh, spoiled: it.fresh < this.fresh.spoiled_below, res: null }))
      : Object.entries(counts).flatMap(([k, n]) => Array.from({ length: Math.max(0, n | 0) }, () => ({ ...newItem(k, this.fresh), res: null })));
    this.syncStock();
    // no menu given (demo / shortcuts): Đặc sản dishes are on only when tonight's stock can cook them
    if (!(opts && Array.isArray(opts.menu))) this.setMenu(Object.keys(this.allMenu).filter((k) => !isPremiumDish(k) || this.freeOK(k)), opts && opts.portions);
    this.stoves = t.stoves.map((s) => ({ ...s, state: "idle", dish: null, cook: 0, cookMax: 0, pop: 0 }));
    // meta progression: stove upgrade multiplies cook time, décor multiplies patience, extra tables; day shifts the customer mix
    let st = null; try { st = stats(contract); } catch (e) {}
    this.cookMul = st && st.cookMul > 0 ? st.cookMul : 1;
    this.basePatience = st && st.patienceS > 0 ? st.patienceS : t.patience_s;
    this.patMul = st && st.patienceMul > 0 ? st.patienceMul : 1;
    const base = t.tables.map((tb) => ({ ...tb, pos: [...tb.pos] }));
    const n = Math.max(1, st && st.tables > 0 ? st.tables | 0 : base.length);
    for (let i = base.length; i < n; i++) base.push({ id: "T" + (i + 1), pos: [clamp(9 + 3 * i, t.bounds.x[0] + 1, t.bounds.x[1] - 1), i % 2 ? 5 : 2] });
    this.tables = base.slice(0, n);
    this.hand = null; this.customers = []; this.time = SERVICE_TIME_S; // GUI shift length (gui_tuning.js; contract quan.duration_s stays the headless base)
    // opts.rep: reputation carried over from the previous day (v1.1 day loop); tips / sold feed DayResult + Summary
    this.money = 0; this.rep = typeof opts?.rep === "number" ? opts.rep : t.reputation_initial; this.score = 0; this.rep0 = this.rep;
    this.tips = 0; this.sold = {}; this.missed = 0; // missed = guests who came, found nothing cookable and went home
    // early close (C twice, the HUD button, or the pause menu); clickable HUD button via its own pointer listener
    this.confirmClose = 0; this.noDish = false; this.noDishSaid = false;
    this.closeBtn = { x: W - 92, y: H - 30, w: 86, h: 15 };
    this._onMove = (e) => {
      if (this.ended || this.menuOpen || !screen.pc?.getBoundingClientRect) return;
      const r = screen.pc.getBoundingClientRect(), mx = (e.clientX - r.left) / r.width * W, my = (e.clientY - r.top) / r.height * H, b = this.closeBtn;
      if (this.phase === "preopen") {
        const q = PHONE_BTN, o = this.openBtn;
        if (mx >= q.x && mx <= q.x + q.w + 16 && my >= q.y && my <= q.y + q.h) this.openOpts?.openPhone?.();
        else if (mx >= o.x && mx <= o.x + o.w && my >= o.y && my <= o.y + o.h) { this.openAsk = true; sfx("click"); }
        return;
      }
      if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) this.requestClose();
    };
    addEventListener("pointerdown", this._onMove);
    this.nextCust = t.first_customer_tick / 60; this.custSeq = 0; this.time0 = SERVICE_TIME_S;
    this.cam = { x: t.bounds.x[1] / 2, z: t.bounds.z[1] / 2 };
    this.ps = new Particles(); this.toasts = []; this.ended = false; this.result = null;
    this.menuOpen = false; this.menuSel = 0; this.hintT = 4; this.started = false; this.repFlash = 0;
    this.day = (save && save.day) || 1;
    this.served = 0; this.left = 0;
    this.nextType = null; // ?debug: set to "quen" | "voi" | "sop" to force the next customer's type
    // visual-only actors (never read by gameplay): customers walking back to the boats, sampans leaving, coins flying
    this.walkers = []; this.boats = []; this.coins = []; this.sparkT = 0; this.bob = 0;
    this.cs = { t: 0, cam: { x: 0, y: -HORIZON }, v: {} };
    // busy layer + meta: queue, talk, Bà Tư overlay, hired staff, décor
    this.meta = (opts && opts.meta) || META;
    this.left_queue = 0; this.queueMax = QSPOTS.length; this.burstChance = 0.3; this.burstT = 0; this.hintChance = 0.5;
    this.overlay = null; this.chatT = 5; this.tipsCount = 0; this.fastCount = 0; this.talks = 0; this.review = "";
    this.staff = { waiter: null, cook: null };
    this.applyMeta();
    music("restaurant");
  }
  // dishes allowed tonight + portion targets (menu board): once sold + open orders reach a target the dish is
  // "Hết suất" and no new guest orders it (they pick another selected dish or go home as no_dish)
  // "Có thịt cá sấu — nhờ Bà Tư nghiên cứu món mới": premium meat in stock for an Đặc sản Bà Tư has not learned yet
  lockedStockHint() {
    for (const id of lockedDishes()) {
      const k = Object.keys(GUI_MENU_EXTRA[id].recipe).find(isPremiumKind);
      if (k && (this.stock?.[k] || 0) > 0) return `Có ${KIND_NAME[k] || k} — nhờ Bà Tư nghiên cứu món mới`;
    }
    return null;
  }
  // read live (menu.js menuKnown): only dishes Bà Tư knows can be set on the menu / ordered / cooked. The menu board
  // (EveningIntro) is built before the quán, so a dish researched during the pre-open phase shows up from the next evening.
  get allMenu() { return menuKnown(this.contract); }
  setMenu(menu, portions) {
    const all = this.allMenu, allowed = Array.isArray(menu) ? menu.filter((k) => all[k]) : Object.keys(all);
    this.menu = Object.fromEntries(allowed.map((k) => [k, all[k]]));
    this.portions = portions && typeof portions === "object" ? Object.fromEntries(Object.entries(portions).filter(([k, n]) => this.menu[k] && Number.isFinite(+n)).map(([k, n]) => [k, Math.max(0, +n | 0)])) : null;
  }
  // cooking menu flag; reads true while Bà Tư's overlay / the menu board popup is open too (so main.js leaves Esc to them)
  get menuOpen() { return !!this._menuOpen || !!this.overlay || !!this.boardOpen || !!this.openAsk; }
  set menuOpen(v) { this._menuOpen = !!v; }
  callMeta(name, ...a) { const f = this.meta && this.meta[name]; if (typeof f !== "function") return undefined; try { return f(...a); } catch (e) { return undefined; } }
  // (re)read staff levels, décor and its patience bonus from meta.js (start of shift + after Bà Tư's dialog closes)
  applyMeta() {
    const st = this.callMeta("getStaff") || {};
    this.staffLv = { waiter: clamp(st.waiter | 0, 0, 2), cook: clamp(st.cook | 0, 0, 2) };
    const d = this.callMeta("getDecor") || {};
    this.decor = { lanterns: d.lanterns || "do", cloth: d.cloth || null, flowers: clamp(d.flowers | 0, 0, 2), sign: d.sign || "go" };
    const b = Number(this.callMeta("decorBonus")); this.decorMul = b >= 1 ? b : 1;
    // speeds / cook multiplier come from meta.staffEffects() when present (fallback: lv2 = 1.4× walk, 0.8× cook time)
    const fx2 = this.callMeta("staffEffects") || {};
    this.waiterSpeed = Number(fx2.waiterSpeed) > 0 ? Number(fx2.waiterSpeed) : this.staffLv.waiter >= 2 ? 1.4 : 1;
    this.staffCookMul = Number(fx2.cookMul) > 0 ? Number(fx2.cookMul) : this.staffLv.cook >= 2 ? 0.8 : 1;
    const S = this.staff;
    if (this.staffLv.waiter && !S.waiter) S.waiter = { name: "Bé Tí", x: WAITER_HOME.x, z: WAITER_HOME.z, face: -1, walk: 0, task: "idle", carry: null, cu: null, pause: 0, hold: 0, idleT: 0, wx: WAITER_HOME.x, wz: WAITER_HOME.z, delivered: 0 };
    if (!this.staffLv.waiter) S.waiter = null;
    if (S.waiter) S.waiter.lv = this.staffLv.waiter;
    const home = this.cookHome();
    if (this.staffLv.cook && !S.cook && home >= 0) { const [hx, hz] = this.standSpot(home); S.cook = { name: "Chú Bảy", x: hx, z: hz, face: -1, walk: 0, task: "idle", stove: home, key: null, pause: 0, scan: 0, started: 0 }; }
    if (!this.staffLv.cook) S.cook = null;
    if (S.cook) S.cook.lv = this.staffLv.cook;
  }
  cookTime(key) { return this.menu[key].cook_s * this.cookMul; }
  toast(x, z, txt, col) { this.toasts.push({ x, z, txt, col, life: 1.5, oy: 0 }); }
  // Ingredient reservation (contract §1.3): `stock` holds AVAILABLE amounts; a guest's order moves its recipe into
  // cu.reserved. Cooking a dish uses the oldest waiting order's reservation for that dish, else free stock.
  // kinds seen once keep a 0 entry (as the old count-based stock did)
  syncStock() { const o = {}; for (const k of Object.keys(this._stock || {})) o[k] = 0; for (const it of this.items) o[it.kind] = (o[it.kind] || 0) + (!it.res && !it.spoiled ? 1 : 0); this._stock = o; }
  get stock() { return this._stock; }
  // legacy setter (debug / tests): replaces the free usable items with fresh ones matching the counts
  set stock(counts) {
    this.items = (this.items || []).filter((it) => it.res || it.spoiled);
    for (const [k, n] of Object.entries(counts || {})) for (let i = 0; i < n; i++) this.items.push({ ...newItem(k, this.fresh), res: null });
    this.syncStock();
  }
  // freshest usable free items for a recipe (tie by id), or null when short
  pickFree(recipe) {
    const out = [];
    for (const [k, n] of Object.entries(recipe)) {
      const got = this.items.filter((it) => it.kind === k && !it.res && !it.spoiled).sort(freshestFirst).slice(0, n);
      if (got.length < n) return null; out.push(...got);
    }
    return out;
  }
  reserveFor(cu, want) {
    const got = this.pickFree(this.menu[want].recipe); if (!got) return false;
    for (const it of got) it.res = cu.id;
    cu.reserved = { ...this.menu[want].recipe }; cu.resIds = got.map((it) => it.id); this.syncStock(); return true;
  }
  // the items a cook of `key` would use right now (owner's reservation, else freshest free) → price that would be locked
  lockPreview(key) {
    const m = this.menu[key], owner = this.resFor(key);
    const used = owner ? this.items.filter((it) => it.res === owner.id) : this.pickFree(m.recipe);
    if (!used || !used.length) return null;
    const mean = used.reduce((a, it) => a + it.fresh, 0) / used.length;
    return { mean, price: Math.floor(m.price * mean / 100) };
  }
  // v1.2: stock (reserved items too) loses quan_decay_per_s; each newly spoiled item toasts once (by id); orders whose
  // reservation lost an item release it and re-reserve once (by order time, then table), else the guest can't be served
  decayStock(dt) {
    const sp = decay(this.items, this.fresh.quan_decay_per_s, dt, this.fresh.spoiled_below);
    if (!sp.length) return;
    sp.forEach((it, i) => this.toast(this.p.x, this.p.z + 2.4 + i * 0.6, "Ươn! " + (KIND_NAME[it.kind] || it.kind) + " " + it.id, "#b8b8b8"));
    const hit = new Set(sp.map((it) => it.res).filter(Boolean));
    const affected = this.customers.filter((c) => hit.has(c.id) && c.reserved).sort((a, b) => a.orderT - b.orderT || (a.table < b.table ? -1 : 1));
    for (const cu of affected) {
      this.release(cu);
      if (!this.reserveFor(cu, cu.want)) { cu.unfulfillable = true; this.toast(cu.x, cu.z + 1.6, cu.name + ": hết đồ tươi cho món này…", "#ff9a9a"); }
    }
    this.syncStock();
  }
  freeOK(key) { const r = this.menu[key].recipe; return Object.entries(r).every(([k, n]) => (this.stock[k] || 0) >= n); }
  // portion target reached (sold + orders still open) → not offered to new guests any more
  soldOut(key) { const tg = this.portions && this.portions[key]; if (tg == null) return false; return (this.sold[key] || 0) + this.customers.filter((c) => c.state === "waiting" && c.want === key).length >= tg; }
  orderable(key) { return this.freeOK(key) && !this.soldOut(key); }
  resFor(key) { return this.customers.filter((c) => c.state === "waiting" && c.want === key && c.reserved).sort((a, b) => a.orderT - b.orderT || (a.table < b.table ? -1 : 1))[0] || null; }
  canCook(key) { return !!this.resFor(key) || this.freeOK(key); }
  release(cu) { if (!cu.reserved) return; for (const it of this.items) if (it.res === cu.id) it.res = null; cu.reserved = null; cu.resIds = null; this.syncStock(); }
  reservedTotals() { const o = {}; for (const c of this.customers) if (c.reserved) for (const [k, n] of Object.entries(c.reserved)) o[k] = (o[k] || 0) + n; return o; }

  arrivalGap() { return this.t.customer_interval_s * (ARRIVE_MUL[0] + Math.random() * (ARRIVE_MUL[1] - ARRIVE_MUL[0])); }
  activeAt(id) { return this.customers.find((c) => c.table === id && c.state !== "gone" && c.state !== "done") || null; }
  // rotate through the tables (by arrival number), skipping occupied ones
  freeTable() {
    for (let k = 0; k < this.tables.length; k++) { const tb = this.tables[(this.custSeq + k) % this.tables.length]; if (!this.activeAt(tb.id)) return tb; }
    return null;
  }
  queue() { return this.customers.filter((c) => c.state === "queue").sort((a, b) => a.qT - b.qT || a.seq - b.seq); }
  newGuest(type) {
    const seq = ++this.custSeq, shirts = SHIRTS[type], names = NAMES[type] || NAMES.quen;
    return { id: "C" + seq, seq, table: null, x: DOCK.x - 0.4, z: DOCK.z - 0.6, want: null, type, reserved: null, state: "arriving", patience: 1, patienceMax: 1, eat: 0, enter: 0, portrait: "khach",
      name: names[(seq * 5 + Math.floor(Math.random() * names.length)) % names.length], charmed: false, talk: null,
      shirt: shirts[seq % shirts.length], hair: HAIRS[type], hat: type === "quen" && seq % 2 === 0,
      // visual: arrives by sampan at the right edge, hops onto the deck, walks to the stool / queue spot
      vis: { phase: "boat", k: 0, x: BOAT_X + 4, z: DOCK.z, walk: 0, face: -1 } };
  }
  spawnCustomer() {
    // first customer of a shift is always a regular (gentle start); later ones follow the day's weights
    const type = this.nextType && CUST_TYPES[this.nextType] ? this.nextType : this.custSeq === 0 ? "quen" : pickType(this.day);
    const tb = this.freeTable(), anyDish = Object.keys(this.menu).some((k) => this.orderable(k));
    if (!tb && anyDish && this.queue().length >= this.queueMax) return false; // gangway full: the sampan rows on by
    this.nextType = null;
    const cu = this.newGuest(type), ty = CUST_TYPES[type];
    this.customers.push(cu); sfx("ding", undefined, "[chuông — khách mới tới]");
    if (tb) { this.seat(cu, tb, true); return true; }
    if (!anyDish) { // no_dish and no free table: steps onto the gangway, reads the board, goes home (missed)
      cu.state = "nodish"; cu.nd = 2; return true;
    }
    cu.state = "queue"; cu.qT = this.time0 - this.time; cu.qMax = QUEUE_PAT * this.decorMul; cu.qPat = cu.qMax;
    this.toast(QSPOTS[0][0] - 1, QSPOTS[0][1] + 1.5, "Hết bàn — " + cu.name + " xếp hàng", ty.col);
    return true;
  }
  // a guest takes table tb and orders right away (the order reserves its ingredients, contract §1.3)
  seat(cu, tb, arriving) {
    cu.table = tb.id; cu.x = tb.pos[0]; cu.z = tb.pos[1];
    const ty = CUST_TYPES[cu.type] || CUST_TYPES.quen, keys = Object.keys(this.menu).filter((k) => this.orderable(k));
    if (cu.vis && cu.vis.phase === "stand") cu.vis.phase = "walk";
    if (!keys.length) { // no_dish: the guest still comes, reads the menu, says "Hết món rồi…" and goes home (no rep loss, counted as missed)
      cu.state = "nodish"; cu.nd = 2; cu.patience = 1; cu.patienceMax = 1; return;
    }
    // sộp: an orderable Đặc sản dish whenever there is one (the priciest of them), else the priciest dish
    const prem = keys.filter((k) => isPremiumDish(k)), pool = ty.priciest && prem.length ? prem : keys;
    const want = ty.priciest
      ? pool.reduce((a, k) => (this.menu[k].price > this.menu[a].price ? k : a), pool[0])
      : keys[Math.floor(Math.random() * keys.length)];
    if (isPremiumDish(want)) cu.premLine = PREMIUM_LINES[want] || "Món đặc sản hả? Cho một phần!";
    const patMax = this.basePatience * ty.patMul * this.patMul * this.decorMul;
    this.reserveFor(cu, want); // freshest usable items of each recipe kind (keys were filtered by freeOK)
    Object.assign(cu, { want, orderT: this.time0 - this.time, state: "waiting", patience: patMax, patienceMax: patMax });
    this.toast(tb.pos[0], tb.pos[1] + 1, arriving ? ty.name + " tới!" : cu.name + " vào bàn", ty.col);
    if (cu.type === "sop" && arriving) sfx("coin");
  }
  seatFromQueue() {
    for (const cu of this.queue()) { const tb = this.freeTable(); if (!tb) break; this.seat(cu, tb, false); }
  }
  leaveQueue(cu) { // waited too long for a table: goes home, no reputation loss
    cu.state = "gone"; this.left_queue++; cu.talk = null;
    this.toast(cu.vis ? cu.vis.x - 1 : cu.x, (cu.vis ? cu.vis.z : cu.z) + 1, "Chờ lâu quá, về thôi…", "#ffb36b");
    this.depart(cu, false);
  }
  payFor(cu, base) { return Math.floor((base ?? this.menu[cu.want].price) * CUST_TYPES[cu.type || "quen"].priceMul); }

  nearStove() { return this.stoves.find((s) => Math.hypot(s.pos[0] - this.p.x, s.pos[1] - this.p.z) <= this.t.interact_radius); }
  nearTable() { const tb = this.tables.find((t) => Math.hypot(t.pos[0] - this.p.x, t.pos[1] - this.p.z) <= this.t.interact_radius); return tb ? this.activeAt(tb.id) || this.customers.find((c) => c.table === tb.id) : null; }
  // closest seated / queueing guest (by where they are drawn) within reach
  nearGuest() {
    let best = null, bd = this.t.interact_radius;
    for (const cu of this.customers) {
      if (!["waiting", "eating", "queue", "nodish"].includes(cu.state)) continue;
      const v = cu.vis; if (!v || (v.phase !== "seat" && v.phase !== "stand")) continue;
      const d = Math.hypot(v.x - this.p.x, v.z - this.p.z); if (d <= bd) { bd = d; best = cu; }
    }
    return best;
  }
  // Bà Tư wins over the stove only when the player stands closer to her
  nearBaTu() {
    const d = Math.hypot(BA_TU.x - this.p.x, BA_TU.z - this.p.z); if (d > 1.4) return false;
    const s = this.nearStove(); return !s || d < Math.hypot(s.pos[0] - this.p.x, s.pos[1] - this.p.z);
  }

  interact() {
    if (this.hand) { // serving
      // back at the stove with a dish nobody wants: throw it out, so the cook is never stuck (carry_limit 1)
      const st = this.nearStove();
      if (st) { this.toast(st.pos[0], st.pos[1] + 1, "Đổ " + dishName(this.hand.key), "#ff8a8a"); this.hand = null; sfx("whoosh"); return; }
      const cu = this.nearTable();
      if (cu && cu.state === "waiting" && cu.unfulfillable) { this.toast(cu.x, cu.z + 1, "Đồ giữ cho khách đã ươn — không phục vụ được", "#ff9a9a"); sfx("hurt"); }
      else if (cu && cu.state === "waiting" && cu.want === this.hand.key) this.serve(cu);
      else if (cu && cu.state === "waiting") { this.toast(cu.x, cu.z + 1, "Sai món! (E ở bếp để đổ)", "#ff6b6b"); sfx("hurt"); }
      else this.toast(this.p.x, this.p.z + 1, "Không có khách ở đây", "#ffd23a");
      return;
    }
    if (this.nearBaTu()) { this.openBaTu(); return; }
    const s = this.nearStove();
    if (s) {
      if (s.state === "ready") { const dish = s.dish; this.hand = { key: dish, lock: s.lock }; s.lock = null; s.state = "idle"; s.dish = null; sfx("pick"); this.toast(s.pos[0], s.pos[1] + 1, "Bưng " + dishName(dish), "#9fe"); }
      else if (s.state === "idle") { this.menuOpen = true; this.menuSel = 0; sfx("select"); }
      else this.toast(s.pos[0], s.pos[1] + 1, "Đang nấu...", "#ffd23a");
      return;
    }
    const g = this.nearGuest();
    if (g) this.talkTo(g);
  }
  openBaTu() {
    const f = this.meta && this.meta.openBaTuDialog;
    if (typeof f !== "function") { this.toast(BA_TU.x + 1, BA_TU.z, "Bà Tư đang nêm nồi lẩu…", "#e8c8ff"); try { voiceLine("Bà Tư", "Để Bà nêm nồi lẩu cái đã nghen con!"); } catch (e) {} return; }
    let ov = null;
    const onClose = () => { if (ov && this.overlay === ov) this.overlay = null; this.applyMeta(); };
    try { ov = f(onClose); } catch (e) { console.warn("openBaTuDialog", e); ov = null; }
    if (ov && !ov.done) { this.overlay = ov; this._menuOpen = false; sfx("select"); }
  }
  // ---- talking to guests ----
  linesFor(cu) {
    const pick = (arr, n = 1) => shuffle(arr).slice(0, n);
    if (cu.state === "queue") return [...pick(LINES.queue), ...(Math.random() < 0.5 ? pick(LINES[cu.type] || LINES.quen) : [])];
    if (cu.state === "eating") return pick(LINES.eating);
    if (cu.state === "nodish") return pick(LINES.nodish);
    const lines = pick(LINES[cu.type] || LINES.quen, 1 + Math.floor(Math.random() * 2));
    if (cu.type === "sop" && cu.state === "waiting" && !cu.hint && Math.random() < this.hintChance) {
      cu.hint = true; lines.push("Món " + dishName(cu.want) + " là món ruột của chú. Bưng lẹ, chú bo thêm!");
    }
    return lines.slice(0, 3);
  }
  talkTo(cu) {
    if (cu.talk && !cu.talk.ambient && cu.talk.i < cu.talk.lines.length - 1) { cu.talk.i++; cu.talk.t = 0; this.say(cu); return; } // E again: next line
    cu.talk = { lines: this.linesFor(cu), i: 0, t: 0 }; this.talks++; this.say(cu); sfx("click");
    if (cu.charmed) return;
    if (cu.state === "waiting") { // charm: +10% of the remaining patience, once per guest
      cu.charmed = true; const add = cu.patience * CHARM; cu.patience += add;
      this.toast(cu.x, cu.z + 2, "Khách vui hơn +" + add.toFixed(1) + "s", "#ff8fb1");
    } else if (cu.state === "queue") { // a chat in the queue calms them down
      cu.charmed = true; cu.qPat += QUEUE_CALM;
      this.toast(cu.vis.x - 1, cu.vis.z + 1.5, "Chờ thêm chút cũng được +" + QUEUE_CALM + "s", "#ff8fb1");
    }
  }
  say(cu) { const line = cu.talk && cu.talk.lines[cu.talk.i]; if (line && !cu.talk.ambient) { try { voiceLine(cu.name, line); } catch (e) {} } }
  updateTalk(cu, dt) {
    const tk = cu.talk; tk.t += dt;
    if (tk.t < TALK_S + (tk.lines[tk.i] || "").length * 0.02) return;
    tk.i++; tk.t = 0;
    if (tk.i >= tk.lines.length || cu.state === "gone" || cu.state === "done") cu.talk = null; else this.say(cu);
  }
  // background chatter: every few seconds a random guest mutters a line (silent bubble) so the deck feels alive
  ambientChat(dt) {
    this.chatT -= dt; if (this.chatT > 0) return;
    this.chatT = 4 + Math.random() * 4;
    const pool = this.customers.filter((c) => !c.talk && c.vis && (c.vis.phase === "seat" || c.vis.phase === "stand") && ["waiting", "eating", "queue"].includes(c.state));
    if (!pool.length) return;
    const cu = pool[Math.floor(Math.random() * pool.length)];
    const src = cu.state === "eating" ? LINES.eating : cu.state === "queue" ? LINES.queue : LINES[cu.type] || LINES.quen;
    cu.talk = { lines: [src[Math.floor(Math.random() * src.length)]], i: 0, t: 0, ambient: true };
  }
  cook(key) {
    const s = this.nearStove(); if (!s || s.state !== "idle" || !this.menu[key]) return;
    if (!this.canCook(key)) { this.toast(s.pos[0], s.pos[1] + 1, "Thiếu nguyên liệu", "#ff6b6b"); sfx("hurt"); return; }
    this.startCook(s, key); this.menuOpen = false;
  }
  // shared by the player and Chú Bảy (mul < 1 = faster cook)
  startCook(s, key, mul = 1, by = null) {
    if (!s || s.state !== "idle" || !this.menu[key] || !this.canCook(key)) return false;
    const owner = this.resFor(key);
    // the oldest order's reserved items go into the pot, else the freshest free ones (v1.2: by id, not by amount)
    const used = owner ? this.items.filter((it) => it.res === owner.id) : this.pickFree(this.menu[key].recipe);
    if (!used) return false;
    if (owner) { owner.reserved = null; owner.resIds = null; }
    const ids = new Set(used.map((it) => it.id)); this.items = this.items.filter((it) => !ids.has(it.id)); this.syncStock();
    // v1.2 price lock: floor(list price × mean fresh of the used items / 100); the dish carries it to the guest
    const mean = used.length ? used.reduce((a, it) => a + it.fresh, 0) / used.length : 100;
    s.lock = Math.floor(this.menu[key].price * mean / 100); s.lockFresh = mean;
    s.state = "cooking"; s.dish = key; s.cookMax = this.cookTime(key) * mul; s.cook = s.cookMax; s.by = by ? by.name : null;
    if (isPremiumDish(key)) { this.premiumCooked = (this.premiumCooked || 0) + 1; this.callMeta("trackChore", "premium_cooked", 1); }
    sfx("sizzle");
    this.toast(s.pos[0], s.pos[1] + 1, by ? by.name + " bắc bếp!" : "Bắc bếp!", "#ff8a3d");
    return true;
  }
  // ---- hired staff ----
  moveTo(o, tx, tz, speed, dt) {
    const dx = tx - o.x, dz = tz - o.z, d = Math.hypot(dx, dz), step = speed * dt;
    if (d <= step || d < 1e-3) { o.x = tx; o.z = tz; o.walk = 0; return true; }
    o.x += dx / d * step; o.z += dz / d * step; o.walk += dt;
    if (Math.abs(dx) > 0.02) o.face = dx < 0 ? -1 : 1;
    return false;
  }
  // the waiting guest a finished dish belongs to: orders already cooked (reservation used) first, then the oldest
  orderFor(key) {
    return this.customers.filter((c) => c.state === "waiting" && !c.unfulfillable && c.want === key && c.table)
      .sort((a, b) => (a.reserved ? 1 : 0) - (b.reserved ? 1 : 0) || a.orderT - b.orderT)[0] || null;
  }
  pickSpot(i) { const s = this.stoves[i]; return i < 2 ? [PASS.x + (i ? 0.7 : -0.1), PASS.z - 1.0] : [s.pos[0] + 0.9, s.pos[1] - 0.9]; }
  cookHome() { return this.stoves.length > 1 ? 1 : this.stoves.length ? 0 : -1; }
  standSpot(i) { const s = this.stoves[i]; return [s.pos[0] + 0.95, s.pos[1] + 0.7]; }
  // Bé Tí: picks a ready dish off the pass and carries it to the guest who ordered it (lv2 walks faster)
  updateWaiter(dt) {
    const w = this.staff.waiter; if (!w) return;
    const sp = 3.0 * (this.waiterSpeed || 1);
    if (w.pause > 0) { w.pause -= dt; w.walk = 0; return; }
    if (w.task === "fetch") {
      const s = this.stoves[w.stove];
      if (!s || s.state !== "ready" || s.dish !== w.dish || !this.orderFor(w.dish)) { w.task = "idle"; return; }
      const [tx, tz] = this.pickSpot(w.stove);
      if (this.moveTo(w, tx, tz, sp, dt)) {
        w.carry = s.dish; w.carryLock = s.lock; s.lock = null; s.state = "idle"; s.dish = null; w.task = "deliver"; w.hold = 0; w.pause = 0.3; w.face = 1; sfx("pick");
      }
      return;
    }
    if (w.carry) {
      const cu = w.cu && w.cu.state === "waiting" && !w.cu.unfulfillable && w.cu.want === w.carry && w.cu.table ? w.cu : this.orderFor(w.carry);
      w.cu = cu;
      if (!cu) { // nobody wants it any more: wait by the pass a while, then pour it out
        w.hold += dt; this.moveTo(w, WAITER_HOME.x, WAITER_HOME.z, sp * 0.6, dt);
        if (w.hold > 12) { this.toast(w.x, w.z + 1.5, w.name + " đổ món nguội", "#ff8a8a"); w.carry = null; w.task = "idle"; }
        return;
      }
      if (this.moveTo(w, cu.x - 1.4, cu.z - 0.2, sp, dt)) { w.face = 1; this.serve(cu, w); w.delivered++; w.carry = null; w.cu = null; w.pause = 0.45; w.task = "idle"; }
      return;
    }
    for (let i = 0; i < this.stoves.length; i++) {
      const s = this.stoves[i];
      if (s.state === "ready" && this.orderFor(s.dish)) { w.task = "fetch"; w.stove = i; w.dish = s.dish; return; }
    }
    // idle: potter around near the pass, looking at the tables
    w.idleT -= dt;
    if (w.idleT <= 0) { w.idleT = 2.5 + Math.random() * 3; w.wx = WAITER_HOME.x + (Math.random() - 0.5) * 2.4; w.wz = WAITER_HOME.z + (Math.random() - 0.5) * 1.2; }
    if (this.moveTo(w, w.wx, w.wz, sp * 0.45, dt)) w.face = 1;
  }
  // Chú Bảy: starts the oldest order that still holds its reservation on a free stove (his own stove first); lv2 cooks 20% faster
  updateCook(dt) {
    const k = this.staff.cook; if (!k) return;
    if (k.pause > 0) { k.pause -= dt; k.walk = 0; return; }
    const sp = 3.2;
    if (k.task === "go") {
      const s = this.stoves[k.stove];
      if (!s || s.state !== "idle" || !this.resFor(k.key)) { k.task = "idle"; return; }
      const [tx, tz] = this.standSpot(k.stove);
      if (this.moveTo(k, tx, tz, sp, dt)) {
        if (this.startCook(s, k.key, this.staffCookMul || 1, k)) { k.started++; k.task = "stir"; k.face = -1; k.pause = 0.25; } else k.task = "idle";
      }
      return;
    }
    k.scan -= dt;
    if (k.scan <= 0) {
      k.scan = 0.4;
      const order = this.customers.filter((c) => c.state === "waiting" && c.reserved && this.menu[c.want]).sort((a, b) => a.orderT - b.orderT)[0];
      if (order) {
        const home = this.cookHome(), order2 = [home, ...this.stoves.map((_, i) => i).filter((i) => i !== home)];
        const free = order2.find((i) => this.stoves[i] && this.stoves[i].state === "idle");
        if (free != null) { k.task = "go"; k.stove = free; k.key = order.want; return; }
      }
    }
    if (k.task === "stir") { const s = this.stoves[k.stove]; if (s && s.state === "cooking") return; k.task = "idle"; }
    const home = this.cookHome(); if (home < 0) return;
    const [hx, hz] = this.standSpot(home);
    if (this.moveTo(k, hx, hz, sp * 0.7, dt)) { k.face = -1; k.stove = home; }
  }
  // by = staff actor (waiter) or undefined for the player (whose hand is emptied)
  serve(cu, by) {
    const dish = this.menu[cu.want], ty = CUST_TYPES[cu.type || "quen"];
    const lock = (by ? by.carryLock : this.hand?.lock) ?? dish.price; // v1.2: price locked at cook start by freshness
    if (by) by.carryLock = null;
    const ratio = cu.patience / (cu.patienceMax || this.t.patience_s);
    const baseTip = ratio >= this.t.tip_min_patience_ratio ? Math.floor(lock * this.t.tip_rate) * ty.tipMul : 0;
    const hintTip = cu.hint ? Math.floor(lock * this.t.tip_rate) : 0; // sộp asked for this dish in conversation
    const tip = baseTip + hintTip;
    const gain = this.payFor(cu, lock) + tip;
    this.release(cu);
    this.money += gain; this.tips += tip; this.sold[cu.want] = (this.sold[cu.want] || 0) + 1; if (!by) this.hand = null; cu.state = "eating"; cu.eat = this.t.eat_s; this.served++;
    this.callMeta("trackChore", "served", 1);
    if (ratio >= 0.5) { this.fastCount++; this.callMeta("trackChore", "served_fast", 1); }
    if (tip) { this.tipsCount++; this.callMeta("trackChore", "tip", 1); }
    if (hintTip) this.toast(cu.x, cu.z + 2, "Bo thêm vì đúng món ruột!", "#ffd23a");
    if (by) this.toast(cu.x - 1, cu.z + 0.4, by.name + " bưng ra", "#9fe");
    this.rep = clamp(this.rep + (tip ? this.t.tip_reputation : 0), this.t.reputation_min, this.t.reputation_max);
    this.repFlash = 0.5;
    sfx("coin"); if (tip) sfx("ding"); fx.flash("rgba(255,220,120,.2)", 0.12);
    this.toast(cu.x, cu.z + 1.2, `+${gain}k${tip ? " 🪙" : ""}`, "#ffe14d");
    const sx = this._sx(cu.x), sy = this._sy(cu.z) - 18;
    for (let i = 0; i < 10; i++) this.ps.add({ x: sx, y: sy, vx: (Math.random() - .5) * 40, vy: -20 - Math.random() * 30, g: 90, size: 1 + (i % 2), life: 0.7, color: i % 2 ? "#ffd23a" : "#fff0a8" });
    const nCoins = 3 + (tip ? 2 : 0) + (cu.type === "sop" ? 2 : 0);
    for (let i = 0; i < nCoins; i++) this.coins.push({ x0: sx + (i - nCoins / 2) * 4, y0: sy, vx: (i - nCoins / 2) * 14, t: -i * 0.05 });
  }
  leave(cu) {
    const delta = this.t.left_reputation_delta * CUST_TYPES[cu.type || "quen"].leaveMul;
    this.release(cu); cu.state = "gone"; this.left++; this.rep = clamp(this.rep + delta, this.t.reputation_min, this.t.reputation_max);
    this.repFlash = 0.5; sfx("hurt", undefined, "[khách giận dỗi bỏ đi]"); fx.shake(cu.type === "sop" ? 5 : 3, 0.3);
    this.toast(cu.x, cu.z + 1, "Bỏ đi 😠 " + delta + " uy tín", "#ff6b6b");
    this.callMeta("trackChore", "missed", 1); // a guest walked out hungry (same rule as meta.quanFallback)
    this.depart(cu, true);
  }
  // visual only: the customer stands up and walks back to a sampan at the right edge
  depart(cu, angry) {
    const v = cu.vis || { x: cu.x + SEAT_DX, z: cu.z };
    if (v.phase === "boat") { this.boats.push({ x: v.x, z: DOCK.z, vx: 1, who: cu, angry }); return; }
    this.walkers.push({ x: v.x, z: v.z, who: cu, angry, walk: 0, leg: 0 });
  }

  // C / HUD button: the first press asks for confirmation, a second within 3 s closes
  requestClose() {
    if (this.ended) return;
    if (this.confirmClose > 0) return this.closeEarly();
    this.confirmClose = 3; sfx("click");
  }
  // contract closing rule: eating guests have already paid (payment happens at serve), waiting guests leave
  // without reputation loss (their reservations are released), dishes on stoves / in hand are cleared.
  closeShop() {
    for (const cu of this.customers) {
      if (cu.state === "waiting" || cu.state === "nodish" || cu.state === "queue") { this.release(cu); cu.state = "gone"; cu.talk = null; this.depart(cu, false); }
      else if (cu.state === "eating") { cu.state = "done"; this.depart(cu, false); }
    }
    for (const st of this.stoves) { st.state = "idle"; st.dish = null; st.cook = 0; }
    this.hand = null; this.menuOpen = false; this.overlay = null;
    const w = this.staff.waiter; if (w) { w.carry = null; w.cu = null; w.task = "idle"; }
    const k = this.staff.cook; if (k) k.task = "idle";
  }
  closeEarly() { if (this.ended) return; this.closedEarly = true; sfx("whoosh"); this.endRun(); }
  endRun() {
    if (this.ended) return; this.ended = true;
    removeEventListener("pointerdown", this._onMove);
    this.closeShop();
    this.score = this.money + 100 * Math.floor(this.rep);
    this.pushReview();
    this.result = { money: this.money, rep: this.rep, score: this.score, t: 0, stars: Math.floor(this.rep), served: this.served, left: this.left, day: this.day, tips: this.tips, sold: { ...this.sold }, rep0: this.rep0, closedEarly: !!this.closedEarly, missed: this.missed,
      left_queue: this.left_queue, tipsCount: this.tipsCount, served_fast: this.fastCount, review: this.review,
      // leftover raw items (spoiled included) → main.js hands them to the Shop (Chợ Chú Sáu sells the usable ones)
      leftover: this.items.map((it) => ({ id: it.id, kind: it.kind, fresh: it.fresh, spoiled: !!it.spoiled || it.fresh < this.fresh.spoiled_below })) };
    music("theme"); sfx("fanfare");
  }
  // one short guest review into the phone inbox (meta.pushMessage)
  pushReview() {
    const praise = [], gripe = [];
    if (this.served) praise.push(`đồ ăn ngon (${this.served} khách no nê)`);
    if (this.fastCount) praise.push(`lên món lẹ (${this.fastCount} lần)`);
    if (this.tipsCount) praise.push(`phục vụ dễ thương (${this.tipsCount} lần bo)`);
    if (this.decorMul > 1) praise.push("quán trang trí đẹp");
    if (this.talks) praise.push("chủ quán vui tính, hay hỏi han");
    if (this.left) gripe.push(`chờ món lâu quá (${this.left} người bỏ về)`);
    if (this.left_queue) gripe.push(`hết bàn, đứng chờ mỏi chân (${this.left_queue} người về)`);
    if (this.missed) gripe.push(`hết món sớm (${this.missed} người về không)`);
    const parts = [];
    if (praise.length) parts.push("Khách khen: " + praise.join(", ") + ".");
    if (gripe.length) parts.push("Khách phàn nàn: " + gripe.join(", ") + ".");
    if (!parts.length) parts.push("Khách khen: tối nay quán yên tĩnh, ngồi hóng gió sông thiệt sướng.");
    this.review = parts.join(" ");
    this.callMeta("pushMessage", "Khách quán", this.review);
  }

  update(dt) {
    // Bà Tư's dialog: the quán freezes (clock, customers, stoves, staff) and the overlay gets the frame
    if (this.overlay) {
      const ov = this.overlay;
      try { ov.update && ov.update(dt); } catch (e) { console.warn("Bà Tư dialog", e); ov.done = true; }
      if (ov.done && this.overlay === ov) { this.overlay = null; this.applyMeta(); }
      return;
    }
    if (this.boardOpen && this.board) { try { this.board.update(dt); } catch (e) { console.warn("menu board", e); this.boardOpen = false; } return; }
    this.ps.update(dt);
    this.toasts.forEach((t) => { t.life -= dt; t.oy -= dt * 16; }); this.toasts = this.toasts.filter((t) => t.life > 0);
    if (this.repFlash > 0) this.repFlash -= dt;
    this.updateActors(dt);
    if (this.phase === "preopen") return this.updatePreopen(dt);
    if (this.result) { this.result.t += dt; if (input.hit("restart")) this.onEnd({ restart: true }); else if (this.result.t > 0.8 && input.any()) this.onEnd(this.result); return; }

    if (this._menuOpen) { this.updateMenu(); return; }
    this.decayStock(dt); // v1.2 freshness (frozen while the cook menu / Bà Tư / pause is open)
    this.walk(dt);

    if (input.hit("interact")) this.interact();
    if (input.hit("restart")) this.onEnd({ restart: true });
    if (input.hit("close")) { this.requestClose(); if (this.ended) return; }
    if (this.confirmClose > 0) this.confirmClose -= dt;
    // no dish can be made for a NEW guest any more -> persistent banner + one short voice line
    this.noDish = !Object.keys(this.menu).some((k) => this.orderable(k));
    this.allSoldOut = this.noDish && Object.keys(this.menu).some((k) => this.freeOK(k)); // stock left, but every portion target is met
    if (this.noDish && !this.noDishSaid) { this.noDishSaid = true; try { voiceLine("sen", "Hết nguyên liệu rồi Má ơi! Đóng quán sớm nghen?"); } catch (e) {} }

    // stoves
    for (const s of this.stoves) { if (s.state === "cooking") { s.cook -= dt; if (s.cook <= 0) { s.state = "ready"; s.pop = 0.4; sfx("ding"); this.toast(s.pos[0], s.pos[1] + 1, "Chín rồi!", "#79c75a"); } } if (s.pop > 0) s.pop -= dt; }
    // customers
    this.nextCust -= dt;
    if (this.nextCust <= 0) { this.spawnCustomer(); this.nextCust = this.arrivalGap(); if (Math.random() < this.burstChance) this.burstT = 0.9; }
    if (this.burstT > 0) { this.burstT -= dt; if (this.burstT <= 0) this.spawnCustomer(); }
    for (const cu of this.customers) {
      if (cu.enter < 1) cu.enter = Math.min(1, cu.enter + dt * 2);
      if (cu.premLine && cu.state === "waiting" && !cu.talk && cu.vis && cu.vis.phase === "seat") { cu.talk = { lines: [cu.premLine], i: 0, t: 0 }; cu.premLine = null; this.say(cu); this.toast(cu.x, cu.z + 2, "Gọi món đặc sản!", "#ffd23a"); }
      if (cu.talk) this.updateTalk(cu, dt);
      if (cu.state === "waiting") {
        cu.patience -= dt;
        // SFX captions: one grumble + caption when this guest drops under ANGRY_AT (same threshold as the red ring)
        if (!cu.angryCue && cu.patience > 0 && cu.patience / (cu.patienceMax || this.t.patience_s) < ANGRY_AT) { cu.angryCue = true; sfx("blip", undefined, "[khách " + (cu.table || "") + " càu nhàu — sắp giận]"); }
        if (cu.patience <= 0) this.leave(cu);
      }
      else if (cu.state === "queue") { cu.qPat -= dt; if (cu.qPat <= 0) this.leaveQueue(cu); }
      else if (cu.state === "nodish") { if (!cu.vis || cu.vis.phase === "seat" || cu.vis.phase === "stand") { cu.nd -= dt; if (cu.nd <= 0) { cu.state = "gone"; this.missed++; this.callMeta("trackChore", "missed", 1); this.toast(cu.x, cu.z + 1, "Khách về vì hết món", "#ffb36b"); this.depart(cu, false); } } }
      else if (cu.state === "eating") { cu.eat -= dt; if (cu.eat <= 0) { cu.state = "done"; this.toast(cu.x, cu.z + 1, "Ngon! 😋", "#79c75a"); this.depart(cu, false); } }
    }
    this.customers = this.customers.filter((c) => (c.state !== "gone" && c.state !== "done") || (c.fade = (c.fade || 1) - dt) > 0);
    this.seatFromQueue();
    this.updateWaiter(dt); this.updateCook(dt);
    this.ambientChat(dt);
    const done = this.callMeta("popCompletions");
    if (Array.isArray(done)) for (const d of done) { this.toast(this.p.x, this.p.z + 2.2, "Xong việc: " + (d.title || ""), "#ffd23a"); sfx("coin"); }

    this.time -= dt;
    this.score = this.money + 100 * Math.floor(this.rep);
    if (this.time <= 0) { this.time = 0; this.endRun(); }
    if (this.hintT > 0) this.hintT -= dt;
  }
  walk(dt) {
    const t = this.t, p = this.p;
    let [mx, mz] = input.axis(); mz = -mz; // up key = toward the back rail (+z)
    if (mx || mz) { const n = Math.hypot(mx, mz) || 1; mx /= n; mz /= n; this.started = true; this.hintT = 0; }
    p.vx = lerp(p.vx, mx * t.walk_speed, 0.25); p.vz = lerp(p.vz, mz * t.walk_speed, 0.25);
    p.x = clamp(p.x + p.vx * dt, 0.5, t.bounds.x[1] - 0.5);
    p.z = clamp(p.z + p.vz * dt, 0.5, t.bounds.z[1] - 0.5);
    if (Math.abs(mx) > 0.01) p.face = mx > 0 ? 1 : -1;
    p.walk = (mx || mz) ? p.walk + dt : 0;
  }
  // ---- PRE-OPEN phase: walk the raft before service. No guests, the shift clock and arrivals are frozen, and freshness
  // is FROZEN too (fairness: browsing the board or chatting with Bà Tư must not cost the player stock quality). ----
  preNear() {
    const d = (o) => Math.hypot(o.x - this.p.x, o.z - this.p.z);
    if (this.nearBaTu()) return "batu";
    if (d(BOARD) <= 1.6) return "board";
    if (d(BELL) <= 1.6) return "bell";
    return null;
  }
  updatePreopen(dt) {
    if (this.openAsk) { // confirm box: E/Enter/Space opens, Esc (or N/O again does nothing) keeps walking
      if (input.hit("back")) { this.openAsk = false; sfx("click"); return; }
      if (input.hit("interact") || input.hit("confirm") || input.hit("catch")) { this.openAsk = false; this.openService(); }
      return;
    }
    if (input.hit("open") || input.hit("next")) { this.openAsk = true; sfx("click"); return; }
    this.walk(dt);
    if (this.bellConfirm > 0) this.bellConfirm -= dt;
    const done = this.callMeta("popCompletions");
    if (Array.isArray(done)) for (const d of done) { this.toast(this.p.x, this.p.z + 2.2, "Xong việc: " + (d.title || ""), "#ffd23a"); sfx("coin"); }
    if (!(input.hit("interact") || input.hit("confirm") || input.hit("catch"))) return;
    const n = this.preNear();
    if (n === "batu") return this.openBaTu();
    if (n === "board") return this.openBoard();
    if (n === "bell") { this.openAsk = true; this.bellConfirm = 0.6; sfx("click"); }
  }
  openBoard() {
    if (!this.board) { this.toast(BOARD.x, BOARD.z + 1.5, "Tối nay bán đủ món", "#ffe9c4"); return; }
    this.board.reopen();
    this.board.onDone = (sel) => { this.boardOpen = false; this.boardSel = sel; this.applyBoard(); if (sel && sel.open) this.openAsk = true; }; // N on the board → the same "Mở quán bây giờ?" confirm
    this.boardOpen = true; sfx("select");
  }
  applyBoard() { const sel = this.boardSel || this.board?.selection?.(); if (sel) this.setMenu(sel.menu, sel.portions); }
  // the bell: service starts with the board's picks (the plan dishes if the board was never opened)
  openService() {
    if (this.phase !== "preopen") return;
    const sel = this.boardSel || (this.board ? this.board.selection() : null);
    if (sel && !sel.menu.length) { sfx("hurt"); this.toast(BOARD.x, BOARD.z + 1.5, "Chọn ít nhất 1 món trên bảng!", "#ff8a8a"); return this.openBoard(); }
    if (sel) this.setMenu(sel.menu, sel.portions);
    this.phase = "open"; this.started = false; this.hintT = 4; this.bellConfirm = 0;
    sfx("ding"); sfx("fanfare"); fx.flash("rgba(255,220,120,.25)", 0.15);
    this.toast(BELL.x - 1, BELL.z + 2.4, "Mở quán!", "#ffd23a");
    try { voiceLine("sen", "Mở quán rồi! Mời bà con ghé ăn nghen!"); } catch (e) {}
    this.onOpen?.({ menu: Object.keys(this.menu), portions: this.portions });
  }
  // visual-only motion: arrivals, walkers, boats, coins, sizzle sparks (no gameplay state)
  updateActors(dt) {
    for (const cu of this.customers) {
      const v = cu.vis; if (!v || cu.state === "gone" || cu.state === "done") continue;
      if (v.phase === "boat") { v.k = Math.min(1, v.k + dt / 1.1); v.x = BOAT_X + 4 * (1 - v.k) ** 2; if (v.k >= 1) { v.phase = "walk"; v.x = DOCK.x; this.boats.push({ x: BOAT_X, z: DOCK.z, vx: 0, face: -1 }); } }
      else if (v.phase === "walk") {
        const [tx, tz] = this.target(cu), dx = tx - v.x, dz = tz - v.z, d = Math.hypot(dx, dz), step = WALK * dt;
        v.walk += dt; v.face = dx < 0 ? -1 : 1;
        if (d <= step) { v.x = tx; v.z = tz; v.phase = cu.table ? "seat" : "stand"; v.face = -1; } else { v.x += dx / d * step; v.z += dz / d * step; }
      } else if (v.phase === "stand") { // queue moves up
        const [tx, tz] = this.target(cu); if (Math.hypot(tx - v.x, tz - v.z) > 0.05) v.phase = "walk";
      }
    }
    for (const w of this.walkers) {
      const tx = w.leg ? BOAT_X : DOCK.x, tz = DOCK.z, dx = tx - w.x, dz = tz - w.z, d = Math.hypot(dx, dz), step = WALK * dt;
      w.walk += dt;
      if (d <= step) { w.x = tx; w.z = tz; if (w.leg) { w.done = true; this.boats.push({ x: BOAT_X, z: DOCK.z, vx: 1, who: w.who, angry: w.angry }); } else w.leg = 1; }
      else { w.x += dx / d * step; w.z += dz / d * step; }
    }
    this.walkers = this.walkers.filter((w) => !w.done);
    for (const b of this.boats) { b.vx = Math.min(5, b.vx + dt * 3); b.x += b.vx * dt; }
    this.boats = this.boats.filter((b) => b.x < BOAT_X + 6);
    for (const k of this.coins) k.t += dt;
    this.coins = this.coins.filter((k) => k.t < 0.95);
    for (const s of this.stoves) if (s.state === "cooking") {
      this.sparkT -= dt;
      if (this.sparkT <= 0) {
        this.sparkT = 0.07;
        const x = this._sx(s.pos[0]), y = this._sy(s.pos[1]) - 20;
        this.ps.add({ x: x + (Math.random() - 0.5) * 14, y, vx: (Math.random() - 0.5) * 50, vy: -40 - Math.random() * 40, g: 160, size: 1, life: 0.35 + Math.random() * 0.2, color: Math.random() < 0.5 ? "#ffd23a" : "#ff8a3d" });
      }
    }
  }
  // where a guest walks to: the stool beside their table, their queue spot, or (no table, no dish) the gangway
  target(cu) {
    if (cu.table) return [cu.x + SEAT_DX, cu.z];
    if (cu.state === "queue") { const i = Math.max(0, this.queue().indexOf(cu)); return QSPOTS[i % QSPOTS.length]; }
    return [cu.x, cu.z];
  }
  updateMenu() {
    const keys = Object.keys(this.menu);
    if (!keys.length) { if (input.hit("back") || input.hit("interact") || input.hit("confirm")) this.menuOpen = false; return; }
    if (input.hit("up")) { this.menuSel = (this.menuSel + keys.length - 1) % keys.length; sfx("click"); }
    if (input.hit("down")) { this.menuSel = (this.menuSel + 1) % keys.length; sfx("click"); }
    const L = this.menuLayout(keys.length); // two columns (> 6 dishes): ←→ jump between them
    if (L.cols > 1 && (input.hit("left") || input.hit("right"))) { const r = this.menuSel % L.rows, c = (Math.floor(this.menuSel / L.rows) + 1) % L.cols, ni = c * L.rows + r; this.menuSel = Math.min(keys.length - 1, ni); sfx("click"); }
    if (input.hit("back")) { this.menuOpen = false; sfx("click"); }
    if (input.hit("interact") || input.hit("confirm")) this.cook(keys[this.menuSel]);
  }

  // transforms (contract → low-res screen)
  _sx(x) { return Math.round(X0 + x * XS); }
  _sy(z) { return Math.round(Y0 - z * ZS) + (this.bob || 0); }

  draw() {
    const c = screen.px, time = performance.now() / 1000;
    this.bob = Math.round(Math.sin(time * 1.2) * 0.7);
    const dusk = clamp(1 - (1 - this.time / this.time0) / 0.3, 0, 1); // sunset fades out over the first 30% of the shift
    c.imageSmoothingEnabled = false;
    // ---- river backdrop (no back wall: the whole Mekong night behind the raft) ----
    this.cs.t = time;
    riverWorld(c, this.cs, "night");
    if (dusk > 0) { c.save(); c.globalAlpha = dusk; riverWorld(c, this.cs, "dusk"); c.restore(); }
    c.save(); c.globalAlpha = 1 - dusk * 0.8; moon(c, 392, 70); c.restore();
    const lights = [];
    // far water (river surface between the far bank and our raft), with lantern + moon reflections
    // busy night river: six sampans coming and going at different speeds, some with a cây bẹo of goods
    const farBoats = [0, 1, 2, 3, 4, 5].map((i) => {
      const dir = i % 3 === 1 ? -1 : 1, sp = 5 + ((i * 3) % 7), span = W + 160, u = ((i * 97 + time * sp) % span) - 80;
      return { x: dir > 0 ? u : W - u, y: 128 + (i % 3) * 9 + (i > 2 ? 4 : 0), i, dir, s: 0.36 + (i % 3) * 0.05 };
    }).sort((a, b) => a.y - b.y);
    nightWater(c, HORIZON + 2, H, time, [...[40, 190, 340].map((x) => [x - 4, HORIZON + 3, 22]), ...farBoats.map((b) => [b.x - 3, b.y + 2, 14])], 392);
    for (const b of farBoats) {
      sampan(c, b.x, b.y, b.dir, time + b.i, b.s, { roof: b.i % 2 ? "#6b3d22" : null, beo: b.i % 3 === 2 ? b.i : 0 });
      const lx = b.x - 3 * b.dir; R(c, lx, b.y - 14, 1, 10, P.woodD); R(c, lx - 2, b.y - 17, 5, 4, b.i % 2 ? P.red : P.orange); R(c, lx - 1, b.y - 16, 3, 2, P.yellow);
      lights.push([lx, b.y - 15, 6, 0.08]);
    }
    // ---- the raft ----
    const yb = Y_BACK + this.bob, yf = Y_FRONT + this.bob;
    roofAndPosts(c, DECK_L, DECK_R + 4, yf, time);
    backRail(c, 150, DECK_R, yb);
    kitchenBack(c, DECK_L + 4, 146, yb, time);
    deck(c, DECK_L, DECK_R, yb, yf, time);
    // décor: restaurant sign over the kitchen, bougainvillea garland along the back rail (flowers lv2)
    const uiOK = !this.menuOpen && !this.result;
    const signGlow = quanSign(c, 80, 96 + this.bob, this.decor.sign, time, uiOK);
    if (signGlow) lights.push([80, 103, 40, 0.06, signGlow]);
    if (this.decor.flowers >= 2) flowerGarland(c, 152, DECK_R - 4, yb - 14, time);
    // front water line under the floats: warm reflections of the lantern strings, ripples
    const frontRefl = []; for (let x = 60; x < DECK_R; x += 44) frontRefl.push([x, yf + 12, 14]);
    for (const [lx, , len] of frontRefl) for (let k = 0; k < len; k += 2) R(c, lx - 2 + Math.round(Math.sin(time * 3 + k + lx) * 1.5), yf + 14 + k, 3 + (k % 3), 1, `rgba(255,170,80,${0.32 - k * 0.02})`);
    R(c, 0, yf + 12, W, 1, "rgba(200,220,255,.35)");
    for (let i = 0; i < 5; i++) ripple(c, 40 + i * 92, yf + 18, time, i * 0.21);
    // gangway at the right edge where sampans dock
    const dockY = this._sy(DOCK.z);
    landing(c, DECK_R, dockY, time); lights.push([DECK_R + 13, dockY - 27, 18, 0.14]);
    if (this.decor.flowers >= 2) flowerArch(c, DECK_R - 6, 26, dockY, 40, time);
    // ---- depth-sorted actors ----
    const ents = [];
    for (const s of this.stoves) ents.push({ z: s.pos[1], draw: () => this.drawStove(c, s, time) });
    ents.push({ z: PASS.z, draw: () => this.drawPass(c, time) });
    ents.push({ z: BA_TU.z, draw: () => this.drawBaTu(c, time) });
    ents.push({ z: BOARD.z + 0.3, draw: () => this.drawMenuBoard(c, time) });
    if (this.phase === "preopen") ents.push({ z: BELL.z + 0.3, draw: () => this.drawBell(c, time) });
    for (const tb of this.tables) ents.push({ z: tb.pos[1] + 0.05, draw: () => this.drawTable(c, tb, time) });
    for (const cu of this.customers) if (cu.state !== "gone" && cu.state !== "done" && cu.vis) ents.push({ z: cu.vis.z - 0.02, draw: () => this.drawCustomer(c, cu, time) });
    for (const w of this.walkers) ents.push({ z: w.z - 0.02, draw: () => this.drawWalker(c, w, time) });
    for (const b of this.boats) ents.push({ z: b.z + 0.5, draw: () => this.drawBoat(c, b, time) });
    ents.push({ z: this.p.z, draw: () => this.drawPlayer(c, time) });
    const W8 = this.staff.waiter, CK = this.staff.cook;
    if (W8) ents.push({ z: W8.z, draw: () => this.drawWaiter(c, W8, time) });
    if (CK) ents.push({ z: CK.z, draw: () => this.drawCook(c, CK, time) });
    if (this.decor.flowers >= 1) [[6.6, 0.25, 0], [11.1, 0.25, 1], [15.3, 0.25, 2], [0.5, 6.5, 3]].forEach(([x, z, k]) => ents.push({ z, draw: () => flowerPot(c, this._sx(x), this._sy(z), time, k) }));
    ents.sort((a, b) => b.z - a.z);
    ents.forEach((e) => e.draw());
    // smoke + steam over the kitchen
    this.drawReady(c, time);
    for (const s of this.stoves) if (s.state === "cooking") smoke(c, this._sx(s.pos[0]) + 2, this._sy(s.pos[1]) - 24, time);
    this.ps.draw(c, 0, 0);
    // ---- roof lanterns + light ----
    const ls = this.decor.lanterns;
    lanternString(c, 104, 232, 19, 14, 5, time, lights, ls, 0);
    lanternString(c, 248, 372, 19, 14, 5, time, lights, ls, 2);
    lanternString(c, DECK_L + 6, 98, 54, 6, 3, time, lights, ls, 1);
    lanternString(c, 380, DECK_R, 44, 8, 2, time, lights, ls, 3);
    for (const L of lights) glow(c, L[0], L[1], L[2] || 22, L[3] || 0.1, L[4]);
    for (const s of this.stoves) if (s.state !== "idle") glow(c, this._sx(s.pos[0]), this._sy(s.pos[1]) - 8, 46, 0.16 + Math.sin(time * 18) * 0.02, "255,120,40");
    c.fillStyle = "rgba(255,150,70,.05)"; c.fillRect(DECK_L, 19, DECK_R - DECK_L, yb - 19);
    // ---- overlays: coins, order bubbles, badges, prompts, toasts ----
    this.drawCoins(c);
    for (const cu of this.customers) if (cu.state === "waiting" && cu.vis) this.drawOrder(c, cu, time);
    for (const cu of this.customers) if (cu.state === "nodish" && cu.vis?.phase === "seat") { const x = this._sx(cu.vis.x), y = this._sy(cu.vis.z); txt("Hết món rồi…", x, y - 40, { size: 8, align: "center", color: "#3a1410", weight: 900, stroke: "#fff6e8", sw: 4 }); }
    if (!this.menuOpen && !this.result) for (const cu of this.customers) if (cu.talk && cu.vis && cu.state !== "gone" && cu.state !== "done") this.drawTalk(cu);
    this.drawPrompts(time);
    this.toasts.forEach((t) => txt(t.txt, this._sx(t.x), this._sy(t.z) - 26 + t.oy, { size: 9, align: "center", color: t.col, weight: 900, stroke: "#1a1220", sw: 2.5, alpha: clamp(t.life, 0, 1) }));

    if (this.hudOff) return; // DayResult pop-up draws over the frozen raft
    this.drawHUD(c, time);
    if (this.phase === "preopen") this.drawPreopen(c, time);
    if (this._menuOpen) this.drawMenu(c, time);
    if (this.result) this.drawResult(c, time);
    else if (this.hintT > 0 && !this.started && !this.menuOpen && this.phase === "open") this.drawHint(c);
    if (this.boardOpen && this.board) { try { this.board.draw(); } catch (e) { console.warn("menu board draw", e); } }
    if (this.overlay) { try { this.overlay.draw && this.overlay.draw(); } catch (e) { console.warn("Bà Tư dialog draw", e); } }
  }
  // wooden menu board on the back rail (pixel layer; it stays up all night)
  drawMenuBoard(c, time) {
    const x = this._sx(BOARD.x), y = this._sy(BOARD.z);
    R(c, x - 1, y - 30, 2, 30, P.woodD);
    R(c, x - 14, y - 46, 28, 20, P.woodL); R(c, x - 13, y - 45, 26, 18, "#4a2e18");
    const keys = Object.keys(this.phase === "preopen" && this.boardSel ? Object.fromEntries(this.boardSel.menu.map((k) => [k, 1])) : this.menu);
    for (let i = 0; i < Math.min(4, keys.length); i++) R(c, x - 10, y - 42 + i * 4, 14 + ((i * 5) % 6), 1, "#fff6e8");
    if (this.phase === "preopen") { const k = Math.sin(time * 4) > 0 ? 1 : 0; R(c, x - 14, y - 47, 28, 1, k ? P.yellow : P.woodL); }
  }
  // bell on a post at the gangway (pre-open only): ring it to open for service
  drawBell(c, time) {
    const x = this._sx(BELL.x), y = this._sy(BELL.z), sw = this.bellConfirm > 0 ? Math.round(Math.sin(time * 20) * 1.5) : 0;
    R(c, x, y - 34, 2, 34, P.woodD); R(c, x - 6, y - 34, 14, 2, P.woodD);
    R(c, x - 6 + sw, y - 32, 1, 3, P.ink); R(c, x - 9 + sw, y - 29, 7, 6, P.yellow); R(c, x - 10 + sw, y - 23, 9, 1, P.yellowD); R(c, x - 7 + sw, y - 28, 2, 3, "#fff3b0");
  }
  // pre-open UI: prompt tags, banner, chosen-menu card, phone icon
  drawPreopen(c, time) {
    if (this.overlay || this.boardOpen) return;
    // always-visible wooden "Mở quán ▶" button (bottom-right; click, O or N) + its confirm box
    { const b = this.openBtn, a = 0.85 + 0.15 * Math.sin(time * 4);
      panel(b.x, b.y, b.w, b.h, { fill: "rgba(150,70,24,.97)", border: "#ffd23a", bw: 1.6, r: 5 });
      const u = screen.ui; u.save(); u.translate(b.x + 5, b.y + 4); u.scale(1.1, 1.1); R(u, 3, 0, 3, 1, P.yellowD); R(u, 2, 1, 5, 5, P.yellow); R(u, 1, 6, 7, 1, P.yellowD); R(u, 4, 7, 1, 2, P.yellowD); u.restore();
      txt("Mở quán ▶", b.x + 18, b.y + 12.5, { size: 9, color: "#fff", weight: 900, alpha: a });
      panel(b.x + b.w - 15, b.y + 4, 11, 10, { fill: "#ffe9c4", border: false, r: 2.5 }); txt("O", b.x + b.w - 9.5, b.y + 12, { size: 7.5, align: "center", color: "#2a1608", weight: 900 }); }
    if (this.openAsk) {
      const u = screen.ui; u.save(); u.fillStyle = "rgba(6,4,2,.5)"; u.fillRect(0, 0, W, H); u.restore();
      panel(W / 2 - 130, H / 2 - 30, 260, 60, { fill: "rgba(46,26,14,.98)", border: "#ffd23a", bw: 1.8, r: 8 });
      txt("Mở quán bây giờ?", W / 2, H / 2 - 10, { size: 12, align: "center", color: "#ffd23a", weight: 900 });
      txt("Khách sẽ bắt đầu tới — đồng hồ và độ tươi chạy từ lúc này", W / 2, H / 2 + 5, { size: 7.5, align: "center", color: "#ffe9c4", weight: 800 });
      txt("E/Enter: Mở   ·   Esc: Chưa", W / 2, H / 2 + 20, { size: 9, align: "center", color: "#fff", weight: 900 });
      return;
    }
    const n = this.preNear();
    const tag = (o, key, label, col, glyph, dy) => promptTag(this._sx(o.x), this._sy(o.z) - dy, key, label, col, glyph, 1, time);
    if (n === "board") tag(BOARD, "E", "Bảng thực đơn", "#ffe9c4", "board", 50);
    else if (n === "bell") tag(BELL, "E", "Mở quán ▶", "#ffd23a", "bell", 40);
    else if (n === "batu") tag(BA_TU, "E", "Nói chuyện", "#e8c8ff", "talk", 30);
    const a = 0.8 + 0.2 * Math.sin(time * 3);
    panel(W / 2 - 132, 36, 264, 16, { fill: "rgba(42,24,14,.9)", border: "#ffd23a", r: 6, alpha: a });
    txt("Chưa mở quán — đi dạo, nói chuyện với Bà Tư, chọn thực đơn", W / 2, 47, { size: 7.5, align: "center", color: "#ffe9c4", weight: 900 });
    const lh = this.lockedStockHint(); if (lh) txt("🔒 " + lh, W / 2, 62, { size: 7.5, align: "center", color: "#ffd23a", weight: 900, stroke: "rgba(20,10,4,.85)", sw: 2.5 });
    // chosen menu card (bottom-left, right of the phone icon)
    const sel = this.boardSel || this.board?.selection?.() || { menu: Object.keys(this.menu), portions: this.portions };
    const items = sel.menu.map((k) => dishName(k) + (sel.portions && sel.portions[k] != null ? " ×" + sel.portions[k] : ""));
    let line = items.join(" · "); while (line.length > 8 && measure(line, 7, 800) > 284) line = line.slice(0, -3) + "…"; // 12 dishes with Đặc sản: clip
    const w = Math.min(300, Math.max(120, Math.ceil(measure(line, 7, 800)) + 16)), x = 46, y = H - 34;
    panel(x, y, w, 24, { fill: HUD.fill, border: HUD.border, r: 6 });
    txt("THỰC ĐƠN TỐI NAY", x + 6, y + 9, { size: 7, color: "#ffd23a", weight: 900 });
    txt(items.length ? line : "chưa chọn món", x + 6, y + 19, { size: 7, color: items.length ? HUD.text : "#ff9a9a", weight: 800 });
    let unread = 0; try { unread = this.callMeta("unreadCount") || 0; } catch (e) {}
    drawPhoneIcon(unread, time);
  }
  // small name tag over a staff member / Bà Tư (UI layer)
  nameTag(x, y, name, col = "#ffe9c4") {
    if (this.menuOpen || this.result) return;
    const w = Math.ceil(measure(name, 6.5, 900)) + 8;
    panel(x - w / 2, y - 9, w, 9, { fill: "rgba(42,24,14,.85)", border: col, bw: 0.8, r: 3 });
    txt(name, x, y - 2.3, { size: 6.5, align: "center", color: col, weight: 900 });
  }
  drawWaiter(c, w, time) {
    const x = this._sx(w.x), y = this._sy(w.z), s = depthScale(w.z) * 0.86;
    scaled(c, s, x, y, (cc, ax, ay) => personSide(cc, ax, ay, { face: w.face, shirt: "#e84a5a", pants: "#2a3a5a", hair: "#1a1218", cap: "#2a8f5a", walk: w.walk, carry: w.carry, t: time }));
    if (w.carry) steam(c, x + 1, y - Math.round(36 * s), time, 3, 8);
    this.nameTag(x, y - Math.round((w.carry ? 40 : 26) * s), w.name + (w.lv >= 2 ? " ★" : ""), "#ff9aa8");
  }
  drawCook(c, k, time) {
    const x = this._sx(k.x), y = this._sy(k.z), s = depthScale(k.z);
    const st = this.stoves[k.stove], stir = k.task === "stir" && st && st.state === "cooking" && !k.walk;
    scaled(c, s, x, y, (cc, ax, ay) => personSide(cc, ax, ay, { face: k.face, shirt: "#f2efe6", pants: "#3a3a44", hair: "#2a1d2b", band: P.red, mustache: true, towel: "#9fd8ff", walk: k.walk, arm: stir ? "stir" : null, t: time }));
    this.nameTag(x, y - Math.round(27 * s), k.name + (k.lv >= 2 ? " ★" : ""), "#9fd8ff");
  }
  // speech bubble over a guest who is talking (UI layer); ambient chatter is smaller and unnamed
  drawTalk(cu) {
    const v = cu.vis, tk = cu.talk, line = tk.lines[tk.i]; if (!line) return;
    const size = tk.ambient ? 6.5 : 7, rows = wrap(line, tk.ambient ? 96 : 124, size);
    const tw = Math.max(...rows.map((r) => measure(r, size, 800)), tk.ambient ? 0 : measure(cu.name, 6.5, 900));
    const w = Math.ceil(tw) + 10, h = rows.length * (size + 2) + (tk.ambient ? 6 : 14);
    const sx = this._sx(v.x), top = this._sy(v.z) - (cu.state === "waiting" ? 70 : 32) - h;
    const x = clamp(sx - w / 2, 2, W - w - 2), ty = CUST_TYPES[cu.type] || CUST_TYPES.quen, a = clamp(Math.min(tk.t * 6, 1), 0, 1);
    panel(x, top, w, h, { fill: tk.ambient ? "rgba(255,248,232,.78)" : "rgba(255,248,232,.96)", border: tk.ambient ? "rgba(120,80,40,.5)" : ty.col, bw: 1, r: 5, alpha: a });
    let yy = top + 8;
    if (!tk.ambient) { txt(cu.name, x + 5, yy, { size: 6.5, color: "#8a4a1a", weight: 900, alpha: a }); yy += 8; }
    for (const r of rows) { txt(r, x + 5, yy + 1, { size, color: "#2a1a12", weight: 800, alpha: a, italic: !!tk.ambient }); yy += size + 2; }
  }
  drawStove(c, s, time) {
    const x = this._sx(s.pos[0]), y = this._sy(s.pos[1]), sc = depthScale(s.pos[1]) * (s.pop > 0 ? 1 + s.pop * 0.25 : 1);
    scaled(c, sc, x, y, (cc, ax, ay) => clayStove(cc, ax, ay, s.state, time));
    if (s.state === "cooking") { const fr = 1 - s.cook / s.cookMax; this.ring(c, x, y - 40, fr, "#ff8a3d"); txt(Math.ceil(s.cook) + "s", x, y - 37, { size: 7, align: "center", color: "#fff", weight: 900, stroke: "#1a1220", sw: 2 }); }
  }
  // where a stove's finished dish waits: the first two stoves use the left/right half of the pass, others sit on their own wok
  readySpot(i) {
    const s = this.stoves[i];
    if (i < 2) return [this._sx(PASS.x) + (i ? 4 : -12), this._sy(PASS.z) - 30];
    return [this._sx(s.pos[0]) - 8, this._sy(s.pos[1]) - 38];
  }
  drawPass(c, time) {
    const x = this._sx(PASS.x), y = this._sy(PASS.z);
    scaled(c, depthScale(PASS.z), x, y, (cc, ax, ay) => passCounter(cc, ax, ay));
    if (!this.stoves.some((s) => s.state === "ready")) { R(c, x - 9, y - 17, 7, 2, "#e8e2d0"); R(c, x - 9, y - 19, 7, 2, "#f2efe6"); } // stacked bowls
  }
  drawReady(c, time) {
    this.stoves.forEach((s, i) => {
      if (s.state !== "ready") return;
      const [x, y] = this.readySpot(i), dy = Math.round(Math.sin(time * 4 + i));
      c.drawImage(dishIcon(s.dish), x, y + dy, 16, 16);
      steam(c, x + 8, y + dy, time + i, 3, 12);
      txt("E", this._sx(s.pos[0]) + 14, this._sy(s.pos[1]) - 26, { size: 8, align: "center", color: "#79c75a", weight: 900, stroke: "#1a1220", sw: 2 });
    });
  }
  drawBaTu(c, time) {
    const busy = this.stoves.some((s) => s.state === "cooking");
    const x = this._sx(BA_TU.x), y = this._sy(BA_TU.z);
    const near = !this.hand && this.nearBaTu();
    scaled(c, depthScale(BA_TU.z), x, y, (cc, ax, ay) => personSide(cc, ax, ay, { face: 1, shirt: "#7a4fa0", pants: "#3a2a4a", hair: "#c9c2d4", bun: true, bunTie: P.red, apron: true, arm: near ? "wave" : busy ? "stir" : (Math.sin(time * 0.7) > 0.85 ? "wave" : null), t: time }));
    this.nameTag(x, y - 24, "Bà Tư", "#e8c8ff");
  }
  drawTable(c, tb, time) {
    const x = this._sx(tb.pos[0]), y = this._sy(tb.pos[1]), cu = this.customers.find((k) => k.table === tb.id && k.state === "eating");
    scaled(c, depthScale(tb.pos[1]), x, y, (cc, ax, ay) => {
      stool(cc, ax - 19, ay); stool(cc, ax + 19, ay); sideTable(cc, ax, ay, this.decor.cloth);
      if (cu) cc.drawImage(dishIcon(cu.want), ax + 2, ay - 24, 12, 12);
    });
    if (cu) steam(c, x + 8, y - 24, time, 3, 10);
  }
  custLook(cu) { return { shirt: cu.shirt || "#3a6fd8", hair: cu.hair || "#2a1d2b", hat: !!cu.hat }; }
  drawCustomer(c, cu, time) {
    const v = cu.vis, type = cu.type || "quen";
    const x = this._sx(v.x), y = this._sy(v.z);
    if (v.phase === "boat") { this.drawBoat(c, { x: v.x, z: DOCK.z, rider: cu }, time); return; }
    const seated = v.phase === "seat";
    // impatient customers fidget while waiting
    const jig = type === "voi" && cu.state === "waiting" && seated ? Math.round(Math.sin(time * 14) * 0.6) : 0;
    scaled(c, depthScale(v.z), x + jig, y, (cc, ax, ay) => {
      const talking = cu.talk && !cu.talk.ambient;
      personSide(cc, ax, ay, { ...this.custLook(cu), face: seated ? -1 : v.face, sit: seated, walk: v.phase === "walk" ? v.walk : 0, arm: cu.state === "eating" ? "eat" : talking ? "talk" : null, t: time });
      if (type === "sop") { cc.fillStyle = "#ffe9a0"; cc.fillRect(ax - 2, ay - 12, 4, 1); cc.fillStyle = "#e0a21a"; cc.fillRect(ax - 1, ay - 11, 2, 1); } // gold chain
    });
    if (cu.state === "eating") txt(Math.floor(time * 3) % 2 ? "😋" : "😊", x + 8, y - 26, { size: 9 });
    if (cu.state === "queue" && v.phase === "stand") { // own small patience bar while waiting for a table
      const fr = clamp(cu.qPat / (cu.qMax || QUEUE_PAT), 0, 1), bw = 12, by = y - 29;
      // same green → yellow → red scale as the patience ring (high-contrast via a11y.HC)
      const low = hc("#ff3a3a", HC.danger), qc = fr < 0.3 ? low : fr < 0.6 ? hc("#ffd23a", HC.warn) : "#79c75a";
      R(c, x - bw / 2 - 1, by - 1, bw + 2, 4, "rgba(20,10,8,.8)"); R(c, x - bw / 2, by, Math.max(1, Math.round(bw * fr)), 2, qc);
      if (fr < 0.3 && Math.floor(time * 5) % 2) R(c, x + 8, by - 4, 1, 3, low);
    }
    if (cu.state === "nodish" && v.phase === "stand" && !this.menuOpen && !this.result) txt("Hết món rồi…", x, y - 32, { size: 7, align: "center", color: "#3a1410", weight: 900, stroke: "#fff6e8", sw: 3 });
  }
  drawWalker(c, w, time) {
    const x = this._sx(w.x), y = this._sy(w.z), cu = w.who;
    scaled(c, depthScale(w.z), x, y, (cc, ax, ay) => personSide(cc, ax, ay, { ...this.custLook(cu), face: 1, walk: w.walk, angry: w.angry, t: time }));
    if (w.angry && Math.floor(time * 4) % 2) txt("💢", x - 6, y - 26, { size: 8 });
  }
  drawBoat(c, b, time) {
    const x = this._sx(b.x), y = this._sy(DOCK.z) + 10 + Math.round(Math.sin(time * 2 + b.x) * 1);
    const f = b.face ?? (b.vx > 0 ? 1 : -1); // drop-off boats back out with the bow still pointing at the raft
    sampan(c, x, y, f, time, 0.72, { roof: "#6b3d22" });
    // ferryman at the stern
    personSide(c, x - 12 * f, y - 5, { face: f, shirt: "#3a4a6a", hat: true, t: time });
    const rider = b.rider || b.who;
    if (rider) personSide(c, x + 3 * f, y - 5, { ...this.custLook(rider), face: f, angry: b.angry, t: time });
  }
  drawPlayer(c, time) {
    const p = this.p, x = this._sx(p.x), y = this._sy(p.z), carry = this.hand ? this.hand.key : null;
    scaled(c, depthScale(p.z), x, y, (cc, ax, ay) => personSide(cc, ax, ay, { face: p.face, shirt: P.suit, hair: P.hair, bun: true, apron: true, walk: p.walk, carry, t: time }));
    if (carry) steam(c, x + 1, y - Math.round(36 * depthScale(p.z)), time, 3, 9);
  }
  drawCoins(c) {
    for (const k of this.coins) {
      if (k.t < 0) continue;
      let x, y;
      if (k.t < 0.4) { x = k.x0 + k.vx * k.t; y = k.y0 - 60 * k.t + 140 * k.t * k.t; }
      else { const u = clamp((k.t - 0.4) / 0.5, 0, 1), sx = k.x0 + k.vx * 0.4, sy = k.y0 - 24 + 22.4; x = lerp(sx, 40, u * u); y = lerp(sy, 12, u * u); }
      coin(c, Math.round(x), Math.round(y), k.t * 14);
    }
  }
  // order bubble above a waiting customer (wherever they are: boat, deck or stool)
  drawOrder(c, cu, time) {
    const v = cu.vis, type = cu.type || "quen", ty = CUST_TYPES[type];
    const x = this._sx(v.x), y = v.phase === "boat" ? this._sy(DOCK.z) + 5 : this._sy(v.z);
    const bx = x - 4, by = y - 44;
    c.fillStyle = ty.bubble; c.beginPath(); c.arc(bx, by, 10, 0, TAU); c.fill();
    R(c, x - 1, y - 32, 2, 2, ty.bubble); R(c, x - 3, y - 35, 3, 2, ty.bubble);
    c.imageSmoothingEnabled = false; c.drawImage(dishIcon(cu.want), bx - 8, by - 8, 16, 16);
    if (type !== "quen") pixIcon(c, type, bx - 12, by - 12);
    // patience ring: fraction of THIS customer's own max patience
    const fr = Math.min(1, cu.patience / (cu.patienceMax || this.t.patience_s));
    const angry = fr < ANGRY_AT; // a11y warning: "khách sắp giận" below 25% of this guest's patience — ring turns red
    this.ring(c, bx, by, fr, angry ? hc("#ff3a3a", HC.danger) : fr < 0.6 ? hc("#ffd23a", HC.warn) : "#79c75a", 11);
    if (this.menuOpen || this.result) return; // UI-layer labels would sit above the dimmed overlay
    txt(this.payFor(cu) + "k", bx + 13, by + 3, { size: 7, color: ty.col, weight: 900, stroke: "#1a1220", sw: 2 });
    this.drawBadge(cu, bx, by - 12);
    if (angry) this.drawAngry(bx, by, time);
  }
  // "Sắp giận!" warning (UI layer): pulsing red "!" disc right of the bubble + label over the type badge; high-contrast
  // mode draws a bigger disc with a white ring and a black outline, label in yellow on black
  drawAngry(bx, by, time) {
    const u = screen.ui, pulse = 1 + 0.18 * Math.sin(time * 10), r = (highContrast ? 7.5 : 5.5) * pulse, cx = bx + 15, cy = by - 9;
    u.save();
    if (highContrast) { u.fillStyle = "#000"; u.beginPath(); u.arc(cx, cy, r + 2.6, 0, TAU); u.fill(); u.fillStyle = "#fff"; u.beginPath(); u.arc(cx, cy, r + 1.4, 0, TAU); u.fill(); }
    u.fillStyle = highContrast ? "#ff1a1a" : `rgba(230,40,40,${0.8 + 0.2 * Math.sin(time * 10)})`; u.beginPath(); u.arc(cx, cy, r, 0, TAU); u.fill();
    u.restore();
    txt("!", cx, cy + r * 0.55, { size: r * 1.6, align: "center", color: "#fff", weight: 900 });
    txt("Sắp giận!", bx, by - 27, { size: highContrast ? 9 : 8, align: "center", color: highContrast ? "#ffef00" : "#ff5a5a", weight: 900, stroke: "#1a1220", sw: 2.5, alpha: highContrast ? 1 : 0.8 + 0.2 * Math.sin(time * 10) });
  }
  // type badge above the order bubble (UI layer): pixel icon + short label
  drawBadge(cu, x, top) {
    const type = cu.type || "quen", ty = CUST_TYPES[type], u = screen.ui;
    const tw = measure(ty.badge, 7, 900), w = Math.ceil(tw) + 13, h = 10;
    const bx = Math.round(x - w / 2), by = Math.round(top - h - 1);
    panel(bx, by, w, h, { fill: "rgba(42,24,14,.9)", border: ty.col, bw: 1, r: 3 });
    pixIcon(u, type, bx + 3, by + 2);
    txt(ty.badge, bx + 10, by + 8, { size: 7, color: ty.col, weight: 900 });
  }
  drawPrompts(time) {
    if (this.menuOpen || this.result || this.phase === "preopen") return;
    const s = this.nearStove(), o = { size: 8, align: "center", weight: 900, stroke: "#1a1220", sw: 2.5 };
    if (!this.hand && this.nearBaTu()) { txt("E: Nói chuyện với Bà Tư", clamp(this._sx(BA_TU.x) + 20, 60, W - 60), this._sy(BA_TU.z) + 12, { ...o, color: "#e8c8ff" }); return; }
    if (s) {
      const x = this._sx(s.pos[0]), y = this._sy(s.pos[1]) + 10;
      if (this.hand) txt("E: Đổ món", x, y, { ...o, color: "#ff9a9a" });
      else if (s.state === "idle") txt("E: Nấu", x, y, { ...o, color: "#ffd23a" });
      else if (s.state === "ready") txt("E: Bưng", x, y, { ...o, color: "#79c75a" });
      return;
    }
    if (!this.hand) {
      const g = this.nearGuest();
      if (g) { const gx = clamp(this._sx(g.vis.x), 50, W - 50); txt("E: Nói chuyện với " + g.name + (g.charmed ? "" : " ♥"), gx, this._sy(g.vis.z) + 10, { ...o, color: "#ff8fb1" }); }
      return;
    }
    const cu = this.nearTable();
    if (cu && cu.state === "waiting" && this.hand) txt(cu.want === this.hand.key ? "E: Phục vụ" : "Sai món", this._sx(cu.x), this._sy(cu.z) + 10, { ...o, color: cu.want === this.hand.key ? "#79c75a" : "#ff9a9a" });
  }
  ring(c, x, y, fr, col, r = 9) { c.strokeStyle = "rgba(0,0,0,.4)"; c.lineWidth = 2; c.beginPath(); c.arc(x, y, r, 0, TAU); c.stroke(); c.strokeStyle = col; c.lineWidth = 1.5; c.beginPath(); c.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + TAU * fr); c.stroke(); }

  drawHUD(c, time) {
    const u = screen.ui, F = HUD.fill;
    const mm = Math.floor(Math.ceil(this.time) / 60), ss = Math.ceil(this.time) % 60, low = this.time < 20;
    const pre = this.phase === "preopen";
    panel(W / 2 - 24, 4, 48, 15, { fill: F, border: low ? "#ff6b6b" : HUD.border, r: 7 });
    txt(pre ? "CHƯA MỞ" : `${mm}:${String(ss).padStart(2, "0")}`, W / 2, pre ? 14.5 : 15, { size: pre ? 8 : 11, align: "center", color: low ? "#ff8a8a" : HUD.text, weight: 900 });
    panel(W / 2 - 22, 21, 44, 11, { fill: F, border: HUD.dim, r: 5 });
    txt("Ngày " + this.day, W / 2, 29.5, { size: 7.5, align: "center", color: "#ffd23a", weight: 900 });
    // shift tally: served / walked out
    panel(6, 40, 70, 13, { fill: F, border: HUD.dim, r: 5 });
    txt("Phục vụ " + this.served, 11, 49.5, { size: 7, color: "#9fe8a0", weight: 900 });
    txt("Bỏ " + this.left, 71, 49.5, { size: 7, align: "right", color: this.left ? "#ff8a8a" : "#c9a88a", weight: 900 });
    const qn = this.queue().length;
    if (qn || this.left_queue) { panel(80, 40, 96, 13, { fill: F, border: qn >= this.queueMax ? "#ffb36b" : HUD.dim, r: 5 }); txt("Hàng chờ " + qn + "/" + this.queueMax, 85, 49.5, { size: 7, color: "#9fd8ff", weight: 900 }); txt("Về " + this.left_queue, 171, 49.5, { size: 7, align: "right", color: this.left_queue ? "#ffb36b" : "#c9a88a", weight: 900 }); }
    if (this.missed || this.noDish) { panel(6, 56, 112, 13, { fill: F, border: HUD.dim, r: 5 }); txt("Khách về vì hết món: " + this.missed, 11, 65.5, { size: 7, color: "#ffb36b", weight: 900 }); }
    // menu board targets: sold / target per selected dish, "Hết suất" once the target is met
    if (this.portions) { const pk = Object.keys(this.menu).filter((k) => this.portions[k] != null), rows = pk.length > 8 ? Math.ceil(pk.length / 2) : pk.length;
      pk.forEach((k, i) => {
        const tg = this.portions[k], x = 6 + Math.floor(i / Math.max(1, rows)) * 78, y = 72 + (i % Math.max(1, rows)) * 14, sold = this.sold[k] || 0, out = this.soldOut(k), prem = isPremiumDish(k);
        panel(x, y, 74, 13, { fill: F, border: out ? "#ff8a8a" : prem ? "#ffd23a" : HUD.dim, r: 5 });
        u.imageSmoothingEnabled = false; u.drawImage(dishIcon(k), x + 2, y + 1, 11, 11);
        txt(`${sold}/${tg}`, x + 16, y + 9.5, { size: 7, color: out ? "#ffb0a0" : HUD.text, weight: 900 });
        if (out) txt("Hết suất", x + 71, y + 9.5, { size: 7, align: "right", color: "#ff8a8a", weight: 900 });
        else if (prem) txt("★", x + 71, y + 9.5, { size: 7, align: "right", color: "#ffd23a", weight: 900 });
      }); }
    // money
    panel(6, 5, 70, 15, { fill: F, border: HUD.border, r: 6 });
    txt("🪙", 12, 16, { size: 9 }); txt(this.money + "k", 72, 16, { size: 11, align: "right", color: "#ffe14d", weight: 900 });
    // reputation stars
    const rx = 6, ry = 23;
    panel(rx, ry, 92, 14, { fill: F, border: this.repFlash > 0 ? "#fff" : HUD.dim, r: 6 });
    for (let i = 0; i < 5; i++) { const full = this.rep >= i + 0.75, half = this.rep >= i + 0.25 && !full; this.star(u, rx + 10 + i * 15, ry + 7, full ? 1 : half ? 0.5 : 0, time, i); }
    txt(this.rep.toFixed(1), rx + 88, ry + 11, { size: 8, align: "right", color: HUD.text, weight: 900 });
    // stock chips
    // stock chips: AVAILABLE amounts (reserved by waiting orders shown in grey as +n)
    // v1.2: row 2 = mini bar (fill = freshest non-spoiled item, white tick = average) + spoiled count in red
    const resv = this.reservedTotals(), kinds = [...new Set(this.items.map((it) => it.kind))];
    const keys = Object.keys({ ...this.stock, ...resv }).filter((k) => (this.stock[k] || 0) > 0 || (resv[k] || 0) > 0);
    for (const k of kinds) if (!keys.includes(k)) keys.push(k);
    // they stay right of the clock (x ≥ 270): beyond one row's room they wrap to a second row of narrower chips
    const room = W - 6 - 270, cols = keys.length * 42 <= room ? Math.max(1, keys.length) : Math.ceil(keys.length / 2);
    const sw2 = Math.min(42, Math.floor(room / Math.max(1, cols))), sx0 = W - 6 - Math.min(keys.length, cols) * sw2;
    this.chipRows = keys.length > cols ? 2 : 1;
    keys.forEach((k, i) => { const x = sx0 + (i % cols) * sw2, y0 = 5 + Math.floor(i / cols) * 24; panel(x, y0, sw2 - 2, 22, { fill: F, border: isPremiumKind(k) ? "#ffd23a" : HUD.dim, r: 4 }); u.imageSmoothingEnabled = false; u.drawImage(icon(k), x + 2, y0 + 2, 10, 10);
      txt("×" + (this.stock[k] || 0), x + 13, y0 + 11, { size: 8, color: (this.stock[k] || 0) ? HUD.text : "#ff9a9a", weight: 900 });
      if (resv[k]) txt("+" + resv[k], x + sw2 - 4, y0 + 11, { size: 7, align: "right", color: "rgba(200,200,200,.6)", weight: 800 });
      const good = this.items.filter((it) => it.kind === k && !it.spoiled), nSp = this.items.filter((it) => it.kind === k && it.spoiled).length, bw = Math.min(18, sw2 - 8);
      if (good.length) { const best = Math.max(...good.map((it) => it.fresh)), avg = good.reduce((a, it) => a + it.fresh, 0) / good.length;
        freshBar(u, x + 3, y0 + 15, bw, 3, best, false); u.fillStyle = "#fff"; u.fillRect(x + 3 + Math.round(bw * avg / 100), y0 + 14, 1, 5); }
      if (nSp) txt(nSp + "ươn", x + sw2 - 4, y0 + 20, { size: 7, align: "right", color: "#ff5a5a", weight: 900 }); });
    // early-close button (wood style, clickable) + confirmation / no-dish banners
    if (!this.result && !pre) {
      const b = this.closeBtn, armed = this.confirmClose > 0;
      panel(b.x, b.y, b.w, b.h, { fill: armed ? "rgba(140,40,20,.95)" : "rgba(110,64,32,.95)", border: armed ? "#ffb36b" : "#3a2410", bw: 1.5, r: 4 });
      txt(armed ? "Nhấn lần nữa!" : "Đóng quán sớm (C)", b.x + b.w / 2, b.y + 10.5, { size: 7, align: "center", color: "#ffe9c4", weight: 900 });
      if (armed) { panel(W / 2 - 110, 52, 220, 16, { fill: "rgba(120,30,20,.92)", border: "#ffb36b", r: 6 }); txt("Nhấn C lần nữa để đóng quán", W / 2, 63, { size: 9, align: "center", color: "#fff", weight: 900 }); }
      else if (this.noDish) { const a = 0.75 + 0.25 * Math.sin(time * 4); panel(W / 2 - 150, 52, 300, 16, { fill: `rgba(80,20,20,${0.9 * a})`, border: "#ff8a8a", r: 6 }); txt((this.allSoldOut ? "Hết suất — khách ghé rồi về" : "Hết nguyên liệu — khách ghé rồi về") + " · C: Đóng quán sớm", W / 2, 63, { size: 8, align: "center", color: "#ffe0d0", weight: 900 }); }
    }
    // hand indicator
    if (this.hand) { const s = "Đang bưng: " + dishName(this.hand.key), hw = Math.max(86, Math.ceil(measure(s, 7, 800)) + 10); const hy = this.chipRows > 1 ? 54 : 30; panel(W - 6 - hw, hy, hw, 14, { fill: "rgba(70,30,12,.9)", border: "#ff8a3d", r: 6 }); txt(s, W - 1 - hw, hy + 10, { size: 7, color: "#ffd0a0", weight: 800 }); }
    txt(pre ? "WASD đi · E: bảng thực đơn / Bà Tư / chuông · O/N: mở quán · T điện thoại · Esc/P tạm dừng" : "WASD đi · E nấu/bưng/phục vụ/trò chuyện · C đóng quán sớm · Esc/P tạm dừng", W / 2, H - 4, { size: 7, align: "center", color: "rgba(255,233,196,.55)", weight: 700, stroke: "rgba(10,8,20,.6)", sw: 2 });
  }
  star(u, x, y, fill, time, i) {
    u.save(); u.translate(x, y);
    const pop = this.repFlash > 0 ? 1 + Math.sin(time * 20) * 0.1 : 1; u.scale(pop, pop);
    u.beginPath();
    for (let k = 0; k < 10; k++) { const r = k % 2 ? 2 : 5, a = -Math.PI / 2 + k * Math.PI / 5; u[k ? "lineTo" : "moveTo"](Math.cos(a) * r, Math.sin(a) * r); }
    u.closePath();
    u.fillStyle = fill >= 1 ? "#ffd23a" : fill > 0 ? "#ffd23a" : "rgba(255,255,255,.15)";
    if (fill === 0.5) { u.save(); u.fillStyle = "rgba(255,255,255,.15)"; u.fill(); u.clip(); u.fillStyle = "#ffd23a"; u.fillRect(-6, -6, 6, 12); u.restore(); } else u.fill();
    u.lineWidth = 0.6; u.strokeStyle = "rgba(0,0,0,.5)"; u.stroke();
    u.restore();
  }
  // cook menu geometry: one column up to 6 dishes, two columns beyond (12 with every Đặc sản) — no overflow
  menuLayout(n) {
    const cols = n > 6 ? 2 : 1, rows = Math.max(1, Math.ceil(n / cols)), rowH = cols > 1 ? 30 : n > 4 ? 28 : 34;
    const cw = cols > 1 ? 228 : 300, pw = cols * cw + (cols > 1 ? 4 : 0), ph = 36 + rows * rowH;
    return { cols, rows, rowH, cw, pw, ph, px: W / 2 - pw / 2, py: Math.max(4, H / 2 - ph / 2) };
  }
  drawMenu(c, time) {
    c.fillStyle = "rgba(14,8,6,.55)"; c.fillRect(0, 0, W, H);
    const keys = Object.keys(this.menu), L = this.menuLayout(keys.length), { rowH, pw, ph, px, py } = L;
    panel(px, py, pw, ph, { fill: "rgba(46,26,14,.97)", border: HUD.border, bw: 1.5, r: 6 });
    txt("CHỌN MÓN NẤU", W / 2, py + 15, { size: 11, align: "center", color: "#ffd23a", weight: 900 });
    if (this.cookMul !== 1) txt("Bếp ×" + this.cookMul, px + pw - 8, py + 14, { size: 7, align: "right", color: this.cookMul < 1 ? "#7ee87e" : "#ff9a9a", weight: 900 });
    if (!keys.length) txt("Tối nay chưa có món nào trong thực đơn", W / 2, py + 40, { size: 8, align: "center", color: "#ff9a9a", weight: 800 });
    const two = L.cols > 1, nameSz = two ? 8 : 9;
    keys.forEach((k, i) => {
      const col = Math.floor(i / L.rows), x0 = px + col * (L.cw + 4), cw = L.cw, y = py + 24 + (i % L.rows) * rowH;
      const m = this.menu[k], sel = i === this.menuSel, can = this.canCook(k), prem = isPremiumDish(k);
      if (sel) panel(x0 + 5, y, cw - 10, rowH - 4, { fill: can ? "rgba(255,210,100,.18)" : "rgba(255,80,80,.14)", border: can ? "#ffd23a" : "#ff6b6b", r: 4 });
      else if (prem) panel(x0 + 5, y, cw - 10, rowH - 4, { fill: "rgba(255,210,60,.07)", border: "rgba(255,210,60,.35)", r: 4 });
      screen.ui.imageSmoothingEnabled = false; screen.ui.drawImage(dishIcon(k), x0 + 10, y + 2, 18, 18);
      let nm = dishName(k); const maxNm = cw - 36 - (two ? 74 : 92) - (prem ? 40 : 0);
      while (nm.length > 4 && measure(nm, nameSz, 800) > maxNm) nm = nm.slice(0, -2) + "…";
      txt(nm, x0 + 32, y + 11, { size: nameSz, color: can ? (prem ? "#ffe9a0" : HUD.text) : "#ff9a9a", weight: 800 });
      if (prem) premiumBadge(x0 + 34 + measure(nm, nameSz, 800), y + 3);
      let rec = Object.entries(m.recipe).map(([ik, n]) => `${KIND_NAME[ik] || ik}×${n}`).join(" + ");
      const maxRec = cw - 36 - (two ? 40 : 50); while (rec.length > 4 && measure(rec, 7, 700) > maxRec) rec = rec.slice(0, -2) + "…";
      txt(rec, x0 + 32, y + 22, { size: 7, color: can ? "#c9a88a" : "#d98", weight: 700 });
      const rx = x0 + cw - 10;
      { const pv = can ? this.lockPreview(k) : null; // v1.2: price that would be locked now, from the freshness of the items used
        if (pv && pv.price !== m.price) txt(two ? `${m.price}→${pv.price}k` : `${m.price}k → ${pv.price}k (tươi ${Math.floor(pv.mean)}%)`, rx, y + 11, { size: two ? 7.5 : 8, align: "right", color: freshColor(pv.mean, false), weight: 900 });
        else txt(m.price + "k" + (pv && !two ? " (tươi " + Math.floor(pv.mean) + "%)" : ""), rx, y + 11, { size: pv ? 8 : 10, align: "right", color: "#ffe14d", weight: 900 }); }
      const eff = this.cookTime(k);
      if (eff !== m.cook_s) { // upgraded stove: effective time, base time dimmed beside it
        txt(fmtS(eff), rx, y + 22, { size: 7, align: "right", color: "#7ee87e", weight: 900 });
        txt(fmtS(m.cook_s) + " →", rx - measure(fmtS(eff), 7, 900) - 3, y + 22, { size: 7, align: "right", color: "rgba(201,168,138,.6)", weight: 700 });
      } else txt(fmtS(m.cook_s), rx, y + 22, { size: 7, align: "right", color: "#c9a88a", weight: 700 });
    });
    txt(two ? "↑↓ chọn · ←→ đổi cột · E nấu · Esc huỷ" : "↑↓ chọn · E nấu · Esc huỷ", W / 2, py + ph - 6, { size: 7, align: "center", color: "rgba(255,233,196,.6)", weight: 700 });
  }
  drawHint(c) {
    const a = clamp(this.hintT, 0, 1);
    panel(W / 2 - 96, H / 2 - 30, 192, 36, { fill: `rgba(42,24,14,${0.9 * a})`, border: HUD.border, r: 6, alpha: a });
    txt("Tới bếp (E) nấu món khách muốn, rồi bưng ra bàn", W / 2, H / 2 - 14, { size: 8.5, align: "center", color: HUD.text, weight: 800, alpha: a });
    txt("Khách bỏ đi = mất uy tín!", W / 2, H / 2 - 1, { size: 8, align: "center", color: "#ffd23a", weight: 700, alpha: a });
  }
  drawResult(c, time) {
    const r = this.result, k = clamp(r.t / 0.5, 0, 1);
    c.fillStyle = `rgba(14,8,6,${0.72 * k})`; c.fillRect(0, 0, W, H);
    if (r.t < 1.4) speedLines(c, W / 2, H / 2 - 20, time, "rgba(255,200,110,.12)");
    txt(r.closedEarly ? "ĐÓNG QUÁN SỚM" : "HẾT BUỔI TỐI!", W / 2, H / 2 - 44, { size: 24 * lerp(1.5, 1, k), align: "center", color: "#ffd23a", weight: 900, italic: true, stroke: "#1a1220", sw: 5, rot: -0.03 });
    panel(W / 2 - 90, H / 2 - 30, 180, 76, { fill: "rgba(42,24,14,.95)", border: HUD.border, r: 5 });
    panel(W / 2 - 22, H / 2 - 36, 44, 11, { fill: "rgba(42,24,14,1)", border: HUD.border, r: 5 }); // day tab on the panel's top edge
    txt("Ngày " + (r.day ?? this.day), W / 2, H / 2 - 27.5, { size: 7.5, align: "center", color: "#ffd23a", weight: 900 });
    txt("Doanh thu", W / 2 - 80, H / 2 - 16, { size: 9, color: HUD.text, weight: 700 });
    txt(Math.floor(r.money * clamp(r.t, 0, 1)) + "k", W / 2 + 80, H / 2 - 16, { size: 11, align: "right", color: "#ffe14d", weight: 900 });
    txt("Khách", W / 2 - 80, H / 2 - 2, { size: 9, color: HUD.text, weight: 700 });
    txt("phục vụ " + r.served, W / 2 + 20, H / 2 - 2, { size: 9, align: "right", color: "#9fe8a0", weight: 900 });
    txt("bỏ đi " + r.left, W / 2 + 80, H / 2 - 2, { size: 9, align: "right", color: r.left ? "#ff8a8a" : "#c9a88a", weight: 900 });
    txt("Uy tín", W / 2 - 80, H / 2 + 13, { size: 9, color: HUD.text, weight: 700 });
    const u = screen.ui; for (let i = 0; i < 5; i++) this.star(u, W / 2 - 6 + i * 13, H / 2 + 9, i < r.stars ? 1 : 0, time, i);
    R(c, W / 2 - 82, H / 2 + 22, 164, 1, "rgba(255,220,160,.2)");
    txt("ĐIỂM", W / 2 - 80, H / 2 + 37, { size: 10, color: HUD.text, weight: 900 });
    txt("" + Math.floor(r.score * clamp(r.t * 0.8, 0, 1)), W / 2 + 80, H / 2 + 37, { size: 14, align: "right", color: "#7ee87e", weight: 900 });
    if (r.left_queue || r.missed) txt(`Chờ bàn rồi về ${r.left_queue || 0} · Về vì hết món ${r.missed || 0}`, W / 2, H / 2 + 56, { size: 8, align: "center", color: "#ffb36b", weight: 800 });
    if (r.t > 1) txt(Math.floor(r.t * 2) % 2 ? "Enter: chơi lại từ đầu   ·   R: làm lại buổi tối" : "", W / 2, H - 20, { size: 9, align: "center", color: "#fff", weight: 900 });
  }
}
