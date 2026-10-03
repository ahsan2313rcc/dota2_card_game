import { useState } from 'react'
import { Crown, Flame, Mountain, Snowflake, Sparkles, Zap } from 'lucide-react'
import { getHero, heroPortrait } from '@/game/cards'
import { fullName } from '@/game/engine'
import type { Unit } from '@/game/types'
import { cn } from '@/lib/utils'
import type { Pt } from './mapLayout'

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

function debuffed(u: Unit) {
  const st = u.status
  return st.stunned || st.silenced || st.disarmed || st.broken || st.blinded || st.rooted || st.muted || st.cursed || st.slowed
}

function buffed(u: Unit) {
  const st = u.status
  return st.immune || st.shield > 0 || st.evade > 0 || st.accuracy || st.bonusDamage > 0 || st.aegis || st.bladeMail || st.thorns
}

interface Props {
  unit: Unit
  pos: Pt
  position?: number
  targetable?: boolean
  selected?: boolean
  declared?: boolean
  onClick: () => void
}

export function UnitToken({ unit, pos, position, targetable, selected, declared, onClick }: Props) {
  const wounded = unit.hp < unit.maxHp
  const side =
    unit.owner === 'radiant' ? 'ring-emerald-400' : unit.owner === 'dire' ? 'ring-red-500' : 'ring-amber-400'
  const size = unit.kind === 'hero' ? 4.8 : unit.kind === 'roshan' ? 6 : unit.kind === 'neutral' ? 5 : 3

  return (
    <button
      type="button"
      onClick={onClick}
      title={`${fullName(unit)} · ${unit.hp}/${unit.maxHp}`}
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
          unit.status.banished && 'opacity-40',
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
        {unit.kind === 'neutral' && <NeutralFace id={unit.cardId!} />}
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
      {(debuffed(unit) || buffed(unit)) && (
        <span className="absolute -right-[0.3cqw] -bottom-[0.3cqw] flex gap-[0.2cqw]">
          {debuffed(unit) && <span className="size-[1.1cqw] rounded-full bg-fuchsia-400 ring-1 ring-black" />}
          {buffed(unit) && <span className="size-[1.1cqw] rounded-full bg-cyan-300 ring-1 ring-black" />}
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
