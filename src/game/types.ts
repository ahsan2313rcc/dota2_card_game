export type PlayerId = 'radiant' | 'dire'
export type Owner = PlayerId | 'neutral'
export type LaneId = 'top' | 'mid' | 'bot'
export type CampId = 'radiantJungle' | 'direJungle'
export type ZoneId = LaneId | CampId
export type Attribute = 'STR' | 'AGI' | 'INT' | 'UNI'
export type AttackRange = 'Melee' | 'Ranged'

export type UltTarget =
  | 'none'
  | 'enemyHeroInLane'
  | 'enemyUnitInLane'
  | 'enemyHeroAdjacentLane'
  | 'enemyUnitAnyLane'
  | 'enemyHeroAny'
  | 'allyHero'
  | 'allyHeroAny'
  | 'heroInLane'
  | 'enemyCreep'
  | 'lane'
  | 'zone'
  | 'adjacentZone'

/** Data-driven kit. Tags are passive hooks. `ult` lines run when an active ability resolves. */
export interface HeroScript {
  tags: string[]
  ult: string[]
  /** Passive heroes are always on. Active heroes pay the printed XP cost. */
  kind?: 'passive' | 'active'
  /** Printed XP cost. Passives are 0. */
  xpCost?: number
}

/** Shared passive rules. The starter heroes use bespoke ids; the rest of the roster picks one of these. */
export type PassiveKind =
  | 'thorns'
  | 'cleave'
  | 'evade'
  | 'meleeImmune'
  | 'spellImmune'
  | 'block'
  | 'creepBlock'
  | 'gold'
  | 'poison'
  | 'silenceOnHit'
  | 'snipe'

/** Shared ultimate rules for heroes outside the hand-scripted starter set. */
export type UltEffect =
  | 'lane1'
  | 'stunLane'
  | 'slowLane'
  | 'dmg1'
  | 'dmg2'
  | 'dmg2h'
  | 'stun'
  | 'stunDmg'
  | 'silence'
  | 'disarm'
  | 'slow'
  | 'root'
  | 'break'
  | 'blind'
  | 'mute'
  | 'curse'
  | 'shield'
  | 'evade'
  | 'haste'
  | 'bonus'
  | 'accuracy'
  | 'pierce'
  | 'reincarnation'
  | 'focus'
  | 'immune'
  | 'invisible'
  | 'heal'
  | 'global1'
  | 'taunt'
  | 'decoy'

export interface HeroCard {
  id: string
  name: string
  attribute: Attribute
  range: AttackRange
  passive: { name: string; text: string }
  ult: { name: string; text: string; target: UltTarget; effect?: UltEffect }
  /** When set, this hero uses a shared passive rule in addition to its name. */
  passiveKind?: PassiveKind
  maxHp?: number
  /** Present on every hero in the current roster. Legacy id-switches are skipped when this is set. */
  script?: HeroScript
  /** Summoned Spirit Bear is not part of the 127-card hero deck. */
  summon?: boolean
}

/** `lane` picks a lane only; `allyHeroToLane` picks an allied hero, then a lane. */
export type ItemTarget = 'allyHero' | 'allyWoundedHero' | 'enemyUnit' | 'enemyHero' | 'lane' | 'allyHeroToLane' | 'none'

export interface ItemCard {
  id: string
  name: string
  /** Runes drop from neutral camps. Runes and tower cards do not count toward the hand limit. */
  kind: 'Shop' | 'Rune' | 'Tower' | 'Special'
  text: string
  target: ItemTarget
  /** Gold spent when the card is played. Runes and tower cards stay free. */
  cost?: number
  /** How many copies go into the shared item deck. */
  copies?: number
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
  /** This hero has already been bought back once. Its next death returns it to the shared deck. */
  buybackUsed?: boolean
}

/** A card in the shared hero-and-creep deck. Both players draw from this one pile. */
export interface UnitDeckCard {
  cardId: string
  buybackUsed: boolean
}

