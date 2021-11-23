import type { SearchResult } from 'src/lib/targets'

import { useState, useEffect } from 'react'
import { css } from '@emotion/react'
import { Link } from 'raviger'

import { getLatest, Category } from 'src/lib'
import Slider from 'src/components/slider'
import { useFetch } from 'src/lib/hooks/utils'

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

.item {
  align-items: center;
  background-repeat: no-repeat;
  background-size: cover;

  display: grid;
  grid-template-rows: auto auto;
  align-content: end;
  span {
    text-align: center;
    text-shadow: rgb(0 0 0 / 80%) 1px 1px 0;
    padding-top: 1rem;
    background: linear-gradient(0deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.5) calc(100% - 1rem), rgba(0,0,0,0) 100%);
    font-size: 1.9rem;
    font-weight: 700;
  }
}
`

export default ({ category }: { category?: Category }) => {
  const { loading, data: categoryItems, error } = useFetch(() => getLatest({ categories: [category!.toUpperCase() as Category] }), { skip: !category })

  return (
    <div css={style}>
      <div className="items">
        {
          categoryItems
            ?.map(result =>
              <Link key={result.name} href={`/watch/${result.name}`} className="item" style={{ backgroundImage: `url(${result.image})` }}>
                <span style={{ color: 'white' }}>{result.name}</span>
              </Link>
            )
        }
      </div>
    </div>
  )
}
