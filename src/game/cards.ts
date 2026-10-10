import type { HeroCard, ItemCard, NeutralCard } from './types'
import { POOL_ICON_SLUG } from './heroPool'
import { ROSTER } from './roster'

/** Deck heroes. Spirit Bear is summoned and is not one of the 127. */
export const HEROES: HeroCard[] = ROSTER.filter((h) => !h.summon)

// Shop items cost gold and are single use. Runes, tower cards and boss rewards stay free.
export const ITEMS: ItemCard[] = [
  { id: 'tp', name: 'Town Portal Scroll', kind: 'Shop', text: 'Teleport an allied hero (not Rooted) to any lane.', target: 'allyHeroToLane', cost: 1, copies: 6 },
  { id: 'ward', name: 'Ward', kind: 'Shop', text: 'Enemy heroes that enter this lane are face-up at the next Reveal.', target: 'lane', cost: 1, copies: 3 },
  { id: 'smoke', name: 'Smoke', kind: 'Shop', text: 'Allied heroes placed in this lane stay hidden at the next Reveal.', target: 'lane', cost: 1, copies: 3 },
  { id: 'dust', name: 'Dust', kind: 'Shop', text: 'Mute every enemy hero in the lane.', target: 'lane', cost: 1, copies: 3 },
  { id: 'salve', name: 'Healing Salve', kind: 'Shop', text: 'Heal an allied hero.', target: 'allyWoundedHero', cost: 1, copies: 4 },
  { id: 'clarity', name: 'Clarity', kind: 'Shop', text: 'Gain +1 XP.', target: 'none', cost: 1, copies: 3 },
  { id: 'gloves', name: 'Gloves of Haste', kind: 'Shop', text: 'An allied hero gains Haste.', target: 'allyHero', cost: 1, copies: 3 },
  { id: 'vanguard', name: 'Vanguard', kind: 'Shop', text: 'Gain 1 Shield this turn.', target: 'allyHero', cost: 2, copies: 2 },
  { id: 'blade_mail', name: 'Blade Mail', kind: 'Shop', text: 'Reflect 1 physical damage back to the attacker.', target: 'allyHero', cost: 2, copies: 2 },
  { id: 'ghost', name: 'Ghost Scepter', kind: 'Shop', text: 'An allied hero becomes Ethereal.', target: 'allyHero', cost: 2, copies: 2 },
  { id: 'force_staff', name: 'Force Staff', kind: 'Shop', text: 'Reposition an enemy hero to the back of their line.', target: 'enemyHero', cost: 2, copies: 2 },
  { id: 'shadow_blade', name: 'Shadow Blade', kind: 'Shop', text: 'An allied hero becomes Invisible.', target: 'allyHero', cost: 2, copies: 2 },
  { id: 'blink', name: 'Blink Dagger', kind: 'Shop', text: 'An allied hero gains Haste and moves to Position 1.', target: 'allyHero', cost: 2, copies: 2 },
  { id: 'euls', name: "Eul's Scepter", kind: 'Shop', text: 'Banish an enemy hero.', target: 'enemyHero', cost: 2, copies: 2 },
  { id: 'halberd', name: "Heaven's Halberd", kind: 'Shop', text: 'Disarm an enemy hero.', target: 'enemyHero', cost: 2, copies: 2 },
  { id: 'orchid', name: 'Orchid Malevolence', kind: 'Shop', text: 'Silence an enemy hero.', target: 'enemyHero', cost: 2, copies: 2 },
  { id: 'desolator', name: 'Desolator', kind: 'Shop', text: 'An allied hero is Amplified.', target: 'allyHero', cost: 2, copies: 2 },
  { id: 'bkb', name: 'Black King Bar', kind: 'Shop', text: 'An allied hero becomes Immune.', target: 'allyHero', cost: 3, copies: 1 },
  { id: 'greaves', name: 'Guardian Greaves', kind: 'Shop', text: 'Heal all allied heroes in lanes.', target: 'none', cost: 3, copies: 1 },
  { id: 'assault', name: 'Assault Cuirass', kind: 'Shop', text: 'Haste all allied heroes in lanes.', target: 'none', cost: 3, copies: 1 },
  { id: 'shivas', name: "Shiva's Guard", kind: 'Shop', text: 'Slow all enemy heroes in a lane.', target: 'lane', cost: 3, copies: 1 },
  { id: 'refresher', name: 'Refresher Orb', kind: 'Shop', text: 'That hero\'s ability is cast twice. The second cast can choose a new target.', target: 'allyHero', cost: 3, copies: 1 },
  { id: 'satanic', name: 'Satanic', kind: 'Shop', text: 'An allied hero cannot die, and their basic attacks heal them.', target: 'allyHero', cost: 3, copies: 1 },
  { id: 'bloodthorn', name: 'Bloodthorn', kind: 'Shop', text: 'Silence an enemy hero. They take +1 physical damage from attacks.', target: 'enemyHero', cost: 3, copies: 1 },
  { id: 'sheepstick', name: 'Scythe of Vyse', kind: 'Shop', text: 'Hex an enemy hero into a 1 HP decoy.', target: 'enemyHero', cost: 3, copies: 1 },
  { id: 'abyssal', name: 'Abyssal Blade', kind: 'Shop', text: 'Stun an enemy hero.', target: 'enemyHero', cost: 3, copies: 1 },
  { id: 'butterfly', name: 'Butterfly', kind: 'Shop', text: 'An allied hero Evades the next attack.', target: 'allyHero', cost: 3, copies: 1 },
  { id: 'heart', name: 'Heart of Tarrasque', kind: 'Shop', text: 'An allied hero heals at the end of the turn.', target: 'allyHero', cost: 3, copies: 1 },
  { id: 'skadi', name: 'Eye of Skadi', kind: 'Shop', text: 'An allied hero\'s basic attacks apply Slow and Curse.', target: 'allyHero', cost: 3, copies: 1 },
  { id: 'rapier', name: 'Divine Rapier', kind: 'Shop', text: 'An allied hero\'s basic attacks instantly kill enemy heroes.', target: 'allyHero', cost: 3, copies: 1 },
  { id: 'dagon', name: 'Dagon', kind: 'Shop', text: 'Deal 2 magical damage to an enemy hero.', target: 'enemyHero', cost: 3, copies: 1 },
  { id: 'mkb', name: 'Monkey King Bar', kind: 'Shop', text: 'Accuracy, and basic attacks deal +1 magical damage.', target: 'allyHero', cost: 3, copies: 1 },
  { id: 'rune_gold', name: 'Bounty Rune', kind: 'Rune', text: 'Gain 1 Gold.', target: 'none' },
  { id: 'rune_regen', name: 'Regeneration Rune', kind: 'Rune', text: 'Heal an allied hero from Wounded to Healthy.', target: 'allyWoundedHero' },
  { id: 'rune_dd', name: 'Amplify Rune', kind: 'Rune', text: 'An allied hero gains +1 attack.', target: 'allyHero' },
  { id: 'rune_shield', name: 'Shield Rune', kind: 'Rune', text: 'Gain 1 Shield this turn.', target: 'allyHero' },
  { id: 'rune_arcane', name: 'Arcane Rune', kind: 'Rune', text: 'Reduce an allied hero\'s ability cost by 1 XP.', target: 'allyHero' },
  { id: 'rune_illusion', name: 'Illusion Rune', kind: 'Rune', text: 'Place a 1 HP decoy (0 attack) in front of an allied hero. It vanishes at Cleanup.', target: 'allyHero' },
  { id: 'rune_invis', name: 'Invisibility Rune', kind: 'Rune', text: 'An allied hero is untargetable by enemies this round. It can still attack.', target: 'allyHero' },
  { id: 'rune_haste', name: 'Haste Rune', kind: 'Rune', text: 'An allied hero attacks first in Phase 2, regardless of priority or Slow.', target: 'allyHero' },
  { id: 'rune_wisdom', name: 'Wisdom Rune', kind: 'Rune', text: 'Gain 1 XP.', target: 'none' },
  { id: 'rune_water', name: 'Water Rune', kind: 'Rune', text: 'Remove all debuffs from an allied hero.', target: 'allyHero' },
  { id: 'aegis', name: 'Aegis of the Immortal', kind: 'Special', text: 'The hero revives immediately the next time it dies. Flips back to Roshan once used.', target: 'allyHero' },
  { id: 'refresher_shard', name: 'Refresher Shard', kind: 'Special', text: "That hero's ability costs 0 XP. Flips back to a Tormentor once used.", target: 'allyHero' },
  { id: 'glyph', name: 'Glyph of Fortification', kind: 'Tower', text: 'Your towers take no damage this round (so they do not fire either).', target: 'none' },
  { id: 'lotus', name: 'Lotus Pool', kind: 'Tower', text: 'Heal all your heroes to Healthy.', target: 'none' },
  { id: 'gate', name: 'Twin Gate', kind: 'Tower', text: 'Teleport all your heroes on the board (except Rooted ones) to a lane of your choice.', target: 'lane' },
]

