import { useEffect, useMemo, useState } from 'react'
import { Coins, Footprints, RotateCcw, ScrollText, Skull, Swords, Trophy } from 'lucide-react'
import { toast } from 'sonner'
import { CombatLog, LogLines } from '@/components/game/CombatLog'
import { HandCard } from '@/components/game/HandCard'
import { Inspector } from '@/components/game/Inspector'
import { Minimap, type MapInteraction } from '@/components/game/Minimap'
import { PhaseTracker } from '@/components/game/PhaseTracker'
import { PlayerBar } from '@/components/game/PlayerBar'
import { Roster } from '@/components/game/Roster'
import { OpponentSelect, opponentLabel } from '@/components/game/OpponentSelect'
import { RulesDialog } from '@/components/game/RulesDialog'
import { TowerCards } from '@/components/game/TowerCards'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Toaster } from '@/components/ui/sonner'
import { getHero, getItem } from '@/game/cards'
import {
  PLAYER_LABEL,
  ZONE_LABEL,
  buybackBlockReason,
  buybackCost,
  buybackWindow,
  canInterrupt,
  canSpendGold,
  countsTowardHand,
  discardBlockReason,
  drawBlockReason,
  excessHand,
  handCount,
  itemBlockReason,
  itemLanes,
  itemTargets,
  nextCombatAction,
  rotationTargets,
  shieldBlockReason,
  assignableZones,
  placeBlockReason,
  ultBlockReason,
  ultNeedsTarget,
  ultTargets,
  ultZones,
  type DrawType,
} from '@/game/engine'
import { HUMAN, useGame } from '@/game/useGame'
import { BUYBACK_WINDOW, DRAW_CAP, HAND_LIMIT, LANES, PLACE_PER_ROUND, ROTATIONS_PER_ROUND, isLane, type GameState, type HandCard as HandCardT, type Unit, type ZoneId } from '@/game/types'

const INTERRUPT_MS = 5000

