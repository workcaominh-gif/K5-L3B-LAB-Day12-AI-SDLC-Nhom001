// Bà Tư's dialogue overlay (meta.openBaTuDialog): talk · decor · recipe research · chores · hiring. Overlay contract
// { update(dt), draw(), done }; the host freezes its own gameplay while it is open.
import { W, H, screen, input, clamp, ease, txt, panel, measure, wrap } from "./engine.js";
import { sfx, voiceLine } from "./audio.js";
import { portrait } from "./art.js";
import * as progress from "./progress.js";
import { Nav, drawPage, decorRoot, staffRoot, choresRoot, researchRoot, GOLD, BORDER } from "./phone.js";
import { lockedDishes } from "./menu.js"; // recipe research: Đặc sản Bà Tư has not learned yet
import { pumpActionCut, drawActionCut, drawRaftThumb } from "./action_cut.js";
import { raftLive } from "./raft.js";
import * as meta from "./meta.js";

const STORY = [
  "Hồi Bà mười bảy tuổi, Bà chèo xuồng bán bún riêu ở chợ nổi. Sáng nào cũng dậy từ ba giờ, sương ướt hết tóc.",
  "Bốn chục năm đứng bếp, Bà học được một điều: nồi lẩu ngon là nhờ người nấu thương người ăn.",
  "Cây bẹo trên ghe là để rao hàng đó con. Treo trái gì thì bán trái đó, khỏi phải la lớn.",
  "Ba má con hồi đó cũng mê cái quán này lắm. Ba con lặn giỏi nhất xóm, má con làm gỏi bông súng ai ăn cũng khen.",
  "Năm nước lớn đó, ba má con đi chở hàng lên Châu Đốc rồi không về... Bà giữ quán này cũng là giữ chỗ cho ba má con nhớ đường.",
  "Con giống má con ghê, cười một cái là khách quên trả giá luôn.",
  "Mùa nước nổi cá linh về, bông điên điển nở vàng hai bên bờ. Mùa đó người miền Tây no đủ nhất.",
  "Cá lóc nướng trui phải nướng bằng rơm, da cháy đen mà thịt trắng ngọt. Đừng có vội, con.",
  "Hồi xưa chợ nổi đông lắm, ghe chen nhau tới hổng thấy mặt nước. Giờ thưa rồi, nên quán mình càng phải giữ lửa.",
  "Con cá tra dầu dưới khúc sông sâu già hơn Bà nữa đó. Người ta nói nó canh cửa sông. Con lặn thì coi chừng nghen.",
  "Bán quán đừng tham. Đủ ăn, đủ thương, dư chút đỉnh cho xóm giềng là được rồi.",
  "Ông Tư nhà Bà khắc cái bảng hiệu gỗ đó bằng con dao xếp. Chữ xiêu xiêu mà Bà thương.",
  // Đặc sản (menu.js): the premium recipes, also listed in the phone's Sổ tay
  "Hạ được cá sấu thì nướng sả ớt với kèo nèo, thịt rắn xào sả ớt với bông điên điển. Cá lóc bông hấp bầu, cá lóc khổng lồ nướng trui, cá linh lớn làm gỏi. Còn cá tra dầu thì nấu lẩu với bông súng — khách sộp trả bạc triệu đó con!",
];
const GREET = ["Sen đó hả con? Ngồi xuống đây Bà nói chuyện chút.", "Nay quán sao rồi con? Có mệt hông?", "Ăn gì chưa con? Bà còn nồi cháo cá đó."];

