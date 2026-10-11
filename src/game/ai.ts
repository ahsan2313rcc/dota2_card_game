import { getHero, getItem } from './cards'
import {
  ZONE_PRIORITY,
  buyShield,
  buyback,
  buybackBlockReason,
  buybackChoices,
  discardToHandLimit,
  campNeutral,
  declareUlt,
  drawBlockReason,
  drawCard,
  handCount,
  endDraw,
  endRotation,
  enemyJungle,
  heroesOnBoard,
  homeJungle,
  isMelee,
  itemBlockReason,
  itemLanes,
  itemTargets,
  lineup,
  other,
  passResponse,
  passRotation,
  placeBlockReason,
  placeCreep,
  placeHero,
  playItem,
  reveal,
  rotateHero,
  shieldBlockReason,
  rotationTargets,
  setCampFocus,
  ultBlockReason,
  ultCost,
  ultNeedsTarget,
  ultTargets,
  ultZones,
} from './engine'
import {
  CAMPS,
  BOARD_LIMIT,
  DRAW_CAP,
  HAND_LIMIT,
  SHIELD_XP_COST,
  LANES,
  PLAYERS,
  ROTATIONS_PER_ROUND,
  TOWER_HP,
  isLane,
  type Attribute,
  type GameState,
  type ItemCard,
  type LaneId,
  type PlayerId,
  type Unit,
  type ZoneId,
  type AiStyle,
} from './types'

export type { AiStyle }

const FRONTLINERS = new Set(['axe', 'tidehunter', 'pudge', 'abaddon', 'wraith_king', 'sven'])

/** balanced keeps the current garrison. lane stacks towers and defends one short. jungler farms, then stacks a thin lane. defender holds lanes. hunter stacks the thin lane and never leaves a hero in the camp. carry holds a tower that would break, farms one camp, and spends the gold. */

const HARMFUL = new Set([
  'stun',
  'silence',
  'root',
  'disarm',
  'slow',
  'mute',
  'curse',
  'fear',
  'hex',
  'break',
  'enfeeble',
  'mdmg',
  'pdmg',
  'basic',
  'slam',
  'killwounded',
  'nobuyback',
  'sacrifice',
  'control',
  'steal',
  'duel',
  'tower',
  'pull',
  'shove',
  'hood',
  'luna',
  'razor',
  'snap',
  'astral',
  'hand',
  'stealxp',
  'disarmtower',
  'sky',
  'timber',
  'visage',
  'slam',
])

const ENEMY_WHO = new Set([
  'laneE',
  'laneH',
  'epos1',
  'epos2',
  'ethird',
  'invisE',
  'woundedH',
  'boardH',
  'pos1each',
  'intH',
  'strH',
  'laneAll',
])

const BUFF_VERBS = new Set([
  'heal',
  'haste',
  'shield',
  'amplify',
  'immune',
  'invisible',
  'evade',
  'pierce',
  'accuracy',
  'lifesteal',
  'lifestealAura',
  'nodie',
  'cleanse',
  'half',
  'doubleheal',
])

/** 2 gold + 2 XP + a rune. A Tier 1 chip sits under this. A Tier 2 garrison sits over it. */
const NEUTRAL_KILL = 5

/** Full tier 1 scores 1. A fallen tier 1 scores 5 plus missing tier 2 health. Both down scores 8. */
function towerPressure(t1: number, t2: number): number {
  if (t1 <= 0 && t2 <= 0) return 8
  if (t1 <= 0) return 5 + (TOWER_HP.t2 - t2)
  return TOWER_HP.t1 - t1 + 1
}

/** Bodies a camp still wants. A regular camp and a Tormentor clear with three. Roshan wants two. */
function campCap(neutral: Unit): number {
  return neutral.kind === 'roshan' ? 2 : 3
}

/** One hero. A second body lets the camp ultimate fire. */
function junglerCap(_neutral: Unit): number {
  return 1
}

/** A 1 XP stun or 1-damage hit aimed at the camp. The farmer casts it on the neutral. */
function campSpell(cardId: string): boolean {
  const script = getHero(cardId).script
  if (!script || script.kind !== 'active' || script.xpCost !== 1) return false
  const chip = new Set(['mdmg', 'pdmg', 'slam', 'timber', 'sky', 'hood', 'luna', 'snap', 'slash', 'duel', 'stun'])
  const hits = new Set(['laneE', 'epos1', 'epos2', 'ethird', ''])
  return script.ult.some((part) => {
    const [verb, who = ''] = part.trim().split(/\s+/)
    return chip.has(verb) && hits.has(who)
  })
}

