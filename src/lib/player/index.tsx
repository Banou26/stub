import { css } from '@emotion/react'

import { DetailedHTMLProps, HTMLAttributes, useEffect, useRef } from 'react'
import { torrent as downloadTorrent } from './torrent'

const style = css`
  margin: auto;
  height: 100%;

  & > div {
    height: 100%;
    video {
      height: 100%;
    }
  }
`

export default ({ torrentFile, ...rest }: { torrentFile?: ArrayBuffer } & DetailedHTMLProps<HTMLAttributes<HTMLDivElement>, HTMLDivElement>) => {
  const videoRef = useRef(null)

  useEffect(() => {
    if (!torrentFile || !videoRef.current) return
    console.log('DOWNLOAD TORRENT')
    downloadTorrent({ video: videoRef.current, torrentFile })
  }, [torrentFile])

  return (
    <div css={style} {...rest}>
      <div>
        <video ref={videoRef}></video>
      </div>
    </div>
  )
}
