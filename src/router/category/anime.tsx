import { css } from '@emotion/react'

import type { Category } from '../../../../../scannarr/src'
import { searchSeries } from '../../../../../scannarr/src'
import Card from 'src/components/card'
import useObservable from '../../utils/use-observable'
import { getCurrentSeason } from '../../../../../laserr/src/targets/anilist'
import { pipe } from 'fp-ts/lib/function'
import { filter, sortBy } from 'fp-ts/lib/NonEmptyArray'
import * as A from 'fp-ts/lib/Array'

const style = css`

padding: 5rem 10rem;

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
`

export default ({ category }: { category?: Category }) => {
  const { value: categoryItems } = useObservable(
    () => searchSeries({ categories: [category!], latest: true }),
    []
  )

  const sortedItems = categoryItems
    ?.sort(({ popularity }, { popularity: popularity2 }) => (popularity2 ?? 0) - (popularity ?? 0))

  // const { loading, data: categoryItems, error } = useFetch<TitleHandle[]>(() => searchTitle({ categories: [category!], latest: true }), { skip: !category })
  console.log('categoryItems', categoryItems)

  const currentSeason = getCurrentSeason()

  const currentSeasonAnime =
    pipe(
      categoryItems ?? [],
      A.filter(Boolean),
      // A.filter(item => item)
    )

  return (
    <div css={style}>
      <div>
        <h3>This season</h3>
        <div className="items">
          {
            sortedItems?.map(item =>
              <Card key={item.uri} series={item}/>  
            )
          }
        </div>
      </div>
      {/* <div>
        <h3>Continuing</h3>
        <div className="items">
          {
            sortedItems?.map(item =>
              <Card key={item.uri} series={item}/>
            )
          }
        </div>
      </div> */}
    </div>
  )
}
