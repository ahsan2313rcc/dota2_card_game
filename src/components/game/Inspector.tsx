import { ATTRIBUTE_COUNTERS, getHero, getItem } from '@/game/cards'
import { LANE_LABEL, PLAYER_LABEL } from '@/game/engine'
import type { Unit } from '@/game/types'
import { cn } from '@/lib/utils'
import { ATTR_STYLE, SIDE_STYLE } from './styles'

const STATUS_LABEL: Array<[keyof Unit['status'], string]> = [
  ['stunned', 'Stunned'],
  ['silenced', 'Silenced'],
  ['disarmed', 'Disarmed'],
  ['slowed', 'Slowed (attacks last)'],
  ['bkb', 'Black King Bar'],
  ['bladeMail', 'Blade Mail'],
  ['poisoned', 'Poisoned'],
  ['noHeal', 'Cannot heal'],
]

export function Inspector({ unit }: { unit?: Unit }) {
  if (!unit) {
    return (
      <p className="text-xs leading-relaxed text-zinc-500">
        Click any card on the board to inspect it. Counter loop: <span className="text-green-300">AGI</span> →{' '}
        <span className="text-sky-300">INT</span> → <span className="text-red-300">STR</span> →{' '}
        <span className="text-green-300">AGI</span>. A hero's basic attack against the attribute it counters is an
        instant kill. <span className="text-violet-300">UNI</span> heroes sit outside the loop.
      </p>
    )
  }
  const side = SIDE_STYLE[unit.owner]
  if (unit.kind !== 'hero' || !unit.cardId) {
    return (
      <div className="space-y-1 text-xs text-zinc-300">
        <div className={cn('font-semibold', side.text)}>
          {PLAYER_LABEL[unit.owner]} {unit.kind === 'siege' ? 'Siege Creep' : 'Creep'} · {LANE_LABEL[unit.lane]}
        </div>
        <p className="text-zinc-400">
          {unit.kind === 'siege'
            ? 'Dies to 1 damage. Deals 1 damage to units and 2 damage to towers.'
            : 'Dies to 1 damage. Deals 1 damage in combat.'}{' '}
          Creeps attack after all heroes and leave the lane at cleanup.
        </p>
      </div>
    )
  }
  const h = getHero(unit.cardId)
  const a = ATTR_STYLE[h.attribute]
  const statuses = STATUS_LABEL.filter(([k]) => unit.status[k])
  const counters = ATTRIBUTE_COUNTERS[h.attribute]
  return (
    <div className="space-y-2 text-xs">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-zinc-100">{h.name}</span>
        <span className={cn('rounded px-1.5 py-0.5 text-[10px] ring-1', a.chip)}>{a.label}</span>
      </div>
      <div className="text-zinc-400">
        <span className={side.text}>{PLAYER_LABEL[unit.owner]}</span> · {LANE_LABEL[unit.lane]} · {h.range} ·{' '}
        {unit.hp}/{unit.maxHp} health {counters && <>· counters {counters}</>}
      </div>
      <p className="text-zinc-300">
        <span className="font-semibold text-zinc-100">PSV {h.passive.name}:</span> {h.passive.text}
      </p>
      <p className="text-zinc-300">
        <span className="font-semibold text-amber-300">ULT {h.ult.name}:</span> {h.ult.text}{' '}
        <span className="text-zinc-500">({unit.ultUsed ? 'used' : 'ready'})</span>
      </p>
      {unit.equipment.length > 0 && (
        <p className="text-amber-200">Equipped: {unit.equipment.map((e) => getItem(e).name).join(', ')}</p>
      )}
      {statuses.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {statuses.map(([k, l]) => (
            <span key={k} className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-300">
              {l}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
