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
  placeHero,
  playItem,
  resolveRound,
  reveal,
  setSettings,
  unplaceHero,
} from './engine'
import type { GameState, LaneId, Settings } from './types'

export const HUMAN = 'radiant' as const
export const AI = 'dire' as const

export type Action =
  | { type: 'new'; settings?: Settings }
  | { type: 'draw'; card: 'hero' | 'item' }
  | { type: 'endDraw' }
  | { type: 'place'; handIid: string; lane: LaneId }
  | { type: 'unplace'; uid: string }
  | { type: 'move'; uid: string; dir: -1 | 1 }
  | { type: 'endAssign' }
  | { type: 'playItem'; handIid: string; target: string }
  | { type: 'endItems' }
  | { type: 'declareUlt'; uid: string; target?: string }
  | { type: 'cancelUlt'; uid: string }
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
    case 'place':
      return placeHero(s, HUMAN, a.handIid, a.lane)
    case 'unplace':
      return unplaceHero(s, a.uid)
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
    case 'resolve':
      return resolveRound(aiUlts(s, AI))
    case 'nextRound':
      return nextRound(s)
    case 'settings':
      return setSettings(s, a.settings)
  }
}

export function useGame() {
  return useReducer(reducer, undefined, () => newGame())
}
