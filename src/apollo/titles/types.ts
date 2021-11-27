import { StoreObject } from '@apollo/client'

export interface ImageApolloCache extends Image, StoreObject {
  __typename: 'Image'
}

export interface Image {
  type: 'POSTER' | 'IMAGE'
  size: 'LARGE' | 'MEDIUM' | 'SMALL'
  url: string
}

export interface TitleNameApolloCache extends TitleName, StoreObject {
  __typename: 'TitleName'
}

export interface TitleName {
  language: string
  name: string
}

export interface TitleSynopsisApolloCache extends TitleSynopsis, StoreObject {
  __typename: 'TitleSynopsis'
}

export interface TitleSynopsis {
  language: string
  synopsis: string
}

export interface Title {
  names: TitleName[]
  images: Image[]
  synopses: TitleSynopsis[]
  related: Title[]
  handles: TitleHandle[]
  episodes: Episode[]
  recommended: Title[]
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

export interface TitleHandle {
  names: TitleName[]
  protocol: string
  id: string
  url: string
  images: Image[]
  synopses: TitleSynopsis[]
  related: TitleHandle[]
}

export interface TitleHandleApolloCache extends TitleHandle, StoreObject {
  __typename: 'TitleHandle'
  names: TitleNameApolloCache[]
  images: ImageApolloCache[]
  synopses: TitleSynopsisApolloCache[]
  related: TitleHandleApolloCache[]
}

export interface Episode {
  names: TitleName[]
  images: Image[]
  handles: EpisodeHandle[]
}

export interface EpisodeApolloCache extends Episode, StoreObject {
  __typename: 'Episode'
  names: TitleNameApolloCache[]
  images: ImageApolloCache[]
  handles: EpisodeHandleApolloCache[]
}

export interface EpisodeHandle {
  protocol: string
  id: string
  url: string
  images: Image[]
  synopses: TitleSynopsis[]
  related: EpisodeHandle[]
}

export interface EpisodeHandleApolloCache extends EpisodeHandle, StoreObject {
  __typename: 'EpisodeHandle'
  images: ImageApolloCache[]
  related: EpisodeHandleApolloCache[]
}
