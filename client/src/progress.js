// Meta progression (GUI-only "Sáng tạo của nhóm", not part of Test Contract v1.0):
// day counter, wallet, upgrades, species catalog, save/load. Scenes read stats(contract) and report back
// through the record* helpers; only main.js / the shop scene advance days or spend money.

import { OXY_MUL } from "./gui_tuning.js"; // GUI scaling knobs (contract numbers stay the base)

const KEY = "chonoi.save.v1";

// Each upgrade has levels; `eff` is the bonus at each level (index 0 = not bought).
export const UPGRADES = {
  oxy:   { name: "Bình dưỡng khí",   desc: "+O₂ tối đa",              cost: [0, 150, 350, 700],  eff: [0, 10, 20, 35] },        // +s
  cap:   { name: "Giỏ lưới lớn",     desc: "+sức chứa giỏ",           cost: [0, 120, 300, 600],  eff: [0, 4, 8, 14] },          // +items
  fins:  { name: "Chân vịt",         desc: "bơi nhanh hơn",           cost: [0, 100, 260, 520],  eff: [1, 1.15, 1.3, 1.5] },    // × swim speed
  net:   { name: "Vợt bắt cá",       desc: "+tầm bắt cá",             cost: [0, 90, 220, 450],   eff: [0, 0.6, 1.2, 2.0] },     // +m catch radius
  stove: { name: "Bếp than hồng",    desc: "nấu nhanh hơn",           cost: [0, 140, 320],       eff: [1, 0.75, 0.5] },         // × cook time
  decor: { name: "Đèn lồng & bàn ghế", desc: "khách kiên nhẫn hơn",   cost: [0, 120, 300],       eff: [1, 1.15, 1.3] },         // × customer patience
  table2: { name: "Thêm bàn",        desc: "thêm chỗ cho khách",      cost: [0, 250, 600],       eff: [1, 2, 3] },              // tables (for a 1-table contract)
  spear: { name: "Mũi lao",          desc: "lao sát thương cao hơn",  cost: [0, 150, 350, 700],  eff: [1, 2, 3, 5] },           // harpoon damage per hit
};
// which screen sells which track: morning prep (dive gear) vs evening prep (restaurant)
// "oxy" is superseded by the contract's oxygen upgrade (v1.1) and is no longer sold.
export const GEAR_UPGRADES = ["cap", "fins", "net"];
export const QUAN_UPGRADES = ["stove", "decor", "table2"];
// hunting gear (creative): sold in the day-loop Shop under "Đồ thêm (sáng tạo)"
export const HUNT_UPGRADES = ["spear"];

export function freshSave() {
  // cu = contract upgrade levels bought (Test Contract v1.1 shop: oxygen, hp); active = levels in effect today
  // (bought levels only apply from the NEXT day: main.js calls activateUpgrades() when it builds a new day).
  // rep = reputation carried across days (null = contract reputation_initial); sold = dishes sold over the run.
  return { v: 1, day: 1, money: 0, totalEarned: 0, best: 0, up: { oxy: 0, cap: 0, fins: 0, net: 0, stove: 0, decor: 0, table2: 0, spear: 0 },
    cu: { oxygen: 0, hp: 0 }, active: { oxygen: 0, hp: 0 }, rep: null, sold: {}, tips: 0, catalog: {}, history: [], hunt: {}, itemSeq: 0, pendingDelivery: [], recipes: [] }; // recipes: Đặc sản ids Bà Tư has researched (menu.js learnDish) // pendingDelivery: Chợ Chú Sáu purchases [{id, kind, fresh:100}] for the next evening // itemSeq: last freshness item id (I<n>, v1.2)
}

export let save = load() || freshSave();

export function load() {
  try { const raw = localStorage.getItem(KEY); if (!raw) return null; const s = JSON.parse(raw); if (s && s.v === 1) { const f = freshSave(); return { ...f, ...s, up: { ...f.up, ...s.up }, cu: { ...f.cu, ...s.cu }, active: { ...f.active, ...s.active }, sold: { ...s.sold }, hunt: { ...s.hunt }, pendingDelivery: Array.isArray(s.pendingDelivery) ? s.pendingDelivery : [], recipes: Array.isArray(s.recipes) ? [...s.recipes] : [] }; } } catch (e) {}
  return null;
}
// Demo mode (title-menu shortcuts): scenes still read stats()/recordCatch() but nothing is written to storage;
// main.js calls setDemo(false) on the way back, which reloads the real save and drops demo-only changes.
let demo = false;
export function setDemo(on) { demo = !!on; if (!demo) resume(); }
export const isDemo = () => demo;
export function persist() { if (demo) return; try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) {} }
export function hasSave() { const s = load(); return !!(s && (s.day > 1 || s.money > 0)); }
export function newGame() { const best = save?.best || 0; save = freshSave(); save.best = best; persist(); return save; }
export function resume() { save = load() || freshSave(); return save; }

