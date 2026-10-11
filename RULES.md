# Dota: The Ancient's Duel

Version 3. Card text on a hero, item, rune, or neutral is the specific effect. This document is the shared rulebook those cards sit on. Version 2.0 is the git tag `v2.0`.

You play Radiant. Dire is played by the opponent. Both sides take each step of the round.

## Goal

Destroy the enemy Ancient. The Ancient has 10 health and deals no damage.

Each lane has two towers in front of that Ancient:

| Structure | Health | Damage when it fires |
| --- | --- | --- |
| Tier 1 tower | 3 | 1 |
| Tier 2 tower | 5 | 1 to each of the first 3 units in the lane, creeps before heroes |
| Ancient | 10 | none |

Units only strike the Ancient through a lane whose Tier 1 and Tier 2 are both down. They hit Tier 1 first, then Tier 2, then the Ancient.

## The board

Three lanes and two jungles, in one chain:

**Top — Dire Jungle — Mid — Radiant Jungle — Bot**

Radiant's safe lane is Bot, then Mid, then Top. Dire's safe lane is Top, then Mid, then Bot. A lineup's front unit is Position 1.

## Decks and opening

One shared unit deck of 160 cards, shuffled: all 127 heroes, 25 lane creeps, and 8 siege creeps. Both players draw from it. Each side is dealt 5 cards. Spirit Bear is a summon, not a deck card.

One shared item deck of 60 shop cards. One shared rune deck of 20 cards: ten runes, two copies each.

The jungle deck has 15 cards: Stone Golem, Thunderhide, Ice Shaman, and Black Dragon, three each, plus one Roshan and two Tormentors.

Each side hides one Glyph, one Lotus Pool, and one Twin Gate under its Tier 1 towers, and the same three cards under its Tier 2 towers. During round 1, in Draw or Assign, a player may swap two hidden cards of the same tier.

Before the first decision, round 1 upkeep has already happened, so each side starts that decision with 1 Gold and 1 XP, and both camps have spawned.

## Hand, board, and placement

The hand holds up to 10 counting cards while you draw, and must be discarded down to 7 at the end of the turn. Runes, tower cards, and boss rewards do not use a slot and are not discarded for this. You choose which counting cards to pitch. A pitched hero or creep goes to the unit discard. It was not slain, so it cannot be bought back.

You may place up to 3 heroes per round, and have up to 5 heroes on the board. Creeps do not count toward either limit. During Assign you may return a unit you placed this round to your hand, and you may reorder a lineup. Rooted units cannot be reordered.

Heroes are assigned to a lane or to your own jungle. Creeps are assigned to lanes only. The enemy jungle is entered by rotation, not by playing a card into it.

## The round

1. **Upkeep.** Fountain, then income, then empty camps refill.
2. **Draw.** Spend Gold to draw, and buy any of the last 10 heroes back from the shared discard.
3. **Assign.** Place heroes and creeps. This round's placements stay hidden.
4. **Show.** Both sides flip together. Ward and Smoke from the previous round apply, then expire. Neither side sees what the other placed this round until this step.
5. **Combat.** Items, runes, tower cards, boss rewards, and abilities are interrupts. There is no item step and no ability step. Play one card, it resolves immediately, then the other side has 5 seconds to counter or pass. A side with nothing it can play passes on its own. A Draw step with no Gold left ends on its own. Odd rounds Radiant starts. Even rounds Dire starts. Two passes in a row resolve the next action, and the board names that action before you pass. Either side can interrupt again between swings. A tower shoots as soon as the swing that hit it resolves. Passives are already on.
6. **Rotation.** Each side may move up to 2 heroes. Radiant moves, then Dire.
7. **Cleanup.** End-of-round effects, poison, deaths, and status reset. Statuses last this turn unless a card says otherwise. Doom's Mute, Silence and Curse stay. Wraith King revives once. Necrophos blocks buyback.
8. **Income.** Hero-kill Gold and XP, and lane XP.
9. **Report.** Then the next round begins at Upkeep.

There is no day and night cycle. Basic attacks go Haste, then Agility, Universal, Intelligence, Strength, then creeps. Slow attacks last. Inside a bracket the order is safe lane, mid, off lane, own jungle, enemy jungle, then the unit closer to Position 1. If that is still a tie, both units attack at the same time. Abilities do not use the attribute order.

