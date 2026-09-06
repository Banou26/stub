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

export const scrollTo = (value: number) => {
  const element = scroller()
  if (element) {
    const room = element.scrollHeight - element.clientHeight
    element.scrollTo({ top: room > 0 ? value * room : 0 })
    return
  }
  const room = document.documentElement.scrollHeight - window.innerHeight
  window.scrollTo({ top: room > 0 ? value * room : 0 })
}
