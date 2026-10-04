import { Package, Shield } from 'lucide-react'
import { getHero, getItem } from '@/game/cards'
import type { HandCard as HandCardT } from '@/game/types'
import { cn } from '@/lib/utils'
import { ATTR_STYLE } from './styles'
import { HeroPortrait } from './UnitToken'

interface Props {
  card: HandCardT
  selected?: boolean
  disabledReason?: string | null
  onClick?: () => void
}

export function HandCard({ card, selected, disabledReason, onClick }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={disabledReason ?? undefined}
      className={cn(
        'flex h-[212px] w-[152px] shrink-0 flex-col overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 text-left shadow-lg transition-all duration-150 outline-none',
        selected ? '-translate-y-2 ring-2 ring-sky-400' : 'hover:-translate-y-1 hover:border-zinc-500',
        disabledReason && 'opacity-60',
      )}
    >
      {card.type === 'hero' && <HeroFace id={card.cardId} buybackUsed={card.buybackUsed} />}
      {card.type === 'item' && <ItemFace id={card.cardId} />}
      {card.type === 'creep' && <CreepFace siege={card.cardId === 'siege'} />}
    </button>
  )
}

function HeroFace({ id, buybackUsed }: { id: string; buybackUsed?: boolean }) {
  const h = getHero(id)
  const a = ATTR_STYLE[h.attribute]
  return (
    <>
      <div className="relative h-[68px] shrink-0 overflow-hidden">
        <HeroPortrait cardId={id} className="h-full w-full" />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-2 pt-4 pb-1">
          <div className="text-sm leading-tight font-semibold text-white">{h.name}</div>
        </div>
      </div>
      <div className="flex items-center gap-1 px-2 pt-1.5 text-[10px]">
        <span className={cn('rounded px-1 ring-1', a.chip)}>{h.attribute}</span>
        <span className="text-zinc-400">{h.range}</span>
        {h.maxHp && <span className="text-zinc-400">· {h.maxHp} hits</span>}
        {buybackUsed && <span className="text-zinc-500">· buyback spent</span>}
      </div>
      <div className="flex flex-1 flex-col gap-1 overflow-hidden px-2 py-1.5 text-[10px] leading-snug">
        <p className="text-zinc-300">
          <span className="font-semibold text-zinc-100">PSV {h.passive.name}:</span> {h.passive.text}
        </p>
        <p className="text-zinc-300">
          <span className="font-semibold text-amber-300">ULT {h.ult.name}:</span> {h.ult.text}
        </p>
      </div>
    </>
  )
}

const ITEM_TINT = {
  Shop: 'from-amber-600/70 to-amber-900/30',
  Rune: 'from-teal-600/70 to-teal-900/30',
  Tower: 'from-sky-600/70 to-slate-900/30',
  Special: 'from-yellow-400/80 to-orange-800/40',
} as const

const ITEM_NOTE = {
  Shop: 'Shop item · single use',
  Rune: 'Rune · outside hand limit',
  Tower: 'Tower card · outside hand limit',
  Special: 'Boss reward · single use',
} as const

function ItemFace({ id }: { id: string }) {
  const it = getItem(id)
  return (
    <>
      <div className={cn('bg-gradient-to-r px-2 py-2', ITEM_TINT[it.kind])}>
        <span className="text-sm font-semibold text-white">{it.name}</span>
      </div>
      <div className="flex items-center gap-1 px-2 pt-1.5 text-[10px] text-zinc-400">
        <Package className="size-3" />
        {it.kind === 'Shop' && it.cost ? `${it.cost} Gold · single use` : ITEM_NOTE[it.kind]}
      </div>
      <p className="flex-1 px-2 py-1.5 text-[11px] leading-snug text-zinc-300">{it.text}</p>
    </>
  )
}

function CreepFace({ siege }: { siege: boolean }) {
  return (
    <>
      <div className="bg-gradient-to-r from-emerald-700/80 to-emerald-950/40 px-2 py-2">
        <span className="text-sm font-semibold text-white">{siege ? 'Siege Creep' : 'Lane Creep'}</span>
      </div>
      <div className="flex items-center gap-1 px-2 pt-1.5 text-[10px] text-zinc-400">
        <Shield className="size-3" />
        Creep card · lanes only
      </div>
      <p className="flex-1 px-2 py-1.5 text-[11px] leading-snug text-zinc-300">
        {siege
          ? 'Dies to 1 damage. Deals 1 damage to units and +1 physical damage to enemy towers.'
          : 'Dies to 1 damage. Enemy towers target a creep in the line before any hero, whatever its position.'}{' '}
        Stays in its lane until killed. Does not count toward your hero limits.
      </p>
    </>
  )
}

export function CardBack({ count }: { count: number }) {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: Math.min(count, 7) }, (_, i) => (
        <div key={i} className="h-9 w-6 rounded border border-red-500/30 bg-gradient-to-br from-red-900/60 to-zinc-900" />
      ))}
    </div>
  )
}
