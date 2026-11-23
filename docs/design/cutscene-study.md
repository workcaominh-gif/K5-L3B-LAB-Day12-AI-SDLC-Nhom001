# Cutscene study: how *Dave the Diver* stages its mini-cutscenes

Purpose: learn the **staging grammar** (camera, framing, timing, rewards) of *Dave the Diver* (MINTROCKET, 2023) and turn it into short, original mini-cutscenes (đoạn phim ngắn) for **Quán Ăn Chợ Nổi**, using our player in `client/src/cutscene.js`.

Companion file: `docs/design/reference-scenes.md` (screen layouts). This file is only about cutscenes.

**Rules for this file**
- Sources are two YouTube videos the user picked. Nothing was downloaded. Frames were looked at in a browser tab and **not saved** into the repo.
- Observations come from about 75 paused frames. **We had no audio.** Every music or SFX note below is an inference from what is on screen (flashes, impacts, mouth shapes, cuts), and is marked *(inferred)*.
- All DtD characters, names, jokes and art belong to MINTROCKET / NEXON. We copy techniques, never content. See section 4.

---

## 1. The two videos

### Video A: "Dave the Diver - All Animations" (CrankyTemplar)

https://www.youtube.com/watch?v=hQLNl4mwhPM · 21:37 · a compilation of every animated cutscene before the October 2023 update, with 52 YouTube chapters. The uploader's description calls them "by far the best part of the game".

The chapters fall into seven families. Their lengths come from the chapter timestamps:

| Family | Chapters (start) | Typical length | What triggers it in the game |
|---|---|---|---|
| Dish enhancement (the chef upgrades a recipe) | 0:00, 0:21, 0:33, 0:41 | 8–36 s | Player spends money and ingredients to level up a dish |
| Research / new recipe | 1:17, 1:25, 1:41, 1:54 | 8–17 s | New recipe unlocked, VIP order cooked |
| Weapon craft / upgrade | 2:11, 2:34, 2:49, 3:03, 3:16 | 13–32 s | Player crafts or upgrades a gun in the shop app |
| VIP / judge tasting reactions | 5:06 → 6:30 (7 people) | 10–35 s | A special guest eats the dish the player served |
| Cook-off rivals (intro, lose, win) | 7:05 → 10:37 | 20–32 s | Story contest beats |
| Restaurant rank-up (Silver to Diamond) | 13:08, 13:29, 13:53, 14:22 | 21–29 s | Rank threshold reached at the end of a night |
| Time passing | 14:48, 14:53, 14:57 | **4–6 s** | Player skips to the next time of day |
| Story set pieces | 15:03 → 21:28 | 10 s–2 min | Main plot |

#### Observed moments (Video A)

