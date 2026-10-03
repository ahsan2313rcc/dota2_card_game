import { useReducer } from 'react'
import { aiAssign, aiDraw, aiItems, aiUlts } from './ai'
import {
  cancelUlt,
  declareUlt,
  drawCard,
  endDraw,
  endItems,
  moveInLineup,
  newGame,
  nextRound,
  placeCreep,
  placeHero,
  playItem,
  resolveRound,
  reveal,
  setCampFocus,
  setSettings,
  unplace,
  type DrawType,
} from './engine'
import { isLane, type CampId, type GameState, type Settings, type ZoneId } from './types'

export const HUMAN = 'radiant' as const
export const AI = 'dire' as const

export type Action =
  | { type: 'new'; settings?: Settings }
  | { type: 'draw'; card: DrawType }
  | { type: 'endDraw' }
  | { type: 'place'; handIid: string; zone: ZoneId }
  | { type: 'unplace'; uid: string }
  | { type: 'move'; uid: string; dir: -1 | 1 }
  | { type: 'endAssign' }
  | { type: 'playItem'; handIid: string; target?: string }
  | { type: 'endItems' }
  | { type: 'declareUlt'; uid: string; target?: string }
  | { type: 'cancelUlt'; uid: string }
  | { type: 'campFocus'; camp: CampId; focus: 'neutral' | 'enemy' }
  | { type: 'resolve' }
  | { type: 'nextRound' }
  | { type: 'settings'; settings: Partial<Settings> }

function reducer(s: GameState, a: Action): GameState {
  switch (a.type) {
    case 'new':
      return newGame(a.settings ?? s.settings)
    case 'draw':
      return drawCard(s, HUMAN, a.card)
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
      return playItem(s, HUMAN, a.handIid, a.target)
    case 'endItems':
      return endItems(aiItems(s, AI))
    case 'declareUlt':
      return declareUlt(s, a.uid, a.target)
    case 'cancelUlt':
      return cancelUlt(s, a.uid)
    case 'campFocus':
      return setCampFocus(s, HUMAN, a.camp, a.focus)
    case 'resolve':
      return resolveRound(aiUlts(s, AI))
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
    s = endDraw(aiDraw(aiDraw(s, HUMAN), AI))
    s = reveal(aiAssign(aiAssign(s, HUMAN), AI))
    s = endItems(aiItems(aiItems(s, HUMAN), AI))
    s = resolveRound(aiUlts(aiUlts(s, HUMAN), AI))
    if (!s.winner && i < rounds - 1) s = nextRound(s)
  }
  if (rounds > 0 && s.phase === 'report') s = nextRound(s)
  return s
}

export function useGame() {
  return useReducer(reducer, undefined, initialState)
}
