// SHOP scene — the campaign's between-activity screens ("Sáng tạo của nhóm", GUI only, not part of Test Contract v1.0).
// One class, three modes (opts.mode):
//   "morning" — Chuẩn bị lặn:      tabs Đồ lặn (gear upgrades) · Sổ tay cá;   action "Xuống nước ▶" → onDone()
//   "evening" — Chuẩn bị mở quán:  tabs Thực đơn (stock + dish toggles) · Nâng cấp quán; "Mở quán ▶" → onDone({ menu })
//   "results" — Kết sổ (after the quán; main.js already called finishDay): tabs Kết sổ · Sổ tay cá; "Ngày N ▶" → onDone()
// Reads/writes only through progress.js. N (or the last list item / Enter on Kết sổ) triggers the action.
import { W, H, screen, input, fx, clamp, ease, txt, panel, measure, wrap } from "./engine.js";
import { sfx, music } from "./audio.js";
import { fish, icon, dishIcon, DISH_NAME, KIND_NAME } from "./art.js";
import { riverWorld } from "./story.js";
import * as progress from "./progress.js";
import { OXY_MUL } from "./gui_tuning.js";
import { menuAll, menuKnown } from "./menu.js"; // menuKnown = contract dishes + Đặc sản Bà Tư has researched
import * as Deep from "./deep.js"; // namespace import: tolerant of the deep agent renaming helpers

const GOLD = "#ffd23f", BORDER = "#f3d27a", INK = "#3a1410";
const MODES = {
  morning: { tabs: [["Đồ lặn", "upgrades"], ["Sổ tay cá", "catalog"]], ups: progress.GEAR_UPGRADES || ["oxy", "cap", "fins", "net"], tod: "dawn", action: "Xuống nước ▶" },
  evening: { tabs: [["Thực đơn", "menu"], ["Nâng cấp quán", "upgrades"]], ups: progress.QUAN_UPGRADES || ["stove", "decor", "table2"], tod: "dusk", action: "Mở quán ▶" },
  results: { tabs: [["Kết sổ", "results"], ["Sổ tay cá", "catalog"]], ups: [], tod: "night", action: null },
};
const KINDS = ["ca_linh", "ca_loc", "bong_dien_dien", "bong_sung"];

// species shown in the catalog, in discovery order (shallow → deep → hazards)
const SPECIES = [
  { id: "ca_linh", name: "Cá linh", where: "Gần mặt nước", draw: "ca_linh" },
  { id: "ca_loc", name: "Cá lóc", where: "Tầng nước giữa", draw: "ca_loc" },
  { id: "ca_loc_bong", name: "Cá lóc bông", where: "Vùng sâu (> 30 m)", deep: true },
  { id: "dan_ca_linh_lon", name: "Đàn cá linh lớn", where: "Vùng sâu (> 30 m)", deep: true },
  { id: "ca_loc_khong_lo", name: "Cá lóc khổng lồ", where: "Đáy sông tối", deep: true },
  { id: "ran_nuoc", name: "Rắn nước", where: "Cẩn thận: hay cắn!", danger: true, draw: "snake" },
];

// 8x8 pixel glyphs for the upgrade rows (drawn at 2x on the UI layer)
const GPAL = { y: GOLD, Y: "#fff3a0", o: "#ff8a3d", r: "#d94a3d", b: "#6b3d22", w: "#c99a5a", W: "#8a5a2a", g: "#1aa6a0", G: "#7ee8e0", k: "#dfe8f5", c: "#3fb6c4", C: "#bff3ff", s: "#8a9bb0" };
const GLYPH = {
  oxy: ["...ss...", "..ssss..", "..cccc..", ".cCccc..", ".cCccc..", ".cCccc..", ".cccccc.", "..cccc.."],
  cap: ["........", ".W....W.", "..W..W..", "wwwwwwww", "wWwWwWww", ".wWwWwW.", ".wwwwww.", "..wwww.."],
  fins: ["...gg...", "...gg...", "...gg...", "..gggg..", ".gGgGgg.", "gGgGgGgg", "gggggggg", "........"],
  net: [".kkkkk..", "k.k.k.k.", "kk.k.kk.", "k.k.k.k.", ".kkkkk..", "....bb..", ".....bb.", "......bb"],
  decor: ["...k....", "..rrr...", ".rorrr..", ".rorrr..", ".rorrr..", "..rrr...", "...y....", "...y...."],
  table2: ["........", "wwwwwwww", "WWWWWWWW", ".W....W.", ".W....W.", ".W....W.", ".W....W.", "........"],
  stove: ["...r....", "..ro....", "..roo.r.", ".rooyor.", ".roYyor.", "..oyyo..", "bbbbbbbb", ".b....b."],
};

