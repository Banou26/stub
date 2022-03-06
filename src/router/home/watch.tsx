import { css } from '@emotion/react'

import { torrent as downloadTorrent } from '../../lib/player'

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

export default ({ uri, episodeUri, source }: { uri: string, episodeUri: string, source: string }) => {
  return (
    <div css={style}>
      video source here
      <div onClick={() => downloadTorrent({ uri: torrent.magnet })}>click to start</div>
    </div>
  )
}