## Economy

Gold and XP are not reset between rounds. Whatever you do not spend is still there next round.

### Gold in

| Source | Amount | When |
| --- | --- | --- |
| Upkeep | 1, plus 1 for each enemy lane where both towers are down. Three open lanes pay 4. | Start of every round |
| Enemy hero killed by your unit | 1 per hero, and 1 XP | Income, after Cleanup. Creeps do not pay this. Tower kills do not pay this. |
| Neutral camp cleared | 1, plus a rune. No XP. | Immediately |
| Enemy tower destroyed | 3 for Tier 1, 5 for Tier 2, paid to the attacker. Turn Tower gold off and this is 0. The defender still takes the hidden card. | Immediately |
| Lane creep or siege creep killed | 1, paid to the killer. An illusion pays nothing. Alchemist's Greevil's Greed is still an extra 1 when a creep dies in his lane. | Immediately |
| Bounty Rune | 1 | When played |
| Bounty Hunter's attacks, Alchemist's creep deaths, and similar card text | as printed | When the card says |

### Gold out

| Sink | Cost |
| --- | --- |
| Draw the top card of the unit deck, or draw a shop card | 1 each, until you stop, run out of Gold, hit 10 counting cards, or empty that deck. Discard back to 7 at the end of the turn. |
| Play a shop card | 0, 1, or 2, printed on the card. Single use. Drawing the card is still 1. |
| Buyback | 4, or 5 if you have more towers standing than the enemy. Once per hero. Draw step only. The hero can belong to either side, as long as it is among the last 10 in the shared discard. |

Runes, tower cards, the Aegis, and the Refresher Shard cost no Gold.

There is no Gold cap. Drawing up to 10 counting cards is where extra Gold goes. At the report, discard down to 7.

### XP in

| Source | Amount | When |
| --- | --- | --- |
| Upkeep | 1 | Start of every round |
| Crystal Maiden on your board | +1 more at upkeep for each one | Upkeep |
| Lane held | 1 per lane that contains a living hero of yours | Income. Jungle heroes do not count. A lane with only creeps does not count. |
| Enemy hero killed by your unit | 1 per hero | Income, with the Gold |
| Wisdom Rune, Clarity, and card text | as printed | When played or when the card says |

Anti-Mage's attacks lower the opponent's XP by 1. XP does not go below 0.

### XP out

Active abilities. Each hero has one printed ability. A passive cannot be cast. An active ability costs its printed XP, 1, 2 or 3. That cost does not increase, and the ability can be cast once per turn. A Refresher Orb allows one more cast that turn. Items, runes, rewards, abilities, and a 3 XP Shield are interrupts: one action, then the other player has 5 seconds to counter or pass. A side with nothing it can play passes on its own. Odd rounds Radiant starts. Even rounds Dire starts. Two passes resolve the next swing. Spending 3 XP puts one Shield on an allied hero. It lasts until that Shield blocks a hit, and a hero cannot hold a second one.

If Keeper of the Light is in the lane and this hero is Position 1, the cost is 1 lower, to a minimum of 1. An Arcane Rune reduces one allied hero's cost by 1 XP, to a minimum of 0. A Refresher Shard makes that hero's ability cost 0. Refresher Orb lets the ability be played again later in the round as another interrupt, and that cast can choose a new target. If it is never played again, the same cast repeats when attacks begin.

A cast that fizzles refunds its XP. A cast fizzles when the caster is stunned, silenced, feared, banished, or dead, or the target is gone.

There is no XP cap.

## Buyback, towers, and the fountain

Every slain hero, from either side, goes into one shared discard. The most recent death is at the top. Buyback, during the Draw step, can take any hero from the last 10 in that pile, whether it was yours or the enemy's. It costs 4 Gold, or 5 if you have more towers standing than the enemy. The card comes to your hand. A hero can be bought back only once. A card that says it cannot be bought back stays in the pile and cannot be chosen. Older than the last 10, it waits there until the unit deck runs out and the pile is shuffled back in. Copies are removed and do not enter the discard. Creeps go to their own discard, not this pile.

When your tower falls, you gain that tower's face-down card. The attacker gains 3 Gold for a Tier 1 tower and 5 Gold for a Tier 2 tower. Turn Tower gold off and the attacker is paid nothing. The card does not use a hand slot. Killing a lane creep or a siege creep pays the killer 1 Gold.

