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
            towers in a lane gives +1 passive Gold per round.
          </Section>
          <Section title="Round">
            <ol className="list-decimal space-y-0.5 pl-5">
              <li>Upkeep: +1 Gold, +1 XP (plus bonuses). Empty jungle camps respawn a neutral.</li>
              <li>Draw: spend 1 Gold per hero, creep or item card (hand limit 7). You start with 5 heroes.</li>
              <li>Map: no map or rune cards in the starter set yet.</li>
              <li>
                Assign: place up to 3 heroes (board limit 5) into lanes, jungles or Roshan's pit, and creep cards into lanes.
                Position 1 defends first.
              </li>
              <li>Reveal: both sides flip.</li>
              <li>Item: play items on heroes — free, single use, and they resolve immediately.</li>
              <li>Ult: spend 1 XP to declare a living hero's Ultimate (single-use toggle in the header).</li>
              <li>Resolution: Ultimates (STR → INT → UNI → AGI), basic attacks (AGI → UNI → INT → STR → creeps, Slowed last), then tower aggro.</li>
              <li>Cleanup: wounds persist, dead heroes and creeps go to the shared discard piles, all round effects end.</li>
              <li>Income: +1 Gold per enemy hero killed, +1 XP per lane holding a living hero.</li>
            </ol>
          </Section>
          <Section title="Combat">
            Heroes take 2 hits: Healthy → Wounded (tilted) → slain. Basic attacks hit enemy Position 1; with no defenders left
            the attacker hits the lane's next structure. A basic attack against the attribute it counters (AGI → INT → STR →
            AGI) kills instantly — neutrals have attributes too. In Phase 3, every standing tower that took damage this round
            deals its damage (T1: 1, T2: 2) to the attacking side's Position 1.
          </Section>
          <Section title="Jungle & Roshan">
            Each jungle sits between a side's safe lane and mid and holds one neutral (Golem STR, Thunderhide AGI, Ice Shaman
            INT with Slow, Dragon UNI with Blind). The side that arrived first holds the camp and chooses whether to hit the
            neutral or the contester; the contester must attack the holder. The neutral hits Position 1 of each side. A
            neutral kill gives 1 XP and an item card. Roshan (UNI, 3 hits) hits every hero in the pit, Roars to disarm the pit
            while at full health, and drops 3 XP plus the Aegis. He respawns 3 rounds later.
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
            Safe lane, then Mid, Off lane, own jungle, enemy jungle and Roshan (Radiant safe = Bottom, Dire safe = Top). Still
            tied? Odd rounds are Day (Radiant first), even rounds are Night (Dire first).
          </Section>
          <Section title="Not in the prototype yet">Runes and map cards, hot-seat or online multiplayer.</Section>
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
