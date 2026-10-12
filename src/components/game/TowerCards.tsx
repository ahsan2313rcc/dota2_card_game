import { useState } from 'react'
import { ArrowLeftRight } from 'lucide-react'
import { getItem } from '@/game/cards'
import { LANE_LABEL } from '@/game/engine'
import { useTable } from '@/game/table'
import { LANES, type GameState, type LaneId, type TowerTier } from '@/game/types'
import { cn } from '@/lib/utils'

const TIERS: TowerTier[] = ['t1', 't2']

/** The face-down card under each of your towers. Before the first reveal you may swap cards within a tier. */
export function TowerCards({ s, onSwap }: { s: GameState; onSwap: (tier: TowerTier, a: LaneId, b: LaneId) => void }) {
  const [picked, setPicked] = useState<{ tier: TowerTier; lane: LaneId } | null>(null)
  const pl = s.players[useTable().you]
  const canSwap = s.round === 1 && (s.phase === 'draw' || s.phase === 'assign')

  function click(tier: TowerTier, lane: LaneId) {
    if (!canSwap) return
    if (!picked || picked.tier !== tier) return setPicked({ tier, lane })
    if (picked.lane !== lane) onSwap(tier, picked.lane, lane)
    setPicked(null)
  }

  return (
    <div className="space-y-1.5 text-xs">
      <div className="grid grid-cols-[2.25rem_repeat(3,1fr)] gap-1 text-xs tracking-wider text-zinc-400 uppercase">
        <span />
        {LANES.map((l) => (
          <span key={l} className="text-center">
            {LANE_LABEL[l]}
          </span>
        ))}
      </div>
      {TIERS.map((tier) => (
        <div key={tier} className="grid grid-cols-[2rem_repeat(3,1fr)] items-center gap-1">
          <span className="text-sm font-black text-zinc-200 uppercase">{tier}</span>
          {LANES.map((lane) => {
            const standing = pl.structures.towers[lane][tier] > 0
            const card = getItem(pl.towerCards[lane][tier])
            const isPicked = picked?.tier === tier && picked.lane === lane
            return (
              <button
                key={lane}
                type="button"
                disabled={!canSwap}
                title={standing ? card.text : 'Tower destroyed: its card went to your hand'}
                onClick={() => click(tier, lane)}
                className={cn(
                  'truncate rounded-md border px-1 py-1.5 text-xs font-semibold transition',
                  standing ? 'border-sky-500/30 bg-sky-500/10 text-sky-100' : 'border-dashed border-zinc-700 text-zinc-600 line-through',
                  canSwap && 'cursor-pointer hover:border-sky-300',
                  isPicked && 'border-amber-300 bg-amber-400/20 text-amber-100',
                )}
              >
                {card.id[0].toUpperCase() + card.id.slice(1)}
              </button>
            )
          })}
        </div>
      ))}
      <p className="flex items-center gap-1 text-xs text-zinc-400">
        {canSwap ? (
          <>
            <ArrowLeftRight className="size-3" /> Click two cards in the same tier to swap them (round 1 only).
          </>
        ) : (
          'When a tower falls you gain its card, outside the hand limit.'
        )}
      </p>
    </div>
  )
}
