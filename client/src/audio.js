// Music = generative WebAudio engine (music.js) for theme/underwater/restaurant/cut_dawn/cut_dusk; any other name, or every name
// with ?music=files in the URL, plays the manifest <audio> file (crossfaded).
// SFX = file if the manifest has one, else a small, mellow WebAudio synth. Cutscene stingers (riser, boom, hero_hit,
// title_hit, swish, splash_big, bell/bellN, drumroll, sting_win; action cuts: jingle(kind), coin_shower, sparkle, unfurl,
// flip) are always synth, on their own bus. Babble = voice.js.
import { createMusic } from "./music.js";
import { createVoice } from "./voice.js";
import { caption } from "./captions.js";
const MUSIC_FILES = typeof location !== "undefined" && /[?&]music=files\b/.test(location.search);
const MUSIC_GAIN = 0.35; // generative music level relative to sfx
let ac = null, master = null, muted = false, gen = null, vox = null, musicBus = null;
const files = { music: {}, sfx: {} };
const buffers = {};
let current = null, currentName = null;

export function registerAudio(manifest) {
  for (const a of manifest) {
    if (a.kind === "music" && a.id) files.music[a.id] = "assets/" + a.path;
    if (a.kind === "sfx" && a.id) files.sfx[a.id] = "assets/" + a.path;
  }
}

export function unlock() {
  if (ac) { if (ac.state === "suspended") ac.resume(); return; }
  ac = new (window.AudioContext || window.webkitAudioContext)();
  master = ac.createGain(); master.gain.value = muted ? 0 : 0.5; master.connect(ac.destination);
  musicBus = ac.createGain(); musicBus.gain.value = MUSIC_GAIN; musicBus.connect(master);
  try { gen = createMusic(ac, musicBus); } catch (e) { gen = null; }
  try { vox = createVoice(ac, master); } catch (e) { vox = null; }
  try { cineSetup(); } catch (e) { cine = null; }
  for (const [id, url] of Object.entries(files.sfx)) {
    fetch(url).then((r) => r.arrayBuffer()).then((b) => ac.decodeAudioData(b)).then((buf) => (buffers[id] = buf)).catch(() => {});
  }
  if (pending) { const p = pending; pending = null; music(p); }
}

export function toggleMute() {
  muted = !muted;
  if (master) master.gain.setTargetAtTime(muted ? 0 : 0.5, ac.currentTime, 0.03);
  if (current) current.muted = muted;
  return muted;
}
export const isMuted = () => muted;

let pending = null;
export function music(name, vol = 0.55) {
  if (name === currentName) return;
  if (!ac) { pending = name; return; }
  const old = current;
  currentName = name;
  current = null;
  if (old) fadeOut(old);
  if (!MUSIC_FILES && gen && gen.has(name)) { gen.play(name); return; }
  if (gen) gen.stop();
  const url = files.music[name];
  if (!url) return;
  const a = new Audio(url);
  a.loop = true; a.volume = 0; a.muted = muted;
  a.play().catch(() => {});
  current = a;
  const t0 = performance.now();
  const step = () => {
    if (current !== a) return;
    const k = Math.min(1, (performance.now() - t0) / 900);
    a.volume = vol * k;
    if (k < 1) requestAnimationFrame(step);
  };
  step();
}
function fadeOut(a) {
  const v0 = a.volume, t0 = performance.now();
  const step = () => {
    const k = Math.min(1, (performance.now() - t0) / 600);
    a.volume = v0 * (1 - k);
    if (k < 1) requestAnimationFrame(step); else a.pause();
  };
  step();
}
export const musicName = () => currentName;
export function stopMusic() { if (current) fadeOut(current); if (gen) gen.stop(); current = null; currentName = null; pending = null; }

// ---------- dialogue babble ----------
// voice(speaker, ch[, text, idx]): call for each character as it is revealed; it skips spaces/punctuation and
// speaks a syllable every 2-3 letters. voiceLine(speaker, text): babble a whole bubble line now; returns seconds.
export function voice(speaker, ch, text, idx) {
  if (!ac || muted || !vox) return;
  vox.feed(speaker, ch, text, idx);
}
export function voiceLine(speaker, text) {
  if (!ac || muted || !vox) return 0;
  return vox.line(speaker, text);
}

