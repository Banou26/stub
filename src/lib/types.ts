import { Category } from './category'

export type Impl<T extends ShallowHandle> =
  Partial<Pick<T, 'uri'>> &
  Omit<T, 'uri'>

export type ShallowHandle = {
  scheme: string
  id: string
  uri: string
  url?: string
}

export type Handle =
  ShallowHandle & {
    handles?: Handle[]
  }

export type PropertyToHandleProperty<
  T,
  T2 extends keyof T,
  T3 extends Handle = T extends { episodes: any } ? TitleHandle : EpisodeHandle
> =
  T[T2] extends any[]
    ? ({ handle: T3 } & T[T2][number])[]
    : ({ handle: T3 } & T[T2])[]

export type PropertiesToHandleProperties
  <T, T2 extends keyof T> =
    Omit<T, T2>
    & {
      [key in keyof Pick<T, T2>]: PropertyToHandleProperty<T, key>
    }

export type HandleTypeToType
  <
    T,
    T2 extends keyof T,
    T3,
    T4 = (T extends { episodes: any } ? TitleHandle : EpisodeHandle)[]
  > =
    {
      uri: string
      uris: ({ uri: string, handle: T4 })[]
      handles: T4
    } &
    Omit<
      Omit<
        PropertiesToHandleProperties<T, T2>,
        keyof Handle
      >,
      keyof T3
    > &
    T3

export type Image = {
  type: 'poster' | 'image'
  size: 'large' | 'medium' | 'small'
  url: string
}

export type Name = {
  language: string
  name: string
}

export type Synopsis = {
  language: string
  synopsis: string
}

export type ReleaseDate = {
  language: string
  date?: Date
  start?: Date
  end?: Date
}

export type Resolution = 480 | 540 | 720 | 1080 | 1440 | 2160 | 4320

export type TitleRelation = 'spinoff' | 'adaptation' | 'prequel' | 'sequel'
export type EpisodeRelation = 'previous' | 'next'
export type Relationship = TitleRelation | EpisodeRelation

export type Relation<T> =  {
  relation:
    T extends Title ? TitleRelation :
    T extends TitleHandle ? TitleRelation :
    T extends Episode ? EpisodeRelation :
    T extends EpisodeHandle ? EpisodeRelation :
    Relationship
  reference: T
}

export type Genre = {
  name: string
  adult?: boolean
  amount?: number
  categories: Category[]
  handles?: GenreHandle[]
}

export type EpisodeType = 'iframe' | 'torrent' | 'custom'

export type GenreHandle =
  Omit<Genre, 'handles'>
  & Handle

export type Tag = {
  type:
    'score' | 'tag' | 'genre' | 'type' | 'theme' |
    'demographic' | 'status' | 'producer' | 'rated' |
    'size' | 'resolution'
  value?: string
  extra?: any
}

export type Title =
  HandleTypeToType<
    TitleHandle,
    'names' | 'releaseDates' | 'images' | 'synopses' |
    'related' | 'recommended' | 'tags' | 'genres',
    {
      categories: (Handle & { category: Category })[]
      related: Relation<Title>[]
      episodes: Episode[]
    }
  >

export type TitleHandle =
  Handle & {
    categories: Category[]
    names: Name[]
    releaseDates: ReleaseDate[]
    images: Image[]
    synopses: Synopsis[]
    related: Relation<TitleHandle>[]
    handles: TitleHandle[]
    episodes: EpisodeHandle[]
    recommended: TitleHandle[]
    tags: Tag[]
    genres: GenreHandle[]
  }

export type Episode =
  HandleTypeToType<
    EpisodeHandle,
    'season' | 'number' | 'names' | 'images' |
    'releaseDates' | 'synopses' | 'tags' | 'number',
    {
      categories: (Handle & { category: Category })[]
      related: Relation<Episode>[]
    }
  >

export type EpisodeHandle =
  Handle & {
    season: number
    number: number
    names: Name[]
    images: Image[]
    releaseDates: ReleaseDate[]
    synopses: Synopsis[]
    tags: Tag[]
    handles: EpisodeHandle[]
    categories: Category[]
    related: Relation<EpisodeHandle>[]
    type?: EpisodeType
    resolution?: Resolution
  }

export type SearchFilter = {
  categories?: Category[]
  genres?: Genre[]
  tags?: Tag[]
  title?: boolean
  episode?: boolean
}

export type GetGenres = (
  options?: SearchFilter
) => Promise<GenreHandle[]>

// export type Search = (
//   target:
//     { search: string } & SearchFilter
//     | { scheme: Handle['scheme'], id: Handle['id'] } & SearchFilter
//     | { uri: Handle['uri'] } & SearchFilter
//     | { url: Handle['url'] } & SearchFilter
// ) => Promise<TitleHandle[] | EpisodeHandle[]>

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
  scheme?: string
  categories: Category[]
  function: (
    args:
      Pick<QueryResource, 'scheme'> &
      Partial<QueryResource> &
      SearchResource
  ) => Promise<T extends true ? TitleHandle[] : Title[]>
}

export interface SearchEpisode<T> extends Search  {
  scheme?: string
  categories: Category[]
  function: (
    args:
      QueryResource &
      QueryEpisodeInterface &
      SearchResource
  ) => Promise<
    (T extends true
      ? EpisodeHandle
      : Episode)[]
  >
}

export interface SearchGenre extends Search  {
  scheme?: string
  categories: Category[]
  function: (
    args:
      QueryResource &
      QueryGenreInterface &
      SearchResource
  ) => Promise<Episode[]>
}

export interface Get extends TargetEndpoint {

}

export interface GetTitle<T = false> extends Get {
  scheme?: string
  categories: Category[]
  function: (params: QueryResource) =>
    Promise<
      T extends true
        ? TitleHandle
        : Title
    >
}

export interface GetEpisode<T = false> extends Get {
  scheme?: string
  categories: Category[]
  function: (params: QueryResource & QueryEpisodeInterface) =>
    Promise<
      T extends true
        ? EpisodeHandle
        : Episode
    >
}

export interface GetGenre extends Get {
  scheme?: string
  categories: Category[]
  function: (params: QueryResource & QueryGenreInterface) => Promise<Genre>
}
