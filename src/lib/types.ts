import { Category } from './category'

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

export type Genre<T = false> = {
  name: string
  adult?: boolean
  amount?: number
  categories: Category[]
  handles?: GenreHandle<T>[]
}

export type GenreHandle<T = false> =
  Omit<Genre<T>, 'handles'>
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
    ? (
      Omit<HandleInterface<T>, 'uri' | 'scheme'> &
      Partial<Pick<HandleInterface<T>, 'uri' | 'scheme'>>
    )
    : HandleInterface<T>

export type Tag = {
  type:
    'score' | 'tag' | 'genre' | 'type' | 'theme' |
    'demographic' | 'status' | 'producer' | 'rated'
  value?: string
  extra?: any
}

export type Title<T = false> = {
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

export type TitleHandle<T = false> =
  Omit<
    Title,
    'uri' | 'related' | 'handles' | 'episodes' |
    'recommended' | 'genres'
  > &
  Handle<T> & {
    related: Relation<TitleHandle<T>>[]
    episodes: EpisodeHandle<T>[]
    recommended: TitleHandle<T>[]
    genres: GenreHandle<T>[]
  }

export type Episode<T = false> = {
  uri: string
  season: number
  number: number
  categories: Category[]
  names: Name[]
  images: Image[]
  releaseDates: ReleaseDate[]
  synopses: Synopsis[]
  handles: EpisodeHandle<T>[]
  tags: Tag[]
  related: Relation<Episode<T>>[]
}

export type EpisodeHandle<T = false> =
  Omit<Episode<T>, 'uri' | 'related'> &
  Handle<T> & {
    related: Relation<EpisodeHandle<T>>[]
  }

export type SearchFilter = {
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
  categories: Category[]
  function: (
    args:
      Pick<QueryResource, 'scheme'> &
      Partial<QueryResource> &
      SearchResource
  ) => Promise<T extends true ? TitleHandle<T>[] : Title[]>
}

export interface SearchEpisode<T = false> extends Search  {
  categories: Category[]
  function: (
    args:
      QueryResource &
      QueryEpisodeInterface &
      SearchResource
  ) => Promise<Episode<T>[]>
}

export interface SearchGenre<T = false> extends Search  {
  categories: Category[]
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
  categories: Category[]
  function: (params: QueryResource) =>
    Promise<
      T extends true
        ? TitleHandle<T>
        : Title<T>
    >
}

export interface GetEpisode<T = false> extends Get {
  categories: Category[]
  function: (params: QueryResource & QueryEpisodeInterface) =>
    Promise<
      T extends true
        ? EpisodeHandle<T>
        : Episode<T>
    >
}

export interface GetGenre<T = false> extends Get {
  categories: Category[]
  function: (params: QueryResource & QueryGenreInterface) => Promise<Genre<T>>
}
