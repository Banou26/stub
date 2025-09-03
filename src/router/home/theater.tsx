import type { GetReleasingMediaPageSubscription } from '../../generated/graphql'

import { css } from '@emotion/react'
import { useSubscription } from 'urql'
import { useMemo } from 'preact/compat'

import { gql } from '../../generated'
import { getEllipsedDescription, parseTextDescription } from './utils'

const style = css`
position: relative;

padding-top: 0;

a:has(>h2) {
  h2 {
    display: inline-block;
    font-size: 1.5rem;
    font-weight: 600;
    padding-bottom: .5rem;
    @media (min-width: 1024px) {
      font-size: 2rem;
    }
    @media (min-width: 1440px) {
      font-size: 2.25rem;
    }
    @media (min-width: 2560px) {
      font-size: 4rem;
      font-weight: bold;
    }
  }
}

position: absolute;

display: none;
@media (min-width: 960px) {
  display: flex;
}
justify-content: space-between;
align-items: center;

width: 100%;
height: calc(100vh - 5rem);

padding-bottom: 0;

.serie-title {
  font-size: 4rem;
  font-weight: 700;
}

.theater-content {
  position: absolute;
  top: 46%;
  @media (min-width: 2560px) {
    top: 40rem;
  }

  z-index: 20;

  display: flex;
  flex-direction: column;
  align-items: flex-start;

  padding: 5rem 5rem;
  @media (min-width: 2560px) {
    padding: 5rem 10rem;
  }

  padding-top: 0;
  padding-bottom: 0;
  text-shadow: rgb(0 0 0 / 80%) -1px -1px 0, rgb(0 0 0 / 80%) -1px 1px 0, rgb(0 0 0 / 80%) 1px -1px 0, rgb(0 0 0 / 80%) 1px 1px 0;

  .theater-title {
    > h1 {
      font-size: 1.5rem;
      font-weight: 600;

      @media (min-width: 1024px) {
        font-size: 1.8rem;
      }
      @media (min-width: 1440px) {
        font-size: 2rem;
      }
      @media (min-width: 2560px) {
        font-size: 3rem;
      }
    }
    color: #fff;
    max-width: 75rem;
  }

  .theater-description {
    font-size: 1.25rem;
    @media (min-width: 1024px) {
      font-size: 1.4rem;
      margin-top: .5rem;
    }
    @media (min-width: 2560px) {
      font-size: 1.8rem;
      margin-top: 2rem;
    }
    font-weight: 500;
    line-height: 1.5;
    color: #fff;
    max-width: 50rem;
  }
}

.player-wrapper {
  display: inline;
  width: 100%;

  a {
    text-decoration: none;
  }

  .watch {
    background: none;
    border: none;
    outline: none;
    cursor: pointer;
    color: #fff;
    font-size: 2rem;
    font-weight: 500;
    @media (min-width: 2560px) {
      font-size: 3rem;
    }
    padding: 1rem 0;
    margin: 0;
    text-shadow: rgb(0 0 0 / 80%) -1px -1px 0, rgb(0 0 0 / 80%) -1px 1px 0, rgb(0 0 0 / 80%) 1px -1px 0, rgb(0 0 0 / 80%) 1px 1px 0;
    transition: all 0.2s ease-in-out;
    display: flex;
    align-items: center;

    svg {
      margin-right: 1rem;
    }

    &:hover {
      color: #aaa;
    }
  }
}

.player {
  height: calc(100vh - 5rem) !important;
  overflow: hidden;
  & > div:first-of-type {
    grid-area: container;
    height: 140vh !important;
    width: 100% !important;
    margin-top: -20vh;
    pointer-events: none;
  }

  .volume-area-wrapper {
    z-index: 25;
    bottom: unset;
    top: 41%;
    @media (min-width: 2560px) {
      top: 35rem;
      left: 9rem;
    }
    left: 4rem;
  }
}

.shadow {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  width: 100%;
  height: 30vh;

  background:
    linear-gradient(
      0deg,
      rgba(15, 15, 15, 1) 0%,
      rgba(15, 15, 15, 0.5) calc(100% - 10rem),
      rgba(15, 15, 15, 0) 100%
    );
}
`

const GET_THEATHER_MEDIA = gql(`
  subscription GetTheatherMedia($input: MediaInput!) {
    media(input: $input) {
      uri
      _id
      titles {
        language
        title
        score
      }
      descriptions {
        language
        description
      }
      shortDescriptions {
        language
        shortDescription
      }
      covers {
        language
        url
      }
      banners {
        language
        url
      }
      popularity
    }
  }
`)


const HomeHeader = ({ mediaNodes }: { mediaNodes: GetReleasingMediaPageSubscription['mediaPage']['nodes'] }) => {
  const randomNum = useMemo(() => Math.floor(Math.random() * Math.min(10, mediaNodes.length ?? 0)), [mediaNodes.length])
  const theaterMedia = useMemo(() => mediaNodes.at(randomNum), [mediaNodes, randomNum])
  const [{ data }] = useSubscription({
    query: GET_THEATHER_MEDIA,
    variables: {
      input: {
        uri: theaterMedia?.uri
      }
    },
    pause: !theaterMedia
  })


  const description = theaterMedia?.descriptions?.at(0)

  const descriptionText = useMemo(
    () => description ? parseTextDescription(description.description) : undefined,
    [description]
  )

  const ellipsedDescriptionText = useMemo(
    () => getEllipsedDescription(descriptionText),
    [descriptionText]
  )


  return (
    <div className="theater" css={style}>

    </div>
  )
}

export default HomeHeader
