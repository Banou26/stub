import type { Category } from '../../../../../scannarr/src'

import { css } from '@emotion/react'

import { pipe } from 'fp-ts/lib/function'
import * as A from 'fp-ts/lib/Array'

import { searchSeries } from '../../../../../scannarr/src'
import { getCurrentSeason } from '../../../../../laserr/src/targets/anilist'
import { byPopularity } from '../../../../../scannarr/src/utils'

import { cachedFetch } from '../../utils/fetch'
import useObservable from '../../utils/use-observable'
import Card from '../../components/card'

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

export default ({ category }: { category?: Category }) => {
  const { value: categoryItems } = useObservable(
    () => searchSeries({ categories: [category!], latest: true }, { fetch: cachedFetch }),
    []
  )

  const sortedItems = categoryItems
    ?.sort(({ popularity }, { popularity: popularity2 }) => (popularity2 ?? 0) - (popularity ?? 0))

  // const { loading, data: categoryItems, error } = useFetch<TitleHandle[]>(() => searchTitle({ categories: [category!], latest: true }), { skip: !category })
  console.log('categoryItems', categoryItems)

  const currentSeason = getCurrentSeason()

  const { left: _continuations, right: _currentSeasonAnime } =
    pipe(
      categoryItems ?? [],
      // todo: remove once user UI filters/sorts are implemented
      A.filter(item => !item.genres?.some(genre => genre.adult)),
      A.partition(item => {
        const dateData = item.dates?.at(0)
        if (!dateData) return false
        const dateSeason =
          getCurrentSeason(
            0,
            'date' in dateData
              ? dateData.date
              : dateData.start
          )
        return currentSeason.season === dateSeason.season && currentSeason.year === dateSeason.year
      })
    )

  const currentSeasonAnime =
    pipe(
      _currentSeasonAnime,
      A.sortBy([byPopularity])
    )

  const continuations =
    pipe(
      _continuations,
      A.sortBy([byPopularity])
    )

  const anchorCurrentSeason = `${currentSeason.season.toLowerCase()}-${currentSeason.year}`

  return (
    <div css={style}>
      <div className="section">
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
      </div>
      <div className="section">
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
      </div>
    </div>
  )
}
