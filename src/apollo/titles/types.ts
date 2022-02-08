import type {  Title, TitleHandle, Episode, EpisodeHandle } from '../../lib'

import { StoreObject } from '@apollo/client'

export type OptionalToNullable<T> =
  Required<{
    [key in keyof T]:
      T[key] extends Record<string | number | symbol, any>
      ? OptionalToNullable<T[key]>
      : T[key] extends Partial<T[key]>
          ? T[key] | null
          : T[key]
  }>

export type ReplaceTypeWithType<T, T2, T3> =
  T3 extends T
    ? T2
    : Required<{
      [key in keyof T3]:
        T3[key] extends Record<string | number | symbol, any>
        ? ReplaceTypeWithType<T, T2, T3[key]>
        : T3[key] extends T
            ? T2
            : T3[key]
    }>

export type TitleHandleToTitleHandleApolloCache<T> =
  ReplaceTypeWithType<
    TitleHandle,
    StoreObject &
    OptionalToNullable<Title> & {
      __typename: 'TitleHandle'
      handles: TitleHandleToTitleHandleApolloCache<T>[]
    },
    T
  >

export type TitleToTitleApolloCache<T> =
  ReplaceTypeWithType<
    Title,
    StoreObject &
    OptionalToNullable<Title> & {
      __typename: 'Title'
      handles: TitleHandleToTitleHandleApolloCache<TitleHandle>[]
    },
    T
  >

export type EpisodeHandleToEpisodeHandleApolloCache<T> =
  ReplaceTypeWithType<
    EpisodeHandle,
    StoreObject &
    OptionalToNullable<EpisodeHandle> & {
      __typename: 'EpisodeHandle'
      handles: EpisodeHandleToEpisodeHandleApolloCache<T>[]
    },
    T
  >

export type EpisodeToEpisodeApolloCache<T> =
  ReplaceTypeWithType<
    Episode,
    StoreObject &
    OptionalToNullable<Episode> & {
      __typename: 'Episode'
      handles: EpisodeHandleToEpisodeHandleApolloCache<T>[]
    },
    T
  >

export type ReplaceWithApolloType<T> =
  TitleHandleToTitleHandleApolloCache<
    TitleToTitleApolloCache<
      EpisodeHandleToEpisodeHandleApolloCache<
        EpisodeToEpisodeApolloCache<
          T
        >
      >
    >
  >

export type EpisodeHandleApolloCache = ReplaceWithApolloType<EpisodeHandle>
export type EpisodeApolloCache = ReplaceWithApolloType<Episode>
export type TitleHandleApolloCache = ReplaceWithApolloType<TitleHandle>
export type TitleApolloCache = ReplaceWithApolloType<Title>

