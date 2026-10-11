"""Run version 3 viability games.

    python -m sim --games 200 --seed 1

The simulator uses the printed hero sheet in ``src/game/roster.ts`` and the version 3
economy. It is a lane-level model: two heuristic sides, real ability costs, attack
order, tower bounties, and hero-kill income. A thin board spends gold drawing heroes.
Once that Gold is gone, the draw step ends. Items, runes, abilities, and Shields are
interrupts: one card resolves, then the other side may counter or pass. A side with
nothing it can play passes on its own. Two passes resolve the next swing. Each side
can send a hero to its home jungle once the lanes are covered. Each active ability can
be cast once per round, or twice that round when a Refresher is played. Silence is
simulated: it blocks the cast and turns a passive off. Invisibility is not, so Gem of
True Sight, Illusion, Invisibility, and Water runes have no effect here. The rest of
the status list is not simulated.
"""

from __future__ import annotations

import argparse
import random
import re
from collections import Counter
from dataclasses import dataclass, field, replace
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
    # Extra tower damage printed on the card. 0 means the ultimate never hits a building.
    tower: int = 0
    # Eye of the Storm: a wounded lane enemy, otherwise the standing tower.
    razor: bool = False
    # "", "lane", "board", or "one". Silence blocks the cast and turns a passive off.
    silence_scope: str = ""
    # Doom's Silence stays on. Every other Silence clears at the end of the round.
    silence_lock: bool = False
    # 1 XP, and the hit or Stun lands on the camp creep.
    camp_spell: bool = False


def is_camp_spell(ult: str, kind: str, cost: int) -> bool:
    """1 XP, and the damage or Stun is aimed at the camp creep rather than the caster."""
    if kind != "active" or cost != 1:
        return False
    chip = {"mdmg", "pdmg", "slam", "timber", "sky", "hood", "luna", "snap", "slash", "duel", "stun"}
    hits = {"laneE", "epos1", "epos2", "ethird", ""}
    for part in ult.split("|"):
        bits = part.split()
        if not bits:
            continue
        who = bits[1] if len(bits) > 1 else ""
        if bits[0] in chip and who in hits:
            return True
    return False


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
        elif any(token in ult for token in ("mdmg", "pdmg", "slam", "timber", "sky", "hood", "luna", "snap", "slash", "duel")):
            damage = 1
        tower = 0
        razor = False
        for part in ult.split("|"):
            bits = part.split()
            if not bits:
                continue
            if bits[0] == "tower":
                tower = int(bits[1]) if len(bits) > 1 and bits[1].isdigit() else 1
            elif bits[0] == "razor":
                razor = True
        scope = ""
        if "silence" in ult:
            if "boardH" in ult:
                scope = "board"
            elif "laneE" in ult:
                scope = "lane"
            else:
                scope = "one"
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
                tower=tower,
                razor=razor,
                silence_scope=scope,
                silence_lock="lock" in ult and scope != "",
                camp_spell=is_camp_spell(ult, m.group("kind"), int(m.group("cost"))),
            )
        )
    if len(heroes) != 127:
        raise SystemExit(f"expected 127 heroes in the roster, found {len(heroes)}")
    return heroes


ENOUGH_HEROES = 5
STYLES = ("balanced", "lane", "jungler", "defender", "hunter")


