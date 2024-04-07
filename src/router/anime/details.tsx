import { css } from "@emotion/react"
import { ArrowRight, BarChart, Calendar, Cloud, User } from "react-feather"
import { toUriEpisodeId } from "scannarr"
import { useSubscription } from "urql"
import { Link, useParams } from "wouter"
import { targets } from "laserr"

import { Route, getRoutePath } from "../path"

export const GET_PREVIEW_MODAL_MEDIA = `#graphql
  subscription GetPreviewModalMedia($input: MediaInput!) {
    media(input: $input) {
      handles {
        edges {
          node {
            handles {
              edges {
                node {
                  origin
                  id
                  uri
                }
              }
            }
            ...GetPreviewModalMediaFragment
          }
        }
      }
      ...GetPreviewModalMediaFragment
    }
  }

  fragment GetPreviewModalMediaEpisodeFragment on Episode {
    origin
    id
    uri
    url
    handles {
      edges {
        node {
          origin
          id
          uri
          url
        }
      }
    }
    airingAt
    number
    mediaUri
    timeUntilAiring
    thumbnail
    title {
      romanized
      english
      native
    }
    description
  }

  fragment GetPreviewModalMediaFragment on Media {
    origin
    id
    uri
    url
    title {
      romanized
      english
      native
    }
    bannerImage
    coverImage {
      color
      default
      extraLarge
      large
      medium
      small
    }
    description
    shortDescription
    season
    seasonYear
    popularity
    averageScore
    episodeCount
    trailers {
      origin
      id
      uri
      url
      thumbnail
    }
    startDate {
      year
      month
      day
    }
    endDate {
      year
      month
      day
    }
    episodes {
      edges {
        node {
          ...GetPreviewModalMediaEpisodeFragment
        }
      }
    }
  }
`

const style = css`
h1 {
  font-size: 2.5rem;
  @media (min-width: 2560px) {
    font-size: 3rem;
  }
  font-weight: 600;
}

h2 {
  font-size: 2rem;
  @media (min-width: 2560px) {
    font-size: 2.5rem;
  }
  font-weight: 600;
}

h3 {
  font-size: 1.5rem;
  @media (min-width: 2560px) {
    font-size: 2rem;
  }
  font-weight: 600;
}

.header {
  width: 100%;
  height: 20rem;
  object-fit: cover;
}

.body {
  display: grid;
  grid-template-columns: 3fr 1fr;
  gap: 1rem;
  margin: 0 5rem;
  margin-top: -7rem;

  .main {
    .top {
      display: flex;
      justify-content: flex-start;
      align-items: flex-end;
      gap: 1rem;

      img {
        width: auto;
        height: 50rem;
        object-fit: cover;
        border-radius: .5rem;
      }
    
      .right {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    
        > div {
          display: flex;
          align-items: center;
          gap: 2rem;
    
          span {
            display: flex;
            align-items: center;
            gap: 0.5rem;
          }
        }

        button {
          color: white;
          font-size: 1.5rem;
          font-weight: 600;
          border: .1rem solid rgba(255, 255, 255, .15);
          border-radius: .5rem;
          background: transparent;
          padding: .75rem 1.25rem;
          :hover {
            background-color: rgba(255, 255, 255, .05);
            color: #e9ecef;
            cursor: pointer;
          }
        }

        .icon {
          width: 3rem;
          height: 3rem;
          object-fit: cover;
          border-radius: .5rem;
        }

        a {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          color: white;
          text-decoration: none;
          transition: color 0.2s;

          :hover {
            transition: color 0.2s;
          }
        }
      }
    }

    .description {
      position: relative;
      .title {
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 2rem 0;

        &::before,
        &::after {
          content: '';
          flex: 1;
          border-bottom: 1px solid #232323;
          border-radius: .5rem;
          margin: 0 2rem 0 0;
        }
        &::before {
          margin: 0 2rem 0 1rem;
        }
        &::after {
          margin: 0 1rem 0 2rem;
        }

      }
      p {
        font-size: 1.25rem;
        line-height: 1.5;
        @media (min-width: 2560px) {
          font-size: 1.5rem;
        }
      }
    }
  }
}

.episode {
  display: flex;
  flex-direction: column;
  gap: 2rem;
  margin-bottom: 2rem;
  .card {
    display: grid;
    grid-template-columns: 1fr 1fr;
    border-radius: .5rem;
    background-color: #17191C;
    transition: transform 0.1s; 

    .info {
      padding: 1rem;
      color: white;
    }
    :hover {
      cursor: pointer;
      transform: scale(1.05);
      transition: transform 0.1s; 
    }
  }

  img {
    border-radius: .5rem 0 0 .5rem;
    width: 100%;
    height: auto;
    object-fit: cover;
  }
}
`

