import {
  ATTACK_ORDER,
  BOSS_REWARD,
  HEROES,
  ITEMS,
  ITEM_DECK_COPIES,
  NEUTRALS,
  NEUTRAL_COPIES,
  REGULAR_CREEPS,
  ROSHAN,
  SIEGE_CREEPS,
  TORMENTOR,
  TORMENTOR_COPIES,
  TOWER_CARD_IDS,
  getHero,
  getItem,
  getNeutral,
} from './cards'
import {
  attackExtra,
  combatAuras,
  endStep,
  endStepDamage,
  enemyEntered,
  hasTag,
  isZoneId,
  lethalSave,
  noteHeal,
  onDamaged,
  onDeath,
  onEnter,
  onHit,
  onItem,
  opening,
  passiveBlock,
  preDamage,
  runUlt,
  scripted,
  targetFilter,
  towerBonus,
  type KitApi,
} from './kit'
import {
  ANCIENT_HP,
  BOARD_LIMIT,
  BUYBACK_COST,
  BUYBACK_WINDOW,
  CAMPS,
  DRAW_CAP,
  HAND_LIMIT,
  TOWER_GOLD,
  LANES,
  PLACE_PER_ROUND,
  ROTATIONS_PER_ROUND,
  PLAYERS,
  ROSHAN_EARLIEST_ROUND,
  firstPlayer,
  ROSHAN_HP,
  SHIELD_XP_COST,
  STARTING_HEROES,
  TORMENTOR_HP,
  TOWER_DAMAGE,
  TOWER_HP,
  ZONES,
  isLane,
  type Attribute,
  type CampId,
  type CreepKind,
  type GameState,
  type HandCard,
  type LaneId,
  type LogTone,
  type Owner,
  type PlayerId,
  type PlayerState,
  type RoundStatus,
  type Settings,
  type TowerTier,
  type UnitDeckCard,
  type HeroCard,
  type UltDeclaration,
  type UltEffect,
  type ComebackRules,
  type Unit,
  type ZoneId,
} from './types'

// ---------- basics ----------

/** Tiebreaker order: Safe > Mid > Off > own jungle > enemy jungle */
export const ZONE_PRIORITY: Record<PlayerId, ZoneId[]> = {
  radiant: ['bot', 'mid', 'top', 'radiantJungle', 'direJungle'],
  dire: ['top', 'mid', 'bot', 'direJungle', 'radiantJungle'],
}

export const ZONE_LABEL: Record<ZoneId, string> = {
  top: 'Top',
  mid: 'Mid',
  bot: 'Bottom',
  radiantJungle: 'Radiant Jungle',
  direJungle: 'Dire Jungle',
}
export const LANE_LABEL = ZONE_LABEL
export const PLAYER_LABEL: Record<Owner, string> = { radiant: 'Radiant', dire: 'Dire', neutral: 'Neutral' }

/** The map is a chain: Top – Dire Jungle – Mid – Radiant Jungle – Bottom. */
export const ADJACENT: Record<ZoneId, ZoneId[]> = {
  top: ['direJungle'],
  direJungle: ['top', 'mid'],
  mid: ['direJungle', 'radiantJungle'],
  radiantJungle: ['mid', 'bot'],
  bot: ['radiantJungle'],
}

/** Defenders of a lane with no towers left can walk straight along the base: Top – Mid – Bottom. */
const BASE_ADJACENT: Record<LaneId, LaneId[]> = { top: ['mid'], mid: ['top', 'bot'], bot: ['mid'] }

export function jungleOwner(camp: CampId): PlayerId {
  return camp === 'radiantJungle' ? 'radiant' : 'dire'
}

export function homeJungle(p: PlayerId): CampId {
  return p === 'radiant' ? 'radiantJungle' : 'direJungle'
}

export function enemyJungle(p: PlayerId): CampId {
  return p === 'radiant' ? 'direJungle' : 'radiantJungle'
}

/** Lanes and your own jungle. The enemy jungle is entered by rotation, not by assigning from hand. */
export function assignableZones(p: PlayerId): ZoneId[] {
  const blocked = enemyJungle(p)
  return ZONES.filter((z) => z !== blocked)
}

export function laneRole(player: PlayerId, zone: ZoneId): string {
  if (!isLane(zone)) return zone.startsWith(player) ? 'Home jungle' : 'Enemy jungle'
  const idx = ZONE_PRIORITY[player].indexOf(zone)
  return idx === 0 ? 'Safe' : idx === 1 ? 'Mid' : 'Off'
}

export function other(p: PlayerId): PlayerId {
  return p === 'radiant' ? 'dire' : 'radiant'
}

export function isDay(round: number, cycle?: 'day' | 'night') {
  if (cycle === 'day') return true
  if (cycle === 'night') return false
  return round % 2 === 1
}

export function favoredPlayer(round: number, cycle?: 'day' | 'night'): PlayerId {
  return isDay(round, cycle) ? 'radiant' : 'dire'
}