| Time | Chapter | What is on screen |
|---|---|---|
| 0:01 | Enhancement 1 | High-angle shot of the chef slicing at the counter. Out-of-focus blossom branches fill the right half in the foreground, which gives depth to a 2D frame. |
| 0:09 | Enhancement 1 | Frontal medium shot. The knife is held vertically in front of the face and a glint runs down the blade. Behind him is an aquarium wall with fish silhouettes. This is a "ready" pose. |
| 0:13 | Enhancement 1 | Extreme close-up of the face with the knife edge and a small piece of food. A comedic tasting beat. |
| 0:17 | Enhancement 1 | Cutaway: one fish stares at the camera through the glass, mouth open. A reaction shot from a bystander (here, a fish). |
| 0:26 | Enhancement 2 | Extreme close-up of hands on a dark background, lit from below. |
| 0:36 | Enhancement 3 | **Comic panel split.** Three panels with black diagonal gutters: top left, the chef tightens his sash; bottom left, a cleaver on a fish; tall right panel, a pan flips with ingredients flying over flames. All three move at once. |
| 0:50 | Enhancement 4 | **Spotlight finale.** A single top-down cone of light on black, arms spread wide, knife in hand, a presentation pose. *(inferred: musical hit on the pose)* |
| 1:06 | Enhancement 4 | Wide **establishing shot of the restaurant at night**, a painted, 3D-looking exterior with glowing lanterns. The upgrade ends by showing the place, not the person. |
| 1:13 | Research 1 | Spotlight on black again. A slow two-handed knife draw at chest height. |
| 1:20 | Research 2 | Profile shot. He leans over a cutting board next to a glass bottle, a quiet "thinking" beat. |
| 1:32 | Coral Porridge | Macro shot of glowing charcoal under a grill, a hand fan at the frame edge. Food porn close-up. |
| 1:44 | Coral Porridge | Over-the-shoulder two-shot: a customer holds up a net bag, the chef strokes his chin. The setup of the joke. |
| 1:57 | VIP Cooking | **White-out flash** with a radial ink burst behind the chef (power-up aura). |
| 2:04 | VIP Cooking | Diagonal split: hands gripping a handle on the left, a huge blade slicing through steam on the right. |
| 2:15 | Crafting Guns 1 | Extreme close-up, symmetric framing: the craftsman puts on headphones, eyes hidden by glare on his glasses. |
| 2:30 | Crafting Guns 1 | A hand reaches toward a glowing spark with a mechanical claw from the other side. A famous-painting parody composition with golden light. |
| 2:52 | Enhancing Guns 1 | Tight face shot reading a slip of paper, with a nervous sweat drop. |
| 3:06 | Enhancing Guns 2 | Close-up of the finished gun held in front of the character's printed T-shirt. |
| 3:18 | Max Gun Enhancement | Dark frame. Only the face and a glowing object in the palm are lit. |
| 3:35 | Max Gun Enhancement | A second character's close-up, holding the weapon, fist raised. |
| 5:07 → 5:15 | VIP 1 | **Tasting reaction in three steps.** (1) Stern close-up, head and shoulders on a dark vignette. (2) A red glow spreads behind her and her hands rise. (3) Hard cut to a full-body shot on a flat **pattern background** (a wall of pixel hearts). |
| 5:20 | VIP 2 | Close-up with sunglasses, eating with chopsticks. Stone face. |
| 5:31 → 5:40 | VIP 3 | Mouth open shouting on black, then a cut to the same man grinning on a **painted pastel sky with a rainbow**, a "fantasy background swap". |
| 5:52 → 6:00 | VIP 4 | A mascot shouting under a diagonal spotlight, then a **stage of light bulbs** with pink and blue beams crossing a face. |
| 6:08 → 6:22 | VIP 5 | Hunched figure in shadow, then a farm vehicle with glowing headlights on a jagged burst backdrop. A visual metaphor for the taste. |
| 6:40 → 6:58 | VIP 6 | Neutral grey studio background, then darkness and teary eyes. The joke here is emotion, not action. |
| 7:07 → 7:13 | Contest intro | Medium close-up of a singer with a microphone, eyes closed, then a tighter shot with the mouth wide open. |
| 7:30 | Losing | Judge in sunglasses, mouth turned down, **held** for a long time. Disappointment shown by holding still. |
| 7:58 | Winning | **Split screen of two finished dishes** side by side, a lavish pixel food close-up. |
| 13:10 | Silver | Wide restaurant interior (the playable view). Two inspectors walk in at the left. |
| 13:16 | Silver | Two-shot medium of the inspectors, arms crossed, deadpan. |
| 13:23 | Silver | Dramatic back-to-back pose: one inspects a plate, the other sniffs a fish. |
| 13:29 | Silver → Gold | **Reward UI over the dimmed game view**: laurel wreath, chef-hat icon, ribbon, "Silver acquired", one OK button. |
| 13:36 | Gold | Back to the playable wide shot. Control returns at once. |
| 13:44 | Gold | Same inspectors close up, with a background gag: a boss figure stroking a cat. |
| 14:49 | Passing time (day) | **Pillarboxed, painted (non-pixel) vignette** inside an inner frame: the hero lounging on the boat, reading. |
| 14:54 | Passing time (restaurant) | Same framing: lounging on a deck chair, drink on the side table. |
| 14:59 | Passing time (night) | Same framing, night palette, playing a handheld console. |
| 18:10 | Story (Gadon) | Dark rocks, a clawed hand reaching out: horror register. |
| 18:30 | Story | Diver seen from above, drifting into a dark tunnel. Bubble trail. |

