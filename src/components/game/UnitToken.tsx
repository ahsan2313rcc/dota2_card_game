import { useState } from 'react'
import { Crown, Flame, Mountain, Shield, ShieldHalf, Snowflake, Sparkles, Zap } from 'lucide-react'
import { getHero, heroPortrait } from '@/game/cards'
import { fullName } from '@/game/engine'
import type { Unit } from '@/game/types'
import { cn } from '@/lib/utils'
import type { Pt } from './mapLayout'
import { activeStatuses } from './statuses'

const ATTR_DOT = { STR: 'bg-red-500', AGI: 'bg-green-500', INT: 'bg-sky-500', UNI: 'bg-violet-500' } as const

const NEUTRAL_ICON = { golem: Mountain, thunderhide: Zap, ice_shaman: Snowflake, dragon: Flame } as const

export function HeroPortrait({ cardId, className }: { cardId: string; className?: string }) {
  const [failed, setFailed] = useState(false)
  const hero = getHero(cardId)
  if (failed) {
    return (
      <div className={cn('flex items-center justify-center bg-zinc-800 text-[0.7em] font-bold text-zinc-200', className)}>
        {hero.name
          .split(/[\s-]/)
          .map((w) => w[0])
          .join('')
          .slice(0, 2)}
      </div>
    )
  }
  return (
    <img
      src={heroPortrait(cardId)}
      alt={hero.name}
      loading="lazy"
      draggable={false}
      onError={() => setFailed(true)}
      className={cn('object-cover', className)}
    />
  )
}

const SIZE: Record<Unit['kind'], number> = {
  hero: 4.8,
  illusion: 4.2,
  roshan: 6,
  tormentor: 5.6,
  neutral: 5,
  creep: 3,
  siege: 3,
}

interface Props {
  unit: Unit
  pos: Pt
  position?: number
  /** Keeps status labels off the next hero in the lineup */
  labelSide?: 'below' | 'left' | 'right'
  targetable?: boolean
  selected?: boolean
  declared?: boolean
  onClick: () => void
}