function rand(s: GameState): number {
  // mulberry32, seed stored in state so reducers stay deterministic
  let t = (s.seed = (s.seed + 0x6d2b79f5) | 0)
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

function shuffle<T>(s: GameState, arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand(s) * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function pickRandom<T>(s: GameState, arr: T[], n: number): T[] {
  return shuffle(s, arr).slice(0, n)
}

function newId(s: GameState, prefix: string) {
  return `${prefix}${s.nextId++}`
}

function log(s: GameState, text: string, tone: LogTone = 'info') {
  s.log.push({ id: s.nextId++, round: s.round, text, tone })
}

function freshStatus(): RoundStatus {
  return {
    stunned: false,
    silenced: false,
    broken: false,
    disarmed: false,
    slowed: false,
    blinded: false,
    rooted: false,
    banished: false,
    immune: false,
    invulnerable: false,
    muted: false,
    cursed: false,
    shield: 0,
    evade: 0,
    accuracy: false,
    pierce: false,
    bonusDamage: 0,
    invisible: false,
    haste: false,
    ethereal: false,
    feared: false,
    hexed: false,
    enfeeble: false,
    revealed: false,
    cannotDie: false,
    halfDamage: false,
    doubleHeal: false,
    healEnd: false,
    tookDamage: false,
    evadeAll: false,
    skadi: false,
    rapier: false,
    bloodthorn: false,
    magicOnHit: 0,
    echoUlt: false,
    rupture: false,
    rangedAttack: false,
    lifesteal: false,
    lifestealAura: false,
    bladeMail: false,
    aegis: false,
    borrowedTime: false,
    reincarnation: false,
    focusFire: false,
    blurUsed: false,
    aphoticUsed: false,
    frostShieldUsed: false,
  }
}

export function unitName(u: Unit): string {
  switch (u.kind) {
    case 'hero':
      return getHero(u.cardId!).name
    case 'neutral':
      return getNeutral(u.cardId!).name
    case 'roshan':
      return ROSHAN.name
    case 'tormentor':
      return TORMENTOR.name
    case 'illusion':
      return `${getHero(u.cardId!).name} Illusion`
    case 'siege':
      return 'Siege Creep'
    case 'creep':
      return 'Creep'
  }
}

export function fullName(u: Unit): string {
  return u.owner === 'neutral' ? unitName(u) : `${PLAYER_LABEL[u.owner]} ${unitName(u)}`
}

function tone(o: Owner): LogTone {
  return o
}

export function isMelee(u: Unit): boolean {
  if (u.status?.rangedAttack) return false
  if (u.kind === 'hero') return getHero(u.cardId!).range === 'Melee'
  return u.kind !== 'siege'
}

export function attributeOf(u: Unit): Attribute | undefined {
  if (u.kind === 'hero') return u.morph ?? getHero(u.cardId!).attribute
  if (u.kind === 'neutral') return getNeutral(u.cardId!).attribute
  if (u.kind === 'roshan') return ROSHAN.attribute
  if (u.kind === 'tormentor') return TORMENTOR.attribute
  return undefined
}

/** Units that take part in Phase 2. */
function canAttack(u: Unit) {
  return u.kind !== 'illusion' && u.kind !== 'tormentor'
}

/** A passive works only while the hero is alive and not Broken. */
export function hasPassive(u: Unit | undefined, heroId: string): boolean {
  if (scripted(u)) return false
  return !!u && !u.dead && u.cardId === heroId && u.kind === 'hero' && !u.status.broken
}

function hasKind(u: Unit | undefined, kind: HeroCard['passiveKind']): boolean {
  if (scripted(u)) return false
  return !!u && !u.dead && u.kind === 'hero' && !u.status.broken && !!u.cardId && getHero(u.cardId).passiveKind === kind
}

export function lineup(s: GameState, player: PlayerId, zone: ZoneId): string[] {
  return s.zones[zone][player].filter((uid) => s.units[uid] && !s.units[uid].dead)
}

/** What an opponent can target: Banished and Invisible units are skipped. */
function targetableLineup(s: GameState, player: PlayerId, zone: ZoneId): string[] {
  return lineup(s, player, zone).filter((uid) => !s.units[uid].status.banished && !s.units[uid].status.invisible)
}

function hiddenFromEnemies(u: Unit) {
  if (u.status.revealed) return false
  return u.status.banished || u.status.invisible
}

export function campNeutral(s: GameState, zone: ZoneId): Unit | undefined {
  if (isLane(zone)) return undefined
  const uid = s.camps[zone]
  const u = uid ? s.units[uid] : undefined
  return u && !u.dead ? u : undefined
}

export function heroesOnBoard(s: GameState, player: PlayerId): Unit[] {
  return Object.values(s.units).filter((u) => u.owner === player && u.kind === 'hero' && !u.dead)
}

function isPos1(s: GameState, u: Unit) {
  return u.owner !== 'neutral' && lineup(s, u.owner, u.zone)[0] === u.uid
}

function passiveInZone(s: GameState, owner: PlayerId, zone: ZoneId, heroId: string) {
  return lineup(s, owner, zone).some((uid) => hasPassive(s.units[uid], heroId))
}

/** Opposing units sharing a zone: the other player's lineup first, then any neutral camp. */
function enemyLine(s: GameState, u: Unit): Unit[] {
  if (u.owner === 'neutral') {
    return PLAYERS.flatMap((p) => targetableLineup(s, p, u.zone)).map((x) => s.units[x])
  }
  const units = targetableLineup(s, other(u.owner), u.zone).map((x) => s.units[x])
  const n = campNeutral(s, u.zone)
  if (n && !n.status.banished) units.push(n)
  return units
}

function clone(s: GameState): GameState {
  return structuredClone(s)
}

/** The side that arrived first holds a camp; ties go to the jungle's owner. */
export function campHolder(s: GameState, camp: CampId): PlayerId | undefined {
  const arrivals = PLAYERS.map((p) => {
    const rounds = lineup(s, p, camp).map((uid) => s.units[uid].placedRound)
    return { p, first: rounds.length ? Math.min(...rounds) : Infinity }
  })
  const [r, d] = arrivals
  if (r.first === Infinity && d.first === Infinity) return undefined
  if (r.first !== d.first) return r.first < d.first ? 'radiant' : 'dire'
  return jungleOwner(camp)
}

const ALL_RULES: ComebackRules = { buyback: true, towerCards: true, fountain: true }

function rules(s: GameState): ComebackRules {
  return s.settings.rules ?? ALL_RULES
}

function itemKind(c: { type: string; cardId: string }) {
  return c.type === 'item' ? getItem(c.cardId).kind : undefined
}

/** Runes, tower cards and boss rewards sit in hand without using a slot. */
function outsideHandLimit(c: { type: string; cardId: string }) {
  const kind = itemKind(c)
  return kind === 'Rune' || kind === 'Tower' || kind === 'Special'
}

/** Heroes, creeps and shop cards count. Runes, tower cards and boss rewards do not. */
export function countsTowardHand(c: { type: string; cardId: string }) {
  return !outsideHandLimit(c)
}

/** Cards that count toward the hand limit. Runes and tower cards are exempt. */
export function handCount(pl: PlayerState): number {
  return pl.hand.filter((c) => countsTowardHand(c)).length
}

/** How many counting cards must be pitched before the next round. */
export function excessHand(pl: PlayerState): number {
  return Math.max(0, handCount(pl) - HAND_LIMIT)
}

export function standingTowers(s: GameState, p: PlayerId): number {
  const t = s.players[p].structures.towers
  return LANES.reduce((n, l) => n + (t[l].t1 > 0 ? 1 : 0) + (t[l].t2 > 0 ? 1 : 0), 0)
}

/** Lanes where both towers are gone. Each one adds 1 Gold to that opponent's upkeep. */
export function openedLanes(s: GameState, p: PlayerId): number {
  const t = s.players[p].structures.towers
  return LANES.filter((l) => t[l].t1 <= 0 && t[l].t2 <= 0).length
}

// ---------- setup ----------

export function newGame(settings: Settings = {}, seed = Date.now()): GameState {
  const blankPlayer = (id: PlayerId): PlayerState => ({
    id,
    gold: 0,
    xp: 0,
    hand: [],
    placedThisRound: 0,
    structures: {
      towers: {
        top: { t1: TOWER_HP.t1, t2: TOWER_HP.t2 },
        mid: { t1: TOWER_HP.t1, t2: TOWER_HP.t2 },
        bot: { t1: TOWER_HP.t1, t2: TOWER_HP.t2 },
      },
      ancient: ANCIENT_HP,
    },
    bonusIncomeLanes: [],
    killsThisRound: 0,
    campFocus: { radiantJungle: 'neutral', direJungle: 'neutral' },
    towerCards: {
      top: { t1: 'glyph', t2: 'glyph' },
      mid: { t1: 'lotus', t2: 'lotus' },
      bot: { t1: 'gate', t2: 'gate' },
    },
    glyph: false,
    arcane: false,
    rotationsUsed: 0,
    rotatedUids: [],
    ward: [],
    smoke: [],
  })

  const zones = Object.fromEntries(ZONES.map((z) => [z, { radiant: [], dire: [] }])) as unknown as GameState['zones']

  const s: GameState = {
    round: 0,
    phase: 'draw',
    players: { radiant: blankPlayer('radiant'), dire: blankPlayer('dire') },
    units: {},
    zones,
    camps: { radiantJungle: null, direJungle: null },
    unitDeck: [],
    unitDiscard: [],
    heroDiscard: [],
    itemDeck: [],
    itemDiscard: [],
    runeDeck: [],
    runeDiscard: [],
    bossKills: [],
    neutralDeck: [],
    neutralDiscard: [],
    ultDeclarations: [],
    priority: 'radiant',
    passes: 0,
    combat: 'before',
    attacked: [],
    towersHit: [],
    towersFired: [],
    log: [],
    nextId: 1,
    seed: seed | 0,
    settings,
    resolvedUlts: [],
    silencedTowers: [],
  }

  const copies = (kind: 'Shop' | 'Rune') =>
    ITEMS.filter((i) => i.kind === kind).flatMap((i) => Array.from({ length: i.copies ?? ITEM_DECK_COPIES[kind] }, () => i.id))
  s.itemDeck = shuffle(s, copies('Shop'))
  s.runeDeck = shuffle(s, copies('Rune'))
  s.unitDeck = shuffle(s, [
    ...HEROES.map((h) => unitCard(h.id)),
    ...Array.from({ length: REGULAR_CREEPS }, () => unitCard('creep')),
    ...Array.from({ length: SIEGE_CREEPS }, () => unitCard('siege')),
  ])
  s.neutralDeck = shuffle(s, [
    ...NEUTRALS.flatMap((n) => Array.from({ length: NEUTRAL_COPIES }, () => n.id)),
    'roshan',
    ...Array.from({ length: TORMENTOR_COPIES }, () => 'tormentor'),
  ])

  for (const p of PLAYERS) {
    for (const tier of ['t1', 't2'] as const) {
      const ids = shuffle(s, [...TOWER_CARD_IDS])
      LANES.forEach((l, i) => (s.players[p].towerCards[l][tier] = ids[i]))
    }
    for (let i = 0; i < STARTING_HEROES; i++) {
      const card = s.unitDeck.pop()
      if (!card) break
      s.players[p].hand.push({
        iid: newId(s, 'c'),
        type: isCreepId(card.cardId) ? 'creep' : 'hero',
        cardId: card.cardId,
        buybackUsed: card.buybackUsed || undefined,
      })
    }
  }
  log(s, 'The battle for the Ancients begins. 160 cards are shuffled. Each side is dealt 5 from that deck.', 'phase')
  startRound(s)
  return s
}

function makeUnit(s: GameState, partial: Pick<Unit, 'kind' | 'owner' | 'zone' | 'hp'> & Partial<Unit>): Unit {
  const uid = newId(s, 'u')
  const u: Unit = {
    uid,
    maxHp: partial.hp,
    dead: false,
    ultUsed: partial.kind !== 'hero',
    ultCasts: 0,
    permanentAtk: 0,
    placedRound: s.round,
    fierySoul: false,
    status: freshStatus(),
    ...partial,
  }
  s.units[uid] = u
  return u
}

/** Shared so a damage reaction cannot call another damage reaction until it finishes. */
const kitDepth = { n: 0 }

function kitApi(s: GameState): KitApi {
  return {
    s,
    depth: kitDepth,
    log: (text, owner) => log(s, text, owner && owner !== 'neutral' ? owner : 'info'),
    name: (u) => fullName(u),
    magic: (src, tid, n, label) => dealDamage(s, src, tid, n, 'ult', { label: src ? `${unitName(src)}'s ${label}` : label }),
    physical: (src, tid, n, label) => dealDamage(s, src, tid, n, 'ult', { label: src ? `${unitName(src)}'s ${label}` : label, physical: true }),
    strike: (src, tid, n, label) => dealDamage(s, src, tid, n, 'attack', { label: src ? `${unitName(src)}'s ${label}` : label }),
    mark: (from, t, key, label) => applyStatus(s, from, t, key as BoolStatus, label, from !== t.owner),
    heal: (u, label) => heal(s, u, label),
    move: (u, zone, front, cause) => relocate(s, u, zone, !!front, cause),
    transfer: (u, owner, zone) => {
      if (u.dead || s.units[u.uid] !== u) return
      removeFromBoard(s, u)
      u.owner = owner
      u.zone = zone
      s.zones[zone][owner].push(u.uid)
    },
    fresh: freshStatus,
    make: (partial) => makeUnit(s, partial),
    hitTower: (src, lane, n) => {
      if (src.owner === 'neutral') return
      const enemy = other(src.owner)
      const tw = s.players[enemy].structures.towers[lane]
      const dmg = n
      if (tw.t1 <= 0 && tw.t2 <= 0) return
      const key = towerKey(enemy, lane, tw.t1 > 0 ? 't1' : 't2')
      if (!s.towersHit.includes(key)) s.towersHit.push(key)
      const tier = tw.t1 > 0 ? 't1' : 't2'
      if (tier === 't1') tw.t1 = Math.max(0, tw.t1 - dmg)
      else tw.t2 = Math.max(0, tw.t2 - dmg)
      log(s, `${fullName(src)} blasts the ${PLAYER_LABEL[enemy]} ${ZONE_LABEL[lane]} tower for ${dmg}.`, 'structure')
      if (tw[tier] === 0) onTowerLost(s, enemy, lane, tier, src.owner)
      else retaliateTower(s, enemy, lane)
    },
    xp: (p, n) => {
      s.players[p].xp = Math.max(0, s.players[p].xp + n)
    },
    gold: (p, n) => {
      s.players[p].gold += n
    },
    daytime: () => isDay(s.round, s.cycle),
    setCycle: (c) => {
      s.cycle = c
    },
    attackPower: (u) => attackDamage(s, u),
    shuffleDeck: () => {
      s.unitDeck = shuffle(s, s.unitDeck)
    },
    returnToHand: (u) => {
      if (u.owner === 'neutral' || u.dead || s.units[u.uid] !== u) return
      const owner = u.owner
      u.dead = true
      removeFromBoard(s, u)
      s.players[owner].hand.push({
        iid: u.handIid ?? newId(s, 'c'),
        type: u.kind === 'hero' ? 'hero' : 'creep',
        cardId: u.kind === 'hero' ? u.cardId! : u.kind,
        buybackUsed: u.buybackUsed,
      })
      delete s.units[u.uid]
    },
    shield: (u, persist) => giveShield(s, u, persist),
    silenceTower: (defender, lane) => {
      const key = `${defender}:${lane}`
      if (!s.silencedTowers.includes(key)) s.silencedTowers.push(key)
    },
  }
}

function relocate(s: GameState, u: Unit, zone: ZoneId, front: boolean, cause?: 'tp' | 'move') {
  const from = u.zone
  if (u.owner === 'neutral' || u.dead || s.units[u.uid] !== u) return
  removeFromBoard(s, u)
  u.zone = zone
  const arr = s.zones[zone][u.owner]
  if (front) arr.unshift(u.uid)
  else arr.push(u.uid)
  if (from !== zone) {
    const api = kitApi(s)
    onEnter(api, u)
    enemyEntered(api, u)
    if (cause === 'tp' && hasTag(u, 'onTp:heal')) heal(s, u, 'Tether')
    if (cause === 'tp' && hasTag(u, 'tpShield')) giveShield(s, u, false)
  }
}

function drawNeutral(s: GameState): string | undefined {
  for (let guard = 0; guard < 4; guard++) {
    if (s.neutralDeck.length === 0) {
      s.neutralDeck = shuffle(s, s.neutralDiscard)
      s.neutralDiscard = []
    }
    const id = s.neutralDeck.pop()
    if (id !== 'roshan' || s.round >= ROSHAN_EARLIEST_ROUND) return id
    log(s, `Roshan stirs too early (before round ${ROSHAN_EARLIEST_ROUND}) and is shuffled back.`, 'neutral')
    s.neutralDeck = shuffle(s, [...s.neutralDeck, id])
  }
  return undefined
}

function spawnCamps(s: GameState) {
  for (const camp of CAMPS) {
    const existing = campNeutral(s, camp)
    if (existing) {
      if (existing.kind === 'tormentor') existing.status.shield = 1
      continue
    }
    const id = drawNeutral(s)
    if (!id) continue
    let u: Unit
    if (id === 'roshan') {
      u = makeUnit(s, { kind: 'roshan', cardId: id, owner: 'neutral', zone: camp, hp: ROSHAN_HP })
      log(s, `Roshan awakens in the ${ZONE_LABEL[camp]}!`, 'neutral')
    } else if (id === 'tormentor') {
      u = makeUnit(s, { kind: 'tormentor', cardId: id, owner: 'neutral', zone: camp, hp: TORMENTOR_HP })
      u.status.shield = 1
      log(s, `A Tormentor materializes in the ${ZONE_LABEL[camp]}.`, 'neutral')
    } else {
      const n = getNeutral(id)
      u = makeUnit(s, { kind: 'neutral', cardId: id, owner: 'neutral', zone: camp, hp: n.hp })
      log(s, `A ${n.name} (${n.attribute}) spawns in the ${ZONE_LABEL[camp]}.`, 'neutral')
    }
    s.camps[camp] = u.uid
  }
}

function startRound(s: GameState) {
  s.round++
  s.phase = 'draw'
  s.ultDeclarations = []
  s.passes = 0
  s.combat = 'before'
  s.attacked = []
  s.bossKills = []
  s.cycle = undefined
  log(s, `Round ${s.round}`, 'phase')
  spawnCamps(s)
  for (const p of PLAYERS) {
    const pl = s.players[p]
    const xpAura = heroesOnBoard(s, p).filter((u) => hasTag(u, 'xpAura')).length
    const opened = openedLanes(s, other(p))
    const gold = 1 + opened
    pl.gold += gold
    pl.xp += 1 + xpAura
    pl.placedThisRound = 0
    pl.killsThisRound = 0
    pl.rotationsUsed = 0
    pl.rotatedUids = []
    const laneNote = opened ? ` (${opened} open ${opened === 1 ? 'lane' : 'lanes'})` : ''
    log(s, `Upkeep: ${PLAYER_LABEL[p]} gains ${gold} Gold and ${1 + xpAura} XP${laneNote}${xpAura ? ' (Arcane Aura)' : ''}.`, tone(p))
  }
}

// ---------- draw ----------

export type DrawType = 'unit' | 'item'

function isCreepId(id: string): id is CreepKind {
  return id === 'creep' || id === 'siege'
}

function unitCard(cardId: string, buybackUsed = false): UnitDeckCard {
  return { cardId, buybackUsed }
}

function deckSize(s: GameState, type: DrawType) {
  if (type === 'item') return s.itemDeck.length + s.itemDiscard.length
  return s.unitDeck.length + s.unitDiscard.length + s.heroDiscard.length
}

export function drawBlockReason(s: GameState, p: PlayerId, type: DrawType): string | null {
  if (s.phase !== 'draw') return 'Not the draw step'
  const pl = s.players[p]
  if (pl.gold < 1) return 'Need 1 Gold'
  if (handCount(pl) >= DRAW_CAP) return `Draw cap is ${DRAW_CAP} counting cards`
  if (deckSize(s, type) === 0) return 'Deck is empty'
  return null
}

function takeFromDeck(s: GameState, type: DrawType): string | UnitDeckCard | undefined {
  if (type === 'item') {
    if (s.itemDeck.length === 0) {
      s.itemDeck = shuffle(s, s.itemDiscard)
      s.itemDiscard = []
    }
    return s.itemDeck.pop()
  }
  if (s.unitDeck.length === 0) {
    const fallen = s.heroDiscard.map((h) => unitCard(h.cardId, h.buybackUsed))
    if (fallen.length || s.unitDiscard.length) log(s, 'The shared deck is empty: creeps and the hero discard are shuffled back in.', 'info')
    s.unitDeck = shuffle(s, [...s.unitDiscard, ...fallen])
    s.unitDiscard = []
    s.heroDiscard = []
  }
  return s.unitDeck.pop()
}

function takeRune(s: GameState): string | undefined {
  if (s.runeDeck.length === 0) {
    s.runeDeck = shuffle(s, s.runeDiscard)
    s.runeDiscard = []
  }
  return s.runeDeck.pop()
}

/** Where a played or lost card goes: shop items and runes to their discards, boss rewards flip back into the jungle deck. */
function discardItem(s: GameState, id: string) {
  const kind = getItem(id).kind
  if (kind === 'Shop') s.itemDiscard.push(id)
  else if (kind === 'Rune') s.runeDiscard.push(id)
  else if (id === BOSS_REWARD.roshan) s.neutralDiscard.push('roshan')
  else if (id === BOSS_REWARD.tormentor) s.neutralDiscard.push('tormentor')
}

export function drawCard(state: GameState, p: PlayerId, type: DrawType): GameState {
  if (drawBlockReason(state, p, type)) return state
  const s = clone(state)
  const drawn = takeFromDeck(s, type)
  if (!drawn) return state
  s.players[p].gold -= 1
  if (typeof drawn === 'string') {
    s.players[p].hand.push({ iid: newId(s, 'c'), type: 'item', cardId: drawn })
    log(s, `${PLAYER_LABEL[p]} spends 1 Gold and draws an item.`, tone(p))
    return s
  }
  const cardType = isCreepId(drawn.cardId) ? 'creep' : 'hero'
  s.players[p].hand.push({
    iid: newId(s, 'c'),
    type: cardType,
    cardId: drawn.cardId,
    buybackUsed: drawn.buybackUsed || undefined,
  })
  const name = cardType === 'hero' ? getHero(drawn.cardId).name : drawn.cardId === 'siege' ? 'a Siege Creep' : 'a Lane Creep'
  log(s, `${PLAYER_LABEL[p]} spends 1 Gold and draws ${name} from the shared deck.`, tone(p))
  return s
}

/** Buyback cost by standing towers compared with the opponent. */
export function buybackCost(s: GameState, p: PlayerId): number {
  const diff = standingTowers(s, p) - standingTowers(s, other(p))
  return BUYBACK_COST[diff > 0 ? 'ahead' : diff < 0 ? 'behind' : 'even']
}

/** The heroes buyback is allowed to see: the most recent arrivals in the shared discard. */
export function buybackWindow(s: GameState) {
  return s.heroDiscard.slice(-BUYBACK_WINDOW)
}

/** Heroes inside the window that either side may still buy. */
export function buybackChoices(s: GameState) {
  return buybackWindow(s).filter((h) => !h.buybackUsed && !h.buybackBlocked)
}

function buybackIndex(s: GameState, heroId: string): number {
  const start = Math.max(0, s.heroDiscard.length - BUYBACK_WINDOW)
  for (let i = s.heroDiscard.length - 1; i >= start; i--) {
    const h = s.heroDiscard[i]
    if (h.cardId === heroId && !h.buybackUsed && !h.buybackBlocked) return i
  }
  return -1
}

export function buybackBlockReason(s: GameState, p: PlayerId, heroId: string): string | null {
  if (!rules(s).buyback) return 'Buyback is off'
  if (s.phase !== 'draw') return 'Buyback happens during the Draw step'
  const pl = s.players[p]
  if (buybackIndex(s, heroId) < 0) {
    if (!s.heroDiscard.some((h) => h.cardId === heroId)) return 'Not in the shared discard'
    if (!buybackWindow(s).some((h) => h.cardId === heroId)) return `Only the last ${BUYBACK_WINDOW} discarded heroes can be bought back`
    return 'This hero cannot be bought back'
  }
  if (pl.gold < buybackCost(s, p)) return `Need ${buybackCost(s, p)} Gold`
  return null
}

export function buyback(state: GameState, p: PlayerId, heroId: string): GameState {
  if (buybackBlockReason(state, p, heroId)) return state
  const s = clone(state)
  const pl = s.players[p]
  const cost = buybackCost(s, p)
  const index = buybackIndex(s, heroId)
  const fallen = s.heroDiscard[index]
  pl.gold -= cost
  s.heroDiscard.splice(index, 1)
  pl.hand.push({ iid: newId(s, 'c'), type: 'hero', cardId: heroId, buybackUsed: true })
  const whose = fallen.owner === p ? '' : `${PLAYER_LABEL[fallen.owner]}'s `
  log(s, `${PLAYER_LABEL[p]} buys back ${whose}${getHero(heroId).name} for ${cost} Gold. It cannot be bought back again.`, tone(p))
  return s
}

/** Before the first reveal, a player may rearrange the face-down cards under towers of the same tier. */
export function swapTowerCards(state: GameState, p: PlayerId, tier: TowerTier, a: LaneId, b: LaneId): GameState {
  if (state.round !== 1 || (state.phase !== 'draw' && state.phase !== 'assign') || a === b) return state
  const s = clone(state)
  const tc = s.players[p].towerCards
  ;[tc[a][tier], tc[b][tier]] = [tc[b][tier], tc[a][tier]]
  return s
}

function onTowerLost(s: GameState, defender: PlayerId, lane: LaneId, tier: TowerTier, attacker?: PlayerId) {
  const bounty = TOWER_GOLD[tier]
  if (attacker) {
    s.players[attacker].gold += bounty
    log(s, `${PLAYER_LABEL[attacker]} claims ${bounty} Gold for destroying the ${ZONE_LABEL[lane]} Tier ${tier === 't1' ? 1 : 2} tower.`, tone(attacker))
  }
  if (!rules(s).towerCards) return
  const pl = s.players[defender]
  const cardId = pl.towerCards[lane][tier]
  pl.hand.push({ iid: newId(s, 'c'), type: 'item', cardId })
  log(s, `${PLAYER_LABEL[defender]} takes the tower's hidden card, ${getItem(cardId).name}.`, tone(defender))
}

function giveCard(s: GameState, p: PlayerId, card: Omit<HandCard, 'iid'>, label: string) {
  s.players[p].hand.push({ ...card, iid: newId(s, 'c') })
  log(s, `${PLAYER_LABEL[p]} receives ${label}.`, tone(p))
}

function cardLabel(card: HandCard): string {
  if (card.type === 'hero') return getHero(card.cardId).name
  if (card.type === 'creep') return card.cardId === 'siege' ? 'a Siege Creep' : 'a Lane Creep'
  return getItem(card.cardId).name
}

/** Pitch order for the AI: creeps, then cheap shop cards, then boss rewards, then heroes. */
function discardRank(card: HandCard): number {
  if (card.type === 'creep') return 0
  if (card.type === 'item') {
    const item = getItem(card.cardId)
    return item.kind === 'Shop' ? 10 + (item.cost ?? 1) : 40
  }
  return 100
}

export function discardBlockReason(s: GameState, p: PlayerId, handIid: string): string | null {
  if (s.phase !== 'report' && s.phase !== 'gameover') return 'Discard at the end of the turn'
  const card = s.players[p].hand.find((c) => c.iid === handIid)
  if (!card) return 'Not in hand'
  if (!countsTowardHand(card)) return 'Runes and tower cards do not count toward the hand'
  if (handCount(s.players[p]) <= HAND_LIMIT) return 'Hand is already at 7'
  return null
}

/** A pitched hero or creep goes to the unit discard. It is not a death, so it cannot be bought back. */
export function discardFromHand(state: GameState, p: PlayerId, handIid: string): GameState {
  if (discardBlockReason(state, p, handIid)) return state
  const s = clone(state)
  const pl = s.players[p]
  const card = pl.hand.find((c) => c.iid === handIid)!
  pl.hand = pl.hand.filter((c) => c.iid !== handIid)
  if (card.type === 'item') discardItem(s, card.cardId)
  else s.unitDiscard.push(unitCard(card.cardId, !!card.buybackUsed))
  log(s, `${PLAYER_LABEL[p]} discards ${cardLabel(card)}.`, tone(p))
  return s
}

/** Drop counting cards until the hand is back to 7. */
export function discardToHandLimit(state: GameState, p: PlayerId): GameState {
  let s = state
  for (let guard = 0; handCount(s.players[p]) > HAND_LIMIT && guard < 40; guard++) {
    const counting = s.players[p].hand.filter((c) => countsTowardHand(c))
    if (counting.length === 0) break
    counting.sort((a, b) => discardRank(a) - discardRank(b))
    const next = discardFromHand(s, p, counting[0].iid)
    if (next === s) break
    s = next
  }
  return s
}

export function endDraw(state: GameState): GameState {
  if (state.phase !== 'draw') return state
  const s = clone(state)
  s.phase = 'assign'
  return s
}

// ---------- assign ----------

export function placeBlockReason(s: GameState, p: PlayerId): string | null {
  if (s.phase !== 'assign') return 'Not the assign step'
  if (s.players[p].placedThisRound >= PLACE_PER_ROUND) return `Max ${PLACE_PER_ROUND} heroes per round`
  if (heroesOnBoard(s, p).length >= BOARD_LIMIT) return `Board limit (${BOARD_LIMIT} heroes)`
  return null
}

export function placeHero(state: GameState, p: PlayerId, handIid: string, zone: ZoneId): GameState {
  if (placeBlockReason(state, p)) return state
  if (zone === enemyJungle(p)) return state
  const card = state.players[p].hand.find((c) => c.iid === handIid && c.type === 'hero')
  if (!card) return state
  const s = clone(state)
  const pl = s.players[p]
  pl.hand = pl.hand.filter((c) => c.iid !== handIid)
  pl.placedThisRound++
  const hp = getHero(card.cardId).maxHp ?? 2
  const u = makeUnit(s, { kind: 'hero', cardId: card.cardId, handIid, owner: p, zone, hp, buybackUsed: card.buybackUsed })
  s.zones[zone][p].push(u.uid)
  const api = kitApi(s)
  onEnter(api, u)
  enemyEntered(api, u)
  return s
}

/** Creep cards go into lanes and stay until killed. They do not count toward hero limits. */
export function placeCreep(state: GameState, p: PlayerId, handIid: string, lane: LaneId): GameState {
  if (state.phase !== 'assign') return state
  const card = state.players[p].hand.find((c) => c.iid === handIid && c.type === 'creep')
  if (!card) return state
  const s = clone(state)
  s.players[p].hand = s.players[p].hand.filter((c) => c.iid !== handIid)
  const u = makeUnit(s, { kind: card.cardId as CreepKind, handIid, owner: p, zone: lane, hp: 1 })
  s.zones[lane][p].push(u.uid)
  return s
}

export function unplace(state: GameState, uid: string): GameState {
  const u = state.units[uid]
  if (!u || u.owner === 'neutral' || state.phase !== 'assign' || u.placedRound !== state.round) return state
  const s = clone(state)
  const owner = u.owner as PlayerId
  const pl = s.players[owner]
  if (u.kind === 'hero') {
    pl.hand.push({ iid: u.handIid ?? newId(s, 'c'), type: 'hero', cardId: u.cardId!, buybackUsed: u.buybackUsed })
    pl.placedThisRound--
  } else {
    pl.hand.push({ iid: u.handIid ?? newId(s, 'c'), type: 'creep', cardId: u.kind })
  }
  s.zones[u.zone][owner] = s.zones[u.zone][owner].filter((x) => x !== uid)
  delete s.units[uid]
  return s
}

export function moveInLineup(state: GameState, uid: string, dir: -1 | 1): GameState {
  const u = state.units[uid]
  if (!u || u.owner === 'neutral' || state.phase !== 'assign' || u.status.rooted) return state
  const s = clone(state)
  const arr = s.zones[u.zone][u.owner as PlayerId]
  const i = arr.indexOf(uid)
  const j = i + dir
  if (i < 0 || j < 0 || j >= arr.length) return state
  ;[arr[i], arr[j]] = [arr[j], arr[i]]
  return s
}

/** Both sides have locked in: flip everything placed this round. */
export function reveal(state: GameState): GameState {
  if (state.phase !== 'assign') return state
  const s = clone(state)
  for (const p of PLAYERS) {
    const placed = Object.values(s.units).filter((u) => u.owner === p && u.placedRound === s.round && !u.dead)
    if (placed.length) {
      log(
        s,
        `Reveal: ${PLAYER_LABEL[p]} assigns ${placed.map((u) => `${unitName(u)} (${ZONE_LABEL[u.zone]})`).join(', ')}.`,
        tone(p),
      )
    } else {
      log(s, `Reveal: ${PLAYER_LABEL[p]} assigns nothing new.`, tone(p))
    }
    const pl = s.players[p]
    for (const lane of pl.smoke) {
      for (const uid of lineup(s, p, lane)) {
        const u = s.units[uid]
        if (u.kind === 'hero' && u.placedRound === s.round) u.status.invisible = true
      }
    }
    for (const lane of pl.ward) {
      for (const uid of lineup(s, other(p), lane)) {
        const u = s.units[uid]
        if (u.kind === 'hero') {
          u.status.revealed = true
          u.status.invisible = false
        }
      }
    }
    pl.smoke = []
    pl.ward = []
  }
  s.towersHit = []
  s.towersFired = []
  s.combat = 'before'
  s.attacked = []
  openWindow(s, true)
  return s
}

/** Odd rounds Radiant starts. Even rounds Dire starts. */
function openWindow(s: GameState, fresh: boolean) {
  s.phase = 'response'
  s.passes = 0
  s.priority = firstPlayer(s.round)
  if (fresh) {
    log(s, `Interrupts — ${PLAYER_LABEL[s.priority]} plays first. One item, rune, reward, or ability, then the other side answers.`, 'phase')
  } else {
    log(s, `${PLAYER_LABEL[s.priority]} has priority.`, 'phase')
  }
}

function tookPriority(s: GameState, p: PlayerId) {
  if (s.winner) {
    s.phase = 'gameover'
    return
  }
  s.passes = 0
  s.priority = other(p)
  log(s, `${PLAYER_LABEL[s.priority]} has priority.`, 'phase')
}

// ---------- status ----------

type BoolStatus =
  | 'stunned'
  | 'silenced'
  | 'broken'
  | 'disarmed'
  | 'slowed'
  | 'blinded'
  | 'rooted'
  | 'banished'
  | 'muted'
  | 'cursed'

const STATUS_VERB: Record<BoolStatus, string> = {
  stunned: 'Stunned',
  silenced: 'Silenced',
  broken: 'Broken',
  disarmed: 'Disarmed',
  slowed: 'Slowed',
  blinded: 'Blinded',
  rooted: 'Rooted',
  banished: 'Banished',
  muted: 'Muted',
  cursed: 'Cursed',
}

/** Shields do not stack. `persist` marks a Shield that survives Cleanup until it blocks a hit. */
function grantShield(u: Unit, persist: boolean): boolean {
  if (u.status.shield >= 1) {
    if (persist) u.persistentShield = true
    return false
  }
  u.status.shield = 1
  u.persistentShield = persist || undefined
  return true
}

function giveShield(s: GameState, u: Unit, persist: boolean) {
  if (grantShield(u, persist)) log(s, `${fullName(u)} gains a Shield.`, tone(u.owner))
}

/** `spell` marks debuffs from Ultimates and items — Immunity blocks those. */
function applyStatus(s: GameState, from: Owner, t: Unit, key: BoolStatus, label: string, spell: boolean) {
  if (t.dead) return
  if (from !== t.owner && spell && t.status.immune) {
    log(s, `${fullName(t)} is Immune to ${label}.`, 'info')
    return
  }
  if (from !== t.owner && spell && hasTag(t, 'block:spell') && !t.status.blurUsed) {
    t.status.blurUsed = true
    log(s, `${fullName(t)} shrugs off ${label} (${getHero(t.cardId!).passive.name}).`, 'info')
    return
  }
  if (key === 'slowed' && t.owner !== 'neutral' && lineup(s, t.owner, t.zone).some((id) => hasTag(s.units[id], 'aura:noSlow'))) {
    log(s, `${fullName(t)} cannot be Slowed.`, 'info')
    return
  }
  t.status[key] = true
  if (key === 'banished') t.status.invulnerable = true
  if (spell && from !== t.owner && hasTag(t, 'onDebuff:shield')) giveShield(s, t, false)
  log(s, `${fullName(t)} is ${STATUS_VERB[key]} by ${label}.`, tone(from))
}

let healing = false
function heal(s: GameState, u: Unit, label: string) {
  if (u.dead || u.hp >= u.maxHp) return
  if (u.status.cursed) {
    log(s, `${fullName(u)} is Cursed and cannot heal (${label}).`, 'info')
    return
  }
  u.hp = u.maxHp
  log(s, `${fullName(u)} heals to Healthy (${label}).`, tone(u.owner))
  if (!healing) {
    healing = true
    noteHeal(kitApi(s), u)
    healing = false
  }
}

// ---------- items ----------

const DEBUFFS = ['stunned', 'silenced', 'broken', 'disarmed', 'slowed', 'blinded', 'rooted', 'muted', 'cursed'] as const

/** Units a card can be played on. Muted heroes cannot receive their own side's items. */
export function itemTargets(s: GameState, p: PlayerId, itemId: string): string[] {
  const item = getItem(itemId)
  const live = Object.values(s.units).filter((u) => !u.dead)
  const allies = live.filter((u) => u.owner === p && u.kind === 'hero' && !u.status.banished && !u.status.muted)
  const enemies = live.filter((u) => u.owner !== p && !hiddenFromEnemies(u))
  switch (item.target) {
    case 'none':
    case 'lane':
      return []
    case 'allyWoundedHero':
      return allies.filter((u) => u.hp < u.maxHp).map((u) => u.uid)
    case 'allyHero':
      if (itemId === 'refresher_shard') return allies.map((u) => u.uid)
      if (itemId === 'rune_water') return allies.filter((u) => DEBUFFS.some((d) => u.status[d]) || u.status.poisonedBy).map((u) => u.uid)
      return allies.map((u) => u.uid)
    case 'allyHeroToLane':
      return allies.filter((u) => !u.status.rooted).map((u) => u.uid)
    case 'enemyUnit':
      return enemies.map((u) => u.uid)
    case 'enemyHero':
      return enemies.filter((u) => u.kind === 'hero').map((u) => u.uid)
  }
}

/** Lanes a lane-targeted card can send heroes to. TP needs the hero first. */
export function itemLanes(s: GameState, p: PlayerId, itemId: string, heroUid?: string): LaneId[] {
  const item = getItem(itemId)
  if (item.target === 'lane') {
    if (item.id === 'gate') return heroesOnBoard(s, p).some((u) => !u.status.rooted) ? [...LANES] : []
    return [...LANES]
  }
  if (item.target === 'allyHeroToLane' && heroUid) return LANES.filter((l) => s.units[heroUid]?.zone !== l)
  return []
}

export function itemBlockReason(s: GameState, p: PlayerId, card: HandCard): string | null {
  if (s.phase !== 'response') return 'Items are interrupts during combat'
  if (s.priority !== p) return 'Wait for priority'
  const item = getItem(card.cardId)
  const cost = item.cost ?? 0
  if (cost > 0 && s.players[p].gold < cost) return `Needs ${cost} Gold`
  if (item.target === 'lane') return itemLanes(s, p, card.cardId).length ? null : 'No hero can move'
  if (item.target !== 'none' && itemTargets(s, p, card.cardId).length === 0) return 'No valid targets'
  return null
}

function teleport(s: GameState, u: Unit, lane: LaneId) {
  relocate(s, u, lane, false, 'tp')
  u.placedRound = s.round
}

export function playItem(state: GameState, p: PlayerId, handIid: string, targetUid?: string, lane?: LaneId): GameState {
  const card = state.players[p].hand.find((c) => c.iid === handIid && c.type === 'item')
  if (!card || itemBlockReason(state, p, card)) return state
  const item = getItem(card.cardId)
  const needsUnit = item.target !== 'none' && item.target !== 'lane'
  const needsLane = item.target === 'lane' || item.target === 'allyHeroToLane'
  if (needsUnit && (!targetUid || !itemTargets(state, p, card.cardId).includes(targetUid))) return state
  if (needsLane && (!lane || !itemLanes(state, p, card.cardId, targetUid).includes(lane))) return state
  const s = clone(state)
  const pl = s.players[p]
  pl.gold -= item.cost ?? 0
  pl.hand = pl.hand.filter((c) => c.iid !== handIid)
  const t = targetUid ? s.units[targetUid] : undefined
  log(s, `${PLAYER_LABEL[p]} plays ${item.name}${t ? ` on ${fullName(t)}` : ''}${lane ? ` to ${ZONE_LABEL[lane]}` : ''}.`, tone(p))

  if (item.id === 'glyph') {
    pl.glyph = true
  } else if (item.id === 'lotus') {
    for (const u of heroesOnBoard(s, p)) heal(s, u, 'Lotus Pool')
  } else if (item.id === 'gate' && lane) {
    const movers = heroesOnBoard(s, p)
      .filter((u) => u.zone !== lane && !u.status.rooted)
      .sort(byPriority(s))
    for (const u of movers) teleport(s, u, lane)
    log(s, movers.length ? `${movers.map(unitName).join(', ')} step through the Twin Gate to ${ZONE_LABEL[lane]}.` : 'Nobody could use the Twin Gate.', tone(p))
  } else if (item.id === 'rune_gold') {
    pl.gold += 1
  } else if (item.id === 'rune_wisdom') {
    pl.xp += 1
  } else if (item.id === 'clarity') {
    pl.xp += 1
  } else if (item.id === 'greaves') {
    for (const u of heroesOnBoard(s, p)) if (isLane(u.zone)) heal(s, u, item.name)
  } else if (item.id === 'assault') {
    for (const u of heroesOnBoard(s, p)) if (isLane(u.zone)) u.status.haste = true
  } else if (item.id === 'ward' && lane) {
    pl.ward.push(lane)
  } else if (item.id === 'smoke' && lane) {
    pl.smoke.push(lane)
  } else if (item.id === 'dust' && lane) {
    for (const uid of targetableLineup(s, other(p), lane)) {
      const e = s.units[uid]
      if (e.kind === 'hero') applyStatus(s, p, e, 'muted', item.name, true)
    }
  } else if (item.id === 'shivas' && lane) {
    for (const uid of targetableLineup(s, other(p), lane)) {
      const e = s.units[uid]
      if (e.kind === 'hero') applyStatus(s, p, e, 'slowed', item.name, true)
    }
  } else if (t) {
    const st = t.status
    switch (item.id) {
      case 'salve':
        heal(s, t, 'Healing Salve')
        break
      case 'dagon':
        dealDamage(s, null, t.uid, 2, 'item', { label: 'Dagon', sourceOwner: p })
        break
      case 'blade_mail':
        st.bladeMail = true
        break
      case 'vanguard':
        giveShield(s, t, false)
        break
      case 'bkb':
        st.immune = true
        st.stunned = st.silenced = st.disarmed = st.rooted = st.muted = st.broken = false
        break
      case 'desolator':
        st.bonusDamage += 1
        break
      case 'refresher':
        st.echoUlt = true
        break
      case 'mkb':
        st.accuracy = true
        st.magicOnHit += 1
        break
      case 'orchid':
        applyStatus(s, p, t, 'silenced', 'Orchid Malevolence', true)
        break
      case 'euls':
        applyStatus(s, p, t, 'banished', "Eul's Scepter", true)
        break
      case 'tp':
        if (lane) teleport(s, t, lane)
        break
      case 'ghost':
        st.ethereal = true
        break
      case 'heart':
        st.healEnd = true
        break
      case 'sheepstick':
        st.hexed = true
        if (t.hp > 1) t.hp = 1
        log(s, `${fullName(t)} is Hexed.`, tone(p))
        break
      case 'skadi':
        st.skadi = true
        break
      case 'force_staff': {
        const arr = s.zones[t.zone][t.owner as PlayerId]
        const i = arr.indexOf(t.uid)
        if (i >= 0) {
          arr.splice(i, 1)
          arr.push(t.uid)
        }
        break
      }
      case 'shadow_blade':
        st.invisible = true
        break
      case 'blink':
        st.haste = true
        st.slowed = false
        relocate(s, t, t.zone, true, 'move')
        break
      case 'halberd':
        applyStatus(s, p, t, 'disarmed', "Heaven's Halberd", true)
        break
      case 'gloves':
        st.haste = true
        st.slowed = false
        break
      case 'satanic':
        st.cannotDie = true
        st.lifesteal = true
        break
      case 'bloodthorn':
        applyStatus(s, p, t, 'silenced', 'Bloodthorn', true)
        st.bloodthorn = true
        break
      case 'abyssal':
        applyStatus(s, p, t, 'stunned', 'Abyssal Blade', true)
        break
      case 'butterfly':
        st.evade += 1
        break
      case 'rapier':
        st.rapier = true
        break
      case 'aegis':
        st.aegis = true
        break
      case 'refresher_shard':
        t.costZero = true
        log(s, `${fullName(t)}'s ability costs 0 XP.`, tone(p))
        break
      case 'rune_arcane':
        t.arcaneDiscount = (t.arcaneDiscount ?? 0) + 1
        log(s, `${fullName(t)}'s ability costs 1 less XP.`, tone(p))
        break
      case 'rune_regen':
        heal(s, t, 'Regeneration Rune')
        break
      case 'rune_dd':
        st.bonusDamage += 1
        break
      case 'rune_shield':
        giveShield(s, t, false)
        break
      case 'rune_illusion': {
        const decoy = makeUnit(s, { kind: 'illusion', cardId: t.cardId, owner: p, zone: t.zone, hp: 1 })
        const arr = s.zones[t.zone][p]
        arr.splice(arr.indexOf(t.uid), 0, decoy.uid)
        log(s, `An illusion of ${unitName(t)} steps in front of it.`, tone(p))
        break
      }
      case 'rune_invis':
        st.invisible = true
        break
      case 'rune_haste':
        st.haste = true
        st.slowed = false
        break
      case 'rune_water':
        for (const d of DEBUFFS) st[d] = false
        st.poisonedBy = undefined
        log(s, `${fullName(t)} is cleansed of all debuffs.`, tone(p))
        break
    }
    if (t.owner === p) onItem(kitApi(s), t)
    if (hasPassive(t, 'zeus') && t.owner === p) {
      const front = targetableLineup(s, other(p), t.zone)[0]
      if (front) dealDamage(s, t, front, 1, 'passive', { label: 'Static Field' })
    }
  }
  discardItem(s, item.id)
  tookPriority(s, p)
  return s
}

/** Items and abilities are no longer a phase. Passing priority is `passResponse`. */
export function endItems(state: GameState): GameState {
  return state
}

export function setCampFocus(state: GameState, p: PlayerId, camp: CampId, focus: 'neutral' | 'enemy'): GameState {
  const s = clone(state)
  s.players[p].campFocus[camp] = focus
  return s
}

// ---------- ultimates ----------

export function ultTargets(s: GameState, uid: string): string[] {
  const u = s.units[uid]
  if (!u?.cardId || u.owner === 'neutral') return []
  const enemies = Object.values(s.units).filter((x) => x.owner !== u.owner && !x.dead && !hiddenFromEnemies(x))
  const enemyHeroes = enemies.filter((x) => x.kind === 'hero')
  const allies = Object.values(s.units).filter((x) => x.owner === u.owner && x.kind === 'hero' && !x.dead)
  switch (getHero(u.cardId).ult.target) {
    case 'none':
    case 'lane':
    case 'zone':
    case 'adjacentZone':
      return []
    case 'enemyHeroInLane':
      return enemyHeroes
        .filter((x) => x.zone === u.zone && (u.cardId === 'necrophos' || u.cardId === 'razor' ? x.hp < x.maxHp : true))
        .map((x) => x.uid)
    case 'enemyUnitInLane':
      return enemies.filter((x) => x.zone === u.zone).map((x) => x.uid)
    case 'enemyHeroAdjacentLane':
      return enemyHeroes.filter((x) => ADJACENT[u.zone].includes(x.zone)).map((x) => x.uid)
    case 'enemyUnitAnyLane':
    case 'enemyHeroAny':
      return (getHero(u.cardId).ult.target === 'enemyHeroAny' ? enemyHeroes : enemies)
        .filter((x) => (u.cardId === 'spectre' || u.cardId === 'necrophos' ? x.hp < x.maxHp : true))
        .map((x) => x.uid)
    case 'allyHero':
      return allies.filter((x) => x.zone === u.zone).map((x) => x.uid)
    case 'allyHeroAny':
      return allies.map((x) => x.uid)
    case 'heroInLane':
      return [...allies, ...enemyHeroes].filter((x) => x.zone === u.zone).map((x) => x.uid)
    case 'enemyCreep':
      return enemies.filter((x) => x.zone === u.zone && (x.kind === 'creep' || x.kind === 'siege')).map((x) => x.uid)
  }
}

/** Lane and zone ultimates are aimed at the map, not a unit. */
export function ultZones(s: GameState, uid: string): ZoneId[] {
  const u = s.units[uid]
  if (!u?.cardId || u.owner === 'neutral') return []
  switch (getHero(u.cardId).ult.target) {
    case 'lane':
      return [...LANES]
    case 'zone':
      return [...ZONES]
    case 'adjacentZone':
      return [...ADJACENT[u.zone]]
    default:
      return []
  }
}

export function ultNeedsTarget(u: Unit) {
  return u.kind === 'hero' && getHero(u.cardId!).ult.target !== 'none'
}

/** Printed XP cost of an active ability. Passives cannot be cast. KotL reduces an ally's cost by 1, to a minimum of 1. */
export function ultCost(u: Unit, s?: GameState): number {
  if (u.costZero) return 0
  const script = u.cardId && u.kind === 'hero' ? getHero(u.cardId).script : undefined
  if (script?.kind === 'passive') return 0
  let cost = script?.xpCost ?? 1
  if (s && u.owner !== 'neutral' && isPos1(s, u)) {
    const kotl = lineup(s, u.owner, u.zone).some((id) => hasTag(s.units[id], 'kotl'))
    if (kotl) cost = Math.max(1, cost - 1)
  }
  if (u.arcaneDiscount) cost = Math.max(0, cost - u.arcaneDiscount)
  return cost
}

function castPreventedReason(s: GameState, u: Unit): string | null {
  if (u.dead) return 'Slain'
  if (u.status.banished) return 'Banished'
  if (u.status.stunned || u.status.feared) return u.status.feared ? 'Feared' : 'Stunned'
  if (u.status.silenced) return 'Silenced'
  if (u.owner !== 'neutral' && isPos1(s, u) && passiveInZone(s, other(u.owner), u.zone, 'lion')) return 'Mana Drained by Lion'
  return null
}

export function ultBlockReason(s: GameState, uid: string): string | null {
  const u = s.units[uid]
  if (!u || u.kind !== 'hero' || u.owner === 'neutral') return 'Not a hero'
  if (s.phase !== 'response') return 'Abilities are interrupts during combat'
  if (u.owner !== s.priority) return 'Wait for priority'
  const script = u.cardId ? getHero(u.cardId).script : undefined
  if (script?.kind !== 'active') return 'Passive ability'
  const prior = s.ultDeclarations.filter((d) => d.uid === uid)
  if (prior.length >= 2) return 'Already declared'
  const echoing = prior.length === 1
  if (echoing && !u.status.echoUlt) return 'Already declared'
  const r = castPreventedReason(s, u)
  if (r) return r
  const cost = echoing ? 0 : ultCost(u, s)
  if (!echoing && s.players[u.owner].xp < cost) return `Needs ${cost} XP`
  if (ultNeedsTarget(u) && ultTargets(s, uid).length === 0 && ultZones(s, uid).length === 0) return 'No valid targets'
  return null
}

export function shieldBlockReason(s: GameState, p: PlayerId, uid: string): string | null {
  const u = s.units[uid]
  if (!u || u.dead || u.kind !== 'hero' || u.owner !== p) return 'Not your hero'
  if (s.phase !== 'response') return 'Shields are interrupts during combat'
  if (s.priority !== p) return 'Wait for priority'
  if (u.status.shield > 0) return 'Already has a Shield'
  if (s.players[p].xp < SHIELD_XP_COST) return `Needs ${SHIELD_XP_COST} XP`
  return null
}

/** Spend 3 XP to put one Shield on an allied hero. It resolves immediately and lasts until it blocks a hit. */
export function buyShield(state: GameState, p: PlayerId, uid: string): GameState {
  if (shieldBlockReason(state, p, uid)) return state
  const s = clone(state)
  const u = s.units[uid]
  s.players[p].xp -= SHIELD_XP_COST
  giveShield(s, u, true)
  log(s, `${PLAYER_LABEL[p]} spends ${SHIELD_XP_COST} XP on that Shield.`, tone(p))
  tookPriority(s, p)
  return s
}

export function declareUlt(state: GameState, uid: string, target?: string): GameState {
  if (ultBlockReason(state, uid)) return state
  const u = state.units[uid]
  const zones = ultZones(state, uid)
  if (zones.length) {
    if (!target || !zones.includes(target as ZoneId)) return state
  } else if (ultNeedsTarget(u) && (!target || !ultTargets(state, uid).includes(target))) return state
  const owner = u.owner as PlayerId
  const s = clone(state)
  const pl = s.players[owner]
  const echoing = state.ultDeclarations.some((d) => d.uid === uid)
  const cost = echoing ? 0 : ultCost(u, state)
  if (!echoing) pl.xp -= cost
  else s.units[uid].status.echoUlt = false
  const decl: UltDeclaration = { uid, owner, target, cost, echo: echoing || undefined }
  s.ultDeclarations.push(decl)
  s.units[uid].lastCastTarget = target
  resolveOneCast(s, decl)
  tookPriority(s, owner)
  return s
}

function refundUlt(s: GameState, d: { owner: PlayerId; free?: boolean; echo?: boolean; cost: number }) {
  if (d.free) s.players[d.owner].arcane = true
  else if (!d.echo) s.players[d.owner].xp += d.cost
}

export function toggleMorph(state: GameState, uid: string): GameState {
  const u = state.units[uid]
  if (!u || u.cardId !== 'morphling' || state.phase !== 'assign' || u.owner === 'neutral') return state
  const s = clone(state)
  const m = s.units[uid]
  m.morph = (m.morph ?? 'AGI') === 'AGI' ? 'STR' : 'AGI'
  log(s, `${fullName(m)} morphs into ${m.morph}.`, m.owner)
  return s
}

/** An interrupt resolves as it is played, so it cannot be taken back. */
export function cancelUlt(state: GameState, _uid: string): GameState {
  return state
}

// ---------- damage model ----------

/** `reflect` is the Tormentor's returned damage: Shield blocks it, hero passives do not. */
type DamageKind = 'ult' | 'attack' | 'tower' | 'item' | 'passive' | 'reflect' | 'self'

interface DamageOpts {
  label?: string
  sourceOwner?: PlayerId
  /** Physical damage that is not a basic attack (no attribute counter). */
  physical?: boolean
}

/** Lethal attribute counters are gone in version 3. Attributes only order basic attacks. */
function counters(_a: Unit, _b: Unit) {
  return false
}

let deferLethal = false
const pendingKills: { uid: string; src: Unit | null; label: string; killer: Owner | undefined }[] = []

function removeFromBoard(s: GameState, u: Unit) {
  if (u.owner === 'neutral') {
    if (!isLane(u.zone) && s.camps[u.zone] === u.uid) s.camps[u.zone] = null
    return
  }
  s.zones[u.zone][u.owner] = s.zones[u.zone][u.owner].filter((x) => x !== u.uid)
}

function dealDamage(
  s: GameState,
  src: Unit | null,
  targetUid: string,
  amount: number,
  kind: DamageKind,
  opts: DamageOpts = {},
): number {
  const t = s.units[targetUid]
  const reflecting = !!t && !t.dead && t.kind === 'tormentor' && !t.status.broken && kind !== 'reflect'
  const shieldBefore = t?.status.shield ?? 0
  const dealt = applyDamage(s, src, targetUid, amount, kind, opts)
  if (reflecting && (dealt > 0 || t!.status.shield < shieldBefore)) tormentorReflect(s, t!, src, opts.sourceOwner, dealt || amount)
  return dealt
}

/** Reflection: the damage goes back to the attacker, and the same amount to the front of the other side in the camp. */
function tormentorReflect(s: GameState, torm: Unit, src: Unit | null, sourceOwner: PlayerId | undefined, amount: number) {
  const side = src && src.owner !== 'neutral' ? src.owner : sourceOwner
  if (!side) return
  const label = 'Tormentor Reflection'
  if (src && !src.dead && src.owner === side) dealDamage(s, torm, src.uid, amount, 'reflect', { label })
  for (const p of PLAYERS) {
    const front = targetableLineup(s, p, torm.zone)[0]
    if (front && front !== src?.uid) dealDamage(s, torm, front, amount, 'reflect', { label })
  }
}

function applyDamage(
  s: GameState,
  src: Unit | null,
  targetUid: string,
  amount: number,
  kind: DamageKind,
  opts: DamageOpts = {},
): number {
  const t = s.units[targetUid]
  if (!t || t.dead || s.winner) return 0
  const st = t.status
  const label = opts.label ?? (src ? unitName(src) : 'Tower')
  const srcOwner: Owner | undefined = src?.owner ?? opts.sourceOwner
  const fromEnemy = kind === 'tower' || (srcOwner !== undefined && srcOwner !== t.owner)
  const accuracy = !!src?.status.accuracy
  const pierce = !!src?.status.pierce || (!!src && hasTag(src, 'atk:pierce'))

  const magicAttack = kind === 'attack' && !!src && hasTag(src, 'atk:magic')
  const basic = kind === 'attack' && !opts.physical && !magicAttack
  const physicalHit = !magicAttack && (opts.physical || kind === 'attack' || kind === 'tower' || kind === 'reflect')
  const magic = magicAttack || (!opts.physical && kind !== 'self' && (kind === 'ult' || kind === 'item' || kind === 'passive'))

  if (kind !== 'self' && (st.banished || st.invulnerable)) {
    log(s, `${fullName(t)} is ${st.banished ? 'Banished' : 'Invulnerable'} — ${label} has no effect.`, 'info')
    return 0
  }
  if (t.kind === 'roshan' && !st.blurUsed && kind !== 'self') {
    st.blurUsed = true
    log(s, `Roshan ignores the first damage from ${label}.`, 'info')
    return 0
  }
  if (fromEnemy && preDamage(t)) {
    log(s, `${label} feeds ${fullName(t)}'s Borrowed Time.`, 'info')
    return 0
  }
  if (fromEnemy && magic) {
    if (st.immune) {
      log(s, `${fullName(t)} is Immune to ${label}.`, 'info')
      return 0
    }
    if (kind === 'ult' && (hasPassive(t, 'juggernaut') || hasKind(t, 'spellImmune'))) {
      log(s, `${fullName(t)} takes no damage from ${label} (${getHero(t.cardId!).passive.name}).`, 'info')
      return 0
    }
  }
  if (st.ethereal && physicalHit) {
    log(s, `${fullName(t)} is Ethereal and takes no physical damage from ${label}.`, 'info')
    return 0
  }
  if (physicalHit && st.evadeAll && !accuracy) {
    log(s, `${fullName(t)} evades the physical damage from ${label}.`, 'info')
    return 0
  }
  if (basic && !accuracy) {
    if (st.evade > 0) {
      st.evade--
      log(s, `${fullName(t)} Evades ${label}'s attack.`, 'info')
      if (src && hasTag(t, 'block:evadeReflect')) dealDamage(s, t, src.uid, 1, 'ult', { label: getHero(t.cardId!).passive.name })
      return 0
    }
    if ((hasPassive(t, 'phantom_assassin') || hasKind(t, 'evade')) && !st.blurUsed) {
      st.blurUsed = true
      log(s, `${fullName(t)} Evades ${label}'s attack (${getHero(t.cardId!).passive.name}).`, 'info')
      return 0
    }
  }
  const blocked = passiveBlock(s, t, src, magic ? 'ult' : kind, magic)
  if (blocked) {
    log(s, `${fullName(t)} stops ${label} (${blocked}).`, 'info')
    if (src && hasTag(t, 'block:evadeReflect')) dealDamage(s, t, src.uid, 1, 'ult', { label: blocked })
    return 0
  }
  if (basic && !pierce && (hasPassive(t, 'windranger') || hasKind(t, 'meleeImmune')) && src && isMelee(src)) {
    log(s, `${fullName(t)} takes no damage from ${label}'s melee attack (${getHero(t.cardId!).passive.name}).`, 'info')
    return 0
  }
  const rapier = basic && !!src?.status.rapier && t.kind === 'hero'
  if (physicalHit && !pierce && !rapier && st.shield > 0) {
    st.shield = 0
    t.persistentShield = false
    log(s, `${fullName(t)}'s Shield blocks ${label}.`, 'info')
    return 0
  }
  if (src && (src.kind === 'creep' || src.kind === 'siege') && (hasPassive(t, 'tidehunter') || hasKind(t, 'creepBlock'))) {
    log(s, `${fullName(t)} shrugs off the creep hit (${getHero(t.cardId!).passive.name}).`, 'info')
    return 0
  }
  if (!pierce && kind !== 'self' && kind !== 'reflect' && (hasPassive(t, 'abaddon') || hasKind(t, 'block')) && !st.aphoticUsed) {
    st.aphoticUsed = true
    log(s, `${fullName(t)} absorbs ${label} (${getHero(t.cardId!).passive.name}).`, 'info')
    return 0
  }
  if (st.borrowedTime && kind !== 'self') {
    log(s, `${label} feeds ${fullName(t)}'s Borrowed Time.`, 'info')
    t.hp = t.maxHp
    return 0
  }

  let dmg = amount
  if (magic && st.ethereal) dmg += 1
  if (basic && st.bloodthorn) dmg += 1
  if (basic && src && src.owner !== t.owner && src.kind === 'hero' && hasTag(t, 'atk:less')) dmg = Math.max(0, dmg - 1)
  if (hasTag(t, 'dmg:-1')) dmg = Math.max(0, dmg - 1)
  if (st.halfDamage && dmg > 0) dmg = Math.max(1, Math.ceil(dmg / 2))
  if (rapier) dmg = Math.max(dmg, t.hp)
  if (dmg <= 0) {
    log(s, `${label} deals no damage to ${fullName(t)}.`, 'info')
    return 0
  }
  if (st.cannotDie && t.hp - dmg <= 0) {
    t.hp = 1
    log(s, `${fullName(t)} cannot die — ${label} leaves them standing.`, 'info')
    return dmg
  }

  t.hp -= dmg
  st.tookDamage = true
  if (t.hp > 0) {
    log(s, `${label} deals ${dmg} to ${fullName(t)} (${t.hp}/${t.maxHp} left).`, 'damage')
    onDamaged(kitApi(s), t, src, dmg)
  } else if (deferLethal) {
    t.hp = 0
    if (!pendingKills.some((p) => p.uid === t.uid)) pendingKills.push({ uid: t.uid, src, label, killer: srcOwner })
    log(s, `${label} deals ${dmg} to ${fullName(t)} (simultaneous).`, 'damage')
    onDamaged(kitApi(s), t, src, dmg)
  } else {
    handleLethal(s, t, src, label, srcOwner)
  }
  if (basic && src) onHit(kitApi(s), src, t, dmg)
  return dmg
}

function handleLethal(s: GameState, t: Unit, src: Unit | null, label: string, killer: Owner | undefined) {
  if (t.status.aegis) {
    t.status.aegis = false
    t.hp = t.maxHp
    log(s, `${fullName(t)} is slain by ${label} — the Aegis revives them Healthy!`, 'kill')
    return
  }
  if (t.status.reincarnation) {
    t.status.reincarnation = false
    t.hp = 1
    log(s, `${fullName(t)} is slain by ${label} — and rises again, Wounded (Reincarnation)!`, 'kill')
    return
  }
  const save = lethalSave(t)
  if (save) {
    t.passiveSpent = true
    t.hp = save === 'full' ? t.maxHp : 1
    if (hasTag(t, 'save:amp')) t.status.bonusDamage += 1
    log(s, `${fullName(t)} is slain by ${label} — and rises again${save === 'full' ? ' at full health' : ', wounded'}.`, 'kill')
    return
  }
  t.hp = 0
  t.dead = true
  removeFromBoard(s, t)
  log(s, `${label} slays ${fullName(t)}.`, 'kill')

  const byPlayer = killer && killer !== 'neutral' && killer !== t.owner ? killer : undefined
  if (t.kind === 'hero' && byPlayer) s.players[byPlayer].killsThisRound++
  if (t.kind === 'neutral') {
    s.neutralDiscard.push(t.cardId!)
    if (byPlayer) {
      const pl = s.players[byPlayer]
      pl.gold += 2
      pl.xp += 2
      log(s, `${PLAYER_LABEL[byPlayer]} clears the camp: +2 Gold, +2 XP, and a rune.`, tone(byPlayer))
      const rune = takeRune(s)
      if (rune) giveCard(s, byPlayer, { type: 'item', cardId: rune }, `a rune card (${getItem(rune).name})`)
    }
  }
  if ((t.kind === 'roshan' || t.kind === 'tormentor') && !isLane(t.zone)) {
    const present = PLAYERS.filter((p) => lineup(s, p, t.zone).length > 0 || p === byPlayer)
    s.bossKills.push({ camp: t.zone, kind: t.kind, killer: byPlayer, present })
  }

  if (src && src.owner !== 'neutral' && !src.dead && isMelee(src) && passiveInZone(s, src.owner, src.zone, 'wraith_king')) {
    heal(s, src, 'Vampiric Aura')
  }
  onDeath(kitApi(s), t, src)
}

// ---------- combat ----------

function priorityKey(s: GameState, u: Unit): number[] {
  if (u.owner === 'neutral') return [99, 0]
  const zoneRank = ZONE_PRIORITY[u.owner].indexOf(u.zone)
  const pos = s.zones[u.zone][u.owner].indexOf(u.uid)
  return [zoneRank, pos]
}

function byPriority(s: GameState) {
  return (a: Unit, b: Unit) => {
    const ka = priorityKey(s, a)
    const kb = priorityKey(s, b)
    for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i]
    return 0
  }
}

function resolveUltEffect(s: GameState, u: Unit, effect: UltEffect, target?: Unit) {
  const hero = getHero(u.cardId!)
  const ult = hero.ult.name
  const owner = u.owner as PlayerId
  const enemies = () => enemyLine(s, u)
  const hit = (uid: string, n: number) => dealDamage(s, u, uid, n, 'ult', { label: `${hero.name}'s ${ult}` })
  const mark = (e: Unit, key: BoolStatus) => applyStatus(s, owner, e, key, ult, true)
  switch (effect) {
    case 'lane1':
      for (const e of enemies()) hit(e.uid, 1)
      break
    case 'stunLane':
      for (const e of enemies().filter((e) => e.kind === 'hero')) mark(e, 'stunned')
      break
    case 'slowLane':
      for (const e of enemies()) mark(e, 'slowed')
      break
    case 'global1':
      for (const e of Object.values(s.units).filter((x) => x.owner === other(owner) && x.kind === 'hero' && !x.dead)) hit(e.uid, 1)
      break
    case 'taunt':
      for (const e of enemies()) e.status.taunt = u.uid
      log(s, `All enemies in ${ZONE_LABEL[u.zone]} must attack ${hero.name}.`, tone(owner))
      break
    case 'decoy': {
      const decoy = makeUnit(s, { kind: 'illusion', cardId: u.cardId, owner, zone: u.zone, hp: 1 })
      const arr = s.zones[u.zone][owner]
      arr.splice(arr.indexOf(u.uid), 0, decoy.uid)
      log(s, `An illusion of ${hero.name} steps in front of it.`, tone(owner))
      break
    }
    case 'shield':
      giveShield(s, u, true)
      break
    case 'evade':
      u.status.evade += 1
      break
    case 'haste':
      u.status.haste = true
      break
    case 'bonus':
      u.status.bonusDamage += 1
      break
    case 'accuracy':
      u.status.accuracy = true
      break
    case 'pierce':
      u.status.pierce = true
      break
    case 'reincarnation':
      u.status.reincarnation = true
      break
    case 'focus':
      u.status.focusFire = true
      break
    case 'immune':
      u.status.immune = true
      break
    case 'invisible':
      u.status.invisible = true
      break
    case 'heal':
      heal(s, u, ult)
      break
    case 'dmg1':
      if (target) hit(target.uid, 1)
      break
    case 'dmg2':
    case 'dmg2h':
      if (target) hit(target.uid, 2)
      break
    case 'stun':
      if (target) mark(target, 'stunned')
      break
    case 'stunDmg':
      if (target) {
        hit(target.uid, 1)
        mark(target, 'stunned')
      }
      break
    case 'silence':
      if (target) mark(target, 'silenced')
      break
    case 'disarm':
      if (target) mark(target, 'disarmed')
      break
    case 'slow':
      if (target) mark(target, 'slowed')
      break
    case 'root':
      if (target) mark(target, 'rooted')
      break
    case 'break':
      if (target) mark(target, 'broken')
      break
    case 'blind':
      if (target) mark(target, 'blinded')
      break
    case 'mute':
      if (target) mark(target, 'muted')
      break
    case 'curse':
      if (target) {
        hit(target.uid, 1)
        mark(target, 'cursed')
      }
      break
  }
}

function castUlt(s: GameState, u: Unit, targetUid?: string) {
  const hero = getHero(u.cardId!)
  if (hero.script) {
    runUlt(kitApi(s), u, targetUid)
    return
  }
  const ult = hero.ult.name
  const owner = u.owner as PlayerId
  const enemies = () => enemyLine(s, u)
  const target = targetUid ? s.units[targetUid] : undefined
  const hit = (uid: string, n: number) => dealDamage(s, u, uid, n, 'ult', { label: `${hero.name}'s ${ult}` })

  if (hero.ult.effect) {
    resolveUltEffect(s, u, hero.ult.effect, target)
    return
  }

  switch (u.cardId) {
    case 'axe':
      for (const e of enemies()) e.status.taunt = u.uid
      log(s, `All enemies in ${ZONE_LABEL[u.zone]} must attack Axe.`, tone(owner))
      break
    case 'sven':
      u.status.accuracy = true
      u.status.pierce = true
      break
    case 'tidehunter':
      for (const e of enemies().filter((e) => e.kind === 'hero')) applyStatus(s, owner, e, 'stunned', ult, true)
      break
    case 'pudge':
      if (target) {
        if (target.status.rooted) {
          log(s, `${fullName(target)} is Rooted and cannot be dragged.`, 'info')
        } else if (target.status.immune) {
          log(s, `${fullName(target)} is Immune to Meat Hook.`, 'info')
        } else {
          removeFromBoard(s, target)
          target.zone = u.zone
          s.zones[u.zone][target.owner as PlayerId].unshift(target.uid)
          log(s, `${fullName(target)} is hooked into ${ZONE_LABEL[u.zone]} Position 1.`, tone(owner))
        }
        hit(target.uid, 1)
      }
      break
    case 'wraith_king':
      u.status.reincarnation = true
      break
    case 'crystal_maiden':
      for (const e of enemies()) hit(e.uid, 1)
      dealDamage(s, u, u.uid, 1, 'self', { label: 'Freezing Field backlash' })
      break
    case 'lion':
    case 'lina':
    case 'sniper':
      if (target) hit(target.uid, 2)
      break
    case 'zeus':
      for (const e of Object.values(s.units).filter((x) => x.owner === other(owner) && x.kind === 'hero' && !x.dead))
        hit(e.uid, 1)
      break
    case 'lich': {
      const [p1, p2] = enemies()
      if (p1) hit(p1.uid, 1)
      if (p2) hit(p2.uid, 1)
      break
    }
    case 'windranger':
      u.status.focusFire = true
      break
    case 'abaddon':
      u.status.borrowedTime = true
      break
    case 'bane':
      if (target) applyStatus(s, owner, target, 'stunned', ult, true)
      heal(s, u, ult)
      break
    case 'venomancer':
      for (const e of enemies()) {
        hit(e.uid, 1)
        if (!e.dead) applyStatus(s, owner, e, 'cursed', ult, true)
      }
      break
    case 'viper':
      if (target) {
        hit(target.uid, 1)
        applyStatus(s, owner, target, 'slowed', ult, true)
        applyStatus(s, owner, target, 'disarmed', ult, true)
      }
      break
    case 'phantom_assassin':
      if (target) hit(target.uid, 99)
      break
    case 'juggernaut':
      for (const e of pickRandom(s, enemies(), 2)) hit(e.uid, 1)
      break
    case 'luna':
      for (const e of pickRandom(s, enemies(), 3)) hit(e.uid, 1)
      break
    case 'anti_mage': {
      const heroes = enemies().filter((e) => e.kind === 'hero')
      const ints = heroes.filter((e) => attributeOf(e) === 'INT').length
      if (ints === 0) log(s, 'Mana Void finds no INT heroes to punish.', 'info')
      else for (const e of heroes) hit(e.uid, ints)
      break
    }
  }
}

function roshanRoar(s: GameState, rosh: Unit) {
  const victims = PLAYERS.flatMap((p) => targetableLineup(s, p, rosh.zone)).map((x) => s.units[x])
  log(s, 'Roshan Roars!', 'neutral')
  for (const v of victims) {
    applyStatus(s, 'neutral', v, 'disarmed', 'Roar', true)
    dealDamage(s, rosh, v.uid, 1, 'ult', { label: 'Roar' })
  }
}

function refreshNeutralAuras(s: GameState) {
  for (const camp of CAMPS) {
    const u = campNeutral(s, camp)
    if (!u) continue
    if (u.cardId === 'golem') {
      u.status.immune = true
      u.status.shield = Math.max(u.status.shield, 1)
    }
    if (u.cardId === 'thunderhide') u.status.haste = true
    if (u.cardId === 'dragon') {
      for (const p of PLAYERS) for (const id of lineup(s, p, camp)) applyStatus(s, 'neutral', s.units[id], 'cursed', 'Black Dragon', true)
    }
    if (u.kind === 'tormentor') u.status.shield = Math.max(u.status.shield, 1)
    if (u.cardId === 'ice_shaman') {
      for (const p of PLAYERS) for (const id of lineup(s, p, camp)) applyStatus(s, 'neutral', s.units[id], 'silenced', 'Ice Shaman', true)
    }
  }
}

/** Contested camp passives. They are not ultimates, so they do not follow declaration order. */
function contestStrikes(s: GameState) {
  for (const camp of CAMPS) {
    const u = campNeutral(s, camp)
    if (!u || u.dead) continue
    const present = PLAYERS.some((p) => lineup(s, p, camp).length > 0)
    if (!present) continue
    const everyone = PLAYERS.flatMap((p) => targetableLineup(s, p, camp))
    if (u.kind === 'roshan') roshanRoar(s, u)
    if (u.cardId === 'thunderhide') {
      for (const id of everyone) dealDamage(s, u, id, 1, 'passive', { label: 'Thunder Clap' })
    }
    if (u.cardId === 'ice_shaman') {
      for (const p of PLAYERS) {
        const front = targetableLineup(s, p, camp)[0]
        if (front) dealDamage(s, u, front, 1, 'passive', { label: 'Freezing Blast' })
      }
    }
    if (u.cardId === 'dragon') {
      for (const id of everyone) dealDamage(s, u, id, 1, 'passive', { label: 'Fire Pit' })
    }
  }
}

/**
 * Roshan and Tormentor rewards. Uncontested: the side that fought it, even if all its heroes died.
 * Contested: the only side with a hero still standing in the camp, otherwise the jungle's owner.
 */
function settleBossKills(s: GameState) {
  for (const k of s.bossKills) {
    let to: PlayerId
    if (k.present.length === 1) {
      to = k.present[0]
    } else {
      const survivors = PLAYERS.filter((p) => lineup(s, p, k.camp).some((uid) => s.units[uid].kind === 'hero'))
      to = survivors.length === 1 ? survivors[0] : jungleOwner(k.camp)
    }
    const reward = BOSS_REWARD[k.kind]
    const pl = s.players[to]
    if (k.kind === 'roshan') {
      pl.gold += 3
      pl.xp += 3
      log(s, `${PLAYER_LABEL[to]} claims Roshan: +3 Gold, +3 XP, a rune, and the Aegis.`, tone(to))
    } else {
      pl.gold += 2
      pl.xp += 2
      log(s, `${PLAYER_LABEL[to]} claims the Tormentor: +2 Gold, +2 XP, a rune, and a Refresher Shard.`, tone(to))
    }
    const rune = takeRune(s)
    if (rune) giveCard(s, to, { type: 'item', cardId: rune }, `a rune card (${getItem(rune).name})`)
    giveCard(s, to, { type: 'item', cardId: reward }, `the ${getItem(reward).name}`)
  }
  s.bossKills = []
}

function attackTargets(s: GameState, u: Unit): string[] {
  const owner = u.owner as PlayerId
  const opp = targetableLineup(s, other(owner), u.zone)
  const taunter = u.status.taunt ? s.units[u.status.taunt] : undefined
  if (taunter && !taunter.dead && taunter.zone === u.zone && !taunter.status.banished) return [taunter.uid]

  let pool: string[] = opp
  if (!isLane(u.zone)) {
    const n = campNeutral(s, u.zone)
    const neutral = n && !n.status.banished ? [n.uid] : []
    if (campHolder(s, u.zone) === owner) {
      const wantsEnemy = s.players[owner].campFocus[u.zone] === 'enemy'
      pool = wantsEnemy && opp.length ? opp : neutral.length ? neutral : opp
    } else {
      pool = opp.length ? opp : neutral
    }
  }
  if (pool.length === 0) return []
  const scriptedTargets = targetFilter(u, pool, s)
  if (scriptedTargets) return scriptedTargets
  if (hasPassive(u, 'sniper') || hasKind(u, 'snipe')) {
    const units = pool.map((x) => s.units[x])
    const pick =
      units.find((x) => counters(u, x)) ??
      units.find((x) => x.kind === 'hero' && x.hp < x.maxHp) ??
      units.find((x) => x.kind === 'hero') ??
      units[0]
    return [pick.uid]
  }
  if (hasPassive(u, 'sven') || hasPassive(u, 'luna') || hasKind(u, 'cleave')) return pool.slice(0, 2)
  return [pool[0]]
}

function attackDamage(s: GameState, u: Unit, target?: Unit): number {
  if (u.status.hexed) return 0
  if (u.owner !== 'neutral' && isPos1(s, u) && passiveInZone(s, other(u.owner), u.zone, 'bane')) return 0
  let dmg = 1 + u.status.bonusDamage + (u.permanentAtk || 0) + attackExtra(s, u, target, isDay(s.round, s.cycle))
  if (u.status.enfeeble) dmg -= 1
  return Math.max(0, dmg)
}

function towerKey(defender: PlayerId, lane: LaneId, tier: 't1' | 't2') {
  return `${defender}:${lane}:${tier}`
}

function attackStructure(s: GameState, u: Unit, lane: LaneId) {
  const owner = u.owner as PlayerId
  const enemy = other(owner)
  const st = s.players[enemy].structures
  const tw = st.towers[lane]
  const dmg = (u.kind === 'siege' ? 2 : 1 + u.status.bonusDamage + (u.permanentAtk || 0)) + towerBonus(u)
  const who = fullName(u)
  if (tw.t1 > 0 || tw.t2 > 0) {
    const key = towerKey(enemy, lane, tw.t1 > 0 ? 't1' : 't2')
    if (!s.towersHit.includes(key)) s.towersHit.push(key)
  }
  if ((tw.t1 > 0 || tw.t2 > 0) && s.players[enemy].glyph) {
    log(s, `${who}'s attack bounces off the ${PLAYER_LABEL[enemy]} ${ZONE_LABEL[lane]} tower (Glyph).`, 'info')
    return
  }
  if (tw.t1 > 0) {
    tw.t1 = Math.max(0, tw.t1 - dmg)
    log(s, `${who} hits the ${PLAYER_LABEL[enemy]} ${ZONE_LABEL[lane]} Tier 1 tower for ${dmg} (${tw.t1}/${TOWER_HP.t1}).`, 'structure')
    if (tw.t1 === 0) {
      log(s, `${PLAYER_LABEL[enemy]} ${ZONE_LABEL[lane]} Tier 1 tower is destroyed!`, 'structure')
      onTowerLost(s, enemy, lane, 't1', owner)
    }
  } else if (tw.t2 > 0) {
    tw.t2 = Math.max(0, tw.t2 - dmg)
    log(s, `${who} hits the ${PLAYER_LABEL[enemy]} ${ZONE_LABEL[lane]} Tier 2 tower for ${dmg} (${tw.t2}/${TOWER_HP.t2}).`, 'structure')
    if (tw.t2 === 0) {
      log(s, `${PLAYER_LABEL[enemy]} ${ZONE_LABEL[lane]} Tier 2 tower is destroyed!`, 'structure')
      onTowerLost(s, enemy, lane, 't2', owner)
    }
  } else {
    st.ancient = Math.max(0, st.ancient - dmg)
    log(s, `${who} strikes the ${PLAYER_LABEL[enemy]} Ancient for ${dmg} (${st.ancient}/${ANCIENT_HP}).`, 'structure')
  }
  checkWinner(s)
}

function neutralAttack(s: GameState, u: Unit) {
  const all = PLAYERS.flatMap((p) => targetableLineup(s, p, u.zone))
  const fronts = PLAYERS.map((p) => targetableLineup(s, p, u.zone)[0]).filter(Boolean)
  const targets =
    u.kind === 'roshan' || u.cardId === 'dragon'
      ? all
      : u.cardId === 'thunderhide'
        ? all.filter((id) => s.units[id].kind === 'hero')
        : u.cardId === 'ice_shaman'
          ? fronts.filter((id) => s.units[id].kind === 'hero')
          : fronts
  if (u.status.blinded && !u.status.accuracy) {
    if (targets.length) log(s, `${fullName(u)} is Blinded and misses.`, 'info')
    return
  }
  for (const tid of targets) {
    if (u.dead) break
    const t = s.units[tid]
    const dealt = dealDamage(s, u, tid, attackDamage(s, u, t), 'attack')
    if (dealt > 0 && !t.dead) {
      if (u.cardId === 'ice_shaman') applyStatus(s, 'neutral', t, 'silenced', 'Freezing Blast', true)
      if (u.cardId === 'thunderhide') applyStatus(s, 'neutral', t, 'slowed', 'Thunder Clap', true)
    }
    reflect(s, u, t, dealt)
  }
}

function reflect(s: GameState, attacker: Unit, t: Unit, dealt: number) {
  if (attacker.dead) return
  if (!t.dead && (hasPassive(t, 'axe') || hasPassive(t, 'viper') || hasKind(t, 'thorns')))
    dealDamage(s, t, attacker.uid, 1, 'passive', { label: getHero(t.cardId!).passive.name })
  if (t.status.bladeMail && dealt > 0) dealDamage(s, t, attacker.uid, 1, 'ult', { label: 'Blade Mail', physical: true })
}

function singleAttack(s: GameState, u: Unit) {
  if (u.dead || s.winner) return
  if (u.owner === 'neutral') return neutralAttack(s, u)
  const targets = attackTargets(s, u)
  if (targets.length === 0) {
    if (isLane(u.zone)) {
      if (u.status.blinded && !u.status.accuracy) log(s, `${fullName(u)} is Blinded and misses the tower.`, 'info')
      else attackStructure(s, u, u.zone)
    }
    return
  }
  if (u.status.blinded && !u.status.accuracy) {
    log(s, `${fullName(u)} is Blinded and misses.`, 'info')
    return
  }
  if (u.status.hexed) {
    log(s, `${fullName(u)} is Hexed and cannot attack.`, 'info')
    return
  }
  for (const tid of targets) {
    if (u.dead) break
    const t = s.units[tid]
    if (!t || t.dead) continue
    const dmg = attackDamage(s, u, t)
    if (dmg === 0) {
      log(s, `${fullName(u)} deals no damage.`, 'info')
      continue
    }
    const dealt = dealDamage(s, u, tid, dmg, 'attack')
    if (dealt > 0 && !u.status.broken) {
      if (u.cardId === 'lina') u.fierySoul = true
      if ((u.cardId === 'anti_mage' || hasKind(u, 'silenceOnHit')) && t.kind === 'hero' && !t.dead)
        applyStatus(s, u.owner, t, 'silenced', getHero(u.cardId!).passive.name, false)
      if ((u.cardId === 'venomancer' || hasKind(u, 'poison')) && !t.dead) t.status.poisonedBy = u.owner as PlayerId
    }
    reflect(s, u, t, dealt)
  }
}

function sameSwing(s: GameState, a: Unit, b: Unit) {
  if (attributeOf(a) !== attributeOf(b)) return false
  const ka = priorityKey(s, a)
  const kb = priorityKey(s, b)
  return ka[0] === kb[0] && ka[1] === kb[1]
}

function flushPendingKills(s: GameState) {
  deferLethal = false
  const queued = pendingKills.splice(0, pendingKills.length)
  for (const p of queued) {
    const t = s.units[p.uid]
    if (t && !t.dead && t.hp <= 0) handleLethal(s, t, p.src, p.label, p.killer)
  }
}

function basicAttack(s: GameState, u: Unit) {
  if (u.dead || s.winner || u.status.banished) return
  if (u.status.stunned || u.status.feared) {
    log(s, `${fullName(u)} is ${u.status.feared ? 'Feared' : 'Stunned'} and cannot attack.`, 'info')
    return
  }
  if (u.status.disarmed) {
    log(s, `${fullName(u)} is Disarmed and cannot attack.`, 'info')
    return
  }
  singleAttack(s, u)
  if (u.status.focusFire) singleAttack(s, u)
}

/** Hasted first, then AGI → UNI → INT → STR → creeps. Slowed units are passed in separately and act last. */
function attackOrder(s: GameState, all: Unit[]): Unit[] {
  const attackers = all.filter(canAttack)
  const order: Unit[] = []
  const pushBracket = (pool: Unit[]) => {
    for (const attr of ATTACK_ORDER) order.push(...pool.filter((u) => attributeOf(u) === attr).sort(byPriority(s)))
    order.push(...pool.filter((u) => !attributeOf(u)).sort(byPriority(s)))
  }
  pushBracket(attackers.filter((u) => u.status.haste))
  pushBracket(attackers.filter((u) => !u.status.haste))
  return order
}

function checkWinner(s: GameState) {
  if (s.winner) return
  for (const p of PLAYERS) {
    if (s.players[p].structures.ancient <= 0) {
      s.winner = other(p)
      log(s, `The ${PLAYER_LABEL[p]} Ancient has fallen. ${PLAYER_LABEL[other(p)]} victory!`, 'phase')
    }
  }
}

function resolveOneCast(s: GameState, c: UltDeclaration) {
  const u = s.units[c.uid]
  if (!u || u.dead) {
    refundUlt(s, c)
    return
  }
  const owner = u.owner as PlayerId
  const reason = castPreventedReason(s, u)
  const zoneCast = isZoneId(c.target)
  const target = !zoneCast && c.target ? s.units[c.target] : undefined
  const targetGone =
    !!c.target &&
    (zoneCast ? !ZONES.includes(c.target as ZoneId) : !target || target.dead || (target.owner !== u.owner && hiddenFromEnemies(target)))
  if (reason || targetGone) {
    refundUlt(s, { owner, free: c.free, cost: c.cost })
    log(s, `${fullName(u)}'s ${getHero(u.cardId!).ult.name} fizzles (${reason ?? 'target gone'}); ${c.echo ? 'the extra cast is lost' : `${c.cost} XP refunded`}.`, 'info')
    return
  }
  log(s, `${fullName(u)} casts ${getHero(u.cardId!).ult.name}${target ? ` on ${fullName(target)}` : ''}.`, tone(owner))
  u.ultCasts += 1
  u.ultUsed = true
  s.resolvedUlts.push(u.zone)
  castUlt(s, u, c.target)
}

/** A Refresher that was never cast a second time repeats the same target as attacks begin. */
function echoRemaining(s: GameState) {
  for (const u of Object.values(s.units)) {
    if (!u.status.echoUlt || u.dead || u.owner === 'neutral') continue
    u.status.echoUlt = false
    log(s, `${fullName(u)}'s Ultimate echoes.`, tone(u.owner))
    resolveOneCast(s, { uid: u.uid, owner: u.owner, target: u.lastCastTarget, cost: 0, echo: true })
  }
}

/** The next swing, rebuilt from whoever has not attacked yet so a new Haste or Slow is honored. */
function nextBatch(s: GameState): string[] | null {
  const acted = new Set(s.attacked)
  const waiting = Object.values(s.units).filter((u) => !u.dead && !acted.has(u.uid))
  if (!waiting.length) return null
  const slowed = (u: Unit) => u.status.slowed && !u.status.haste
  const ready = waiting.filter((u) => !slowed(u))
  const pool = ready.length ? ready : waiting
  const order = attackOrder(s, pool)
  if (!order.length) {
    for (const u of pool) s.attacked.push(u.uid)
    return nextBatch(s)
  }
  const batch = [order[0]]
  while (batch.length < order.length && sameSwing(s, batch[0], order[batch.length])) batch.push(order[batch.length])
  return batch.map((u) => u.uid)
}

function resolveAttackBatch(s: GameState, uids: string[]) {
  const batch = uids.map((id) => s.units[id]).filter((u): u is Unit => !!u && !u.dead)
  if (batch.length > 1) {
    deferLethal = true
    log(s, `${batch.map((u) => fullName(u)).join(' and ')} attack at the same time.`, 'info')
  }
  for (const u of batch) basicAttack(s, u)
  if (batch.length > 1) flushPendingKills(s)
  for (const uid of uids) if (!s.attacked.includes(uid)) s.attacked.push(uid)
  retaliateAttacked(s)
}

function isCreepUnit(s: GameState, id: string) {
  const kind = s.units[id]?.kind
  return kind === 'creep' || kind === 'siege'
}

/** Tier 1 hits a creep or else Position 1. Tier 2 hits the first 3 units, creeps before heroes, for 1 each. */
function towerTargets(s: GameState, defender: PlayerId, lane: LaneId, tier: 't1' | 't2'): string[] {
  const ids = targetableLineup(s, other(defender), lane)
  if (tier === 't1') {
    const front = ids.find((id) => isCreepUnit(s, id)) ?? ids[0]
    return front ? [front] : []
  }
  const creeps = ids.filter((id) => isCreepUnit(s, id))
  const rest = ids.filter((id) => !isCreepUnit(s, id))
  return [...creeps, ...rest].slice(0, 3)
}

/** A standing tower shoots the moment the swing that hit it is done. A dead tower does not shoot. */
function retaliateTower(s: GameState, defender: PlayerId, lane: LaneId) {
  const laneKey = `${defender}:${lane}`
  if (s.towersFired.includes(laneKey)) return
  const tw = s.players[defender].structures.towers[lane]
  const tier = tw.t1 > 0 ? 't1' : tw.t2 > 0 ? 't2' : null
  if (!tier || !s.towersHit.includes(towerKey(defender, lane, tier))) return
  s.towersFired.push(laneKey)
  if (s.silencedTowers.includes(laneKey)) return
  const label = `${PLAYER_LABEL[defender]} ${ZONE_LABEL[lane]} Tier ${tier === 't1' ? 1 : 2} tower`
  const targets = towerTargets(s, defender, lane, tier)
  if (!targets.length) {
    log(s, `${label} has no attacker left to fire at.`, 'info')
    return
  }
  for (const id of targets) {
    if (s.units[id]?.dead) continue
    dealDamage(s, null, id, TOWER_DAMAGE[tier], 'tower', { label })
  }
}

function retaliateAttacked(s: GameState) {
  for (const lane of LANES) for (const defender of PLAYERS) retaliateTower(s, defender, lane)
}

function fireTowers(s: GameState) {
  log(s, 'Phase 3 — Tower aggro', 'phase')
  const already = s.towersFired.length
  retaliateAttacked(s)
  if (s.towersFired.length === already) {
    log(s, already ? 'Every attacked tower has already fired.' : 'No tower was attacked this round, so no tower fires.', 'info')
  }
  settleBossKills(s)
}

function beginRotation(s: GameState) {
  if (s.winner) {
    s.phase = 'gameover'
    return
  }
  log(s, `Rotation — each side may move ${ROTATIONS_PER_ROUND} heroes`, 'phase')
  for (const p of PLAYERS) {
    s.players[p].rotationsUsed = 0
    s.players[p].rotatedUids = []
  }
  s.phase = 'rotate'
}

/** Both players passed. Resolve the next swing, the towers, or hand the round to Rotation. */
function advanceCombat(s: GameState) {
  if (s.winner) {
    s.phase = 'gameover'
    return
  }
  deferLethal = false
  pendingKills.length = 0
  if (s.combat === 'before') {
    echoRemaining(s)
    opening(kitApi(s))
    refreshNeutralAuras(s)
    combatAuras(kitApi(s))
    contestStrikes(s)
    s.attacked = []
    s.combat = 'attacks'
    log(s, 'Phase 2 — Basic attacks (Haste, then AGI → UNI → INT → STR → Creeps, Slowed last)', 'phase')
    if (s.winner) {
      s.phase = 'gameover'
      return
    }
    // Opening is its own step. The next window is the chance to interrupt before the first swing.
    openWindow(s, false)
    return
  }
  if (s.combat === 'attacks') {
    const batch = nextBatch(s)
    if (batch) {
      resolveAttackBatch(s, batch)
      if (s.winner) {
        s.phase = 'gameover'
        return
      }
      openWindow(s, false)
      return
    }
    fireTowers(s)
    s.combat = 'towers'
    if (s.winner) {
      s.phase = 'gameover'
      return
    }
    openWindow(s, false)
    return
  }
  beginRotation(s)
}

/** The side with priority passes. Two passes in a row resolve the next part of combat. */
export function passResponse(state: GameState, p: PlayerId): GameState {
  if (state.phase !== 'response' || state.priority !== p) return state
  const s = clone(state)
  s.passes += 1
  log(s, `${PLAYER_LABEL[p]} passes.`, tone(p))
  if (s.passes >= 2) advanceCombat(s)
  else {
    s.priority = other(p)
    log(s, `${PLAYER_LABEL[s.priority]} has priority.`, 'phase')
  }
  return s
}

/** Run every remaining interrupt window by passing, for tests and the AI. */
export function resolveRound(state: GameState): GameState {
  if (state.phase !== 'response') return state
  let s = state
  for (let guard = 0; s.phase === 'response' && guard < 80; guard++) {
    const next = passResponse(s, s.priority)
    if (next === s) break
    s = next
  }
  return s
}

// ---------- rotation ----------

/** Zones a hero can rotate to: the next zone along the map chain, or along the base from a lane with no towers left. */
export function rotationTargets(s: GameState, uid: string): ZoneId[] {
  const u = s.units[uid]
  if (!u || u.dead || u.kind !== 'hero' || u.owner === 'neutral' || s.phase !== 'rotate') return []
  const pl = s.players[u.owner]
  if (pl.rotationsUsed >= ROTATIONS_PER_ROUND || pl.rotatedUids.includes(u.uid)) return []
  if (u.status.rooted || u.status.stunned || u.status.feared || u.status.banished) return []
  if (hasTag(u, 'tpRotate')) return ZONES.filter((z) => z !== u.zone)
  const zones = [...ADJACENT[u.zone]]
  if (isLane(u.zone)) {
    const tw = s.players[u.owner].structures.towers[u.zone]
    if (tw.t1 <= 0 && tw.t2 <= 0) zones.push(...BASE_ADJACENT[u.zone])
  }
  return zones
}

export function rotationBlockReason(s: GameState, p: PlayerId): string | null {
  if (s.phase !== 'rotate') return 'Not the Rotation step'
  if (s.players[p].rotationsUsed >= ROTATIONS_PER_ROUND) return 'Already rotated this round'
  return null
}

export function rotateHero(state: GameState, p: PlayerId, uid: string, zone: ZoneId): GameState {
  if (rotationBlockReason(state, p) || state.units[uid]?.owner !== p || !rotationTargets(state, uid).includes(zone)) return state
  const s = clone(state)
  const u = s.units[uid]
  const from = u.zone
  relocate(s, u, zone, false, 'move')
  u.placedRound = s.round
  s.players[p].rotationsUsed++
  s.players[p].rotatedUids.push(uid)
  log(s, `${fullName(u)} rotates from ${ZONE_LABEL[from]} to ${ZONE_LABEL[zone]}.`, tone(p))
  return s
}

export function passRotation(state: GameState, p: PlayerId): GameState {
  if (rotationBlockReason(state, p)) return state
  const s = clone(state)
  s.players[p].rotationsUsed = ROTATIONS_PER_ROUND
  return s
}

/** Cleanup and income. */
export function endRotation(state: GameState): GameState {
  if (state.phase !== 'rotate') return state
  const s = clone(state)

  if (!s.winner) {
    log(s, 'Cleanup', 'phase')
    // Heal while Curse is still on the hero. Poison and other delayed damage land after.
    for (const p of PLAYERS) {
      for (const lane of LANES) {
        const tw = s.players[p].structures.towers[lane]
        if (tw.t1 > 0 || tw.t2 > 0) continue
        for (const uid of lineup(s, p, lane)) {
          const u = s.units[uid]
          if (u.owner === p && u.kind === 'hero') heal(s, u, `${PLAYER_LABEL[p]} Ancient`)
        }
      }
    }
    endStep(kitApi(s))
    endStepDamage(kitApi(s))
    for (const u of Object.values(s.units)) {
      if (!u.dead && u.status.poisonedBy) {
        dealDamage(s, null, u.uid, 1, 'passive', { label: 'Poison Sting', sourceOwner: u.status.poisonedBy })
      }
    }
  }

  for (const z of ZONES) {
    for (const pl of PLAYERS) s.zones[z][pl] = s.zones[z][pl].filter((uid) => s.units[uid])
  }
  for (const u of Object.values(s.units)) {
    if (u.dead) {
      if (u.kind === 'hero' && !u.copy) {
        if (u.owner !== 'neutral' && u.cardId) {
          s.heroDiscard.push({
            cardId: u.cardId,
            owner: u.owner,
            buybackUsed: !!u.buybackUsed,
            buybackBlocked: !!u.buybackBlocked,
          })
        } else if (u.cardId) s.unitDiscard.push(unitCard(u.cardId, !!u.buybackUsed))
      }
      if (u.kind === 'creep' || u.kind === 'siege') s.unitDiscard.push(unitCard(u.kind))
      removeFromBoard(s, u)
      delete s.units[u.uid]
    } else if (u.kind === 'illusion') {
      removeFromBoard(s, u)
      delete s.units[u.uid]
    } else {
      const mute = !!u.foreverMute
      const silenced = !!u.foreverSilence
      const cursed = !!u.foreverCurse
      const keepShield = !!u.persistentShield && u.status.shield > 0
      u.status = freshStatus()
      u.persistentShield = false
      if (keepShield) {
        u.status.shield = 1
        u.persistentShield = true
      }
      if (mute) u.status.muted = true
      if (silenced) u.status.silenced = true
      if (cursed) u.status.cursed = true
    }
  }
  for (const p of PLAYERS) s.players[p].glyph = false
  s.silencedTowers = []
  s.resolvedUlts = []

  if (!s.winner) {
    log(s, 'Income', 'phase')
    for (const p of PLAYERS) {
      const pl = s.players[p]
      const lanes = LANES.filter((l) => lineup(s, p, l).some((uid) => s.units[uid].kind === 'hero')).length
      pl.gold += pl.killsThisRound
      pl.xp += pl.killsThisRound + lanes
      log(s, `${PLAYER_LABEL[p]} earns ${pl.killsThisRound} Gold and ${pl.killsThisRound} XP from hero kills, and ${lanes} XP from lanes held.`, tone(p))
    }
  }

  s.phase = s.winner ? 'gameover' : 'report'
  return s
}

export function nextRound(state: GameState): GameState {
  if (state.phase !== 'report') return state
  if (PLAYERS.some((p) => handCount(state.players[p]) > HAND_LIMIT)) return state
  const s = clone(state)
  startRound(s)
  return s
}

export function setSettings(state: GameState, settings: Partial<Settings>): GameState {
  const s = clone(state)
  s.settings = { ...s.settings, ...settings }
  return s
}

