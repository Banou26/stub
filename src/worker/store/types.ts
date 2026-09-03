import type { Uri } from '../../utils/uri'

export const mediaTypeEnum = ['TV', 'MOVIE', 'ANIME', 'SPECIAL', 'OVA', 'ONA', 'LIVE_ACTION'] as const
export type MediaType = typeof mediaTypeEnum[number]

export const mediaStatusEnum = ['FINISHED', 'RELEASING', 'NOT_YET_RELEASED', 'CANCELLED', 'HIATUS'] as const
export type MediaStatus = typeof mediaStatusEnum[number]

export const mediaCategoryEnum = ['ANIME', 'SERIES', 'MOVIE'] as const
export type MediaCategory = typeof mediaCategoryEnum[number]

/**
 * What a handle claims, mirroring `MediaHandleRelation` in the graphql schema.
 *
 * Mirrored rather than imported, like every other enum in this file, so the store does not depend on
 * generated code. SAME_AS is the only one that unions: see `upsertMedia` in ./db.ts.
 */
export const handleRelationEnum = ['SAME_AS', 'PART_OF'] as const
export type HandleRelation = typeof handleRelationEnum[number]

export type Title = { language: string; title: string; score?: number | null }
export type Description = { language: string; description: string; score?: number | null }
export type ShortDescription = { language: string; shortDescription: string; score?: number | null }
export type Cover = { language?: string | null; url: string; height?: number | null; width?: number | null; color?: string | null; score?: number | null }
export type Banner = { language?: string | null; url: string; height?: number | null; width?: number | null; color?: string | null; score?: number | null }
export type Trailer = { uri: string; origin: string; id: string; url?: string | null; language?: string | null; thumbnail?: string | null; score?: number | null }
export type Thumbnail = { language?: string | null; url: string; height?: number | null; width?: number | null; color?: string | null; score?: number | null }

export type Media = {
  uri: Uri
  origin: string
  id: string
  url: string | null
  score: number | null
  type: MediaType | null
  categories: MediaCategory[]
  status: MediaStatus | null
  titles: Title[]
  descriptions: Description[]
  shortDescriptions: ShortDescription[]
  trailers: Trailer[]
  covers: Cover[]
  banners: Banner[]
  externalLinks: string | null
  averageScore: number | null
  popularity: number | null
  startDate: string | null
  endDate: string | null
  isAdult: boolean | null
  episodeCount: number | null
}

export type Episode = {
  uri: Uri
  origin: string
  id: string
  url: string | null
  embedUrl: string | null
  mediaUri: Uri
  score: number | null
  titles: Title[]
  descriptions: Description[]
  shortDescriptions: ShortDescription[]
  thumbnails: Thumbnail[]
  releaseDate: string | null
  seasonNumber: number | null
  episodeNumber: number | null
  absoluteEpisodeNumber: number | null
  runtime: number | null
}

export type Origin = {
  id: string
  url: string | null
  name: string
  icon: string | null
  color: string | null
  isApiOnly: boolean
}
