// Day-loop screens of Test Contract v1.1 §2 ("Vòng ngày", "Shop và nâng cấp", "Menu, pause và HUD"):
//   DayIntro → (gather) → EveningIntro → (quán) → DayResult → Shop → next DayIntro … Summary after the last day.
// Every number comes from the contract (tuning.day_plan, tuning.menu, tuning.shop, tuning.score) or progress.js.
// All text is sans-serif ≥ size 7 (≈ 18.7 px at 1280×720 since the UI layer scales with the window).
import { W, H, screen, input, clamp, txt, panel, measure, wrap } from "./engine.js";
import { sfx, voiceLine } from "./audio.js";
import { portrait, icon, dishIcon, DISH_NAME, KIND_NAME, premiumBadge } from "./art.js";
import { menuKnown, isPremiumDish } from "./menu.js"; // contract menu + the Đặc sản Bà Tư has researched (GUI only)
import { riverWorld } from "./story.js";
import { MemeLayer } from "./meme_fx.js"; // meme kit beats on the day card / result / summary (meme_fx.js header = API)
import * as progress from "./progress.js";
import { OXY_MUL, DIVE_TIME_S, SERVICE_TIME_S, fmtClock } from "./gui_tuning.js"; // GUI scaling knobs
import * as board from "./leaderboard.js"; // Phase 4 extension: local top 10 after the last day
import { freshCfg, freshestFirst, isSpoiled, nextItemId, idNum } from "./fresh.js";

const GOLD = "#ffd23f", BORDER = "#f3d27a";
export const planFor = (contract, day) => (contract.tuning.day_plan || []).find((p) => p.day === day) || null;
export const planDays = (contract) => (contract.tuning.day_plan || []).length || Infinity; // no plan (old contract) = endless days
const kindName = (k) => KIND_NAME[k] || k;
const dishName = (k) => DISH_NAME[k] || k;
const ucfirst = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const idn = (it) => idNum(it.id);

// ---------- Chợ Chú Sáu (vendor, Test Contract v1.1 §3 + v1.2 §1) ----------
// sell prices (what Chú Sáu pays), buy = floor(sell × 1.5); contract tuning.shop.vendor {buy_multiplier, sell_prices} overrides.
// One unit per action, unlimited stock. Bought goods wait in save.pendingDelivery (fresh 100, new I<n> id, no decay) and
// main.js adds them to the NEXT evening's quán stock. Selling takes the freshest NON-spoiled leftover of the kind (tie by id).
export const VENDOR_SELL = { ca_loc: 20, ca_linh: 8, ca_keo: 10, bong_dien_dien: 5, bong_sung: 5, keo_neo: 5 };
export function vendorPrices(contract) {
  const v = contract?.tuning?.shop?.vendor || {}, sell = { ...VENDOR_SELL, ...(v.sell_prices || {}) }, mul = v.buy_multiplier ?? 1.5;
  return Object.fromEntries(Object.entries(sell).map(([k, p]) => [k, { sell: p, buy: Math.floor(p * mul) }]));
}
// deliverDay (GUI hubs): the campaign day whose evening receives the goods — always "tomorrow evening" (a morning
// purchase on day N → N+1; a night purchase, after finishDay already moved save.day to N+1 → N+1). Omitted = next evening.
export function vendorBuy(contract, kind, deliverDay = null) {
  const pr = vendorPrices(contract)[kind], s = progress.save;
  if (!pr || s.money < pr.buy) return null; // buy_failed: money unchanged
  s.money -= pr.buy;
  const it = { id: nextItemId(), kind, fresh: freshCfg(contract).initial };
  if (deliverDay != null) it.day = deliverDay;
  if (!Array.isArray(s.pendingDelivery)) s.pendingDelivery = [];
  s.pendingDelivery.push(it); progress.persist(); return it;
}
export function vendorSellable(contract, leftover, kind) { const b = freshCfg(contract).spoiled_below; return (leftover || []).filter((i) => i.kind === kind && !isSpoiled(i, b)).sort(freshestFirst); }
export function vendorSell(contract, leftover, kind) {
  const pr = vendorPrices(contract)[kind], it = vendorSellable(contract, leftover, kind)[0];
  if (!pr || !it) return null; // nothing usable left (spoiled goods can't be sold)
  leftover.splice(leftover.indexOf(it), 1);
  const s = progress.save; s.money += pr.sell; s.totalEarned += pr.sell; progress.persist();
  return { item: it, price: pr.sell };
}
const countKinds = (items) => { const o = {}; for (const it of items || []) o[it.kind] = (o[it.kind] || 0) + 1; return o; };
// pending goods that arrive on the evening of `day` (items without a day tag = the next evening, the old Shop behaviour)
export const dueOn = (items, day) => (items || []).filter((it) => it.day == null || it.day <= day);
export const deliveryText = (items) => Object.entries(countKinds(items)).map(([k, n]) => `${n} ${kindName(k)}`).join(", ");

class Base {
  constructor(tod = "dawn") { this.t = 0; this.tod = tod; this.cam = { x: 0, y: 40 }; this.done = false; }
  bg() {
    const c = screen.px;
    try { riverWorld(c, { t: this.t, cam: this.cam, v: { school: true, sunUp: this.tod === "dawn" ? 0.8 : 0.3 } }, this.tod); } catch (e) { c.fillStyle = "#0e2a44"; c.fillRect(0, 0, W, H); }
    const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "rgba(6,12,28,.35)"); g.addColorStop(1, "rgba(6,12,28,.85)"); c.fillStyle = g; c.fillRect(0, 0, W, H);
  }
  tick(dt) { this.t += dt; this.cam.x += dt * 6; }
  finish(arg) { if (this.done) return; this.done = true; sfx("select"); this.onDone?.(arg); }
}

