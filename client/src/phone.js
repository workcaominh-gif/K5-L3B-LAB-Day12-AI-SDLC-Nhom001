// Út Sen's pixel smartphone (meta.openPhone) + the menu pages it shares with Bà Tư's dialogue (batu.js).
// Overlay contract: { update(dt), draw(), done }. All text on the crisp UI layer, size ≥ 7.
import { W, H, screen, input, clamp, ease, txt, panel, measure, wrap } from "./engine.js";
import { sfx } from "./audio.js";
import { icon, dishIcon, ICONS, DISH_NAME, KIND_NAME } from "./art.js";
import * as progress from "./progress.js";
import * as meta from "./meta.js";
import { GUI_MENU_EXTRA, PREMIUM_HINT, isKnownDish, lockedDishes, learnDish, researchCost } from "./menu.js"; // Đặc sản recipes (Sổ tay) + research
import { playAction, pumpActionCut, drawActionCut, cutsEnabled, toggleCuts, resetSeen, drawRaftThumb } from "./action_cut.js";

export const GOLD = "#ffd23f", BORDER = "#f3d27a", WOOD = "rgba(40,22,12,.96)", WOODL = "#7a4a2a";
const DIM = "rgba(255,255,255,.62)";

// ---------- text helpers ----------
export function ellip(str, maxW, size = 8, weight = 800) {
  str = String(str); if (measure(str, size, weight) <= maxW) return str;
  while (str.length > 1 && measure(str + "…", size, weight) > maxW) str = str.slice(0, -1);
  return str + "…";
}
const money = () => `${progress.save.money | 0}k`;
const rewardText = (c) => `Thưởng ${c.money || 0}k${c.rep ? ` · +${c.rep} uy tín` : ""}`;

// ---------- Nav: a stack of pages rebuilt every frame from live state ----------
// page = { title, items:[{ label, sub?, right?, rightCol?, icon?, bar?:[p,g], dim?, act?(nav) }], info?, empty?, text? }
export class Nav {
  constructor(root, onNote) { this.stack = [{ build: root, sel: 0, top: 0 }]; this.onNote = onNote; this.msg = null; this.msgT = 0; }
  get cur() { return this.stack[this.stack.length - 1]; }
  page() { const c = this.cur; if (c.custom) return { title: c.custom.title, items: [], custom: c.custom }; return c.build(this) || { title: "", items: [] }; }
  // custom = a page object with its own update(dt) → "back" | void, draw(x, y, w, h, mode), enter(), leave()
  push(build, sel = 0, custom = null) { this.stack.push({ build, sel, top: 0, custom }); custom?.enter?.(this); sfx("click"); }
  pop() { if (this.stack.length <= 1) return false; const e = this.stack.pop(); e.custom?.leave?.(); sfx("click"); return true; }
  get custom() { return this.cur.custom || null; }
  // host closing: let every custom page clean up (e.g. the décor preview restores the real décor)
  dispose() { for (const e of this.stack) e.custom?.leave?.(); }
  note(text, bad = false) { this.msg = text; this.msgBad = bad; this.msgT = 2.6; sfx(bad ? "hurt" : "select"); this.onNote?.(text, bad); }
  // returns "close" when Esc is pressed on the root page
  update(dt) {
    if (this.msgT > 0) this.msgT -= dt;
    if (this.cur.custom) { if (this.cur.custom.update(dt, this) === "back") this.pop(); return; }
    const pg = this.page(), n = pg.items.length, c = this.cur;
    if (n) c.sel = clamp(c.sel, 0, n - 1);
    if (input.hit("back") || input.hit("close")) { if (!this.pop()) return "close"; return; }
    if (!n) { if (input.hit("confirm") || input.hit("interact")) { if (!this.pop()) return "close"; } return; }
    if (input.hit("up")) { c.sel = (c.sel + n - 1) % n; sfx("click"); }
    if (input.hit("down")) { c.sel = (c.sel + 1) % n; sfx("click"); }
    if (input.hit("confirm") || input.hit("interact") || input.hit("catch")) {
      const it = pg.items[c.sel];
      if (it?.act) { const r = it.act(this); if (r === "close") return "close"; }
      else if (it) sfx("click");
    }
  }
}

