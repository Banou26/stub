
import { css } from '@emotion/react'

import type { Category } from '../../../../scannarr/src'
import { searchSeries } from '../../../../scannarr/src'
import Card from 'src/components/card'
import useObservable from '../utils/use-observable'

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
  return (
    <div css={style}>
      <div className="items">
        {
          sortedItems?.map(item =>
            <Card key={item.uri} series={item}/>  
          )
        }
      </div>
    </div>
  )
}
