// Which box a page actually scrolls, and where in it the party is.
//
// Separate from the component so it can be driven against a fake document: the failure it exists for
// is silent (a host scrolls, every follower stays put) and reproducing it needs a container that
// scrolls while the page does not.

/**
 * The element a page scrolls, which is not always the page.
 *
 * A dialog that locks the body and scrolls inside itself (the media modal is one) leaves
 * `window.scrollY` frozen, so a host scrolling through it sent 0 for ever and no follower moved.
 * The marker is opt in: an overlay that wants the party to follow it says so with
 * `data-party-scroll`, and everything else stays the document. Innermost wins, and only if it can
 * actually scroll, so a marked container shorter than its box hands back to the page under it.
 */
export const PARTY_SCROLL = '[data-party-scroll]'

export const scroller = (): Element | undefined => {
  const marked = document.querySelectorAll(PARTY_SCROLL)
  for (let index = marked.length - 1; index >= 0; index--) {
    const element = marked[index]!
    if (element.scrollHeight - element.clientHeight > 0) return element
  }
  return undefined
}

const fraction = (position: number, room: number) => room > 0 ? Math.min(1, Math.max(0, position / room)) : 0

export const scrollFraction = () => {
  const element = scroller()
  if (element) return fraction(element.scrollTop, element.scrollHeight - element.clientHeight)
  return fraction(window.scrollY, document.documentElement.scrollHeight - window.innerHeight)
}

/**
 * How far a follower will GLIDE rather than jump, in screenfuls of whichever box is scrolling.
 *
 * It is a budget on the TIME a viewer spends watching the page travel, expressed in distance because
 * that is what the caller has. Measured on Chromium 149, a 720px box, 2026-09-07:
 *
 * | distance | glide |
 * | --- | --- |
 * | 200px | 289ms |
 * | 720px (one screen) | 515ms |
 * | 1,440px (this cap) | 698ms |
 * | 2,160px | 849ms |
 * | 10,000px | 1,565ms |
 *
 * So the duration grows sub-linearly and never runs away; what does run away is how long somebody is
 * made to watch content nobody chose to see. Around 700ms a follow still reads as following. Past it
 * the honest move is to be there already.
 *
 * Note what this is NOT: it is not about finishing before the host's next position arrives. The host
 * sends twice a second (SCROLL_HZ in components/party-sync.tsx) so at this cap the next one lands
 * mid-glide, and that is fine. A retargeted smooth scroll keeps going from where it is, which is
 * exactly the continuous motion this exists for. An earlier version of this comment claimed the
 * opposite and the measurement above is what corrected it.
 */
export const MAX_SMOOTH_SCREENS = 2

/**
 * Whether this viewer asked not to be animated.
 *
 * Guarded rather than assumed: `matchMedia` is absent in some embedded and test realms, and a throw
 * here would take the whole follow down over a preference.
 */
const prefersReducedMotion = (): boolean => {
  try { return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true } catch { return false }
}

/**
 * Glide only when it was asked for, the viewer allows animation, and the distance is short enough to
 * land. Everything else is `instant`, which is not the same as `auto`.
 *
 * `auto` defers to the element's `scroll-behavior` css, so under a stylesheet that sets
 * `scroll-behavior: smooth` it would animate anyway: the reduced-motion guard and the distance cap
 * would both quietly do nothing. `instant` forbids the animation whatever the css says, which is what
 * both of them mean. Nothing in this repo sets that property today, so this is about staying correct
 * rather than fixing something visible.
 */
const behaviorFor = (smooth: boolean | undefined, distance: number, screen: number): ScrollBehavior => {
  if (!smooth || prefersReducedMotion()) return 'instant'
  return distance <= screen * MAX_SMOOTH_SCREENS ? 'smooth' : 'instant'
}

export type ScrollOptions = {
  /**
   * Glide to the position instead of jumping to it.
   *
   * For FOLLOWING a host who is scrolling, where a jump every half second reads as a stutter. Not for
   * landing on a page that has just rendered, or for a jump the viewer asked for: there the point is
   * to be where the host is, and gliding there from the top is a slow crawl through content nobody
   * chose to see. Downgraded to a jump on its own whenever the distance would take too long; see
   * `MAX_SMOOTH_SCREENS`.
   */
  smooth?: boolean
}

export const scrollTo = (value: number, { smooth }: ScrollOptions = {}) => {
  const element = scroller()
  if (element) {
    const room = element.scrollHeight - element.clientHeight
    const top = room > 0 ? value * room : 0
    element.scrollTo({ top, behavior: behaviorFor(smooth, Math.abs(top - element.scrollTop), element.clientHeight) })
    return
  }
  const room = document.documentElement.scrollHeight - window.innerHeight
  const top = room > 0 ? value * room : 0
  window.scrollTo({ top, behavior: behaviorFor(smooth, Math.abs(top - window.scrollY), window.innerHeight) })
}
