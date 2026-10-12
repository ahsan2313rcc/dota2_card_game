import { useState } from 'react'
import { Swords, Users } from 'lucide-react'
import { MatchView } from '@/components/game/Match'
import { OnlineMatch } from '@/components/game/Online'
import { Toaster } from '@/components/ui/sonner'
import { TableProvider } from '@/game/table'
import { useGame } from '@/game/useGame'

type Screen = 'home' | 'local' | 'online'

function initialScreen(): Screen {
  const params = new URLSearchParams(window.location.search)
  if (params.has('autoplay')) return 'local'
  if (params.get('room')) return 'online'
  return 'home'
}

export default function App() {
  const [screen, setScreen] = useState<Screen>(initialScreen)
  const room = new URLSearchParams(window.location.search).get('room') ?? undefined

  function leaveOnline() {
    const url = new URL(window.location.href)
    url.searchParams.delete('room')
    window.history.replaceState({}, '', url.pathname + url.search)
    setScreen('home')
  }

  return (
    <>
      <Toaster theme="dark" position="top-center" richColors />
      {screen === 'home' && <Home onLocal={() => setScreen('local')} onOnline={() => setScreen('online')} />}
      {screen === 'local' && <LocalMatch onLeave={() => setScreen('home')} />}
      {screen === 'online' && <OnlineMatch initialCode={room} onLeave={leaveOnline} />}
    </>
  )
}

function LocalMatch({ onLeave }: { onLeave: () => void }) {
  const [s, dispatch] = useGame()
  return (
    <TableProvider
      value={{
        you: 'radiant',
        live: 'local',
        ready: { radiant: false, dire: false },
        rematch: { radiant: false, dire: false },
        names: {},
        connected: { radiant: true, dire: true },
      }}
    >
      <MatchView s={s} dispatch={dispatch} onLeave={onLeave} />
    </TableProvider>
  )
}

function Home({ onLocal, onOnline }: { onLocal: () => void; onOnline: () => void }) {
  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_#1c1917_0%,_#09090b_60%)] text-zinc-100">
      <div className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-8 px-4 py-12">
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-amber-300">
            <Swords className="size-6" />
            <p className="text-xs font-semibold tracking-[0.22em] uppercase">Three lanes. Two ancients.</p>
          </div>
          <h1 className="text-3xl font-black tracking-tight sm:text-4xl">Dota2 Card Game: Ancient's Duel</h1>
          <p className="text-sm leading-relaxed text-zinc-400">
            Draw from one shared deck, hide your assignments until Show, and answer each interrupt before the towers fire. Face a Dire AI, or sit across from a friend in a room.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={onLocal}
            className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 text-left transition hover:border-amber-400/50"
          >
            <Swords className="mb-3 size-5 text-amber-300" />
            <div className="font-semibold">Play vs AI</div>
            <p className="mt-1 text-sm text-zinc-400">You are Radiant. Dire plays a personality you pick in the header.</p>
          </button>
          <button
            type="button"
            onClick={onOnline}
            className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 text-left transition hover:border-amber-400/50"
          >
            <Users className="mb-3 size-5 text-emerald-300" />
            <div className="font-semibold">Play online</div>
            <p className="mt-1 text-sm text-zinc-400">Host a four-letter room. A friend joins the link and takes Dire.</p>
          </button>
        </div>
      </div>
    </div>
  )
}
