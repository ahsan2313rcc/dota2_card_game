import { Plus } from 'lucide-react'
import { getItem } from '@/game/cards'
import { PLAYER_LABEL, ZONE_LABEL, campHolder, campNeutral, lineup } from '@/game/engine'
import { ANCIENT_HP, CAMPS, LANES, PLAYERS, TOWER_HP, ZONES, type GameState, type PlayerId, type ZoneId } from '@/game/types'
import { cn } from '@/lib/utils'
import { ANCIENT_POS, CAMP_POS, ROTATION_PATH, TOWER_POS, slotPos, statusAnchor, type Pt } from './mapLayout'
import { UnitToken } from './UnitToken'

export interface MapInteraction {
  targetable: Set<string>
  inspected?: string
  declared: Set<string>
  onUnitClick: (uid: string) => void
  /** Zones where the selected card or rotating hero can go */
  dropZones: ZoneId[]
  dropLabel?: string
  onDrop: (zone: ZoneId) => void
}

// Deterministic tree clumps so the map looks the same every render.
const TREES = (() => {
  let seed = 7
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const pts: Array<{ x: number; y: number; r: number }> = []
  while (pts.length < 170) {
    const x = r() * 100
    const y = r() * 100
    const nearLane =
      x < 15 || y < 15 || x > 85 || y > 85 || Math.abs(x + y - 100) < 9 || Math.abs(x - y) < 7
    const nearCamp = Object.values(CAMP_POS).some((c) => Math.hypot(c.x - x, c.y - y) < 9)
    if (!nearLane && !nearCamp) pts.push({ x, y, r: 0.9 + r() * 1.6 })
  }
  return pts
})()

function MapBackground() {
  return (
    <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id="rad" x1="0" y1="1" x2="0.6" y2="0.4">
          <stop offset="0%" stopColor="#284d2a" />
          <stop offset="100%" stopColor="#16301a" />
        </linearGradient>
        <linearGradient id="dire" x1="1" y1="0" x2="0.4" y2="0.6">
          <stop offset="0%" stopColor="#4a2a20" />
          <stop offset="100%" stopColor="#2b1813" />
        </linearGradient>
      </defs>
      <polygon points="0,0 0,100 100,100" fill="url(#rad)" />
      <polygon points="0,0 100,0 100,100" fill="url(#dire)" />
      <path d="M -2 4 C 18 18, 26 32, 42 44 S 70 66, 102 98" stroke="#1d4a63" strokeWidth="6.5" fill="none" opacity="0.85" />
      <path d="M -2 4 C 18 18, 26 32, 42 44 S 70 66, 102 98" stroke="#3a7ea3" strokeWidth="1.2" fill="none" opacity="0.35" />
      {TREES.map((t, i) => (
        <circle key={i} cx={t.x} cy={t.y} r={t.r} fill={t.y > t.x ? '#0f2412' : '#24120c'} opacity="0.9" />
      ))}
      <g stroke="#b59a63" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.38">
        <path d="M 10 84 L 10 10 L 84 10" />
        <path d="M 16 90 L 90 90 L 90 16" />
        <path d="M 15 85 L 85 15" />
      </g>
      <polyline
        points={ROTATION_PATH.map((p) => `${p.x},${p.y}`).join(' ')}
        fill="none"
        stroke="#fde68a"
        strokeWidth="0.45"
        strokeDasharray="1.2 1.4"
        opacity="0.45"
      />
      {CAMPS.map((c) => (
        <circle key={c} cx={CAMP_POS[c].x} cy={CAMP_POS[c].y} r="4.5" fill="none" stroke="#e8c36a" strokeWidth="0.35" strokeDasharray="1 1" opacity="0.6" />
      ))}
      <rect x="2" y="84" width="14" height="14" rx="3" fill="#1f6b3a" opacity="0.55" />
      <rect x="84" y="2" width="14" height="14" rx="3" fill="#7a2a1c" opacity="0.55" />
    </svg>
  )
}

function Tower({
  pos,
  hp,
  max,
  tier,
  owner,
  hidden,
}: {
  pos: Pt
  hp: number
  max: number
  tier: 1 | 2
  owner: PlayerId
  hidden?: string
}) {
  const down = hp <= 0
  return (
    <div
      style={{ left: `${pos.x}%`, top: `${pos.y}%`, width: '6.2cqw', height: '6.2cqw' }}
      title={`${PLAYER_LABEL[owner]} Tier ${tier} tower: ${hp}/${max} · deals ${tier} damage${hidden ? ` · hidden card: ${hidden}` : ''}`}
      className={cn(
        'absolute -translate-x-1/2 -translate-y-1/2 rounded-[0.7cqw] border-2 text-center leading-none shadow-[0_2px_8px_rgba(0,0,0,0.55)]',
        down
          ? 'border-dashed border-zinc-500/40 bg-black/40 text-zinc-500'
          : owner === 'radiant'
            ? 'border-emerald-200 bg-emerald-950/95 text-emerald-50'
            : 'border-red-200 bg-red-950/95 text-red-50',
      )}
    >
      <div className="pt-[0.45cqw] text-[1.85cqw] font-black tracking-wide">T{tier}</div>
      <div className="text-[2.85cqw] leading-none font-black tabular-nums">{down ? '×' : hp}</div>
    </div>
  )
}

