import { setUserKeys } from '../worker'

// BYOK key storage. Keys live in the user's localStorage (never shipped/persisted server
// side) and are pushed into the worker over osra, where keyful extractors read them via
// ctx.key(origin). See src/sources/key-configs.ts for the descriptors.

const STORAGE_KEY = 'stub.apikeys'

export const loadKeys = (): Record<string, string> => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) as Record<string, string> : {}
  } catch {
    return {}
  }
}

// Push the current keys into the worker so extractors pick them up.
export const pushKeys = (keys: Record<string, string> = loadKeys()) => setUserKeys(keys)

export const saveKeys = (keys: Record<string, string>) => {
  const pruned = Object.fromEntries(Object.entries(keys).filter(([, value]) => value))
  localStorage.setItem(STORAGE_KEY, JSON.stringify(pruned))
  return pushKeys(pruned)
}
