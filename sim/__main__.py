"""Run version 3 viability games.

    python -m sim --games 200 --seed 1

The simulator uses the printed hero sheet in ``src/game/roster.ts`` and the version 3
economy. It is a lane-level model: two heuristic sides, real ability costs, attack
order, tower bounties, and hero-kill income. It does not play every item or the full
status list. Use it to see whether games finish and whether gold and XP stay in a
playable range.
"""

from __future__ import annotations

import argparse
import random
import re
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ROSTER = ROOT / "src" / "game" / "roster.ts"

LANES = ("top", "mid", "bot")
ORDER = ("AGI", "UNI", "INT", "STR")
# Radiant safe lane is bot. Dire safe lane is top. Lower rank attacks first.
RANK = {
    "radiant": {"bot": 0, "mid": 1, "top": 2},
    "dire": {"top": 0, "mid": 1, "bot": 2},
}
TOWER = {"t1": 3, "t2": 5}
TOWER_GOLD = {"t1": 3, "t2": 5}
ANCIENT = 10
ROW = re.compile(
    r"\['(?P<id>[^']+)', '(?P<name>(?:\\'|[^'])*)', '(?P<attr>STR|AGI|INT|UNI)', '(?P<rng>Melee|Ranged)', "
    r"'(?P<ability>(?:\\'|[^'])*)', '(?P<text>(?:\\'|[^'])*)', '(?P<kind>passive|active)', (?P<cost>\d+), "
    r"'(?P<target>[^']*)', '(?P<tags>[^']*)', '(?P<ult>[^']*)'\]"
)


@dataclass(frozen=True)
class Hero:
    id: str
    name: str
    attr: str
    kind: str
    cost: int
    damage: int
    stun: bool
    amp: bool
    cleave: bool


def load_heroes() -> list[Hero]:
    text = ROSTER.read_text()
    heroes: list[Hero] = []
    for m in ROW.finditer(text):
        if m.group("id") == "spirit_bear":
            continue
        ult = m.group("ult")
        tags = m.group("tags")
        damage = 0
        if any(token in ult for token in ("mdmg laneE 2", "pdmg target 2", "mdmg target 2")):
            damage = 2
        elif any(token in ult for token in ("mdmg", "pdmg", "slam", "timber", "sky", "hood", "luna", "snap", "razor", "slash", "duel")):
            damage = 1
        heroes.append(
            Hero(
                id=m.group("id"),
                name=m.group("name").replace("\\'", "'"),
                attr=m.group("attr"),
                kind=m.group("kind"),
                cost=int(m.group("cost")),
                damage=damage,
                stun="stun" in ult,
                amp="amplify" in ult or "aura:amp" in tags or "aura:thirst" in tags,
                cleave="targets:all" in tags or "targets:cleave" in tags,
            )
        )
    if len(heroes) != 127:
        raise SystemExit(f"expected 127 heroes in the roster, found {len(heroes)}")
    return heroes


@dataclass
class Unit:
    hero: Hero
    hp: int = 2
    stunned: bool = False
    haste: bool = False
    slow: bool = False
    cast: bool = False


@dataclass
class Side:
    gold: int = 1
    xp: int = 1
    hand: list[Hero] = field(default_factory=list)
    towers: dict[str, dict[str, int]] = field(default_factory=dict)
    ancient: int = ANCIENT
    kills: int = 0

    def __post_init__(self) -> None:
        if not self.towers:
            self.towers = {lane: {"t1": TOWER["t1"], "t2": TOWER["t2"]} for lane in LANES}


def standing(side: Side) -> int:
    return sum(1 for lane in LANES for tier in ("t1", "t2") if side.towers[lane][tier] > 0)


@dataclass
class Game:
    rng: random.Random
    heroes: list[Hero]
    sides: dict[str, Side]
    board: dict[str, dict[str, list[Unit]]]
    round: int = 1
    winner: str | None = None
    towers_fallen: int = 0

    def __post_init__(self) -> None:
        self.board = {p: {lane: [] for lane in LANES} for p in ("radiant", "dire")}


def other(p: str) -> str:
    return "dire" if p == "radiant" else "radiant"


def opened_lanes(side: Side) -> int:
    return sum(1 for lane in LANES if side.towers[lane]["t1"] <= 0 and side.towers[lane]["t2"] <= 0)


def upkeep(g: Game) -> None:
    for p, side in g.sides.items():
        # Base 1, plus 1 for each enemy lane with both towers down. Three open lanes pay 4.
        side.gold += 1 + opened_lanes(g.sides[other(p)])
        side.xp += 1


