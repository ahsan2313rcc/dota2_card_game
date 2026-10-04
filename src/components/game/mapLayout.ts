import type { CampId, LaneId, PlayerId, ZoneId } from '@/game/types'

/** Coordinates are percentages of the square minimap (0,0 = top-left). Radiant sits bottom-left, Dire top-right. */
export interface Pt {
  x: number
  y: number
}

interface Slot {
  origin: Pt
  /** Offset per lineup position, Position 1 sits at the origin closest to the fight */
  step: Pt
}

const S = 6.2
const D = 4.4

export const SLOTS: Record<ZoneId, Record<PlayerId, Slot>> = {
  top: {
    radiant: { origin: { x: 10, y: 18 }, step: { x: 0, y: S } },
    dire: { origin: { x: 18, y: 10 }, step: { x: S, y: 0 } },
  },
  mid: {
    radiant: { origin: { x: 46, y: 54 }, step: { x: -D, y: D } },
    dire: { origin: { x: 54, y: 46 }, step: { x: D, y: -D } },
  },
  bot: {
    radiant: { origin: { x: 82, y: 90 }, step: { x: -S, y: 0 } },
    dire: { origin: { x: 90, y: 82 }, step: { x: 0, y: -S } },
  },
  direJungle: {
    radiant: { origin: { x: 40, y: 34 }, step: { x: S, y: 0 } },
    dire: { origin: { x: 40, y: 18 }, step: { x: S, y: 0 } },
  },
  radiantJungle: {
    radiant: { origin: { x: 60, y: 82 }, step: { x: -S, y: 0 } },
    dire: { origin: { x: 60, y: 66 }, step: { x: -S, y: 0 } },
  },
}

export function slotPos(zone: ZoneId, player: PlayerId, index: number): Pt {
  const { origin, step } = SLOTS[zone][player]
  return { x: origin.x + step.x * index, y: origin.y + step.y * index }
}

/** Where status labels sit so they stay off the next hero in the lineup. */
export function statusAnchor(zone: ZoneId, player: PlayerId, index: number): 'below' | 'left' | 'right' {
  const { step } = SLOTS[zone][player]
  if (Math.abs(step.x) >= Math.abs(step.y)) return 'below'
  return slotPos(zone, player, index).x > 55 ? 'left' : 'right'
}

export const CAMP_POS: Record<CampId, Pt> = {
  direJungle: { x: 34, y: 26 },
  radiantJungle: { x: 66, y: 74 },
}

/** Rotation chain drawn on the map: Top – Dire Jungle – Mid – Radiant Jungle – Bottom. */
export const ROTATION_PATH: Pt[] = [
  { x: 22, y: 14 },
  CAMP_POS.direJungle,
  { x: 50, y: 50 },
  CAMP_POS.radiantJungle,
  { x: 86, y: 78 },
]

export const TOWER_POS: Record<PlayerId, Record<LaneId, { t1: Pt; t2: Pt }>> = {
  radiant: {
    top: { t1: { x: 10, y: 58 }, t2: { x: 10, y: 72 } },
    mid: { t1: { x: 30, y: 70 }, t2: { x: 21, y: 79 } },
    bot: { t1: { x: 42, y: 90 }, t2: { x: 28, y: 90 } },
  },
  dire: {
    top: { t1: { x: 58, y: 10 }, t2: { x: 72, y: 10 } },
    mid: { t1: { x: 70, y: 30 }, t2: { x: 79, y: 21 } },
    bot: { t1: { x: 90, y: 42 }, t2: { x: 90, y: 28 } },
  },
}

export const ANCIENT_POS: Record<PlayerId, Pt> = {
  radiant: { x: 9, y: 91 },
  dire: { x: 91, y: 9 },
}