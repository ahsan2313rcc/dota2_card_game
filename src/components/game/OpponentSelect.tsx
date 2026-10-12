import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import type { AiStyle } from '@/game/ai'

const OPPONENTS: { value: AiStyle; label: string; blurb: string }[] = [
  { value: 'balanced', label: 'Balanced', blurb: 'Splits lanes and farms a spare' },
  { value: 'lane', label: 'Lane', blurb: 'Stacks one tower' },
  { value: 'jungler', label: 'Jungler', blurb: 'Farms, then hits a thin lane' },
  { value: 'defender', label: 'Defender', blurb: 'Answers every threat' },
  { value: 'hunter', label: 'Hunter', blurb: 'Thin lanes, and never farms' },
  { value: 'carry', label: 'Carry', blurb: 'Stays through a body block, then farms' },
  { value: 'split', label: 'Split', blurb: 'One per lane, two in the jungles' },
]

export function opponentLabel(style: AiStyle | undefined): string {
  return OPPONENTS.find((item) => item.value === (style ?? 'balanced'))?.label ?? 'Balanced'
}

export function OpponentSelect({ value, onChange }: { value: AiStyle | undefined; onChange: (style: AiStyle) => void }) {
  const current = value ?? 'balanced'
  const blurb = OPPONENTS.find((item) => item.value === current)?.blurb
  return (
    <div className="flex items-center gap-2">
      <label htmlFor="dire-style" className="text-xs font-medium tracking-wide text-zinc-400 uppercase">
        Opponent
      </label>
      <Select
        value={current}
        items={OPPONENTS}
        onValueChange={(next) => {
          if (next) onChange(next)
        }}
      >
        <SelectTrigger id="dire-style" size="sm" className="min-w-28" aria-label="Dire personality">
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end">
          {OPPONENTS.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="hidden text-xs text-zinc-500 md:inline">{blurb}</span>
    </div>
  )
}

/** Keep pays 3 for a Tier 1 and 5 for a Tier 2. Off pays nothing. The hidden card still goes to the defender. */
export function TowerGoldToggle({ value, onChange }: { value: boolean | undefined; onChange: (on: boolean) => void }) {
  const on = value !== false
  return (
    <div className="flex items-center gap-2">
      <label htmlFor="tower-gold" className="text-xs font-medium tracking-wide text-zinc-400 uppercase">
        Tower gold
      </label>
      <Switch
        id="tower-gold"
        size="sm"
        checked={on}
        onCheckedChange={onChange}
        aria-label="Tower destruction gold"
        title="On pays 3 Gold for a Tier 1 tower and 5 for a Tier 2. Off pays nothing. The defender still takes the hidden card."
      />
      <span className="text-xs text-zinc-500">{on ? 'Keep' : 'Off'}</span>
    </div>
  )
}