export class ShopScene {
  // summary (results mode): { day, haulCount, earned, rep, served, left, score, prevBest, newBest }
  // opts: { mode: "morning" | "evening" | "results", stock: { kind: count } (evening) }
  constructor(contract, summary, onDone, opts = {}) {
    this.contract = contract; this.sum = summary || {}; this.onDone = onDone;
    this.mode = MODES[opts.mode] ? opts.mode : "results"; this.cfg = MODES[this.mode];
    this.tabs = this.cfg.tabs; this.ups = this.cfg.ups.filter((id) => progress.UPGRADES[id]);
    this.stock = opts.stock || {};
    this.dishes = Object.keys(menuKnown(contract)); // only dishes Bà Tư knows can go on the menu
    const cookable = this.dishes.filter((d) => this.portions(d) > 0);
    this.on = new Set(cookable.length ? cookable : this.dishes); // default: everything the basket can make
    this.t = 0; this.tab = 0; this.tabT = 0; this.tabDir = 1; this.sel = 0; this.msel = 0; this.leaving = false;
    this.pops = []; this.wob = { i: -1, t: 0 }; this.toast = null; this.wantNext = false;
    this._onKey = (e) => { if (e.key && e.key.toLowerCase() === "n" && !e.repeat) this.wantNext = true; };
    addEventListener("keydown", this._onKey);
    Deep.preloadDeep?.();
    music("theme");
    if (this.mode === "results") sfx(this.sum.newBest ? "fanfare" : "ding"); else sfx("whoosh");
  }
  portions(id) {
    const r = menuAll(this.contract)[id]?.recipe || {}; let n = Infinity;
    for (const k in r) n = Math.min(n, Math.floor((this.stock[k] || 0) / r[k]));
    return n === Infinity ? 0 : n;
  }
  actionLabel() { return this.cfg.action || `Ngày ${progress.save.day} ▶`; }
  title() {
    const d = progress.save.day;
    return this.mode === "morning" ? `Ngày ${d} · Chuẩn bị lặn` : this.mode === "evening" ? `Ngày ${d} · Chuẩn bị mở quán` : `Ngày ${this.sum.day ?? d - 1} khép lại`;
  }

  // ---------- actions ----------
  setTab(i) {
    const n = (i + this.tabs.length) % this.tabs.length; if (n === this.tab) return;
    this.tabDir = n > this.tab ? 1 : -1; this.tab = n; this.tabT = 0; sfx("select");
  }
  tryBuy(id) {
    const up = progress.UPGRADES[id], cost = progress.upgradeCost(id);
    if (cost == null) { sfx("click"); this.say("Đã nâng tối đa rồi!", "#7ee87e"); this.wob = { i: this.sel, t: 0.3 }; return false; }
    if (!progress.buy(id)) { sfx("hurt"); this.say(`Còn thiếu ${cost - progress.save.money}k nữa`, "#ff8a7a"); this.wob = { i: this.sel, t: 0.35 }; return false; }
    sfx("coin"); fx.flash("rgba(255,210,63,.35)", 0.12);
    this.pops.push({ text: `-${cost}k`, x: 440, y: 64 + this.sel * 27, t: 0 });
    this.say(`${up.name} lên cấp ${progress.save.up[id]}!`, GOLD);
    return true;
  }
  toggle(id) {
    if (this.on.has(id)) {
      if (this.on.size <= 1) { sfx("hurt"); this.say("Phải giữ ít nhất 1 món trong thực đơn!", "#ff8a7a"); this.wob = { i: this.msel, t: 0.35 }; return; }
      this.on.delete(id); sfx("click");
    } else { this.on.add(id); sfx("select"); if (!this.portions(id)) this.say("Thiếu nguyên liệu — món này khó bán tối nay", "#ffb070"); }
  }
  say(text, col) { this.toast = { text, col, t: 0 }; }
  next() {
    if (this.leaving) return; this.leaving = true;
    removeEventListener("keydown", this._onKey);
    sfx("select"); sfx("whoosh");
    this.onDone?.(this.mode === "evening" ? { menu: this.dishes.filter((d) => this.on.has(d)) } : undefined);
  }

