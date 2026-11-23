// Cutscene scripts + the river backdrop they share (side cross-section: sky above, river below, y=0 is the surface).
import { W, H, clamp, lerp, ease } from "./engine.js";
import { P, R, bands, sky, sun, cloud, bank, ghe, chibiSide, hyacinth, godRays, kelp, rock, WATER, diver, lantern, fish, KIND_NAME } from "./art.js";

const DEPTH = 420;

// cs: { t, cam:{x,y}, v:{...} }. tod: "dawn" | "dusk" | "night"
export function riverWorld(c, cs, tod = "dawn") {
  const t = cs.t, cam = cs.cam, v = cs.v;
  const sy = Math.round(-cam.y);
  c.fillStyle = "#081f38"; c.fillRect(0, 0, W, H);
  if (sy > 0) {
    sky(c, tod, 0, sy, t);
    const sunY = tod === "dawn" ? sy - 34 - (v.sunUp || 0) * 30 : sy - 18;
    if (tod !== "night") sun(c, 330 - cam.x * 0.04, sunY, tod === "dawn" ? 16 : 20, tod === "dawn" ? "#fff0b8" : "#ffd08a", tod === "dawn" ? "rgba(255,190,140,.18)" : "rgba(255,120,80,.2)");
    else { c.fillStyle = "#f6f1d6"; c.beginPath(); c.arc(380, sy - 120, 9, 0, Math.PI * 2); c.fill(); }
    const cc = tod === "dawn" ? "rgba(255,210,200,.55)" : tod === "dusk" ? "rgba(255,150,130,.45)" : "rgba(120,130,190,.25)";
    for (let i = 0; i < 5; i++) cloud(c, ((i * 130 - cam.x * 0.1 + t * 3) % 620 + 620) % 620 - 70, sy - 120 - (i % 3) * 22, 1 + (i % 2) * 0.4, cc);
    const far = tod === "dawn" ? "#5a3d6b" : tod === "dusk" ? "#3a1f45" : "#121a36";
    const near = tod === "dawn" ? "#3a2a4f" : tod === "dusk" ? "#24142f" : "#0b1128";
    bank(c, sy - 2, cam.x * 0.15, far, 3, 0.8);
    bank(c, sy, cam.x * 0.35, near, 7, 1.1);
    // market boats on the surface (parallax 0.7)
    const goods = tod !== "dawn";
    for (let i = 0; i < 8; i++) {
      const bx = i * 150 + 40 - cam.x * 0.7, bob = Math.round(Math.sin(t * 1.6 + i) * 1);
      if (bx < -60 || bx > W + 60) continue;
      ghe(c, bx, sy + 2 + bob, 0.8 + (i % 3) * 0.12, { beo: i, roof: i % 2 ? "#6b3d22" : null, rower: { hat: true, shirt: ["#3a6fd8", "#d94a3d", "#7a4fa0"][i % 3], pole: true } });
      if (goods || tod === "night") lantern(c, bx - 4, sy - 22 + bob, t, P.red);
    }
  }
  // underwater
  const top = Math.max(0, sy);
  if (sy < H) {
    bands(c, 0, sy, W, DEPTH, WATER, 16);
    if (tod !== "dawn") { c.fillStyle = tod === "night" ? "rgba(5,8,30,.45)" : "rgba(60,20,40,.25)"; c.fillRect(0, top, W, H - top); }
    godRays(c, cam.x, sy, 260, t, tod === "dawn" ? 0.08 : 0.04);
    for (let i = 0; i < 6; i++) hyacinth(c, ((i * 190 + 70 - cam.x * 1) % 1000 + 1000) % 1000 - 100, sy, 26 + (i % 3) * 10, t, i);
    for (let i = 0; i < 22; i++) {
      const x = ((i * 53 - cam.x * 0.9) % (W + 40) + W + 40) % (W + 40) - 20, base = sy + DEPTH - 30;
      kelp(c, x, base, 30 + (i % 5) * 14, t);
    }
    c.fillStyle = "#2c2419"; c.fillRect(0, sy + DEPTH - 30, W, 40);
    for (let i = 0; i < 9; i++) rock(c, ((i * 77 - cam.x) % (W + 60) + W + 60) % (W + 60) - 30, sy + DEPTH - 29, 10 + (i % 3) * 5, 6);
    // drifting silt
    for (let i = 0; i < 40; i++) {
      const x = ((i * 31 + t * 4) % W), y = sy + 20 + ((i * 47 + t * 6) % (DEPTH - 40));
      R(c, x, y, 1, 1, "rgba(200,240,255,.35)");
    }
    if (v.school) for (let i = 0; i < 4; i++) fish(c, i % 2 ? "ca_loc" : "ca_linh", ((i * 140 + t * 18) % (W + 80)) - 40, sy + 90 + i * 40, 1, t + i);
  }
  // surface line
  if (sy > -4 && sy < H) { R(c, 0, sy, W, 1, "rgba(230,250,255,.8)"); for (let x = 0; x < W; x += 9) R(c, x + Math.round(Math.sin(t * 2 + x) * 2), sy - 1, 4, 1, "rgba(255,255,255,.6)"); }
  // our heroine's boat + jump
  const hx = 520 - cam.x, jump = v.jump || 0;
  if (sy > -20) ghe(c, hx, sy + 2 + Math.round(Math.sin(t * 1.4) * 1), 1.1, { roof: "#7a4a2a", hull: "#9a6a3a" });
  if (sy > -40 && v.ba) chibiSide(c, hx + 10, sy - 6, { shirt: "#7a4fa0", hair: "#c9c2d4" }, 1);
  if (jump <= 0) { if (sy > -30) chibiSide(c, hx - 6, sy - 6, { shirt: P.suit }, 1); }
  else if (jump < 1) {
    const k = jump, x = hx - 6 - k * 40, y = sy - 6 - Math.sin(k * Math.PI) * 34 + (k > 0.5 ? (k - 0.5) * 30 : 0);
    diver(c, x, y, -1, t, 0.4, { tilt: -Math.PI / 2 + k * Math.PI * 0.9 });
  } else {
    const d = clamp((jump - 1), 0, 2);
    diver(c, hx - 46 - d * 20, sy + 14 + d * 70, -1, t, 1, { tilt: 0.9 - d * 0.4 });
  }
  if (v.splash > 0) {
    const k = 1 - v.splash;
    for (let i = 0; i < 14; i++) {
      const a = Math.PI + (i / 13) * Math.PI;
      R(c, hx - 46 + Math.cos(a) * k * 26, sy + Math.sin(a) * k * 26 * (1 - k) * 2, 2, 2, "#e8fbff");
    }
  }
  // sunset return: boat rowing in, restaurant raft, lanterns
  if (v.raft) {
    const rx = 700 - cam.x;
    R(c, rx - 70, sy - 4, 150, 6, P.woodD); R(c, rx - 70, sy - 6, 150, 2, P.woodL);
    R(c, rx - 60, sy - 46, 4, 42, P.woodD); R(c, rx + 70, sy - 46, 4, 42, P.woodD);
    c.fillStyle = "#6b3d22"; c.beginPath(); c.moveTo(rx - 76, sy - 44); c.lineTo(rx + 5, sy - 66); c.lineTo(rx + 86, sy - 44); c.fill();
    R(c, rx - 30, sy - 64, 70, 12, "#2a1a12"); R(c, rx - 29, sy - 63, 68, 10, P.red);
    const lit = v.lights || 0;
    for (let i = 0; i < 8; i++) {
      const lx = rx - 62 + i * 18;
      if (i < lit) lantern(c, lx, sy - 44, t, i % 2 ? P.red : P.orange);
      else { R(c, lx, sy - 44, 1, 3, P.ink); R(c, lx - 3, sy - 41, 7, 8, "#4a2a2a"); }
    }
    if (lit >= 8) { c.fillStyle = "rgba(255,190,90,.12)"; c.fillRect(rx - 80, sy - 70, 170, 70); }
  }
  if (v.boatX !== undefined) {
    const bx = v.boatX - cam.x;
    ghe(c, bx, sy + 2 + Math.round(Math.sin(t * 2) * 1), 1.1, { roof: "#7a4a2a", hull: "#9a6a3a" });
    chibiSide(c, bx - 4, sy - 6, { shirt: P.suit, pole: true }, 1);
    for (let i = 0; i < 4; i++) R(c, bx + 6 + i * 4, sy - 9, 3, 3, [P.silver, P.loc, P.yellow, P.pink][i]);
  }
}