/** Fallback copies. Shop cards carry their own `copies`. Runes default to 2. */
export const ITEM_DECK_COPIES: Record<ItemCard['kind'], number> = { Shop: 1, Rune: 2, Tower: 0, Special: 0 }
/** Dual cards: the boss card flips into its reward when slain, and flips back once the reward is used. */
export const BOSS_REWARD = { roshan: 'aegis', tormentor: 'refresher_shard' } as const
/** Each side hides one of each under its three T1 towers, and again under its three T2 towers. */
export const TOWER_CARD_IDS = ['glyph', 'lotus', 'gate'] as const
/** Shuffled into the one hero deck: 127 heroes + these creeps = 160 cards. */
export const REGULAR_CREEPS = 25
export const SIEGE_CREEPS = 8

export const NEUTRALS: NeutralCard[] = [
  { id: 'golem', name: 'Stone Golem', attribute: 'STR', hp: 2, text: 'Immune. Gains 1 Shield. Attacks Position 1.' },
  { id: 'thunderhide', name: 'Thunderhide', attribute: 'AGI', hp: 2, text: 'Hasted. When contested, deal 1 magical damage to every enemy in the camp.' },
  { id: 'ice_shaman', name: 'Ice Shaman', attribute: 'INT', hp: 2, text: 'Silence every enemy in the camp. When contested, deal 1 magical damage to both Position 1 units.' },
  { id: 'dragon', name: 'Black Dragon', attribute: 'UNI', hp: 2, text: 'Curse every enemy in the camp. When contested, deal 1 damage to every enemy there.' },
]
export const NEUTRAL_COPIES = 3
export const TORMENTOR_COPIES = 2

export const ROSHAN = {
  name: 'Roshan',
  attribute: 'UNI' as const,
  text: 'Evades the first damage each turn. When contested, Disarm and deal 1 damage to every enemy in the camp. Bounty: the Aegis. Never appears before round 4.',
}

export const TORMENTOR = {
  name: 'Tormentor',
  attribute: 'UNI' as const,
  text: 'Never attacks. Gains 1 Shield each turn. Reflection returns the damage to every attacker and the same amount to each contesting Position 1. Bounty: a Refresher Shard.',
}

const ICON_SLUG: Record<string, string> = {
  wraith_king: 'skeleton_king',
  zeus: 'zuus',
  windranger: 'windrunner',
  anti_mage: 'antimage',
  ...POOL_ICON_SLUG,
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

const heroById = new Map(ROSTER.map((h) => [h.id, h]))
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
  AGI: 'STR',
  STR: 'INT',
  INT: 'AGI',
}

export const ULT_ORDER = ['STR', 'INT', 'UNI', 'AGI'] as const
export const ATTACK_ORDER = ['AGI', 'UNI', 'INT', 'STR'] as const