@dataclass
class Unit:
    hero: Hero
    owner: str = ""
    hp: int = 2
    stunned: bool = False
    silenced: bool = False
    # A locked Silence (Doom) survives cleanup.
    silence_lock: bool = False
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
    # Runes earned from camps. Each one is an interrupt, not an instant effect.
    runes: list[str] = field(default_factory=list)
    # Tormentor reward. Playing it is an interrupt.
    shards: int = 0

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
    stunned: bool = False


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
    fired_towers: set[tuple[str, str]] = field(default_factory=set)
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
        self.fired_towers = set()
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
    """A thin board draws while it can pay 1 Gold. No Gold left ends the step. Items wait for combat."""
    for p, side in g.sides.items():
        on_board = len(living(g, p))
        if on_board < ENOUGH_HEROES:
            while side.gold >= 1 and len(side.hand) < 10:
                side.gold -= 1
                side.hand.append(g.rng.choice(g.heroes))
        placed = 0
        side.hand.sort(key=lambda h: (h.kind != "active", -h.damage, h.cost))
        while side.hand and placed < 3 and board_size(g, p) < 5:
            lane = best_lane(g, p)
            lane_score = lane_value(g, p, lane)
            jungle_score = jungle_value(g, p)
            invade_score = invade_value(g, p)
            to_jungle = jungle_score > lane_score and jungle_score >= invade_score
            hero = pull_hero(side.hand, to_jungle and g.style[p] == "jungler")
            unit = Unit(hero, owner=p, haste=hero.amp and hero.kind == "passive")
            if to_jungle:
                g.jungle[p].append(unit)
                g.jungle_sent[p] += 1
            elif invade_score > lane_score:
                g.invade[p].append(unit)
                g.jungle_sent[p] += 1
            else:
                g.board[p][lane].append(unit)
            placed += 1
            g.played[p] += 1


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
    """Jungler and hunter hold the Ancient with all 5. Hunter meets a 3-stack Tier 2 with two heroes and a pair with one."""
    if foes <= 0:
        return 0
    if t1 <= 0 and t2 <= 0:
        if style in ("jungler", "hunter"):
            return 5
        if style == "lane":
            return max(0, foes - 1)
        return min(5, foes + (2 if style == "defender" else 1))
    if t1 <= 0:
        if style == "lane":
            return 1
        if style == "defender":
            return min(5, foes + 1)
        if style in ("jungler", "hunter"):
            return min(5, max(0, foes - 1))
        return foes
    if style in ("jungler", "hunter"):
        return 0
    if style == "lane":
        return 1 if t1 <= foes else 0
    if style == "defender":
        return foes
    matching = max(0, foes - 1)
    return max(matching, 1) if t1 <= foes else matching


def defend_value(t1: int, t2: int, foes: int, mine: int, style: str) -> int:
    """One more defender. 0 once the garrison is full. An open Tier 2 garrison beats a counter-push."""
    if mine >= garrison(t1, t2, foes, style):
        return 0
    if t1 <= 0 and t2 <= 0:
        return 70 if style in ("jungler", "hunter") else 50 + foes
    if t1 <= 0:
        if style in ("lane", "jungler", "defender", "hunter"):
            return 40
        raw = 2 + 2 * max(t2, 0) + 3
        return raw - 4 if mine else raw
    if style == "lane":
        return 30
    return 8 if mine == 0 and foes >= t1 else 4


def jungler_push(pressure: int, defenders: int, bodies: int, ancient_open: bool) -> int:
    """Stack on a lane with 0 or 1 defender. Two defenders are left to the camp."""
    if defenders >= 2:
        return 0
    crowd = max(0, bodies - 2)
    score = pressure * 2 + defenders * 2 + 14 - crowd
    if ancient_open:
        score += 28
    return score


def lane_value(g: Game, p: str, lane: str) -> int:
    """Attack the enemy building, or fill the garrison if that scores higher."""
    style = g.style[p]
    foe = g.sides[other(p)].towers[lane]
    own = g.sides[p].towers[lane]
    foes = sum(1 for unit in g.board[other(p)][lane] if unit.hp > 0)
    mine = sum(1 for unit in g.board[p][lane] if unit.hp > 0)
    ancient_open = foe["t1"] <= 0 and foe["t2"] <= 0
    if style == "jungler":
        attack = jungler_push(tower_pressure(foe["t1"], foe["t2"]), foes, mine, ancient_open)
        if lane == "mid" and mid_door(g, p):
            attack += 1
    elif style == "hunter":
        # Same thin-lane stack as a jungler. The bodies a jungler would park in the camp stay on the map.
        attack = jungler_push(tower_pressure(foe["t1"], foe["t2"]), foes, mine, ancient_open)
    else:
        crowd = max(0, mine - 2) if style == "lane" else mine * 3
        attack = tower_pressure(foe["t1"], foe["t2"]) * (3 if style == "lane" else 2) + foes * 2 - crowd
        if ancient_open:
            attack += 28
        if style == "lane" and (foe["t1"] > 0 or foe["t2"] > 0):
            attack += 12
    return max(attack, defend_value(own["t1"], own["t2"], foes, mine, style))