def draw_and_deploy(g: Game) -> None:
    for p, side in g.sides.items():
        while side.gold > 1 and len(side.hand) < 7 and g.rng.random() < 0.65:
            side.gold -= 1
            side.hand.append(g.rng.choice(g.heroes))
        placed = 0
        side.hand.sort(key=lambda h: (h.kind != "active", -h.damage, h.cost))
        while side.hand and placed < 3 and sum(len(g.board[p][lane]) for lane in LANES) < 5:
            hero = side.hand.pop(0)
            lane = weakest_lane(g, p)
            g.board[p][lane].append(Unit(hero, haste=hero.amp and hero.kind == "passive"))
            placed += 1


def weakest_lane(g: Game, p: str) -> str:
    foe = g.sides[other(p)]

    def score(lane: str) -> tuple[int, int]:
        tw = foe.towers[lane]
        hp = tw["t1"] + tw["t2"] + (0 if tw["t1"] or tw["t2"] else ANCIENT)
        return (hp, len(g.board[p][lane]), RANK[p][lane])

    return min(LANES, key=score)


def legal_cast(g: Game, p: str) -> tuple[str, Unit] | None:
    side = g.sides[p]
    for lane in LANES:
        for unit in g.board[p][lane]:
            hero = unit.hero
            if hero.kind != "active" or unit.stunned or unit.hp <= 0 or side.xp < hero.cost:
                continue
            if getattr(unit, "cast", False):
                continue
            if hero.damage == 0 and not hero.stun and not hero.amp:
                continue
            foes = [u for u in g.board[other(p)][lane] if u.hp > 0]
            if hero.damage and not foes and (g.sides[other(p)].towers[lane]["t1"] or g.sides[other(p)].towers[lane]["t2"]):
                pass
            elif hero.damage and not foes and not hero.stun:
                continue
            return lane, unit
    return None


def resolve_cast(g: Game, p: str, lane: str, unit: Unit) -> None:
    unit.cast = True
    g.sides[p].xp -= unit.hero.cost
    if unit.hero.amp:
        unit.haste = True
    foes = [u for u in g.board[other(p)][lane] if u.hp > 0]
    if unit.hero.stun:
        for foe in foes:
            foe.stunned = True
    if unit.hero.damage:
        if foes:
            for foe in foes:
                hurt(g, foe, unit.hero.damage, p)
        else:
            hit_structure(g, other(p), lane, unit.hero.damage, p)


def cast(g: Game) -> None:
    """One interrupt at a time. Odd rounds Radiant starts, even rounds Dire starts. Each cast resolves now."""
    priority = "radiant" if g.round % 2 == 1 else "dire"
    passed = 0
    while passed < 2:
        pick = legal_cast(g, priority)
        if pick is None:
            passed += 1
            priority = other(priority)
            continue
        passed = 0
        lane, unit = pick
        resolve_cast(g, priority, lane, unit)
        priority = other(priority)


def hurt(g: Game, unit: Unit, amount: int, killer: str) -> None:
    if unit.hp <= 0:
        return
    unit.hp -= amount
    if unit.hp <= 0:
        g.sides[killer].kills += 1


def attackers(g: Game) -> list[tuple[int, int, int, str, str, Unit]]:
    rows: list[tuple[int, int, int, str, str, Unit]] = []
    for p in ("radiant", "dire"):
        for lane in LANES:
            for index, unit in enumerate(g.board[p][lane]):
                if unit.hp <= 0 or unit.stunned:
                    continue
                bracket = 0 if unit.haste else 2 if unit.slow else 1
                attr = ORDER.index(unit.hero.attr)
                rows.append((bracket, attr, RANK[p][lane] * 10 + index, p, lane, unit))
    rows.sort(key=lambda row: row[:3])
    return rows


def next_batch(g: Game, acted: set[int]) -> list[tuple[int, int, int, str, str, Unit]]:
    """The next simultaneous swing, rebuilt so a stun or Haste from an interrupt is honored."""
    planned = [row for row in attackers(g) if id(row[5]) not in acted]
    if not planned:
        return []
    batch = [planned[0]]
    while len(batch) < len(planned) and planned[0][:3] == planned[len(batch)][:3]:
        batch.append(planned[len(batch)])
    return batch


