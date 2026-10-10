import { ROSHAN, TORMENTOR, getHero, getNeutral } from '@/game/cards'
import { PLAYER_LABEL, ZONE_LABEL, attributeOf, ultCost } from '@/game/engine'
import type { GameState, Unit } from '@/game/types'
import { cn } from '@/lib/utils'
import { activeStatuses } from './statuses'
import { ATTR_STYLE, SIDE_STYLE } from './styles'
import { HeroPortrait } from './UnitToken'

function StatusChips({ u }: { u: Unit }) {
  const active = activeStatuses(u)
  if (active.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1">
      {active.map((mark) => (
        <span
          key={mark.key}
          className={cn(
            'rounded px-1.5 py-0.5 text-xs font-semibold',
            mark.key === 'shield'
              ? 'bg-cyan-400/25 text-cyan-100 ring-1 ring-cyan-300/70'
              : mark.kind === 'debuff'
                ? 'bg-fuchsia-500/15 text-fuchsia-200'
                : 'bg-cyan-500/15 text-cyan-200',
          )}
        >
          {mark.title}
        </span>
      ))}
    </div>
  )
}

export function Inspector({ unit, state }: { unit?: Unit; state?: GameState }) {
  if (!unit) {
    return (
      <p className="text-xs leading-relaxed text-zinc-500">
        Click any icon on the map to inspect it. Basic attacks go{' '}
        <span className="text-green-300">AGI</span> → <span className="text-violet-300">UNI</span> →{' '}
        <span className="text-sky-300">INT</span> → <span className="text-red-300">STR</span>. Attributes do not change
        damage. An active Shield and every other status are labeled on the hero.
      </p>
    )
  }

  if (unit.kind === 'neutral' || unit.kind === 'roshan' || unit.kind === 'tormentor') {
    const attr = attributeOf(unit)!
    const info =
      unit.kind === 'roshan'
        ? ROSHAN
        : unit.kind === 'tormentor'
          ? TORMENTOR
          : {
              name: getNeutral(unit.cardId!).name,
              text: `${getNeutral(unit.cardId!).text} Bounty: 1 XP, 1 Gold and a rune card. Attacks in the ${attr} bracket and is part of the counter loop.`,
            }
    return (
      <div className="space-y-2 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-amber-200">{info.name}</span>
          <span className={cn('rounded px-1.5 py-0.5 text-[10px] ring-1', ATTR_STYLE[attr].chip)}>{ATTR_STYLE[attr].label}</span>
        </div>
        <div className="text-zinc-400">
          {ZONE_LABEL[unit.zone]} · {unit.hp}/{unit.maxHp} health
        </div>
        <p className={cn('text-zinc-300', unit.kind === 'tormentor' && unit.status.broken && 'line-through opacity-60')}>
          {info.text}
        </p>
        <StatusChips u={unit} />
      </div>
    )
  }

  if (unit.kind === 'illusion') {
    return (
      <div className="space-y-1 text-xs text-zinc-300">
        <div className={cn('font-semibold', SIDE_STYLE[unit.owner as 'radiant' | 'dire'].text)}>
          Illusion of {getHero(unit.cardId!).name} · {ZONE_LABEL[unit.zone]}
        </div>
        <p className="text-zinc-400">
          A 1 HP decoy standing in front of its hero. It never attacks and vanishes at Cleanup.
        </p>
      </div>
    )
  }

  const side = SIDE_STYLE[unit.owner as 'radiant' | 'dire']
  if (unit.kind !== 'hero') {
    return (
      <div className="space-y-1 text-xs text-zinc-300">
        <div className={cn('font-semibold', side.text)}>
          {PLAYER_LABEL[unit.owner]} {unit.kind === 'siege' ? 'Siege Creep' : 'Creep'} · {ZONE_LABEL[unit.zone]}
        </div>
        <p className="text-zinc-400">
          {unit.kind === 'siege'
            ? 'Dies to 1 damage. Deals 1 damage to units and +1 to enemy towers.'
            : 'Dies to 1 damage. Enemy towers shoot a creep in the line before Position 1.'}{' '}
          Attacks after all heroes and stays in the lane until killed.
        </p>
        <StatusChips u={unit} />
      </div>
    )
  }

  const h = getHero(unit.cardId!)
  const shown = attributeOf(unit) ?? h.attribute
  const a = ATTR_STYLE[shown]
  return (
    <div className="space-y-2 text-xs">
      <div className="flex items-center gap-2">
        <HeroPortrait cardId={h.id} className="h-10 w-16 shrink-0 rounded-md" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-semibold text-zinc-100">{h.name}</span>
            <span className={cn('rounded px-1.5 py-0.5 text-[10px] ring-1', a.chip)}>{a.label}</span>
          </div>
          <div className="text-zinc-400">
            <span className={side.text}>{PLAYER_LABEL[unit.owner]}</span> · {ZONE_LABEL[unit.zone]} · {h.range} · {unit.hp}/
            {unit.maxHp} hp
          </div>
        </div>
      </div>
      {h.script?.kind === 'active' ? (
        <p className="text-zinc-300">
          <span className="font-semibold text-amber-300">
            {h.ult.name} · {ultCost(unit, state)} XP:
          </span>{' '}
          {h.ult.text}
        </p>
      ) : (
        <p className={cn('text-zinc-300', unit.status.broken && 'line-through opacity-60')}>
          <span className="font-semibold text-zinc-100">Passive · {h.passive.name}:</span> {h.passive.text}
        </p>
      )}
      <StatusChips u={unit} />
    </div>
  )
}
