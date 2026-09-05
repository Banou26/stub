import { expect, test } from 'vitest'

import { malLargeImage } from '../../../src/sources/mal-image'

const CDN = 'https://cdn.myanimelist.net/images/anime/1527/158340'

test('the plain spelling upgrades to the large one, which is 425x600 against 225x318', () => {
  expect(malLargeImage(`${CDN}.jpg`)).toBe(`${CDN}l.jpg`)
  expect(malLargeImage(`${CDN}.webp`)).toBe(`${CDN}l.webp`)
})

test('a thumbnail upgrades rather than gaining a second size letter', () => {
  expect(malLargeImage(`${CDN}t.jpg`)).toBe(`${CDN}l.jpg`)
})

test('an already large url is returned as it came', () => {
  expect(malLargeImage(`${CDN}l.jpg`)).toBe(`${CDN}l.jpg`)
})

test('a query string survives, and another host is never rewritten', () => {
  expect(malLargeImage(`${CDN}.jpg?s=abc`)).toBe(`${CDN}l.jpg?s=abc`)
  expect(malLargeImage('https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx1-a.jpg'))
    .toBe('https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx1-a.jpg')
  expect(malLargeImage('not a url at all')).toBe('not a url at all')
})

test('a missing url passes through, since a source with no image is not this to fix', () => {
  expect(malLargeImage(undefined)).toBeUndefined()
  expect(malLargeImage(null)).toBeNull()
})
