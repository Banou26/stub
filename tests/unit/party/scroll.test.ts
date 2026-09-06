// A host scrolling a dialog that locks the page moved no follower at all, and nothing said so: the
// page's own scrollY never changes, so every message carried 0 and every follower obediently went to
// the top. These drive a document where the page and a marked container disagree.
import { afterEach, describe, expect, test, vi } from 'vitest'

import { scrollFraction, scrollTo } from '../../../src/party/scroll'

type Box = { scrollTop: number, scrollHeight: number, clientHeight: number, scrollTo: (options: { top: number }) => void }

const box = ({ scrollTop = 0, scrollHeight = 2_000, clientHeight = 1_000 } = {}): Box => {
  const element = {
    scrollTop,
    scrollHeight,
    clientHeight,
    scrollTo: ({ top }: { top: number }) => { element.scrollTop = top },
  }
  return element
}

/** A document with a page of its own height, and whichever marked containers a test wants. */
const world = ({ marked = [] as Box[], pageY = 0, pageHeight = 4_000, viewport = 1_000 } = {}) => {
  const scrolled: number[] = []
  vi.stubGlobal('document', {
    querySelectorAll: (selector: string) => selector === '[data-party-scroll]' ? marked : [],
    documentElement: { scrollHeight: pageHeight },
  })
  vi.stubGlobal('window', {
    scrollY: pageY,
    innerHeight: viewport,
    scrollTo: ({ top }: { top: number }) => { scrolled.push(top) },
  })
  return { scrolled }
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
