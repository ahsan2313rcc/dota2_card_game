import { describe, expect, it } from 'vitest'
import { aiAssign, aiDraw, aiUlts, playAiRound } from './ai'
import { HEROES, REGULAR_CREEPS, SIEGE_CREEPS, TOWER_CARD_IDS } from './cards'
import {
  buyShield,
  buyback,
  shieldBlockReason,
  buybackBlockReason,
  buybackCost,
  discardFromHand,
  discardToHandLimit,
  drawBlockReason,
  campNeutral,
  declareUlt,
  drawCard,
  endDraw,
  endItems,
  endRotation,
  handCount,
  heroesOnBoard,
  lineup,
  newGame,
  nextRound,
  passResponse,
  placeCreep,
  placeHero,
  playItem,
  resolveRound,
  reveal,
  rotateHero,
  rotationTargets,
  ultBlockReason,
  ultCost,
} from './engine'
import { BOARD_LIMIT, CAMPS, DRAW_CAP, HAND_LIMIT, LANES, PLAYERS, STARTING_HEROES, ZONES, type CampId, type GameState, type HandCard } from './types'

/** Fresh game in the assign step with chosen hands. */
function setup(seed: number, radiant: HandCard[], dire: HandCard[] = []): GameState {
  const s = endDraw(newGame(undefined, seed))
  s.players.radiant.hand = radiant
  s.players.dire.hand = dire
  return s
}

/** Turn whatever spawned in a camp into the given boss or neutral. */
function forceCamp(s: GameState, camp: CampId, kind: 'neutral' | 'roshan' | 'tormentor', cardId: string = kind) {
  const u = campNeutral(s, camp)!
  const hp = kind === 'roshan' ? 3 : 2
  Object.assign(u, { kind, cardId, hp, maxHp: hp })
  u.status.shield = kind === 'tormentor' ? 1 : 0
  return u
}

/** Reveal, skip items and ults, and resolve combat (the round stops at Rotation). */
const fight = (s: GameState) => resolveRound(endItems(reveal(s)))
const finish = (s: GameState) => endRotation(fight(s))

const hero = (iid: string, cardId: string): HandCard => ({ iid, type: 'hero', cardId })

/** Move a unit that was assigned legally. Combat tests still need a hero in the enemy jungle. */
function station(s: GameState, p: 'radiant' | 'dire', uid: string, zone: GameState['units'][string]['zone']) {
  const u = s.units[uid]
  s.zones[u.zone][p] = s.zones[u.zone][p].filter((id) => id !== uid)
  u.zone = zone
  s.zones[zone][p].push(uid)
}
const item = (iid: string, cardId: string): HandCard => ({ iid, type: 'item', cardId })
const logHas = (s: GameState, text: string) => s.log.some((l) => l.text.includes(text))