// ---------- DayIntro: "Ngày N" + Má Tư reads the plan (auto-continue after 4 s or any key) ----------
export class DayIntro extends Base {
  constructor(contract, day, st, onDone) {
    super("dawn"); this.onDone = onDone; this.day = day; this.plan = planFor(contract, day); this.st = st;
    const p = this.plan;
    const dishes = p ? Object.entries(p.dishes).map(([k, n]) => `${dishName(k)} ×${n}`).join(", ") : "món nào cũng được";
    const total = p ? Object.values(p.ingredients).reduce((a, b) => a + b, 0) : 0;
    this.line = p ? `Hôm nay quán nấu ${dishes}. Con lặn lấy đủ ${total} nguyên liệu nghen!` : "Hôm nay con cứ lặn kiếm thật nhiều đồ nghen!";
    this.autoS = 4;
    const pend = dueOn(progress.save.pendingDelivery, day);
    this.delivery = pend.length ? `Chú Sáu giao tối nay: ${deliveryText(pend)}` : null;
    try { voiceLine("ba", this.line); } catch (e) {}
    // meme opener: "NGÀY N" impact slam with the day's quip (1.1 s, the plan shows through the dim)
    this.fx = new MemeLayer();
    this.fx.start({ meme: "impact", text: `NGÀY ${day}`, sub: DayIntro.QUIP[day] || "Lại một ngày đỉnh của chóp", col: GOLD, size: 56, dur: 1.1 });
  }
  static QUIP = ["", "Ngày đầu đi làm · run xỉu up xỉu down", "Hôm nay quyết tâm mãi đỉnh", "Giữa mùa nước nổi · cá lóc ét o ét",
    "Khum lặn là khum có cá", "Trận cuối · all in bông súng"];
  update(dt) {
    this.tick(dt); this.fx.update(dt);
    if (this.t >= this.autoS || (this.t > 0.35 && input.anyKey() && !input.hit("pause") && !input.hit("mute") && !input.hit("captions"))) this.finish();
  }
  draw() {
    this.drawCard(); this.fx.draw();
  }
  drawCard() {
    this.bg(); const u = screen.ui, t = this.t, k = clamp(t / 0.4, 0, 1);
    txt(`NGÀY ${this.day}`, W / 2, 42, { size: 30 * (1.4 - 0.4 * k) * (1 + 0.04 * Math.sin(t * 6)), align: "center", color: GOLD, weight: 900, italic: true, stroke: "#3a1410", sw: 6, rot: -0.03 + 0.02 * Math.sin(t * 3) });
    txt(`Đồ nghề hôm nay: O₂ ${this.st.oxygenMax} s · Máu ${this.st.hpMax} · Lặn ${fmtClock(DIVE_TIME_S)} · Quán ${fmtClock(SERVICE_TIME_S)}`, W / 2, 58, { size: 8, align: "center", color: "#bff3ff", weight: 800, stroke: "#06101e", sw: 2 });
    // Má Tư dialogue box (portrait + typewriter line)
    const bx = 20, by = 66, bw = W - 40, bh = 58;
    panel(bx, by, bw, bh, { fill: "rgba(20,10,24,.9)", border: BORDER, r: 8, bw: 1.5 });
    u.imageSmoothingEnabled = false;
    const hop = t > 1.1 ? Math.abs(Math.sin((t - 1.1) * 9)) * 5 * Math.exp(-(t - 1.1) * 2.5) : 0; // chibi hop once the slam clears
    try { u.drawImage(portrait("ba"), bx + 6, by + 6 - hop, 46, 46); } catch (e) {}
    txt("MÁ TƯ", bx + 60, by + 13, { size: 8, color: GOLD, weight: 900 });
    const shown = this.line.slice(0, Math.floor(t * 60));
    wrap(shown, bw - 70, 8).slice(0, 4).forEach((l, i) => txt(l, bx + 60, by + 25 + i * 10, { size: 8, color: "#fff", weight: 700 }));
    // needed list
    if (this.plan) {
      const ing = Object.entries(this.plan.ingredients), cols = 3, rw = (W - 40) / cols, ly = by + bh + 8;
      panel(bx, ly, bw, 16 + Math.ceil(ing.length / cols) * 13, { fill: "rgba(8,20,38,.85)", border: "#7ac0ff", r: 6 });
      txt("CẦN LẤY", bx + bw / 2, ly + 10, { size: 7, align: "center", color: "#9fd8ff", weight: 900 });
      ing.forEach(([kk, n], i) => { const x = bx + 8 + (i % cols) * rw, y = ly + 14 + Math.floor(i / cols) * 13; u.drawImage(icon(kk), x, y, 10, 10); txt(`${ucfirst(kindName(kk))} ×${n}`, x + 14, y + 8, { size: 8, color: "#fff", weight: 800 }); });
    }
    if (this.delivery) { const dy = this.plan ? by + bh + 8 + 16 + Math.ceil(Object.keys(this.plan.ingredients).length / 3) * 13 + 6 : by + bh + 8;
      panel(bx, dy, bw, 16, { fill: "rgba(30,50,20,.88)", border: "#9fdc7a", r: 6 }); u.drawImage(portrait("sau"), bx + 4, dy + 1, 14, 14);
      txt(this.delivery, bx + 22, dy + 11, { size: 8, color: "#d8ffc0", weight: 800 }); }
    const left = Math.max(0, Math.ceil(this.autoS - t));
    txt(`Phím bất kỳ: xuống nước · tự đi sau ${left} s`, W / 2, H - 8, { size: 7, align: "center", color: "rgba(255,255,255,.65)", weight: 700 });
  }
}

// how many servings of a dish the stock covers
export function servings(recipe, stock) { let n = Infinity; for (const [k, q] of Object.entries(recipe)) n = Math.min(n, Math.floor((stock[k] || 0) / q)); return n === Infinity ? 0 : n; }

