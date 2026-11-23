// Meme sound kit for cutscenes (meme_fx.js). WebAudio synth only — no samples, no copyrighted audio. Everything goes
// through audio.js's cinematic bus (compressor + reverb send) via memeBus(), so mute (M) silences it and the sounds sit
// at the same level as the other stingers. SFX captions (captions.js) show for every sound, also while muted.
//
//   msfx(name[, opts])   play now. opts.delay (s), opts.dur (choir / slowmo length), opts.len (airhorn blast length),
//                        opts.cap (caption override, false = none). Returns the sound's length in seconds (0 if unknown).
//   MSFX_NAMES           every name below.
//
// vineboom · scratch · airhorn · choir · whoosh_hit · dundun · sparkle · kaching · sadtrombone · boing · crack · stab ·
// slowmo · drip · tick · sprinkle
import { memeBus, duck } from "./audio.js";
import { caption } from "./captions.js";

const CAP = {
  vineboom: "[BÙM! trầm]", scratch: "[đĩa nhạc rít két]", airhorn: "[kèn hơi inh ỏi]", choir: "[dàn hợp xướng aaa~]",
  whoosh_hit: "[vút — bụp!]", dundun: "[nhạc kịch tính tèn ten tèn]", sparkle: "[lấp lánh]", kaching: "[két tiền ka-ching]",
  sadtrombone: "[kèn buồn óe óe óe]", boing: "[boing!]", crack: "[kính nứt]", stab: "[nhạc giật mình]", slowmo: "[âm thanh quay chậm]",
  drip: "[giọt mồ hôi rơi]", sprinkle: "[rắc muối lách tách]",
};
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
let noise = null;
function noiseBuf(ac) {
  if (noise && noise.sampleRate === ac.sampleRate) return noise;
  noise = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
  const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noise;
}
let curve = null;
function softClip(ac, amt = 3) {
  const sh = ac.createWaveShaper();
  if (!curve) { curve = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; curve[i] = Math.tanh(x * amt) / Math.tanh(amt); } }
  sh.curve = curve; return sh;
}
// envelope gain: attack a, hold to `end - rel`, release rel
function env(ac, t, dur, vol, a = 0.005, rel = 0.08) {
  const g = ac.createGain(), end = t + dur;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + a);
  g.gain.setValueAtTime(Math.max(0.0002, vol), Math.max(t + a, end - rel));
  g.gain.exponentialRampToValueAtTime(0.0001, end);
  return g;
}
// decay envelope: attack a then exponential fall over dur
function dec(ac, t, dur, vol, a = 0.003) {
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  return g;
}
function out(B, node, send = 0.2) {
  node.connect(B.out);
  if (send > 0 && B.verb) { const s = B.ac.createGain(); s.gain.value = send; node.connect(s); s.connect(B.verb); }
}
function osc(ac, type, f0, t, end, f1 = f0, glide = null) {
  const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(15, f1), glide ?? end);
  o.start(t); o.stop(end + 0.05); return o;
}
function noiseSrc(ac, t, end) { const s = ac.createBufferSource(); s.buffer = noiseBuf(ac); s.loop = true; s.start(t, Math.random()); s.stop(end + 0.05); return s; }
function filt(ac, type, f, q = 0.8) { const f2 = ac.createBiquadFilter(); f2.type = type; f2.frequency.value = f; f2.Q.value = q; return f2; }

