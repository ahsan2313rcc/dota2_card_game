# Dota: The Ancient's Duel

A browser prototype of a Dota 2–inspired lane-battle card game. You play Radiant against a simple Dire AI on a board that mirrors the Dota 2 minimap: three lanes and two jungles, linked by a rotation path. The goal is to destroy the enemy Ancient.

Stack: React 19, TypeScript, Vite, Tailwind CSS v4, shadcn/ui (Base UI), Vitest.

## Run it

```bash
npm install
npm run dev        # http://localhost:5741
npm test           # engine tests, including simulated AI-vs-AI games
npm run sim        # balance report: AI-vs-AI games per comeback rule set (GAMES=1000 by default)
python3 -m sim     # Python viability sim, version 3 economy (python3 -m sim --games 200)
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

- **Version 3.** Version 2.0 is the git tag `v2.0`.
- **Round steps:** Upkeep (+1 Gold, +1 XP, and +1 Gold for each enemy lane with both towers down), Draw (1 Gold, up to 10 counting cards, discard to 7 at end of turn; or Buyback), Assign, Reveal, Combat. Items, runes, rewards, and abilities are interrupts: one at a time, resolving immediately. Odd rounds Radiant plays first, even rounds Dire. Two passes resolve the next swing, and either side can interrupt between swings and after the towers fire. Then Rotation, Cleanup, Income.
- **Starting hand:** 5 cards dealt from the top of the shared deck.
- **Combat:** Basic attacks resolve Haste, then AGI → UNI → INT → STR, then creeps. Slowed units attack last. A true tie means both attacks happen together. There is no day/night cycle and no attribute instakill.
- **Abilities:** Each of the 127 heroes has one ability, passive or active. Active abilities cost their printed 1, 2 or 3 XP.
- **Structures:** T1 takes 3 hits and deals 1 damage. T2 takes 5 hits and deals 2 damage. The Ancient takes 10 hits and deals 0. A tower fires only if it was damaged this round, and it hits a creep in the attacking line if one is there, otherwise Position 1. Razing both towers in a lane gives +1 passive Gold per round.
- **Economy:** +1 Gold and +1 XP at upkeep. +1 Gold and +1 XP per enemy hero kill. +1 XP for each lane that holds a living hero. A neutral kill pays 1 Gold and a rune. Destroying a tower pays the attacker 3 or 5 Gold.
- **Comeback rules:** Slain heroes from both sides go into one shared discard. Buyback returns any of the last 10 heroes in that pile, from either side, for 4 Gold (5 if you have more towers standing than the enemy), once per hero. Losing a tower gives the face-down tower card under it and no Gold (Glyph, Lotus or Twin Gate, one of each per tier, swappable within a tier in round 1); tower cards don't count toward the hand limit. Fountain: a side's heroes in a lane where it has no towers heal 1 at the start of the round. Costs live in `BUYBACK_COST` and each rule can be toggled via `Settings.rules` for simulations.
- **One shared unit deck:** both players draw from the same pile. 127 heroes, 25 lane creeps and 8 siege creeps are shuffled together (160). Five cards are dealt to each side from the top. Dead creeps go to the creep discard. Dead heroes go to the shared hero discard. Both piles shuffle back into the deck when it runs out.
- **Shared item deck:** 60 shop cards. Playing one costs 1, 2, or 3 Gold. **Shared rune deck:** 20 cards, two copies of each of 10 runes, still free.
- **Creep cards:** 25 lane creeps and 8 siege creeps, both Universal. Lane creeps are melee; enemy towers shoot a creep before any hero. Siege creeps are ranged and deal +1 attack damage to enemy towers.
- **Damage:** physical damage is basic attacks and towers. Magical damage is ultimates, passives and items. Immunity blocks magical damage and debuffs. Ethereal blocks physical attack damage and takes +1 magical damage.
- **Items:** shop cards cost their printed Gold, are single use, and resolve immediately in the Item step. Runes, tower cards and the boss rewards (Aegis, Refresher Shard) stay free. Refresher Orb casts the chosen Ultimate a second time on the same target. Refresher Shard still resets that hero's Ultimate cost to 1 XP.
- **Runes:** 20 cards (2 each of Bounty, Regeneration, Double Damage, Shield, Arcane, Illusion, Invisibility, Haste, Wisdom, Water), dropped only by regular neutrals. A rune does not count toward the hand limit.
- **Jungle:** each jungle has one camp drawn from a 15-card jungle deck: 4 neutral types ×3 (2 HP, with an attribute), Roshan and 2 Tormentors. The side that arrived first holds the camp (ties go to the jungle's owner) and picks a target each round. A contesting hero must attack the holder. A neutral kill gives +1 XP, +1 Gold and a rune card.
- **Roshan:** 3 HP, never before round 4 (reshuffled and redrawn). Hits every enemy in the camp and Roars while at full HP. Dual card: the killer's side gets +3 XP and Roshan flips into the Aegis; it returns to the jungle deck once used.
- **Tormentor:** UNI, 2 HP, never attacks, Shield 1 that regenerates every round. Reflection (passive, Break stops it) returns damage to the attacker and the same amount to the other side's front line. Flips into a Refresher Shard.
- **Boss rewards:** go to the killing side even if every attacker died. If contested, they go to the sole surviving side, otherwise to the jungle's owner.
- **Assign:** heroes go to a lane or your own jungle. Creeps go to lanes. The enemy jungle is reached by rotation, not by playing a card straight into it.
- **Rotation:** after combat, each side may move up to 2 heroes, one step each, along Top · Dire Jungle · Mid · Radiant Jungle · Bot. Day: Radiant moves first; Night: Dire first. Dawnbreaker, Night Stalker and Luna can force the clock for that round. Rooted, stunned, feared or banished heroes can't move. A hero in a lane with no allied towers may walk lane to lane. Tinker and Nature's Prophet may teleport to any zone.

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
| Shield | Blocks one instance of physical damage, then breaks (Pierce ignores it). One at a time. Lasts until it blocks a hit, unless a passive granted it |
| Immunity | Blocks magical damage and debuffs |
| Ethereal | Blocks physical attack damage and takes +1 magical damage |
| Banish | Untargetable and invulnerable |
| Invulnerable | Blocks all damage |
| Invisible | Untargetable. Reveal removes it |
| Curse | Cannot heal |
| Fear | Cannot cast, attack, or move. The passive still runs |
| Hex | Becomes a 1 HP decoy with no attack |
| Amplify | Attack damage +1 |
| Enfeeble | Attack damage −1 |
| Taunt | Must attack the taunting unit |
| Haste | Attacks before everyone else |

### Prototype assumptions (easy to change)

- Basic attacks hit enemy Position 1. Once a lane has no defenders left, attackers hit the next structure in that lane (T1, then T2, then the Ancient).
- If an Ultimate fizzles (caster stunned, silenced or dead, or the target is gone), its XP is refunded.
- Heroes in the jungle don't earn lane XP.
- Invisibility also protects from enemy area damage. Glyph blocks tower damage, so those towers don't fire. Illusions vanish at Cleanup.

## Adding a card

1. Add a row to `src/game/roster.ts`. The last three fields are the target, passive tags, and ultimate lines. `ult.target` is what the UI highlights.
2. Passive tags and ultimate lines are interpreted in `src/game/kit.ts`. Break skips every tag.
3. Add a test in `engine.test.ts` for the new interaction.

## Not built yet

Map cards, and hot-seat or online multiplayer.
