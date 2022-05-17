import { css } from '@emotion/react'
import { useEffect, useState } from 'react'
import { useQuery } from '@apollo/client'
import ParseTorrent, { toMagnetURI } from 'parse-torrent'
import { fetch } from '@mfkn/fkn-lib'
import FKNMediaPlayer from 'fkn-media-player'

import { GET_TITLE, GET_EPISODE, GetTitle, GetEpisode } from '../apollo'


const style = css`
  display: grid;
  height: 100%;
  overflow: hidden;
  .player {
    /* width: 100%; */
  }
`

export default ({ uri, episodeUri, source }: { uri: string, episodeUri: string, source: string }) => {
  const firstUri = uri.split(',')?.at(0)!
  const { data: { title } = {} } = useQuery<GetTitle>(GET_TITLE, { variables: { uri: firstUri } })
  const firstEpisodeUri = title?.episodes.at(0)?.uri
  const { loading: episodeLoading, data: { episode } = {} } = useQuery<GetEpisode>(GET_EPISODE, { variables: { uri: episodeUri ?? firstEpisodeUri, title }, skip: !firstEpisodeUri || !title })
  const [torrentFile, setTorrentFile] = useState<ArrayBuffer>()

  const [size, setSize] = useState<number>()
  const [stream, setStream] = useState<ReadableStream<Uint8Array>>()

  useEffect(() => {
    if (!episode) return
    const episodeHandle = episode.handles.find(({ uri }) => uri === source)!
    const torrentFileUrl = `https://nyaa.si/download/${episodeHandle.id}.torrent`
    fetch(torrentFileUrl)
      .then(res => res.arrayBuffer())
      .then(res => console.log('parsed torrent', ParseTorrent(Buffer.from(res))) || ParseTorrent(Buffer.from(res)))
      .then(toMagnetURI)
      .then(uri => console.log('uri', uri) || uri.length > 'magnet:?'.length ? uri : Promise.reject('invalid torrent URI'))
      .then(uri => window.fetch(`${process.env.PROXY_ORIGIN}/${process.env.PROXY_VERSION}/torrent/${encodeURIComponent(uri)}`))
      .then((res) => {
        console.log('res', res)
        const { headers, body } = res
        console.log('body', body)
        console.log('Content-Length', headers.get('Content-Length'))
        if (!body || !headers.get('Content-Length')) throw new Error('no stream or Content-Length returned from the response')
        setSize(Number(headers.get('Content-Length')))
        setStream(body)
      })
  }, [episode])

  return (
    <div css={style}>
      <FKNMediaPlayer id={'test'} size={size} stream={stream}/>
    </div>
  )
}
