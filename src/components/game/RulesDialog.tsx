import { BookOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'

const STATUSES: Array<[string, string]> = [
  ['Stun', 'Skips both the Ultimate and the basic attack.'],
  ['Silence', 'Skips the Ultimate.'],
  ['Break', 'Turns the passive off.'],
  ['Disarm', 'Skips the basic attack.'],
  ['Slow', 'Basic attack moves to the end of Phase 2 (slowed units still follow attribute order and tiebreakers).'],
  ['Evade', 'Dodges the next incoming basic attack.'],
  ['Blind', 'Own basic attacks miss, unless the unit has Accuracy.'],
  ['Accuracy', 'Attacks cannot be evaded and ignore Blind.'],
  ['Pierce', 'Attacks ignore Shields and damage negation.'],
  ['Root', 'Cannot change lane or position (blocks drags like Meat Hook).'],
  ['Banish', 'Untargetable and invulnerable; in this prototype the hero also cannot act.'],
  ['Immunity', 'Blocks enemy Ultimate and item damage and their debuffs.'],
  ['Shield', 'Blocks one instance of attack damage.'],
  ['Invulnerable', 'Blocks all damage.'],
  ['Mute', 'Items cannot be played on the hero.'],
  ['Curse', 'Cannot heal.'],
  ['Taunt', 'Must attack the taunting hero (Berserker\'s Call).'],
  ['Invisible', 'Enemies cannot target the hero with attacks, towers, Ultimates or items. It can still attack.'],
  ['Haste', 'Attacks before everyone else in Phase 2, overriding Slow.'],
]

export function RulesDialog() {
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <BookOpen />
        Rules
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Dota: The Ancient's Duel — quick rules</DialogTitle>
          <DialogDescription>How this prototype plays. Rules marked “prototype” are placeholders to tune.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm leading-relaxed text-zinc-300">
          <Section title="Goal">
            Destroy the enemy Ancient (10 hits). Each lane has a Tier 1 tower (3 hits, deals 1 damage) and a Tier 2 tower
            (5 hits, deals 2 damage). Units only reach the Ancient through a lane whose two towers are down. Razing both
            towers in a lane gives +1 passive Gold per round. Fountain: at the start of each round, a side's heroes in a
            lane where that side has no towers left heal 1.
          </Section>
          <Section title="Round">
            <ol className="list-decimal space-y-0.5 pl-5">
              <li>Upkeep: +1 Gold, +1 XP (plus bonuses), fountain heal. Empty jungle camps draw from the jungle deck.</li>
              <li>
                Draw: both sides spend 1 Gold to take the top card of the one shared deck, or 1 Gold for an item from the
                shared item deck (hand limit 7). The hero deck is 160 cards shuffled together: all 127 heroes, 25 lane
                creeps and 8 siege creeps. You start with 5 cards from that deck. The item deck is 40 cards (20 items, two
                copies). The rune deck is 20 cards (10 runes, two copies).
                Buyback returns a slain hero from your grave to your hand for 2 Gold, or 3 if you have more towers standing
                than the enemy. Each hero can be bought back only once; the next time it dies, the card goes back into the
                shared deck.
              </li>
              <li>
                Assign: place up to 3 heroes (board limit 5) into lanes or jungles, and creep cards into lanes. Position 1
                defends first.
              </li>
              <li>Reveal: both sides flip.</li>
              <li>Item: play items, runes and tower cards — free, single use, and they resolve immediately.</li>
              <li>Ult: spend 1 XP to declare a living hero's Ultimate (single-use toggle in the header).</li>
              <li>Resolution: Ultimates (STR → INT → UNI → AGI), basic attacks (AGI → UNI → INT → STR → creeps, Slowed last), then tower aggro.</li>
              <li>
                Rotation: each side may move one hero to an adjacent zone along Top · Dire Jungle · Mid · Radiant Jungle ·
                Bot (Day: Radiant first, Night: Dire first). Rooted or stunned heroes stay. From a lane with no allied towers
                a hero may walk lane to lane (Top · Mid · Bot).
              </li>
              <li>
                Cleanup: wounds persist. A slain hero goes to its owner's grave the first time, or back into the shared deck
                if it was already bought back. Illusions vanish and round effects end.
              </li>
              <li>Income: +1 Gold per enemy hero killed, +1 XP per lane holding a living hero.</li>
            </ol>
          </Section>
          <Section title="Combat">
            Heroes take 2 hits: Healthy → Wounded (tilted) → slain. Basic attacks hit enemy Position 1; with no defenders left
            the attacker hits the lane's next structure. A basic attack against the attribute it counters (AGI → STR → INT →
            AGI) kills instantly — neutrals have attributes too. In Phase 3, every standing tower that took damage this round
            deals its damage (T1: 1, T2: 2) to the attacking side's Position 1.
          </Section>
          <Section title="Jungle, Roshan & Tormentor">
            Two jungles hold one camp each, drawn from a 15-card jungle deck: Golem (STR), Thunderhide (AGI), Ice Shaman (INT,
            Slow) and Dragon (UNI, Blind) ×3, one Roshan and two Tormentors. The side that arrived first holds the camp and
            chooses whether to hit the neutral or the contester; the contester must attack the holder (ties go to the
            jungle's owner). A neutral kill gives 1 XP, 1 Gold and a rune card. Roshan (UNI, 3 hits) hits every enemy in the
            camp, Roars while at full health, and never appears before round 4; he drops 3 XP and flips into the Aegis.
            The Tormentor (UNI, 2 hits plus a Shield that regenerates every round) never attacks, but its Reflection passive
            (Break turns it off) returns all damage to the attacker and the same amount to the other side's front line;
            Shields block reflected damage. It flips into a Refresher Shard. Boss rewards go to the killer even if every
            attacker dies; if contested they go to the sole survivor, otherwise to the jungle's owner.
          </Section>
          <Section title="Runes & tower cards">
            Twenty rune cards (two each): Bounty (+1 Gold), Regeneration, Double Damage, Shield, Arcane (next Ultimate is
            free), Illusion (1 HP decoy in front of a hero), Invisibility, Haste, Wisdom (+1 XP) and Water (cleanse). Under
            each side's T1 and T2 towers lie Glyph (your towers take no damage this round), Lotus (heal all your heroes) and
            Twin Gate (teleport all your heroes to one lane), shuffled; you may swap them within a tier in round 1. When a
            tower falls its owner gains 1 Gold and that card, which does not count toward the hand limit.
          </Section>
          <Section title="Status effects">
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
              {STATUSES.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="font-semibold text-zinc-100">{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </Section>
          <Section title="Tiebreakers">
            Safe lane, then Mid, Off lane, own jungle and enemy jungle (Radiant safe = Bottom, Dire safe = Top). Still
            tied? Odd rounds are Day (Radiant first), even rounds are Night (Dire first).
          </Section>
          <Section title="Not in the prototype yet">Map cards, hot-seat or online multiplayer.</Section>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-1 text-xs font-semibold tracking-wider text-zinc-100 uppercase">{title}</h3>
      <div>{children}</div>
    </section>
  )
}
