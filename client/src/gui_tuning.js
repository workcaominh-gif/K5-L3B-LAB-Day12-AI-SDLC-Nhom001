// GUI scaling knobs — "Sáng tạo của nhóm", CLIENT ONLY. Every number here sits ON TOP of game.contract.json:
// the client reads the contract value as the BASE and applies these multipliers / sizes. The Python sim, the
// contract, the tests and tools/bench.py never see this file (headless keeps 30 s O₂, 180 s phases, a 100×30 m river).
// Change a knob here and every scene follows (scene_gather, scene_quan, progress.stats, terrain, deep, HUD, DayIntro, hub).

// ---- time ----
export const OXY_MUL = 3;            // O₂ tank ×3: contract 30 s → 90 s; contract upgrades 45 / 60 s → 135 / 180 s
export const DIVE_TIME_S = 360;      // morning dive (contract gather.duration_s = 180)
export const SERVICE_TIME_S = 300;   // night quán shift (contract quan.duration_s = 180); customers keep arriving all shift

// ---- map ----
export const MAP_WIDTH_M = 300;      // river width (contract bounds.x = [0,100])
export const MAP_DEPTH_M = 150;      // river depth (contract bounds.d = [0,30]; old creative deep zone ended at 60 m)
export const REACH_M = 100;          // one contract-sized "reach": the contract layout (nodes, spawn columns, croc lanes) repeats every REACH_M
export const REACHES = Math.round(MAP_WIDTH_M / REACH_M); // 3
// depth zones (to = bottom of the zone in m); pressure = O₂ drain multiplier inside the zone; dark = 0..1 darkness
// of the water around the diver (0 = daylight, light cone from ~0.5 up)
export const ZONES = [
  { name: "Nước nông", to: 30, pressure: 1, dark: 0, col: "#bff3ff" },
  { name: "Vùng sâu", to: 60, pressure: 1.5, dark: 0, col: "#f0d9a0" },
  { name: "Tầng chạng vạng", to: 100, pressure: 1.5, dark: 0.82, col: "#8fd8ff" },
  { name: "Vực thẳm", to: 150, pressure: 2, dark: 0.95, col: "#c9a8ff" },
];
export const DOCKS = [2, 150, 298];  // moored ghe at the surface (contract dock_pos x = 2 is the first one); any dock ends the dive
export const FISH_MUL = REACHES;     // contract fish_initial / fish_max ×3 for the whole (3-reach) river

// ---- terrain chunks (terrain.js): baked lazily near the camera, cached (LRU) ----
export const CHUNK_W_M = 50, CHUNK_H_M = 25, CHUNK_CACHE = 24;

// ---- helpers ----
export const zoneIndex = (d) => { for (let i = 0; i < ZONES.length; i++) if (d < ZONES[i].to) return i; return ZONES.length - 1; };
export const zoneTop = (i) => (i > 0 ? ZONES[i - 1].to : 0);
export const reachOf = (x) => Math.max(0, Math.min(REACHES - 1, Math.floor(x / REACH_M)));
// nearest dock x to a world x: { x, dist }
export function nearestDock(x) { let best = DOCKS[0]; for (const k of DOCKS) if (Math.abs(k - x) < Math.abs(best - x)) best = k; return { x: best, dist: Math.abs(best - x) }; }
export const fmtClock = (s) => { const c = Math.ceil(s); return Math.floor(c / 60) + ":" + String(c % 60).padStart(2, "0"); };
