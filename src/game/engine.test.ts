import { describe, expect, it } from 'vitest'
import { aiAssign, aiDraw, aiItems, aiUlts } from './ai'
import {
  campNeutral,
  declareUlt,
  drawCard,
  endDraw,
  endItems,
  handCount,
  heroesOnBoard,
  lineup,
  newGame,
  nextRound,
  placeCreep,
  placeHero,
  playItem,
  resolveRound,
  reveal,
} from './engine'
import { BOARD_LIMIT, HAND_LIMIT, PLAYERS, ZONES, type GameState, type HandCard } from './types'

function playRound(s: GameState): GameState {
  for (const p of PLAYERS) s = aiDraw(s, p)
  s = endDraw(s)
  for (const p of PLAYERS) s = aiAssign(s, p)
  s = reveal(s)
  for (const p of PLAYERS) s = aiItems(s, p)
  s = endItems(s)
  for (const p of PLAYERS) s = aiUlts(s, p)
  return resolveRound(s)
}

/** Fresh game in the assign step with chosen hands. */
function setup(seed: number, radiant: HandCard[], dire: HandCard[] = []): GameState {
  const s = endDraw(newGame(undefined, seed))
  s.players.radiant.hand = radiant
  s.players.dire.hand = dire
  return s
}

const hero = (iid: string, cardId: string): HandCard => ({ iid, type: 'hero', cardId })
const item = (iid: string, cardId: string): HandCard => ({ iid, type: 'item', cardId })

