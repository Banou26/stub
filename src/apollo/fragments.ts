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
  fragment ImageFragment on Handle {
    images {
      type
      size
      url
    }
  }
`

export const NAME_FRAGMENT = gql`
  fragment NameFragment on Handle {
    names {
      search
      language
      name
    }
  }
`

export const SYNOPSIS_FRAGMENT = gql`
  fragment SynopsisFragment on Handle {
    synopses {
      language
      synopsis
    }
  }
`

export const RELEASE_DATE_FRAGMENT = gql`
  fragment ReleaseDateFragment on Handle {
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