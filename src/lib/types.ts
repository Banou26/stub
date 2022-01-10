import { Category } from './category'

export interface Image {
  type: 'poster' | 'image'
  size: 'large' | 'medium' | 'small'
  url: string
}

export interface Name {
  language: string
  name: string
}

export interface Synopsis {
  language: string
  synopsis: string
}

export type ReleaseDate = {
  language: string
  date?: Date
  start?: Date
  end?: Date
}

export type TitleRelation = 'spinoff' | 'adaptation' | 'prequel' | 'sequel'
export type EpisodeRelation = 'previous' | 'next'
export type Relationship = TitleRelation | EpisodeRelation

export interface Relation<T> {
  relation:
    T extends Title ? TitleRelation :
    T extends TitleHandle ? TitleRelation :
    T extends Episode ? EpisodeRelation :
    T extends EpisodeHandle ? EpisodeRelation :
    Relationship
  reference: T
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

export interface HandleInterface<T = false> {
  scheme: string
  id: string
  uri: string
  url: string
  handles?: Handle<T>[]
}

export type Handle<T = false> =
  T extends true
    ? Omit<HandleInterface<T>, 'uri' | 'scheme'> & Partial<Pick<HandleInterface<T>, 'uri' | 'scheme'>>
    : HandleInterface<T>

export interface Tag {
  type: 'score' | 'tag' | 'genre' | 'type' | 'theme' | 'demographic' | 'status' | 'producer' | 'rated'
  value?: string
  extra?: any
}

export interface Title<T = false> {
  categories: Category[]
  uri: string
  names: Name[]
  releaseDates: ReleaseDate[]
  images: Image[]
  synopses: Synopsis[]
  related: Relation<Title<T>>[]
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
      'uri' | 'related' | 'handles' | 'episodes' | 'recommended' | 'genres'
    > {
  related: Relation<TitleHandle<T>>[]
  episodes: EpisodeHandle<T>[]
  recommended: TitleHandle<T>[]
  genres: GenreHandle<T>[]
}

export type TitleHandle<T = false> = TitleHandleInterface<T> & Handle<T>

export interface Episode<T = false> {
  uri: string
  categories: Category[]
  names: Name[]
  images: Image[]
  releaseDates: ReleaseDate[]
  synopses: Synopsis[]
  handles: EpisodeHandle<T>[]
  tags: Tag[]
  related: Relation<Episode<T>>[]
}

export interface EpisodeHandleInterface<T = false>
  extends
    Omit<Episode<T>, 'uri' | 'related'> {
  related: Relation<EpisodeHandle<T>>[]
}

export type EpisodeHandle<T = false> = EpisodeHandleInterface<T> & Handle<T>

export interface SearchFilter {
  categories?: Category[]
  genres?: Genre[]
  tags?: Tag[]
  title?: boolean
  episode?: boolean
}

export type GetGenres<T = false> = (
  options?: SearchFilter
) => Promise<GenreHandle<T>[]>

// export type Search<T = false> = (
//   target:
//     { search: string } & SearchFilter
//     | { scheme: Handle['scheme'], id: Handle['id'] } & SearchFilter
//     | { uri: Handle['uri'] } & SearchFilter
//     | { url: Handle['url'] } & SearchFilter
// ) => Promise<TitleHandle<T>[] | EpisodeHandle<T>[]>

export interface GetLatestOptions {
  categories: Category[]
  title?:
    false
    | {
      pagination: boolean
      title: boolean
      genres: boolean
      score: boolean
    }
  episode?:
    false
    | {
      pagination: boolean
    }
  genre?:
    false
    | {
      pagination: boolean
    }
}

export interface GetTitleOptions {
  categories: Category[]
  pagination: boolean
  genres: boolean
  score: boolean
  // title?:
  //   false
  //   | {
  //     pagination: boolean
  //     title: boolean
  //     genres: boolean
  //     score: boolean
  //   }
  // episode?:
  //   false
  //   | {
  //     pagination: boolean
  //   }
  // genre?:
  //   false
  //   | {
  //     pagination: boolean
  //   }
}

export interface GetEpisodeOptions {
  categories: Category[]
  pagination: boolean
  genres: boolean
  score: boolean
}

interface QueryResourceInterfaceUri {
  uri: string
  scheme?: never
  id?: never
  url?: never
}

interface QueryResourceInterfaceUrl {
  uri?: never
  scheme?: never
  id?: never
  url: string
}

interface QueryResourceInterfaceSchemeId {
  uri?: never
  url?: never
  scheme: string
  id: string
}

interface QueryEpisodeInterface {
  episodeId: string
}

interface QueryGenreInterface {
  
}

type QueryResource =
  QueryResourceInterfaceUri |
  QueryResourceInterfaceUrl |
  QueryResourceInterfaceSchemeId

interface SearchResource {
  search?: string
  categories: Category[]
  latest?: boolean
  pagination?: string
  genres?: Genre[]
  score?: string
  tags?: Tag[]
}

export interface TargetEndpoint {
  function: (...args) => any
}

export interface Search extends TargetEndpoint {
  search?: string
  categories: Category[]
  latest?: boolean
  pagination?: boolean
  genres?: boolean
  score?: boolean
  tags?: boolean
}

export interface SearchTitle<T = false> extends Search {
  function: (
    args:
      Pick<QueryResource, 'scheme'> &
      Partial<QueryResource> &
      SearchResource
  ) => Promise<T extends true ? TitleHandle<T>[] : Title[]>
}

export interface SearchEpisode<T = false> extends Search  {
  function: (
    args:
      QueryResource &
      QueryEpisodeInterface &
      SearchResource
  ) => Promise<Episode<T>[]>
}

export interface SearchGenre<T = false> extends Search  {
  function: (
    args:
      QueryResource &
      QueryGenreInterface &
      SearchResource
  ) => Promise<Episode<T>[]>
}

export interface Get extends TargetEndpoint {

}

export interface GetTitle<T = false> extends Get {
  function: (params: QueryResource) => Promise<Title<T>>
}

export interface GetEpisode<T = false> extends Get {
  function: (params: QueryResource & QueryEpisodeInterface) => Promise<Episode<T>>
}

export interface GetGenre<T = false> extends Get {
  function: (params: QueryResource & QueryGenreInterface) => Promise<Genre<T>>
}
