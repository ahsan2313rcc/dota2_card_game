import { getHero, getItem } from './cards'
import {
  ZONE_PRIORITY,
  buyback,
  buybackBlockReason,
  campNeutral,
  declareUlt,
  drawBlockReason,
  drawCard,
  endDraw,
  endItems,
  endRotation,
  favoredPlayer,
  heroesOnBoard,
  itemBlockReason,
  itemTargets,
  lineup,
  other,
  passRotation,
  placeBlockReason,
  placeCreep,
  placeHero,
  playItem,
  resolveRound,
  reveal,
  rotateHero,
  rotationTargets,
  setCampFocus,
  ultBlockReason,
  ultCost,
  ultNeedsTarget,
  ultTargets,
} from './engine'
import { BOARD_LIMIT, CAMPS, LANES, PLAYERS, type CampId, type GameState, type LaneId, type PlayerId, type Unit, type ZoneId } from './types'

const FRONTLINERS = new Set(['axe', 'tidehunter', 'pudge', 'abaddon', 'wraith_king', 'sven'])

export function aiDraw(state: GameState, p: PlayerId): GameState {
  let s = state
  // Buy back the most recent death when short on heroes.
  for (let guard = 0; guard < 2; guard++) {
    const pl = s.players[p]
    const heroesHeld = pl.hand.filter((c) => c.type === 'hero').length
    const id = pl.grave[pl.grave.length - 1]
    if (!id || heroesHeld >= 2 || heroesOnBoard(s, p).length + heroesHeld >= BOARD_LIMIT) break
    if (buybackBlockReason(s, p, id)) break
    s = buyback(s, p, id)
  }
  for (let guard = 0; guard < 6 && s.players[p].gold > 0; guard++) {
    const hand = s.players[p].hand
    const heroes = hand.filter((c) => c.type === 'hero').length
    const creeps = hand.filter((c) => c.type === 'creep').length
    // Heroes and creeps come from one deck, so the AI cannot pick which it gets.
    const want = heroes < 2 || creeps < 1 ? 'unit' : 'item'
    const fallback = want === 'unit' ? 'item' : 'unit'
    const type = !drawBlockReason(s, p, want) ? want : !drawBlockReason(s, p, fallback) ? fallback : null
    if (!type) break
    s = drawCard(s, p, type)
  }
  return s
}

function enemyHeroesIn(s: GameState, p: PlayerId, zone: ZoneId) {
  return lineup(s, other(p), zone).filter((uid) => s.units[uid].kind === 'hero').length
}

/** Farm the home jungle once the lanes are covered; take on bosses only with a wide board. */
function aiPickZone(s: GameState, p: PlayerId): ZoneId {
  const onBoard = heroesOnBoard(s, p).length
  const home: CampId = p === 'radiant' ? 'radiantJungle' : 'direJungle'
  for (const camp of [home, other(p) === 'radiant' ? 'radiantJungle' : 'direJungle'] as CampId[]) {
    const n = campNeutral(s, camp)
    const mine = lineup(s, p, camp).length
    if (!n) continue
    if (n.kind === 'neutral' && camp === home && onBoard >= 3 && mine === 0) return camp
    if (n.kind === 'roshan' && onBoard >= 4 && mine < 2) return camp
    if (n.kind === 'tormentor' && onBoard >= 4 && mine < 3) return camp
  }
  const counts = LANES.map((l) => ({ lane: l, n: lineup(s, p, l).length, pri: ZONE_PRIORITY[p].indexOf(l) }))
  counts.sort((a, b) => a.n - b.n || a.pri - b.pri)
  return counts[0].lane
}

export function aiAssign(state: GameState, p: PlayerId): GameState {
  let s = state
  while (!placeBlockReason(s, p)) {
    const heroes = s.players[p].hand.filter((c) => c.type === 'hero')
    if (heroes.length === 0) break
    const card = heroes[(s.round + heroes.length) % heroes.length]
    s = placeHero(s, p, card.iid, aiPickZone(s, p))
  }
  for (const card of s.players[p].hand.filter((c) => c.type === 'creep')) {
    const heroCount = (l: (typeof LANES)[number]) => lineup(s, p, l).filter((u) => s.units[u].kind === 'hero').length
    const creepCount = (l: (typeof LANES)[number]) => lineup(s, p, l).length - heroCount(l)
    const lane = [...LANES].sort(
      (a, b) =>
        heroCount(b) - heroCount(a) ||
        creepCount(a) - creepCount(b) ||
        ZONE_PRIORITY[p].indexOf(a) - ZONE_PRIORITY[p].indexOf(b),
    )[0]
    s = placeCreep(s, p, card.iid, lane)
  }
  if (s === state) s = structuredClone(state)
  // Tanky heroes go to Position 1, creeps behind heroes.
  for (const lane of LANES) {
    const rank = (uid: string) => {
      const u = s.units[uid]
      if (u.kind !== 'hero') return 2
      return FRONTLINERS.has(u.cardId ?? '') ? 0 : 1
    }
    s.zones[lane][p].sort((a, b) => rank(a) - rank(b))
  }
  return s
}

function threat(u: Unit) {
  return (u.hp < u.maxHp ? 2 : 0) + (u.kind === 'hero' ? 5 : 0) + (u.kind === 'roshan' ? 3 : 0)
}

