// A source publishes under one origin and is addressable by others. Conflating those two sets means a
// whole class of source is never asked at all: anizip answers from an anidb or a mal id and mints
// `anizip:` uris, so its own name cannot appear in a cluster until it has already answered.
import { describe, expect, test } from 'vitest'

import { answersForOrigins } from '../../../src/sources/supported'
import { supportedUris as anizipSupports, origin as anizipOrigin } from '../../../src/sources/anizip/extractor'

describe('answersForOrigins', () => {
  const anizip = { origin: anizipOrigin, supportedUris: anizipSupports }

  test('a source is asked when its own origin is known', () => {
    expect(answersForOrigins({ origin: 'kitsu' }, ['kitsu', 'mal'])).toBe(true)
  })

  test('and NOT when nothing it understands is known', () => {
    expect(answersForOrigins({ origin: 'kitsu' }, ['anilist'])).toBe(false)
  })

  test('a source is also asked for an origin it can be ADDRESSED by, not only its own', () => {
    // the bug: a cluster naming anidb and mal but not anizip left anizip unasked forever
    expect(answersForOrigins(anizip, ['anidb', 'anilist', 'kitsu', 'mal', 'offline'])).toBe(true)
  })

  test('anizip really does declare those, so the case above is the live one', () => {
    expect(anizipOrigin).toBe('anizip')
    expect([...anizipSupports].sort()).toEqual(['anidb', 'mal'])
  })

  test('either supported origin on its own is enough', () => {
    expect(answersForOrigins(anizip, ['mal'])).toBe(true)
    expect(answersForOrigins(anizip, ['anidb'])).toBe(true)
  })

  test('and it is still asked for its own origin once that appears', () => {
    expect(answersForOrigins(anizip, ['anizip'])).toBe(true)
  })

  test('a source that declares none is matched on its origin alone', () => {
    expect(answersForOrigins({ origin: 'anilist' }, ['anilist'])).toBe(true)
    expect(answersForOrigins({ origin: 'anilist' }, ['mal'])).toBe(false)
  })

  test('and nothing known means nothing to ask', () => {
    expect(answersForOrigins(anizip, [])).toBe(false)
  })
})
