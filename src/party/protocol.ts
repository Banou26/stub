// What crosses the room, as data. Pure and import-free so it can be tested: the store that sends it
// reaches @fkn/lib, which cannot load under vitest.

/** What the host's player is doing, as the followers are told it. `at` is the host's own clock. */
export type PlaybackState = {
  paused: boolean
  time: number
  rate: number
  at: number
}

/**
 * Everything the host says. Followers say nothing: the room is created with `send` off by default,
 * so a follower's message is refused by the api before any follower could hear it.
 *
 * `nav` and `scroll` are where the host is, `playback` is what the host's player did, and `state` is
 * all three at once, sent to whoever just joined so they land where the party already is.
 */
export type PartyMessage =
  | { t: 'nav', path: string }
  | { t: 'scroll', y: number }
  | { t: 'playback', s: PlaybackState }
  | { t: 'state', path: string, y: number, s?: PlaybackState }

/** Bumped when a message shape changes; a follower on another version ignores what it cannot read. */
export const PARTY_PROTOCOL = 1

export const encodePartyMessage = (message: PartyMessage): string =>
  JSON.stringify({ v: PARTY_PROTOCOL, ...message })

/**
 * A room message as a party message, or nothing.
 *
 * Nothing rather than a throw for every way it can be wrong: another version, a text that is not
 * JSON, a shape a field short, a path that would leave the app. A follower applies what it decodes
 * to its own location bar, so a message it cannot vouch for has to fall on the floor.
 */
export const decodePartyMessage = (text: string): PartyMessage | undefined => {
  let raw: unknown
  try { raw = JSON.parse(text) } catch { return undefined }
  if (!raw || typeof raw !== 'object') return undefined
  const value = raw as Record<string, unknown>
  if (value.v !== PARTY_PROTOCOL) return undefined

  switch (value.t) {
    case 'nav':
      return isAppPath(value.path) ? { t: 'nav', path: value.path } : undefined
    case 'scroll':
      return isFraction(value.y) ? { t: 'scroll', y: value.y } : undefined
    case 'playback':
      return isPlaybackState(value.s) ? { t: 'playback', s: value.s } : undefined
    case 'state': {
      if (!isAppPath(value.path) || !isFraction(value.y)) return undefined
      if (value.s !== undefined && !isPlaybackState(value.s)) return undefined
      return { t: 'state', path: value.path, y: value.y, ...value.s ? { s: value.s } : {} }
    }
    default:
      return undefined
  }
}

/**
 * Whether a string is a path INSIDE this app.
 *
 * A follower hands a decoded path straight to the router, so this is the one place that decides what
 * a host can make a follower open. A single leading slash and nothing else: `//host` is a
 * protocol-relative url, and a scheme or a backslash is a browser reinterpreting the string.
 */
export const isAppPath = (value: unknown): value is string =>
  typeof value === 'string'
  && value.length > 0
  && value.length <= 2048
  && value.startsWith('/')
  && !value.startsWith('//')
  && !value.startsWith('/\\')
  && !/[\r\n\t]/.test(value)

const isFraction = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1

const isPlaybackState = (value: unknown): value is PlaybackState => {
  if (!value || typeof value !== 'object') return false
  const state = value as Record<string, unknown>
  return typeof state.paused === 'boolean'
    && typeof state.time === 'number' && Number.isFinite(state.time) && state.time >= 0
    && typeof state.rate === 'number' && Number.isFinite(state.rate) && state.rate > 0 && state.rate <= 16
    && typeof state.at === 'number' && Number.isFinite(state.at)
}
