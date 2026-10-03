import type { HeroCard, ItemCard, NeutralCard } from './types'

// Starter set: 5 heroes per attribute. Add new heroes here; mechanics keyed by id live in engine.ts.
export const HEROES: HeroCard[] = [
  // STR
  {
    id: 'axe',
    name: 'Axe',
    attribute: 'STR',
    range: 'Melee',
    passive: { name: 'Counter Helix', text: 'When attacked by a basic attack, deal 1 damage back to the attacker.' },
    ult: { name: "Berserker's Call", text: 'All enemy units in this lane are forced to target Axe during Phase 2.', target: 'none' },
  },
  {
    id: 'sven',
    name: 'Sven',
    attribute: 'STR',
    range: 'Melee',
    passive: { name: 'Great Cleave', text: "Sven's basic attack damages both Position 1 and Position 2." },
    ult: { name: "God's Strength", text: "Sven's attacks this round gain Accuracy (cannot be evaded or blinded) and Pierce (bypass shields and damage negation).", target: 'none' },
  },
  {
    id: 'tidehunter',
    name: 'Tidehunter',
    attribute: 'STR',
    range: 'Melee',
    passive: { name: 'Kraken Shell', text: 'Takes 0 damage from lane Creeps and Siege Creeps.' },
    ult: { name: 'Ravage', text: 'Stun all enemy heroes in this lane for the round.', target: 'none' },
  },
  {
    id: 'pudge',
    name: 'Pudge',
    attribute: 'STR',
    range: 'Melee',
    maxHp: 3,
    passive: { name: 'Flesh Heap', text: 'Pudge can endure 1 additional Wound before being slain.' },
    ult: { name: 'Meat Hook', text: 'Drag an enemy hero from an adjacent lane into Position 1 of this lane, dealing 1 damage.', target: 'enemyHeroAdjacentLane' },
  },
  {
    id: 'wraith_king',
    name: 'Wraith King',
    attribute: 'STR',
    range: 'Melee',
    passive: { name: 'Vampiric Aura', text: 'Allied Melee units in this lane heal from Wounded to Healthy upon killing a unit.' },
    ult: { name: 'Reincarnation', text: 'If slain this round, immediately revive in the Wounded state.', target: 'none' },
  },
  // INT
  {
    id: 'crystal_maiden',
    name: 'Crystal Maiden',
    attribute: 'INT',
    range: 'Ranged',
    passive: { name: 'Arcane Aura', text: 'Generate +1 bonus Gold during the Upkeep Phase.' },
    ult: { name: 'Freezing Field', text: 'Deal 1 damage to all enemies in this lane; CM takes 1 damage.', target: 'none' },
  },
  {
    id: 'lion',
    name: 'Lion',
    attribute: 'INT',
    range: 'Ranged',
    passive: { name: 'Mana Drain', text: 'Enemy hero in Position 1 of this lane cannot cast their Ultimate this round.' },
    ult: { name: 'Finger of Death', text: 'Deal 2 direct damage to an enemy hero in this lane (lethal kill).', target: 'enemyHeroInLane' },
  },
  {
    id: 'zeus',
    name: 'Zeus',
    attribute: 'INT',
    range: 'Ranged',
    passive: { name: 'Static Field', text: 'Whenever you play a Consumable on Zeus, deal 1 damage to enemy Position 1.' },
    ult: { name: "Thundergod's Wrath", text: 'Deal 1 damage to all enemy heroes across all three lanes.', target: 'none' },
  },
  {
    id: 'lina',
    name: 'Lina',
    attribute: 'INT',
    range: 'Ranged',
    passive: { name: 'Fiery Soul', text: 'Once Lina strikes a unit, she attacks first in the INT bracket.' },
    ult: { name: 'Laguna Blade', text: 'Deal 2 direct damage to a single enemy unit in this lane.', target: 'enemyUnitInLane' },
  },
  {
    id: 'lich',
    name: 'Lich',
    attribute: 'INT',
    range: 'Ranged',
    passive: { name: 'Frost Shield', text: 'Allied unit in Position 1 negates the first basic attack damage taken each round.' },
    ult: { name: 'Chain Frost', text: 'Deal 1 damage to Position 1, then 1 damage to Position 2.', target: 'none' },
  },
  // UNI
  {
    id: 'windranger',
    name: 'Windranger',
    attribute: 'UNI',
    range: 'Ranged',
    passive: { name: 'Windrun', text: 'Takes 0 damage from Melee basic attacks.' },
    ult: { name: 'Focus Fire', text: 'Attacks her target twice during Phase 2.', target: 'none' },
  },
  {
    id: 'abaddon',
    name: 'Abaddon',
    attribute: 'UNI',
    range: 'Melee',
    passive: { name: 'Aphotic Shield', text: 'Negates the first instance of damage Abaddon takes each round.' },
    ult: { name: 'Borrowed Time', text: 'All damage taken by Abaddon this round heals him instead.', target: 'none' },
  },
  {
    id: 'bane',
    name: 'Bane',
    attribute: 'UNI',
    range: 'Ranged',
    passive: { name: 'Enfeeble', text: 'Enemy unit in Position 1 of this lane deals 0 basic attack damage.' },
    ult: { name: "Fiend's Grip", text: 'Stun target enemy hero through Phase 2; Bane heals to Healthy.', target: 'enemyHeroInLane' },
  },
  {
    id: 'venomancer',
    name: 'Venomancer',
    attribute: 'UNI',
    range: 'Ranged',
    passive: { name: 'Poison Sting', text: 'Enemies damaged by his basic attack take 1 damage at the end of the round.' },
    ult: { name: 'Poison Nova', text: 'Deal 1 damage to all enemy units in this lane; they cannot be healed.', target: 'none' },
  },
  {
    id: 'viper',
    name: 'Viper',
    attribute: 'UNI',
    range: 'Ranged',
    passive: { name: 'Corrosive Skin', text: 'Any unit that basic attacks Viper takes 1 damage back.' },
    ult: { name: 'Viper Strike', text: 'Deal 1 damage, apply Slow, and Disarm a target enemy in this lane.', target: 'enemyUnitInLane' },
  },
  // AGI
  {
    id: 'phantom_assassin',
    name: 'Phantom Assassin',
    attribute: 'AGI',
    range: 'Melee',
    passive: { name: 'Blur', text: 'Evades the first physical basic attack directed at PA each round.' },
    ult: { name: 'Coup de Grace', text: 'Instantly slays target unit in this lane, ignoring attribute loop restrictions.', target: 'enemyUnitInLane' },
  },
  {
    id: 'sniper',
    name: 'Sniper',
    attribute: 'AGI',
    range: 'Ranged',
    passive: { name: 'Take Aim', text: 'Can target any enemy unit in the lane regardless of position (prefers the juiciest target).' },
    ult: { name: 'Assassinate', text: 'Deal 2 direct damage to any enemy unit on the board (lethal kill).', target: 'enemyUnitAnyLane' },
  },
  {
    id: 'juggernaut',
    name: 'Juggernaut',
    attribute: 'AGI',
    range: 'Melee',
    passive: { name: 'Blade Fury', text: 'Takes 0 damage from enemy Ultimates.' },
    ult: { name: 'Omnislash', text: 'Deal 1 damage to two random enemy units in this lane.', target: 'none' },
  },
  {
    id: 'luna',
    name: 'Luna',
    attribute: 'AGI',
    range: 'Ranged',
    passive: { name: 'Moon Glaive', text: 'Basic attack hits both Position 1 and Position 2.' },
    ult: { name: 'Eclipse', text: 'Deal 1 damage to three random enemy units in this lane.', target: 'none' },
  },
  {
    id: 'anti_mage',
    name: 'Anti-Mage',
    attribute: 'AGI',
    range: 'Melee',
    passive: { name: 'Mana Break', text: 'Damaging an enemy hero with a basic attack silences them for the round.' },
    ult: { name: 'Mana Void', text: 'Deal 1 damage to all enemy heroes in this lane for each enemy INT hero in the lane.', target: 'none' },
  },
]

