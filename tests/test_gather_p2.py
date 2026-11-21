"""Luật gather Phase 2 (Test Contract v1.1 §1.1, §1.2, §4.3–4.5): cá bơi/sinh, Cá Sấu, Máu, ngất.

Phần lớn chạy GatherSim trong tiến trình (scenario có `monsters[]`, tham số day/nâng cấp); vài ca chạy
hộp đen qua headless_cmd. Chạy: PYTHONPATH=tests:. python3 -m unittest discover -s tests -v
"""

import copy
import math
import random
import unittest

from helpers import Workdir, events, read_jsonl, run_headless, snapshots, write_json, frames

from chonoi.contract import load_contract, plan_ingredients, validate_tuning
from chonoi.errors import BadInput
from chonoi.ids import IdAllocator
from chonoi.rng import Streams
from chonoi.sim.gather import GatherSim

TUNING = load_contract()["tuning"]
G = TUNING["gather"]


class Inp:
    def __init__(self, move=(0.0, 0.0), edges=()):
        self.move = tuple(float(c) for c in move)
        self.held = {}
        self._edges = set(edges)
        self.buy = None

    def pressed(self, name):
        return name in self._edges


IDLE = Inp()


def make(sc, seed=1, tuning=TUNING, **kw):
    return GatherSim(tuning, sc, Streams(seed), IdAllocator(), **kw)


def run(sim, n, inp=IDLE):
    """n bước; trả danh sách (bước, tên, data)."""
    out = []
    for k in range(1, n + 1):
        if sim.done:
            break
        out += [(k, name, data) for name, data in sim.step(inp)]
    return out


def names(evs, name):
    return [e for e in evs if e[1] == name]


NO_FISH = {"nodes": [], "random_fish": False, "monsters": []}
SWIM = {"nodes": [], "monsters": []}  # random_fish mặc định true: cá khai vẫn bơi / sinh
SPAWN_POINTS = {k: {(float(x), float(d)) for x in G["fish_spawn_x"] for d in G["fish_spawn_depths"][k]}
                for k in G["fish_weights"]}


def H(*kinds, fresh=100):
    """v1.2 (TICKET-03 §1): giỏ là mảng cá thể; fixture cũ (mảng kind) đổi sang I1, I2,… fresh 100."""
    return [{"id": f"I{i}", "kind": k, "fresh": fresh} for i, k in enumerate(kinds, start=1)]


def K(items):
    return [it["kind"] for it in items]


def croc(mid="M1", pos=(60, 24), **kw):
    m = {"id": mid, "kind": "ca_sau", "pos": list(pos), "waypoints": [list(pos), [pos[0] + 4, pos[1]]]}
    m.update(kw)
    return m


