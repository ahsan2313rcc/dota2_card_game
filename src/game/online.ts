import {
  buyShield,
  buyback,
  canInterrupt,
  canSpendGold,
  countsTowardHand,
  declareUlt,
  discardFromHand,
  drawCard,
  endDraw,
  endRotation,
  excessHand,
  moveInLineup,
  newGame,
  nextRound,
  other,
  passResponse,
  passRotation,
  placeCreep,
  placeHero,
  playItem,
  reveal,
  rotateHero,
  setCampFocus,
  setSettings,
  swapTowerCards,
  toggleMorph,
  unplace,
  PLAYER_LABEL,
} from './engine'
import { getItem } from './cards'
import {
  PLAYERS,
  ROTATIONS_PER_ROUND,
  ZONES,
  isLane,
  type GameState,
  type PlayerId,
  type Unit,
} from './types'

export type NetAction =
  | { type: 'draw'; card: 'unit' | 'item' }
  | { type: 'buyback'; heroId: string; lane: 'top' | 'mid' | 'bot' }
  | { type: 'discard'; handIid: string }
  | { type: 'buyShield'; uid: string }
  | { type: 'swapTowers'; tier: 't1' | 't2'; a: 'top' | 'mid' | 'bot'; b: 'top' | 'mid' | 'bot' }
  | { type: 'place'; handIid: string; zone: 'top' | 'mid' | 'bot' | 'radiantJungle' | 'direJungle' }
  | { type: 'unplace'; uid: string }
  | { type: 'move'; uid: string; dir: -1 | 1 }
  | { type: 'playItem'; handIid: string; target?: string; lane?: 'top' | 'mid' | 'bot' }
  | { type: 'declareUlt'; uid: string; target?: string }
  | { type: 'pass' }
  | { type: 'campFocus'; camp: 'radiantJungle' | 'direJungle'; focus: 'neutral' | 'enemy' }
  | { type: 'rotate'; uid: string; zone: 'top' | 'mid' | 'bot' | 'radiantJungle' | 'direJungle' }
  | { type: 'morph'; uid: string }
  | { type: 'lock' }
  | { type: 'rematch' }

export interface ReadyMap {
  radiant: boolean
  dire: boolean
}

export interface Room {
  code: string
  state: GameState | null
  names: Partial<Record<PlayerId, string>>
  tokens: Partial<Record<PlayerId, string>>
  ready: ReadyMap
  rematch: ReadyMap
  towerGold: boolean
  started: boolean
  /** When the host opened the table. The lobby pairs the oldest open table first. */
  openedAt: number
}

export interface OpenTable {
  code: string
  host: string
  towerGold: boolean
}

export interface LobbyMessage {
  type: 'lobby'
  rooms: OpenTable[]
  looking: number
}

export interface TableMessage {
  type: 'table'
  code: string
  seat: PlayerId
  token: string
  names: Partial<Record<PlayerId, string>>
  host: boolean
  started: boolean
  towerGold: boolean
  connected: Record<PlayerId, boolean>
  ready: ReadyMap
  rematch: ReadyMap
  state: GameState | null
}

const NET_TYPES = new Set<NetAction['type']>([
  'draw',
  'buyback',
  'discard',
  'buyShield',
  'swapTowers',
  'place',
  'unplace',
  'move',
  'playItem',
  'declareUlt',
  'pass',
  'campFocus',
  'rotate',
  'morph',
  'lock',
  'rematch',
])

export function isNetAction(value: unknown): value is NetAction {
  if (!value || typeof value !== 'object') return false
  const type = (value as { type?: unknown }).type
  return typeof type === 'string' && NET_TYPES.has(type as NetAction['type'])
}

function blankReady(): ReadyMap {
  return { radiant: false, dire: false }
}

export function createRoom(code: string): Room {
  return {
    code,
    state: null,
    names: {},
    tokens: {},
    ready: blankReady(),
    rematch: blankReady(),
    towerGold: true,
    started: false,
    openedAt: Date.now(),
  }
}

/** Tables a new player can sit at: host is online, Dire is empty, the match has not started. Oldest first. */
export function listOpenTables(rooms: Iterable<Room>, hostOnline: (code: string) => boolean): OpenTable[] {
  return [...rooms]
    .filter((room) => !room.started && !room.tokens.dire && !!room.names.radiant && hostOnline(room.code))
    .sort((a, b) => a.openedAt - b.openedAt)
    .map((room) => ({
      code: room.code,
      host: room.names.radiant || 'Radiant',
      towerGold: room.towerGold,
    }))
}

export function seatToken(): string {
  return globalThis.crypto.randomUUID()
}

export function claimSeat(room: Room, seat: PlayerId, name: string, token = seatToken()) {
  room.names[seat] = name || PLAYER_LABEL[seat]
  room.tokens[seat] = token
  return token
}

