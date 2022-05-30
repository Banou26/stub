
import { useState, useEffect } from 'react'
import { css } from '@emotion/react'
import { Link } from 'raviger'

import type { Category, TitleHandle } from '../../../../scannarr/src'
import { getLatest, searchTitles } from '../../../../scannarr/src'
import Slider from 'src/components/slider'
import Title from 'src/components/title'
import { useFetch } from '../utils/use-fetch'

const style = css`

padding: 5rem;

.anime {

}

.category {
  font-size: 5rem;
}

.items {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(22.5rem, 1fr));
  grid-auto-rows: 31.8rem;
  grid-gap: 2.5rem;
}
`

export default ({ category }: { category?: Category }) => {
  const { loading, data: categoryItems, error } = useFetch<TitleHandle[]>(() => searchTitle({ categories: [category!], latest: true }), { skip: !category })

  return (
    <div css={style}>
      <div className="items">
        {
          categoryItems?.map(item => <Title key={item.uri} title={item}/>)
        }
      </div>
    </div>
  )
}
