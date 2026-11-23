// Premium dishes ("Đặc sản") — GUI-only "Sáng tạo của nhóm". The headless sim, game.contract.json and the kho file
// contract never see these: the premium ingredient kinds only exist in the client (gather → quán handover is in-memory).
// menuAll(contract) = contract tuning.menu + GUI_MENU_EXTRA (what exists: drops, recipe book, the board's locked rows);
// menuKnown(contract) = contract menu + the Đặc sản Bà Tư has learned (what the player can pick / cook / serve).
// Recipe research (Bà Tư → "Nghiên cứu món mới"): Đặc sản start locked; learnDish(id) pays RESEARCH_COST[id] from the
// wallet and adds the id to progress.save.recipes. Contract dishes are always known (the day plans depend on them).
import * as progress from "./progress.js";

// premium ingredient kinds (drops from hunted monsters and deep fish); not sold / bought by Chú Sáu
export const PREMIUM_KINDS = ["thit_ca_sau", "thit_ran", "ca_loc_bong", "ca_loc_kl", "ca_linh_lon", "ca_tra_dau"];
const PK = new Set(PREMIUM_KINDS);
export const isPremiumKind = (k) => PK.has(k);

// deep species / boss id → the premium kind it drops (1 item on top of its contract-kind yield)
export const SPECIES_PREMIUM = { ca_loc_bong: "ca_loc_bong", dan_ca_linh_lon: "ca_linh_lon", ca_loc_khong_lo: "ca_loc_kl", ca_tra_dau: "ca_tra_dau" };
// defeated monsters → premium kind dropped into the basket
export const MONSTER_DROP = { ca_sau: "thit_ca_sau", ran_nuoc: "thit_ran" };

// same shape as contract tuning.menu entries (recipe / cook_s / price in k), plus premium: true
export const GUI_MENU_EXTRA = {
  ca_sau_nuong_sa_ot: { recipe: { thit_ca_sau: 1, keo_neo: 1 }, cook_s: 9, price: 320, premium: true },
  ran_xao_sa_ot: { recipe: { thit_ran: 1, bong_dien_dien: 1 }, cook_s: 7, price: 180, premium: true },
  ca_loc_bong_hap_bau: { recipe: { ca_loc_bong: 1, bong_sung: 1 }, cook_s: 8, price: 210, premium: true },
  ca_loc_kl_nuong_trui: { recipe: { ca_loc_kl: 1 }, cook_s: 10, price: 300, premium: true },
  goi_ca_linh_lon: { recipe: { ca_linh_lon: 1, keo_neo: 1 }, cook_s: 6, price: 160, premium: true },
  lau_ca_tra_dau: { recipe: { ca_tra_dau: 1, bong_sung: 2, bong_dien_dien: 1 }, cook_s: 14, price: 480, premium: true },
};
export const isPremiumDish = (id) => Object.prototype.hasOwnProperty.call(GUI_MENU_EXTRA, id);

// research cost in k (≈ 1.5 × list price, rounded to 10) — tune here
export const RESEARCH_COST = {
  ca_sau_nuong_sa_ot: 480,   // 320k dish
  ran_xao_sa_ot: 270,        // 180k
  ca_loc_bong_hap_bau: 320,  // 210k
  ca_loc_kl_nuong_trui: 450, // 300k
  goi_ca_linh_lon: 240,      // 160k
  lau_ca_tra_dau: 720,       // 480k
};
export const researchCost = (id) => RESEARCH_COST[id] ?? Math.round((GUI_MENU_EXTRA[id]?.price || 0) * 1.5 / 10) * 10;
const learned = () => { const r = progress.save?.recipes; return Array.isArray(r) ? r : []; };
// contract dishes are always known; an Đặc sản only once Bà Tư has researched it
export const isKnownDish = (id) => !isPremiumDish(id) || learned().includes(id);
export const lockedDishes = () => Object.keys(GUI_MENU_EXTRA).filter((id) => !isKnownDish(id));
// pay the research cost and learn the dish; false = not an Đặc sản, already known, or not enough money (nothing changes)
export function learnDish(id) {
  if (!isPremiumDish(id) || isKnownDish(id)) return false;
  const s = progress.save, cost = researchCost(id);
  if (!s || (s.money || 0) < cost) return false;
  s.money -= cost; s.recipes = [...learned(), id]; progress.persist();
  return true;
}

// contract menu + premium extras (contract entries win on an id clash); cached per contract menu object
const memo = new WeakMap();
export function menuAll(contract) {
  const base = (contract && contract.tuning && contract.tuning.menu) || {};
  if (memo.has(base)) return memo.get(base);
  const all = { ...base };
  for (const [k, m] of Object.entries(GUI_MENU_EXTRA)) if (!all[k]) all[k] = m;
  memo.set(base, all);
  return all;
}
// contract menu + the Đặc sản learned so far (no cache: research changes it mid-evening)
export function menuKnown(contract) {
  const base = (contract && contract.tuning && contract.tuning.menu) || {};
  const all = { ...base };
  for (const [k, m] of Object.entries(GUI_MENU_EXTRA)) if (!all[k] && isKnownDish(k)) all[k] = m;
  return all;
}
// how many times a recipe fits in a { kind: n } stock
export function servingsOf(recipe, stock) {
  let n = Infinity;
  for (const [k, q] of Object.entries(recipe || {})) n = Math.min(n, Math.floor((stock[k] || 0) / q));
  return Number.isFinite(n) ? n : 0;
}
// recipe lines for the phone's Sổ tay / Bà Tư (names resolved by the caller)
export const PREMIUM_HINT = "Đặc sản: hạ cá sấu, rắn nước, cá lớn vùng sâu hay Cá Tra Dầu là có thịt quý để nấu món giá cao.";
