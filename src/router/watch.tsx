import { useParams, useSearchParams } from 'react-router-dom'

import { useQuery } from '@apollo/client'
import * as Dialog from '@radix-ui/react-dialog'
import { css } from '@emotion/react'
import { useEffect, useMemo, useState } from 'react'
import { arr2text, bin2hex, hex2array, hex2bin } from 'uint8-util'
import { Buffer } from 'buffer'
import Bencode from 'bencode'
import parseTorrent from 'parse-torrent'
import { Uri, mergeScannarrUris } from 'scannarr/src/utils'

import { gql } from '../generated'
import { fetch } from '../utils/fetch'
import { overlayStyle } from '../components/modal'

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

const END_OF_TYPE = 0x65 // 'e'
Bencode.decode.dictionary = function () {
  Bencode.decode.position++
  var dict = new Map()
  while (Bencode.decode.data[Bencode.decode.position] !== END_OF_TYPE) {
    dict.set(Bencode.decode.buffer(), Bencode.decode.next())
  }
  Bencode.decode.position++
  return dict
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

  const [trackerData, setTrackerData] = useState(new Map())

  const torrentSourcesInfoHashes = useMemo(
    () =>
      Page
        ?.playbackSource
        ?.map((source) => {
          const parsedTorrent = parseTorrent(JSON.parse(source?.data).magnetUri)
          const binStr = hex2bin(parsedTorrent.infoHash)
          return [source.uri, binStr, Buffer.from(parsedTorrent.infoHash, 'hex')]
        }),
    [Page?.playbackSource]
  )

  useEffect(() => {
    if (!Page?.playbackSource?.length) return
    const infoHashes = torrentSourcesInfoHashes?.map(([, binStr]) => binStr).slice(0, 25)
    const infoHashesQuery = infoHashes.map((infoHash) => `info_hash=${escape(infoHash)}`).join('&')
    const nyaaUrl = `http://nyaa.tracker.wf:7777/scrape?${infoHashesQuery}`
    fetch(nyaaUrl)
      .then((res) => res.arrayBuffer())
      .then((res) => {
        const decoded = Bencode.decode(Buffer.from(res))
        const newEntries =
          [...decoded.values().next().value.entries()]
            .map(([infoHash, data]) => [
              infoHash,
              Object.fromEntries(
                [...data.entries()].map(([key, value]) => [Buffer.from(key).toString(), value])
              )
            ])

        setTrackerData(new Map([...trackerData.entries(), ...newEntries]))
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
                      Page?.playbackSource?.map((source) => {
                        const foundTrackerData =
                          [...trackerData.entries()]
                            .find(([buffer]) =>
                              buffer.every((val, i) => val === torrentSourcesInfoHashes?.find(([uri]) => uri === source.uri)?.[2][i])
                            )
                            ?.[1]
                        return (
                          <div className="source" key={source.id}>
                            <div className="url">
                              {source.filename}
                              <br />
                              {
                                foundTrackerData
                                ? (
                                  JSON.stringify(foundTrackerData) ?? 'tracker data not found'
                                )
                                : 'tracker data might be loading'
                              }
                            </div>
                          </div>
                        )
                      })
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
