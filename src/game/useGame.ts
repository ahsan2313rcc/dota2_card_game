import { useReducer } from 'react'
import { aiAssign, aiDraw, aiOneResponse, playAiRound, takeRotations, type AiStyle } from './ai'
import {
  buyShield,
  buyback,
  declareUlt,
  discardFromHand,
  discardToHandLimit,
  drawCard,
  endDraw,
  endRotation,
  moveInLineup,
  newGame,
  nextRound,
  passRotation,
  placeCreep,
  passResponse,
  placeHero,
  playItem,
  reveal,
  rotateHero,
  setCampFocus,
  setSettings,
  swapTowerCards,
  toggleMorph,
  unplace,
  type DrawType,
} from './engine'
import { ROTATIONS_PER_ROUND, isLane, type CampId, type GameState, type LaneId, type Settings, type TowerTier, type ZoneId } from './types'

export const HUMAN = 'radiant' as const
export const AI = 'dire' as const

export type Action =
  | { type: 'new'; settings?: Settings }
  | { type: 'draw'; card: DrawType }
  | { type: 'buyback'; heroId: string }
  | { type: 'discard'; handIid: string }
  | { type: 'buyShield'; uid: string }
  | { type: 'swapTowers'; tier: TowerTier; a: LaneId; b: LaneId }
  | { type: 'endDraw' }
  | { type: 'place'; handIid: string; zone: ZoneId }
  | { type: 'unplace'; uid: string }
  | { type: 'move'; uid: string; dir: -1 | 1 }
  | { type: 'endAssign' }
  | { type: 'playItem'; handIid: string; target?: string; lane?: LaneId }
  | { type: 'declareUlt'; uid: string; target?: string }
  | { type: 'pass' }
  | { type: 'campFocus'; camp: CampId; focus: 'neutral' | 'enemy' }
  | { type: 'rotate'; uid: string; zone: ZoneId }
  | { type: 'endRotate' }
  | { type: 'nextRound' }
  | { type: 'settings'; settings: Partial<Settings> }
  | { type: 'morph'; uid: string }

/** Dire plays its interrupt, then the next swing if both sides pass, until Radiant has priority again. */
function respondAi(s: GameState): GameState {
  let guard = 0
  while (s.phase === 'response' && s.priority === AI && guard++ < 80) {
    const next = aiOneResponse(s, AI)
    if (next === s) break
    s = next
  }
  return s
}

function opponentStyle(s: GameState): AiStyle {
  return s.settings.direStyle ?? 'balanced'
}

/** After Radiant is finished, Dire spends whatever rotations it has left. */
function finishRotation(s: GameState): GameState {
  if (s.players[HUMAN].rotationsUsed < ROTATIONS_PER_ROUND) return s
  return discardToHandLimit(endRotation(takeRotations(s, AI, opponentStyle(s))), AI)
}

function reducer(s: GameState, a: Action): GameState {
  switch (a.type) {
    case 'new':
      return newGame(a.settings ?? s.settings)
    case 'draw':
      return drawCard(s, HUMAN, a.card)
    case 'buyback':
      return buyback(s, HUMAN, a.heroId)
    case 'discard':
      return discardFromHand(s, HUMAN, a.handIid)
    case 'buyShield':
      return respondAi(buyShield(s, HUMAN, a.uid))
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
      return respondAi(reveal(aiAssign(s, AI, opponentStyle(s))))
    case 'playItem':
      return respondAi(playItem(s, HUMAN, a.handIid, a.target, a.lane))
    case 'declareUlt':
      return respondAi(declareUlt(s, a.uid, a.target))
    case 'pass':
      return respondAi(passResponse(s, HUMAN))
    case 'campFocus':
      return setCampFocus(s, HUMAN, a.camp, a.focus)
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
    case 'morph':
      return toggleMorph(s, a.uid)
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
