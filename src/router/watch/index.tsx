import type { RouteParams } from '../path'

import { css } from '@emotion/react'
import { useMemo } from 'preact/hooks'
import { useSubscription } from 'urql'
import { useParams } from 'wouter'

import { OriginFilter } from '../../generated/graphql'
import { gql } from '../../generated'
import { AggregatedUri, fromAggregatedUri, matchAggregatedUris } from '../../utils/uri'
import { getRoutePath, Route } from '../path'

const GET_WATCH_MEDIA = gql(`
  subscription GetWatchMedia($input: MediaInput!) {
    media(input: $input) {
      _id
      uri
      origin
      id
      titles {
        title
      }
      episodes {
        _id
        uri
        origin
        id
        url
        mediaUri
        episodeNumber
        titles {
          title
        }
        thumbnails {
          url
        }
        handles {
          _id
          uri
          origin
          id
          url
          mediaUri
          episodeNumber
          titles {
            title
          }
        }
      }
    }
  }
`)

const GET_WATCH_ORIGINS = gql(`
  subscription GetWatchOrigins($input: OriginPageInput!) {
    originPage(input: $input) {
      nodes {
        id
        url
        name
        icon
        color
        isApiOnly
      }
    }
  }
`)

const style = css`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  color: rgb(255, 255, 255);
  padding: 2rem;

  .watch-container {
    display: flex;
    flex-direction: column;
    gap: 2rem;
    width: 100%;
    max-width: 80rem;
  }

  .episode-info {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;

    .episode-title {
      font-size: 1.8rem;
      font-weight: 600;
    }

    .media-title {
      font-size: 1.2rem;
      opacity: 0.6;
    }
  }

  .sources {
    display: flex;
    flex-direction: column;
    gap: 1rem;

    .sources-label {
      font-size: 1.2rem;
      opacity: 0.6;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .sources-list {
      display: flex;
      flex-wrap: wrap;
      gap: 0.8rem;

      .source {
        display: flex;
        align-items: center;
        gap: 0.8rem;
        padding: 0.8rem 1.2rem;
        background-color: rgb(35, 35, 35);
        border-radius: 0.8rem;
        text-decoration: none;
        color: inherit;
        transition: background-color 0.15s;
        cursor: pointer;

        &:hover {
          background-color: rgb(50, 50, 50);
        }

        &.active {
          background-color: rgb(60, 60, 60);
          outline: 1px solid rgba(255, 255, 255, 0.2);
        }

        img {
          width: 2rem;
          height: 2rem;
          border-radius: 0.4rem;
          object-fit: contain;
        }

        .source-name {
          font-size: 1.2rem;
          font-weight: 500;
        }
      }
    }
  }

  .params {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 2.5rem;
    background-color: rgb(35, 35, 35);
    border-radius: 1rem;
    font-size: 1.4rem;

    span {
      opacity: 0.7;
      font-size: 1.2rem;
    }
  }
`

const Watch = () => {
  const params = useParams<RouteParams['WATCH']>()

  const [{ data }] = useSubscription({
    query: GET_WATCH_MEDIA,
    variables: { input: { uri: params.mediaUri } },
    pause: !params.mediaUri
  })

  const media = data?.media
  const episode = useMemo(
    () =>
      media?.episodes?.find(ep =>
        ep.uri && params.episodeUri
          ? matchAggregatedUris(ep.uri as AggregatedUri, params.episodeUri as AggregatedUri)
          : false
      ),
    [media?.episodes, params.episodeUri]
  )

  const origins = useMemo(
    () =>
      episode?.uri
        ? fromAggregatedUri(episode.uri as AggregatedUri)?.handleUrisValues
        : undefined,
    [episode?.uri]
  )

  const originIds = useMemo(
    () => origins?.map(o => o.origin),
    [origins]
  )

  const [{ data: originData }] = useSubscription({
    query: GET_WATCH_ORIGINS,
    variables: { input: { ids: originIds!, filters: [OriginFilter.IsNotApiOnly] } },
    pause: !originIds
  })

  const selectedSourceUri = params.sourceUri
  const mediaTitle = media?.titles?.at(0)?.title
  const episodeTitle = episode?.titles?.at(0)?.title
  const episodeNumber = episode?.episodeNumber

  return (
    <div css={style}>
      <div className="watch-container">
        <div className="episode-info">
          <div className="episode-title">
            {
              episodeTitle
                ? `${episodeNumber != null ? `E${episodeNumber} - ` : ''}${episodeTitle}`
                : episodeNumber != null
                  ? `Episode ${episodeNumber}`
                  : params.episodeUri
            }
          </div>
          {mediaTitle ? <div className="media-title">{mediaTitle}</div> : undefined}
        </div>

        {
          originData?.originPage?.nodes?.length
            ? (
              <div className="sources">
                <div className="sources-label">Sources</div>
                <div className="sources-list">
                  {
                    originData.originPage.nodes.map(origin => {
                      const handle = episode?.handles.find(h => h.origin === origin.id)
                      const sourceUri = handle?.uri
                      const isActive = selectedSourceUri
                        ? sourceUri === selectedSourceUri
                        : false
                      const watchPath = sourceUri
                        ? getRoutePath(Route.WATCH, {
                          mediaUri: params.mediaUri,
                          episodeUri: params.episodeUri,
                          sourceUri
                        })
                        : undefined

                      return (
                        <a
                          key={origin.id}
                          className={`source${isActive ? ' active' : ''}`}
                          href={watchPath ?? handle?.url ?? undefined}
                          target={watchPath ? undefined : '_blank'}
                          rel={watchPath ? undefined : 'noreferrer'}
                          title={origin.name}
                        >
                          {origin.icon ? <img src={origin.icon} alt={origin.name} /> : undefined}
                          <span className="source-name">{origin.name}</span>
                        </a>
                      )
                    })
                  }
                </div>
              </div>
            )
            : undefined
        }

        <div className="params">
          <div>
            <span>Media</span>
            <div>{params.mediaUri}</div>
          </div>
          <div>
            <span>Episode</span>
            <div>{params.episodeUri}</div>
          </div>
          {
            params.sourceUri
              ? (
                <div>
                  <span>Source</span>
                  <div>{params.sourceUri}</div>
                </div>
              )
              : undefined
          }
        </div>
      </div>
    </div>
  )
}

export default Watch
