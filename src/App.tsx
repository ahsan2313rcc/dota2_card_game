import { useMemo, useState } from 'react'
import { Coins, Moon, RotateCcw, ScrollText, Sparkles, Sun, Swords, Trophy } from 'lucide-react'
import { toast } from 'sonner'
import { CombatLog, LogLines } from '@/components/game/CombatLog'
import { HandCard } from '@/components/game/HandCard'
import { Inspector } from '@/components/game/Inspector'
import { LaneRow, type BoardInteraction } from '@/components/game/LaneRow'
import { PhaseTracker } from '@/components/game/PhaseTracker'
import { PlayerBar } from '@/components/game/PlayerBar'
import { RulesDialog } from '@/components/game/RulesDialog'
import { ReorderControls } from '@/components/game/UnitCard'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Toaster } from '@/components/ui/sonner'
import { getHero, getItem } from '@/game/cards'
import {
  PLAYER_LABEL,
  drawBlockReason,
  isDay,
  itemBlockReason,
  itemTargets,
  placeBlockReason,
  ultBlockReason,
  ultNeedsTarget,
  ultTargets,
} from '@/game/engine'
import { HUMAN, useGame } from '@/game/useGame'
import { LANES, PLACE_PER_ROUND, type HandCard as HandCardT, type Unit } from '@/game/types'
import { cn } from '@/lib/utils'