### Video B: "Duff Crafts Weapon Cutscene - Dave the Diver" (playthrough channel)

https://www.youtube.com/watch?v=bd_UcBNPBiQ · **0:22** · one complete loop: game UI, then cutscene, then reward UI. Sampled every ~1.5 s.

| Time | Beat | What is on screen |
|---|---|---|
| 0:00 | Gameplay | Boat on the sea at the dock. A phone slides up from the bottom right (an in-world phone used as a menu). |
| 0:02 | UI | Phone app grid, with the hint "Open the Weapon Shop app". |
| 0:03.5 | UI | Shop app: item card with stats on the right, a "You've collected all the materials… create a new weapon" dialog with OK / Cancel, and a tiny pixel crafter at his desk in the corner. |
| 0:04.3 | **Cut in** | Over-the-shoulder back shot at the desk: glowing monitor, figurine, bullets, soda cup. A **black bar fades in** at the bottom (letterbox = "now it's a cutscene"). |
| 0:06.5 | Close-up | Face, monitor glow from below, one finger pushing up the glasses. A "getting serious" cue. |
| 0:08 | **Mood flip** | Background turns **pink with light streaks**. The glasses flash white. *(inferred: music switches to a dreamy cue)* |
| 0:09.5 | Tilt | Camera tilts down to the printed T-shirt. |
| 0:11 | Insert | Open palm with a glowing gem and sparkles: the "magic ingredient". |
| 0:12.3–0:13.5 | Gag | Extreme close-ups of a silly ritual with the tool. The comedy peak. |
| 0:15–0:18 | Composite | A figurine in the foreground, his face in the background, a bright light between them. Slow push-in. |
| 0:19.5 | **Hard cut to black** | About 1 s of black. A breath before the payoff. *(inferred: silence or a sting)* |
| 0:21 | **Reward card** | Back in the shop UI: a neon-framed "NEW WEAPON" card with the item sprite and name, and a call to action, "Equip the weapon right away?", OK / Cancel. |

So the purchase loop is: **click (UI) → ~15 s cutscene → reward card with an immediate next action**. The cutscene replaces a progress bar, and the reward card turns it straight back into gameplay.

---

## 2. The cutscene grammar (ngữ pháp cắt cảnh)

### 2.1 Recurring techniques

1. **A cutscene goes into close-up.** Gameplay is a wide, small-sprite view. Every cutscene opens at medium or close-up with *large* pixel art (the face fills 60–90% of the frame height). That change of scale alone says "this is a cutscene". The way back is always a wide shot (1:06 restaurant exterior, 13:36 playable view).
2. **Pixel figures over painted, softer backgrounds.** The characters are crisp pixel art. Backgrounds are blurred, gradient, spotlit or painted (aquarium, sky, stage, exterior that looks 3D). Depth-of-field foreground objects (blossoms at 0:01) add layers.
3. **Spotlight on black.** One top-down cone of light, everything else black (0:50, 1:13, 5:52). It is cheap to draw and isolates the pose.
4. **Fantasy background swap** (đổi phông tưởng tượng). The reaction shot cuts to an unreal, flat or patterned backdrop: hearts, a rainbow sky, a stage of bulbs, pink streaks, a burst. The *character stays the same*, only the world behind changes. This is the main comedic device of the reaction scenes.
5. **Comic panel split** (chia khung truyện tranh). Two or three slanted panels with thick black gutters, each showing a different action at the same moment (0:36, 2:04, 7:58).
6. **Power-up flash.** A white-out with a radial burst or rays behind the character (1:57). It marks the moment something levels up.
7. **The glint.** A light runs along a blade, glasses flash white, a gem glows. One small bright highlight on a dark frame marks the moment of quality.
8. **Insert close-ups of hands and tools.** Hands, knives, a fan over coals, a palm with a gem. These tell the player what is being made without words.
9. **Reaction cutaway.** A bystander (a fish, an inspector, a boss with a cat) reacts. It gives the joke a second beat.
10. **Three-step tasting reaction.** Neutral → building (glow or vignette creeping in) → **explosion** (background swap, full body). There is often a deliberate *hold* on the neutral face before the payoff.
11. **Holding still to land a joke.** Losing and judging beats keep a frowning face still for 2–4 s. In this game, comedy comes from timing, not motion.
12. **Pillarboxed time-skip vignettes.** Painted frames inside an inner border, 4–6 s, one per time of day. A different art style marks that this is "not real time".
13. **Letterbox in, hard cut to black out.** The cutscene starts when a black bar slides in and ends with a short black frame before the UI returns (Video B 0:19.5).
14. **Reward UI over the dimmed game.** A centered card (laurel, ribbon, icon, one-line text, one button) over the darkened gameplay view (13:29), or a neon "NEW …" card inside the shop (B 0:21). The call to action is "use it now".

