import type { Phase } from '@/game/types'
import { cn } from '@/lib/utils'

const STEPS = ['Upkeep', 'Draw', 'Assign', 'Reveal', 'Combat', 'Rotation', 'Cleanup', 'Income'] as const

const ACTIVE: Record<Phase, number> = {
  draw: 1,
  assign: 2,
  response: 4,
  rotate: 5,
  report: 7,
  gameover: 7,
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
              : i < active || (phase === 'report' && i >= 5)
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