// ---------- EveningIntro "Chuẩn bị mở quán": stock received + the wooden MENU BOARD (choose what to sell) ----------
// items (v1.2): the handover [{ id, kind, fresh }] (gather haul + Chợ Chú Sáu delivery) — servings count usable (≥ spoiled_below) only.
// opts.delivered: item ids that came from Chợ Chú Sáu (marked "Hàng chợ").
// Board: every contract dish with toggle (plan dishes pre-selected, "Kế hoạch"), target portions stepper capped by what is
// cookable — usable stock is shared between selected dishes greedily (Đặc sản first, priciest first, then board order). onDone({ menu: [ids], portions: {id: n} }).
// Đặc sản (menu.js, GUI only): listed after the contract dishes with a gold badge; never in Má Tư's plan; pre-selected only
// when the stock can cook them. The list scrolls (6–7 rows visible) so 12 dishes never overflow the screen.
export class EveningIntro extends Base {
  constructor(contract, day, stock, onDone, items = null, opts = {}) {
    super("dusk"); this.onDone = onDone; this.day = day; this.stock = stock || {}; this.menu = menuKnown(contract); // locked Đặc sản are hidden until Bà Tư researches them
    this.popup = !!(opts && opts.popup); // pre-open raft: centred board over the live quán instead of a full screen
    this.below = { spoiled_below: 30, ...contract.freshness }.spoiled_below;
    this.items = Array.isArray(items) ? items : null;
    this.delivered = new Set((opts && opts.delivered) || []);
    this.usable = {};
    if (this.items) { for (const it of this.items) if (it.fresh >= this.below && !it.spoiled) this.usable[it.kind] = (this.usable[it.kind] || 0) + 1; }
    else for (const [k, n] of Object.entries(this.stock)) this.usable[k] = Math.max(0, n | 0);
    // "2 cá linh đã ươn" warnings
    const sp = {}; for (const it of this.items || []) if (it.fresh < this.below || it.spoiled) sp[it.kind] = (sp[it.kind] || 0) + 1;
    this.warn = Object.entries(sp).map(([k, n]) => `${n} ${kindName(k)} đã ươn`);
    this.plan = planFor(contract, day);
    this.planIds = this.plan ? Object.keys(this.plan.dishes).filter((k) => this.menu[k]) : [];
    let cm = 1; try { cm = progress.stats(contract).cookMul || 1; } catch (e) {}
    this.contract = contract; this.cm = cm; this.syncT = 0; // syncMenu() re-reads menuKnown (a dish learned from Bà Tư shows at once)
    this.planIds = this.planIds.filter((k) => !isPremiumDish(k)); // Đặc sản are never part of Má Tư's plan
    this.rows = Object.keys(this.menu).map((id) => ({ id, plan: this.planIds.includes(id), on: this.planIds.includes(id), target: 0, can: 0, auto: true, premium: isPremiumDish(id),
      alone: servings(this.menu[id].recipe, this.usable), cook: Math.round(this.menu[id].cook_s * cm * 10) / 10, expect: this.expectPrice(id) }));
    if (!this.planIds.length) for (const r of this.rows) r.on = r.alone > 0; // no plan (old contract): everything cookable
    for (const r of this.rows) if (r.premium) r.on = r.alone > 0; // Đặc sản: on only when tonight's stock can cook them
    this.top = 0; // first visible board row (scrolling list)
    this.recalc();
    this.sel = this.rows.length; // starts on "Mở quán ▶" (Enter opens with Má Tư's plan, as before)
    this.msg = null;
    // meme opener (full-screen board only; the pre-open pop-up stays quiet): impact title, or a sweaty "kho trống" beat
    this.fx = new MemeLayer();
    if (!this.popup) this.fx.start(Object.values(this.usable).some((n) => n > 0)
      ? { meme: "impact", text: "CHUẨN BỊ MỞ QUÁN", sub: "Chọn món lẹ lên, khách tới rồi!", col: "#ff8a3d", size: 34, dur: 0.9 }
      : { meme: "sweat", text: "Kho trống trơn… Ủa alo?", dur: 1.4 });
  }
  // recipe research: a Đặc sản learned since the board was built joins the rows (on when tonight's stock cooks it)
  syncMenu() {
    let known; try { known = menuKnown(this.contract); } catch (e) { return; }
    const fresh = Object.keys(known).filter((id) => !this.menu[id]);
    if (!fresh.length) return;
    this.menu = known;
    for (const id of fresh) {
      const alone = servings(known[id].recipe, this.usable);
      this.rows.push({ id, plan: false, on: alone > 0, target: 0, can: 0, auto: true, premium: isPremiumDish(id), alone, cook: Math.round(known[id].cook_s * this.cm * 10) / 10, expect: this.expectPrice(id) });
    }
    if (this.sel >= this.rows.length - fresh.length) this.sel = this.rows.length; // keep "Mở quán / Xong" selected
    this.recalc();
  }
  get ids() { return this.rows.filter((r) => r.on).map((r) => r.id); }
  // expected price now: freshest usable items of each recipe kind → floor(price × mean fresh / 100) (the quán locks it at cook start)
  expectPrice(id) {
    const m = this.menu[id]; if (!this.items) return m.price;
    const used = [];
    for (const [k, q] of Object.entries(m.recipe)) { const got = this.items.filter((it) => it.kind === k && it.fresh >= this.below && !it.spoiled).sort((a, b) => b.fresh - a.fresh || idn(a) - idn(b)).slice(0, q); if (got.length < q) return null; used.push(...got); }
    return used.length ? Math.floor(m.price * used.reduce((a, it) => a + it.fresh, 0) / used.length / 100) : m.price;
  }
  // greedy in board order: each selected dish takes target × recipe from what is left; `can` = cookable from what is left
  recalc() {
    const rem = { ...this.usable };
    const prem = this.rows.filter((q) => q.premium).sort((a, b) => this.menu[b.id].price - this.menu[a.id].price);
    for (const r of [...prem, ...this.rows.filter((q) => !q.premium)]) { // Đặc sản (priciest first) claim their side ingredients first
      const rec = this.menu[r.id].recipe; r.can = servings(rec, rem);
      if (!r.on) continue;
      if (r.auto) { r.target = r.can; r.auto = false; } // freshly switched on: as many as the stock covers
      r.target = clamp(r.target, 0, r.can);
      for (const [k, q] of Object.entries(rec)) rem[k] = (rem[k] || 0) - q * r.target;
    }
  }
  update(dt) {
    this.tick(dt); this.fx.update(dt); if (this.msg) { this.msg.life -= dt; if (this.msg.life <= 0) this.msg = null; }
    if ((this.syncT += dt) > 0.5) { this.syncT = 0; this.syncMenu(); }
    if (this.t <= 0.6) return;
    const n = this.rows.length + 1;
    if (input.hit("up")) { this.sel = (this.sel + n - 1) % n; sfx("click"); }
    if (input.hit("down")) { this.sel = (this.sel + 1) % n; sfx("click"); }
    const r = this.rows[this.sel];
    if (r && (input.hit("left") || input.hit("right"))) {
      if (!r.on) { sfx("hurt"); this.msg = { text: "Bật món này trước (E/Enter)", col: "#ffb36b", life: 1.4 }; }
      else { const d = input.hit("right") ? 1 : -1, nt = clamp(r.target + d, r.can > 0 ? 1 : 0, r.can); if (nt !== r.target) { r.target = nt; sfx("click"); this.recalc(); } else sfx("hurt"); }
    }
    if (input.hit("next")) return this.popup ? this.finish({ ...this.selection(), open: true }) : this.open();
    if (this.popup && input.hit("back")) return this.finish(this.selection()); // Esc closes the board, keeping the picks
    if (input.hit("confirm") || input.hit("interact") || input.hit("catch")) {
      if (!r) return this.popup ? this.finish(this.selection()) : this.open();
      r.on = !r.on; r.auto = r.on; sfx(r.on ? "select" : "click"); this.recalc();
    }
  }
  // what the board would open with right now (the pre-open raft reads this when the bell is rung without visiting the board)
  selection() {
    this.syncMenu();
    const menu = this.ids;
    if (!this.rows.some((r) => r.alone > 0)) return { menu: menu.length ? menu : this.planIds.length ? this.planIds : Object.keys(this.menu), portions: null };
    return { menu, portions: Object.fromEntries(this.rows.filter((r) => r.on).map((r) => [r.id, r.target])) };
  }
  // popup mode (pre-open raft): reopenable — done resets, onDone receives the picks each time it closes
  reopen() { this.syncMenu(); this.done = false; this.t = 0.6; this.sel = this.rows.length; this.msg = null; }
  open() {
    const menu = this.ids, anyCook = this.rows.some((r) => r.alone > 0);
    if (!anyCook) { // nothing cookable at all: open anyway with the plan dishes — guests still come, read the board and go home
      const ids = menu.length ? menu : this.planIds.length ? this.planIds : Object.keys(this.menu);
      return this.finish({ menu: ids, portions: null });
    }
    if (!menu.length) { sfx("hurt"); this.msg = { text: "Chọn ít nhất 1 món để bán", col: "#ff8a8a", life: 1.6 }; return; }
    this.finish({ menu, portions: Object.fromEntries(this.rows.filter((r) => r.on).map((r) => [r.id, r.target])) });
  }
  draw() {
    if (this.popup) return this.drawPopup();
    this.bg(); const u = screen.ui; u.imageSmoothingEnabled = false;
    txt(`NGÀY ${this.day} · CHUẨN BỊ MỞ QUÁN`, W / 2, 24, { size: 16, align: "center", color: "#ff8a3d", weight: 900, italic: true, stroke: "#3a1410", sw: 5 });
    // stock received (left)
    const ks = Object.entries(this.stock).filter(([, n]) => n > 0), its = ks.length > 6 ? null : this.items, rh = its ? 22 : 13, pw = 168; // many kinds (Đặc sản): one compact line each
    const ph = 22 + Math.max(1, ks.length) * rh;
    panel(12, 34, pw, ph, { fill: "rgba(8,20,38,.88)", border: "#7ac0ff", r: 6 });
    txt("NHẬP KHO" + (its ? " · ĐỘ TƯƠI" : ""), 12 + pw / 2, 45, { size: 8, align: "center", color: "#9fd8ff", weight: 900 });
    if (!ks.length) txt("Kho trống — giỏ đã mất", 12 + pw / 2, 60, { size: 8, align: "center", color: "#ffb0b0", weight: 800 });
    ks.forEach(([k, n], i) => { const y = 50 + i * rh; u.drawImage(icon(k), 18, y, 10, 10); txt(ucfirst(kindName(k)), 32, y + 8, { size: 8, color: "#fff", weight: 800 }); txt("×" + n, 12 + pw - 8, y + 8, { size: 8, align: "right", color: "#cfe", weight: 900 });
      if (!its) return;
      const mine = its.filter((q) => q.kind === k), nMkt = mine.filter((q) => this.delivered.has(q.id)).length;
      if (nMkt) txt(`Hàng chợ ×${nMkt}`, 12 + pw - 26, y + 8, { size: 7, align: "right", color: GOLD, weight: 900 });
      let line = "", spoiled = false; // each item id with its fresh % (spoiled = "ươn"), clipped to the panel width
      for (const it of mine) { const bad = it.fresh < this.below || it.spoiled; spoiled ||= bad; const part = `${it.id}${this.delivered.has(it.id) ? "(chợ)" : ""} ${bad ? "ươn" : Math.floor(it.fresh) + "%"}`; const next = line ? line + " · " + part : part; if (measure(next, 7, 700) > pw - 16) { line += " …"; break; } line = next; }
      txt(line, 18, y + 18, { size: 7, color: spoiled ? "#ffb0a0" : "rgba(220,245,255,.8)", weight: 700 }); });
    this.warn.forEach((w, i) => txt("! " + w, 16, 34 + ph + 10 + i * 10, { size: 7, color: "#ff8a8a", weight: 900, stroke: "#1a0a0a", sw: 2 }));
    this.drawBoard(186, 32, W - 186 - 8, "Mở quán ▶", 7);
    if (this.msg) txt(this.msg.text, W / 2, H - 20, { size: 9, align: "center", color: this.msg.col, weight: 900, stroke: "#1a1220", sw: 2 });
    if (this.t > 0.6) txt("↑↓ chọn món · E/Enter bật/tắt · ←→ số phần · N: mở quán", W / 2, H - 6, { size: 7, align: "center", color: "rgba(255,255,255,.7)", weight: 700 });
    this.fx.draw();
  }
  // the wooden board (rows, toggles, steppers, button) — shared by the full screen and the popup
  // visible rows (vr) scroll with the selection; the button stays under the window
  boardWindow(vr) {
    const n = this.rows.length, v = Math.min(n, vr);
    if (this.sel < n) { if (this.sel < this.top) this.top = this.sel; if (this.sel >= this.top + v) this.top = this.sel - v + 1; }
    this.top = clamp(this.top, 0, Math.max(0, n - v));
    return v;
  }
  drawBoard(x0, top, w0, btn, vr = 6) {
    const u = screen.ui; u.imageSmoothingEnabled = false;
    const rH = 26, y0 = top + 18, v = this.boardWindow(vr);
    panel(x0, top, w0, 18 + v * rH + 4, { fill: "rgba(96,58,30,.96)", border: "#d9a05a", r: 6, bw: 1.5 });
    u.fillStyle = "rgba(60,34,16,.35)"; for (let i = 0; i < v; i++) u.fillRect(x0 + 3, y0 + i * rH + rH - 1, w0 - 6, 1); // plank seams
    txt("BẢNG THỰC ĐƠN TỐI NAY", x0 + w0 / 2, top + 12, { size: 8, align: "center", color: "#ffe9c4", weight: 900, stroke: "#3a1a08", sw: 2 });
    if (v < this.rows.length) { // scroll position: "3–8/12" + arrows
      txt(`${this.top + 1}–${this.top + v}/${this.rows.length}`, x0 + w0 - 8, top + 12, { size: 7, align: "right", color: "rgba(255,233,196,.75)", weight: 800 });
      if (this.top > 0) txt("▲", x0 + 8, top + 12, { size: 7, color: GOLD, weight: 900 });
      if (this.top + v < this.rows.length) txt("▼ còn món", x0 + 8, y0 + v * rH + 1 + 10, { size: 7, color: GOLD, weight: 900 });
    }
    this.rows.forEach((r, i) => {
      if (i < this.top || i >= this.top + v) return;
      const y = y0 + (i - this.top) * rH, m = this.menu[r.id], sel = this.sel === i, dim = r.on ? 1 : 0.55;
      if (sel) panel(x0 + 3, y, w0 - 6, rH - 2, { fill: "rgba(255,210,100,.2)", border: GOLD, r: 4 });
      panel(x0 + 6, y + 7, 22, 10, { fill: r.on ? "rgba(60,160,80,.95)" : "rgba(60,40,30,.9)", border: r.on ? "#9fffb8" : "rgba(255,255,255,.3)", r: 4 });
      txt(r.on ? "BẬT" : "TẮT", x0 + 17, y + 14.5, { size: 7, align: "center", color: "#fff", weight: 900 });
      u.save(); u.globalAlpha = dim; u.drawImage(dishIcon(r.id), x0 + 31, y + 3, 18, 18); u.restore();
      txt(dishName(r.id), x0 + 52, y + 10, { size: 8, color: r.on ? "#fff" : "rgba(255,255,255,.6)", weight: 900 });
      if (r.plan) { const nx = x0 + 56 + measure(dishName(r.id), 8, 900); panel(nx, y + 3, 36, 9, { fill: "rgba(255,210,63,.25)", border: GOLD, r: 3 }); txt("Kế hoạch", nx + 18, y + 10, { size: 7, align: "center", color: GOLD, weight: 900 }); }
      if (r.premium) premiumBadge(x0 + 56 + measure(dishName(r.id), 8, 900), y + 3, "Đặc sản", r.on ? 1 : 0.7);
      let rx = x0 + 52; // recipe icons
      for (const [k, q] of Object.entries(m.recipe)) { u.drawImage(icon(k), rx, y + 14, 8, 8); txt("×" + q, rx + 9, y + 21, { size: 7, color: "rgba(255,233,196,.85)", weight: 800 }); rx += 22; }
      const ex = r.expect, price = ex != null && ex !== m.price ? `${m.price}k→${ex}k` : `${m.price}k`;
      txt(`${price} · ${r.cook} s`, rx + 2, y + 21, { size: 7, color: ex != null && ex < m.price ? "#ffd0a0" : "#ffe9c4", weight: 800 });
      const right = x0 + w0 - 8;
      if (r.on) txt(`◀ ${r.target} ▶`, right, y + 10, { size: 8, align: "right", color: r.target > 0 ? GOLD : "#ff8a8a", weight: 900 });
      txt(r.can > 0 ? `Nấu được ${r.can} phần` : "thiếu đồ", right, y + 21, { size: 7, align: "right", color: r.can > 0 ? "#7dffb0" : "#ff8a8a", weight: 900 });
    });
    // "Mở quán ▶" button
    const bs = this.sel === this.rows.length, by = y0 + v * rH + 8;
    panel(x0 + w0 / 2 - 50, by, 100, 15, { fill: bs ? "rgba(200,90,30,.95)" : "rgba(110,64,32,.95)", border: bs ? GOLD : "#3a2410", bw: 1.5, r: 5 });
    txt(btn, x0 + w0 / 2, by + 11, { size: 9, align: "center", color: "#fff", weight: 900, alpha: bs ? 0.75 + 0.25 * Math.sin(this.t * 5) : 1 });
  }
  // popup over the live pre-open raft: dim, centred board (~70% width), a compact stock line, key hints
  drawPopup() {
    const u = screen.ui; u.imageSmoothingEnabled = false;
    u.save(); u.fillStyle = "rgba(10,6,4,.55)"; u.fillRect(0, 0, W, H); u.restore();
    const w0 = Math.round(W * 0.7), x0 = Math.round((W - w0) / 2), top = 30;
    this.drawBoard(x0, top, w0, "Xong ✓");
    const ks = Object.entries(this.usable).filter(([, n]) => n > 0);
    const sy = top + 18 + Math.min(this.rows.length, 6) * 26 + 30;
    panel(x0, sy, w0, 15, { fill: "rgba(8,20,38,.9)", border: "#7ac0ff", r: 5 });
    txt("Kho dùng được:", x0 + 6, sy + 10.5, { size: 7, color: "#9fd8ff", weight: 900 });
    const step = Math.min(30, Math.floor((w0 - 76) / Math.max(1, ks.length)));
    let x = x0 + 70; for (const [k, n] of ks) { u.drawImage(icon(k), x, sy + 3, 9, 9); txt("×" + n, x + 10, sy + 10.5, { size: 7, color: "#fff", weight: 900 }); x += step; }
    if (!ks.length) txt("trống — khách tới đọc bảng rồi về", x, sy + 10.5, { size: 7, color: "#ffb0b0", weight: 800 });
    if (this.warn.length) txt("! " + this.warn.join(" · "), x0 + w0 - 6, sy + 10.5, { size: 7, align: "right", color: "#ff8a8a", weight: 900 });
    if (this.msg) txt(this.msg.text, W / 2, H - 20, { size: 9, align: "center", color: this.msg.col, weight: 900, stroke: "#1a1220", sw: 2 });
    txt("↑↓ chọn món · E/Enter bật/tắt · ←→ số phần · Esc/Xong: lưu & đóng · N: lưu & mở quán", W / 2, H - 6, { size: 7, align: "center", color: "rgba(255,255,255,.75)", weight: 700, stroke: "rgba(10,8,20,.6)", sw: 2 });
  }
}