/** Mid is the door into the enemy jungle, once the home camp already has its farmer. */
function midDoor(s: GameState, p: PlayerId, style: AiStyle): boolean {
  if (style !== 'jungler' || !junglerFarming(s.round)) return false
  const enemy = campNeutral(s, enemyJungle(p))
  if (!enemy || heroesIn(s, p, enemyJungle(p)) >= junglerCap(enemy)) return false
  const home = campNeutral(s, homeJungle(p))
  return !home || heroesIn(s, p, homeJungle(p)) >= junglerCap(home)
}

/** Junglers play lanes for two rounds, then the camps open. */
function junglerFarming(round: number): boolean {
  return round > 2
}

/**
 * Minimum heroes on this lane while enemies are hitting it.
 * A jungler answers the Ancient with the whole board. On a Tier 2, a lane stack sacrifices one hero,
 * a jungler or a hunter sends one fewer than the attackers, and a defender sends one more.
 */
function garrison(t1: number, t2: number, foes: number, style: AiStyle): number {
  if (foes <= 0) return 0
  if (t1 <= 0 && t2 <= 0) {
    if (style === 'jungler' || style === 'hunter' || style === 'carry') return BOARD_LIMIT
    if (style === 'lane') return Math.max(0, foes - 1)
    return Math.min(BOARD_LIMIT, foes + (style === 'defender' ? 2 : 1))
  }
  if (t1 <= 0) {
    if (style === 'lane') return 1
    if (style === 'defender') return Math.min(BOARD_LIMIT, foes + 1)
    if (style === 'carry') return Math.min(BOARD_LIMIT, foes)
    if (style === 'jungler' || style === 'hunter') return Math.min(BOARD_LIMIT, Math.max(0, foes - 1))
    return foes
  }
  if (style === 'jungler' || style === 'hunter') return 0
  // A chip is ignored. One hero soaks a stack. The last hit of a Tier 1 pulls a second hero off the camp.
  if (style === 'carry') return t1 <= 1 ? Math.min(foes, 2) : t1 <= foes ? 1 : 0
  if (style === 'lane') return t1 <= foes ? 1 : 0
  if (style === 'defender') return foes
  const matching = Math.max(0, foes - 1)
  return t1 <= foes ? Math.max(matching, 1) : matching
}

/**
 * Value of one more defender, and 0 once the garrison is full.
 * Tier 2: 2 + 2 per remaining health + 3. A full tower is 15, and a hero already soaking cuts 4.
 * Tier 1: 8 when the tower would fall, otherwise 4, under a camp.
 * Ancient: 50 plus the attackers, so the quota is filled before any push.
 * An unfilled Tier 2 garrison outranks a counter-push, so a stacked push is answered.
 */
function defendValue(t1: number, t2: number, foes: number, mine: number, style: AiStyle): number {
  if (mine >= garrison(t1, t2, foes, style)) return 0
  if (t1 <= 0 && t2 <= 0) return style === 'jungler' || style === 'hunter' || style === 'carry' ? 70 : 50 + foes
  if (t1 <= 0) {
    if (style === 'lane' || style === 'jungler' || style === 'defender' || style === 'hunter' || style === 'carry') return 40
    const raw = 2 + 2 * Math.max(t2, 0) + 3
    return mine > 0 ? raw - 4 : raw
  }
  if (style === 'lane' || style === 'carry') return 30
  return mine === 0 && foes >= t1 ? 8 : 4
}

/** A jungler stacks on a lane held by 0 or 1 hero. Two defenders send them back to the camp. */
function junglerPush(pressure: number, defenders: number, bodies: number, ancientOpen: boolean): number {
  if (defenders >= 2) return 0
  const crowd = Math.max(0, bodies - 2)
  let score = pressure * 2 + defenders * 2 + 14 - crowd
  if (ancientOpen) score += 28
  return score
}

/** How badly we want to walk onto this tower. A healthy tier 1 is not a reason to leave a fight. */
function exposedBonus(pressure: number): number {
  if (pressure >= 8) return 14
  if (pressure >= 5) return 11
  if (pressure > 1) return 6
  return 0
}

function unitsIn(s: GameState, p: PlayerId, zone: ZoneId): Unit[] {
  return lineup(s, p, zone).map((uid) => s.units[uid])
}

/** Heroes placed this round stay face down until Show. Earlier rounds are public. */
function visibleEnemy(s: GameState, u: Unit): boolean {
  return s.phase !== 'assign' || u.placedRound !== s.round
}

function enemyHeroes(s: GameState, p: PlayerId, zone: ZoneId): Unit[] {
  return unitsIn(s, other(p), zone).filter((u) => u.kind === 'hero' && visibleEnemy(s, u))
}

function heroCount(s: GameState, p: PlayerId): number {
  const inHand = s.players[p].hand.filter((c) => c.type === 'hero').length
  return inHand + heroesOnBoard(s, p).length
}

