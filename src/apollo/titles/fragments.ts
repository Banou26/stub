import { gql } from '@apollo/client'

export const IMAGE_FRAGMENT = gql`
  fragment ImageFragment on Image {
    type
    size
    url
  }
`

export const TITLE_NAME_FRAGMENT = gql`
  fragment TitleNameFragment on TitleName {
    language
    name
  }
`

export const TITLE_SYNOPSIS_FRAGMENT = gql`
  fragment TitleSynopsisFragment on TitleSynopsis {
    language
    synopsis
  }
`

export const HANDLE_FRAGMENT = gql`
  fragment HandleFragment on Handle {
    scheme
    id
    uri
    url
  }
`

export const TITLE_FRAGMENT = gql`
  ${HANDLE_FRAGMENT}
  ${IMAGE_FRAGMENT}
  ${TITLE_NAME_FRAGMENT}
  ${TITLE_SYNOPSIS_FRAGMENT}
  fragment TitleFragment on Title {
    names {
      ...TitleNameFragment
    }
    images {
      ...ImageFragment
    }
    synopses {
      ...TitleSynopsisFragment
    }
    related {
      ...HandleFragment
    }
    handles {
      ...HandleFragment
    }
    episodes {
      ...HandleFragment
    }
    recommended {
      ...HandleFragment
    }
  }
`

export const TITLE_HANDLE_FRAGMENT = gql`
  ${HANDLE_FRAGMENT}
  ${IMAGE_FRAGMENT}
  ${TITLE_NAME_FRAGMENT}
  fragment TitleHandleFragment on TitleHandle {
    ...HandleFragment
    names {
      ...TitleNameFragment
    }
    images {
      ...ImageFragment
    }
    synopses {
      ...TitleSynopsisFragment
    }
    related {
      ...HandleFragment
    }
  }
`

export const EPISODE_FRAGMENT = gql`
  ${HANDLE_FRAGMENT}
  ${IMAGE_FRAGMENT}
  ${TITLE_NAME_FRAGMENT}
  ${TITLE_SYNOPSIS_FRAGMENT}
  fragment EpisodeFragment on Episode {
    names {
      ...TitleNameFragment
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
      ...TitleSynopsisFragment
    }
    related {
      ...HandleFragment
    }
  }
`