// Items are free to play and single use: the card is discarded once it resolves.
export const ITEMS: ItemCard[] = [
  { id: 'tango', name: 'Tango', kind: 'Shop', text: 'Heal an allied hero from Wounded to Healthy.', target: 'allyWoundedHero' },
  { id: 'dagon', name: 'Dagon', kind: 'Shop', text: 'Deal 1 damage to any enemy unit on the board (including neutrals).', target: 'enemyUnit' },
  { id: 'blade_mail', name: 'Blade Mail', kind: 'Shop', text: 'This round, basic attack damage taken is dealt back to the attacker.', target: 'allyHero' },
  { id: 'vanguard', name: 'Vanguard', kind: 'Shop', text: 'Shield: block the next instance of attack damage this round.', target: 'allyHero' },
  { id: 'bkb', name: 'Black King Bar', kind: 'Shop', text: 'Immunity this round: ignore enemy Ultimate and item damage and their debuffs.', target: 'allyHero' },
  { id: 'desolator', name: 'Desolator', kind: 'Shop', text: '+1 basic attack damage this round.', target: 'allyHero' },
  { id: 'refresher', name: 'Refresher Orb', kind: 'Shop', text: "Reset an allied hero's Ultimate so it can be cast again.", target: 'allyHero' },
  { id: 'mkb', name: 'Monkey King Bar', kind: 'Shop', text: 'Accuracy this round: attacks cannot be evaded and ignore Blind.', target: 'allyHero' },
  { id: 'orchid', name: 'Orchid Malevolence', kind: 'Shop', text: 'Silence and Mute an enemy hero this round.', target: 'enemyHero' },
  { id: 'silver_edge', name: 'Silver Edge', kind: 'Shop', text: 'Break an enemy hero this round (their passive does nothing).', target: 'enemyHero' },
  { id: 'atos', name: 'Rod of Atos', kind: 'Shop', text: 'Root an enemy unit this round (it cannot change lane or position).', target: 'enemyUnit' },
  { id: 'euls', name: "Eul's Scepter", kind: 'Shop', text: 'Banish an enemy hero this round: untargetable and invulnerable, but it cannot act.', target: 'enemyHero' },
  { id: 'chipped_vest', name: 'Chipped Vest', kind: 'Neutral', text: 'This round, units that basic attack this hero take 1 damage.', target: 'allyHero' },
  { id: 'arcane_ring', name: 'Arcane Ring', kind: 'Neutral', text: 'Gain 1 XP immediately.', target: 'none' },
  { id: 'ninja_gear', name: 'Ninja Gear', kind: 'Neutral', text: 'Evade: dodge the next basic attack against this hero this round.', target: 'allyHero' },
  { id: 'aegis', name: 'Aegis of the Immortal', kind: 'Special', text: 'If this hero is slain this round, it revives Healthy. Only dropped by Roshan.', target: 'allyHero' },
]

