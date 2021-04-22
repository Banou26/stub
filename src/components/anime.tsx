/** @jsx jsx */
import React, { Fragment, useEffect, useState } from 'react'
import { css, jsx, Global } from '@emotion/react'

import { torrent as downloadTorrent } from '@oz/package-api'

import { getAnimeSeason } from '../lib/targets/myanimelist'
import { getAnimeTorrents } from '../lib/targets/nyaasi'
import { filterWords } from '../lib/utils'

const style = css`
  display: flex;
  flex-wrap: wrap;

  > div {
    display: flex;
    flex-direction: column;
    align-items: center;
    
    width: 30rem;
  }
`

export default ({ name }) => {
  const [anime, setAnime] = useState()
  const [torrents, setTorrents] = useState()
  
  useEffect(() => {
    getAnimeSeason()
      .then(animes => {
        console.log('animes', animes)
        const _anime = animes.filter(({ name: _name }) => decodeURIComponent(_name) === decodeURIComponent(name))[0]
        const anime = { ..._anime, name: _anime?.name && filterWords(_anime?.name) }
        console.log('anime', anime)
        setAnime(anime)
        getAnimeTorrents({ search: anime.name })
          .then(async res => {
            setTorrents(res)
            return
            console.log('res', res)
            const mostSeeded = res.sort(({ seeders }, { seeders: seeders2 }) => seeders - seeders2).slice(-1)[0]
            console.log('mostSeeded', mostSeeded)
            const groupSearched = await getAnimeTorrents({ search: `[${mostSeeded.name?.match(/\[(.*?)\]/)?.[1]}] ${filterWords(decodeURIComponent(name))}` })
            console.log('groupSearched', groupSearched)
            setTorrents(groupSearched)
          })
      })
  }, [])
  console.log('Anime', anime, decodeURIComponent(name))
  console.log('torrents', torrents)

  return (
    <Fragment>
      <div css={style}>
        {anime?.name}
        {
          torrents?.map(torrent =>
            <div key={torrent.link} onClick={() => downloadTorrent({ uri: torrent.magnet })}>
              <div>{torrent.name}</div>
              <div>{torrent.link}</div>
              <div>{torrent.seeders}</div>
              <div>{torrent.leechers}</div>
              <div>{torrent.downloads}</div>
              {/* <div>{torrent.magnet}</div> */}
              <div>{torrent.size}</div>
              {/* <div>{torrent.torrentUrl}</div> */}
            </div>
          )
        }
      </div>
    </Fragment>
  )
}
