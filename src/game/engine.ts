import {
  ATTACK_ORDER,
  ATTRIBUTE_COUNTERS,
  HEROES,
  ITEMS,
  ITEM_COPIES,
  REGULAR_CREEPS,
  SIEGE_CREEPS,
  ULT_ORDER,
  getHero,
  getItem,
} from './cards'
import {
  ANCIENT_HP,
  BOARD_LIMIT,
  HAND_LIMIT,
  LANES,
  PLACE_PER_ROUND,
  PLAYERS,
  STARTING_HEROES,
  TOWER_DAMAGE,
  TOWER_HP,
  type GameState,
  type HandCard,
  type LaneId,
  type LogTone,
  type PlayerId,
  type PlayerState,
  type RoundStatus,
  type Settings,
  type Unit,
} from './types'

// ---------- basics ----------

export const LANE_PRIORITY: Record<PlayerId, LaneId[]> = {
  radiant: ['bot', 'mid', 'top'],
  dire: ['top', 'mid', 'bot'],
}

export const LANE_LABEL: Record<LaneId, string> = { top: 'Top', mid: 'Mid', bot: 'Bottom' }
export const PLAYER_LABEL: Record<PlayerId, string> = { radiant: 'Radiant', dire: 'Dire' }

export function laneRole(player: PlayerId, lane: LaneId): 'Safe' | 'Mid' | 'Off' {
  const idx = LANE_PRIORITY[player].indexOf(lane)
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
    disarmed: false,
    slowed: false,
    bkb: false,
    bladeMail: false,
    borrowedTime: false,
    reincarnation: false,
    godsStrength: false,
    focusFire: false,
    poisoned: false,
    noHeal: false,
    blurUsed: false,
    aphoticUsed: false,
    frostShieldUsed: false,
    vanguardUsed: false,
    attackedStructure: false,
  }
}

export function unitName(u: Unit): string {
  if (u.kind === 'hero' && u.cardId) return getHero(u.cardId).name
  return u.kind === 'siege' ? 'Siege Creep' : 'Creep'
}

export function fullName(u: Unit): string {
  return `${PLAYER_LABEL[u.owner]} ${unitName(u)}`
}

function tone(p: PlayerId): LogTone {
  return p
}

export function isMelee(u: Unit): boolean {
  if (u.kind === 'hero' && u.cardId) return getHero(u.cardId).range === 'Melee'
  return u.kind === 'creep'
}

export function attributeOf(u: Unit) {
  return u.kind === 'hero' && u.cardId ? getHero(u.cardId).attribute : undefined
}

export function lineup(s: GameState, player: PlayerId, lane: LaneId): string[] {
  return s.lanes[lane][player].filter((uid) => s.units[uid] && !s.units[uid].dead)
}

export function heroesOnBoard(s: GameState, player: PlayerId): Unit[] {
  return Object.values(s.units).filter((u) => u.owner === player && u.kind === 'hero' && !u.dead)
}

function isPos1(s: GameState, u: Unit) {
  return lineup(s, u.owner, u.lane)[0] === u.uid
}

function aliveHeroInLane(s: GameState, owner: PlayerId, lane: LaneId, cardId: string) {
  return lineup(s, owner, lane).some((uid) => s.units[uid].cardId === cardId)
}

function enemyUnitsInLane(s: GameState, u: Unit): Unit[] {
  return lineup(s, other(u.owner), u.lane).map((uid) => s.units[uid])
}

function clone(s: GameState): GameState {
  return structuredClone(s)
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
  })

  const s: GameState = {
    round: 0,
    phase: 'draw',
    players: { radiant: blankPlayer('radiant'), dire: blankPlayer('dire') },
    units: {},
    lanes: {
      top: { radiant: [], dire: [] },
      mid: { radiant: [], dire: [] },
      bot: { radiant: [], dire: [] },
    },
    heroDeck: [],
    heroDiscard: [],
    itemDeck: [],
    itemDiscard: [],
    creepDeck: [],
    ultDeclarations: [],
    log: [],
    nextId: 1,
    seed: seed | 0,
    settings,
  }

  s.heroDeck = shuffle(s, HEROES.map((h) => h.id))
  s.itemDeck = shuffle(
    s,
    ITEMS.flatMap((i) => Array.from({ length: ITEM_COPIES }, () => i.id)),
  )
  s.creepDeck = freshCreepDeck(s)

  for (const p of PLAYERS) {
    for (let i = 0; i < STARTING_HEROES; i++) {
      const id = s.heroDeck.pop()
      if (id) s.players[p].hand.push({ iid: newId(s, 'c'), type: 'hero', cardId: id })
    }
  }
  log(s, 'The battle for the Ancients begins. Each side is dealt 5 heroes.', 'phase')
  startRound(s)
  return s
}

