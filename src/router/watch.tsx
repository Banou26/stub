import { useParams, useSearchParams } from 'react-router-dom'

import { useQuery } from '@apollo/client'
import * as Dialog from '@radix-ui/react-dialog'
import { css } from '@emotion/react'
import { useEffect, useMemo, useState } from 'react'
import { hex2bin } from 'uint8-util'
import { Buffer } from 'buffer'
import Bencode from 'bencode'
import parseTorrent from 'parse-torrent'
import { Uri, mergeScannarrUris } from 'scannarr/src/utils'
import { parse, format } from 'sacha'
import CountryLanguage from '@ladjs/country-language'

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

const SourceRow = ({ raw, source, trackerData }: { raw, source, trackerData }) => {
  const parsed = useMemo(() => parse(source.filename), [source.filename])
  const formatted = useMemo(() => format(parsed), [parsed])
  const countries =
    [
      ...new Map(
        [
          ...new Map(
            formatted
              .audioLanguageTerms
              ?.flatMap(lang => CountryLanguage.getLanguageCountries(lang.split('-').at(0)))
              .map((country) => [country.numCode, country])
          ).values()
        ]
        .map(country => CountryLanguage.getCountryLanguages(country.code_3))
        .filter(langs => langs.length === 1)
        .flatMap(langs => langs.map(lang => [lang.iso639_3, lang]))
      )
      .values()
    ]
    .map(country =>
      country.iso639_3 === 'eng'
        ? { ...country, iso639_1: 'gb' }
        : country
    )
  if (formatted.audioLanguageTerms?.length >= 2) {
    console.log('test', CountryLanguage.getCountryLanguages('ES'))
    console.log('parsed', parsed)
    console.log('formatted', formatted)
    console.log('countriesLangs', countries)
  }
  return (
    <tr className="source" key={source.uri}>
      {/* make a toggle to display cleaned up name (via sacha's parsing) & raw name */}
      <td>
        <span>{raw ? source.filename : formatted.titles.join(' ')}</span>
        {
          !raw &&
          countries.length > 0 &&
          <span className="origins">
            {
              countries.map((country) =>
                <img
                  height="20"
                  style={{ marginLeft: 5 }}
                  src={`http://purecatamphetamine.github.io/country-flag-icons/3x2/${country.iso639_1.toUpperCase()}.svg`}
                />
              )
            }
          </span>
        }
      </td>
      <td></td>
      <td>{trackerData.complete}</td>
      <td>{trackerData.incomplete}</td>
    </tr>
  )
}

const SourcesModal = ({ uri, mediaUri, episodeUri }: { uri: string, mediaUri: string, episodeUri: String }) => {
  const [searchParams, setSearchParams] = useSearchParams()
  const episodeId = episodeUri.split('-')[1]
  const sourcesModalOpen = Boolean(searchParams.get('sources'))
  const { error, data: { Page } = {} } = useQuery(
    GET_PLAYBACK_SOURCES,
    {
      variables: { uri, number: Number(episodeId) },
      skip: !uri
    }
  )
  const [displayRawName, setDisplayRawName] = useState(false)
  console.log('Page', Page)
  if (error) console.error(error)

  const onOverlayClick = (ev) => {
    if (ev.target !== ev.currentTarget) return
    const { sources, ...rest } = searchParams
    setSearchParams(rest)
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
    if (!torrentSourcesInfoHashes?.length) return
    const infoHashes = torrentSourcesInfoHashes?.map(([, binStr]) => binStr)
    const infoHashesQuery = infoHashes.map((infoHash) => `info_hash=${escape(infoHash)}`).join('&')
    const nyaaUrl = `http://nyaa.tracker.wf:7777/scrape?${infoHashesQuery}`
    fetch(nyaaUrl)
      .then((res) => res.arrayBuffer())
      .then((res) => {
        const decoded = Bencode.decode(Buffer.from(res))
        const newEntries =
          [...decoded.files.entries()]
            .map(([infoHash, data]) => [
              infoHash,
              data
            ])
        setTrackerData(new Map([...trackerData.entries(), ...newEntries]))
      })
  }, [torrentSourcesInfoHashes])

  const trackerDataPerSource = useMemo(
    () =>
      Page
        ?.playbackSource
        ?.map((source) => {
          const foundTrackerData =
            [...trackerData.entries()]
              .find(([buffer]) =>
                buffer.every((val, i) => val === torrentSourcesInfoHashes?.find(([uri]) => uri === source.uri)?.[2][i])
              )
              ?.[1]
          const torrentData: { complete: number, incomplete: number, downloaded: number } = JSON.parse(JSON.stringify(foundTrackerData) ?? '{}')
          return [source.uri, torrentData]
        }),
    [Page?.playbackSource, trackerData]
  )

  return (
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
                <table>
                  <thead>
                    <tr>
                      <th>Name <button onClick={() => setDisplayRawName(val => !val)}>{displayRawName ? 'raw' : 'formatted'}</button></th>
                      <th>Size</th>
                      <th>Seeders</th>
                      <th>Leechers</th>
                    </tr>
                  </thead>
                  {
                    Page?.playbackSource?.map((source) =>
                      <SourceRow
                        raw={displayRawName}
                        source={source}
                        trackerData={trackerDataPerSource?.find(([uri]) => uri === source.uri)?.[1]}
                      />
                    )
                    // Page?.playbackSource?.map((source) => {
                    //   const foundTrackerData =
                    //     [...trackerData.entries()]
                    //       .find(([buffer]) =>
                    //         buffer.every((val, i) => val === torrentSourcesInfoHashes?.find(([uri]) => uri === source.uri)?.[2][i])
                    //       )
                    //       ?.[1]
                    //   const torrentData: { complete: number, incomplete: number, downloaded: number } = JSON.parse(JSON.stringify(foundTrackerData) ?? '{}')
                    //   const parsed = parse(source.filename)
                    //   console.log('parsed', parsed)
                    //   const formatted = format(parsed)
                    //   console.log('formatted', formatted)
                    //   return (
                    //     <tr key={source.uri} className="source" key={source.id}>
                    //       {/* make a toggle to display cleaned up name (via sacha's parsing) & raw name */}
                    //       <td>
                    //         <span>{displayRawName ? source.filename : parsed.titles.at(0)}</span>
                    //       </td>
                    //       <td></td>
                    //       <td>{torrentData.complete}</td>
                    //       <td>{torrentData.incomplete}</td>
                    //     </tr>
                    //   )
                    // })
                  }
                </table>
              </div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export default () => {
  const { mediaUri, episodeUri } = useParams() as { mediaUri: Uri, episodeUri: Uri }
  const [, setSearchParams] = useSearchParams()
  const uri = mergeScannarrUris([mediaUri, episodeUri])

  const onSourcesClick = () => {
    setSearchParams({ sources: '1' })
  }

  return (
    <div>
      <button onClick={onSourcesClick} type="button">Sources</button>
      <SourcesModal uri={uri} mediaUri={mediaUri} episodeUri={episodeUri} />
    </div>
  )
}
