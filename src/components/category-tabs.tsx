import { css } from '@emotion/react'

import { MediaCategory } from '../generated/graphql'

const TABS = [
  { label: 'All', value: null },
  { label: 'Anime', value: MediaCategory.Anime },
  { label: 'Series', value: MediaCategory.Series },
  { label: 'Movies', value: MediaCategory.Movie },
] as const

const style = css`
  display: flex;
  gap: 0.6rem;

  .tab {
    padding: 0.5rem 1.3rem;
    border-radius: 2rem;
    border: 1px solid rgba(255, 255, 255, 0.15);
    background: transparent;
    color: rgba(255, 255, 255, 0.6);
    font-size: 1.4rem;
    cursor: pointer;
    transition: all 0.15s;
  }

  .tab:hover { color: rgba(255, 255, 255, 0.9); }

  .tab.active {
    background: #fff;
    color: #000;
    border-color: #fff;
  }
`

type Props = {
  value: MediaCategory | null
  onChange: (value: MediaCategory | null) => void
}

const CategoryTabs = ({ value, onChange }: Props) => (
  <div css={style}>
    {TABS.map(tab => (
      <button
        key={tab.label}
        className={value === tab.value ? 'tab active' : 'tab'}
        onClick={() => onChange(tab.value)}
      >
        {tab.label}
      </button>
    ))}
  </div>
)

export default CategoryTabs
