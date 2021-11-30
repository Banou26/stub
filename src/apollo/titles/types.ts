import type { Image, TitleName, TitleSynopsis, Title, TitleHandle, Episode, EpisodeHandle } from '../../lib'

import { StoreObject } from '@apollo/client'

export interface ImageApolloCache extends Image, StoreObject {
  __typename: 'Image'
}

export interface TitleNameApolloCache extends TitleName, StoreObject {
  __typename: 'TitleName'
}

export interface TitleSynopsisApolloCache extends TitleSynopsis, StoreObject {
  __typename: 'TitleSynopsis'
}

export interface TitleApolloCache extends Title, StoreObject {
  __typename: 'Title'
  names: TitleNameApolloCache[]
  images: ImageApolloCache[]
  synopses: TitleSynopsisApolloCache[]
  handles: TitleHandleApolloCache[]
  episodes: EpisodeApolloCache[]
  recommended: TitleApolloCache[]
}

export interface TitleHandleApolloCache extends TitleHandle, StoreObject {
  __typename: 'TitleHandle'
  names: TitleNameApolloCache[]
  images: ImageApolloCache[]
  synopses: TitleSynopsisApolloCache[]
  related: TitleHandleApolloCache[]
}

export interface EpisodeApolloCache extends Episode, StoreObject {
  __typename: 'Episode'
  names: TitleNameApolloCache[]
  images: ImageApolloCache[]
  handles: EpisodeHandleApolloCache[]
}

export interface EpisodeHandleApolloCache extends EpisodeHandle, StoreObject {
  __typename: 'EpisodeHandle'
  images: ImageApolloCache[]
  related: EpisodeHandleApolloCache[]
}