export function setTowerGold(room: Room, on: boolean) {
  room.towerGold = on
  if (room.state) room.state = setSettings(room.state, { towerGold: on })
}

export function startMatch(room: Room): string | null {
  if (!room.tokens.radiant || !room.tokens.dire) return 'Waiting for the other player.'
  if (room.started && room.state && room.state.phase !== 'gameover') return 'The match has already started.'
  room.started = true
  room.ready = blankReady()
  room.rematch = blankReady()
  room.state = newGame({ towerGold: room.towerGold })
  settle(room)
  return null
}

function clearReady(room: Room) {
  room.ready = blankReady()
}

/** Advance phases that both seats have to agree on, and pass interrupts a seat cannot play. */
export function settle(room: Room) {
  let guard = 0
  while (room.state && guard++ < 80) {
    const s = room.state
    if (s.winner && s.phase !== 'gameover') {
      room.state = { ...s, phase: 'gameover' }
      continue
    }
    if (s.phase === 'response' && !s.winner) {
      if (!canInterrupt(s, s.priority)) {
        const next = passResponse(s, s.priority)
        if (next === s) break
        room.state = next
        continue
      }
      break
    }
    if (s.phase === 'draw' && !s.winner) {
      let changed = false
      for (const p of PLAYERS) {
        if (!room.ready[p] && !canSpendGold(s, p)) {
          room.ready[p] = true
          changed = true
        }
      }
      if (room.ready.radiant && room.ready.dire) {
        room.state = endDraw(s)
        clearReady(room)
        continue
      }
      if (changed) continue
    }
    break
  }
}

function owns(s: GameState, seat: PlayerId, uid: string | undefined) {
  return !!uid && s.units[uid]?.owner === seat
}

/** Apply one player's action. Returns an error message, or null when the room changed or the action was a legal no-op. */
export function applyAction(room: Room, seat: PlayerId, action: NetAction): string | null {
  const s = room.state
  if (!s) return 'The match has not started.'
  if (s.winner && action.type !== 'rematch') return 'The duel is over.'
  if ((s.phase === 'draw' || s.phase === 'assign' || s.phase === 'rotate' || s.phase === 'report') && room.ready[seat] && action.type !== 'lock' && action.type !== 'rematch') {
    return 'Waiting for the other player.'
  }

  let next = s
  switch (action.type) {
    case 'draw':
      if (s.phase !== 'draw') return 'Not the draw step.'
      next = drawCard(s, seat, action.card)
      break
    case 'buyback': {
      if (s.phase !== 'draw' && !(s.phase === 'response' && s.priority === seat)) return 'Not a time to buy back.'
      if (!isLane(action.lane)) return 'Buyback deploys to a lane.'
      next = buyback(s, seat, action.heroId, action.lane)
      break
    }
    case 'discard':
      next = discardFromHand(s, seat, action.handIid)
      break
    case 'buyShield':
      if (s.phase !== 'response' || s.priority !== seat) return 'Wait for priority.'
      next = buyShield(s, seat, action.uid)
      break
    case 'swapTowers':
      next = swapTowerCards(s, seat, action.tier, action.a, action.b)
      break
    case 'place': {
      if (s.phase !== 'assign') return 'Not the assign step.'
      const card = s.players[seat].hand.find((c) => c.iid === action.handIid)
      if (!card) return 'That card is not in your hand.'
      if (card.type === 'creep') {
        if (!isLane(action.zone)) return 'Creeps go to a lane.'
        next = placeCreep(s, seat, action.handIid, action.zone)
      } else if (card.type === 'hero') {
        next = placeHero(s, seat, action.handIid, action.zone)
      } else return 'Only heroes and creeps are placed.'
      break
    }
    case 'unplace':
      if (!owns(s, seat, action.uid)) return 'That unit is not yours.'
      next = unplace(s, action.uid)
      break
    case 'move':
      if (!owns(s, seat, action.uid)) return 'That unit is not yours.'
      next = moveInLineup(s, action.uid, action.dir)
      break
    case 'playItem': {
      const card = s.players[seat].hand.find((c) => c.iid === action.handIid)
      if (!card || card.type !== 'item') return 'That card is not in your hand.'
      if (s.phase === 'assign') {
        if (getItem(card.cardId).timing !== 'map') return 'That card is played during combat.'
      } else if (s.phase !== 'response' || s.priority !== seat) return 'Wait for priority.'
      next = playItem(s, seat, action.handIid, action.target, action.lane)
      break
    }
    case 'declareUlt':
      if (s.phase !== 'response' || s.priority !== seat) return 'Wait for priority.'
      if (!owns(s, seat, action.uid)) return 'That hero is not yours.'
      next = declareUlt(s, action.uid, action.target)
      break
    case 'pass':
      if (s.phase !== 'response' || s.priority !== seat) return 'Wait for priority.'
      next = passResponse(s, seat)
      break
    case 'campFocus':
      next = setCampFocus(s, seat, action.camp, action.focus)
      break
    case 'rotate':
      if (s.phase !== 'rotate') return 'Not the rotation step.'
      if (!owns(s, seat, action.uid)) return 'That hero is not yours.'
      next = rotateHero(s, seat, action.uid, action.zone)
      break
    case 'morph':
      if (!owns(s, seat, action.uid)) return 'That hero is not yours.'
      next = toggleMorph(s, action.uid)
      break
    case 'lock':
      return lockSeat(room, seat)
    case 'rematch':
      if (s.phase !== 'gameover') return 'The duel is still going.'
      room.rematch[seat] = true
      if (room.rematch.radiant && room.rematch.dire) return startMatch(room)
      return null
    default:
      return 'Unknown action.'
  }

  room.state = next
  settle(room)
  return null
}