// draws the current page of nav inside the box (x,y,w,h); returns the selected item
export function drawPage(nav, x, y, w, h, o = {}) {
  const u = screen.ui, pg = nav.page(), c = nav.cur, items = pg.items;
  if (pg.custom) { pg.custom.draw(x, y, w, h, o.mode || "phone"); return null; }
  const ts = o.size || 8;
  let top = y;
  if (pg.title && !o.noTitle) { txt(pg.title, x + 4, y + 9, { size: ts + 1, color: GOLD, weight: 900 }); top += 14; }
  const infoH = pg.info ? 12 : 0;
  if (pg.text) {
    const lines = wrap(pg.text, w - 10, ts);
    lines.slice(0, Math.floor((y + h - top) / (ts + 3))).forEach((l, i) => txt(l, x + 5, top + ts + i * (ts + 3), { size: ts, color: "#f6efe0", weight: 700 }));
    return null;
  }
  if (!items.length) { wrap(pg.empty || "Chưa có gì.", w - 12, ts).forEach((l, i) => txt(l, x + w / 2, top + 16 + i * (ts + 3), { size: ts, align: "center", color: DIM, weight: 700 })); }
  const tall = items.some((it) => it.sub || it.bar);
  const rowH = tall ? ts * 2 + 7 : ts + 7, availH = y + h - top - infoH;
  const vis = Math.max(1, Math.floor(availH / rowH));
  c.top = clamp(c.top, Math.max(0, c.sel - vis + 1), c.sel); c.top = clamp(c.top, 0, Math.max(0, items.length - vis));
  u.save(); u.beginPath(); u.rect(x, top - 1, w, availH + 1); u.clip();
  for (let i = c.top; i < Math.min(items.length, c.top + vis); i++) {
    const it = items[i], ry = top + (i - c.top) * rowH, on = i === c.sel;
    if (on) panel(x + 1, ry, w - 2, rowH - 2, { fill: "rgba(255,160,60,.24)", border: GOLD, r: 4 });
    let lx = x + 5;
    if (on) txt("▶", x + 4, ry + ts + 1, { size: ts - 1, color: GOLD, weight: 900 });
    lx += 8;
    if (it.icon) { u.imageSmoothingEnabled = false; try { u.drawImage(it.icon, lx, ry + 2, ts + 2, ts + 2); } catch (e) {} lx += ts + 5; }
    const rw = it.right ? measure(it.right, ts - 0.5, 900) + 6 : 0;
    txt(ellip(it.label, x + w - lx - rw - 4, ts), lx, ry + ts + 1, { size: ts, color: it.dim ? DIM : on ? "#fff" : "#f6efe0", weight: 800 });
    if (it.right) txt(it.right, x + w - 5, ry + ts + 1, { size: ts - 0.5, align: "right", color: it.rightCol || GOLD, weight: 900 });
    if (it.sub) txt(ellip(it.sub, x + w - lx - (it.bar ? 48 : 6), ts - 1, 700), lx, ry + ts * 2 + 3, { size: ts - 1, color: DIM, weight: 700 });
    if (it.bar) {
      const [p, g] = it.bar, bw = 38, bx = x + w - bw - 6, by = ry + ts + 6;
      panel(bx, by, bw, 4, { fill: "rgba(0,0,0,.5)", border: false, r: 2 });
      if (p > 0) panel(bx, by, Math.max(3, bw * Math.min(1, p / g)), 4, { fill: p >= g ? "#7be08a" : GOLD, border: false, r: 2 });
    }
  }
  u.restore();
  if (items.length > vis) {
    if (c.top > 0) txt("▲", x + w - 4, top + 4, { size: 7, align: "right", color: GOLD });
    if (c.top + vis < items.length) txt("▼", x + w - 4, y + h - infoH - 1, { size: 7, align: "right", color: GOLD });
  }
  if (pg.info) txt(ellip(typeof pg.info === "function" ? pg.info(items[c.sel]) : pg.info, w - 8, ts - 1, 700), x + 4, y + h - 2, { size: ts - 1, color: "#bff3ff", weight: 700 });
  return items[c.sel] || null;
}

