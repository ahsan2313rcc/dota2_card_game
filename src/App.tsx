import { useMemo, useState } from 'react'
import { Coins, Footprints, Moon, RotateCcw, ScrollText, Skull, Sparkles, Sun, Swords, Trophy } from 'lucide-react'
import { toast } from 'sonner'
import { CombatLog, LogLines } from '@/components/game/CombatLog'
import { HandCard } from '@/components/game/HandCard'
import { Inspector } from '@/components/game/Inspector'
import { Minimap, type MapInteraction } from '@/components/game/Minimap'
import { PhaseTracker } from '@/components/game/PhaseTracker'
import { PlayerBar } from '@/components/game/PlayerBar'
import { Roster } from '@/components/game/Roster'
import { RulesDialog } from '@/components/game/RulesDialog'
import { TowerCards } from '@/components/game/TowerCards'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Toaster } from '@/components/ui/sonner'
import { getHero, getItem } from '@/game/cards'
import { BUYBACK_WINDOW } from '@/game/types'
import {
  PLAYER_LABEL,
  ZONE_LABEL,
  buybackBlockReason,
  buybackCost,
  buybackWindow,
  drawBlockReason,
  favoredPlayer,
  handCount,
  isDay,
  itemBlockReason,
  itemLanes,
  itemTargets,
  rotationTargets,
  assignableZones,
  placeBlockReason,
  ultBlockReason,
  ultNeedsTarget,
  ultTargets,
  ultZones,
  type DrawType,
} from '@/game/engine'
import { HUMAN, useGame } from '@/game/useGame'
import { HAND_LIMIT, LANES, PLACE_PER_ROUND, ROTATIONS_PER_ROUND, isLane, type GameState, type HandCard as HandCardT, type Unit, type ZoneId } from '@/game/types'