// ---------- SFX ----------
function tone({ type = "sine", f0 = 440, f1 = f0, dur = 0.15, vol = 0.3, delay = 0, noise = false, q = 1 }) {
  const t = ac.currentTime + delay;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let src;
  if (noise) {
    const len = Math.ceil(ac.sampleRate * dur);
    const buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    src = ac.createBufferSource(); src.buffer = buf;
    const flt = ac.createBiquadFilter(); flt.type = "bandpass"; flt.Q.value = q;
    flt.frequency.setValueAtTime(f0, t); flt.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
    src.connect(flt); flt.connect(g);
  } else {
    src = ac.createOscillator(); src.type = type;
    src.frequency.setValueAtTime(f0, t); src.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    src.connect(g);
  }
  g.connect(master); src.start(t); src.stop(t + dur + 0.02);
}

// mallet: sine fundamental + quick inharmonic overtone (marimba / kalimba-ish), no square/saw edges
function mallet(f, delay = 0, vol = 0.12, dur = 0.3) {
  tone({ type: "sine", f0: f, dur, vol, delay });
  tone({ type: "sine", f0: f * 3.93, dur: Math.min(0.08, dur * 0.3), vol: vol * 0.28, delay });
}
const SYNTH = {
  click: () => mallet(1175, 0, 0.07, 0.07),
  select: () => { mallet(784, 0, 0.09, 0.16); mallet(1175, 0.07, 0.09, 0.22); },
  bubble: () => tone({ type: "sine", f0: 300 + Math.random() * 300, f1: 900, dur: 0.12, vol: 0.12 }),
  splash: () => { tone({ noise: true, f0: 2000, f1: 300, dur: 0.5, vol: 0.5, q: 0.6 }); tone({ type: "sine", f0: 180, f1: 60, dur: 0.3, vol: 0.3 }); },
  catch: () => { tone({ type: "triangle", f0: 520, f1: 1040, dur: 0.12, vol: 0.2 }); mallet(1047, 0.08, 0.1, 0.3); },
  pick: () => tone({ type: "triangle", f0: 700, f1: 1200, dur: 0.1, vol: 0.16 }),
  coin: () => { mallet(1319, 0, 0.1, 0.18); mallet(1760, 0.07, 0.09, 0.45); },
  whoosh: () => tone({ noise: true, f0: 400, f1: 3000, dur: 0.35, vol: 0.3, q: 0.8 }),
  slam: () => { tone({ type: "sine", f0: 140, f1: 40, dur: 0.45, vol: 0.55 }); tone({ noise: true, f0: 1200, f1: 200, dur: 0.25, vol: 0.3 }); },
  sizzle: () => tone({ noise: true, f0: 5000, f1: 4000, dur: 0.6, vol: 0.1, q: 2 }),
  hurt: () => { tone({ type: "triangle", f0: 330, f1: 110, dur: 0.25, vol: 0.2 }); tone({ type: "sine", f0: 165, f1: 70, dur: 0.22, vol: 0.18 }); },
  heartbeat: () => { tone({ type: "sine", f0: 70, f1: 50, dur: 0.12, vol: 0.5 }); tone({ type: "sine", f0: 65, f1: 45, dur: 0.12, vol: 0.4, delay: 0.16 }); },
  blip: () => tone({ type: "sine", f0: 900 + Math.random() * 120, dur: 0.03, vol: 0.04 }),
  // pentatonic C D G A C, soft mallets, ringing last note
  fanfare: () => { [523, 587, 784, 880].forEach((f, i) => mallet(f, i * 0.085, 0.1, 0.22)); mallet(1047, 0.34, 0.12, 0.8); mallet(523, 0.34, 0.06, 0.8); },
  ding: () => { tone({ type: "sine", f0: 1568, dur: 0.6, vol: 0.16 }); tone({ type: "sine", f0: 2093, dur: 0.5, vol: 0.09, delay: 0.02 }); },
};

