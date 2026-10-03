import { Coins, Package } from 'lucide-react'
import { getHero, getItem } from '@/game/cards'
import type { HandCard as HandCardT } from '@/game/types'
import { cn } from '@/lib/utils'
import { ATTR_STYLE } from './styles'

interface Props {
  card: HandCardT
  selected?: boolean
  disabledReason?: string | null
  onClick?: () => void
}

export function HandCard({ card, selected, disabledReason, onClick }: Props) {
  const dim = !!disabledReason
  return (
    <button
      type="button"
      onClick={onClick}
      title={disabledReason ?? undefined}
      className={cn(
        'flex h-[188px] w-[150px] shrink-0 flex-col overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 text-left shadow-lg transition-all duration-150 outline-none',
        selected ? '-translate-y-2 ring-2 ring-sky-400' : 'hover:-translate-y-1 hover:border-zinc-500',
        dim && 'opacity-60',
      )}
    >
      {card.type === 'hero' ? <HeroFace id={card.cardId} /> : <ItemFace id={card.cardId} />}
    </button>
  )
}

function HeroFace({ id }: { id: string }) {
  const h = getHero(id)
  const a = ATTR_STYLE[h.attribute]
  return (
    <>
      <div className={cn('flex items-center justify-between bg-gradient-to-r px-2 py-1.5', a.strip)}>
        <span className="text-sm font-semibold text-white">{h.name}</span>
      </div>
      <div className="flex items-center gap-1 px-2 pt-1.5 text-[10px]">
        <span className={cn('rounded px-1 ring-1', a.chip)}>{h.attribute}</span>
        <span className="text-zinc-400">{h.range}</span>
        {h.maxHp && <span className="text-zinc-400">· {h.maxHp} hits</span>}
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

function ItemFace({ id }: { id: string }) {
  const it = getItem(id)
  return (
    <>
      <div className="flex items-center justify-between bg-gradient-to-r from-amber-600/70 to-amber-900/30 px-2 py-1.5">
        <span className="text-sm font-semibold text-white">{it.name}</span>
        <span className="flex items-center gap-0.5 text-xs font-semibold text-amber-100">
          <Coins className="size-3" />
          {it.cost}
        </span>
      </div>
      <div className="flex items-center gap-1 px-2 pt-1.5 text-[10px] text-zinc-400">
        <Package className="size-3" />
        {it.kind}
      </div>
      <p className="flex-1 px-2 py-1.5 text-[11px] leading-snug text-zinc-300">{it.text}</p>
    </>
  )
}

export function CardBack({ count }: { count: number }) {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: Math.min(count, 7) }, (_, i) => (
        <div
          key={i}
          className="h-9 w-6 rounded border border-orange-500/30 bg-gradient-to-br from-orange-900/60 to-zinc-900"
        />
      ))}
    </div>
  )
}
