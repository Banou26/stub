
import { Fragment } from 'react'
import { useQueryParams } from 'raviger'
import { css } from '@emotion/react'

import { torrent as downloadTorrent } from '@mfkn/fkn-lib'

import { useFetch } from 'src/lib/hooks/utils'

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

export default () => {
  const { data: items } = useFetch(() => {})
  const [params] = useQueryParams()
  const { search } = params

  console.log('torrents', search)

  return (
    <div css={style}>
      <div>{search}</div>
      {/* {
        items?.map(torrent =>
          <div key={torrent.link} onClick={() => downloadTorrent({ uri: torrent.magnet })}>
            <div>{torrent.name}</div>
            <div>{torrent.link}</div>
            <div>{torrent.seeders}</div>
            <div>{torrent.leechers}</div>
            <div>{torrent.downloads}</div>
            <div>{torrent.magnet}</div>
            <div>{torrent.size}</div>
            <div>{torrent.torrentUrl}</div>
          </div>
        )
      } */}
    </div>
  )
}
