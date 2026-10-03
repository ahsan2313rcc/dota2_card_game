import { getHero, getItem } from './cards'
import {
  LANE_PRIORITY,
  declareUlt,
  drawBlockReason,
  drawCard,
  heroesOnBoard,
  itemBlockReason,
  itemTargets,
  lineup,
  other,
  placeBlockReason,
  placeHero,
  playItem,
  ultBlockReason,
  ultNeedsTarget,
  ultTargets,
} from './engine'
import { LANES, type GameState, type LaneId, type PlayerId, type Unit } from './types'

const FRONTLINERS = new Set(['axe', 'tidehunter', 'pudge', 'abaddon', 'wraith_king', 'sven'])

export function aiDraw(state: GameState, p: PlayerId): GameState {
  let s = state
  const heroesInHand = s.players[p].hand.filter((c) => c.type === 'hero').length
  if (heroesInHand < 2 && !drawBlockReason(s, p, 'hero')) s = drawCard(s, p, 'hero')
  if (s.players[p].gold >= 2 && !drawBlockReason(s, p, 'item')) s = drawCard(s, p, 'item')
  return s
}

export function aiAssign(state: GameState, p: PlayerId): GameState {
  let s = state
  while (!placeBlockReason(s, p)) {
    const heroes = s.players[p].hand.filter((c) => c.type === 'hero')
    if (heroes.length === 0) break
    const card = heroes[(s.round + heroes.length) % heroes.length]
    const counts = LANES.map((l) => ({
      lane: l as LaneId,
      n: lineup(s, p, l).length,
      pri: LANE_PRIORITY[p].indexOf(l),
    }))
    counts.sort((a, b) => a.n - b.n || a.pri - b.pri)
    s = placeHero(s, p, card.iid, counts[0].lane)
  }
  if (s === state) s = structuredClone(state)
  // Tanky heroes go to Position 1.
  for (const lane of LANES) {
    const arr = s.lanes[lane][p]
    arr.sort((a, b) => Number(FRONTLINERS.has(s.units[b].cardId ?? '')) - Number(FRONTLINERS.has(s.units[a].cardId ?? '')))
  }
  return s
}

function heroValue(u: Unit) {
  return (u.hp < u.maxHp ? 2 : 0) + (u.kind === 'hero' ? 5 : 0)
}

export function aiItems(state: GameState, p: PlayerId): GameState {
  let s = state
  for (const card of [...s.players[p].hand]) {
    if (card.type !== 'item' || itemBlockReason(s, p, card)) continue
    const item = getItem(card.cardId)
    const targets = itemTargets(s, p, card.cardId).map((uid) => s.units[uid])
    let pick: Unit | undefined
    if (item.id === 'dagon') pick = targets.find((t) => t.kind === 'hero' && t.hp === 1)
    else if (item.id === 'tango' || item.id === 'refresher') pick = targets[0]
    else if (item.kind === 'Equipment') pick = targets.sort((a, b) => heroValue(b) - heroValue(a))[0]
    else if (s.players[p].gold - item.cost >= 1) {
      pick = targets.find((t) => lineup(s, t.owner, t.lane)[0] === t.uid && lineup(s, other(p), t.lane).length > 0)
    }
    if (pick) s = playItem(s, p, card.iid, pick.uid)
  }
  return s
}

export function aiUlts(state: GameState, p: PlayerId): GameState {
  let s = state
  const casters = heroesOnBoard(s, p).sort(
    (a, b) => Number(ultNeedsTarget(b)) - Number(ultNeedsTarget(a)),
  )
  for (const u of casters) {
    if (s.players[p].xp < 1) break
    if (ultBlockReason(s, u.uid)) continue
    const enemyHeroesHere = lineup(s, other(p), u.lane).filter((x) => s.units[x].kind === 'hero')
    const hero = getHero(u.cardId!)
    if (ultNeedsTarget(u)) {
      const targets = ultTargets(s, u.uid)
        .map((x) => s.units[x])
        .sort((a, b) => heroValue(b) - heroValue(a))
      if (targets[0] && targets[0].kind === 'hero') s = declareUlt(s, u.uid, targets[0].uid)
    } else if (hero.id === 'zeus') {
      if (heroesOnBoard(s, other(p)).length >= 2) s = declareUlt(s, u.uid)
    } else if (enemyHeroesHere.length > 0) {
      s = declareUlt(s, u.uid)
    }
  }
  return s
}
