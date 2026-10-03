import { useEffect, useRef } from 'react'
import type { LogEntry, LogTone } from '@/game/types'

const TONE: Record<LogTone, string> = {
  info: 'text-zinc-400',
  radiant: 'text-emerald-300',
  dire: 'text-red-300',
  neutral: 'text-amber-200',
  damage: 'text-red-300',
  kill: 'text-red-400 font-semibold',
  structure: 'text-amber-300',
  phase: 'mt-2 text-[11px] font-bold uppercase tracking-wider text-zinc-200',
}

export function LogLines({ entries }: { entries: LogEntry[] }) {
  return (
    <ul className="space-y-1 text-xs leading-snug">
      {entries.map((e) => (
        <li key={e.id} className={TONE[e.tone]}>
          {e.text}
        </li>
      ))}
    </ul>
  )
}

export function CombatLog({ entries }: { entries: LogEntry[] }) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (box.current) box.current.scrollTop = box.current.scrollHeight
  }, [entries.length])
  return (
    <div ref={box} className="h-full overflow-y-auto pr-1">
      <LogLines entries={entries} />
    </div>
  )
}