def resolve_batch(g: Game, batch: list[tuple[int, int, int, str, str, Unit]]) -> None:
    # Tied keys swing together: a killing blow does not cancel the other swing.
    shots: list[tuple[str, str, Unit, Unit | None]] = []
    for _b, _a, _k, p, lane, unit in batch:
        if unit.hp <= 0:
            continue
        foes = [u for u in g.board[other(p)][lane] if u.hp > 0]
        shots.append((p, lane, unit, foes[0] if foes else None))
    for p, lane, unit, foe in shots:
        dmg = 1 + (1 if unit.hero.amp or unit.hero.cleave else 0)
        if foe:
            hurt(g, foe, dmg, p)
            if unit.hero.cleave and len(g.board[other(p)][lane]) > 1:
                second = g.board[other(p)][lane][1]
                if second is not foe:
                    hurt(g, second, 1, p)
        else:
            hit_structure(g, other(p), lane, dmg, p)


def combat(g: Game) -> None:
    """Interrupt window, then one swing, then another window, repeating through the towers."""
    before = {(p, lane): (g.sides[p].towers[lane]["t1"], g.sides[p].towers[lane]["t2"]) for p in g.sides for lane in LANES}
    cast(g)
    acted: set[int] = set()
    while g.winner is None:
        batch = next_batch(g, acted)
        if not batch:
            break
        for row in batch:
            acted.add(id(row[5]))
        resolve_batch(g, batch)
        if g.winner is not None:
            return
        cast(g)
    if g.winner is not None:
        return
    damaged = {
        (p, lane)
        for p, lane in before
        if (g.sides[p].towers[lane]["t1"], g.sides[p].towers[lane]["t2"]) != before[(p, lane)]
        and (g.sides[p].towers[lane]["t1"] > 0 or g.sides[p].towers[lane]["t2"] > 0)
    }
    towers_fire(g, damaged)
    if g.winner is None:
        cast(g)


def hit_structure(g: Game, defender: str, lane: str, dmg: int, attacker: str) -> None:
    side = g.sides[defender]
    tw = side.towers[lane]
    if tw["t1"] > 0:
        tw["t1"] = max(0, tw["t1"] - dmg)
        if tw["t1"] == 0:
            g.sides[attacker].gold += TOWER_GOLD["t1"]
            g.towers_fallen += 1
    elif tw["t2"] > 0:
        tw["t2"] = max(0, tw["t2"] - dmg)
        if tw["t2"] == 0:
            g.sides[attacker].gold += TOWER_GOLD["t2"]
            g.towers_fallen += 1
    else:
        side.ancient = max(0, side.ancient - dmg)
        if side.ancient == 0 and g.winner is None:
            g.winner = attacker


def towers_fire(g: Game, damaged: set[tuple[str, str]]) -> None:
    for defender, lane in damaged:
        tw = g.sides[defender].towers[lane]
        if tw["t1"] > 0:
            dmg = 1
        elif tw["t2"] > 0:
            dmg = 2
        else:
            continue
        foes = [u for u in g.board[other(defender)][lane] if u.hp > 0]
        if foes:
            hurt(g, foes[0], dmg, defender)


def cleanup(g: Game) -> None:
    for p in ("radiant", "dire"):
        for lane in LANES:
            alive = []
            for unit in g.board[p][lane]:
                if unit.hp > 0:
                    unit.stunned = False
                    unit.cast = False
                    unit.haste = unit.hero.amp and unit.hero.kind == "passive"
                    unit.slow = False
                    alive.append(unit)
            g.board[p][lane] = alive
        lanes_held = sum(1 for lane in LANES if g.board[p][lane])
        side = g.sides[p]
        side.gold += side.kills
        side.xp += side.kills + lanes_held
        side.kills = 0
        while len(side.hand) > 7:
            side.hand.pop()


def end_of_turn(g: Game) -> dict[str, tuple[int, int, int]]:
    """Standing towers, gold, and XP for each side after cleanup."""
    return {p: (standing(g.sides[p]), g.sides[p].gold, g.sides[p].xp) for p in ("radiant", "dire")}


def play(g: Game, limit: int) -> dict[int, dict[str, tuple[int, int, int]]]:
    trace: dict[int, dict[str, tuple[int, int, int]]] = {}
    while g.winner is None and g.round <= limit:
        upkeep(g)
        draw_and_deploy(g)
        combat(g)
        cleanup(g)
        trace[g.round] = end_of_turn(g)
        g.round += 1
    return trace


