# Dota: The Ancient's Duel

A browser prototype of a Dota 2–inspired lane-battle card game. You play Radiant against a simple Dire AI on a board that mirrors the Dota 2 minimap: three lanes and two jungles, linked by a rotation path. The goal is to destroy the enemy Ancient.

Stack: React 19, TypeScript, Vite, Tailwind CSS v4, shadcn/ui (Base UI), Vitest.

## Run it

```bash
npm install
npm run dev        # http://localhost:5741
npm test           # engine tests, including simulated AI-vs-AI games
npm run sim        # balance report: AI-vs-AI games per comeback rule set (GAMES=1000 by default)
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
    simulate.test.ts Balance report behind `npm run sim`
  components/game/
    Minimap.tsx      Dota-style minimap board (towers, camps, rotation path, unit tokens)
    mapLayout.ts     Token coordinates for each lane, camp and structure
    UnitToken.tsx    Round hero portrait tokens, creep and neutral tokens
    Roster.tsx       "Your board" panel: reorder, return, ULT, camp target
    HandCard.tsx     Hero, item and creep cards in hand
    Inspector.tsx    Details and status chips for the selected unit
    TowerCards.tsx   Hidden Glyph / Lotus / Gate cards under your towers
  components/ui/     shadcn/ui primitives
```

The engine is deterministic. Each action clones the state, and randomness comes from a seed stored in the state, so a game can be replayed and tested without the UI.

## Implemented rules

- **Round steps:** Upkeep, Draw (1 Gold for the top card of the mixed hero-and-creep deck, or 1 Gold for an item; or Buyback), Assign (up to 3 heroes per round, 5 on the board), Reveal, Item, Ult (1 XP each), Resolution, Rotation, Cleanup, Income.
- **Starting hand:** 5 heroes, dealt out of the mixed deck before the rest is drawn.
- **Combat:** Ultimates resolve STR → INT → UNI → AGI. Basic attacks resolve AGI → UNI → INT → STR, then creeps. Slowed units attack after everyone else, in the same order. Towers fire last.
- **Counter loop:** AGI → INT → STR → AGI. A basic attack on the attribute it counters kills instantly. UNI sits outside the loop.
- **Tiebreakers:** Safe lane, Mid, Off lane, then jungle. If still tied, Day (odd rounds) favors Radiant and Night (even rounds) favors Dire.
- **Structures:** T1 takes 3 hits and deals 1 damage. T2 takes 5 hits and deals 2 damage. The Ancient takes 10 hits and deals 0. A tower fires only if it was damaged this round, and it hits Position 1 of the side that damaged it. Razing both towers in a lane gives +1 passive Gold per round.
- **Economy:** +1 Gold and +1 XP passive. +1 Gold per enemy hero kill. +1 XP for each lane that holds a living hero.
- **Comeback rules:** Slain heroes go to their owner's grave; Buyback returns one to hand for 2 Gold (3 if you have more towers standing than the enemy), once per hero. A second death puts that card back in the shared deck. Losing a tower gives +1 Gold and the face-down tower card under it (Glyph, Lotus or Twin Gate, one of each per tier, swappable within a tier in round 1); tower cards don't count toward the hand limit. Fountain: a side's heroes in a lane where it has no towers heal 1 at the start of the round. Costs live in `BUYBACK_COST` and each rule can be toggled via `Settings.rules` for simulations.
- **One shared unit deck:** both players draw from the same pile. It holds one copy of each of the 127 Dota heroes, 8 lane creeps and 2 siege creeps. Five heroes are dealt to each side first, and the rest is shuffled. Dead creeps, and heroes that have already been bought back, go to that deck's discard and reshuffle with both graves when it runs out.
- **Creep cards:** played into a lane. They stay until they die and line up behind heroes. Siege creeps hit structures for 2.
- **Items:** free to play, single use, and resolve immediately in the Item step. Shop items (including the Town Portal Scroll), runes, tower cards and the boss rewards (Aegis, Refresher Shard).
- **Runes:** 20 cards (2 each of Bounty, Regeneration, Double Damage, Shield, Arcane, Illusion, Invisibility, Haste, Wisdom, Water), dropped only by regular neutrals.
- **Jungle:** each jungle has one camp drawn from a 15-card jungle deck: 4 neutral types ×3 (2 HP, with an attribute), Roshan and 2 Tormentors. The side that arrived first holds the camp (ties go to the jungle's owner) and picks a target each round. A contesting hero must attack the holder. A neutral kill gives +1 XP, +1 Gold and a rune card.
- **Roshan:** 3 HP, never before round 4 (reshuffled and redrawn). Hits every enemy in the camp and Roars while at full HP. Dual card: the killer's side gets +3 XP and Roshan flips into the Aegis; it returns to the jungle deck once used.
- **Tormentor:** UNI, 2 HP, never attacks, Shield 1 that regenerates every round. Reflection (passive, Break stops it) returns damage to the attacker and the same amount to the other side's front line. Flips into a Refresher Shard.
- **Boss rewards:** go to the killing side even if every attacker died. If contested, they go to the sole surviving side, otherwise to the jungle's owner.
- **Rotation:** after combat, each side may move one hero to an adjacent zone (Top · Dire Jungle · Mid · Radiant Jungle · Bot). Day: Radiant moves first; Night: Dire first. Rooted or stunned heroes can't move. A hero in a lane with no allied towers may walk lane to lane.
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
- Heroes in the jungle don't earn lane XP.
- Invisibility also protects from enemy area damage. Glyph blocks tower damage, so those towers don't fire. Illusions vanish at Cleanup.

## Adding a card

1. Add the hero to `HEROES` in `src/game/cards.ts`. Pick an `ult.target` so the UI knows what to highlight.
2. Add its Ultimate to the `castUlt` switch in `src/game/engine.ts`. Passives hook into `dealDamage` (defensive), `singleAttack` / `attackTargets` (offensive), or `startRound` (economy). Check passives with `hasPassive` so Break works.
3. Add a test in `engine.test.ts` for the new interaction.

## Not built yet

Map cards, and hot-seat or online multiplayer.