class SoLieuChuan(unittest.TestCase):
    def test_ac_p2_01_contract_v11_standard_data(self):
        """v1.2 (TICKET-03): contract_version đổi thành "1.2"; số liệu v1.1 còn lại giữ nguyên."""
        c = load_contract()
        self.assertIn(c["contract_version"], ("1.2", "1.3"))
        # team_size 3 -> 4: thêm thành viên Sz3RO vào TEAM.md (mở rộng P4); không phải số liệu gameplay
        # team_size 4 -> 5: thêm thành viên VNno1TH (Vũ Đình Huy) vào TEAM.md; không phải số liệu gameplay
        self.assertEqual((c["team"], c["team_size"]), ("Nhom001", 5))
        self.assertEqual(G["fish_yield"], {"ca_linh": 3, "ca_loc": 1, "ca_keo": 2})
        self.assertEqual(G["fish_initial"], 8)
        self.assertEqual([(n["id"], n["kind"], n["pos"]) for n in G["nodes"]][4:],
                         [("N5", "keo_neo", [76, 0]), ("N6", "keo_neo", [90, 0])])
        self.assertEqual(len(TUNING["menu"]), 6)
        self.assertEqual([p["day"] for p in TUNING["day_plan"]], [1, 2, 3, 4, 5])
        for p in TUNING["day_plan"]:
            self.assertEqual(plan_ingredients(p["dishes"], TUNING["menu"]),
                             {k: p["ingredients"][k] for k in sorted(p["ingredients"])}, p["day"])
        self.assertEqual(sum(SPAWN_POINTS_LEN := [len(v) for v in SPAWN_POINTS.values()]), 36)
        self.assertEqual(len(set().union(*SPAWN_POINTS.values())), 30)

    def test_ac_p2_02_contract_rejects_bad_v11_data(self):
        bad = copy.deepcopy(TUNING)
        bad["day_plan"][0]["ingredients"]["ca_loc"] = 4
        with self.assertRaises(BadInput):
            validate_tuning(bad)
        bad = copy.deepcopy(TUNING)
        del bad["gather"]["fish_yield"]["ca_keo"]
        with self.assertRaises(BadInput):
            validate_tuning(bad)
        bad = copy.deepcopy(TUNING)
        bad["gather"]["monsters"]["spawns"][0]["pos"] = [60, 5]  # ngoài dải độ sâu Cá Sấu
        with self.assertRaises(BadInput):
            validate_tuning(bad)


class CaBoi(unittest.TestCase):
    def test_ac_p2_03_swim_speed_and_age(self):
        s = make(dict(SWIM, fish=[{"id": "F1", "kind": "ca_linh", "pos": [50, 6], "heading_deg": 0}]))
        run(s, 60)
        f = s.snapshot()["fish"][0]
        self.assertAlmostEqual(f["pos"][0], 51.5, places=9)
        self.assertAlmostEqual(f["pos"][1], 6, places=9)
        self.assertEqual(f["age_ticks"], 60)

    def test_ac_p2_04_turn_by_seed_on_swim_step_120_before_moving(self):
        s = make(dict(SWIM, fish=[{"id": "F1", "kind": "ca_loc", "pos": [50, 14], "heading_deg": 0, "age_ticks": 118}]))
        run(s, 1)
        self.assertEqual(s.fish[0]["heading_deg"], 0)  # bước bơi 119: chưa đổi
        run(s, 1)  # bước bơi thứ 120: đổi hướng rồi mới đi
        h = random.Random("1:fish_turn").random() * 360.0
        f = s.fish[0]
        self.assertEqual(f["heading_deg"], h)
        step = G["fish_speed"] / 60
        self.assertAlmostEqual(f["pos"][0], 50 + step + step * math.cos(math.radians(h)), places=9)
        self.assertAlmostEqual(f["pos"][1], 14 + step * math.sin(math.radians(h)), places=9)
        self.assertEqual(f["age_ticks"], 120)

    def test_ac_p2_05_edge_reflection_and_corner(self):
        step = G["fish_speed"] / 60
        s = make(dict(SWIM, fish=[
            {"id": "F1", "kind": "ca_linh", "pos": [95.99, 6], "heading_deg": 0},       # mép x phải
            {"id": "F2", "kind": "ca_keo", "pos": [50, 27.99], "heading_deg": 90},      # đáy dải cá kèo
            {"id": "F3", "kind": "ca_linh", "pos": [4.01, 3.01], "heading_deg": 225},   # góc trái-trên
        ]))
        run(s, 1)
        f1, f2, f3 = s.snapshot()["fish"]
        self.assertAlmostEqual(f1["pos"][0], 96 - (95.99 + step - 96), places=9)
        self.assertAlmostEqual(f1["heading_deg"], 180, places=9)
        self.assertAlmostEqual(f2["pos"][1], 28 - (27.99 + step - 28), places=9)
        self.assertAlmostEqual(f2["heading_deg"], 270, places=9)
        self.assertAlmostEqual(f3["heading_deg"], 45, places=9)  # chạm góc: đảo cả hai thành phần
        self.assertGreater(f3["pos"][0], 4)
        self.assertGreater(f3["pos"][1], 3)

    def test_ac_p2_06_species_bands_hold_over_long_run(self):
        s = make({"nodes": [], "monsters": []}, seed=7)
        for _ in range(3000):
            s.step(IDLE)
            for f in s.fish:
                lo, hi = G["fish_depths"][f["kind"]]
                self.assertTrue(4 <= f["pos"][0] <= 96 and lo <= f["pos"][1] <= hi, f)

    def test_ac_p2_07_random_fish_false_freezes_fixture_and_no_spawn(self):
        s = make(dict(NO_FISH, fish=[{"id": "F1", "kind": "ca_loc", "pos": [30, 10]}]))
        evs = run(s, 400)
        self.assertEqual(s.fish[0]["pos"], [30, 10])
        self.assertEqual(s.fish[0]["age_ticks"], 0)
        self.assertEqual(names(evs, "fish_spawned"), [])


