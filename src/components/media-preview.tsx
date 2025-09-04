import type { HTMLAttributes, Ref } from 'react'

import type { Media } from '../generated/schema/types.generated'

import { css } from '@emotion/react'
import { Link } from 'wouter'
import { useEffect, useMemo, useState } from 'preact/hooks'

import { getRoutePath, Route } from '../router/path'
import { YoutubeMinimalPlayer } from './yt-minimal-player'

const style = css`
display: grid;
background-color: rgb(35, 35, 35);
border-radius: 1rem;
user-select: none;

transform: scale(0.95);
transition: transform .2s ease, opacity .2s ease;

width: 50rem;
margin-top: 29rem;
@media (min-width: 2560px) {
  width: 70rem;
  margin-top: 37.5rem;
}

&:hover {
  transform: scale(1);
  opacity: 1;
}

a {
  color: #fff;
  text-decoration: none;
}

.content {
  padding: 1.5rem;
  width: 50rem;

  @media (min-width: 2560px) {
    padding: 2rem;
    width: 70rem;
  }

  .title {
    margin-bottom: .25rem;
    font-size: 1.5rem;
    font-weight: 600;

    @media (min-width: 2560px) {
      margin-bottom: .5rem;
      font-size: 2rem;
    }
  }

  .top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: .5rem;

    @media (min-width: 2560px) {
      margin-bottom: 1rem;
    }

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

  height: 28rem;
  width: 50rem;
  @media (min-width: 2560px) {
    height: 39.25rem;
    width: 70rem;
  }

  & > a > div:first-of-type {
    grid-area: container;
    pointer-events: none;

    margin-top: -6.9rem;
    height: 42rem !important;
    width: 50rem !important;
    @media (min-width: 2560px) {
      margin-top: -10.3rem;
      height: 60rem !important;
      width: 70rem !important;
    }
  }
}
`

export const MediaPreview = ({ ref, media, ...rest }: HTMLAttributes<HTMLDivElement> & { ref: Ref<HTMLDivElement>, media: Media }) => {
  const [contentRef, setContentRef] = useState<HTMLDivElement | null>(null)
  const [contentHeight, setContentHeight] = useState<number | undefined>(undefined)

  useEffect(() => {
    if (contentRef === null) return
    const resizeObserver = new ResizeObserver(() => {
      setContentHeight(contentRef.clientHeight)
    })
    resizeObserver.observe(contentRef as HTMLDivElement)
    return () => {
      resizeObserver.disconnect()
    }
  })

  const title = useMemo(() => media?.titles?.at(0)?.title, [media])
  const shortDescription = useMemo(() => media?.shortDescriptions?.at(0)?.shortDescription, [media])
  const trailer = useMemo(() => media?.trailers?.at(0), [media])

  return (
    <div
      ref={ref}
      {...{
        ...rest,
        style: rest.style && {
          ...rest.style,
          top: contentHeight ? `calc(${rest.style.top}px + ${contentHeight / 2}px)` : rest.style.top
        }
      }}
      className="title-hovercard"
      css={style}
    >
      {
        trailer?.url && (
          <YoutubeMinimalPlayer
            volume={0}
            url={trailer?.url}
            redirectTo={`${getRoutePath(Route.TITLE, { uri: media.uri })}?${new URLSearchParams({ details: media.uri }).toString()}`}
            className="title-hovercard-player"
          />
        )
      }
      <Link
        to={`${getRoutePath(Route.TITLE, { uri: media.uri })}?${new URLSearchParams({ details: media.uri }).toString()}`}
        ref={ref => setContentRef(ref)}
      >
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
