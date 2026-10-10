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


def upkeep(g: Game) -> None:
    for p, side in g.sides.items():
        bonus = 1 if standing(g.sides[other(p)]) == 0 else 0
        side.gold += 1 + bonus
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


def cast(g: Game) -> None:
    """Both sides declare, then the declarations resolve last-in, first-out."""
    declared: list[tuple[str, str, Unit]] = []
    for p in ("radiant", "dire"):
        side = g.sides[p]
        for lane in LANES:
            for unit in g.board[p][lane]:
                hero = unit.hero
                if hero.kind != "active" or unit.stunned or side.xp < hero.cost:
                    continue
                if hero.damage == 0 and not hero.stun and not hero.amp:
                    continue
                foes = [u for u in g.board[other(p)][lane] if u.hp > 0]
                if hero.damage and not foes and (g.sides[other(p)].towers[lane]["t1"] or g.sides[other(p)].towers[lane]["t2"]):
                    pass
                elif hero.damage and not foes and not hero.stun:
                    continue
                side.xp -= hero.cost
                declared.append((p, lane, unit))
    for p, lane, unit in reversed(declared):
        if unit.hp <= 0 or unit.stunned:
            g.sides[p].xp += unit.hero.cost
            continue
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


def strike(g: Game) -> None:
    planned = attackers(g)
    # Tied keys swing together: a killing blow does not cancel the other swing.
    i = 0
    while i < len(planned):
        batch = [planned[i]]
        while i + len(batch) < len(planned) and planned[i][:3] == planned[i + len(batch)][:3]:
            batch.append(planned[i + len(batch)])
        i += len(batch)
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


def play(g: Game, limit: int) -> None:
    while g.winner is None and g.round <= limit:
        upkeep(g)
        draw_and_deploy(g)
        before = {(p, lane): (g.sides[p].towers[lane]["t1"], g.sides[p].towers[lane]["t2"]) for p in g.sides for lane in LANES}
        cast(g)
        strike(g)
        damaged = {
            (p, lane)
            for p, lane in before
            if (g.sides[p].towers[lane]["t1"], g.sides[p].towers[lane]["t2"]) != before[(p, lane)]
            and (g.sides[p].towers[lane]["t1"] > 0 or g.sides[p].towers[lane]["t2"] > 0)
        }
        towers_fire(g, damaged)
        cleanup(g)
        g.round += 1


def simulate(games: int, seed: int, limit: int) -> None:
    heroes = load_heroes()
    wins: Counter[str] = Counter()
    lengths: list[int] = []
    gold: list[int] = []
    xp: list[int] = []
    towers: list[int] = []
    unfinished = 0
    for n in range(games):
        rng = random.Random(seed + n)
        g = Game(rng=rng, heroes=heroes, sides={"radiant": Side(), "dire": Side()}, board={})
        for side in g.sides.values():
            side.hand = [rng.choice(heroes) for _ in range(5)]
        play(g, limit)
        if g.winner:
            wins[g.winner] += 1
            lengths.append(g.round - 1)
        else:
            unfinished += 1
            lengths.append(limit)
        for side in g.sides.values():
            gold.append(side.gold)
            xp.append(side.xp)
        towers.append(g.towers_fallen)
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
    costs = Counter(h.cost for h in heroes if h.kind == "active")
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
