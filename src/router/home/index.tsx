import type { SearchResult } from 'src/lib/targets'

import { useState, useEffect } from 'react'
import { css } from '@emotion/react'
import { Link } from 'raviger'

import { getLatestMovies, getLatestShows } from 'src/lib/targets/google'
import { getAnimeSeason } from 'src/lib/targets/myanimelist'
import Slider from 'src/components/slider'

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
  const [animes, setAnimes] = useState<SearchResult[]>()
  const [movies, setMovies] = useState<SearchResult[]>()
  const [shows, setShows] = useState<SearchResult[]>()
  console.log('animes', animes)
  console.log('movies', movies)
  console.log('shows', shows)
  useEffect(() => void getAnimeSeason().then(setAnimes), [])
  // @ts-ignore
  useEffect(() => void getLatestMovies().then(setMovies), [])
  // @ts-ignore
  useEffect(() => void getLatestShows().then(setShows), [])

  return (
    <div css={style}>
      <div className="anime">
        <Link href="/movies" className="category">Movies</Link>
        <Slider>
          {
            movies
              ?.slice(0, 20)
              .map(movie =>
                <Link key={movie.name} href={`/movie/${movie.name}`} className="item" style={{ backgroundImage: `url(${movie.image})` }}>
                  <h3 style={{ color: 'white' }}>{movie.name}</h3>
                </Link>
              )
          }
        </Slider>

        <Link href="/shows" className="category">Shows</Link>
        <Slider>
          {
            shows
              ?.slice(0, 20)
              .map(movie =>
                <Link key={movie.name} href={`/movie/${movie.name}`} className="item" style={{ backgroundImage: `url(${movie.image})` }}>
                  <h3 style={{ color: 'white' }}>{movie.name}</h3>
                </Link>
              )
          }
        </Slider>

        <Link href="/animes" className="category">Animes</Link>
        <Slider>
          {
            animes
              ?.slice(0, 20)
              .map(anime =>
                <Link key={anime.name} href={`/anime/${anime.name}`} className="item" style={{ backgroundImage: `url(${anime.image})` }}>
                  <h3 style={{ color: 'white' }}>{anime.name}</h3>
                </Link>
              )
          }
        </Slider>
      </div>
    </div>
  )
}
