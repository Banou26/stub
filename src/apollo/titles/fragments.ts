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
  ${HANDLE_FRAGMENT}
  fragment ImageFragment on Image {
    ...HandleFragment
    type
    size
    url
  }
`

export const NAME_FRAGMENT = gql`
  ${HANDLE_FRAGMENT}
  fragment NameFragment on Name {
    ...HandleFragment
    language
    name
  }
`

export const SYNOPSIS_FRAGMENT = gql`
  ${HANDLE_FRAGMENT}
  fragment SynopsisFragment on Synopsis {
    ...HandleFragment
    language
    synopsis
  }
`

export const RELEASE_DATE_FRAGMENT = gql`
  ${HANDLE_FRAGMENT}
  fragment ReleaseDateFragment on ReleaseDate {
    ...HandleFragment
    language
    date
    start
    end
  }
`

export const GENRE_FRAGMENT = gql`
  ${HANDLE_FRAGMENT}
  fragment GenreFragment on Genre {
    ...HandleFragment
    name
    adult
    amount
    categories
  }
`

export const TAG_FRAGMENT = gql`
  ${HANDLE_FRAGMENT}
  fragment TagFragment on Tag {
    ...HandleFragment
    type
    values
    extra
  }
`

export const EPISODE_HANDLE_FRAGMENT = gql`
  ${HANDLE_FRAGMENT}
  ${IMAGE_FRAGMENT}
  fragment EpisodeHandleFragment on EpisodeHandle {
    ...HandleFragment
    season
    number
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
      ...NameFragment
    }
    releaseDates {
      ...ReleaseDateFragment
    }
    images {
      ...ImageFragment
    }
    synopses {
      ...SynopsisFragment
    }
    handles {
      ...EpisodeHandleFragment
    }
    related {
      ...HandleFragment
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
      ...NameFragment
    }
    releaseDates {
      ...ReleaseDateFragment
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