import type { Phase } from '@/game/types'
import { cn } from '@/lib/utils'

const STEPS = ['Upkeep', 'Draw', 'Map', 'Assign', 'Reveal', 'Item', 'Ult', 'Resolution', 'Cleanup', 'Income'] as const

const ACTIVE: Record<Phase, number> = {
  draw: 1,
  assign: 3,
  items: 5,
  ults: 6,
  report: 9,
  gameover: 9,
}

export function PhaseTracker({ phase }: { phase: Phase }) {
  const active = ACTIVE[phase]
  return (
    <ol className="flex flex-wrap items-center gap-1 text-[11px]">
      {STEPS.map((step, i) => (
        <li
          key={step}
          title={step === 'Map' ? 'No map cards in the starter set yet' : undefined}
          className={cn(
            'rounded-full px-2 py-0.5 transition-colors',
            i === active
              ? 'bg-amber-400 font-semibold text-zinc-950'
              : i < active || (phase === 'report' && i >= 7)
                ? 'bg-zinc-800 text-zinc-300'
                : 'bg-zinc-900 text-zinc-600',
            step === 'Map' && 'line-through decoration-zinc-600',
          )}
        >
          {step}
        </li>
      ))}
    </ol>
  )
}
