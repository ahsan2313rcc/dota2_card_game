import { ChevronDown, ChevronUp, X } from 'lucide-react'
import { getHero } from '@/game/cards'
import { ZONE_LABEL, campHolder, laneRole, lineup, shieldBlockReason, ultBlockReason, ultCost, unitName } from '@/game/engine'
import { HUMAN } from '@/game/useGame'
import { SHIELD_XP_COST, ZONES, isLane, type CampId, type GameState, type Unit } from '@/game/types'
import { cn } from '@/lib/utils'
import { activeStatuses } from './statuses'
import { HeroPortrait } from './UnitToken'

export interface RosterActions {
  ultCaster: string | null
  inspected?: string
  onInspect: (uid: string) => void
  onMove: (uid: string, dir: -1 | 1) => void
  onReturn: (uid: string) => void
  onUlt: (u: Unit) => void
  onShield: (u: Unit) => void
  onMorph: (uid: string) => void
  onFocus: (camp: CampId, focus: 'neutral' | 'enemy') => void
}

/** Your units grouped by zone, with the controls that don't fit on the minimap. */
export function Roster({ s, actions }: { s: GameState; actions: RosterActions }) {
  const zones = ZONES.filter((z) => lineup(s, HUMAN, z).length > 0)
  if (zones.length === 0) {
    return <p className="text-xs text-zinc-500">Nothing on the board yet. Place heroes and creeps during the Assign step.</p>
  }
  return (
    <div className="space-y-3">
      {zones.map((zone) => {
        const ids = lineup(s, HUMAN, zone)
        const camp = !isLane(zone) ? (zone as CampId) : null
        const holds = camp ? campHolder(s, camp) === HUMAN : false
        return (
          <div key={zone}>
            <div className="mb-1 flex items-center justify-between text-[10px] tracking-wider text-zinc-500 uppercase">
              <span>
                {ZONE_LABEL[zone]} · {laneRole(HUMAN, zone)}
              </span>
              {camp && (
                <span className="flex items-center gap-1 normal-case">
                  {holds ? (
                    <>
                      Target
                      {(['neutral', 'enemy'] as const).map((f) => (
                        <button
                          key={f}
                          type="button"
                          onClick={() => actions.onFocus(camp, f)}
                          className={cn(
                            'rounded px-1.5 py-0.5 text-[10px]',
                            s.players[HUMAN].campFocus[camp] === f ? 'bg-amber-400 text-zinc-950' : 'bg-zinc-800 text-zinc-300',
                          )}
                        >
                          {f === 'neutral' ? 'Neutral' : 'Enemy'}
                        </button>
                      ))}
                    </>
                  ) : (
                    <span className="text-red-300">Contesting: must attack the holder</span>
                  )}
                </span>
              )}
            </div>
            <ul className="space-y-1">
              {ids.map((uid, i) => (
                <RosterRow key={uid} s={s} u={s.units[uid]} index={i} total={ids.length} actions={actions} />
              ))}
            </ul>
          </div>
        )
      })}
    </div>
  )
}

