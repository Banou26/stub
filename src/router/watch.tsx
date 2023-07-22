import { useParams, useSearchParams } from 'react-router-dom'

import { makeVar, useQuery, useReactiveVar } from '@apollo/client'
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
import { getHumanReadableByteString } from '../utils/bytes'

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
  max-width: 150rem;
  background-color: rgb(35, 35, 35);
  border-radius: 1rem;
  box-shadow: hsl(206 22% 7% / 35%) 0px 10px 38px -10px, hsl(206 22% 7% / 20%) 0px 10px 20px -15px;
  overflow: hidden;
  animation: contentShow 150ms cubic-bezier(0.16, 1, 0.3, 1);
  height: min-content;

  .content {
    margin: 2.5rem;
    
    & > .title {
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


    table {
      width: 100%;
      border-collapse: collapse;
      border-spacing: 0;
      border: 1px solid rgb(50, 50, 50);
      border-radius: 0.5rem;
      overflow: hidden;
      margin-top: 1rem;

      thead {
        background-color: rgb(50, 50, 50);
        color: rgb(255, 255, 255);
        font-size: 1.5rem;
        font-weight: 500;
        text-align: left;
        text-transform: uppercase;
        letter-spacing: 0.1rem;
        border-bottom: 1px solid rgb(50, 50, 50);
        
        th {
          padding: 1rem 2rem;

          &:first-of-type {
            padding-left: 3rem;

            button {
              /* background-color: transparent; */
              background-color: rgb(32, 32, 32);
              padding: 0.5rem 1rem;
              border: none;
              color: rgb(255, 255, 255);
              font-size: 1.5rem;
              font-weight: 500;
              text-transform: uppercase;
              letter-spacing: 0.1rem;
              cursor: pointer;

              &:hover {
                text-decoration: underline;
              }
            }
          }

          &.upload-date {
            width: 12rem;
          }
        }
      }

      tbody {
        tr {
          border-bottom: 1px solid rgb(50, 50, 50);

          &:hover {
            background-color: rgb(50, 50, 50);
          }

          & > td {
            padding: 1rem 2rem;
            font-size: 1.5rem;
            font-weight: 500;
            text-align: left;
            letter-spacing: 0.1rem;
            color: rgb(255, 255, 255);
            vertical-align: middle;

            line-height: 2.5rem;

            ::first-line {
                line-height: 1;
            }

            &.name div {
              display: flex;
              align-items: center;
            }
          }

          .title {
            display: inline-block;
            height: 100%;
            margin-right: 1rem;
            margin-bottom: auto;
            vertical-align: middle;
          }

          .team {
            display: inline-block;
            height: 2rem;
            min-width: 2rem;
            margin-right: 0.5rem;
            vertical-align: bottom;
            margin-right: 1rem;
          }
          div.team {
            display: inline-block;
          }

          .languages {
            margin-left: 1rem;
            
            img {
              height: 2rem;
              margin-right: 0.5rem;
              vertical-align: bottom;
            }
          }

          .tags {
            margin-left: 1rem;
            background-color: rgb(50, 50, 50);
            padding: 0.5rem 1rem;
            border-radius: 0.5rem;
            margin-right: 0.5rem;
            margin-bottom: 0.5rem;
            font-size: 1.5rem;
            font-weight: 500;
            text-transform: uppercase;
            letter-spacing: 0.1rem;
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
        team {
          handler
          origin
          id
          uri
          url
          name
        }
        resolution
        hash
        format
        episodeRange
        data
      }
    }
  }
`)

const teams = makeVar({})

const getTeamIcon = (url) => {
  const cachedValue = useReactiveVar(teams)?.[url]
  if (cachedValue && !(cachedValue instanceof Promise)) return cachedValue
  if (cachedValue instanceof Promise) return undefined
  const res = fetch(url)
    .then(res => res.text())
    .then((res) => {
      const parser = new DOMParser()
      const doc = parser.parseFromString(res, 'text/html')
      const img = doc.querySelector<HTMLLinkElement>('link[rel*="icon"]')
      const _href = img?.getAttribute('href')
      const href =
        _href?.startsWith('http')
          ? _href
          : `${new URL(url).origin}${_href?.startsWith('/') ? '' : '/'}${_href ?? ''}`
      teams({ ...teams(), [url]: href })
      return href
    })
  teams({ ...teams(), [url]: res })
  return undefined
}

const SourceRow = ({ raw, source, trackerData }: { raw, source, trackerData }) => {
  const teamIcon = source.team?.url && getTeamIcon(source.team?.url)
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

  // const uploadDate = new Date(source.uploadDate).toLocaleDateString({ year: 'numeric', month: 'long', day: 'numeric' })

  const airedTime = Date.now() - new Date(source.uploadDate).getTime()

  const relativeTime =
    !isNaN(airedTime) && isFinite(airedTime)
      ? new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(Math.round(airedTime / 1000 / 60 / 60 / 24), 'days')
      : undefined
  console.log('formatted', formatted)

  const tags = [
    ...formatted.resolutionTerms ?? []
  ]

  const [hideIcon, setHideIcon] = useState(false)

  return (
    <tr className="source" key={source.uri}>
      <td className='name'>
        <div>
          {
            !raw && teamIcon && (
                !hideIcon
                  ? <img className="team" title={formatted.groups?.at(0)} src={teamIcon} onError={event => setHideIcon(true)}/>
                  : <div className="team">{formatted.groups?.at(0) ? `[${formatted.groups?.at(0)}]` : ''}</div>
              )
          }
          <span>
            <span className="title">{raw ? source.filename : formatted.titles.join(' ')}</span>
            {
              !raw &&
              countries.length > 0 &&
              <span className="languages">
                {
                  countries.map((country) =>
                    <img
                      key={country.iso639_1}
                      src={`http://purecatamphetamine.github.io/country-flag-icons/3x2/${country.iso639_1.toUpperCase()}.svg`}
                    />
                  )
                }
              </span>
            }
            {
              !raw && tags.length > 0 && (
                <span className="tags">
                  {
                    tags.map((tag) =>
                      <span key={tag}>{tag}</span>
                    )
                  }
                </span>
              )
            }
          </span>
        </div>
      </td>
      <td>{getHumanReadableByteString(source.bytes)}</td>
      <td>{trackerData.complete}</td>
      <td>{trackerData.incomplete}</td>
      <td>{relativeTime}</td>
    </tr>
  )
}