/** Items are bought only once the board is full. Until then, gold draws heroes to defend lanes. */

/**
 * Draw until the gold is gone. A thin board takes hero and creep cards from the shared deck.
 * A stocked board takes item cards, which combat then plays one at a time.
 * Buyback is only for a side that cannot draw and has no hero to play.
 */
export function aiDraw(state: GameState, p: PlayerId): GameState {
  let s = state
  for (let guard = 0; guard < DRAW_CAP; guard++) {
    const pl = s.players[p]
    if (pl.gold < 1) break
    const stocked = heroesOnBoard(s, p).length >= BOARD_LIMIT
    if (handCount(pl) >= (stocked ? HAND_LIMIT : DRAW_CAP)) break
    const want = stocked ? 'item' : 'unit'
    const fallback = want === 'unit' ? 'item' : 'unit'
    const type = !drawBlockReason(s, p, want) ? want : !drawBlockReason(s, p, fallback) ? fallback : null
    if (!type) break
    const next = drawCard(s, p, type)
    if (next === s) break
    s = next
  }
  if (heroCount(s, p) > 0) return s
  if (!drawBlockReason(s, p, 'unit')) return s
  const choice = buybackChoices(s).at(-1)
  if (!choice || buybackBlockReason(s, p, choice.cardId)) return s
  return buyback(s, p, choice.cardId)
}

function counterScore(_attr: Attribute, _enemies: Unit[]): number {
  return 0
}

function laneValue(s: GameState, p: PlayerId, lane: LaneId, attr: Attribute | undefined, style: AiStyle): number {
  const enemyTw = s.players[other(p)].structures.towers[lane]
  const ownTw = s.players[p].structures.towers[lane]
  const foes = enemyHeroes(s, p, lane)
  const mine = heroesIn(s, p, lane)
  const bodies = lineup(s, p, lane).length
  const ancientOpen = enemyTw.t1 <= 0 && enemyTw.t2 <= 0
  let attack = 0
  if (style === 'jungler' || style === 'hunter' || style === 'carry') {
    attack = junglerPush(towerPressure(enemyTw.t1, enemyTw.t2), foes.length, bodies, ancientOpen)
    if (lane === 'mid' && midDoor(s, p, style)) attack += 1
  } else {
    const crowd = style === 'lane' ? Math.max(0, bodies - 2) : bodies * 3
    attack = towerPressure(enemyTw.t1, enemyTw.t2) * (style === 'lane' ? 3 : 2) + foes.length * 2 - crowd
    if (ancientOpen) attack += 28
    if (style === 'lane' && (enemyTw.t1 > 0 || enemyTw.t2 > 0)) attack += 12
  }
  if (attr) attack += counterScore(attr, foes)
  const defense = defendValue(ownTw.t1, ownTw.t2, foes.length, mine, style)
  return Math.max(attack, defense)
}

function pickLane(s: GameState, p: PlayerId, attr: Attribute | undefined, style: AiStyle): LaneId {
  return [...LANES].sort(
    (a, b) =>
      laneValue(s, p, b, attr, style) - laneValue(s, p, a, attr, style) ||
      ZONE_PRIORITY[p].indexOf(a) - ZONE_PRIORITY[p].indexOf(b),
  )[0]
}

function heroesIn(s: GameState, p: PlayerId, zone: ZoneId): number {
  return unitsIn(s, p, zone).filter((u) => u.kind === 'hero').length
}

/** A camp is 5 once two heroes are already in lanes. A jungler farms from round 3, one hero on the camp. */
function jungleValue(s: GameState, p: PlayerId, style: AiStyle): number {
  if (style === 'lane' || style === 'defender' || style === 'hunter') return -999
  const home = homeJungle(p)
  const neutral = campNeutral(s, home)
  if (!neutral) return -999
  const mine = heroesIn(s, p, home)
  if (style === 'jungler' || style === 'carry') {
    if (!junglerFarming(s.round)) return -999
    const cap = junglerCap(neutral)
    if (mine >= cap) return -999
    const boss = neutral.kind === 'roshan' || neutral.kind === 'tormentor'
    // Carry's camp beats a healthy Tier 1, including one with a single defender, and loses to an open Tier 2.
    if (style === 'carry') return boss ? 21 : 20
    // A jungler's boss beats a one-hero lane. A creep ties that lane and stays in it.
    return boss ? 19 : 18
  }
  const laneHeroes = LANES.reduce((sum, lane) => sum + heroesIn(s, p, lane), 0)
  if (laneHeroes < 2) return -999
  if (mine >= campCap(neutral)) return -999
  return NEUTRAL_KILL
}