// ---------- DayResult: served / left, money, tips, reputation change ----------
export class DayResult extends Base {
  // opts.under = the finished quán scene: the result is then a centred pop-up over the frozen raft (campaign), not a full screen
  // meme show (≤ 3.1 s, any key cuts it short, a second key continues): money → stonks / "CÒN CÁI NỊT", then the verdict →
  // great = airhorn "MÃI ĐỈNH", bad = sad trombone + waterfall tears, ok = Bà Tư chibi "Ổn áp!"; the ledger then gets a red stamp
  constructor(sum, onDone, opts = {}) {
    super("night"); this.s = sum; this.onDone = onDone; this.under = opts.under || null; this.next = opts.next || "Enter: vào Shop ▶";
    const earned = sum.earned ?? 0, d = (sum.rep ?? 0) - (sum.rep0 ?? sum.rep ?? 0), served = sum.served ?? 0, left = (sum.left ?? 0) + (sum.missed ?? 0);
    this.grade = earned <= 0 || d < 0 || left > served ? "bad" : d > 0 && left === 0 && served > 0 ? "great" : "ok";
    this.stamp = { great: "ĐỈNH CỦA CHÓP", ok: "ỔN ÁP", bad: "TOANG" }[this.grade];
    this.fx = new MemeLayer(); this.stampT = -1;
    this.queue = [
      earned > 0 ? { meme: "stonks", who: "ba", amount: `+${earned}k`, dur: 1.5 } : { meme: "notstonks", who: "sen", amount: "0k", dur: 1.5 },
      this.grade === "great" ? { meme: "airhorn", text: "MÃI ĐỈNH", sub: `Uy tín +${d.toFixed(1)} · khách khen nức nở`, dur: 1.6 }
        : this.grade === "bad" ? { meme: "tears", who: "sen", text: left > served ? "Khách bỏ về…\nxỉu up xỉu down" : "Ối dồi ôi…", dur: 1.6 }
        : { meme: "chibi", who: "ba", at: [W / 2 + 150, H - 20], text: "Ổn áp!", dur: 1.0 },
    ];
    this.fx.start(this.queue.shift());
  }
  get showing() { return this.fx.active || this.queue.length > 0; }
  update(dt) {
    this.tick(dt); this.fx.update(dt);
    if (!this.fx.active && this.queue.length) this.fx.start(this.queue.shift());
    if (!this.showing && this.stampT < 0) { this.stampT = 0; sfx("slam"); } else if (this.stampT >= 0) this.stampT += dt;
    const key = input.hit("confirm") || input.hit("interact") || input.hit("catch");
    if (key && this.t > 0.3 && this.showing) { this.fx.clear(); this.queue = []; this.t = Math.max(this.t, 0.8); return; } // skip the show, keep the ledger
    if (this.t > 0.8 && key) this.finish();
  }
  draw() {
    this.drawLedger();
    if (this.stampT >= 0) { // red seal slammed onto the ledger
      const u = screen.ui, k = clamp(this.stampT / 0.15, 0, 1), sc = 2.2 - 1.2 * k, col = this.grade === "bad" ? "#ff4a4a" : this.grade === "great" ? "#ff3b3b" : "#ff8a3d";
      const w = measure(this.stamp, 10, 900) + 14, sx = W - 8 - w / 2, sy = 118; // right of the ledger panel, never over a row
      u.save(); u.translate(sx, sy); u.rotate(-0.22); u.scale(sc, sc); u.globalAlpha = 0.5 + 0.5 * k;
      u.strokeStyle = col; u.lineWidth = 2.2; u.strokeRect(-w / 2, -10, w, 18); u.lineWidth = 0.8; u.strokeRect(-w / 2 + 3, -7, w - 6, 12); u.restore();
      txt(this.stamp, sx, sy + 3.5, { size: 10 * sc, align: "center", color: col, weight: 900, rot: -0.22, alpha: 0.5 + 0.5 * k });
    }
    this.fx.draw();
  }
  drawLedger() {
    if (this.under) { try { this.under.draw(); } catch (e) { this.bg(); } const u = screen.ui, k = clamp(this.t / 0.3, 0, 1); u.save(); u.fillStyle = `rgba(6,8,18,${0.6 * k})`; u.fillRect(0, 0, W, H); u.restore(); }
    else this.bg();
    const s = this.s;
    if (s.closedEarly) txt("Đóng sớm", W / 2 + 118, 44, { size: 8, align: "right", color: "#ffb36b", weight: 900 });
    txt(`KẾT SỔ NGÀY ${s.day}`, W / 2, 34, { size: 20, align: "center", color: GOLD, weight: 900, italic: true, stroke: "#3a1410", sw: 5 });
    panel(W / 2 - 130, 46, 260, 166, { fill: "rgba(8,20,38,.9)", border: BORDER, r: 8 });
    const d = (s.rep ?? 0) - (s.rep0 ?? s.rep ?? 0);
    const rows = [
      ["Khách đã phục vụ", String(s.served ?? 0), "#7dffb0"],
      ["Khách bỏ đi", String(s.left ?? 0), (s.left || 0) ? "#ff8a8a" : "#fff"],
      ["Khách về vì hết món", String(s.missed ?? 0), (s.missed || 0) ? "#ffb36b" : "#fff"],
      ["Tiền thu (gồm boa)", `${s.earned ?? 0}k`, GOLD],
      ["Tiền boa", `${s.tips ?? 0}k`, "#ffe14d"],
      ...(progress.huntIncome?.(s.day) ? [["Săn cá bán thương lái", `+${progress.huntIncome(s.day)}k`, "#ffb36b"]] : []),
      ["Uy tín", `${(s.rep0 ?? 0).toFixed(1)} → ${(s.rep ?? 0).toFixed(1)} (${d >= 0 ? "+" : ""}${d.toFixed(1)})`, d >= 0 ? "#7dffb0" : "#ff8a8a"],
      ["Điểm ngày", String(s.score ?? 0), "#fff"],
      ["Ví hiện có", `${progress.save.money}k`, GOLD],
    ];
    const rh = rows.length > 8 ? 16.5 : 18;
    rows.forEach(([a, b, col], i) => { const y = 66 + i * rh; txt(a, W / 2 - 118, y, { size: 8, color: "rgba(255,255,255,.8)", weight: 700 }); txt(b, W / 2 + 118, y, { size: 9, align: "right", color: col, weight: 900 }); });
    if (this.t > 0.8 && !this.showing) txt(this.next, W / 2, H - 12, { size: 9, align: "center", color: "#fff", weight: 900, alpha: 0.7 + 0.3 * Math.sin(this.t * 5) });
  }
}

