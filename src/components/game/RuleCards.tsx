const NEUTRALS: Array<[string, string]> = [
  ['Stone Golem', 'STR, 2 HP. Immune, and a Shield. Hits Position 1.'],
  ['Thunderhide', 'AGI, 2 HP. Haste. Hits every hero and applies Slow. Thunder Clap: 1 magic to each unit.'],
  ['Ice Shaman', 'INT, 2 HP. Silences the camp. Hits each Position 1. Freezing Blast: 1 magic to each Position 1.'],
  ['Black Dragon', 'UNI, 2 HP. Curses the camp. Hits every unit. Fire Pit: 1 magic to each unit.'],
  ['Roshan', 'UNI, 3 HP, from round 4. Ignores the first damage. Hits every unit. Roar: Disarm and 1 damage to each. Pays 3 Gold, 3 XP, a rune, and the Aegis.'],
  ['Tormentor', 'UNI, 2 HP. Never attacks. A Shield each turn. Reflection returns the damage to the attacker and to each contesting Position 1. Break or Silence turns it off. Pays 2 Gold, 2 XP, a rune, and a Refresher Shard.'],
]

const STATUSES: Array<[string, string]> = [
  ['Stun', 'No cast, attack, or move'],
  ['Silence', 'No cast, and the passive is off'],
  ['Break', 'The passive is off'],
  ['Disarm', 'No attack'],
  ['Fear', 'No cast, attack, or move'],
  ['Root', 'Cannot move or reorder'],
  ['Slow', 'Attacks last'],
  ['Haste', 'Attacks first'],
  ['Hex', 'Set to 1 HP, attacks deal 0'],
  ['Mute', 'No items on this hero'],
  ['Curse', 'Cannot heal'],
  ['Taunt', 'Must attack that unit'],
  ['Banish', 'Untargetable, and takes no damage'],
  ['Invisible', 'Untargetable, and can still attack'],
  ['Reveal', 'Can be targeted again'],
  ['Immune', 'Blocks magic and debuffs'],
  ['Ethereal', 'Blocks physical hits. Magic deals +1'],
  ['Invulnerable', 'Blocks all damage'],
  ['Shield', 'Blocks one physical hit, then breaks'],
  ['Evade', 'Dodges the next attack'],
  ['Amplify', 'Attack +1'],
]

