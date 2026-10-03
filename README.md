# Dota: The Ancient's Duel

A browser prototype of a Dota 2–inspired lane-battle card game. You play Radiant against a simple Dire AI on a board that mirrors the Dota 2 minimap: three lanes, two jungles and the Roshan pit. The goal is to destroy the enemy Ancient.

Stack: React 19, TypeScript, Vite, Tailwind CSS v4, shadcn/ui (Base UI), Vitest.

## Run it

```bash
npm install
npm run dev        # http://localhost:5741
npm test           # engine tests, including simulated AI-vs-AI games
npm run build      # type-check + production build
npm run lint
```

Debugging: open `http://localhost:5741/?autoplay=6&seed=12` and the AI plays both sides for 6 rounds with a fixed seed. You can then inspect the board at that point.

## Project layout

```
src/
  game/              Pure TypeScript rules engine (no React)
    types.ts         State shape, zones, statuses and constants
    cards.ts         Hero, item, creep and neutral card data
    engine.ts        Round flow, statuses, damage model, ultimates, jungle, combat
    ai.ts            Dire opponent heuristics
    useGame.ts       React reducer that wires the player and AI turns together
    engine.test.ts   Rule tests and full-game simulations
  components/game/
    Minimap.tsx      Dota-style minimap board (towers, camps, Roshan, unit tokens)
    mapLayout.ts     Token coordinates for each lane, camp and structure
    UnitToken.tsx    Round hero portrait tokens, creep and neutral tokens
    Roster.tsx       "Your board" panel: reorder, return, ULT, camp target
    HandCard.tsx     Hero, item and creep cards in hand
    Inspector.tsx    Details and status chips for the selected unit
  components/ui/     shadcn/ui primitives
```

The engine is deterministic. Each action clones the state, and randomness comes from a seed stored in the state, so a game can be replayed and tested without the UI.

## Implemented rules

- **Round steps:** Upkeep, Draw (1 Gold per card: hero, creep or item), Assign (up to 3 cards per round, 5 heroes on the board), Reveal, Item, Ult (1 XP each), Resolution, Cleanup, Income.
- **Starting hand:** heroes only.
- **Combat:** Ultimates resolve STR → INT → UNI → AGI. Basic attacks resolve AGI → UNI → INT → STR, then creeps. Slowed units attack after everyone else, in the same order. Towers fire last.
- **Counter loop:** AGI → INT → STR → AGI. A basic attack on the attribute it counters kills instantly. UNI sits outside the loop.
- **Tiebreakers:** Safe lane, Mid, Off lane, then jungle. If still tied, Day (odd rounds) favors Radiant and Night (even rounds) favors Dire.
- **Structures:** T1 takes 3 hits and deals 1 damage. T2 takes 5 hits and deals 2 damage. The Ancient takes 10 hits and deals 0. A tower fires only if it was damaged this round, and it hits Position 1 of the side that damaged it. Razing both towers in a lane gives +1 passive Gold per round.
- **Economy:** +1 Gold and +1 XP passive. +1 Gold per enemy hero kill. +1 XP for each lane that holds a living hero.
- **Creep cards:** drawn and played into a lane like heroes. They stay until they die and line up behind heroes. Siege creeps hit structures for 2.
- **Items:** free to play, single use, and resolve immediately in the Item step. Shop items, neutral items (dropped by jungle camps) and the Aegis.
- **Jungle:** each jungle has one neutral camp (Golem, Thunderhide, Ice Shaman or Dragon; 2 HP, has an attribute). The hero placed there first holds the camp and picks a target each round: the neutral or the enemy. A contesting hero must attack the holder. Killing a neutral gives +1 XP and a neutral item card. The camp respawns every round.
- **Roshan:** 3 HP. Hits every hero in the pit each round and uses Roar while at full HP. The killer's side gets +3 XP and the Aegis (the hero revives Healthy on death). Roshan respawns 3 rounds later.
- **Single-use Ultimates:** on by default. Use the toggle in the header to switch it off.

### Status effects

| Status | Effect |
| --- | --- |
| Stun | Skips both the Ultimate and the basic attack |
| Silence | Skips the Ultimate |
| Mute | Cannot be targeted by its own side's items |
| Break | Passive is ignored |
| Disarm | Skips the basic attack |
| Slow | Basic attack moves to the end of Phase 2 |
| Root | Cannot change lane or position |
| Blind | Basic attack misses unless the attacker has Accuracy |
| Evade | Dodges one incoming basic attack (Accuracy ignores it) |
| Shield | Blocks one instance of attack or tower damage (Pierce ignores it) |
| Immunity | Blocks enemy Ultimate and item damage and debuffs |
| Banish | Untargetable and invulnerable |
| Invulnerable | Blocks all damage |
| Curse | Cannot heal |
| Taunt | Enemies in the lane must attack this unit |

### Prototype assumptions (easy to change)

- Basic attacks hit enemy Position 1. Once a lane has no defenders left, attackers hit the next structure in that lane (T1, then T2, then the Ancient).
- If an Ultimate fizzles (caster stunned, silenced or dead, or the target is gone), its XP is refunded.
- Heroes in the jungle or Roshan pit don't earn lane XP.

## Adding a card

1. Add the hero to `HEROES` in `src/game/cards.ts`. Pick an `ult.target` so the UI knows what to highlight.
2. Add its Ultimate to the `castUlt` switch in `src/game/engine.ts`. Passives hook into `dealDamage` (defensive), `singleAttack` / `attackTargets` (offensive), or `startRound` (economy). Check passives with `hasPassive` so Break works.
3. Add a test in `engine.test.ts` for the new interaction.

## Not built yet

Runes and map cards, and hot-seat or online multiplayer.
