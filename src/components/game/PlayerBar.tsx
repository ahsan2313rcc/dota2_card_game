import { Castle, Coins, Layers, Skull, Sparkles, Users } from 'lucide-react'
import { LANE_LABEL, PLAYER_LABEL, handCount, heroesOnBoard } from '@/game/engine'
import { ANCIENT_HP, BOARD_LIMIT, type GameState, type PlayerId } from '@/game/types'
import { cn } from '@/lib/utils'
import { CardBack } from './HandCard'
import { SIDE_STYLE } from './styles'

export function PlayerBar({ s, player, subtitle }: { s: GameState; player: PlayerId; subtitle: string }) {
  const pl = s.players[player]
  const side = SIDE_STYLE[player]
  const ancientPct = (pl.structures.ancient / ANCIENT_HP) * 100
  return (
    <div className={cn('flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border px-3 py-2', side.border, side.bg)}>
      <div className="min-w-24">
        <div className={cn('text-sm font-bold tracking-wide', side.text)}>{PLAYER_LABEL[player]}</div>
        <div className="text-[11px] text-zinc-400">{subtitle}</div>
      </div>
      <Stat icon={<Coins className="size-4 text-amber-300" />} label="Gold" value={pl.gold} />
      <Stat icon={<Sparkles className="size-4 text-violet-300" />} label="XP" value={pl.xp} />
      <Stat
        icon={<Users className="size-4 text-zinc-300" />}
        label="Board"
        value={`${heroesOnBoard(s, player).length}/${BOARD_LIMIT}`}
      />
      <Stat icon={<Layers className="size-4 text-zinc-300" />} label="Hand" value={handCount(pl)} />
      <Stat icon={<Skull className="size-4 text-zinc-400" />} label="Grave" value={pl.grave.length} />
      {player === 'dire' && <CardBack count={pl.hand.length} />}
      <div className="flex min-w-40 flex-1 items-center gap-2">
        <Castle className="size-4 text-zinc-300" />
        <div className="flex-1">
          <div className="mb-0.5 flex justify-between text-[11px] text-zinc-400">
            <span>Ancient</span>
            <span>
              {pl.structures.ancient}/{ANCIENT_HP}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
            <div
              className={cn('h-full rounded-full transition-all duration-500', player === 'radiant' ? 'bg-emerald-400' : 'bg-red-400')}
              style={{ width: `${ancientPct}%` }}
            />
          </div>
        </div>
      </div>
      {pl.bonusIncomeLanes.length > 0 && (
        <span className="text-[11px] text-amber-300">
          +{pl.bonusIncomeLanes.length} passive Gold ({pl.bonusIncomeLanes.map((l) => LANE_LABEL[l]).join(', ')} broken)
        </span>
      )}
    </div>
  )
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5">
      {icon}
      <div className="leading-none">
        <div className="text-[10px] text-zinc-500 uppercase">{label}</div>
        <div className="text-sm font-semibold text-zinc-100 tabular-nums">{value}</div>
      </div>
    </div>
  )
}