class SinhCa(unittest.TestCase):
    def test_ac_p2_08_initial_8_schools_at_distinct_points(self):
        s = make({"monsters": []})
        fish = s.snapshot()["fish"]
        self.assertEqual([f["id"] for f in fish], [f"F{i}" for i in range(1, 9)])
        pts = [tuple(f["pos"]) for f in fish]
        self.assertEqual(len(set(pts)), 8)
        for f in fish:
            self.assertIn(tuple(f["pos"]), SPAWN_POINTS[f["kind"]])
            self.assertEqual(f["age_ticks"], 0)

    def test_ac_p2_09_spawn_deterministic_per_seed(self):
        a, b, c = make({}, seed=3), make({}, seed=3), make({}, seed=4)
        for s in (a, b, c):
            run(s, 800)
        self.assertEqual(a.snapshot(), b.snapshot())
        self.assertNotEqual(a.snapshot()["fish"], c.snapshot()["fish"])

    def test_ac_p2_10_scheduled_spawn_at_360k_after_swim_joins_next_step(self):
        s = make(dict(SWIM, fish=[]))
        evs = run(s, 359)
        self.assertEqual(s.fish, [])
        evs = run(s, 1)
        sp = names(evs, "fish_spawned")
        self.assertEqual(len(sp), 1)
        d = sp[0][2]
        self.assertEqual(set(d), {"id", "kind", "pos"})
        self.assertEqual(d["id"], "F1")
        self.assertIn(tuple(d["pos"]), SPAWN_POINTS[d["kind"]])
        self.assertEqual(s.fish[0]["pos"], d["pos"])  # không bơi trong bước sinh
        self.assertEqual(s.fish[0]["age_ticks"], 0)
        run(s, 1)
        self.assertEqual(s.fish[0]["age_ticks"], 1)
        evs = run(s, 359)
        self.assertEqual([e[2]["id"] for e in names(evs, "fish_spawned")], ["F2"])

    def test_ac_p2_11_spawn_cap_12(self):
        fish = [{"id": f"F{i}", "kind": "ca_loc", "pos": [10 + 5 * i, 15], "heading_deg": 90} for i in range(1, 13)]
        s = make(dict(SWIM, fish=fish))
        evs = run(s, 360)
        self.assertEqual(names(evs, "fish_spawned"), [])
        self.assertEqual(len(s.fish), 12)

    def test_ac_p2_12_clearance_strict_and_renormalised_weights(self):
        t = copy.deepcopy(TUNING)
        t["gather"]["fish_max"] = 40
        keo = sorted(SPAWN_POINTS["ca_keo"])
        blockers = [{"id": f"F{i}", "kind": "ca_keo", "pos": [x, d + 1.0]} for i, (x, d) in enumerate(keo, 1)]
        for seed in range(15):
            s = make(dict(NO_FISH, fish=blockers), seed=seed, tuning=t)
            # cách đúng 1.0 m vẫn chặn (cần > 1 m): mọi điểm cá kèo hết chỗ -> chỉ còn linh/lóc
            self.assertEqual(s._spawn_points("ca_keo"), [])
            f = s._spawn_one()
            self.assertIn(f["kind"], ("ca_linh", "ca_loc"))
        s = make(dict(NO_FISH, fish=[{"id": "F1", "kind": "ca_keo", "pos": [15, 25.01]}]), tuning=t)
        self.assertIn([15.0, 24.0], s._spawn_points("ca_keo"))  # 1.01 m > 1 m: hợp lệ

    def test_ac_p2_13_skip_when_no_point_left(self):
        t = copy.deepcopy(TUNING)
        t["gather"]["fish_max"] = 40
        allpts = sorted(set().union(*SPAWN_POINTS.values()))
        fish = [{"id": f"F{i}", "kind": "ca_loc", "pos": [x, 15]} for i, (x, d) in enumerate(allpts, 1)]
        s = make(dict(NO_FISH, fish=fish), tuning=t)
        for f, (x, d) in zip(s.fish, allpts):
            f["pos"] = [x, d]
        self.assertIsNone(s._spawn_one())
        self.assertEqual(len(s.fish), 30)