export function RuleCards() {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Card kicker="Card 1" title="Start and play">
        <Block title="Goal">Destroy the enemy Ancient (10). Strike Tier 1 (3), then Tier 2 (5), then the Ancient.</Block>
        <Block title="Opening">
          One deck of 160: 127 heroes, 25 creeps, 8 siege. Deal 5 each. Both camps are up, and each side has 1 Gold and 1 XP.
          Glyph, Lotus, and Twin Gate sit under every tower. In round 1, swap two hidden cards of the same tier.
        </Block>
        <Block title="Round">Upkeep, Draw, Assign, Reveal, Combat, Rotate, Cleanup, Income.</Block>
        <ul className="list-disc space-y-1 pl-3.5">
          <li>Place up to 3 heroes a round, 5 on the board. Creeps are extra. Your own jungle only.</li>
          <li>Play one card. The other side has 5 seconds to answer or pass. With nothing legal, the pass happens on its own. Two passes resolve the next swing. Odd rounds you start.</li>
          <li>Attacks go Haste, AGI, UNI, INT, STR, then creeps. Slow goes last. A tower fires when the hit lands, once a round.</li>
          <li>Move up to 2 heroes, one step: Top – Dire Jungle – Mid – Radiant Jungle – Bot. You move, then Dire.</li>
          <li>Draw the hand up to 10. Discard down to 7. Runes and tower cards sit outside that count.</li>
        </ul>
      </Card>

      <Card kicker="Card 2" title="Status">
        <p>These end at cleanup. Health stays. A Shield bought for 3 XP stays until it blocks a hit. Pierce and Divine Rapier ignore Shield.</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
          {STATUSES.map(([name, effect]) => (
            <div key={name} className="contents">
              <dt className="font-semibold text-zinc-100">{name}</dt>
              <dd>{effect}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card kicker="Card 3" title="Gold and XP">
        <p>Unspent Gold and XP carry over. There is no cap.</p>
        <Block title="Earn">
          <ul className="list-disc space-y-0.5 pl-3.5">
            <li>Upkeep: 1 Gold and 1 XP. +1 Gold for each enemy lane with both towers down. Each of your Crystal Maidens adds 1 XP.</li>
            <li>A hero you kill: 1 Gold and 1 XP, at Income.</li>
            <li>A lane with your living hero: 1 XP at Income.</li>
            <li>Camp: 2 Gold, 2 XP, and a rune. Roshan: 3 Gold, 3 XP, a rune, and the Aegis. Tormentor: 2 Gold, 2 XP, a rune, and a Refresher Shard.</li>
            <li>You destroy Tier 1: 3 Gold. Tier 2: 5. The defender takes the hidden card.</li>
            <li>Bounty rune: 1 Gold. Wisdom rune or Clarity: 1 XP.</li>
          </ul>
        </Block>
        <Block title="Spend">
          <ul className="list-disc space-y-0.5 pl-3.5">
            <li>Draw a unit or a shop card: 1 Gold.</li>
            <li>Play a shop card: the printed 1, 2, or 3 Gold.</li>
            <li>Buyback: 4 Gold, or 5 if you have more towers. Once per hero, from the last 10 in the shared discard, during Draw.</li>
            <li>An ability costs its printed 1, 2, or 3 XP, once a turn.</li>
            <li>Shield: 3 XP. One per hero, until it blocks a hit.</li>
            <li>Keeper of the Light: Position 1 pays 1 less XP, minimum 1. Arcane rune: 1 less, minimum 0. Refresher Shard: that cast costs 0. Refresher Orb: one more cast this turn.</li>
            <li>Runes, tower cards, the Aegis, and the Shard are free. A cast that fizzles returns its XP.</li>
          </ul>
        </Block>
      </Card>

      <Card kicker="Card 4" title="Neutrals">
        <p>
          One camp in each jungle, from a deck of 15: Stone Golem, Thunderhide, Ice Shaman, and Black Dragon, three each, plus one Roshan and two Tormentors. A camp stays until it dies. An empty camp refills at the next Upkeep.
        </p>
        <p>
          Assign into your own jungle. The enemy jungle is a rotation step. The side that arrived first holds the camp. A tie goes to that jungle's owner. The holder chooses the neutral or the enemy. A contesting hero must attack the holder.
        </p>
        <p>A neutral ultimate needs 2 living player units in the camp. Stun, Fear, or Banish skips the cast. Stun also skips the attack.</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1">
          {NEUTRALS.map(([name, effect]) => (
            <div key={name} className="contents">
              <dt className="font-semibold text-zinc-100">{name}</dt>
              <dd>{effect}</dd>
            </div>
          ))}
        </dl>
        <p>A camp pays 2 Gold, 2 XP, and a rune. A boss pays its bounty to the side that fought it. With both sides present, it goes to the side that still has a living hero, otherwise to the jungle's owner.</p>
      </Card>
    </div>
  )
}

function Card({ kicker, title, children }: { kicker: string; title: string; children: React.ReactNode }) {
  return (
    <article className="flex flex-col gap-2 rounded-xl border border-amber-900/60 bg-zinc-950 p-3 shadow-[inset_0_0_0_1px_rgba(120,53,15,0.25)]">
      <header>
        <p className="text-[10px] font-semibold tracking-[0.18em] text-amber-600 uppercase">{kicker}</p>
        <h3 className="text-sm font-semibold text-amber-100">{title}</h3>
      </header>
      <div className="space-y-2 text-[11px] leading-snug text-zinc-300">{children}</div>
    </article>
  )
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h4 className="mb-0.5 text-[10px] font-semibold tracking-wider text-zinc-100 uppercase">{title}</h4>
      <div>{children}</div>
    </section>
  )
}