### 2.2 Beat lengths and rhythm

- **Shots inside a cutscene last 1.2–3 s.** In Video B there are about 9 distinct shots in about 15 s, a cut every ~1.7 s.
- **Hold beats** (frozen frown, black frame) last 0.8–1.5 s and come just before a payoff.
- **Total length depends on how often the scene plays:**
  - played every in-game day → 4–6 s (time passing);
  - played per purchase or upgrade → 8–20 s;
  - played once per rank or story event → 20–35 s or more.
- Every cutscene ends **on a hard visual accent** (pose, exterior reveal, reward card), never on a fade to nothing.

### 2.3 How often control is taken away

- Purchase and upgrade cutscenes interrupt the player at the moment they **chose** to spend, so the interruption feels earned.
- Tasting and rank-up scenes happen **during or after the night service**, at natural pauses.
- Time-skip vignettes are skippable filler, kept tiny.
- Control returns straight into a UI with one obvious button (OK / Equip) or into the playable wide shot.

### 2.4 How cutscenes reward the player

| Player action | Cutscene shows | Lands on |
|---|---|---|
| Upgrade a dish | The chef performing with growing intensity (panels, flash, spotlight) | Restaurant exterior at night (the place is now "better") |
| Craft a weapon | The craftsman's ritual and the magic ingredient | "NEW item" card + "equip now?" |
| Serve a VIP | Neutral → explosion reaction | Return to service (implied tip or bonus) |
| Rank up | Inspectors judge, deadpan | Medal card "… acquired" |
| Skip time | Hero relaxing | Next phase of the day |

The pattern: **effort → spectacle that personifies the upgrade → a concrete token (card or medal) → back to play**.

---

## 3. Adaptation plan for Quán Ăn Chợ Nổi

### 3.1 What `cutscene.js` already covers

| DtD technique | Our existing step |
|---|---|
| Letterbox in | built in (`bars`) |
| Name slam, speed lines, halftone | `intro` card (`drawIntroCard`, `speedLines`, `halftone`, `slamText`) |
| Text band slam | `title` card |
| Flash, shake, hitstop | `flash`, `shake`, and the card impact calls `fx.hitstop` |
| Camera move | `cam` tween (but **`cam.z` is never applied to drawing**, see below) |
| Dialogue with portrait + babble | `say` |
| Location or time caption | `caption` |
| Riser into the impact, stingers, ducking | `stinger`, `duck`, `musicCue`, auto-armed `riser` |
| Fade, wait | `fade`, `wait` |

### 3.2 What to add (small, ordered by value)

