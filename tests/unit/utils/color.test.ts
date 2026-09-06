import { describe, expect, test } from 'vitest'

import { accentVars, hexToRgba } from '../../../src/utils/color'

describe('hexToRgba', () => {
  test('both hex lengths', () => {
    expect(hexToRgba('#e4a15d', 1)).toBe('rgba(228, 161, 93, 1)')
    expect(hexToRgba('#fff', 0.5)).toBe('rgba(255, 255, 255, 0.5)')
    expect(hexToRgba('e4a15d', 0.2)).toBe('rgba(228, 161, 93, 0.2)')
  })

  // Only AniList publishes a cover colour, so most media have none and a few could carry anything.
  // Both have to land on the same answer, because both take the same fallback.
  test('anything that is not a hex triplet answers nothing', () => {
    expect(hexToRgba(null, 1)).toBeUndefined()
    expect(hexToRgba(undefined, 1)).toBeUndefined()
    expect(hexToRgba('', 1)).toBeUndefined()
    expect(hexToRgba('rgb(1, 2, 3)', 1)).toBeUndefined()
    expect(hexToRgba('#12345', 1)).toBeUndefined()
    expect(hexToRgba('#gggggg', 1)).toBeUndefined()
  })
})

describe('accentVars', () => {
  test('a colour supplies all three tints', () => {
    expect(accentVars('#e4a15d')).toEqual({
      '--accent': 'rgba(228, 161, 93, 1)',
      '--accent-soft': 'rgba(228, 161, 93, 0.18)',
      '--accent-wash': 'rgba(228, 161, 93, 0.07)',
    })
  })

  test('no colour still supplies all three, so nothing renders unstyled', () => {
    const vars = accentVars(null)
    expect(Object.keys(vars)).toEqual(['--accent', '--accent-soft', '--accent-wash'])
    for (const value of Object.values(vars)) expect(value).toMatch(/^rgba\(255, 255, 255/)
  })
})