export function aiItems(state: GameState, p: PlayerId): GameState {
  let s = state
  const contested = (u: Unit) => enemyHeroesIn(s, p, u.zone) > 0 || !!campNeutral(s, u.zone)
  for (const card of [...s.players[p].hand]) {
    if (card.type !== 'item' || itemBlockReason(s, p, card)) continue
    const item = getItem(card.cardId)
    if (item.kind === 'Tower') {
      s = aiTowerCard(s, p, card.iid, card.cardId)
      continue
    }
    if (item.target === 'none') {
      s = playItem(s, p, card.iid)
      continue
    }
    const targets = itemTargets(s, p, card.cardId).map((uid) => s.units[uid])
    let pick: Unit | undefined
    switch (item.id) {
      case 'tp':
        s = aiTeleport(s, p, card.iid, targets)
        continue
      case 'dagon':
        pick = targets.find((t) => t.kind === 'hero' && t.hp === 1) ?? targets.find((t) => t.owner === 'neutral' && t.hp === 1)
        break
      case 'tango':
      case 'refresher':
      case 'refresher_shard':
      case 'rune_regen':
      case 'rune_water':
        pick = targets[0]
        break
      case 'orchid':
      case 'silver_edge':
      case 'euls':
        pick = targets.filter((t) => lineup(s, p, t.zone).length > 0).sort((a, b) => threat(b) - threat(a))[0]
        break
      case 'atos':
        break
      default:
        pick = targets.filter(contested).sort((a, b) => Number(lineup(s, p, b.zone)[0] === b.uid) - Number(lineup(s, p, a.zone)[0] === a.uid))[0]
    }
    if (pick) s = playItem(s, p, card.iid, pick.uid)
  }
  return s
}

/** Lane where the enemy outnumbers us the most, if any. */
function weakestLane(s: GameState, p: PlayerId, filter: (l: LaneId) => boolean = () => true): LaneId | undefined {
  const gap = (l: LaneId) => lineup(s, other(p), l).length - lineup(s, p, l).length
  return LANES.filter((l) => filter(l) && gap(l) > 0).sort((a, b) => gap(b) - gap(a))[0]
}

function aiTeleport(s: GameState, p: PlayerId, iid: string, heroes: Unit[]): GameState {
  const lane = weakestLane(s, p, (l) => s.players[p].structures.towers[l].t1 === 0)
  const idle = heroes.find((u) => u.zone !== lane && lineup(s, other(p), u.zone).length === 0 && !campNeutral(s, u.zone))
  return lane && idle ? playItem(s, p, iid, idle.uid, lane) : s
}

/** One full round with the AI playing both sides, ending in the report (or game over). */
export function playAiRound(state: GameState): GameState {
  let s = state
  for (const p of PLAYERS) s = aiDraw(s, p)
  s = endDraw(s)
  for (const p of PLAYERS) s = aiAssign(s, p)
  s = reveal(s)
  for (const p of PLAYERS) s = aiItems(s, p)
  s = endItems(s)
  for (const p of PLAYERS) s = aiUlts(s, p)
  s = resolveRound(s)
  if (s.phase !== 'rotate') return s
  const first = favoredPlayer(s.round)
  for (const p of [first, other(first)]) s = aiRotate(s, p)
  return endRotation(s)
}

/** Rotate one idle hero toward the zone where it is needed most. */
export function aiRotate(state: GameState, p: PlayerId): GameState {
  let best: { uid: string; zone: ZoneId; score: number } | undefined
  for (const u of heroesOnBoard(state, p)) {
    const busy = lineup(state, other(p), u.zone).length > 0 || !!campNeutral(state, u.zone)
    if (busy) continue
    for (const zone of rotationTargets(state, u.uid)) {
      const foes = lineup(state, other(p), zone).length
      const friends = lineup(state, p, zone).length
      const camp = campNeutral(state, zone)
      const score = foes - friends + (camp?.kind === 'neutral' && friends === 0 ? 1 : 0)
      if (score > 0 && (!best || score > best.score)) best = { uid: u.uid, zone, score }
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
  // Gate: rally everyone to a lane whose T1 has fallen and that enemies are pushing.
  const lane = [...LANES]
    .filter((l) => towers[l].t1 === 0 && foes(l) > own(l))
    .sort((a, b) => foes(b) - own(b) - (foes(a) - own(a)))[0]
  return lane ? playItem(s, p, iid, undefined, lane) : s
}

export function aiUlts(state: GameState, p: PlayerId): GameState {
  let s = state
  for (const camp of CAMPS) {
    const focus = enemyHeroesIn(s, p, camp) > 0 ? 'enemy' : 'neutral'
    if (s.players[p].campFocus[camp] !== focus) s = setCampFocus(s, p, camp, focus)
  }
  const casters = heroesOnBoard(s, p).sort(
    (a, b) => ultCost(a) - ultCost(b) || Number(ultNeedsTarget(b)) - Number(ultNeedsTarget(a)),
  )
  for (const u of casters) {
    if (ultBlockReason(s, u.uid)) continue
    const enemiesHere = enemyHeroesIn(s, p, u.zone) + (campNeutral(s, u.zone) ? 1 : 0)
    const hero = getHero(u.cardId!)
    if (ultNeedsTarget(u)) {
      const targets = ultTargets(s, u.uid)
        .map((x) => s.units[x])
        .filter((t) => t.kind === 'hero' || t.kind === 'neutral' || t.kind === 'roshan')
        .sort((a, b) => threat(b) - threat(a))
      if (targets[0]) s = declareUlt(s, u.uid, targets[0].uid)
    } else if (hero.id === 'zeus') {
      if (heroesOnBoard(s, other(p)).length >= 2) s = declareUlt(s, u.uid)
    } else if (enemiesHere > 0) {
      s = declareUlt(s, u.uid)
    }
  }
  return s
}
