import { describe, expect, it } from 'vitest'
import { claimSeat, createRoom, applyAction, listOpenTables, startMatch, viewFor } from './online'

function match() {
  const room = createRoom('TEST')
  claimSeat(room, 'radiant', 'Ada', 'token-a')
  claimSeat(room, 'dire', 'Nix', 'token-b')
  expect(startMatch(room)).toBeNull()
  return room
}

describe('online rooms', () => {
  it('lists open tables oldest first and skips full or started ones', () => {
    const older = createRoom('AAAA')
    older.openedAt = 1
    claimSeat(older, 'radiant', 'Ada')
    const newer = createRoom('BBBB')
    newer.openedAt = 2
    claimSeat(newer, 'radiant', 'Bea')
    const started = createRoom('CCCC')
    started.openedAt = 0
    claimSeat(started, 'radiant', 'Cy')
    started.started = true
    const full = createRoom('DDDD')
    full.openedAt = 3
    claimSeat(full, 'radiant', 'Dee')
    claimSeat(full, 'dire', 'Eve')
    const offline = createRoom('EEEE')
    offline.openedAt = 4
    claimSeat(offline, 'radiant', 'Fay')
    const tables = listOpenTables([started, newer, full, offline, older], (code) => code !== 'EEEE')
    expect(tables).toEqual([
      { code: 'AAAA', host: 'Ada', towerGold: true },
      { code: 'BBBB', host: 'Bea', towerGold: true },
    ])
  })

  it('waits until both players lock the draw step', () => {
    const room = match()
    expect(room.state?.phase).toBe('draw')
    expect(applyAction(room, 'radiant', { type: 'lock' })).toBeNull()
    expect(room.state?.phase).toBe('draw')
    expect(room.ready.radiant).toBe(true)
    expect(applyAction(room, 'dire', { type: 'lock' })).toBeNull()
    expect(room.state?.phase).toBe('assign')
    expect(room.ready.radiant).toBe(false)
    expect(room.ready.dire).toBe(false)
  })

  it('hides the other hand and an unrevealed assignment', () => {
    const room = match()
    const hero = room.state!.players.radiant.hand.find((c) => c.type === 'hero')
    expect(hero).toBeTruthy()
    applyAction(room, 'radiant', { type: 'lock' })
    applyAction(room, 'dire', { type: 'lock' })
    expect(applyAction(room, 'radiant', { type: 'place', handIid: hero!.iid, zone: 'mid' })).toBeNull()
    const secret = viewFor(room.state!, 'dire')
    expect(JSON.stringify(secret.units)).not.toContain(hero!.cardId)
    expect(secret.players.radiant.hand.every((c) => c.cardId === 'creep' || c.cardId === 'rune_gold')).toBe(true)
    expect(secret.unitDeck.every((c) => c.cardId === 'hidden')).toBe(true)
    expect(secret.players.radiant.towerCards.top.t1).toBe('glyph')

    applyAction(room, 'radiant', { type: 'lock' })
    applyAction(room, 'dire', { type: 'lock' })
    const shown = viewFor(room.state!, 'dire')
    expect(Object.values(shown.units).some((u) => u.cardId === hero!.cardId)).toBe(true)
  })

  it('ignores a pass from the seat that does not have priority', () => {
    const room = match()
    room.state!.phase = 'response'
    room.state!.priority = 'radiant'
    room.state!.players.radiant.hand.push({ iid: 'clarity-1', type: 'item', cardId: 'clarity' })
    room.state!.players.dire.hand.push({ iid: 'clarity-2', type: 'item', cardId: 'clarity' })
    const passes = room.state!.passes
    expect(applyAction(room, 'dire', { type: 'pass' })).toBe('Wait for priority.')
    expect(room.state!.passes).toBe(passes)
    expect(applyAction(room, 'radiant', { type: 'pass' })).toBeNull()
    expect(room.state!.priority).toBe('dire')
    expect(room.state!.passes).toBe(1)
  })

  it('starts a rematch only after both seats ask', () => {
    const room = match()
    room.state!.phase = 'gameover'
    room.state!.winner = 'radiant'
    expect(applyAction(room, 'radiant', { type: 'rematch' })).toBeNull()
    expect(room.state!.phase).toBe('gameover')
    expect(applyAction(room, 'dire', { type: 'rematch' })).toBeNull()
    expect(room.state!.phase).toBe('draw')
    expect(room.state!.round).toBe(1)
    expect(room.state!.winner).toBeUndefined()
  })
})