1. **`zoom` that actually renders.** In `Cutscene.draw()`, wrap `this.bg(c, this)` in `c.save(); c.translate(W/2,H/2); c.scale(cam.z,cam.z); c.translate(-W/2,-H/2)` (integer-snapped for pixels). Then `{ cam:{z:1.6}, dur:0.12, ease:"out" }` gives the "punch-in".
2. **`punch` step** (instant): `{ punch: 1.5 }` sets `cam.z`, calls `fx.hitstop(0.08)`, `fx.flash("#fff",0.08)` and `sfx("slam")`, then tweens z back to 1 over 0.35 s. This is the freeze-frame + zoom punch.
3. **`aura` step**, the fantasy background swap: `{ aura: "lotus"|"rays"|"lanterns"|"waves"|"none", col, dur }`. It draws a full-screen backdrop *behind* the close-up portrait. Patterns are our own: lotus-petal tiles, radial sun rays, lantern bokeh, wave stripes.
4. **`pose` step**, a large pixel close-up: `{ pose: "sen_wow", x, y, s: 6, from: "left"|"bottom", dur }`. It uses `portrait()` scaled up (like the intro card) but without the card chrome. It needs expression variants in `art.js PORTRAITS`: `sen_wow`, `sen_proud`, `ba_stern`, `ba_smile`, `ti`, `bay`.
5. **`panels` step**, the comic split: `{ panels: [drawA, drawB, drawC], layout: "2diag"|"3L", dur, stagger: 0.12 }`. Each panel is a clipped polygon with a 3 px `#1a1220` gutter and slides in with its stagger delay.
6. **`reward` card type** (next to `intro` and `title`): `{ reward: { icon, label: "MÓN MỚI", name, sub, cta: "Dùng ngay" } }`. It shows a stamp-style seal (con dấu đỏ) slammed onto a paper card over the dimmed scene, with `bell` + `sting_win`. It ends the scene and hands `cta` to the caller.
7. **`frame` step** (pillarbox): `{ frame: "inner", col: "#f3d27a" }` draws an inner border for "time passes" vignettes.
8. **Mini mode.** Add an option `new Cutscene(steps, onDone, { mini: true })`: tap or confirm skips after 0.4 s (instead of holding Esc), `say` gets `auto: <sec>` so lines advance on their own, and there is a `once` key so the full version plays the first time and later plays use `short` (only the last 2–3 beats).

### 3.3 Six mini-cutscene scripts

Conventions: `bg` functions are ours (`raftNight`, `raftDay`, `riverUnder`, `kitchenClose`, `shopBoard`). New steps from 3.2 are marked ★. Durations are in seconds. All are **skippable** (mini mode) and **original**.

#### S1. Hiring staff: "Bé Tí vào làm" (waiter) — 4.6 s

| t | Beat | Step(s) | Camera / framing | Text | Audio |
|---|---|---|---|---|---|
| 0.0 | Raft at night, wide; a small sampan bumps the raft | `{bg: raftNight}`, `{set:{boat:0}}`, `{tween:{boat:1}, dur:0.6, wait:true}` | wide, letterbox in | — | `{duck:1.5}`, `sfx:"splash"` |
| 0.6 | Tí leaps onto the deck holding a stack of bowls; the bowls wobble | `{tween:{hop:1}, dur:0.4, ease:"out", wait:true}`, `{shake:2}` | ★`punch:1.3` on landing | — | `sfx:"whoosh"`, `sfx:"slam"` |
| 1.0 | Hold: the top bowl tips… and he catches it with his head | `{wait:0.5}`, then `{set:{bowlOnHead:1}}` | ★`cam {z:1.5}` on Tí, 0.2 s | — | `sfx:"ding"` |
| 1.6 | Intro card | `{intro:{name:"BÉ TÍ", sub:"Chạy bàn · bưng 5 tô không đổ một giọt", tag:"NHÂN VIÊN MỚI", portrait:"ti", colA:"#2f8f5b", colB:"#ffcf4a", nameCol:"#fff"}, dur:2.4}` | card (auto riser) | name slam | `hero_hit` (built in) |
| 4.0 | Bà Tư nods (auto-advance line) | `{say:"Bà Tư", portrait:"ba", text:"Được! Mai đi làm sớm nghen.", auto:0.6}`★ | — | short line | babble |
| 4.6 | Back to the shop with the staff slot filled | end | — | — | `sfx:"coin"` |

