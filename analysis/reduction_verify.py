# -*- coding: utf-8 -*-
"""Reduction verification for the morphological design theory (Appendix B.3).

Regenerates, from Table B.1 exactly as printed in the dissertation, every
count and every structural claim of Appendix B.3 / Section 3.4:

  Stage 1  remove configurations containing an Incompatible pair   6,561 -> 3,591
  Stage 2  remove configurations containing a critical tension     3,591 -> 1,764
  Stage 3  coherent core: zero remaining tensions                  1,764 ->    61

Structural claims verified mechanically:
  S1  exactly one core configuration contains a permissionless option:
      the homogeneous all-A profile, isolated at Hamming distance 8
  S2  the 60 permissioned core configurations form a single region
      connected by single-option steps
  S3  pole split: 20 configurations led by 1B (including all-B),
      40 led by 1C
  S4  entailments: every 1C-led core configuration carries 4C;
      every 1B-led core configuration carries 5B
  A3  the Archetype 3 profile (1C-2C-3C-4C-5C-6C-7B-8B) carries exactly
      one manageable tension (2C x 7B); its 7C variant is in the core
  A4  the Archetype 4 interior (60 minus the all-B consortium anchor and
      the 1C-2C-3C-4C-5C-6C-7C-8B regulatory anchor) has 58 members;
      1B-led members all carry 5B and 6B; 1C-led members all carry 4C;
      exactly 12 members carry both 7C and 8C; the representative member
      1C-2B-3B-4C-5C-6C-7C-8C is a core configuration

Run:  python analysis/reduction_verify.py
Output: analysis/reduction_results.json (all counts, checks, and the
61-configuration enumeration). Exits non-zero if any claim fails.
"""
import json
import os
import sys
from itertools import product

# Table B.1 as printed. Cell order per pair (Di, Dj), i < j:
# AA AB AC BA BB BC CA CB CC, first letter Di's option, second Dj's.
# C = compatible, T = manageable tension, X = critical tension (T*),
# I = incompatible.
MATRIX = {
    (1, 2): "C T T T C C T C C",
    (1, 3): "C T X C C C T C C",
    (1, 4): "C T I X C C I T C",
    (1, 5): "C T I T C T T C C",
    (1, 6): "C T X X C T X C C",
    (1, 7): "C T T C C C C C C",
    (1, 8): "C T T T C C T C C",
    (2, 3): "C T T C C C T C C",
    (2, 4): "C T T T C C T C C",
    (2, 5): "C T T T C C T C C",
    (2, 6): "C T T T C C T C C",
    (2, 7): "C T T C C C C T C",
    (2, 8): "C T I T C C I C T",
    (3, 4): "C T T T C C X C C",
    (3, 5): "C T T T C C T C C",
    (3, 6): "C T T T C C T C C",
    (3, 7): "C T T C C C C C C",
    (3, 8): "C T T T C C T C C",
    (4, 5): "C T X T C T T C C",
    (4, 6): "C X X T C C T C C",
    (4, 7): "C T T C C C C C C",
    (4, 8): "C T C T C C T C C",
    (5, 6): "C T T T C C T C C",
    (5, 7): "C T T C C C C C C",
    (5, 8): "C T T T C C T C C",
    (6, 7): "C T T C C C C C C",
    (6, 8): "C T T T C C T C C",
    (7, 8): "C T T T C C T C C",
}
OPT = "ABC"

def build_cells():
    cells = {}
    for (i, j), row in MATRIX.items():
        vals = row.split()
        assert len(vals) == 9, f"pair {i}x{j}: expected 9 cells"
        for a in range(3):
            for b in range(3):
                cells[(i, j, OPT[a], OPT[b])] = vals[a * 3 + b]
    return cells

def main():
    cells = build_cells()
    pairs = sorted(MATRIX.keys())
    totals = {}
    for v in cells.values():
        totals[v] = totals.get(v, 0) + 1
    assert totals == {"C": 149, "T": 89, "X": 9, "I": 5}, totals

    def rating(cfg, i, j):
        return cells[(i, j, cfg[i - 1], cfg[j - 1])]

    space = list(product(OPT, repeat=8))
    stage1 = [c for c in space if all(rating(c, i, j) != "I" for i, j in pairs)]
    stage2 = [c for c in stage1 if all(rating(c, i, j) != "X" for i, j in pairs)]
    core = [c for c in stage2 if all(rating(c, i, j) == "C" for i, j in pairs)]
    counts = dict(total=len(space), stage1=len(stage1), stage2=len(stage2), core=len(core))
    assert counts == dict(total=6561, stage1=3591, stage2=1764, core=61), counts

    cs = set(core)
    all_a, all_b = tuple("A" * 8), tuple("B" * 8)
    ham = lambda x, y: sum(a != b for a, b in zip(x, y))

    checks = {}
    with_a = [c for c in core if "A" in c]
    checks["S1_allA_unique_and_isolated"] = (
        with_a == [all_a] and min(ham(all_a, c) for c in core if c != all_a) == 8)

    perm = [c for c in core if c != all_a]
    seen, front = {perm[0]}, [perm[0]]
    while front:
        nxt = []
        for c in front:
            for d in range(8):
                for o in OPT:
                    n = c[:d] + (o,) + c[d + 1:]
                    if o != c[d] and n in cs and n != all_a and n not in seen:
                        seen.add(n); nxt.append(n)
        front = nxt
    checks["S2_permissioned_region_connected"] = len(seen) == 60

    b_led = [c for c in perm if c[0] == "B"]
    c_led = [c for c in perm if c[0] == "C"]
    checks["S3_pole_split_20_40"] = (len(b_led), len(c_led)) == (20, 40) and all_b in cs
    checks["S4_entailments"] = (all(c[3] == "C" for c in c_led)
                                and all(c[4] == "B" for c in b_led))

    a3 = tuple("CCCCCC") + ("B", "B")
    a3_t = [(i, j) for i, j in pairs if rating(a3, i, j) != "C"]
    a3_variant = tuple("CCCCCCC") + ("B",)
    checks["A3_single_tension_2C7B"] = a3_t == [(2, 7)]
    checks["A3_7C_variant_in_core"] = a3_variant in cs

    interior = [c for c in perm if c not in (all_b, a3_variant)]
    rep = ("C", "B", "B", "C", "C", "C", "C", "C")
    checks["A4_interior_58"] = len(interior) == 58
    checks["A4_1B_led_carry_5B_6B"] = all(
        c[4] == "B" and c[5] == "B" for c in interior if c[0] == "B")
    checks["A4_1C_led_carry_4C"] = all(c[3] == "C" for c in interior if c[0] == "C")
    checks["A4_7C8C_subset_12"] = sum(
        1 for c in interior if c[6] == "C" and c[7] == "C") == 12
    checks["A4_representative_in_core"] = rep in cs

    ok = all(checks.values())
    out = {
        "matrix_cell_totals": totals,
        "counts": counts,
        "structural_checks": checks,
        "all_passed": ok,
        "core_configurations": ["".join(f"{d+1}{o}" for d, o in enumerate(c)) for c in core],
    }
    path = os.path.join(os.path.dirname(__file__), "reduction_results.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2)
    print(f"counts: {counts}")
    for k, v in checks.items():
        print(f"  {k}: {'PASS' if v else 'FAIL'}")
    print(f"all_passed: {ok} -> {path}")
    return 0 if ok else 1

if __name__ == "__main__":
    sys.exit(main())