describe('engine', () => {
  it('sets up a fresh game with hero-only hands and populated camps', () => {
    const s = newGame(undefined, 42)
    expect(s.round).toBe(1)
    expect(s.phase).toBe('draw')
    for (const p of PLAYERS) {
      expect(s.players[p].hand).toHaveLength(5)
      expect(s.players[p].hand.every((c) => c.type === 'hero')).toBe(true)
      expect(s.players[p].gold).toBe(1)
      expect(s.players[p].xp).toBe(1)
    }
    expect(campNeutral(s, 'radiantJungle')?.kind).toBe('neutral')
    expect(campNeutral(s, 'direJungle')?.kind).toBe('neutral')
    expect(campNeutral(s, 'roshan')?.kind).toBe('roshan')
  })

  it('limits hero placements to 3 per round', () => {
    let s = endDraw(newGame(undefined, 7))
    for (const c of [...s.players.radiant.hand]) s = placeHero(s, 'radiant', c.iid, 'mid')
    expect(heroesOnBoard(s, 'radiant')).toHaveLength(3)
    expect(s.players.radiant.hand).toHaveLength(2)
  })

  it('creeps are cards: drawn for 1 Gold, played into a lane, and they stay until killed', () => {
    let s = drawCard(newGame(undefined, 9), 'radiant', 'creep')
    expect(s.players.radiant.gold).toBe(0)
    const creep = s.players.radiant.hand.find((c) => c.type === 'creep')!
    s = endDraw(s)
    s.players.radiant.hand.push({ iid: 'extra', type: 'creep', cardId: 'creep' })
    s = placeCreep(s, 'radiant', creep.iid, 'top')
    s = placeCreep(s, 'radiant', 'extra', 'top')
    s = resolveRound(endItems(reveal(s)))
    // The tower shoots Position 1; the second creep survives into the next round.
    expect(lineup(s, 'radiant', 'top')).toHaveLength(1)
    expect(s.players.dire.structures.towers.top.t1).toBeLessThan(3)
    s = nextRound(s)
    expect(lineup(s, 'radiant', 'top')).toHaveLength(1)
  })

  it('counter loop: AGI basic attack instantly kills a healthy INT hero', () => {
    let s = setup(1, [hero('a', 'juggernaut')], [hero('b', 'crystal_maiden')])
    s = placeHero(s, 'radiant', 'a', 'mid')
    s = placeHero(s, 'dire', 'b', 'mid')
    s = resolveRound(endItems(reveal(s)))
    expect(heroesOnBoard(s, 'dire')).toHaveLength(0)
    expect(s.log.some((l) => l.text.includes('AGI counters INT'))).toBe(true)
  })

  it('stun skips the Ultimate: Ravage (STR) lands before Laguna Blade (INT)', () => {
    let s = setup(3, [hero('a', 'tidehunter')], [hero('b', 'lina')])
    s = placeHero(s, 'radiant', 'a', 'top')
    s = placeHero(s, 'dire', 'b', 'top')
    s = endItems(reveal(s))
    const tide = heroesOnBoard(s, 'radiant')[0]
    const lina = heroesOnBoard(s, 'dire')[0]
    s = declareUlt(s, tide.uid)
    s = declareUlt(s, lina.uid, tide.uid)
    s = resolveRound(s)
    expect(s.log.some((l) => l.text.includes('Laguna Blade fizzles'))).toBe(true)
    expect(s.log.some((l) => l.text.includes('Dire Lina is Stunned and cannot attack'))).toBe(true)
  })

  it('a damaged tower fires at the attacking side Position 1; undamaged towers stay silent', () => {
    let s = setup(5, [hero('a', 'axe'), { iid: 'c', type: 'creep', cardId: 'creep' }])
    s = placeHero(s, 'radiant', 'a', 'mid')
    s = placeCreep(s, 'radiant', 'c', 'mid')
    s = resolveRound(endItems(reveal(s)))
    const axe = heroesOnBoard(s, 'radiant')[0]
    expect(s.players.dire.structures.towers.mid.t1).toBe(1)
    expect(axe.hp).toBe(1)
    expect(s.log.some((l) => l.text.startsWith('Dire Mid Tier 1 tower deals 1 to Radiant Axe'))).toBe(true)
    expect(s.log.some((l) => /(Top|Bottom) Tier \d tower (deals|slays)/.test(l.text))).toBe(false)
  })

  it('items are free and single use', () => {
    let s = setup(11, [hero('a', 'sven'), item('i', 'desolator')])
    s = placeHero(s, 'radiant', 'a', 'bot')
    s = reveal(s)
    const gold = s.players.radiant.gold
    s = playItem(s, 'radiant', 'i', heroesOnBoard(s, 'radiant')[0].uid)
    expect(s.players.radiant.gold).toBe(gold)
    expect(s.players.radiant.hand).toHaveLength(0)
    expect(heroesOnBoard(s, 'radiant')[0].status.bonusDamage).toBe(1)
  })

  it('Break turns off passives (Silver Edge stops Counter Helix)', () => {
    let s = setup(13, [hero('a', 'juggernaut'), item('i', 'silver_edge')], [hero('b', 'axe')])
    s = placeHero(s, 'radiant', 'a', 'mid')
    s = placeHero(s, 'dire', 'b', 'mid')
    s = reveal(s)
    s = playItem(s, 'radiant', 'i', heroesOnBoard(s, 'dire')[0].uid)
    s = resolveRound(endItems(s))
    expect(s.log.some((l) => l.text.includes('Counter Helix'))).toBe(false)
  })

  it('Banish: the hero is untouchable and cannot act', () => {
    let s = setup(17, [hero('a', 'juggernaut'), item('i', 'euls')], [hero('b', 'crystal_maiden')])
    s = placeHero(s, 'radiant', 'a', 'mid')
    s = placeHero(s, 'dire', 'b', 'mid')
    s = reveal(s)
    s = playItem(s, 'radiant', 'i', heroesOnBoard(s, 'dire')[0].uid)
    s = resolveRound(endItems(s))
    expect(heroesOnBoard(s, 'dire')).toHaveLength(1)
    expect(s.players.dire.structures.towers.mid.t1).toBeLessThan(3)
  })

  it('clearing a neutral camp grants 1 XP and an item card', () => {
    let s = setup(19, [hero('a', 'juggernaut')])
    const camp = campNeutral(s, 'radiantJungle')!
    camp.cardId = 'ice_shaman'
    s = placeHero(s, 'radiant', 'a', 'radiantJungle')
    const xp = s.players.radiant.xp
    s = resolveRound(endItems(reveal(s)))
    expect(campNeutral(s, 'radiantJungle')).toBeUndefined()
    expect(s.players.radiant.hand.some((c) => c.type === 'item')).toBe(true)
    expect(s.players.radiant.xp).toBe(xp + 1)
  })

  it("Roshan's Roar disarms the pit while he is at full health", () => {
    let s = setup(23, [hero('a', 'sven')])
    s = placeHero(s, 'radiant', 'a', 'roshan')
    s = resolveRound(endItems(reveal(s)))
    expect(s.log.some((l) => l.text.includes('Radiant Sven is Disarmed by Roar'))).toBe(true)
    expect(campNeutral(s, 'roshan')?.hp).toBe(3)
  })

  it('plays many full AI-vs-AI games without breaking invariants', () => {
    let finished = 0
    for (let seed = 1; seed <= 60; seed++) {
      let s = newGame(undefined, seed)
      for (let r = 0; r < 80 && !s.winner; r++) {
        s = playRound(s)
        for (const p of PLAYERS) {
          expect(heroesOnBoard(s, p).length).toBeLessThanOrEqual(BOARD_LIMIT)
          expect(handCount(s.players[p])).toBeLessThanOrEqual(HAND_LIMIT)
          expect(s.players[p].gold).toBeGreaterThanOrEqual(0)
          expect(s.players[p].xp).toBeGreaterThanOrEqual(0)
          for (const zone of ZONES) {
            for (const uid of lineup(s, p, zone)) expect(s.units[uid].zone).toBe(zone)
          }
        }
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
  }, 30000)
})
