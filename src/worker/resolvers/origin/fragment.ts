import { gql } from '../../../generated'

export const MEDIA_FRAGMENT = gql(`
  fragment MediaFragment on Media {
    _id
    uri
    origin
    id
    url
    handles {
      _id
      uri
      origin
      id
      url
    }
  }
`)

export const ORIGIN_FRAGMENT = gql(`
  fragment OriginFragment on Origin {
    id
    url
    name
    icon
    color
    isApiOnly
  }
`)
