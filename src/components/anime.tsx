import React, { Fragment, useEffect, useState } from 'react'

import { getAnimeSeason } from '../lib/targets/myanimelist'

export default () => {
  const [animes, setAnimes] = useState()

  useEffect(() => {
    getAnimeSeason().then(setAnimes)
  }, [])
  console.log('Anime', animes)

  return (
    <Fragment>
      {
        animes?.map(anime =>
          <Fragment key={anime.name}>
            <h3 style={{ color: 'white' }}>{anime.name}</h3>
            <img src={anime.image}/>
          </Fragment>
        )
    }
    </Fragment>
  )
}
