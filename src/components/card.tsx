import type { Series } from '../../../../scannarr/src'

import { css } from '@emotion/react'
import Title from './title'

const style = css`
display: grid;
grid-template-columns: 25rem 40rem;
background: rgb(35, 35, 35);
overflow: hidden;

.title {
  height: 30rem;
}

.data {
  display: grid;
  grid-template-rows: 5rem 21rem 4rem;
  background: rgb(35, 35, 35);

  .synopsis {
    margin: 2rem 0 0 2rem;
    padding-right: 2rem;
    overflow: auto;
    line-height: 2.5rem;
  }

  .genres {
    padding: 0 2rem;
  }
}
`

export default ({ series }: { series: Series }) => {
  console.log('series', series)
  return (
    <div css={style}>
      <Title series={series} className="title"/>
      <div className="data">
        <div></div>
        <div className="synopsis">
          {series.synopses.at(0)?.synopsis}
        </div>
        <div className="genres">
          <span>genre</span>
          <span>genre</span>
        </div>
      </div>
    </div>
  )
}