describe('setup and core rules', () => {
  it('shuffles 160 cards, deals 5 to each side, and hides one of each tower card per tier', () => {
    const s = newGame(undefined, 42)
    expect(s.round).toBe(1)
    const dealt = PLAYERS.flatMap((p) => s.players[p].hand)
    const pile = [...s.unitDeck.map((c) => c.cardId), ...dealt.map((c) => c.cardId)]
    expect(pile).toHaveLength(HEROES.length + REGULAR_CREEPS + SIEGE_CREEPS)
    expect(pile.filter((id) => id === 'creep')).toHaveLength(REGULAR_CREEPS)
    expect(pile.filter((id) => id === 'siege')).toHaveLength(SIEGE_CREEPS)
    const heroIds = pile.filter((id) => id !== 'creep' && id !== 'siege')
    expect(heroIds).toHaveLength(HEROES.length)
    expect(new Set(heroIds).size).toBe(HEROES.length)
    expect(s.unitDeck).toHaveLength(pile.length - STARTING_HEROES * 2)
    expect(s.itemDeck).toHaveLength(60)
    expect(s.runeDeck).toHaveLength(20)
    for (const p of PLAYERS) {
      expect(s.players[p].hand).toHaveLength(5)
      expect(s.players[p].gold).toBe(1)
      for (const tier of ['t1', 't2'] as const) {
        expect(LANES.map((l) => s.players[p].towerCards[l][tier]).sort()).toEqual([...TOWER_CARD_IDS].sort())
      }
    }
    // Heroes and creeps are shuffled together, so the top of the deck is not a run of creeps.
    let heroDraws = 0
    for (let seed = 1; seed <= 40; seed++) {
      const top = newGame(undefined, seed).unitDeck.slice(-8)
      heroDraws += top.filter((c) => c.cardId !== 'creep' && c.cardId !== 'siege').length
    }
    expect(heroDraws).toBeGreaterThan(40 * 8 * 0.25)
    for (const camp of CAMPS) expect(campNeutral(s, camp)).toBeDefined()
    expect(s.runeDeck).toHaveLength(20)
    expect(s.neutralDeck.length + 2).toBe(15)
  })

  it('includes one copy of every Dota hero, and a pool ultimate deals its damage', () => {
    expect(HEROES).toHaveLength(127)
    expect(new Set(HEROES.map((h) => h.id)).size).toBe(127)
    let s = setup(3, [hero('es', 'earthshaker')], [hero('b', 'axe')])
    s = placeHero(s, 'radiant', 'es', 'mid')
    s = placeHero(s, 'dire', 'b', 'mid')
    s = reveal(s)
    s.players.radiant.xp = 2
    s = declareUlt(s, heroesOnBoard(s, 'radiant')[0].uid)
    const axe = heroesOnBoard(s, 'dire')[0]
    expect(logHas(s, 'Echo Slam deals 1 to Dire Axe')).toBe(true)
    expect(axe.status.stunned).toBe(true)
    expect(axe.hp).toBe(1)
    s = resolveRound(s)
    expect(heroesOnBoard(s, 'dire')).toHaveLength(0)
    expect(logHas(s, 'Stunned and cannot attack')).toBe(true)
  })

  it('limits hero placements to 3 per round', () => {
    let s = setup(7, ['axe', 'sven', 'pudge', 'tidehunter', 'wraith_king'].map((id, i) => hero(String(i), id)))
    for (const c of [...s.players.radiant.hand]) s = placeHero(s, 'radiant', c.iid, 'mid')
    expect(heroesOnBoard(s, 'radiant')).toHaveLength(3)
    expect(s.players.radiant.hand).toHaveLength(2)
  })

  it('a draw takes the top of the mixed deck, hero or creep', () => {
    let s = newGame(undefined, 3)
    s.players.radiant.hand = []
    s.players.radiant.gold = 2
    const before = s.unitDeck.length
    s.unitDeck = [
      { cardId: 'axe', buybackUsed: false },
      { cardId: 'siege', buybackUsed: false },
    ]
    s = drawCard(s, 'radiant', 'unit')
    expect(s.players.radiant.hand.at(-1)).toMatchObject({ type: 'creep', cardId: 'siege' })
    expect(s.unitDeck).toHaveLength(1)
    s = drawCard(s, 'dire', 'unit')
    expect(s.players.dire.hand.at(-1)).toMatchObject({ type: 'hero', cardId: 'axe' })
    expect(s.unitDeck).toHaveLength(0)
    expect(before).toBeGreaterThan(0)
    s.unitDeck = []
    s.unitDiscard = [{ cardId: 'creep', buybackUsed: false }]
    s.heroDiscard = [{ cardId: 'sniper', owner: 'radiant', buybackUsed: false }]
    s.players.radiant.gold = 1
    s = drawCard(s, 'radiant', 'unit')
    expect(['creep', 'sniper']).toContain(s.players.radiant.hand.at(-1)!.cardId)
    expect(s.heroDiscard).toEqual([])
    expect(s.unitDiscard).toEqual([])
  })

  it('creeps are cards: drawn for 1 Gold, played into a lane, and they stay until killed', () => {
    let s = newGame(undefined, 9)
    s.unitDeck.push({ cardId: 'creep', buybackUsed: false })
    s = drawCard(s, 'radiant', 'unit')
    expect(s.players.radiant.gold).toBe(0)
    const drawn = s.players.radiant.hand.at(-1)!
    expect(drawn).toMatchObject({ type: 'creep', cardId: 'creep' })
    s = endDraw(s)
    // The dealt opening hand can contain a siege creep. This check uses two lane creeps.
    s.players.radiant.hand = [drawn, { iid: 'extra', type: 'creep', cardId: 'creep' }]
    s = placeCreep(s, 'radiant', drawn.iid, 'top')
    s = placeCreep(s, 'radiant', 'extra', 'top')
    s = finish(s)
    // The tower shoots Position 1; the second creep survives into the next round.
    expect(lineup(s, 'radiant', 'top')).toHaveLength(1)
    expect(s.players.dire.structures.towers.top.t1).toBeLessThan(3)
    s = nextRound(s)
    expect(lineup(s, 'radiant', 'top')).toHaveLength(1)
  })

  it('a basic attack no longer instakills the attribute it used to counter', () => {
    let s = setup(1, [hero('a', 'juggernaut')], [hero('b', 'sven')])
    s = placeHero(s, 'radiant', 'a', 'mid')
    s = placeHero(s, 'dire', 'b', 'mid')
    s = fight(s)
    expect(heroesOnBoard(s, 'dire')).toHaveLength(1)
    expect(heroesOnBoard(s, 'radiant')).toHaveLength(1)
    expect(logHas(s, 'counters')).toBe(false)
  })

  it('odd rounds let Radiant interrupt first, and the cast resolves before Dire answers', () => {
    let s = setup(3, [hero('a', 'tidehunter')], [hero('b', 'lina')])
    s = placeHero(s, 'radiant', 'a', 'top')
    s = placeHero(s, 'dire', 'b', 'top')
    s = reveal(s)
    expect(s.priority).toBe('radiant')
    const tide = heroesOnBoard(s, 'radiant')[0]
    const lina = heroesOnBoard(s, 'dire')[0]
    s.players.radiant.xp = 2
    s.players.dire.xp = 2
    s = declareUlt(s, tide.uid)
    expect(logHas(s, 'casts Ravage')).toBe(true)
    expect(s.units[lina.uid].status.stunned).toBe(true)
    expect(s.priority).toBe('dire')
    expect(ultBlockReason(s, lina.uid)).toBe('Stunned')
    s.round = 2
    s.ultDeclarations = []
    s.units[lina.uid].status.stunned = false
    s.phase = 'response'
    s.combat = 'before'
    s.passes = 0
    s.priority = 'dire'
    s = declareUlt(s, lina.uid, tide.uid)
    expect(logHas(s, 'Laguna Blade')).toBe(true)
    expect(s.units[tide.uid].hp).toBe(1)
    expect(s.priority).toBe('radiant')
  })

  it('a damaged tower fires at the attacking side Position 1; undamaged towers stay silent', () => {
    let s = setup(5, [hero('a', 'axe'), { iid: 'c', type: 'creep', cardId: 'creep' }])
    s = placeHero(s, 'radiant', 'a', 'mid')
    s = placeCreep(s, 'radiant', 'c', 'mid')
    s = fight(s)
    const axe = heroesOnBoard(s, 'radiant')[0]
    expect(s.players.dire.structures.towers.mid.t1).toBe(1)
    expect(axe.hp).toBe(2)
    expect(s.log.some((l) => l.text.includes('Tier 1 tower') && l.text.includes('Creep'))).toBe(true)
    expect(s.log.some((l) => /(Top|Bottom) Tier \d tower (deals|slays)/.test(l.text))).toBe(false)
  })
})