/** One shared pile for every slain hero. The most recent entry is last. Buyback reads the last 10. */
export interface HeroDiscard {
  cardId: string
  owner: PlayerId
  buybackUsed: boolean
  /** Necrophos: this death cannot be bought back. The flag is dropped when the pile is shuffled into the deck. */
  buybackBlocked?: boolean
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
  /** 1 while a Shield is up. Shields do not stack. */
  shield: number
  /** Charges: each dodges one incoming basic attack */
  evade: number
  accuracy: boolean
  pierce: boolean
  bonusDamage: number
  /** Untargetable by enemies (attacks, towers, Ultimates and items) */
  invisible: boolean
  /** Attacks before everyone else in Phase 2; overrides Slow */
  haste: boolean
  /** Blocks attack damage and takes +1 magical damage */
  ethereal: boolean
  /** Cannot cast, attack, or move. Passives still run. */
  feared: boolean
  /** Turned into a 1 HP decoy with no attack */
  hexed: boolean
  /** Attack damage −1 */
  enfeeble: boolean
  /** Invisible and Banished no longer hide this unit */
  revealed: boolean
  /** Cannot be slain this round */
  cannotDie: boolean
  /** Incoming damage is halved, minimum 1 when any gets through */
  halfDamage: boolean
  /** Healing restores twice */
  doubleHeal: boolean
  /** Heal 1 at the end of the round */
  healEnd: boolean
  /** This unit took damage that got through during the round. */
  tookDamage: boolean
  /** Evade every physical damage instance this round. */
  evadeAll: boolean
  /** Basic attacks apply Slow and Curse */
  skadi: boolean
  /** Basic attacks instantly kill enemy heroes */
  rapier: boolean
  /** Takes +1 physical damage from attacks */
  bloodthorn: boolean
  /** Extra magical damage dealt on a basic attack */
  magicOnHit: number
  /** Refresher: the Ultimate resolves a second time */
  echoUlt: boolean
  /** Bloodseeker: moving deals 2 magical damage to this unit */
  rupture: boolean
  /** Attacks as Ranged for the rest of the round */
  rangedAttack: boolean
  /** Basic attacks heal the attacker */
  lifesteal: boolean
  /** Allied heroes in this zone heal when they basic attack */
  lifestealAura: boolean
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

/** `illusion` is the Illusion rune's 1-HP decoy: it never attacks and vanishes at Cleanup. */
export type UnitKind = 'hero' | 'creep' | 'siege' | 'neutral' | 'roshan' | 'tormentor' | 'illusion'

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
  /** True once this hero has cast at least once during this deployment. */
  ultUsed: boolean
  /** Successful ability casts during this deployment. The printed cost does not change. */
  ultCasts: number
  /** Target of this hero's last ability this turn. A Refresher echoes it if the second cast is never chosen. */
  lastCastTarget?: string
  /** Legion Commander duel wins. Added to attack damage for the rest of the game. */
  permanentAtk: number
  /** A single-use passive has already fired this deployment. */
  passiveSpent?: boolean
  /** Necrophos: this hero cannot be bought back. */
  buybackBlocked?: boolean
  /** Morphling's chosen attribute. */
  morph?: 'STR' | 'AGI'
  /** Arc Warden's copy is not a deck hero and does not go to the discard. */
  copy?: boolean
  /** Techies: the allied hero this mine is watching. */
  link?: string
  placedRound: number
  fierySoul: boolean
  /** Set once this hero has been bought back. A later death returns the card to the shared deck. */
  buybackUsed?: boolean
  /** A Shield from an Ultimate, an item, a rune, or XP. A passive Shield leaves this unset and ends at Cleanup. */
  persistentShield?: boolean
  /** Doom: these debuffs are reapplied after Cleanup for the rest of the game. */
  foreverMute?: boolean
  foreverSilence?: boolean
  foreverCurse?: boolean
  /** Refresher Shard: this deployment's ability costs 0 XP. */
  costZero?: boolean
  /** Arcane rune: subtract this much XP from the printed cost, to a minimum of 0. */
  arcaneDiscount?: number
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
  /** Face-down card under each tower, claimed by this player when that tower falls */
  towerCards: Record<LaneId, Record<TowerTier, string>>
  /** Glyph played this round: towers take no damage */
  glyph: boolean
  /** Arcane rune: the next Ultimate declared costs 0 XP */
  arcane: boolean
  /** How many heroes this side has rotated this round. Passing spends the rest. */
  rotationsUsed: number
  /** Heroes that already rotated this round. Each hero moves at most once. */
  rotatedUids: string[]
  /** Ward: enemy heroes here are revealed at the next Reveal. */
  ward: LaneId[]
  /** Smoke: allied heroes placed here stay hidden at the next Reveal. */
  smoke: LaneId[]
}

export type TowerTier = 't1' | 't2'

export interface UltDeclaration {
  uid: string
  owner: PlayerId
  target?: string
  /** Paid with the Arcane rune instead of XP */
  free?: boolean
  /** Refresher: a second declaration, already paid for by the orb. */
  echo?: boolean
  /** XP spent on this declaration. Refunded in full if the cast fizzles or is cancelled. */
  cost: number
}

