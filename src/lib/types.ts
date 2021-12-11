import { Category } from './category'

export interface Image {
  type: 'poster' | 'image'
  size: 'large' | 'medium' | 'small'
  url: string
}

export interface TitleName {
  language: string
  name: string
}

export interface TitleSynopsis {
  language: string
  synopsis: string
}

export interface Genre<T = false> {
  name: string
  adult?: boolean
  amount?: number
  categories: Category[]
  handles?: GenreHandle<T>[]
}

export interface GenreHandleInterface<T = false> extends Genre<T> {}

export type GenreHandle<T = false> =
  Omit<GenreHandleInterface<T>, 'handles'>
  & Handle<T>

export interface HandleInterface {
  scheme: string
  id: string
  uri: string
  url: string
}

export type Handle<T = false> =
  T extends true
    ? Omit<HandleInterface, 'uri' | 'scheme'> & Partial<Pick<HandleInterface, 'uri' | 'scheme'>>
    : HandleInterface

export interface Tag {
  type: 'release' | 'score' | 'tag' | 'genre'
  value?: string
  extra?: any
}

export interface Title<T = false> {
  names: TitleName[]
  releaseDates: Date[]
  images: Image[]
  synopses: TitleSynopsis[]
  related: Title<T>[]
  handles: TitleHandle<T>[]
  episodes: Episode<T>[]
  recommended: Title<T>[]
  tags: Tag[]
  genres: Genre[]
}

export interface TitleHandleInterface<T = false>
  extends
    Omit<
      Title,
      'releaseDates' | 'related' | 'handles' | 'episodes' | 'recommended' | 'genres'
    > {
  releaseDate: Date[]
  related: TitleHandle<T>[]
  episodes: EpisodeHandle<T>[]
  recommended: TitleHandle<T>[]
  genres: GenreHandle<T>[]
}

export type TitleHandle<T = false> =
  Omit<TitleHandleInterface<T>, 'related' | 'episodes' | 'recommended'>
  & Handle<T>
  & {
    related: TitleHandle<T>[]
    episodes: EpisodeHandle<T>[]
    recommended: TitleHandle<T>[]
  }

export interface Episode<T = false> {
  names: TitleName[]
  releaseDates: Date[]
  images: Image[]
  handles: EpisodeHandle<T>[]
  tags: Tag[]
}

export interface EpisodeHandleInterface<T = false>
  extends
    Omit<Episode<T>, 'releaseDates' | 'handles'> {
  releaseDate: Date[]
  synopses: TitleSynopsis[]
  related: EpisodeHandle<T>[]
}

export type EpisodeHandle<T = false> =
  Omit<EpisodeHandleInterface<T>, 'related'>
  & Handle<T>
  & {
    related: EpisodeHandle<T>[]
  }

export interface SearchFilter {
  categories?: Category[]
  genres?: Genre[]
  tags?: Tag[]
  title?: boolean
  episode?: boolean
}

export type GetGenres<T = false> = (
  options: SearchFilter
) => Promise<GenreHandle<T>[]>

export type Search<T = false> = (
  target:
    { search: string } & SearchFilter
    | { scheme: Handle['scheme'], id: Handle['id'] } & SearchFilter
    | { uri: Handle['uri'] } & SearchFilter
    | { url: Handle['url'] } & SearchFilter
) => Promise<TitleHandle<T>[] | EpisodeHandle<T>[]>

export interface GetLatestOptions {
  title?:
    false
    | {
      pagination: boolean,
      title: boolean,
      genres: boolean,
      score: boolean
    },
  episode?:
    false
    | {
      pagination: boolean
    }
}

export type GetLatest<T = false> = (
  target:
    SearchFilter
    | { search: string } & SearchFilter
    | { scheme: Handle['scheme'], id: Handle['id'] } & SearchFilter
    | { uri: Handle['uri'] } & SearchFilter
    | { url: Handle['url'] } & SearchFilter
) => Promise<TitleHandle<T>[] | EpisodeHandle<T>[]>

export type Get<T = false> = (
  target:
    { scheme: Handle['scheme'], id: Handle['id'] } & SearchFilter
    | { uri: Handle['uri'] } & SearchFilter
    | { url: Handle['url'] } & SearchFilter
) => Promise<TitleHandle<T> | EpisodeHandle<T>>