// ---------- cinematic stingers (cutscenes) ----------
// Synth only (never replaced by manifest files): own bus -> compressor -> master, plus a long generated-noise
// reverb. Pitched material is the Vietnamese pentatonic C D F G A; no square/saw leads (brass = FM sines).
const PENT = [0, 2, 5, 7, 9];
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const penta = (base, i) => base + 12 * Math.floor(i / 5) + PENT[((i % 5) + 5) % 5]; // i-th scale step above base (a C)
const rr = (a, b) => a + Math.random() * (b - a);
let cine = null, cineVerb = null, noiseBuf = null;
const ksCache = new Map();
function cineSetup() {
  if (cine) return;
  const sr = ac.sampleRate;
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -14; comp.knee.value = 8; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.25;
  comp.connect(master);
  cine = ac.createGain(); cine.gain.value = 0.9; cine.connect(comp);
  const len = Math.floor(sr * 3.4), ir = ac.createBuffer(2, len, sr);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c); let lp = 0;
    for (let i = 0; i < len; i++) { const k = i / len; lp += (0.85 - 0.7 * k) * ((Math.random() * 2 - 1) - lp); d[i] = lp * Math.pow(1 - k, 2.4); }
  }
  const hp = ac.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 180;
  const conv = ac.createConvolver(); conv.buffer = ir;
  cineVerb = ac.createGain(); cineVerb.gain.value = 0.55;
  cineVerb.connect(hp); hp.connect(conv); conv.connect(comp);
  noiseBuf = ac.createBuffer(1, sr * 2, sr);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}