**Chú Bảy (cook) variant, 5.0 s:** replace the boat hop with ★`panels` 3L: [knife chops green onion · wok flame burst · a bowl set down, steam curling] (1.2 s, stagger 0.12, `sfx:"sizzle"` + `flash:"#ffb35c"`), then `intro` with name `"CHÚ BẢY"`, sub `"Bếp phó · lửa lớn, tay nhanh"`, colours `#a33a2a / #f3d27a`.

#### S2. Buying a decoration: "Treo đèn lồng" (raft transforms) — 4.2 s

| t | Beat | Step(s) | Camera | Text | Audio |
|---|---|---|---|---|---|
| 0.0 | Raft at dusk, dim, slightly bare | `{bg: raftNight}`, `{set:{deco:0, glow:0}}`, `{cam:{x:0,y:0,z:1}}` | wide | — | `{duck:2}` |
| 0.2 | Út Sen on a stool hooks up the first lantern | `{tween:{hang:1}, dur:0.5, wait:true}` | ★`cam {z:1.4, x:+40}`, 0.4 s | — | `stinger:"bell", arg:0` |
| 0.7 | Lanterns light one by one across the eaves (chain) | `{tween:{deco:1}, dur:1.0, wait:true}` | camera pulls back to z 1 over 1.0 s | — | `bell1`…`bell4` at 0.25 s intervals (`{stinger:"bell2"}` …), then a `riser` armed automatically |
| 1.7 | **Reveal**: the whole raft glows, reflections in the water, boats nearby slow down | `{set:{glow:1}}`, `{flash:"#ffe9b0", t:0.15}` | wide, slight ★`punch:1.1` | — | `stinger:"sting_win"` |
| 2.0 | Reward card | ★`{reward:{icon:"lantern", label:"TRANG TRÍ MỚI", name:"Đèn lồng giấy đỏ", sub:"+5% khách ghé quán", cta:"Xem quán"}, dur:2.2}` | card over dimmed raft | stamp | `slam` + `bell` |
| 4.2 | end | | | | |

The DtD lesson applied: the upgrade ends on **the place**, seen wide, not on a menu.

#### S3. Buying gear: "Bình dưỡng khí mới" (O₂ tank) — 4.8 s · spear variant included

| t | Beat | Step(s) | Camera | Text | Audio |
|---|---|---|---|---|---|
| 0.0 | Shop board UI dims; cut to the workbench at the landing (bến) | `{bg: shopBoard}`, `{fade:"out", dur:0.15, wait:true}`, `{bg: kitchenClose}`, `{fade:"in", dur:0.15}` | close, letterbox | — | `sfx:"swish"` |
| 0.3 | Hands tighten the valve (insert close-up) | `{tween:{valve:1}, dur:0.6, wait:true}` | ★`pose` hands sprite, z 2 | — | `sfx:"click"` ×2 |
| 0.9 | Út Sen hugs the tank, cheek pressed to it; the tank gleams (glint) | ★`{pose:"sen_proud", from:"bottom", dur:0.3}`, `{set:{glint:1}}`, `{tween:{glint:0}, dur:0.5}` | medium close-up | — | `stinger:"riser", arg:0.8` |
| 1.7 | **Aura swap**: background becomes rising bubbles + rays | ★`{aura:"bubbles", col:"#1aa6a0"}`, `{flash:"#e8fbff", t:0.1}` | same framing, ★`punch:1.25` | — | `stinger:"splash_big"`, `{musicCue:2}` |
| 2.2 | Title band | `{title:{text:"+20 GIÂY DƯỚI NƯỚC", sub:"Bình dưỡng khí 2 lít", color:"#7ee8ff"}, dur:1.8}` | band | slam | `title_hit` (built in) |
| 4.0 | Reward card with CTA | ★`{reward:{icon:"tank", label:"ĐỒ LẶN MỚI", name:"Bình O₂ 2 lít", cta:"Đeo ngay"}, dur:0.8}` | | | `sting_win` |

