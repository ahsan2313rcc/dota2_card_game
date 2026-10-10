import { getHero } from './cards'
import {
  TOWER_HP,
  ZONES,
  isLane,
  type GameState,
  type LaneId,
  type Owner,
  type PlayerId,
  type Unit,
  type ZoneId,
} from './types'

/** Hooks the engine fills in so this file can resolve cards without importing the engine. */
export interface KitApi {
  s: GameState
  log: (text: string, owner?: Owner) => void
  name: (u: Unit) => string
  magic: (src: Unit | null, tid: string, n: number, label: string) => number
  physical: (src: Unit | null, tid: string, n: number, label: string) => number
  /** A real basic attack: attribute counters and attack triggers apply. */
  strike: (src: Unit, tid: string, n: number, label: string) => number
  mark: (from: Owner, t: Unit, key: string, label: string) => void
  heal: (u: Unit, label: string) => void
  move: (u: Unit, zone: ZoneId, front?: boolean, cause?: 'tp' | 'move') => void
  transfer: (u: Unit, owner: PlayerId, zone: ZoneId) => void
  fresh: () => Unit['status']
  /** Put one Shield on a unit. Passive grants pass false and end at Cleanup. */
  shield: (u: Unit, persist: boolean) => void
  make: (partial: Pick<Unit, 'kind' | 'owner' | 'zone' | 'hp'> & Partial<Unit>) => Unit
  hitTower: (src: Unit, lane: LaneId, n: number) => void
  xp: (p: PlayerId, n: number) => void
  gold: (p: PlayerId, n: number) => void
  daytime: () => boolean
  setCycle: (c: 'day' | 'night') => void
  attackPower: (u: Unit) => number
  shuffleDeck: () => void
  returnToHand: (u: Unit) => void
  silenceTower: (defender: PlayerId, lane: LaneId) => void
  depth: { n: number }
}

const ZONE_SET = new Set<string>(ZONES)

/** Same chain the rotation rules use: Top – Dire Jungle – Mid – Radiant Jungle – Bot. */
const NEXT: Record<ZoneId, ZoneId[]> = {
  top: ['direJungle'],
  direJungle: ['top', 'mid'],
  mid: ['direJungle', 'radiantJungle'],
  radiantJungle: ['mid', 'bot'],
  bot: ['radiantJungle'],
}

/** Toss sends a unit to the next lane along the base, since Top and Bot are not adjacent to each other. */
const LANE_TOSS: Record<LaneId, LaneId[]> = { top: ['mid'], mid: ['top', 'bot'], bot: ['mid'] }

export function isZoneId(id?: string): id is ZoneId {
  return !!id && ZONE_SET.has(id)
}

export function hasTag(u: Unit | undefined, tag: string): boolean {
  return !!u && !u.dead && u.kind === 'hero' && !!u.cardId && !u.status.broken && (getHero(u.cardId).script?.tags.includes(tag) ?? false)
}

export function scripted(u: Unit | undefined): boolean {
  return !!u && u.kind === 'hero' && !!u.cardId && !!getHero(u.cardId).script
}

function attrOf(u: Unit): string | undefined {
  if (u.kind !== 'hero' || !u.cardId) return undefined
  return u.morph ?? getHero(u.cardId).attribute
}

function isRanged(u: Unit): boolean {
  if (u.status.rangedAttack || u.kind === 'siege') return true
  if (u.kind === 'hero' && u.cardId) return getHero(u.cardId).range === 'Ranged'
  return false
}

function isMeleeUnit(u: Unit): boolean {
  return !isRanged(u)
}

function other(p: PlayerId): PlayerId {
  return p === 'radiant' ? 'dire' : 'radiant'
}

function hidden(u: Unit) {
  if (u.status.revealed) return false
  return u.status.banished || u.status.invisible
}

function labelOf(u: Unit) {
  return u.cardId && u.kind === 'hero' ? getHero(u.cardId).ult.name : 'Ability'
}

function unitsIn(s: GameState, p: PlayerId, zone: ZoneId): Unit[] {
  return s.zones[zone][p].map((id) => s.units[id]).filter((u) => u && !u.dead)
}

function foes(s: GameState, caster: Unit, zone: ZoneId): Unit[] {
  if (caster.owner === 'neutral') return []
  const list = unitsIn(s, other(caster.owner), zone).filter((u) => !hidden(u))
  if (!isLane(zone)) {
    const id = s.camps[zone]
    const n = id ? s.units[id] : undefined
    if (n && !n.dead && !hidden(n)) list.push(n)
  }
  return list
}

function friends(s: GameState, caster: Unit, zone: ZoneId): Unit[] {
  if (caster.owner === 'neutral') return []
  return unitsIn(s, caster.owner, zone)
}

function heroes(list: Unit[]) {
  return list.filter((u) => u.kind === 'hero')
}

interface Focus {
  zone: ZoneId
  target?: string
}

function resolveWho(api: KitApi, caster: Unit, focus: Focus, token: string): Unit[] {
  const s = api.s
  const foe = foes(s, caster, focus.zone)
  const ally = friends(s, caster, focus.zone)
  const target = focus.target ? s.units[focus.target] : undefined
  switch (token) {
    case 'self':
      return caster.dead ? [] : [caster]
    case 'target':
      return target && !target.dead ? [target] : []
    case 'epos1':
      return foe.slice(0, 1)
    case 'epos2':
      return foe.slice(1, 2)
    case 'ethird':
      return foe.slice(2, 3)
    case 'apos1':
      return ally.slice(0, 1)
    case 'laneE':
      return foe
    case 'laneH':
      return heroes(foe)
    case 'laneA':
      return ally
    case 'laneAH':
      return heroes(ally)
    case 'laneAll':
      return [...heroes(ally), ...heroes(foe)]
    case 'others':
      return [...heroes(ally), ...heroes(foe)].filter((u) => u.uid !== caster.uid)
    case 'boardH':
      return Object.values(s.units).filter((u) => u.owner === other(caster.owner as PlayerId) && u.kind === 'hero' && !u.dead && !hidden(u))
    case 'intH':
      return heroes(foe).filter((u) => attrOf(u) === 'INT')
    case 'strH':
      return heroes(foe).filter((u) => attrOf(u) === 'STR')
    case 'invisE':
      return foe.filter((u) => u.status.invisible && !u.status.revealed)
    case 'rangedA':
      return heroes(ally).filter((u) => isRanged(u))
    case 'woundedH': {
      const here = heroes(foe).filter((u) => u.hp < u.maxHp)
      if (here.length) return here
      return target && target.hp < target.maxHp ? [target] : []
    }
    case 'woundedA':
      return Object.values(s.units).filter((u) => u.owner === caster.owner && u.kind === 'hero' && !u.dead && u.hp < u.maxHp)
    case 'pos1each': {
      const out: Unit[] = []
      for (const z of ZONES) {
        const front = foes(s, caster, z)[0]
        if (front) out.push(front)
      }
      return out
    }
    default:
      return []
  }
}

