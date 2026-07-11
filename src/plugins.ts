import { packages } from '@fkn/lib'

import { registerRemoteSource, unregisterRemoteSource } from './worker'
import { STUB_SOURCE_PROTOCOL } from './plugin-api'

// Third-party source plugins, installed and connected through the FKN packages API. Stub keeps its
// own notion of which plugins are enabled (FKN remembers what is installed, the app decides what to
// activate); each enabled plugin gets a brokered port forwarded into the worker on boot and
// reconnected when its frame dies (plugin updates reload the sandbox frame).

const ENABLED_KEY = 'stub-enabled-plugins'
const RECONNECT_DELAY_MS = 3_000

export type PluginStatus = {
  uri: string
  state: 'connecting' | 'connected' | 'error'
  origin?: string
  name?: string
  error?: string
}

const statuses = new Map<string, PluginStatus>()
const listeners = new Set<() => void>()

const notify = () => listeners.forEach(listener => { try { listener() } catch {} })

export const onPluginsChange = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export const pluginStatuses = (): PluginStatus[] =>
  loadEnabled().map(uri => statuses.get(uri) ?? { uri, state: 'connecting' })

const loadEnabled = (): string[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(ENABLED_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((uri): uri is string => typeof uri === 'string') : []
  } catch {
    return []
  }
}

const saveEnabled = (uris: string[]) => {
  try {
    localStorage.setItem(ENABLED_KEY, JSON.stringify(uris))
  } catch {}
}

const setStatus = (uri: string, status: Omit<PluginStatus, 'uri'>) => {
  statuses.set(uri, { uri, ...status })
  notify()
}

const connected = new Set<string>()
const retryTimers = new Map<string, ReturnType<typeof setTimeout>>()
const RECONNECT_MAX_MS = 30_000

// Reconnect an enabled plugin after a failure or a frame death, backing off up to RECONNECT_MAX_MS.
// Idempotent: a pending timer or a live connection short-circuits, so the closed handler and the
// connect catch can both call it without stacking retries.
const scheduleReconnect = (uri: string, attempt: number) => {
  if (!loadEnabled().includes(uri) || connected.has(uri) || retryTimers.has(uri)) return
  setStatus(uri, { state: 'connecting' })
  const delay = Math.min(RECONNECT_DELAY_MS * attempt, RECONNECT_MAX_MS)
  const timer = setTimeout(() => {
    retryTimers.delete(uri)
    connectPlugin(uri, attempt + 1).catch(() => {})
  }, delay)
  retryTimers.set(uri, timer)
}

const connectPlugin = async (uri: string, attempt = 1): Promise<void> => {
  if (connected.has(uri)) return
  connected.add(uri)
  setStatus(uri, { state: 'connecting' })
  try {
    const { port, closed } = await packages.connect(uri, { protocol: STUB_SOURCE_PROTOCOL, raw: true })
    // wire teardown BEFORE the worker handshake: a frame death mid-registration must still recover
    closed.then(() => {
      connected.delete(uri)
      unregisterRemoteSource(uri)
      scheduleReconnect(uri, 1)
    })
    // race registration against the frame dying, so a mid-handshake death does not hang here
    const result = await Promise.race([
      registerRemoteSource(port, uri),
      closed.then(() => ({ error: 'the package closed before the source registered' as string })),
    ])
    if ('error' in result) throw new Error(result.error)
    setStatus(uri, { state: 'connected', origin: result.ok.origin, name: result.ok.name })
  } catch (error) {
    connected.delete(uri)
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`Plugin '${uri}' failed to connect:`, error)
    setStatus(uri, { state: 'error', error: message })
    // keep retrying transient failures (registration errors leave the frame alive, so `closed`
    // never fires - the reconnect has to come from here)
    scheduleReconnect(uri, attempt + 1)
    throw error
  }
}

const cancelReconnect = (uri: string) => {
  const timer = retryTimers.get(uri)
  if (timer !== undefined) { clearTimeout(timer); retryTimers.delete(uri) }
}

export const enablePlugin = async (uri: string): Promise<void> => {
  saveEnabled([...new Set([...loadEnabled(), uri])])
  await connectPlugin(uri)
}

export const disablePlugin = async (uri: string): Promise<void> => {
  saveEnabled(loadEnabled().filter(enabled => enabled !== uri))
  cancelReconnect(uri)
  connected.delete(uri)
  statuses.delete(uri)
  unregisterRemoteSource(uri)
  await packages.uninstall(uri).catch(() => {})
  notify()
}

// FKN-rendered picker over npm packages tagged fkn-plugin--stub; picked ones install and connect
export const addPlugins = async (): Promise<void> => {
  const picked = await packages.pick(
    { type: 'plugin', id: 'stub' },
    { multiple: true, title: 'Add stub sources' },
  )
  for (const result of picked) {
    await enablePlugin(result.uri).catch(() => {})
  }
}

// reconnect enabled plugins on boot; failures surface in the settings page status list
for (const uri of loadEnabled()) {
  connectPlugin(uri).catch(() => {})
}