class BatCa(unittest.TestCase):
    def test_ac_p2_14_catch_uses_positions_before_swim(self):
        # đúng mép 2.0 m trước khi bơi (sau khi bơi sẽ là 2.025): vẫn bắt
        s = make(dict(SWIM, player={"pos": [30, 10]}, fish=[{"id": "F1", "kind": "ca_loc", "pos": [32, 10]}]))
        evs = run(s, 1, Inp(edges={"catch"}))
        self.assertEqual(names(evs, "fish_caught")[0][2]["fish_id"], "F1")
        # 2.02 m trước khi bơi (đang bơi lại gần): không bắt
        s = make(dict(SWIM, player={"pos": [30, 10]},
                      fish=[{"id": "F1", "kind": "ca_loc", "pos": [32.02, 10], "heading_deg": 180}]))
        evs = run(s, 1, Inp(edges={"catch"}))
        self.assertEqual(names(evs, "fish_caught"), [])
        self.assertLess(math.dist(s.fish[0]["pos"], [30, 10]), 2)

    def test_ac_p2_15_ca_keo_yield_2_and_keo_neo_nodes(self):
        s = make(dict(NO_FISH, player={"pos": [30, 25]}, fish=[{"id": "F1", "kind": "ca_keo", "pos": [31, 25]}]))
        evs = run(s, 1, Inp(edges={"catch"}))
        self.assertEqual(names(evs, "fish_caught")[0][2], {"fish_id": "F1", "kind": "ca_keo", "yield": 2})
        self.assertEqual(K(s.hold), ["ca_keo", "ca_keo"])  # v1.2: giỏ là cá thể
        s = make({"random_fish": False, "monsters": [], "player": {"pos": [76, 0]}})
        evs = run(s, 1, Inp(edges={"interact"}))
        self.assertEqual(names(evs, "gather")[0][2], {"node_id": "N5", "kind": "keo_neo", "amount": 1})
        self.assertEqual(K(s.inventory_items()), ["keo_neo"])