function lockSeat(room: Room, seat: PlayerId): string | null {
  const s = room.state
  if (!s) return 'The match has not started.'
  if (s.phase === 'draw' || s.phase === 'assign') {
    room.ready[seat] = true
  } else if (s.phase === 'rotate') {
    if (s.players[seat].rotationsUsed < ROTATIONS_PER_ROUND) room.state = passRotation(s, seat)
    room.ready[seat] = true
  } else if (s.phase === 'report') {
    if (excessHand(s.players[seat]) > 0) return 'Discard down to 7 first.'
    room.ready[seat] = true
  } else return 'Nothing to lock in right now.'

  if (room.ready.radiant && room.ready.dire && room.state) {
    const phase = room.state.phase
    if (phase === 'draw') room.state = endDraw(room.state)
    else if (phase === 'assign') room.state = reveal(room.state)
    else if (phase === 'rotate') room.state = endRotation(room.state)
    else if (phase === 'report') room.state = nextRound(room.state)
    clearReady(room)
  }
  settle(room)
  return null
}

function concealed(u: Unit, viewer: PlayerId, s: GameState) {
  if (u.owner === viewer || u.owner === 'neutral' || u.dead) return false
  if ((s.phase === 'assign' || s.phase === 'draw') && u.placedRound === s.round) return true
  if (u.status.revealed) return false
  return !!(u.status.invisible || u.status.banished)
}

/** A copy of the match that does not reveal the other seat's hand, decks, tower cards, or hidden units. */
export function viewFor(state: GameState, viewer: PlayerId): GameState {
  const v = structuredClone(state)
  const foe = other(viewer)
  v.players[foe].hand = v.players[foe].hand.map((c, i) =>
    countsTowardHand(c)
      ? { iid: `hidden-${i}`, type: 'creep' as const, cardId: 'creep' }
      : { iid: `hidden-${i}`, type: 'item' as const, cardId: 'rune_gold' },
  )
  v.players[foe].towerCards = {
    top: { t1: 'glyph', t2: 'glyph' },
    mid: { t1: 'glyph', t2: 'glyph' },
    bot: { t1: 'glyph', t2: 'glyph' },
  }
  v.players[foe].smoke = []
  v.players[foe].ward = []
  v.unitDeck = v.unitDeck.map(() => ({ cardId: 'hidden', buybackUsed: false }))
  v.unitDiscard = v.unitDiscard.map(() => ({ cardId: 'hidden', buybackUsed: false }))
  v.itemDeck = v.itemDeck.map(() => 'hidden')
  v.itemDiscard = v.itemDiscard.map(() => 'hidden')
  v.runeDeck = v.runeDeck.map(() => 'hidden')
  v.runeDiscard = v.runeDiscard.map(() => 'hidden')
  v.neutralDeck = v.neutralDeck.map(() => 'hidden')
  v.neutralDiscard = v.neutralDiscard.map(() => 'hidden')

  const foeLabel = PLAYER_LABEL[foe]
  v.log = v.log.map((entry) => ({
    ...entry,
    text: redactLine(entry.text, foeLabel),
  }))

  for (const u of Object.values(v.units)) {
    if (!concealed(u, viewer, v)) continue
    delete v.units[u.uid]
    for (const zone of ZONES) {
      v.zones[zone].radiant = v.zones[zone].radiant.filter((id) => id !== u.uid)
      v.zones[zone].dire = v.zones[zone].dire.filter((id) => id !== u.uid)
    }
  }
  return v
}

function redactLine(text: string, foe: string) {
  if (text.startsWith(`${foe} spends 1 Gold and draws `) && text.endsWith(' from the shared deck.')) {
    return `${foe} spends 1 Gold and draws a card from the shared deck.`
  }
  if (text.startsWith(`${foe} takes the tower's hidden card,`)) return `${foe} takes the tower's hidden card.`
  return text
}
