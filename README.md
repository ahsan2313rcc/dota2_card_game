# Dota: The Ancient's Duel

A browser prototype of a Dota 2–inspired lane-battle card game. You play Radiant against a simple Dire AI. Fight across three lanes and destroy the enemy Ancient.

Stack: React 19, TypeScript, Vite, Tailwind CSS v4, shadcn/ui (Base UI), Vitest.

## Run it

```bash
npm install
npm run dev        # http://localhost:5741
npm test           # engine tests, including simulated AI-vs-AI games
npm run build      # type-check + production build
npm run lint
```

## Project layout

```
src/
  game/              Pure TypeScript rules engine (no React)
    types.ts         State shape and constants (board/hand limits, tower HP)
    cards.ts         Hero and item card data (the starter set lives here)
    engine.ts        Round flow, damage model, ultimates, combat resolution
    ai.ts            Dire opponent heuristics
    useGame.ts       React reducer that wires the player and AI turns together
    engine.test.ts   Rule tests and full-game simulations
  components/game/   Board, lanes, cards, log, inspector, rules dialog
  components/ui/     shadcn/ui primitives
```

The engine is deterministic. Each action clones the state, and randomness comes from a seed stored in the state, so a game can be replayed and tested without the UI.

## Implemented rules

- **Round steps:** Upkeep, Draw (1 Gold per card), Assign (up to 3 heroes per round, 5 on the board), Reveal, Item, Ult (1 XP each), Resolution, Cleanup, Income.
- **Combat:** Ultimates resolve STR → INT → UNI → AGI. Basic attacks resolve AGI → UNI → INT → STR, then creeps. Towers fire last.
- **Counter loop:** AGI → INT → STR → AGI. A hero's basic attack on the attribute it counters kills instantly.
- **Tiebreakers:** Safe lane, then Mid, then Off lane. If still tied, Day (odd rounds) favors Radiant and Night (even rounds) favors Dire.
- **Structures:** T1 takes 3 hits and deals 1 damage. T2 takes 5 hits and deals 2 damage. The Ancient takes 10 hits and deals 0. Razing both towers in a lane gives +1 passive Gold per round.
- **Economy:** +1 Gold per enemy hero kill. +1 XP for each lane that holds a living hero at round end.
- **Single-use Ultimates:** on by default. Use the toggle in the header to switch it off.

### Prototype assumptions (easy to change)

- Each round, every lane gets one creep card per side from the shared creep deck (32 regular, 8 siege). Creeps line up behind the heroes and leave at cleanup.
- Basic attacks hit enemy Position 1. Once a lane has no defenders left, attackers hit the next structure in that lane (T1, then T2, then the Ancient).
- Tower aggro: in Phase 3, each standing tower that took damage this round deals 1 (T1) or 2 (T2) damage to the first unit (Position 1) of the side that damaged it. An undamaged tower does not fire.
- Slowed units attack after everyone else in Phase 2.
- If an Ultimate fizzles (caster stunned, silenced or dead, or the target is gone), its XP is refunded.
- Items are played during the Item step and resolve immediately. Equipment stays on the hero (1 per hero).

### Starter cards

- **Heroes (20):** Axe, Sven, Tidehunter, Pudge, Wraith King, Crystal Maiden, Lion, Zeus, Lina, Lich, Windranger, Abaddon, Bane, Venomancer, Viper, Phantom Assassin, Sniper, Juggernaut, Luna, Anti-Mage.
- **Items (7 types, 3 copies each):** Tango, Dagon, Blade Mail, Vanguard, Black King Bar, Desolator, Refresher Orb.

## Adding a card

1. Add the hero to `HEROES` in `src/game/cards.ts`. Pick an `ult.target` so the UI knows what to highlight.
2. Add its Ultimate to the `castUlt` switch in `src/game/engine.ts`. Passives hook into `dealDamage` (defensive), `singleAttack` / `attackTargets` (offensive), or `startRound` (economy).
3. Add a test in `engine.test.ts` for the new interaction.

## Not built yet

Jungle camps and neutral creeps, Roshan and Aegis, runes and map cards, neutral items, and hot-seat or online multiplayer.
