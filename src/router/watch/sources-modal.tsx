import type { Uri } from 'scannarr/src/utils'

import { Link, useParams, useSearchParams } from 'react-router-dom'
import * as Dialog from '@radix-ui/react-dialog'
import { css } from '@emotion/react'
import { useMemo, useState } from 'react'
import CountryLanguage from '@ladjs/country-language'
import { createStore } from 'zustand/vanilla'

import { parse, format } from 'sacha'

import { fetch } from '../../utils/fetch'
import { overlayStyle } from '../../components/modal'
import { getHumanReadableByteString } from '../../utils/bytes'
import { Route, getRoutePath } from '../path'
import { GetPlaybackSourcesQuery } from '../../generated/graphql'
import { useStore } from 'zustand'

const sourceModalStyle = css`
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
      border: .1rem solid rgb(50, 50, 50);
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
        border-bottom: .1rem solid rgb(50, 50, 50);

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
        tr.source {
          border-bottom: .1rem solid rgb(50, 50, 50);
          border-top: .2rem solid rgb(35, 35, 35);

          &.active {
            background-color: rgb(50, 50, 50);
            &:first-of-type {
              border-top: .2rem solid rgb(35, 35, 35);
            }
          }

          .link {
            display: inline-block;
            width: 100%;
            height: 100%;
            position: absolute;
            inset: 0;
          }

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
            position: relative;

            line-height: 2.5rem;

            ::first-line {
                line-height: 1;
            }

            &.name div {
              display: flex;
              align-items: center;
            }

            text-align: right;
            &:first-of-type {
              text-align: left;
            }
          }

          .title {
            display: inline-block;
            height: 100%;
            margin-right: 1rem;
            margin-bottom: auto;
            vertical-align: middle;
            word-break: break-all;
          }

          .team-link {
            position: absolute;
          }
          .team-link-back {
            opacity: 0;
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

const store = createStore<{ teams: { [key: string]: string | Promise<string | undefined> | undefined } }>((set) => ({
  teams: {}
}))

export const getTeamIcon = (url, noHook = false) => {
  const cachedValue = noHook ? store.getState().teams[url] : useStore(store, (state) => state.teams)[url]
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
      store.setState({ teams: { ...store.getState().teams, [url]: href } })
      return href
    })
  store.setState({ teams: { ...store.getState().teams, [url]: res } })
  return undefined
}

const SourceRow = ({ raw, source, trackerData }: { raw, source, trackerData }) => {
  const { mediaUri, episodeUri, sourceUri } = useParams() as { mediaUri: Uri, episodeUri: Uri }
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
      ? new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(-Math.round(airedTime / 1000 / 60 / 60 / 24), 'days')
      : undefined

  const tags = [
    ...formatted.resolutionTerms ?? []
  ]

  const [hideIcon, setHideIcon] = useState(false)

  const watchEpisodeUrl = getRoutePath(Route.WATCH, { episodeUri, mediaUri, sourceUri: source.uri })

  const sourceLink = <Link className="link" to={watchEpisodeUrl} />

  const isCurrentSource = source.uri === sourceUri

  return (
    <tr className={`source ${isCurrentSource ? 'active' : ''}`} key={source.uri}>
      <td className='name'>
        {sourceLink}
        <div>
          {
            !raw && (
                <>
                  <a href={source.team?.url ?? watchEpisodeUrl} className="team-link">
                    {
                      teamIcon && !hideIcon
                        ? <img className="team" title={formatted.groups?.at(0)} src={teamIcon} onError={event => setHideIcon(true)}/>
                        : (
                          formatted.groups?.at(0)
                            ? <div className="team">{formatted.groups?.at(0) ? `[${formatted.groups?.at(0)}]` : ''}</div>
                            : undefined
                        )
                    }
                  </a>
                  <a href={source.team?.url ?? watchEpisodeUrl} className="team-link-back">
                    {
                      teamIcon && !hideIcon
                        ? <img className="team" title={formatted.groups?.at(0)} src={teamIcon} onError={event => setHideIcon(true)}/>
                        : (
                          formatted.groups?.at(0)
                            ? <div className="team">{formatted.groups?.at(0) ? `[${formatted.groups?.at(0)}]` : ''}</div>
                            : undefined
                        )
                    }
                  </a>
                </>
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
      <td>{sourceLink}{getHumanReadableByteString(source.bytes)}
      </td>
      <td>{sourceLink}{trackerData.complete}</td>
      <td>{sourceLink}{trackerData.incomplete}</td>
      <td>{sourceLink}{trackerData.downloaded}</td>
      <td>{sourceLink}{relativeTime}</td>
    </tr>
  )
}

const SourcesModal = (
  { sources, trackerDataPerSource }:
  {
    sources: GetPlaybackSourcesQuery['Page']['playbackSource'],
    trackerDataPerSource: Map<any, { complete: number, incomplete: number, downloaded: number }>
  }
) => {
  const [searchParams, setSearchParams] = useSearchParams()
  const sourcesModalOpen = Boolean(searchParams.get('sources'))
  const displayRawName = searchParams.get('sources') === 'raw'

  const onOverlayClick = (ev) => {
    if (ev.target !== ev.currentTarget) return
    const { sources, ...rest } = searchParams
    setSearchParams(rest)
  }

  return (
    <Dialog.Root open={sourcesModalOpen}>
      <Dialog.Portal>
        <Dialog.Content css={sourceModalStyle} asChild={true}>
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
                      <th>Seed</th>
                      <th>Leech</th>
                      <th>Downloads</th>
                      <th className="upload-date">Upload date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {
                      sources
                        ?.map((source) =>
                          <SourceRow
                            key={source.uri}
                            raw={displayRawName}
                            source={source}
                            trackerData={trackerDataPerSource?.get(source.uri)}
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

export default SourcesModal
