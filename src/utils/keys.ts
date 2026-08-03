import { setUserKeys } from '../worker'

const STORAGE_KEY = 'stub.apikeys'

export const loadKeys = (): Record<string, string> => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) as Record<string, string> : {}
  } catch {
    return {}
  }
}

export const pushKeys = (keys: Record<string, string> = loadKeys()) => setUserKeys(keys)

export const saveKeys = (keys: Record<string, string>) => {
  const pruned = Object.fromEntries(Object.entries(keys).filter(([, value]) => value))
  localStorage.setItem(STORAGE_KEY, JSON.stringify(pruned))
  return pushKeys(pruned)
}