export default function App() {
  const [s, dispatch] = useGame()
  const [selectedHand, setSelectedHand] = useState<string | null>(null)
  const [ultCaster, setUltCaster] = useState<string | null>(null)
  const [inspected, setInspected] = useState<string>()
  const [reportOpen, setReportOpen] = useState(false)
  const stepKey = `${s.round}:${s.phase}`
  const [lastStepKey, setLastStepKey] = useState(stepKey)
  if (stepKey !== lastStepKey) {
    setLastStepKey(stepKey)
    setSelectedHand(null)
    setUltCaster(null)
    setReportOpen(s.phase === 'report' || s.phase === 'gameover')
  }

  const me = s.players[HUMAN]
  const selectedCard = me.hand.find((c) => c.iid === selectedHand)

  const targetable = useMemo(() => {
    if (s.phase === 'items' && selectedCard?.type === 'item') return new Set(itemTargets(s, HUMAN, selectedCard.cardId))
    if (s.phase === 'ults' && ultCaster) return new Set(ultTargets(s, ultCaster))
    return new Set<string>()
  }, [s, selectedCard, ultCaster])

  const inspectedUnit = inspected ? s.units[inspected] : undefined

  function onHandClick(card: HandCardT) {
    if (selectedHand === card.iid) return setSelectedHand(null)
    if (s.phase === 'assign' && card.type === 'hero') {
      const r = placeBlockReason(s, HUMAN)
      if (r) return toast.error(r)
      return setSelectedHand(card.iid)
    }
    if (s.phase === 'items' && card.type === 'item') {
      const r = itemBlockReason(s, HUMAN, card)
      if (r) return toast.error(`${getItem(card.cardId).name}: ${r}`)
      return setSelectedHand(card.iid)
    }
    if (card.type === 'hero') toast.message('Heroes are placed during the Assign step.')
    else toast.message('Items are played during the Item step.')
  }

  function onUnitClick(uid: string) {
    if (targetable.has(uid)) {
      if (selectedCard?.type === 'item') {
        dispatch({ type: 'playItem', handIid: selectedCard.iid, target: uid })
        setSelectedHand(null)
      } else if (ultCaster) {
        dispatch({ type: 'declareUlt', uid: ultCaster, target: uid })
        setUltCaster(null)
      }
      return
    }
    setInspected(uid)
  }

  function onUltClick(u: Unit) {
    if (s.ultDeclarations.some((d) => d.uid === u.uid)) return dispatch({ type: 'cancelUlt', uid: u.uid })
    const r = ultBlockReason(s, u.uid)
    if (r) return toast.error(`${getHero(u.cardId!).ult.name}: ${r}`)
    if (ultNeedsTarget(u)) {
      setUltCaster(ultCaster === u.uid ? null : u.uid)
      return
    }
    dispatch({ type: 'declareUlt', uid: u.uid })
  }

  const ia: BoardInteraction = {
    targetable,
    inspected,
    onUnitClick,
    dropActive: s.phase === 'assign' && selectedCard?.type === 'hero' && !placeBlockReason(s, HUMAN),
    onLaneDrop: (lane) => {
      if (!selectedCard) return
      dispatch({ type: 'place', handIid: selectedCard.iid, lane })
      setSelectedHand(null)
    },
    renderFooter: (u, index, total) => {
      if (u.owner !== HUMAN || u.kind !== 'hero') return null
      if (s.phase === 'assign') {
        return (
          <ReorderControls
            frontIsRight
            onFront={index > 0 ? () => dispatch({ type: 'move', uid: u.uid, dir: -1 }) : undefined}
            onBack={index < total - 1 ? () => dispatch({ type: 'move', uid: u.uid, dir: 1 }) : undefined}
            onReturn={u.placedRound === s.round ? () => dispatch({ type: 'unplace', uid: u.uid }) : undefined}
          />
        )
      }
      if (s.phase === 'ults') {
        const declared = s.ultDeclarations.some((d) => d.uid === u.uid)
        const reason = ultBlockReason(s, u.uid)
        const picking = ultCaster === u.uid
        return (
          <button
            type="button"
            onClick={() => onUltClick(u)}
            title={declared ? 'Click to cancel and refund 1 XP' : (reason ?? getHero(u.cardId!).ult.text)}
            className={cn(
              'rounded-md px-2 py-0.5 text-[10px] font-semibold transition',
              declared
                ? 'bg-amber-400 text-zinc-950'
                : picking
                  ? 'animate-pulse bg-sky-500 text-white'
                  : reason
                    ? 'bg-zinc-800 text-zinc-500'
                    : 'bg-amber-500/20 text-amber-200 hover:bg-amber-500/30',
            )}
          >
            {declared ? 'ULT ✓' : picking ? 'Pick target' : 'ULT · 1 XP'}
          </button>
        )
      }
      return null
    },
  }

  const roundEntries = s.log.filter((e) => e.round === s.round)
  const resolutionStart = roundEntries.findIndex((e) => e.text.startsWith('Phase 1'))
  const resolutionEntries = resolutionStart >= 0 ? roundEntries.slice(resolutionStart) : []

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_#1c1917_0%,_#09090b_60%)] text-zinc-100">
      <Toaster theme="dark" position="top-center" richColors />
      <header className="sticky top-0 z-30 border-b border-zinc-800/80 bg-zinc-950/85 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <Swords className="size-5 text-amber-400" />
            <h1 className="text-base font-bold tracking-tight">The Ancient's Duel</h1>
          </div>
          <div className="flex items-center gap-2 text-sm text-zinc-300">
            <span className="font-semibold">Round {s.round}</span>
            {isDay(s.round) ? (
              <span className="flex items-center gap-1 text-amber-300">
                <Sun className="size-4" /> Day
              </span>
            ) : (
              <span className="flex items-center gap-1 text-indigo-300">
                <Moon className="size-4" /> Night
              </span>
            )}
          </div>
          <PhaseTracker phase={s.phase} />
          <div className="ml-auto flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Switch
                id="single-ult"
                checked={s.settings.singleUseUlt}
                onCheckedChange={(v) => dispatch({ type: 'settings', settings: { singleUseUlt: v } })}
              />
              <Label htmlFor="single-ult" className="text-xs text-zinc-400">
                Single-use ULTs
              </Label>
            </div>
            <RulesDialog />
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                dispatch({ type: 'new' })
                setInspected(undefined)
              }}
            >
              <RotateCcw />
              New game
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1600px] gap-4 px-3 py-4 sm:px-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-3">
          <PlayerBar s={s} player="dire" subtitle="AI opponent" />
          {LANES.map((lane) => (
            <LaneRow key={lane} s={s} lane={lane} ia={ia} />
          ))}
          <PlayerBar s={s} player="radiant" subtitle="You" />

          <ActionBar
            s={s}
            selectedCard={selectedCard}
            ultCaster={ultCaster}
            onDraw={(card) => dispatch({ type: 'draw', card })}
            onAdvance={() => {
              if (s.phase === 'draw') dispatch({ type: 'endDraw' })
              else if (s.phase === 'assign') dispatch({ type: 'endAssign' })
              else if (s.phase === 'items') dispatch({ type: 'endItems' })
              else if (s.phase === 'ults') dispatch({ type: 'resolve' })
              else if (s.phase === 'report') dispatch({ type: 'nextRound' })
              else dispatch({ type: 'new' })
            }}
            onShowReport={() => setReportOpen(true)}
          />

          <section>
            <h2 className="mb-2 text-xs font-semibold tracking-wider text-zinc-400 uppercase">
              Your hand ({me.hand.length}/7)
            </h2>
            {me.hand.length === 0 ? (
              <p className="rounded-xl border border-dashed border-zinc-800 p-6 text-center text-sm text-zinc-500">
                Your hand is empty. Spend Gold during the Draw step to buy hero or item cards.
              </p>
            ) : (
              <div className="flex gap-3 overflow-x-auto pt-2 pb-3">
                {me.hand.map((c) => (
                  <HandCard
                    key={c.iid}
                    card={c}
                    selected={selectedHand === c.iid}
                    disabledReason={
                      s.phase === 'items' && c.type === 'item'
                        ? itemBlockReason(s, HUMAN, c)
                        : s.phase === 'assign' && c.type === 'hero'
                          ? placeBlockReason(s, HUMAN)
                          : null
                    }
                    onClick={() => onHandClick(c)}
                  />
                ))}
              </div>
            )}
          </section>
        </div>

        <aside className="flex flex-col gap-3 lg:sticky lg:top-16 lg:h-[calc(100vh-5rem)]">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
            <h2 className="mb-2 text-xs font-semibold tracking-wider text-zinc-400 uppercase">Inspector</h2>
            <Inspector unit={inspectedUnit} />
          </div>
          <div className="flex min-h-[260px] flex-1 flex-col rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 lg:min-h-0">
            <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wider text-zinc-400 uppercase">
              <ScrollText className="size-3.5" /> Battle log
            </h2>
            <div className="max-h-[360px] min-h-0 flex-1 lg:max-h-none">
              <CombatLog entries={s.log} />
            </div>
          </div>
        </aside>
      </main>

      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {s.winner ? (
                <>
                  <Trophy className="size-5 text-amber-400" />
                  {s.winner === HUMAN ? 'Victory! The Dire Ancient falls.' : 'Defeat. Your Ancient has fallen.'}
                </>
              ) : (
                <>Round {s.round} resolved</>
              )}
            </DialogTitle>
            <DialogDescription>
              {s.winner
                ? `${PLAYER_LABEL[s.winner]} wins in round ${s.round}.`
                : 'Ultimates, basic attacks, tower aggro, cleanup and income — in order.'}
            </DialogDescription>
          </DialogHeader>
          <LogLines entries={resolutionEntries} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setReportOpen(false)}>
              View board
            </Button>
            {s.winner ? (
              <Button onClick={() => dispatch({ type: 'new' })}>Play again</Button>
            ) : (
              <Button onClick={() => dispatch({ type: 'nextRound' })}>Start round {s.round + 1}</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ActionBar({
  s,
  selectedCard,
  ultCaster,
  onDraw,
  onAdvance,
  onShowReport,
}: {
  s: ReturnType<typeof useGame>[0]
  selectedCard?: HandCardT
  ultCaster: string | null
  onDraw: (card: 'hero' | 'item') => void
  onAdvance: () => void
  onShowReport: () => void
}) {
  const me = s.players[HUMAN]
  let title = ''
  let hint = ''
  let cta = ''
  switch (s.phase) {
    case 'draw':
      title = 'Draw'
      hint = 'Spend 1 Gold per card. Keep some Gold for items — they cost Gold to play.'
      cta = 'Done drawing'
      break
    case 'assign':
      title = 'Assign heroes'
      hint = selectedCard
        ? `Click "Place here" in a lane for ${getHero(selectedCard.cardId).name}.`
        : `Select a hero in your hand, then a lane. Use the arrows to set Position 1 (front). ${me.placedThisRound}/${PLACE_PER_ROUND} placed this round.`
      cta = 'Lock in & reveal'
      break
    case 'items':
      title = 'Items'
      hint = selectedCard
        ? `Choose a highlighted target for ${getItem(selectedCard.cardId).name}.`
        : 'Select an item card, then a highlighted target. Items resolve immediately.'
      cta = 'Done with items'
      break
    case 'ults':
      title = 'Ultimates'
      hint = ultCaster
        ? `Choose a highlighted target for ${getHero(s.units[ultCaster].cardId!).ult.name}.`
        : `Declare Ultimates on your heroes (1 XP each). Declared: ${s.ultDeclarations.length}. STR casts first, AGI last.`
      cta = 'Resolve combat'
      break
    case 'report':
      title = 'Round complete'
      hint = 'Review the battle log, then start the next round.'
      cta = `Start round ${s.round + 1}`
      break
    case 'gameover':
      title = s.winner === HUMAN ? 'Victory' : 'Defeat'
      hint = 'The duel is over.'
      cta = 'Play again'
      break
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 sm:flex-row sm:items-center">
      <div className="flex-1">
        <div className="text-sm font-semibold text-amber-200">{title}</div>
        <div className="text-xs text-zinc-400">{hint}</div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {s.phase === 'draw' && (
          <>
            <Button variant="outline" size="sm" disabled={!!drawBlockReason(s, HUMAN, 'hero')} onClick={() => onDraw('hero')}>
              <Coins /> Hero card
            </Button>
            <Button variant="outline" size="sm" disabled={!!drawBlockReason(s, HUMAN, 'item')} onClick={() => onDraw('item')}>
              <Coins /> Item card
            </Button>
          </>
        )}
        {(s.phase === 'report' || s.phase === 'gameover') && (
          <Button variant="ghost" size="sm" onClick={onShowReport}>
            <ScrollText /> Round report
          </Button>
        )}
        <Button size="sm" onClick={onAdvance} className="bg-amber-400 text-zinc-950 hover:bg-amber-300">
          {s.phase === 'ults' ? <Swords /> : s.phase === 'items' ? <Sparkles /> : null}
          {cta}
        </Button>
      </div>
    </div>
  )
}
