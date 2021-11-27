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

export const TITLE_HANDLE_FRAGMENT = gql`
  ${IMAGE_FRAGMENT}
  ${TITLE_NAME_FRAGMENT}
  fragment TitleHandleFragment on TitleHandle {
    names {
      ...TitleNameFragment
    }
    protocol
    id
    url
    images {
      ...ImageFragment
    }
    synopses {
      ...TitleSynopsisFragment
    }
    related {
      protocol
      id
    }
  }
`

export const TITLE_FRAGMENT = gql`
  ${TITLE_HANDLE_FRAGMENT}
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
    handles {
      protocol
      id
    }
    episodes {
      
    }
  }
`

export const EPISODE_HANDLE_FRAGMENT = gql`
  ${IMAGE_FRAGMENT}
  fragment EpisodeHandleFragment on EpisodeHandle {
    episode {
      id
    }
    protocol
    id
    url
    images {
      ...ImageFragment
    }
    synopsis
    relatedEpisodes {
      id
    }
  }
`

export const EPISODE_FRAGMENT = gql`
  ${EPISODE_HANDLE_FRAGMENT}
  fragment EpisodeFragment on Episode {
    name
    handles {
      id
    }
  }
`