def jungler_cap(_kind: str) -> int:
    """One hero. A second body lets the camp ultimate fire."""
    return 1


def pull_hero(hand: list[Hero], spell: bool) -> Hero:
    """The farmer is the 1 XP stun or damage spell, when the camp is where this hero is going."""
    if spell:
        for index, hero in enumerate(hand):
            if hero.camp_spell:
                return hand.pop(index)
    return hand.pop(0)


def mid_door(g: Game, p: str) -> bool:
    """Mid stages the invade once the home camp already has its one farmer."""
    if g.style[p] != "jungler" or g.round <= 2:
        return False
    enemy = g.camps[other(p)]
    if enemy is None or enemy.hp <= 0 or any(unit.hp > 0 for unit in g.invade[p]):
        return False
    home = g.camps[p]
    home_n = sum(1 for unit in g.jungle[p] if unit.hp > 0)
    return home is None or home.hp <= 0 or home_n >= jungler_cap(home.kind)


def jungle_value(g: Game, p: str) -> int:
    """Balanced farms for 5. A jungler waits until round 3, then sends one hero."""
    style = g.style[p]
    if style in ("lane", "defender"):
        return -999
    camp = g.camps[p]
    if camp is None or camp.hp <= 0:
        return -999
    mine = sum(1 for unit in g.jungle[p] if unit.hp > 0)
    if style == "jungler":
        if g.round <= 2:
            return -999
        cap = jungler_cap(camp.kind)
        if mine >= cap:
            return -999
        return 19 if camp.kind in ("roshan", "tormentor") else 18
    if style == "hunter":
        return -999
    if lane_heroes(g, p) < 2:
        return -999
    cap = 2 if camp.kind == "roshan" else 3
    if mine >= cap:
        return -999
    return NEUTRAL_KILL


def invade_value(_g: Game, _p: str) -> int:
    """The enemy jungle is a rotation out of mid, not a deploy from hand."""
    return -999


def living_enemies(g: Game, p: str) -> list[Unit]:
    enemy = other(p)
    found = [unit for lane in LANES for unit in g.board[enemy][lane] if unit.hp > 0]
    found.extend(unit for unit in g.jungle[enemy] if unit.hp > 0)
    found.extend(unit for unit in g.invade[enemy] if unit.hp > 0)
    return found


def silence_targets(g: Game, p: str, hero: Hero, lane: str) -> list[Unit]:
    """Who this Silence hits. A single-target Silence prefers a hero whose passive is still on."""
    if hero.silence_scope == "board":
        return living_enemies(g, p)
    foes = [unit for unit in g.board[other(p)][lane] if unit.hp > 0]
    if hero.silence_scope == "lane":
        return foes
    if hero.silence_scope != "one" or not foes:
        return []
    return [min(foes, key=lambda unit: 0 if passive_live(unit) else 1)]


def passive_live(unit: Unit) -> bool:
    """Amplify or cleave printed on a passive. Silence turns it off. An active Amplify stays."""
    if unit.silenced:
        return False
    return unit.hero.cleave or (unit.hero.amp and unit.hero.kind == "passive")


def kit_bonus(unit: Unit) -> int:
    """The printed +1. Silence removes the passive source and leaves an active Amplify in place."""
    active_amp = unit.hero.amp and unit.hero.kind != "passive"
    if active_amp or passive_live(unit):
        return 1
    return 0


def apply_silence(unit: Unit, lock: bool) -> None:
    unit.silenced = True
    if lock:
        unit.silence_lock = True
    if unit.hero.kind == "passive" and unit.hero.amp:
        unit.haste = False


def camp_of(g: Game, p: str, lane: str) -> tuple[str, Camp] | None:
    owner = p if lane == "jungle" else other(p)
    camp = g.camps[owner]
    if camp is None or camp.hp <= 0:
        return None
    return owner, camp


