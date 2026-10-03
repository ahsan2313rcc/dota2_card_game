import { Plus, Swords } from 'lucide-react'
import { LANE_LABEL, laneRole, lineup } from '@/game/engine'
import { TOWER_HP, type GameState, type LaneId, type PlayerId, type Unit } from '@/game/types'
import { cn } from '@/lib/utils'
import { SIDE_STYLE } from './styles'
import { UnitCard } from './UnitCard'

export interface BoardInteraction {
  targetable: Set<string>
  inspected?: string
  onUnitClick: (uid: string) => void
  dropActive: boolean
  onLaneDrop: (lane: LaneId) => void
  renderFooter: (unit: Unit, index: number, total: number) => React.ReactNode
}

function Tower({ tier, hp, max }: { tier: 1 | 2; hp: number; max: number }) {
  const down = hp <= 0
  return (
    <div
      className={cn(
        'flex w-12 shrink-0 flex-col items-center justify-center gap-1 rounded-md border px-1 py-1.5 sm:w-14',
        down ? 'border-dashed border-zinc-800 text-zinc-600' : 'border-zinc-700 bg-zinc-900/80 text-zinc-300',
      )}
      title={`Tier ${tier} tower: ${hp}/${max} hits left · deals ${tier} damage`}
    >
      <span className="text-[10px] font-semibold">T{tier}</span>
      {down ? (
        <span className="text-[9px] uppercase">Razed</span>
      ) : (
        <div className="flex flex-wrap justify-center gap-0.5">
          {Array.from({ length: max }, (_, i) => (
            <span key={i} className={cn('h-1.5 w-1.5 rounded-full', i < hp ? 'bg-amber-400' : 'bg-zinc-700')} />
          ))}
        </div>
      )}
    </div>
  )
}

function Side({
  s,
  lane,
  player,
  ia,
}: {
  s: GameState
  lane: LaneId
  player: PlayerId
  ia: BoardInteraction
}) {
  const ids = lineup(s, player, lane)
  const tw = s.players[player].structures.towers[lane]
  const isRadiant = player === 'radiant'
  const showDrop = isRadiant && ia.dropActive

  const units = ids.map((uid, i) => (
    <UnitCard
      key={uid}
      unit={s.units[uid]}
      position={i + 1}
      targetable={ia.targetable.has(uid)}
      selected={ia.inspected === uid}
      onClick={() => ia.onUnitClick(uid)}
      footer={ia.renderFooter(s.units[uid], i, ids.length)}
    />
  ))
  const drop = showDrop ? (
    <button
      key="drop"
      type="button"
      onClick={() => ia.onLaneDrop(lane)}
      className="flex h-[112px] w-[84px] shrink-0 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-emerald-400/60 bg-emerald-500/5 text-[11px] text-emerald-300 transition hover:bg-emerald-500/15 sm:w-[92px]"
    >
      <Plus className="size-4" />
      Place here
    </button>
  ) : null

  // Position 1 sits next to the clash line in the middle of the lane.
  const ordered = isRadiant ? [drop, ...[...units].reverse()] : [...units]
  const towers = [<Tower key="t1" tier={1} hp={tw.t1} max={TOWER_HP.t1} />, <Tower key="t2" tier={2} hp={tw.t2} max={TOWER_HP.t2} />]

  return (
    <div className={cn('flex min-w-0 flex-1 items-center gap-2', isRadiant ? 'flex-row' : 'flex-row')}>
      {isRadiant && <div className="flex gap-1">{[...towers].reverse()}</div>}
      <div
        className={cn(
          'flex min-h-[132px] min-w-0 flex-1 items-center gap-2 overflow-x-auto px-1 py-2',
          isRadiant ? 'justify-end' : 'justify-start',
        )}
      >
        {ordered.filter(Boolean).length === 0 ? (
          <span className="px-2 text-xs text-zinc-600 italic">Empty lane</span>
        ) : (
          ordered
        )}
      </div>
      {!isRadiant && <div className="flex gap-1">{towers}</div>}
    </div>
  )
}

export function LaneRow({ s, lane, ia }: { s: GameState; lane: LaneId; ia: BoardInteraction }) {
  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-2 sm:p-3">
      <header className="mb-1 flex items-center justify-between text-[11px] tracking-wide uppercase">
        <span className={SIDE_STYLE.radiant.text}>Radiant · {laneRole('radiant', lane)} lane</span>
        <span className="font-semibold text-zinc-300">{LANE_LABEL[lane]}</span>
        <span className={SIDE_STYLE.dire.text}>{laneRole('dire', lane)} lane · Dire</span>
      </header>
      <div className="flex flex-col items-stretch gap-1 lg:flex-row lg:items-center">
        <Side s={s} lane={lane} player="radiant" ia={ia} />
        <div className="flex items-center justify-center text-zinc-600 lg:w-6">
          <Swords className="size-4" />
        </div>
        <Side s={s} lane={lane} player="dire" ia={ia} />
      </div>
    </section>
  )
}
