import { describe, expect, it } from 'vitest'
import { aiAssign, aiDraw, aiItems, aiUlts } from './ai'
import {
  declareUlt,
  endDraw,
  endItems,
  heroesOnBoard,
  lineup,
  newGame,
  nextRound,
  placeHero,
  resolveRound,
  reveal,
} from './engine'
import { BOARD_LIMIT, HAND_LIMIT, LANES, PLAYERS, type GameState } from './types'

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

describe('engine', () => {
  it('sets up a fresh game', () => {
    const s = newGame(undefined, 42)
    expect(s.round).toBe(1)
    expect(s.phase).toBe('draw')
    for (const p of PLAYERS) {
      expect(s.players[p].hand).toHaveLength(5)
      expect(s.players[p].gold).toBe(1)
      expect(s.players[p].xp).toBe(1)
    }
  })

  it('limits placements to 3 per round', () => {
    let s = endDraw(newGame(undefined, 7))
    for (const c of [...s.players.radiant.hand]) s = placeHero(s, 'radiant', c.iid, 'mid')
    expect(heroesOnBoard(s, 'radiant')).toHaveLength(3)
    expect(s.players.radiant.hand).toHaveLength(2)
  })

  it('counter loop: AGI basic attack instantly kills a healthy INT hero', () => {
    let s = endDraw(newGame(undefined, 1))
    s.players.radiant.hand = [{ iid: 'a', type: 'hero', cardId: 'juggernaut' }]
    s.players.dire.hand = [{ iid: 'b', type: 'hero', cardId: 'crystal_maiden' }]
    s = placeHero(s, 'radiant', 'a', 'mid')
    s = placeHero(s, 'dire', 'b', 'mid')
    s = endItems(reveal(s))
    s = resolveRound(s)
    expect(heroesOnBoard(s, 'dire').find((u) => u.cardId === 'crystal_maiden')).toBeUndefined()
    expect(s.log.some((l) => l.text.includes('AGI counters INT'))).toBe(true)
  })

  it('STR ultimates resolve before INT (Ravage stuns Lina before Laguna)', () => {
    let s = endDraw(newGame(undefined, 3))
    s.players.radiant.hand = [{ iid: 'a', type: 'hero', cardId: 'tidehunter' }]
    s.players.dire.hand = [{ iid: 'b', type: 'hero', cardId: 'lina' }]
    s = placeHero(s, 'radiant', 'a', 'top')
    s = placeHero(s, 'dire', 'b', 'top')
    s = endItems(reveal(s))
    const tide = heroesOnBoard(s, 'radiant')[0]
    const lina = heroesOnBoard(s, 'dire')[0]
    s = declareUlt(s, tide.uid)
    s = declareUlt(s, lina.uid, tide.uid)
    s = resolveRound(s)
    expect(s.log.some((l) => l.text.includes('Laguna Blade fizzles'))).toBe(true)
  })

  it('plays many full AI-vs-AI games without breaking invariants', () => {
    let finished = 0
    for (let seed = 1; seed <= 60; seed++) {
      let s = newGame(undefined, seed)
      for (let r = 0; r < 60 && !s.winner; r++) {
        s = playRound(s)
        for (const p of PLAYERS) {
          expect(heroesOnBoard(s, p).length).toBeLessThanOrEqual(BOARD_LIMIT)
          expect(s.players[p].hand.length).toBeLessThanOrEqual(HAND_LIMIT)
          expect(s.players[p].gold).toBeGreaterThanOrEqual(0)
          expect(s.players[p].xp).toBeGreaterThanOrEqual(0)
          for (const lane of LANES) {
            for (const uid of lineup(s, p, lane)) expect(s.units[uid].lane).toBe(lane)
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
  })
})
