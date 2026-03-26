import type { Uri } from '../../utils/uri'

export const mediaTypeEnum = ['TV', 'MOVIE', 'ANIME', 'SPECIAL', 'OVA', 'ONA', 'LIVE_ACTION'] as const
export type MediaType = typeof mediaTypeEnum[number]

export const mediaStatusEnum = ['FINISHED', 'RELEASING', 'NOT_YET_RELEASED', 'CANCELLED', 'HIATUS'] as const
export type MediaStatus = typeof mediaStatusEnum[number]

export type Title = { language: string; title: string; score?: number | null }
export type Description = { language: string; description: string; score?: number | null }
export type ShortDescription = { language: string; shortDescription: string; score?: number | null }
export type Cover = { language?: string; url: string; height?: number; width?: number; color?: string; score?: number | null }
export type Banner = { language?: string; url: string; height?: number; width?: number; color?: string; score?: number | null }
export type Trailer = { uri: string; origin: string; id: string; url?: string; language?: string; thumbnail?: string; score?: number | null }
export type Thumbnail = { language?: string; url: string; height?: number; width?: number; color?: string; score?: number | null }

export type Media = {
  uri: Uri
  origin: string
  id: string
  url: string | null
  score: number | null
  type: MediaType | null
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
