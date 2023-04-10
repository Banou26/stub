import type { Media } from '../../../../scannarr/src'

import { css } from '@emotion/react'
import { Link } from 'react-router-dom'

const style = css`
align-items: center;
background-repeat: no-repeat;
background-size: cover;
background-position: center;

display: grid;
grid-template-rows: auto auto;
align-content: end;
span {
  font-size: 1.9rem;
  font-weight: 700;
  text-align: center;
  text-shadow: rgb(0 0 0 / 80%) 1px 1px 0;
  padding-top: 1rem;
  background:
    linear-gradient(
      0deg,
      rgba(0,0,0,0.5) 0%,
      rgba(0,0,0,0.5) calc(100% - 1rem),
      rgba(0,0,0,0) 100%
    );
}
`

export default ({ media, ...rest }: { media: Media }) => (
  <Link
    css={style}
    key={media.uri}
    href={`/title/${media.uri}`}
    className="media"
    style={{ backgroundImage: `url(${media.coverImage?.at(0)?.default})` }}
    {...rest}
  >
    <span style={{ color: 'white' }}>{media.title?.romanized}</span>
  </Link>
)