def legal_cast(g: Game, p: str) -> tuple[str, Unit] | None:
    """One cast per hero each round. A Refresher allows a second cast that same round, at 0 XP."""
    side = g.sides[p]
    best: tuple[tuple[int, int, int], str, Unit] | None = None
    for lane, unit in living(g, p):
        hero = unit.hero
        if lane in ("jungle", "invade"):
            found = camp_of(g, p, lane)
            if not hero.camp_spell or unit.stunned or unit.silenced or found is None:
                continue
            _owner, camp = found
            if camp.stunned and hero.damage <= 0:
                continue
            limit = 2 if unit.refresher else 1
            if unit.casts >= limit:
                continue
            cost = 0 if unit.casts else hero.cost
            if side.xp < cost:
                continue
            power = hero.damage + (1 if hero.stun else 0)
            score = (power, 1, -hero.cost)
            if best is None or score > best[0]:
                best = (score, lane, unit)
            continue
        if hero.kind != "active" or unit.stunned or unit.silenced:
            continue
        limit = 2 if unit.refresher else 1
        if unit.casts >= limit:
            continue
        cost = 0 if unit.casts else hero.cost
        if side.xp < cost:
            continue
        foes = [u for u in g.board[other(p)][lane] if u.hp > 0]
        tw = g.sides[other(p)].towers[lane]
        standing = tw["t1"] > 0 or tw["t2"] > 0
        victims = silence_targets(g, p, hero, lane)
        power = cast_power(hero, foes, standing, victims)
        if power <= 0:
            continue
        score = (power, len(foes), -hero.cost)
        if best is None or score > best[0]:
            best = (score, lane, unit)
    return None if best is None else (best[1], best[2])


def cast_power(hero: Hero, foes: list[Unit], standing: bool, silenced: list[Unit] | None = None) -> int:
    """How much this ultimate does right now. Generic damage needs a unit. A tower hit needs a standing tower."""
    wounded = any(unit.hp < 2 for unit in foes)
    power = 0
    if foes and hero.damage:
        power += hero.damage
    if foes and hero.stun:
        power += 1
    if hero.amp:
        power += 1
    if silenced and hero.silence_scope:
        power += 1
        if any(passive_live(unit) for unit in silenced):
            power += 1
    if hero.razor and (wounded or standing):
        power += 1
    elif hero.tower and standing:
        power += hero.tower
    return power


def resolve_cast(g: Game, p: str, lane: str, unit: Unit) -> None:
    cost = 0 if unit.casts else unit.hero.cost
    unit.casts += 1
    g.sides[p].xp -= cost
    g.casts[p] += 1
    if lane in ("jungle", "invade"):
        found = camp_of(g, p, lane)
        if found is None:
            return
        owner, camp = found
        if unit.hero.stun:
            camp.stunned = True
        if unit.hero.damage > 0 and camp.hp > 0:
            # Magical damage ignores the camp Shield.
            camp.hp -= unit.hero.damage
            if camp.hp <= 0:
                claim_camp(g, p, camp, owner)
        return
    if unit.hero.amp:
        unit.haste = True
    foes = [u for u in g.board[other(p)][lane] if u.hp > 0]
    if unit.hero.stun:
        for foe in foes:
            foe.stunned = True
    for foe in silence_targets(g, p, unit.hero, lane):
        apply_silence(foe, unit.hero.silence_lock)
    if unit.hero.damage and foes:
        for foe in foes:
            hurt(g, foe, unit.hero.damage, p)
    if unit.hero.razor:
        wounded = next((foe for foe in foes if foe.hp < 2), None)
        if wounded:
            hurt(g, wounded, 1, p)
        else:
            hit_structure(g, other(p), lane, 1, p, ancient=False)
            retaliate_towers(g)
    elif unit.hero.tower:
        hit_structure(g, other(p), lane, unit.hero.tower, p, ancient=False)
        retaliate_towers(g)


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


def swinging(g: Game, p: str) -> list[tuple[str, Unit]]:
    """Heroes who can still land a basic attack. A stun or a jungle disarm removes them."""
    rows: list[tuple[str, Unit]] = []
    for lane, unit in living(g, p):
        if unit.stunned:
            continue
        if lane in ("jungle", "invade") and unit.disarmed:
            continue
        rows.append((lane, unit))
    return rows


def take_rune(side: Side, kind: str) -> None:
    side.runes.remove(kind)


