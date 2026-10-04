import { ATTRIBUTE_COUNTERS, ROSHAN, TORMENTOR, getHero, getNeutral } from '@/game/cards'
import { PLAYER_LABEL, ZONE_LABEL, attributeOf, ultCost } from '@/game/engine'
import type { GameState, RoundStatus, Unit } from '@/game/types'
import { cn } from '@/lib/utils'
import { ATTR_STYLE, SIDE_STYLE } from './styles'
import { HeroPortrait } from './UnitToken'

const STATUS: Array<[keyof RoundStatus, string, 'debuff' | 'buff']> = [
  ['stunned', 'Stunned: no Ultimate, no attack', 'debuff'],
  ['silenced', 'Silenced: no Ultimate', 'debuff'],
  ['broken', 'Broken: passive off', 'debuff'],
  ['disarmed', 'Disarmed: no attack', 'debuff'],
  ['slowed', 'Slowed: attacks last', 'debuff'],
  ['blinded', 'Blinded: attacks miss', 'debuff'],
  ['rooted', 'Rooted: cannot move', 'debuff'],
  ['muted', 'Muted: no items', 'debuff'],
  ['cursed', 'Cursed: cannot heal', 'debuff'],
  ['banished', 'Banished: untargetable and invulnerable', 'buff'],
  ['immune', 'Immune: blocks magical damage and debuffs', 'buff'],
  ['invulnerable', 'Invulnerable: blocks all damage', 'buff'],
  ['ethereal', 'Ethereal: blocks attack damage, +1 magical', 'buff'],
  ['feared', 'Feared: no ultimate, attack, or move', 'debuff'],
  ['hexed', 'Hexed: 1 HP decoy, no attack', 'debuff'],
  ['enfeeble', 'Enfeebled: attack −1', 'debuff'],
  ['revealed', 'Revealed', 'debuff'],
  ['cannotDie', 'Cannot die this turn', 'buff'],
  ['rangedAttack', 'Attacks as Ranged', 'buff'],
  ['lifesteal', 'Basic attacks heal', 'buff'],
  ['rupture', 'Moving deals 2 magical damage', 'debuff'],
  ['shield', 'Shield', 'buff'],
  ['evade', 'Evade', 'buff'],
  ['accuracy', 'Accuracy', 'buff'],
  ['pierce', 'Pierce', 'buff'],
  ['bonusDamage', '+Damage', 'buff'],
  ['invisible', 'Invisible: enemies cannot target', 'buff'],
  ['haste', 'Haste: attacks first', 'buff'],
  ['bladeMail', 'Blade Mail', 'buff'],
  ['aegis', 'Aegis', 'buff'],
  ['reincarnation', 'Reincarnation', 'buff'],
  ['borrowedTime', 'Borrowed Time', 'buff'],
  ['focusFire', 'Focus Fire', 'buff'],
]

function StatusChips({ u }: { u: Unit }) {
  const active = STATUS.filter(([k]) => {
    const v = u.status[k]
    return typeof v === 'number' ? v > 0 : !!v
  })
  if (u.status.poisonedBy) active.push(['poisonedBy', 'Poisoned: 1 damage at cleanup', 'debuff'])
  if (active.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1">
      {active.map(([k, l, kind]) => (
        <span
          key={k}
          className={cn(
            'rounded px-1.5 py-0.5 text-[10px]',
            kind === 'debuff' ? 'bg-fuchsia-500/15 text-fuchsia-200' : 'bg-cyan-500/15 text-cyan-200',
          )}
        >
          {l}
          {typeof u.status[k] === 'number' && (u.status[k] as number) > 1 ? ` ×${u.status[k]}` : ''}
        </span>
      ))}
    </div>
  )
}

export function Inspector({ unit, state }: { unit?: Unit; state?: GameState }) {
  if (!unit) {
    return (
      <p className="text-xs leading-relaxed text-zinc-500">
        Click any icon on the map to inspect it. Counter loop: <span className="text-green-300">AGI</span> →{' '}
        <span className="text-red-300">STR</span> → <span className="text-sky-300">INT</span> →{' '}
        <span className="text-green-300">AGI</span>. A basic attack against the attribute it counters is an instant kill.{' '}
        <span className="text-violet-300">UNI</span> sits outside the loop. Pink dots mark debuffs, cyan dots mark buffs.
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
  const counters = shown === 'UNI' ? undefined : ATTRIBUTE_COUNTERS[shown]
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
            {unit.maxHp} hp{counters && <> · counters {counters}</>}
          </div>
        </div>
      </div>
      <p className={cn('text-zinc-300', unit.status.broken && 'line-through opacity-60')}>
        <span className="font-semibold text-zinc-100">PSV {h.passive.name}:</span> {h.passive.text}
      </p>
      <p className="text-zinc-300">
        <span className="font-semibold text-amber-300">ULT {h.ult.name}:</span> {h.ult.text}{' '}
        <span className="text-zinc-500">
          ({unit.ultCasts > 0 ? `cast ${unit.ultCasts}×, next ` : 'next '}
          {ultCost(unit, state)} XP)
        </span>
      </p>
      <StatusChips u={unit} />
    </div>
  )
}