export default function App() {
  const [s, dispatch] = useGame()
  const [selectedHand, setSelectedHand] = useState<string | null>(null)
  const [ultCaster, setUltCaster] = useState<string | null>(null)
  const [tpHero, setTpHero] = useState<string | null>(null)
  const [rotator, setRotator] = useState<string | null>(null)
  const [inspected, setInspected] = useState<string>()
  const [reportOpen, setReportOpen] = useState(false)
  const stepKey = `${s.round}:${s.phase}`
  const aimKey = `${s.round}:${s.phase}:${s.priority}:${s.passes}:${s.log.length}`
  const [lastStepKey, setLastStepKey] = useState(stepKey)
  const [lastAimKey, setLastAimKey] = useState(aimKey)
  if (stepKey !== lastStepKey) {
    setLastStepKey(stepKey)
    setSelectedHand(null)
    setUltCaster(null)
    setTpHero(null)
    setRotator(null)
    setReportOpen((s.phase === 'report' && excessHand(s.players[HUMAN]) === 0) || s.phase === 'gameover')
  }
  if (aimKey !== lastAimKey) {
    setLastAimKey(aimKey)
    setSelectedHand(null)
    setUltCaster(null)
    setTpHero(null)
    setRotator(null)
  }

  const yourReply = s.phase === 'response' && s.priority === HUMAN && s.reply && !s.winner && canInterrupt(s, HUMAN)
  const nothingToPlay = s.phase === 'response' && s.priority === HUMAN && !s.winner && !canInterrupt(s, HUMAN)
  const nothingToBuy = s.phase === 'draw' && !s.winner && !canSpendGold(s, HUMAN)
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)
  const flowKey = `${s.round}:${s.phase}:${s.priority}:${s.reply}:${s.passes}:${s.log.length}:${yourReply}:${nothingToPlay}:${nothingToBuy}`
  useEffect(() => {
    if (nothingToBuy) {
      const id = window.setTimeout(() => dispatch({ type: 'endDraw' }), 0)
      return () => window.clearTimeout(id)
    }
    if (nothingToPlay) {
      const id = window.setTimeout(() => dispatch({ type: 'pass' }), 0)
      return () => window.clearTimeout(id)
    }
    if (!yourReply) {
      setSecondsLeft(null)
      return
    }
    const started = Date.now()
    setSecondsLeft(5)
    const tick = window.setInterval(() => {
      const left = INTERRUPT_MS - (Date.now() - started)
      setSecondsLeft(Math.max(1, Math.ceil(left / 1000)))
    }, 200)
    const done = window.setTimeout(() => dispatch({ type: 'pass' }), INTERRUPT_MS)
    return () => {
      window.clearInterval(tick)
      window.clearTimeout(done)
    }
  }, [flowKey, dispatch, nothingToBuy, nothingToPlay, yourReply])

  const me = s.players[HUMAN]
  const selectedCard = me.hand.find((c) => c.iid === selectedHand)
  const selectedItem = selectedCard?.type === 'item' ? getItem(selectedCard.cardId) : undefined

  const targetable = useMemo(() => {
    if (s.phase === 'response' && selectedCard?.type === 'item' && !tpHero) return new Set(itemTargets(s, HUMAN, selectedCard.cardId))
    if (s.phase === 'response' && ultCaster) return new Set(ultTargets(s, ultCaster))
    if (s.phase === 'rotate' && !rotator) {
      return new Set(Object.values(s.units).filter((u) => u.owner === HUMAN && rotationTargets(s, u.uid).length).map((u) => u.uid))
    }
    return new Set<string>()
  }, [s, selectedCard, ultCaster, tpHero, rotator])

  const inspectedUnit = inspected ? s.units[inspected] : undefined

  function onHandClick(card: HandCardT) {
    if (s.phase === 'report') {
      const r = discardBlockReason(s, HUMAN, card.iid)
      if (r) return toast.error(r)
      dispatch({ type: 'discard', handIid: card.iid })
      return
    }
    if (selectedHand === card.iid) return setSelectedHand(null)
    if (s.phase === 'assign' && card.type === 'hero') {
      const r = placeBlockReason(s, HUMAN)
      if (r) return toast.error(r)
      return setSelectedHand(card.iid)
    }
    if (s.phase === 'assign' && card.type === 'creep') return setSelectedHand(card.iid)
    if (s.phase === 'response' && s.priority === HUMAN && card.type === 'item') {
      setTpHero(null)
      const r = itemBlockReason(s, HUMAN, card)
      if (r) return toast.error(`${getItem(card.cardId).name}: ${r}`)
      if (getItem(card.cardId).target === 'none') {
        dispatch({ type: 'playItem', handIid: card.iid })
        return
      }
      return setSelectedHand(card.iid)
    }
    if (card.type === 'item') toast.message(s.phase === 'response' ? 'Wait for priority.' : 'Items are interrupts once both sides have shown.')
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

  function onShield(u: Unit) {
    const r = shieldBlockReason(s, HUMAN, u.uid)
    if (r) return toast.error(r)
    dispatch({ type: 'buyShield', uid: u.uid })
  }

  function onUlt(u: Unit) {
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
  } else if (s.phase === 'response' && selectedCard && selectedItem) {
    if (selectedItem.target === 'lane') dropZones = itemLanes(s, HUMAN, selectedCard.cardId)
    else if (selectedItem.target === 'allyHeroToLane' && tpHero) dropZones = itemLanes(s, HUMAN, selectedCard.cardId, tpHero)
    dropLabel = 'Teleport to'
  } else if (s.phase === 'rotate' && rotator) {
    dropZones = rotationTargets(s, rotator)
    dropLabel = 'Rotate to'
  } else if (s.phase === 'response' && ultCaster && ultZones(s, ultCaster).length) {
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
      if (s.phase === 'response' && ultCaster) {
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
      if (s.phase === 'response') {
        if (isLane(zone)) dispatch({ type: 'playItem', handIid: selectedCard.iid, target: tpHero ?? undefined, lane: zone })
        setTpHero(null)
      } else {
        dispatch({ type: 'place', handIid: selectedCard.iid, zone })
      }
      setSelectedHand(null)
    },
  }

  const roundEntries = s.log.filter((e) => e.round === s.round)
  const resolutionStart = roundEntries.findIndex((e) => e.text.startsWith('Interrupts') || e.text.startsWith('Phase 2'))
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
            <span className="text-zinc-400" title="Both players draw from this shop deck. 60 cards. Drawing one costs 1 Gold. Playing one costs 0, 1, or 2 Gold. Runes and tower cards stay free.">
              Items {s.itemDeck.length}
            </span>
            <span className="text-zinc-400" title="Both players draw runes from this deck. 10 runes, two copies each.">
              Runes {s.runeDeck.length}
            </span>
            <span className="text-zinc-500" title="Version 3. Items, runes, rewards, and abilities are interrupts. After a card, the other side has 5 seconds to counter or pass. A side with nothing to play passes on its own. Odd rounds Radiant plays first; even rounds Dire plays first.">
              v3
            </span>
          </div>
          <PhaseTracker phase={s.phase} />
          <div className="ml-auto flex flex-wrap items-center gap-3">
            <OpponentSelect value={s.settings.direStyle} onChange={(direStyle) => dispatch({ type: 'settings', settings: { direStyle } })} />
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
          <PlayerBar s={s} player="dire" subtitle={`AI · ${opponentLabel(s.settings.direStyle)}`} />
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
            secondsLeft={secondsLeft}
            onAdvance={() => {
              if (s.phase === 'draw') dispatch({ type: 'endDraw' })
              else if (s.phase === 'assign') dispatch({ type: 'endAssign' })
              else if (s.phase === 'response') dispatch({ type: 'pass' })
              else if (s.phase === 'rotate') dispatch({ type: 'endRotate' })
              else if (s.phase === 'report') dispatch({ type: 'nextRound' })
              else dispatch({ type: 'new' })
            }}
            onShowReport={() => setReportOpen(true)}
          />

          <section>
            <h2 className={`mb-2 text-xs font-semibold tracking-wider uppercase ${excessHand(me) > 0 ? 'text-amber-300' : 'text-zinc-400'}`}>
              Your hand ({handCount(me)}/{HAND_LIMIT}
              {excessHand(me) > 0 ? ` — discard ${excessHand(me)}` : ''}
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
                    highlight={s.phase === 'report' && excessHand(me) > 0 && countsTowardHand(c)}
                    disabledReason={
                      s.phase === 'report'
                        ? discardBlockReason(s, HUMAN, c.iid)
                        : s.phase === 'response' && s.priority === HUMAN && c.type === 'item'
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
                  onShield,
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
                : excessHand(me) > 0
                  ? `Discard ${excessHand(me)} card${excessHand(me) === 1 ? '' : 's'} from your hand before the next round. Close this report and click a card.`
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
              <Button disabled={excessHand(me) > 0} onClick={() => dispatch({ type: 'nextRound' })}>
                {excessHand(me) > 0 ? `Discard ${excessHand(me)}` : `Start round ${s.round + 1}`}
              </Button>
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

function passConsequence(s: GameState): string {
  const pending = nextCombatAction(s)
  const you = s.priority === HUMAN
  if (s.passes === 0) {
    return `If ${you ? 'you pass' : 'Dire passes'}, ${you ? 'Dire still gets' : 'you still get'} a turn. Once both sides pass: ${pending}`
  }
  return `If ${you ? 'you pass' : 'Dire passes'}: ${pending}`
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
  secondsLeft,
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
  secondsLeft: number | null
}) {
  const me = s.players[HUMAN]
  let title = ''
  let hint = ''
  let cta = ''
  switch (s.phase) {
    case 'draw':
      title = 'Draw'
      hint = `Spend 1 Gold to draw, up to ${DRAW_CAP} counting cards. Discard back to ${HAND_LIMIT} at the end of the turn. Runes and reward cards do not count. Buyback is ${buybackCost(s, HUMAN)} Gold for any of the last ${BUYBACK_WINDOW} discarded heroes.`
      cta = 'Done drawing'
      break
    case 'assign':
      title = 'Assign'
      hint = selectedCard
        ? `Click a green + on the map to place ${selectedCard.type === 'hero' ? getHero(selectedCard.cardId).name : 'the creep'}${selectedCard.type === 'creep' ? ' (lanes only)' : ' (lanes or your own jungle)'}.`
        : `Select a hero or creep card, then a green + on the map. Heroes go to a lane or your jungle. Creeps go to lanes. Heroes ${me.placedThisRound}/${PLACE_PER_ROUND} this round. Dire assigns at the same time, and those heroes stay hidden until Show.`
      cta = 'Lock in & show'
      break
    case 'response':
      title = s.priority === HUMAN ? 'Your interrupt' : 'Dire has priority'
      hint = ultCaster
        ? ultZones(s, ultCaster).length
          ? `Click a green + for ${getHero(s.units[ultCaster].cardId!).ult.name}. It resolves now.`
          : `Choose a highlighted target for ${getHero(s.units[ultCaster].cardId!).ult.name}. It resolves now.`
        : selectedCard?.type === 'item'
          ? getItem(selectedCard.cardId).target === 'lane'
            ? `Click a green + to choose the lane for ${getItem(selectedCard.cardId).name}.`
            : getItem(selectedCard.cardId).target === 'allyHeroToLane'
              ? tpHero
                ? `Click a green + to teleport ${getHero(s.units[tpHero].cardId!).name}.`
                : 'Choose a highlighted hero to teleport.'
              : `Choose a highlighted target for ${getItem(selectedCard.cardId).name}.`
          : secondsLeft !== null
            ? `Dire played a card. ${secondsLeft}s to counter with an item, rune, ability, or Shield, or to pass.`
            : s.priority === HUMAN
              ? `Play one item, rune, reward, ability, or a 3 XP Shield. It resolves immediately, then Dire answers. ${s.round % 2 === 1 ? 'You start odd rounds.' : 'Dire starts even rounds.'} A Shield lasts until it blocks a hit and does not stack.`
              : 'Dire is answering.'
      cta = secondsLeft !== null ? `Pass · ${secondsLeft}s` : 'Pass'
      break
    case 'rotate': {
      title = 'Rotation'
      hint = rotator
        ? `Click a green + to move ${getHero(s.units[rotator].cardId!).name} from ${ZONE_LABEL[s.units[rotator].zone]}.`
        : `Move up to ${ROTATIONS_PER_ROUND} heroes (${ROTATIONS_PER_ROUND - me.rotationsUsed} left) along Top · Dire Jungle · Mid · Radiant Jungle · Bot. You move, then Dire. Each hero moves once. Heroes in a lane with no allied towers can walk lane to lane.`
      cta = me.rotationsUsed > 0 ? 'Done rotating' : 'Skip rotation'
      break
    }
    case 'report': {
      const excess = excessHand(me)
      title = excess > 0 ? 'Discard down to 7' : 'Round complete'
      hint = excess > 0
        ? `Click ${excess} highlighted card${excess === 1 ? '' : 's'} in your hand. Runes and tower cards stay. Then start the next round.`
        : 'Review the battle log, then start the next round.'
      cta = excess > 0 ? `Discard ${excess}` : `Start round ${s.round + 1}`
      break
    }
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
        {s.phase === 'response' && <div className="mt-1 text-xs font-medium text-amber-100">{passConsequence(s)}</div>}
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
        <Button size="sm" disabled={(s.phase === 'report' && excessHand(me) > 0) || (s.phase === 'response' && s.priority !== HUMAN)} onClick={onAdvance} className="bg-amber-400 text-zinc-950 hover:bg-amber-300">
          {s.phase === 'response' ? <Swords /> : null}
          {cta}
        </Button>
      </div>
      {s.phase === 'draw' && s.heroDiscard.length > 0 && (
        <div className="flex basis-full flex-wrap items-center gap-2 border-t border-amber-500/10 pt-2 sm:order-last">
          <span className="flex items-center gap-1 text-xs text-zinc-400">
            <Skull className="size-3.5" /> Last {Math.min(BUYBACK_WINDOW, s.heroDiscard.length)} discarded · buyback {buybackCost(s, HUMAN)} Gold
          </span>
          {[...buybackWindow(s)].reverse().map((h, i) => {
            const reason = buybackBlockReason(s, HUMAN, h.cardId)
            return (
              <Button
                key={`${h.cardId}-${i}`}
                variant="outline"
                size="xs"
                disabled={!!reason}
                title={reason ?? `${PLAYER_LABEL[h.owner]}'s hero`}
                onClick={() => onBuyback(h.cardId)}
              >
                {getHero(h.cardId).name}
              </Button>
            )
          })}
        </div>
      )}
    </div>
  )
}