// ---------- Shop: tab "Nâng cấp" (contract upgrades first, creative extras after) + tab "Chợ Chú Sáu" (buy / sell raw goods);
// no timer in the GUI (the headless contract still auto-closes its shop after tuning.shop.max_ticks; the GUI is a
// creative layer and never rushes the player). opts.leftover = tonight's leftover quán items (spoiled included), mutated by sales and
// thrown away by main.js when the Shop closes. this.bought = { kind: n } bought this visit (main.js sends Chú Sáu's message).
export const CU = { oxygen: { name: "Bình oxy", eff: (l) => `O₂ ${l.oxygen_max_s * OXY_MUL} s` }, hp: { name: "Áo phao (thêm Máu)", eff: (l) => `${l.hp_max} Máu` } };
export const SHOP_TABS = ["NÂNG CẤP", "CHỢ CHÚ SÁU"];
export class Shop extends Base {
  constructor(contract, nextLabel, onDone, opts = {}) {
    super("night"); this.c = contract; this.onDone = onDone; this.nextLabel = nextLabel;
    const ups = contract.tuning.shop?.upgrades || {};
    this.rows = [{ head: "NÂNG CẤP CHUẨN" }];
    for (const id of Object.keys(ups)) this.rows.push({ core: id });
    this.rows.push({ head: "ĐỒ THÊM (SÁNG TẠO)" });
    for (const id of [...(progress.GEAR_UPGRADES || []), ...(progress.HUNT_UPGRADES || []), ...(progress.QUAN_UPGRADES || [])]) if (progress.UPGRADES[id]) this.rows.push({ extra: id });
    this.rows.push({ done: true });
    this.items = this.rows.map((r, i) => (r.head ? -1 : i)).filter((i) => i >= 0);
    this.sel = 0; this.msg = null;
    // no auto-close here: the headless contract still uses tuning.shop.max_ticks, the GUI shop waits for the player
    // Chợ Chú Sáu
    this.tab = opts.tab === 1 ? 1 : 0;
    this.leftover = Array.isArray(opts.leftover) ? opts.leftover : [];
    this.prices = vendorPrices(contract); this.kinds = Object.keys(this.prices);
    this.below = freshCfg(contract).spoiled_below;
    this.mSel = 0; this.col = 0; // market row (kinds…, then "done") · column 0 = Mua, 1 = Bán
    this.bought = {}; this.pops = [];
  }
  update(dt) {
    this.tick(dt);
    if (this.msg) { this.msg.life -= dt; if (this.msg.life <= 0) this.msg = null; }
    for (const p of this.pops) p.life -= dt; this.pops = this.pops.filter((p) => p.life > 0);
    if (input.hit("tab") || (this.tab === 0 && (input.hit("left") || input.hit("right")))) { this.tab = 1 - this.tab; sfx("click"); return; }
    const ok = this.t > 0.3 && (input.hit("confirm") || input.hit("interact") || input.hit("catch"));
    if (this.tab === 1) {
      const n = this.kinds.length + 1;
      if (input.hit("up")) { this.mSel = (this.mSel + n - 1) % n; sfx("click"); }
      if (input.hit("down")) { this.mSel = (this.mSel + 1) % n; sfx("click"); }
      if (input.hit("left")) { this.col = 0; sfx("click"); }
      if (input.hit("right")) { this.col = 1; sfx("click"); }
      if (ok) { if (this.mSel >= this.kinds.length) return this.finish("done"); this.trade(this.kinds[this.mSel], this.col ? "sell" : "buy"); }
      return;
    }
    if (input.hit("up")) { this.sel = (this.sel + this.items.length - 1) % this.items.length; sfx("click"); }
    if (input.hit("down")) { this.sel = (this.sel + 1) % this.items.length; sfx("click"); }
    if (ok) this.activate(this.rows[this.items[this.sel]]);
  }
  // one unit per action (contract): buy → pendingDelivery for tomorrow evening; sell → freshest usable leftover
  trade(kind, action) {
    const row = this.kinds.indexOf(kind), px = action === "buy" ? 250 : 382, py = 108 + row * 20;
    if (action === "buy") {
      const it = vendorBuy(this.c, kind);
      if (!it) { sfx("hurt"); this.msg = { text: "Không đủ tiền mua " + kindName(kind), col: "#ff8a8a", life: 1.6 }; return null; }
      this.bought[kind] = (this.bought[kind] || 0) + 1; sfx("coin");
      this.pops.push({ text: `-${this.prices[kind].buy}k`, x: px, y: py, col: "#ffb36b", life: 1 });
      this.msg = { text: `Đã mua 1 ${kindName(kind)} (${it.id}) · giao tối mai, tươi 100%`, col: "#7dffb0", life: 1.6 };
      return it;
    }
    const r = vendorSell(this.c, this.leftover, kind);
    if (!r) { sfx("hurt"); this.msg = { text: this.leftover.some((i) => i.kind === kind) ? `${ucfirst(kindName(kind))} còn lại đã ươn — Chú Sáu không lấy` : `Hết ${kindName(kind)} dư để bán`, col: "#ff8a8a", life: 1.6 }; return null; }
    sfx("coin"); this.pops.push({ text: `+${r.price}k`, x: px, y: py, col: GOLD, life: 1 });
    this.msg = { text: `Bán ${r.item.id} (${Math.floor(r.item.fresh)}%) cho Chú Sáu`, col: GOLD, life: 1.4 };
    return r;
  }
  activate(r) {
    if (r.done) return this.finish("done");
    let ok = false;
    if (r.core) ok = progress.buyContract(this.c, r.core);
    else if (r.extra) ok = progress.buy(r.extra);
    if (ok) { sfx("coin"); this.msg = { text: "Đã mua! Có hiệu lực từ ngày mai", col: "#7dffb0", life: 1.6 }; }
    else { sfx("hurt"); this.msg = { text: "Không mua được (thiếu tiền hoặc đã tối đa)", col: "#ff8a8a", life: 1.6 }; }
  }
  rowText(r) {
    if (r.core) {
      const lv = this.c.tuning.shop.upgrades[r.core], cur = progress.save.cu[r.core] || 0, nx = lv[cur], d = CU[r.core] || { name: r.core, eff: () => "" };
      const curTxt = cur ? `đã có cấp ${cur} (${d.eff(lv[cur - 1])})` : "chưa có";
      return { name: d.name, sub: curTxt, price: nx ? `${nx.price}k → ${d.eff(nx)}` : "TỐI ĐA", can: !!nx && progress.save.money >= nx.price };
    }
    if (r.extra) {
      const u = progress.UPGRADES[r.extra], cost = progress.upgradeCost(r.extra), lv = progress.save.up[r.extra] || 0;
      return { name: u.name, sub: `${u.desc} · cấp ${lv}`, price: cost == null ? "TỐI ĐA" : `${cost}k`, can: cost != null && progress.save.money >= cost };
    }
    return { name: this.nextLabel, sub: "", price: "", can: true };
  }
  draw() {
    this.bg(); const s = progress.save;
    txt("SHOP CHỢ NỔI", W / 2, 18, { size: 14, align: "center", color: GOLD, weight: 900, italic: true, stroke: "#3a1410", sw: 4 });
    txt(`Ví ${s.money}k · Tổng thu ${s.totalEarned}k`, 16, 18, { size: 8, color: GOLD, weight: 900 });
    SHOP_TABS.forEach((name, i) => { const on = this.tab === i, x = W / 2 - 112 + i * 116;
      panel(x, 23, 108, 13, { fill: on ? "rgba(255,160,60,.35)" : "rgba(8,20,38,.75)", border: on ? GOLD : "rgba(243,210,122,.35)", r: 5 });
      txt(name, x + 54, 32.5, { size: 8, align: "center", color: on ? "#fff" : "rgba(255,255,255,.6)", weight: 900 }); });
    if (this.tab === 1) this.drawMarket(); else this.drawUpgrades();
    for (const p of this.pops) txt(p.text, p.x, p.y - (1 - p.life) * 14, { size: 10, align: "center", color: p.col, weight: 900, stroke: "#1a1220", sw: 2, alpha: Math.min(1, p.life * 2) });
    if (this.msg) txt(this.msg.text, W / 2, H - 18, { size: 9, align: "center", color: this.msg.col, weight: 900, stroke: "#1a1220", sw: 2 });
    txt(this.tab === 1 ? "↑↓ chọn hàng · ←→ Mua/Bán · Enter: 1 đơn vị · Tab: Nâng cấp · Esc/P tạm dừng" : "↑↓ chọn · Enter mua · Tab/←→: Chợ Chú Sáu · Esc/P tạm dừng · có hiệu lực từ ngày mai", W / 2, H - 5, { size: 7, align: "center", color: "rgba(255,255,255,.6)", weight: 700 });
  }
  drawUpgrades() {
    const x0 = 24, w0 = W - 48; let y = 40;
    this.rows.forEach((r, i) => {
      if (r.head) { txt(r.head, x0 + 2, y + 9, { size: 7, color: r.head.includes("SÁNG") ? "#c9a6ff" : "#9fd8ff", weight: 900 }); y += 12; return; }
      const sel = this.items[this.sel] === i, rt = this.rowText(r), h = r.done ? 16 : 17;
      panel(x0, y, w0, h - 2, { fill: sel ? "rgba(255,160,60,.25)" : "rgba(8,20,38,.82)", border: sel ? GOLD : "rgba(243,210,122,.35)", r: 5 });
      txt((sel ? "▶ " : "") + rt.name, x0 + 6, y + 10, { size: 8, color: "#fff", weight: 900 });
      if (rt.sub) txt(rt.sub, x0 + 150, y + 10, { size: 7, color: "rgba(255,255,255,.65)", weight: 700 });
      if (rt.price) txt(rt.price, x0 + w0 - 6, y + 10, { size: 8, align: "right", color: rt.price === "TỐI ĐA" ? "#9fd8ff" : rt.can ? "#7dffb0" : "#ff8a8a", weight: 900 });
      y += h;
    });
  }
  drawMarket() {
    const u = screen.ui, s = progress.save; u.imageSmoothingEnabled = false;
    // Chú Sáu + wooden sign
    panel(16, 40, W - 32, 46, { fill: "rgba(96,58,30,.95)", border: "#d9a05a", r: 6, bw: 1.5 });
    try { u.drawImage(portrait("sau"), 22, 43, 40, 40); } catch (e) {}
    txt("CHỢ CHÚ SÁU", 70, 56, { size: 11, color: "#ffe9c4", weight: 900, stroke: "#3a1a08", sw: 3 });
    txt("“Mua cá tươi giao tận quán tối mai, đồ dư tối nay Chú lấy hết — miễn đừng ươn nghen!”", 70, 70, { size: 7, color: "#fff3d6", weight: 700 });
    const pend = s.pendingDelivery || [];
    txt(pend.length ? `Chờ giao tối mai: ${deliveryText(pend)}` : "Chưa đặt hàng cho tối mai", 70, 80, { size: 7, color: pend.length ? "#d8ffc0" : "rgba(255,255,255,.55)", weight: 800 });
    // columns
    const x0 = 16, w0 = W - 32, cB = 186, cS = 318, y0 = 92, rh = 20;
    txt("HÀNG", x0 + 6, y0 + 4, { size: 7, color: "#9fd8ff", weight: 900 });
    txt("MUA (giao tối mai)", cB + 64, y0 + 4, { size: 7, align: "center", color: this.col === 0 ? GOLD : "#9fd8ff", weight: 900 });
    txt("BÁN (đồ dư tối nay)", cS + 64, y0 + 4, { size: 7, align: "center", color: this.col === 1 ? GOLD : "#9fd8ff", weight: 900 });
    const pc = countKinds(pend);
    this.kinds.forEach((k, i) => {
      const y = y0 + 8 + i * rh, sel = this.mSel === i, pr = this.prices[k];
      panel(x0, y, w0, rh - 2, { fill: sel ? "rgba(255,160,60,.16)" : "rgba(8,20,38,.82)", border: sel ? "rgba(255,210,63,.6)" : "rgba(243,210,122,.25)", r: 5 });
      u.drawImage(icon(k), x0 + 6, y + 4, 10, 10); txt(ucfirst(kindName(k)), x0 + 20, y + 12, { size: 8, color: "#fff", weight: 900 });
      // buy cell
      const canBuy = s.money >= pr.buy;
      panel(cB, y + 2, 128, rh - 6, { fill: sel && this.col === 0 ? "rgba(255,160,60,.4)" : "rgba(0,0,0,.25)", border: sel && this.col === 0 ? GOLD : "rgba(255,255,255,.12)", r: 4 });
      txt(`${pr.buy}k`, cB + 6, y + 12, { size: 8, color: canBuy ? "#7dffb0" : "#ff8a8a", weight: 900 });
      txt(`đã đặt ${pc[k] || 0}`, cB + 122, y + 12, { size: 7, align: "right", color: pc[k] ? "#d8ffc0" : "rgba(255,255,255,.5)", weight: 800 });
      // sell cell: usable leftovers only; spoiled shown greyed "ươn"
      const good = vendorSellable(this.c, this.leftover, k).length, bad = this.leftover.filter((it) => it.kind === k).length - good;
      panel(cS, y + 2, 128, rh - 6, { fill: sel && this.col === 1 ? "rgba(255,160,60,.4)" : "rgba(0,0,0,.25)", border: sel && this.col === 1 ? GOLD : "rgba(255,255,255,.12)", r: 4 });
      txt(`${pr.sell}k`, cS + 6, y + 12, { size: 8, color: good ? GOLD : "rgba(255,255,255,.4)", weight: 900 });
      txt(`còn ${good}`, cS + 76, y + 12, { size: 7, align: "right", color: good ? "#fff" : "rgba(255,255,255,.4)", weight: 800 });
      if (bad) txt(`${bad} ươn`, cS + 122, y + 12, { size: 7, align: "right", color: "#8a8a8a", weight: 800 });
    });
    const dy = y0 + 8 + this.kinds.length * rh + 2, ds = this.mSel >= this.kinds.length;
    panel(x0, dy, w0, 14, { fill: ds ? "rgba(255,160,60,.25)" : "rgba(8,20,38,.82)", border: ds ? GOLD : "rgba(243,210,122,.35)", r: 5 });
    txt((ds ? "▶ " : "") + this.nextLabel, x0 + 6, dy + 10, { size: 8, color: "#fff", weight: 900 });
    if (!this.leftover.length) txt("Tối nay không còn đồ dư", x0 + w0 - 6, dy + 10, { size: 7, align: "right", color: "rgba(255,255,255,.5)", weight: 700 });
  }
}

