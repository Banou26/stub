import type { DisplayMode } from '../router/search/display'

import { css } from '@emotion/react'
import { Grid2x2, Grid3x2, LayoutList } from 'lucide-react'

import { DISPLAY_MODES } from '../router/search/display'

const ICONS = { grid: Grid3x2, card: Grid2x2, list: LayoutList } as const

const style = css`
  display: inline-flex;
  gap: 0.4rem;
  padding: 0.4rem;
  border-radius: 0.6rem;
  background: rgba(255, 255, 255, 0.05);

  button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 3.4rem;
    height: 3.4rem;
    border: none;
    border-radius: 0.4rem;
    background: transparent;
    color: rgba(255, 255, 255, 0.45);
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }

  button:hover { color: #fff; }

  button[aria-pressed="true"] {
    background: rgba(255, 255, 255, 0.12);
    color: #fff;
  }
`

/** The three layouts, as the segmented control that picks between them. */
const DisplayModeToggle = ({ mode, onChange }: { mode: DisplayMode, onChange: (mode: DisplayMode) => void }) => (
  <div css={style} role="group" aria-label="Result layout">
    {DISPLAY_MODES.map(option => {
      const Icon = ICONS[option.value]
      return (
        <button
          key={option.value}
          type="button"
          title={option.label}
          aria-label={option.label}
          aria-pressed={mode === option.value}
          onClick={() => onChange(option.value)}
        >
          <Icon size={18}/>
        </button>
      )
    })}
  </div>
)

export default DisplayModeToggle