// ---------- scripts ----------
// Dave-the-Diver tone: hammy, self-aware, anime parody, deadpan narrator. Meme beats come from meme_fx.js (see its header).
// Lines auto-advance (Enter / Space jumps ahead); hold Esc skips the opener, any key skips the short dusk / day scenes.
const SEN = { say: "Út Sen", portrait: "sen", side: "right", color: "#1aa6a0", auto: true, cps: 55 };
const BA = { say: "Bà Tư", portrait: "ba", color: "#7a4fa0", auto: true, cps: 55 };
const SKIP_ANY = { opts: { skipAny: true, hint: "Bấm phím bất kỳ để bỏ qua" } };

// Game opener (≈ 24 s): cold open mid-dive → record-scratch freeze-frame → "5 phút trước" → Bà Tư's flame card →
// Út Sen's sunglasses → ÚT SEN card → sweaty reaction → the dive → "LẶN THÔI!!"
export function introScript() {
  return [
    { music: "cut_dawn" },
    { bg: (c, cs) => riverWorld(c, cs, "dawn") },
    { set: { sunUp: 0.6, jump: 0, splash: 0, ba: true } },
    { cam: { x: 300, y: -200 }, dur: 0.01 },
    { fade: "in", dur: 0.5 },
    // cold open: already mid-air…
    { musicCue: 2 }, { sfx: "whoosh" }, { stinger: "riser", arg: 0.6 },
    { tween: { jump: 0.42 }, dur: 0.6, ease: "out", wait: true },
    // …record scratch, freeze, narrator
    { meme: "freeze", me: [197, 158], dur: 3 },
    { set: { jump: 0 } }, { musicCue: 0 }, { cam: { x: 240, y: -222 }, dur: 0.01 },
    { meme: "impact", text: "◀◀ 5 PHÚT TRƯỚC", vhs: true, col: "#ffffff", size: 34, rot: -0.04, bgCol: "rgba(20,24,60,.72)", dur: 1 },
    { caption: "Chợ nổi Cái Răng · 5 giờ sáng", sub: "Gà còn chưa gáy, cá lóc đã thức dậy tập thể dục", dur: 1.6 },
    { cam: { x: 300, y: -200 }, dur: 1.4, ease: "out" },
    { meme: "kanji", who: "ba", text: "BÀ TƯ", sub: "Bếp trưởng huyền thoại · 40 năm giữ lửa lẩu", bg: "flames", dur: 2.4 },
    { ...BA, text: "Út ơi! Tối nay quán mở lại. Lặn kiếm cá với bông súng về cho nội!" },
    { ...SEN, text: "Dạ! Quán Ăn Chợ Nổi tái xuất giang hồ!" },
    { meme: "shades", who: "sen", text: "ĐỈNH CỦA CHÓP", sub: "(tự tin hơi bị nhiều)", land: 0.8, dur: 2.4 },
    { musicCue: 2 },
    { intro: { name: "ÚT SEN", sub: "Thợ lặn nhí · nhịn thở 30 giây · sợ cá trê", tag: "NHÂN VẬT CHÍNH (TỰ PHONG)", portrait: "sen", colA: "#14a6a0", colB: "#ff8a3d", nameCol: "#ffe14d", dur: 2 } },
    // reaction shot behind Bà Tư's warning
    { meme: "sweat", who: "sen", dur: 2.9, async: true },
    { ...BA, text: "Ủa alo? Nhớ canh hơi thở nghen, hết hơi là phải trồi lên!" },
    { meme: "clear" },
    // the dive, for real this time
    { sfx: "whoosh" }, { stinger: "riser", arg: 0.6 },
    { tween: { jump: 1 }, dur: 0.6, ease: "inOut", wait: true },
    { sfx: "splash" }, { stinger: "splash_big" }, { shake: 5 }, { flash: "#e8fbff" },
    { set: { splash: 1, school: true } },
    { tween: { splash: 0 }, dur: 0.6 },
    { music: "underwater" },
    { tween: { jump: 2.6 }, dur: 1.6 },
    { cam: { x: 330, y: 120 }, dur: 1.6, ease: "inOut" },
    { meme: "impact", text: "LẶN THÔI!!", sub: "Buổi sáng · gom nguyên liệu, về bến trước khi hết giờ", col: "#7ee8ff", dur: 1.5 },
    { fade: "out", dur: 0.5, wait: true },
  ];
}

