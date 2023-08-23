import type { Category } from '../../../../../scannarr/src'

import { css } from '@emotion/react'

import { pipe } from 'fp-ts/lib/function'
import * as A from 'fp-ts/lib/Array'

// import { searchSeries } from '../../../../../scannarr/src'
import { getCurrentSeason } from '../../../../../laserr/src/targets/anilist'
// import { byPopularity } from '../../../../../scannarr/src/utils'

import useObservable from '../../utils/use-observable'
import MediaCard from '../../components/card'
import { useQuery } from '@apollo/client'
import { gql } from '../../generated'
import { MediaSeason, MediaSort } from '../../generated/graphql'

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
        ...GetMediaTestFragment
        handles {
          edges {
            node {
              ...GetMediaTestFragment
            }
          }
        }
      }
    }
  }
`

export default ({ category }: { category?: Category }) => {
  const currentSeason = getCurrentSeason()
  const [currentSeasonResult] = useQuery(
    GET_CURRENT_SEASON,
    {
      variables: {
        season: currentSeason.season,
        seasonYear: currentSeason.year,
        sort: [MediaSort.Popularity]
      }
    }
  )
  const { error, data: { Page } = {} } = currentSeasonResult

  if (error) console.error('error', error)
  console.log('Page', Page)

  // const categoryItems = []

  // const { left: _continuations, right: _currentSeasonAnime } =
  //   pipe(
  //     categoryItems ?? [],
  //     // todo: remove once user UI filters/sorts are implemented
  //     A.filter(item => !item.genres?.some(genre => genre.adult)),
  //     A.partition(item => {
  //       const dateData = item.dates?.at(0)
  //       if (!dateData) return false
  //       const dateSeason =
  //         getCurrentSeason(
  //           0,
  //           'date' in dateData
  //             ? dateData.date
  //             : dateData.start
  //         )
  //       return currentSeason.season === dateSeason.season && currentSeason.year === dateSeason.year
  //     })
  //   )

  // const currentSeasonAnime =
  //   pipe(
  //     _currentSeasonAnime,
  //     // A.sortBy([byPopularity])
  //   )

  // const continuations =
  //   pipe(
  //     _continuations,
  //     // A.sortBy([byPopularity])
  //   )

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
