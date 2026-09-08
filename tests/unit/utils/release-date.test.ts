// The failure these exist for cannot be seen from Tokyo, which is where they were written.
//
// A source that names a DAY with no time gives `2024-01-07`, and `new Date('2024-01-07')` is midnight
// UTC. Formatted in the viewer's own zone that is January 6 anywhere west of Greenwich and January 7
// everywhere east of it, so on this machine (UTC+9) the wrong version and the right one are
// indistinguishable, in every episode of every run. These tests pin the zone rather than trusting the
// one they happen to run in.
import { afterEach, describe, expect, test } from 'vitest'

import { parseReleaseDate, releaseDateAttribute, releaseDateLabel } from '../../../src/utils/release-date'

const TZ = process.env.TZ

/** Node re-reads `process.env.TZ` per Date operation, so a zone can be pinned for one assertion. */
const inZone = <T>(zone: string, read: () => T): T => {
  process.env.TZ = zone
  try { return read() } finally { process.env.TZ = TZ }
}

afterEach(() => { if (TZ === undefined) delete process.env.TZ; else process.env.TZ = TZ })

describe('releaseDateLabel', () => {
  test('a day named without a time is that day everywhere, not the one before it', () => {
    // west of Greenwich is where the naive version fails, and it fails silently
    for (const zone of ['America/Los_Angeles', 'America/New_York', 'Pacific/Honolulu', 'UTC', 'Asia/Tokyo', 'Pacific/Kiritimati']) {
      expect(inZone(zone, () => releaseDateLabel('2024-01-07', { locale: 'en-US' })), zone).toBe('Jan 7, 2024')
    }
  })

  test('and the naive reading really would differ, so the test above is not vacuous', () => {
    // the control: the same instant formatted the way the bug formats it
    const naive = inZone('America/Los_Angeles', () =>
      new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date('2024-01-07')))
    expect(naive).toBe('Jan 6, 2024')
  })

  test('a value carrying a time is a real instant, so it reads where the viewer is', () => {
    // 2024-01-07T14:30Z is still the 7th in Los Angeles, and already the 8th in Tokyo
    const value = '2024-01-07T14:30:00.000Z'
    expect(inZone('America/Los_Angeles', () => releaseDateLabel(value, { locale: 'en-US' }))).toBe('Jan 7, 2024')
    expect(inZone('Asia/Tokyo', () => releaseDateLabel(value, { locale: 'en-US' }))).toBe('Jan 7, 2024')
    const late = '2024-01-07T20:00:00.000Z'
    expect(inZone('Asia/Tokyo', () => releaseDateLabel(late, { locale: 'en-US' }))).toBe('Jan 8, 2024')
  })

  test('there is nothing to show for a date nobody supplied', () => {
    for (const value of [undefined, null, '']) {
      expect(releaseDateLabel(value)).toBeUndefined()
    }
  })

  test('nor for one written in a shape nothing can read', () => {
    for (const value of ['tomorrow', 'TBA', '????-??-??', 'NaN', '2024-13-45']) {
      expect(releaseDateLabel(value), value).toBeUndefined()
    }
  })

  test('nor for a year no episode aired in, which is a parse succeeding on nonsense', () => {
    expect(releaseDateLabel('0000-01-01T00:00:00.000Z')).toBeUndefined()
    expect(releaseDateLabel('0001-01-01')).toBeUndefined()
  })

  test('but a genuinely old episode is not thrown away with them', () => {
    expect(releaseDateLabel('1963-11-23', { locale: 'en-US' })).toBe('Nov 23, 1963')
  })

  test('an episode that has not aired yet still has a date worth showing', () => {
    expect(releaseDateLabel('2099-06-01', { locale: 'en-US' })).toBe('Jun 1, 2099')
  })

  test('an unusable locale renders nothing rather than taking the row down', () => {
    expect(releaseDateLabel('2024-01-07', { locale: 'not a locale' })).toBeUndefined()
  })
})

describe('parseReleaseDate', () => {
  test('reads the instant a value names', () => {
    expect(parseReleaseDate('2024-01-07')?.toISOString()).toBe('2024-01-07T00:00:00.000Z')
    expect(parseReleaseDate('2024-01-07T14:30:00.000Z')?.toISOString()).toBe('2024-01-07T14:30:00.000Z')
  })

  test('and nothing for a value that names none', () => {
    expect(parseReleaseDate(undefined)).toBeUndefined()
    expect(parseReleaseDate('nope')).toBeUndefined()
  })
})

describe('releaseDateAttribute', () => {
  test('a named day stays that day, so the attribute cannot disagree with the text', () => {
    expect(releaseDateAttribute('2024-01-07')).toBe('2024-01-07')
  })

  test('an instant is normalised, whatever shape it arrived in', () => {
    expect(releaseDateAttribute('2024-01-07T14:30:00Z')).toBe('2024-01-07T14:30:00.000Z')
    expect(releaseDateAttribute('2024-01-07T14:30:00+00:00')).toBe('2024-01-07T14:30:00.000Z')
  })

  test('and there is no attribute where there is no label', () => {
    expect(releaseDateAttribute(undefined)).toBeUndefined()
    expect(releaseDateAttribute('TBA')).toBeUndefined()
  })
})