function freshCreepDeck(s: GameState): Array<'creep' | 'siege'> {
  return shuffle(s, [
    ...Array.from({ length: REGULAR_CREEPS }, () => 'creep' as const),
    ...Array.from({ length: SIEGE_CREEPS }, () => 'siege' as const),
  ])
}

function startRound(s: GameState) {
  s.round++
  s.phase = 'draw'
  s.ultDeclarations = []
  log(s, `Round ${s.round} — ${isDay(s.round) ? 'Day (Radiant has priority)' : 'Night (Dire has priority)'}`, 'phase')
  for (const p of PLAYERS) {
    const pl = s.players[p]
    const cmBonus = heroesOnBoard(s, p).filter((u) => u.cardId === 'crystal_maiden').length
    const gold = 1 + pl.bonusIncomeLanes.length + cmBonus
    pl.gold += gold
    pl.xp += 1
    pl.placedThisRound = 0
    pl.killsThisRound = 0
    log(s, `Upkeep: ${PLAYER_LABEL[p]} gains ${gold} Gold and 1 XP${cmBonus ? ' (Arcane Aura)' : ''}.`, tone(p))
  }
}

// ---------- draw ----------

export function drawBlockReason(s: GameState, p: PlayerId, type: 'hero' | 'item'): string | null {
  if (s.phase !== 'draw') return 'Not the draw step'
  const pl = s.players[p]
  if (pl.gold < 1) return 'Need 1 Gold'
  if (pl.hand.length >= HAND_LIMIT) return `Hand limit (${HAND_LIMIT})`
  const deck = type === 'hero' ? s.heroDeck.length + s.heroDiscard.length : s.itemDeck.length + s.itemDiscard.length
  if (deck === 0) return 'Deck is empty'
  return null
}

function takeFromDeck(s: GameState, type: 'hero' | 'item'): string | undefined {
  if (type === 'hero') {
    if (s.heroDeck.length === 0) {
      s.heroDeck = shuffle(s, s.heroDiscard)
      s.heroDiscard = []
    }
    return s.heroDeck.pop()
  }
  if (s.itemDeck.length === 0) {
    s.itemDeck = shuffle(s, s.itemDiscard)
    s.itemDiscard = []
  }
  return s.itemDeck.pop()
}

