import { Category } from './category'

export interface Image {
  type: 'POSTER' | 'IMAGE'
  size: 'LARGE' | 'MEDIUM' | 'SMALL'
  url: string
  handle: Handle
}

export interface TitleName {
  language: string
  name: string
  handle: Handle
}

export interface TitleSynopsis {
  language: string
  synopsis: string
  handle: Handle
}

export interface Handle {
  scheme: string
  id: string
  uri: string
  url: string
}

export interface Tag {
  type: 'release'
  value?: string
  extra?: any
}

export interface Title {
  names: TitleName[]
  releaseDates: Date[]
  images: Image[]
  synopses: TitleSynopsis[]
  related: Title[]
  handles: TitleHandle[]
  episodes: Episode[]
  recommended: Title[]
  tags: Tag[]
}

export interface TitleHandle
  extends
    Omit<Title, 'releaseDates' | 'related' | 'handles' | 'episodes' | 'recommended'>,
    Handle {
  releaseDate: Date[]
  related: TitleHandle[]
  episodes: EpisodeHandle[]
  recommended: TitleHandle[]
}

export interface Episode {
  names: TitleName[]
  releaseDates: Date[]
  images: Image[]
  handles: EpisodeHandle[]
  tags: Tag[]
}

export interface EpisodeHandle
  extends
    Omit<Episode, 'releaseDates' | 'handles'>,
    Handle {
  releaseDate: Date[]
  synopses: TitleSynopsis[]
  related: EpisodeHandle[]
}

export interface Genre {
  name: string
  amount?: number
  categories: Category[]
  handles: GenreHandle[]
}

export interface GenreHandle extends Genre, Handle {
}

export interface SearchFilter {
  categories?: Category[]
  genres?: Genre[]
  tags?: Tag[]
  title?: boolean
  episode?: boolean
}

export type Search = (
  target:
    { search: string } & SearchFilter
    | { scheme: Handle['scheme'], id: Handle['id'] } & SearchFilter
    | { uri: Handle['uri'] } & SearchFilter
    | { url: Handle['url'] } & SearchFilter
) => Promise<Title[]>

export type GetLatest = (
  target:
    SearchFilter
    | { search: string } & SearchFilter
    | { scheme: Handle['scheme'], id: Handle['id'] } & SearchFilter
    | { uri: Handle['uri'] } & SearchFilter
    | { url: Handle['url'] } & SearchFilter
) => Promise<Title[]>
