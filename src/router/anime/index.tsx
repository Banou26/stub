// import type { SearchResult } from 'src/lib/targets'

import { Fragment, useEffect, useState } from 'react'
import { css } from '@emotion/react'

import { getAnimeSeason } from '../../lib/targets/myanimelist'
import { Link } from 'raviger'

const style = css`
  display: flex;
  flex-wrap: wrap;

  > a {
    display: flex;
    flex-direction: column;
    align-items: center;
    
    width: 30rem;
  }
`

export default () => {
  return null
  // const [animes, setAnimes] = useState<SearchResult[]>()
  
  // useEffect(() => void getAnimeSeason().then(setAnimes), [])

  // return (
  //   <Fragment>
  //     <div css={style}>
  //       {
  //         animes?.map(anime =>
  //           <Link key={anime.name} href={`/anime/${anime.name}`}>
  //             <h3 style={{ color: 'white' }}>{anime.name}</h3>
  //             <img src={anime.image} referrer-policy="same-origin"/>
  //           </Link>
  //         )
  //       }
  //     </div>
  //   </Fragment>
  // )
}