// ---------- shared page builders (phone apps + Bà Tư's menu) ----------
export function decorRoot(nav) {
  const d = meta.realDecor();
  return { title: "Trang trí quán", info: `Khách kiên nhẫn hơn +${Math.round((meta.decorBonus() - 1) * 100)}% · Ví ${money()}`,
    items: meta.DECOR_SLOTS.map((sl) => ({ label: meta.DECOR[sl].label, sub: `Đang dùng: ${meta.decorItem(sl, d[sl]).name}`, right: "Xem thử ▶", rightCol: "#bff3ff",
      act: (n) => n.push(null, 0, new DecorBrowser(sl)) })) };
}
// "Trang trí quán" item browser with LIVE PREVIEW: moving the selection shows the item on the raft (meta.previewDecor);
// Enter = "Mua & áp dụng" / "Áp dụng" (owned), Esc = "Hủy" (restores the real décor). Leaving the page always reverts.
// draw modes: "strip" (Bà Tư's dialog over the live raft: compact, semi-transparent, docked) · "phone" (thumbnail + list)
export class DecorBrowser {
  constructor(slot) {
    this.slot = slot; this.items = meta.DECOR[slot].items; this.title = meta.DECOR[slot].label; this.t = 0;
    this.sel = Math.max(0, this.items.findIndex((it) => it.id === meta.realDecor()[slot]));
    this.msg = null; this.msgT = 0;
  }
  enter(nav) { this.nav = nav; this.preview(); }
  leave() { meta.clearPreview(); }
  preview() { meta.previewDecor(this.slot, this.items[this.sel].id); }
  get item() { return this.items[this.sel]; }
  state(it = this.item) { const using = meta.realDecor()[this.slot] === it.id, owned = meta.ownsDecor(this.slot, it.id); return { using, owned }; }
  note(text, bad = false) { this.msg = text; this.msgBad = bad; this.msgT = 2.6; sfx(bad ? "hurt" : "select"); this.nav?.onNote?.(text, bad); }
  move(d) { const n = this.items.length; this.sel = (this.sel + d + n) % n; sfx("click"); this.preview(); }
  update(dt) {
    this.t += dt; if (this.msgT > 0) this.msgT -= dt;
    if (input.hit("back") || input.hit("close")) { this.note("Thôi, để y như cũ."); return "back"; } // Hủy: pop() → leave() reverts
    if (input.hit("left") || input.hit("up")) this.move(-1);
    if (input.hit("right") || input.hit("down")) this.move(1);
    if (input.hit("confirm") || input.hit("interact") || input.hit("catch")) this.act();
  }
  act() {
    const it = this.item, sl = this.slot, { using, owned } = this.state(), from = meta.realDecor()[sl];
    if (using) return this.note(`${it.name} đang dùng rồi nè.`);
    if (owned) { meta.applyDecor(sl, it.id); this.preview(); return this.note(`Đổi sang ${it.name.toLowerCase()} rồi đó!`); }
    if (meta.buyDecor(sl, it.id)) { sfx("coin"); this.preview(); playAction("decor", { slot: sl, from, to: it.id }); return this.note(`Mua ${it.name.toLowerCase()} (−${it.price}k). Quán đẹp hẳn ra!`); }
    this.note(`Chưa đủ tiền đâu con, cần ${it.price}k mà ví có ${money()}.`, true);
  }
  primaryLabel() { const { using, owned } = this.state(); return using ? "Đang dùng" : owned ? "Áp dụng" : `Mua & áp dụng`; }
  priceText(it = this.item) { const { using, owned } = this.state(it); return using ? "Đang dùng" : owned ? "Đã có" : it.price ? `${it.price}k` : "Miễn phí"; }
  badge(x, y) {
    const pulse = 0.75 + 0.25 * Math.sin(this.t * 5);
    panel(x, y, 46, 12, { fill: `rgba(181,70,46,${pulse})`, border: "#fff", r: 3, bw: 0.8 });
    txt("XEM THỬ", x + 23, y + 9, { size: 7.5, align: "center", color: "#fff", weight: 900 });
  }
  buttons(x, y, w) {
    const { using, owned } = this.state(), can = using || owned || progress.save.money >= this.item.price;
    const bw = w - 48;
    panel(x, y, bw, 16, { fill: using ? "rgba(60,110,60,.9)" : can ? "rgba(200,90,30,.95)" : "rgba(140,110,90,.8)", border: using ? "#7be08a" : can ? GOLD : "#6a5040", bw: 1.3, r: 5 });
    txt((using ? "✓ " : "Enter · ") + this.primaryLabel(), x + bw / 2, y + 11.5, { size: 8, align: "center", color: "#fff", weight: 900 });
    panel(x + bw + 4, y, 44, 16, { fill: "rgba(90,60,40,.9)", border: "#3a2410", bw: 1.2, r: 5 });
    txt("Esc · Hủy", x + bw + 26, y + 11.5, { size: 7.5, align: "center", color: "#ffe9c4", weight: 900 });
  }
  draw(x, y, w, h, mode = "phone") {
    const it = this.item;
    if (mode === "strip") {
      // compact horizontal strip: [badge · slot] [chips…] | [price · buttons] / desc
      panel(x, y, w, h, { fill: "rgba(28,14,10,.72)", border: BORDER, bw: 1.2, r: 6 });
      this.badge(x + 6, y + 5);
      txt(`${this.title} · ←→ xem thử`, x + 58, y + 14, { size: 8.5, color: GOLD, weight: 900 });
      txt(`Ví ${money()}`, x + w - 8, y + 14, { size: 8, align: "right", color: GOLD, weight: 900 });
      const rw = 150, cw = (w - rw - 16) / this.items.length;
      this.items.forEach((o, i) => {
        const cx = x + 6 + i * cw, on = i === this.sel, st = this.state(o);
        panel(cx, y + 20, cw - 4, 28, { fill: on ? "rgba(255,160,60,.35)" : "rgba(0,0,0,.35)", border: on ? GOLD : "rgba(243,210,122,.3)", bw: on ? 1.4 : 0.8, r: 4 });
        txt(ellip(o.name, cw - 10, 7.5), cx + 4, y + 31, { size: 7.5, color: on ? "#fff" : "#f6efe0", weight: 800 });
        txt(this.priceText(o), cx + 4, y + 43, { size: 7, color: st.using ? "#7be08a" : st.owned ? "#bff3ff" : GOLD, weight: 900 });
      });
      const rx = x + w - rw - 4;
      txt(it.name, rx, y + 30, { size: 8.5, color: "#fff", weight: 900 });
      txt(this.priceText(), x + w - 8, y + 30, { size: 9, align: "right", color: this.state().using ? "#7be08a" : GOLD, weight: 900 });
      this.buttons(rx, y + 34, rw - 4);
      const msg = this.msgT > 0 ? this.msg : it.desc;
      txt(ellip(msg, w - 14, 7.5, 700), x + 6, y + h - 6, { size: 7.5, color: this.msgT > 0 ? (this.msgBad ? "#ff9a8a" : "#7be08a") : "#bff3ff", weight: 700 });
      return;
    }
    // phone: live thumbnail, then a compact list, then the buttons
    const th = Math.round(w * 0.5);
    drawRaftThumb(screen.ui, x + 2, y + 2, w - 4, th, this.t);
    let yy = y + th + 8;
    txt(this.title, x + 4, yy + 4, { size: 8, color: GOLD, weight: 900 });
    yy += 8;
    const rowH = 12, maxRows = Math.max(1, Math.floor((y + h - 38 - yy) / rowH));
    const top = clamp(this.sel - maxRows + 1, 0, Math.max(0, this.items.length - maxRows));
    this.items.slice(top, top + maxRows).forEach((o, j) => {
      const i = top + j, on = i === this.sel, st = this.state(o), ry = yy + j * rowH;
      if (on) panel(x + 1, ry, w - 2, rowH - 1, { fill: "rgba(255,160,60,.24)", border: GOLD, r: 3 });
      txt((on ? "▶ " : "  ") + ellip(o.name, w - 60, 7), x + 4, ry + 8.5, { size: 7, color: on ? "#fff" : "#f6efe0", weight: 800 });
      txt(this.priceText(o), x + w - 4, ry + 8.5, { size: 7, align: "right", color: st.using ? "#7be08a" : st.owned ? "#bff3ff" : GOLD, weight: 900 });
    });
    this.buttons(x + 2, y + h - 34, w - 4);
    const msg = this.msgT > 0 ? this.msg : it.desc;
    txt(ellip(msg, w - 8, 6.5, 700), x + 4, y + h - 8, { size: 6.5, color: this.msgT > 0 ? (this.msgBad ? "#ff9a8a" : "#7be08a") : "#bff3ff", weight: 700 });
  }
}
export function staffRoot(nav) {
  const st = meta.getStaff();
  return { title: "Nhân viên", info: `Tiền công: ${meta.dailyWages()}k/ngày (trả đầu mỗi ngày) · Ví ${money()}`,
    items: meta.STAFF_IDS.map((id) => {
      const S = meta.STAFF[id], lv = st[id], L = S.levels[lv], nx = S.levels[1];
      return { label: S.name, right: lv ? "★".repeat(lv) : "Chưa thuê", rightCol: lv ? GOLD : DIM,
        sub: lv ? `Bậc ${lv} · công ${L.wage}k/ngày · ${L.desc}` : `Thuê ${nx.cost}k · công ${nx.wage}k/ngày · ${nx.desc}`,
        act: (n) => n.push(() => staffActions(id)) };
    }) };
}
function staffActions(id) {
  const S = meta.STAFF[id], lv = meta.getStaff()[id], items = [];
  if (lv === 0) { const L = S.levels[1]; items.push({ label: `Thuê ${S.short}`, sub: `${L.cost}k · công ${L.wage}k/ngày`, right: `${L.cost}k`, act: (n) => { if (meta.hire(id)) { sfx("coin"); n.pop(); playAction("hire", { id }); return n.note(`${S.short} vô làm từ tối nay! Công ${L.wage}k mỗi ngày.`); } n.note(`Thuê ${S.short} cần ${L.cost}k, ví còn ${money()}.`, true); } }); }
  if (lv === 1) { const L = S.levels[2]; items.push({ label: "Đào tạo lên bậc 2", sub: `${L.cost}k · công tăng lên ${L.wage}k/ngày · ${L.desc}`, right: `${L.cost}k`, act: (n) => { if (meta.train(id)) { sfx("coin"); n.pop(); playAction("train", { id }); return n.note(`${S.short} lên bậc 2 rồi, ${L.desc}!`); } n.note(`Đào tạo cần ${L.cost}k, ví còn ${money()}.`, true); } }); }
  if (lv > 0) items.push({ label: "Cho nghỉ việc", sub: "Không trả công nữa, mất bậc đã học", rightCol: "#ff8a7a", right: "!", act: (n) => n.push(() => ({ title: `Cho ${S.short} nghỉ?`, items: [
    { label: "Ừ, cho nghỉ", act: (m) => { meta.fire(id); m.pop(); m.pop(); m.note(`${S.short} đã nghỉ. Buồn ghê...`); } },
    { label: "Thôi, giữ lại", act: (m) => m.pop() }] }), 1) });
  items.push({ label: "Quay lại", act: (n) => n.pop() });
  return { title: S.name, items, info: lv ? `Đang bậc ${lv} · công ${S.levels[lv].wage}k/ngày` : "Chưa thuê" };
}
// canAccept: Bà Tư hands out new chores; the phone only tracks and claims
export function choresRoot(nav, canAccept) {
  const act = meta.getChores(), items = act.map((c) => ({ label: c.title, bar: [c.progress, c.goal], sub: rewardText(c),
    right: c.done ? "Lãnh thưởng" : `${c.progress}/${c.goal}`, rightCol: c.done ? "#7be08a" : GOLD,
    act: (n) => {
      if (!c.done) return n.note(c.line);
      const r = meta.claimReward(c.id); if (!r) return;
      sfx("coin"); playAction("chore", { title: c.title, money: r.money, rep: r.rep }); n.note(`Giỏi quá! Bà thưởng ${r.money}k${r.rep ? `, uy tín +${r.rep}` : ""}.`);
    } }));
  if (canAccept && act.length < meta.MAX_CHORES) items.push({ label: "Nhận việc mới…", sub: `Đang làm ${act.length}/${meta.MAX_CHORES} việc`, right: "+", act: (n) => n.push(choreOffers) });
  return { title: "Việc vặt", items, empty: canAccept ? "" : "Chưa có việc nào. Ghé Bà Tư ở quán để nhận việc nghen.",
    info: canAccept ? `Tối đa ${meta.MAX_CHORES} việc cùng lúc` : act.length < meta.MAX_CHORES ? "Gặp Bà Tư ở quán để nhận thêm việc" : "Đang làm đủ 3 việc" };
}
function choreOffers() {
  return { title: "Bà Tư nhờ...", info: (it) => it?.desc || "", items: meta.getChoreOffers().map((c) => ({ label: c.title, sub: rewardText(c), desc: c.line, right: `${c.money}k`,
    act: (n) => { if (meta.acceptChore(c.key)) { n.pop(); n.note(c.line); } else n.note("Con đang làm đủ ba việc rồi, làm xong đi đã.", true); } })) };
}
function catalogPage() {
  const cat = Object.entries(progress.save.catalog || {}).sort((a, b) => (a[1].firstDay || 0) - (b[1].firstDay || 0));
  const nAll = Object.keys(GUI_MENU_EXTRA).length, nKnown = nAll - lockedDishes().length;
  const rec = { label: "★ Công thức đặc sản", sub: `Đã học ${nKnown}/${nAll} món — nhờ Bà Tư nghiên cứu món mới`, right: "▶", rightCol: GOLD, act: (n) => n.push(premiumPage) };
  return { title: "Sổ tay", empty: "Chưa ghi con nào. Lặn xuống sông xem có gì nghen!", info: `Đã gặp ${cat.length} loài`,
    items: [rec, ...cat.map(([k, e]) => ({ label: e.name || KIND_NAME[k] || k, icon: ICONS[k] ? icon(k) : null, right: `×${e.caught || 0}`, sub: `Gặp lần đầu: Ngày ${e.firstDay ?? "?"}`,
      act: (n) => n.note(`${e.name || k}: đã bắt ${e.caught || 0} lần.`) }))] };
}
// Đặc sản recipes (menu.js GUI_MENU_EXTRA): learned ones show ingredients / cook time / price; locked ones say where to learn
const recipeText = (m) => Object.entries(m.recipe).map(([k, q]) => `${KIND_NAME[k] || k} ×${q}`).join(" + ");
function premiumPage() {
  const rec = recipeText;
  return { title: "Công thức đặc sản", info: (it) => it?.desc || PREMIUM_HINT,
    items: Object.entries(GUI_MENU_EXTRA).map(([id, m]) => {
      const name = DISH_NAME[id] || id;
      if (!isKnownDish(id)) return { label: name, dim: true, sub: `🔒 Chưa học · nghiên cứu ${researchCost(id)}k với Bà Tư`, desc: `Cần: ${rec(m)} · bán ${m.price}k`, right: "🔒", rightCol: "rgba(255,255,255,.55)",
        act: (n) => n.note(`${name} chưa học. Ghé Bà Tư → "Nghiên cứu món mới", tốn ${researchCost(id)}k.`) };
      return { label: name, sub: `Đã học · ${rec(m)} · ${m.cook_s} s`, desc: rec(m), right: "Đã học", rightCol: "#7be08a",
        act: (n) => n.note(`${name}: ${rec(m)}, nấu ${m.cook_s} giây, bán ${m.price}k (khách sộp ×1.5).`) };
    }) };
}
// Bà Tư → "Nghiên cứu món mới": locked Đặc sản (pay RESEARCH_COST → learned + research cut), then the learned ones
const RESEARCH_DONE = [
  "Rồi! {name} Bà nấu thử ngon lắm, con nhớ cách nêm nghen. Có {need} là nấu được liền.",
  "Đó, {name} vậy đó con. Lửa vừa vừa, nêm từ từ, khách ăn một lần là nhớ quán mình hoài.",
  "{name} xong rồi! Hồi xưa ông Tư mê món này lắm. Con bán {price}k một phần là vừa.",
];
const RESEARCH_ALL = "Hết món để học rồi! Bà truyền nghề cho con hết rồi đó, giữ lửa quán giùm Bà nghen.";
export function researchRoot() {
  const locked = lockedDishes(), all = Object.keys(GUI_MENU_EXTRA);
  const items = locked.map((id) => {
    const m = GUI_MENU_EXTRA[id], name = DISH_NAME[id] || id, cost = researchCost(id), can = (progress.save.money | 0) >= cost;
    return { label: name, icon: dishIcon(id), sub: `${recipeText(m)} · bán ${m.price}k`, desc: `Cần: ${recipeText(m)} · nấu ${m.cook_s} s · bán ${m.price}k`,
      right: `${cost}k`, rightCol: can ? GOLD : "#ff8a7a",
      act: (n) => {
        if (!learnDish(id)) return n.note(`Nghiên cứu ${name} tốn ${cost}k lận, ví con còn ${money()}. Bán thêm vài bữa rồi quay lại nghen.`, true);
        sfx("coin"); n.pop();
        playAction("research", { id, name, price: m.price, recipe: { ...m.recipe }, cook_s: m.cook_s });
        const left = lockedDishes().length, need = Object.keys(m.recipe).map((k) => KIND_NAME[k] || k).join(", ");
        const line = left ? RESEARCH_DONE[(all.length - left - 1) % RESEARCH_DONE.length] : RESEARCH_ALL;
        return n.note(line.replace("{name}", name).replace("{need}", need).replace("{price}", m.price));
      } };
  });
  for (const id of all) if (!locked.includes(id)) items.push({ label: DISH_NAME[id] || id, icon: dishIcon(id), dim: true, sub: `${recipeText(GUI_MENU_EXTRA[id])} · bán ${GUI_MENU_EXTRA[id].price}k`, right: "Đã học", rightCol: "#7be08a" });
  return { title: "Nghiên cứu món mới", items, info: (it) => it?.desc || `Ví ${money()} · học rồi là nấu được, bán giá cao` };
}
function messagesPage() {
  const ms = meta.getMessages();
  return { title: "Tin nhắn", empty: "Hộp thư trống.",
    items: ms.map((m) => ({ label: m.from, sub: m.text, right: `N${m.day}`, rightCol: m.read ? DIM : GOLD,
      act: (n) => n.push(() => ({ title: `${m.from} · Ngày ${m.day}`, text: m.text, items: [] })) })) };
}
const WEATHER = ["Nắng nhẹ, nước êm", "Mưa chiều, cá ăn mồi", "Gió chướng, sóng lăn tăn", "Trời mát, nước lên", "Nắng gắt, cá lặn sâu", "Mây xám, dễ gặp cá lóc"];
function marketPage() {
  const C = meta.getContract(), plans = C?.tuning?.day_plan || [], day = progress.save.day;
  const lines = [];
  for (const [lbl, d] of [["Hôm nay", day], ["Ngày mai", day + 1]]) {
    const p = plans.find((x) => x.day === d), w = WEATHER[(d * 7 + 3) % WEATHER.length];
    lines.push({ label: `${lbl} · Ngày ${d}`, right: w.split(",")[0], rightCol: "#bff3ff", sub: w, act: (n) => n.note(`${lbl}: ${w}.`) });
    if (p) {
      lines.push({ label: "Món: " + Object.entries(p.dishes).map(([k, q]) => `${DISH_NAME[k] || k} ×${q}`).join(", "), dim: true, act: (n) => n.note(Object.entries(p.dishes).map(([k, q]) => `${DISH_NAME[k] || k} ×${q}`).join(", ")) });
      lines.push({ label: "Cần: " + Object.entries(p.ingredients).map(([k, q]) => `${KIND_NAME[k] || k} ×${q}`).join(", "), dim: true, act: (n) => n.note(Object.entries(p.ingredients).map(([k, q]) => `${KIND_NAME[k] || k} ×${q}`).join(", ")) });
    } else lines.push({ label: d > plans.length && plans.length ? "Hết mùa — tổng kết sổ sách" : "Chợ tự do, nấu gì cũng được", dim: true });
  }
  return { title: "Thời tiết · Chợ", items: lines, info: "Ghe hàng nhóm chợ lúc 5 giờ sáng" };
}

