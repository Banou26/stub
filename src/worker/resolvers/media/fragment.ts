import { gql } from '../../../generated'

export const MEDIA_FRAGMENT = gql(`
  fragment MediaFragment on Media {
    _id
    uri
    origin
    id
    url
    handles {
      relation
      node {
        _id
        uri
        origin
        id
        url
      }
    }
  }
`)