def play_rune(g: Game, p: str) -> bool:
    """One rune, when it does something now. A blank rune stays in hand and does not spend the window."""
    side = g.sides[p]
    if not side.runes:
        return False
    heroes = [unit for _lane, unit in living(g, p)]
    wounded = [unit for unit in heroes if unit.hp < 2]
    if "regen" in side.runes and wounded:
        take_rune(side, "regen")
        min(wounded, key=lambda unit: unit.hp).hp = 2
        return True
    open_shield = [unit for unit in heroes if unit.shield <= 0]
    if "shield" in side.runes and open_shield:
        take_rune(side, "shield")
        open_shield[0].shield = 1
        return True
    arcane = [unit for unit in heroes if unit.hero.kind == "active" and unit.casts == 0 and unit.hero.cost > 0 and not unit.stunned and not unit.silenced]
    if "arcane" in side.runes and arcane:
        take_rune(side, "arcane")
        unit = max(arcane, key=lambda candidate: candidate.hero.cost)
        unit.hero = replace(unit.hero, cost=max(0, unit.hero.cost - 1))
        return True
    attackers = [unit for lane, unit in swinging(g, p) if lane not in ("jungle", "invade")]
    if "dd" in side.runes and attackers:
        take_rune(side, "dd")
        attackers[0].amplify += 1
        return True
    unhasted = [unit for unit in attackers if not unit.haste]
    if "haste" in side.runes and unhasted:
        take_rune(side, "haste")
        unhasted[0].haste = True
        return True
    if "wisdom" in side.runes:
        take_rune(side, "wisdom")
        side.xp += 1
        return True
    if "gold" in side.runes:
        take_rune(side, "gold")
        side.gold += 1
        return True
    return False


def play_shard(g: Game, p: str) -> bool:
    """The Tormentor's Refresher is a reward card. It resolves on its own action."""
    side = g.sides[p]
    if side.shards <= 0:
        return False
    active = [
        unit
        for _lane, unit in living(g, p)
        if unit.hero.kind == "active" and not unit.refresher and not unit.stunned and not unit.silenced
    ]
    if not active:
        return False
    side.shards -= 1
    g.rng.choice(active).refresher = True
    return True


def play_item(g: Game, p: str) -> bool:
    """One shop effect, paid with Gold. A full board buys these. A thin board keeps Gold for the next draw."""
    side = g.sides[p]
    heroes = living(g, p)
    if len(heroes) < ENOUGH_HEROES or side.gold < 1 or g.items[p] >= len(heroes):
        return False
    casters = [
        unit
        for _lane, unit in heroes
        if unit.hero.kind == "active" and not unit.refresher and unit.casts < 2 and not unit.stunned and not unit.silenced
    ]
    if side.gold >= 3 and casters:
        side.gold -= 3
        casters[0].refresher = True
        g.items[p] += 1
        return True
    fighters = swinging(g, p)
    if not fighters:
        return False
    if side.gold >= 2:
        side.gold -= 2
        fighters[0][1].amplify += 1
        g.items[p] += 1
        return True
    target = next((unit for _lane, unit in fighters if not unit.haste), None)
    if target is None:
        return False
    side.gold -= 1
    target.haste = True
    g.items[p] += 1
    return True


def interrupt(g: Game) -> None:
    """One ability, rune, item, or Shield. The other side may counter or pass. Two passes move combat on.

    A side with no legal card passes on its own. Odd rounds Radiant starts. Even rounds Dire starts.
    The ability is the answer when it can be cast. A rune or item follows, which is also how a stunned
    hero still answers. Both sides are AI, so the counter is immediate rather than a 5 second clock.
    """
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
        if play_rune(g, priority) or play_shard(g, priority) or play_item(g, priority):
            passed = 0
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
        dmg = 1 + unit.amplify + kit_bonus(unit)
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
            camp.stunned = False
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


def gain_rune(g: Game, p: str) -> None:
    """A camp clear draws one rune into hand. Playing it is an interrupt, so the other side can answer."""
    rune = g.rng.choice(RUNES)
    # Illusion, Invisibility, and Water have no model here, so the draw does not create a card.
    if rune in ("illusion", "invis", "water"):
        return
    g.sides[p].runes.append(rune)