function bestZone(s: GameState, p: PlayerId, attr: Attribute | undefined, style: AiStyle): ZoneId {
  const lane = pickLane(s, p, attr, style)
  const home = homeJungle(p)
  return jungleValue(s, p, style) > laneValue(s, p, lane, attr, style) ? home : lane
}

export function aiAssign(state: GameState, p: PlayerId, style: AiStyle = 'balanced'): GameState {
  let s = state
  while (!placeBlockReason(s, p)) {
    const heroes = s.players[p].hand.filter((c) => c.type === 'hero')
    if (heroes.length === 0) break
    let best = heroes[0]
    let bestScore = -Infinity
    let bestSpell = 0
    for (const card of heroes) {
      const attr = getHero(card.cardId).attribute
      const zone = bestZone(s, p, attr, style)
      const score = isLane(zone) ? laneValue(s, p, zone, attr, style) : jungleValue(s, p, style)
      const spell = !isLane(zone) && campSpell(card.cardId) ? 1 : 0
      if (score > bestScore || (score === bestScore && spell > bestSpell)) {
        bestScore = score
        bestSpell = spell
        best = card
      }
    }
    const attr = getHero(best.cardId).attribute
    const next = placeHero(s, p, best.iid, bestZone(s, p, attr, style))
    if (next === s) break
    s = next
  }
  for (const card of s.players[p].hand.filter((c) => c.type === 'creep')) {
    s = placeCreep(s, p, card.iid, creepLane(s, p))
  }
  if (s === state) s = structuredClone(state)
  for (const lane of LANES) {
    s.zones[lane][p] = s.zones[lane][p].filter((uid) => s.units[uid])
    s.zones[lane][p].sort((a, b) => positionRank(s.units[a]) - positionRank(s.units[b]))
  }
  return s
}

/** Creeps stand in the lane that already has our heroes and still has a tower to soak. */
function creepLane(s: GameState, p: PlayerId): LaneId {
  const standing = (lane: LaneId) => {
    const tw = s.players[other(p)].structures.towers[lane]
    return tw.t1 > 0 || tw.t2 > 0
  }
  const pool = LANES.filter(standing)
  const lanes = pool.length ? pool : [...LANES]
  const heroes = (lane: LaneId) => unitsIn(s, p, lane).filter((u) => u.kind === 'hero').length
  const creeps = (lane: LaneId) => lineup(s, p, lane).length - heroes(lane)
  return [...lanes].sort(
    (a, b) => heroes(b) - heroes(a) || creeps(a) - creeps(b) || ZONE_PRIORITY[p].indexOf(a) - ZONE_PRIORITY[p].indexOf(b),
  )[0]
}

function positionRank(u: Unit): number {
  if (u.kind !== 'hero') return 3
  if (FRONTLINERS.has(u.cardId ?? '')) return 0
  return isMelee(u) ? 1 : 2
}

function threat(u: Unit) {
  return (u.hp < u.maxHp ? 2 : 0) + (u.kind === 'hero' ? 5 : 0) + (u.kind === 'roshan' ? 3 : 0)
}

function playRank(cardId: string): number {
  if (cardId === 'rune_gold') return -100
  const item = getItem(cardId)
  if (item.kind === 'Rune' || item.kind === 'Tower') return -50
  // Spend the gold we held on the strongest shop item before a cheaper one uses it up.
  return -(item.cost ?? 0)
}

function laneMostEnemies(s: GameState, p: PlayerId): LaneId | undefined {
  const lanes = LANES.filter((lane) => enemyHeroes(s, p, lane).length > 0)
  if (!lanes.length) return undefined
  return [...lanes].sort(
    (a, b) => enemyHeroes(s, p, b).length - enemyHeroes(s, p, a).length || laneValue(s, p, b, undefined, 'balanced') - laneValue(s, p, a, undefined, 'balanced'),
  )[0]
}

function busiestContested(s: GameState, p: PlayerId): LaneId | undefined {
  const lanes = LANES.filter((lane) => unitsIn(s, p, lane).some((u) => u.kind === 'hero') && enemyHeroes(s, p, lane).length > 0)
  if (!lanes.length) return undefined
  return [...lanes].sort((a, b) => lineup(s, p, b).length - lineup(s, p, a).length)[0]
}

function pickBuff(s: GameState, p: PlayerId, targets: Unit[]): Unit | undefined {
  if (!targets.length) return undefined
  const hot = pickLane(s, p, undefined, 'balanced')
  const inHot = targets.filter((t) => t.zone === hot)
  const fighting = targets.filter((t) => enemyHeroes(s, p, t.zone).length > 0 || !!campNeutral(s, t.zone))
  const pool = inHot.length ? inHot : fighting.length ? fighting : targets
  return [...pool].sort((a, b) => Number(lineup(s, p, b.zone)[0] === b.uid) - Number(lineup(s, p, a.zone)[0] === a.uid))[0]
}

