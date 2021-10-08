import { css } from '@emotion/react'

const style = css`
position: relative;
display: grid;
clip-path: polygon(0 0%, 100% 0%, 100% calc(100% - 1.4rem), 0% calc(100% - 1.4rem));

.list {
  display: grid;
  grid-auto-columns: 22.5rem;
  grid-auto-flow: column;
  grid-gap: 2.5rem;
  height: 31.8rem;
  overflow: auto;
  scroll-snap-type: x mandatory;

  & > * {
    scroll-snap-align: start;
  }

}

.action {
  display: none;
  position: absolute;
  height: 31.8rem;
  width: 10rem;
  font-size: 15rem;
}
.list:hover~.action, .action:hover {
  display: flex;
}
.action:first-of-type {
  left: 0;
}
.action:last-of-type {
  right: 0;
}
.action:hover {
  background-color: rgba(0, 0, 0, .2);
}
`

export default ({ children }) =>
  <div css={style}>
    <div className="list">
      {children}
    </div>
    <div onClick={(ev) => ev.target.parentElement.querySelector('.list').scrollBy({ left: -225 * 5, behavior: 'smooth' })} className="action">{'<'}</div>
    <div onClick={(ev) => ev.target.parentElement.querySelector('.list').scrollBy({ left: 225 * 5, behavior: 'smooth' })} className="action">{'>'}</div>
  </div>
