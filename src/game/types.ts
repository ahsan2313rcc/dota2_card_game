export type PlayerId = 'radiant' | 'dire'
export type Owner = PlayerId | 'neutral'
export type LaneId = 'top' | 'mid' | 'bot'
export type CampId = 'radiantJungle' | 'direJungle' | 'roshan'
export type ZoneId = LaneId | CampId
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

export type ItemTarget = 'allyHero' | 'allyWoundedHero' | 'enemyUnit' | 'enemyHero' | 'none'

export interface ItemCard {
  id: string
  name: string
  kind: 'Shop' | 'Neutral' | 'Special'
  text: string
  target: ItemTarget
}

export interface NeutralCard {
  id: string
  name: string
  attribute: Attribute
  hp: number
  text: string
}

export type CreepKind = 'creep' | 'siege'

export interface HandCard {
  iid: string
  type: 'hero' | 'item' | 'creep'
  cardId: string
}

/** Everything here lasts until Cleanup. */
export interface RoundStatus {
  stunned: boolean
  silenced: boolean
  broken: boolean
  disarmed: boolean
  slowed: boolean
  blinded: boolean
  rooted: boolean
  banished: boolean
  immune: boolean
  invulnerable: boolean
  muted: boolean
  cursed: boolean
  /** Charges: each blocks one instance of attack damage */
  shield: number
  /** Charges: each dodges one incoming basic attack */
  evade: number
  accuracy: boolean
  pierce: boolean
  bonusDamage: number
  thorns: boolean
  bladeMail: boolean
  aegis: boolean
  taunt?: string
  borrowedTime: boolean
  reincarnation: boolean
  focusFire: boolean
  poisonedBy?: PlayerId
  blurUsed: boolean
  aphoticUsed: boolean
  frostShieldUsed: boolean
}

export type UnitKind = 'hero' | 'creep' | 'siege' | 'neutral' | 'roshan'

export interface Unit {
  uid: string
  kind: UnitKind
  cardId?: string
  handIid?: string
  owner: Owner
  zone: ZoneId
  hp: number
  maxHp: number
  dead: boolean
  ultUsed: boolean
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
  /** What this player's units target in a camp they hold */
  campFocus: Record<CampId, 'neutral' | 'enemy'>
}

export interface UltDeclaration {
  uid: string
  owner: PlayerId
  target?: string
}

export type Phase = 'draw' | 'assign' | 'items' | 'ults' | 'report' | 'gameover'

export type LogTone = 'info' | 'radiant' | 'dire' | 'neutral' | 'damage' | 'kill' | 'structure' | 'phase'

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
  /** Player lineups per zone, Position 1 first */
  zones: Record<ZoneId, Record<PlayerId, string[]>>
  /** The neutral occupying each camp, if any */
  camps: Record<CampId, string | null>
  roshanRespawnRound: number
  heroDeck: string[]
  heroDiscard: string[]
  itemDeck: string[]
  itemDiscard: string[]
  creepDeck: CreepKind[]
  creepDiscard: CreepKind[]
  neutralDeck: string[]
  neutralDiscard: string[]
  ultDeclarations: UltDeclaration[]
  /** Towers damaged during the current resolution, keyed `${defender}:${lane}:${tier}` */
  towersHit: string[]
  log: LogEntry[]
  nextId: number
  seed: number
  winner?: PlayerId
  settings: Settings
}

export const LANES: LaneId[] = ['top', 'mid', 'bot']
export const CAMPS: CampId[] = ['radiantJungle', 'direJungle', 'roshan']
export const ZONES: ZoneId[] = [...LANES, ...CAMPS]
export const PLAYERS: PlayerId[] = ['radiant', 'dire']

export const HAND_LIMIT = 7
export const BOARD_LIMIT = 5
export const PLACE_PER_ROUND = 3
export const STARTING_HEROES = 5

export const TOWER_HP = { t1: 3, t2: 5 } as const
export const TOWER_DAMAGE = { t1: 1, t2: 2 } as const
export const ANCIENT_HP = 10
export const ROSHAN_HP = 3
export const ROSHAN_RESPAWN = 3

export function isLane(z: ZoneId): z is LaneId {
  return z === 'top' || z === 'mid' || z === 'bot'
}