At the end of the turn, your Ancient fully heals your own heroes in every lane where you have no towers left. It does not heal enemies in that lane, and it does not heal heroes in the jungle. Curse is still on the hero when this heal happens, so a Cursed hero does not heal. Poison and other delayed damage are applied after the heal. A lane that still has a tower is not healed. Other heals, such as a Salve or Lotus Pool, restore a hero to Healthy unless the hero is Cursed.

## Combat

A hero has 2 health: Healthy, then Wounded, then slain. Health persists from round to round. Lane creeps and siege creeps have 1 health. Creeps stay on the board until killed.

A basic attack deals 1 physical damage, plus Amplify, permanent attack, and card bonuses, minus Enfeeble, to a minimum of 0. It hits enemy Position 1. With no enemy left in the zone, a unit in a lane hits the next structure there. Siege creeps deal 2 to structures. Divine Rapier makes a hero's basic attacks kill enemy heroes. An ultimate hits the units named on its card. It damages a tower when the card names that tower, and that damage stops at the tower.

**Attribute counter.** Agility counters Strength, Strength counters Intelligence, Intelligence counters Agility. Universal is outside the loop. A basic attack against the countered attribute is lethal: it deals the target's current health. Neutrals have attributes and can be countered. The lethal hit is only a basic attack. Magical damage, tower damage, and physical damage from an ultimate do not counter.

**Order.** Hastened units attack first. Then Agility, Universal, Intelligence, Strength, then units with no attribute (creeps). Slowed units attack after everyone else, in that same order, unless they also have Haste. Ultimates resolve earlier: Strength, Intelligence, Universal, Agility. Ties use the lane and day/night priority above.

**Towers.** A standing tower fires as soon as the swing that hit it resolves, before the next swing. A tower destroyed by that hit does not fire. Glyph stops the damage and the tower still fires. A Tier 1 tower prefers a lane creep or siege creep in the attacking lineup, otherwise Position 1, and deals 1. A Tier 2 tower deals 1 to each of the first 3 units in the lane, with creeps taken before heroes. Each tower fires once per round.

**Physical and magical.** Physical damage is basic attacks, towers, reflected damage, and ultimate or item damage printed as physical. Magical damage is ultimates, passives, and items that are not printed as physical. Immunity blocks magical damage and debuffs from enemies. Damage a card deals to itself still lands. Ethereal blocks physical damage and takes 1 extra magical damage. Invulnerable blocks all damage except self-damage. Banish is untargetable and invulnerable.

**Stone Golem** is Immune to magical damage and has no Shield. Boulder, when 2 or more units are in the camp, deals 1 physical damage to each side's Position 1. **Roshan** ignores the first damage each round.

## Jungle

Each jungle holds one camp. A camp stays until it is killed. An empty camp refills at the next Upkeep.

The side that arrived first holds the camp. A tie goes to the owner of that jungle: Radiant Jungle to Radiant, Dire Jungle to Dire. The holder chooses, each round, whether its units attack the neutral or the enemy. A contesting unit must attack the holder.

Clearing a normal neutral pays 2 Gold, 2 XP, and one rune card to the killer's side.