function debuffKeys() {
  return ['stunned', 'silenced', 'broken', 'disarmed', 'slowed', 'blinded', 'rooted', 'muted', 'cursed', 'feared', 'hexed', 'enfeeble'] as const
}

function applyVerb(api: KitApi, caster: Unit, t: Unit, verb: string, ult: string, persistShield = true) {
  const st = t.status
  const from = caster.owner
  const spell = from !== t.owner
  if (spell && st.immune && ['stun', 'silence', 'root', 'disarm', 'slow', 'mute', 'curse', 'fear', 'hex', 'break', 'enfeeble', 'taunt', 'tauntat'].includes(verb)) {
    api.log(`${api.name(t)} is Immune to ${ult}.`, from)
    return
  }
  switch (verb) {
    case 'heal':
      api.heal(t, ult)
      break
    case 'haste':
      st.haste = true
      st.slowed = false
      api.log(`${api.name(t)} gains Haste.`, from)
      break
    case 'shield':
      api.shield(t, persistShield)
      break
    case 'stun':
      api.mark(from, t, 'stunned', ult)
      break
    case 'silence':
      api.mark(from, t, 'silenced', ult)
      break
    case 'root':
      api.mark(from, t, 'rooted', ult)
      break
    case 'disarm':
      api.mark(from, t, 'disarmed', ult)
      break
    case 'slow':
      api.mark(from, t, 'slowed', ult)
      break
    case 'mute':
      api.mark(from, t, 'muted', ult)
      break
    case 'curse':
      api.mark(from, t, 'cursed', ult)
      break
    case 'fear':
      st.feared = true
      api.log(`${api.name(t)} is Feared.`, from)
      break
    case 'hex':
      st.hexed = true
      if (t.hp > 1) t.hp = 1
      api.log(`${api.name(t)} is Hexed into a decoy.`, from)
      break
    case 'break':
      api.mark(from, t, 'broken', ult)
      break
    case 'reveal':
      st.revealed = true
      st.invisible = false
      api.log(`${api.name(t)} is Revealed.`, from)
      break
    case 'amplify':
      st.bonusDamage += 1
      api.log(`${api.name(t)} is Amplified.`, from)
      break
    case 'enfeeble':
      st.enfeeble = true
      api.log(`${api.name(t)} is Enfeebled.`, from)
      break
    case 'evade':
      st.evade += 1
      api.log(`${api.name(t)} gains Evade.`, from)
      break
    case 'pierce':
      st.pierce = true
      break
    case 'accuracy':
      st.accuracy = true
      break
    case 'invisible':
      st.invisible = true
      api.log(`${api.name(t)} is Invisible.`, from)
      break
    case 'immune':
      st.immune = true
      api.log(`${api.name(t)} is Immune.`, from)
      break
    case 'invulnerable':
      st.invulnerable = true
      api.log(`${api.name(t)} is Invulnerable.`, from)
      break
    case 'ethereal':
      st.ethereal = true
      api.log(`${api.name(t)} is Ethereal.`, from)
      break
    case 'banish':
      st.banished = true
      st.invulnerable = true
      api.log(`${api.name(t)} is Banished.`, from)
      break
    case 'taunt':
      st.taunt = caster.uid
      api.log(`${api.name(t)} must attack ${api.name(caster)}.`, from)
      break
    case 'cleanse':
      for (const k of debuffKeys()) st[k] = false
      st.rupture = false
      api.log(`${api.name(t)} is cleansed.`, from)
      break
    case 'nodie':
      st.cannotDie = true
      api.log(`${api.name(t)} cannot die this turn.`, from)
      break
    case 'half':
      st.halfDamage = true
      break
    case 'doubleheal':
      st.doubleHeal = true
      break
    case 'lifesteal':
      st.lifesteal = true
      break
    case 'lifestealAura':
      st.lifestealAura = true
      break
    case 'healend':
      st.healEnd = true
      api.log(`${api.name(t)} heals at the end of the turn.`, from)
      break
    case 'evadeall':
      st.evadeAll = true
      api.log(`${api.name(t)} evades physical damage this turn.`, from)
      break
    case 'lock':
      t.foreverMute = true
      t.foreverSilence = true
      t.foreverCurse = true
      st.muted = true
      st.silenced = true
      st.cursed = true
      api.log(`${api.name(t)} is Doomed for the rest of the game.`, from)
      break
    case 'ranged':
      st.rangedAttack = true
      api.log(`${api.name(t)} attacks at range.`, from)
      break
    case 'rupture':
      st.rupture = true
      api.log(`${api.name(t)} is Ruptured.`, from)
      break
    default:
      break
  }
}

