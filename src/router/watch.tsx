import { css } from '@emotion/react'
import { useEffect, useState } from 'react'
import ParseTorrent, { toMagnetURI } from 'parse-torrent'
import { fetch } from '@mfkn/fkn-lib'
import FKNMediaPlayer from 'fkn-media-player'
import { from, of } from 'rxjs'

import { getTitle } from '../../../../scannarr/src'
import { cachedDelayedFetch } from '../utils/fetch'
import { useObservable } from 'src/utils/use-observable'


const style = css`
  display: grid;
  height: 100%;
  overflow: hidden;
  .player {
    /* width: 100%; */
  }
`

export default ({ uri, titleUri, sourceUri }: { uri: string, titleUri: string, sourceUri: string }) => {
  const firstUri = uri.split(',')?.at(0)!
  // const { data: { title } = {} } = useQuery<GetTitle>(GET_TITLE, { variables: { uri: firstUri } })
  // const firstEpisodeUri = title?.episodes.at(0)?.uri
  // const { loading: episodeLoading, data: { episode } = {} } = useQuery<GetEpisode>(GET_EPISODE, { variables: { uri: episodeUri ?? firstEpisodeUri, title }, skip: !firstEpisodeUri || !title })
  const { value: title } = useObservable(() =>
    sourceUri
      ? from(getTitle({ uri: sourceUri }, { fetch: cachedDelayedFetch }))
      : of(undefined),
    [uri]
  )
  console.log('title', title)
  const [torrent, setTorrent] = useState<ParseTorrent.Instance>()

  const mediaId =
    torrent
      ? `${torrent?.infoHash}-${torrent?.name}`
      : undefined

  const [size, setSize] = useState<number>()
  const [stream, setStream] = useState<ReadableStream<Uint8Array>>()

  useEffect(() => {
    if (!title) return
    const titleHandle = title.handles.find(({ uri }) => uri === sourceUri)
    if (!titleHandle) return
    const { url, type } =
      titleHandle
        .tags
        .find(({ type }) => type === 'source')
        ?.value

    if (type !== 'torrent-file') throw new Error('titleHandle source tag type isn\'t torrent-file')
    
    fetch(url)
      .then(res => res.arrayBuffer())
      .then(res => {
        const torrent = ParseTorrent(Buffer.from(res))
        setTorrent(torrent)
        return torrent
      })
      .then(toMagnetURI)
      .then(uri => window.fetch(`${process.env.PROXY_ORIGIN}/${process.env.PROXY_VERSION}/torrent/${encodeURIComponent(uri)}`))
      .then((res) => {
        const { headers, body } = res
        if (!body || !headers.get('Content-Length')) throw new Error('no stream or Content-Length returned from the response')
        setSize(Number(headers.get('Content-Length')))
        setStream(body)
      })
  }, [title])

  return (
    <div css={style}>
      <FKNMediaPlayer id={mediaId} size={size} stream={stream}/>
    </div>
  )
}
