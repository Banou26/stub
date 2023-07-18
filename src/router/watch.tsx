import { useParams, useSearchParams } from 'react-router-dom'

import { gql } from '../generated'
import { Uri, mergeScannarrUris } from 'scannarr/src/utils'
import { useQuery } from '@apollo/client'
import * as Dialog from '@radix-ui/react-dialog'
import { css } from '@emotion/react'
import { overlayStyle } from '../components/modal'
import { useEffect } from 'react'
import { arr2text, Hex, hex2bin } from 'uint8-util'
import { Buffer } from 'buffer'
import Bencode from 'bencode-js'
import base32 from 'thirty-two'
import querystring from 'querystring'
import parseTorrent from 'parse-torrent'
import { fetch } from '../utils/fetch'

const style = css`
overflow: auto;
${overlayStyle}
display: flex;
justify-content: center;
padding: 5rem;

.modal {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 120rem;
  background-color: rgb(35, 35, 35);
  border-radius: 1rem;
  box-shadow: hsl(206 22% 7% / 35%) 0px 10px 38px -10px, hsl(206 22% 7% / 20%) 0px 10px 20px -15px;
  overflow: hidden;
  animation: contentShow 150ms cubic-bezier(0.16, 1, 0.3, 1);
  height: min-content;

  .content {
    margin: 2.5rem;
    
    .title {
      display: flex;
      justify-content: start;
      align-items: center;

      h2 {
        font-size: 3rem;
      }

      .origins {
        display: flex;
        justify-content: start;
        align-items: center;
        margin-left: 1rem;

        a {
          display: flex;
          justify-content: center;
          align-items: center;
          
          img {
            height: 3rem;
            width: 3rem;
          }
        }
      }
    }
  }
}

`

export const GET_PLAYBACK_SOURCES = gql(`#graphql
  query GetPlaybackSources($uri: String, $origin: String, $id: String, $search: String, $name: String, $resolution: String, $season: Int, $number: Float) {
    Page {
      playbackSource(uri: $uri, origin: $origin, id: $id, search: $search, name: $name, resolution: $resolution, season: $season, number: $number) {
        handler
        origin
        id
        uri
        url
        type
        filename
        title {
          romanized
          english
          native
        }
        structure
        filesCount
        bytes
        uploadDate
        thumbnails
        team
        resolution
        hash
        format
        episodeRange
        data
      }
    }
  }
`)

/**
 * `querystring.stringify` using `escape` instead of encodeURIComponent, since bittorrent
 * clients send non-UTF8 querystrings
 * @param  {Object} obj
 * @return {string}
 */
export const querystringStringify = obj => {
  let ret = querystring.stringify(obj, null, null, { encodeURIComponent: escape })
  ret = ret.replace(/[@*/+]/g, char => // `escape` doesn't encode the characters @*/+ so we do it manually
  `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
  return ret
}

export default () => {
  const { mediaUri, episodeUri } = useParams() as { mediaUri: Uri, episodeUri: Uri }
  const episodeId = episodeUri.split('-')[1]
  const [searchParams, setSearchParams] = useSearchParams()
  const sourcesModalOpen = Boolean(searchParams.get('sources'))
  console.log('mediaUri', mediaUri)
  console.log('episodeUri', episodeUri)
  console.log('episodeId', episodeId)
  const uri = mergeScannarrUris([mediaUri, episodeUri])
  console.log('uri', uri)
  // const { error, data: { Media: media } = {} } = useQuery(GET_MEDIA, { variables: { uri: mediaUri! }, skip: !mediaUri })
  const { error: error2, data: { Page } = {} } = useQuery(
    GET_PLAYBACK_SOURCES,
    {
      variables: { uri, number: Number(episodeId) },
      skip: !uri
    }
  )
  console.log('Page', Page)
  // if (error) console.error(error)
  if (error2) console.error(error2)

  const onOverlayClick = (ev) => {
    if (ev.target !== ev.currentTarget) return
    const { sources, ...rest } = searchParams
    setSearchParams(rest)
  }

  const onSourcesClick = () => {
    setSearchParams({ sources: true })
  }

  useEffect(() => {
    if (!Page?.playbackSource?.length) return
    const firstSource = Page?.playbackSource[0]
    console.log('firstSource', { ...firstSource, data: JSON.parse(firstSource?.data) })
    const parsedTorrent = parseTorrent(JSON.parse(firstSource?.data).magnetUri)
    const bin = hex2bin(parsedTorrent.infoHash)
    const nyaaUrl = `http://nyaa.tracker.wf:7777/scrape?info_hash=${escape(bin)}`
    fetch(nyaaUrl)
      .then((res) => res.text())
      .then((res) => {
        console.log('res', res)
      })
  }, [Page?.playbackSource])

  return (
    <div>
      <button onClick={onSourcesClick} type="button">Sources</button>
      <Dialog.Root open={sourcesModalOpen}>
        <Dialog.Portal>
          {/* <Dialog.Overlay css={overlayStyle} onClick={onOverlayClick}/> */}
          <Dialog.Content css={style} asChild={true}>
            <div onClick={onOverlayClick}>
              <div className="modal">
                <div className="trailer">
                  {/* <MinimalPlayer className="player"/> */}
                </div>
                <div className="content">
                  <div className="title">
                    <h2>Sources</h2>
                  </div>
                  <div>
                    {
                      Page?.playbackSource?.map((source) => (
                        <div className="source" key={source.id}>
                          <div className="url">
                            {source.filename}
                          </div>
                        </div>
                      ))
                    }
                  </div>
                </div>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}