  update(dt) {
    this.t += dt; this.tabT += dt;
    if (this.wob.t > 0) this.wob.t -= dt;
    for (const p of this.pops) p.t += dt; this.pops = this.pops.filter((p) => p.t < 1.2);
    if (this.toast) { this.toast.t += dt; if (this.toast.t > 2) this.toast = null; }
    if (this.leaving) return;
    if (this.wantNext) { this.wantNext = false; return this.next(); }
    if (input.hit("left")) this.setTab(this.tab - 1);
    if (input.hit("right")) this.setTab(this.tab + 1);
    const tab = this.tabs[this.tab][1];
    if (tab === "results") {
      if (this.t > 0.8 && (input.hit("confirm") || input.hit("interact"))) return this.next();
    } else if (tab === "upgrades") {
      const n = this.ups.length + 1;
      if (input.hit("up")) { this.sel = (this.sel + n - 1) % n; sfx("click"); }
      if (input.hit("down")) { this.sel = (this.sel + 1) % n; sfx("click"); }
      if (input.hit("confirm") || input.hit("interact")) { if (this.sel === this.ups.length) return this.next(); this.tryBuy(this.ups[this.sel]); }
    } else if (tab === "menu") {
      const n = this.dishes.length + 1;
      if (input.hit("up")) { this.msel = (this.msel + n - 1) % n; sfx("click"); }
      if (input.hit("down")) { this.msel = (this.msel + 1) % n; sfx("click"); }
      if (input.hit("confirm") || input.hit("interact")) { if (this.msel === this.dishes.length) return this.next(); this.toggle(this.dishes[this.msel]); }
    }
    if (input.hit("back") && this.tab !== 0) this.setTab(0);
  }

  // ---------- drawing ----------
  draw() {
    const c = screen.px, t = this.t;
    const tod = this.cfg.tod;
    riverWorld(c, { t, cam: { x: 320 + Math.sin(t * 0.15) * 30, y: -225 }, v: tod === "dawn" ? { ba: true, sunUp: 0.8 } : { raft: true, lights: tod === "night" ? 8 : 3 } }, tod);
    const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "rgba(6,10,24,.35)"); g.addColorStop(1, "rgba(6,10,24,.8)");
    c.fillStyle = g; c.fillRect(0, 0, W, H);

    this.drawHeader();
    this.drawTabs();
    panel(16, 52, W - 32, 184, { fill: "rgba(10,16,34,.9)", border: BORDER, bw: 1.2, r: 6 });
    const u = screen.ui, k = ease.out(clamp(this.tabT / 0.22, 0, 1));
    u.save(); u.translate((1 - k) * 14 * this.tabDir, 0);
    const tab = this.tabs[this.tab][1];
    if (tab === "results") this.drawResults();
    else if (tab === "upgrades") this.drawUpgrades();
    else if (tab === "menu") this.drawMenu();
    else this.drawCatalog();
    u.restore();
    this.drawFooter();