describe('items, runes and statuses', () => {
  it('shop items cost gold and are single use', () => {
    let s = setup(11, [hero('a', 'sven'), item('i', 'desolator')])
    s = placeHero(s, 'radiant', 'a', 'bot')
    s = reveal(s)
    s.players.radiant.gold = 4
    s = playItem(s, 'radiant', 'i', heroesOnBoard(s, 'radiant')[0].uid)
    expect(s.players.radiant.gold).toBe(2)
    expect(s.players.radiant.hand).toHaveLength(0)
    expect(heroesOnBoard(s, 'radiant')[0].status.bonusDamage).toBe(1)
  })

  it('Break turns off passives (Axe stops hitting back)', () => {
    let s = setup(13, [hero('a', 'crystal_maiden')], [hero('b', 'axe')])
    s = placeHero(s, 'radiant', 'a', 'mid')
    s = placeHero(s, 'dire', 'b', 'mid')
    s = reveal(s)
    heroesOnBoard(s, 'dire')[0].status.broken = true
    s = resolveRound(endItems(s))
    expect(logHas(s, 'Counter Helix')).toBe(false)
  })

  it('Banish: the hero is untouchable and cannot act', () => {
    let s = setup(17, [hero('a', 'juggernaut'), item('i', 'euls')], [hero('b', 'crystal_maiden')])
    s = placeHero(s, 'radiant', 'a', 'mid')
    s = placeHero(s, 'dire', 'b', 'mid')
    s = reveal(s)
    s.players.radiant.gold = 2
    s = playItem(s, 'radiant', 'i', heroesOnBoard(s, 'dire')[0].uid)
    s = resolveRound(endItems(s))
    expect(heroesOnBoard(s, 'dire')).toHaveLength(1)
    expect(s.players.dire.structures.towers.mid.t1).toBeLessThan(3)
  })

  it('Illusion rune: the decoy stands in front and soaks the lethal counter-attack', () => {
    let s = setup(29, [hero('a', 'sven'), item('i', 'rune_illusion')], [hero('b', 'juggernaut')])
    s = placeHero(s, 'radiant', 'a', 'mid')
    s = placeHero(s, 'dire', 'b', 'mid')
    s = reveal(s)
    s = playItem(s, 'radiant', 'i', heroesOnBoard(s, 'radiant')[0].uid)
    expect(s.units[lineup(s, 'radiant', 'mid')[0]].kind).toBe('illusion')
    s = resolveRound(endItems(s))
    expect(heroesOnBoard(s, 'radiant')).toHaveLength(1)
    s = endRotation(s)
    expect(Object.values(s.units).some((u) => u.kind === 'illusion')).toBe(false)
  })

  it('Invisibility rune: enemies cannot target the hero, but it still attacks', () => {
    let s = setup(31, [hero('a', 'crystal_maiden'), item('i', 'rune_invis')], [hero('b', 'sven')])
    s = placeHero(s, 'radiant', 'a', 'mid')
    s = placeHero(s, 'dire', 'b', 'mid')
    s = reveal(s)
    s = playItem(s, 'radiant', 'i', heroesOnBoard(s, 'radiant')[0].uid)
    s = resolveRound(endItems(s))
    expect(heroesOnBoard(s, 'radiant')[0].hp).toBe(2)
    expect(logHas(s, 'Crystal Maiden deals 1 to Dire Sven')).toBe(true)
  })

  it('Haste rune: a hasted Strength hero strikes before Agility', () => {
    let s = setup(37, [hero('a', 'axe'), item('i', 'rune_haste')], [hero('b', 'juggernaut')])
    s = placeHero(s, 'radiant', 'a', 'mid')
    s = placeHero(s, 'dire', 'b', 'mid')
    s = reveal(s)
    s = playItem(s, 'radiant', 'i', heroesOnBoard(s, 'radiant')[0].uid)
    s = resolveRound(endItems(s))
    const axeHit = s.log.findIndex((l) => l.text.startsWith('Axe deals 1 to Dire Juggernaut'))
    const juggHit = s.log.findIndex((l) => l.text.includes('Juggernaut deals 1 to Radiant Axe'))
    expect(axeHit).toBeGreaterThan(-1)
    expect(juggHit).toBeGreaterThan(axeHit)
  })

  it('an active ability keeps its printed XP cost', () => {
    let s = setup(3, [hero('a', 'tidehunter')], [hero('b', 'axe')])
    s = placeHero(s, 'radiant', 'a', 'top')
    s = placeHero(s, 'dire', 'b', 'top')
    s = endItems(reveal(s))
    const tide = heroesOnBoard(s, 'radiant')[0].uid
    expect(ultCost(s.units[tide])).toBe(2)
    s.players.radiant.xp = 2
    s = declareUlt(s, tide)
    expect(s.players.radiant.xp).toBe(0)
    s = resolveRound(s)
    expect(s.units[tide].ultCasts).toBe(1)
    expect(ultCost(s.units[tide])).toBe(2)
    s.phase = 'response'
    s.priority = 'radiant'
    s.passes = 0
    s.combat = 'before'
    s.ultDeclarations = []
    s.players.radiant.xp = 1
    expect(ultBlockReason(s, tide)).toBe('Needs 2 XP')
    s.players.radiant.xp = 2
    s = declareUlt(s, tide)
    expect(s.players.radiant.xp).toBe(0)
    s.phase = 'response'
    s.priority = 'radiant'
    s.passes = 0
    s.players.radiant.gold = 3
    s.players.radiant.hand.push(item('r', 'refresher'))
    s = playItem(s, 'radiant', 'r', tide)
    expect(s.units[tide].status.echoUlt).toBe(true)
    expect(ultCost(s.units[tide])).toBe(2)
  })

  it('refuses a second ability in the same turn, and a Refresher allows one more at no extra XP', () => {
    let s = setup(43, [hero('a', 'tidehunter'), item('r', 'refresher')], [hero('b', 'axe')])
    s = placeHero(s, 'radiant', 'a', 'top')
    s = placeHero(s, 'dire', 'b', 'top')
    s = reveal(s)
    const tide = heroesOnBoard(s, 'radiant')[0].uid
    s.players.radiant.xp = 4
    s = endItems(s)
    s = declareUlt(s, tide)
    expect(s.players.radiant.xp).toBe(2)
    expect(s.priority).toBe('dire')
    s = passResponse(s, 'dire')
    expect(ultBlockReason(s, tide)).toBe('Already declared')
    const stuck = declareUlt(s, tide)
    expect(stuck.ultDeclarations).toHaveLength(1)
    expect(stuck.players.radiant.xp).toBe(2)
    expect(ultCost(stuck.units[tide])).toBe(2)
    s.players.radiant.gold = 3
    s = playItem(s, 'radiant', 'r', tide)
    expect(s.units[tide].status.echoUlt).toBe(true)
    s = passResponse(s, 'dire')
    s.players.radiant.xp = 2
    s = declareUlt(s, tide)
    expect(s.players.radiant.xp).toBe(2)
    expect(s.ultDeclarations.filter((d) => d.uid === tide)).toHaveLength(2)
    s = passResponse(s, 'dire')
    expect(ultBlockReason(s, tide)).toBe('Already declared')
    expect(ultCost(s.units[tide])).toBe(2)
  })

  it('Arcane rune reduces one hero\'s ability cost by 1 XP', () => {
    let s = setup(41, [hero('a', 'axe'), item('i', 'rune_arcane')], [hero('b', 'sven')])
    s = placeHero(s, 'radiant', 'a', 'mid')
    s = placeHero(s, 'dire', 'b', 'mid')
    s = reveal(s)
    const axe = heroesOnBoard(s, 'radiant')[0].uid
    s = endItems(playItem(s, 'radiant', 'i', axe))
    const xp = s.players.radiant.xp
    expect(ultCost(s.units[axe], s)).toBe(0)
    s = declareUlt(s, axe)
    expect(s.players.radiant.xp).toBe(xp)
  })
})

