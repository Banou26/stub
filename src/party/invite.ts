// The invite as a link and back. Pure and import-free for the reason ./protocol.ts gives.

/** The path a follower opens. The invite rides in the FRAGMENT, which a browser never sends to a server. */
export const PARTY_PATH = '/party'

/**
 * The link to share.
 *
 * The invite is the room id and the room key together, and the key is what lets anyone in. In the
 * fragment it reaches only the page that opens it: a path segment or a query string would land in
 * the static host's request logs, which is a copy of the key the room's own design says nobody keeps.
 */
export const partyLink = (origin: string, invite: string): string => `${origin}${PARTY_PATH}#${invite}`

/**
 * The invite out of a location fragment, or nothing.
 *
 * `<uuid>.<key>`, the shape `@fkn/lib` mints. Checked here so a mangled link (a chat client that
 * dropped the fragment, a copy that cut the key) answers "this link is broken" on the page rather
 * than an `invalid` from the broker with no context.
 */
export const inviteFromHash = (hash: string): string | undefined => {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash
  const invite = decodeURIComponent(raw).trim()
  return INVITE.test(invite) ? invite : undefined
}

const INVITE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[A-Za-z0-9_-]{40,50}$/
