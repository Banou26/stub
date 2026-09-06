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
 * What crosses the room, in two classes.
 *
 * HOST ONLY: `nav` and `scroll` are where the host is, `cursor` is where the host is pointing,
 * `playback` is what the host's player did, and `state` is location, scroll and playback at once,
 * sent to whoever just joined so they land where the party already is. A follower drops any of these
 * from anyone but the room's owner, whatever the api let through.
 *
 * ANYONE: `chat` is a line of text for the room, `name` is what the sender wants to be called, and
 * `ping` is a follower timing a round trip so it can tell the host's clock from its own.
 *
 * `pong` is host only and is the reply to one ping: it carries the asker's own `at` back untouched
 * plus the host's clock at the moment it answered, which is everything Cristian's algorithm needs
 * (see clock.ts). `n` is the asker's nonce, since every member hears every reply.
 */
export type PartyMessage =
  | { t: 'nav', path: string }
  | { t: 'scroll', y: number }
  | { t: 'cursor', x: number, y: number }
  | { t: 'playback', s: PlaybackState }
  | { t: 'state', path: string, y: number, s?: PlaybackState }
  | { t: 'chat', text: string }
  | { t: 'name', name: string }
  | { t: 'ping', n: number, at: number }
  | { t: 'pong', n: number, at: number, host: number }

const HOST_ONLY: ReadonlySet<PartyMessage['t']> = new Set(['nav', 'scroll', 'cursor', 'playback', 'state', 'pong'])

/** Whether a message is the host steering the party, as opposed to anyone talking in it. */
export const isHostOnly = (message: PartyMessage): boolean => HOST_ONLY.has(message.t)

/** The longest chat line and name the room carries. The api's own cap is 4,096 bytes of the whole message. */
export const CHAT_MAX_CHARS = 500
export const NAME_MAX_CHARS = 32

/** A typed line or name as the wire carries it: trimmed, bounded, and nothing when empty. */
export const chatText = (raw: string): string | undefined => {
  const text = raw.trim().slice(0, CHAT_MAX_CHARS)
  return text ? text : undefined
}
export const displayName = (raw: string): string | undefined => {
  const name = raw.trim().replace(/\s+/g, ' ').slice(0, NAME_MAX_CHARS)
  return name ? name : undefined
}

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
    case 'cursor':
      return isFraction(value.x) && isFraction(value.y) ? { t: 'cursor', x: value.x, y: value.y } : undefined
    case 'chat': {
      const text = typeof value.text === 'string' ? chatText(value.text) : undefined
      return text ? { t: 'chat', text } : undefined
    }
    case 'name': {
      const name = typeof value.name === 'string' ? displayName(value.name) : undefined
      return name ? { t: 'name', name } : undefined
    }
    case 'ping':
      return isStamp(value.n) && isStamp(value.at) ? { t: 'ping', n: value.n, at: value.at } : undefined
    case 'pong':
      return isStamp(value.n) && isStamp(value.at) && isStamp(value.host)
        ? { t: 'pong', n: value.n, at: value.at, host: value.host }
        : undefined
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

/**
 * A number a clock exchange may carry.
 *
 * Finite is the whole requirement and it is load bearing: a NaN or an Infinity anywhere in the
 * arithmetic makes the offset NaN, and a NaN offset silently turns every target time into NaN, which
 * a player takes as a seek to nowhere. Sign is not checked, since an offset is a difference.
 */
const isStamp = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

const isFraction = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1

/** Whether a value is a playback state a follower could act on. A package's report is vetted with it before it reaches the room. */
export const isPlaybackState = (value: unknown): value is PlaybackState => {
  if (!value || typeof value !== 'object') return false
  const state = value as Record<string, unknown>
  return typeof state.paused === 'boolean'
    && typeof state.time === 'number' && Number.isFinite(state.time) && state.time >= 0
    && typeof state.rate === 'number' && Number.isFinite(state.rate) && state.rate > 0 && state.rate <= 16
    && typeof state.at === 'number' && Number.isFinite(state.at)
}
