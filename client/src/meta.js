// Meta life systems (GUI-only "Sáng tạo của nhóm", not part of the Test Contract): staff, restaurant decor,
// Bà Tư's chores, the phone's messages. All state lives as extra fields on progress.save (save.staff,
// save.decor, save.chores, save.messages, save.wagesPaidDay) with defaults filled in lazily, then persist().
// Overlays (openBaTuDialog / openPhone) follow the host contract { update(dt), draw(), done }:
// the host scene freezes its own gameplay while one is open and drops it once `done` is true.
import * as progress from "./progress.js";
import { decorFx } from "./raft.js"; // live décor preview: raft.js draws decorFx.show over the scene's own décor

const S = () => progress.save; // live binding: newGame()/resume() replace the object

// ---------------- staff ----------------
export const STAFF = {
  waiter: { name: "Bé Tí (chạy bàn)", short: "Bé Tí", role: "Chạy bàn",
    levels: [null, { cost: 200, wage: 40, speed: 1, desc: "bưng món tới bàn giùm" }, { cost: 300, wage: 60, speed: 1.4, desc: "chạy nhanh ×1.4" }] },
  cook: { name: "Chú Bảy (phụ bếp)", short: "Chú Bảy", role: "Phụ bếp",
    levels: [null, { cost: 250, wage: 50, cookMul: 1, desc: "nấu phụ một bếp" }, { cost: 350, wage: 70, cookMul: 0.8, desc: "nấu nhanh (×0.8 thời gian)" }] },
};
export const STAFF_IDS = ["waiter", "cook"];
function staffState() { const s = S(); if (!s.staff || typeof s.staff !== "object") s.staff = {}; for (const id of STAFF_IDS) s.staff[id] = s.staff[id] | 0; return s.staff; }
export function getStaff() { const st = staffState(); return { waiter: st.waiter, cook: st.cook }; }
// cost of the next step for id: hire (lv0→1) or train (lv1→2); null when maxed
export function nextStaffCost(id) { const lv = staffState()[id]; const L = STAFF[id]?.levels[lv + 1]; return L ? L.cost : null; }
export function hire(id) {
  const st = staffState(), s = S(); if (!STAFF[id] || st[id] !== 0) return false;
  const c = STAFF[id].levels[1].cost; if (s.money < c) return false;
  s.money -= c; st[id] = 1; pushMessage(STAFF[id].short, id === "waiter" ? "Dạ con cảm ơn chị Sen! Mai con tới sớm lau bàn nghen." : "Bảy tới phụ bếp nè. Than để Bảy lo, con yên tâm.", false);
  progress.persist(); return true;
}
export function train(id) {
  const st = staffState(), s = S(); if (!STAFF[id] || st[id] !== 1) return false;
  const c = STAFF[id].levels[2].cost; if (s.money < c) return false;
  s.money -= c; st[id] = 2; pushMessage(STAFF[id].short, id === "waiter" ? "Con tập chạy bàn với chị Tám rồi, giờ bưng hai tô một lượt cũng hổng đổ!" : "Bảy học thêm mẹo nướng trui của Bà Tư, nấu lẹ hơn nhiều à.", false);
  progress.persist(); return true;
}
export function fire(id) {
  const st = staffState(); if (!STAFF[id] || st[id] === 0) return false;
  st[id] = 0; pushMessage(STAFF[id].short, "Dạ... vậy thôi con về phụ ba má. Khi nào quán cần cứ nhắn nghen.", false);
  progress.persist(); return true;
}
export function wageOf(id) { const lv = staffState()[id]; return lv ? STAFF[id].levels[lv].wage : 0; }
export function dailyWages() { return STAFF_IDS.reduce((a, id) => a + wageOf(id), 0); }
// what the quán applies: waiter walk speed multiplier, cook time multiplier (1 = no change / not hired)
export function staffEffects() {
  const st = staffState();
  return { waiter: st.waiter, cook: st.cook,
    waiterSpeed: st.waiter ? STAFF.waiter.levels[st.waiter].speed : 0,
    cookMul: st.cook ? STAFF.cook.levels[st.cook].cookMul : 1 };
}
// Pays yesterday's wages once per save.day (idempotent: re-entering the same day does not pay twice).
// Money never goes below 0; anyone who cannot be paid quits with a message.
// Returns { paid, owed, quit: [ids] } (paid 0/owed 0 when there was nothing to pay).
export function payWages() {
  const s = S(), st = staffState();
  if (s.wagesPaidDay === s.day) return { paid: 0, owed: 0, quit: [], skipped: true };
  s.wagesPaidDay = s.day;
  const owed = dailyWages(); let paid = 0; const quit = [];
  for (const id of ["cook", "waiter"]) {
    const w = wageOf(id); if (!w) continue;
    if (s.money >= w) { s.money -= w; paid += w; }
    else {
      const part = Math.max(0, s.money); s.money = 0; paid += part; st[id] = 0; quit.push(id);
      pushMessage(STAFF[id].short, part ? `Quán chỉ trả được ${part}k trong ${w}k tiền công. Con xin nghỉ nghen, buồn ghê...` : `Hôm qua quán hổng có tiền trả công ${w}k. Con xin phép nghỉ, chúc quán mau khấm khá.`, false);
    }
  }
  if (owed) pushMessage("Sổ lương", quit.length ? `Trả công ${paid}k/${owed}k. ${quit.map((i) => STAFF[i].short).join(", ")} đã nghỉ việc.` : `Đã trả công ngày ${s.day - 1}: ${paid}k (${STAFF_IDS.filter((i) => wageOf(i)).map((i) => `${STAFF[i].short} ${wageOf(i)}k`).join(", ")}).`, false);
  progress.persist();
  return { paid, owed, quit };
}

