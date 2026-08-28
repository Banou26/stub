import { afterEach, describe, expect, it, vi } from 'vitest'

import { boundedDisconnect, DISCONNECT_TIMEOUT_MS } from './account-session'

/**
 * A disconnect that cannot hang.
 *
 * The bug this exists for: `account.logout()` awaits a broker connection that may never happen, and
 * it swallows its only error, so it can neither fail nor return. The widget set a "Disconnecting..."
 * label before awaiting it, which meant a broker that never answered left that label on screen
 * until the page was reloaded, with no error anywhere and nothing to click.
 *
 * Everything here is about the shape of the answer rather than its content. `timeout` must not be
 * reported as success, because nothing was observed, and it must not be reported as failure either,
 * because nothing went wrong.
 */

afterEach(() => { vi.useRealTimers() })

describe('bounding a disconnect', () => {
  it('reports settled when the call comes back', async () => {
    await expect(boundedDisconnect(async () => {})).resolves.toBe('settled')
  })

  /**
   * A rejection is still an answer. The library swallows its own error before this ever sees one,
   * so a rejection here carries no information a caller could act on, and treating it as "no answer"
   * would start the clock on something that already finished.
   */
  it('treats a rejection as an answer, not as a hang', async () => {
    await expect(boundedDisconnect(async () => { throw new Error('broker said no') })).resolves.toBe('settled')
  })

  it('survives a callback that throws before returning a promise', async () => {
    await expect(boundedDisconnect(() => { throw new Error('sync') })).resolves.toBe('settled')
  })

  /** THE BUG: without the cap this promise never settles and the caller waits for the page's life. */
  it('gives up on a call that never comes back', async () => {
    vi.useFakeTimers()
    const outcome = boundedDisconnect(() => new Promise<void>(() => {}))
    await vi.advanceTimersByTimeAsync(DISCONNECT_TIMEOUT_MS + 1)
    await expect(outcome).resolves.toBe('timeout')
  })

  it('waits the whole window before giving up, rather than cutting a slow answer short', async () => {
    vi.useFakeTimers()
    let done = () => {}
    const outcome = boundedDisconnect(() => new Promise<void>(resolve => { done = resolve }))

    await vi.advanceTimersByTimeAsync(DISCONNECT_TIMEOUT_MS - 100)
    done()
    await expect(outcome).resolves.toBe('settled')
  })

  it('takes a shorter window when asked, so a caller is not stuck with the default', async () => {
    vi.useFakeTimers()
    const outcome = boundedDisconnect(() => new Promise<void>(() => {}), 50)
    await vi.advanceTimersByTimeAsync(51)
    await expect(outcome).resolves.toBe('timeout')
  })

  /**
   * The timer is cleared on the way out. This page stays open for hours, and a disconnect that
   * answered immediately should not leave something pending for another eight seconds.
   */
  it('leaves no timer behind once the call has answered', async () => {
    vi.useFakeTimers()
    await boundedDisconnect(async () => {})
    expect(vi.getTimerCount()).toBe(0)
  })

  it('calls the disconnect exactly once', async () => {
    const logout = vi.fn(async () => {})
    await boundedDisconnect(logout)
    expect(logout).toHaveBeenCalledTimes(1)
  })
})