function runLine(api: KitApi, caster: Unit, focus: Focus, line: string) {
  const parts = line.trim().split(/\s+/).filter((p) => p !== 'ignore')
  const cmd = parts[0]
  const ult = labelOf(caster)
  if (!cmd || caster.dead && cmd !== 'mdmg') return
  if (cmd === 'repeat') {
    const n = Number(parts[1]) || 1
    const rest = parts.slice(2).join(' ')
    for (let i = 0; i < n; i++) runLine(api, caster, focus, rest)
    return
  }
  if (cmd === 'ifge') {
    const n = Number(parts[2]) || 0
    if (resolveWho(api, caster, focus, parts[1]).length >= n) runLine(api, caster, focus, parts.slice(3).join(' '))
    return
  }
  if (cmd === 'day' || cmd === 'night') {
    api.setCycle(cmd)
    api.log(`The round turns to ${cmd === 'day' ? 'Day' : 'Night'}.`, caster.owner)
    return
  }
  if (cmd === 'relocate' && isZoneId(focus.target)) {
    api.move(caster, focus.target, false, 'tp')
    focus.zone = focus.target
    return
  }
  if (cmd === 'tpallies' && isZoneId(focus.target) && isLane(focus.target)) {
    const movers = heroes(friends(api.s, caster, caster.zone)).filter((u) => !u.status.rooted && !u.status.stunned)
    for (const u of movers) api.move(u, focus.target, false, 'tp')
    return
  }
  if (cmd === 'tpair' && isZoneId(focus.target)) {
    const partner = heroes(friends(api.s, caster, caster.zone)).find((u) => u.uid !== caster.uid)
    api.move(caster, focus.target, false, 'tp')
    if (partner && !partner.dead && !partner.status.rooted) api.move(partner, focus.target, false, 'tp')
    focus.zone = focus.target
    return
  }
  if (cmd === 'xp' || cmd === 'gold') {
    const n = Number(parts[1]) || 1
    if (caster.owner === 'neutral') return
    if (cmd === 'xp') api.xp(caster.owner, n)
    else api.gold(caster.owner, n)
    return
  }
  if (cmd === 'slam') {
    const list = foes(api.s, caster, focus.zone)
    const extra = list.length >= 3
    for (const e of list) api.magic(caster, e.uid, 1, ult)
    if (extra) for (const e of list) if (!e.dead) api.magic(caster, e.uid, 1, ult)
    return
  }
  if (cmd === 'timber') {
    const n = isLane(focus.zone) ? 1 : 2
    for (const e of resolveWho(api, caster, focus, 'strH')) api.magic(caster, e.uid, n, ult)
    return
  }
  if (cmd === 'sky') {
    const n = Object.values(api.s.units).filter((u) => u.owner === caster.owner && u.kind === 'hero' && !u.dead && attrOf(u) === 'INT').length
    const t = focus.target ? api.s.units[focus.target] : undefined
    if (t && n > 0) api.magic(caster, t.uid, n, ult)
    return
  }
  if (cmd === 'visage') {
    const n = api.s.resolvedUlts.filter((z) => z === focus.zone).length + 1
    const t = focus.target ? api.s.units[focus.target] : undefined
    if (t) api.magic(caster, t.uid, n, ult)
    return
  }
  if (cmd === 'zapinvis') {
    for (const e of resolveWho(api, caster, focus, 'invisE')) {
      e.status.revealed = true
      e.status.invisible = false
      api.magic(caster, e.uid, 1, ult)
    }
    return
  }
  if (cmd === 'tower') {
    const n = Number(parts[1]) || 1
    const lane = isLane(focus.zone) ? focus.zone : (['mid', 'top', 'bot'] as LaneId[]).find((l) => isLane(l))
    if (lane && isLane(caster.zone)) api.hitTower(caster, caster.zone, n)
    else if (lane) api.hitTower(caster, lane, n)
    return
  }
  if (cmd === 'pull') {
    const t = focus.target ? api.s.units[focus.target] : undefined
    if (t && !t.dead && !t.status.rooted) api.move(t, caster.zone, true, 'move')
    return
  }
  if (cmd === 'shove') {
    const t = focus.target ? api.s.units[focus.target] : undefined
    const dest = (isLane(caster.zone) ? LANE_TOSS[caster.zone] : NEXT[caster.zone].filter(isLane))[0]
    if (t && dest && !t.dead && !t.status.rooted) api.move(t, dest, false, 'move')
    return
  }
  if (cmd === 'chase') {
    const t = focus.target ? api.s.units[focus.target] : undefined
    if (!t || t.dead) return
    if (!caster.status.rooted) {
      api.move(caster, t.zone, false, 'move')
      focus.zone = t.zone
    }
    api.strike(caster, t.uid, api.attackPower(caster), ult)
    return
  }
  if (cmd === 'slash') {
    const n = Number(parts[1]) || 2
    const list = foes(api.s, caster, focus.zone)
    for (let i = 0; i < n && list.length; i++) {
      const t = list[i % list.length]
      if (!t.dead) api.strike(caster, t.uid, api.attackPower(caster), ult)
    }
    return
  }
  if (cmd === 'duel') {
    const t = focus.target ? api.s.units[focus.target] : undefined
    if (!t || t.dead) return
    for (let i = 0; i < 8 && !caster.dead && !t.dead; i++) {
      const a = i % 2 === 0 ? caster : t
      const b = a === caster ? t : caster
      api.strike(a, b.uid, Math.max(1, api.attackPower(a)), 'Duel')
    }
    if (!caster.dead && t.dead && caster.owner !== 'neutral') {
      api.gold(caster.owner, 2)
      api.log(`${api.name(caster)} wins the duel and gains 2 Gold.`, caster.owner)
    } else if (caster.dead && !t.dead && t.owner !== 'neutral') {
      api.gold(t.owner, 2)
      api.log(`${api.name(t)} wins the duel and gains 2 Gold.`, t.owner)
    }
    return
  }
  if (cmd === 'lock') {
    const t = focus.target ? api.s.units[focus.target] : undefined
    if (t && !t.dead) applyVerb(api, caster, t, 'lock', ult)
    return
  }
  if (cmd === 'pay') {
    if (caster.owner !== 'neutral') {
      const pl = api.s.players[caster.owner]
      const lost = Math.min(1, pl.xp)
      pl.xp -= lost
      api.log(`${api.name(caster)} spends ${lost} XP.`, caster.owner)
    }
    return
  }
  if (cmd === 'stealxp') {
    const t = focus.target ? api.s.units[focus.target] : undefined
    if (t && t.owner !== 'neutral' && caster.owner !== 'neutral' && t.owner !== caster.owner) {
      const victim = api.s.players[t.owner]
      const lost = Math.min(1, victim.xp)
      victim.xp -= lost
      api.xp(caster.owner, lost)
      api.log(`${api.name(caster)} steals ${lost} XP.`, caster.owner)
    }
    return
  }
  if (cmd === 'hood') {
    const t = focus.target ? api.s.units[focus.target] : undefined
    if (t && !t.dead) api.magic(caster, t.uid, isLane(t.zone) ? 1 : 2, ult)
    return
  }
  if (cmd === 'luna') {
    const n = Number(parts[1]) || 3
    const list = foes(api.s, caster, focus.zone)
    for (let i = 0; i < n && list.length; i++) {
      const t = list[i % list.length]
      if (!t.dead) api.magic(caster, t.uid, 1, ult)
    }
    return
  }
  if (cmd === 'razor') {
    const wounded = heroes(foes(api.s, caster, focus.zone)).find((e) => e.hp < e.maxHp)
    if (wounded) api.physical(caster, wounded.uid, 1, ult)
    else if (isLane(caster.zone)) api.hitTower(caster, caster.zone, 1)
    return
  }
  if (cmd === 'hand') {
    const t = focus.target ? api.s.units[focus.target] : undefined
    if (t && !t.dead && t.kind === 'hero' && t.owner !== 'neutral') api.returnToHand(t)
    return
  }
  if (cmd === 'astral') {
    const t = focus.target ? api.s.units[focus.target] : undefined
    if (!t || t.dead) return
    if (t.owner !== caster.owner) {
      api.magic(caster, t.uid, 1, ult)
      if (caster.owner !== 'neutral') api.xp(caster.owner, 1)
    }
    if (!t.dead) applyVerb(api, caster, t, 'banish', ult)
    return
  }
  if (cmd === 'swaphp') {
    const t = focus.target ? api.s.units[focus.target] : undefined
    if (!t || t.dead) return
    const a = caster.hp
    const b = t.hp
    caster.hp = Math.max(1, Math.min(caster.maxHp, b))
    t.hp = Math.max(1, Math.min(t.maxHp, a))
    api.log(`${api.name(caster)} swaps health with ${api.name(t)}.`, caster.owner)
    return
  }
  if (cmd === 'disarmtower') {
    if (caster.owner !== 'neutral' && isLane(caster.zone)) api.silenceTower(other(caster.owner), caster.zone)
    return
  }
  if (cmd === 'tpunit') {
    const t = focus.target ? api.s.units[focus.target] : undefined
    if (t && !t.dead && !caster.status.rooted && !caster.status.stunned) {
      api.move(caster, t.zone, false, 'tp')
      focus.zone = t.zone
    }
    return
  }
  if (cmd === 'skewer' && isZoneId(focus.target)) {
    const enemy = foes(api.s, caster, caster.zone).find((e) => !e.status.rooted && !e.dead)
    if (!caster.status.rooted) api.move(caster, focus.target, false, 'move')
    if (enemy && !enemy.dead) api.move(enemy, focus.target, true, 'move')
    focus.zone = focus.target
    return
  }
  if (cmd === 'sidekick' && isZoneId(focus.target)) {
    const ally = heroes(friends(api.s, caster, caster.zone)).find((u) => u.uid !== caster.uid && !u.status.rooted)
    if (!caster.status.rooted) api.move(caster, focus.target, false, 'move')
    if (ally && !ally.dead) api.move(ally, focus.target, false, 'move')
    focus.zone = focus.target
    return
  }
  if (cmd === 'npshot') {
    const ordered = [focus.zone, ...ZONES.filter((z) => z !== focus.zone)]
    let hits = 0
    for (const z of ordered) {
      const front = foes(api.s, caster, z)[0]
      if (!front || front.dead) continue
      api.magic(caster, front.uid, 1, ult)
      if (++hits >= 2) break
    }
    return
  }
  if (cmd === 'snap') {
    for (const e of foes(api.s, caster, focus.zone)) {
      if (!e.dead) api.magic(caster, e.uid, isMeleeUnit(e) ? 2 : 1, ult)
    }
    return
  }
  if (cmd === 'hastecreeps') {
    for (const a of friends(api.s, caster, caster.zone)) {
      if (a.kind === 'creep' || a.kind === 'siege') a.status.haste = true
    }
    return
  }
  if (cmd === 'spawncreep') {
    if (caster.owner === 'neutral') return
    const creep = api.make({ kind: 'creep', owner: caster.owner, zone: caster.zone, hp: 1 })
    api.s.zones[caster.zone][caster.owner].push(creep.uid)
    api.log(`${api.name(caster)} summons a creep.`, caster.owner)
    return
  }
  if (cmd === 'healboard') {
    if (caster.owner === 'neutral') return
    for (const a of Object.values(api.s.units)) {
      if (a.owner === caster.owner && a.kind === 'hero' && !a.dead && a.hp < a.maxHp) api.heal(a, ult)
    }
    return
  }
  if (cmd === 'bear') {
    const live = Object.values(api.s.units).some((u) => !u.dead && u.owner === caster.owner && u.cardId === 'spirit_bear')
    if (live) {
      api.log('Spirit Bear is already beside Lone Druid.', caster.owner)
      return
    }
    const bear = api.make({ kind: 'hero', cardId: 'spirit_bear', owner: caster.owner, zone: caster.zone, hp: 2 })
    api.s.zones[caster.zone][caster.owner as PlayerId].push(bear.uid)
    api.log('A Spirit Bear answers the call.', caster.owner)
    return
  }
  if (cmd === 'clone') {
    const copy = api.make({ kind: 'hero', cardId: caster.cardId, owner: caster.owner, zone: caster.zone, hp: 1, copy: true })
    api.s.zones[caster.zone][caster.owner as PlayerId].push(copy.uid)
    api.log('A wounded double of Arc Warden joins the lane.', caster.owner)
    return
  }
  if (cmd === 'decoy') {
    const decoy = api.make({ kind: 'illusion', cardId: caster.cardId, owner: caster.owner, zone: caster.zone, hp: 1 })
    const arr = api.s.zones[caster.zone][caster.owner as PlayerId]
    const at = arr.indexOf(caster.uid)
    arr.splice(at < 0 ? 0 : at, 0, decoy.uid)
    return
  }
  if (cmd === 'control') {
    const t = focus.target ? api.s.units[focus.target] : undefined
    if (!t || t.dead || caster.owner === 'neutral') return
    api.transfer(t, caster.owner, caster.zone)
    api.log(`${api.name(caster)} takes control of ${api.name(t)}.`, caster.owner)
    return
  }
  if (cmd === 'sacrifice') {
    api.magic(caster, caster.uid, 99, ult)
    return
  }
  if (cmd === 'killwounded') {
    const t = focus.target ? api.s.units[focus.target] : undefined
    if (t && !t.dead && t.hp < t.maxHp) api.magic(caster, t.uid, 99, ult)
    return
  }
  if (cmd === 'nobuyback') {
    const t = focus.target ? api.s.units[focus.target] : undefined
    if (t) t.buybackBlocked = true
    return
  }
  if (cmd === 'swap') {
    const t = focus.target ? api.s.units[focus.target] : undefined
    if (!t || t.dead || t.owner !== caster.owner) return
    const a = caster.zone
    const b = t.zone
    api.move(caster, b, false, 'move')
    if (!t.dead) api.move(t, a, false, 'move')
    return
  }
  if (cmd === 'reset') {
    const t = focus.target ? api.s.units[focus.target] : undefined
    if (!t || t.dead) return
    t.hp = t.maxHp
    t.status = api.fresh()
    api.log(`${api.name(t)} is reset.`, caster.owner)
    return
  }
  if (cmd === 'steal') {
    const t = focus.target ? api.s.units[focus.target] : undefined
    const lines = t?.cardId && t.kind === 'hero' ? getHero(t.cardId).script?.ult : undefined
    if (lines) for (const ln of lines) runLine(api, caster, { zone: caster.zone }, ln)
    return
  }
  if (cmd === 'bounce') {
    const list = foes(api.s, caster, focus.zone)
    for (const e of list.slice(1, 3)) api.magic(caster, e.uid, 1, ult)
    return
  }
  if (cmd === 'ward') {
    const t = focus.target ? api.s.units[focus.target] : undefined
    if (t) caster.link = t.uid
    return
  }
  if (cmd === 'healspirit') {
    const ld = Object.values(api.s.units).find((u) => !u.dead && u.owner === caster.owner && u.cardId === 'lone_druid')
    if (ld) api.heal(ld, ult)
    return
  }
  if (cmd === 'strip') {
    const t = focus.target ? api.s.units[focus.target] : undefined
    if (!t) return
    const st = t.status
    st.shield = 0
    st.evade = 0
    st.accuracy = false
    st.pierce = false
    st.bonusDamage = 0
    st.invisible = false
    st.haste = false
    st.immune = false
    st.invulnerable = false
    st.ethereal = false
    st.banished = false
    st.cannotDie = false
    st.lifesteal = false
    api.log(`${api.name(t)} loses every buff.`, caster.owner)
    return
  }
  if (cmd === 'tauntat') {
    const victim = focus.target ? api.s.units[focus.target] : undefined
    if (!victim || victim.dead) return
    for (const e of resolveWho(api, caster, focus, parts[1] || 'laneE')) {
      if (e.uid === victim.uid || e.dead) continue
      if (e.status.immune) {
        api.log(`${api.name(e)} is Immune to ${ult}.`, caster.owner)
        continue
      }
      e.status.taunt = victim.uid
      api.log(`${api.name(e)} must attack ${api.name(victim)}.`, caster.owner)
    }
    return
  }
  if (cmd === 'morphhit') {
    const t = focus.target ? api.s.units[focus.target] : undefined
    if (!t) return
    if ((caster.morph ?? 'AGI') === 'STR') applyVerb(api, caster, t, 'stun', ult)
    else api.magic(caster, t.uid, 2, ult)
    return
  }
  if (cmd === 'basic') {
    for (const t of resolveWho(api, caster, focus, parts[1] || 'epos1')) {
      if (!t.dead) api.strike(caster, t.uid, api.attackPower(caster), ult)
    }
    return
  }
  if (cmd === 'pdmg' || cmd === 'mdmg') {
    const token = parts[1] || 'target'
    const amt = parts.includes('atk') ? api.attackPower(caster) : Number(parts[2]) || 1
    for (const t of resolveWho(api, caster, focus, token)) {
      if (t.dead) continue
      if (cmd === 'pdmg') api.physical(caster, t.uid, amt, ult)
      else api.magic(caster, t.uid, amt, ult)
    }
    return
  }
  const token = parts[1]
  if (!token) return
  for (const t of resolveWho(api, caster, focus, token)) applyVerb(api, caster, t, cmd, ult)
}

