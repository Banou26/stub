import type { Episode } from '../generated/graphql'
import type { To } from 'react-router'

import { css } from '@emotion/react'
// import { Link } from 'react-router-dom'
import { forwardRef } from 'react'
import { Link } from 'wouter'


const style = css`
&.card, .card {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  font-size: 2.5rem;
  overflow: hidden;
  border-radius: 1rem;

  height: 20rem;
  width: 35rem;
  @media (min-width: 2560px) {
    height: 25rem;
    width: 40rem;  
  }

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
    word-wrap: break-word;

    font-size: 1.75rem;
    font-weight: 600;
    margin: .1rem 0;
    @media (min-width: 2560px) {
      font-size: 2.2rem;
      font-weight: bold;
      margin: .5rem 0;
    }
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
    padding: .5rem;
    padding: .75rem .5rem 0rem .5rem;
    @media (min-width: 2560px) {
      padding: 1rem 2rem 0rem 2rem;
    }
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

export default forwardRef<HTMLDivElement, React.ButtonHTMLAttributes<HTMLDivElement> & { episode: Episode, to: To }>(({ episode, to, ...rest }, ref) => (
  <div ref={ref} css={style} key={episode.uri} className="card category-item" {...rest}>
    <Link
      tabIndex={-1}
      to={to}
      className="card link"
    />
    <div className="information">
        <div className="title">
          <Link to={to} className="title-text">
            <span>
              {
                (episode.media?.title?.romanized?.length ?? 0) > 30
                  ? episode.media?.title?.romanized?.slice(0, 30) + '...'
                  : episode.media?.title?.romanized
              }
            </span>
            <br />
            <span>Episode {episode.number}</span>
          </Link>
        </div>
    </div>
  </div>
))
