import { useEffect, useState } from 'react'
import { Copy, Swords } from 'lucide-react'
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
    if (!initialCode) return
    const raw = sessionStorage.getItem(SEAT_KEY)
    if (!raw) return
    try {
      const saved = JSON.parse(raw) as { code?: string; token?: string }
      if (saved.code?.toUpperCase() === initialCode.toUpperCase() && saved.token) {
        openSocket({ type: 'resume', code: saved.code, token: saved.token })
      }
    } catch {
      sessionStorage.removeItem(SEAT_KEY)
    }
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
      <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-6 px-4 py-10">
        <div className="flex items-center gap-2">
          <Swords className="size-6 text-amber-400" />
          <h1 className="text-xl font-bold tracking-tight">Dota2 Card Game: Ancient's Duel</h1>
        </div>

        {!table && (
          <form
            className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5"
            onSubmit={(event) => {
              event.preventDefault()
              rememberName()
              const trimmed = code.trim()
              if (trimmed) net.openSocket({ type: 'join', code: trimmed, name: name.trim() })
              else net.openSocket({ type: 'create', name: name.trim() })
            }}
          >
            <div>
              <h2 className="text-lg font-semibold">Play online</h2>
              <p className="mt-1 text-sm text-zinc-400">Create a room and send your friend the code, or join theirs. You take Radiant. They take Dire.</p>
            </div>
            <label className="block space-y-1.5 text-sm">
              <span className="text-zinc-300">Your name</span>
              <Input value={name} maxLength={24} placeholder="Name on the scoreboard" onValueChange={setName} />
            </label>
            <label className="block space-y-1.5 text-sm">
              <span className="text-zinc-300">Room code</span>
              <Input
                value={code}
                maxLength={4}
                placeholder="Leave blank to host"
                onValueChange={(value) => setCode(value.toUpperCase())}
                className="tracking-[0.3em] uppercase"
              />
            </label>
            {net.error && <p className="text-sm text-red-300">{net.error}</p>}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={net.status === 'connecting'} className="bg-amber-400 text-zinc-950 hover:bg-amber-300">
                {code.trim() ? 'Join room' : 'Create room'}
              </Button>
              <Button type="button" variant="outline" onClick={leave}>
                Back
              </Button>
            </div>
          </form>
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
              <p className="mt-2 text-sm text-zinc-400">Send that code or link. The match starts when both seats are filled and the host presses start.</p>
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
