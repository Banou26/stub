/**
 * The parts of an account session that have a right answer, kept out of the component.
 *
 * Plain TypeScript on purpose: this repo's vitest runs in `node` with no DOM, so anything left
 * inside a preact component cannot be tested here at all. The one rule below is exactly the kind
 * that is worth a test, because the way it fails is a UI that sits there forever saying it is
 * working.
 */

/**
 * How long a disconnect may take before the UI stops waiting on it.
 *
 * `account.logout()` in @fkn/lib is `await api.account.logout().catch(() => {})`, where `apiPromise`
 * resolves only once a broker connection exists and carries no cap of its own. So it can neither
 * fail nor time out: a broker that never establishes leaves the await pending for the life of the
 * page. Every other primitive in that library bounds itself (the parent handshake, the storage
 * read, the package fetch); the account surface is the one that does not, so the bound has to live
 * on this side of it.
 */
export const DISCONNECT_TIMEOUT_MS = 8_000

/**
 * What became of a disconnect.
 *
 * `timeout` is deliberately not an error. Nothing was observed, which is different from something
 * having gone wrong, and it is also different from success: a caller must not announce a disconnect
 * on the strength of it.
 */
export type DisconnectOutcome = 'settled' | 'timeout'

/**
 * Runs a disconnect that cannot hang.
 *
 * A rejection counts as `settled`, not as a failure to answer: the call came back, and the library
 * swallows its only error anyway, so a rejection here says nothing a caller can act on. The timer
 * is cleared on the way out rather than left to fire into nothing, because this runs on a page that
 * may stay open for hours.
 */
export const boundedDisconnect = async (
  logout: () => Promise<unknown>,
  timeoutMs: number = DISCONNECT_TIMEOUT_MS,
): Promise<DisconnectOutcome> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  const capped = new Promise<DisconnectOutcome>(resolve => {
    timer = setTimeout(() => resolve('timeout'), timeoutMs)
  })
  try {
    return await Promise.race([
      Promise.resolve()
        .then(logout)
        .then((): DisconnectOutcome => 'settled', (): DisconnectOutcome => 'settled'),
      capped
    ])
  } finally {
    clearTimeout(timer)
  }
}
