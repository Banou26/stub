import { comparablePluginUri } from './utils/plugin-links'
import { enabledPluginUris, enablePlugin } from './plugins'

export type PluginInvite = {
  uri: string
  state: 'offered' | 'installing' | 'error'
  error?: string
}

const invites = new Map<string, PluginInvite>()
// outlives the offer, or the next navigation re-reads the url and asks again
const declined = new Set<string>()
const listeners = new Set<() => void>()

const notify = () => listeners.forEach(listener => { try { listener() } catch {} })

export const onInvitesChange = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export const pluginInvites = (): PluginInvite[] => [...invites.values()]

export const pendingInviteUris = (): string[] => [...invites.keys()]

export const offerInvites = (uris: string[]): void => {
  const known = new Set(enabledPluginUris().map(comparablePluginUri))
  let added = false
  for (const uri of uris) {
    const key = comparablePluginUri(uri)
    if (!key || known.has(key) || declined.has(key) || invites.has(uri)) continue
    invites.set(uri, { uri, state: 'offered' })
    added = true
  }
  if (added) notify()
}

export const declineInvites = (): void => {
  if (!invites.size) return
  for (const uri of invites.keys()) declined.add(comparablePluginUri(uri))
  invites.clear()
  notify()
}

// one failure does not cancel the rest: a link can carry several addresses and only one be dead
export const acceptInvites = async (): Promise<void> => {
  const pending = [...invites.keys()]
  if (!pending.length) return
  for (const uri of pending) invites.set(uri, { uri, state: 'installing' })
  notify()
  for (const uri of pending) {
    try {
      // null is FKN's install confirm being turned down, which is a refusal and must be recorded
      if (!await enablePlugin(uri)) declined.add(comparablePluginUri(uri))
      invites.delete(uri)
    } catch (error) {
      invites.set(uri, { uri, state: 'error', error: error instanceof Error ? error.message : String(error) })
    }
    notify()
  }
}

export const dismissInvite = (uri: string): void => {
  if (!invites.delete(uri)) return
  declined.add(comparablePluginUri(uri))
  notify()
}
