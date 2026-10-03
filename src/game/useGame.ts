import { useReducer } from 'react'
import { aiAssign, aiDraw, aiItems, aiRotate, aiUlts, playAiRound } from './ai'
import {
  buyback,
  cancelUlt,
  declareUlt,
  drawCard,
  endDraw,
  endItems,
  endRotation,
  favoredPlayer,
  moveInLineup,
  newGame,
  nextRound,
  passRotation,
  placeCreep,
  placeHero,
  playItem,
  resolveRound,
  reveal,
  rotateHero,
  setCampFocus,
  setSettings,
  swapTowerCards,
  unplace,
  type DrawType,
} from './engine'
import { isLane, type CampId, type GameState, type LaneId, type Settings, type TowerTier, type ZoneId } from './types'

export const HUMAN = 'radiant' as const
export const AI = 'dire' as const

export type Action =
  | { type: 'new'; settings?: Settings }
  | { type: 'draw'; card: DrawType }
  | { type: 'buyback'; heroId: string }
  | { type: 'swapTowers'; tier: TowerTier; a: LaneId; b: LaneId }
  | { type: 'endDraw' }
  | { type: 'place'; handIid: string; zone: ZoneId }
  | { type: 'unplace'; uid: string }
  | { type: 'move'; uid: string; dir: -1 | 1 }
  | { type: 'endAssign' }
  | { type: 'playItem'; handIid: string; target?: string; lane?: LaneId }
  | { type: 'endItems' }
  | { type: 'declareUlt'; uid: string; target?: string }
  | { type: 'cancelUlt'; uid: string }
  | { type: 'campFocus'; camp: CampId; focus: 'neutral' | 'enemy' }
  | { type: 'resolve' }
  | { type: 'rotate'; uid: string; zone: ZoneId }
  | { type: 'endRotate' }
  | { type: 'nextRound' }
  | { type: 'settings'; settings: Partial<Settings> }

function finishRotation(s: GameState): GameState {
  return endRotation(s.players[AI].rotated ? s : aiRotate(s, AI))
}

function reducer(s: GameState, a: Action): GameState {
  switch (a.type) {
    case 'new':
      return newGame(a.settings ?? s.settings)
    case 'draw':
      return drawCard(s, HUMAN, a.card)
    case 'buyback':
      return buyback(s, HUMAN, a.heroId)
    case 'swapTowers':
      return swapTowerCards(s, HUMAN, a.tier, a.a, a.b)
    case 'endDraw':
      return endDraw(aiDraw(s, AI))
    case 'place': {
      const card = s.players[HUMAN].hand.find((c) => c.iid === a.handIid)
      if (card?.type === 'creep') return isLane(a.zone) ? placeCreep(s, HUMAN, a.handIid, a.zone) : s
      return placeHero(s, HUMAN, a.handIid, a.zone)
    }
    case 'unplace':
      return unplace(s, a.uid)
    case 'move':
      return moveInLineup(s, a.uid, a.dir)
    case 'endAssign':
      return reveal(aiAssign(s, AI))
    case 'playItem':
      return playItem(s, HUMAN, a.handIid, a.target, a.lane)
    case 'endItems':
      return endItems(aiItems(s, AI))
    case 'declareUlt':
      return declareUlt(s, a.uid, a.target)
    case 'cancelUlt':
      return cancelUlt(s, a.uid)
    case 'campFocus':
      return setCampFocus(s, HUMAN, a.camp, a.focus)
    case 'resolve': {
      // When the AI has priority it rotates first, so the human sees its move before answering.
      const r = resolveRound(aiUlts(s, AI))
      return r.phase === 'rotate' && favoredPlayer(r.round) === AI ? aiRotate(r, AI) : r
    }
    case 'rotate': {
      const r = rotateHero(s, HUMAN, a.uid, a.zone)
      return r === s ? s : finishRotation(r)
    }
    case 'endRotate':
      return finishRotation(passRotation(s, HUMAN))
    case 'nextRound':
      return nextRound(s)
    case 'settings':
      return setSettings(s, a.settings)
  }
}

/** Debug helper: `?autoplay=5` lets the AI play both sides for 5 rounds; `&seed=42` pins the shuffle. */
function initialState(): GameState {
  const params = new URLSearchParams(window.location.search)
  const seed = Number(params.get('seed')) || undefined
  let s = newGame(undefined, seed)
  const rounds = Number(params.get('autoplay')) || 0
  for (let i = 0; i < rounds && !s.winner; i++) {
    s = playAiRound(s)
    if (!s.winner) s = nextRound(s)
  }
  return s
}

export function useGame() {
  return useReducer(reducer, undefined, initialState)
}
