import type ParseTorrentFile from 'parse-torrent-file'
import type { TorrentStatusResult } from '@fkn/lib/torrent'

import { css } from '@emotion/react'
import { useEffect, useMemo, useState } from 'react'
import { torrent, torrentStatus, TorrentStatusType } from '@fkn/lib'
import FKNMediaPlayer from 'fkn-media-player'
import { of } from 'rxjs'
import DOMPurify from 'dompurify'
import * as marked from 'marked'

import { getTitle } from '../../../../scannarr/src'
import { Uri } from '../../../../scannarr/src/utils'
import { cachedFetch } from '../utils/fetch'
import { useObservable } from '../utils/use-observable'
import { useFetch } from 'src/utils/use-fetch'
import { toMagnetURI } from 'parse-torrent'
import { AlertCircle, ArrowDown, ArrowUp, Users } from 'react-feather'
import { getHumanReadableByteString } from '../utils/bytes'

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

const torrentInfoStyle = css`
  
`

const TorrentInfo = ({ magnet }: { magnet?: string }) => {
  const [status, setStatus] = useState()
  console.log('torrent status', status)

  useEffect(() => {
    if (!magnet) return
    const interval = setInterval(() => {
      torrentStatus(magnet).then(setStatus)
    }, 1_000)

    return () => {
      clearInterval(interval)
    }
  }, [magnet])

  return (
    <div css={torrentInfoStyle} title={'FKN proxy server\'s current torrent information stats'}>
      <Users/> {status?.connectedPeers ?? 0}
      <ArrowUp/> {getHumanReadableByteString(status?.uploadRate ?? 0, true)}/s
      <ArrowDown/> {getHumanReadableByteString(status?.downloadRate ?? 0, true)}/s
      <AlertCircle/>
    </div>
  )
}

export default ({ uri, titleUri, sourceUri }: { uri: Uri, titleUri: Uri, sourceUri: Uri }) => {
  const { value: title } = useObservable(() =>
    sourceUri
      ? getTitle({ uri: sourceUri }, { fetch: cachedFetch })
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
  const magnet = useMemo(() => _torrent ? toMagnetURI(_torrent).replace('xt=urn:btih:[object Object]&', '') : undefined, [_torrent])
  console.log('_torrent', _torrent)
  console.log('magnet', magnet)
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
        <FKNMediaPlayer id={mediaId} size={size} stream={stream} customControls={[() => <TorrentInfo magnet={magnet} />]}/>
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
