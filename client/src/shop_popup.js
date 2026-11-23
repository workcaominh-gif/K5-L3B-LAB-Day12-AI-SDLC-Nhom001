// Chợ Chú Sáu as a centred pop-up over the live (dimmed) dock hub — GUI only. Overlay contract { update(dt), draw(), done }.
// Tabs: "Mua" (raw goods → save.pendingDelivery, delivered TOMORROW evening) · "Bán" (tonight's leftovers, freshest first,
// spoiled refused) · "Nâng cấp" (contract oxygen/hp — active from tomorrow — then the creative extras).
// No timer: the headless contract still auto-closes its shop after tuning.shop.max_ticks; the GUI waits for the player.
// Keys: ←→↑↓ pick a card · Enter/E/Space = OK (one unit / one level) · Tab = next tab · Esc = Hủy / close.
// Mouse: click a tab, a card (select), OK or Hủy. All purchase rules are the existing ones (scene_day.js / progress.js).
import { W, H, screen, input, clamp, ease, txt, panel, measure, wrap } from "./engine.js";
import { sfx, voiceLine } from "./audio.js";
import { P, R, icon, portrait, KIND_NAME } from "./art.js";
import { personSide } from "./raft.js";
import * as progress from "./progress.js";
import { vendorPrices, vendorBuy, vendorSell, vendorSellable, deliveryText, planFor, CU } from "./scene_day.js";
import { freshCfg } from "./fresh.js";
import { OXY_MUL } from "./gui_tuning.js";
import { playAction, pumpActionCut, drawActionCut } from "./action_cut.js";

const GOLD = "#ffd23f", BORDER = "#f3d27a", WOOD = "rgba(58,34,18,.97)", WOODL = "#d9a05a";
const kindName = (k) => KIND_NAME[k] || k;
const ucfirst = (s) => s.charAt(0).toUpperCase() + s.slice(1);
export const POPUP_TABS = ["Mua", "Bán", "Nâng cấp"];
const COLS = 5;
// panel geometry (~70% of the screen width, seller standing at its left)
const PX = 112, PY = 20, PW = 344, PH = 236;
const GX = PX + 8, GY = PY + 40, CW = (PW - 16 - (COLS - 1) * 5) / COLS, CH = 46;
const DY = PY + 150, DH = 62; // detail box
const LINES = {
  dawn: ["Sáng sớm ghé Chú hả con? Đặt hàng đi, tối mai Chú chèo ghe giao tận quán.", "Hôm nay cá lóc mập lắm nghen, đặt vài con đi con."],
  night: ["Tan quán rồi hả? Đồ dư còn tươi thì Chú lấy hết, đồ ươn thì thôi nghen.", "Tối rồi mà chợ còn đèn, ghé Chú coi hàng nè."],
  buy: ["Chú ghi sổ rồi! Tối mai giao tận quán, tươi rói.", "Được luôn, mai Chú chèo ghe qua sớm."],
  sell: ["Hàng còn tươi, Chú lấy!", "Ừ, Chú trả đủ tiền nghen con."],
  up: ["Đồ nghề xịn rồi đó, mai lặn sướng luôn!", "Mua đồ tốt là tiết kiệm sức, con ha."],
  poor: ["Hổng đủ tiền rồi con ơi, để bữa khác.", "Ví mỏng quá, bán bớt đồ dư đi con."],
  bad: ["Món này ươn rồi, Chú hổng lấy được đâu.", "Hết đồ dư loại này rồi con."],
  max: ["Cái này tối đa rồi, hổng nâng nữa được."],
};
const pick = (a) => a[Math.floor(Math.random() * a.length)];
// "before → after" line for the gear showcase cut (action_cut.js), e.g. "O₂ 90 → 135 s"
const fmt = (v) => (Math.round(v * 100) / 100).toString();
const EXTRA_STAT = {
  cap: (a, b) => `Giỏ +${a} → +${b} món`, fins: (a, b) => `Bơi ×${fmt(a)} → ×${fmt(b)}`, net: (a, b) => `Tầm bắt +${fmt(a)} → +${fmt(b)} m`,
  spear: (a, b) => `Sát thương ${a} → ${b}`, stove: (a, b) => `Thời gian nấu ×${fmt(a)} → ×${fmt(b)}`, decor: (a, b) => `Kiên nhẫn ×${fmt(a)} → ×${fmt(b)}`,
  table2: (a, b) => `Bàn ${a} → ${b}`, oxy: (a, b) => `O₂ +${a} → +${b} s`,
};
export function gearStatLine(contract, type, id, lvBefore) {
  try {
    if (type === "core") {
      const lv = contract.tuning.shop?.upgrades?.[id] || [], g = contract.tuning.gather || {}, a = lv[lvBefore - 1], b = lv[lvBefore];
      if (id === "oxygen") return `O₂ ${(a?.oxygen_max_s ?? g.oxygen_max_s) * OXY_MUL} → ${b.oxygen_max_s * OXY_MUL} s`;
      if (id === "hp") return `Máu ${a?.hp_max ?? g.hp_max} → ${b.hp_max}`;
      return "";
    }
    const u = progress.UPGRADES[id]; if (!u) return "";
    return (EXTRA_STAT[id] || ((x, y) => `${x} → ${y}`))(u.eff[lvBefore], u.eff[lvBefore + 1]);
  } catch (e) { return ""; }
}