const S = {
  // deep tom-like boom: pitch-dropping sine + driven triangle body + low thump, long tail; ducks the music
  vineboom(B, t) {
    const { ac } = B;
    const g = dec(ac, t, 1.7, 0.9, 0.004), sh = softClip(ac, 2.5);
    osc(ac, "sine", 150, t, t + 1.7, 42, t + 0.22).connect(sh);
    osc(ac, "triangle", 95, t, t + 1.2, 38, t + 0.3).connect(sh);
    sh.connect(g); out(B, g, 0.35);
    const n = noiseSrc(ac, t, t + 0.25), lp = filt(ac, "lowpass", 380), ng = dec(ac, t, 0.25, 0.5, 0.002);
    n.connect(lp); lp.connect(ng); out(B, ng, 0.2);
    duck(1.2, 0.25, t - ac.currentTime);
    return 1.7;
  },
  // record scratch: noise through a resonant band that whips back and forth, plus a squealing glide; music cut
  scratch(B, t) {
    const { ac } = B, end = t + 0.5;
    const n = noiseSrc(ac, t, end), bp = filt(ac, "bandpass", 800, 5), g = env(ac, t, 0.5, 0.55, 0.004, 0.05);
    const pts = [[0, 700], [0.09, 3200], [0.17, 500], [0.27, 2600], [0.36, 380], [0.5, 1800]];
    for (const [dt, f] of pts) bp.frequency.linearRampToValueAtTime(f, t + dt);
    n.connect(bp); bp.connect(g); out(B, g, 0.1);
    const o = ac.createOscillator(); o.type = "sawtooth"; o.frequency.setValueAtTime(300, t);
    for (const [dt, f] of pts) o.frequency.linearRampToValueAtTime(f * 0.35, t + dt);
    o.start(t); o.stop(end + 0.05);
    const lp = filt(ac, "lowpass", 1800), og = env(ac, t, 0.5, 0.12, 0.004, 0.05); o.connect(lp); lp.connect(og); out(B, og, 0.1);
    duck(2.5, 0.05, t - ac.currentTime);
    return 0.5;
  },
  // one airhorn blast: stacked detuned saws (Bb4-ish) with a scoop up at the attack, driven and band-limited
  airhorn(B, t, o) {
    const { ac } = B, len = Math.max(0.08, o.len ?? 0.55), end = t + len;
    const g = env(ac, t, len, 0.32, 0.012, 0.05), sh = softClip(ac, 4), lp = filt(ac, "lowpass", 3400, 0.7);
    for (const [r, d] of [[1, 0], [1, 9], [1, -11], [2, 4], [1.5, -6]]) {
      const x = ac.createOscillator(); x.type = "sawtooth"; const f = 466 * r;
      x.frequency.setValueAtTime(f * 0.86, t); x.frequency.exponentialRampToValueAtTime(f, t + 0.05); x.detune.value = d;
      const vg = ac.createGain(); vg.gain.value = r === 1 ? 0.3 : 0.14; x.connect(vg); vg.connect(sh); x.start(t); x.stop(end + 0.05);
    }
    sh.connect(lp); lp.connect(g); out(B, g, 0.2);
    return len;
  },
  // "aaah" choir pad: detuned saws through two vowel formants (a: 800 / 1150 Hz), slow swell, vibrato, big reverb
  choir(B, t, o) {
    const { ac } = B, dur = Math.max(1, Math.min(6, o.dur ?? 2.6)), end = t + dur;
    const chord = o.chord === "minor" ? [57, 60, 64, 69] : [60, 64, 67, 72, 76];
    const g = env(ac, t, dur, 0.22, Math.min(0.7, dur * 0.3), Math.min(0.8, dur * 0.35));
    const f1 = filt(ac, "bandpass", 800, 4), f2 = filt(ac, "bandpass", 1150, 5), f3 = filt(ac, "lowpass", 600, 0.5);
    const mix = ac.createGain(); mix.gain.value = 1; f1.connect(mix); f2.connect(mix); f3.connect(mix); mix.connect(g);
    const lfo = ac.createOscillator(); lfo.frequency.value = 5.2; const lg = ac.createGain(); lg.gain.value = 9; lfo.connect(lg); lfo.start(t); lfo.stop(end + 0.05);
    for (const m of chord) for (const d of [-7, 6]) {
      const x = ac.createOscillator(); x.type = "sawtooth"; x.frequency.value = mtof(m); x.detune.value = d; lg.connect(x.detune);
      const vg = ac.createGain(); vg.gain.value = 0.09; x.connect(vg); vg.connect(f1); vg.connect(f2); vg.connect(f3); x.start(t); x.stop(end + 0.05);
    }
    out(B, g, 0.9);
    duck(dur, 0.35, t - ac.currentTime);
    return dur;
  },
  // air swell that slams into a punchy low hit + snap
  whoosh_hit(B, t) {
    const { ac } = B, h = t + 0.16;
    const n = noiseSrc(ac, t, h), bp = filt(ac, "bandpass", 600, 1.2), g = ac.createGain();
    bp.frequency.setValueAtTime(500, t); bp.frequency.exponentialRampToValueAtTime(4200, h);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, h); g.gain.linearRampToValueAtTime(0, h + 0.02);
    n.connect(bp); bp.connect(g); out(B, g, 0.2);
    const kg = dec(ac, h, 0.5, 0.8); osc(ac, "sine", 170, h, h + 0.5, 40, h + 0.25).connect(kg); out(B, kg, 0.25);
    const sn = noiseSrc(ac, h, h + 0.18), sf = filt(ac, "bandpass", 1900, 0.9), sg = dec(ac, h, 0.18, 0.4, 0.001); sn.connect(sf); sf.connect(sg); out(B, sg, 0.5);
    return 0.7;
  },
  // dramatic "dun dun duuun": two short brassy stabs and a long lower one with tremolo + timpani
  dundun(B, t) {
    const { ac } = B;
    const notes = [[0, 55, 0.22], [0.32, 55, 0.22], [0.64, 51, 1.3]];
    for (const [dt, m, len] of notes) {
      const s = t + dt, end = s + len, g = env(ac, s, len, 0.2, 0.015, len > 1 ? 0.5 : 0.06), lp = filt(ac, "lowpass", 1500, 1);
      for (const [mm, v] of [[m, 0.5], [m - 12, 0.45], [m + 7, 0.2]]) { const x = osc(ac, "sawtooth", mtof(mm), s, end); const vg = ac.createGain(); vg.gain.value = v; x.connect(vg); vg.connect(lp); }
      if (len > 1) { const tr = ac.createOscillator(); tr.frequency.value = 7; const tg = ac.createGain(); tg.gain.value = 0.07; tr.connect(tg); tg.connect(g.gain); tr.start(s); tr.stop(end); }
      lp.connect(g); out(B, g, 0.5);
      const kg = dec(ac, s, 0.6, 0.55); osc(ac, "sine", 110, s, s + 0.6, 45, s + 0.3).connect(kg); out(B, kg, 0.4);
    }
    duck(2.2, 0.35, t - ac.currentTime);
    return 2;
  },
  // glittering bell run, pentatonic, high
  sparkle(B, t) {
    const { ac } = B;
    [84, 86, 89, 91, 93, 96, 98, 101].forEach((m, k) => {
      const s = t + k * 0.045, g = dec(ac, s, 0.7, 0.07 * (1 - k * 0.07), 0.002);
      osc(ac, "sine", mtof(m), s, s + 0.7).connect(g);
      const g2 = dec(ac, s, 0.15, 0.025, 0.001); osc(ac, "sine", mtof(m) * 3.7, s, s + 0.15).connect(g2); out(B, g2, 0.6);
      out(B, g, 0.7);
    });
    return 1;
  },
  // cash register: two mechanical clacks, drawer rattle, then the bright "ching" bell
  kaching(B, t) {
    const { ac } = B;
    for (const dt of [0, 0.07]) { const n = noiseSrc(ac, t + dt, t + dt + 0.05), f = filt(ac, "bandpass", 2200, 2), g = dec(ac, t + dt, 0.05, 0.4, 0.001); n.connect(f); f.connect(g); out(B, g, 0.1); }
    const rn = noiseSrc(ac, t + 0.1, t + 0.28), rf = filt(ac, "highpass", 3000, 0.7), rg = dec(ac, t + 0.1, 0.18, 0.12, 0.01); rn.connect(rf); rf.connect(rg); out(B, rg, 0.2);
    const c = t + 0.16;
    for (const [f, v, d] of [[2637, 0.16, 1.1], [3520, 0.12, 0.9], [5274, 0.05, 0.5], [7040, 0.03, 0.3]]) { const g = dec(ac, c, d, v, 0.002); osc(ac, "sine", f, c, c + d).connect(g); out(B, g, 0.5); }
    return 1.3;
  },
  // "wah wah wah waaah": four falling notes, each a filter "wah", the last one long with a wobbling vibrato
  sadtrombone(B, t) {
    const { ac } = B;
    const notes = [[0, 62, 0.38], [0.42, 61, 0.38], [0.84, 60, 0.38], [1.26, 59, 1.15]];
    for (const [dt, m, len] of notes) {
      const s = t + dt, end = s + len, x = ac.createOscillator(); x.type = "sawtooth"; x.frequency.value = mtof(m - 12);
      if (len > 1) { const v = ac.createOscillator(); v.frequency.setValueAtTime(5, s); v.frequency.linearRampToValueAtTime(7, end); const vg = ac.createGain(); vg.gain.setValueAtTime(0, s); vg.gain.linearRampToValueAtTime(5, s + 0.3); v.connect(vg); vg.connect(x.frequency); v.start(s); v.stop(end + 0.05); }
      else x.frequency.linearRampToValueAtTime(mtof(m - 12) * 0.97, end);
      x.start(s); x.stop(end + 0.05);
      const lp = filt(ac, "lowpass", 400, 4);
      lp.frequency.setValueAtTime(350, s); lp.frequency.exponentialRampToValueAtTime(1500, s + Math.min(0.18, len * 0.4)); lp.frequency.exponentialRampToValueAtTime(450, end);
      const g = env(ac, s, len, 0.28, 0.03, len > 1 ? 0.4 : 0.08);
      x.connect(lp); lp.connect(g); out(B, g, 0.3);
    }
    duck(2.6, 0.3, t - ac.currentTime);
    return 2.4;
  },
  // spring boing: sine that wobbles up with a decaying vibrato
  boing(B, t) {
    const { ac } = B, end = t + 0.5, x = ac.createOscillator(); x.type = "sine";
    x.frequency.setValueAtTime(180, t); x.frequency.exponentialRampToValueAtTime(520, t + 0.12); x.frequency.exponentialRampToValueAtTime(380, end);
    const v = ac.createOscillator(); v.frequency.value = 16; const vg = ac.createGain(); vg.gain.setValueAtTime(70, t); vg.gain.exponentialRampToValueAtTime(1, end); v.connect(vg); vg.connect(x.frequency);
    const g = dec(ac, t, 0.5, 0.3, 0.004); x.connect(g); out(B, g, 0.2); x.start(t); x.stop(end + 0.05); v.start(t); v.stop(end + 0.05);
    return 0.5;
  },
  // glass crack: three sharp high clicks + crunch
  crack(B, t) {
    const { ac } = B;
    [0, 0.035, 0.09].forEach((dt, k) => { const s = t + dt, n = noiseSrc(ac, s, s + 0.06), f = filt(ac, "highpass", 3000 + k * 800, 1), g = dec(ac, s, 0.06, 0.4 - k * 0.08, 0.001); n.connect(f); f.connect(g); out(B, g, 0.4); });
    const n = noiseSrc(ac, t, t + 0.3), f = filt(ac, "bandpass", 5000, 0.6), g = dec(ac, t, 0.3, 0.12, 0.005); n.connect(f); f.connect(g); out(B, g, 0.5);
    return 0.35;
  },
  // anime "shock" orchestra stab: wide chord of saws, hard attack, short, with a sub drop
  stab(B, t) {
    const { ac } = B, len = 0.45, g = dec(ac, t, len, 0.35, 0.003), lp = filt(ac, "lowpass", 2600, 0.8);
    for (const m of [50, 57, 62, 65, 69, 74]) for (const d of [-8, 8]) { const x = osc(ac, "sawtooth", mtof(m), t, t + len); x.detune.value = d; const vg = ac.createGain(); vg.gain.value = 0.1; x.connect(vg); vg.connect(lp); }
    lp.connect(g); out(B, g, 0.5);
    const kg = dec(ac, t, 0.6, 0.7); osc(ac, "sine", 140, t, t + 0.6, 35, t + 0.4).connect(kg); out(B, kg, 0.2);
    return 0.6;
  },
  // slow-motion: pitched-down whoosh drone + slow heartbeat
  slowmo(B, t, o) {
    const { ac } = B, dur = Math.max(1, Math.min(5, o.dur ?? 3)), end = t + dur;
    const g = env(ac, t, dur, 0.22, 0.4, 0.8), lp = filt(ac, "lowpass", 700, 1.5);
    lp.frequency.setValueAtTime(900, t); lp.frequency.exponentialRampToValueAtTime(220, end);
    for (const d of [-10, 10]) { const x = osc(ac, "sawtooth", 98, t, end, 41); x.detune.value = d; x.connect(lp); }
    lp.connect(g); out(B, g, 0.6);
    for (let k = 0; k * 0.9 < dur - 0.3; k++) for (const [dt, v] of [[0, 0.5], [0.22, 0.35]]) { const s = t + 0.3 + k * 0.9 + dt, hg = dec(ac, s, 0.2, v); osc(ac, "sine", 62, s, s + 0.2, 40).connect(hg); out(B, hg, 0.1); }
    duck(dur, 0.3, t - ac.currentTime);
    return dur;
  },
  // awkward sweat drop: a falling "bloop"
  drip(B, t) {
    const { ac } = B, g = dec(ac, t, 0.35, 0.25, 0.004);
    osc(ac, "sine", 1200, t, t + 0.35, 260, t + 0.25).connect(g); out(B, g, 0.3);
    return 0.35;
  },
  // salt sprinkle (Salt Bae): a stream of tiny high noise grains over a soft shaker hiss
  sprinkle(B, t, o) {
    const { ac } = B, dur = Math.max(0.4, Math.min(4, o.dur ?? 1.2)), n = Math.round(dur * 30);
    for (let i = 0; i < n; i++) {
      const s = t + (i / n) * dur + Math.random() * 0.02, g = dec(ac, s, 0.03, 0.04 + Math.random() * 0.05, 0.001);
      const ns = noiseSrc(ac, s, s + 0.03), f = filt(ac, "highpass", 5000 + Math.random() * 3000, 0.7); ns.connect(f); f.connect(g); out(B, g, 0.15);
    }
    const ns = noiseSrc(ac, t, t + dur), bp = filt(ac, "bandpass", 7000, 1.2), g = env(ac, t, dur, 0.05, 0.05, Math.min(0.2, dur * 0.3)); ns.connect(bp); bp.connect(g); out(B, g, 0.2);
    return dur;
  },
  // tiny ui tick (glasses stepping down etc.)
  tick(B, t) { const { ac } = B, g = dec(ac, t, 0.04, 0.06, 0.001); osc(ac, "square", 1800, t, t + 0.04).connect(g); out(B, g, 0); return 0.04; },
};
export const MSFX_NAMES = Object.keys(S);

export function msfx(name, o = {}) {
  if (!S[name]) return 0;
  if (name !== "tick") caption("meme_" + name, o.cap === false ? false : o.cap || CAP[name]);
  const B = memeBus(); if (!B) return 0;
  try { return S[name](B, B.ac.currentTime + 0.005 + Math.max(0, o.delay || 0), o) || 0; } catch (e) { return 0; }
}