function RosterRow({ s, u, index, total, actions }: { s: GameState; u: Unit; index: number; total: number; actions: RosterActions }) {
  const declaration = s.ultDeclarations.find((d) => d.uid === u.uid)
  const declared = !!declaration
  const reason = u.kind === 'hero' ? ultBlockReason(s, u.uid) : null
  const picking = actions.ultCaster === u.uid
  const nextCost = u.kind === 'hero' && u.owner !== 'neutral' && s.players[u.owner].arcane ? 0 : ultCost(u, s)
  const morph = u.cardId === 'morphling' ? (u.morph ?? 'AGI') : undefined
  const marks = activeStatuses(u)
  return (
    <li
      className={cn(
        'flex items-center gap-2 rounded-lg border border-transparent bg-zinc-900/80 px-1.5 py-1',
        actions.inspected === u.uid && 'border-sky-500/50',
      )}
    >
      <span className="w-4 text-center text-[10px] text-zinc-500">{index + 1}</span>
      <button type="button" onClick={() => actions.onInspect(u.uid)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
        {u.kind === 'hero' || u.kind === 'illusion' ? (
          <HeroPortrait
            cardId={u.cardId!}
            className={cn(
              'size-7 shrink-0 rounded-full',
              u.kind === 'hero' && u.hp < u.maxHp && 'ring-2 ring-red-500',
              u.kind === 'illusion' && 'opacity-60 hue-rotate-180',
            )}
          />
        ) : (
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald-700 text-[10px] font-bold">
            {u.kind === 'siege' ? 'S' : 'C'}
          </span>
        )}
        <span className="min-w-0">
          <span className="block truncate text-xs text-zinc-200">{unitName(u)}</span>
          <span className="block text-[10px] text-zinc-500">
            {u.hp}/{u.maxHp} hp{u.hp < u.maxHp && u.kind === 'hero' ? ' · Wounded' : ''}
            {u.kind === 'hero' ? ` · ULT ${nextCost} XP` : ''}
            {morph ? ` · ${morph}` : ''}
            {u.kind === 'illusion' ? ' · decoy' : ''}
          </span>
          {marks.length > 0 && (
            <span className="mt-0.5 flex flex-wrap gap-0.5">
              {marks.map((mark) => (
                <span
                  key={mark.key}
                  title={mark.title}
                  className={cn(
                    'rounded px-1.5 py-0.5 text-[11px] leading-none font-bold tracking-tight',
                    mark.key === 'shield'
                      ? 'bg-cyan-300 text-cyan-950'
                      : mark.kind === 'debuff'
                        ? 'bg-fuchsia-600/80 text-white'
                        : 'bg-sky-800 text-sky-50',
                  )}
                >
                  {mark.short}
                </span>
              ))}
            </span>
          )}
        </span>
      </button>
      {s.phase === 'assign' && morph && (
        <button
          type="button"
          onClick={() => actions.onMorph(u.uid)}
          title="Swap between Agility and Strength during Assign"
          className="shrink-0 rounded-md bg-violet-500/20 px-2 py-1 text-[10px] font-semibold text-violet-200 hover:bg-violet-500/30"
        >
          Morph
        </button>
      )}
      {s.phase === 'assign' && (
        <span className="flex items-center">
          <IconBtn title="Move toward Position 1" disabled={index === 0} onClick={() => actions.onMove(u.uid, -1)}>
            <ChevronUp className="size-3.5" />
          </IconBtn>
          <IconBtn title="Move toward the back" disabled={index === total - 1} onClick={() => actions.onMove(u.uid, 1)}>
            <ChevronDown className="size-3.5" />
          </IconBtn>
          {u.placedRound === s.round && (
            <IconBtn title="Return to hand" onClick={() => actions.onReturn(u.uid)}>
              <X className="size-3.5" />
            </IconBtn>
          )}
        </span>
      )}
      {s.phase === 'ults' && u.kind === 'hero' && (
        <button
          type="button"
          disabled={!!shieldBlockReason(s, HUMAN, u.uid)}
          onClick={() => actions.onShield(u)}
          title={shieldBlockReason(s, HUMAN, u.uid) ?? 'Spend 3 XP. One Shield, and it lasts until it blocks a hit.'}
          className={cn(
            'shrink-0 rounded-md px-2 py-1 text-[10px] font-semibold',
            u.status.shield > 0 ? 'bg-cyan-500/20 text-cyan-200' : 'bg-cyan-500/15 text-cyan-100 hover:bg-cyan-500/25 disabled:bg-zinc-800 disabled:text-zinc-500',
          )}
        >
          {u.status.shield > 0 ? 'Shielded' : `Shield · ${SHIELD_XP_COST} XP`}
        </button>
      )}
      {s.phase === 'ults' && u.kind === 'hero' && (
        <button
          type="button"
          onClick={() => actions.onUlt(u)}
          title={declared ? `Cancel and refund ${declaration?.free ? 'the Arcane rune' : `${declaration?.cost ?? 0} XP`}` : (reason ?? getHero(u.cardId!).ult.text)}
          className={cn(
            'shrink-0 rounded-md px-2 py-1 text-[10px] font-semibold transition',
            declared
              ? 'bg-amber-400 text-zinc-950'
              : picking
                ? 'animate-pulse bg-sky-500 text-white'
                : reason
                  ? 'bg-zinc-800 text-zinc-500'
                  : 'bg-amber-500/20 text-amber-200 hover:bg-amber-500/30',
          )}
        >
          {declared ? 'ULT ✓' : picking ? 'Pick target' : `ULT · ${nextCost} XP`}
        </button>
      )}
    </li>
  )
}

function IconBtn({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-25"
    >
      {children}
    </button>
  )
}
