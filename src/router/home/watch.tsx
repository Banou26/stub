import { css } from '@emotion/react'
import { useEffect, useState } from 'react'
import { useQuery } from '@apollo/client'
import { fetch } from '@mfkn/fkn-lib'

import { GET_TITLE, GET_EPISODE, GetTitle, GetEpisode } from 'src/apollo'

import Player from '../../lib/player'

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

  useEffect(() => {
    if (!episode) return
    const episodeHandle = episode.handles.find(({ uri }) => uri === source)!
    const torrentFileUrl = `https://nyaa.si/download/${episodeHandle.id}.torrent`
    fetch(torrentFileUrl)
      .then(res => res.arrayBuffer())
      .then(setTorrentFile)
  }, [episode])

  return (
    <div css={style}>
      <Player className="player" torrentFile={torrentFile}/>
    </div>
  )
}