function pickWounded(targets: Unit[]): Unit | undefined {
  if (!targets.length) return undefined
  return [...targets].sort((a, b) => b.maxHp - b.hp - (a.maxHp - a.hp) || a.hp - b.hp)[0]
}

function passiveStillOn(u: Unit): boolean {
  if (u.kind !== 'hero' || !u.cardId || u.dead || u.status.broken || u.status.silenced) return false
  return getHero(u.cardId).script?.kind === 'passive'
}

function pickEnemy(s: GameState, p: PlayerId, caster: Unit | undefined, targets: Unit[]): Unit | undefined {
  if (!targets.length) return undefined
  const silence = caster ? ultCommands(caster).some((c) => c.verb === 'silence') : false
  const score = (t: Unit) => {
    let n = threat(t)
    if (t.hp === 1) n += 8
    else if (t.hp < t.maxHp) n += 3
    if (caster && t.zone === caster.zone) n += 4
    if (lineup(s, p, t.zone).length > 0) n += 2
    // Silence turns the passive off, so a single-target Silence aims at one that is still working.
    if (silence && passiveStillOn(t)) n += 4
    return n
  }
  return [...targets].sort((a, b) => score(b) - score(a))[0]
}

function soleDefender(s: GameState, p: PlayerId, u: Unit): boolean {
  if (!isLane(u.zone)) return false
  const tw = s.players[p].structures.towers[u.zone]
  if (tw.t1 <= 0 && tw.t2 <= 0) return false
  if (enemyHeroes(s, p, u.zone).length === 0) return false
  const heroes = unitsIn(s, p, u.zone).filter((x) => x.kind === 'hero')
  return heroes.length === 1 && heroes[0].uid === u.uid
}

function aiOneItem(state: GameState, p: PlayerId): GameState {
  const cards = state.players[p].hand.filter((c) => c.type === 'item').sort((a, b) => playRank(a.cardId) - playRank(b.cardId))
  for (const card of cards) {
    if (itemBlockReason(state, p, card)) continue
    const item = getItem(card.cardId)
    const next = item.kind === 'Tower' ? aiTowerCard(state, p, card.iid, card.cardId) : playAiItem(state, p, card.iid, item)
    if (next !== state) return next
  }
  return state
}

/** One interrupt: a single item, rune, or reward, else the same state. */
export function aiItems(state: GameState, p: PlayerId): GameState {
  return aiOneItem(state, p)
}

function playAiItem(s: GameState, p: PlayerId, iid: string, item: ItemCard): GameState {
  if (item.target === 'none') {
    if (item.id === 'greaves') {
      const wounded = heroesOnBoard(s, p).some((u) => isLane(u.zone) && u.hp < u.maxHp)
      return wounded ? playItem(s, p, iid) : s
    }
    if (item.id === 'assault') {
      const fighting = heroesOnBoard(s, p).some((u) => isLane(u.zone))
      return fighting ? playItem(s, p, iid) : s
    }
    return playItem(s, p, iid)
  }
  if (item.id === 'gem') {
    const lane = LANES.find((l) =>
      lineup(s, other(p), l).some((id) => {
        const u = s.units[id]
        return u.kind === 'hero' && u.status.invisible && !u.status.revealed
      }),
    )
    return lane ? playItem(s, p, iid, undefined, lane) : s
  }
  if (item.target === 'lane') {
    const lane = item.id === 'dust' || item.id === 'shivas' ? laneMostEnemies(s, p) : busiestContested(s, p)
    return lane && itemLanes(s, p, item.id).includes(lane) ? playItem(s, p, iid, undefined, lane) : s
  }
  const targets = itemTargets(s, p, item.id).map((uid) => s.units[uid])
  if (item.id === 'tp') return aiTeleport(s, p, iid, targets)
  if (item.id === 'salve' || item.id === 'rune_regen' || item.id === 'heart') {
    const pick = pickWounded(targets)
    return pick ? playItem(s, p, iid, pick.uid) : s
  }
  if (item.id === 'rapier' || item.id === 'refresher') {
    const fighters = targets.filter((t) => enemyHeroes(s, p, t.zone).length > 0)
    const pick = pickBuff(s, p, fighters)
    return pick ? playItem(s, p, iid, pick.uid) : s
  }
  if (item.target === 'enemyHero' || item.target === 'enemyUnit') {
    const pick = pickEnemy(s, p, undefined, targets)
    return pick ? playItem(s, p, iid, pick.uid) : s
  }
  const wounded = targets.filter((t) => t.hp < t.maxHp)
  const healFirst = item.id === 'rune_regen' || item.target === 'allyWoundedHero'
  const pick = healFirst ? pickWounded(targets) : pickBuff(s, p, wounded.length && item.id === 'heart' ? wounded : targets)
  return pick ? playItem(s, p, iid, pick.uid) : s
}