// most impressive first: the catch showcase vine-booms the best item in the basket
const CATCH_RANK = ["ca_loc_kl", "thit_ca_sau", "ca_tra_dau", "ca_loc_bong", "thit_ran", "ca_linh_lon", "ca_loc", "ca_keo", "ca_linh", "keo_neo", "bong_dien_dien", "bong_sung"];
export function bestCatch(haul = []) {
  const rank = (k) => { const i = CATCH_RANK.indexOf(k); return i < 0 ? CATCH_RANK.length : i; };
  let best = null; for (const k of haul) if (best === null || rank(k) < rank(best)) best = k;
  return best;
}

// Back at the raft (≈ 7.5 s): boat rows in → catch showcase (vine boom on the best item + verdict) or the empty-basket
// tragedy (tears + sad trombone) → lanterns pop on → "QUÁN ĂN CHỢ NỔI · MỞ CỬA!"
export function duskScript(haul = []) {
  const count = haul.length, best = bestCatch(haul), nBest = haul.filter((k) => k === best).length;
  const show = count ? [
    { meme: "vineboom", item: best, text: `${KIND_NAME[best] || best}${nBest > 1 ? ` ×${nBest}` : ""}`, dur: 1.1 },
    count >= 8
      ? { meme: "impact", text: "ĐẦY GHE!!", sub: `${count} món · mãi đỉnh`, col: "#ffd23f", dur: 1.1 }
      : { meme: "impact", text: "CŨNG CÓ CÁ…", sub: `${count} món · ét o ét, nhiêu đây đủ hông nội?`, col: "#ffb36b", rot: 0.06, dur: 1.1 },
    { ...BA, text: count >= 8 ? "Trời đất, xỉu up xỉu down! Lên đèn thôi con!" : "Khum sao, ít mà chất! Lên đèn thôi con!", auto: 0.45, cps: 65 },
  ] : [
    { meme: "tears", who: "sen", text: "Giỏ trống…\nCÒN CÁI NỊT", dur: 2 },
    { ...BA, text: "Ối dồi ôi… thôi khum sao, quán vẫn mở! Lên đèn!", auto: 0.45, cps: 65 },
  ];
  return [
    { music: "cut_dusk" }, SKIP_ANY,
    { bg: (c, cs) => riverWorld(c, cs, "dusk") },
    { set: { raft: true, lights: 0, boatX: 300 } },
    { cam: { x: 200, y: -228 }, dur: 0.01 },
    { fade: "in", dur: 0.4 },
    { tween: { boatX: 560 }, dur: 1.6, ease: "out" },
    { cam: { x: 330, y: -225 }, dur: 1.6, ease: "out" },
    { caption: "Chiều tà · ghe về bến", sub: count ? `${count} món trong giỏ` : "giỏ… nhẹ hều", dur: 1.4 },
    ...show,
    { musicCue: 1 }, { stinger: "drumroll", arg: 0.65 },
    ...Array.from({ length: 8 }, (_, i) => [{ set: { lights: i + 1 } }, { stinger: "bell", arg: i }, { wait: 0.08 }]).flat(),
    { musicCue: 2 }, { stinger: "sting_win", arg: 0 },
    { meme: "impact", text: "QUÁN ĂN CHỢ NỔI\nMỞ CỬA!", sub: "Nấu món, bưng ra bàn, giữ uy tín quán", col: "#ffd23f", size: 40, bgCol: "rgba(60,14,20,.7)", dur: 1.4 },
    { fade: "out", dur: 0.4, wait: true },
  ];
}

