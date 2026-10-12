import { createContext, useContext } from 'react'
import type { PlayerId } from './types'

export interface TableInfo {
  you: PlayerId
  live: 'local' | 'online'
  /** Room code, set only while playing online. */
  code?: string
  ready: Record<PlayerId, boolean>
  rematch: Record<PlayerId, boolean>
  names: Partial<Record<PlayerId, string>>
  connected: Record<PlayerId, boolean>
}

const LOCAL: TableInfo = {
  you: 'radiant',
  live: 'local',
  ready: { radiant: false, dire: false },
  rematch: { radiant: false, dire: false },
  names: {},
  connected: { radiant: true, dire: true },
}

const Ctx = createContext<TableInfo>(LOCAL)

export function TableProvider({ value, children }: { value: TableInfo; children: React.ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useTable() {
  return useContext(Ctx)
}