// small pixel glyphs for upgrade cards (original, drawn with R)
function upGlyph(c, id, x, y) {
  const g = {
    oxygen: () => { R(c, x + 3, y, 4, 2, "#cfd8e0"); R(c, x + 2, y + 2, 6, 9, "#3fb6c4"); R(c, x + 3, y + 3, 1, 7, "#a6f0ff"); R(c, x + 2, y + 6, 6, 1, "#155f80"); },
    hp: () => { R(c, x + 1, y + 2, 3, 3, P.red); R(c, x + 6, y + 2, 3, 3, P.red); R(c, x + 1, y + 4, 8, 3, P.red); R(c, x + 2, y + 7, 6, 2, P.red); R(c, x + 4, y + 9, 2, 1, P.red); R(c, x + 2, y + 3, 1, 1, "#ffb0a0"); },
    cap: () => { R(c, x, y + 3, 10, 2, P.strawD); R(c, x + 1, y + 5, 8, 5, P.straw); for (let i = 0; i < 4; i++) R(c, x + 2 + i * 2, y + 5, 1, 5, P.strawD); },
    fins: () => { R(c, x + 1, y + 1, 3, 7, P.orange); R(c, x + 6, y + 1, 3, 7, P.orange); R(c, x, y + 8, 5, 2, P.orangeD); R(c, x + 5, y + 8, 5, 2, P.orangeD); },
    net: () => { R(c, x + 7, y + 5, 1, 5, P.woodD); for (let i = 0; i < 4; i++) { R(c, x + i * 2, y, 1, 6, "#d4e8f2"); R(c, x, y + i * 2, 7, 1, "#d4e8f2"); } },
    spear: () => { for (let i = 0; i < 8; i++) R(c, x + i, y + 9 - i, 1, 1, P.woodL); R(c, x + 7, y, 3, 3, "#d4e8f2"); },
    stove: () => { R(c, x + 1, y + 4, 8, 6, "#8a4a2a"); R(c, x + 2, y + 6, 6, 2, P.orange); R(c, x + 3, y + 1, 1, 3, P.yellow); R(c, x + 6, y + 2, 1, 2, P.yellow); },
    decor: () => { R(c, x + 4, y, 1, 2, P.ink); R(c, x + 2, y + 2, 6, 7, P.red); R(c, x + 3, y + 3, 4, 5, P.orange); R(c, x + 2, y + 2, 6, 1, P.gold); R(c, x + 2, y + 8, 6, 1, P.gold); },
    table2: () => { R(c, x, y + 3, 10, 2, P.woodL); R(c, x + 1, y + 5, 1, 5, P.woodD); R(c, x + 8, y + 5, 1, 5, P.woodD); R(c, x + 2, y + 1, 3, 2, "#e8e2d0"); },
  };
  (g[id] || g.decor)();
}