def claim_camp(g: Game, p: str, camp: Camp, owner: str | None = None) -> None:
    g.neutrals[p] += 1
    g.neutral_kills[p] += 1
    g.neutral_discard.append(camp.kind)
    if camp.kind == "roshan":
        g.sides[p].gold += 3
        g.sides[p].xp += 3
        g.aegis[p] += 1
        gain_rune(g, p)
    else:
        # A normal camp and a Tormentor both pay 2 Gold, 2 XP, and a rune. The Tormentor also leaves a Refresher.
        g.sides[p].gold += 2
        g.sides[p].xp += 2
        gain_rune(g, p)
        if camp.kind == "tormentor":
            g.sides[p].shards += 1
    g.camps[owner or p] = None


def fight_jungle(g: Game) -> None:
    """One camp swing. Home heroes and enemy invaders both hit it. The larger surviving side claims the kill."""
    for p in ("radiant", "dire"):
        home = [unit for unit in g.jungle[p] if unit.hp > 0]
        invaders = [unit for unit in g.invade[other(p)] if unit.hp > 0]
        heroes = home + invaders
        camp = g.camps[p]
        if not heroes or camp is None or camp.hp <= 0:
            continue
        # The Ice Shaman aura silences the camp. It is not the ultimate, so one hero is enough.
        if camp.kind == "ice_shaman":
            for hero in heroes:
                apply_silence(hero, False)
        # Roar, Thunder Clap, Freezing Blast, and Fire Pit need 2 units in the camp.
        # A Stun from the farmer's spell stops the ultimate and the swing back.
        if len(heroes) >= 2 and not camp.stunned:
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
            killer = other(p) if invade_alive > owner_alive else p
            claim_camp(g, killer, camp, p)
            continue
        if camp.stunned or camp.kind == "tormentor":
            continue
        targets = heroes if camp.kind in ("dragon", "roshan", "thunderhide") else heroes[:1]
        for hero in targets:
            if hero.hp > 0:
                physical(g, hero, 1, "neutral")


def jungler_rotate(g: Game) -> None:
    """One hero steps from mid into the enemy camp. An open Tier 2 or a garrison keeps them."""
    if g.winner is not None:
        return
    for p in ("radiant", "dire"):
        if not mid_door(g, p):
            continue
        heroes = [unit for unit in g.board[p]["mid"] if unit.hp > 0]
        if not heroes:
            continue
        foe = g.sides[other(p)].towers["mid"]
        own = g.sides[p].towers["mid"]
        foes = sum(1 for unit in g.board[other(p)]["mid"] if unit.hp > 0)
        mine = len(heroes)
        ancient_open = foe["t1"] <= 0 and foe["t2"] <= 0
        attack = jungler_push(tower_pressure(foe["t1"], foe["t2"]), foes, mine, ancient_open)
        defense = defend_value(own["t1"], own["t2"], foes, mine - 1, "jungler")
        if max(attack, defense) >= 20:
            continue
        if defense > 0 and mine <= garrison(own["t1"], own["t2"], foes, "jungler"):
            continue
        hero = heroes[-1]
        g.board[p]["mid"].remove(hero)
        g.invade[p].append(hero)


def combat(g: Game) -> None:
    """A window, then the jungle, then a window, then one swing at a time. Two passes open the next step."""
    g.attacked_towers = set()
    g.fired_towers = set()
    interrupt(g)
    fight_jungle(g)
    if g.winner is not None:
        return
    interrupt(g)
    acted: set[int] = set()
    while g.winner is None:
        batch = next_batch(g, acted)
        if not batch:
            break
        for row in batch:
            acted.add(id(row[5]))
        resolve_batch(g, batch)
        retaliate_towers(g)
        if g.winner is not None:
            return
        interrupt(g)
    if g.winner is not None:
        return
    towers_fire(g)
    if g.winner is None:
        interrupt(g)


def hit_structure(g: Game, defender: str, lane: str, dmg: int, attacker: str, *, ancient: bool = True) -> None:
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
    elif ancient:
        side.ancient = max(0, side.ancient - dmg)
        if side.ancient == 0 and g.winner is None:
            g.winner = attacker