describe('jungle, Roshan and Tormentor', () => {
  it('clearing a neutral camp grants 1 Gold and a rune card', () => {
    let s = setup(19, [hero('a', 'juggernaut'), hero('c', 'sven')])
    const golem = forceCamp(s, 'radiantJungle', 'neutral', 'golem')
    golem.hp = 1
    s = placeHero(s, 'radiant', 'a', 'radiantJungle')
    s = placeHero(s, 'radiant', 'c', 'radiantJungle')
    const { xp, gold } = s.players.radiant
    s = fight(s)
    expect(campNeutral(s, 'radiantJungle')).toBeUndefined()
    expect(s.players.radiant.hand.some((c) => c.cardId.startsWith('rune_'))).toBe(true)
    expect(s.players.radiant.xp).toBe(xp)
    expect(s.players.radiant.gold).toBe(gold + 1)
  })

  it('a rune from a neutral kill is kept even when the hand is already full', () => {
    let s = setup(19, [hero('a', 'juggernaut'), hero('c', 'sven')])
    s.players.radiant.hand.push(...Array.from({ length: HAND_LIMIT }, (_, i) => item(`f${i}`, 'salve')))
    const golem = forceCamp(s, 'radiantJungle', 'neutral', 'golem')
    golem.hp = 1
    s = placeHero(s, 'radiant', 'a', 'radiantJungle')
    s = placeHero(s, 'radiant', 'c', 'radiantJungle')
    expect(handCount(s.players.radiant)).toBe(HAND_LIMIT)
    s = fight(s)
    expect(s.players.radiant.hand.some((c) => c.cardId.startsWith('rune_'))).toBe(true)
    expect(handCount(s.players.radiant)).toBe(HAND_LIMIT)
    expect(logHas(s, 'hand is full')).toBe(false)
  })

  it('Roshan Roars from a jungle camp while he is at full health', () => {
    let s = setup(23, [hero('a', 'sven')])
    forceCamp(s, 'direJungle', 'roshan')
    s = placeHero(s, 'radiant', 'a', 'radiantJungle')
    station(s, 'radiant', heroesOnBoard(s, 'radiant')[0].uid, 'direJungle')
    s = fight(s)
    expect(logHas(s, 'Radiant Sven is Disarmed by Roar')).toBe(true)
    expect(campNeutral(s, 'direJungle')?.hp).toBe(3)
  })

  it('Roshan is shuffled back if he flips before round 4', () => {
    let s = finish(endDraw(newGame(undefined, 3)))
    for (const camp of CAMPS) {
      delete s.units[s.camps[camp]!]
      s.camps[camp] = null
    }
    s.neutralDeck = ['roshan']
    s.neutralDiscard = ['golem', 'golem']
    s = nextRound(s)
    for (const camp of CAMPS) expect(campNeutral(s, camp)?.kind).not.toBe('roshan')
    expect(logHas(s, 'shuffled back')).toBe(true)
  })

  it('Tormentor: its Shield soaks the first hit, and Reflection returns the damage', () => {
    let s = setup(43, [hero('a', 'sven')])
    forceCamp(s, 'radiantJungle', 'tormentor')
    s = placeHero(s, 'radiant', 'a', 'radiantJungle')
    s = fight(s)
    expect(campNeutral(s, 'radiantJungle')?.hp).toBe(2)
    expect(heroesOnBoard(s, 'radiant')[0].hp).toBe(1)
  })

  it('Tormentor: an uncontested kill pays the Refresher Shard even if the hero dies to Reflection', () => {
    let s = setup(47, [hero('a', 'queen_of_pain')])
    const torm = forceCamp(s, 'radiantJungle', 'tormentor')
    torm.hp = 1
    s = placeHero(s, 'radiant', 'a', 'radiantJungle')
    s = endItems(reveal(s))
    const qop = heroesOnBoard(s, 'radiant')[0]
    qop.hp = 1
    s.players.radiant.xp = 2
    s = declareUlt(s, qop.uid)
    s = resolveRound(s)
    expect(heroesOnBoard(s, 'radiant')).toHaveLength(0)
    expect(s.players.radiant.hand.some((c) => c.cardId === 'refresher_shard')).toBe(true)
  })

  it('Tormentor: when contested, the other side’s front takes the same reflected damage', () => {
    let s = setup(53, [hero('a', 'tidehunter')], [hero('b', 'abaddon')])
    forceCamp(s, 'direJungle', 'tormentor').status.shield = 0
    s = placeHero(s, 'radiant', 'a', 'radiantJungle')
    station(s, 'radiant', heroesOnBoard(s, 'radiant')[0].uid, 'direJungle')
    s.players.radiant.campFocus.direJungle = 'neutral'
    s = placeHero(s, 'dire', 'b', 'direJungle')
    s = fight(s)
    expect(s.log.filter((l) => l.text.startsWith('Tormentor Reflection')).length).toBeGreaterThanOrEqual(1)
    expect(logHas(s, 'absorbs Tormentor Reflection')).toBe(false)
  })
})

