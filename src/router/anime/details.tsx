import { useState } from "react"
import { css } from "@emotion/react"
import { ArrowRight, BarChart, Calendar, Cloud, User } from "react-feather"
import { toUriEpisodeId } from "scannarr"
import { useSubscription } from "urql"
import { Link, useParams } from "wouter"
import { targets } from "laserr"

import { GET_PREVIEW_MODAL_MEDIA } from "./preview-modal"
import { Pagination } from "../../components/pagination"
import { Route, getRoutePath } from "../path"

const style = css`
h1 {
  font-size: 1.3rem;
  @media (min-width: 640px) {
    font-size: 1.5rem;
  }
  @media (min-width: 1440px) {
    font-size: 2.5rem;
  }
  @media (min-width: 2560px) {
    font-size: 3rem;
  }
  font-weight: 600;
}

h2 {
  font-size: 1.25rem;
  @media (min-width: 1440px) {
    font-size: 2rem;
  }
  @media (min-width: 2560px) {
    font-size: 2.5rem;
  }
  font-weight: 600;
}

h3 {
  font-size: 1.2rem;
  @media (min-width: 1440px) {
    font-size: 1.5rem;
  }
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
  @media (min-width: 1024px) {
    display: grid;
    grid-template-columns: 2fr 1fr;
    gap: 1rem;
  }
  @media (min-width: 1440px) {
    grid-template-columns: 3fr 1fr;
  }
  display: flex;
  flex-direction: column;
  gap: 2rem;
  margin: 0 1rem;
  margin-top: -5rem;
  @media (min-width: 640px) {
    margin: 0 5rem;
    margin-top: -7rem;
  }

  .main {
    .top {
      display: flex;
      justify-content: flex-start;
      align-items: flex-end;
      gap: 1rem;

      img {
        width: auto;
        height: 20rem;
        @media (min-width: 960px) {
          height: 30rem;
        }
        @media (min-width: 1440px) {
          height: 50rem;
        }
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
          flex-wrap: wrap;
          gap: 1rem;
          @media (min-width: 960px) {
            gap: 2rem;
          }
    
          span {
            font-size: 1.2rem;
            @media (min-width: 1440px) {
              font-size: 1.6rem;
            }
            display: flex;
            align-items: center;
            gap: 0.5rem;
            svg {
              width: 1.5rem;
              height: 1.5rem;
              @media (min-width: 1440px) {
                width: 2.5rem;
                height: 2.5rem;
              }
            }
          }
        }

        button {
          color: white;
          font-size: 1.25rem;
          padding: .5rem 1rem;
          @media (min-width: 960px) {
            padding: .75rem 1.25rem;
            font-size: 1.5rem;
          }
          font-weight: 600;
          border: .1rem solid rgba(255, 255, 255, .15);
          border-radius: .5rem;
          background: transparent;
          :hover {
            background-color: rgba(255, 255, 255, .05);
            color: #e9ecef;
            cursor: pointer;
          }
        }

        .icon {
          width: 1.5rem;
          height: 1.5rem;
          @media (min-width: 960px) {
            width: 3rem;
            height: 3rem;
          }
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
        @media (min-width: 1440px) {
          font-size: 1.5rem;
        }
        @media (min-width: 2560px) {
          font-size: 2rem;
        }
      }
    }
  }
}

.episode {
  > div { // Pagination
    > ul {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
      margin-bottom: 2rem;
    }
  }

  .card {
    display: grid;
    grid-template-columns: 1fr 1fr;
    border-radius: .5rem;
    background-color: #17191C;
    transition: transform 0.1s; 

    .info {
      padding: 1rem;
      color: white;
      span {
        font-size: 1rem;
        @media (min-width: 1440px) {
          font-size: 1.5rem;
        }
        display: block;
      }
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
    height: 12rem;
    @media (min-width: 1440px) {
      height: 16rem;
    }
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
  const [currentPage, setCurrentPage] = useState(0)
  const itemsPerPage = 8

  const [{ error, data: { media } = { media: undefined } }] = useSubscription({
    query: GET_PREVIEW_MODAL_MEDIA,
    variables: { input: { uri: uri! } },
    pause: !uri
  })
  if (error) console.error(error)

    const mediaTargets =
    media &&
    targets
      .filter(target => media.handles.find((handle) => handle.origin === target.origin))
      .map(target => ({
        target,
        media: media.handles.find((handle) => handle.origin === target.origin)
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
                {
                  media?.season
                    ? <span><Cloud /> {media?.season}</span>
                    : null
                }
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
                {
                  media?.episodeCount
                    ? <span>Episodes: {media?.episodeCount}</span>
                    : null
                }
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
            <Pagination
              currentPage={currentPage}
              setCurrentPage={setCurrentPage}
              itemsPerPage={itemsPerPage}
              totalPages={
                media?.episodes
                ? Math.ceil(media.episodes.filter(episode => episode?.title?.english && episode.airingAt).length / itemsPerPage)
                : 0
              }
              position="bottom"
            >
              {
                media?.episodes
                  ?.sort((a, b) => (a?.number ?? 0) - (b?.number ?? 0))
                  ?.filter((episode) => episode.airingAt)
                  ?.slice(currentPage * itemsPerPage, currentPage * itemsPerPage + itemsPerPage)
                  .map((episode) => {
                    const episodeScannarrUri = toUriEpisodeId(episode.uri, episode.number)
                    return (
                      <Link
                        className="card"
                        to={getRoutePath(Route.WATCH, { mediaUri: episode.mediaUri, episodeUri: episodeScannarrUri })}
                        key={episode.id}
                      >
                        {
                          episode.thumbnail && (
                            <img src={episode.thumbnail} alt={episode.title?.english} />
                          )
                        }
                        <div className="info">
                          <h3>{episode.number}. {episode.title?.english ?? "N/A"}</h3>
                          <span>{episode.description}</span>
                          <span>{timeUntilOrSince(episode.airingAt)}</span>
                        </div>
                      </Link>
                    )
                  })
              }
            </Pagination>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AnimeDetails