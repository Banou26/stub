// Zooming has one property that matters and it is easy to lose: whatever is under the pointer must
// stay under the pointer. A version that scales about the origin passes every "did it get bigger"
// check and feels broken to use, because the thing you aimed at slides away as it grows.
import { describe, expect, test } from 'vitest'

import { IDENTITY, MAX_SCALE, MIN_SCALE, clampScale, fit, panBy, toContent, zoomAt } from '../../../src/utils/viewport'

describe('zoomAt', () => {
  test('leaves the content under the pointer exactly where it was', () => {
    const before = { x: 40, y: -15, k: 1.3 }
    const [px, py] = [420, 260]
    const anchor = toContent(before, px, py)
    for (const factor of [1.2, 0.8, 2, 0.5, 1.05]) {
      const after = zoomAt(before, px, py, factor)
      const moved = toContent(after, px, py)
      expect(moved.x, `factor ${factor}`).toBeCloseTo(anchor.x, 6)
      expect(moved.y, `factor ${factor}`).toBeCloseTo(anchor.y, 6)
    }
  })

  test('and the naive version really would move it, so the check above is not vacuous', () => {
    // the bug this guards: scale the offsets and forget the anchor
    const before = { x: 40, y: -15, k: 1.3 }
    const naive = { k: before.k * 2, x: before.x * 2, y: before.y * 2 }
    const anchor = toContent(before, 420, 260)
    expect(toContent(naive, 420, 260).x).not.toBeCloseTo(anchor.x, 3)
  })

  test('actually changes the scale, in the direction asked', () => {
    expect(zoomAt(IDENTITY, 0, 0, 2).k).toBe(2)
    expect(zoomAt(IDENTITY, 0, 0, 0.5).k).toBe(0.5)
  })

  test('stops at the limits rather than running away', () => {
    expect(zoomAt({ x: 0, y: 0, k: MAX_SCALE }, 100, 100, 4).k).toBe(MAX_SCALE)
    expect(zoomAt({ x: 0, y: 0, k: MIN_SCALE }, 100, 100, 0.25).k).toBe(MIN_SCALE)
  })

  test('and a wheel spun past a limit leaves the picture completely still', () => {
    const stuck = { x: 33, y: 77, k: MAX_SCALE }
    expect(zoomAt(stuck, 100, 100, 4)).toEqual(stuck)
  })

  test('nonsense factors are ignored rather than blanking the view', () => {
    for (const factor of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(zoomAt({ x: 5, y: 6, k: 1 }, 10, 10, factor)).toEqual({ x: 5, y: 6, k: 1 })
    }
  })
})

describe('panBy', () => {
  test('moves the drawing and never resizes it', () => {
    expect(panBy({ x: 10, y: 20, k: 2 }, -30, 15)).toEqual({ x: -20, y: 35, k: 2 })
  })

  test('and has no bounds, which is the whole reason it is not a scroll offset', () => {
    expect(panBy(IDENTITY, -100_000, -100_000)).toEqual({ x: -100_000, y: -100_000, k: 1 })
  })
})

describe('clampScale', () => {
  test('holds the range', () => {
    expect(clampScale(1000)).toBe(MAX_SCALE)
    expect(clampScale(0.000_1)).toBe(MIN_SCALE)
    expect(clampScale(2)).toBe(2)
  })

  test('and a broken number reads as no zoom rather than as NaN', () => {
    expect(clampScale(Number.NaN)).toBe(1)
  })
})

describe('fit', () => {
  test('centres a drawing in its window', () => {
    const view = fit({ width: 200, height: 100 }, { width: 1000, height: 500 }, 0)
    expect(view.k).toBe(1)
    expect(view.x).toBe(400)
    expect(view.y).toBe(200)
  })

  test('shrinks one that does not fit, and keeps it centred', () => {
    const view = fit({ width: 2000, height: 100 }, { width: 1000, height: 500 }, 0)
    expect(view.k).toBe(0.5)
    expect(view.x).toBe(0)
  })

  test('never blows a small graph up to fill the window', () => {
    // two works in a wide dialog scaled to fit would read as a mistake
    expect(fit({ width: 100, height: 50 }, { width: 4000, height: 2000 }, 0).k).toBe(1)
  })

  test('and an empty drawing gives an untouched view rather than dividing by zero', () => {
    expect(fit({ width: 0, height: 0 }, { width: 800, height: 600 })).toEqual(IDENTITY)
  })
})