    for (const p of this.pops) txt(p.text, p.x, p.y - p.t * 22, { size: 11, align: "right", color: GOLD, weight: 900, stroke: INK, sw: 3, alpha: clamp(1.2 - p.t, 0, 1) });
    if (this.toast) {
      const a = clamp(this.toast.t * 6, 0, 1) * clamp((2 - this.toast.t) * 3, 0, 1), tw = measure(this.toast.text, 9, 900) + 24;
      panel(W / 2 - tw / 2, 220, tw, 16, { fill: "rgba(14,12,28,.95)", border: this.toast.col, r: 8, alpha: a });
      txt(this.toast.text, W / 2, 231, { size: 9, align: "center", color: this.toast.col, weight: 900, alpha: a });
    }
  }

  drawHeader() {
    const s = progress.save;
    panel(8, 6, W - 16, 22, { fill: "rgba(14,12,28,.9)", border: BORDER, r: 6 });
    txt(this.title(), 18, 21, { size: 11, color: GOLD, weight: 900, shadow: "rgba(0,0,0,.6)" });
    txt(this.mode === "morning" ? "Tiệm đồ lặn bến chợ" : this.mode === "evening" ? "Bếp sau quán Bà Tư" : "Sổ sách cuối ngày", W / 2 + 40, 20, { size: 8, align: "center", color: "rgba(255,255,255,.55)", weight: 700 });
    const money = `${s.money}k`, mw = measure(money, 11, 900);
    this.coin(W - 26 - mw, 17, 4.5);
    txt(money, W - 18, 21, { size: 11, align: "right", color: GOLD, weight: 900 });
  }
  coin(x, y, r) {
    const u = screen.ui; u.save();
    u.fillStyle = "#b8860b"; u.beginPath(); u.arc(x, y + 0.6, r, 0, Math.PI * 2); u.fill();
    u.fillStyle = GOLD; u.beginPath(); u.arc(x, y, r, 0, Math.PI * 2); u.fill();
    u.fillStyle = "#fff3a0"; u.fillRect(x - r * 0.45, y - r * 0.5, r * 0.35, r * 0.9);
    u.restore();
  }
  drawTabs() {
    const n = this.tabs.length, tw = n > 2 ? 110 : 124, gap = 6, x0 = (W - (tw * n + gap * (n - 1))) / 2, y = 32;
    this.tabs.forEach(([label], i) => {
      const x = x0 + i * (tw + gap), on = i === this.tab;
      panel(x, y, tw, 17, { fill: on ? GOLD : "rgba(14,12,28,.85)", border: on ? "#fff3a0" : "rgba(243,210,122,.45)", bw: on ? 1.5 : 1, r: 7 });
      txt(label, x + tw / 2, y + 12, { size: 9.5, align: "center", color: on ? INK : BORDER, weight: 900 });
    });
    const p = Math.sin(this.t * 5) * 1.5;
    txt("◀", x0 - 12 - p, y + 12, { size: 9, align: "center", color: GOLD, weight: 900 });
    txt("▶", W - x0 + 12 + p, y + 12, { size: 9, align: "center", color: GOLD, weight: 900 });
  }
  drawFooter() {
    const tab = this.tabs[this.tab][1];
    const hint = tab === "results" ? "◀ ▶ đổi trang · Enter/N sang ngày mới"
      : tab === "upgrades" ? "↑↓ chọn · Enter/E mua · ◀ ▶ đổi trang"
      : tab === "menu" ? "↑↓ chọn · Enter/E bật/tắt món · ◀ ▶ đổi trang"
      : "◀ ▶ đổi trang · Esc quay lại";
    txt(hint, 18, H - 12, { size: 8, color: "rgba(255,255,255,.7)", weight: 700 });
    const bw = 128, bx = W - bw - 14, by = H - 26, pulse = 0.5 + Math.sin(this.t * 4) * 0.5;
    panel(bx, by, bw, 19, { fill: `rgba(255,${150 + pulse * 40 | 0},60,.28)`, border: GOLD, bw: 1.5, r: 9 });
    panel(bx + 5, by + 4, 14, 11, { fill: GOLD, border: false, r: 2 });
    txt("N", bx + 12, by + 13, { size: 8, align: "center", color: INK, weight: 900 });
    txt(this.actionLabel(), bx + bw / 2 + 10, by + 13.5, { size: 10, align: "center", color: "#fff", weight: 900, shadow: "rgba(0,0,0,.6)" });
  }

  // ---------- tab: Kết sổ ----------
  drawResults() {
    const s = this.sum, sv = progress.save, k = clamp((this.t - 0.2) / 1.1, 0, 1);
    txt(`KẾT SỔ NGÀY ${s.day ?? sv.day - 1}`, 28, 72, { size: 13, color: GOLD, weight: 900, shadow: "rgba(0,0,0,.6)" });
    txt("Bà Tư ghi sổ, Út Sen đếm tiền", 28, 83, { size: 8, color: "rgba(255,255,255,.55)", weight: 700 });
    const rows = [
      ["Nguyên liệu mang về", `${s.haulCount ?? 0} món`, "#dff4ff"],
      ["Khách đã phục vụ", `${s.served ?? 0} khách`, "#7ee87e"],
      ["Khách bỏ về", `${s.left ?? 0} khách`, (s.left ?? 0) > 0 ? "#ff8a7a" : "#dff4ff"],
      ["Uy tín quán", null],
      ["Điểm hôm nay", `${Math.floor((s.score ?? 0) * k)}`, "#7ee87e"],
      ["Tiền hôm nay", `+${Math.floor((s.earned ?? 0) * k)}k`, GOLD],
    ];
    rows.forEach(([label, val, col], i) => {
      const y = 101 + i * 15;
      if (i % 2 === 0) panel(24, y - 10, 228, 14, { fill: "rgba(255,255,255,.035)", border: false, r: 3 });
      txt(label, 30, y, { size: 9, color: "#c9d6e8", weight: 700 });
      if (val != null) txt(val, 246, y, { size: 10, align: "right", color: col, weight: 900 });
      else this.stars(170, y - 4, s.rep ?? 0);
    });
    if (s.newBest && (s.score ?? 0) > 0) {
      const p = 1 + Math.sin(this.t * 6) * 0.06;
      txt("KỶ LỤC MỚI!", 152, 161, { size: 8 * p, align: "center", color: "#ff8a3d", weight: 900, rot: -0.08 });
    }
    // wallet
    const u = screen.ui; u.save(); u.fillStyle = "rgba(243,210,122,.35)"; u.fillRect(28, 191, 220, 1); u.restore();
    const wallet = Math.floor(sv.money - (s.earned ?? 0) * (1 - k));
    txt("Ví hiện có", 30, 211, { size: 10, color: "#fff", weight: 900 });
    this.coin(160, 207, 5);
    txt(`${wallet}k`, 246, 212, { size: 14, align: "right", color: GOLD, weight: 900, stroke: INK, sw: 3 });
    txt(`Kỷ lục: ${sv.best} điểm · Tổng thu: ${sv.totalEarned}k`, 30, 227, { size: 7.5, color: "rgba(255,255,255,.55)", weight: 700 });

    // earnings chart (last 7 days from history)
    const cx = 262, cy = 62, cw = 190, ch = 112;
    panel(cx, cy, cw, ch, { fill: "rgba(255,255,255,.04)", border: "rgba(243,210,122,.35)", r: 5 });
    txt("Thu nhập các ngày", cx + 10, cy + 14, { size: 8.5, color: BORDER, weight: 900 });
    const hist = sv.history.slice(-7), max = Math.max(1, ...hist.map((h) => h.earned || 0));
    const base = cy + ch - 16, area = 62, slot = (cw - 20) / Math.max(hist.length, 1), bw = Math.min(18, slot - 6);
    u.save(); u.fillStyle = "rgba(255,255,255,.15)"; u.fillRect(cx + 8, base, cw - 16, 1); u.restore();
    if (!hist.length) txt("Chưa có ngày nào", cx + cw / 2, cy + 60, { size: 8, align: "center", color: "rgba(255,255,255,.45)", weight: 700 });
    hist.forEach((h, i) => {
      const last = i === hist.length - 1, bh = Math.max(1, ((h.earned || 0) / max) * area * (last ? k : 1));
      const x = cx + 10 + i * slot + (slot - bw) / 2;
      const uu = screen.ui; uu.save(); uu.fillStyle = last ? GOLD : "#5fb6c8"; uu.fillRect(x, base - bh, bw, bh);
      uu.fillStyle = "rgba(255,255,255,.25)"; uu.fillRect(x, base - bh, bw, 1.5); uu.restore();
      txt(`${h.earned || 0}`, x + bw / 2, base - bh - 3, { size: 7, align: "center", color: last ? GOLD : "#cfe", weight: 800 });
      txt(`N${h.day}`, x + bw / 2, base + 10, { size: 7, align: "center", color: last ? "#fff" : "rgba(255,255,255,.55)", weight: 800 });
    });

    // tip box
    panel(cx, 182, cw, 46, { fill: "rgba(26,166,160,.12)", border: "rgba(126,232,224,.45)", r: 5 });
    txt("Mẹo của Bà Tư", cx + 10, 194, { size: 8, color: "#7ee8e0", weight: 900 });
    wrap(this.tip(), cw - 20, 8).slice(0, 2).forEach((ln, i) => txt(ln, cx + 10, 206 + i * 10, { size: 8, color: "#e8f6f5", weight: 700 }));
  }
  tip() {
    const s = this.sum, money = progress.save.money;
    const options = Object.keys(progress.UPGRADES).map((id) => [id, progress.upgradeCost(id)]).filter(([, c]) => c != null).sort((a, b) => a[1] - b[1]);
    if ((s.haulCount ?? 0) === 0) return "Giỏ trống thì bếp nguội. Mai canh hơi thở, về bến sớm nghen con!";
    if (options.length && money >= options[0][1]) return `Đủ tiền mua ${progress.UPGRADES[options[0][0]].name} rồi đó! ${(progress.QUAN_UPGRADES || []).includes(options[0][0]) ? "Chiều mai" : "Sáng mai"} ghé tiệm nhé.`;
    if ((s.left ?? 0) > 0) return "Có khách bỏ về. Nấu sẵn món dễ bán để khách khỏi chờ lâu.";
    if (options.length) return `Còn thiếu ${options[0][1] - money}k để mua ${progress.UPGRADES[options[0][0]].name}.`;
    return "Đồ nghề đã xịn nhất chợ. Giờ chỉ cần giữ uy tín quán thôi!";
  }
  stars(x, y, rep) {
    for (let i = 0; i < 5; i++) {
      const full = rep >= i + 0.75, half = !full && rep >= i + 0.25;
      txt("★", x + i * 11, y + 4.5, { size: 10, align: "center", color: "rgba(255,255,255,.2)", weight: 900 });
      if (full || half) {
        const u = screen.ui; u.save(); u.beginPath(); u.rect(x + i * 11 - 6, y - 8, full ? 12 : 6, 16); u.clip();
        txt("★", x + i * 11, y + 4.5, { size: 10, align: "center", color: GOLD, weight: 900 }); u.restore();
      }
    }
    txt((rep || 0).toFixed(1), 246, y + 4, { size: 10, align: "right", color: "#fff", weight: 900 });
  }

  // ---------- tab: Nâng cấp ----------
  effect(id, lv) {
    const U = progress.UPGRADES[id], g = this.contract.tuning.gather, e = U.eff[lv];
    switch (id) {
      case "oxy": return `${(g.oxygen_max_s + e) * OXY_MUL}s`;
      case "cap": return `${g.hold_capacity + e} món`;
      case "fins": return `×${+e.toFixed(2)}`;
      case "net": return `${(g.catch_radius + e).toFixed(1)} m`;
      case "stove": return `×${+e.toFixed(2)} thời gian`;
      case "decor": return `×${+e.toFixed(2)} kiên nhẫn`;
      case "table2": return `${(this.contract.tuning.quan.tables?.length || 1) - 1 + e} bàn`;
      default: return String(e);
    }
  }
  drawUpgrades() {
    const money = progress.save.money, u = screen.ui;
    this.ups.forEach((id, i) => {
      const U = progress.UPGRADES[id], lv = progress.save.up[id] || 0, maxLv = U.cost.length - 1, cost = progress.upgradeCost(id);
      const maxed = cost == null, can = !maxed && money >= cost, sel = i === this.sel;
      const wob = this.wob.i === i && this.wob.t > 0 ? Math.sin(this.wob.t * 70) * 3 * (this.wob.t / 0.35) : 0;
      const x = 22 + wob, y = 57 + i * 27;
      panel(x, y, W - 44, 25, sel ? { fill: "rgba(255,210,63,.14)", border: GOLD, bw: 1.5, r: 5 } : { fill: "rgba(255,255,255,.03)", border: "rgba(243,210,122,.18)", r: 5 });
      if (sel) txt("▶", x + 7, y + 16, { size: 8, color: GOLD, weight: 900 });
      this.glyph(GLYPH[id], x + 16, y + 4.5, can || maxed ? 1 : 0.5);
      txt(U.name, x + 40, y + 11, { size: 10, color: can || maxed ? "#fff" : "rgba(255,255,255,.6)", weight: 900 });
      const eff = maxed ? `${U.desc} · ${this.effect(id, lv)} (đã tối đa)` : `${U.desc} · ${this.effect(id, lv)} → ${this.effect(id, lv + 1)}`;
      txt(eff, x + 40, y + 21, { size: 7.5, color: maxed ? "#9fd9a0" : "#b9c9dd", weight: 700 });
      // level pips
      for (let p = 0; p < maxLv; p++) {
        u.save(); u.fillStyle = p < lv ? GOLD : "rgba(255,255,255,.16)"; u.fillRect(x + 262 + p * 13, y + 6, 10, 5);
        if (p < lv) { u.fillStyle = "#fff3a0"; u.fillRect(x + 262 + p * 13, y + 6, 10, 1); }
        u.restore();
      }
      txt(`Cấp ${lv}/${maxLv}`, x + 262, y + 21, { size: 7, color: "rgba(255,255,255,.55)", weight: 800 });
      // cost
      const rx = x + W - 52;
      if (maxed) txt("TỐI ĐA", rx, y + 16, { size: 10, align: "right", color: "#7ee87e", weight: 900 });
      else {
        txt(`${cost}k`, rx, y + 13, { size: 11, align: "right", color: can ? GOLD : "#8a8f9c", weight: 900 });
        if (can) txt("Enter để mua", rx, y + 22, { size: 7, align: "right", color: sel ? "#fff" : "rgba(255,255,255,.45)", weight: 700 });
        else txt(`thiếu ${cost - money}k`, rx, y + 22, { size: 7, align: "right", color: "#ff8a7a", weight: 700 });
        this.coin(rx - measure(`${cost}k`, 11, 900) - 7, y + 9.5, 3.5);
      }
    });
    // last item: the screen's action (Xuống nước / Mở quán)
    this.actionRow(this.sel === this.ups.length, 57 + this.ups.length * 27 + 3);
  }
  actionRow(sel, y) {
    const p = sel ? 0.5 + Math.sin(this.t * 6) * 0.5 : 0;
    panel(22, y, W - 44, 22, sel ? { fill: `rgba(255,160,60,${0.25 + p * 0.15})`, border: GOLD, bw: 1.8, r: 11 } : { fill: "rgba(255,160,60,.08)", border: "rgba(255,210,63,.45)", r: 11 });
    if (sel) txt("▶", 34, y + 15, { size: 9, color: GOLD, weight: 900 });
    txt(this.actionLabel(), W / 2, y + 15, { size: 11, align: "center", color: sel ? "#fff" : BORDER, weight: 900, shadow: "rgba(0,0,0,.6)" });
  }
  // ---------- tab: Thực đơn (evening) ----------
  drawMenu() {
    const u = screen.ui, st = progress.stats(this.contract), menu = menuAll(this.contract);
    panel(22, 57, W - 44, 27, { fill: "rgba(255,255,255,.04)", border: "rgba(243,210,122,.3)", r: 5 });
    txt("Kho tối nay", 30, 74, { size: 9, color: BORDER, weight: 900 });
    const total = KINDS.reduce((a, k) => a + (this.stock[k] || 0), 0);
    if (!total) txt("Giỏ trống — tối nay quán khó có món để bán!", 96, 74, { size: 9, color: "#ff8a7a", weight: 800 });
    else KINDS.forEach((k, i) => {
      const x = 92 + i * 92, n = this.stock[k] || 0;
      u.save(); u.imageSmoothingEnabled = false; u.globalAlpha = n ? 1 : 0.35; u.drawImage(icon(k), x, 60, 20, 20); u.restore();
      txt(KIND_NAME[k] || k, x + 23, 68, { size: 7, color: "rgba(255,255,255,.65)", weight: 700 });
      txt(`×${n}`, x + 23, 79, { size: 10, color: n ? "#fff" : "rgba(255,255,255,.35)", weight: 900 });
    });
    const n = this.dishes.length, y0 = 89, rowH = Math.max(22, Math.min(32, Math.floor((236 - 34 - y0) / Math.max(1, n))));
    this.dishes.forEach((id, i) => {
      const m = menu[id], on = this.on.has(id), can = this.portions(id), sel = i === this.msel;
      const wob = this.wob.i === i && this.wob.t > 0 ? Math.sin(this.wob.t * 70) * 3 * (this.wob.t / 0.35) : 0;
      const x = 22 + wob, y = y0 + i * rowH, h = rowH - 3;
      panel(x, y, W - 44, h, sel ? { fill: "rgba(255,210,63,.14)", border: GOLD, bw: 1.5, r: 5 } : { fill: on ? "rgba(255,255,255,.05)" : "rgba(255,255,255,.015)", border: on ? "rgba(243,210,122,.3)" : "rgba(255,255,255,.1)", r: 5 });
      // checkbox
      const cy = y + h / 2;
      panel(x + 8, cy - 5.5, 11, 11, { fill: on ? GOLD : "rgba(0,0,0,.35)", border: on ? "#fff3a0" : "rgba(255,255,255,.45)", r: 2 });
      if (on) txt("✓", x + 13.5, cy + 3.5, { size: 9, align: "center", color: INK, weight: 900 });
      const img = dishIcon(id), isz = Math.min(24, h - 4);
      u.save(); u.imageSmoothingEnabled = false; u.globalAlpha = on ? 1 : 0.4; u.drawImage(img, x + 25, cy - isz / 2, isz, isz); u.restore();
      txt(DISH_NAME[id] || id, x + 54, cy - 2, { size: 10, color: on ? "#fff" : "rgba(255,255,255,.45)", weight: 900 });
      const recipe = Object.entries(m.recipe).map(([k, q]) => `${q} ${KIND_NAME[k] || k}`).join(" + ");
      txt(`Cần: ${recipe} · nấu ${+(m.cook_s * st.cookMul).toFixed(1)}s`, x + 54, cy + 9, { size: 7.5, color: on ? "#b9c9dd" : "rgba(185,201,221,.45)", weight: 700 });
      const rx = x + W - 52;
      txt(`${m.price}k`, rx, cy + 1, { size: 11, align: "right", color: on ? GOLD : "#8a8f9c", weight: 900 });
      txt(!on ? "Không bán tối nay" : can ? `Nấu được ${can} phần` : "Thiếu nguyên liệu", rx, cy + 10, { size: 7, align: "right", color: !on ? "rgba(255,255,255,.4)" : can ? "#7ee87e" : "#ff8a7a", weight: 800 });
    });
    this.actionRow(this.msel === n, y0 + n * rowH + 2);
    const ay = y0 + n * rowH + 2 + 22;
    if (ay + 10 < 236) txt(`Quán tối nay: ${st.tables} bàn · khách kiên nhẫn ×${+st.patienceMul.toFixed(2)} · bếp ×${+st.cookMul.toFixed(2)} thời gian`, W / 2, ay + 10, { size: 7.5, align: "center", color: "rgba(255,255,255,.55)", weight: 700 });
  }
  glyph(rows, x, y, alpha = 1) {
    if (!rows) return;
    const u = screen.ui; u.save(); u.globalAlpha = alpha;
    rows.forEach((row, j) => { for (let i = 0; i < row.length; i++) { const col = GPAL[row[i]]; if (col) { u.fillStyle = col; u.fillRect(x + i * 2, y + j * 2, 2, 2); } } });
    u.restore();
  }

  // ---------- tab: Sổ tay cá ----------
  catalogList() {
    const cat = progress.save.catalog || {}, list = SPECIES.map((s) => ({ ...s }));
    const deep = Deep.DEEP?.species || [];
    for (const s of list) { const d = deep.find((x) => x.id === s.id); if (d) { s.sp = d; s.name = d.name || s.name; } }
    for (const id of Object.keys(cat)) if (!list.some((s) => s.id === id)) list.push({ id, name: cat[id].name || id, where: "" });
    return list.map((s) => ({ ...s, entry: cat[s.id] || null }));
  }
  drawCatalog() {
    const list = this.catalogList(), found = list.filter((s) => s.entry).length;
    txt("SỔ TAY CÁ", 28, 70, { size: 12, color: GOLD, weight: 900, shadow: "rgba(0,0,0,.6)" });
    txt(`Đã khám phá ${found}/${list.length}`, W - 28, 70, { size: 9, align: "right", color: found === list.length ? "#7ee87e" : "#dff4ff", weight: 900 });
    const shown = list.slice(0, 6), more = list.length - shown.length;
    shown.forEach((s, i) => {
      const col = i % 2, row = Math.floor(i / 2), x = 28 + col * 214, y = 78 + row * 50, known = !!s.entry;
      panel(x, y, 210, 46, { fill: known ? "rgba(255,255,255,.05)" : "rgba(255,255,255,.02)", border: known ? (s.danger ? "rgba(255,110,90,.6)" : "rgba(243,210,122,.45)") : "rgba(255,255,255,.12)", r: 5 });
      this.thumb(s, x + 5, y + 5, 52, 36, known);
      if (known) {
        txt(s.entry.name || s.name, x + 64, y + 15, { size: 9.5, color: "#fff", weight: 900 });
        txt(`Đã bắt: ${s.entry.caught} lần`, x + 64, y + 27, { size: 7.5, color: "#b9c9dd", weight: 700 });
        txt(s.danger ? `Chạm trán lần đầu: Ngày ${s.entry.firstDay}` : `Gặp lần đầu: Ngày ${s.entry.firstDay}`, x + 64, y + 38, { size: 7.5, color: "#b9c9dd", weight: 700 });
      } else {
        txt("???", x + 64, y + 16, { size: 10, color: "rgba(255,255,255,.4)", weight: 900 });
        txt(s.where ? `Gợi ý: ${s.where}` : "Chưa gặp", x + 64, y + 30, { size: 7.5, color: "rgba(255,255,255,.4)", weight: 700 });
      }
      const tag = s.danger ? ["NGUY HIỂM", "#ff6b5a"] : s.deep ? ["VÙNG SÂU", "#3fb6c4"] : null;
      if (tag) {
        const tw = measure(tag[0], 6.5, 900) + 8;
        panel(x + 204 - tw, y + 4, tw, 10, { fill: tag[1], border: false, r: 3, alpha: known ? 1 : 0.45 });
        txt(tag[0], x + 204 - tw / 2, y + 11.5, { size: 6.5, align: "center", color: "#0a0f1c", weight: 900 });
      }
    });
    if (more > 0) txt(`+${more} loài khác`, W - 28, 231, { size: 7, align: "right", color: "rgba(255,255,255,.5)", weight: 700 });
  }
  thumb(s, x, y, w, h, known) {
    const u = screen.ui;
    panel(x, y, w, h, { fill: known ? (s.danger ? "rgba(70,40,30,.75)" : s.deep ? "rgba(10,40,70,.85)" : "rgba(25,95,128,.75)") : "#0a0f1c", border: false, r: 3 });
    if (!known) { txt("?", x + w / 2, y + h / 2 + 6, { size: 16, align: "center", color: "rgba(255,255,255,.25)", weight: 900 }); return; }
    const cx = x + w / 2, cy = y + h / 2, t = this.t;
    u.save(); u.beginPath(); u.rect(x, y, w, h); u.clip(); u.imageSmoothingEnabled = false;
    try {
      if (s.draw === "snake") this.snake(u, cx, cy, t);
      else if (s.sp && Deep.drawDeepFish) {
        const sc = Math.min(1, (w - 6) / (s.sp.fw * s.sp.scale), (h - 6) / (s.sp.fh * s.sp.scale)) * (s.sp.school ? 0.75 : 1);
        u.translate(cx, cy); u.scale(sc, sc);
        Deep.drawDeepFish(u, { sp: s.sp, face: 1 }, 0, 0, t);
      } else fish(u, s.draw || s.sp?.kind || "ca_linh", cx, cy, 1, t, 1);
    } catch (e) { fish(u, "ca_linh", cx, cy, 1, t, 1); }
    u.restore();
  }
  snake(u, cx, cy, t) {
    for (let i = 0; i < 20; i++) {
      const x = cx - 20 + i * 2, y = cy + Math.sin(i * 0.55 - t * 5) * 3.5;
      u.fillStyle = i % 4 < 2 ? "#4f7a2a" : "#3a5a1e"; u.fillRect(x, y - 1.5, 2.2, 3);
      u.fillStyle = "#c9b45a"; u.fillRect(x, y + 1, 2.2, 0.8);
    }
    const hy = cy + Math.sin(20 * 0.55 - t * 5) * 3.5;
    u.fillStyle = "#4f7a2a"; u.fillRect(cx + 19, hy - 2.5, 5, 4.5);
    u.fillStyle = "#ff4040"; u.fillRect(cx + 22, hy - 1.5, 1, 1);
    if (Math.sin(t * 8) > 0) { u.fillStyle = "#d94a3d"; u.fillRect(cx + 24, hy, 3, 0.8); }
  }
}
