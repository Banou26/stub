import { gql } from '../../../generated'

export const EPISODE_FRAGMENT = gql(`
  fragment EpisodeFragment on Episode {
    _id
    uri
    origin
    id
    url
    mediaUri
    aggregated
  }
`)