const SourcesModal = ({ uri, mediaUri, episodeUri }: { uri: string, mediaUri: string, episodeUri: String }) => {
  const [searchParams, setSearchParams] = useSearchParams()
  const episodeId = episodeUri.split('-')[1]
  const sourcesModalOpen = Boolean(searchParams.get('sources'))
  const displayRawName = searchParams.get('sources') === 'raw'
  const { error, data: { Page } = {} } = useQuery(
    GET_PLAYBACK_SOURCES,
    {
      variables: { uri, number: Number(episodeId) },
      skip: !uri
    }
  )
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
        if (Buffer.from(res).toString().includes('FetchError')) {
          throw new Error(Buffer.from(res).toString())
        }
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
      new Map(
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
          })
      ),
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
                      <th>Name <button onClick={() => setSearchParams({ sources: searchParams.get('sources') === 'raw' ? 'formatted' : 'raw' })}>{displayRawName ? 'raw' : 'formatted'}</button></th>
                      <th>Size</th>
                      <th>Seeders</th>
                      <th>Leechers</th>
                      <th className="upload-date">Upload date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {
                      [...Page?.playbackSource ?? []]
                        ?.sort((a, b) => (trackerDataPerSource.get(b.uri)?.complete ?? 0) - (trackerDataPerSource.get(a.uri)?.complete ?? 0))
                        ?.map((source) =>
                          <SourceRow
                            key={source.uri}
                            raw={displayRawName}
                            source={source}
                            trackerData={trackerDataPerSource.get(source.uri)}
                          />
                        )
                    }
                  </tbody>
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
    setSearchParams({ sources: 'formatted' })
  }

  return (
    <div>
      <button onClick={onSourcesClick} type="button">Sources</button>
      <SourcesModal uri={uri} mediaUri={mediaUri} episodeUri={episodeUri} />
    </div>
  )
}
