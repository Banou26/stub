import type { Title, TitleHandle } from 'src/lib'
import type { OptionalToNullable, ReplaceTypeWithType } from '../types'

import { StoreObject } from '@apollo/client'

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