function timeUntilOrSince(timestamp: number): string {
  const now = new Date().getTime()
  const deltaSeconds = (timestamp - now) / 1000
  const isFuture = deltaSeconds > 0
  const absSeconds = Math.abs(deltaSeconds)
  const timeUnits: [number, string][] = [
      [31536000, 'year'],
      [2592000, 'month'],
      [604800, 'week'],
      [86400, 'day'],
      [3600, 'hour'],
      [60, 'minute'],
      [1, 'second']
  ]

  for (const [unitSeconds, unitName] of timeUnits) {
      const unitValue = absSeconds / unitSeconds
      if (unitValue >= 1) {
          const roundedUnit = Math.floor(unitValue)
          let formattedString = `${roundedUnit} ${unitName}${roundedUnit > 1 ? 's' : ''}`
          formattedString = isFuture ? `in ${formattedString}` : `${formattedString} ago`
          return formattedString
      }
  }
  return "just now"
}

const AnimeDetails = () => {
  const { uri } = useParams()

  const [{ fetching, error, data: { media } = { media: undefined } }] = useSubscription({
    query: GET_PREVIEW_MODAL_MEDIA,
    variables: { input: { uri: uri! } },
    pause: !uri
  })

  const mediaTargets =
    media &&
    targets
      .filter(target => media.handles.edges.find((edge) => edge.node.origin === target.origin)?.node)
      .map(target => ({
        target,
        media: media.handles.edges.find((edge) => edge.node.origin === target.origin)?.node
      }))

  return (
    <div css={style}>
      <img className="header" src={media?.coverImage.at(0)?.extraLarge} alt={media?.title?.english} />
      <div className="body">
        <div className="main">
          <div className="top">
            <img src={media?.coverImage.at(0)?.default} alt={media?.title?.english} />
            <div className="right">
              <h1 className="title">{media?.title?.english}</h1>
              <div>
                <span><Cloud /> {media?.season}</span>
                <span>
                  <Calendar />
                  {media?.startDate.year}-{media?.startDate.month}-{media?.startDate.day}
                  <ArrowRight size={16} />
                  {
                    media?.endDate.year && media?.endDate.month && media?.endDate.day
                      ? `${media?.endDate.year}-${media?.endDate.month}-${media?.endDate.day}`
                      : 'Ongoing'
                  }
                </span>
              </div>
              <div>
                <span><User /> {media?.popularity}</span>
                <span><BarChart /> {media?.averageScore}</span>
                <span>Episodes: {media?.episodeCount}</span>
              </div>
              <div>
                <a href={media?.trailers.at(0).url} target="_blank">
                  <button>Trailer</button>
                </a>
                {
                  mediaTargets
                    ?.filter(({ media, target }) => media?.url && target.icon && target.official)
                    ?.map(({ target, media }) => (
                      <a
                        key={target.origin}
                        href={media.url ?? target.originUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <img src={target.icon} alt={target.name} className="icon" />
                      </a>
                    ))
                }
              </div>
            </div>
          </div>
          <div className="description">
            <h2 className="title">Synopsis</h2>
            <p>{media?.description}</p>
          </div>
        </div>
        <div>
          <div className="episode">
            {
              media?.episodes?.edges.map((episode) => {
                const episodeScannarrUri = toUriEpisodeId(episode.node.uri, episode.node.number)
                if (!episode.node.title?.english || !episode.node.airingAt) return
                return (
                  <Link
                    className="card"
                    to={getRoutePath(Route.WATCH, { mediaUri: episode.node.mediaUri, episodeUri: episodeScannarrUri })}
                    key={episode.node.id}
                  >
                    {
                      episode.node.thumbnail && (
                        <img src={episode.node.thumbnail} alt={episode.node.title?.english} />
                      )
                    }
                    <div className="info">
                      <h3>{episode.node.number}. {episode.node.title?.english}</h3>
                      <span>{episode.node.description}</span>
                      <span>{timeUntilOrSince(episode.node.airingAt)}</span>
                    </div>
                  </Link>
                )
              })
            }
          </div>
        </div>
      </div>
    </div>
  )
}

export default AnimeDetails