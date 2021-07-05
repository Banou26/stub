/** @jsx jsx */
import React, { Fragment, useEffect, useState } from 'react'
import { css, jsx, Global } from '@emotion/react'

import { getAnimeSeason } from '../lib/targets/myanimelist'
import { getAnimeTorrents } from '../lib/targets/nyaasi'
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
  const [animes, setAnimes] = useState()
  
  useEffect(() => {
    getAnimeSeason().then(setAnimes)
  }, [])

  return (
    <Fragment>
      <div css={style}>
        {
          animes?.map(anime =>
            <Link key={anime.name} href={`/anime/${anime.name}`}>
              <h3 style={{ color: 'white' }}>{anime.name}</h3>
              <img src={anime.image}/>
            </Link>
          )
        }
      </div>
    </Fragment>
  )
}
