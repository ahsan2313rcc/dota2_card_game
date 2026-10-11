import { BookOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'

const STATUSES: Array<[string, string]> = [
  ['Stun', 'Cannot cast, attack, or move.'],
  ['Silence', 'Cannot cast an ability, and the passive is off.'],
  ['Disarm', 'Cannot attack.'],
  ['Slow', 'Attacks last.'],
  ['Haste', 'Attacks first, ahead of the attribute order.'],
  ['Evade', 'Dodges the next incoming attack.'],
  ['Immune', 'Blocks magical damage and debuffs.'],
  ['Ethereal', 'Blocks attack damage and takes +1 magical damage.'],
  ['Shield', 'Blocks one physical hit. A Shield bought for 3 XP lasts until it blocks that hit. Only one Shield at a time.'],
  ['Invulnerable', 'Blocks all damage.'],
  ['Banish', 'Untargetable and invulnerable.'],
  ['Invisible', 'Untargetable until Revealed.'],
  ['Mute', 'Cannot use items.'],
  ['Curse', 'Cannot heal.'],
  ['Taunt', 'Must attack the taunting unit and cannot cast or use items.'],
  ['Amplify', 'Attack +1.'],
  ['Hex', 'Becomes a 1 HP decoy with no attack.'],
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
            Destroy the enemy Ancient (10 hits). Each lane has a Tier 1 tower (3 hits, deals 1, worth 3 Gold) and a Tier 2
            tower (5 hits, deals 1 to the first 3 units, creeps first, worth 5 Gold). The attacker is paid. The defender still
            takes the hidden card. Each lane with both towers down adds +1 Gold to upkeep, so three open lanes pay 4 Gold
            (1 + 3). At the end of the turn your Ancient fully heals your own heroes in a lane where your towers are gone.
            Enemies in that lane are not healed. Curse blocks the heal, and poison lands after it.
          </Section>
          <Section title="Round">
            <ol className="list-decimal space-y-0.5 pl-5">
              <li>Upkeep: +1 Gold, +1 XP (plus bonuses). Empty jungle camps draw from the jungle deck.</li>
              <li>
                Draw: both sides spend 1 Gold to take the top card of the one shared deck, or 1 Gold for an item from the
                shared item deck. You may draw up to 10 counting cards. At the end of the turn, discard counting cards until 7 remain.
                Runes and tower cards do not count and are not discarded for this. The hero deck is 160 cards shuffled
                together: all 127 heroes, 25 lane creeps and 8 siege creeps. You start with 5 cards from that deck. The
                item deck is 60 shop cards. Playing one costs 1, 2, or 3 Gold. Gem of True Sight costs 1 Gold and reveals
                every enemy hero in a lane. The rune deck is 20 cards (10 runes, two
                copies). Runes are free and do not count toward the hand limit.
                Dead heroes from both sides go into one shared discard. Buyback returns any hero from the last 10 in that
                pile, whoever it belonged to, for 4 Gold, or 5 if you have more towers standing than the enemy. Each hero
                can be bought back only once.
              </li>
              <li>
                Assign: place up to 3 heroes (board limit 5) into lanes or your own jungle, and creep cards into lanes. The enemy jungle is not an assign target. Position 1
                defends first.
              </li>
              <li>Reveal: both sides flip.</li>
              <li>
                Combat is one window, not an item step and an ability step. Items, runes, tower cards, boss rewards,
                abilities, and a 3 XP Shield are interrupts. Play one and it resolves immediately. The other side then has 5 seconds
                to counter with a card or pass. A side with nothing it can play passes on its own, and a Draw step with no Gold
                left ends on its own. Odd rounds Radiant starts. Even rounds Dire starts. Two passes in a row resolve the next
                action, and the bar names that action before you pass. You can interrupt again between swings and after the towers fire.
              </li>
              <li>
                Abilities: each hero has one printed ability. Passives are always on. An active ability costs its printed XP
                (1, 2 or 3) and that cost does not increase. It can be cast once per turn. A Refresher Orb allows a second
                cast that turn, and that cast can pick a new target. Keeper of the Light reduces an ally's cost by 1, to a
                minimum of 1. An Arcane rune reduces one hero's cost by 1. A Refresher Shard makes that hero's ability cost 0.
              </li>
              <li>Basic attacks go Haste, then AGI → UNI → INT → STR, then creeps, with Slow last. A true tie means both attacks happen together. Then towers fire.</li>
              <li>
                Rotation: each side may move up to 2 heroes, one step each, along Top · Dire Jungle · Mid · Radiant Jungle ·
                Bot. You move, then Dire. Rooted or stunned heroes stay. From a lane with no allied towers a hero may walk
                lane to lane.
              </li>
              <li>
                Cleanup: your Ancient fully heals your own heroes in a lane with no towers left. A Cursed hero does not heal.
                Poison and other delayed damage happen after that heal. A Shield bought for 3 XP stays until it blocks a hit.
                Other statuses end unless a card says the effect lasts (Doom, Wraith King, Necrophos). A slain hero joins the
                shared discard. Illusions vanish.
              </li>
              <li>Income: +1 Gold and +1 XP per enemy hero killed, plus +1 XP per lane holding a living hero.</li>
            </ol>
          </Section>
          <Section title="Combat">
            Heroes take 2 hits: Healthy → Wounded → slain. Attributes do not instakill. They only order basic attacks:
            Agility, then Universal, then Intelligence, then Strength. The lane order breaks ties inside a bracket: safe lane,
            mid, off lane, own jungle, enemy jungle. If that is still a tie, both units attack at the same time. There is no
            day and night cycle. A standing tower fires as soon as the swing that hit it resolves, even when Glyph stopped
            the damage. A tower destroyed by that hit does not fire. Tier 1 deals 1 to a creep in the attacking line,
            otherwise Position 1. Tier 2 deals 1 to each of the first 3 units, and creeps are hit before heroes.
            Physical damage is attacks and towers. Magical damage is ultimates, passives and items. Immunity blocks magical
            damage and debuffs. Ethereal blocks physical attack damage and takes 1 extra magical damage.
          </Section>
          <Section title="Jungle, Roshan & Tormentor">
            Two jungles hold one camp each, drawn from a 15-card jungle deck: Stone Golem, Thunderhide, Ice Shaman and Black
            Dragon, three each, plus one Roshan and two Tormentors. A normal neutral kill pays 2 Gold, 2 XP, and a rune.
            Roshan pays 3 Gold, 3 XP, a rune, and the Aegis. He evades the first damage each turn. His Roar, and the other
            neutral ultimates, resolve only when 2 or more units are in the camp: Roar Disarms and deals 1 damage to every
            enemy there. A stunned hero or neutral does not cast, move, or attack. Roshan never appears before round 4. The Tormentor pays 2 Gold, 2 XP,
            a rune, and a Refresher Shard. It gains a Shield each turn and reflects damage to the attacker and to each
            contesting Position 1.
          </Section>
          <Section title="Runes & tower cards">
            Twenty rune cards (two each): Bounty (+1 Gold), Amplify (+1 attack), Haste, Invisibility, Illusion, Shield,
            Arcane (−1 XP on one allied hero), Wisdom (+1 XP), Regeneration and Water (cleanse). A rune does not count
            toward the hand limit. Under each side's towers lie Glyph, Lotus and Twin Gate. When a tower falls the attacker
            gains 3 Gold (Tier 1) or 5 Gold (Tier 2), and the defender takes the hidden card.
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
            Safe lane, then Mid, Off lane, own jungle and enemy jungle (Radiant safe = Bottom, Dire safe = Top). If that is
            still a tie, both basic attacks happen at the same time. Abilities do not use this order: the last one declared
            resolves first.
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