function aiTeleport(s: GameState, p: PlayerId, iid: string, heroes: Unit[]): GameState {
  const lane = pickLane(s, p, undefined, 'balanced')
  const idle = heroes.find(
    (u) => u.zone !== lane && lineup(s, other(p), u.zone).length === 0 && !campNeutral(s, u.zone) && !soleDefender(s, p, u),
  )
  return idle && itemLanes(s, p, 'tp', idle.uid).includes(lane) ? playItem(s, p, iid, idle.uid, lane) : s
}

/** One full round with the AI playing both sides, ending in the report (or game over). */
export function playAiRound(state: GameState, styles: Partial<Record<PlayerId, AiStyle>> = {}): GameState {
  let s = state
  for (const p of PLAYERS) s = aiDraw(s, p)
  s = endDraw(s)
  for (const p of PLAYERS) s = aiAssign(s, p, styles[p] ?? 'balanced')
  s = reveal(s)
  for (let guard = 0; s.phase === 'response' && guard < 200; guard++) {
    const next = aiOneResponse(s, s.priority)
    if (next === s) break
    s = next
  }
  if (s.phase === 'rotate') {
    for (const p of PLAYERS) s = takeRotations(s, p, styles[p] ?? 'balanced')
    s = endRotation(s)
  }
  for (const p of PLAYERS) s = discardToHandLimit(s, p)
  return s
}

/** Use up to two rotations, then stop. A pass spends whatever is left. */
export function takeRotations(s: GameState, p: PlayerId, style: AiStyle = 'balanced'): GameState {
  while (s.phase === 'rotate' && s.players[p].rotationsUsed < ROTATIONS_PER_ROUND) {
    const before = s.players[p].rotationsUsed
    s = aiRotate(s, p, style)
    if (s.players[p].rotationsUsed === before) break
  }
  return s
}

function stayValue(s: GameState, p: PlayerId, u: Unit, style: AiStyle): number {
  let stay = lineup(s, other(p), u.zone).length * 2
  if (campNeutral(s, u.zone)) stay += 3
  if (!isLane(u.zone)) {
    // Farmers stay for a healthy Tier 1 (16) and still leave for an exposed Tier 2 (24).
    const camp = campNeutral(s, u.zone)
    if (
      (style === 'jungler' || style === 'carry') &&
      junglerFarming(s.round) &&
      camp &&
      u.zone === homeJungle(p) &&
      heroesIn(s, p, u.zone) <= junglerCap(camp)
    ) {
      stay += 18
    }
    return stay
  }
  const ownTw = s.players[p].structures.towers[u.zone]
  const foes = enemyHeroes(s, p, u.zone).length
  const mine = heroesIn(s, p, u.zone)
  const enemyTw = s.players[other(p)].structures.towers[u.zone]
  stay += defendValue(ownTw.t1, ownTw.t2, foes, Math.max(0, mine - 1), style)
  if (style === 'jungler' || style === 'hunter' || style === 'carry') {
    stay += junglerPush(towerPressure(enemyTw.t1, enemyTw.t2), foes, lineup(s, p, u.zone).length, enemyTw.t1 <= 0 && enemyTw.t2 <= 0)
  } else {
    stay += exposedBonus(towerPressure(enemyTw.t1, enemyTw.t2))
  }
  if (soleDefender(s, p, u)) stay += 10
  return stay
}

function destValue(s: GameState, p: PlayerId, zone: ZoneId, style: AiStyle, from?: ZoneId): number {
  const foes = lineup(s, other(p), zone).length
  const friends = lineup(s, p, zone).length
  let score = foes * 2 - friends
  if (!isLane(zone)) {
    const camp = campNeutral(s, zone)
    const mine = heroesIn(s, p, zone)
    if (style === 'jungler' || style === 'carry') {
      if (!junglerFarming(s.round) || !camp) return score
      const home = campNeutral(s, homeJungle(p))
      const homeReady = !home || heroesIn(s, p, homeJungle(p)) >= junglerCap(home)
      if (zone === homeJungle(p) && mine < junglerCap(camp)) score += 20
      // The enemy camp is one step from mid. A carry farms at home and walks back, so the invade stays a jungler step.
      if (style === 'jungler' && zone === enemyJungle(p) && from === 'mid' && mine < junglerCap(camp) && homeReady) score += 20
      return score
    }
    // A hunter does not farm, so a camp is not a destination.
    if (style === 'hunter') return score
    if (style !== 'lane' && style !== 'defender' && camp && zone === homeJungle(p) && mine < campCap(camp)) score += NEUTRAL_KILL
    return score
  }
  const enemyTw = s.players[other(p)].structures.towers[zone]
  const ownTw = s.players[p].structures.towers[zone]
  const defenders = enemyHeroes(s, p, zone).length
  if (style === 'jungler' || style === 'hunter' || style === 'carry') {
    score += junglerPush(towerPressure(enemyTw.t1, enemyTw.t2), defenders, friends, enemyTw.t1 <= 0 && enemyTw.t2 <= 0)
  } else score += exposedBonus(towerPressure(enemyTw.t1, enemyTw.t2))
  score += defendValue(ownTw.t1, ownTw.t2, defenders, heroesIn(s, p, zone), style)
  return score
}

