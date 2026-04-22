import type { Frame } from '@fkn/lib'


// Crunchyroll ships Bitmovin for playback. Bitmovin drives its own MSE
// segment fetcher off *its* UI events, not off raw `video.currentTime`
// writes — so a bare proxy setter only reaches inside the already-
// buffered range; anything outside lets the browser fire `seeking`
// but no bytes get fetched and the video hangs.
//
// CR's timeline is a native `<input type="range">` (class
// `.timeline-slider`) whose `max` matches the video's duration in
// seconds. Driving that input with the locator's `fill` makes React's
// onChange fire, which tells Bitmovin's scheduler to seek and re-fetch
// segments just like a user drag would. No arbitrary-code bridge into
// the frame needed — we only touch a named element, with a numeric
// value, through the existing locator actions.

const CR_TIMELINE_SELECTOR = '.timeline-slider'

// Generic over the handle type so the caller's structural `VideoHandle`
// shape flows through the wrapper unchanged — useful because stub's
// @fkn/lib doesn't re-export the revivable's type, so each consumer
// declares its own structural view of the handle.
export const wrapWithBitmovin = <T extends { currentTime: number }>(
  handle: T,
  frame: Frame,
): T => new Proxy(handle as T & object, {
  // Intercept `currentTime` writes only; every other property (reads,
  // other setters, methods, addEventListener, …) falls through to the
  // underlying VideoHandle unchanged.
  set(target, prop, value, receiver) {
    if (prop === 'currentTime' && typeof value === 'number' && Number.isFinite(value)) {
      // Fire asynchronously — the setter stays sync-ish so the player
      // UI reflects the optimistic value immediately. The resulting
      // `seeked` event from Bitmovin will reconcile state.
      ;(frame.locator(CR_TIMELINE_SELECTOR) as unknown as { fill: (v: string) => Promise<unknown> })
        .fill(String(value))
        .catch(err => console.warn('[cr-bitmovin] timeline fill failed:', err))
    }
    return Reflect.set(target, prop, value, receiver)
  },
})
