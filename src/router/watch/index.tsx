import type { RouteParams } from '../path'
import type { WatchSource } from '../../components/source-selector'

import { css } from '@emotion/react'
import { useMemo } from 'preact/hooks'
import { useSubscription } from 'urql'
import { useParams } from 'wouter'

import { OriginFilter } from '../../generated/graphql'
import { gql } from '../../generated'
import { getPlayer } from '../../sources/players'
import SourceSelector from '../../components/source-selector'
import { AggregatedUri, fromAggregatedUri, fromUri, matchAggregatedUris } from '../../utils/uri'
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
        ...EpisodeFragment
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
          embedUrl
          mediaUri
          episodeNumber
          titles {
            title
          }
        }
      }
      handles {
        ...MediaFragment
        handles {
          ...MediaFragment
          episodes {
            ...EpisodeFragment
          }
        }
        episodes {
          ...EpisodeFragment
          episodeNumber
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
  height: 100vh;
  overflow: hidden;
  color: rgb(255, 255, 255);

  .watch-container {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }

  .player-container {
    position: relative;
    flex: 1;
    min-height: 0;

    .player-loading {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #000;
      font-size: 1.4rem;
      opacity: 0.7;
    }
  }

  .watch-info {
    display: flex;
    flex-direction: column;
    gap: 1.2rem;
    padding: 1.6rem 2.4rem;
    width: 100%;
    max-width: 2200px;
    margin: 0 auto;
    box-sizing: border-box;
  }

  .episode-info {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;

    .episode-title {
      font-size: 1.8rem;
      font-weight: 600;
    }

    .media-title {
      font-size: 1.2rem;
      opacity: 0.6;
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

  const embedUrl = useMemo(() => {
    if (!selectedSourceUri) return undefined
    const handle = episode?.handles.find(h => h.uri === selectedSourceUri)
    if (!handle) return undefined
    // Prefer extractor/plugin-provided embedUrl
    if (handle.embedUrl) return handle.embedUrl
    // Fall back to built-in embed page for supported origins
    const { origin } = fromUri(selectedSourceUri as `${string}:${string}`)
    if (!getPlayer(origin) || !handle.url) return undefined
    const embedParams = new URLSearchParams({
      mediaUri: params.mediaUri,
      episodeUri: params.episodeUri,
      sourceUri: selectedSourceUri,
      url: handle.url
    })
    return `/embed.html?${embedParams}`
  }, [selectedSourceUri, episode?.handles, params.mediaUri, params.episodeUri])

  const sources: WatchSource[] = useMemo(
    () =>
      (originData?.originPage?.nodes ?? []).map(origin => {
        const handle = episode?.handles.find(h => h.origin === origin.id)
        const sourceUri = handle?.uri
        const playable = Boolean(handle?.embedUrl || (getPlayer(origin.id) && handle?.url))
        const watchPath =
          sourceUri
            ? getRoutePath(Route.WATCH, { mediaUri: params.mediaUri, episodeUri: params.episodeUri, sourceUri })
            : undefined
        return {
          id: origin.id,
          name: origin.name ?? origin.id,
          icon: origin.icon,
          color: origin.color,
          href: playable ? watchPath : (handle?.url ?? undefined),
          external: !playable,
          active: selectedSourceUri === sourceUri,
        }
      }),
    [originData, episode?.handles, params.mediaUri, params.episodeUri, selectedSourceUri]
  )

  return (
    <div css={style}>
      <div className="watch-container">
        {embedUrl
          ? (
            <iframe
              src={embedUrl}
              referrerPolicy="no-referrer"
              allow="encrypted-media; autoplay; fullscreen;"
              css={css`
                width: 100%;
                border: none;
                background: #000;
                flex: 1;
                min-height: 0;
              `}
            />
          )
          : undefined}

        <div className="watch-info">
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

          <SourceSelector sources={sources} />
        </div>
      </div>
    </div>
  )
}

export default Watch
