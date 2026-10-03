import { getHero, getItem } from './cards'
import {
  ZONE_PRIORITY,
  buyback,
  buybackBlockReason,
  campNeutral,
  declareUlt,
  drawBlockReason,
  drawCard,
  heroesOnBoard,
  itemBlockReason,
  itemTargets,
  lineup,
  other,
  placeBlockReason,
  placeCreep,
  placeHero,
  playItem,
  setCampFocus,
  ultBlockReason,
  ultNeedsTarget,
  ultTargets,
} from './engine'
import { BOARD_LIMIT, CAMPS, LANES, type GameState, type LaneId, type PlayerId, type Unit, type ZoneId } from './types'

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
    const want = heroes < 2 ? 'hero' : creeps < 1 ? 'creep' : 'item'
    if (drawBlockReason(s, p, want)) break
    s = drawCard(s, p, want)
  }
  return s
}

function enemyHeroesIn(s: GameState, p: PlayerId, zone: ZoneId) {
  return lineup(s, other(p), zone).filter((uid) => s.units[uid].kind === 'hero').length
}

export function aiAssign(state: GameState, p: PlayerId): GameState {
  let s = state
  while (!placeBlockReason(s, p)) {
    const heroes = s.players[p].hand.filter((c) => c.type === 'hero')
    if (heroes.length === 0) break
    const card = heroes[(s.round + heroes.length) % heroes.length]
    const onBoard = heroesOnBoard(s, p).length
    const homeJungle: ZoneId = p === 'radiant' ? 'radiantJungle' : 'direJungle'
    let zone: ZoneId
    if (onBoard >= 3 && campNeutral(s, homeJungle) && lineup(s, p, homeJungle).length === 0) {
      zone = homeJungle
    } else if (onBoard >= 4 && campNeutral(s, 'roshan') && lineup(s, p, 'roshan').length === 0 && s.round >= 6) {
      zone = 'roshan'
    } else {
      const counts = LANES.map((l) => ({ lane: l, n: lineup(s, p, l).length, pri: ZONE_PRIORITY[p].indexOf(l) }))
      counts.sort((a, b) => a.n - b.n || a.pri - b.pri)
      zone = counts[0].lane
    }
    s = placeHero(s, p, card.iid, zone)
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
      case 'dagon':
        pick = targets.find((t) => t.kind === 'hero' && t.hp === 1) ?? targets.find((t) => t.kind === 'neutral' && t.hp === 1)
        break
      case 'tango':
      case 'refresher':
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
  return lane ? playItem(s, p, iid, lane) : s
}

export function aiUlts(state: GameState, p: PlayerId): GameState {
  let s = state
  for (const camp of CAMPS) {
    const focus = enemyHeroesIn(s, p, camp) > 0 ? 'enemy' : 'neutral'
    if (s.players[p].campFocus[camp] !== focus) s = setCampFocus(s, p, camp, focus)
  }
  const casters = heroesOnBoard(s, p).sort((a, b) => Number(ultNeedsTarget(b)) - Number(ultNeedsTarget(a)))
  for (const u of casters) {
    if (s.players[p].xp < 1) break
    if (ultBlockReason(s, u.uid)) continue
    const enemiesHere = enemyHeroesIn(s, p, u.zone) + (campNeutral(s, u.zone) ? 1 : 0)
    const hero = getHero(u.cardId!)
    if (ultNeedsTarget(u)) {
      const targets = ultTargets(s, u.uid)
        .map((x) => s.units[x])
        .sort((a, b) => threat(b) - threat(a))
      if (targets[0] && targets[0].kind !== 'creep' && targets[0].kind !== 'siege') s = declareUlt(s, u.uid, targets[0].uid)
    } else if (hero.id === 'zeus') {
      if (heroesOnBoard(s, other(p)).length >= 2) s = declareUlt(s, u.uid)
    } else if (enemiesHere > 0) {
      s = declareUlt(s, u.uid)
    }
  }
  return s
}
