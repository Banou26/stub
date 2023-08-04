import type { Media } from '../../../../scannarr/src'

import { css } from '@emotion/react'
import { Link } from 'react-router-dom'
import { forwardRef, useEffect, useState } from 'react'

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

export default forwardRef<HTMLDivElement, React.ButtonHTMLAttributes<HTMLDivElement> & { media: Media }>(({ media, ...rest }, _ref) => {
  const [ref, setRef] = useState<HTMLDivElement | null>(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    if (!ref) {
      setIsVisible(false)
      // @ts-expect-error
      if (_ref) _ref.current = null
      return
    }

    const observer = new IntersectionObserver(
      (entries) => setIsVisible(entries[0]!.isIntersecting),
      { threshold: 0.01 }
    )

    observer.observe(ref)

    return () => {
      observer.disconnect()
    }
  }, [ref])
  
  return (
    <div ref={setRef} css={style} key={media.uri} className="card category-item" style={isVisible ? { backgroundImage: `url(${media.coverImage?.at(0)?.default})`, backgroundSize: 'cover' } : {}} {...rest}>
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
          </div>
      </div>
    </div>
  )
})