// ---------------- decor ----------------
export const DECOR = {
  lanterns: { label: "Đèn lồng", def: "do", items: [
    { id: "do", name: "Đèn lồng đỏ", price: 0, desc: "Đỏ rực như ngày Tết, đèn cũ của Bà Tư." },
    { id: "vang", name: "Đèn lồng vàng", price: 80, desc: "Vàng ấm, khách ngồi lâu không thấy chói." },
    { id: "xanh", name: "Đèn lồng xanh ngọc", price: 120, desc: "Xanh như nước sông mùa nước nổi." },
    { id: "bay_mau", name: "Đèn lồng bảy màu", price: 250, desc: "Bảy màu lung linh, ghe ngang qua cũng ngó." }] },
  cloth: { label: "Khăn bàn", def: "tre", items: [
    { id: "tre", name: "Chiếu tre", price: 0, desc: "Mộc mạc, mát tay." },
    { id: "ca_ro", name: "Khăn caro", price: 60, desc: "Caro đỏ trắng như quán cơm quê." },
    { id: "hoa", name: "Khăn hoa sen", price: 100, desc: "Thêu bông sen hồng, sang mà hiền." }] },
  flowers: { label: "Bông hoa", def: 0, items: [
    { id: 0, name: "Chưa có bông", price: 0, desc: "Bàn trơn, chỉ có chén đũa." },
    { id: 1, name: "Chậu bông giấy", price: 70, desc: "Bông giấy hồng đặt mũi ghe." },
    { id: 2, name: "Giàn bông", price: 160, desc: "Giàn bông giấy phủ mái, thơm cả quán." }] },
  sign: { label: "Bảng hiệu", def: "go", items: [
    { id: "go", name: "Bảng gỗ", price: 0, desc: "Chữ ông Tư khắc tay hồi xưa." },
    { id: "den_neon_tre", name: "Đèn neon khung tre", price: 150, desc: "Neon hồng trong khung tre, sáng cả khúc sông." },
    { id: "son_mai", name: "Bảng sơn mài", price: 220, desc: "Sơn mài đỏ son, chữ vàng óng." }] },
};
export const DECOR_SLOTS = ["lanterns", "cloth", "flowers", "sign"];
function decorState() {
  const s = S(); if (!s.decor || typeof s.decor !== "object") s.decor = {};
  const d = s.decor; if (!d.owned || typeof d.owned !== "object") d.owned = {};
  for (const sl of DECOR_SLOTS) {
    const def = DECOR[sl].def;
    if (!DECOR[sl].items.some((it) => it.id === d[sl])) d[sl] = def;
    if (!Array.isArray(d.owned[sl])) d.owned[sl] = [];
    if (!d.owned[sl].includes(def)) d.owned[sl].unshift(def);
  }
  return d;
}
// the applied décor (never the preview)
export function realDecor() { const d = decorState(); return { lanterns: d.lanterns, cloth: d.cloth, flowers: d.flowers, sign: d.sign }; }
// what the raft shows: the applied décor with the slot being previewed swapped in ("Trang trí quán" browsing)
export function getDecor() { const d = realDecor(); if (preview) d[preview.slot] = preview.id; return d; }
// ---- live preview: browsing an item shows it on the raft (raft.js decorFx) until clearPreview() ----
let preview = null, decorAnim = null;
export function previewDecor(slot, id) { if (!decorItem(slot, id)) return false; preview = { slot, id }; syncDecorFx(); return true; }
export function clearPreview() { if (!preview) return; preview = null; syncDecorFx(); }
export function previewing() { return preview ? { ...preview } : null; }
// purchase cut (action_cut.js): { slot, from, to, k, revealX } animates one slot on the raft; null ends it
export function setDecorAnim(a) { decorAnim = a || null; syncDecorFx(); }
function syncDecorFx() { decorFx.show = preview || decorAnim ? getDecor() : null; decorFx.anim = decorAnim; }
export function decorItem(slot, id) { return DECOR[slot]?.items.find((it) => it.id === id) || null; }
export function ownsDecor(slot, id) { return decorState().owned[slot]?.includes(id) || false; }
export function ownedDecor() { const d = decorState(); const o = {}; for (const sl of DECOR_SLOTS) o[sl] = [...d.owned[sl]]; return o; }
export function applyDecor(slot, id) {
  const d = decorState(); if (!decorItem(slot, id) || !d.owned[slot].includes(id)) return false;
  d[slot] = id; progress.persist(); syncDecorFx(); return true;
}
// buys (if not owned) and applies; false when unknown or not enough money
export function buyDecor(slot, id) {
  const d = decorState(), it = decorItem(slot, id), s = S(); if (!it) return false;
  if (d.owned[slot].includes(id)) return applyDecor(slot, id);
  if (s.money < it.price) return false;
  s.money -= it.price; d.owned[slot].push(id); d[slot] = id; progress.persist(); syncDecorFx(); return true;
}
// customer patience multiplier from the applied decor: +3 % per non-default item, +1 % per tier above the
// first (bảy màu = +5 %), capped at +15 %. Always ≥ 1.
export function decorBonus() {
  const d = decorState(); let b = 0;
  for (const sl of DECOR_SLOTS) { const i = DECOR[sl].items.findIndex((it) => it.id === d[sl]); if (i > 0) b += 0.03 + 0.01 * (i - 1); }
  return 1 + Math.min(0.15, b);
}