export function runUlt(api: KitApi, caster: Unit, targetId?: string) {
  const hero = caster.cardId ? getHero(caster.cardId) : undefined
  if (!hero?.script) return
  const focus: Focus = { zone: isZoneId(targetId) ? targetId : caster.zone, target: targetId }
  onUltCast(api, caster)
  for (const line of hero.script.ult) runLine(api, caster, focus, line)
}

export function onUltCast(api: KitApi, caster: Unit) {
  if (caster.owner === 'neutral' || caster.dead) return
  const ult = labelOf(caster)
  if (hasTag(caster, 'onUlt:stunLane')) for (const e of foes(api.s, caster, caster.zone)) applyVerb(api, caster, e, 'stun', ult)
  if (hasTag(caster, 'onUlt:haste')) applyVerb(api, caster, caster, 'haste', ult)
  if (hasTag(caster, 'onUlt:invis')) applyVerb(api, caster, caster, 'invisible', ult)
  for (const a of friends(api.s, caster, caster.zone)) {
    if (a.uid === caster.uid || a.status.broken) continue
    if (hasTag(a, 'onUlt:healLane')) for (const ally of heroes(friends(api.s, a, a.zone))) api.heal(ally, getHero(a.cardId!).passive.name)
    if (hasTag(a, 'onUlt:largo')) for (const e of foes(api.s, a, a.zone).slice(0, 1)) api.magic(a, e.uid, 1, getHero(a.cardId!).passive.name)
    if (hasTag(a, 'onUlt:ogre')) {
      const e = foes(api.s, a, a.zone)[0]
      if (e) {
        applyVerb(api, a, e, 'stun', getHero(a.cardId!).passive.name)
        api.magic(a, e.uid, 1, getHero(a.cardId!).passive.name)
      }
    }
    if (hasTag(a, 'onUlt:omni')) api.heal(caster, getHero(a.cardId!).passive.name)
  }
  for (const e of foes(api.s, caster, caster.zone)) {
    if (e.kind !== 'hero' || e.status.broken) continue
    if (hasTag(e, 'onUlt:rubick')) api.xp(e.owner as PlayerId, 1)
    if (hasTag(e, 'onUlt:pugna')) api.magic(e, caster.uid, 1, getHero(e.cardId!).passive.name)
    if (hasTag(e, 'onUlt:veno') && !e.passiveSpent) {
      e.passiveSpent = true
      applyVerb(api, e, caster, 'stun', getHero(e.cardId!).passive.name)
    }
  }
}

