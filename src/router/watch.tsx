import type ParseTorrentFile from 'parse-torrent-file'
import type { TorrentStatusResult } from '@fkn/lib/torrent'

import { css } from '@emotion/react'
import { useEffect, useMemo, useState } from 'react'
import { torrent, torrentStatus, TorrentStatusType } from '@fkn/lib'
import FKNMediaPlayer from 'fkn-media-player'
import { of } from 'rxjs'
import DOMPurify from 'dompurify'
import * as marked from 'marked'
import ReactTooltip from 'react-tooltip'
import { AlertCircle, ArrowDown, ArrowUp, Users, Server } from 'react-feather'

import { getTitle } from '../../../../scannarr/src'
import { Uri } from '../../../../scannarr/src/utils'
import { cachedFetch } from '../utils/fetch'
import { useObservable } from '../utils/use-observable'
import { useFetch } from 'src/utils/use-fetch'
import { toMagnetURI } from 'parse-torrent'
import { getHumanReadableByteString } from '../utils/bytes'

const style = css`
  display: grid;
  height: calc(100vh - 6rem);
  grid-template-rows: 100% auto;
  /* overflow: hidden; */
  .player {
    height: calc(100vh - 6rem);
    /* width: 100%; */
    & > div {
      height: calc(100vh - 6rem);
      & > video, & > div {
        height: 100%;
        max-height: calc(100vh - 6rem);
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

const TorrentInfo = ({ torrentInstance }: { torrentInstance?: ParseTorrentFile.Instance }) => {
  const [status, setStatus] = useState()

  useEffect(() => {
    if (!torrentInstance) return
    const interval = setInterval(() => {
      if (!torrentInstance.infoHash) return
      torrentStatus(torrentInstance.infoHash)
        .then(setStatus)
    }, 1_000)

    return () => {
      clearInterval(interval)
    }
  }, [torrentInstance])

  return (
    <>
      <ReactTooltip id="torrent-info-tooltip" effect="solid" place="top">
        <div>FKN proxy server's current torrent information stats</div>
        <div><Users/> {status?.connectedPeers ?? 0}</div>
        <div><ArrowUp/> {getHumanReadableByteString(status?.uploadRate ?? 0, true)}/s</div>
        <div><ArrowDown/> {getHumanReadableByteString(status?.downloadRate ?? 0, true)}/s</div>
      </ReactTooltip>
      <Server data-tip data-for="torrent-info-tooltip"/>
    </>
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
  const [torrentInstance, setTorrent] = useState<ParseTorrentFile.Instance>()
  const magnet = useMemo(() => torrentInstance ? toMagnetURI(torrentInstance).replace('xt=urn:btih:[object Object]&', '') : undefined, [torrentInstance])
  console.log('_torrent', torrentInstance)
  console.log('magnet', magnet)

  const [size, setSize] = useState<number>()

  const url = useMemo((): string | undefined => {
    if (!title || !titleHandle) return
    const { url, type } =
      titleHandle
        .tags
        ?.find(({ type }) => type === 'source')
        ?.value

    if (type !== 'torrent-file') throw new Error('titleHandle source tag type isn\'t torrent-file')
    return url
  }, [title])

  useEffect(() => {
    if (!url) return
    torrent({ url, fileIndex: 0, offset: 0, end: 1 }).then(({ torrent: { headers, body } }) => {
      if (!body) throw new Error('no body')
      const contentRangeContentLength = headers.get('Content-Range')?.split('/').at(1)
      const contentLength =
        contentRangeContentLength
          ? Number(contentRangeContentLength)
          : Number(headers.get('Content-Length'))
      setSize(contentLength)
    })
  }, [url])

  const descriptionHtml = useMemo(
    () =>
      titleHandle?.description
        ? DOMPurify.sanitize(marked.parse(titleHandle?.description))
        : undefined,
    [titleHandle?.description]
  )

  const onFetch = (offset: number, end: number) =>
    torrent({ url, fileIndex: 0, offset, end })

  console.log('NEW CODE')

  // todo: add more info on top of the description, e.g url, video infos, download rate, ect...
  return (
    <div css={style}>
      <div className="player">
        <FKNMediaPlayer
          size={size}
          fetch={onFetch}
          publicPath={'/build/'}
          workerPath={'/build/worker.js'}
          libassPath={'/build/subtitles-octopus-worker.js'}
        />
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
