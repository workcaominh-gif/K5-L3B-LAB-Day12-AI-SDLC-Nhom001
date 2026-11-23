// "Sáng tạo của nhóm" — GUI-only aggressive creature (GDD: one passive + one aggressive type).
// Rắn nước (water snake): patrol → alert → pursue → bite → retreat → return. Not food: Space stuns it.
// Not part of Test Contract v1.0 (headless sim has no creatures). World units: x/d in metres.
import { W, txt } from "./engine.js";
import { REACHES, REACH_M } from "./gui_tuning.js"; // big map: the homes repeat (shifted) in every 100 m reach

export const SNAKE = {
  id: "ran_nuoc", name: "Rắn nước",
  segs: 12,            // body segments
  segPx: 4,            // spacing between segments, screen px
  patrolSpeed: 1.4,    // m/s
  patrolRange: 5,      // ± m around home (x)
  alertR: 6,           // diver within this (and underwater) → alert
  giveUpR: 10,         // diver farther than this → give up
  seenR: 8,            // catalog "seen" distance
  alertS: 0.35,        // pause with '!' before the chase
  // pursuit speed is relative to the diver's effective swim speed (upgrades included), so the rule holds at every level:
  pursueShallow: 0.85, // < swim: a calm swimmer can out-swim it above 30 m
  pursueDeep: 1.3,     // > swim, < sprint (×1.8): in the deep zone only sprinting escapes
  biteR: 1.0,          // head-to-diver contact distance (m)
  bodyR: 0.6,          // extra reach for the stun check
  push: 1.2,           // m the diver is shoved back on a bite
  retreatS: 3,         // seconds fleeing after a bite
  stunS: 2,            // seconds stunned by Space
  hp: 6,               // GUI hunting: spear damage per hit; 0 HP = defeated for the rest of the dive
  bounty: 20,          // k paid when defeated (+ 1 thịt rắn dropped into the basket, menu.js)
  sinkS: 2,            // seconds sinking before it is removed
  // homes per 100 m reach: 4 in the contract river (8–28 m), 2 in the deep zone (makeSnakes repeats them per reach)
  spawns: [[24, 20], [52, 26], [68, 12], [84, 25], [45, 47], [88, 53]],
};

export function makeSnakes(deepZone) {
  const homes = []; // reach 0 = the original homes; reaches 1.. shifted ±4 m / ±2 m so they don't look copy-pasted
  for (let k = 0; k < REACHES; k++) SNAKE.spawns.forEach(([x, d], i) => homes.push(k === 0 ? [x, d] : [x + k * REACH_M + ((i + k) % 2 ? 4 : -4), d + (d > deepZone ? 0 : ((i + k) % 3) - 1) * 2]));
  return homes.map(([x, d], i) => {
    const seg = new Float32Array(SNAKE.segs * 2);
    for (let k = 0; k < SNAKE.segs; k++) { seg[k * 2] = x - k * 0.22; seg[k * 2 + 1] = d; }
    return { id: "S" + (i + 1), hx: x, hd: d, x, d, vx: 0, vd: 0, face: 1, state: "patrol", tm: 0, dir: i % 2 ? -1 : 1,
      phase: i * 1.9, deep: d > deepZone, seg, moving: 1, hp: SNAKE.hp, hpMax: SNAKE.hp, flash: 0, hpShow: 0, gone: false };
  });
}

// steer toward (tx,td) at speed s; returns remaining distance
function steer(s, tx, td, sp, dt, k = 0.12) {
  const dx = tx - s.x, dd = td - s.d, r = Math.hypot(dx, dd) || 1e-6;
  const want = Math.min(sp, r / Math.max(dt, 1e-3));
  s.vx += (dx / r * want - s.vx) * k; s.vd += (dd / r * want - s.vd) * k;
  return r;
}

