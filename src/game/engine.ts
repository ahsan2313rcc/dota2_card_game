import {
  ATTACK_ORDER,
  ATTRIBUTE_COUNTERS,
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
  ULT_ORDER,
  getHero,
  getItem,
  getNeutral,
} from './cards'
import {
  ANCIENT_HP,
  BOARD_LIMIT,
  BUYBACK_COST,
  CAMPS,
  HAND_LIMIT,
  LANES,
  PLACE_PER_ROUND,
  PLAYERS,
  ROSHAN_EARLIEST_ROUND,
  ROSHAN_HP,
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

export function laneRole(player: PlayerId, zone: ZoneId): string {
  if (!isLane(zone)) return zone.startsWith(player) ? 'Home jungle' : 'Enemy jungle'
  const idx = ZONE_PRIORITY[player].indexOf(zone)
  return idx === 0 ? 'Safe' : idx === 1 ? 'Mid' : 'Off'
}

export function other(p: PlayerId): PlayerId {
  return p === 'radiant' ? 'dire' : 'radiant'
}

export function isDay(round: number) {
  return round % 2 === 1
}

export function favoredPlayer(round: number): PlayerId {
  return isDay(round) ? 'radiant' : 'dire'
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
  if (u.kind === 'hero') return getHero(u.cardId!).range === 'Melee'
  return u.kind !== 'siege'
}

export function attributeOf(u: Unit): Attribute | undefined {
  if (u.kind === 'hero') return getHero(u.cardId!).attribute
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
  return !!u && !u.dead && u.cardId === heroId && u.kind === 'hero' && !u.status.broken
}

export function lineup(s: GameState, player: PlayerId, zone: ZoneId): string[] {
  return s.zones[zone][player].filter((uid) => s.units[uid] && !s.units[uid].dead)
}

/** What an opponent can target: Banished and Invisible units are skipped. */
function targetableLineup(s: GameState, player: PlayerId, zone: ZoneId): string[] {
  return lineup(s, player, zone).filter((uid) => !s.units[uid].status.banished && !s.units[uid].status.invisible)
}

function hiddenFromEnemies(u: Unit) {
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

function isTowerCard(c: HandCard) {
  return c.type === 'item' && getItem(c.cardId).kind === 'Tower'
}

/** Cards that count toward the hand limit (tower cards are exempt). */
export function handCount(pl: PlayerState): number {
  return pl.hand.filter((c) => !isTowerCard(c)).length
}

export function standingTowers(s: GameState, p: PlayerId): number {
  const t = s.players[p].structures.towers
  return LANES.reduce((n, l) => n + (t[l].t1 > 0 ? 1 : 0) + (t[l].t2 > 0 ? 1 : 0), 0)
}

// ---------- setup ----------

export function newGame(settings: Settings = { singleUseUlt: true }, seed = Date.now()): GameState {
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
    grave: [],
    towerCards: {
      top: { t1: 'glyph', t2: 'glyph' },
      mid: { t1: 'lotus', t2: 'lotus' },
      bot: { t1: 'gate', t2: 'gate' },
    },
    glyph: false,
    arcane: false,
    rotated: false,
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
    itemDeck: [],
    itemDiscard: [],
    runeDeck: [],
    runeDiscard: [],
    bossKills: [],
    neutralDeck: [],
    neutralDiscard: [],
    ultDeclarations: [],
    towersHit: [],
    log: [],
    nextId: 1,
    seed: seed | 0,
    settings,
  }

  const copies = (kind: 'Shop' | 'Rune') =>
    ITEMS.filter((i) => i.kind === kind).flatMap((i) => Array.from({ length: ITEM_DECK_COPIES[kind] }, () => i.id))
  s.itemDeck = shuffle(s, copies('Shop'))
  s.runeDeck = shuffle(s, copies('Rune'))
  s.unitDeck = shuffle(s, [
    ...HEROES.map((h) => h.id),
    ...Array.from({ length: REGULAR_CREEPS }, () => 'creep'),
    ...Array.from({ length: SIEGE_CREEPS }, () => 'siege'),
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
    // Opening hands stay heroes. Later draws take whatever is on top of the mixed deck.
    const dealt: string[] = []
    for (let i = s.unitDeck.length - 1; i >= 0 && dealt.length < STARTING_HEROES; i--) {
      if (!isCreepId(s.unitDeck[i])) dealt.push(s.unitDeck.splice(i, 1)[0])
    }
    for (const id of dealt) s.players[p].hand.push({ iid: newId(s, 'c'), type: 'hero', cardId: id })
  }
  log(s, 'The battle for the Ancients begins. Each side is dealt 5 heroes.', 'phase')
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
    placedRound: s.round,
    fierySoul: false,
    status: freshStatus(),
    ...partial,
  }
  s.units[uid] = u
  return u
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
  s.bossKills = []
  log(s, `Round ${s.round} — ${isDay(s.round) ? 'Day (Radiant has priority)' : 'Night (Dire has priority)'}`, 'phase')
  spawnCamps(s)
  for (const p of PLAYERS) {
    const pl = s.players[p]
    if (rules(s).fountain) {
      for (const lane of LANES) {
        const tw = pl.structures.towers[lane]
        if (tw.t1 > 0 || tw.t2 > 0) continue
        for (const uid of lineup(s, p, lane)) {
          const u = s.units[uid]
          if (u.kind !== 'hero' || u.hp >= u.maxHp) continue
          u.hp += 1
          log(s, `${fullName(u)} heals 1 at the Fountain (${ZONE_LABEL[lane]} has no towers left).`, tone(p))
        }
      }
    }
    const cmBonus = heroesOnBoard(s, p).filter((u) => hasPassive(u, 'crystal_maiden')).length
    const gold = 1 + pl.bonusIncomeLanes.length + cmBonus
    pl.gold += gold
    pl.xp += 1
    pl.placedThisRound = 0
    pl.killsThisRound = 0
    pl.rotated = false
    log(s, `Upkeep: ${PLAYER_LABEL[p]} gains ${gold} Gold and 1 XP${cmBonus ? ' (Arcane Aura)' : ''}.`, tone(p))
  }
}

// ---------- draw ----------

export type DrawType = 'unit' | 'item'

function isCreepId(id: string): id is CreepKind {
  return id === 'creep' || id === 'siege'
}

function deckSize(s: GameState, type: DrawType) {
  if (type === 'item') return s.itemDeck.length + s.itemDiscard.length
  return s.unitDeck.length + s.unitDiscard.length + PLAYERS.reduce((n, p) => n + s.players[p].grave.length, 0)
}

export function drawBlockReason(s: GameState, p: PlayerId, type: DrawType): string | null {
  if (s.phase !== 'draw') return 'Not the draw step'
  const pl = s.players[p]
  if (pl.gold < 1) return 'Need 1 Gold'
  if (handCount(pl) >= HAND_LIMIT) return `Hand limit (${HAND_LIMIT})`
  if (deckSize(s, type) === 0) return 'Deck is empty'
  return null
}

function takeFromDeck(s: GameState, type: DrawType): string | undefined {
  if (type === 'item') {
    if (s.itemDeck.length === 0) {
      s.itemDeck = shuffle(s, s.itemDiscard)
      s.itemDiscard = []
    }
    return s.itemDeck.pop()
  }
  if (s.unitDeck.length === 0) {
    const graves = PLAYERS.flatMap((p) => s.players[p].grave)
    if (graves.length) log(s, 'The deck is empty: discards and both graves are shuffled back in.', 'info')
    s.unitDeck = shuffle(s, [...s.unitDiscard, ...graves])
    s.unitDiscard = []
    for (const p of PLAYERS) s.players[p].grave = []
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
  const id = takeFromDeck(s, type)
  if (!id) return state
  s.players[p].gold -= 1
  const cardType = type === 'item' ? 'item' : isCreepId(id) ? 'creep' : 'hero'
  s.players[p].hand.push({ iid: newId(s, 'c'), type: cardType, cardId: id })
  const name = type === 'item' ? 'an item' : cardType === 'hero' ? getHero(id).name : id === 'siege' ? 'a Siege Creep' : 'a Lane Creep'
  log(s, `${PLAYER_LABEL[p]} spends 1 Gold and draws ${name}.`, tone(p))
  return s
}

/** Buyback cost by standing towers compared with the opponent. */
export function buybackCost(s: GameState, p: PlayerId): number {
  const diff = standingTowers(s, p) - standingTowers(s, other(p))
  return BUYBACK_COST[diff > 0 ? 'ahead' : diff < 0 ? 'behind' : 'even']
}

export function buybackBlockReason(s: GameState, p: PlayerId, heroId: string): string | null {
  if (!rules(s).buyback) return 'Buyback is off'
  if (s.phase !== 'draw') return 'Buyback happens during the Draw step'
  const pl = s.players[p]
  if (!pl.grave.includes(heroId)) return 'Not in your grave'
  if (handCount(pl) >= HAND_LIMIT) return `Hand limit (${HAND_LIMIT})`
  if (pl.gold < buybackCost(s, p)) return `Need ${buybackCost(s, p)} Gold`
  return null
}

export function buyback(state: GameState, p: PlayerId, heroId: string): GameState {
  if (buybackBlockReason(state, p, heroId)) return state
  const s = clone(state)
  const pl = s.players[p]
  const cost = buybackCost(s, p)
  pl.gold -= cost
  pl.grave.splice(pl.grave.lastIndexOf(heroId), 1)
  pl.hand.push({ iid: newId(s, 'c'), type: 'hero', cardId: heroId })
  log(s, `${PLAYER_LABEL[p]} buys back ${getHero(heroId).name} for ${cost} Gold.`, tone(p))
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

function onTowerLost(s: GameState, defender: PlayerId, lane: LaneId, tier: TowerTier) {
  if (!rules(s).towerCards) return
  const pl = s.players[defender]
  const cardId = pl.towerCards[lane][tier]
  pl.gold += 1
  pl.hand.push({ iid: newId(s, 'c'), type: 'item', cardId })
  log(s, `${PLAYER_LABEL[defender]} rallies: +1 Gold and the tower's hidden card, ${getItem(cardId).name}.`, tone(defender))
}

function giveCard(s: GameState, p: PlayerId, card: Omit<HandCard, 'iid'>, label: string) {
  if (handCount(s.players[p]) >= HAND_LIMIT) {
    log(s, `${PLAYER_LABEL[p]}'s hand is full — ${label} is lost.`, 'info')
    if (card.type === 'item') discardItem(s, card.cardId)
    return
  }
  s.players[p].hand.push({ ...card, iid: newId(s, 'c') })
  log(s, `${PLAYER_LABEL[p]} receives ${label}.`, tone(p))
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
  const card = state.players[p].hand.find((c) => c.iid === handIid && c.type === 'hero')
  if (!card) return state
  const s = clone(state)
  const pl = s.players[p]
  pl.hand = pl.hand.filter((c) => c.iid !== handIid)
  pl.placedThisRound++
  const hp = getHero(card.cardId).maxHp ?? 2
  const u = makeUnit(s, { kind: 'hero', cardId: card.cardId, handIid, owner: p, zone, hp })
  s.zones[zone][p].push(u.uid)
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
    pl.hand.push({ iid: u.handIid ?? newId(s, 'c'), type: 'hero', cardId: u.cardId! })
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
  }
  s.phase = 'items'
  return s
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

/** `spell` marks debuffs from Ultimates and items — Immunity blocks those. */
function applyStatus(s: GameState, from: Owner, t: Unit, key: BoolStatus, label: string, spell: boolean) {
  if (t.dead) return
  if (from !== t.owner && spell && t.status.immune) {
    log(s, `${fullName(t)} is Immune to ${label}.`, 'info')
    return
  }
  t.status[key] = true
  if (key === 'banished') t.status.invulnerable = true
  log(s, `${fullName(t)} is ${STATUS_VERB[key]} by ${label}.`, tone(from))
}

function heal(s: GameState, u: Unit, label: string) {
  if (u.dead || u.hp >= u.maxHp) return
  if (u.status.cursed) {
    log(s, `${fullName(u)} is Cursed and cannot heal (${label}).`, 'info')
    return
  }
  u.hp = u.maxHp
  log(s, `${fullName(u)} heals to Healthy (${label}).`, tone(u.owner))
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
      if (itemId === 'refresher' || itemId === 'refresher_shard') return allies.filter((u) => u.ultUsed).map((u) => u.uid)
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
  if (item.target === 'lane') return heroesOnBoard(s, p).some((u) => !u.status.rooted) ? [...LANES] : []
  if (item.target === 'allyHeroToLane' && heroUid) return LANES.filter((l) => s.units[heroUid]?.zone !== l)
  return []
}

export function itemBlockReason(s: GameState, p: PlayerId, card: HandCard): string | null {
  if (s.phase !== 'items') return 'Items are played during the Item step'
  const item = getItem(card.cardId)
  if (item.target === 'lane') return itemLanes(s, p, card.cardId).length ? null : 'No hero can move'
  if (item.target !== 'none' && itemTargets(s, p, card.cardId).length === 0) return 'No valid targets'
  return null
}

function teleport(s: GameState, u: Unit, lane: LaneId) {
  removeFromBoard(s, u)
  u.zone = lane
  u.placedRound = s.round
  s.zones[lane][u.owner as PlayerId].push(u.uid)
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
  } else if (item.id === 'rune_arcane') {
    pl.arcane = true
  } else if (t) {
    const st = t.status
    switch (item.id) {
      case 'tango':
        heal(s, t, 'Tango')
        break
      case 'dagon':
        dealDamage(s, null, t.uid, 1, 'item', { label: 'Dagon', sourceOwner: p })
        break
      case 'blade_mail':
        st.bladeMail = true
        break
      case 'vanguard':
        st.shield += 1
        break
      case 'bkb':
        st.immune = true
        st.stunned = st.silenced = st.disarmed = st.rooted = st.muted = st.broken = false
        break
      case 'desolator':
        st.bonusDamage += 1
        break
      case 'refresher':
        t.ultUsed = false
        break
      case 'mkb':
        st.accuracy = true
        break
      case 'orchid':
        applyStatus(s, p, t, 'silenced', 'Orchid Malevolence', true)
        applyStatus(s, p, t, 'muted', 'Orchid Malevolence', true)
        break
      case 'silver_edge':
        applyStatus(s, p, t, 'broken', 'Silver Edge', true)
        break
      case 'atos':
        applyStatus(s, p, t, 'rooted', 'Rod of Atos', true)
        break
      case 'euls':
        applyStatus(s, p, t, 'banished', "Eul's Scepter", true)
        break
      case 'tp':
        if (lane) teleport(s, t, lane)
        break
      case 'aegis':
        st.aegis = true
        break
      case 'refresher_shard':
        t.ultUsed = false
        break
      case 'rune_regen':
        heal(s, t, 'Regeneration Rune')
        break
      case 'rune_dd':
        st.bonusDamage += 1
        break
      case 'rune_shield':
        st.shield += 1
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
    if (hasPassive(t, 'zeus') && t.owner === p) {
      const front = targetableLineup(s, other(p), t.zone)[0]
      if (front) dealDamage(s, t, front, 1, 'passive', { label: 'Static Field' })
    }
  }
  discardItem(s, item.id)
  return s
}

export function endItems(state: GameState): GameState {
  if (state.phase !== 'items') return state
  const s = clone(state)
  s.phase = 'ults'
  return s
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
  switch (getHero(u.cardId).ult.target) {
    case 'none':
      return []
    case 'enemyHeroInLane':
      return enemyHeroes.filter((x) => x.zone === u.zone).map((x) => x.uid)
    case 'enemyUnitInLane':
      return enemies.filter((x) => x.zone === u.zone).map((x) => x.uid)
    case 'enemyHeroAdjacentLane':
      return enemyHeroes.filter((x) => ADJACENT[u.zone].includes(x.zone)).map((x) => x.uid)
    case 'enemyUnitAnyLane':
      return enemies.map((x) => x.uid)
  }
}

export function ultNeedsTarget(u: Unit) {
  return u.kind === 'hero' && getHero(u.cardId!).ult.target !== 'none'
}

function castPreventedReason(s: GameState, u: Unit): string | null {
  if (u.dead) return 'Slain'
  if (s.settings.singleUseUlt && u.ultUsed) return 'Ultimate already used'
  if (u.status.banished) return 'Banished'
  if (u.status.stunned) return 'Stunned'
  if (u.status.silenced) return 'Silenced'
  if (u.owner !== 'neutral' && isPos1(s, u) && passiveInZone(s, other(u.owner), u.zone, 'lion')) return 'Mana Drained by Lion'
  return null
}

export function ultBlockReason(s: GameState, uid: string): string | null {
  const u = s.units[uid]
  if (!u || u.kind !== 'hero' || u.owner === 'neutral') return 'Not a hero'
  if (s.phase !== 'ults') return 'Ultimates are declared during the ULT step'
  if (s.ultDeclarations.some((d) => d.uid === uid)) return 'Already declared'
  const r = castPreventedReason(s, u)
  if (r) return r
  if (s.players[u.owner].xp < 1 && !s.players[u.owner].arcane) return 'Needs 1 XP'
  if (ultNeedsTarget(u) && ultTargets(s, uid).length === 0) return 'No valid targets'
  return null
}

export function declareUlt(state: GameState, uid: string, target?: string): GameState {
  if (ultBlockReason(state, uid)) return state
  const u = state.units[uid]
  if (ultNeedsTarget(u) && (!target || !ultTargets(state, uid).includes(target))) return state
  const owner = u.owner as PlayerId
  const s = clone(state)
  const pl = s.players[owner]
  const free = pl.arcane
  if (free) pl.arcane = false
  else pl.xp -= 1
  s.ultDeclarations.push({ uid, owner, target, free })
  return s
}

function refundUlt(s: GameState, d: { owner: PlayerId; free?: boolean }) {
  if (d.free) s.players[d.owner].arcane = true
  else s.players[d.owner].xp += 1
}

export function cancelUlt(state: GameState, uid: string): GameState {
  const d = state.ultDeclarations.find((x) => x.uid === uid)
  if (!d || state.phase !== 'ults') return state
  const s = clone(state)
  refundUlt(s, d)
  s.ultDeclarations = s.ultDeclarations.filter((x) => x.uid !== uid)
  return s
}

// ---------- damage model ----------

/** `reflect` is the Tormentor's returned damage: Shield blocks it, hero passives do not. */
type DamageKind = 'ult' | 'attack' | 'tower' | 'item' | 'passive' | 'reflect' | 'self'

interface DamageOpts {
  label?: string
  sourceOwner?: PlayerId
}

function counters(a: Unit, b: Unit) {
  const aa = attributeOf(a)
  const ba = attributeOf(b)
  return !!aa && !!ba && ATTRIBUTE_COUNTERS[aa] === ba
}

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
  const front = targetableLineup(s, other(side), torm.zone)[0]
  if (front) dealDamage(s, torm, front, amount, 'reflect', { label })
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
  const pierce = !!src?.status.pierce

  if (kind !== 'self' && (st.banished || st.invulnerable)) {
    log(s, `${fullName(t)} is ${st.banished ? 'Banished' : 'Invulnerable'} — ${label} has no effect.`, 'info')
    return 0
  }
  if (fromEnemy && (kind === 'ult' || kind === 'item')) {
    if (st.immune) {
      log(s, `${fullName(t)} is Immune to ${label}.`, 'info')
      return 0
    }
    if (kind === 'ult' && hasPassive(t, 'juggernaut')) {
      log(s, `${fullName(t)} spins through ${label} untouched (Blade Fury).`, 'info')
      return 0
    }
  }
  if (kind === 'attack' && !accuracy) {
    if (st.evade > 0) {
      st.evade--
      log(s, `${fullName(t)} Evades ${label}'s attack.`, 'info')
      return 0
    }
    if (hasPassive(t, 'phantom_assassin') && !st.blurUsed) {
      st.blurUsed = true
      log(s, `${fullName(t)} Evades ${label}'s attack (Blur).`, 'info')
      return 0
    }
  }
  if (kind === 'attack' && !pierce) {
    if (hasPassive(t, 'windranger') && src && isMelee(src)) {
      log(s, `${fullName(t)} takes no damage from ${label}'s melee attack (Windrun).`, 'info')
      return 0
    }
    if (t.owner !== 'neutral' && !st.frostShieldUsed && isPos1(s, t) && passiveInZone(s, t.owner, t.zone, 'lich')) {
      st.frostShieldUsed = true
      log(s, `${fullName(t)} negates ${label}'s attack (Frost Shield).`, 'info')
      return 0
    }
  }
  if ((kind === 'attack' || kind === 'tower' || kind === 'reflect') && !pierce && st.shield > 0) {
    st.shield--
    log(s, `${fullName(t)}'s Shield blocks ${label}.`, 'info')
    return 0
  }
  if (src && (src.kind === 'creep' || src.kind === 'siege') && hasPassive(t, 'tidehunter')) {
    log(s, `${fullName(t)} shrugs off the creep hit (Kraken Shell).`, 'info')
    return 0
  }
  if (!pierce && kind !== 'self' && kind !== 'reflect' && hasPassive(t, 'abaddon') && !st.aphoticUsed) {
    st.aphoticUsed = true
    log(s, `${fullName(t)} absorbs ${label} (Aphotic Shield).`, 'info')
    return 0
  }
  if (st.borrowedTime && kind !== 'self') {
    log(s, `${label} feeds ${fullName(t)}'s Borrowed Time.`, 'info')
    t.hp = t.maxHp
    return 0
  }

  let dmg = amount
  if (kind === 'attack' && src && counters(src, t)) {
    dmg = t.hp
    log(s, `${attributeOf(src)} counters ${attributeOf(t)}: ${label}'s strike is lethal!`, 'kill')
  }
  if (dmg <= 0) {
    log(s, `${label} deals no damage to ${fullName(t)}.`, 'info')
    return 0
  }

  t.hp -= dmg
  if (t.hp > 0) {
    log(s, `${label} deals ${dmg} to ${fullName(t)} (${t.hp}/${t.maxHp} left).`, 'damage')
  } else {
    handleLethal(s, t, src, label, srcOwner)
  }
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
      pl.xp += 1
      pl.gold += 1
      log(s, `${PLAYER_LABEL[byPlayer]} clears the camp: +1 XP, +1 Gold.`, tone(byPlayer))
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
}

// ---------- combat ----------

function priorityKey(s: GameState, u: Unit): number[] {
  if (u.owner === 'neutral') return [99, 2, 0]
  const zoneRank = ZONE_PRIORITY[u.owner].indexOf(u.zone)
  const fav = u.owner === favoredPlayer(s.round) ? 0 : 1
  const pos = s.zones[u.zone][u.owner].indexOf(u.uid)
  return [zoneRank, fav, pos]
}

function byPriority(s: GameState) {
  return (a: Unit, b: Unit) => {
    const ka = priorityKey(s, a)
    const kb = priorityKey(s, b)
    for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i]
    return 0
  }
}

function castUlt(s: GameState, u: Unit, targetUid?: string) {
  const hero = getHero(u.cardId!)
  const ult = hero.ult.name
  const owner = u.owner as PlayerId
  const enemies = () => enemyLine(s, u)
  const target = targetUid ? s.units[targetUid] : undefined
  const hit = (uid: string, n: number) => dealDamage(s, u, uid, n, 'ult', { label: `${hero.name}'s ${ult}` })

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
  for (const v of victims) applyStatus(s, 'neutral', v, 'disarmed', 'Roar', true)
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
    if (k.kind === 'roshan') {
      s.players[to].xp += 3
      log(s, `${PLAYER_LABEL[to]} claims Roshan's bounty: +3 XP.`, tone(to))
    }
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
  if (hasPassive(u, 'sniper')) {
    const units = pool.map((x) => s.units[x])
    const pick =
      units.find((x) => counters(u, x)) ??
      units.find((x) => x.kind === 'hero' && x.hp < x.maxHp) ??
      units.find((x) => x.kind === 'hero') ??
      units[0]
    return [pick.uid]
  }
  if (hasPassive(u, 'sven') || hasPassive(u, 'luna')) return pool.slice(0, 2)
  return [pool[0]]
}

function attackDamage(s: GameState, u: Unit): number {
  if (u.owner !== 'neutral' && isPos1(s, u) && passiveInZone(s, other(u.owner), u.zone, 'bane')) return 0
  return 1 + u.status.bonusDamage
}

function towerKey(defender: PlayerId, lane: LaneId, tier: 't1' | 't2') {
  return `${defender}:${lane}:${tier}`
}

function attackStructure(s: GameState, u: Unit, lane: LaneId) {
  const owner = u.owner as PlayerId
  const enemy = other(owner)
  const st = s.players[enemy].structures
  const tw = st.towers[lane]
  const dmg = u.kind === 'siege' ? 2 : 1 + u.status.bonusDamage
  const who = fullName(u)
  if ((tw.t1 > 0 || tw.t2 > 0) && s.players[enemy].glyph) {
    log(s, `${who}'s attack bounces off the ${PLAYER_LABEL[enemy]} ${ZONE_LABEL[lane]} tower (Glyph).`, 'info')
    return
  }
  if (tw.t1 > 0 || tw.t2 > 0) {
    const key = towerKey(enemy, lane, tw.t1 > 0 ? 't1' : 't2')
    if (!s.towersHit.includes(key)) s.towersHit.push(key)
  }
  if (tw.t1 > 0) {
    tw.t1 = Math.max(0, tw.t1 - dmg)
    log(s, `${who} hits the ${PLAYER_LABEL[enemy]} ${ZONE_LABEL[lane]} Tier 1 tower for ${dmg} (${tw.t1}/${TOWER_HP.t1}).`, 'structure')
    if (tw.t1 === 0) {
      log(s, `${PLAYER_LABEL[enemy]} ${ZONE_LABEL[lane]} Tier 1 tower is destroyed!`, 'structure')
      onTowerLost(s, enemy, lane, 't1')
    }
  } else if (tw.t2 > 0) {
    tw.t2 = Math.max(0, tw.t2 - dmg)
    log(s, `${who} hits the ${PLAYER_LABEL[enemy]} ${ZONE_LABEL[lane]} Tier 2 tower for ${dmg} (${tw.t2}/${TOWER_HP.t2}).`, 'structure')
    if (tw.t2 === 0) {
      log(s, `${PLAYER_LABEL[enemy]} ${ZONE_LABEL[lane]} Tier 2 tower is destroyed!`, 'structure')
      onTowerLost(s, enemy, lane, 't2')
      const pl = s.players[owner]
      if (!pl.bonusIncomeLanes.includes(lane)) {
        pl.bonusIncomeLanes.push(lane)
        log(s, `${PLAYER_LABEL[owner]} breaks ${ZONE_LABEL[lane]} lane: +1 passive Gold per round.`, tone(owner))
      }
    }
  } else {
    st.ancient = Math.max(0, st.ancient - dmg)
    log(s, `${who} strikes the ${PLAYER_LABEL[enemy]} Ancient for ${dmg} (${st.ancient}/${ANCIENT_HP}).`, 'structure')
  }
  checkWinner(s)
}

function neutralAttack(s: GameState, u: Unit) {
  const targets =
    u.kind === 'roshan'
      ? PLAYERS.flatMap((p) => targetableLineup(s, p, u.zone))
      : PLAYERS.map((p) => targetableLineup(s, p, u.zone)[0]).filter(Boolean)
  if (u.status.blinded && !u.status.accuracy) {
    if (targets.length) log(s, `${fullName(u)} is Blinded and misses.`, 'info')
    return
  }
  for (const tid of targets) {
    if (u.dead) break
    const t = s.units[tid]
    const dealt = dealDamage(s, u, tid, attackDamage(s, u), 'attack')
    if (dealt > 0 && !t.dead) {
      if (u.cardId === 'ice_shaman') applyStatus(s, 'neutral', t, 'slowed', 'Ice Shaman', false)
      if (u.cardId === 'dragon') applyStatus(s, 'neutral', t, 'blinded', 'Dragon smoke', false)
    }
    reflect(s, u, t, dealt)
  }
}

function reflect(s: GameState, attacker: Unit, t: Unit, dealt: number) {
  if (attacker.dead) return
  if (!t.dead && hasPassive(t, 'axe')) dealDamage(s, t, attacker.uid, 1, 'passive', { label: 'Counter Helix' })
  if (!t.dead && hasPassive(t, 'viper')) dealDamage(s, t, attacker.uid, 1, 'passive', { label: 'Corrosive Skin' })
  if (t.status.bladeMail && dealt > 0) dealDamage(s, t, attacker.uid, dealt, 'passive', { label: 'Blade Mail' })
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
  const dmg = attackDamage(s, u)
  if (dmg === 0) {
    log(s, `${fullName(u)} is Enfeebled by Bane and deals no damage.`, 'info')
    return
  }
  for (const tid of targets) {
    if (u.dead) break
    const t = s.units[tid]
    if (!t || t.dead) continue
    const dealt = dealDamage(s, u, tid, dmg, 'attack')
    if (dealt > 0 && !u.status.broken) {
      if (u.cardId === 'lina') u.fierySoul = true
      if (u.cardId === 'anti_mage' && t.kind === 'hero' && !t.dead) applyStatus(s, u.owner, t, 'silenced', 'Mana Break', false)
      if (u.cardId === 'venomancer' && !t.dead) t.status.poisonedBy = u.owner as PlayerId
    }
    reflect(s, u, t, dealt)
  }
}

function basicAttack(s: GameState, u: Unit) {
  if (u.dead || s.winner || u.status.banished) return
  if (u.status.stunned) {
    log(s, `${fullName(u)} is Stunned and cannot attack.`, 'info')
    return
  }
  if (u.status.disarmed) {
    log(s, `${fullName(u)} is Disarmed and cannot attack.`, 'info')
    return
  }
  singleAttack(s, u)
  if (u.status.focusFire) singleAttack(s, u)
}

/** Hasted first, then AGI → UNI → INT → STR → creeps; each bracket sorted by lane priority and day/night. */
function attackOrder(s: GameState, all: Unit[]): Unit[] {
  const attackers = all.filter(canAttack)
  const order = attackers.filter((u) => u.status.haste).sort(byPriority(s))
  const units = attackers.filter((u) => !u.status.haste)
  for (const attr of ATTACK_ORDER) {
    const group = units.filter((u) => attributeOf(u) === attr).sort(byPriority(s))
    if (attr === 'INT') group.sort((a, b) => Number(b.fierySoul && !b.status.broken) - Number(a.fierySoul && !a.status.broken))
    order.push(...group)
  }
  order.push(...units.filter((u) => !attributeOf(u)).sort(byPriority(s)))
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

/** Phases 1–3, then the Rotation step. Cleanup and income follow in `endRotation`. */
export function resolveRound(state: GameState): GameState {
  if (state.phase !== 'ults') return state
  const s = clone(state)
  s.towersHit = []

  log(s, 'Phase 1 — Ultimates (STR → INT → UNI → AGI)', 'phase')
  type Cast = { kind: 'hero'; u: Unit; target?: string; free?: boolean } | { kind: 'roar'; u: Unit }
  const casts: Cast[] = s.ultDeclarations.map((d) => ({ kind: 'hero', u: s.units[d.uid], target: d.target, free: d.free }))
  for (const camp of CAMPS) {
    const rosh = campNeutral(s, camp)
    if (rosh?.kind === 'roshan' && rosh.hp === rosh.maxHp && PLAYERS.some((p) => lineup(s, p, camp).length > 0)) {
      casts.push({ kind: 'roar', u: rosh })
    }
  }
  casts.sort((a, b) => {
    const ra = ULT_ORDER.indexOf(attributeOf(a.u)!)
    const rb = ULT_ORDER.indexOf(attributeOf(b.u)!)
    return ra !== rb ? ra - rb : byPriority(s)(a.u, b.u)
  })
  if (casts.length === 0) log(s, 'No Ultimates were declared.', 'info')
  for (const c of casts) {
    if (s.winner) break
    if (c.kind === 'roar') {
      if (!c.u.dead && !c.u.status.stunned) roshanRoar(s, c.u)
      continue
    }
    const u = c.u
    const owner = u.owner as PlayerId
    const reason = castPreventedReason(s, u)
    const target = c.target ? s.units[c.target] : undefined
    const targetGone = c.target && (!target || target.dead || hiddenFromEnemies(target))
    if (reason || targetGone) {
      refundUlt(s, { owner, free: c.free })
      log(s, `${fullName(u)}'s ${getHero(u.cardId!).ult.name} fizzles (${reason ?? 'target gone'}); ${c.free ? 'Arcane rune' : 'XP'} refunded.`, 'info')
      continue
    }
    log(s, `${fullName(u)} casts ${getHero(u.cardId!).ult.name}${target ? ` on ${fullName(target)}` : ''}.`, tone(owner))
    u.ultUsed = true
    castUlt(s, u, c.target)
  }

  if (!s.winner) {
    log(s, 'Phase 2 — Basic attacks (Haste, then AGI → UNI → INT → STR → Creeps, Slowed last)', 'phase')
    const isSlowed = (u: Unit) => u.status.slowed && !u.status.haste
    const alive = Object.values(s.units).filter((u) => !u.dead)
    const acted = new Set<string>()
    for (const u of attackOrder(s, alive.filter((x) => !isSlowed(x)))) {
      if (isSlowed(u)) continue
      acted.add(u.uid)
      basicAttack(s, u)
    }
    const slowed = Object.values(s.units).filter((u) => !u.dead && isSlowed(u) && !acted.has(u.uid))
    for (const u of attackOrder(s, slowed)) basicAttack(s, u)
  }

  if (!s.winner) {
    log(s, 'Phase 3 — Tower aggro', 'phase')
    let fired = false
    for (const lane of LANES) {
      for (const defender of PLAYERS) {
        const tw = s.players[defender].structures.towers[lane]
        for (const tier of ['t1', 't2'] as const) {
          // Only a tower that took damage this round and is still standing fires back.
          if (!s.towersHit.includes(towerKey(defender, lane, tier)) || tw[tier] <= 0) continue
          const label = `${PLAYER_LABEL[defender]} ${ZONE_LABEL[lane]} Tier ${tier === 't1' ? 1 : 2} tower`
          const front = targetableLineup(s, other(defender), lane)[0]
          fired = true
          if (!front) {
            log(s, `${label} has no attacker left to fire at.`, 'info')
            continue
          }
          dealDamage(s, null, front, TOWER_DAMAGE[tier], 'tower', { label })
        }
      }
    }
    if (!fired) log(s, 'No surviving tower took damage this round, so no tower fires.', 'info')
  }

  settleBossKills(s)
  if (s.winner) {
    s.phase = 'gameover'
    return s
  }
  log(s, `Rotation — each side may move one hero (${PLAYER_LABEL[favoredPlayer(s.round)]} first)`, 'phase')
  for (const p of PLAYERS) s.players[p].rotated = false
  s.phase = 'rotate'
  return s
}

// ---------- rotation ----------

/** Zones a hero can rotate to: the next zone along the map chain, or along the base from a lane with no towers left. */
export function rotationTargets(s: GameState, uid: string): ZoneId[] {
  const u = s.units[uid]
  if (!u || u.dead || u.kind !== 'hero' || u.owner === 'neutral' || s.phase !== 'rotate') return []
  if (s.players[u.owner].rotated || u.status.rooted || u.status.stunned || u.status.banished) return []
  const zones = [...ADJACENT[u.zone]]
  if (isLane(u.zone)) {
    const tw = s.players[u.owner].structures.towers[u.zone]
    if (tw.t1 <= 0 && tw.t2 <= 0) zones.push(...BASE_ADJACENT[u.zone])
  }
  return zones
}

export function rotationBlockReason(s: GameState, p: PlayerId): string | null {
  if (s.phase !== 'rotate') return 'Not the Rotation step'
  if (s.players[p].rotated) return 'Already rotated this round'
  return null
}

export function rotateHero(state: GameState, p: PlayerId, uid: string, zone: ZoneId): GameState {
  if (rotationBlockReason(state, p) || state.units[uid]?.owner !== p || !rotationTargets(state, uid).includes(zone)) return state
  const s = clone(state)
  const u = s.units[uid]
  const from = u.zone
  removeFromBoard(s, u)
  u.zone = zone
  u.placedRound = s.round
  s.zones[zone][p].push(u.uid)
  s.players[p].rotated = true
  log(s, `${fullName(u)} rotates from ${ZONE_LABEL[from]} to ${ZONE_LABEL[zone]}.`, tone(p))
  return s
}

export function passRotation(state: GameState, p: PlayerId): GameState {
  if (rotationBlockReason(state, p)) return state
  const s = clone(state)
  s.players[p].rotated = true
  return s
}

/** Cleanup and income. */
export function endRotation(state: GameState): GameState {
  if (state.phase !== 'rotate') return state
  const s = clone(state)

  if (!s.winner) {
    log(s, 'Cleanup', 'phase')
    for (const u of Object.values(s.units)) {
      if (!u.dead && u.status.poisonedBy) {
        dealDamage(s, null, u.uid, 1, 'passive', { label: 'Poison Sting', sourceOwner: u.status.poisonedBy })
      }
    }
  }

  for (const u of Object.values(s.units)) {
    if (u.dead) {
      if (u.kind === 'hero') {
        if (rules(s).buyback && u.owner !== 'neutral') s.players[u.owner].grave.push(u.cardId!)
        else s.unitDiscard.push(u.cardId!)
      }
      if (u.kind === 'creep' || u.kind === 'siege') s.unitDiscard.push(u.kind)
      removeFromBoard(s, u)
      delete s.units[u.uid]
    } else if (u.kind === 'illusion') {
      removeFromBoard(s, u)
      delete s.units[u.uid]
    } else {
      u.status = freshStatus()
    }
  }
  for (const p of PLAYERS) s.players[p].glyph = false

  if (!s.winner) {
    log(s, 'Income', 'phase')
    for (const p of PLAYERS) {
      const pl = s.players[p]
      const lanes = LANES.filter((l) => lineup(s, p, l).some((uid) => s.units[uid].kind === 'hero')).length
      pl.gold += pl.killsThisRound
      pl.xp += lanes
      log(s, `${PLAYER_LABEL[p]} earns ${pl.killsThisRound} Gold from kills and ${lanes} XP from lanes held.`, tone(p))
    }
  }

  s.phase = s.winner ? 'gameover' : 'report'
  return s
}

export function nextRound(state: GameState): GameState {
  if (state.phase !== 'report') return state
  const s = clone(state)
  startRound(s)
  return s
}

export function setSettings(state: GameState, settings: Partial<Settings>): GameState {
  const s = clone(state)
  s.settings = { ...s.settings, ...settings }
  return s
}

