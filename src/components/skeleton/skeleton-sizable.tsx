import { css } from '@emotion/react'

const style = ({width, height}: {width?: number, height?: number}) => css`
width: ${width ? `${width}px` : 'auto'};
height: ${height ? `${height}px` : 'auto'};
padding: 0 .2rem;
border-radius: .5rem;
position: relative;
&:after {
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  height: 100%;
  width: 100%;
  display: inline-block;
  position: absolute;
  border-radius: .5rem;
  background: #1a1d24;
  }
}
`

const generateString = (length: number) => {
  return Array.from({length}).map(() => "A").join("")
}

const SkeletonSizable = ({
  width,
  height,
  length
}: {
  width?: number,
  height?: number,
  length?: number
}) => {
  return (
    <div
      css={style({width, height})}>
      {
        length && (
          generateString(length)
        )
      }
    </div>
  )
}

export default SkeletonSizable