export function drawCard(state: GameState, p: PlayerId, type: 'hero' | 'item'): GameState {
  if (drawBlockReason(state, p, type)) return state
  const s = clone(state)
  const id = takeFromDeck(s, type)
  if (!id) return state
  s.players[p].gold -= 1
  s.players[p].hand.push({ iid: newId(s, 'c'), type, cardId: id })
  log(s, `${PLAYER_LABEL[p]} spends 1 Gold to draw ${type === 'hero' ? 'a hero' : 'an item'} card.`, tone(p))
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

export function placeHero(state: GameState, p: PlayerId, handIid: string, lane: LaneId): GameState {
  if (placeBlockReason(state, p)) return state
  const card = state.players[p].hand.find((c) => c.iid === handIid && c.type === 'hero')
  if (!card) return state
  const s = clone(state)
  const pl = s.players[p]
  pl.hand = pl.hand.filter((c) => c.iid !== handIid)
  pl.placedThisRound++
  const hero = getHero(card.cardId)
  const uid = newId(s, 'u')
  s.units[uid] = {
    uid,
    kind: 'hero',
    cardId: card.cardId,
    handIid,
    owner: p,
    lane,
    hp: hero.maxHp ?? 2,
    maxHp: hero.maxHp ?? 2,
    dead: false,
    ultUsed: false,
    equipment: [],
    placedRound: s.round,
    fierySoul: false,
    status: freshStatus(),
  }
  s.lanes[lane][p].push(uid)
  return s
}

export function unplaceHero(state: GameState, uid: string): GameState {
  const u = state.units[uid]
  if (!u || state.phase !== 'assign' || u.placedRound !== state.round || !u.cardId) return state
  const s = clone(state)
  const pl = s.players[u.owner]
  pl.hand.push({ iid: u.handIid ?? newId(s, 'c'), type: 'hero', cardId: u.cardId! })
  pl.placedThisRound--
  s.lanes[u.lane][u.owner] = s.lanes[u.lane][u.owner].filter((x) => x !== uid)
  delete s.units[uid]
  return s
}

export function moveInLineup(state: GameState, uid: string, dir: -1 | 1): GameState {
  const u = state.units[uid]
  if (!u || state.phase !== 'assign') return state
  const s = clone(state)
  const arr = s.lanes[u.lane][u.owner]
  const i = arr.indexOf(uid)
  const j = i + dir
  if (i < 0 || j < 0 || j >= arr.length) return state
  ;[arr[i], arr[j]] = [arr[j], arr[i]]
  return s
}

/** Both sides have locked in: reveal heroes and send this round's creep wave. */
export function reveal(state: GameState): GameState {
  if (state.phase !== 'assign') return state
  const s = clone(state)
  for (const p of PLAYERS) {
    const placed = heroesOnBoard(s, p).filter((u) => u.placedRound === s.round)
    if (placed.length) {
      log(
        s,
        `Reveal: ${PLAYER_LABEL[p]} assigns ${placed.map((u) => `${unitName(u)} (${LANE_LABEL[u.lane]})`).join(', ')}.`,
        tone(p),
      )
    } else {
      log(s, `Reveal: ${PLAYER_LABEL[p]} assigns no new heroes.`, tone(p))
    }
  }
  for (const lane of LANES) {
    for (const p of PLAYERS) {
      if (s.creepDeck.length === 0) s.creepDeck = freshCreepDeck(s)
      const kind = s.creepDeck.pop()!
      const uid = newId(s, 'u')
      s.units[uid] = {
        uid,
        kind,
        owner: p,
        lane,
        hp: 1,
        maxHp: 1,
        dead: false,
        ultUsed: true,
        equipment: [],
        placedRound: s.round,
        fierySoul: false,
        status: freshStatus(),
      }
      s.lanes[lane][p].push(uid)
    }
  }
  log(s, 'Creep waves march down all three lanes.', 'info')
  s.phase = 'items'
  return s
}

// ---------- items ----------

export function itemTargets(s: GameState, p: PlayerId, itemId: string): string[] {
  const item = getItem(itemId)
  const all = Object.values(s.units).filter((u) => !u.dead)
  switch (item.target) {
    case 'allyWoundedHero':
      return all.filter((u) => u.owner === p && u.kind === 'hero' && u.hp < u.maxHp).map((u) => u.uid)
    case 'enemyUnit':
      return all.filter((u) => u.owner !== p).map((u) => u.uid)
    case 'allyHero':
      return all
        .filter((u) => u.owner === p && u.kind === 'hero')
        .filter((u) => (item.kind === 'Equipment' ? u.equipment.length === 0 : true))
        .filter((u) => (itemId === 'refresher' ? u.ultUsed : true))
        .map((u) => u.uid)
  }
}

export function itemBlockReason(s: GameState, p: PlayerId, card: HandCard): string | null {
  if (s.phase !== 'items') return 'Items are played during the item step'
  const item = getItem(card.cardId)
  if (s.players[p].gold < item.cost) return `Needs ${item.cost} Gold`
  if (itemTargets(s, p, card.cardId).length === 0) return 'No valid targets'
  return null
}

export function playItem(state: GameState, p: PlayerId, handIid: string, targetUid: string): GameState {
  const card = state.players[p].hand.find((c) => c.iid === handIid && c.type === 'item')
  if (!card || itemBlockReason(state, p, card)) return state
  if (!itemTargets(state, p, card.cardId).includes(targetUid)) return state
  const s = clone(state)
  const item = getItem(card.cardId)
  const pl = s.players[p]
  pl.gold -= item.cost
  pl.hand = pl.hand.filter((c) => c.iid !== handIid)
  const t = s.units[targetUid]
  log(s, `${PLAYER_LABEL[p]} plays ${item.name} on ${fullName(t)}.`, tone(p))

  switch (item.id) {
    case 'tango':
      heal(s, t, 'Tango')
      break
    case 'dagon':
      dealDamage(s, null, t.uid, 1, 'item', { label: 'Dagon', sourceOwner: p })
      break
    case 'blade_mail':
      t.status.bladeMail = true
      break
    case 'bkb':
      t.status.bkb = true
      t.status.stunned = t.status.silenced = t.status.disarmed = false
      break
    case 'refresher':
      t.ultUsed = false
      break
    case 'vanguard':
    case 'desolator':
      t.equipment.push(item.id)
      break
  }
  if (item.kind === 'Consumable') s.itemDiscard.push(item.id)

  if (item.kind === 'Consumable' && t.cardId === 'zeus' && t.owner === p && !t.dead) {
    const front = lineup(s, other(p), t.lane)[0]
    if (front) dealDamage(s, t, front, 1, 'passive', { label: 'Static Field' })
  }
  checkWinner(s)
  return s
}

export function endItems(state: GameState): GameState {
  if (state.phase !== 'items') return state
  const s = clone(state)
  s.phase = 'ults'
  return s
}

// ---------- ultimates ----------

export function ultTargets(s: GameState, uid: string): string[] {
  const u = s.units[uid]
  if (!u?.cardId) return []
  const enemy = other(u.owner)
  const enemies = Object.values(s.units).filter((x) => x.owner === enemy && !x.dead)
  switch (getHero(u.cardId).ult.target) {
    case 'none':
      return []
    case 'enemyHeroInLane':
      return enemies.filter((x) => x.lane === u.lane && x.kind === 'hero').map((x) => x.uid)
    case 'enemyUnitInLane':
      return enemies.filter((x) => x.lane === u.lane).map((x) => x.uid)
    case 'enemyHeroAdjacentLane': {
      const i = LANES.indexOf(u.lane)
      return enemies
        .filter((x) => x.kind === 'hero' && Math.abs(LANES.indexOf(x.lane) - i) === 1)
        .map((x) => x.uid)
    }
    case 'enemyUnitAnyLane':
      return enemies.map((x) => x.uid)
  }
}

export function ultNeedsTarget(u: Unit) {
  return !!u.cardId && getHero(u.cardId).ult.target !== 'none'
}

function castPreventedReason(s: GameState, u: Unit): string | null {
  if (u.dead) return 'Slain'
  if (s.settings.singleUseUlt && u.ultUsed) return 'Ultimate already used'
  if (u.status.stunned) return 'Stunned'
  if (u.status.silenced) return 'Silenced'
  if (isPos1(s, u) && aliveHeroInLane(s, other(u.owner), u.lane, 'lion')) return 'Mana Drained by Lion'
  return null
}

export function ultBlockReason(s: GameState, uid: string): string | null {
  const u = s.units[uid]
  if (!u || u.kind !== 'hero') return 'Not a hero'
  if (s.phase !== 'ults') return 'Ultimates are declared during the ULT step'
  if (s.ultDeclarations.some((d) => d.uid === uid)) return 'Already declared'
  const r = castPreventedReason(s, u)
  if (r) return r
  if (s.players[u.owner].xp < 1) return 'Needs 1 XP'
  if (ultNeedsTarget(u) && ultTargets(s, uid).length === 0) return 'No valid targets'
  return null
}

export function declareUlt(state: GameState, uid: string, target?: string): GameState {
  if (ultBlockReason(state, uid)) return state
  const u = state.units[uid]
  if (ultNeedsTarget(u) && (!target || !ultTargets(state, uid).includes(target))) return state
  const s = clone(state)
  s.players[u.owner].xp -= 1
  s.ultDeclarations.push({ uid, owner: u.owner, target })
  return s
}

export function cancelUlt(state: GameState, uid: string): GameState {
  const d = state.ultDeclarations.find((x) => x.uid === uid)
  if (!d || state.phase !== 'ults') return state
  const s = clone(state)
  s.players[d.owner].xp += 1
  s.ultDeclarations = s.ultDeclarations.filter((x) => x.uid !== uid)
  return s
}

// ---------- damage model ----------

type DamageKind = 'ult' | 'attack' | 'tower' | 'item' | 'passive' | 'self'

interface DamageOpts {
  unstoppable?: boolean
  label?: string
  sourceOwner?: PlayerId
}

function counters(a: Unit, b: Unit) {
  const aa = attributeOf(a)
  const ba = attributeOf(b)
  return !!aa && !!ba && ATTRIBUTE_COUNTERS[aa] === ba
}

function heal(s: GameState, u: Unit, label: string) {
  if (u.dead || u.hp >= u.maxHp) return
  if (u.status.noHeal) {
    log(s, `${fullName(u)} cannot be healed (${label} blocked).`, 'info')
    return
  }
  u.hp = u.maxHp
  log(s, `${fullName(u)} heals to Healthy (${label}).`, tone(u.owner))
}

function applyStatus(s: GameState, src: Unit, t: Unit, key: 'stunned' | 'silenced' | 'disarmed' | 'slowed', label: string) {
  if (t.dead) return
  if (t.owner !== src.owner && t.status.bkb && key !== 'slowed') {
    log(s, `${fullName(t)} ignores ${label} (Black King Bar).`, 'info')
    return
  }
  t.status[key] = true
  log(s, `${fullName(t)} is ${key} by ${label}.`, tone(src.owner))
}

function removeFromLineup(s: GameState, u: Unit) {
  s.lanes[u.lane][u.owner] = s.lanes[u.lane][u.owner].filter((x) => x !== u.uid)
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
  if (!t || t.dead || s.winner) return 0
  const label = opts.label ?? (src ? unitName(src) : 'Tower')
  const srcOwner = src?.owner ?? opts.sourceOwner
  const fromEnemy = kind === 'tower' || (srcOwner !== undefined && srcOwner !== t.owner)

  if (fromEnemy && kind === 'ult') {
    if (t.status.bkb) {
      log(s, `${fullName(t)} is immune to ${label} (Black King Bar).`, 'info')
      return 0
    }
    if (t.cardId === 'juggernaut') {
      log(s, `${fullName(t)} spins through ${label} untouched (Blade Fury).`, 'info')
      return 0
    }
  }

  const physical = kind === 'attack' || kind === 'tower'
  if (!opts.unstoppable && kind !== 'self') {
    if (kind === 'attack' && t.cardId === 'phantom_assassin' && !t.status.blurUsed) {
      t.status.blurUsed = true
      log(s, `${fullName(t)} evades ${label}'s attack (Blur).`, 'info')
      return 0
    }
    if (kind === 'attack' && t.cardId === 'windranger' && src && isMelee(src)) {
      log(s, `${fullName(t)} takes no damage from ${label}'s melee attack (Windrun).`, 'info')
      return 0
    }
    if (t.cardId === 'tidehunter' && src && src.kind !== 'hero') {
      log(s, `${fullName(t)} shrugs off the creep hit (Kraken Shell).`, 'info')
      return 0
    }
    if (
      kind === 'attack' &&
      !t.status.frostShieldUsed &&
      isPos1(s, t) &&
      aliveHeroInLane(s, t.owner, t.lane, 'lich')
    ) {
      t.status.frostShieldUsed = true
      log(s, `${fullName(t)} negates ${label}'s attack (Frost Shield).`, 'info')
      return 0
    }
    if (physical && t.equipment.includes('vanguard') && !t.status.vanguardUsed) {
      t.status.vanguardUsed = true
      log(s, `${fullName(t)} blocks the hit (Vanguard).`, 'info')
      return 0
    }
    if (t.cardId === 'abaddon' && !t.status.aphoticUsed) {
      t.status.aphoticUsed = true
      log(s, `${fullName(t)} absorbs ${label} (Aphotic Shield).`, 'info')
      return 0
    }
  }

  if (t.status.borrowedTime && kind !== 'self') {
    log(s, `${label} feeds ${fullName(t)}'s Borrowed Time.`, 'info')
    t.hp = t.maxHp
    return 0
  }

  let dmg = amount
  if (kind === 'attack' && src && src.kind === 'hero' && t.kind === 'hero' && counters(src, t)) {
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
    handleLethal(s, t, src, label)
  }
  return dmg
}

function handleLethal(s: GameState, t: Unit, src: Unit | null, label: string) {
  if (t.status.reincarnation) {
    t.status.reincarnation = false
    t.hp = 1
    log(s, `${fullName(t)} is slain by ${label} — and rises again, Wounded (Reincarnation)!`, 'kill')
    return
  }
  t.hp = 0
  t.dead = true
  removeFromLineup(s, t)
  log(s, `${label} slays ${fullName(t)}.`, 'kill')
  if (src && src.owner !== t.owner && t.kind === 'hero') s.players[src.owner].killsThisRound++
  if (src && !src.dead && isMelee(src) && aliveHeroInLane(s, src.owner, src.lane, 'wraith_king')) {
    heal(s, src, 'Vampiric Aura')
  }
}

// ---------- combat ----------

function priorityKey(s: GameState, u: Unit): number[] {
  const laneRank = LANE_PRIORITY[u.owner].indexOf(u.lane)
  const fav = u.owner === favoredPlayer(s.round) ? 0 : 1
  const pos = s.lanes[u.lane][u.owner].indexOf(u.uid)
  return [laneRank, fav, pos]
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
  const enemies = () => enemyUnitsInLane(s, u)
  const target = targetUid ? s.units[targetUid] : undefined
  const hit = (uid: string, n: number) => dealDamage(s, u, uid, n, 'ult', { label: `${hero.name}'s ${ult}` })

  switch (u.cardId) {
    case 'axe':
      for (const e of enemies()) e.status.taunt = u.uid
      log(s, `All enemies in ${LANE_LABEL[u.lane]} must attack Axe.`, tone(u.owner))
      break
    case 'sven':
      u.status.godsStrength = true
      break
    case 'tidehunter':
      for (const e of enemies().filter((e) => e.kind === 'hero')) applyStatus(s, u, e, 'stunned', ult)
      break
    case 'pudge':
      if (target) {
        removeFromLineup(s, target)
        target.lane = u.lane
        s.lanes[u.lane][target.owner].unshift(target.uid)
        log(s, `${fullName(target)} is hooked into ${LANE_LABEL[u.lane]} Position 1.`, tone(u.owner))
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
      for (const e of Object.values(s.units).filter((x) => x.owner !== u.owner && x.kind === 'hero' && !x.dead))
        hit(e.uid, 1)
      break
    case 'lich': {
      const [p1, p2] = lineup(s, other(u.owner), u.lane)
      if (p1) hit(p1, 1)
      if (p2) hit(p2, 1)
      break
    }
    case 'windranger':
      u.status.focusFire = true
      break
    case 'abaddon':
      u.status.borrowedTime = true
      break
    case 'bane':
      if (target) applyStatus(s, u, target, 'stunned', ult)
      heal(s, u, ult)
      break
    case 'venomancer':
      for (const e of enemies()) {
        hit(e.uid, 1)
        e.status.noHeal = true
      }
      break
    case 'viper':
      if (target) {
        hit(target.uid, 1)
        applyStatus(s, u, target, 'slowed', ult)
        applyStatus(s, u, target, 'disarmed', ult)
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
      const ints = enemies().filter((e) => attributeOf(e) === 'INT').length
      if (ints === 0) log(s, 'Mana Void finds no INT heroes to punish.', 'info')
      else for (const e of enemies().filter((e) => e.kind === 'hero')) hit(e.uid, ints)
      break
    }
  }
}

function attackTargets(s: GameState, u: Unit): string[] {
  const line = lineup(s, other(u.owner), u.lane)
  if (line.length === 0) return []
  const taunter = u.status.taunt ? s.units[u.status.taunt] : undefined
  if (taunter && !taunter.dead && taunter.lane === u.lane) return [taunter.uid]
  if (u.cardId === 'sniper') {
    const units = line.map((x) => s.units[x])
    const pick =
      units.find((x) => counters(u, x)) ??
      units.find((x) => x.kind === 'hero' && x.hp < x.maxHp) ??
      units.find((x) => x.kind === 'hero') ??
      units[0]
    return [pick.uid]
  }
  if (u.cardId === 'sven' || u.cardId === 'luna') return line.slice(0, 2)
  return [line[0]]
}

function attackDamage(s: GameState, u: Unit): number {
  if (isPos1(s, u) && aliveHeroInLane(s, other(u.owner), u.lane, 'bane')) return 0
  if (u.kind !== 'hero') return 1
  return 1 + u.equipment.filter((e) => e === 'desolator').length
}

function attackStructure(s: GameState, u: Unit) {
  const enemy = other(u.owner)
  const st = s.players[enemy].structures
  const tw = st.towers[u.lane]
  const dmg = u.kind === 'siege' ? 2 : u.kind === 'hero' ? 1 + u.equipment.filter((e) => e === 'desolator').length : 1
  u.status.attackedStructure = true
  const who = fullName(u)
  if (tw.t1 > 0) {
    tw.t1 = Math.max(0, tw.t1 - dmg)
    log(s, `${who} hits the ${PLAYER_LABEL[enemy]} ${LANE_LABEL[u.lane]} Tier 1 tower for ${dmg} (${tw.t1}/${TOWER_HP.t1}).`, 'structure')
    if (tw.t1 === 0) log(s, `${PLAYER_LABEL[enemy]} ${LANE_LABEL[u.lane]} Tier 1 tower is destroyed!`, 'structure')
  } else if (tw.t2 > 0) {
    tw.t2 = Math.max(0, tw.t2 - dmg)
    log(s, `${who} hits the ${PLAYER_LABEL[enemy]} ${LANE_LABEL[u.lane]} Tier 2 tower for ${dmg} (${tw.t2}/${TOWER_HP.t2}).`, 'structure')
    if (tw.t2 === 0) {
      log(s, `${PLAYER_LABEL[enemy]} ${LANE_LABEL[u.lane]} Tier 2 tower is destroyed!`, 'structure')
      const pl = s.players[u.owner]
      if (!pl.bonusIncomeLanes.includes(u.lane)) {
        pl.bonusIncomeLanes.push(u.lane)
        log(s, `${PLAYER_LABEL[u.owner]} breaks ${LANE_LABEL[u.lane]} lane: +1 passive Gold per round.`, tone(u.owner))
      }
    }
  } else {
    st.ancient = Math.max(0, st.ancient - dmg)
    log(s, `${who} strikes the ${PLAYER_LABEL[enemy]} Ancient for ${dmg} (${st.ancient}/${ANCIENT_HP}).`, 'structure')
  }
  checkWinner(s)
}

function singleAttack(s: GameState, u: Unit) {
  if (u.dead || s.winner) return
  const targets = attackTargets(s, u)
  if (targets.length === 0) {
    attackStructure(s, u)
    return
  }
  const dmg = attackDamage(s, u)
  if (dmg === 0 && aliveHeroInLane(s, other(u.owner), u.lane, 'bane') && isPos1(s, u)) {
    log(s, `${fullName(u)} is Enfeebled by Bane and deals no damage.`, 'info')
    return
  }
  for (const tid of targets) {
    if (u.dead) break
    const t = s.units[tid]
    if (!t || t.dead) continue
    const dealt = dealDamage(s, u, tid, dmg, 'attack', { unstoppable: u.status.godsStrength })
    if (dealt > 0) {
      if (u.cardId === 'lina') u.fierySoul = true
      if (u.cardId === 'anti_mage' && t.kind === 'hero' && !t.dead) applyStatus(s, u, t, 'silenced', 'Mana Break')
      if (u.cardId === 'venomancer' && !t.dead) t.status.poisoned = true
    }
    if (t.cardId === 'axe' && !t.dead) dealDamage(s, t, u.uid, 1, 'passive', { label: 'Counter Helix' })
    if (t.cardId === 'viper' && !t.dead) dealDamage(s, t, u.uid, 1, 'passive', { label: 'Corrosive Skin' })
    if (t.status.bladeMail && dealt > 0) dealDamage(s, t, u.uid, dealt, 'passive', { label: 'Blade Mail' })
  }
}

function basicAttack(s: GameState, u: Unit) {
  if (u.dead || s.winner) return
  if (u.status.stunned) {
    log(s, `${fullName(u)} is stunned and cannot attack.`, 'info')
    return
  }
  if (u.status.disarmed) {
    log(s, `${fullName(u)} is disarmed and cannot attack.`, 'info')
    return
  }
  singleAttack(s, u)
  if (u.status.focusFire) singleAttack(s, u)
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

/** Phases 1–3 plus cleanup and income. */
export function resolveRound(state: GameState): GameState {
  if (state.phase !== 'ults') return state
  const s = clone(state)

  log(s, 'Phase 1 — Ultimates (STR → INT → UNI → AGI)', 'phase')
  const decls = s.ultDeclarations
    .map((d) => ({ d, u: s.units[d.uid] }))
    .sort((a, b) => {
      const ra = ULT_ORDER.indexOf(attributeOf(a.u)!)
      const rb = ULT_ORDER.indexOf(attributeOf(b.u)!)
      return ra !== rb ? ra - rb : byPriority(s)(a.u, b.u)
    })
  if (decls.length === 0) log(s, 'No Ultimates were declared.', 'info')
  for (const { d, u } of decls) {
    if (s.winner) break
    const reason = castPreventedReason(s, u)
    const target = d.target ? s.units[d.target] : undefined
    if (reason || (d.target && (!target || target.dead))) {
      s.players[u.owner].xp += 1
      log(s, `${fullName(u)}'s ${getHero(u.cardId!).ult.name} fizzles (${reason ?? 'target gone'}); XP refunded.`, 'info')
      continue
    }
    log(s, `${fullName(u)} casts ${getHero(u.cardId!).ult.name}${target ? ` on ${fullName(target)}` : ''}.`, tone(u.owner))
    u.ultUsed = true
    castUlt(s, u, d.target)
  }

  if (!s.winner) {
    log(s, 'Phase 2 — Basic attacks (AGI → UNI → INT → STR → Creeps)', 'phase')
    const alive = Object.values(s.units).filter((u) => !u.dead)
    const order: Unit[] = []
    for (const attr of ATTACK_ORDER) {
      const group = alive.filter((u) => attributeOf(u) === attr && !u.status.slowed).sort(byPriority(s))
      if (attr === 'INT') group.sort((a, b) => Number(b.fierySoul) - Number(a.fierySoul))
      order.push(...group)
    }
    order.push(...alive.filter((u) => u.kind !== 'hero' && !u.status.slowed).sort(byPriority(s)))
    order.push(...alive.filter((u) => u.status.slowed).sort(byPriority(s)))
    for (const u of order) basicAttack(s, u)
  }

  if (!s.winner) {
    log(s, 'Phase 3 — Tower aggro', 'phase')
    let fired = false
    for (const lane of LANES) {
      for (const defender of PLAYERS) {
        const tw = s.players[defender].structures.towers[lane]
        const tier = tw.t1 > 0 ? 't1' : tw.t2 > 0 ? 't2' : null
        if (!tier) continue
        const shooter = lineup(s, other(defender), lane).find((uid) => s.units[uid].status.attackedStructure)
        if (!shooter) continue
        fired = true
        dealDamage(s, null, shooter, TOWER_DAMAGE[tier], 'tower', {
          label: `${PLAYER_LABEL[defender]} ${LANE_LABEL[lane]} Tier ${tier === 't1' ? 1 : 2} tower`,
        })
      }
    }
    if (!fired) log(s, 'No towers were attacked this round.', 'info')
  }

  if (!s.winner) {
    log(s, 'Cleanup', 'phase')
    for (const u of Object.values(s.units)) {
      if (!u.dead && u.status.poisoned) dealDamage(s, null, u.uid, 1, 'passive', { label: 'Poison Sting', sourceOwner: other(u.owner) })
    }
  }

  for (const u of Object.values(s.units)) {
    if (u.dead || u.kind !== 'hero') {
      if (u.kind === 'hero' && u.cardId) {
        s.heroDiscard.push(u.cardId)
        s.itemDiscard.push(...u.equipment)
      }
      removeFromLineup(s, u)
      delete s.units[u.uid]
    } else {
      u.status = freshStatus()
    }
  }

  if (!s.winner) {
    log(s, 'Income', 'phase')
    for (const p of PLAYERS) {
      const pl = s.players[p]
      const lanes = LANES.filter((l) => lineup(s, p, l).length > 0).length
      pl.gold += pl.killsThisRound
      pl.xp += lanes
      log(
        s,
        `${PLAYER_LABEL[p]} earns ${pl.killsThisRound} Gold from kills and ${lanes} XP from lanes held.`,
        tone(p),
      )
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
