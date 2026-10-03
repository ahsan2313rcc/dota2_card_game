import type { Attribute, PlayerId } from '@/game/types'

export const ATTR_STYLE: Record<Attribute, { label: string; chip: string; strip: string; ring: string }> = {
  STR: {
    label: 'Strength',
    chip: 'bg-red-500/15 text-red-300 ring-red-500/30',
    strip: 'from-red-600/80 to-red-900/40',
    ring: 'ring-red-500/40',
  },
  AGI: {
    label: 'Agility',
    chip: 'bg-green-500/15 text-green-300 ring-green-500/30',
    strip: 'from-green-600/80 to-green-900/40',
    ring: 'ring-green-500/40',
  },
  INT: {
    label: 'Intelligence',
    chip: 'bg-sky-500/15 text-sky-300 ring-sky-500/30',
    strip: 'from-sky-600/80 to-sky-900/40',
    ring: 'ring-sky-500/40',
  },
  UNI: {
    label: 'Universal',
    chip: 'bg-violet-500/15 text-violet-300 ring-violet-500/30',
    strip: 'from-violet-600/80 to-violet-900/40',
    ring: 'ring-violet-500/40',
  },
}

export const SIDE_STYLE: Record<PlayerId, { text: string; bg: string; border: string }> = {
  radiant: { text: 'text-emerald-300', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' },
  dire: { text: 'text-red-300', bg: 'bg-red-500/10', border: 'border-red-500/30' },
}