def retaliate_towers(g: Game) -> None:
    """A standing tower shoots as soon as the swing that hit it is done. Once per tower each round."""
    for defender, lane in list(g.attacked_towers):
        if (defender, lane) in g.fired_towers:
            continue
        tw = g.sides[defender].towers[lane]
        if tw["t1"] <= 0 and tw["t2"] <= 0:
            continue
        g.fired_towers.add((defender, lane))
        foes = [u for u in g.board[other(defender)][lane] if u.hp > 0]
        if not foes:
            continue
        if tw["t1"] > 0:
            physical(g, foes[0], 1, defender)
        else:
            for foe in foes[:3]:
                physical(g, foe, 1, defender)


def towers_fire(g: Game) -> None:
    """Anything hit during an interrupt that has not shot yet."""
    retaliate_towers(g)


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
                    if not unit.silence_lock:
                        unit.silenced = False
                    unit.disarmed = False
                    unit.casts = 0
                    unit.refresher = False
                    unit.amplify = 0
                    unit.haste = unit.hero.amp and unit.hero.kind == "passive" and not unit.silenced
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
        jungler_rotate(g)
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
    win_lengths: dict[str, list[int]] = {"radiant": [], "dire": []}
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
            win_lengths[g.winner].append(length)
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
    radiant_when = f"{avg(win_lengths['radiant']):.1f}" if win_lengths["radiant"] else "—"
    dire_when = f"{avg(win_lengths['dire']):.1f}" if win_lengths["dire"] else "—"
    print(f"mean rounds to win  radiant {radiant_when}  dire {dire_when}")
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
        "win_rounds": (sum(win_lengths["radiant"]), sum(win_lengths["dire"])),
        "win_n": (len(win_lengths["radiant"]), len(win_lengths["dire"])),
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


def tourney(games: int, seed: int, limit: int, styles: tuple[str, ...] = STYLES) -> None:
    """Every listed style against every listed style. The cell is Radiant's win rate."""
    rows: list[dict[str, object]] = []
    for radiant in styles:
        for dire in styles:
            print()
            print("=" * 88)
            print(f"Radiant {radiant} vs Dire {dire}")
            print("=" * 88)
            rows.append(simulate(games, seed, limit, radiant, dire))
    print()
    print("Radiant win rate. Row is Radiant's style, column is Dire's style.")
    print(f"{'':10}  " + "  ".join(f"{name:>10}" for name in styles))
    by_seat = {name: [] for name in styles}
    for radiant in styles:
        cells = []
        for dire in styles:
            row = next(item for item in rows if item["radiant"] == radiant and item["dire"] == dire)
            wins = row["wins"]
            assert isinstance(wins, dict)
            rate = wins.get("radiant", 0) / games if games else 0
            cells.append(f"{rate:10.1%}")
            by_seat[radiant].append(rate)
            by_seat[dire].append(1 - rate)
        print(f"{radiant:10}  " + "  ".join(cells))
    print()
    print("Mean win rate and average rounds to win. Rounds count only games that style won.")
    print(f"{'':10}  {'win rate':>10}  {'rounds':>8}")
    won_rounds = {name: [0.0, 0] for name in styles}
    for row in rows:
        r_sum, d_sum = row["win_rounds"]
        r_n, d_n = row["win_n"]
        assert isinstance(r_sum, (int, float)) and isinstance(d_sum, (int, float))
        assert isinstance(r_n, int) and isinstance(d_n, int)
        radiant_name = row["radiant"]
        dire_name = row["dire"]
        assert isinstance(radiant_name, str) and isinstance(dire_name, str)
        won_rounds[radiant_name][0] += r_sum
        won_rounds[radiant_name][1] += r_n
        won_rounds[dire_name][0] += d_sum
        won_rounds[dire_name][1] += d_n
    for name in sorted(styles, key=lambda style: sum(by_seat[style]) / len(by_seat[style]), reverse=True):
        rates = by_seat[name]
        total, count = won_rounds[name]
        rounds = total / count if count else 0
        print(f"{name:10}  {sum(rates) / len(rates):10.1%}  {rounds:8.1f}")


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