// one layer: oscillator or looped noise -> optional sweeping filter -> envelope -> cine bus (+ reverb send).
// swell=true: rises exponentially over dur and cuts off sharply at the end (reverse-cymbal / riser shape).
function layer({ t, dur, vol, a = 0.004, type = "sine", f0 = 440, f1 = f0, noise = false, ft = null, ff0 = 1000, ff1 = ff0, q = 0.8, send = 0.3, swell = false }) {
  const g = ac.createGain(), end = t + dur;
  g.gain.setValueAtTime(0.0001, t);
  if (swell) { g.gain.exponentialRampToValueAtTime(vol, end); g.gain.linearRampToValueAtTime(0, end + 0.03); }
  else { g.gain.exponentialRampToValueAtTime(vol, t + a); g.gain.exponentialRampToValueAtTime(0.0001, Math.max(t + a + 0.01, end)); }
  let src;
  if (noise) { src = ac.createBufferSource(); src.buffer = noiseBuf; src.loop = true; }
  else {
    src = ac.createOscillator(); src.type = type;
    src.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) src.frequency.exponentialRampToValueAtTime(Math.max(15, f1), end);
  }
  let head = src;
  if (ft) {
    const f = ac.createBiquadFilter(); f.type = ft; f.Q.value = q;
    f.frequency.setValueAtTime(ff0, t); if (ff1 !== ff0) f.frequency.exponentialRampToValueAtTime(Math.max(20, ff1), end);
    head.connect(f); head = f;
  }
  head.connect(g); g.connect(cine);
  if (send > 0) { const s = ac.createGain(); s.gain.value = send; g.connect(s); s.connect(cineVerb); }
  if (noise) src.start(t, Math.random() * 1.5); else src.start(t);
  src.stop(end + 0.06);
}
// 2-operator FM. Brass: ratio 1, index swells with the attack. Bell/kalimba: ratio 3.5, index decays fast.
function fm({ t, f, dur, vol, ratio = 1, i0 = 2.5, i1 = 0.6, ia = 0.05, a = 0.02, send = 0.4, lp = 4200, sus = 0.7 }) {
  const end = t + dur;
  const c = ac.createOscillator(); c.frequency.value = f;
  const m = ac.createOscillator(); m.frequency.value = f * ratio; m.detune.value = rr(-4, 4);
  const mg = ac.createGain();
  mg.gain.setValueAtTime(f * Math.min(i0, 0.4), t);
  mg.gain.linearRampToValueAtTime(f * i0, t + ia);
  mg.gain.exponentialRampToValueAtTime(Math.max(0.01, f * i1), end);
  m.connect(mg); mg.connect(c.frequency);
  const g = ac.createGain();
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + a);
  g.gain.setTargetAtTime(vol * sus, t + a, dur * 0.3);
  g.gain.setValueAtTime(vol * sus * 0.8, end - 0.06);
  g.gain.linearRampToValueAtTime(0, end);
  const flt = ac.createBiquadFilter(); flt.type = "lowpass"; flt.frequency.value = lp;
  c.connect(flt); flt.connect(g); g.connect(cine);
  if (send > 0) { const s = ac.createGain(); s.gain.value = send; g.connect(s); s.connect(cineVerb); }
  c.start(t); m.start(t); c.stop(end + 0.05); m.stop(end + 0.05);
}
const brassChord = (t, notes, dur, vol) => notes.forEach((n, k) => fm({ t: t + k * 0.007, f: mtof(n), dur, vol, ratio: 1, i0: 3, i1: 0.9, ia: 0.06, a: 0.03, send: 0.45 }));
const bellNote = (t, m, vol, dur = 2.2, send = 0.7) => {
  fm({ t, f: mtof(m), dur, vol, ratio: 3.5, i0: 2.2, i1: 0.02, ia: 0.002, a: 0.003, send, lp: 9000, sus: 0.03 });
  layer({ t, dur: dur * 0.6, vol: vol * 0.35, f0: mtof(m) * 2, a: 0.003, send: send * 0.5 });
};
// Karplus-Strong pluck (đàn tranh-ish), buffers cached per pitch
function ksPluck(t, m, vol, len = 1.6, bright = 0.55) {
  const sr = ac.sampleRate, f = mtof(m), N = Math.max(2, Math.floor(sr / f - 0.5));
  const key = N + "|" + bright;
  let buf = ksCache.get(key);
  if (!buf) {
    const n = Math.floor(sr * 1.8); buf = ac.createBuffer(1, n, sr); const d = buf.getChannelData(0);
    let lp = 0; for (let i = 0; i < N; i++) { lp += bright * ((Math.random() * 2 - 1) - lp); d[i] = lp; }
    for (let i = N; i < n; i++) d[i] = 0.4975 * (d[i - N] + d[i - N - 1 < 0 ? 0 : i - N - 1]);
    let pk = 0; for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(d[i]));
    if (pk > 0) for (let i = 0; i < n; i++) d[i] *= 0.8 / pk;
    ksCache.set(key, buf);
  }
  const s = ac.createBufferSource(); s.buffer = buf; s.playbackRate.value = f / (sr / (N + 0.5));
  const g = ac.createGain();
  g.gain.setValueAtTime(vol, t); g.gain.setValueAtTime(vol, t + len - 0.25); g.gain.linearRampToValueAtTime(0, t + len);
  const sg = ac.createGain(); sg.gain.value = 0.6;
  s.connect(g); g.connect(cine); g.connect(sg); sg.connect(cineVerb);
  s.start(t); s.stop(t + len + 0.02);
}
function taiko(t, vel) {
  layer({ t, dur: 0.75, vol: vel, f0: 118, f1: 42, a: 0.003, send: 0.5 });
  layer({ t, dur: 0.12, vol: vel * 0.35, type: "triangle", f0: 230, f1: 85, a: 0.002, send: 0.3 });
  layer({ t, dur: 0.14, vol: vel * 0.5, noise: true, ft: "lowpass", ff0: 600, ff1: 180, a: 0.002, send: 0.5 });
}
function frameHit(t, vel, hi) {
  const f = hi ? 250 : 175;
  layer({ t, dur: 0.16, vol: vel, f0: f, f1: f * 0.6, a: 0.002, send: 0.35 });
  layer({ t, dur: 0.07, vol: vel * 0.55, noise: true, ft: "bandpass", ff0: hi ? 1700 : 1000, q: 1.1, a: 0.001, send: 0.3 });
}
// duck the generative music bus to `amt` for `sec` seconds, starting `delay` from now
export function duck(sec = 0.8, amt = 0.5, delay = 0) {
  if (!ac || !musicBus) return;
  const now = ac.currentTime, t = now + Math.max(0, delay || 0), g = musicBus.gain;
  g.cancelScheduledValues(now); g.setValueAtTime(g.value, now);
  g.setTargetAtTime(MUSIC_GAIN * amt, t, 0.025);
  g.setTargetAtTime(MUSIC_GAIN, t + Math.max(0.05, sec), 0.3);
}
// cutscene music sections: 0 = calm bed, 1 = soft pulse, 2 = full build / celebration (cut_dawn, cut_dusk)
export function musicCue(level) { if (gen && gen.cue) gen.cue(level); }

