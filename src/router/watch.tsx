import type ParseTorrentFile from 'parse-torrent-file'

import { css } from '@emotion/react'
import { useEffect, useMemo, useState } from 'react'
import { torrent } from '@fkn/lib'
import FKNMediaPlayer from 'fkn-media-player'
import { of } from 'rxjs'
import DOMPurify from 'dompurify'
import * as marked from 'marked'

import { getTitle } from '../../../../scannarr/src'
import { Uri } from '../../../../scannarr/src/utils'
import { cachedDelayedFetch } from '../utils/fetch'
import { useObservable } from '../utils/use-observable'

const PROXY_ORIGIN = process.env.PROXY_ORIGIN
const PROXY_VERSION = process.env.PROXY_VERSION

if (!PROXY_ORIGIN) throw new Error('Missing PROXY_ORIGIN environment variable')
if (!PROXY_VERSION) throw new Error('Missing PROXY_VERSION environment variable')

const style = css`
  display: grid;
  height: 100vh;
  grid-template-rows: 100% auto;
  /* overflow: hidden; */
  .player {
    height: 100vh;
    /* width: 100%; */
    & > div {
      height: 100vh;
      & > video, & > div {
        height: 100vh;
      }
    }
  }

  .description {
    background: rgb(35, 35, 35);
    text-align: center;
    padding: 2.5rem;
    margin: 1.5rem auto;
    margin-bottom: 0;
    width: 150rem;
    white-space: pre-line;
  }

  .comments {
    display: grid;
    margin: 5rem auto;

    .header {
      text-align: center;
      padding: 2.5rem;
    }

    .comment {
      display: grid;
      grid-template-columns: auto 1fr;
      margin: 1.5rem auto;
      width: 150rem;
      padding: 1rem;
      background: rgb(35, 35, 35);
      overflow: hidden;

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
        white-space: pre-line;
      }
    }
  }
`

export default ({ uri, titleUri, sourceUri }: { uri: Uri, titleUri: Uri, sourceUri: Uri }) => {
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
        ?.comments
        ?.map((comment, i) => (
          <div key={i} className="comment">
            <div>
              <img className="avatar" src={comment.user.avatar} alt={`${comment.user.name} avatar`} referrer-policy="same-origin"/>
            </div>
            <div>
              <div>
                <a className="username" href={comment.user.url}>{comment.user.name}</a>
                <a href={comment.url} className="date">
                  <span>{comment.date?.toDateString()}</span>
                </a>
              </div>
              <div
                className="message"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(marked.parse(comment.message.trim())) }}
              ></div>
            </div>
          </div>
        ))
    ),
    [titleHandle]
  )
  const [_torrent, setTorrent] = useState<ParseTorrentFile.Instance>()

  const mediaId =
    _torrent
      ? `${_torrent?.infoHash}-${_torrent?.name}`
      : undefined

  const [size, setSize] = useState<number>()
  const [stream, setStream] = useState<ReadableStream<Uint8Array>>()

  useEffect(() => {
    if (!title || !titleHandle) return
    const { url, type } =
      titleHandle
        .tags
        ?.find(({ type }) => type === 'source')
        ?.value

    if (type !== 'torrent-file') throw new Error('titleHandle source tag type isn\'t torrent-file')
    
    torrent(url).then(({ torrentFile, torrent: { headers, body } }) => {
      setTorrent(torrentFile)
      setSize(Number(headers.get('Content-Length')))
      setStream(body)
    })
  }, [title])

  const descriptionHtml = useMemo(
    () =>
      titleHandle?.description
        ? DOMPurify.sanitize(marked.parse(titleHandle?.description))
        : undefined,
    [titleHandle?.description]
  )

  // todo: add more info on top of the description, e.g url, video infos, download rate, ect...
  return (
    <div css={style}>
      <div className="player">
        <FKNMediaPlayer id={mediaId} size={size} stream={stream}/>
      </div>
      <div
        className="description"
        dangerouslySetInnerHTML={{ __html: descriptionHtml }}
      ></div>
      {
        comments?.length
          ? (
            <div className="comments">
              <div className="header">
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