// ---------------- chores (việc vặt của Bà Tư) ----------------
// ev = trackChore event; an ev without ":" also matches every "<ev>:<kind>". reset = event that zeroes progress.
export const CHORES = [
  { key: "keo3", title: "Bắt 3 đàn cá kèo", ev: "fish_caught:ca_keo", goal: 3, money: 60, line: "Ông Sáu bán khô muốn mua cá kèo, con bắt giùm Bà ba đàn nghen." },
  { key: "khach5", title: "Phục vụ 5 khách không ai bỏ về", ev: "served", goal: 5, reset: "missed", money: 80, rep: 0.2, line: "Bán quán là bán cái bụng. Đừng để ai bụng đói bỏ về nghe con." },
  { key: "sung4", title: "Hái 4 bông súng", ev: "picked:bong_sung", goal: 4, money: 50, line: "Bà muốn làm gỏi bông súng cúng ông, con hái giùm bốn bông." },
  { key: "boa3", title: "Nhận 3 lần boa", ev: "tip", goal: 3, money: 70, line: "Khách vui thì khách boa. Con cười nhiều vô, được ba lần boa là Bà thưởng." },
  { key: "tra", title: "Hạ Cá Tra Dầu", ev: "boss_killed", goal: 1, money: 200, rep: 0.3, line: "Con cá tra dầu dưới đáy sông phá lưới người ta hoài. Con gan thì trị nó!" },
  { key: "linh10", title: "Bắt 10 con cá linh", ev: "fish_caught:ca_linh", goal: 10, money: 60, line: "Mùa nước nổi cá linh về đầy. Con bắt mười con cho Bà kho lạt." },
  { key: "loc2", title: "Bắt 2 con cá lóc", ev: "fish_caught:ca_loc", goal: 2, money: 55, line: "Chú Ba đầu kênh đặt hai con cá lóc nướng trui đãi giỗ." },
  { key: "dien3", title: "Hái 3 chùm bông điên điển", ev: "picked:bong_dien_dien", goal: 3, money: 45, line: "Bông điên điển vàng rực rồi, con hái ba chùm Bà xào tép." },
  { key: "keoneo3", title: "Hái 3 bó kèo nèo", ev: "picked:keo_neo", goal: 3, money: 45, line: "Lẩu mắm mà thiếu kèo nèo là mất ngon, con hái giùm Bà nghen." },
  { key: "nhanh3", title: "Phục vụ nhanh 3 khách", ev: "served_fast", goal: 3, money: 70, line: "Khách ghe hàng đi sớm, con dọn món lẹ lẹ cho người ta kịp chợ." },
  { key: "ngay2", title: "Mở quán 2 ngày", ev: "day_done", goal: 2, money: 100, rep: 0.1, line: "Buôn bán phải đều tay. Con mở quán hai ngày liền cho Bà coi." },
  // Đặc sản (menu.js, GUI only): counted by scene_quan.startCook → trackChore("premium_cooked")
  { key: "dacsan1", title: "Nấu 1 món đặc sản", ev: "premium_cooked", goal: 1, money: 90, rep: 0.1, line: "Học một món đặc sản với Bà trước, rồi hạ cá sấu, rắn nước hay bắt cá lớn dưới vùng sâu mà nấu cho khách sộp. Bà thưởng!" },
  { key: "khach12", title: "Phục vụ 12 khách", ev: "served", goal: 12, money: 120, rep: 0.2, line: "Quán mình nhỏ mà khách đông là Bà mừng. Mười hai khách nghen con." },
];
export const MAX_CHORES = 3;
const choreDef = (key) => CHORES.find((c) => c.key === key);
function choreState() {
  const s = S(); if (!s.chores || typeof s.chores !== "object") s.chores = {};
  const c = s.chores;
  if (!Array.isArray(c.active)) { c.active = []; c.seq = 0; c.doneCount = 0; c.offers = []; addChore(c, "sung4"); } // Bà Tư's first request
  if (!Array.isArray(c.offers)) c.offers = [];
  c.active = c.active.filter((a) => choreDef(a.key));
  if (c.offers.length < 2) refillOffers(c);
  return c;
}
function addChore(c, key) { const d = choreDef(key); c.seq = (c.seq | 0) + 1; c.active.push({ id: "c" + c.seq, key, progress: 0, goal: d.goal, done: false }); }
function refillOffers(c) {
  const busy = new Set([...c.active.map((a) => a.key), ...c.offers]);
  const pool = CHORES.filter((d) => !busy.has(d.key) && d.key !== c.lastKey);
  while (c.offers.length < 3 && pool.length) c.offers.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0].key);
}
// live view for UIs: [{ id, key, title, line, progress, goal, done, money, rep }]
export function getChores() { return choreState().active.map((a) => ({ ...choreDef(a.key), ...a })); }
export function getChoreOffers() { return choreState().offers.map((k) => ({ ...choreDef(k) })); }
export function acceptChore(key) {
  const c = choreState(); if (c.active.length >= MAX_CHORES || !c.offers.includes(key)) return false;
  c.offers = c.offers.filter((k) => k !== key); addChore(c, key); refillOffers(c); progress.persist(); return true;
}
let completions = [];
let tracked = { gather: false, quan: false };
export function trackChore(event, n = 1) {
  if (!event) return;
  const base = String(event).split(":")[0];
  if (base === "fish_caught" || base === "picked") tracked.gather = true;
  if (base === "served" || base === "missed" || base === "tip" || base === "served_fast") tracked.quan = true;
  const c = choreState(); let changed = false;
  for (const a of c.active) {
    if (a.done) continue;
    const d = choreDef(a.key);
    if (d.reset && (d.reset === event || d.reset === base)) { if (a.progress) { a.progress = 0; changed = true; } continue; }
    if (d.ev === event || (!d.ev.includes(":") && d.ev === base)) {
      a.progress = Math.min(a.goal, a.progress + n); changed = true;
      if (a.progress >= a.goal) {
        a.done = true; completions.push({ id: a.id, title: d.title, money: d.money || 0, rep: d.rep || 0 });
        pushMessage("Bà Tư", `Con làm xong "${d.title}" rồi đó! Mở điện thoại hoặc ghé Bà lấy tiền thưởng nghen.`, false);
        globalToasts.push({ text: `Xong việc: ${d.title}`, sub: `Thưởng ${d.money || 0}k${d.rep ? ` · +${d.rep} uy tín` : ""}`, t: 0 });
      }
    }
  }
  if (changed) progress.persist();
}
// completed-chore toasts since the last call: [{ id, title, money, rep }]
export function popCompletions() { const out = completions; completions = []; return out; }
let REP = { init: 3, max: 5 }, CONTRACT = null;
export const getContract = () => CONTRACT;
export function setContract(contract) { CONTRACT = contract || null; const q = contract?.tuning?.quan; if (q) REP = { init: q.reputation_initial ?? 3, max: q.reputation_max ?? 5 }; }
// pays out a done chore; returns { money, rep } or null
export function claimReward(id) {
  const c = choreState(), s = S(); const a = c.active.find((x) => x.id === id); if (!a || !a.done) return null;
  const d = choreDef(a.key);
  s.money += d.money || 0; s.totalEarned = (s.totalEarned || 0) + (d.money || 0);
  if (d.rep) s.rep = Math.min(REP.max, Math.round(((s.rep ?? REP.init) + d.rep) * 100) / 100);
  c.active = c.active.filter((x) => x.id !== id); c.doneCount = (c.doneCount | 0) + 1; c.lastKey = a.key;
  refillOffers(c); progress.persist();
  return { money: d.money || 0, rep: d.rep || 0 };
}
// fallbacks used by main.js when a scene did not report chore events itself (prevents double counting)
export function beginPhase() { tracked = { gather: false, quan: false }; }
export function gatherFallback(by, fishKinds = ["ca_linh", "ca_loc", "ca_keo"]) {
  if (tracked.gather || !by) return;
  for (const [k, n] of Object.entries(by)) if (n > 0) trackChore((fishKinds.includes(k) ? "fish_caught:" : "picked:") + k, n);
}
export function quanFallback(res) {
  if (tracked.quan || !res) return;
  if (res.served) trackChore("served", res.served);
  if (res.left || res.missed) trackChore("missed", (res.left || 0) + (res.missed || 0));
  if (res.tipsCount) trackChore("tip", res.tipsCount);
}

// ---------------- messages ----------------
export function getMessages() { const s = S(); if (!Array.isArray(s.messages)) s.messages = []; return s.messages; }
export function unreadCount() { return getMessages().filter((m) => !m.read).length; }
export function pushMessage(from, text, save = true) {
  const m = getMessages(); m.unshift({ from: String(from), text: String(text), day: S().day, read: false });
  if (m.length > 40) m.length = 40;
  if (save) progress.persist();
}
export function markRead() { for (const m of getMessages()) m.read = true; progress.persist(); }

// ---------------- global toast layer (main.js draws it outside the quán, which shows popCompletions itself) ----------------
export const globalToasts = [];

// ---------------- overlays ----------------
import { BaTuDialog } from "./batu.js";
import { Phone } from "./phone.js";
export function openBaTuDialog(onClose) { return new BaTuDialog(onClose); }
export function openPhone(onClose, opts = {}) { return new Phone(onClose, opts); }
