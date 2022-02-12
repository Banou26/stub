import { gql } from '@apollo/client'

import { EPISODE_FRAGMENT } from '../episodes'
import { GENRE_FRAGMENT, HANDLE_FRAGMENT, IMAGE_FRAGMENT, NAME_FRAGMENT, RELEASE_DATE_FRAGMENT, SYNOPSIS_FRAGMENT, TAG_FRAGMENT } from '../fragments'

export const TITLE_HANDLE_FRAGMENT = gql`
  ${HANDLE_FRAGMENT}
  ${IMAGE_FRAGMENT}
  ${NAME_FRAGMENT}
  ${RELEASE_DATE_FRAGMENT}
  ${SYNOPSIS_FRAGMENT}
  fragment TitleHandleFragment on TitleHandle {
    ...HandleFragment
    ...NameFragment
    ...ReleaseDateFragment
    ...ImageFragment
    ...SynopsisFragment
    related {
      ...HandleFragment
    }
  }
`

export const TITLE_FRAGMENT = gql`
  ${HANDLE_FRAGMENT}
  ${EPISODE_FRAGMENT}
  ${GENRE_FRAGMENT}
  ${TAG_FRAGMENT}
  ${TITLE_HANDLE_FRAGMENT}
  ${IMAGE_FRAGMENT}
  ${NAME_FRAGMENT}
  ${RELEASE_DATE_FRAGMENT}
  ${SYNOPSIS_FRAGMENT}
  fragment TitleFragment on Title {
    categories
    uri
    ...NameFragment
    names {
      handle {
        ...TitleHandleFragment
      }
    }
    ...ReleaseDateFragment
    releaseDates {
      handle {
        ...TitleHandleFragment
      }
    }
    ...ImageFragment
    images {
      handle {
        ...TitleHandleFragment
      }
    }
    ...SynopsisFragment
    synopses {
      handle {
        ...TitleHandleFragment
      }
    }
    related {
      ...HandleFragment
    }
    handles {
      ...TitleHandleFragment
    }
    episodes {
      ...EpisodeFragment
    }
    recommended {
      ...HandleFragment
    }
    tags {
      ...TagFragment
    }
    genres {
      ...GenreFragment
    }
  }
`
