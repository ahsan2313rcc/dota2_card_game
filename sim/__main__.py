"""Run version 3 viability games.

    python -m sim --games 200 --seed 1

The simulator uses the printed hero sheet in ``src/game/roster.ts`` and the version 3
economy. It is a lane-level model: two heuristic sides, real ability costs, attack
order, tower bounties, and hero-kill income. A thin board spends gold drawing heroes.
A stocked board spends gold playing items. Each side can send a hero to its home jungle
once the lanes are covered. Each active ability can be cast once per
round, or twice that round when a Refresher is played. The full status list is not
simulated.
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


ENOUGH_HEROES = 5
STYLES = ("balanced", "lane", "jungler", "defender")


@dataclass
class Unit:
    hero: Hero
    owner: str = ""
    hp: int = 2
    stunned: bool = False
    disarmed: bool = False
    haste: bool = False
    slow: bool = False
    # Casts this round. Reset at cleanup, so the same ability is available again next round.
    casts: int = 0
    # A Refresher played this round allows a second cast at no XP.
    refresher: bool = False
    amplify: int = 0
    # One Shield. A bought Shield stays through cleanup. A rune Shield does not.
    shield: int = 0
    persist_shield: bool = False


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


def tier_counts(side: Side) -> tuple[int, int]:
    t1 = sum(1 for lane in LANES if side.towers[lane]["t1"] > 0)
    t2 = sum(1 for lane in LANES if side.towers[lane]["t2"] > 0)
    return t1, t2


@dataclass
class Camp:
    kind: str
    hp: int
    shield: int = 0
    evade: int = 0


@dataclass
class Game:
    rng: random.Random
    heroes: list[Hero]
    sides: dict[str, Side]
    board: dict[str, dict[str, list[Unit]]]
    round: int = 1
    winner: str | None = None
    towers_fallen: int = 0
    played: dict[str, int] = field(default_factory=dict)
    casts: dict[str, int] = field(default_factory=dict)
    items: dict[str, int] = field(default_factory=dict)
    shields: dict[str, int] = field(default_factory=dict)
    neutrals: dict[str, int] = field(default_factory=dict)
    buybacks: dict[str, int] = field(default_factory=dict)
    neutral_kills: dict[str, int] = field(default_factory=dict)
    jungle_sent: dict[str, int] = field(default_factory=dict)
    aegis: dict[str, int] = field(default_factory=dict)
    jungle: dict[str, list[Unit]] = field(default_factory=dict)
    camps: dict[str, "Camp | None"] = field(default_factory=dict)
    neutral_deck: list[str] = field(default_factory=list)
    neutral_discard: list[str] = field(default_factory=list)
    attacked_towers: set[tuple[str, str]] = field(default_factory=set)
    style: dict[str, str] = field(default_factory=lambda: {"radiant": "balanced", "dire": "balanced"})
    # Heroes who rotated into the enemy jungle. Assignment cannot start there.
    invade: dict[str, list[Unit]] = field(default_factory=dict)

    def __post_init__(self) -> None:
        self.board = {p: {lane: [] for lane in LANES} for p in ("radiant", "dire")}
        self.jungle = {p: [] for p in ("radiant", "dire")}
        self.invade = {p: [] for p in ("radiant", "dire")}
        self.camps = {p: None for p in ("radiant", "dire")}
        self.played = {p: 0 for p in ("radiant", "dire")}
        self.casts = {p: 0 for p in ("radiant", "dire")}
        self.items = {p: 0 for p in ("radiant", "dire")}
        self.shields = {p: 0 for p in ("radiant", "dire")}
        self.neutrals = {p: 0 for p in ("radiant", "dire")}
        self.buybacks = {p: 0 for p in ("radiant", "dire")}
        self.neutral_kills = {p: 0 for p in ("radiant", "dire")}
        self.jungle_sent = {p: 0 for p in ("radiant", "dire")}
        self.attacked_towers = set()
        self.aegis = {p: 0 for p in ("radiant", "dire")}
        deck = ["golem", "thunderhide", "ice_shaman", "dragon"] * 3 + ["roshan", "tormentor", "tormentor"]
        self.rng.shuffle(deck)
        self.neutral_deck = deck


def other(p: str) -> str:
    return "dire" if p == "radiant" else "radiant"


def opened_lanes(side: Side) -> int:
    return sum(1 for lane in LANES if side.towers[lane]["t1"] <= 0 and side.towers[lane]["t2"] <= 0)


def upkeep(g: Game) -> None:
    for p, side in g.sides.items():
        # Base 1, plus 1 for each enemy lane with both towers down. Three open lanes pay 4.
        side.gold += 1 + opened_lanes(g.sides[other(p)])
        side.xp += 1


def living(g: Game, p: str) -> list[tuple[str, Unit]]:
    rows = [(lane, unit) for lane in LANES for unit in g.board[p][lane] if unit.hp > 0]
    rows += [("jungle", unit) for unit in g.jungle[p] if unit.hp > 0]
    rows += [("invade", unit) for unit in g.invade[p] if unit.hp > 0]
    return rows


def lane_heroes(g: Game, p: str) -> int:
    return sum(1 for lane in LANES for unit in g.board[p][lane] if unit.hp > 0)


def board_size(g: Game, p: str) -> int:
    return len(living(g, p))


def draw_and_deploy(g: Game) -> None:
    """Spend gold. A thin board buys hero cards. A stocked board buys items and plays them."""
    for p, side in g.sides.items():
        on_board = len(living(g, p))
        if on_board < ENOUGH_HEROES:
            while side.gold >= 1 and len(side.hand) < 10:
                side.gold -= 1
                side.hand.append(g.rng.choice(g.heroes))
        placed = 0
        side.hand.sort(key=lambda h: (h.kind != "active", -h.damage, h.cost))
        while side.hand and placed < 3 and board_size(g, p) < 5:
            hero = side.hand.pop(0)
            unit = Unit(hero, owner=p, haste=hero.amp and hero.kind == "passive")
            lane = best_lane(g, p)
            lane_score = lane_value(g, p, lane)
            jungle_score = jungle_value(g, p)
            invade_score = invade_value(g, p)
            if jungle_score > lane_score and jungle_score >= invade_score:
                g.jungle[p].append(unit)
                g.jungle_sent[p] += 1
            elif invade_score > lane_score:
                g.invade[p].append(unit)
                g.jungle_sent[p] += 1
            else:
                g.board[p][lane].append(unit)
            placed += 1
            g.played[p] += 1
        # Items are played onto heroes already on the board, so the gold leaves the bank.
        while len(living(g, p)) >= ENOUGH_HEROES and side.gold >= 1 and g.items[p] < len(living(g, p)):
            heroes = living(g, p)
            active = [pair for pair in heroes if pair[1].hero.kind == "active" and not pair[1].refresher]
            if side.gold >= 3 and active:
                _lane, unit = active[0]
                side.gold -= 3
                unit.refresher = True
            elif side.gold >= 2:
                _lane, unit = heroes[0]
                side.gold -= 2
                unit.amplify += 1
            else:
                _lane, unit = heroes[0]
                side.gold -= 1
                unit.haste = True
            g.items[p] += 1


def tower_pressure(t1: int, t2: int) -> int:
    if t1 <= 0 and t2 <= 0:
        return 8
    if t1 <= 0:
        return 5 + (TOWER["t2"] - t2)
    return TOWER["t1"] - t1 + 1


def best_lane(g: Game, p: str) -> str:
    return max(LANES, key=lambda lane: (lane_value(g, p, lane), -RANK[p][lane]))


# 2 gold + 2 XP + a rune. A Tier 1 chip sits under this. A Tier 2 garrison sits over it.
NEUTRAL_KILL = 5


def garrison(t1: int, t2: int, foes: int, style: str) -> int:
    """Ancient is always answered. Lane and jungler skip Tier 1. Defender overfills."""
    if foes <= 0:
        return 0
    if t1 <= 0 and t2 <= 0:
        return min(5, foes + (2 if style == "defender" else 1))
    if t1 <= 0:
        if style == "lane":
            return max(0, foes - 1)
        if style == "defender":
            return min(5, foes + 1)
        if style == "jungler":
            return min(5, foes + (1 if t2 < TOWER["t2"] else 0))
        return foes
    if style in ("jungler", "lane"):
        return 0
    if style == "defender":
        return foes
    matching = max(0, foes - 1)
    return max(matching, 1) if t1 <= foes else matching


def defend_value(t1: int, t2: int, foes: int, mine: int, style: str) -> int:
    """One more defender. 0 once the garrison is full. A soaker cuts the Tier 2 score by 4."""
    if mine >= garrison(t1, t2, foes, style):
        return 0
    if t1 <= 0 and t2 <= 0:
        return 50 + foes
    if t1 <= 0:
        raw = 2 + 2 * max(t2, 0) + 3
        scored = raw - 4 if mine else raw
        return max(scored, 14) if style == "jungler" else scored
    return 8 if mine == 0 and foes >= t1 else 4


def lane_value(g: Game, p: str, lane: str) -> int:
    """Attack the enemy building, or fill the garrison if that scores higher."""
    style = g.style[p]
    foe = g.sides[other(p)].towers[lane]
    own = g.sides[p].towers[lane]
    foes = sum(1 for unit in g.board[other(p)][lane] if unit.hp > 0)
    mine = sum(1 for unit in g.board[p][lane] if unit.hp > 0)
    crowd = max(0, mine - 2) if style == "lane" else mine * 3
    attack = tower_pressure(foe["t1"], foe["t2"]) * (3 if style == "lane" else 2) + foes * 2 - crowd
    if foe["t1"] <= 0 and foe["t2"] <= 0:
        attack += 28
    if style == "lane" and (foe["t1"] > 0 or foe["t2"] > 0):
        attack += 12
    return max(attack, defend_value(own["t1"], own["t2"], foes, mine, style))


def jungle_value(g: Game, p: str) -> int:
    """Balanced farms for 5. A jungler stacks three at 12. Lane and defender stay out."""
    style = g.style[p]
    if style in ("lane", "defender"):
        return -999
    camp = g.camps[p]
    if camp is None or camp.hp <= 0:
        return -999
    mine = sum(1 for unit in g.jungle[p] if unit.hp > 0)
    if style == "jungler":
        return 12 if mine < 3 else -999
    if lane_heroes(g, p) < 2:
        return -999
    cap = 2 if camp.kind == "roshan" else 3
    if mine >= cap:
        return -999
    return NEUTRAL_KILL


def invade_value(g: Game, p: str) -> int:
    """A jungler steps into the enemy camp once two heroes are already clearing home."""
    if g.style[p] != "jungler":
        return -999
    camp = g.camps[other(p)]
    if camp is None or camp.hp <= 0:
        return -999
    home = sum(1 for unit in g.jungle[p] if unit.hp > 0)
    mine = sum(1 for unit in g.invade[p] if unit.hp > 0)
    if home < 2 or mine >= 3:
        return -999
    return 8


def legal_cast(g: Game, p: str) -> tuple[str, Unit] | None:
    """One cast per hero each round. A Refresher allows a second cast that same round, at 0 XP."""
    side = g.sides[p]
    best: tuple[tuple[int, int, int], str, Unit] | None = None
    for lane, unit in living(g, p):
        if lane in ("jungle", "invade"):
            continue
        hero = unit.hero
        if hero.kind != "active" or unit.stunned:
            continue
        limit = 2 if unit.refresher else 1
        if unit.casts >= limit:
            continue
        cost = 0 if unit.casts else hero.cost
        if side.xp < cost:
            continue
        foes = [u for u in g.board[other(p)][lane] if u.hp > 0]
        score = (hero.damage + hero.stun + hero.amp, len(foes), -hero.cost)
        if best is None or score > best[0]:
            best = (score, lane, unit)
    return None if best is None else (best[1], best[2])


def resolve_cast(g: Game, p: str, lane: str, unit: Unit) -> None:
    cost = 0 if unit.casts else unit.hero.cost
    unit.casts += 1
    g.sides[p].xp -= cost
    g.casts[p] += 1
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


def legal_shield(g: Game, p: str) -> Unit | None:
    """3 XP, one Shield, no stacking. Prefer a hero who is about to be hit."""
    if g.sides[p].xp < 3:
        return None
    open_heroes = [unit for _lane, unit in living(g, p) if unit.shield <= 0]
    if not open_heroes:
        return None

    def threat(unit: Unit) -> tuple[int, int]:
        lane = next(lane for lane, candidate in living(g, p) if candidate is unit)
        if lane in ("jungle", "invade"):
            camp = g.camps[other(p) if lane == "invade" else p]
            return ((1 if camp is not None and camp.hp > 0 else 0), -unit.hp)
        foes = sum(1 for foe in g.board[other(p)][lane] if foe.hp > 0)
        return (foes, -unit.hp)

    return max(open_heroes, key=threat)


def buy_shield(g: Game, p: str, unit: Unit) -> None:
    g.sides[p].xp -= 3
    unit.shield = 1
    unit.persist_shield = True
    g.shields[p] += 1


def cast(g: Game) -> None:
    """One interrupt at a time. Odd rounds Radiant starts, even rounds Dire starts. Each action resolves now."""
    priority = "radiant" if g.round % 2 == 1 else "dire"
    passed = 0
    while passed < 2 and g.winner is None:
        pick = legal_cast(g, priority)
        if pick is not None:
            passed = 0
            lane, unit = pick
            resolve_cast(g, priority, lane, unit)
            priority = other(priority)
            continue
        shield = legal_shield(g, priority)
        if shield is not None:
            passed = 0
            buy_shield(g, priority, shield)
            priority = other(priority)
            continue
        passed += 1
        priority = other(priority)


def hurt(g: Game, unit: Unit, amount: int, killer: str) -> None:
    if unit.hp <= 0 or amount <= 0:
        return
    unit.hp -= amount
    if unit.hp > 0:
        return
    owner = unit.owner
    if owner in g.aegis and g.aegis[owner] > 0:
        g.aegis[owner] -= 1
        unit.hp = 2
        return
    if killer in g.sides:
        g.sides[killer].kills += 1


def physical(g: Game, unit: Unit, amount: int, killer: str) -> None:
    """A Shield blocks one physical hit, then breaks. Magical ability damage ignores it."""
    if unit.shield > 0 and amount > 0:
        unit.shield = 0
        return
    hurt(g, unit, amount, killer)


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
        dmg = 1 + unit.amplify + (1 if unit.hero.amp or unit.hero.cleave else 0)
        if foe:
            physical(g, foe, dmg, p)
            if unit.hero.cleave and len(g.board[other(p)][lane]) > 1:
                second = g.board[other(p)][lane][1]
                if second is not foe:
                    physical(g, second, 1, p)
        else:
            hit_structure(g, other(p), lane, dmg, p)


def draw_neutral(g: Game) -> str | None:
    skipped: list[str] = []
    kind: str | None = None
    while True:
        if not g.neutral_deck:
            if not g.neutral_discard:
                break
            g.neutral_deck = g.neutral_discard
            g.neutral_discard = []
            g.rng.shuffle(g.neutral_deck)
        nxt = g.neutral_deck.pop()
        if nxt == "roshan" and g.round < 4:
            skipped.append(nxt)
            continue
        kind = nxt
        break
    g.neutral_deck.extend(skipped)
    if skipped:
        g.rng.shuffle(g.neutral_deck)
    return kind


def spawn_camps(g: Game) -> None:
    for p in ("radiant", "dire"):
        camp = g.camps[p]
        if camp is not None and camp.hp > 0:
            if camp.kind in ("golem", "tormentor"):
                camp.shield = 1
            if camp.kind == "roshan":
                camp.evade = 1
            continue
        kind = draw_neutral(g)
        if kind is None:
            g.camps[p] = None
            continue
        g.camps[p] = Camp(
            kind,
            3 if kind == "roshan" else 2,
            shield=1 if kind in ("golem", "tormentor") else 0,
            evade=1 if kind == "roshan" else 0,
        )


RUNES = ("gold", "regen", "dd", "shield", "arcane", "illusion", "invis", "haste", "wisdom", "water")


def apply_rune(g: Game, p: str) -> None:
    """A camp clear draws one rune and plays it on a lane hero before the swings."""
    rune = g.rng.choice(RUNES)
    hero = next((unit for lane, unit in living(g, p) if lane != "jungle"), None)
    if rune == "gold":
        g.sides[p].gold += 1
    elif rune == "wisdom":
        g.sides[p].xp += 1
    elif rune == "regen" and hero is not None:
        hero.hp = 2
    elif rune == "dd" and hero is not None:
        hero.amplify += 1
    elif rune == "shield" and hero is not None and hero.shield <= 0:
        hero.shield = 1
    elif rune == "haste" and hero is not None:
        hero.haste = True
    elif rune == "arcane" and hero is not None and hero.casts == 0:
        hero.hero = Hero(
            hero.hero.id,
            hero.hero.name,
            hero.hero.attr,
            hero.hero.kind,
            max(0, hero.hero.cost - 1),
            hero.hero.damage,
            hero.hero.stun,
            hero.hero.amp,
            hero.hero.cleave,
        )


def claim_camp(g: Game, p: str, camp: Camp) -> None:
    g.neutrals[p] += 1
    g.neutral_kills[p] += 1
    g.neutral_discard.append(camp.kind)
    if camp.kind == "roshan":
        g.sides[p].gold += 3
        g.sides[p].xp += 3
        g.aegis[p] += 1
        apply_rune(g, p)
    else:
        # A normal camp and a Tormentor both pay 2 Gold, 2 XP, and a rune. The Tormentor also leaves a Refresher.
        g.sides[p].gold += 2
        g.sides[p].xp += 2
        apply_rune(g, p)
        if camp.kind == "tormentor":
            active = [unit for _lane, unit in living(g, p) if unit.hero.kind == "active" and not unit.refresher]
            if active:
                g.rng.choice(active).refresher = True
    g.camps[p] = None


def fight_jungle(g: Game) -> None:
    """One camp swing. Home heroes and enemy invaders both hit it. The larger surviving side claims the kill."""
    for p in ("radiant", "dire"):
        home = [unit for unit in g.jungle[p] if unit.hp > 0]
        invaders = [unit for unit in g.invade[other(p)] if unit.hp > 0]
        heroes = home + invaders
        camp = g.camps[p]
        if not heroes or camp is None or camp.hp <= 0:
            continue
        if camp.kind == "roshan":
            for hero in heroes:
                hero.disarmed = True
                hurt(g, hero, 1, "neutral")
        elif camp.kind in ("thunderhide", "dragon"):
            for hero in heroes:
                hurt(g, hero, 1, "neutral")
        elif camp.kind == "ice_shaman":
            hurt(g, heroes[0], 1, "neutral")
        for hero in heroes:
            if hero.hp <= 0 or hero.disarmed or camp.hp <= 0:
                continue
            if camp.kind == "roshan" and camp.evade > 0:
                camp.evade = 0
                continue
            if camp.shield > 0:
                camp.shield = 0
                continue
            dealt = 1 + hero.amplify
            camp.hp -= dealt
            if camp.kind == "tormentor":
                hurt(g, hero, dealt, "neutral")
        if camp.hp <= 0:
            owner_alive = sum(1 for unit in home if unit.hp > 0)
            invade_alive = sum(1 for unit in invaders if unit.hp > 0)
            claim_camp(g, other(p) if invade_alive > owner_alive else p, camp)
            continue
        if camp.kind == "tormentor":
            continue
        targets = heroes if camp.kind in ("dragon", "roshan", "thunderhide") else heroes[:1]
        for hero in targets:
            if hero.hp > 0:
                physical(g, hero, 1, "neutral")


def combat(g: Game) -> None:
    """Interrupt window, then one swing, then another window, repeating through the towers."""
    g.attacked_towers = set()
    cast(g)
    fight_jungle(g)
    if g.winner is not None:
        return
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
    towers_fire(g)
    if g.winner is None:
        cast(g)


def hit_structure(g: Game, defender: str, lane: str, dmg: int, attacker: str) -> None:
    side = g.sides[defender]
    tw = side.towers[lane]
    if tw["t1"] > 0 or tw["t2"] > 0:
        g.attacked_towers.add((defender, lane))
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


def towers_fire(g: Game) -> None:
    """A tower fires because it was attacked, even when the hit dealt no damage."""
    for defender, lane in g.attacked_towers:
        tw = g.sides[defender].towers[lane]
        foes = [u for u in g.board[other(defender)][lane] if u.hp > 0]
        if not foes:
            continue
        if tw["t1"] > 0:
            physical(g, foes[0], 1, defender)
        elif tw["t2"] > 0:
            # First 3 units, 1 each. This sim has no creeps, so the front heroes take the shots.
            for foe in foes[:3]:
                physical(g, foe, 1, defender)


def cleanup(g: Game) -> None:
    for p in ("radiant", "dire"):
        for lane in (*LANES, "jungle", "invade"):
            alive = []
            if lane == "invade":
                pile = g.invade[p]
            elif lane == "jungle":
                pile = g.jungle[p]
            else:
                pile = g.board[p][lane]
            for unit in pile:
                if unit.hp > 0:
                    unit.stunned = False
                    unit.disarmed = False
                    unit.casts = 0
                    unit.refresher = False
                    unit.amplify = 0
                    unit.haste = unit.hero.amp and unit.hero.kind == "passive"
                    unit.slow = False
                    if not unit.persist_shield:
                        unit.shield = 0
                    alive.append(unit)
            if lane == "invade":
                g.invade[p] = alive
            elif lane == "jungle":
                g.jungle[p] = alive
            else:
                g.board[p][lane] = alive
        lanes_held = sum(1 for lane in LANES if g.board[p][lane])
        side = g.sides[p]
        side.gold += side.kills
        side.xp += side.kills + lanes_held
        side.kills = 0
        for lane in LANES:
            tw = side.towers[lane]
            if tw["t1"] > 0 or tw["t2"] > 0:
                continue
            for unit in g.board[p][lane]:
                if unit.hp > 0 and unit.owner == p:
                    unit.hp = 2
        while len(side.hand) > 7:
            side.hand.pop()


# t1 standing, t2 standing, gold, xp, heroes, abilities, items, neutrals, shields, buybacks
Snap = tuple[int, int, int, int, int, int, int, int, int, int]
SNAP_LEN = 10
ACTION_AT = 4


def end_of_turn(g: Game) -> dict[str, Snap]:
    """Tier 1, Tier 2, gold, XP, heroes, abilities, items, neutrals killed, Shields, and buybacks."""
    return {
        p: (
            *tier_counts(g.sides[p]),
            g.sides[p].gold,
            g.sides[p].xp,
            g.played[p],
            g.casts[p],
            g.items[p],
            g.neutrals[p],
            g.shields[p],
            g.buybacks[p],
        )
        for p in ("radiant", "dire")
    }


def play(g: Game, limit: int) -> dict[int, dict[str, Snap]]:
    trace: dict[int, dict[str, Snap]] = {}
    while g.winner is None and g.round <= limit:
        g.played = {p: 0 for p in ("radiant", "dire")}
        g.casts = {p: 0 for p in ("radiant", "dire")}
        g.items = {p: 0 for p in ("radiant", "dire")}
        g.shields = {p: 0 for p in ("radiant", "dire")}
        g.neutrals = {p: 0 for p in ("radiant", "dire")}
        g.buybacks = {p: 0 for p in ("radiant", "dire")}
        spawn_camps(g)
        upkeep(g)
        draw_and_deploy(g)
        combat(g)
        cleanup(g)
        trace[g.round] = end_of_turn(g)
        g.round += 1
    return trace


def rd(a: float, b: float) -> str:
    return f"{a:.2f}/{b:.2f}"


def simulate(games: int, seed: int, limit: int, radiant: str = "balanced", dire: str = "balanced") -> dict[str, object]:
    heroes = load_heroes()
    wins: Counter[str] = Counter()
    lengths: list[int] = []
    gold: list[int] = []
    xp: list[int] = []
    towers: list[int] = []
    unfinished = 0
    neutral_games = 0
    jungle_sent: list[dict[str, int]] = []
    # round -> sums of (t1, t2, gold, xp, heroes, abilities, items, neutrals, shields, buybacks)
    reached: Counter[int] = Counter()
    totals: dict[int, dict[str, list[int]]] = {}
    lifetime = {"radiant": [0, 0, 0, 0, 0, 0], "dire": [0, 0, 0, 0, 0, 0]}
    marks = [5, 10, 15]
    ahead: dict[int, Counter[str]] = {mark: Counter() for mark in marks}
    held: dict[int, Counter[str]] = {mark: Counter() for mark in marks}
    behind: dict[int, Counter[str]] = {mark: Counter() for mark in marks}
    comeback: dict[int, Counter[str]] = {mark: Counter() for mark in marks}
    even: Counter[int] = Counter()
    # ordinal 0..5: round the nth tower of that tier fell anywhere on the map
    map_fall: dict[str, list[list[int]]] = {"t1": [[] for _ in range(6)], "t2": [[] for _ in range(6)]}
    # ordinal 0..2: round that side lost its nth tower of that tier
    side_fall: dict[str, dict[str, list[list[int]]]] = {
        tier: {p: [[] for _ in range(3)] for p in ("radiant", "dire")} for tier in ("t1", "t2")
    }
    first_t2_took: Counter[str] = Counter()
    first_t2_won: Counter[str] = Counter()
    first_t2_round: dict[str, list[int]] = {"radiant": [], "dire": [], "tie": []}
    for n in range(games):
        rng = random.Random(seed + n)
        g = Game(
            rng=rng,
            heroes=heroes,
            sides={"radiant": Side(), "dire": Side()},
            board={},
            style={"radiant": radiant, "dire": dire},
        )
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
        if g.neutral_kills["radiant"] or g.neutral_kills["dire"]:
            neutral_games += 1
        jungle_sent.append(dict(g.jungle_sent))
        for side in g.sides.values():
            gold.append(side.gold)
            xp.append(side.xp)
        towers.append(g.towers_fallen)
        for rnd, snap in trace.items():
            reached[rnd] += 1
            bucket = totals.setdefault(rnd, {"radiant": [0] * SNAP_LEN, "dire": [0] * SNAP_LEN})
            for p in ("radiant", "dire"):
                for i, value in enumerate(snap[p]):
                    bucket[p][i] += value
                    if i >= ACTION_AT:
                        lifetime[p][i - ACTION_AT] += value
        record_falls(trace, map_fall, side_fall, first_t2_took, first_t2_won, first_t2_round, g.winner)
        for mark in marks:
            snap = trace.get(mark)
            if snap is None or g.winner is None:
                continue
            rt, dt = up(snap["radiant"]), up(snap["dire"])
            if rt == dt:
                even[mark] += 1
            for p in ("radiant", "dire"):
                if up(snap[p]) > up(snap[other(p)]):
                    ahead[mark][p] += 1
                    if g.winner == p:
                        held[mark][p] += 1
                elif up(snap[p]) < up(snap[other(p)]):
                    behind[mark][p] += 1
                    if g.winner == p:
                        comeback[mark][p] += 1

    def avg(xs: list[int]) -> float:
        return sum(xs) / len(xs) if xs else 0

    print(f"games {games}  seed {seed}  round cap {limit}  radiant {radiant}  dire {dire}")
    print(f"finished {games - unfinished}  unfinished {unfinished}")
    print(f"radiant wins {wins['radiant']}  dire wins {wins['dire']}")
    if games:
        print(f"radiant win rate {wins['radiant'] / games:.1%}")
    print(f"mean length {avg(lengths):.1f} rounds")
    print(f"mean gold left {avg(gold):.1f}  mean xp left {avg(xp):.1f}")
    print(f"mean towers destroyed {avg(towers):.1f}")
    if games:
        names = ("heroes", "abilities", "items", "neutrals", "shields", "buybacks")
        parts = []
        for p in ("radiant", "dire"):
            bits = "  ".join(f"{name} {lifetime[p][i] / games:.2f}" for i, name in enumerate(names))
            parts.append(f"{p} {bits}")
        print("mean per game  " + "  |  ".join(parts))
        print(f"games with a neutral kill {neutral_games} ({neutral_games / games:.1%})")
        sent_r = sum(g_sent["radiant"] for g_sent in jungle_sent) / games
        sent_d = sum(g_sent["dire"] for g_sent in jungle_sent) / games
        print(f"mean heroes sent to the home jungle  radiant {sent_r:.2f}  dire {sent_d:.2f}")
    print()
    print("end of turn, games still going. Each cell is Radiant/Dire.")
    print("Hero, Ability, Item, Neutral, Shield, and Buyback are counts for that round.")
    labels = ("T1", "T2", "Gold", "XP", "Hero", "Ability", "Item", "Neutral", "Shield", "Buyback")
    print(f"{'rnd':>3} {'games':>5}  " + "  ".join(f"{label:>9}" for label in labels))
    for rnd in sorted(totals):
        n = reached[rnd]
        cells = [rd(totals[rnd]["radiant"][i] / n, totals[rnd]["dire"][i] / n) for i in range(SNAP_LEN)]
        print(f"{rnd:3d} {n:5d}  " + "  ".join(f"{cell:>9}" for cell in cells))
    print()
    print("Advantage is more standing towers (Tier 1 + Tier 2). Lead held is how often that side then wins.")
    print("Comeback is fewer towers, and that side still wins. Even is a tower tie.")
    print(f"{'rnd':>3} {'games':>5}  {'ahead R/D':>11}  {'lead held':>13}  {'even':>5}  {'comeback R':>14}  {'comeback D':>14}")
    for mark in marks:
        n = reached[mark]
        if n == 0:
            print(f"{mark:3d} {0:5d}  no games still going")
            continue
        ar, ad = ahead[mark]["radiant"], ahead[mark]["dire"]
        hr = held[mark]["radiant"] / ar if ar else 0
        hd = held[mark]["dire"] / ad if ad else 0
        br, bd = behind[mark]["radiant"], behind[mark]["dire"]
        cr, cd = comeback[mark]["radiant"], comeback[mark]["dire"]
        rr = cr / br if br else 0
        rd_ = cd / bd if bd else 0
        print(
            f"{mark:3d} {n:5d}  {ar:4d}/{ad:<4d}  {hr:5.1%}/{hd:<5.1%}  {even[mark]:5d}  "
            f"{cr:4d}/{br:<4d} {rr:5.1%}  {cd:4d}/{bd:<4d} {rd_:5.1%}"
        )
    print()
    print("Round a tower falls. R/D is the side that lost it. Same-round falls share that round.")
    print(f"{'':8}  " + "  ".join(f"{label:>14}" for label in ("1st", "2nd", "3rd")))
    for tier, title in (("t1", "T1 lost"), ("t2", "T2 lost")):
        rounds = []
        counts = []
        for ordinal in range(3):
            rs = side_fall[tier]["radiant"][ordinal]
            ds = side_fall[tier]["dire"][ordinal]
            left = f"{avg(rs):.2f}" if rs else "—"
            right = f"{avg(ds):.2f}" if ds else "—"
            rounds.append(f"{left:>5}/{right:<5}")
            counts.append(f"{len(rs):5d}/{len(ds):<5d}")
        print(f"{title:8}  " + "  ".join(f"{cell:>14}" for cell in rounds))
        print(f"{'games':8}  " + "  ".join(f"{cell:>14}" for cell in counts))
    print()
    print("Nth tower of that tier to fall anywhere. Round is the mean among games that reached it.")
    print(f"{'':6}  " + "  ".join(f"{n:>8}" for n in range(1, 7)))
    for tier, title in (("t1", "T1"), ("t2", "T2")):
        means = [f"{avg(xs):8.2f}" if xs else f"{'—':>8}" for xs in map_fall[tier]]
        counts = [f"{len(xs):8d}" for xs in map_fall[tier]]
        print(f"{title:6}  " + "  ".join(means))
        print(f"{'games':6}  " + "  ".join(counts))
    print()
    print("First Tier 2. Took it is the side that destroyed it. Won is how often that side then wins.")
    print("A same-round pair is a tie. Never is a finished or capped game where no Tier 2 fell.")
    for p, name in (("radiant", "Radiant"), ("dire", "Dire")):
        took = first_t2_took[p]
        won = first_t2_won[p]
        rate = won / took if took else 0
        when = avg(first_t2_round[p])
        print(f"{name:8} took {took:4d}  won {won:4d} ({rate:5.1%})  mean round {when:.2f}")
    tie_n = first_t2_took["tie"]
    print(f"{'Same rnd':8} {tie_n:4d}  mean round {avg(first_t2_round['tie']):.2f}")
    print(f"{'Never':8} {first_t2_took['never']:4d}")
    return {
        "radiant": radiant,
        "dire": dire,
        "wins": dict(wins),
        "games": games,
        "unfinished": unfinished,
        "length": avg(lengths),
        "neutrals": (lifetime["radiant"][3] / games if games else 0, lifetime["dire"][3] / games if games else 0),
        "jungle": (
            sum(sent["radiant"] for sent in jungle_sent) / games if games else 0,
            sum(sent["dire"] for sent in jungle_sent) / games if games else 0,
        ),
    }


def up(row: Snap) -> int:
    return row[0] + row[1]


def record_falls(
    trace: dict[int, dict[str, Snap]],
    map_fall: dict[str, list[list[int]]],
    side_fall: dict[str, dict[str, list[list[int]]]],
    first_t2_took: Counter[str],
    first_t2_won: Counter[str],
    first_t2_round: dict[str, list[int]],
    winner: str | None,
) -> None:
    """Credit each standing-count drop to the other side. A Tier 2 cannot fall before its Tier 1."""
    prev = {"radiant": (3, 3), "dire": (3, 3)}
    lost_n = {"t1": {"radiant": 0, "dire": 0}, "t2": {"radiant": 0, "dire": 0}}
    map_n = {"t1": 0, "t2": 0}
    first_t2: str | None = None
    first_t2_at = 0
    for rnd in sorted(trace):
        snap = trace[rnd]
        lost: dict[str, tuple[int, int]] = {}
        for p in ("radiant", "dire"):
            now = (snap[p][0], snap[p][1])
            lost[p] = (prev[p][0] - now[0], prev[p][1] - now[1])
            prev[p] = now
        for tier, slot in (("t1", 0), ("t2", 1)):
            for p in ("radiant", "dire"):
                n = lost[p][slot]
                if n <= 0:
                    continue
                for _ in range(n):
                    ordinal = lost_n[tier][p]
                    if ordinal < 3:
                        side_fall[tier][p][ordinal].append(rnd)
                    lost_n[tier][p] = ordinal + 1
                    if map_n[tier] < 6:
                        map_fall[tier][map_n[tier]].append(rnd)
                    map_n[tier] += 1
        if first_t2 is None:
            radiant_took = lost["dire"][1]
            dire_took = lost["radiant"][1]
            if radiant_took and dire_took:
                first_t2, first_t2_at = "tie", rnd
            elif radiant_took:
                first_t2, first_t2_at = "radiant", rnd
            elif dire_took:
                first_t2, first_t2_at = "dire", rnd
    if first_t2 is None:
        first_t2_took["never"] += 1
        return
    first_t2_took[first_t2] += 1
    first_t2_round[first_t2].append(first_t2_at)
    if first_t2 in ("radiant", "dire") and winner == first_t2:
        first_t2_won[first_t2] += 1


def tourney(games: int, seed: int, limit: int) -> None:
    """Every style against every style. The cell is Radiant's win rate."""
    rows: list[dict[str, object]] = []
    for radiant in STYLES:
        for dire in STYLES:
            print()
            print("=" * 88)
            print(f"Radiant {radiant} vs Dire {dire}")
            print("=" * 88)
            rows.append(simulate(games, seed, limit, radiant, dire))
    print()
    print("Radiant win rate. Row is Radiant's style, column is Dire's style.")
    print(f"{'':10}  " + "  ".join(f"{name:>10}" for name in STYLES))
    by_seat = {name: [] for name in STYLES}
    for radiant in STYLES:
        cells = []
        for dire in STYLES:
            row = next(item for item in rows if item["radiant"] == radiant and item["dire"] == dire)
            wins = row["wins"]
            assert isinstance(wins, dict)
            rate = wins.get("radiant", 0) / games if games else 0
            cells.append(f"{rate:10.1%}")
            by_seat[radiant].append(rate)
            by_seat[dire].append(1 - rate)
        print(f"{radiant:10}  " + "  ".join(cells))
    print()
    print("Mean win rate of each style across both seats and every opponent.")
    for name in sorted(STYLES, key=lambda style: sum(by_seat[style]) / len(by_seat[style]), reverse=True):
        rates = by_seat[name]
        print(f"{name:10}  {sum(rates) / len(rates):.1%}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Version 3 viability simulation")
    parser.add_argument("--games", type=int, default=200)
    parser.add_argument("--seed", type=int, default=1)
    parser.add_argument("--limit", type=int, default=40)
    parser.add_argument("--radiant", choices=STYLES, default="balanced")
    parser.add_argument("--dire", choices=STYLES, default="balanced")
    parser.add_argument("--tourney", action="store_true", help="Play every style against every style")
    args = parser.parse_args()
    if args.tourney:
        tourney(args.games, args.seed, args.limit)
    else:
        simulate(args.games, args.seed, args.limit, args.radiant, args.dire)


if __name__ == "__main__":
    main()
