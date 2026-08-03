import { describe, expect, test } from 'vitest'

import { readPluginSources } from './plugin-sources'

const source = (origin: string, name?: string) => ({
  origin,
  originUrl: `https://${origin}.test`,
  name,
  isApiOnly: false,
  resolvers: { Subscription: {} },
})

describe('readPluginSources', () => {
  test('the single-source shape still works, which is what every existing plugin sends', () => {
    const read = readPluginSources(source('solo', 'Solo'), 'https:x/solo')
    expect(read.map(entry => entry.meta.origin)).toEqual(['solo'])
    expect(read[0]!.meta.name).toBe('Solo')
  })

  test('one package can declare a family of sources', () => {
    const read = readPluginSources(
      { sources: [source('animetosho', 'AnimeTosho'), source('nyaa', 'Nyaa')] },
      'https:x/indexers'
    )
    expect(read.map(entry => entry.meta.origin)).toEqual(['animetosho', 'nyaa'])
    expect(read.map(entry => entry.meta.name)).toEqual(['AnimeTosho', 'Nyaa'])
  })

  test('an empty sources list falls back to the payload itself rather than registering nothing', () => {
    const read = readPluginSources({ ...source('solo'), sources: [] }, 'https:x/solo')
    expect(read.map(entry => entry.meta.origin)).toEqual(['solo'])
  })

  test('the resolvers of each source are carried through, not merged', () => {
    const a = source('a1')
    const b = source('b1')
    const read = readPluginSources({ sources: [a, b] }, 'https:x/fam')
    expect(read[0]!.source).toBe(a)
    expect(read[1]!.source).toBe(b)
  })

  test('name defaults to the origin, and is capped so a long one cannot blow up the UI', () => {
    expect(readPluginSources(source('bare'), 'u')[0]!.meta.name).toBe('bare')
    const long = readPluginSources({ ...source('x'), name: 'n'.repeat(200) }, 'u')
    expect(long[0]!.meta.name.length).toBe(64)
  })

  test('a bad origin rejects the WHOLE package, so it cannot half-register', () => {
    expect(() => readPluginSources({ sources: [source('good'), source('BAD ORIGIN')] }, 'https:x/mixed'))
      .toThrow(/lowercase token/)
    expect(() => readPluginSources({ sources: [source('good'), source('')] }, 'https:x/mixed'))
      .toThrow(/lowercase token/)
    expect(() => readPluginSources({ sources: [source('a'.repeat(40))] }, 'u')).toThrow(/lowercase token/)
  })

  test('a package declaring one origin twice is refused with that reason', () => {
    // caught here rather than at the registry, which would report it as colliding with itself
    expect(() => readPluginSources({ sources: [source('dup', 'One'), source('dup', 'Two')] }, 'https:x/dup'))
      .toThrow(/declares origin 'dup' twice/)
  })

  test('the failure names the plugin, so a broken package can be identified from the log', () => {
    expect(() => readPluginSources({ sources: [source('!!')] }, 'https:host/thing'))
      .toThrow(/https:host\/thing/)
  })
})