describe('comeback rules and rotation', () => {
  it('destroying a tower pays the attacker and gives the hidden card to the defender', () => {
    let s = setup(59, [hero('a', 'sven')])
    s.players.dire.structures.towers.top.t1 = 1
    s.players.dire.hand = Array.from({ length: HAND_LIMIT }, (_, i) => item(`f${i}`, 'salve'))
    const attackerGold = s.players.radiant.gold
    const defenderGold = s.players.dire.gold
    const hidden = s.players.dire.towerCards.top.t1
    s = placeHero(s, 'radiant', 'a', 'top')
    s = fight(s)
    expect(s.players.dire.structures.towers.top.t1).toBe(0)
    expect(s.players.radiant.gold).toBe(attackerGold + 3)
    expect(s.players.dire.gold).toBe(defenderGold)
    expect(s.players.dire.hand.some((c) => c.cardId === hidden)).toBe(true)
    expect(handCount(s.players.dire)).toBe(HAND_LIMIT)
  })

  it('magical abilities still cut through Ethereal', () => {
    const slainBy = (cardId: string, aim: 'lane' | 'unit' | 'none') => {
      let s = setup(73, [hero('a', cardId)], [hero('b', 'sven')])
      s = placeHero(s, 'radiant', 'a', 'mid')
      s = placeHero(s, 'dire', 'b', 'mid')
      s = endItems(reveal(s))
      const foe = heroesOnBoard(s, 'dire')[0]
      foe.status.ethereal = true
      s.players.radiant.xp = 2
      const target = aim === 'lane' ? 'mid' : aim === 'unit' ? foe.uid : undefined
      s = declareUlt(s, heroesOnBoard(s, 'radiant')[0].uid, target)
      s = resolveRound(s)
      return heroesOnBoard(s, 'dire')
    }
    expect(slainBy('ancient_apparition', 'lane')).toHaveLength(0)
    expect(slainBy('queen_of_pain', 'none')).toHaveLength(0)
    expect(slainBy('lina', 'unit')).toHaveLength(0)
  })

  it('Glyph: towers take no damage and do not fire', () => {
    let s = setup(61, [hero('a', 'sven')], [item('g', 'glyph')])
    s = placeHero(s, 'radiant', 'a', 'top')
    s = reveal(s)
    s = passResponse(s, 'radiant')
    s = playItem(s, 'dire', 'g')
    s = resolveRound(s)
    expect(s.players.dire.structures.towers.top.t1).toBe(3)
    expect(heroesOnBoard(s, 'radiant')[0].hp).toBe(2)
  })

  it('buyback costs 4 Gold, or 5 while ahead on towers, from the shared discard', () => {
    const s = newGame(undefined, 67)
    s.heroDiscard = [{ cardId: 'axe', owner: 'radiant', buybackUsed: false }]
    s.players.radiant.gold = 9
    expect(buybackCost(s, 'radiant')).toBe(4)
    s.players.dire.structures.towers.mid.t1 = 0
    expect(buybackCost(s, 'radiant')).toBe(5)
    const after = buyback(s, 'radiant', 'axe')
    expect(after.players.radiant.gold).toBe(4)
    expect(after.heroDiscard).toHaveLength(0)
    expect(after.players.radiant.hand.some((c) => c.cardId === 'axe' && c.buybackUsed)).toBe(true)
  })

  it('buyback can take any of the last 10 heroes, from either side', () => {
    const s = newGame(undefined, 69)
    const ids = HEROES.slice(0, 11).map((h) => h.id)
    s.heroDiscard = ids.map((cardId, i) => ({
      cardId,
      owner: i === 0 || i === ids.length - 1 ? 'radiant' : 'dire',
      buybackUsed: false,
    }))
    s.players.radiant.gold = 8
    expect(buybackBlockReason(s, 'radiant', ids[0])).toMatch(/last 10/)
    expect(buybackBlockReason(s, 'radiant', ids[1])).toBeNull()
    const stolen = buyback(s, 'radiant', ids[1])
    expect(stolen.heroDiscard.some((h) => h.cardId === ids[1])).toBe(false)
    expect(stolen.players.radiant.hand.some((c) => c.cardId === ids[1] && c.buybackUsed)).toBe(true)
    expect(stolen.players.radiant.gold).toBe(4)
    expect(stolen.log.some((l) => l.text.includes("Dire's") && l.text.includes('buys back'))).toBe(true)
  })

  it('a hero can be bought back only once, then stays in the shared discard', () => {
    let s = newGame(undefined, 68)
    s.players.radiant.hand = []
    s.heroDiscard = [{ cardId: 'axe', owner: 'radiant', buybackUsed: false }]
    s.players.radiant.gold = 4
    s = buyback(s, 'radiant', 'axe')
    const card = s.players.radiant.hand.find((c) => c.cardId === 'axe')!
    s.phase = 'assign'
    s = placeHero(s, 'radiant', card.iid, 'mid')
    heroesOnBoard(s, 'radiant').find((u) => u.cardId === 'axe')!.dead = true
    s.phase = 'rotate'
    s = endRotation(s)
    expect(s.heroDiscard).toEqual([{ cardId: 'axe', owner: 'radiant', buybackUsed: true, buybackBlocked: false }])
    expect(s.unitDiscard.some((c) => c.cardId === 'axe')).toBe(false)
    s.phase = 'draw'
    expect(buybackBlockReason(s, 'radiant', 'axe')).toMatch(/cannot be bought back/)
  })

  it('rotation follows the map chain, with a base shortcut from a lane that lost both towers', () => {
    let s = setup(71, [hero('a', 'sven'), hero('b', 'axe')])
    s = placeHero(s, 'radiant', 'a', 'top')
    s = placeHero(s, 'radiant', 'b', 'bot')
    s.players.radiant.structures.towers.bot = { t1: 0, t2: 0 }
    s = fight(s)
    const [top, bot] = ['top', 'bot'].map((z) => heroesOnBoard(s, 'radiant').find((u) => u.zone === z)!)
    expect(rotationTargets(s, top.uid)).toEqual(['direJungle'])
    expect(rotationTargets(s, bot.uid).sort()).toEqual(['mid', 'radiantJungle'])
    s = rotateHero(s, 'radiant', bot.uid, 'mid')
    expect(s.units[bot.uid].zone).toBe('mid')
    expect(rotationTargets(s, bot.uid)).toEqual([])
    expect(rotationTargets(s, top.uid)).toEqual(['direJungle'])
    s = rotateHero(s, 'radiant', top.uid, 'direJungle')
    expect(s.units[top.uid].zone).toBe('direJungle')
    expect(s.players.radiant.rotationsUsed).toBe(2)
    expect(rotationTargets(s, top.uid)).toEqual([])
  })

  it('a hero cannot be assigned straight into the enemy jungle', () => {
    let s = setup(73, [hero('a', 'sven')], [hero('b', 'axe')])
    s = placeHero(s, 'radiant', 'a', 'direJungle')
    s = placeHero(s, 'dire', 'b', 'radiantJungle')
    expect(heroesOnBoard(s, 'radiant')).toHaveLength(0)
    expect(heroesOnBoard(s, 'dire')).toHaveLength(0)
    s = placeHero(s, 'radiant', 'a', 'radiantJungle')
    s = placeHero(s, 'dire', 'b', 'direJungle')
    expect(heroesOnBoard(s, 'radiant')[0].zone).toBe('radiantJungle')
    expect(heroesOnBoard(s, 'dire')[0].zone).toBe('direJungle')
  })
})

