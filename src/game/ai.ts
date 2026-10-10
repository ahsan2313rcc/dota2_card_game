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
} from './types'

const FRONTLINERS = new Set(['axe', 'tidehunter', 'pudge', 'abaddon', 'wraith_king', 'sven'])

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

/** Full tier 1 scores 1. A fallen tier 1 scores 5 plus missing tier 2 health. Both down scores 8. */
function towerPressure(t1: number, t2: number): number {
  if (t1 <= 0 && t2 <= 0) return 8
  if (t1 <= 0) return 5 + (TOWER_HP.t2 - t2)
  return TOWER_HP.t1 - t1 + 1
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

function enemyHeroes(s: GameState, p: PlayerId, zone: ZoneId): Unit[] {
  return unitsIn(s, other(p), zone).filter((u) => u.kind === 'hero')
}

function heroCount(s: GameState, p: PlayerId): number {
  const inHand = s.players[p].hand.filter((c) => c.type === 'hero').length
  return inHand + heroesOnBoard(s, p).length
}

/** A board with this many heroes is ready to spend gold on items. Below that, gold buys hero cards. */
const ENOUGH_HEROES = 3

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
    const stocked = heroesOnBoard(s, p).length >= ENOUGH_HEROES
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

function laneValue(s: GameState, p: PlayerId, lane: LaneId, attr?: Attribute): number {
  const enemyTw = s.players[other(p)].structures.towers[lane]
  const ownTw = s.players[p].structures.towers[lane]
  const foes = enemyHeroes(s, p, lane)
  let score = towerPressure(enemyTw.t1, enemyTw.t2) * 2 + foes.length * 2
  score -= lineup(s, p, lane).length * 3
  const ownWounded = ownTw.t1 < TOWER_HP.t1 || ownTw.t2 < TOWER_HP.t2
  const ownStanding = ownTw.t1 > 0 || ownTw.t2 > 0
  if (ownWounded && foes.length > 0 && ownStanding) score += 8 + foes.length * 2
  if (!ownStanding && foes.length > 0) score += 10
  // A live Tier 2 hits every hero in the lane. A healthy one is a worse assignment than a camp.
  if (enemyTw.t1 <= 0 && enemyTw.t2 > 0) score -= 8
  if (attr) score += counterScore(attr, foes)
  return score
}

function pickLane(s: GameState, p: PlayerId, attr?: Attribute): LaneId {
  return [...LANES].sort(
    (a, b) => laneValue(s, p, b, attr) - laneValue(s, p, a, attr) || ZONE_PRIORITY[p].indexOf(a) - ZONE_PRIORITY[p].indexOf(b),
  )[0]
}

/** Farm home jungle only after two heroes are already in lanes and no tower is under attack. */
function jungleValue(s: GameState, p: PlayerId): number {
  const home = homeJungle(p)
  const neutral = campNeutral(s, home)
  if (!neutral) return -999
  const crisis = LANES.some((lane) => {
    const tw = s.players[p].structures.towers[lane]
    const hurt = tw.t1 < TOWER_HP.t1 || tw.t2 < TOWER_HP.t2
    return hurt && enemyHeroes(s, p, lane).length > 0
  })
  if (crisis) return -999
  const laneHeroes = LANES.reduce((sum, lane) => sum + unitsIn(s, p, lane).filter((u) => u.kind === 'hero').length, 0)
  if (laneHeroes < 2) return -999
  const mine = lineup(s, p, home).length
  if (neutral.kind === 'roshan' && mine < 2) return 10
  if (neutral.kind === 'tormentor' && mine < 3) return 9
  if (neutral.kind === 'neutral' && mine === 0) return 8
  return -999
}

function bestZone(s: GameState, p: PlayerId, attr?: Attribute): ZoneId {
  const lane = pickLane(s, p, attr)
  const home = homeJungle(p)
  return jungleValue(s, p) > laneValue(s, p, lane, attr) ? home : lane
}

export function aiAssign(state: GameState, p: PlayerId): GameState {
  let s = state
  while (!placeBlockReason(s, p)) {
    const heroes = s.players[p].hand.filter((c) => c.type === 'hero')
    if (heroes.length === 0) break
    let best = heroes[0]
    let bestScore = -Infinity
    for (const card of heroes) {
      const attr = getHero(card.cardId).attribute
      const zone = bestZone(s, p, attr)
      const score = isLane(zone) ? laneValue(s, p, zone, attr) : jungleValue(s, p)
      if (score > bestScore) {
        bestScore = score
        best = card
      }
    }
    const attr = getHero(best.cardId).attribute
    const next = placeHero(s, p, best.iid, bestZone(s, p, attr))
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
    (a, b) => enemyHeroes(s, p, b).length - enemyHeroes(s, p, a).length || laneValue(s, p, b) - laneValue(s, p, a),
  )[0]
}

function busiestContested(s: GameState, p: PlayerId): LaneId | undefined {
  const lanes = LANES.filter((lane) => unitsIn(s, p, lane).some((u) => u.kind === 'hero') && enemyHeroes(s, p, lane).length > 0)
  if (!lanes.length) return undefined
  return [...lanes].sort((a, b) => lineup(s, p, b).length - lineup(s, p, a).length)[0]
}

function pickBuff(s: GameState, p: PlayerId, targets: Unit[]): Unit | undefined {
  if (!targets.length) return undefined
  const hot = pickLane(s, p)
  const inHot = targets.filter((t) => t.zone === hot)
  const fighting = targets.filter((t) => enemyHeroes(s, p, t.zone).length > 0 || !!campNeutral(s, t.zone))
  const pool = inHot.length ? inHot : fighting.length ? fighting : targets
  return [...pool].sort((a, b) => Number(lineup(s, p, b.zone)[0] === b.uid) - Number(lineup(s, p, a.zone)[0] === a.uid))[0]
}

function pickWounded(targets: Unit[]): Unit | undefined {
  if (!targets.length) return undefined
  return [...targets].sort((a, b) => b.maxHp - b.hp - (a.maxHp - a.hp) || a.hp - b.hp)[0]
}

function pickEnemy(s: GameState, p: PlayerId, caster: Unit | undefined, targets: Unit[]): Unit | undefined {
  if (!targets.length) return undefined
  const score = (t: Unit) => {
    let n = threat(t)
    if (t.hp === 1) n += 8
    else if (t.hp < t.maxHp) n += 3
    if (caster && t.zone === caster.zone) n += 4
    if (lineup(s, p, t.zone).length > 0) n += 2
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
  const lane = pickLane(s, p)
  const idle = heroes.find(
    (u) => u.zone !== lane && lineup(s, other(p), u.zone).length === 0 && !campNeutral(s, u.zone) && !soleDefender(s, p, u),
  )
  return idle && itemLanes(s, p, 'tp', idle.uid).includes(lane) ? playItem(s, p, iid, idle.uid, lane) : s
}

/** One full round with the AI playing both sides, ending in the report (or game over). */
export function playAiRound(state: GameState): GameState {
  let s = state
  for (const p of PLAYERS) s = aiDraw(s, p)
  s = endDraw(s)
  for (const p of PLAYERS) s = aiAssign(s, p)
  s = reveal(s)
  for (let guard = 0; s.phase === 'response' && guard < 200; guard++) {
    const next = aiOneResponse(s, s.priority)
    if (next === s) break
    s = next
  }
  if (s.phase === 'rotate') {
    for (const p of PLAYERS) s = takeRotations(s, p)
    s = endRotation(s)
  }
  for (const p of PLAYERS) s = discardToHandLimit(s, p)
  return s
}

/** Use up to two rotations, then stop. A pass spends whatever is left. */
export function takeRotations(s: GameState, p: PlayerId): GameState {
  while (s.phase === 'rotate' && s.players[p].rotationsUsed < ROTATIONS_PER_ROUND) {
    const before = s.players[p].rotationsUsed
    s = aiRotate(s, p)
    if (s.players[p].rotationsUsed === before) break
  }
  return s
}

function stayValue(s: GameState, p: PlayerId, u: Unit): number {
  let stay = lineup(s, other(p), u.zone).length * 2
  if (campNeutral(s, u.zone)) stay += 3
  if (!isLane(u.zone)) return stay
  stay += exposedBonus(towerPressure(s.players[other(p)].structures.towers[u.zone].t1, s.players[other(p)].structures.towers[u.zone].t2))
  if (soleDefender(s, p, u)) stay += 10
  return stay
}

function destValue(s: GameState, p: PlayerId, zone: ZoneId): number {
  const foes = lineup(s, other(p), zone).length
  const friends = lineup(s, p, zone).length
  let score = foes * 2 - friends
  if (!isLane(zone)) {
    const camp = campNeutral(s, zone)
    if (camp && friends === 0) score += camp.kind === 'roshan' ? 6 : 4
    return score
  }
  const enemyTw = s.players[other(p)].structures.towers[zone]
  const ownTw = s.players[p].structures.towers[zone]
  score += exposedBonus(towerPressure(enemyTw.t1, enemyTw.t2))
  if (ownTw.t1 <= 0 && ownTw.t2 <= 0 && foes > 0) score += 16
  else if ((ownTw.t1 < TOWER_HP.t1 || ownTw.t2 < TOWER_HP.t2) && (ownTw.t1 > 0 || ownTw.t2 > 0) && foes > 0) score += 12
  return score
}

/** Move a hero when the destination is strictly better than staying, including leaving a fight to push or defend. */
export function aiRotate(state: GameState, p: PlayerId): GameState {
  let best: { uid: string; zone: ZoneId; margin: number } | undefined
  for (const u of heroesOnBoard(state, p)) {
    const stay = stayValue(state, p, u)
    for (const zone of rotationTargets(state, u.uid)) {
      const score = destValue(state, p, zone)
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