export class BaTuDialog {
  constructor(onClose) {
    this.onClose = onClose; this.done = false; this.t = 0; this.k = 0; this.closing = false;
    this.nav = new Nav(() => this.rootPage(), (text) => this.say(text));
    this.say(GREET[Math.floor(Math.random() * GREET.length)]);
  }
  say(text) { this.line = text; this.shown = 0; try { voiceLine("Bà Tư", text); } catch (e) {} }
  rootPage() {
    const ch = (() => { try { return progress.save.chores?.active?.filter((a) => a.done).length || 0; } catch (e) { return 0; } })();
    return { title: "Bà Tư", items: [
      { label: "Nói chuyện", act: () => { const s = progress.save; const i = (s.batuTalk | 0) % STORY.length; s.batuTalk = i + 1; progress.persist(); sfx("click"); this.say(STORY[i]); } },
      { label: "Trang trí quán", act: (n) => { n.push(decorRoot); this.say("Muốn đổi đèn đổi khăn hả? Coi đi, cái nào ưng thì Bà treo cho."); } },
      { label: "Nghiên cứu món mới", right: (() => { const n = lockedDishes().length; return n ? `${n} món` : "Đủ hết"; })(), rightCol: lockedDishes().length ? GOLD : "#7be08a",
        act: (n) => { n.push(researchRoot); this.say(lockedDishes().length ? "Muốn Bà chỉ món mới hả? Tốn chút tiền mua đồ nấu thử, mà học rồi là bán được giá cao đó con." : "Đặc sản miền Tây Bà chỉ hết cho con rồi đó! Giờ con nấu còn ngon hơn Bà nữa à nghen."); } },
      { label: "Việc vặt", right: ch ? `${ch} xong` : "", rightCol: "#7be08a", act: (n) => { n.push((m) => choresRoot(m, true)); this.say(ch ? "Làm xong việc rồi thì lãnh thưởng đi con." : "Bà có mấy việc nhỏ nhờ con nè."); } },
      { label: "Thuê người", act: (n) => { n.push(staffRoot); this.say("Quán đông rồi, thuê thêm người phụ cho đỡ. Mà nhớ trả công đàng hoàng nghe."); } },
      { label: "Thôi", act: () => "close" },
    ] };
  }
  // restores the real décor BEFORE the host's onClose (scene_quan re-reads meta.getDecor() there)
  close() { if (this.closing) return; this.closing = true; this.nav.dispose(); meta.clearPreview(); sfx("click"); }
  update(dt) {
    this.t += dt;
    if (this.closing) { this.k -= dt * 5; if (this.k <= 0 && !this.done) { this.k = 0; this.done = true; meta.clearPreview(); this.onClose?.(); } return; }
    this.k = Math.min(1, this.k + dt * 4);
    if (pumpActionCut(dt)) return; // hire / décor / chore cuts play over the dialog (the scene behind stays frozen)
    this.shown = Math.min(this.line.length, this.shown + dt * 45);
    if (this.t < 0.15) return; // swallow the key that opened the dialogue
    if (this.nav.update(dt) === "close") { this.say("Ừ, đi làm đi con. Có gì cứ ghé Bà."); this.close(); }
  }
  draw() {
    const u = screen.ui, e = ease.out(clamp(this.k, 0, 1));
    if (this.nav.custom && !this.closing) { this.drawPreview(u, e); drawActionCut(); return; }
    u.save(); u.fillStyle = `rgba(4,8,20,${0.6 * e})`; u.fillRect(0, 0, W, H); u.restore();
    u.save(); u.globalAlpha = e;
    const off = (1 - e) * 30;
    // dialogue box (same look as cutscene drawSay)
    const bx = 14, by = H - 78 + off, bw = W - 28, bh = 68;
    panel(bx, by, bw, bh, { fill: "rgba(28,14,10,.95)", border: BORDER, bw: 1.5, r: 6 });
    const img = portrait("ba"), S = 2.4, pw = img.width * S, ph = img.height * S;
    u.imageSmoothingEnabled = false;
    u.fillStyle = "rgba(255,255,255,.07)"; u.fillRect(bx + 6, by + 5, pw + 4, bh - 10);
    u.drawImage(img, bx + 8, by + bh - ph - 4, pw, ph);
    const tx = bx + pw + 20, tw = bw - pw - 34;
    panel(tx - 2, by - 8, measure("BÀ TƯ", 9, 900) + 12, 13, { fill: "#b5462e", border: "#fff", r: 2 });
    txt("BÀ TƯ", tx + 4, by + 2, { size: 9, weight: 900, color: "#fff" });
    const lines = wrap(this.line, tw, 9); let left = Math.floor(this.shown);
    lines.slice(0, 4).forEach((ln, i) => { const part = ln.slice(0, Math.max(0, left)); left -= ln.length + 1; txt(part, tx, by + 18 + i * 12, { size: 9, color: "#f6efe0", weight: 700 }); });
    txt(`Ví ${progress.save.money | 0}k · ↑↓ chọn · Enter/E · Esc quay lại`, bx + bw - 6, by + bh - 4, { size: 7, align: "right", color: "rgba(255,255,255,.55)", weight: 700 });
    // menu panel: compact on the root, wide for sub pages
    if (this.nav.stack.length === 1) {
      const mw = 150, mh = this.nav.page().items.length * 16 + 28, mx = W - mw - 16, my = by - mh - 6;
      panel(mx, my, mw, mh, { fill: "rgba(28,14,10,.95)", border: BORDER, bw: 1.5, r: 6 });
      drawPage(this.nav, mx + 4, my + 4, mw - 8, mh - 8, { size: 9 });
    } else {
      const mx = 14, my = 8, mw = W - 28, mh = by - my - 12;
      panel(mx, my, mw, mh, { fill: "rgba(28,14,10,.95)", border: BORDER, bw: 1.5, r: 6 });
      drawPage(this.nav, mx + 6, my + 4, mw - 12, mh - 8, { size: 8.5 });
    }
    u.restore();
    drawActionCut();
  }
  // "Trang trí quán" item browser: over the live quán raft the panel is a compact semi-transparent strip docked away from
  // what is being previewed (lanterns / sign → bottom, cloth / flowers → top); elsewhere (dock hub) a live thumbnail
  drawPreview(u, e) {
    const live = raftLive(), b = this.nav.custom, slot = b.slot, h = 66, w = W - 28;
    u.save(); u.globalAlpha = e;
    if (!live) { u.fillStyle = "rgba(4,8,20,.6)"; u.fillRect(0, 0, W, H); }
    const atTop = live && (slot === "cloth" || slot === "flowers");
    const y = atTop ? 6 : H - h - 6;
    if (!live) {
      const tw = 236, th = Math.round(tw * 0.5);
      drawRaftThumb(u, W / 2 - tw / 2, Math.max(8, y - th - 14), tw, th, this.t);
    }
    b.draw(14, y, w, h, "strip");
    // Bà Tư's line, small, beside the strip (the big dialogue box would cover the raft)
    const ln = wrap(this.line, w - 40, 7.5)[0] || "";
    txt(`Bà Tư: ${ln.slice(0, Math.floor(this.shown))}`, 18, atTop ? y + h + 11 : y - 5, { size: 7.5, color: "#fff", weight: 800, stroke: "rgba(10,8,20,.8)", sw: 2.5 });
    u.restore();
  }
}
