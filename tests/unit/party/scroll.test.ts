// A host scrolling a dialog that locks the page moved no follower at all, and nothing said so: the
// page's own scrollY never changes, so every message carried 0 and every follower obediently went to
// the top. These drive a document where the page and a marked container disagree.
import { afterEach, describe, expect, test, vi } from 'vitest'

import { MAX_SMOOTH_SCREENS, scrollFraction, scrollTo } from '../../../src/party/scroll'

type Scroll = { top: number, behavior?: ScrollBehavior }
type Box = { scrollTop: number, scrollHeight: number, clientHeight: number, scrolls: Scroll[], scrollTo: (options: Scroll) => void }

const box = ({ scrollTop = 0, scrollHeight = 2_000, clientHeight = 1_000 } = {}): Box => {
  const element = {
    scrollTop,
    scrollHeight,
    clientHeight,
    scrolls: [] as Scroll[],
    scrollTo: ({ top, behavior }: Scroll) => { element.scrolls.push({ top, behavior }); element.scrollTop = top },
  }
  return element
}

/** A document with a page of its own height, and whichever marked containers a test wants. */
const world = ({ marked = [] as Box[], pageY = 0, pageHeight = 4_000, viewport = 1_000, reducedMotion = false, noMatchMedia = false } = {}) => {
  const scrolled: number[] = []
  const scrolls: Scroll[] = []
  vi.stubGlobal('document', {
    querySelectorAll: (selector: string) => selector === '[data-party-scroll]' ? marked : [],
    documentElement: { scrollHeight: pageHeight },
  })
  vi.stubGlobal('window', {
    scrollY: pageY,
    innerHeight: viewport,
    scrollTo: ({ top, behavior }: Scroll) => { scrolled.push(top); scrolls.push({ top, behavior }) },
    // matched EXACTLY, so a wrong or misspelled query reads as "no preference" here rather than
    // quietly passing: a stub that accepts anything containing "reduce" cannot see the wrong question
    ...(noMatchMedia ? {} : { matchMedia: (query: string) => ({ matches: reducedMotion && query === '(prefers-reduced-motion: reduce)' }) }),
  })
  return { scrolled, scrolls }
}

afterEach(() => { vi.unstubAllGlobals() })

describe('scrollFraction', () => {
  test('reads the page when nothing is marked', () => {
    world({ pageY: 750, pageHeight: 4_000, viewport: 1_000 })
    expect(scrollFraction()).toBeCloseTo(0.25)
  })

  test('reads the marked container instead, even while the page is frozen at the top', () => {
    // exactly the modal's shape: the body is locked, so scrollY stays 0 whatever the host does
    world({ marked: [box({ scrollTop: 250, scrollHeight: 2_000, clientHeight: 1_000 })], pageY: 0 })
    expect(scrollFraction()).toBeCloseTo(0.25)
  })

  test('the innermost marked container that can actually scroll wins', () => {
    const outer = box({ scrollTop: 900, scrollHeight: 2_000, clientHeight: 1_000 })
    const inner = box({ scrollTop: 100, scrollHeight: 1_500, clientHeight: 1_000 })
    world({ marked: [outer, inner] })
    expect(scrollFraction()).toBeCloseTo(0.2)
  })

  test('a marked container with nothing to scroll hands back to the page under it', () => {
    world({ marked: [box({ scrollTop: 0, scrollHeight: 800, clientHeight: 1_000 })], pageY: 1_500, pageHeight: 4_000, viewport: 1_000 })
    expect(scrollFraction()).toBeCloseTo(0.5)
  })
})

