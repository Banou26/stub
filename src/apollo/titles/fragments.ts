import { gql } from '@apollo/client'

export const SHALLOW_HANDLE_FRAGMENT = gql`
  fragment ShallowHandleFragment on Handle {
    scheme
    id
    uri
    url
  }
`

export const HANDLE_FRAGMENT = gql`
  ${SHALLOW_HANDLE_FRAGMENT}
  fragment HandleFragment on Handle {
    ...ShallowHandleFragment
    handles {
      ...ShallowHandleFragment
    }
  }
`

export const IMAGE_FRAGMENT = gql`
  fragment ImageFragment on Image {
    type
    size
    url
  }
`

export const HANDLE_IMAGE_FRAGMENT = gql`
  fragment HandleImageFragment on Handle {
    images {
      type
      size
      url
    }
  }
`

export const NAME_FRAGMENT = gql`
  fragment NameFragment on Name {
    language
    name
  }
`

export const HANDLE_NAME_FRAGMENT = gql`
  fragment HandleNameFragment on Handle {
    names {
      language
      name
    }
  }
`

export const SYNOPSIS_FRAGMENT = gql`
  fragment SynopsisFragment on Synopsis {
    language
    synopsis
  }
`

export const HANDLE_SYNOPSIS_FRAGMENT = gql`
  fragment HandleSynopsisFragment on Handle {
    synopses {
      language
      synopsis
    }
  }
`

export const RELEASE_DATE_FRAGMENT = gql`
  fragment ReleaseDateFragment on ReleaseDate {
    language
    date
    start
    end
  }
`

export const HANDLE_RELEASE_DATE_FRAGMENT = gql`
  fragment HandleReleaseDateFragment on Handle {
    releaseDates {
      language
      date
      start
      end
    }
  }
`

export const GENRE_FRAGMENT = gql`
  fragment GenreFragment on Genre {
    name
    adult
    amount
    categories
  }
`

export const TAG_FRAGMENT = gql`
  fragment TagFragment on Tag {
    type
    values
    extra
  }
`

export const EPISODE_HANDLE_FRAGMENT = gql`
  ${HANDLE_FRAGMENT}
  ${IMAGE_FRAGMENT}
  ${NAME_FRAGMENT}
  ${RELEASE_DATE_FRAGMENT}
  ${SYNOPSIS_FRAGMENT}
  ${HANDLE_IMAGE_FRAGMENT}
  ${HANDLE_NAME_FRAGMENT}
  ${HANDLE_SYNOPSIS_FRAGMENT}
  ${HANDLE_RELEASE_DATE_FRAGMENT}
  fragment EpisodeHandleFragment on EpisodeHandle {
    ...HandleFragment
    season
    number
    ...HandleNameFragment
    ...HandleImageFragment
    ...HandleSynopsisFragment
    related {
      ...HandleFragment
    }
  }
`

export const EPISODE_FRAGMENT = gql`
  ${HANDLE_FRAGMENT}
  ${IMAGE_FRAGMENT}
  ${NAME_FRAGMENT}
  ${RELEASE_DATE_FRAGMENT}
  ${SYNOPSIS_FRAGMENT}
  ${EPISODE_HANDLE_FRAGMENT}
  fragment EpisodeFragment on Episode {
    uri
    season
    number
    categories
    names {
      ...HandleFragment
      ...NameFragment
      handles {
        ...EpisodeHandleFragment
      }
    }
    releaseDates {
      ...HandleFragment
      ...ReleaseDateFragment
      handles {
        ...EpisodeHandleFragment
      }
    }
    images {
      ...HandleFragment
      ...ImageFragment
      handles {
        ...EpisodeHandleFragment
      }
    }
    synopses {
      ...HandleFragment
      ...SynopsisFragment
      handles {
        ...EpisodeHandleFragment
      }
    }
    handles {
      ...HandleFragment
      ...EpisodeHandleFragment
    }
    related {
      ...HandleFragment
      handles {
        ...EpisodeHandleFragment
      }
    }
  }
`

export const TITLE_HANDLE_FRAGMENT = gql`
  ${HANDLE_FRAGMENT}
  ${IMAGE_FRAGMENT}
  ${NAME_FRAGMENT}
  fragment TitleHandleFragment on TitleHandle {
    ...HandleFragment
    names {
      ...NameFragment
    }
    images {
      ...ImageFragment
    }
    synopses {
      ...SynopsisFragment
    }
    related {
      ...HandleFragment
    }
  }
`

export const TITLE_FRAGMENT = gql`
  ${HANDLE_FRAGMENT}
  ${EPISODE_FRAGMENT}
  ${IMAGE_FRAGMENT}
  ${NAME_FRAGMENT}
  ${RELEASE_DATE_FRAGMENT}
  ${SYNOPSIS_FRAGMENT}
  ${GENRE_FRAGMENT}
  ${TAG_FRAGMENT}
  ${TITLE_HANDLE_FRAGMENT}
  fragment TitleFragment on Title {
    categories
    uri
    names {
      ...HandleFragment
      ...NameFragment
    }
    releaseDates {
      ...HandleFragment
      ...ReleaseDateFragment
    }
    images {
      ...HandleFragment
      ...ImageFragment
    }
    synopses {
      ...HandleFragment
      ...SynopsisFragment
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