// env: { px, pd, underwater, swim, deepZone, maxD, maxX, sx, sy, bite(s), seen(s) }
export function updateSnakes(list, dt, env) {
  for (const s of list) {
    s.tm += dt; s.phase += dt;
    if (s.flash > 0) s.flash -= dt; if (s.hpShow > 0) s.hpShow -= dt;
    if (s.state === "dead") { // limp, sinking; body still follows below
      s.vx *= 0.95; s.vd = 1.2; if (s.tm >= SNAKE.sinkS) s.gone = true;
    } else {
    const dx = env.px - s.x, dd = env.pd - s.d, dist = Math.hypot(dx, dd);
    if (dist <= SNAKE.seenR && env.underwater) env.seen(s);
    const canSee = env.underwater && dist <= SNAKE.alertR;
    const inDeep = s.d > env.deepZone || env.pd > env.deepZone;
    switch (s.state) {
      case "patrol": case "return": {
        if (canSee) { s.state = "alert"; s.tm = 0; break; }
        if (s.state === "return") {
          if (steer(s, s.hx, s.hd, SNAKE.patrolSpeed, dt) < 0.6) { s.state = "patrol"; s.tm = 0; }
        } else {
          const tx = s.hx + s.dir * SNAKE.patrolRange, td = s.hd + Math.sin(s.phase * 0.6) * 1.2;
          if (steer(s, tx, td, SNAKE.patrolSpeed, dt, 0.06) < 0.8) s.dir = -s.dir;
        }
        break;
      }
      case "alert":
        s.vx *= 0.85; s.vd *= 0.85;
        if (!env.underwater || dist > SNAKE.giveUpR) { s.state = "return"; s.tm = 0; }
        else if (s.tm >= SNAKE.alertS) { s.state = "pursue"; s.tm = 0; }
        break;
      case "pursue": {
        if (!env.underwater || dist > SNAKE.giveUpR) { s.state = "return"; s.tm = 0; break; }
        steer(s, env.px, env.pd, env.swim * (inDeep ? SNAKE.pursueDeep : SNAKE.pursueShallow), dt, 0.2);
        if (dist <= SNAKE.biteR) { env.bite(s, dx / (dist || 1), dd / (dist || 1)); s.state = "retreat"; s.tm = 0; s.retreatS = SNAKE.retreatS; }
        break;
      }
      case "retreat": {
        const r = dist || 1;
        steer(s, s.x - dx / r * 3, s.d - dd / r * 3, SNAKE.patrolSpeed * 1.6, dt, 0.15);
        if (s.tm >= (s.retreatS || SNAKE.retreatS)) { s.state = "return"; s.tm = 0; }
        break;
      }
      case "stunned":
        s.vx *= 0.9; s.vd = s.vd * 0.9 + 0.3 * dt; // drifts down a little
        if (s.tm >= SNAKE.stunS) { s.state = "retreat"; s.tm = 0; s.retreatS = 1.5; }
        break;
    }
    }
    s.x = Math.max(1, Math.min(env.maxX - 1, s.x + s.vx * dt));
    s.d = Math.max(1.5, Math.min(env.maxD - 1, s.d + s.vd * dt));
    if (Math.abs(s.vx) > 0.05) s.face = s.vx > 0 ? 1 : -1;
    s.moving = s.state === "stunned" || s.state === "dead" ? 0 : Math.min(1, 0.35 + Math.hypot(s.vx, s.vd) / 3);
    // body follows the head (chain constraint measured in screen px, so the snake keeps its length at any angle)
    const g = s.seg; g[0] = s.x; g[1] = s.d;
    for (let k = 1; k < SNAKE.segs; k++) {
      const i = k * 2, ex = (g[i] - g[i - 2]) * env.sx, ey = (g[i + 1] - g[i - 1]) * env.sy, r = Math.hypot(ex, ey);
      if (r > SNAKE.segPx) { const f = SNAKE.segPx / r; g[i] = g[i - 2] + ex * f / env.sx; g[i + 1] = g[i - 1] + ey * f / env.sy; }
    }
  }
}

// nearest stunnable snake within reach of the diver, or null
export function snakeInReach(list, px, pd, reach) {
  let best = null, bd = 1e9;
  for (const s of list) { if (s.state === "stunned" || s.state === "dead") continue; const r = Math.hypot(s.x - px, s.d - pd); if (r <= reach + SNAKE.bodyR && r < bd) { bd = r; best = s; } }
  return best;
}
// spear damage (GUI hunting): true when this hit defeats it
export function damageSnake(s, dmg) {
  s.hp = Math.max(0, s.hp - dmg); s.flash = 0.3; s.hpShow = 3;
  if (s.hp > 0) return false;
  s.state = "dead"; s.tm = 0; s.hpShow = 0; return true;
}
export function stunSnake(s) { s.state = "stunned"; s.tm = 0; s.vx *= 0.2; s.vd *= 0.2; }