describe('scrollTo', () => {
  test('moves the marked container and leaves the page alone', () => {
    const modal = box({ scrollHeight: 2_000, clientHeight: 1_000 })
    const { scrolled } = world({ marked: [modal] })
    scrollTo(0.25)
    expect(modal.scrollTop).toBe(250)
    expect(scrolled, 'a follower that scrolled the page instead would sit at the top of a locked body').toEqual([])
  })

  test('moves the page when nothing is marked', () => {
    const { scrolled } = world({ pageHeight: 4_000, viewport: 1_000 })
    scrollTo(0.5)
    expect(scrolled).toEqual([1_500])
  })

  test('a fraction of a box with no room lands at the top rather than at NaN', () => {
    const flat = box({ scrollHeight: 1_000, clientHeight: 1_000 })
    const { scrolled } = world({ marked: [flat], pageHeight: 1_000, viewport: 1_000 })
    scrollTo(0.5)
    expect(scrolled).toEqual([0])
  })
})

// Following a host who is scrolling means a new position twice a second. Jumping to each in turn
// reads as a stutter, so the follow glides; everything else still jumps, and for reasons.
describe('gliding rather than jumping', () => {
  test('a follow inside the distance glides', () => {
    const modal = box({ scrollTop: 0, scrollHeight: 2_000, clientHeight: 1_000 })
    world({ marked: [modal] })
    scrollTo(0.25, { smooth: true })
    expect(modal.scrolls.at(-1)).toEqual({ top: 250, behavior: 'smooth' })
  })

  test('and jumps when it is not asked for, which is every arrival', () => {
    const modal = box({ scrollTop: 0, scrollHeight: 2_000, clientHeight: 1_000 })
    world({ marked: [modal] })
    scrollTo(0.25)
    expect(modal.scrolls.at(-1)).toEqual({ top: 250, behavior: 'instant' })
  })

  // The hazard the cap exists for: a glide whose duration outlasts the next message is retargeted
  // before it lands, so the follower trails for ever and never actually arrives anywhere.
  // Pinned as a NUMBER, not derived. Every fixture below is built from MAX_SMOOTH_SCREENS, so the
  // suite stayed green for any value at all: a cap of 99 screens, which is no cap, passed everything.
  test('the cap is two screenfuls, and changing it is a decision somebody has to make here', () => {
    expect(MAX_SMOOTH_SCREENS).toBe(2)

    // and the number means what it says: 2 screens of an 800px box glides, 2 screens and a bit does not
    const inside = box({ scrollTop: 0, scrollHeight: 1_600 + 800, clientHeight: 800 })
    world({ marked: [inside] })
    scrollTo(1, { smooth: true })
    expect(inside.scrolls.at(-1)).toEqual({ top: 1_600, behavior: 'smooth' })

    const outside = box({ scrollTop: 0, scrollHeight: 1_700 + 800, clientHeight: 800 })
    world({ marked: [outside] })
    scrollTo(1, { smooth: true })
    expect(outside.scrolls.at(-1)).toEqual({ top: 1_700, behavior: 'instant' })
  })

  test('a glide too far to land in time becomes a jump', () => {
    // Whole numbers on purpose: a fraction of a room that happens not to divide gives a top a
    // billionth off the cap, and a test that turns on that is measuring float arithmetic.
    const screen = 1_000
    const cap = MAX_SMOOTH_SCREENS * screen

    // room is exactly the cap, so the far end of this box is the furthest a glide will go
    const near = box({ scrollTop: 0, scrollHeight: cap + screen, clientHeight: screen })
    world({ marked: [near] })
    scrollTo(1, { smooth: true })
    expect(near.scrolls.at(-1), 'the cap itself still glides').toEqual({ top: cap, behavior: 'smooth' })

    // twice the cap away, which no animation would finish before the next position arrived
    const far = box({ scrollTop: 0, scrollHeight: cap * 2 + screen, clientHeight: screen })
    world({ marked: [far] })
    scrollTo(1, { smooth: true })
    expect(far.scrolls.at(-1), 'well past it does not').toEqual({ top: cap * 2, behavior: 'instant' })
  })

  test('the distance is measured from where the box already is, not from the top', () => {
    // a long page, but the host has only moved a little: that is a glide, however far down they both are
    const modal = box({ scrollTop: 50_000, scrollHeight: 100_000, clientHeight: 1_000 })
    world({ marked: [modal] })
    scrollTo(50_200 / (100_000 - 1_000), { smooth: true })
    expect(modal.scrolls.at(-1)?.behavior).toBe('smooth')
  })

  // `auto` would defer to the element's scroll-behavior css and animate anyway, so both the
  // reduced-motion guard and the distance cap would quietly do nothing under one stylesheet.
  test('what it asks for when it will not glide is instant, which css cannot override', () => {
    const modal = box({ scrollTop: 0, scrollHeight: 2_000, clientHeight: 1_000 })
    world({ marked: [modal], reducedMotion: true })
    scrollTo(0.25, { smooth: true })
    expect(modal.scrolls.at(-1)?.behavior, 'not auto: auto means whatever the css says').toBe('instant')

    const far = box({ scrollTop: 0, scrollHeight: MAX_SMOOTH_SCREENS * 2_000 + 1_000, clientHeight: 1_000 })
    world({ marked: [far] })
    scrollTo(1, { smooth: true })
    expect(far.scrolls.at(-1)?.behavior).toBe('instant')
  })

  test('a viewer who asked for less motion is never animated', () => {
    const modal = box({ scrollTop: 0, scrollHeight: 2_000, clientHeight: 1_000 })
    world({ marked: [modal], reducedMotion: true })
    scrollTo(0.25, { smooth: true })
    expect(modal.scrolls.at(-1)).toEqual({ top: 250, behavior: 'instant' })
  })

  test('a realm with no matchMedia still follows, rather than throwing over a preference', () => {
    const modal = box({ scrollTop: 0, scrollHeight: 2_000, clientHeight: 1_000 })
    world({ marked: [modal], noMatchMedia: true })
    expect(() => scrollTo(0.25, { smooth: true })).not.toThrow()
    expect(modal.scrolls.at(-1)?.behavior).toBe('smooth')
  })

  test('the page glides on the same terms as a container', () => {
    const { scrolls } = world({ pageY: 0, pageHeight: 4_000, viewport: 1_000 })
    scrollTo(0.5, { smooth: true })
    expect(scrolls.at(-1)).toEqual({ top: 1_500, behavior: 'smooth' })

    // 3,000 of room against a 1,000 viewport, so the far end is three screens away and past the cap.
    // It said this while using a 100,000px page, which is ninety-nine screens: true, and not a test of
    // the boundary at all.
    const far = world({ pageY: 0, pageHeight: 4_000, viewport: 1_000 })
    scrollTo(1, { smooth: true })
    expect(far.scrolls.at(-1)).toEqual({ top: 3_000, behavior: 'instant' })
  })

  test('a box with no room lands at the top whichever way it was asked', () => {
    const flat = box({ scrollHeight: 1_000, clientHeight: 1_000 })
    world({ marked: [flat], pageHeight: 1_000, viewport: 1_000 })
    scrollTo(0.5, { smooth: true })
    // the marked box cannot scroll, so the page under it is what moves, and it has no room either
    expect(flat.scrolls).toEqual([])
  })
})

// The guard around matchMedia is documented as load bearing, so it is worth one test: without it a
// realm that throws on the call takes the whole follow down over a preference nobody expressed.
describe('when asking about motion is what fails', () => {
  test('a matchMedia that throws still follows, and glides', () => {
    const modal = box({ scrollTop: 0, scrollHeight: 2_000, clientHeight: 1_000 })
    world({ marked: [modal] })
    vi.stubGlobal('window', {
      ...window,
      matchMedia: () => { throw new DOMException('not available in this realm') },
    })
    expect(() => scrollTo(0.25, { smooth: true })).not.toThrow()
    expect(modal.scrolls.at(-1)).toEqual({ top: 250, behavior: 'smooth' })
  })

  test('a matchMedia that answers nothing is treated as no preference', () => {
    const modal = box({ scrollTop: 0, scrollHeight: 2_000, clientHeight: 1_000 })
    world({ marked: [modal] })
    vi.stubGlobal('window', { ...window, matchMedia: () => undefined })
    expect(() => scrollTo(0.25, { smooth: true })).not.toThrow()
    expect(modal.scrolls.at(-1)?.behavior).toBe('smooth')
  })
})
