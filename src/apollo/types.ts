import type { Episode, EpisodeHandle, Title, TitleHandle } from 'src/lib'
import type { EpisodeHandleToEpisodeHandleApolloCache, EpisodeToEpisodeApolloCache } from './episodes'
import type { TitleHandleToTitleHandleApolloCache, TitleToTitleApolloCache } from './titles'

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

export type OptionalToNullable<T> =
  Required<{
    [key in keyof T]:
      T[key] extends Record<string | number | symbol, any>
      ? OptionalToNullable<T[key]>
      : T[key] extends Partial<T[key]>
          ? T[key] | null
          : T[key]
  }>

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
