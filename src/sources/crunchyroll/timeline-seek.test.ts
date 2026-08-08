import type { Frame, RemoteVideoElement } from '@fkn/lib'

import { describe, expect, test } from 'vite-plus/test'

import { withTimelineSeek } from './timeline-seek'

/**
 * The one genuinely new mechanism in the Crunchyroll player, and the only part of it a unit test can
 * reach: everything else needs a logged-in session and a real Bitmovin player.
 *
 * A bare `video.currentTime = t` only lands inside the range Bitmovin has already buffered, so a seek
 * past it silently hangs. Every write is mirrored onto Crunchyroll's own `.timeline-slider` instead,
 * and the mirror has to survive whatever wraps the media on the way through the player's store.
 */
const makeFrame = () => {
  const fills: { value: string, reason?: string }[] = []
  const frame = {
    locator: () => ({
      fill: (value: string, options?: { reason?: string }) => {
        fills.push({ value, reason: options?.reason })
        return Promise.resolve()
      },
    }),
  } as unknown as Frame
  return { frame, fills }
}

/**
 * Shaped like the real handle in the one way that matters here: `addEventListener` and friends are
 * OWN closures rather than the inherited EventTarget methods (see fkn/web-extension's
 * src/lib/revivables/video.ts). A native method reached through the Proxy would be invoked with the
 * proxy as `this`, fail its internal-slot check and throw "Illegal invocation", which would leave
 * the whole chrome deaf to the media's events.
 */
const makeRemote = () => {
  const target = new EventTarget()
  Object.defineProperties(target, {
    addEventListener: { configurable: true, value: target.addEventListener.bind(target) },
    removeEventListener: { configurable: true, value: target.removeEventListener.bind(target) },
    dispatchEvent: { configurable: true, value: target.dispatchEvent.bind(target) },
  })
  return Object.assign(target, {
    currentTime: 0,
    duration: 1200,
    paused: true,
    volume: 1,
  }) as unknown as RemoteVideoElement
}

describe('withTimelineSeek', () => {
  test('mirrors a currentTime write onto Crunchyroll\'s own scrubber', () => {
    const { frame, fills } = makeFrame()
    const media = withTimelineSeek(makeRemote(), frame)

    media.currentTime = 900

    // the slider's max is the duration in seconds, so the value goes across as plain seconds
    expect(fills).toEqual([{
      value: '900',
      // user-visible permission copy, fed to the extension's permission catalog: it has to survive verbatim
      reason: 'Seeks the video to the point you pick on the timeline.',
    }])
  })

  test('still performs the underlying write, rather than replacing it', () => {
    const { frame } = makeFrame()
    const remote = makeRemote()
    const media = withTimelineSeek(remote, frame)

    media.currentTime = 42

    // Bitmovin does honour a write inside the buffered range, and it is what the chrome reads back
    // to render the playhead, so intercepting must not mean swallowing.
    expect(remote.currentTime).toBe(42)
    expect(media.currentTime).toBe(42)
  })

  test('leaves every other property write alone', () => {
    const { frame, fills } = makeFrame()
    const remote = makeRemote()
    const media = withTimelineSeek(remote, frame)

    media.volume = 0.5

    expect(fills).toEqual([])
    expect(remote.volume).toBe(0.5)
  })

  test('ignores a currentTime that is not a finite number', () => {
    const { frame, fills } = makeFrame()
    const media = withTimelineSeek(makeRemote(), frame)

    // `fill` would stringify these into a value the slider cannot parse, and the seek would land
    // somewhere arbitrary rather than failing
    media.currentTime = NaN
    media.currentTime = Infinity

    expect(fills).toEqual([])
  })

  test('does not break the media\'s own event plumbing', () => {
    const { frame } = makeFrame()
    const remote = makeRemote()
    const media = withTimelineSeek(remote, frame)

    const seen: string[] = []
    // through the proxy, which is how the player's store subscribes
    expect(() => media.addEventListener('timeupdate', () => seen.push('timeupdate'))).not.toThrow()
    remote.dispatchEvent(new Event('timeupdate'))

    expect(seen).toEqual(['timeupdate'])
  })

  test('a rejected fill does not escape as an unhandled rejection', async () => {
    const frame = {
      locator: () => ({ fill: () => Promise.reject(new Error('the frame is gone')) }),
    } as unknown as Frame
    const media = withTimelineSeek(makeRemote(), frame)

    // the write is synchronous and the mirror is not, so a failure has nowhere to be awaited
    expect(() => { media.currentTime = 900 }).not.toThrow()
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
})