describe('opponent decisions', () => {
  it('a thin board spends gold drawing heroes instead of sitting on it', () => {
    let s = newGame(undefined, 1)
    s.players.dire.gold = 3
    s.players.dire.hand = [hero('h', 'axe'), item('deso', 'desolator')]
    s = aiDraw(s, 'dire')
    expect(heroesOnBoard(s, 'dire')).toHaveLength(0)
    expect(s.players.dire.gold).toBe(0)
    expect(s.players.dire.hand.filter((c) => c.type === 'hero' || c.type === 'creep').length).toBeGreaterThan(1)
  })

  it('a stocked board spends gold drawing items to play', () => {
    let s = setup(4, [], ['axe', 'sven', 'pudge'].map((id, i) => hero(String(i), id)))
    s = placeHero(s, 'dire', '0', 'top')
    s = placeHero(s, 'dire', '1', 'mid')
    s = placeHero(s, 'dire', '2', 'bot')
    s.phase = 'draw'
    s.players.dire.gold = 4
    s.players.dire.hand = []
    s = aiDraw(s, 'dire')
    expect(heroesOnBoard(s, 'dire')).toHaveLength(3)
    expect(s.players.dire.hand.some((c) => c.type === 'item')).toBe(true)
    expect(s.players.dire.gold).toBeLessThan(4)
  })

  it('the same ability can be cast again next round, and only a Refresher allows a second cast this turn', () => {
    let s = setup(3, [hero('a', 'tidehunter')], [hero('b', 'axe')])
    s = placeHero(s, 'radiant', 'a', 'top')
    s = placeHero(s, 'dire', 'b', 'top')
    s = reveal(s)
    const tide = heroesOnBoard(s, 'radiant')[0].uid
    s.players.radiant.xp = 2
    s = declareUlt(s, tide)
    expect(s.units[tide].ultCasts).toBe(1)
    s = nextRound(endRotation(resolveRound(s)))
    s = reveal(endDraw(s))
    if (s.priority === 'dire') s = passResponse(s, 'dire')
    s.players.radiant.xp = 2
    s = declareUlt(s, tide)
    expect(s.units[tide].ultCasts).toBe(2)
    expect(s.ultDeclarations.filter((d) => d.uid === tide)).toHaveLength(1)
    if (s.priority === 'dire') s = passResponse(s, 'dire')
    expect(ultBlockReason(s, tide)).toBe('Already declared')
  })

  it('draws from the deck while a buyback is available', () => {
    let s = newGame(undefined, 1)
    s.players.dire.gold = 10
    s.players.dire.hand = [hero('h', 'axe')]
    s.heroDiscard = [{ cardId: 'sven', owner: 'radiant', buybackUsed: false }]
    s = aiDraw(s, 'dire')
    expect(s.log.some((l) => l.text.includes('buys back'))).toBe(false)
    expect(handCount(s.players.dire)).toBe(DRAW_CAP)
    expect(s.players.dire.gold).toBeLessThan(10)
    expect(s.heroDiscard.some((h) => h.cardId === 'sven')).toBe(true)
  })

  it('assigns a counter into the lane that already holds the countered hero', () => {
    let s = setup(1, [hero('sv', 'sven')], [hero('pa', 'phantom_assassin')])
    s = placeHero(s, 'radiant', 'sv', 'mid')
    s = aiAssign(s, 'dire')
    expect(heroesOnBoard(s, 'dire').find((u) => u.cardId === 'phantom_assassin')?.zone).toBe('mid')
  })

  it('will not Chronosphere a lane where its own heroes are stunned as well', () => {
    let s = setup(2, [hero('e1', 'axe')], [hero('fv', 'faceless_void'), hero('ally', 'sven')])
    s = placeHero(s, 'radiant', 'e1', 'mid')
    s = placeHero(s, 'dire', 'fv', 'mid')
    s = placeHero(s, 'dire', 'ally', 'mid')
    s = passResponse(reveal(s), 'radiant')
    s.players.dire.xp = 5
    s = aiUlts(s, 'dire')
    expect(s.priority).toBe('dire')
    expect(s.ultDeclarations.some((d) => s.units[d.uid]?.cardId === 'faceless_void')).toBe(false)
  })

  it('Chronospheres when Void is alone against more enemies', () => {
    let s = setup(3, [hero('e1', 'axe'), hero('e2', 'sven')], [hero('fv', 'faceless_void')])
    s = placeHero(s, 'radiant', 'e1', 'mid')
    s = placeHero(s, 'radiant', 'e2', 'mid')
    s = placeHero(s, 'dire', 'fv', 'mid')
    s = passResponse(reveal(s), 'radiant')
    s.players.dire.xp = 5
    s = aiUlts(s, 'dire')
    expect(s.ultDeclarations.some((d) => s.units[d.uid]?.cardId === 'faceless_void')).toBe(true)
  })
})

