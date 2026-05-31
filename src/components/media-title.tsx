import type { Media } from '../generated/graphql'
import type { Ref } from 'react'
import type { Path } from 'wouter'

import { css } from '@emotion/react'
import { Link } from 'wouter'
import { useEffect, useState } from 'preact/hooks'
import TextEllipsis from './text-ellipsis'

const style = css`
&.card, .card {
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  font-size: 2.5rem;
  overflow: hidden;
  border-radius: 1rem;

  height: 35rem;
  width: 25rem;

  &.link {
    position: absolute;
    inset: 0;
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
    padding: 1rem 2rem 0rem 2rem;
    color: white;
    font-size: 2.5rem;
    overflow: hidden;
    pointer-events: none;
    max-height: 10rem;

    .title {
      width: 100%;
      max-height: 10rem;

      font-size: 2.2rem;
      font-weight: bold;
      margin: .5rem 0;
    }

    .title-text {
      color: white;
      position: relative;
    }
  }
}
`

const MediaTitle = ({ media, to, ...rest }: React.ButtonHTMLAttributes<HTMLDivElement> & { ref?: Ref<HTMLDivElement>, media: Pick<Media, 'titles' | 'covers'>, to: Path }) => {
  const title = media.titles?.at(0)?.title
  const firstCover = media.covers?.at(0)?.url
  const [coverUrl, setCoverUrl] = useState(firstCover)

  useEffect(() => {
    if (coverUrl) return
    setCoverUrl(firstCover)
  }, [media, coverUrl, firstCover])

  return (
    <div
      {...rest}
      css={style}
      className="card category-item"
      style={{ ...(typeof rest.style === 'object' ? rest.style : undefined), backgroundImage: `url(${coverUrl})`, backgroundSize: 'cover' }}
    >
      <Link
        tabIndex={-1}
        to={to}
        className="card link"
      />
      <div className="information">
          <div className="title">
            <Link to={to} className="title-text">
              <TextEllipsis>{title}</TextEllipsis>
            </Link>
          </div>
      </div>
    </div>
  )
}

export default MediaTitle