export const ITEM_DECK_COPIES: Record<ItemCard['kind'], number> = { Shop: 2, Neutral: 2, Special: 0 }
export const REGULAR_CREEPS = 32
export const SIEGE_CREEPS = 8

export const NEUTRALS: NeutralCard[] = [
  { id: 'golem', name: 'Golem', attribute: 'STR', hp: 2, text: 'Hits Position 1 of each side for 1.' },
  { id: 'thunderhide', name: 'Thunderhide', attribute: 'AGI', hp: 2, text: 'Hits Position 1 of each side for 1.' },
  { id: 'ice_shaman', name: 'Ice Shaman', attribute: 'INT', hp: 2, text: 'Hits Position 1 of each side for 1 and Slows them.' },
  { id: 'dragon', name: 'Dragon', attribute: 'UNI', hp: 2, text: 'Hits Position 1 of each side for 1 and Blinds them.' },
]
export const NEUTRAL_COPIES = 4

export const ROSHAN = {
  name: 'Roshan',
  attribute: 'UNI' as const,
  text: 'Takes 3 damage to defeat. Hits every hero in the pit for 1. Roar: while at full health he disarms everyone in the pit during Phase 1. Bounty: 3 XP and the Aegis. Respawns 3 rounds after dying.',
}

const ICON_SLUG: Record<string, string> = {
  wraith_king: 'skeleton_king',
  zeus: 'zuus',
  windranger: 'windrunner',
  anti_mage: 'antimage',
}

export function heroPortrait(id: string) {
  return `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/${ICON_SLUG[id] ?? id}.png`
}

const neutralById = new Map(NEUTRALS.map((n) => [n.id, n]))

export function getNeutral(id: string): NeutralCard {
  const n = neutralById.get(id)
  if (!n) throw new Error(`Unknown neutral ${id}`)
  return n
}

const heroById = new Map(HEROES.map((h) => [h.id, h]))
const itemById = new Map(ITEMS.map((i) => [i.id, i]))

export function getHero(id: string): HeroCard {
  const h = heroById.get(id)
  if (!h) throw new Error(`Unknown hero ${id}`)
  return h
}

export function getItem(id: string): ItemCard {
  const i = itemById.get(id)
  if (!i) throw new Error(`Unknown item ${id}`)
  return i
}

export const ATTRIBUTE_COUNTERS: Record<string, string | undefined> = {
  AGI: 'INT',
  INT: 'STR',
  STR: 'AGI',
}

export const ULT_ORDER = ['STR', 'INT', 'UNI', 'AGI'] as const
export const ATTACK_ORDER = ['AGI', 'UNI', 'INT', 'STR'] as const
