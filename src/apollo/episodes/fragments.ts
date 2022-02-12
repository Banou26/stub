import { gql } from '@apollo/client'

import { HANDLE_FRAGMENT, IMAGE_FRAGMENT, NAME_FRAGMENT, RELEASE_DATE_FRAGMENT, SYNOPSIS_FRAGMENT } from '../fragments'

export const EPISODE_HANDLE_FRAGMENT = gql`
  ${HANDLE_FRAGMENT}
  ${IMAGE_FRAGMENT}
  ${NAME_FRAGMENT}
  ${SYNOPSIS_FRAGMENT}
  ${RELEASE_DATE_FRAGMENT}
  fragment EpisodeHandleFragment on EpisodeHandle {
    ...HandleFragment
    season
    number
    resolution
    type
    ...NameFragment
    ...ImageFragment
    ...SynopsisFragment
    related {
      ...HandleFragment
    }
  }
`

export const EPISODE_FRAGMENT = gql`
  ${HANDLE_FRAGMENT}
  ${EPISODE_HANDLE_FRAGMENT}
  ${IMAGE_FRAGMENT}
  ${NAME_FRAGMENT}
  ${RELEASE_DATE_FRAGMENT}
  ${SYNOPSIS_FRAGMENT}
  fragment EpisodeFragment on Episode {
    uri
    season
    number
    categories
    ...NameFragment
    names {
      handle {
        ...EpisodeHandleFragment
      }
    }
    ...ReleaseDateFragment
    releaseDates {
      handle {
        ...EpisodeHandleFragment
      }
    }
    ...ImageFragment
    images {
      handle {
        ...EpisodeHandleFragment
      }
    }
    ...SynopsisFragment
    synopses {
      handle {
        ...EpisodeHandleFragment
      }
    }
    handles {
      ...HandleFragment
      ...EpisodeHandleFragment
    }
    related {
      handle {
        ...EpisodeHandleFragment
      }
    }
  }
`
