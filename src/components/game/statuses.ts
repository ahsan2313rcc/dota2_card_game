import type { RoundStatus, Unit } from '@/game/types'

export interface StatusMark {
  key: string
  short: string
  title: string
  kind: 'buff' | 'debuff'
}

const MARKS: Array<{ key: keyof RoundStatus; short: string; title: string; kind: 'buff' | 'debuff' }> = [
  ['shield', 'Shield', 'Shield: blocks one physical hit', 'buff'],
  ['stunned', 'Stun', 'Stunned: no ultimate, attack, or move', 'debuff'],
  ['silenced', 'Silence', 'Silenced: no Ultimate', 'debuff'],
  ['broken', 'Break', 'Broken: passive off', 'debuff'],
  ['disarmed', 'Disarm', 'Disarmed: no attack', 'debuff'],
  ['slowed', 'Slow', 'Slowed: attacks last', 'debuff'],
  ['blinded', 'Blind', 'Blinded: attacks miss', 'debuff'],
  ['rooted', 'Root', 'Rooted: cannot move', 'debuff'],
  ['muted', 'Mute', 'Muted: no items', 'debuff'],
  ['cursed', 'Curse', 'Cursed: cannot heal', 'debuff'],
  ['feared', 'Fear', 'Feared: no ultimate, attack, or move', 'debuff'],
  ['hexed', 'Hex', 'Hexed: 1 HP decoy, no attack', 'debuff'],
  ['enfeeble', 'Enfeeble', 'Enfeebled: attack −1', 'debuff'],
  ['revealed', 'Reveal', 'Revealed', 'debuff'],
  ['rupture', 'Rupture', 'Moving deals 2 magical damage', 'debuff'],
  ['banished', 'Banish', 'Banished: untargetable and invulnerable', 'buff'],
  ['immune', 'Immune', 'Immune: blocks magical damage and debuffs', 'buff'],
  ['invulnerable', 'Invuln', 'Invulnerable: blocks all damage', 'buff'],
  ['ethereal', 'Ethereal', 'Ethereal: blocks attack damage, +1 magical', 'buff'],
  ['invisible', 'Invis', 'Invisible: enemies cannot target', 'buff'],
  ['haste', 'Haste', 'Haste: attacks first', 'buff'],
  ['evade', 'Evade', 'Evade', 'buff'],
  ['accuracy', 'Accuracy', 'Accuracy', 'buff'],
  ['pierce', 'Pierce', 'Pierce', 'buff'],
  ['bonusDamage', '+ATK', '+Damage', 'buff'],
  ['cannotDie', 'Endure', 'Cannot die this turn', 'buff'],
  ['bladeMail', 'Mail', 'Blade Mail', 'buff'],
  ['aegis', 'Aegis', 'Aegis', 'buff'],
  ['reincarnation', 'Reinc', 'Reincarnation', 'buff'],
  ['borrowedTime', 'Borrow', 'Borrowed Time', 'buff'],
  ['focusFire', 'Focus', 'Focus Fire', 'buff'],
  ['lifesteal', 'Lifesteal', 'Basic attacks heal', 'buff'],
  ['lifestealAura', 'LS Aura', 'Allies heal when they attack', 'buff'],
  ['rangedAttack', 'Ranged', 'Attacks as Ranged', 'buff'],
  ['halfDamage', 'Halve', 'Incoming damage is halved', 'buff'],
  ['doubleHeal', 'Heal×2', 'Healing is doubled', 'buff'],
  ['healEnd', 'Regen', 'Heals 1 at the end of the round', 'buff'],
  ['skadi', 'Skadi', 'Attacks apply Slow and Curse', 'buff'],
  ['rapier', 'Rapier', 'Attacks instantly kill heroes', 'buff'],
  ['bloodthorn', 'Thorn', 'Takes +1 physical damage', 'debuff'],
  ['echoUlt', 'Echo', 'Ultimate resolves twice', 'buff'],
  ['taunt', 'Taunt', 'Must attack the taunting unit', 'debuff'],
].map(([key, short, title, kind]) => ({
  key: key as keyof RoundStatus,
  short,
  title,
  kind: kind as 'buff' | 'debuff',
}))

/** Statuses currently on a unit. An active Shield is always first. */
export function activeStatuses(u: Unit): StatusMark[] {
  const marks: StatusMark[] = []
  for (const mark of MARKS) {
    const value = u.status[mark.key]
    const on = typeof value === 'number' ? value > 0 : !!value
    if (!on) continue
    const extra = typeof value === 'number' && value > 1 ? ` ×${value}` : ''
    const title = mark.key === 'shield' && u.persistentShield ? 'Shield: lasts until it blocks a physical hit' : mark.title
    marks.push({ ...mark, short: mark.short + extra, title, key: mark.key })
  }
  if (u.status.poisonedBy) {
    marks.push({ key: 'poison', short: 'Poison', title: 'Poisoned: 1 damage at cleanup', kind: 'debuff' })
  }
  marks.sort((a, b) => Number(b.key === 'shield') - Number(a.key === 'shield'))
  return marks
}
