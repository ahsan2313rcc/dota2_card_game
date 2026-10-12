import { useEffect, useState } from 'react'
import { Copy, Swords, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MatchView } from '@/components/game/Match'
import { TowerGoldToggle } from '@/components/game/OpponentSelect'
import { SEAT_KEY, useOnline } from '@/game/useOnline'
import { TableProvider, type TableInfo } from '@/game/table'
import { PLAYER_LABEL } from '@/game/engine'

export function OnlineMatch({ initialCode, onLeave }: { initialCode?: string; onLeave: () => void }) {
  const net = useOnline()
  const { openSocket } = net
  const [name, setName] = useState(() => sessionStorage.getItem('ancients-name') ?? '')
  const [code, setCode] = useState(initialCode ?? '')

  useEffect(() => {
    if (initialCode) {
      const raw = sessionStorage.getItem(SEAT_KEY)
      if (raw) {
        try {
          const saved = JSON.parse(raw) as { code?: string; token?: string }
          if (saved.code?.toUpperCase() === initialCode.toUpperCase() && saved.token) {
            openSocket({ type: 'resume', code: saved.code, token: saved.token })
            return
          }
        } catch {
          sessionStorage.removeItem(SEAT_KEY)
        }
      }
    }
    openSocket({ type: 'lobby' })
  }, [initialCode, openSocket])

  useEffect(() => {
    if (net.error) toast.error(net.error)
  }, [net.error])

  function rememberName() {
    sessionStorage.setItem('ancients-name', name.trim())
  }

  function leave() {
    net.close()
    onLeave()
  }

  const table = net.table
  if (table?.started && table.state) {
    const info: TableInfo = {
      you: table.seat,
      live: 'online',
      code: table.code,
      ready: table.ready,
      rematch: table.rematch,
      names: table.names,
      connected: table.connected,
    }
    return (
      <TableProvider value={info}>
        {net.status === 'closed' && (
          <div className="bg-amber-500/15 px-4 py-2 text-center text-sm text-amber-100">Reconnecting to room {table.code}…</div>
        )}
        <MatchView s={table.state} dispatch={net.sendAction} onLeave={leave} />
      </TableProvider>
    )
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_#1c1917_0%,_#09090b_60%)] text-zinc-100">
      <div className="mx-auto flex min-h-screen max-w-4xl flex-col justify-center gap-6 px-4 py-10">
        <div className="flex items-center gap-2">
          <Swords className="size-6 text-amber-400" />
          <h1 className="text-xl font-bold tracking-tight">Dota2 Card Game: Ancient's Duel</h1>
        </div>

        {!table && (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <form
              className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5"
              onSubmit={(event) => {
                event.preventDefault()
                rememberName()
                net.send({ type: 'match', name: name.trim() })
              }}
            >
              <div>
                <h2 className="text-lg font-semibold">Lobby</h2>
                <p className="mt-1 text-sm text-zinc-400">
                  Find a match and you sit at the oldest open table, or host one and wait. The duel starts as soon as both seats are filled.
                </p>
              </div>
              <label className="block space-y-1.5 text-sm">
                <span className="text-zinc-300">Your name</span>
                <Input value={name} maxLength={24} placeholder="Name on the scoreboard" onValueChange={setName} />
              </label>
              <p className="text-xs text-zinc-500">
                {net.status === 'connecting'
                  ? 'Opening the lobby…'
                  : net.status === 'closed'
                    ? 'Reconnecting to the lobby…'
                    : othersLooking(net.lobby?.looking ?? 0)}
              </p>
              {net.error && <p className="text-sm text-red-300">{net.error}</p>}
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={net.status !== 'open'} className="bg-amber-400 text-zinc-950 hover:bg-amber-300">
                  <Users />
                  Find a match
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={net.status !== 'open'}
                  onClick={() => {
                    rememberName()
                    net.send({ type: 'create', name: name.trim() })
                  }}
                >
                  Host a table
                </Button>
                <Button type="button" variant="ghost" onClick={leave}>
                  Back
                </Button>
              </div>
              <div className="flex gap-2 border-t border-zinc-800 pt-4">
                <Input
                  value={code}
                  maxLength={4}
                  placeholder="Room code"
                  onValueChange={(value) => setCode(value.toUpperCase())}
                  className="tracking-[0.3em] uppercase"
                  aria-label="Room code"
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={net.status !== 'open' || code.trim().length < 4}
                  onClick={() => {
                    rememberName()
                    net.send({ type: 'join', code: code.trim(), name: name.trim() })
                  }}
                >
                  Join code
                </Button>
              </div>
            </form>

            <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
              <h2 className="text-sm font-semibold tracking-wider text-zinc-400 uppercase">Open tables</h2>
              {(net.lobby?.rooms.length ?? 0) === 0 ? (
                <p className="mt-3 text-sm text-zinc-500">No open tables. Host one, or find a match and you will be the next host.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {net.lobby?.rooms.map((room) => (
                    <li key={room.code} className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 px-3 py-2">
                      <div>
                        <div className="font-semibold">{room.host}</div>
                        <div className="text-xs text-zinc-500">
                          {room.code} · Tower gold {room.towerGold ? 'on' : 'off'} · waiting for Dire
                        </div>
                      </div>
                      <Button
                        size="sm"
                        disabled={net.status !== 'open'}
                        onClick={() => {
                          rememberName()
                          net.send({ type: 'join', code: room.code, name: name.trim() })
                        }}
                        className="bg-amber-400 text-zinc-950 hover:bg-amber-300"
                      >
                        Join
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}

        {table && !table.started && (
          <section className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
            <div>
              <p className="text-xs font-semibold tracking-[0.2em] text-amber-300 uppercase">Room</p>
              <div className="mt-1 flex items-center gap-3">
                <span className="text-4xl font-black tracking-[0.25em]">{table.code}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const link = `${window.location.origin}${window.location.pathname}?room=${table.code}`
                    void navigator.clipboard.writeText(link).then(
                      () => toast.success('Link copied'),
                      () => toast.message(link),
                    )
                  }}
                >
                  <Copy />
                  Copy link
                </Button>
              </div>
              <p className="mt-2 text-sm text-zinc-400">This table is in the lobby. The duel starts as soon as someone sits down as Dire. You can still send the code to a friend.</p>
            </div>
            <ul className="space-y-2 text-sm">
              <SeatLine side="Radiant" name={table.names.radiant} here={table.seat === 'radiant'} connected={table.connected.radiant} />
              <SeatLine side="Dire" name={table.names.dire} here={table.seat === 'dire'} connected={table.connected.dire} />
            </ul>
            {table.host && (
              <TowerGoldToggle value={table.towerGold} onChange={(on) => net.send({ type: 'towerGold', on })} />
            )}
            {!table.host && <p className="text-xs text-zinc-500">Tower gold is {table.towerGold ? 'on' : 'off'}. The host can change it before the match.</p>}
            {net.error && <p className="text-sm text-red-300">{net.error}</p>}
            <div className="flex flex-wrap gap-2">
              {table.host ? (
                <Button
                  disabled={!table.connected.dire || net.status !== 'open'}
                  onClick={() => net.send({ type: 'start' })}
                  className="bg-amber-400 text-zinc-950 hover:bg-amber-300"
                >
                  {table.connected.dire ? 'Start match' : 'Waiting for Dire'}
                </Button>
              ) : (
                <p className="text-sm text-zinc-300">Waiting for {table.names.radiant ?? PLAYER_LABEL.radiant} to start.</p>
              )}
              <Button variant="outline" onClick={leave}>
                Leave
              </Button>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

function othersLooking(looking: number) {
  if (looking <= 1) return 'You are the only one in the lobby.'
  const others = looking - 1
  return `${others} other ${others === 1 ? 'player is' : 'players are'} in the lobby.`
}

function SeatLine({ side, name, here, connected }: { side: string; name?: string; here: boolean; connected: boolean }) {
  return (
    <li className="flex items-center justify-between rounded-lg border border-zinc-800 px-3 py-2">
      <span>
        <span className="font-semibold">{side}</span>
        <span className="text-zinc-400"> · {name ?? 'Empty seat'}</span>
        {here && <span className="text-amber-200"> · you</span>}
      </span>
      <span className={connected ? 'text-emerald-300' : 'text-zinc-500'}>{connected ? 'Here' : 'Waiting'}</span>
    </li>
  )
}