class CaSau(unittest.TestCase):
    def test_ac_p2_16_patrol_between_waypoints(self):
        s = make({"random_fish": False, "nodes": []})  # bố trí Ngày 1 mặc định, người chơi ở bến
        m = s.snapshot()["monsters"]
        self.assertEqual([x["id"] for x in m], ["M1"])
        self.assertEqual(m[0], {"id": "M1", "kind": "ca_sau", "pos": [60, 24], "waypoints": [[60, 24], [64, 24]],
                                "target_idx": 1, "state": "patrol", "state_ticks_left": 0, "recoil_dir": None})
        run(s, 1)
        self.assertAlmostEqual(s.monsters[0]["pos"][0], 60 + 1 / 60, places=9)
        run(s, 239)
        self.assertEqual(s.monsters[0]["pos"], [64, 24])
        self.assertEqual(s.monsters[0]["target_idx"], 0)
        run(s, 60)
        self.assertAlmostEqual(s.monsters[0]["pos"][0], 63, places=9)

    def test_ac_p2_17_chase_when_deep_and_within_10m(self):
        s = make(dict(NO_FISH, monsters=[croc()], player={"pos": [60, 14]}))  # cách đúng 10 m, d = 14
        run(s, 1)
        m = s.monsters[0]
        self.assertEqual(m["state"], "chase")
        self.assertAlmostEqual(m["pos"][1], 24 - 3 / 60, places=9)
        s = make(dict(NO_FISH, monsters=[croc()], player={"pos": [60, 9.9]}))  # d < 10: không phát hiện
        run(s, 1)
        self.assertEqual(s.monsters[0]["state"], "patrol")

    def test_ac_p2_18_exit_chase_beyond_16m_or_player_shallow(self):
        s = make(dict(NO_FISH, monsters=[croc(state="chase")], player={"pos": [76.5, 24]}))
        run(s, 1)
        self.assertEqual(s.monsters[0]["state"], "patrol")
        s = make(dict(NO_FISH, monsters=[croc(state="chase")], player={"pos": [75, 24]}))  # 15 m: vẫn đuổi
        run(s, 1)
        self.assertEqual(s.monsters[0]["state"], "chase")
        s = make(dict(NO_FISH, monsters=[croc(pos=(60, 15), state="chase")], player={"pos": [60, 9]}))
        run(s, 1)
        self.assertEqual(s.monsters[0]["state"], "patrol")

    def test_ac_p2_19_hit_lifo_invuln_and_recoil(self):
        """v1.2: lost/hold là mảng cá thể (lost theo thứ tự bỏ LIFO)."""
        hold = H("ca_loc", "bong_sung", "ca_linh", "keo_neo", "ca_keo")
        s = make(dict(NO_FISH, monsters=[croc(pos=(61, 24))], player={"pos": [60, 24]}, hold=hold))
        evs = run(s, 1)
        self.assertEqual([e[1] for e in evs], ["monster_hit"])
        d = dict(evs[0][2])
        lost = d.pop("lost")
        self.assertEqual(d, {"monster_id": "M1", "hp": 2, "pos": [60.0, 24.0]})
        self.assertEqual([(i["id"], i["kind"]) for i in lost], [("I5", "ca_keo"), ("I4", "keo_neo")])
        snap = s.snapshot()
        self.assertEqual(K(snap["hold"]), ["ca_loc", "bong_sung", "ca_linh"])
        self.assertEqual(snap["player"]["invuln_ticks"], 90)
        m = snap["monsters"][0]
        self.assertEqual((m["state"], m["state_ticks_left"], m["recoil_dir"]), ("recoil", 60, [1.0, 0.0]))
        x_hit = m["pos"][0]
        run(s, 59)
        self.assertEqual(s.monsters[0]["state"], "recoil")
        run(s, 1)  # 60 bước recoil, mỗi bước 2/60 m
        m = s.monsters[0]
        self.assertEqual((m["state"], m["recoil_dir"]), ("patrol", None))
        self.assertAlmostEqual(m["pos"][0], x_hit + 2.0, places=9)

    def test_ac_p2_20_no_hit_while_invulnerable_then_hit_when_it_ends(self):
        s = make(dict(NO_FISH, monsters=[croc(pos=(60, 24))], player={"pos": [60, 24], "invuln_ticks": 5}))
        evs = run(s, 5)
        hits = names(evs, "monster_hit")
        self.assertEqual([h[0] for h in hits], [5])  # 4, 3, 2, 1 còn bất tử; bước 5 giảm về 0 rồi xét hit
        self.assertEqual(s.monsters[0]["recoil_dir"], [1.0, 0.0])  # trùng tâm dùng +x

    def test_ac_p2_21_one_hit_per_step_nearest_then_id(self):
        s = make(dict(NO_FISH, player={"pos": [60, 24]},
                      monsters=[croc("M10", pos=(61, 24)), croc("M2", pos=(59, 24))]))
        evs = run(s, 1)
        self.assertEqual([e[2]["monster_id"] for e in names(evs, "monster_hit")], ["M2"])
        self.assertEqual({m["id"]: m["state"] for m in s.monsters}, {"M10": "chase", "M2": "recoil"})
        s = make(dict(NO_FISH, player={"pos": [60, 24]},
                      monsters=[croc("M1", pos=(61.4, 24)), croc("M2", pos=(60.5, 24))]))
        evs = run(s, 1)
        self.assertEqual([e[2]["monster_id"] for e in names(evs, "monster_hit")], ["M2"])

    def test_ac_p2_22_no_hit_when_player_shallow_or_monster_recoiling(self):
        s = make(dict(NO_FISH, monsters=[croc(pos=(60, 10))], player={"pos": [60, 9.5]}))
        self.assertEqual(names(run(s, 5), "monster_hit"), [])
        rec = croc(pos=(60, 24), state="recoil", state_ticks_left=2, recoil_dir=[1, 0])
        s = make(dict(NO_FISH, monsters=[rec], player={"pos": [60, 24]}))
        self.assertEqual(names(run(s, 2), "monster_hit"), [])
        self.assertEqual(s.monsters[0]["state"], "patrol")  # hết recoil ở bước 2: chưa xét chạm
        evs = run(s, 1)  # bước kế: phát hiện + đuổi + chạm
        self.assertEqual([e[1] for e in evs], ["monster_hit"])

    def test_ac_p2_23_recoil_clamped_to_map(self):
        rec = dict(croc(pos=(99.99, 24), state="recoil", state_ticks_left=10, recoil_dir=[1, 0]),
                   waypoints=[[99.99, 24], [96, 24]])
        s = make(dict(NO_FISH, monsters=[rec], player={"pos": [2, 0]}))
        run(s, 3)
        self.assertEqual(s.monsters[0]["pos"], [100, 24])

    def test_ac_p2_24_monster_faint_lifo_and_empty_handover(self):
        s = make(dict(NO_FISH, monsters=[croc(pos=(60.5, 24))], player={"pos": [60, 24], "hp": 1},
                      hold=H("ca_loc", "bong_sung", "ca_linh")))
        evs = run(s, 3)
        self.assertEqual([e[1] for e in evs], ["monster_hit", "faint", "gather_end"])
        self.assertEqual([i["id"] for i in evs[0][2]["lost"]], ["I3"])  # v1.2: cá thể
        self.assertEqual(evs[0][2]["hp"], 0)
        self.assertEqual(evs[1][2]["cause"], "monster")
        self.assertEqual([i["id"] for i in evs[1][2]["lost"]], ["I2", "I1"])
        self.assertEqual(evs[2][2], {"reason": "fainted", "inventory": {"items": []}})
        self.assertEqual(s.inventory_items(), [])

    def test_ac_p2_25_choke_passes_invuln_and_drops_nothing(self):
        s = make(dict(NO_FISH, player={"pos": [30, 10], "oxygen_ticks": 0, "zero_oxy_ticks": 59, "hp": 2,
                                       "invuln_ticks": 50}, hold=H("ca_loc", "ca_linh")))
        evs = run(s, 1)
        self.assertEqual([e[1] for e in evs], ["choke"])
        self.assertEqual((s.hp, K(s.hold)), (1, ["ca_loc", "ca_linh"]))  # v1.2: cá thể

    def test_ac_p2_26_m2_only_from_day_3(self):
        for day, ids in ((1, ["M1"]), (2, ["M1"]), (3, ["M1", "M2"]), (5, ["M1", "M2"])):
            s = make({}, day=day)
            self.assertEqual([m["id"] for m in s.snapshot()["monsters"]], ids, day)
        m2 = make({}, day=3).snapshot()["monsters"][1]
        self.assertEqual((m2["pos"], m2["waypoints"]), ([85, 18], [[85, 18], [89, 18]]))