// "Cài đặt": action cutscenes on/off (persisted in localStorage by action_cut.js)
function settingsPage() {
  return { title: "Cài đặt", info: "Lưu trên máy này",
    items: [
      { label: "Cảnh cắt ngắn", right: cutsEnabled() ? "Bật" : "Tắt", rightCol: cutsEnabled() ? "#7be08a" : "#ff8a7a", sub: "Phim ngắn khi thuê người, mua đồ, trang trí, lãnh thưởng",
        act: (n) => { const on = toggleCuts(); n.note(on ? "Cảnh cắt ngắn: Bật" : "Cảnh cắt ngắn: Tắt — chơi nhanh hơn"); } },
      { label: "Xem lại bản đầy đủ", sub: "Lần tới mỗi cảnh chiếu bản dài một lần nữa", right: "↺", act: (n) => { resetSeen(); n.note("Lần tới sẽ chiếu bản đầy đủ."); } },
      { label: "Debug: tiền vô hạn", right: progress.unlimitedMoney() ? "Bật" : "Tắt", rightCol: progress.unlimitedMoney() ? "#ffd36b" : "#9a9a9a",
        sub: "Ví luôn đầy 99999k để thử đồ, thuê người, nghiên cứu món. Tắt là trả lại tiền cũ",
        act: (n) => { const on = progress.setUnlimitedMoney(!progress.unlimitedMoney()); n.note(on ? "Tiền vô hạn: Bật (ví 99999k)" : "Tiền vô hạn: Tắt — ví về như cũ"); } },
    ] };
}
// ---------- the phone ----------
const APPS = [
  { id: "chores", name: "Việc vặt", glyph: "✔", col: "#d94a3d", build: (n) => choresRoot(n, false) },
  { id: "book", name: "Sổ tay", glyph: null, ic: "ca_loc", col: "#2f8f9a", build: catalogPage },
  { id: "staff", name: "Nhân viên", glyph: "☺", col: "#7a4a2a", build: staffRoot },
  { id: "decor", name: "Trang trí", glyph: "✿", col: "#c05a9a", build: decorRoot },
  { id: "msg", name: "Tin nhắn", glyph: "✉", col: "#3a8a3a", build: messagesPage },
  { id: "market", name: "Chợ", glyph: "☀", col: "#e0a020", build: marketPage },
  { id: "settings", name: "Cài đặt", glyph: "⚙", col: "#5a6a7a", build: settingsPage },
];
const COLS = 4;
const PW = 176, PH = 244;
export class Phone {
  constructor(onClose, opts = {}) {
    this.onClose = onClose; this.done = false; this.isPhone = true; this.t = 0; this.k = 0; this.closing = false; this.sel = 0; this.app = null; this.nav = null;
    this.toast = null; this.toastT = 0;
    if (opts.app) this.openApp(Math.max(0, APPS.findIndex((a) => a.id === opts.app)));
    sfx("whoosh");
  }
  close() { if (this.closing) return; this.closing = true; this.nav?.dispose(); meta.clearPreview(); sfx("click"); }
  openApp(i) {
    this.sel = i; this.app = APPS[i];
    this.nav = new Nav(this.app.build, (text, bad) => { this.toast = text; this.toastBad = bad; this.toastT = 2.8; });
    if (this.app.id === "msg") meta.markRead();
    sfx("select");
  }
  update(dt) {
    this.t += dt;
    if (this.closing) { this.k -= dt * 4; if (this.k <= 0 && !this.done) { this.k = 0; this.done = true; meta.clearPreview(); this.onClose?.(); } return; }
    this.k = Math.min(1, this.k + dt * 3.5);
    if (pumpActionCut(dt)) return; // an action cut (hire / décor / chore…) plays over the phone
    if (this.toastT > 0) this.toastT -= dt;
    if (this.t < 0.12) return; // swallow the key that opened us
    if (this.app) { if (this.nav.update(dt) === "close") { this.nav.dispose(); this.app = null; this.nav = null; sfx("click"); } return; }
    if (input.hit("back") || input.hit("close")) return this.close();
    const n = APPS.length, cols = COLS;
    if (input.hit("left")) { this.sel = (this.sel + n - 1) % n; sfx("click"); }
    if (input.hit("right")) { this.sel = (this.sel + 1) % n; sfx("click"); }
    if (input.hit("up")) { this.sel = (this.sel + n - cols) % n; sfx("click"); }
    if (input.hit("down")) { this.sel = (this.sel + cols) % n; sfx("click"); }
    if (input.hit("confirm") || input.hit("interact") || input.hit("catch")) this.openApp(this.sel);
  }
  draw() {
    const u = screen.ui, e = ease.out(clamp(this.k, 0, 1));
    u.save(); u.fillStyle = `rgba(4,8,20,${0.55 * e})`; u.fillRect(0, 0, W, H); u.restore();
    const px = Math.round(W / 2 - PW / 2), py = Math.round(lerpN(H + 4, (H - PH) / 2, e));
    // body: dark wood case with gold trim
    panel(px - 2, py - 2, PW + 4, PH + 4, { fill: "#120a06", border: BORDER, r: 18, bw: 1.6 });
    panel(px, py, PW, PH, { fill: WOOD, border: WOODL, r: 16, bw: 1 });
    const sx = px + 8, sy = py + 16, sw = PW - 16, sh = PH - 32;
    const g = u.createLinearGradient(0, sy, 0, sy + sh); g.addColorStop(0, "#14284a"); g.addColorStop(1, "#0b1528");
    panel(sx, sy, sw, sh, { fill: g, border: "rgba(255,255,255,.15)", r: 6 });
    panel(px + PW / 2 - 14, py + 6, 28, 4, { fill: "#000", border: false, r: 2 }); // speaker slit
    panel(px + PW / 2 - 20, py + PH - 10, 40, 3, { fill: "rgba(255,255,255,.35)", border: false, r: 1.5 }); // home bar
    // status bar
    const s = progress.save, d = new Date(), hh = String(d.getHours()).padStart(2, "0"), mm = String(d.getMinutes()).padStart(2, "0");
    txt(`${hh}:${mm}`, sx + 5, sy + 9, { size: 7, color: "#fff", weight: 800 });
    txt(`Ngày ${s.day} · ${money()}`, sx + sw / 2, sy + 9, { size: 7, align: "center", color: GOLD, weight: 800 });
    const bat = clamp(100 - ((s.day * 13 + Math.floor(this.t / 20)) % 70), 10, 100);
    panel(sx + sw - 22, sy + 3, 15, 7, { fill: "rgba(0,0,0,.3)", border: "#fff", r: 1.5, bw: 0.8 });
    panel(sx + sw - 21, sy + 4, 13 * bat / 100, 5, { fill: bat < 25 ? "#ff6b5a" : "#7be08a", border: false, r: 1 });
    panel(sx + sw - 7, sy + 5, 1.5, 3, { fill: "#fff", border: false, r: 0.5 });
    const cy = sy + 14, ch = sh - 14;
    if (!this.app) this.drawHome(sx, cy, sw, ch);
    else {
      panel(sx + 2, cy, sw - 4, 14, { fill: this.app.col, border: false, r: 3 });
      txt("◀ " + this.app.name, sx + 6, cy + 10, { size: 8, color: "#fff", weight: 900 });
      drawPage(this.nav, sx + 2, cy + 16, sw - 4, ch - 18, { size: 7.5, noTitle: true });
      if (this.toastT > 0) {
        const lines = wrap(this.toast, sw - 16, 7).slice(0, 4), th = lines.length * 9 + 6, ty = sy + sh - th - 4;
        panel(sx + 4, ty, sw - 8, th, { fill: this.toastBad ? "rgba(90,20,20,.95)" : "rgba(20,50,30,.95)", border: this.toastBad ? "#ff8a7a" : "#7be08a", r: 4, alpha: Math.min(1, this.toastT * 3) });
        lines.forEach((l, i) => txt(l, sx + 8, ty + 10 + i * 9, { size: 7, color: "#fff", weight: 700, alpha: Math.min(1, this.toastT * 3) }));
      }
    }
    // key hints beside the phone
    const hint = this.app ? ["↑↓ chọn", "Enter/E: mở", "Esc: quay lại"] : ["←↑↓→ chọn app", "Enter/E: mở", "T/Esc: cất máy"];
    hint.forEach((h, i) => txt(h, px + PW + 12, py + PH - 40 + i * 11, { size: 7.5, color: "rgba(255,255,255,.7)", weight: 700, alpha: e }));
    drawActionCut();
  }
  drawHome(x, y, w, h) {
    const u = screen.ui, cols = COLS, cw = w / cols, s = progress.save;
    txt("Điện thoại của Sen", x + w / 2, y + 12, { size: 8, align: "center", color: "#dff4ff", weight: 900 });
    const unread = meta.unreadCount(), doneCh = meta.getChores().filter((c) => c.done).length;
    APPS.forEach((a, i) => {
      const cx = x + cw * (i % cols) + cw / 2, cy = y + 24 + Math.floor(i / cols) * 44, on = i === this.sel;
      const bob = on ? Math.sin(this.t * 6) * 1 : 0;
      if (on) panel(cx - 18, cy - 3 + bob, 36, 40, { fill: "rgba(255,210,63,.18)", border: GOLD, r: 6 });
      panel(cx - 13, cy + bob, 26, 24, { fill: a.col, border: "rgba(255,255,255,.5)", r: 6 });
      if (a.ic) { u.imageSmoothingEnabled = false; u.drawImage(icon(a.ic), cx - 8, cy + 4 + bob, 16, 16); }
      else txt(a.glyph, cx, cy + 17 + bob, { size: 13, align: "center", color: "#fff", weight: 900 });
      txt(ellip(a.name, cw - 1, 7, 800), cx, cy + 33 + bob, { size: 7, align: "center", color: on ? "#fff" : "#cfe", weight: 800 });
      const badge = a.id === "msg" ? unread : a.id === "chores" ? doneCh : 0;
      if (badge) { panel(cx + 8, cy - 4 + bob, 11, 9, { fill: "#ff4a3d", border: "#fff", r: 4, bw: 0.8 }); txt(String(Math.min(9, badge)), cx + 13.5, cy + 3 + bob, { size: 7, align: "center", color: "#fff", weight: 900 }); }
    });
    // widget: today's money + staff/wages + decor bonus
    const wy = y + 24 + 2 * 44 + 4;
    panel(x + 6, wy, w - 12, 40, { fill: "rgba(255,255,255,.07)", border: "rgba(255,255,255,.2)", r: 5 });
    const st = meta.getStaff();
    txt(`Uy tín ${s.rep ?? "—"} · Đã kiếm ${s.totalEarned || 0}k`, x + 11, wy + 11, { size: 7, color: "#fff", weight: 800 });
    txt(`Nhân viên ${(st.waiter ? 1 : 0) + (st.cook ? 1 : 0)}/2 · công ${meta.dailyWages()}k/ngày`, x + 11, wy + 22, { size: 7, color: DIM, weight: 700 });
    txt(`Trang trí: khách kiên nhẫn +${Math.round((meta.decorBonus() - 1) * 100)}%`, x + 11, wy + 33, { size: 7, color: DIM, weight: 700 });
  }
}
const lerpN = (a, b, t) => a + (b - a) * t;
