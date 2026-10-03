export type PlayerId = 'radiant' | 'dire'
export type LaneId = 'top' | 'mid' | 'bot'
export type Attribute = 'STR' | 'AGI' | 'INT' | 'UNI'
export type AttackRange = 'Melee' | 'Ranged'

export type UltTarget =
  | 'none'
  | 'enemyHeroInLane'
  | 'enemyUnitInLane'
  | 'enemyHeroAdjacentLane'
  | 'enemyUnitAnyLane'

export interface HeroCard {
  id: string
  name: string
  attribute: Attribute
  range: AttackRange
  passive: { name: string; text: string }
  ult: { name: string; text: string; target: UltTarget }
  maxHp?: number
}

export type ItemTarget = 'allyHero' | 'allyWoundedHero' | 'enemyUnit'

export interface ItemCard {
  id: string
  name: string
  cost: number
  kind: 'Consumable' | 'Equipment'
  text: string
  target: ItemTarget
}

export interface HandCard {
  iid: string
  type: 'hero' | 'item'
  cardId: string
}

export interface RoundStatus {
  stunned: boolean
  silenced: boolean
  disarmed: boolean
  slowed: boolean
  taunt?: string
  bkb: boolean
  bladeMail: boolean
  borrowedTime: boolean
  reincarnation: boolean
  godsStrength: boolean
  focusFire: boolean
  poisoned: boolean
  noHeal: boolean
  blurUsed: boolean
  aphoticUsed: boolean
  frostShieldUsed: boolean
  vanguardUsed: boolean
  attackedStructure: boolean
}

export interface Unit {
  uid: string
  kind: 'hero' | 'creep' | 'siege'
  cardId?: string
  handIid?: string
  owner: PlayerId
  lane: LaneId
  hp: number
  maxHp: number
  dead: boolean
  ultUsed: boolean
  equipment: string[]
  placedRound: number
  fierySoul: boolean
  status: RoundStatus
}

export interface Structures {
  towers: Record<LaneId, { t1: number; t2: number }>
  ancient: number
}

export interface PlayerState {
  id: PlayerId
  gold: number
  xp: number
  hand: HandCard[]
  placedThisRound: number
  structures: Structures
  bonusIncomeLanes: LaneId[]
  killsThisRound: number
}

export interface UltDeclaration {
  uid: string
  owner: PlayerId
  target?: string
}

export type Phase = 'draw' | 'assign' | 'items' | 'ults' | 'report' | 'gameover'

export type LogTone = 'info' | 'radiant' | 'dire' | 'damage' | 'kill' | 'structure' | 'phase'

export interface LogEntry {
  id: number
  round: number
  text: string
  tone: LogTone
}

export interface Settings {
  singleUseUlt: boolean
}

export interface GameState {
  round: number
  phase: Phase
  players: Record<PlayerId, PlayerState>
  units: Record<string, Unit>
  lanes: Record<LaneId, Record<PlayerId, string[]>>
  heroDeck: string[]
  heroDiscard: string[]
  itemDeck: string[]
  itemDiscard: string[]
  creepDeck: Array<'creep' | 'siege'>
  ultDeclarations: UltDeclaration[]
  log: LogEntry[]
  nextId: number
  seed: number
  winner?: PlayerId
  settings: Settings
}

export const LANES: LaneId[] = ['top', 'mid', 'bot']
export const PLAYERS: PlayerId[] = ['radiant', 'dire']

export const HAND_LIMIT = 7
export const BOARD_LIMIT = 5
export const PLACE_PER_ROUND = 3
export const STARTING_HEROES = 5

export const TOWER_HP = { t1: 3, t2: 5 } as const
export const TOWER_DAMAGE = { t1: 1, t2: 2 } as const
export const ANCIENT_HP = 10