class DayVaScenario(unittest.TestCase):
    def test_ac_p2_27_active_upgrades_params(self):
        s = make({}, day=2, oxygen_max_s=45, hp_max=4)
        p = s.snapshot()["player"]
        self.assertEqual((p["oxygen_ticks"], p["oxygen_max_ticks"], p["hp"], p["hp_max"]), (2700, 2700, 4, 4))
        with self.assertRaises(BadInput):
            make({"player": {"hp": 4}})  # vượt hp_max cơ sở khi chưa có nâng cấp

    def test_ac_p2_28_scenario_validation_code_2(self):
        bad = [
            {"monsters": [croc(target_idx=2)]},
            {"monsters": [croc(state="recoil", recoil_dir=[1, 0])]},                     # thiếu timer dương
            {"monsters": [croc(state="recoil", state_ticks_left=5, recoil_dir=[1, 1])]},  # không đơn vị
            {"monsters": [croc(recoil_dir=[1, 0])]},                                       # patrol có recoil_dir
            {"monsters": [croc(pos=(60, 5))]},                                             # ngoài dải độ sâu
            {"monsters": [croc(kind="ran")]},
            {"monsters": [croc(), croc()]},                                                 # id trùng
            {"monsters": [dict(croc(), waypoints=[[60, 24]])]},
            {"fish": [{"id": "F1", "kind": "ca_keo", "pos": [30, 25], "age_ticks": -1}]},
            {"fish": [{"id": "F1", "kind": "ca_keo", "pos": [30, 10]}]},  # đàn bơi ngoài dải loài
            {"player": {"invuln_ticks": -1}},
            {"hold": H("ca_ho")},
            {"hold": ["ca_loc"]},  # v1.2: mảng kind (schema đếm cũ) bị từ chối
        ]
        for sc in bad:
            with self.assertRaises(BadInput, msg=sc):
                make(sc)
        ok = make({"monsters": [croc(state="recoil", state_ticks_left=5, recoil_dir=[0, -1], target_idx=0)],
                   "fish": [{"id": "F1", "kind": "ca_keo", "pos": [30, 10]}], "random_fish": False,
                   "player": {"invuln_ticks": 90}, "hold": H("ca_keo", "keo_neo")})
        self.assertEqual(ok.snapshot()["monsters"][0]["state"], "recoil")
        self.assertEqual(make({"monsters": []}).snapshot()["monsters"], [])

    def test_ac_p2_29_headless_default_run_snapshot_and_spawn_event(self):
        with Workdir() as w:
            args = ["--mode", "gather", "--seed", "1", "--ticks", "360", "--out", w.path("g.jsonl"),
                    "--snapshot-every", "360", "--inputs", write_json(w.path("in.json"), frames())]
            code, err = run_headless(*args)
            self.assertEqual(code, 0, err)
            rows = read_jsonl(w.path("g.jsonl"))
            s0 = snapshots(rows)[0]
            self.assertEqual(len(s0["fish"]), 8)
            self.assertIn("age_ticks", s0["fish"][0])
            self.assertEqual(s0["player"]["invuln_ticks"], 0)
            self.assertEqual([m["id"] for m in s0["monsters"]], ["M1"])
            sp = events(rows, "fish_spawned")
            self.assertEqual([e["tick"] for e in sp], [360])
            self.assertEqual(sp[0]["data"]["id"], "F9")
            self.assertEqual(len(snapshots(rows)[-1]["fish"]), 9)


if __name__ == "__main__":
    unittest.main()