function Ancient({ s, owner }: { s: GameState; owner: PlayerId }) {
  const hp = s.players[owner].structures.ancient
  const pos = ANCIENT_POS[owner]
  return (
    <div
      style={{ left: `${pos.x}%`, top: `${pos.y}%`, width: '9cqw' }}
      title={`${PLAYER_LABEL[owner]} Ancient: ${hp}/${ANCIENT_HP}`}
      className="absolute -translate-x-1/2 -translate-y-1/2 text-center"
    >
      <div className={cn('text-[1.3cqw] font-bold tracking-wider uppercase', owner === 'radiant' ? 'text-emerald-200' : 'text-red-200')}>
        Ancient
      </div>
      <div className="text-[2.6cqw] leading-none font-black text-white tabular-nums drop-shadow">{hp}</div>
      <div className="mx-auto mt-[0.4cqw] h-[0.7cqw] w-[7cqw] overflow-hidden rounded-full bg-black/50">
        <div
          className={cn('h-full transition-all duration-500', owner === 'radiant' ? 'bg-emerald-400' : 'bg-red-400')}
          style={{ width: `${(hp / ANCIENT_HP) * 100}%` }}
        />
      </div>
    </div>
  )
}

export function Minimap({ s, ia, viewer }: { s: GameState; ia: MapInteraction; viewer: PlayerId }) {
  const hiddenCard = (p: PlayerId, lane: (typeof LANES)[number], tier: 't1' | 't2') =>
    p === viewer && s.players[p].structures.towers[lane][tier] > 0 ? getItem(s.players[p].towerCards[lane][tier]).name : undefined
  return (
    <div
      className="relative mx-auto aspect-square w-full max-w-[min(100%,82vh)] min-w-[320px] overflow-hidden rounded-2xl border border-zinc-700/80 shadow-2xl"
      style={{ containerType: 'inline-size' }}
    >
      <MapBackground />

      {PLAYERS.map((p) => (
        <Ancient key={p} s={s} owner={p} />
      ))}
      {PLAYERS.flatMap((p) =>
        LANES.flatMap((lane) => {
          const tw = s.players[p].structures.towers[lane]
          return [
            <Tower key={`${p}${lane}1`} pos={TOWER_POS[p][lane].t1} hp={tw.t1} max={TOWER_HP.t1} tier={1} owner={p} hidden={hiddenCard(p, lane, 't1')} />,
            <Tower key={`${p}${lane}2`} pos={TOWER_POS[p][lane].t2} hp={tw.t2} max={TOWER_HP.t2} tier={2} owner={p} hidden={hiddenCard(p, lane, 't2')} />,
          ]
        }),
      )}

      {CAMPS.map((camp) => {
        const n = campNeutral(s, camp)
        const holder = campHolder(s, camp)
        const pos = CAMP_POS[camp]
        return (
          <div key={camp}>
            {n ? (
              <UnitToken
                unit={n}
                pos={pos}
                targetable={ia.targetable.has(n.uid)}
                selected={ia.inspected === n.uid}
                onClick={() => ia.onUnitClick(n.uid)}
              />
            ) : (
              <div
                style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                className="absolute -translate-x-1/2 -translate-y-1/2 text-[1.1cqw] text-amber-200/60 italic"
              >
                Empty camp
              </div>
            )}
            <div
              style={{ left: `${pos.x}%`, top: `${pos.y + (n?.kind === 'roshan' ? 4.8 : 4.2)}%` }}
              className="pointer-events-none absolute -translate-x-1/2 text-center text-[1.05cqw] leading-tight font-semibold whitespace-nowrap text-amber-100/80 drop-shadow"
            >
              {ZONE_LABEL[camp]}
              {holder && (
                <span className={cn('block text-[0.95cqw]', holder === 'radiant' ? 'text-emerald-300' : 'text-red-300')}>
                  held by {PLAYER_LABEL[holder]}
                </span>
              )}
            </div>
          </div>
        )
      })}

      {ZONES.flatMap((zone) =>
        PLAYERS.flatMap((p) =>
          lineup(s, p, zone).map((uid, i) => {
            const unit = s.units[uid]
            // The other side's heroes placed this round stay face down until Show.
            if (s.phase === 'assign' && unit.owner !== viewer && unit.owner !== 'neutral' && unit.placedRound === s.round) return null
            return (
              <UnitToken
                key={uid}
                unit={unit}
                pos={slotPos(zone, p, i)}
                labelSide={statusAnchor(zone, p, i)}
                position={i + 1}
                targetable={ia.targetable.has(uid)}
                selected={ia.inspected === uid}
                declared={ia.declared.has(uid)}
                onClick={() => ia.onUnitClick(uid)}
              />
            )
          }),
        ),
      )}

      {ia.dropZones.map((zone) => {
        const pos = slotPos(zone, 'radiant', lineup(s, 'radiant', zone).length)
        return (
          <button
            key={zone}
            type="button"
            onClick={() => ia.onDrop(zone)}
            title={`${ia.dropLabel ?? 'Place in'} ${ZONE_LABEL[zone]}`}
            style={{ left: `${pos.x}%`, top: `${pos.y}%`, width: '4.8cqw', height: '4.8cqw' }}
            className="absolute z-30 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-dashed border-emerald-300 bg-emerald-500/25 text-emerald-100 transition hover:scale-110 hover:bg-emerald-500/50"
          >
            <Plus style={{ width: '50%', height: '50%' }} />
          </button>
        )
      })}

      <span className="pointer-events-none absolute top-[2.5%] left-[2.5%] text-[1.2cqw] font-bold tracking-widest text-amber-100/70 uppercase">
        Top
      </span>
      <span className="pointer-events-none absolute right-[2.5%] bottom-[2.5%] text-[1.2cqw] font-bold tracking-widest text-amber-100/70 uppercase">
        Bot
      </span>
      <span className="pointer-events-none absolute top-[57%] left-[57%] text-[1.2cqw] font-bold tracking-widest text-amber-100/50 uppercase">
        Mid
      </span>
    </div>
  )
}
