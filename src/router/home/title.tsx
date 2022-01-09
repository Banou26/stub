// import type { SearchResult } from 'src/lib/targets'

import { Fragment, useEffect, useState } from 'react'
import { css } from '@emotion/react'

import { torrent as downloadTorrent } from '@mfkn/fkn-lib'

import { getAnimeSeason } from '../../lib/targets/myanimelist'
import { getAnimeTorrents } from '../../lib/targets/nyaasi'
import { filterWords } from '../../lib/utils'
import { GET_TITLE } from 'src/apollo'
import { useQuery, gql, useMutation } from '@apollo/client'
import { GetTitle } from 'src/apollo'
import { Category } from 'src/lib'

const style = css`
  display: grid;
  grid-template-columns: 40rem 1fr;
  grid-template-rows: 50rem 1fr;
  padding: 10rem;

  .poster {
    height: 100%;
  }

  h1 {
    margin-bottom: 2.5rem;
  }

  h1 + div {
    font-weight: 500;
    margin-bottom: 2.5rem;
  }

  .synopsis {
    font-weight: 500;
    line-height: 2.5rem;
    white-space: pre-wrap;
  }

  /* .title, .synopsis {
    width: 100%;
  } */
`

export default ({ uri }: { uri: string }) => {
  console.log('uri', uri)
  const { error, data: { title } = {} } = useQuery<GetTitle>(GET_TITLE, { variables: { uri } })

  console.log('error :(', error)
  console.log('title :)', title)

  const release =
    title?.releaseDates.at(0)
      ? (
        title.releaseDates.at(0)?.date
          ? (
            title.categories.includes(Category.MOVIE)
              ? `${title.releaseDates.at(0)!.date!.getFullYear()}`
              : `${title.releaseDates.at(0)!.date!.toDateString().slice(4).trim()}`
          )
          : `${title.releaseDates.at(0)!.start!.toDateString().slice(4).trim()} to ${title.releaseDates.at(0)!.end!.toDateString().slice(4).trim()}`
      )
      : ''

  return (
    <div css={style}>
      <img src={title?.images.at(0)?.url} alt={`${title?.names?.at(0)?.name} poster`} className="poster" />
      <div>
        <div>
          <h1>{title?.names?.at(0)?.name}</h1>
          <div>
            <span>{release}</span>
          </div>
        </div>
        <div className="synopsis">
          {title?.synopses?.at(0)?.synopsis}
        </div>
      </div>
    </div>
  )
  
  const [anime, setAnime] = useState<SearchResult>()
  const [torrents, setTorrents] = useState<any>()
  
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
            // return
            // console.log('res', res)
            // const mostSeeded = res.sort(({ seeders }, { seeders: seeders2 }) => seeders - seeders2).slice(-1)[0]
            // console.log('mostSeeded', mostSeeded)
            // const groupSearched = await getAnimeTorrents({ search: `[${mostSeeded.name?.match(/\[(.*?)\]/)?.[1]}] ${filterWords(decodeURIComponent(name))}` })
            // console.log('groupSearched', groupSearched)
            // setTorrents(groupSearched)
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
          torrents?.items.map(torrent =>
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
