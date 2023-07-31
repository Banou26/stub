import type { Episode } from '../generated/graphql'

import { css } from '@emotion/react'
import { Link } from 'react-router-dom'
import { forwardRef } from 'react'

import { Route, getRoutePath } from '../router/path'

const style = css`
&.card, .card {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  height: 25rem;
  width: 40rem;
  font-size: 2.5rem;
  overflow: hidden;
  border-radius: 1rem;

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

  .information {
    width: 100%;
    text-shadow: rgb(0 0 0 / 80%) 1px 1px 0;
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
    padding-top: 1rem;
    padding-bottom: 0;
    width: 25rem;
    color: white;
    font-size: 2.5rem;
    overflow: hidden;
    pointer-events: none;

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

export default forwardRef<HTMLDivElement, React.ButtonHTMLAttributes<HTMLDivElement> & { episode: Episode }>(({ episode, ...rest }, ref) => {
  return (
    <div ref={ref} css={style} key={episode.uri} className="card category-item" style={{ backgroundImage: `url(${episode.thumbnail})`, backgroundSize: 'cover' }} {...rest}>
      <Link
        tabIndex={-1}
        to={getRoutePath(Route.TITLE, { uri: episode.uri })}
        className="card link"
      />
      <div className="information">
          <div className="title">
            <Link to={getRoutePath(Route.TITLE, { uri: episode.uri })} className="title-text">
              {
                (episode.title?.romanized?.length ?? 0) > 30
                  ? episode.title?.romanized?.slice(0, 30) + '...'
                  : episode.title?.romanized
              }
            </Link>
          </div>
      </div>
    </div>
  )
})