// Short "NGÀY N" card (≈ 3.3 s): dawn on the market, impact title, Út Sen chibi-bounces in.
const DAY_TAG = ["", "Ngày đầu đi làm · run xỉu up xỉu down", "Hôm nay quyết tâm mãi đỉnh", "Giữa mùa nước nổi · cá lóc ét o ét",
  "Khum lặn là khum có cá", "Trận cuối · all in bông súng"];
const DAY_CHEER = ["", "Tới công chuyện!", "Đi nè!", "Hehe", "Lặn lẹ!", "Chơi lớn!"];
export function dayScript(day, sub = "") {
  return [
    { music: "theme" }, SKIP_ANY,
    { bg: (c, cs) => riverWorld(c, cs, "dawn") },
    { set: { sunUp: 0.3, ba: true } },
    { cam: { x: 220, y: -232 }, dur: 0.01 },
    { fade: "in", dur: 0.4 },
    { tween: { sunUp: 1 }, dur: 3 },
    { cam: { x: 290, y: -226 }, dur: 3, ease: "out" },
    { meme: "impact", text: `NGÀY ${day}`, sub: sub || DAY_TAG[day] || "Lại một ngày đỉnh của chóp", col: "#ffd23f", size: 52, dur: 1.5 },
    { meme: "chibi", who: "sen", at: [400, 236], text: DAY_CHEER[day] || "Đi nè!", dur: 0.9 },
    { fade: "out", dur: 0.4, wait: true },
  ];
}
