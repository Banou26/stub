import { css } from '@emotion/react'

import MediaCard from '../../components/card'
import {  MediaSort } from '../../generated/graphql'
import { useSearchParams } from 'react-router-dom'
import { useMemo } from 'react'
import { getCurrentSeason } from 'laserr/src/targets/anilist'
import { useQuery } from 'urql'

const style = css`

padding: 5rem 10rem;

h2 {
  font-size: 4rem;
  padding: 5rem;
}

.section:not(:first-of-type) {
  margin-top: 10rem;
}

.anime {

}

.category {
  font-size: 5rem;
}

.items {
  display: grid;
  justify-items: center;
  grid-template-columns: repeat(auto-fill, minmax(calc(25rem + 40rem), 1fr));
  grid-auto-rows: 30rem;
  grid-gap: 3.5rem 0;
}

@media
screen and (max-width : 2560px),
screen and (max-height : 1440px) {
  .items {
    display: grid;
    justify-items: center;
    grid-template-columns: repeat(auto-fill, minmax(calc(20rem + 32rem), 1fr));
    grid-auto-rows: 30rem;
    grid-gap: 3.5rem 0;
  }
  /* grid-template-columns: 20rem 32rem; */
}
`

export const GET_CURRENT_SEASON = `#graphql
  fragment GetMediaTestFragment on Media {
    origin
    id
    uri
    url
    title {
      romanized
      english
      native
    }
    bannerImage
    coverImage {
      color
      default
      extraLarge
      large
      medium
      small
    }
    description
    shortDescription
    season
    seasonYear
    popularity
    averageScore
    episodeCount
    episodes {
      edges {
        node {
          origin
          id
          uri
          url
          number
          airingAt
          title {
            romanized
            english
            native
          }
          description
          thumbnail
        }
      }
    }
    trailers {
      origin
      id
      uri
      url
      thumbnail
    }
    startDate {
      year
      month
      day
    }
    endDate {
      year
      month
      day
    }
  }

  query GetCurrentSeason($season: MediaSeason!, $seasonYear: Int!, $sort: [MediaSort]!) {
    Page {
      media(season: $season, seasonYear: $seasonYear, sort: $sort) {
        handles {
          edges {
            node {
              ...GetMediaTestFragment
            }
          }
        }
        ...GetMediaTestFragment
      }
    }
  }
`

export default () => {
  const [searchParams] = useSearchParams()
  const mediaUriModal = searchParams.get('details')
  const currentSeason = useMemo(() => getCurrentSeason(), [])
  const [currentSeasonResult] = useQuery(
    {
      query: GET_CURRENT_SEASON,
      variables: {
        season: currentSeason.season,
        seasonYear: currentSeason.year,
        sort: [MediaSort.Popularity]
      }
    }
  )
  const { error, data: { Page } = {} } = currentSeasonResult

  const anchorCurrentSeason = `${currentSeason.season.toLowerCase()}-${currentSeason.year}`

  return (
    <div css={style}>
      <div className="section">
        <a id={anchorCurrentSeason} href={`#${anchorCurrentSeason}`}>
          <h2>Current season</h2>
        </a>
        <div className="items">
          {
            Page?.media?.map(media =>
              <MediaCard key={media.uri} media={media}/>
            )
          }
        </div>
      </div>
      {/* <div className="section">
        <a id={anchorCurrentSeason} href={`#${anchorCurrentSeason}`}>
          <h2>Current season</h2>
        </a>
        <div className="items">
          {
            currentSeasonAnime?.map(item =>
              <Card key={item.uri} series={item}/>
            )
          }
        </div>
      </div> */}
      {/* <div className="section">
        <a id={`${anchorCurrentSeason}-leftovers`} href={`#${anchorCurrentSeason}-leftovers`}>
          <h2>Leftovers</h2>
        </a>
        <div className="items">
          {
            continuations?.map(item =>
              <Card key={item.uri} series={item}/>
            )
          }
        </div>
      </div> */}
    </div>
  )
}