export default function App() {
  const [s, dispatch] = useGame()
  const [selectedHand, setSelectedHand] = useState<string | null>(null)
  const [ultCaster, setUltCaster] = useState<string | null>(null)
  const [tpHero, setTpHero] = useState<string | null>(null)
  const [rotator, setRotator] = useState<string | null>(null)
  const [inspected, setInspected] = useState<string>()
  const [reportOpen, setReportOpen] = useState(false)
  const stepKey = `${s.round}:${s.phase}`
  const [lastStepKey, setLastStepKey] = useState(stepKey)
  if (stepKey !== lastStepKey) {
    setLastStepKey(stepKey)
    setSelectedHand(null)
    setUltCaster(null)
    setTpHero(null)
    setRotator(null)
    setReportOpen(s.phase === 'report' || s.phase === 'gameover')
  }

  const me = s.players[HUMAN]
  const selectedCard = me.hand.find((c) => c.iid === selectedHand)
  const selectedItem = selectedCard?.type === 'item' ? getItem(selectedCard.cardId) : undefined

  const targetable = useMemo(() => {
    if (s.phase === 'items' && selectedCard?.type === 'item' && !tpHero) return new Set(itemTargets(s, HUMAN, selectedCard.cardId))
    if (s.phase === 'ults' && ultCaster) return new Set(ultTargets(s, ultCaster))
    if (s.phase === 'rotate' && !rotator) {
      return new Set(Object.values(s.units).filter((u) => u.owner === HUMAN && rotationTargets(s, u.uid).length).map((u) => u.uid))
    }
    return new Set<string>()
  }, [s, selectedCard, ultCaster, tpHero, rotator])

  const inspectedUnit = inspected ? s.units[inspected] : undefined

  function onHandClick(card: HandCardT) {
    if (selectedHand === card.iid) return setSelectedHand(null)
    if (s.phase === 'assign' && card.type === 'hero') {
      const r = placeBlockReason(s, HUMAN)
      if (r) return toast.error(r)
      return setSelectedHand(card.iid)
    }
    if (s.phase === 'assign' && card.type === 'creep') return setSelectedHand(card.iid)
    if (s.phase === 'items' && card.type === 'item') {
      setTpHero(null)
      const r = itemBlockReason(s, HUMAN, card)
      if (r) return toast.error(`${getItem(card.cardId).name}: ${r}`)
      if (getItem(card.cardId).target === 'none') {
        dispatch({ type: 'playItem', handIid: card.iid })
        return
      }
      return setSelectedHand(card.iid)
    }
    if (card.type === 'item') toast.message('Items are played during the Item step.')
    else toast.message(`${card.type === 'hero' ? 'Heroes' : 'Creeps'} are placed during the Assign step.`)
  }

  function onUnitClick(uid: string) {
    if (targetable.has(uid)) {
      if (s.phase === 'rotate') {
        setRotator(uid)
      } else if (selectedItem?.target === 'allyHeroToLane') {
        setTpHero(uid)
      } else if (selectedCard?.type === 'item') {
        dispatch({ type: 'playItem', handIid: selectedCard.iid, target: uid })
        setSelectedHand(null)
      } else if (ultCaster) {
        dispatch({ type: 'declareUlt', uid: ultCaster, target: uid })
        setUltCaster(null)
      }
      return
    }
    if (rotator === uid) setRotator(null)
    setInspected(uid)
  }

  function onUlt(u: Unit) {
    if (s.ultDeclarations.some((d) => d.uid === u.uid)) return dispatch({ type: 'cancelUlt', uid: u.uid })
    const r = ultBlockReason(s, u.uid)
    if (r) return toast.error(`${getHero(u.cardId!).ult.name}: ${r}`)
    if (ultNeedsTarget(u)) {
      setUltCaster(ultCaster === u.uid ? null : u.uid)
      return
    }
    dispatch({ type: 'declareUlt', uid: u.uid })
  }

  let dropZones: readonly ZoneId[] = []
  let dropLabel = 'Place in'
  if (s.phase === 'assign' && selectedCard) {
    if (selectedCard.type === 'creep') dropZones = LANES
    else if (selectedCard.type === 'hero' && !placeBlockReason(s, HUMAN)) dropZones = assignableZones(HUMAN)
  } else if (s.phase === 'items' && selectedCard && selectedItem) {
    if (selectedItem.target === 'lane') dropZones = itemLanes(s, HUMAN, selectedCard.cardId)
    else if (selectedItem.target === 'allyHeroToLane' && tpHero) dropZones = itemLanes(s, HUMAN, selectedCard.cardId, tpHero)
    dropLabel = 'Teleport to'
  } else if (s.phase === 'rotate' && rotator) {
    dropZones = rotationTargets(s, rotator)
    dropLabel = 'Rotate to'
  } else if (s.phase === 'ults' && ultCaster && ultZones(s, ultCaster).length) {
    dropZones = ultZones(s, ultCaster)
    dropLabel = 'Cast toward'
  }

  const ia: MapInteraction = {
    targetable,
    inspected,
    declared: new Set(s.ultDeclarations.filter((d) => d.owner === HUMAN).map((d) => d.uid)),
    onUnitClick,
    dropZones: [...dropZones],
    dropLabel,
    onDrop: (zone) => {
      if (s.phase === 'ults' && ultCaster) {
        dispatch({ type: 'declareUlt', uid: ultCaster, target: zone })
        setUltCaster(null)
        return
      }
      if (s.phase === 'rotate' && rotator) {
        dispatch({ type: 'rotate', uid: rotator, zone })
        setRotator(null)
        return
      }
      if (!selectedCard) return
      if (s.phase === 'items') {
        if (isLane(zone)) dispatch({ type: 'playItem', handIid: selectedCard.iid, target: tpHero ?? undefined, lane: zone })
        setTpHero(null)
      } else {
        dispatch({ type: 'place', handIid: selectedCard.iid, zone })
      }
      setSelectedHand(null)
    },
  }

  const roundEntries = s.log.filter((e) => e.round === s.round)
  const resolutionStart = roundEntries.findIndex((e) => e.text.startsWith('Phase 1'))
  const resolutionEntries = resolutionStart >= 0 ? roundEntries.slice(resolutionStart) : []

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_#1c1917_0%,_#09090b_60%)] text-zinc-100">
      <Toaster theme="dark" position="top-center" richColors />
      <header className="sticky top-0 z-40 border-b border-zinc-800/80 bg-zinc-950/85 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <Swords className="size-5 text-amber-400" />
            <h1 className="text-base font-bold tracking-tight">The Ancient's Duel</h1>
          </div>
          <div className="flex items-center gap-2 text-sm text-zinc-300">
            <span className="font-semibold">Round {s.round}</span>
            <span
              className="text-zinc-400"
              title="One pile for both players. It started as 160 cards: 127 heroes, 25 creeps and 8 siege creeps, shuffled together. Five cards were dealt to each side."
            >
              Deck {s.unitDeck.length}
            </span>
            <span className="text-zinc-400" title="Both players draw from this shop deck. 60 cards. Playing one costs 1, 2 or 3 Gold. Runes and tower cards stay free.">
              Items {s.itemDeck.length}
            </span>
            <span className="text-zinc-400" title="Both players draw runes from this deck. 10 runes, two copies each.">
              Runes {s.runeDeck.length}
            </span>
            {isDay(s.round, s.cycle) ? (
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

      <main className="mx-auto grid max-w-[1600px] gap-4 px-3 py-4 sm:px-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-3">
          <PlayerBar s={s} player="dire" subtitle="AI opponent" />
          <div className="overflow-x-auto">
            <Minimap s={s} ia={ia} viewer={HUMAN} />
          </div>
          <PlayerBar s={s} player="radiant" subtitle="You" />

          <ActionBar
            s={s}
            selectedCard={selectedCard}
            ultCaster={ultCaster}
            tpHero={tpHero}
            rotator={rotator}
            onDraw={(card) => dispatch({ type: 'draw', card })}
            onBuyback={(heroId) => dispatch({ type: 'buyback', heroId })}
            onAdvance={() => {
              if (s.phase === 'draw') dispatch({ type: 'endDraw' })
              else if (s.phase === 'assign') dispatch({ type: 'endAssign' })
              else if (s.phase === 'items') dispatch({ type: 'endItems' })
              else if (s.phase === 'ults') dispatch({ type: 'resolve' })
              else if (s.phase === 'rotate') dispatch({ type: 'endRotate' })
              else if (s.phase === 'report') dispatch({ type: 'nextRound' })
              else dispatch({ type: 'new' })
            }}
            onShowReport={() => setReportOpen(true)}
          />

          <section>
            <h2 className="mb-2 text-xs font-semibold tracking-wider text-zinc-400 uppercase">
              Your hand ({handCount(me)}/{HAND_LIMIT}
              {me.hand.some((c) => c.type === 'item' && getItem(c.cardId).kind === 'Rune') ? ' + runes' : ''}
              {me.hand.some((c) => c.type === 'item' && getItem(c.cardId).kind === 'Tower') ? ' + tower cards' : ''})
            </h2>
            {me.hand.length === 0 ? (
              <p className="rounded-xl border border-dashed border-zinc-800 p-6 text-center text-sm text-zinc-500">
                Your hand is empty. Spend Gold during the Draw step. A draw from the mixed deck is a hero or a creep.
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
          <Panel title="Your board">
            <div className="max-h-[260px] overflow-y-auto pr-1">
              <Roster
                s={s}
                actions={{
                  ultCaster,
                  inspected,
                  onInspect: setInspected,
                  onMove: (uid, dir) => dispatch({ type: 'move', uid, dir }),
                  onReturn: (uid) => dispatch({ type: 'unplace', uid }),
                  onUlt,
                  onMorph: (uid) => dispatch({ type: 'morph', uid }),
                  onFocus: (camp, focus) => dispatch({ type: 'campFocus', camp, focus }),
                }}
              />
            </div>
          </Panel>
          <Panel title="Your towers">
            <TowerCards s={s} onSwap={(tier, a, b) => dispatch({ type: 'swapTowers', tier, a, b })} />
          </Panel>
          <Panel title="Inspector">
            <Inspector unit={inspectedUnit} state={s} />
          </Panel>
          <div className="flex min-h-[240px] flex-1 flex-col rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 lg:min-h-0">
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
                : 'Ultimates, basic attacks, tower aggro, rotation, cleanup and income — in order.'}
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

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
      <h2 className="mb-2 text-xs font-semibold tracking-wider text-zinc-400 uppercase">{title}</h2>
      {children}
    </div>
  )
}

function ActionBar({
  s,
  selectedCard,
  ultCaster,
  tpHero,
  rotator,
  onDraw,
  onBuyback,
  onAdvance,
  onShowReport,
}: {
  s: GameState
  selectedCard?: HandCardT
  ultCaster: string | null
  tpHero: string | null
  rotator: string | null
  onDraw: (card: DrawType) => void
  onBuyback: (heroId: string) => void
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
      hint = `Spend 1 Gold to draw the top card of the shared deck (both sides use it), or an item. Buyback is ${buybackCost(s, HUMAN)} Gold, once per hero, and only from the last ${BUYBACK_WINDOW} heroes in the shared discard.`
      cta = 'Done drawing'
      break
    case 'assign':
      title = 'Assign'
      hint = selectedCard
        ? `Click a green + on the map to place ${selectedCard.type === 'hero' ? getHero(selectedCard.cardId).name : 'the creep'}${selectedCard.type === 'creep' ? ' (lanes only)' : ' (lanes or your own jungle)'}.`
        : `Select a hero or creep card, then a green + on the map. Heroes go to a lane or your jungle. Creeps go to lanes. Heroes ${me.placedThisRound}/${PLACE_PER_ROUND} this round.`
      cta = 'Lock in & reveal'
      break
    case 'items':
      title = 'Items'
      hint = !selectedCard
        ? 'Select an item, rune or tower card, then a highlighted target. Shop items cost 1, 2 or 3 Gold. Runes and tower cards are free. All are single use and resolve immediately.'
        : getItem(selectedCard.cardId).target === 'lane'
          ? `Click a green + to choose the lane for ${getItem(selectedCard.cardId).name}.`
          : getItem(selectedCard.cardId).target === 'allyHeroToLane'
            ? tpHero
              ? `Click a green + to teleport ${getHero(s.units[tpHero].cardId!).name}.`
              : 'Choose a highlighted hero to teleport.'
            : `Choose a highlighted target for ${getItem(selectedCard.cardId).name}.`
      cta = 'Done with items'
      break
    case 'ults':
      title = 'Ultimates'
      hint = ultCaster
        ? ultZones(s, ultCaster).length
          ? `Click a green + for ${getHero(s.units[ultCaster].cardId!).ult.name}.`
          : `Choose a highlighted target for ${getHero(s.units[ultCaster].cardId!).ult.name}.`
        : `Declare Ultimates in "Your board". The first cast of a hero's life costs 1 XP, then 2, then 3. Declared: ${s.ultDeclarations.length}. STR casts first, AGI last.`
      cta = 'Resolve combat'
      break
    case 'rotate': {
      title = 'Rotation'
      const first = favoredPlayer(s.round, s.cycle) === HUMAN
      hint = rotator
        ? `Click a green + to move ${getHero(s.units[rotator].cardId!).name} from ${ZONE_LABEL[s.units[rotator].zone]}.`
        : `Move up to ${ROTATIONS_PER_ROUND} heroes (${ROTATIONS_PER_ROUND - me.rotationsUsed} left) along Top · Dire Jungle · Mid · Radiant Jungle · Bot. ${first ? 'Day: you move first.' : 'Night: Dire moved first.'} Each hero moves once. Heroes in a lane with no allied towers can walk lane to lane.`
      cta = me.rotationsUsed > 0 ? 'Done rotating' : 'Skip rotation'
      break
    }
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
    <div className="flex flex-col gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="flex-1">
        <div className="text-sm font-semibold text-amber-200">{title}</div>
        <div className="text-xs text-zinc-400">{hint}</div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {s.phase === 'draw' &&
          (['unit', 'item'] as const).map((t) => (
            <Button key={t} variant="outline" size="sm" disabled={!!drawBlockReason(s, HUMAN, t)} onClick={() => onDraw(t)}>
              <Coins /> {t === 'unit' ? 'Hero or creep' : 'Item card'}
            </Button>
          ))}
        {s.phase === 'rotate' && <Footprints className="size-4 text-amber-300" />}
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
      {s.phase === 'draw' && s.heroDiscard.length > 0 && (
        <div className="flex basis-full flex-wrap items-center gap-2 border-t border-amber-500/10 pt-2 sm:order-last">
          <span className="flex items-center gap-1 text-xs text-zinc-400">
            <Skull className="size-3.5" /> Last {Math.min(BUYBACK_WINDOW, s.heroDiscard.length)} discarded · buyback {buybackCost(s, HUMAN)} Gold
          </span>
          {[...buybackWindow(s)].reverse().map((h, i) => {
            const mine = h.owner === HUMAN
            const reason = mine ? buybackBlockReason(s, HUMAN, h.cardId) : `${PLAYER_LABEL[h.owner]}'s hero`
            if (!mine) {
              return (
                <span key={`${h.cardId}-${i}`} className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-500" title={reason ?? undefined}>
                  {getHero(h.cardId).name}
                </span>
              )
            }
            return (
              <Button key={`${h.cardId}-${i}`} variant="outline" size="xs" disabled={!!reason} title={reason ?? undefined} onClick={() => onBuyback(h.cardId)}>
                {getHero(h.cardId).name}
              </Button>
            )
          })}
        </div>
      )}
    </div>
  )
}
