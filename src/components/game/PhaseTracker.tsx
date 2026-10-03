import type { Phase } from '@/game/types'
import { cn } from '@/lib/utils'

const STEPS = ['Upkeep', 'Draw', 'Assign', 'Reveal', 'Item', 'Ult', 'Resolution', 'Rotation', 'Cleanup', 'Income'] as const

const ACTIVE: Record<Phase, number> = {
  draw: 1,
  assign: 2,
  items: 4,
  ults: 5,
  rotate: 7,
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
          className={cn(
            'rounded-full px-2 py-0.5 transition-colors',
            i === active
              ? 'bg-amber-400 font-semibold text-zinc-950'
              : i < active || (phase === 'report' && i >= 6)
                ? 'bg-zinc-800 text-zinc-300'
                : 'bg-zinc-900 text-zinc-600',
          )}
        >
          {step}
        </li>
      ))}
    </ol>
  )
}