/** Roshan or a Tormentor slain this round; the reward is settled after combat. */
export interface BossKill {
  camp: CampId
  kind: 'roshan' | 'tormentor'
  killer?: PlayerId
  present: PlayerId[]
}

export type Phase = 'draw' | 'assign' | 'response' | 'rotate' | 'report' | 'gameover'

/** Which side plays the first interrupt. Odd rounds Radiant, even rounds Dire. */
export function firstPlayer(round: number): PlayerId {
  return round % 2 === 1 ? 'radiant' : 'dire'
}

export type LogTone = 'info' | 'radiant' | 'dire' | 'neutral' | 'damage' | 'kill' | 'structure' | 'phase'

export interface LogEntry {
  id: number
  round: number
  text: string
  tone: LogTone
}

export interface ComebackRules {
  buyback: boolean
  towerCards: boolean
  fountain: boolean
}

export interface Settings {
  /** Not exposed in the UI; lets simulations compare rule sets. Missing means all on. */
  rules?: ComebackRules
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
  /** One hero-and-creep deck for both players. `'creep'` and `'siege'` card ids are creeps. */
  unitDeck: UnitDeckCard[]
  unitDiscard: UnitDeckCard[]
  /** Slain heroes from both sides, oldest first. Buyback may take any of the last 10. */
  heroDiscard: HeroDiscard[]
  itemDeck: string[]
  itemDiscard: string[]
  runeDeck: string[]
  runeDiscard: string[]
  bossKills: BossKill[]
  neutralDeck: string[]
  neutralDiscard: string[]
  ultDeclarations: UltDeclaration[]
  /** Who may play the next item, rune, reward, or ability. */
  priority: PlayerId
  /** Passes in a row. Two closes the window and resolves the next swing. */
  passes: number
  /** before the first swing, between swings, or after the attack step. */
  combat: 'before' | 'attacks' | 'towers'
  /** Units that have already taken their swing this round. */
  attacked: string[]
  /** Towers damaged during the current resolution, keyed `${defender}:${lane}:${tier}` */
  towersHit: string[]
  /** Lanes whose tower already shot this round, keyed `${defender}:${lane}`. */
  towersFired: string[]
  log: LogEntry[]
  nextId: number
  seed: number
  winner?: PlayerId
  settings: Settings
  /** Dawnbreaker / Night Stalker / Luna can force the clock for this round. */
  cycle?: 'day' | 'night'
  /** Zones where an Ultimate has already resolved this round. */
  resolvedUlts: ZoneId[]
  /** Jakiro: enemy towers in these lanes do not fire. `${defender}:${lane}` */
  silencedTowers: string[]
}

export const LANES: LaneId[] = ['top', 'mid', 'bot']
export const CAMPS: CampId[] = ['radiantJungle', 'direJungle']
export const ZONES: ZoneId[] = [...LANES, ...CAMPS]
export const PLAYERS: PlayerId[] = ['radiant', 'dire']

/** Counting cards must be back to this by the end of the turn. Runes, tower cards and boss rewards never count. */
export const HAND_LIMIT = 7
/** Counting cards you may hold while drawing. The end of the turn still discards down to HAND_LIMIT. */
export const DRAW_CAP = 10

/** XP spent, as an interrupt, to put one Shield on an allied hero. It lasts until it blocks a hit. */
export const SHIELD_XP_COST = 3
/** Gold the attacker is paid when a tower falls. The defender still takes the hidden card. */
export const TOWER_GOLD = { t1: 3, t2: 5 } as const
export const BOARD_LIMIT = 5
export const PLACE_PER_ROUND = 3
/** Heroes each side may move during Rotation. */
export const ROTATIONS_PER_ROUND = 2
export const STARTING_HEROES = 5

export const TOWER_HP = { t1: 3, t2: 5 } as const
/** Tier 2 deals 1 to each enemy in the lane, unless a creep is there: then only the first creep is hit. */
export const TOWER_DAMAGE = { t1: 1, t2: 1 } as const
export const ANCIENT_HP = 10
export const BUYBACK_COST = { behind: 4, even: 4, ahead: 5 } as const
/** Buyback can reach only this many most recent heroes in the shared discard. */
export const BUYBACK_WINDOW = 10
export const ROSHAN_HP = 3
/** If Roshan is flipped before this round, he is shuffled back and another camp is drawn. */
export const ROSHAN_EARLIEST_ROUND = 4
export const TORMENTOR_HP = 2

export function isLane(z: ZoneId): z is LaneId {
  return z === 'top' || z === 'mid' || z === 'bot'
}
