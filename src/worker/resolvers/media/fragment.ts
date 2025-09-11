import { gql } from '../../../generated'

export const MEDIA_FRAGMENT = gql(`
  fragment MediaFragment on Media {
    _id
    uri
    origin
    id
    url
    aggregated
    handles {
      _id
      uri
      origin
      id
      url
      aggregated
    }
  }
`)