**Spear (xiên cá) variant, 4.5 s:** in the insert, the spear tip is filed (`sfx:"pick"` ×3); a glint runs down the shaft; Út Sen does a practice thrust, ★`punch:1.4`; `aura:"rays"`; title `"MŨI XIÊN BÉN HƠN"`, sub `"Bắt cá to dễ hơn"`.

#### S4. Finishing a chore for Bà Tư: "Nội khen" — 3.4 s

The three-step reaction, with a pause before the payoff.

| t | Beat | Step(s) | Camera | Text | Audio |
|---|---|---|---|---|---|
| 0.0 | Út Sen sets down the chore item (a basket of washed bowls) | `{bg: raftDay}`, `{tween:{put:1}, dur:0.4, wait:true}` | medium two-shot | — | `sfx:"pick"`, `{duck:2.5}` |
| 0.4 | **Hold**: Bà Tư, stern, inspects one bowl against the light | ★`{pose:"ba_stern", s:5}`, `{wait:0.9}` | close-up, ★`cam {z:1.3}` slow | — | silence, `sfx:"heartbeat"` once |
| 1.3 | She taps the bowl: *ting* | `{flash:"#fff", t:0.06}` | — | — | `stinger:"bell", arg:5` |
| 1.5 | **Payoff**: she breaks into a smile; the background swaps to warm sun rays + floating lotus petals | ★`{pose:"ba_smile"}`, ★`{aura:"lotus", col:"#ffcf8a"}`, ★`punch:1.2` | same framing | — | `stinger:"sting_win"` |
| 1.8 | Line (auto) | `{say:"Bà Tư", portrait:"ba", text:"Giỏi! Thưởng con chén chè.", auto:1.0}`★ | — | — | babble |
| 2.8 | Small reward | ★`{reward:{icon:"che", label:"PHẦN THƯỞNG", name:"+1 Chè đậu xanh", sub:"Hồi 10 giây hơi lặn", dur:0.6}}` | | | `coin` |

#### S5. First big or rare fish: "Cá lóc khổng lồ!" — 5.6 s

Plays **once per species** (Sổ tay cá first entry). The short version afterwards is just beats 4–5 (1.6 s).

| t | Beat | Step(s) | Camera | Text | Audio |
|---|---|---|---|---|---|
| 0.0 | Underwater: the catch lands; gameplay freezes | `{bg: riverUnder}`, `{flash:"#e8fbff", t:0.1}`, ★`punch:1.5` | freeze-frame on the catch point | — | `sfx:"catch"`, `stinger:"boom"` |
| 0.4 | Cut to black for 0.4 s (breath) | `{fade:"out", dur:0.05}`, `{wait:0.4}` | — | — | `{duck:3}` |
| 0.85 | Comic split: 2 diagonal panels: [Út Sen's face, cheeks puffed, eyes wide] / [the fish's huge eye and teeth] | ★`{panels:[senFace, fishEye], layout:"2diag", dur:1.3, stagger:0.15}`, `{fade:"in", dur:0.05}` | panel slides from opposite sides | — | `sfx:"whoosh"` ×2, `stinger:"riser", arg:1.0` (auto-armed) |
| 2.2 | Surface burst: she bursts out of the water holding the fish over her head; sunburst behind | ★`{aura:"rays", col:"#ffd23f"}`, `{set:{hold:1}}`, `{shake:6}` | low angle, ★`cam {y:+30, z:1.2}` | — | `stinger:"splash_big"` |
| 2.4 | Intro card **for the fish** (a trophy card) | `{intro:{name:"CÁ LÓC BÔNG", sub:"Dài 92 cm · lần đầu bắt được", tag:"KỶ LỤC MỚI", portrait:"fish_loc", colA:"#1b5f74", colB:"#e0614f", nameCol:"#ffe14d"}, dur:2.6}` | card | slam | `hero_hit` |
| 5.0 | Notebook stamp | ★`{reward:{icon:"book", label:"SỔ TAY CÁ", name:"Trang mới!", dur:0.6}}` | | | `bell` + `coin` |

#### S6. Opening the restaurant for the night: "Mở quán!" — 5.8 s (2.0 s short version every later night)

