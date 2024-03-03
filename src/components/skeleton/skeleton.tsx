import { css } from '@emotion/react'

const style = () => css`
position: relative;
padding: 0 .2rem;
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

const Skeleton = ({children}: {children}) => {
  return (
    <span css={style()}>
      {children}
    </span>
  )
}

export default Skeleton