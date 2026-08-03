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
  /** every source the package registered; one package may ship a family of them */
  sources?: { origin: string, name: string }[]
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

const CONNECT_TIMEOUT_MS = 45_000

const withDeadline = <T>(promise: Promise<T>, message: string): Promise<T> =>
  Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(message)), CONNECT_TIMEOUT_MS)),
  ])

const connected = new Set<string>()
const retryTimers = new Map<string, ReturnType<typeof setTimeout>>()
const RECONNECT_MAX_MS = 30_000

// Reconnect an enabled plugin after a failure or a frame death, backing off up to RECONNECT_MAX_MS.
// Idempotent: a pending timer or a live connection short-circuits, so the closed handler and the
// connect catch can both call it without stacking retries.
const scheduleReconnect = (uri: string, attempt: number) => {
  if (!loadEnabled().includes(uri) || connected.has(uri) || retryTimers.has(uri)) return
  // Keep a recorded failure on screen while the retry is pending. Overwriting it with 'connecting'
  // happens in the same tick as the catch that set it, so the reason was never observable at all and
  // a plugin that can never connect looked exactly like a slow one.
  if (statuses.get(uri)?.state !== 'error') setStatus(uri, { state: 'connecting' })
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
    // `connected` is claimed before the attempt succeeds, so an attempt that never settles holds the
    // slot forever and every retry short-circuits on the guard above: the plugin reads 'connecting'
    // for the rest of the session with nothing logged. Bound the whole attempt so a hang anywhere in
    // the chain becomes an ordinary failure that the retry path can act on.
    const { port, closed } = await withDeadline<{ port: MessagePort, closed: Promise<void> }>(
      packages.connect(uri, { protocol: STUB_SOURCE_PROTOCOL, raw: true }),
      `connecting to '${uri}' timed out`,
    )
    // wire teardown BEFORE the worker handshake: a frame death mid-registration must still recover
    closed.then(() => {
      connected.delete(uri)
      unregisterRemoteSource(uri)
      scheduleReconnect(uri, 1)
    })
    // race registration against the frame dying, so a mid-handshake death does not hang here
    const result = await withDeadline(Promise.race([
      registerRemoteSource(port, uri),
      closed.then(() => ({ error: 'the package closed before the source registered' as string })),
    ]), `'${uri}' connected but never registered its source`)
    if ('error' in result) throw new Error(result.error)
    setStatus(uri, { state: 'connected', sources: result.ok.sources })
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

// Install first, and only persist once it took: FKN refuses to connect a package this app has not
// installed, and a mistyped address that went straight to the enabled list would be retried forever.
// Idempotent, so the picker path (which installs as part of picking) re-enters it for free.
//
// Key everything on the id FKN hands back, never the string the caller passed. FKN canonicalizes a
// version away ('npm:x@1.2.3' installs as 'npm:x'), so keeping the raw spelling would show one
// package as two rows whose Remove button uninstalls the other one's record.
export const enablePlugin = async (uri: string): Promise<void> => {
  const installed = await packages.install(uri)
  if (!installed) return
  saveEnabled([...new Set([...loadEnabled(), installed.uri])])
  await connectPlugin(installed.uri)
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
