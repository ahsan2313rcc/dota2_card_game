import { BookOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'

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
              <li>Upkeep: +1 Gold, +1 XP (plus bonuses).</li>
              <li>Draw: spend 1 Gold per hero or item card (hand limit 7).</li>
              <li>Map: no map or rune cards in the starter set yet.</li>
              <li>Assign: place up to 3 heroes (board limit 5) and order your lineups. Position 1 defends first.</li>
              <li>Reveal: both sides flip; one creep card per lane per side joins behind the heroes (prototype).</li>
              <li>Item: play items on heroes — they resolve immediately.</li>
              <li>Ult: spend 1 XP to declare a living hero's Ultimate (single-use toggle in the header).</li>
              <li>Resolution: Ultimates (STR → INT → UNI → AGI), basic attacks (AGI → UNI → INT → STR → creeps), then tower aggro.</li>
              <li>Cleanup: wounds persist, dead heroes go to the shared discard, creeps leave the lane.</li>
              <li>Income: +1 Gold per enemy hero killed, +1 XP per lane holding a living hero.</li>
            </ol>
          </Section>
          <Section title="Combat">
            Heroes take 2 hits: Healthy → Wounded (tilted) → slain. Basic attacks hit enemy Position 1; with no defenders left
            the attacker hits the lane's next structure. A hero basic attacking the attribute it counters (AGI → INT → STR →
            AGI) kills instantly. Towers fire at the first surviving enemy that hit them this round.
          </Section>
          <Section title="Tiebreakers">
            Within an attribute bracket: Safe lane before Mid before Off lane (Radiant safe = Bottom, Dire safe = Top). Still
            tied? Odd rounds are Day (Radiant first), even rounds are Night (Dire first).
          </Section>
          <Section title="Not in the prototype yet">
            Jungle camps and neutrals, Roshan and Aegis, runes and map cards, neutral items, hot-seat multiplayer.
          </Section>
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