describe('gold and xp sinks', () => {
  it('each lane with both towers down adds 1 passive Gold, and three open lanes pay 4', () => {
    let s = newGame(undefined, 5)
    s.phase = 'report'
    for (const p of PLAYERS) s.players[p].hand = []
    const base = s.players.radiant.gold
    s = nextRound(s)
    expect(s.players.radiant.gold).toBe(base + 1)
    s.phase = 'report'
    s.players.dire.structures.towers.mid.t1 = 0
    s.players.dire.structures.towers.mid.t2 = 0
    const one = s.players.radiant.gold
    s = nextRound(s)
    expect(s.players.radiant.gold).toBe(one + 2)
    expect(logHas(s, 'Upkeep: Radiant gains 2 Gold')).toBe(true)
    s.phase = 'report'
    for (const lane of LANES) {
      s.players.dire.structures.towers[lane].t1 = 0
      s.players.dire.structures.towers[lane].t2 = 0
    }
    const all = s.players.radiant.gold
    s = nextRound(s)
    expect(s.players.radiant.gold).toBe(all + 4)
    expect(logHas(s, 'Upkeep: Radiant gains 4 Gold')).toBe(true)
    expect(s.players.dire.gold).toBeGreaterThan(0)
  })

  it('draws past 7, then the next round waits until the hand is discarded down', () => {
    let s = newGame(undefined, 11)
    s.players.radiant.hand = Array.from({ length: HAND_LIMIT }, (_, i) => item(`f${i}`, 'salve'))
    s.players.radiant.hand.push(item('rune', 'rune_gold'))
    s.players.radiant.gold = 1
    s.unitDeck.push({ cardId: 'axe', buybackUsed: false })
    expect(handCount(s.players.radiant)).toBe(HAND_LIMIT)
    expect(drawBlockReason(s, 'radiant', 'unit')).toBeNull()
    s = drawCard(s, 'radiant', 'unit')
    expect(handCount(s.players.radiant)).toBe(HAND_LIMIT + 1)
    expect(s.players.radiant.hand.some((c) => c.cardId === 'rune_gold')).toBe(true)
    s = finish(endDraw(s))
    expect(s.phase).toBe('report')
    const before = s.round
    expect(nextRound(s)).toBe(s)
    const axe = s.players.radiant.hand.find((c) => c.cardId === 'axe')!
    s = discardFromHand(s, 'radiant', axe.iid)
    expect(handCount(s.players.radiant)).toBe(HAND_LIMIT)
    expect(s.unitDiscard).toContainEqual({ cardId: 'axe', buybackUsed: false })
    expect(s.heroDiscard.some((h) => h.cardId === 'axe')).toBe(false)
    expect(s.players.radiant.hand.some((c) => c.cardId === 'rune_gold')).toBe(true)
    s = nextRound(s)
    expect(s.round).toBe(before + 1)
  })

  it('the AI pitches creeps and cheap items before heroes', () => {
    let s = finish(endDraw(newGame(undefined, 13)))
    s.players.dire.hand = [
      ...['axe', 'sven', 'pudge', 'tidehunter', 'wraith_king', 'juggernaut'].map((id, i) => hero(`h${i}`, id)),
      item('cheap', 'salve'),
      item('steep', 'rapier'),
      { iid: 'creep', type: 'creep', cardId: 'creep' },
      item('rune', 'rune_shield'),
    ]
    s = discardToHandLimit(s, 'dire')
    expect(handCount(s.players.dire)).toBe(HAND_LIMIT)
    expect(s.players.dire.hand.some((c) => c.iid === 'creep' || c.iid === 'cheap')).toBe(false)
    expect(s.players.dire.hand.some((c) => c.iid === 'steep')).toBe(true)
    expect(s.players.dire.hand.some((c) => c.cardId === 'rune_shield')).toBe(true)
    expect(s.unitDiscard).toContainEqual({ cardId: 'creep', buybackUsed: false })
  })

  it('3 XP buys one Shield that lasts until it blocks a hit, and a second Shield is refused', () => {
    let s = setup(17, [hero('a', 'sven'), item('i', 'rune_shield')], [hero('b', 'juggernaut')])
    s = placeHero(s, 'radiant', 'a', 'mid')
    s = placeHero(s, 'dire', 'b', 'mid')
    s = reveal(s)
    const uid = heroesOnBoard(s, 'radiant')[0].uid
    s.players.radiant.xp = 6
    s = buyShield(s, 'radiant', uid)
    expect(s.players.radiant.xp).toBe(3)
    expect(s.units[uid].status.shield).toBe(1)
    expect(s.units[uid].persistentShield).toBe(true)
    expect(s.priority).toBe('dire')
    s = passResponse(s, 'dire')
    const stacked = buyShield(s, 'radiant', uid)
    expect(stacked).toBe(s)
    expect(shieldBlockReason(s, 'radiant', uid)).toBe('Already has a Shield')
    expect(s.units[uid].status.shield).toBe(1)
    s = resolveRound(s)
    expect(s.units[uid].hp).toBe(2)
    expect(s.units[uid].status.shield).toBe(0)
    expect(s.units[uid].persistentShield).toBeFalsy()
  })

  it('a Shield bought for XP survives cleanup, and a rune Shield does not', () => {
    const alone = (seed: number) => {
      let s = setup(seed, [hero('a', 'sven')])
      s = placeHero(s, 'radiant', 'a', 'radiantJungle')
      const camp = s.camps.radiantJungle
      if (camp) {
        delete s.units[camp]
        s.camps.radiantJungle = null
      }
      return reveal(s)
    }
    let bought = alone(19)
    const boughtUid = heroesOnBoard(bought, 'radiant')[0].uid
    bought.players.radiant.xp = 3
    bought = buyShield(bought, 'radiant', boughtUid)
    bought = endRotation(resolveRound(bought))
    expect(bought.units[boughtUid].status.shield).toBe(1)
    expect(bought.units[boughtUid].persistentShield).toBe(true)

    let rune = alone(21)
    rune.players.radiant.hand.push(item('r', 'rune_shield'))
    const runeUid = heroesOnBoard(rune, 'radiant')[0].uid
    rune = playItem(rune, 'radiant', 'r', runeUid)
    expect(rune.units[runeUid].status.shield).toBe(1)
    expect(rune.units[runeUid].persistentShield).toBeFalsy()
    rune = endRotation(resolveRound(rune))
    expect(rune.units[runeUid].status.shield).toBe(0)
  })
})

