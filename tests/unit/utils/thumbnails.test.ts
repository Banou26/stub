import { expect, test } from 'vitest'

import { nextThumbnail } from '../../../src/utils/thumbnails'

const thumbnails = [{ url: 'https://cr/1.png' }, { url: 'https://kitsu/1.jpg' }, { url: 'https://anizip/1.jpg' }]

test('the first thumbnail is tried first', () => {
  expect(nextThumbnail(thumbnails, new Set())).toBe('https://cr/1.png')
})

test('a thumbnail that failed to load falls through to the next source, in order', () => {
  expect(nextThumbnail(thumbnails, new Set(['https://cr/1.png']))).toBe('https://kitsu/1.jpg')
  expect(nextThumbnail(thumbnails, new Set(['https://cr/1.png', 'https://kitsu/1.jpg']))).toBe('https://anizip/1.jpg')
})

test('nothing is left once every thumbnail failed, or when there were none', () => {
  expect(nextThumbnail(thumbnails, new Set(thumbnails.map(t => t.url)))).toBeUndefined()
  expect(nextThumbnail([], new Set())).toBeUndefined()
  expect(nextThumbnail(undefined, new Set())).toBeUndefined()
})