const BAND_A = "#7a8a34", BAND_B = "#3c4a1c", BELLY = "#b7b866", STUN_A = "#9aa266", STUN_B = "#5d6640";
// screen x = ox + x*sx, screen y = oy + d*sy
export function drawSnake(c, s, ox, oy, sx, sy, t) {
  const g = s.seg, n = SNAKE.segs, hx = ox + g[0] * sx, hy = oy + g[1] * sy;
  if (hx < -80 || hx > W + 80 || hy < -40 || hy > 310) return;
  const dead = s.state === "dead", stun = s.state === "stunned" || dead, amp = 2.2 * s.moving, sp = s.state === "pursue" ? 14 : 8;
  const fl = s.flash > 0 ? (Math.floor(s.flash * 20) % 2 ? "#ff5a5a" : "#ffffff") : null, col = (x) => fl || x;
  if (dead) c.globalAlpha = Math.max(0, 1 - s.tm / SNAKE.sinkS);
  // body tail → head
  for (let k = n - 1; k >= 1; k--) {
    const i = k * 2;
    let ex = (g[i - 2] - g[i]) * sx, ey = (g[i - 1] - g[i + 1]) * sy; const r = Math.hypot(ex, ey) || 1; ex /= r; ey /= r;
    const w = Math.sin(t * sp - k * 0.85 + s.phase) * amp * (0.25 + 0.75 * k / n);
    const x = Math.round(ox + g[i] * sx - ey * w), y = Math.round(oy + g[i + 1] * sy + ex * w);
    const size = k > n - 3 ? 2 : k > n - 6 ? 3 : 4, h = size;
    c.fillStyle = col((k >> 1) % 2 ? (stun ? STUN_A : BAND_A) : (stun ? STUN_B : BAND_B));
    c.fillRect(x - (size >> 1), y - (h >> 1), size, h);
    if (size > 2) { c.fillStyle = col(BELLY); c.fillRect(x - (size >> 1), y + (h >> 1) - 1, size, 1); }
  }
  // head
  const f = s.face, x0 = Math.round(hx), y0 = Math.round(hy);
  c.fillStyle = col(stun ? STUN_B : "#2f3a14"); c.fillRect(x0 - 3, y0 - 2, 6, 5); c.fillRect(x0 + (f > 0 ? 3 : -4), y0 - 1, 1, 3);
  c.fillStyle = col(BAND_A); c.fillRect(x0 - 2, y0 - 2, 4, 1);
  if (stun) { // X eyes + orbiting stars
    c.fillStyle = col("#ffe14d"); c.fillRect(x0 + f * 1, y0 - 1, 1, 1);
    if (!dead) for (let i = 0; i < 3; i++) { const a = t * 5 + i * 2.1; c.fillRect(Math.round(x0 + Math.cos(a) * 6), Math.round(y0 - 6 + Math.sin(a) * 2), 1, 1); }
  } else {
    c.fillStyle = col("#ffe14d"); c.fillRect(x0 + (f > 0 ? 1 : -2), y0 - 1, 1, 1);
    c.fillStyle = col("#0a0a0a"); c.fillRect(x0 + (f > 0 ? 2 : -3), y0 - 1, 1, 1);
    if (s.state === "pursue" && Math.floor(t * 6) % 2) { c.fillStyle = col("#e0324a"); const tx = f > 0 ? x0 + 4 : x0 - 7; c.fillRect(tx, y0 + 1, 3, 1); c.fillRect(f > 0 ? tx + 3 : tx - 1, y0, 1, 1); c.fillRect(f > 0 ? tx + 3 : tx - 1, y0 + 2, 1, 1); }
  }
  c.globalAlpha = 1;
  if (s.state === "alert" || s.state === "pursue") txt("!", x0, y0 - 6 + Math.round(Math.sin(t * 10)), { size: 11, align: "center", color: "#ff3b3b", weight: 900, stroke: "#1a1220", sw: 2 });
}
