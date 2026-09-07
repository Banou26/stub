// The invite as a link and back. Pure and import-free for the reason ./protocol.ts gives.

/** The path a follower opens. The invite rides in the FRAGMENT, which a browser never sends to a server. */
export const PARTY_PATH = '/party'

/**
 * The link to share.
 *
 * The invite is the room id and the room key together, and the key is what lets anyone in. In the
 * fragment it reaches only the page that opens it: a path segment or a query string would land in
 * the static host's request logs, which is a copy of the key the room's own design says nobody keeps.
 *
 * A room id is `<scope>/<name>` and this app's scope IS its origin, so the full invite names the
 * origin a second time, right after the link already said it. The scope is dropped when it matches
 * the link being built and put back when one is read, which is a change of presentation and nothing
 * else: the string handed to `@fkn/lib` is the same either way. Cross-origin invites keep their
 * scope, since there the second origin is the whole point.
 */
export const partyLink = (origin: string, invite: string): string =>
  `${origin}${PARTY_PATH}#${withoutScope(origin, invite)}`

/**
 * The invite out of a location fragment, or nothing.
 *
 * Takes both shapes: `<key>.<scope>/<name>` as `@fkn/lib` mints it, and the `<key>.<name>` this file
 * writes into a link, which is scoped to the origin reading it. Checked here so a mangled link (a
 * chat client that dropped the fragment, a copy that cut the key) answers "this link is broken" on
 * the page rather than an `invalid` from the broker with no context.
 */
export const inviteFromHash = (hash: string, origin: string): string | undefined => {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash
  // a stray percent is a broken link, not a crash: decodeURIComponent throws on one
  let invite: string
  try { invite = decodeURIComponent(raw).trim() } catch { return undefined }
  if (INVITE.test(invite)) return invite
  if (!SHORT.test(invite)) return undefined
  const dot = invite.indexOf('.')
  const full = `${invite.slice(0, dot)}.${origin}/${invite.slice(dot + 1)}`
  // the origin came from the browser, but the result is what reaches the broker, so it is checked like any other
  return INVITE.test(full) ? full : undefined
}

/** The key never carries a dot and a name never carries a slash, so both splits are unambiguous. */
const withoutScope = (origin: string, invite: string): string => {
  const dot = invite.indexOf('.')
  const room = invite.slice(dot + 1)
  const slash = room.lastIndexOf('/')
  return slash > 0 && room.slice(0, slash) === origin ? `${invite.slice(0, dot)}.${room.slice(slash + 1)}` : invite
}

const KEY = '[A-Za-z0-9_-]{43}'
// lowercase, no slash: the room grammar `@fkn/lib` enforces, mirrored so a bad link is caught here
const NAME = '[a-z0-9][a-z0-9._-]{0,63}'
// the 43-character key leads and the room id, `<scope>/<name>`, runs to the end
const INVITE = new RegExp(`^${KEY}\\.[\\x21-\\x7e]{1,256}\\/${NAME}$`)
// the same link with this origin's scope left out
const SHORT = new RegExp(`^${KEY}\\.${NAME}$`)