function pos1(s: GameState, u: Unit) {
  return u.owner !== 'neutral' && s.zones[u.zone][u.owner][0] === u.uid
}

export function opening(api: KitApi) {
  const s = api.s
  for (const u of Object.values(s.units)) {
    if (u.dead || u.kind !== 'hero' || u.status.broken || !u.cardId) continue
    const psv = getHero(u.cardId).passive.name
    if (hasTag(u, 'once:invis') && !u.passiveSpent) {
      u.passiveSpent = true
      u.status.invisible = true
      api.log(`${api.name(u)} is Invisible.`, u.owner)
    }
    if (hasTag(u, 'once:creep') && !u.passiveSpent) {
      u.passiveSpent = true
      const deck = s.unitDeck
      const idx = deck.findIndex((c) => c.cardId === 'creep' || c.cardId === 'siege')
      if (idx >= 0) {
        const [card] = deck.splice(idx, 1)
        api.shuffleDeck()
        const creep = api.make({ kind: card.cardId === 'siege' ? 'siege' : 'creep', owner: u.owner, zone: u.zone, hp: 1 })
        if (u.owner !== 'neutral') s.zones[u.zone][u.owner].push(creep.uid)
        api.log(`${api.name(u)} calls a creep into the lane.`, u.owner)
      }
    }
    if (hasTag(u, 'once:return') && !u.passiveSpent) {
      const front = foes(s, u, u.zone).find((e) => e.kind === 'hero')
      if (front) {
        u.passiveSpent = true
        api.returnToHand(front)
        api.log(`${api.name(front)} is returned to hand.`, u.owner)
      }
    }
    if (hasTag(u, 'once:pull') && !u.passiveSpent) {
      for (const z of NEXT[u.zone]) {
        const adj = foes(s, u, z).find((e) => e.kind === 'hero' && !e.status.rooted)
        if (!adj) continue
        u.passiveSpent = true
        api.move(adj, u.zone, true, 'move')
        adj.status.rooted = true
        api.log(`${api.name(adj)} is pulled in and Rooted.`, u.owner)
        break
      }
    }
    if ((hasTag(u, 'once:stunPos1') || hasTag(u, 'once:hexPos1')) && !u.passiveSpent) {
      const front = foes(s, u, u.zone).find((e) => e.kind === 'hero')
      if (front) {
        u.passiveSpent = true
        applyVerb(api, u, front, hasTag(u, 'once:hexPos1') ? 'hex' : 'stun', psv)
      }
    }
    if (hasTag(u, 'once:tower') && !u.passiveSpent && isLane(u.zone) && u.owner !== 'neutral') {
      u.passiveSpent = true
      const tw = s.players[u.owner].structures.towers[u.zone]
      if (tw.t1 > 0) tw.t1 = Math.min(TOWER_HP.t1, tw.t1 + 1)
      else if (tw.t2 > 0) tw.t2 = Math.min(TOWER_HP.t2, tw.t2 + 1)
      api.log(`${api.name(u)} mends the allied tower.`, u.owner)
    }
    if (hasTag(u, 'aura:clock')) {
      for (const e of foes(s, u, u.zone)) {
        if (e.kind === 'hero' && e.status.invisible && !e.status.revealed) {
          e.status.revealed = true
          e.status.invisible = false
          api.magic(u, e.uid, 1, psv)
        }
      }
    }
    if (hasTag(u, 'aura:slowLane')) for (const e of foes(s, u, u.zone)) applyVerb(api, u, e, 'slow', psv)
    if (hasTag(u, 'aura:curseLane')) for (const e of foes(s, u, u.zone)) applyVerb(api, u, e, 'curse', psv)
    if (hasTag(u, 'aura:stripShield')) {
      for (const e of foes(s, u, u.zone)) {
        if (e.status.shield > 0) {
          e.status.shield = 0
          e.persistentShield = false
          api.log(`${api.name(e)} loses Shield.`, u.owner)
        }
      }
    }
    if (hasTag(u, 'aura:rootEnemies')) for (const e of heroes(foes(s, u, u.zone))) applyVerb(api, u, e, 'root', psv)
    if (hasTag(u, 'aura:enfeeblePos1') || hasTag(u, 'aura:silencePos1') || hasTag(u, 'aura:slowPos1')) {
      const front = foes(s, u, u.zone)[0]
      if (front) {
        if (hasTag(u, 'aura:enfeeblePos1')) applyVerb(api, u, front, 'enfeeble', psv)
        if (hasTag(u, 'aura:silencePos1')) applyVerb(api, u, front, 'silence', psv)
        if (hasTag(u, 'aura:slowPos1')) applyVerb(api, u, front, 'slow', psv)
      }
    }
    if (hasTag(u, 'aura:oraclePos1')) {
      const front = foes(s, u, u.zone)[0]
      if (front) {
        applyVerb(api, u, front, 'disarm', psv)
        applyVerb(api, u, front, 'immune', psv)
      }
    }
    if (hasTag(u, 'aura:shieldPos1')) {
      const front = friends(s, u, u.zone)[0]
      if (front) applyVerb(api, u, front, 'shield', psv, false)
    }
    if (hasTag(u, 'aura:ampPos1')) {
      const front = friends(s, u, u.zone)[0]
      if (front) applyVerb(api, u, front, 'amplify', psv)
    }
    if (hasTag(u, 'aura:ampMelee')) {
      for (const a of friends(s, u, u.zone)) if (a.kind === 'hero' && isMeleeUnit(a)) applyVerb(api, u, a, 'amplify', psv)
    }
    if (hasTag(u, 'aura:hasteCreeps')) {
      for (const a of friends(s, u, u.zone)) if (a.kind === 'creep' || a.kind === 'siege') a.status.haste = true
    }
    if (hasTag(u, 'aura:reveal') && u.owner !== 'neutral') {
      for (const e of Object.values(s.units)) {
        if (e.owner === other(u.owner) && e.kind === 'hero' && !e.dead) {
          e.status.revealed = true
          e.status.invisible = false
        }
      }
    }
    if (hasTag(u, 'aura:healFirst')) {
      const hurt = friends(s, u, u.zone).find((a) => a.kind === 'hero' && a.hp < a.maxHp)
      if (hurt) api.heal(hurt, psv)
    }
  }
}