| t | Beat | Step(s) | Camera | Text | Audio |
|---|---|---|---|---|---|
| 0.0 | Dusk, raft wide and dark; Bà Tư strikes a match | `{bg: raftNight}`, `{set:{lit:0}}`, `{music:"cut_dusk"}` | wide | — | `sfx:"sizzle"` (short) |
| 0.5 | Stove flame rises (insert close-up) | ★`{pose:"stove", s:5}`, `{flash:"#ffb35c", t:0.12}` | extreme close-up | — | `stinger:"boom"` (soft) |
| 1.1 | Comic split ×3: [Út Sen wipes a table] [Bé Tí stacks bowls] [Chú Bảy tosses a wok] | ★`{panels:[wipe, stack, wok], layout:"3L", dur:1.5, stagger:0.1}` (panels for missing staff show the empty station) | panels | — | `stinger:"drumroll", arg:1.4` |
| 2.6 | Lanterns flood on, from the near end to the far end | `{tween:{lit:1}, dur:0.5}`, ★`punch:1.15` | wide pull-back | — | `bell0`…`bell3` at 0.12 s intervals |
| 3.1 | Sign slams | `{title:{text:"QUÁN ĂN CHỢ NỔI · MỞ CỬA!", sub:"Đêm 3 · 4 món trên thực đơn", color:"#ffd23f"}, dur:2.0}` | band | slam | `title_hit`, then `{music:"restaurant"}` at the end |
| 5.1 | First boat arrives at the edge; control returns | `{fade:"in"}` to gameplay | — | — | `sfx:"ding"` (customer bell) |

**Short version (every later night, 2.0 s):** beats 2.6 → 3.1 only, with `title` `dur:1.4`.

### 3.4 Pacing rules for our game (taken from 2.2)

- Per-purchase scenes: **3–6 s**, a shot change every **0.6–1.5 s** (DtD's ~1.7 s, sped up for short scenes).
- One **hold or black beat (0.4–0.9 s)** right before the payoff.
- End on a **token**: a reward card, a title band, or a wide reveal of the raft. Never fade out to nothing.
- First time = full version; repeats = short version (last 2 beats) or off, through the `once` key.
- Skip: tap or confirm after 0.4 s in mini mode. On skip, still show the reward card for 0.6 s so the player sees what they got.
- Respect `reduceMotion`: no punch zoom and no shake, and the aura becomes a flat colour.

---

## 4. Do not copy (không sao chép)

- **No DtD characters, likenesses or names.** No bald chef in a headband and sunglasses, no heavy-set gamer weapon-maker in glasses and a printed tee, no stern inspector duo, no boss with a cat, no idol singer, no tasting VIPs. Our cast is Út Sen, Bà Tư, Bé Tí, Chú Bảy and customers we design.
- **No specific gags.** Not the knife-in-front-of-face pose, not the parody of a famous painting with a mechanical claw, not the figurine or anime-T-shirt ritual, not the fish staring through glass, not the farm-vehicle "taste" metaphor, not the rainbow-sky grin, not the heart-wall background.
- **No DtD UI.** Not the phone-app grid, not the neon "NEW WEAPON" frame, not the laurel + chef-hat + ribbon medal, not the "… acquired" wording, not the pink OK button. Our reward card is a paper card with a red seal (con dấu).
- **No DtD dish art, restaurant exterior, inspector rank names (Silver/Gold/Platinum/Diamond), or recipe names.** Our ranks, if any, use river imagery (ghe → xuồng → tàu → chợ).
- **No DtD music, stingers or voice clips**, and nothing written to imitate their melodies. We use our own synthesized `riser`, `boom`, `hero_hit`, `title_hit`, `bell`, `drumroll`, `sting_win` and generated moods.
- **No frames, GIFs or clips from either video** in the repo, docs, slides or the game, not even as placeholders.
- **Composition layouts are inspiration, not tracing.** Panel splits, spotlights, background swaps and letterboxing are common film and comic grammar, and we may use them. Do not redraw a specific DtD frame shot-for-shot.
