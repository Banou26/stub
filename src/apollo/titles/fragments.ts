import { gql } from '@apollo/client'

export const IMAGE_FRAGMENT = gql`
  fragment ImageFragment on Image {
    type
    size
    url
  }
`

export const NAME_FRAGMENT = gql`
  fragment NameFragment on Name {
    language
    name
  }
`

export const SYNOPSIS_FRAGMENT = gql`
  fragment SynopsisFragment on Synopsis {
    language
    synopsis
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

export const GENRE_FRAGMENT = gql`
  ${HANDLE_FRAGMENT}
  fragment GenreFragment on Genre {
    name
    adult
    amount
    categories
    handles {
      ...HandleFragment
    }
  }
`

export const TAG_FRAGMENT = gql`
  fragment TagFragment on Tag {
    type
    values
    extra
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
      ...HandleFragment
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

export const EPISODE_FRAGMENT = gql`
  ${HANDLE_FRAGMENT}
  ${IMAGE_FRAGMENT}
  ${NAME_FRAGMENT}
  ${SYNOPSIS_FRAGMENT}
  fragment EpisodeFragment on Episode {
    categories
    names {
      ...NameFragment
    }
    images {
      ...ImageFragment
    }
    handles {
      ...HandleFragment
    }
    related {
      ...HandleFragment
    }
  }
`

export const EPISODE_HANDLE_FRAGMENT = gql`
  ${HANDLE_FRAGMENT}
  ${IMAGE_FRAGMENT}
  fragment EpisodeHandleFragment on EpisodeHandle {
    ...HandleFragment
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