// ---------- Summary after the last day ----------
// phases: "stats" (season totals) → Enter → "name" (type a name, Enter saves to the local leaderboard) → "board" (top 10)
// → Enter → title. Demo runs skip the leaderboard (they are not a real 5-day campaign).
export class Summary extends Base {
  constructor(contract, onDone) {
    super("night"); this.onDone = onDone; const s = progress.save;
    this.rep = progress.repNow(contract);
    this.score = s.totalEarned + (contract.tuning.score?.reputation_multiplier ?? 100) * Math.floor(this.rep);
    const best = Object.entries(s.sold || {}).sort((a, b) => b[1] - a[1])[0];
    this.best = best ? `${dishName(best[0])} (${best[1]} suất)` : "chưa bán được món nào";
    this.bestId = best?.[0];
    this.days = Number.isFinite(contract.tuning.day_plan?.length) ? contract.tuning.day_plan.length : 5;
    this.phase = "stats"; this.name = ""; this.place = -1; this.entries = board.load(); this.pt = 0;
    this._key = (e) => this.onKey(e);
    // meme finale (any key cuts it short): impact title → the best-selling dish ascends to heaven → airhorns
    this.fx = new MemeLayer();
    this.queue = [
      { meme: "impact", text: "TỔNG KẾT\nMÙA NƯỚC NỔI", sub: `${s.totalEarned}k · ${this.rep.toFixed(1)} ★`, col: GOLD, size: 40, dur: 1.3 },
      ...(this.bestId ? [{ meme: "ascend", dish: this.bestId, text: `${dishName(this.bestId)}\nMÓN THẦN THÁNH`, dur: 2.2 }] : [{ meme: "sweat", who: "sen", text: "Cả mùa chưa bán được món nào… khum sao", dur: 1.6 }]),
      { meme: "airhorn", text: "MÃI ĐỈNH", sub: `Tổng điểm ${this.score}`, dur: 1.8 },
    ];
    this.fx.start(this.queue.shift());
  }
  get showing() { return this.fx.active || this.queue.length > 0; }
  onKey(e) {
    if (this.phase !== "name") return;
    if (e.key === "Enter") { e.preventDefault(); this.save(); return; }
    if (e.key === "Backspace") { e.preventDefault(); this.name = this.name.slice(0, -1); sfx("click"); return; }
    if (e.key.length === 1 && this.name.length < board.NAME_MAX && !e.ctrlKey && !e.metaKey) { e.preventDefault(); this.name += e.key; sfx("blip", undefined, false); }
  }
  save() {
    const r = board.record(this.name, this.score, this.days, 0);
    this.entries = r.entries; this.place = r.place; this.phase = "board"; this.pt = 0;
    removeEventListener("keydown", this._key);
    sfx(r.place === 0 ? "fanfare" : "ding", undefined, r.place >= 0 ? `[vào bảng xếp hạng — hạng ${r.place + 1}]` : undefined);
    this.fx.clear(); this.queue = [r.place === 0 ? { meme: "shades", who: "sen", text: "TOP 1 SERVER", sub: "Đỉnh của chóp · khum ai cản nổi", dur: 2.4 }
      : r.place > 0 ? { meme: "chibi", who: "sen", at: [W - 60, H - 24], text: `Hạng ${r.place + 1}!`, dur: 1.1 }
      : { meme: "tears", who: "sen", text: "Chưa vào top…\nlần sau nha!", dur: 2 }];
  }
  finish(arg) { removeEventListener("keydown", this._key); super.finish(arg); }
  get typing() { return this.phase === "name"; }
  update(dt) {
    this.tick(dt); this.pt += dt; this.fx.update(dt);
    if (!this.fx.active && this.queue.length) this.fx.start(this.queue.shift());
    const ok = input.hit("confirm") || input.hit("interact") || input.hit("catch");
    if (ok && this.phase !== "name" && this.showing && Math.min(this.t, this.pt) > 0.3) { this.fx.clear(); this.queue = []; this.t = Math.max(this.t, 1); return; } // skip the show
    if (this.phase === "stats" && this.t > 1 && ok) {
      if (progress.isDemo()) return this.finish();
      this.phase = "name"; this.pt = 0; sfx("select"); addEventListener("keydown", this._key);
    } else if (this.phase === "board" && this.pt > 0.5 && ok) this.finish();
  }
  draw() { this.drawStats(); this.fx.draw(); }
  drawStats() {
    this.bg();
    if (this.phase === "board") return this.drawBoard();
    const s = progress.save;
    txt("TỔNG KẾT MÙA NƯỚC NỔI", W / 2, 36, { size: 20, align: "center", color: GOLD, weight: 900, italic: true, stroke: "#3a1410", sw: 5 });
    panel(W / 2 - 130, 50, 260, 120, { fill: "rgba(8,20,38,.9)", border: BORDER, r: 8 });
    [["Tổng tiền thu", `${s.totalEarned}k`], ["Ví còn lại", `${s.money}k`], ["Tổng điểm", String(this.score)], ["Uy tín", this.rep.toFixed(1) + " ★"], ["Món bán chạy", this.best]].forEach(([a, b], i) => {
      const y = 72 + i * 20; txt(a, W / 2 - 118, y, { size: 8, color: "rgba(255,255,255,.8)", weight: 700 }); txt(b, W / 2 + 118, y, { size: 9, align: "right", color: GOLD, weight: 900 });
    });
    if (this.bestId) { screen.ui.imageSmoothingEnabled = false; screen.ui.drawImage(dishIcon(this.bestId), W / 2 - 12, 176, 24, 24); }
    if (this.phase === "name") {
      panel(W / 2 - 110, 206, 220, 40, { fill: "rgba(8,20,38,.96)", border: GOLD, r: 6, bw: 1.5 });
      txt("Tên của bạn trên bảng xếp hạng:", W / 2, 218, { size: 8, align: "center", color: "rgba(255,255,255,.85)", weight: 700 });
      const caret = Math.floor(this.pt * 2) % 2 ? "_" : " ";
      txt((this.name || "") + caret, W / 2, 236, { size: 11, align: "center", color: this.name ? "#fff" : "rgba(255,255,255,.45)", weight: 900 });
      txt("gõ tên · Backspace xóa · Enter lưu (để trống = Út Sen)", W / 2, H - 12, { size: 8, align: "center", color: "#fff", weight: 800, alpha: 0.8 });
    } else if (this.t > 1) txt(progress.isDemo() ? "Enter: về màn hình chính" : "Enter: ghi tên lên bảng xếp hạng", W / 2, H - 12, { size: 9, align: "center", color: "#fff", weight: 900, alpha: 0.7 + 0.3 * Math.sin(this.t * 5) });
  }
  drawBoard() {
    txt("BẢNG XẾP HẠNG", W / 2, 30, { size: 18, align: "center", color: GOLD, weight: 900, italic: true, stroke: "#3a1410", sw: 5 });
    const x = W / 2 - 150, y0 = 42, rh = 18;
    panel(x, y0, 300, 16 + Math.max(1, this.entries.length) * rh, { fill: "rgba(8,20,38,.92)", border: BORDER, r: 8 });
    if (!this.entries.length) txt("Chưa có ai", W / 2, y0 + 22, { size: 9, align: "center", color: "#fff" });
    this.entries.forEach((e, i) => {
      const y = y0 + 18 + i * rh, me = i === this.place;
      if (me) panel(x + 4, y - 11, 292, rh - 2, { fill: "rgba(255,210,63,.18)", border: GOLD, r: 4, alpha: 0.6 + 0.4 * Math.sin(this.pt * 6) });
      const col = me ? GOLD : "#fff";
      txt(String(i + 1).padStart(2, " ") + ".", x + 14, y, { size: 9, color: col, weight: 900 });
      txt(e.name, x + 38, y, { size: 9, color: col, weight: me ? 900 : 700 });
      txt(`${e.days_completed} Ngày`, x + 210, y, { size: 8, align: "right", color: "rgba(255,255,255,.7)", weight: 700 });
      txt(String(e.score), x + 288, y, { size: 9, align: "right", color: col, weight: 900 });
    });
    if (this.place < 0) txt(`Điểm ${this.score} chưa vào top ${board.TOP_N} — lần sau nhé!`, W / 2, H - 28, { size: 8, align: "center", color: "#ffb36b", weight: 800 });
    if (this.pt > 0.5) txt("Enter: về màn hình chính", W / 2, H - 12, { size: 9, align: "center", color: "#fff", weight: 900, alpha: 0.7 + 0.3 * Math.sin(this.t * 5) });
  }
}

