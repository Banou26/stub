import type { Handle, Image, Name, Synopsis, Relation, ReleaseDate, Title, TitleHandle, Episode, EpisodeHandle, PropertyToHandleProperty, Tag, Genre, Category } from '../../lib'

import { StoreObject } from '@apollo/client'

export type HandleApolloCache =
  Omit<Handle, 'uri' | 'url' | 'handles'> &
  StoreObject & {
    uri: Exclude<Handle['uri'], undefined>
    url?: Handle['url'] | null
    handles?: Handle['handles'] | null
  }

export type PropertyToHandleApolloCacheProperty<T, T2 extends keyof T> =
  T[T2] extends any[]
    ? (HandleApolloCache & { uri: string } & T[T2][number])[]
    : (HandleApolloCache & { uri: string } & T[T2])[]

export type ImageApolloCache =
  Image &
  StoreObject & {
    __typename: 'Image'
  }

export type NameApolloCache =
  Name &
  StoreObject & {
    __typename: 'Name'
  }

export type ReleaseDateApolloCache =
  Pick<ReleaseDate, 'language'> &
  StoreObject & {
    __typename: 'ReleaseDate'
    date: ReleaseDate['date'] | null
    start: ReleaseDate['start'] | null
    end: ReleaseDate['end'] | null
  }

export type SynopsisApolloCache =
  Synopsis &
  StoreObject & {
    __typename: 'Synopsis'
  }

export type RelationApolloCache<T> =
  Relation<T> &
  StoreObject & {
    __typename: 'Relation'
  }

export type TagApolloCache =
  Tag &
  StoreObject & {
    __typename: 'Tag'
  }

export type GenreApolloCache =
  Genre &
  StoreObject & {
    __typename: 'Genre'
  }

// export type _TitleApolloCache =
//   Omit<
//     Title,
//     'releaseDates' | 'related' |
//     'recommended' | 'handles' | 'episodes'
//   > &
//   StoreObject & {
//     __typename: 'Title'
//     names: NameApolloCache[]
//     releaseDates: ReleaseDateApolloCache[]
//     images: ImageApolloCache[]
//     related: RelationApolloCache<TitleApolloCache>[]
//     synopses: SynopsisApolloCache[]
//   }

export type _TitleApolloCache =
  {
    names: NameApolloCache[]
    releaseDates: ReleaseDateApolloCache[]
    images: ImageApolloCache[]
    synopses: SynopsisApolloCache[]
    related: RelationApolloCache<TitleApolloCache>[]
    tags: TagApolloCache[]
    genres: GenreApolloCache[]
  }

export type TitleApolloCache =
  StoreObject &
  {
    [key in keyof _TitleApolloCache]: PropertyToHandleApolloCacheProperty<_TitleApolloCache, key>
  } & {
    __typename: 'Title'
    uri: string
    categories: Category[]
    uris: (Handle & { uri: string })[]
    episodes: EpisodeApolloCache[]
    handles: TitleHandleApolloCache[]
    recommended: TitleApolloCache[]
  }

export type TitleHandleApolloCache =
  Omit<TitleHandle, 'releaseDates' | 'related' | 'handles'> &
  StoreObject & {
    __typename: 'TitleHandle'
    names: NameApolloCache[]
    releaseDates: ReleaseDateApolloCache[]
    images: ImageApolloCache[]
    synopses: SynopsisApolloCache[]
    related: RelationApolloCache<TitleHandleApolloCache>[]
    handles: TitleHandleApolloCache[] | null
  }

export type _EpisodeApolloCache =
  Omit<Episode, 'releaseDates' | 'related' | 'handles'> &
  {
    names: (NameApolloCache & Episode['names'])[]
    releaseDates: ReleaseDateApolloCache[]
    images: ImageApolloCache[]
    related: RelationApolloCache<EpisodeApolloCache>[]
  }

export type EpisodeApolloCache =
  StoreObject & {
    [key in keyof _EpisodeApolloCache]: PropertyToHandleApolloCacheProperty<_EpisodeApolloCache, key>
  } & {
    __typename: 'Episode'
    uri: string
    uris: (Handle & { uri: string })[]
    handles: EpisodeHandleApolloCache[]
  }

export type EpisodeHandleApolloCache =
  Omit<EpisodeHandle, 'releaseDates' | 'related' | 'handles'> &
  StoreObject &
  {
    __typename: 'EpisodeHandle'
    releaseDates: ReleaseDateApolloCache[]
    images: ImageApolloCache[]
    related: RelationApolloCache<EpisodeHandleApolloCache>[]
    handles: EpisodeHandleApolloCache[] | null
  }
