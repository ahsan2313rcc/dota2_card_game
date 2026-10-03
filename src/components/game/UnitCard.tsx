import { Ban, ChevronLeft, ChevronRight, Flame, Shield, Skull, Snowflake, Sparkles, Star, VolumeX, X } from 'lucide-react'
import { getHero, getItem } from '@/game/cards'
import type { Unit } from '@/game/types'
import { cn } from '@/lib/utils'
import { ATTR_STYLE } from './styles'

interface Props {
  unit: Unit
  position: number
  targetable?: boolean
  selected?: boolean
  onClick?: () => void
  /** Controls rendered under the card (reorder, ult) */
  footer?: React.ReactNode
}

export function UnitCard({ unit, position, targetable, selected, onClick, footer }: Props) {
  const isHero = unit.kind === 'hero' && unit.cardId
  const hero = isHero ? getHero(unit.cardId!) : undefined
  const wounded = unit.hp < unit.maxHp
  const st = unit.status

  return (
    <div className="flex shrink-0 flex-col items-center gap-1">
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'relative flex w-[84px] flex-col overflow-hidden rounded-lg border bg-zinc-900 text-left shadow-md transition-all duration-200 outline-none sm:w-[92px]',
          isHero ? 'h-[112px] border-zinc-700' : 'h-[64px] border-zinc-800 bg-zinc-900/70',
          wounded && 'rotate-[8deg] border-red-500/60',
          targetable && 'cursor-crosshair ring-2 ring-amber-400 ring-offset-2 ring-offset-zinc-950 hover:scale-105',
          selected && 'ring-2 ring-sky-400 ring-offset-2 ring-offset-zinc-950',
          !targetable && onClick && 'hover:border-zinc-500',
        )}
      >
        {hero ? (
          <>
            <div className={cn('flex items-center justify-between bg-gradient-to-r px-1.5 py-1', ATTR_STYLE[hero.attribute].strip)}>
              <span className="text-[10px] font-bold tracking-wider text-white/90">{hero.attribute}</span>
              <span className="text-[10px] text-white/70">{hero.range === 'Melee' ? 'Melee' : 'Ranged'}</span>
            </div>
            <div className="flex flex-1 flex-col justify-between p-1.5">
              <div className="text-[12px] leading-tight font-semibold text-zinc-100">{hero.name}</div>
              <div className="flex flex-wrap gap-0.5">
                {st.stunned && <Star className="size-3 text-yellow-300" aria-label="Stunned" />}
                {st.silenced && <VolumeX className="size-3 text-sky-300" aria-label="Silenced" />}
                {st.disarmed && <Ban className="size-3 text-red-300" aria-label="Disarmed" />}
                {st.slowed && <Snowflake className="size-3 text-cyan-300" aria-label="Slowed" />}
                {st.bkb && <Shield className="size-3 text-amber-300" aria-label="Black King Bar" />}
                {st.poisoned && <Skull className="size-3 text-lime-300" aria-label="Poisoned" />}
                {unit.fierySoul && <Flame className="size-3 text-orange-400" aria-label="Fiery Soul" />}
                {unit.equipment.map((e) => (
                  <span key={e} className="rounded bg-amber-500/20 px-1 text-[9px] text-amber-200" title={getItem(e).name}>
                    {getItem(e).name.split(' ')[0]}
                  </span>
                ))}
              </div>
              <div className="flex items-center justify-between">
                <div className="flex gap-0.5">
                  {Array.from({ length: unit.maxHp }, (_, i) => (
                    <span key={i} className={cn('h-1.5 w-3 rounded-sm', i < unit.hp ? 'bg-emerald-400' : 'bg-zinc-700')} />
                  ))}
                </div>
                <Sparkles
                  className={cn('size-3', unit.ultUsed ? 'text-zinc-700' : 'text-amber-300')}
                  aria-label={unit.ultUsed ? 'Ultimate used' : 'Ultimate ready'}
                />
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-0.5">
            <span className="text-[11px] font-medium text-zinc-300">{unit.kind === 'siege' ? 'Siege Creep' : 'Creep'}</span>
            <span className="text-[9px] text-zinc-500">{unit.kind === 'siege' ? '2 dmg to towers' : '1 hit · 1 dmg'}</span>
          </div>
        )}
        <span className="absolute top-[22px] right-1 rounded bg-black/60 px-1 text-[9px] text-zinc-400">P{position}</span>
        {wounded && isHero && (
          <span className="absolute right-0 bottom-5 left-0 bg-red-600/80 text-center text-[9px] font-bold tracking-widest text-white">
            WOUNDED
          </span>
        )}
      </button>
      {footer}
    </div>
  )
}

export function ReorderControls({
  onBack,
  onFront,
  onReturn,
  frontIsRight,
}: {
  onBack?: () => void
  onFront?: () => void
  onReturn?: () => void
  frontIsRight: boolean
}) {
  const left = frontIsRight ? onBack : onFront
  const right = frontIsRight ? onFront : onBack
  return (
    <div className="flex items-center gap-0.5">
      <button
        type="button"
        disabled={!left}
        onClick={left}
        className="rounded p-0.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-30"
        title={frontIsRight ? 'Move toward the back' : 'Move toward Position 1'}
      >
        <ChevronLeft className="size-3.5" />
      </button>
      {onReturn && (
        <button
          type="button"
          onClick={onReturn}
          className="rounded p-0.5 text-zinc-400 hover:bg-zinc-800 hover:text-red-300"
          title="Return to hand"
        >
          <X className="size-3.5" />
        </button>
      )}
      <button
        type="button"
        disabled={!right}
        onClick={right}
        className="rounded p-0.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-30"
        title={frontIsRight ? 'Move toward Position 1' : 'Move toward the back'}
      >
        <ChevronRight className="size-3.5" />
      </button>
    </div>
  )
}
