import { css } from '@emotion/react'
import { useEffect, useMemo, useState } from 'react'
import ParseTorrent, { toMagnetURI } from 'parse-torrent'
import { fetch } from '@mfkn/fkn-lib'
import FKNMediaPlayer from 'fkn-media-player'
import { from, of } from 'rxjs'
import sanitizeHtml from 'sanitize-html'

import { getTitle } from '../../../../scannarr/src'
import { cachedDelayedFetch } from '../utils/fetch'
import { useObservable } from 'src/utils/use-observable'


const style = css`
  height: 100%;
  /* overflow: hidden; */
  .player {
    height: 100%;
    /* width: 100%; */
    & > div {
      height: 100%;
    }
  }

  .comments {
    display: grid;
    margin: 5rem auto;
    overflow: hidden;

    .description {
      text-align: center;
      padding: 2.5rem;
    }

    .comment {
      display: grid;
      grid-template-columns: auto 1fr;
      margin: 1.5rem auto;
      width: 150rem;

      .avatar {
        height: 12rem;
        width: 12rem;
        margin-right: 2.5rem;
      }
      .date {
        margin-left: 2.5rem;
      }
      .message {
        margin-top: 1.5rem;
      }
    }
  }
`

export default ({ uri, titleUri, sourceUri }: { uri: string, titleUri: string, sourceUri: string }) => {
  const firstUri = uri.split(',')?.at(0)!
  // const { data: { title } = {} } = useQuery<GetTitle>(GET_TITLE, { variables: { uri: firstUri } })
  // const firstEpisodeUri = title?.episodes.at(0)?.uri
  // const { loading: episodeLoading, data: { episode } = {} } = useQuery<GetEpisode>(GET_EPISODE, { variables: { uri: episodeUri ?? firstEpisodeUri, title }, skip: !firstEpisodeUri || !title })
  const { value: title } = useObservable(() =>
    sourceUri
      ? getTitle({ uri: sourceUri }, { fetch: cachedDelayedFetch })
      : of(undefined),
    [uri]
  )
  const titleHandle = useMemo(
    () => title?.handles.find(({ uri }) => uri === sourceUri),
    [sourceUri, title]
  )
  const comments = useMemo(
    () => (
      titleHandle
        ?.tags
        .find(tag => tag.type === 'comments')
        ?.value
        .map((comment, i) => (
          <div key={i} className="comment">
            <div>
              <img className="avatar" src={comment.user.avatar} alt={`${comment.user.name} avatar`}/>
            </div>
            <div>
              <div>
                <a className="username" href={comment.user.url}>{comment.user.name}</a>
                <span className="date">{comment.date?.toDateString()}</span>
              </div>
              <div className="message">{comment.message}</div>
            </div>
          </div>
        ))
    ),
    [titleHandle]
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
    if (!title || !titleHandle) return
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
      <div className="player">
        <FKNMediaPlayer id={mediaId} size={size} stream={stream}/>
      </div>
      <div
        className="description"
        dangerouslySetInnerHTML={{
          __html: sanitizeHtml(
            titleHandle
              ?.tags
              .find(({ type }) => type === 'description')
              ?.value
          )
        }}
      />
      {
        comments?.length
          ? (
            <div className="comments">
              <div>
                Comments
                {
                  titleHandle?.url
                    ? (
                      <span>
                        {' '}from
                        {' '}<a href={titleHandle?.url}>{titleHandle?.url}</a>
                      </span>
                    )
                    : null
                }
              </div>
              {comments}
            </div>
          )
          : null
      }
      
    </div>
  )
}