export class ShopPopup {
  // opts: { phase: "dawn" | "night", leftover: [] (mutated by sales), deliverDay, tab, onClose({ bought }) }
  constructor(contract, opts = {}) {
    this.c = contract; this.opts = opts; this.phase = opts.phase === "night" ? "night" : "dawn";
    this.leftover = Array.isArray(opts.leftover) ? opts.leftover : [];
    this.deliverDay = opts.deliverDay ?? progress.save.day + 1;
    this.prices = vendorPrices(contract); this.kinds = Object.keys(this.prices);
    this.below = freshCfg(contract).spoiled_below;
    this.tab = clamp(opts.tab | 0, 0, 2); this.sel = 0; this.focus = "grid"; // grid | ok | cancel
    this.bought = {}; this.pops = []; this.msg = null;
    this.done = false; this.t = 0; this.k = 0; this.closing = false;
    this.say(pick(LINES[this.phase]));
    this._click = null;
    this._onDown = (e) => {
      const pc = screen.pc; if (!pc?.getBoundingClientRect || this.closing) return;
      const r = pc.getBoundingClientRect(); this._click = { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H };
    };
    addEventListener("pointerdown", this._onDown);
    sfx("whoosh");
  }
  say(text) { this.line = text; this.shown = 0; try { voiceLine("Chú Sáu", text); } catch (e) {} }
  // ---- card data for the current tab ----
  cards(tab = this.tab) {
    const s = progress.save;
    if (tab === 0) {
      const plan = planFor(this.c, this.deliverDay), need = plan ? plan.ingredients || {} : {};
      const pend = s.pendingDelivery || [], due = pend.filter((it) => (it.day ?? this.deliverDay) === this.deliverDay);
      return this.kinds.map((k) => ({ type: "buy", k, name: ucfirst(kindName(k)), price: this.prices[k].buy, can: s.money >= this.prices[k].buy,
        badge: need[k] ? "Cần" : "Hôm nay", badgeCol: need[k] ? "#ffb36b" : "#9fdc7a", note: `đã đặt ${due.filter((it) => it.kind === k).length}`,
        desc: `${ucfirst(kindName(k))} tươi của Chú Sáu, mỗi lần 1 đơn vị${need[k] ? ` · kế hoạch Ngày ${this.deliverDay} cần ${need[k]}` : ""}.`,
        eff: `Giao tối mai (Ngày ${this.deliverDay}) · tươi 100%` }));
    }
    if (tab === 1) {
      return this.kinds.map((k) => {
        const good = vendorSellable(this.c, this.leftover, k).length, bad = this.leftover.filter((it) => it.kind === k).length - good;
        return { type: "sell", k, name: ucfirst(kindName(k)), price: this.prices[k].sell, can: good > 0,
          badge: good ? `còn ${good}` : bad ? `${bad} ươn` : "hết", badgeCol: good ? GOLD : bad ? "#9a9a9a" : "rgba(255,255,255,.45)", note: "",
          desc: good ? `Bán 1 ${kindName(k)} dư tối nay (Chú lấy con tươi nhất).` : bad ? "Còn đồ dư nhưng đã ươn — Chú không lấy." : this.phase === "night" ? `Tối nay không dư ${kindName(k)}.` : "Buổi sáng chưa có đồ dư — tối về quán rồi bán.",
          eff: "Nhận tiền ngay" };
      });
    }
    const out = [], ups = this.c.tuning.shop?.upgrades || {};
    for (const id of Object.keys(ups)) {
      const lv = ups[id], cur = s.cu[id] || 0, nx = lv[cur], d = CU[id] || { name: id, eff: () => "" };
      out.push({ type: "core", id, name: d.name, price: nx ? nx.price : null, can: !!nx && s.money >= nx.price, lv: cur, max: lv.length,
        badge: "Chuẩn", badgeCol: "#9fd8ff", note: "", desc: cur ? `Đang có cấp ${cur}: ${d.eff(lv[cur - 1])}.` : "Chưa có — dùng đồ nghề gốc.",
        eff: nx ? `Cấp ${cur + 1}: ${d.eff(nx)} · có hiệu lực từ ngày mai` : "Đã tối đa" });
    }
    for (const id of [...(progress.GEAR_UPGRADES || []), ...(progress.HUNT_UPGRADES || []), ...(progress.QUAN_UPGRADES || [])]) {
      const u = progress.UPGRADES[id]; if (!u) continue;
      const cost = progress.upgradeCost(id), lv = s.up[id] || 0;
      out.push({ type: "extra", id, name: u.name, price: cost, can: cost != null && s.money >= cost, lv, max: u.cost.length - 1,
        badge: "Thêm", badgeCol: "#c9a6ff", note: "", desc: `${ucfirst(u.desc)} · đang cấp ${lv}.`,
        // creative extras are read straight from the save (stats()), so a morning purchase already helps today's dive
        eff: cost == null ? "Đã tối đa" : this.phase === "dawn" ? `Cấp ${lv + 1} · dùng được ngay hôm nay` : `Cấp ${lv + 1} · có hiệu lực từ ngày mai` });
    }
    return out;
  }
  close() { if (this.closing) return; this.closing = true; sfx("click"); removeEventListener("pointerdown", this._onDown); }
  setTab(i) { this.tab = (i + 3) % 3; this.sel = 0; this.focus = "grid"; sfx("click"); }
  // OK: one unit / one level of the selected card (same rules as the old Shop)
  ok() {
    const cs = this.cards(), cd = cs[this.sel]; if (!cd) return;
    const bx = GX + (this.sel % COLS) * (CW + 5) + CW / 2, by = GY + Math.floor(this.sel / COLS) * (CH + 4) + 10;
    if (cd.type === "buy") {
      const it = vendorBuy(this.c, cd.k, this.deliverDay);
      if (!it) return this.fail("Không đủ tiền mua " + kindName(cd.k), LINES.poor);
      this.bought[cd.k] = (this.bought[cd.k] || 0) + 1; sfx("coin");
      this.pops.push({ text: `-${cd.price}k`, x: bx, y: by, col: "#ffb36b", life: 1 });
      this.msg = { text: `Đã đặt 1 ${kindName(cd.k)} (${it.id}) · giao tối mai, tươi 100%`, col: "#7dffb0", life: 2 };
      return this.say(pick(LINES.buy));
    }
    if (cd.type === "sell") {
      const r = vendorSell(this.c, this.leftover, cd.k);
      if (!r) return this.fail(this.leftover.some((i) => i.kind === cd.k) ? `${ucfirst(kindName(cd.k))} còn lại đã ươn — Chú Sáu không lấy` : `Hết ${kindName(cd.k)} dư để bán`, LINES.bad);
      sfx("coin"); this.pops.push({ text: `+${r.price}k`, x: bx, y: by, col: GOLD, life: 1 });
      this.msg = { text: `Bán ${r.item.id} (${Math.floor(r.item.fresh)}%) cho Chú Sáu`, col: GOLD, life: 2 };
      return this.say(pick(LINES.sell));
    }
    if (cd.price == null) return this.fail("Đã tối đa", LINES.max);
    const stat = gearStatLine(this.c, cd.type, cd.id, cd.lv | 0);
    const ok = cd.type === "core" ? progress.buyContract(this.c, cd.id) : progress.buy(cd.id);
    if (!ok) return this.fail("Không mua được (thiếu tiền hoặc đã tối đa)", LINES.poor);
    const glyphId = cd.type === "core" ? (cd.id === "hp" ? "hp" : "oxygen") : cd.id;
    playAction("gear", { id: cd.id, name: cd.name, stat, glyph: (c, x, y) => upGlyph(c, glyphId, x, y),
      cta: progress.QUAN_UPGRADES?.includes(cd.id) ? "Dùng ngay" : "Đeo ngay" });
    sfx("coin"); this.pops.push({ text: `-${cd.price}k`, x: bx, y: by, col: "#ffb36b", life: 1 });
    this.msg = { text: `Đã mua ${cd.name}! ${cd.eff.split(" · ").pop()}`, col: "#7dffb0", life: 2 };
    this.say(pick(LINES.up));
  }
  fail(text, lines) { sfx("hurt"); this.msg = { text, col: "#ff8a8a", life: 1.8 }; this.say(pick(lines)); }
  // ---- input ----
  handleClick(p) {
    const inR = (x, y, w, h) => p.x >= x && p.x <= x + w && p.y >= y && p.y <= y + h;
    for (let i = 0; i < 3; i++) if (inR(PX + 8 + i * 70, PY + 22, 64, 14)) return this.setTab(i);
    const n = this.cards().length;
    for (let i = 0; i < n; i++) { const [x, y] = this.cardXY(i); if (inR(x, y, CW, CH)) { if (this.sel !== i) sfx("click"); this.sel = i; this.focus = "grid"; return; } }
    const [ox, oy, cx] = this.btnXY();
    if (inR(ox, oy, 46, 15)) return this.ok();
    if (inR(cx, oy, 46, 15)) return this.close();
  }
  cardXY(i) { return [GX + (i % COLS) * (CW + 5), GY + Math.floor(i / COLS) * (CH + 4)]; }
  btnXY() { return [PX + PW - 108, DY + DH - 20, PX + PW - 56]; }
  update(dt) {
    this.t += dt;
    for (const p of this.pops) p.life -= dt; this.pops = this.pops.filter((p) => p.life > 0);
    if (this.msg) { this.msg.life -= dt; if (this.msg.life <= 0) this.msg = null; }
    this.shown = Math.min(this.line.length, this.shown + dt * 45);
    if (this.closing) { this.k -= dt * 5; if (this.k <= 0 && !this.done) { this.k = 0; this.done = true; this.opts.onClose?.({ bought: this.bought }); } return; }
    this.k = Math.min(1, this.k + dt * 4);
    if (pumpActionCut(dt)) { this._click = null; return; } // gear showcase cut plays over the pop-up
    if (this.t < 0.15) { this._click = null; return; } // swallow the key / click that opened the shop
    if (this._click) { const p = this._click; this._click = null; this.handleClick(p); return; } // (the click also raised "confirm": ignored)
    if (input.hit("back")) return this.close();
    if (input.hit("tab")) return this.setTab(this.tab + 1);
    const n = this.cards().length;
    if (input.hit("left")) { this.sel = (this.sel + n - 1) % n; sfx("click"); }
    if (input.hit("right")) { this.sel = (this.sel + 1) % n; sfx("click"); }
    if (input.hit("up")) { if (this.sel - COLS >= 0) this.sel -= COLS; else return this.setTab(this.tab - 1); sfx("click"); }
    if (input.hit("down")) { if (this.sel + COLS < n) { this.sel += COLS; sfx("click"); } else if (Math.floor(this.sel / COLS) < Math.floor((n - 1) / COLS)) { this.sel = n - 1; sfx("click"); } }
    if (input.hit("confirm") || input.hit("interact") || input.hit("catch")) this.ok();
  }
  // ---- draw ----
  draw() {
    const u = screen.ui, e = ease.out(clamp(this.k, 0, 1)), s = progress.save;
    u.save(); u.fillStyle = `rgba(4,8,20,${0.55 * e})`; u.fillRect(0, 0, W, H); u.restore();
    u.save(); u.globalAlpha = e; u.imageSmoothingEnabled = false;
    const off = Math.round((1 - e) * 16);
    u.translate(0, off);
    this.drawSeller(u);
    // panel + header
    panel(PX - 2, PY - 2, PW + 4, PH + 4, { fill: "#1a0e06", border: BORDER, r: 10, bw: 1.6 });
    panel(PX, PY, PW, PH, { fill: WOOD, border: WOODL, r: 9, bw: 1 });
    txt("CHỢ CHÚ SÁU", PX + 10, PY + 14, { size: 11, color: "#ffe9c4", weight: 900, stroke: "#3a1a08", sw: 3 });
    txt(`Ví ${s.money | 0}k`, PX + PW - 10, PY + 14, { size: 10, align: "right", color: GOLD, weight: 900 });
    const pend = (s.pendingDelivery || []).filter((it) => (it.day ?? this.deliverDay) === this.deliverDay);
    txt(pend.length ? `Giao tối mai: ${deliveryText(pend)}` : "Chưa đặt hàng cho tối mai", PX + PW - 60, PY + 14, { size: 7, align: "right", color: pend.length ? "#d8ffc0" : "rgba(255,255,255,.5)", weight: 800 });
    POPUP_TABS.forEach((name, i) => { const on = this.tab === i, x = PX + 8 + i * 70;
      panel(x, PY + 22, 64, 14, { fill: on ? "rgba(255,160,60,.45)" : "rgba(20,10,4,.6)", border: on ? GOLD : "rgba(243,210,122,.35)", r: 5 });
      txt(name, x + 32, PY + 32, { size: 8, align: "center", color: on ? "#fff" : "rgba(255,255,255,.6)", weight: 900 }); });
    txt(this.tab === 0 ? "HÀNG HÔM NAY" : this.tab === 1 ? "ĐỒ DƯ TỐI NAY" : "ĐỒ NGHỀ", PX + PW - 10, PY + 32, { size: 7, align: "right", color: "#c9a88a", weight: 900 });
    // card grid
    const cs = this.cards(); if (this.sel >= cs.length) this.sel = Math.max(0, cs.length - 1);
    cs.forEach((cd, i) => this.drawCard(u, cd, i));
    // detail box
    const cd = cs[this.sel];
    panel(PX + 8, DY, PW - 16, DH, { fill: "rgba(255,240,210,.95)", border: "#8a5a33", r: 6, bw: 1.2 });
    if (cd) {
      if (cd.k) u.drawImage(icon(cd.k), PX + 14, DY + 6, 20, 20); else { u.save(); u.translate(PX + 14, DY + 6); u.scale(2, 2); upGlyph(u, cd.id, 0, 0); u.restore(); }
      txt(cd.name, PX + 40, DY + 14, { size: 9, color: "#3a1a08", weight: 900 });
      wrap(cd.desc, PW - 150, 7.5).slice(0, 2).forEach((l, i) => txt(l, PX + 40, DY + 25 + i * 9, { size: 7.5, color: "#5a3a20", weight: 700 }));
      txt(cd.eff, PX + 14, DY + DH - 8, { size: 7.5, color: cd.eff === "Đã tối đa" ? "#5a7a9a" : "#2a7a3a", weight: 900 });
      txt(cd.price == null ? "TỐI ĐA" : `${cd.price}k`, PX + PW - 14, DY + 15, { size: 12, align: "right", color: cd.price == null ? "#5a7a9a" : cd.can ? "#b5462e" : "#9a6a6a", weight: 900 });
      const [ox, oy, cx] = this.btnXY();
      panel(ox, oy, 46, 15, { fill: cd.can ? "rgba(200,90,30,.95)" : "rgba(140,110,90,.8)", border: cd.can ? GOLD : "#6a5040", bw: 1.4, r: 5 });
      txt("OK", ox + 23, oy + 11, { size: 9, align: "center", color: "#fff", weight: 900 });
      panel(cx, oy, 46, 15, { fill: "rgba(90,60,40,.9)", border: "#3a2410", bw: 1.2, r: 5 });
      txt("Hủy", cx + 23, oy + 11, { size: 9, align: "center", color: "#ffe9c4", weight: 900 });
    }
    for (const p of this.pops) txt(p.text, p.x, p.y - (1 - p.life) * 14, { size: 10, align: "center", color: p.col, weight: 900, stroke: "#1a1220", sw: 2, alpha: Math.min(1, p.life * 2) });
    if (this.msg) txt(this.msg.text, PX + PW / 2, PY + PH - 8, { size: 8, align: "center", color: this.msg.col, weight: 900, stroke: "#1a1220", sw: 2 });
    u.restore();
    txt("←→↑↓ chọn · Enter/E: OK · Tab: đổi mục · Esc: Hủy/đóng · chuột: bấm thẻ, OK, Hủy", W / 2, H - 3, { size: 7, align: "center", color: "rgba(255,255,255,.7)", weight: 700, stroke: "rgba(10,8,20,.6)", sw: 2 });
    drawActionCut();
  }
  drawCard(u, cd, i) {
    const [x, y] = this.cardXY(i), sel = i === this.sel;
    panel(x, y, CW, CH, { fill: sel ? "rgba(255,214,140,.98)" : "rgba(244,226,190,.92)", border: sel ? GOLD : "#8a5a33", bw: sel ? 2 : 1, r: 5 });
    if (cd.k) u.drawImage(icon(cd.k), x + CW / 2 - 8, y + 5, 16, 16); else upGlyph(u, cd.id, x + CW / 2 - 5, y + 8);
    // badge (top-left)
    const bw = Math.ceil(measure(cd.badge, 6.5, 900)) + 6;
    panel(x + 2, y + 2, bw, 8, { fill: "rgba(42,24,14,.85)", border: cd.badgeCol, bw: 0.8, r: 3 });
    txt(cd.badge, x + 5, y + 8, { size: 6.5, color: cd.badgeCol, weight: 900 });
    const nm = cd.name.length > 14 ? cd.name.slice(0, 13) + "…" : cd.name;
    txt(nm, x + CW / 2, y + 29, { size: 7, align: "center", color: "#3a1a08", weight: 900 });
    txt(cd.price == null ? "TỐI ĐA" : `${cd.price}k`, x + CW / 2, y + 39, { size: 8, align: "center", color: cd.price == null ? "#5a7a9a" : cd.can ? "#b5462e" : "#a08080", weight: 900 });
    if (cd.max) for (let k = 0; k < cd.max; k++) R(u, x + CW - 4 - (cd.max - k) * 4, y + 3, 3, 3, k < cd.lv ? "#3fa04a" : "rgba(90,60,40,.35)"); // owned level pips
    if (cd.note) txt(cd.note, x + CW - 3, y + 44, { size: 6, align: "right", color: "#6a4a2a", weight: 800 });
    if (!cd.can && cd.type === "sell") { u.save(); u.fillStyle = "rgba(60,40,30,.25)"; u.fillRect(x, y, CW, CH); u.restore(); }
  }
  // Chú Sáu stands at the left of the panel (side-view chibi, straw hat, market shirt) with a speech bubble
  drawSeller(u) {
    const t = this.t, x = 62, y = 214, bob = Math.round(Math.sin(t * 2) * 0.6);
    u.save(); u.translate(x, y + bob); u.scale(3, 3);
    personSide(u, 0, 0, { face: 1, shirt: "#3f9a4a", pants: "#3a3a44", hat: true, arm: Math.sin(t * 1.3) > 0.6 ? "wave" : "talk", t });
    u.restore();
    const lines = wrap(this.line, 86, 7), shownN = Math.floor(this.shown);
    const bh = lines.length * 9 + 16, by = y - 96 - bh;
    panel(8, by, 98, bh, { fill: "rgba(255,248,232,.97)", border: "#3f9a4a", r: 6, bw: 1.2 });
    R(u, 56, by + bh, 6, 3, "rgba(255,248,232,.97)");
    try { u.drawImage(portrait("sau"), 12, by + 3, 10, 10); } catch (e) {}
    txt("CHÚ SÁU", 25, by + 11, { size: 7, color: "#2a6b38", weight: 900 });
    let left = shownN;
    lines.forEach((l, i) => { const part = l.slice(0, Math.max(0, left)); left -= l.length + 1; txt(part, 12, by + 22 + i * 9, { size: 7, color: "#2a1a12", weight: 800 }); });
  }
}
