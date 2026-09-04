import type { Media } from '../../generated/schema/types.generated'
import type { Media as StoreMedia } from './types'
import type { Uri } from '../../utils/uri'

/**
 * The graphql row a source produced, as the row the store holds.
 *
 * Every nullable field lands as `null` rather than `undefined`, and `scope` defaults to RUN: a source
 * that says nothing about scope is naming a run, which is what every source did before scope existed.
 * Pure, and outside ../extractor.ts on purpose: that module reaches urql and cannot load under vitest,
 * so a field dropped here would go unpinned.
 */
export const normalizeToStoreMedia = (media: Media): StoreMedia => ({
  uri: media.uri as Uri,
  origin: media.origin,
  id: media.id,
  url: media.url ?? null,
  score: media.score ?? null,
  type: (media.type as StoreMedia['type']) ?? null,
  categories: media.categories ?? [],
  status: (media.status as StoreMedia['status']) ?? null,
  titles: media.titles ?? [],
  descriptions: media.descriptions ?? [],
  shortDescriptions: media.shortDescriptions ?? [],
  trailers: media.trailers ?? [],
  covers: media.covers ?? [],
  banners: media.banners ?? [],
  averageScore: media.averageScore ?? null,
  popularity: media.popularity ?? null,
  startDate: media.startDate ?? null,
  endDate: media.endDate ?? null,
  isAdult: media.isAdult ?? null,
  episodeCount: media.episodeCount ?? null,
  scope: (media.scope as StoreMedia['scope']) ?? 'RUN',
})