/** Move a hero when the destination is strictly better than staying, including leaving a fight to push or defend. */
export function aiRotate(state: GameState, p: PlayerId, style: AiStyle = 'balanced'): GameState {
  let best: { uid: string; zone: ZoneId; margin: number } | undefined
  for (const u of heroesOnBoard(state, p)) {
    const stay = stayValue(state, p, u, style)
    for (const zone of rotationTargets(state, u.uid)) {
      const score = destValue(state, p, zone, style, u.zone)
      const margin = score - stay
      if (score > stay && (!best || margin > best.margin)) best = { uid: u.uid, zone, margin }
    }
  }
  return best ? rotateHero(state, p, best.uid, best.zone) : passRotation(state, p)
}

function aiTowerCard(s: GameState, p: PlayerId, iid: string, id: string): GameState {
  const enemy = other(p)
  const own = (l: LaneId) => lineup(s, p, l).length
  const foes = (l: LaneId) => lineup(s, enemy, l).length
  const towers = s.players[p].structures.towers
  if (id === 'glyph') {
    const threatened = LANES.some((l) => (towers[l].t1 > 0 || towers[l].t2 > 0) && foes(l) > 0 && foes(l) >= own(l) + 2)
    return threatened ? playItem(s, p, iid) : s
  }
  if (id === 'lotus') {
    const wounded = heroesOnBoard(s, p).filter((u) => u.hp < u.maxHp).length
    return wounded >= 2 ? playItem(s, p, iid) : s
  }
  const lane = [...LANES]
    .filter((l) => towers[l].t1 === 0 && foes(l) > own(l))
    .sort((a, b) => foes(b) - own(b) - (foes(a) - own(a)))[0]
  return lane ? playItem(s, p, iid, undefined, lane) : s
}

function ultCommands(u: Unit): { verb: string; who: string }[] {
  const script = u.cardId ? getHero(u.cardId).script : undefined
  if (!script) return []
  return script.ult.flatMap((line) =>
    line.split('|').map((part) => {
      const [verb, who = ''] = part.trim().split(/\s+/)
      return { verb, who }
    }),
  )
}

function ultShape(u: Unit) {
  const cmds = ultCommands(u)
  const target = getHero(u.cardId!).ult.target
  const harmfulOn = (verb: string, who: string) => {
    if (!HARMFUL.has(verb)) return false
    if (ENEMY_WHO.has(who) || who === 'target' || who === 'woundedH') return true
    return !who && (target.startsWith('enemy') || target === 'heroInLane')
  }
  return {
    friendlyFire: cmds.some((c) => (c.who === 'laneAll' || c.who === 'others') && HARMFUL.has(c.verb)),
    selfHarm: cmds.some((c) => c.who === 'self' && (c.verb === 'mdmg' || c.verb === 'pdmg')),
    global: cmds.some((c) => c.who === 'boardH' || c.who === 'pos1each' || c.who === 'intH' || c.who === 'strH'),
    hitsEnemy: cmds.some((c) => harmfulOn(c.verb, c.who)),
    healOnly: cmds.length > 0 && cmds.every((c) => c.verb === 'heal' || c.verb === 'healboard'),
    buff: cmds.some((c) => BUFF_VERBS.has(c.verb)),
  }
}

function zoneUltScore(s: GameState, p: PlayerId, zone: ZoneId): number {
  const foes = lineup(s, other(p), zone).length
  let score = foes * 3
  const camp = campNeutral(s, zone)
  if (camp) score += 2
  if (!isLane(zone)) return score
  const pressure = towerPressure(s.players[other(p)].structures.towers[zone].t1, s.players[other(p)].structures.towers[zone].t2)
  if (pressure > 1) score += pressure
  const own = s.players[p].structures.towers[zone]
  if ((own.t1 < TOWER_HP.t1 || own.t2 < TOWER_HP.t2) && foes > 0 && (own.t1 > 0 || own.t2 > 0)) score += 4
  return score
}

