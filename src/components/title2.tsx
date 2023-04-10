import type { Media } from '../../../../scannarr/src'

import { css } from '@emotion/react'
import { Link } from 'react-router-dom'

import { targets } from 'laserr'
import { Route, getRoutePath } from '../router/path'

const style = css`
&.card, .card {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  height: 35rem;
  width: 25rem;
  font-size: 2.5rem;
  overflow: hidden;

  &.link {
    position: absolute;
    inset: 0;
  }

  &.link:hover + .information .title-text {
    text-decoration: underline;
  }

  .origin-icon {
    display: inline-flex;
    margin-top: auto;
    margin-left: 1rem;
    height: 2rem;
    width: 2rem;

    &:hover {
      border: 1px solid white;
    }

    img {
      height: 2rem;
      width: 2rem;
    }
  }

  .title {
    width: 100%;
    font-size: 2.2rem;
    font-weight: bold;
    word-wrap: break-word;
    margin: .5rem 0;
  }

  .description {
    width: 100%;
    font-size: 1.7rem;
    word-wrap: break-word;
  }

  .information {
    width: 100%;
    text-shadow: rgb(0 0 0 / 80%) 1px 1px 0;
    padding-top: 1rem;
    background:
      linear-gradient(
        0deg,
        rgba(0,0,0,0.5) 0%,
        rgba(0,0,0,0.5) calc(100% - 1rem),
        rgba(0,0,0,0) 100%
      );

    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    text-align: center;
    padding: 2rem;
    width: 25rem;
    color: white;
    font-size: 2.5rem;
    overflow: hidden;

    .title-text, .author, .origin-icon {
      color: white;
      position: relative;
    }

    .author a span {
      color: white;
    }
  }
}
`

export default ({ media, ...rest }: { media: Media }) => {
  const mediaTargets =
    targets
      .filter(target => media.handles.nodes.find((handle) => handle.origin === target.origin))
      .map(target => ({
        target,
        media: media.handles.nodes.find((handle) => handle.origin === target.origin)
      }))

  return (
    <div css={style} key={media.uri} className="card category-item" style={{ backgroundImage: `url(${media.coverImage?.at(0)?.default})`, backgroundSize: 'cover' }}>
      <Link
        tabIndex={-1}
        to={getRoutePath(Route.TITLE, { uri: media.uri })}
        className="card link"
      />
      <div className="information">
          <div className="title">
            <Link to={getRoutePath(Route.TITLE, { uri: media.uri })} className="title-text">
              {
                (media.title?.romanized?.length ?? 0) > 30
                  ? media.title?.romanized?.slice(0, 30) + '...'
                  : media.title?.romanized
              }
            </Link>
            {
              mediaTargets.map(({ target, media }) => (
                <a key={target.origin} href={media.url} className="origin-icon" target="_blank" rel="noopener noreferrer">
                  <img src={target.icon} alt=""/>
                </a>
              ))
            }
          </div>
        <div className="description">{media.shortDescription}</div>
      </div>
    </div>
  )
}