export function combatAuras(api: KitApi) {
  for (const u of Object.values(api.s.units)) {
    if (u.dead || !hasTag(u, 'aura:hasteNight') && !hasTag(u, 'aura:thirst') && !hasTag(u, 'aura:disarmWounded')) continue
    if (hasTag(u, 'aura:hasteNight') && !api.daytime()) u.status.haste = true
    if (hasTag(u, 'aura:thirst') && heroes(foes(api.s, u, u.zone)).some((e) => e.hp < e.maxHp)) u.status.haste = true
    if (hasTag(u, 'aura:disarmWounded') && u.hp < u.maxHp) {
      for (const e of foes(api.s, u, u.zone)) e.status.disarmed = true
    }
  }
}

export function endStep(api: KitApi) {
  for (const u of Object.values(api.s.units)) {
    if (u.dead || u.kind !== 'hero') continue
    const psv = u.cardId ? getHero(u.cardId).passive.name : 'End'
    if (u.status.healEnd || hasTag(u, 'aura:healEnd')) api.heal(u, psv)
    if (hasTag(u, 'aura:healJungle') && !isLane(u.zone)) api.heal(u, psv)
    if (hasTag(u, 'aura:healSafe') && (u.status.invisible || foes(api.s, u, u.zone).length === 0)) api.heal(u, psv)
    if (hasTag(u, 'aura:healAlliesEnd')) for (const a of heroes(friends(api.s, u, u.zone))) api.heal(a, psv)
  }
}

/** Delayed end-of-turn damage. It lands after the Ancient heal, so a Curse can still block that heal. */
export function endStepDamage(api: KitApi) {
  const s = api.s
  for (const u of Object.values(s.units)) {
    if (u.dead || u.kind !== 'hero') continue
    const psv = u.cardId ? getHero(u.cardId).passive.name : 'End'
    if (hasTag(u, 'aura:mdmgWoundedEnd')) {
      for (const e of foes(s, u, u.zone)) if (e.status.tookDamage && !e.dead) api.magic(u, e.uid, 1, psv)
    }
  }
}

export function attackExtra(s: GameState, u: Unit, target: Unit | undefined, day: boolean): number {
  if (!scripted(u) || u.status.broken) return 0
  let n = 0
  if (hasTag(u, 'atk:curse') && target?.status.cursed) n++
  if (hasTag(u, 'atk:stun') && target?.status.stunned) n++
  if (hasTag(u, 'atk:melee') && target && isMeleeUnit(target)) n++
  if (hasTag(u, 'atk:roshan') && target?.kind === 'roshan') n++
  if (hasTag(u, 'aura:ampWounded') && u.hp < u.maxHp) n++
  if (hasTag(u, 'aura:ampJungle') && !isLane(u.zone)) n++
  if (hasTag(u, 'aura:ampNight') && !day) n++
  if (hasTag(u, 'aura:ampNoMelee') && u.owner !== 'neutral' && !foes(s, u, u.zone).some((e) => isMeleeUnit(e))) n++
  if (hasTag(u, 'aura:ampXp') && u.owner !== 'neutral' && s.players[u.owner].xp > s.players[other(u.owner)].xp) n++
  if (hasTag(u, 'aura:thirst') && heroes(foes(s, u, u.zone)).some((e) => e.hp < e.maxHp)) n++
  return n
}

export function towerBonus(u: Unit): number {
  return hasTag(u, 'atk:tower') ? 1 : 0
}

