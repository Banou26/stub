import type { Image, Name, Synopsis, Relation, ReleaseDate, Title, TitleHandle, Episode, EpisodeHandle } from '../../lib'

import { StoreObject } from '@apollo/client'

export interface ImageApolloCache extends Image, StoreObject {
  __typename: 'Image'
}

export interface NameApolloCache extends Name, StoreObject {
  __typename: 'Name'
}

export interface ReleaseDateApolloCache extends ReleaseDate, StoreObject {
  __typename: 'ReleaseDate'
}

export interface SynopsisApolloCache extends Synopsis, StoreObject {
  __typename: 'Synopsis'
}

export interface RelationApolloCache<T> extends Relation<T>, StoreObject {
  __typename: 'Relation'
}

export interface TitleApolloCache extends Title, StoreObject {
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

export interface TitleHandleApolloCache extends TitleHandle, StoreObject {
  __typename: 'TitleHandle'
  names: NameApolloCache[]
  releaseDates: ReleaseDateApolloCache[]
  images: ImageApolloCache[]
  synopses: SynopsisApolloCache[]
  related: RelationApolloCache<TitleHandleApolloCache>[]
  handles?: TitleHandleApolloCache[]
}

export interface EpisodeApolloCache extends Episode, StoreObject {
  __typename: 'Episode'
  names: NameApolloCache[]
  releaseDates: ReleaseDateApolloCache[]
  images: ImageApolloCache[]
  related: RelationApolloCache<EpisodeApolloCache>[]
  handles: EpisodeHandleApolloCache[]
}

export interface EpisodeHandleApolloCache extends EpisodeHandle, StoreObject {
  __typename: 'EpisodeHandle'
  releaseDates: ReleaseDateApolloCache[]
  images: ImageApolloCache[]
  related: RelationApolloCache<EpisodeHandleApolloCache>[]
}
