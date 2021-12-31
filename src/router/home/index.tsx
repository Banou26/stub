import { useQuery } from '@apollo/client'
import { css } from '@emotion/react'
import { Link } from 'raviger'

import Slider from 'src/components/slider'
import { Category, getLatest, TitleHandle } from 'src/lib'
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

export default () => {
  const { data: movies } = useFetch<TitleHandle[]>(() => getLatest({ categories: [Category.MOVIE], title: true }))
  const { data: shows } = useFetch<TitleHandle[]>(() => getLatest({ categories: [Category.SHOW], title: true }))
  const { data: animes } = useFetch<TitleHandle[]>(() => getLatest({ categories: [Category.ANIME], title: true }))

  return (
    <div css={style}>
      <div className="anime">
        <Link href="/category/movies" className="category">Movies</Link>
        <Slider>
          {
            movies
              ?.slice(0, 20)
              .map(item =>
                <Link key={item.id} href={`/title/${item.id}`} className="item" style={{ backgroundImage: `url(${item.images.at(0)?.url})` }}>
                  <h3 style={{ color: 'white' }}>{item.names.at(0)?.name}</h3>
                </Link>
              )
          }
        </Slider>

        <Link href="/category/shows" className="category">Shows</Link>
        <Slider>
          {
            shows
              ?.slice(0, 20)
              .map(item =>
                <Link key={item.id} href={`/title/${item.id}`} className="item" style={{ backgroundImage: `url(${item.images.at(0)?.url})` }}>
                  <h3 style={{ color: 'white' }}>{item.names.at(0)?.name}</h3>
                </Link>
              )
          }
        </Slider>

        <Link href="/category/animes" className="category">Animes</Link>
        <Slider>
          {
            animes
              ?.slice(0, 20)
              .map(item =>
                <Link key={item.id} href={`/title/${item.id}`} className="item" style={{ backgroundImage: `url(${item.images.at(0)?.url})` }}>
                  <h3 style={{ color: 'white' }}>{item.names.at(0)?.name}</h3>
                </Link>
              )
          }
        </Slider>
      </div>
    </div>
  )
}
