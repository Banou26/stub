import { describe, expect, test } from 'vitest'

import { pickTitleMatch, searchScore, searchRelevance, stripTitle, titleSimilarity } from './utils'

// The home and search pages filter on searchRelevance at 0.7, so a query that normalizes to nothing
// returns an empty page and a query that normalizes to one letter returns nearly the whole catalogue.
// Measured over 903 real media before this: 587 could not be found by their own native title, and
// "Aランクパーティを離脱した俺は、元教え子たちと迷宮深部を目指す。" reduced to "a" and scored 1.0 against 841 of them.
test('a native-script query finds its own show', async () => {
  expect(await searchScore('鬼滅の刃', '鬼滅の刃')).toBe(1)
  expect(await searchScore('進撃の巨人', '進撃の巨人 Season 2')).toBe(1)
  expect(await searchRelevance('呪術廻戦', ['Jujutsu Kaisen', '呪術廻戦'])).toBe(1)
})

test('a query does not collapse to its latin residue', async () => {
  expect(await searchScore('Aランクパーティを離脱した俺は', 'Attack on Titan')).toBeLessThan(0.7)
  expect(await searchScore('鬼滅の刃 (2019)', 'Random 2019 Show')).toBeLessThan(0.7)
  expect(await searchScore('Re:ゼロから始める異世界生活', 'Rebuild of Evangelion')).toBeLessThan(0.7)
})

test('a latin query is unchanged', async () => {
  expect(await searchScore('frieren', 'Sousou no Frieren')).toBe(1)
  expect(await searchScore('one piece', 'One Piece')).toBe(1)
  expect(await searchScore('frieren', 'Cowboy Bebop')).toBeLessThan(0.7)
})

// swAlign counts code points; String.length counts utf-16 units, so an astral-plane title used to
// score 0.5 against itself and sat below the 0.7 filter.
test('an astral-plane title matches itself exactly', async () => {
  expect(await searchScore('𩸽', '𩸽')).toBe(1)
  expect(await titleSimilarity('𠮷野家', '𠮷野家')).toBe(1)
})

test('stripTitle keeps letters of every script and drops only punctuation', () => {
  expect(stripTitle('Onii-chan wa Oshimai!')).toBe('oniichan wa oshimai')
  expect(stripTitle('転生したらスライムだった件 (2026)')).toBe('転生したらスライムだった件 2026')
  expect(stripTitle('あはれ！名作くん (2026)')).toBe('あはれ名作くん 2026')
})

// Taking results[0] from a catalogue search unchecked welded the wrong Netflix title onto 14 of 62 live
// unOGS queries, and the edge is permanent: graph.link has no inverse.
describe('pickTitleMatch', () => {
  const series = ['ANIME', 'SERIES']
  const hit = (title: string, categories = ['SERIES']) => ({ title, categories })

  test('accepts a catalogue title that merely extends ours', async () => {
    // Netflix concatenates the two names our sources carry separately, so a correct hit covers only
    // about half the query. This pair is 0.552, which is what pins the threshold from above.
    expect(await pickTitleMatch('Kimetsu no Yaiba', [hit('Demon Slayer: Kimetsu no Yaiba')], series))
      .toEqual(hit('Demon Slayer: Kimetsu no Yaiba'))
  })

  test('rejects a different show that merely shares words', async () => {
    expect(await pickTitleMatch('Naruto', [hit('Naruto Shippuden')], series)).toBeUndefined()
    expect(await pickTitleMatch('Bleach', [hit('Bleach: Thousand-Year Blood War')], series)).toBeUndefined()
    expect(await pickTitleMatch('Demon Slayer', [hit('Woochi - The Demon Slayer', ['MOVIE'])], series)).toBeUndefined()
  })

  test('a format disagreement blocks a title that would otherwise pass', async () => {
    const film = hit('One Piece Film: Red', ['MOVIE'])
    expect(await pickTitleMatch('One Piece', [film], series)).toBeUndefined()
    // absent categories are unknown, not a veto, the same rule the fuzzy merge uses
    expect(await pickTitleMatch('One Piece', [{ title: 'One Piece Film: Red' }], series))
      .toEqual({ title: 'One Piece Film: Red' })
  })

  test('takes the best candidate, not the first one the catalogue ranked', async () => {
    const candidates = [hit('Cowboy Bebop: The Movie'), hit('Cowboy Bebop')]
    expect(await pickTitleMatch('Cowboy Bebop', candidates, series)).toEqual(hit('Cowboy Bebop'))
  })

  test('nothing at all is a valid answer', async () => {
    expect(await pickTitleMatch('Frieren', [], series)).toBeUndefined()
    expect(await pickTitleMatch('Frieren', [hit('Breaking Bad')], series)).toBeUndefined()
  })
})