const CINE = {
  // filtered-noise + two-voice pitch sweep that swells for `dur` (default 1.2 s) and cuts dead on the next hit
  riser: (dur = 1.2) => {
    const t = ac.currentTime + 0.01; dur = Math.max(0.3, Math.min(4, +dur || 1.2));
    layer({ t, dur, vol: 0.26, noise: true, ft: "bandpass", ff0: 350, ff1: 7000, q: 1.6, swell: true, send: 0.35 });
    layer({ t, dur, vol: 0.1, noise: true, ft: "highpass", ff0: 2500, ff1: 9000, q: 0.5, swell: true, send: 0.2 });
    layer({ t, dur, vol: 0.06, type: "triangle", f0: 196, f1: 1568, ft: "lowpass", ff0: 700, ff1: 5000, swell: true, send: 0.3 });
    layer({ t, dur, vol: 0.045, type: "triangle", f0: 294, f1: 2349, ft: "lowpass", ff0: 700, ff1: 5000, swell: true, send: 0.3 });
  },
  // cinematic sub drop + body + crack, long reverb tail
  boom: (delay = 0) => {
    const t = ac.currentTime + 0.005 + (+delay || 0);
    layer({ t, dur: 2.2, vol: 0.75, f0: 90, f1: 26, a: 0.003, send: 0.25 });
    layer({ t, dur: 0.5, vol: 0.4, type: "triangle", f0: 170, f1: 55, a: 0.002, send: 0.5 });
    layer({ t, dur: 0.9, vol: 0.45, noise: true, ft: "lowpass", ff0: 1400, ff1: 120, q: 0.7, a: 0.002, send: 0.95 });
    layer({ t, dur: 0.25, vol: 0.18, noise: true, ft: "bandpass", ff0: 3000, ff1: 800, q: 0.7, a: 0.001, send: 0.6 });
    duck(0.8, 0.5, t - ac.currentTime);
  },
  // character intro: reverse-cymbal swell for `lead` s, then taiko + sub + crash + FM brass stab (F C F A C),
  // then a shimmering đàn tranh glissando up the pentatonic
  hero_hit: (lead = 0) => {
    const now = ac.currentTime + 0.005; lead = Math.max(0, +lead || 0); const t = now + lead;
    if (lead >= 0.1) {
      layer({ t: now, dur: lead, vol: 0.22, noise: true, ft: "highpass", ff0: 2500, ff1: 7000, q: 0.6, swell: true, send: 0.5 });
      layer({ t: now, dur: lead, vol: 0.05, type: "triangle", f0: 349, f1: 698, swell: true, send: 0.6 });
    }
    taiko(t, 0.85);
    layer({ t, dur: 1.4, vol: 0.5, f0: 70, f1: 30, a: 0.003, send: 0.2 });
    layer({ t, dur: 1.6, vol: 0.14, noise: true, ft: "highpass", ff0: 5500, ff1: 3200, q: 0.5, a: 0.002, send: 0.85 });
    brassChord(t, [53, 60, 65, 69, 72], 0.95, 0.065);
    for (let k = 0; k < 10; k++) ksPluck(t + 0.14 + k * 0.045, penta(72, k), 0.11 * (1 - k * 0.05), 1.5, 0.6);
    duck(0.8, 0.5, lead);
  },
  // title card: short whoosh-in, punchy kick + snap, whoosh-through tail, sparkle of high bells
  title_hit: (lead = 0) => {
    const now = ac.currentTime + 0.005; lead = Math.max(0, +lead || 0); const t = now + lead;
    if (lead >= 0.08) layer({ t: now, dur: lead, vol: 0.18, noise: true, ft: "bandpass", ff0: 500, ff1: 3500, q: 1, swell: true, send: 0.3 });
    layer({ t, dur: 0.45, vol: 0.8, f0: 160, f1: 45, a: 0.002, send: 0.3 });
    layer({ t, dur: 0.9, vol: 0.3, f0: 62, f1: 34, a: 0.004, send: 0.15 });
    layer({ t, dur: 0.22, vol: 0.32, noise: true, ft: "bandpass", ff0: 1800, ff1: 1200, q: 0.9, a: 0.001, send: 0.6 });
    layer({ t, dur: 0.5, vol: 0.2, noise: true, ft: "bandpass", ff0: 3500, ff1: 450, q: 1, a: 0.01, send: 0.4 });
    for (let k = 0; k < 8; k++) bellNote(t + 0.08 + k * 0.05, penta(84, k + (k > 3 ? 1 : 0)), 0.035 * (1 - k * 0.06), 1.2, 0.8);
    duck(0.8, 0.5, lead);
  },
  // fast air whoosh (cards / text sliding); arg = volume scale
  swish: (amt = 1) => {
    const t = ac.currentTime + 0.005, v = Math.max(0.05, Math.min(1.5, +amt || 1));
    layer({ t, dur: 0.24, vol: 0.2 * v, noise: true, ft: "bandpass", ff0: 700, ff1: 4200, q: 1.2, a: 0.08, send: 0.25 });
    layer({ t: t + 0.02, dur: 0.2, vol: 0.07 * v, noise: true, ft: "highpass", ff0: 3000, ff1: 6000, q: 0.5, a: 0.06, send: 0.1 });
  },
  // the dive: plunge body + bandpass splash + falling spray + low thump + a trail of bubbles
  splash_big: () => {
    const t = ac.currentTime + 0.005;
    layer({ t, dur: 0.35, vol: 0.45, f0: 150, f1: 45, a: 0.002, send: 0.2 });
    layer({ t, dur: 0.9, vol: 0.5, noise: true, ft: "bandpass", ff0: 2600, ff1: 350, q: 0.6, a: 0.004, send: 0.5 });
    layer({ t: t + 0.03, dur: 1.3, vol: 0.18, noise: true, ft: "highpass", ff0: 4500, ff1: 2500, q: 0.4, a: 0.01, send: 0.6 });
    layer({ t: t + 0.02, dur: 0.6, vol: 0.3, noise: true, ft: "lowpass", ff0: 700, ff1: 150, q: 0.8, a: 0.003, send: 0.3 });
    for (let k = 0; k < 14; k++) {
      const tb = t + 0.25 + Math.pow(Math.random(), 1.4) * 1.3, f = rr(250, 650);
      layer({ t: tb, dur: rr(0.05, 0.12), vol: rr(0.05, 0.1), f0: f, f1: f * rr(2.2, 3), a: 0.004, send: 0.4 });
    }
  },
  // lantern chime: FM bell, i-th note of the pentatonic from C5 upward (0..7 -> C D F G A C D F)
  bell: (i = 0) => {
    const t = ac.currentTime + 0.005, k = Math.max(0, Math.min(14, (+i || 0) | 0)), m = penta(72, k);
    bellNote(t, m, 0.12, 2.4, 0.7);
    layer({ t, dur: 1.2, vol: 0.03, f0: mtof(m - 12), a: 0.01, send: 0.3 }); // warm octave under
  },
  // accelerating frame-drum roll, crescendo, lasting `dur` (default 1 s); ends just before the next hit
  drumroll: (dur = 1) => {
    const t0 = ac.currentTime + 0.01; dur = Math.max(0.3, Math.min(3, +dur || 1));
    let e = 0, n = 0;
    while (e < dur - 0.03 && n < 80) {
      const k = e / dur;
      frameHit(t0 + e, 0.1 + 0.38 * Math.pow(k, 1.5), n % 2 === 1);
      e += 0.13 + (0.028 - 0.13) * Math.pow(k, 0.7); n++;
    }
    layer({ t: t0, dur, vol: 0.12, f0: 80, f1: 110, swell: true, send: 0.2 }); // low swell under the roll
  },
  // short triumphant flourish: pluck run up C D F G A C D F, then a bright FM brass Csus chord + taiko + bells
  sting_win: (delay = 0) => {
    const t = ac.currentTime + 0.005 + Math.max(0, +delay || 0);
    for (let k = 0; k < 8; k++) ksPluck(t + k * 0.055, penta(60, k), 0.13, 1.4, 0.6);
    const h = t + 0.45;
    brassChord(h, [48, 60, 67, 72, 74, 79], 1.3, 0.06);
    taiko(h, 0.5);
    bellNote(h + 0.05, 84, 0.05, 1.8); bellNote(h + 0.12, 91, 0.04, 1.8);
  },
  // ---- action cuts (action_cut.js) ----
  // short pentatonic jingles (đàn tranh plucks + bells + soft FM pad): "hire" bright and bouncy, "warm" slow and glowing
  // (décor), "coins" quick and sparkly (chore reward), "level" rising (training / gear)
  jingle: (kind = "hire") => {
    const t = ac.currentTime + 0.01;
    const J = {
      hire: { base: 67, steps: [0, 2, 4, 2, 5, 7], dt: 0.12, chord: [55, 62, 67, 71], bell: 86 },
      warm: { base: 60, steps: [0, 2, 3, 4, 3, 5], dt: 0.2, chord: [48, 55, 60, 64, 67], bell: 84 },
      coins: { base: 72, steps: [0, 1, 2, 3, 4, 5, 7], dt: 0.07, chord: [60, 67, 72, 76], bell: 91 },
      level: { base: 65, steps: [0, 1, 2, 3, 4, 5, 6, 7], dt: 0.08, chord: [53, 60, 65, 69, 72], bell: 89 },
    }[kind] || null;
    if (!J) return;
    J.steps.forEach((st, k) => ksPluck(t + k * J.dt, penta(J.base - (J.base % 12), st + Math.floor((J.base % 12) / 2)), 0.12, 1.3, 0.6));
    const h = t + J.steps.length * J.dt;
    J.chord.forEach((n, k) => fm({ t: h + k * 0.01, f: mtof(n), dur: 1.4, vol: 0.035, ratio: 2, i0: 1.2, i1: 0.3, a: 0.05, send: 0.6, lp: 3000 }));
    bellNote(h, J.bell, 0.06, 2); bellNote(h + 0.09, J.bell + 7, 0.04, 2);
    duck(J.steps.length * J.dt + 1.2, 0.45);
  },
  // a shower of coin pings over `dur` seconds
  coin_shower: (dur = 1.4) => {
    const t = ac.currentTime + 0.01; dur = Math.max(0.3, Math.min(3, +dur || 1.4));
    for (let k = 0; k < 18; k++) { const tb = t + Math.pow(k / 18, 1.2) * dur, f = [1319, 1568, 1760, 2093][k % 4]; layer({ t: tb, dur: 0.25, vol: 0.05, f0: f, a: 0.002, send: 0.5 }); layer({ t: tb, dur: 0.06, vol: 0.02, f0: f * 2.76, a: 0.001, send: 0.4 }); }
  },
  // glittering bell glissando (sparkle / level-up)
  sparkle: () => { const t = ac.currentTime + 0.01; for (let k = 0; k < 9; k++) bellNote(t + k * 0.04, penta(84, k), 0.03 * (1 - k * 0.06), 1.1, 0.9); },
  // cloth unfurling: soft filtered noise flap
  unfurl: () => { const t = ac.currentTime + 0.01; layer({ t, dur: 0.5, vol: 0.18, noise: true, ft: "bandpass", ff0: 500, ff1: 2400, q: 0.8, a: 0.05, send: 0.3 }); layer({ t: t + 0.32, dur: 0.12, vol: 0.12, noise: true, ft: "lowpass", ff0: 1500, ff1: 400, a: 0.004, send: 0.2 }); },
  // wooden sign flip: clack + air
  flip: () => { const t = ac.currentTime + 0.01; layer({ t, dur: 0.08, vol: 0.3, type: "triangle", f0: 520, f1: 300, a: 0.001, send: 0.3 }); layer({ t: t + 0.18, dur: 0.1, vol: 0.32, type: "triangle", f0: 420, f1: 240, a: 0.001, send: 0.4 }); layer({ t, dur: 0.25, vol: 0.12, noise: true, ft: "bandpass", ff0: 900, ff1: 3000, q: 1, a: 0.04, send: 0.2 }); },
};

export function sfx(name, arg, cap) {
  caption(name, cap); // SFX captions (captions.js): before the mute check so they show while muted
  if (!ac || muted) return;
  const fn = CINE[name] || (/^bell\d+$/.test(name) ? () => CINE.bell(+name.slice(4)) : null);
  if (fn) { if (!cine) return; try { fn(arg); } catch (e) {} return; }
  if (buffers[name]) {
    const s = ac.createBufferSource(); s.buffer = buffers[name];
    s.connect(master); s.start();
    return;
  }
  SYNTH[name]?.();
}
// meme_sfx.js (cutscene meme kit): live context + cinematic bus/reverb send, or null before unlock / while muted
export const memeBus = () => (ac && cine && !muted ? { ac, out: cine, verb: cineVerb } : null);
