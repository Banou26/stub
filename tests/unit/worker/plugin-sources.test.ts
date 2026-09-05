import { describe, expect, test } from 'vitest'

import { readPluginSources } from '../../../src/worker/plugin-sources'

const source = (origin: string, name?: string) => ({
  origin,
  originUrl: `https://${origin}.test`,
  name,
  isApiOnly: false,
  resolvers: { Subscription: {} },
})

const origins = (result: ReturnType<typeof readPluginSources>) =>
  result.sources.map(entry => entry.meta.origin)

describe('readPluginSources', () => {
  test('the single-source shape still works, which is what every existing plugin sends', () => {
    const result = readPluginSources(source('solo', 'Solo'), 'https:x/solo')
    expect(origins(result)).toEqual(['solo'])
    expect(result.sources[0]!.meta.name).toBe('Solo')
    expect(result.rejected).toEqual([])
  })

  test('one package can declare a family of sources, each keeping its own name', () => {
    const result = readPluginSources(
      { sources: [source('animetosho', 'AnimeTosho'), source('nyaa', 'Nyaa')] },
      'https:x/indexers'
    )
    expect(origins(result)).toEqual(['animetosho', 'nyaa'])
    expect(result.sources.map(entry => entry.meta.name)).toEqual(['AnimeTosho', 'Nyaa'])
  })

  test('a malformed source costs ONLY itself; its siblings still register', () => {
    const result = readPluginSources(
      { sources: [source('good', 'Good'), source('BAD ORIGIN', 'Bad'), source('alsogood', 'Also')] },
      'https:x/mixed'
    )
    expect(origins(result)).toEqual(['good', 'alsogood'])
    expect(result.rejected).toEqual([{ origin: 'BAD ORIGIN', reason: 'origin must be a short lowercase token' }])
  })

  test('a source with no origin at all is named in the rejection rather than lost', () => {
    const result = readPluginSources({ sources: [source('ok'), { name: 'nameless' }] }, 'https:x/n')
    expect(origins(result)).toEqual(['ok'])
    expect(result.rejected[0]!.origin).toBe('(none)')
  })

  test('a repeated origin keeps the first and rejects only the repeat', () => {
    const result = readPluginSources(
      { sources: [source('dup', 'First'), source('dup', 'Second'), source('other', 'Other')] },
      'https:x/dup'
    )
    expect(origins(result)).toEqual(['dup', 'other'])
    expect(result.sources[0]!.meta.name).toBe('First')
    expect(result.rejected[0]).toMatchObject({ origin: 'dup' })
    expect(result.rejected[0]!.reason).toContain('twice')
  })

  test('every source being bad yields nothing, which the caller turns into a failed connection', () => {
    const result = readPluginSources({ sources: [source('BAD'), source('ALSO BAD')] }, 'https:x/all')
    expect(result.sources).toEqual([])
    expect(result.rejected.length).toBe(2)
  })

  test('an empty sources list falls back to the payload itself rather than registering nothing', () => {
    const result = readPluginSources({ ...source('solo'), sources: [] }, 'https:x/solo')
    expect(origins(result)).toEqual(['solo'])
  })

  test('the resolvers of each source are carried through, not merged', () => {
    const a = source('a1')
    const b = source('b1')
    const result = readPluginSources({ sources: [a, b] }, 'https:x/fam')
    expect(result.sources[0]!.source).toBe(a)
    expect(result.sources[1]!.source).toBe(b)
  })

  test('name defaults to the origin, and is capped so a long one cannot blow up the UI', () => {
    expect(readPluginSources(source('bare'), 'u').sources[0]!.meta.name).toBe('bare')
    const long = readPluginSources({ ...source('x'), name: 'n'.repeat(200) }, 'u')
    expect(long.sources[0]!.meta.name.length).toBe(64)
  })
})
