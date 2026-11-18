/** Tiny observable for browser-engine loading state (shown as a pill in the layout). */
import { useSyncExternalStore } from 'react'

export type EngineName = 'sql' | 'python'
export type EngineState = 'idle' | 'loading' | 'ready' | 'error'
export interface EngineStatus { state: EngineState; detail?: string }

let snapshot: Record<EngineName, EngineStatus> = { sql: { state: 'idle' }, python: { state: 'idle' } }
const listeners = new Set<() => void>()

export function setEngineStatus(name: EngineName, state: EngineState, detail?: string) {
  const cur = snapshot[name]
  if (cur.state === state && cur.detail === detail) return
  snapshot = { ...snapshot, [name]: { state, detail } }
  listeners.forEach((l) => l())
}

export function useEngineStatus(): Record<EngineName, EngineStatus> {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb) } }, () => snapshot)
}