describe('simulation', () => {
  it('plays many full AI-vs-AI games without breaking invariants', () => {
    let finished = 0
    for (let seed = 1; seed <= 60; seed++) {
      let s = newGame(undefined, seed)
      for (let r = 0; r < 80 && !s.winner; r++) {
        s = playAiRound(s)
        for (const p of PLAYERS) {
          const deployed = heroesOnBoard(s, p).filter((u) => !u.copy && u.cardId !== 'spirit_bear')
          expect(deployed.length).toBeLessThanOrEqual(BOARD_LIMIT)
          expect(handCount(s.players[p])).toBeLessThanOrEqual(HAND_LIMIT)
          expect(s.players[p].gold).toBeGreaterThanOrEqual(0)
          expect(s.players[p].xp).toBeGreaterThanOrEqual(0)
          for (const zone of ZONES) {
            for (const uid of lineup(s, p, zone)) expect(s.units[uid].zone).toBe(zone)
          }
        }
        if (s.round < 4) for (const camp of CAMPS) expect(campNeutral(s, camp)?.kind).not.toBe('roshan')
        if (!s.winner) {
          expect(s.phase).toBe('report')
          s = nextRound(s)
        }
      }
      if (s.winner) {
        finished++
        expect(s.phase).toBe('gameover')
      }
    }
    expect(finished).toBeGreaterThan(50)
  }, 60000)
})