// ---- debug: unlimited money (GUI-only test aid) ----
// On with ?money in the URL (?nomoney turns it off) or the phone's "Cài đặt" app; remembered on this device.
// While on, the wallet is topped up to RICH every frame (main.js calls topUp); turning it off gives back the
// amount the wallet had when it was switched on, so a test run doesn't leave a fake fortune in the save.
const RICH_KEY = "chonoi.debugMoney", RICH = 99999;
let rich = (() => {
  try {
    const q = typeof location !== "undefined" ? location.search : "";
    if (/[?&]nomoney\b/.test(q)) { localStorage.removeItem(RICH_KEY); return false; }
    if (/[?&]money\b/.test(q)) { localStorage.setItem(RICH_KEY, "on"); return true; }
    return localStorage.getItem(RICH_KEY) === "on";
  } catch (e) { return false; }
})();
export const unlimitedMoney = () => rich;
export function topUp() {
  if (!rich || !save) return;
  if (save.moneyBeforeDebug == null) save.moneyBeforeDebug = save.money | 0;
  if (save.money < RICH) save.money = RICH;
}
export function setUnlimitedMoney(on) {
  rich = !!on;
  try { rich ? localStorage.setItem(RICH_KEY, "on") : localStorage.removeItem(RICH_KEY); } catch (e) {}
  if (rich) topUp();
  else if (save && save.moneyBeforeDebug != null) { save.money = save.moneyBeforeDebug; delete save.moneyBeforeDebug; }
  persist();
  return rich;
}

// Effective tuning = contract values + upgrades. Scenes must read numbers from here, never hard-code.
export const GUI_HOLD_MUL = 10;
export function stats(contract) {
  const g = contract.tuning.gather, q = contract.tuning.quan, u = save.up;
  const lv = (id) => (contract.tuning.shop?.upgrades?.[id] || [])[(save.active?.[id] || 0) - 1];
  return {
    // core (Test Contract v1.1): oxygen / hp come from the contract base or the ACTIVE contract upgrade level
    // GUI: × OXY_MUL (gui_tuning.js) on top — contract 30 / 45 / 60 s → 90 / 135 / 180 s; headless keeps the contract values
    oxygenMax: (lv("oxygen")?.oxygen_max_s ?? g.oxygen_max_s) * OXY_MUL,
    hpMax: lv("hp")?.hp_max ?? g.hp_max,
    // GUI (Sáng tạo): the basket starts 10× the contract's hold_capacity; headless keeps 12
    holdCap: g.hold_capacity * GUI_HOLD_MUL + UPGRADES.cap.eff[u.cap],
    swimSpeed: g.swim_speed * UPGRADES.fins.eff[u.fins],
    catchRadius: g.catch_radius + UPGRADES.net.eff[u.net],
    cookMul: UPGRADES.stove.eff[u.stove],
    patienceS: q.patience_s,
    patienceMul: UPGRADES.decor.eff[u.decor || 0],                          // × customer patience
    tables: (q.tables?.length || 1) - 1 + UPGRADES.table2.eff[u.table2 || 0], // contract tables + extra ones bought
    spearDmg: UPGRADES.spear.eff[u.spear || 0],                              // harpoon damage per hit (base 1)
  };
}

// ---- contract shop (v1.1 core): data-driven levels from tuning.shop.upgrades ----
export function contractNext(contract, id) { const lv = contract.tuning.shop?.upgrades?.[id] || []; return lv[save.cu[id] || 0] || null; }
export function buyContract(contract, id) {
  const nx = contractNext(contract, id); if (!nx || save.money < nx.price) return false; // buy_failed: money and level unchanged
  save.money -= nx.price; save.cu[id] = nx.level; persist(); return true;
}
export function activateUpgrades() { save.active = { ...save.cu }; persist(); }
export function repNow(contract) { return save.rep ?? contract.tuning.quan.reputation_initial; }

export function upgradeCost(id) { const up = UPGRADES[id], lv = save.up[id]; return lv + 1 < up.cost.length ? up.cost[lv + 1] : null; }
export function buy(id) {
  const c = upgradeCost(id); if (c == null || save.money < c) return false;
  save.money -= c; save.up[id]++; persist(); return true;
}

// catalog: species id -> { name, caught, firstDay }
export function recordCatch(speciesId, name) {
  const e = save.catalog[speciesId] || { name, caught: 0, firstDay: save.day };
  e.caught++; save.catalog[speciesId] = e; persist();
  return e.caught === 1; // true = new discovery
}

// hunting (creative): a trophy fish sold to the trader straight away; money lands in the wallet now and is
// logged per day so DayResult can show it. Returns the day's hunting income so far.
export function recordHunt(money) {
  const m = Math.max(0, Math.round(money || 0)); save.hunt ||= {};
  save.money += m; save.totalEarned += m; save.hunt[save.day] = (save.hunt[save.day] || 0) + m;
  const days = Object.keys(save.hunt).map(Number).sort((a, b) => a - b); while (days.length > 30) delete save.hunt[days.shift()];
  persist(); return save.hunt[save.day];
}
export const huntIncome = (day) => save.hunt?.[day] || 0;
// monsters defeated (GUI hunting): catalog entry keeps a separate "đã hạ" count
export function recordDefeat(id, name) {
  const e = save.catalog[id] || { name, caught: 0, firstDay: save.day };
  e.defeated = (e.defeated || 0) + 1; save.catalog[id] = e; persist(); return e.defeated;
}

// called once per finished day by main.js
export function finishDay(summary) {
  // summary: { haulCount, earned, rep, served, left, score }
  save.money += summary.earned; save.totalEarned += summary.earned; save.best = Math.max(save.best, summary.score || 0);
  if (summary.rep != null) save.rep = summary.rep;
  save.tips = (save.tips || 0) + (summary.tips || 0);
  for (const [k, n] of Object.entries(summary.sold || {})) save.sold[k] = (save.sold[k] || 0) + n;
  save.history.push({ day: save.day, ...summary }); if (save.history.length > 30) save.history.shift();
  save.day++; persist();
}
