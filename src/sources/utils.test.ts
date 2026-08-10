import { expect, test } from 'vitest'

import { searchScore, searchRelevance, stripTitle, titleSimilarity } from './utils'

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
