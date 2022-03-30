import { css } from '@emotion/react'

import { DetailedHTMLProps, HTMLAttributes, useEffect, useRef } from 'react'
import { playFile, torrent as downloadTorrent } from './torrent'

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
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (!torrentFile) {
      playFile({ video: videoRef.current!, url: `http://localhost:1234/video.mkv` })
      // fetch(`http://localhost:1234/video.mkv`).then(async (res) => {
      //   const { headers, body: stream } = res
      //   const fileSize = Number(headers.get('Content-Length'))
      //   if (!stream || !fileSize) throw new Error('no stream or Content-Length returned from the response')
      //   // playFile({ video: videoRef.current!, file: stream, fileSize })
      //   // playFile({ video, url: `${process.env.PROXY_ORIGIN}/${process.env.PROXY_VERSION}/torrent/${encodeURIComponent(uri)}` })
      // })
      return
    }
    if (!torrentFile || !videoRef.current) return
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