def simulate(games: int, seed: int, limit: int) -> None:
    heroes = load_heroes()
    wins: Counter[str] = Counter()
    lengths: list[int] = []
    gold: list[int] = []
    xp: list[int] = []
    towers: list[int] = []
    unfinished = 0
    # round -> sums of (towers, gold, xp) per side, and how many games reached it
    reached: Counter[int] = Counter()
    totals: dict[int, dict[str, list[int]]] = {}
    # checkpoint -> (behind games, wins from behind, wins that happened after the checkpoint)
    marks = list(range(5, limit + 1, 5))
    behind: dict[int, Counter[str]] = {mark: Counter() for mark in marks}
    comeback: dict[int, Counter[str]] = {mark: Counter() for mark in marks}
    later: dict[int, Counter[str]] = {mark: Counter() for mark in marks}
    for n in range(games):
        rng = random.Random(seed + n)
        g = Game(rng=rng, heroes=heroes, sides={"radiant": Side(), "dire": Side()}, board={})
        for side in g.sides.values():
            side.hand = [rng.choice(heroes) for _ in range(5)]
        trace = play(g, limit)
        length = g.round - 1 if g.winner else limit
        if g.winner:
            wins[g.winner] += 1
            lengths.append(length)
        else:
            unfinished += 1
            lengths.append(limit)
        for side in g.sides.values():
            gold.append(side.gold)
            xp.append(side.xp)
        towers.append(g.towers_fallen)
        for rnd, snap in trace.items():
            reached[rnd] += 1
            bucket = totals.setdefault(rnd, {"radiant": [0, 0, 0], "dire": [0, 0, 0]})
            for p in ("radiant", "dire"):
                for i, value in enumerate(snap[p]):
                    bucket[p][i] += value
        for mark in marks:
            snap = trace.get(mark)
            if snap is None or g.winner is None:
                continue
            for p in ("radiant", "dire"):
                if snap[p][0] < snap[other(p)][0]:
                    behind[mark][p] += 1
                    if g.winner == p:
                        comeback[mark][p] += 1
                        if length > mark:
                            later[mark][p] += 1

    def avg(xs: list[int]) -> float:
        return sum(xs) / len(xs) if xs else 0

    print(f"games {games}  seed {seed}  round cap {limit}")
    print(f"finished {games - unfinished}  unfinished {unfinished}")
    print(f"radiant wins {wins['radiant']}  dire wins {wins['dire']}")
    if games:
        print(f"radiant win rate {wins['radiant'] / games:.1%}")
    print(f"mean length {avg(lengths):.1f} rounds")
    print(f"mean gold left {avg(gold):.1f}  mean xp left {avg(xp):.1f}")
    print(f"mean towers destroyed {avg(towers):.1f}")
    print()
    print("end of turn, average of games still going (towers standing / gold / xp)")
    print(f"{'round':>5}  {'games':>5}  {'R towers':>8}  {'D towers':>8}  {'R gold':>7}  {'D gold':>7}  {'R xp':>7}  {'D xp':>7}")
    for rnd in sorted(totals):
        n = reached[rnd]
        rt, rg, rx = (totals[rnd]["radiant"][i] / n for i in range(3))
        dt, dg, dx = (totals[rnd]["dire"][i] / n for i in range(3))
        print(f"{rnd:5d}  {n:5d}  {rt:8.2f}  {dt:8.2f}  {rg:7.2f}  {dg:7.2f}  {rx:7.2f}  {dx:7.2f}")
    print()
    print("checkpoints: average gold and xp, and wins from behind on towers")
    print("Behind means fewer standing towers than the opponent at the end of that round.")
    for mark in marks:
        n = reached[mark]
        if n == 0:
            continue
        rg, rx = totals[mark]["radiant"][1] / n, totals[mark]["radiant"][2] / n
        dg, dx = totals[mark]["dire"][1] / n, totals[mark]["dire"][2] / n
        print(f"after round {mark:>2}  games {n:4d}  radiant gold {rg:6.2f} xp {rx:6.2f}  dire gold {dg:6.2f} xp {dx:6.2f}")
        for p in ("radiant", "dire"):
            b = behind[mark][p]
            c = comeback[mark][p]
            late = later[mark][p]
            rate = c / b if b else 0
            print(f"  {p:8} behind {b:4d}  won anyway {c:4d} ({rate:5.1%})  of which the win came after round {mark}: {late}")
    costs = Counter(h.cost for h in heroes if h.kind == "active")
    print()
    print(f"active abilities {sum(costs.values())}  costs {dict(sorted(costs.items()))}  passives {sum(h.kind == 'passive' for h in heroes)}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Version 3 viability simulation")
    parser.add_argument("--games", type=int, default=200)
    parser.add_argument("--seed", type=int, default=1)
    parser.add_argument("--limit", type=int, default=40)
    args = parser.parse_args()
    simulate(args.games, args.seed, args.limit)


if __name__ == "__main__":
    main()
