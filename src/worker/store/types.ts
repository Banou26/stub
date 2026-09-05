import type { Uri } from '../../utils/uri'

export const mediaTypeEnum = ['TV', 'TV_SHORT', 'MOVIE', 'ANIME', 'SPECIAL', 'OVA', 'ONA', 'LIVE_ACTION'] as const
export type MediaType = typeof mediaTypeEnum[number]

/**
 * The four broadcast seasons, mirroring `MediaSeason` in the graphql schema.
 *
 * UPPER CASE, like every enum here and unlike `ANIME_SEASONS` in sources/season.ts, which is lower
 * case because it names the same four seasons for a different consumer. `upperSeason` and
 * `lowerSeason` in that file are the only bridge between the two spellings; do not add a third.
 */
export const mediaSeasonEnum = ['WINTER', 'SPRING', 'SUMMER', 'FALL'] as const
export type MediaSeason = typeof mediaSeasonEnum[number]

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

/**
 * Which identity space a row lives in, mirroring `MediaScope` in the graphql schema.
 *
 * A RUN is one broadcast run, the unit this store aggregates. A CONTAINER is a show, a series, a
 * franchise page: something several runs are part of. Sameness unions only within one scope; a claim
 * across scopes is derived as PART_OF. See `upsertMedia` in ./db.ts.
 */
export const mediaScopeEnum = ['RUN', 'CONTAINER'] as const
export type MediaScope = typeof mediaScopeEnum[number]

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
  averageScore: number | null
  popularity: number | null
  startDate: string | null
  endDate: string | null
  isAdult: boolean | null
  episodeCount: number | null
  season: MediaSeason | null
  seasonYear: number | null
  genres: string[]
  tags: string[]
  scope: MediaScope
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
