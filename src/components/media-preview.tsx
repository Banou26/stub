import type { HTMLAttributes, Ref } from 'react'

import type { Media } from '../generated/schema/types.generated'

import { css } from '@emotion/react'
import { Link } from 'wouter'
import { useMemo } from 'preact/hooks'

import { getRoutePath, Route } from '../router/path'
import { YoutubeMinimalPlayer } from './yt-minimal-player'

const style = css`
display: grid;
background-color: rgb(35, 35, 35);
border-radius: 1rem;
user-select: none;

transform: scale(0.95);
transition: transform .2s ease, opacity .2s ease;

width: 70rem;

&:hover {
  transform: scale(1);
  opacity: 1;
}

a {
  color: #fff;
  text-decoration: none;
}

.content {
  padding: 2rem;
  width: 70rem;

  .title {
    margin-bottom: .5rem;
    font-size: 2rem;
    font-weight: 600;
  }

  .top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
    font-size: 1.5rem;
    font-weight: 600;
  }

  .description {
    display: flex;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 1.25rem;
    font-weight: 500;
  }
}

.title-hovercard-player {
  position: relative;
  display: grid;
  grid-template: "container";
  background-color: #000;
  overflow: hidden;
  border-top-left-radius: 1rem;
  border-top-right-radius: 1rem;
  user-select: none;
  overflow: hidden;
  height: 39.25rem;
  width: 70rem;

  & > a > youtube-video {
    grid-area: container;
    pointer-events: none;
    margin-top: -10.3rem;
    height: 60rem !important;
    width: 70rem !important;
  }
}
`

export const MediaPreview = ({ ref, media, ...rest }: HTMLAttributes<HTMLDivElement> & { ref: Ref<HTMLDivElement>, media: Media }) => {
  const title = useMemo(() => media?.titles?.at(0)?.title, [media])
  const shortDescription = useMemo(() => media?.shortDescriptions?.at(0)?.shortDescription, [media])
  const trailer = useMemo(() => media?.trailers?.at(0), [media])

  return (
    <div
      ref={ref}
      className="title-hovercard"
      css={style}
      {...rest}
    >
      {
        trailer?.url && (
          <YoutubeMinimalPlayer
            volume={0}
            url={trailer?.url}
            redirectTo={`${getRoutePath(Route.MEDIA, { uri: media.uri })}?${new URLSearchParams({ details: media.uri }).toString()}`}
            className="title-hovercard-player"
          />
        )
      }
      <Link to={`${getRoutePath(Route.MEDIA, { uri: media.uri })}?${new URLSearchParams({ details: media.uri }).toString()}`}>
        <div className="content">
          <div className='title'>
            {title}
          </div>
          <div className="top">
            <span className="episodes">
              {media.episodeCount ?? '?'} Episodes
            </span>
          </div>
          <div className="description">
            {shortDescription}
          </div>
        </div>
      </Link>
    </div>
  )
}
