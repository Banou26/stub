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

.item {
  align-items: center;
  background-repeat: no-repeat;
  background-size: cover;

  display: grid;
  grid-template-rows: auto auto;
  align-content: end;
  h3 {
    text-align: center;
    text-shadow: rgb(0 0 0 / 80%) 1px 1px 0;
    padding-top: 1rem;
    background: linear-gradient(0deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.5) calc(100% - 1rem), rgba(0,0,0,0) 100%);
  }
}
`

export default ({ category }: { category?: Category }) => {
  // const { loading, data, error } = useFetch('foobar', {  })
  
  // const [categoryItems, setCategoryItems] = useState<SearchResult[]>()

  // useEffect(() => void getLatest({ categories: [category as Category] }).then(setCategoryItems), [])

  return (
    <div css={style}>
      <div className="items">
        {/* {
          categoryItems
            .map(movie =>
              <Link key={movie.name} href={`/movie/${movie.name}`} className="item" style={{ backgroundImage: `url(${movie.image})` }}>
                <h3 style={{ color: 'white' }}>{movie.name}</h3>
              </Link>
            )
        } */}
      </div>
    </div>
  )
}