export function aiUlts(state: GameState, p: PlayerId): GameState {
  let s = state
  for (const camp of CAMPS) {
    const focus = enemyHeroes(s, p, camp).length > 0 ? 'enemy' : 'neutral'
    if (s.players[p].campFocus[camp] !== focus) s = setCampFocus(s, p, camp, focus)
  }
  const casters = heroesOnBoard(s, p).sort(
    (a, b) => ultCost(a, s) - ultCost(b, s) || Number(ultNeedsTarget(b)) - Number(ultNeedsTarget(a)),
  )
  const before = s.ultDeclarations.length
  for (const caster of casters) {
    const u = s.units[caster.uid]
    if (!u || ultBlockReason(s, u.uid)) continue
    const shape = ultShape(u)
    if (shape.selfHarm && u.hp <= 1) continue
    if (shape.friendlyFire) {
      const allies = unitsIn(s, p, u.zone).filter((x) => x.kind === 'hero' && x.uid !== u.uid).length
      const enemies = enemyHeroes(s, p, u.zone).length
      if (enemies > allies) s = declareUlt(s, u.uid)
    } else if (ultZones(s, u.uid).length) {
      const zones = ultZones(s, u.uid)
      const dest = [...zones].sort((a, b) => zoneUltScore(s, p, b) - zoneUltScore(s, p, a))[0]
      if (dest && zoneUltScore(s, p, dest) > 0) s = declareUlt(s, u.uid, dest)
    } else if (ultNeedsTarget(u)) {
      const targets = ultTargets(s, u.uid).map((id) => s.units[id])
      const kind = getHero(u.cardId!).ult.target
      let pick: Unit | undefined
      if (kind === 'allyHero' || kind === 'allyHeroAny') {
        const wounded = targets.filter((t) => t.hp < t.maxHp)
        if (shape.healOnly && wounded.length === 0) continue
        pick = wounded.length && (shape.healOnly || shape.buff) ? pickWounded(wounded) : pickBuff(s, p, targets)
      } else if (kind === 'heroInLane') {
        const enemies = targets.filter((t) => t.owner !== p)
        const allies = targets.filter((t) => t.owner === p)
        pick = shape.hitsEnemy && enemies.length ? pickEnemy(s, p, u, enemies) : pickBuff(s, p, allies.length ? allies : enemies)
      } else if (kind === 'enemyCreep') {
        pick = targets[0]
      } else {
        const serious = targets.filter((t) => t.kind === 'hero' || t.kind === 'neutral' || t.kind === 'roshan' || t.kind === 'tormentor')
        pick = pickEnemy(s, p, u, serious.length ? serious : targets)
      }
      if (pick) s = declareUlt(s, u.uid, pick.uid)
    } else if (shape.global) {
      if (heroesOnBoard(s, other(p)).length > 0) s = declareUlt(s, u.uid)
    } else if (shape.healOnly) {
      if (heroesOnBoard(s, p).some((hero) => hero.hp < hero.maxHp)) s = declareUlt(s, u.uid)
    } else if (!shape.hitsEnemy && shape.buff) {
      s = declareUlt(s, u.uid)
    } else {
      const enemiesHere = enemyHeroes(s, p, u.zone).length + (campNeutral(s, u.zone) ? 1 : 0)
      if (shape.hitsEnemy && enemiesHere > 0) s = declareUlt(s, u.uid)
    }
    if (s.ultDeclarations.length > before) return s
  }
  return s
}

/** Spend leftover XP on one Shield. Abilities are tried first, and a hero who already has a Shield is skipped. */
function aiBuyShield(state: GameState, p: PlayerId): GameState {
  if (state.players[p].xp < SHIELD_XP_COST) return state
  const open = heroesOnBoard(state, p).filter((u) => !shieldBlockReason(state, p, u.uid))
  if (!open.length) return state
  const threat = (u: Unit) => enemyHeroes(state, p, u.zone).length + (isLane(u.zone) ? 2 : 0)
  const pick = [...open].sort((a, b) => threat(b) - threat(a) || a.hp - b.hp)[0]
  return buyShield(state, p, pick.uid)
}

/** The side with priority plays one interrupt, or passes. */
export function aiOneResponse(state: GameState, p: PlayerId): GameState {
  if (state.phase !== 'response' || state.priority !== p) return state
  const item = aiOneItem(state, p)
  if (item !== state) return item
  const cast = aiUlts(state, p)
  if (cast.ultDeclarations.length > state.ultDeclarations.length) return cast
  const shielded = aiBuyShield(cast, p)
  if (shielded !== cast) return shielded
  return passResponse(cast, p)
}
