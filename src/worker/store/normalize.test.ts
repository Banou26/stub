// Both mappers between the graphql row and the store row are hand written, so a new field is dropped
// silently unless something pins it. `scope` is the field whose loss reopens the season weld.
import { beforeEach, expect, test } from 'vitest'

import { aggregateMedia } from './aggregate'
import { resetStore } from './db'
import { normalizeToStoreMedia } from './normalize'

const gql = (uri: string, scope?: 'RUN' | 'CONTAINER' | null) => ({
  _id: uri,
  uri,
  origin: uri.slice(0, uri.indexOf(':')),
  id: uri.slice(uri.indexOf(':') + 1),
  handles: [],
  categories: [],
  titles: [],
  descriptions: [],
  shortDescriptions: [],
  trailers: [],
  covers: [],
  banners: [],
  episodes: [],
  ...scope === undefined ? {} : { scope },
}) as any

const row = (uri: string, scope: 'RUN' | 'CONTAINER') => ({ ...normalizeToStoreMedia(gql(uri)), scope })

beforeEach(() => { resetStore() })

test('normalizeToStoreMedia carries CONTAINER through', () => {
  expect(normalizeToStoreMedia(gql('cr:G24H1N3MP', 'CONTAINER')).scope).toBe('CONTAINER')
  expect(normalizeToStoreMedia(gql('anilist:108465', 'RUN')).scope).toBe('RUN')
})

test('normalizeToStoreMedia defaults an absent scope to RUN', () => {
  expect(normalizeToStoreMedia(gql('anilist:108465')).scope).toBe('RUN')
  expect(normalizeToStoreMedia(gql('anilist:108465', null)).scope).toBe('RUN')
})

test('aggregateMedia reports CONTAINER over a container singleton', () => {
  const aggregated = aggregateMedia([row('cr:G24H1N3MP', 'CONTAINER')], 'https://x')
  expect(aggregated.scope).toBe('CONTAINER')
  expect(aggregated.handles[0]!.node.scope, 'the handle node is the row, scope included').toBe('CONTAINER')
})

test('aggregateMedia reports RUN over a run cluster, and over a run singleton', () => {
  expect(aggregateMedia([row('anilist:108465', 'RUN'), row('kitsu:42323', 'RUN')], 'https://x').scope).toBe('RUN')
  expect(aggregateMedia([row('anilist:108465', 'RUN')], 'https://x').scope).toBe('RUN')
})

// a cluster is a container only when every member is: a mixed cluster from before scope existed still
// names a run, and two shows that are one show are still a show
test('aggregateMedia over a cluster reads every member', () => {
  expect(aggregateMedia([row('anilist:108465', 'RUN'), row('cr:G24H1N3MP', 'CONTAINER')], 'https://x').scope).toBe('RUN')
  expect(aggregateMedia([row('cr:G24H1N3MP', 'CONTAINER'), row('tvmaze:52279', 'CONTAINER')], 'https://x').scope).toBe('CONTAINER')
})
