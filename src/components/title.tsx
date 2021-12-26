
import { useState, useEffect } from 'react'
import { css } from '@emotion/react'
import { Link } from 'raviger'

import { getLatest, Category, TitleHandle } from 'src/lib'
import Slider from 'src/components/slider'
import { useFetch } from 'src/lib/hooks/utils'

const style = css`
align-items: center;
background-repeat: no-repeat;
background-size: cover;

display: grid;
grid-template-rows: auto auto;
align-content: end;
span {
  font-size: 1.9rem;
  font-weight: 700;
  text-align: center;
  text-shadow: rgb(0 0 0 / 80%) 1px 1px 0;
  padding-top: 1rem;
  background: linear-gradient(0deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.5) calc(100% - 1rem), rgba(0,0,0,0) 100%);
}
`

export default ({ title }: { title: TitleHandle }) => (
  <Link css={style} key={title.id} href={`/title/${title.id}`} className="title" style={{ backgroundImage: `url(${title.images.at(0)?.url})` }}>
    <span style={{ color: 'white' }}>{title.names.at(0)?.name}</span>
  </Link>
)