export function UnitToken({ unit, pos, position, labelSide = 'below', targetable, selected, declared, onClick }: Props) {
  const wounded = unit.hp < unit.maxHp
  const side =
    unit.owner === 'radiant' ? 'ring-emerald-400' : unit.owner === 'dire' ? 'ring-red-500' : 'ring-amber-400'
  const size = SIZE[unit.kind]
  const marks = activeStatuses(unit)
  const shown = marks.slice(0, 4)
  const extra = marks.length - shown.length
  const shielded = unit.status.shield > 0

  return (
    <button
      type="button"
      onClick={onClick}
      title={[`${fullName(unit)} · ${unit.hp}/${unit.maxHp}`, ...marks.map((m) => m.title)].join('\n')}
      style={{ left: `${pos.x}%`, top: `${pos.y}%`, width: `${size}cqw`, height: `${size}cqw` }}
      className={cn(
        'absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded-full transition-all duration-300 outline-none',
        targetable && 'z-20 cursor-crosshair',
        selected && 'z-20',
      )}
    >
      <span
        className={cn(
          'relative block h-full w-full overflow-hidden rounded-full ring-2 shadow-[0_2px_8px_rgba(0,0,0,0.6)]',
          side,
          wounded && unit.kind === 'hero' && 'rotate-[18deg] ring-red-400',
          targetable && 'animate-pulse ring-[3px] ring-amber-300',
          selected && 'ring-[3px] ring-sky-300',
          (unit.status.banished || unit.status.invisible) && 'opacity-40',
          unit.kind === 'illusion' && 'opacity-70 outline-2 outline-offset-2 outline-cyan-200 outline-dashed',
          shielded && 'ring-[3px] ring-cyan-200 shadow-[0_0_14px_rgba(34,211,238,0.95)]',
        )}
      >
        {unit.kind === 'hero' && <HeroPortrait cardId={unit.cardId!} className="h-full w-full scale-[1.25]" />}
        {(unit.kind === 'creep' || unit.kind === 'siege') && (
          <span
            className={cn(
              'flex h-full w-full items-center justify-center text-[1.4cqw] font-black',
              unit.owner === 'radiant' ? 'bg-emerald-600 text-emerald-50' : 'bg-red-700 text-red-50',
            )}
          >
            {unit.kind === 'siege' ? 'S' : ''}
          </span>
        )}
        {unit.kind === 'illusion' && (
          <HeroPortrait cardId={unit.cardId!} className="h-full w-full scale-[1.25] hue-rotate-180 saturate-50" />
        )}
        {unit.kind === 'neutral' && <NeutralFace id={unit.cardId!} />}
        {unit.kind === 'tormentor' && (
          <span className="flex h-full w-full items-center justify-center bg-gradient-to-br from-violet-500 to-indigo-950 text-violet-100">
            <ShieldHalf style={{ width: '55%', height: '55%' }} />
          </span>
        )}
        {unit.kind === 'roshan' && (
          <span className="flex h-full w-full items-center justify-center bg-gradient-to-br from-amber-700 to-stone-900 text-amber-200">
            <Crown style={{ width: '55%', height: '55%' }} />
          </span>
        )}
        {wounded && unit.kind === 'hero' && <span className="absolute inset-0 bg-red-700/35" />}
      </span>

      {unit.kind === 'hero' && (
        <span
          className={cn(
            'absolute -bottom-[0.2cqw] -left-[0.2cqw] size-[1.3cqw] rounded-full ring-1 ring-black',
            ATTR_DOT[getHero(unit.cardId!).attribute],
          )}
        />
      )}
      {position !== undefined && unit.kind === 'hero' && (
        <span className="absolute -top-[0.5cqw] -left-[0.5cqw] rounded-full bg-black/80 px-[0.4cqw] text-[1.1cqw] leading-tight font-bold text-zinc-200">
          {position}
        </span>
      )}
      {declared && (
        <Sparkles className="absolute -top-[0.6cqw] -right-[0.6cqw] size-[1.8cqw] text-amber-300 drop-shadow" />
      )}
      {shielded && (
        <span className="absolute -right-[0.85cqw] bottom-[0.15cqw] z-20 flex size-[2.2cqw] items-center justify-center rounded-full bg-cyan-300 text-cyan-950 shadow-[0_0_8px_rgba(34,211,238,0.9)] ring-1 ring-white">
          <Shield className="size-[1.45cqw]" strokeWidth={2.75} />
        </span>
      )}
      {shown.length > 0 && (
        <span
          className={cn(
            'pointer-events-none absolute z-20 flex w-[12cqw] gap-[0.3cqw]',
            labelSide === 'below' && 'top-full left-1/2 mt-[1.45cqw] -translate-x-1/2 flex-wrap justify-center',
            labelSide === 'right' && 'top-1/2 left-full ml-[1.1cqw] -translate-y-1/2 flex-col items-start',
            labelSide === 'left' && 'top-1/2 right-full mr-[1.1cqw] -translate-y-1/2 flex-col items-end',
          )}
        >
          {shown.map((mark) => (
            <span
              key={mark.key}
              className={cn(
                'rounded-[0.4cqw] px-[0.5cqw] py-[0.18cqw] text-[1.7cqw] leading-none font-black tracking-tight shadow-[0_1px_4px_rgba(0,0,0,0.9)] ring-1',
                mark.key === 'shield'
                  ? 'bg-cyan-300 text-cyan-950 ring-white'
                  : mark.kind === 'debuff'
                    ? 'bg-fuchsia-600 text-white ring-fuchsia-100'
                    : 'bg-sky-800 text-sky-50 ring-sky-200',
              )}
            >
              {mark.short}
            </span>
          ))}
          {extra > 0 && (
            <span className="rounded-[0.4cqw] bg-black/85 px-[0.45cqw] py-[0.12cqw] text-[1.45cqw] leading-none font-bold text-zinc-100 ring-1 ring-zinc-400">
              +{extra}
            </span>
          )}
        </span>
      )}
      {unit.maxHp > 1 && (
        <span className="absolute -bottom-[1.1cqw] left-1/2 flex -translate-x-1/2 gap-[0.2cqw]">
          {Array.from({ length: unit.maxHp }, (_, i) => (
            <span
              key={i}
              className={cn('h-[0.6cqw] w-[1cqw] rounded-sm ring-1 ring-black/60', i < unit.hp ? 'bg-emerald-400' : 'bg-zinc-700')}
            />
          ))}
        </span>
      )}
    </button>
  )
}

function NeutralFace({ id }: { id: string }) {
  const Icon = NEUTRAL_ICON[id as keyof typeof NEUTRAL_ICON] ?? Mountain
  return (
    <span className="flex h-full w-full items-center justify-center bg-gradient-to-br from-amber-500/80 to-amber-900 text-amber-50">
      <Icon style={{ width: '55%', height: '55%' }} />
    </span>
  )
}