/** A reason to negate this hit, or null. May spend a once-per-turn evade. */
export function passiveBlock(s: GameState, t: Unit, src: Unit | null, kind: string, magic: boolean): string | null {
  if (!scripted(t) && !alliesHelp(s, t)) return null
  const attack = kind === 'attack'
  const ranged = !!src && isRanged(src)
  const melee = !!src && isMeleeUnit(src)
  if (hasTag(t, 'block:firstAtk') && attack && !t.status.blurUsed) {
    t.status.blurUsed = true
    return getHero(t.cardId!).passive.name
  }
  if (hasTag(t, 'block:firstDmg') && kind !== 'self' && !t.status.blurUsed) {
    t.status.blurUsed = true
    return getHero(t.cardId!).passive.name
  }
  if (hasTag(t, 'block:ranged') && attack && ranged) return getHero(t.cardId!).passive.name
  if (hasTag(t, 'block:melee') && attack && melee && src?.owner !== t.owner) return getHero(t.cardId!).passive.name
  if (hasTag(t, 'block:meleeHero') && attack && melee && src?.kind === 'hero') return getHero(t.cardId!).passive.name
  if (hasTag(t, 'block:creep') && src && (src.kind === 'creep' || src.kind === 'siege')) return getHero(t.cardId!).passive.name
  if (hasTag(t, 'block:tower') && kind === 'tower') return getHero(t.cardId!).passive.name
  if (hasTag(t, 'block:jungle') && attack && !isLane(t.zone)) return getHero(t.cardId!).passive.name
  if (hasTag(t, 'block:spell') && magic && !t.status.blurUsed) {
    t.status.blurUsed = true
    return getHero(t.cardId!).passive.name
  }
  if (hasTag(t, 'block:spellHit') && !t.status.blurUsed && (kind === 'ult' || kind === 'item' || (attack && ranged))) {
    t.status.blurUsed = true
    return getHero(t.cardId!).passive.name
  }
  if (attack && ranged && !t.status.blurUsed && allyHas(s, t, 'aura:evadeRangedAllies')) {
    t.status.blurUsed = true
    return 'Magnetic Field'
  }
  if (pos1(s, t) && !t.status.blurUsed && kind !== 'self' && allyHas(s, t, 'aura:pos1Evade')) {
    t.status.blurUsed = true
    return 'Tag Team'
  }
  if (pos1(s, t) && attack && !t.status.blurUsed && allyHas(s, t, 'aura:pos1EvadeAtk')) {
    t.status.blurUsed = true
    return 'Spotlight'
  }
  return null
}

function allyHas(s: GameState, t: Unit, tag: string) {
  if (t.owner === 'neutral') return false
  return unitsIn(s, t.owner, t.zone).some((u) => hasTag(u, tag))
}

function alliesHelp(s: GameState, t: Unit) {
  return scripted(t) || (t.owner !== 'neutral' && unitsIn(s, t.owner, t.zone).some((u) => scripted(u)))
}

export function preDamage(t: Unit): boolean {
  if (hasTag(t, 'onDmg:abaddon') && t.hp < t.maxHp && !t.passiveSpent) {
    t.passiveSpent = true
    t.hp = t.maxHp
    return true
  }
  return false
}

export function onDamaged(api: KitApi, t: Unit, src: Unit | null, amount: number) {
  if (api.depth.n > 0 || amount <= 0 || !scripted(t)) return
  api.depth.n++
  const psv = getHero(t.cardId!).passive.name
  try {
    if (hasTag(t, 'onDmg:pdmg:epos1')) {
      const e = foes(api.s, t, t.zone)[0]
      if (e && e.uid !== src?.uid) api.physical(t, e.uid, 1, psv)
      else if (e) api.physical(t, e.uid, 1, psv)
    }
    if (hasTag(t, 'onDmg:pdmg:laneE')) for (const e of foes(api.s, t, t.zone)) api.physical(t, e.uid, 1, psv)
    if (hasTag(t, 'onDmg:pdmg:attacker') && src && !src.dead) api.physical(t, src.uid, 1, psv)
    if (hasTag(t, 'onDmg:spectre')) {
      const e = foes(api.s, t, t.zone)[0]
      if (e) api.physical(t, e.uid, amount, psv)
    }
    if (hasTag(t, 'onDmg:viper') && src && !src.dead && isMeleeUnit(src)) api.magic(t, src.uid, 1, psv)
    if (hasTag(t, 'onDmg:nyx') && src && !src.dead && !t.status.blurUsed) {
      t.status.blurUsed = true
      applyVerb(api, t, src, 'stun', psv)
      api.physical(t, src.uid, amount, psv)
    }
    if (hasTag(t, 'onDmg:invis')) t.status.invisible = true
  } finally {
    api.depth.n--
  }
}

export function onDeath(api: KitApi, dead: Unit, src: Unit | null) {
  if (api.depth.n > 2) return
  api.depth.n++
  try {
    const zone = dead.zone
    for (const u of Object.values(api.s.units)) {
      if (u.dead || u.zone !== zone || u.uid === dead.uid || !scripted(u)) continue
      const psv = getHero(u.cardId!).passive.name
      const creep = dead.kind === 'creep' || dead.kind === 'siege'
      const enemyHero = dead.kind === 'hero' && dead.owner !== u.owner
      if (hasTag(u, 'death:gold') && creep) api.gold(u.owner as PlayerId, 1)
      if (hasTag(u, 'death:heal') && enemyHero) api.heal(u, psv)
      if (hasTag(u, 'death:shield') && dead.owner !== u.owner) api.shield(u, false)
      if (hasTag(u, 'death:amp') && enemyHero) u.status.bonusDamage += 1
      if (hasTag(u, 'death:xp') && dead.owner !== u.owner && u.owner !== 'neutral') api.xp(u.owner, 1)
      if (hasTag(u, 'death:decoy') && dead.kind === 'hero' && dead.owner === u.owner) {
        const decoy = api.make({ kind: 'illusion', cardId: dead.cardId, owner: u.owner, zone, hp: 1 })
        api.s.zones[zone][u.owner as PlayerId].push(decoy.uid)
      }
      if (hasTag(u, 'death:silenceLane') && dead.kind === 'hero') {
        for (const e of foes(api.s, u, zone)) applyVerb(api, u, e, 'silence', psv)
      }
    }
    if (hasTag(dead, 'death:skeleton') && dead.owner !== 'neutral') {
      const sk = api.make({ kind: 'creep', owner: dead.owner, zone: dead.zone, hp: 1 })
      api.s.zones[dead.zone][dead.owner].push(sk.uid)
      api.log('A wounded skeleton keeps fighting.', dead.owner)
    }
    if (hasTag(dead, 'death:techies')) {
      for (const e of foes(api.s, dead, dead.zone)) api.magic(dead, e.uid, 1, getHero(dead.cardId!).passive.name)
    }
    if (hasTag(dead, 'death:tower') && dead.owner !== 'neutral' && isLane(dead.zone)) {
      api.hitTower(dead, dead.zone, 1)
    }
    if (hasTag(dead, 'death:clone') && !dead.copy && dead.owner !== 'neutral') {
      const copy = api.make({ kind: 'hero', cardId: dead.cardId, owner: dead.owner, zone: dead.zone, hp: 1, copy: true })
      api.s.zones[dead.zone][dead.owner].push(copy.uid)
      api.log('A wounded double remains.', dead.owner)
    }
    if (hasTag(dead, 'deathUlt')) runUlt(api, dead)
    if (hasTag(dead, 'link:ld')) {
      for (const b of Object.values(api.s.units)) {
        if (!b.dead && b.cardId === 'spirit_bear' && b.owner === dead.owner) api.physical(dead, b.uid, 99, 'Spirit Link')
      }
    }
    if (hasTag(dead, 'link:bear')) {
      const ld = Object.values(api.s.units).find((u) => !u.dead && u.owner === dead.owner && u.cardId === 'lone_druid')
      if (ld) api.physical(dead, ld.uid, 1, 'Spirit Link')
    }
    if (src && hasTag(src, 'onKillHit')) {
      for (const e of foes(api.s, src, src.zone)) api.magic(src, e.uid, 1, getHero(src.cardId!).passive.name)
    }
  } finally {
    api.depth.n--
  }
}