// ---------- pause overlay (drawn by main.js over the frozen scene) ----------
export const PAUSE_ITEMS = ["Tiếp tục", "Về menu"];
export const PAUSE_ITEMS_QUAN = ["Tiếp tục", "Đóng quán sớm", "Về menu"];
export function drawPause(sel, items = PAUSE_ITEMS) {
  const u = screen.ui;
  u.save(); u.fillStyle = "rgba(4,8,20,.66)"; u.fillRect(0, 0, W, H); u.restore();
  const extra = (items.length - 2) * 20;
  panel(W / 2 - 95, H / 2 - 46, 190, 92 + extra, { fill: "rgba(14,22,40,.95)", border: BORDER, r: 10, bw: 1.5 });
  txt("TẠM DỪNG", W / 2, H / 2 - 24, { size: 14, align: "center", color: GOLD, weight: 900 });
  items.forEach((s, i) => {
    const y = H / 2 - 4 + i * 20, on = i === sel;
    if (on) panel(W / 2 - 80, y - 11, 160, 16, { fill: "rgba(255,160,60,.25)", border: GOLD, r: 6 });
    txt((on ? "▶ " : "") + s, W / 2, y + 1, { size: 10, align: "center", color: on ? "#fff" : "rgba(255,255,255,.7)", weight: 900 });
  });
  txt("Esc/P: tiếp tục · ↑↓ Enter · H: tương phản", W / 2, H / 2 + 40 + extra, { size: 7, align: "center", color: "rgba(255,255,255,.55)", weight: 700 });
}
