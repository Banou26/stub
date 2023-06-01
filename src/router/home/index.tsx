import { css } from '@emotion/react'
import { redirect, Navigate } from 'react-router-dom'
import { useEffect, useMemo } from 'react'
import { useObservable } from 'react-use'

// import Slider from '../../components/slider'
// import { Category, searchSeries, TitleHandle } from '../../../../../scannarr/src'
// import { searchTitles } from '../../../../../scannarr/src'
// import { useFetch } from '../../utils/use-fetch'
import { getRoutePath, Route } from '../path'

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
  return <Navigate to={getRoutePath(Route.ANIME)}/>
  // const { data: movies } = useFetch<TitleHandle[]>(() => searchTitles({ categories: ['MOVIE'], latest: true }))
  // const { data: shows } = useFetch<TitleHandle[]>(() => searchTitles({ categories: ['SHOW'], latest: true }))
  // const movie$ = useMemo(() => searchSeries({ categories: ['MOVIE'], latest: true }), [])
  // const shows$ = useMemo(() => searchSeries({ categories: ['SHOW'], latest: true }), [])
  // const anime$ = useMemo(() => searchSeries({ categories: ['ANIME'], latest: true }), [])
  // const latestMovies = useObservable(movie$)
  // const latestShows = useObservable(shows$)
  // const latestAnime = useObservable(anime$)

  // console.log('latestAnime', latestAnime)

  // // const { data: animes } = useFetch<TitleHandle[]>(() => getLatest({ categories: ['ANIME'], title: true }))
  // // const { data: animes } = useFetch(() => searchTitle({ latest: true, categories: ['ANIME']  }))
  // // const { data: { searchTitle: animes } = {} } = useQuery<SearchTitle>(SEARCH_TITLE, { variables: { latest: true, categories: [Category.ANIME]  } })
  // return (
  //   <div css={style}>
  //     <div className="anime">
  //       <Link href="/category/movies" className="category">Movies[PLANNED]</Link>
  //       <Slider>
  //         {
  //           latestMovies
  //             ?.slice(0, 20)
  //             .map(item =>
  //               <Link key={item.id} href={`/title/${item.id}`} className="item" style={{ backgroundImage: `url(${item.images.at(0)?.url})` }}>
  //                 <h3 style={{ color: 'white' }}>{item.names.at(0)?.name}</h3>
  //               </Link>
  //             )
  //         }
  //       </Slider>

  //       <Link href="/category/shows" className="category">Shows[PLANNED]</Link>
  //       <Slider>
  //         {
  //           latestShows
  //             ?.slice(0, 20)
  //             .map(item =>
  //               <Link key={item.id} href={`/title/${item.id}`} className="item" style={{ backgroundImage: `url(${item.images.at(0)?.url})` }}>
  //                 <h3 style={{ color: 'white' }}>{item.names.at(0)?.name}</h3>
  //               </Link>
  //             )
  //         }
  //       </Slider>

  //       <Link href="/category/anime" className="category">Anime</Link>
  //       <Slider>
  //         {
  //           latestAnime
  //             ?.slice(0, 20)
  //             .map(item =>
  //               <Link key={item.uri} href={`/title/${item.uri}`} className="item" style={{ backgroundImage: `url(${item.images.at(0)?.url})` }}>
  //                 <h3 style={{ color: 'white' }}>{item.names.at(0)?.name}</h3>
  //               </Link>
  //             )
  //         }
  //       </Slider>
  //     </div>
  //   </div>
  // )
}