export function onHit(api: KitApi, attacker: Unit, target: Unit, dealt: number) {
  if (dealt <= 0 || attacker.status.broken) return
  const psv = attacker.cardId && attacker.kind === 'hero' ? getHero(attacker.cardId).passive.name : 'Attack'
  if (hasTag(attacker, 'onHit:disarm') && !target.dead) applyVerb(api, attacker, target, 'disarm', psv)
  if (hasTag(attacker, 'onHit:stun') && !target.dead) applyVerb(api, attacker, target, 'stun', psv)
  if (hasTag(attacker, 'onHit:root') && target.kind === 'hero' && !target.dead) applyVerb(api, attacker, target, 'root', psv)
  if (hasTag(attacker, 'onHit:gold') && attacker.owner !== 'neutral') api.gold(attacker.owner, 1)
  if (hasTag(attacker, 'onHit:xp') && target.owner !== 'neutral' && target.owner !== attacker.owner) api.xp(target.owner as PlayerId, -1)
  if (hasTag(attacker, 'onHit:amp')) attacker.status.bonusDamage += 1
  if (hasTag(attacker, 'onHit:decoy')) runLine(api, attacker, { zone: attacker.zone }, 'decoy')
  if (hasTag(attacker, 'onHit:curseSlow') && !target.dead) {
    applyVerb(api, attacker, target, 'curse', psv)
    applyVerb(api, attacker, target, 'slow', psv)
  }
  if (hasTag(attacker, 'onHit:dayHeal') && api.daytime()) api.heal(attacker, psv)
  if (hasTag(attacker, 'onHit:disarmTower') && attacker.owner !== 'neutral' && isLane(attacker.zone)) {
    api.silenceTower(other(attacker.owner), attacker.zone)
  }
  if (attacker.status.lifesteal) api.heal(attacker, psv)
  if (attacker.status.skadi && !target.dead) {
    applyVerb(api, attacker, target, 'slow', 'Eye of Skadi')
    applyVerb(api, attacker, target, 'curse', 'Eye of Skadi')
  }
  if (attacker.status.magicOnHit > 0 && !target.dead) api.magic(attacker, target.uid, attacker.status.magicOnHit, 'Monkey King Bar')
  if (pos1(api.s, attacker) && allyHas(api.s, attacker, 'aura:pos1Lifesteal')) api.heal(attacker, 'Sidekick')
  for (const a of friends(api.s, attacker, attacker.zone)) {
    if (a.status.lifestealAura && a.uid !== attacker.uid) api.heal(attacker, getHero(a.cardId!).ult.name)
  }
  const mine = Object.values(api.s.units).find((u) => !u.dead && hasTag(u, 'death:techies') && u.link === target.uid && u.owner === target.owner)
  if (mine && attacker.owner !== target.owner) {
    for (const e of foes(api.s, target, target.zone)) {
      applyVerb(api, mine, e, 'disarm', 'Blast Off')
      api.magic(mine, e.uid, 1, 'Blast Off')
    }
  }
}

export function onEnter(api: KitApi, u: Unit) {
  if (u.status.rupture) api.magic(null, u.uid, 2, 'Rupture')
  if (!scripted(u)) return
  const psv = getHero(u.cardId!).passive.name
  const front = foes(api.s, u, u.zone)[0]
  if (hasTag(u, 'onEnter:silence') && front) applyVerb(api, u, front, 'silence', psv)
  if (hasTag(u, 'onEnter:root') && front) applyVerb(api, u, front, 'root', psv)
  if (hasTag(u, 'onEnter:amp')) applyVerb(api, u, u, 'amplify', psv)
  if (hasTag(u, 'onEnter:shield')) applyVerb(api, u, u, 'shield', psv, false)
}

export function enemyEntered(api: KitApi, entrant: Unit) {
  if (entrant.kind !== 'hero' || entrant.owner === 'neutral') return
  for (const u of unitsIn(api.s, other(entrant.owner), entrant.zone)) {
    if (hasTag(u, 'onEnter:enemyShield')) applyVerb(api, u, u, 'shield', getHero(u.cardId!).passive.name, false)
  }
}

export function onItem(_api: KitApi, u: Unit) {
  if (hasTag(u, 'onItem:evade')) u.status.evade += 1
  if (hasTag(u, 'onItem:haste')) u.status.haste = true
}

export function noteHeal(api: KitApi, u: Unit) {
  if (!hasTag(u, 'onHeal:link')) return
  const front = friends(api.s, u, u.zone).find((a) => a.uid !== u.uid && a.kind === 'hero')
  if (front) api.heal(front, 'Tether')
}

export function lethalSave(u: Unit): 'full' | 'wound' | null {
  if (u.passiveSpent || u.status.broken || !scripted(u)) return null
  if (hasTag(u, 'save:full')) return 'full'
  if (hasTag(u, 'save:wound')) return 'wound'
  return null
}

export function targetFilter(u: Unit, pool: string[], s: GameState): string[] | null {
  if (!scripted(u)) return null
  const units = pool.map((id) => s.units[id]).filter(Boolean)
  if (hasTag(u, 'targets:all')) return pool
  if (hasTag(u, 'targets:cleave')) return pool.slice(0, 2)
  if (hasTag(u, 'targets:heroes')) {
    const heroesOnly = units.filter((x) => x.kind === 'hero').map((x) => x.uid)
    return heroesOnly.length ? heroesOnly : pool.slice(0, 1)
  }
  if (hasTag(u, 'targets:creeps')) {
    const creeps = units.filter((x) => x.kind === 'creep' || x.kind === 'siege').map((x) => x.uid)
    return creeps.length ? creeps : pool.slice(0, 1)
  }
  return null
}