A neutral ultimate (Boulder, Thunder Clap, Freezing Blast, Fire Pit, or Roshan's Roar) resolves only when 2 or more units are in that camp. The neutral itself does not count. A stunned neutral does not cast it.

**Roshan** is Universal, 3 health, and never attacks before round 4. If he would spawn earlier, he is shuffled back and another card is drawn. He hits every enemy in the camp. Roar, when the camp holds 2 or more units, Disarms them and deals 1 damage to each. His bounty is 3 Gold, 3 XP, a rune, and the Aegis.

**Tormentor** is Universal, 2 health, and never attacks. It gains 1 Shield at the start of resolution if it has none. Reflection returns the damage to the attacker and the same amount to the other side's Position 1 in that camp. A Shield blocks reflected damage. Break turns Reflection off. Its bounty is 2 Gold, 2 XP, a rune, and a Refresher Shard.

A boss reward goes to the side that fought it, even if every one of its heroes died. If both sides were present, it goes to the only side that still has a living hero in the camp. If both do, or neither does, it goes to the owner of that jungle.

## Rotation

After combat, each side may move up to 2 heroes, one step each. A hero moves at most once. The favored side takes both of its moves first. Skipping spends whatever moves are left.

The step follows the chain Top — Dire Jungle — Mid — Radiant Jungle — Bot. From a lane where you have no towers left, a hero may also step along the base: Top — Mid — Bot.

Rooted, stunned, feared, and banished heroes cannot move. Tinker and Nature's Prophet may teleport to any zone. Nature's Prophet gains 1 Shield when that teleport happens. That Shield comes from a passive, so it ends at Cleanup. A Town Portal Scroll, played in the Item step, moves one allied hero who is not Rooted to any lane.

## Statuses

Round statuses end at Cleanup. Health, permanent attack bonuses, the ultimate-cost counter, and a Shield that did not come from a passive remain. A passive Shield ends with the other statuses. Illusions vanish. Poison deals 1 damage at Cleanup before bodies are removed.

| Status | Effect |
| --- | --- |
| Stun | Skips the ultimate, the move, and the basic attack. The same lock applies to a neutral. |
| Silence | Skips the ultimate and turns the passive off. |
| Break | The passive is off. |
| Disarm | Skips the basic attack. |
| Slow | The basic attack waits until every unslowed unit has attacked. |
| Haste | Attacks before everyone else. |
| Evade | Dodges the next incoming basic attack. |
| Blind | Basic attacks miss, including a swing at a tower. |
| Accuracy | Attacks cannot be evaded and ignore Blind. |
| Pierce | The attack ignores Shield and damage negation. |
| Amplify | Basic attack damage +1. |
| Enfeeble | Basic attack damage −1. |
| Root | Cannot change zone or position. |
| Banish | Untargetable and invulnerable. |
| Invisible | Untargetable. The unit can still attack. |
| Reveal | The unit can be targeted again. A Banished unit can still be invulnerable. |
| Immunity | Blocks magical damage and debuffs from enemies. Self-damage still lands. |
| Ethereal | Blocks physical damage. Magical damage against it is increased by 1. |
| Shield | Blocks one instance of physical damage, then breaks. Pierce and Divine Rapier ignore it. Only one at a time. An Ultimate, item, rune, or 3 XP Shield lasts until it blocks a hit. A passive Shield ends at Cleanup. |
| Invulnerable | Blocks all damage except self-damage. |
| Mute | This side cannot play an item on that hero. |
| Curse | Cannot heal. |
| Taunt | Must attack the taunting unit. |
| Fear | Cannot cast, attack, or move. The passive still runs. |
| Hex | Set to 1 health. Attacks deal no damage. |
| Divine Rapier | Basic attacks kill enemy heroes. |
| Bloodthorn | Takes +1 physical damage from basic attacks, and the item also Silences. |

## Shop, runes, and tower cards

Shop cards cost Gold and are single use. Runes drop from normal neutral kills only. Boss cards flip into their reward and flip back into the jungle deck once the reward is used.

### Shop

| Card | Cost | Copies | Effect |
| --- | --- | --- | --- |
| Town Portal Scroll | 0 | 6 | Teleport an allied hero who is not Rooted to any lane. |
| Ward | 0 | 3 | Enemy heroes who enter this lane are face-up at the next Show. |
| Smoke | 0 | 2 | Allied heroes placed in this lane stay hidden at the next Show. |
| Dust | 0 | 2 | Mute every enemy hero in the lane. |
| Gem of True Sight | 0 | 2 | Reveal every enemy hero in a lane and remove Invisible. |
| Healing Salve | 0 | 4 | Heal an allied hero to Healthy. |
| Clarity | 0 | 3 | Gain 1 XP. |
| Gloves of Haste | 0 | 3 | An allied hero gains Haste. |
| Vanguard | 1 | 2 | Gain 1 Shield. It lasts until it blocks a hit. |
| Blade Mail | 1 | 2 | Reflect 1 physical damage back to the attacker. |
| Ghost Scepter | 1 | 2 | An allied hero becomes Ethereal. |
| Force Staff | 1 | 2 | Move an enemy hero to the back of their line. |
| Shadow Blade | 1 | 2 | An allied hero becomes Invisible. |
| Blink Dagger | 1 | 2 | An allied hero gains Haste and moves to Position 1. |
| Eul's Scepter | 1 | 2 | Banish an enemy hero. |
| Heaven's Halberd | 1 | 2 | Disarm an enemy hero. |
| Orchid Malevolence | 1 | 2 | Silence an enemy hero. |
| Desolator | 1 | 2 | An allied hero is Amplified. |
| Black King Bar | 2 | 1 | An allied hero becomes Immune, and current disable effects on them end. |
| Guardian Greaves | 2 | 1 | Heal all allied heroes in lanes. |
| Assault Cuirass | 2 | 1 | Haste all allied heroes in lanes. |
| Shiva's Guard | 2 | 1 | Slow all enemy heroes in a lane. |
| Refresher Orb | 2 | 1 | That hero's ultimate is cast twice, both times on the chosen target. |
| Satanic | 2 | 1 | An allied hero cannot die, and their basic attacks heal them. |
| Bloodthorn | 2 | 1 | Silence an enemy hero. They take +1 physical damage from attacks. |
| Scythe of Vyse | 2 | 1 | Hex an enemy hero. |
| Abyssal Blade | 2 | 1 | Stun an enemy hero. |
| Butterfly | 2 | 1 | An allied hero Evades the next attack. |
| Heart of Tarrasque | 2 | 1 | An allied hero heals at the end of the turn. |
| Eye of Skadi | 2 | 1 | An allied hero's basic attacks apply Slow and Curse. |
| Divine Rapier | 2 | 1 | An allied hero's basic attacks kill enemy heroes. |
| Dagon | 2 | 1 | Deal 2 magical damage to an enemy hero. |
| Monkey King Bar | 2 | 1 | Accuracy, and basic attacks deal +1 magical damage. |

### Runes

Two copies each. They cost nothing and do not use a hand slot.

| Rune | Effect |
| --- | --- |
| Bounty | Gain 1 Gold. |
| Regeneration | Heal an allied hero to Healthy. |
| Double Damage | +1 basic attack damage this round. |
| Shield | Gain 1 Shield. It lasts until it blocks a hit. |
| Arcane | Your next ultimate costs 0 XP. The following cast still costs more. |
| Illusion | A 1 health decoy with no attack steps in front of an allied hero. It vanishes at Cleanup. |
| Invisibility | An allied hero is untargetable by enemies this round. It can still attack. |
| Haste | An allied hero attacks first. |
| Wisdom | Gain 1 XP. |
| Water | Remove disables and poison from an allied hero. |

### Tower cards

Free, and they do not use a hand slot. You get one when that tower falls.

| Card | Effect |
| --- | --- |
| Glyph of Fortification | Your towers take no damage this round. A tower that was attacked still fires. |
| Lotus Pool | Heal all your heroes to Healthy. |
| Twin Gate | Teleport all your heroes who are not Rooted to one lane. |

### Boss rewards

| Reward | Effect |
| --- | --- |
| Aegis of the Immortal | If that hero is slain this round, it revives Healthy. Then Roshan returns to the jungle deck. |
| Refresher Shard | That hero's next ultimate costs 1 XP again. Then the Tormentor returns to the jungle deck. |

## Heroes

Every deck hero has an attribute, a melee or ranged attack, a passive, and an ultimate. The words on the card are the effect. Passives do not work while the hero is Broken or dead.

An ultimate is aimed at the caster's own lane or zone unless the card names another lane, any zone, an adjacent zone, or the whole board. A hero can cast every round while it is in play. The XP cost climbs with each successful cast of that deployment, as described under Economy.

## Neutrals

| Camp | Attribute | Health | Attack |
| --- | --- | --- | --- |
| Stone Golem | Strength | 2 | Immune. No Shield. Hits Position 1. Boulder deals 1 physical damage to each Position 1 when 2 or more units are in the camp. |
| Thunderhide | Agility | 2 | Haste. Hits every enemy hero and applies Slow. Thunder Clap needs 2 units in the camp. |
| Ice Shaman | Intelligence | 2 | Silences the camp. Hits each Position 1 and Silences them. Freezing Blast needs 2 units in the camp. |
| Black Dragon | Universal | 2 | Accuracy. Hits every unit in the camp. Fire Pit needs 2 units in the camp. |
| Roshan | Universal | 3 | Ignores the first damage each round. Hits every enemy. Roar needs 2 units in the camp. |
| Tormentor | Universal | 2 | Does not attack. Shield and Reflection, as above. |

## What this prototype does not include

Map cards, hot-seat play, and online multiplayer.
