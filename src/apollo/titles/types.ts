import type { Image, Name, Synopsis, Relation, ReleaseDate, Title, TitleHandle, Episode, EpisodeHandle } from '../../lib'

import { StoreObject } from '@apollo/client'

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

export type TitleApolloCache =
  Omit<
    Title,
    'releaseDates' | 'related' |
    'recommended' | 'handles' | 'episodes'
  > &
  StoreObject & {
    __typename: 'Title'
    names: NameApolloCache[]
    releaseDates: ReleaseDateApolloCache[]
    images: ImageApolloCache[]
    related: RelationApolloCache<TitleApolloCache>[]
    synopses: SynopsisApolloCache[]
    handles: TitleHandleApolloCache[]
    episodes: EpisodeApolloCache[]
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

export type EpisodeApolloCache =
  Omit<Episode, 'releaseDates' | 'related' | 'handles'> &
  StoreObject &
  {
    __typename: 'Episode'
    names: NameApolloCache[]
    releaseDates: ReleaseDateApolloCache[]
    images: ImageApolloCache[]
    related: RelationApolloCache<EpisodeApolloCache>[]
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
