import { css } from '@emotion/react'
import { useState } from 'preact/hooks'

export type WatchSource = {
  id: string
  name: string
  icon?: string | null
  color?: string | null
  href?: string
  external: boolean
  active: boolean
}

const BRAND_COLORS: Record<string, string> = {
  cr: '#f47521',
  nf: '#e50914',
  jw: '#fcd53f',
  disney: '#0063e5',
  amazon: '#00a8e1',
  appletv: '#e8e8ed',
  hulu: '#1ce783',
  hbo: '#7b5cff',
  peacock: '#069de0',
  paramount: '#0064ff',
  fubo: '#fa4616',
}

const FALLBACK_COLOR = '#9aa0a6'

const brandColor = (source: WatchSource) => source.color || BRAND_COLORS[source.id] || FALLBACK_COLOR

const style = css`
  display: flex;
  flex-direction: column;
  gap: 1.1rem;

  .label {
    font-size: 1.2rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.4);
  }

  .list {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
  }

  .source {
    --brand: ${FALLBACK_COLOR};
    position: relative;
    display: flex;
    align-items: center;
    gap: 1.1rem;
    min-width: 17rem;
    padding: 0.9rem 1.4rem 0.9rem 1.1rem;
    background: rgb(28, 28, 30);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 1rem;
    color: #fff;
    text-decoration: none;
    cursor: pointer;
    overflow: hidden;
    transition: transform 0.15s ease, border-color 0.15s ease, background 0.15s ease;

    &::before {
      content: '';
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 3px;
      background: var(--brand);
      opacity: 0.45;
      transition: opacity 0.15s ease, width 0.15s ease;
    }

    &:hover {
      transform: translateY(-2px);
      background: rgb(34, 34, 37);
      border-color: color-mix(in srgb, var(--brand) 55%, transparent);

      &::before {
        opacity: 1;
      }

      .play {
        opacity: 0.9;
      }
    }

    &.active {
      border-color: var(--brand);
      background:
        linear-gradient(
          90deg,
          color-mix(in srgb, var(--brand) 24%, transparent),
          color-mix(in srgb, var(--brand) 7%, transparent)
        );

      &::before {
        width: 4px;
        opacity: 1;
      }
    }

    .icon {
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      width: 3.2rem;
      height: 3.2rem;
      border-radius: 0.7rem;
      background: color-mix(in srgb, var(--brand) 16%, rgba(255, 255, 255, 0.04));
      color: var(--brand);
      font-size: 1.6rem;
      font-weight: 700;
      text-transform: uppercase;
      overflow: hidden;

      img {
        width: 100%;
        height: 100%;
        object-fit: contain;
        padding: 0.45rem;
        box-sizing: border-box;
      }
    }

    .name {
      flex: 1;
      font-size: 1.45rem;
      font-weight: 600;
      white-space: nowrap;
    }

    .play,
    .ext,
    .playing {
      flex-shrink: 0;
    }

    .play {
      font-size: 1rem;
      color: var(--brand);
      opacity: 0;
      transition: opacity 0.15s ease;
    }

    .ext {
      font-size: 1.4rem;
      color: rgba(255, 255, 255, 0.45);
    }

    .playing {
      display: flex;
      align-items: flex-end;
      gap: 2px;
      height: 1.4rem;

      i {
        width: 3px;
        background: var(--brand);
        border-radius: 1px;
        transform-origin: bottom;
        animation: source-eq 0.9s ease-in-out infinite;
      }

      i:nth-of-type(1) {
        height: 45%;
        animation-delay: 0s;
      }

      i:nth-of-type(2) {
        height: 100%;
        animation-delay: 0.2s;
      }

      i:nth-of-type(3) {
        height: 70%;
        animation-delay: 0.4s;
      }
    }
  }

  @keyframes source-eq {
    0%, 100% { transform: scaleY(0.35); }
    50% { transform: scaleY(1); }
  }
`

const compactStyle = css`
  display: flex;
  align-items: center;
  gap: 0.7rem;

  .src {
    --brand: ${FALLBACK_COLOR};
    display: flex;
    text-decoration: none;
    border-radius: 0.6rem;
    transition: transform 0.12s ease;

    &:hover {
      transform: translateY(-2px);
    }

    .icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 2.8rem;
      height: 2.8rem;
      border-radius: 0.6rem;
      border: 1px solid transparent;
      background: color-mix(in srgb, var(--brand) 18%, rgba(255, 255, 255, 0.05));
      color: var(--brand);
      font-size: 1.3rem;
      font-weight: 700;
      text-transform: uppercase;
      overflow: hidden;
      transition: border-color 0.12s ease, background 0.12s ease;

      img {
        width: 100%;
        height: 100%;
        object-fit: contain;
        padding: 0.4rem;
        box-sizing: border-box;
      }
    }

    &:hover .icon {
      border-color: var(--brand);
      background: color-mix(in srgb, var(--brand) 30%, rgba(255, 255, 255, 0.05));
    }
  }
`

const SourceIcon = ({ source }: { source: WatchSource }) => {
  const [failed, setFailed] = useState(false)
  return (
    <span className="icon">
      {source.icon && !failed
        ? <img src={source.icon} alt="" onError={() => setFailed(true)} />
        : source.name.charAt(0)}
    </span>
  )
}

export const SourceSelector = ({ sources, compact = false }: { sources: WatchSource[], compact?: boolean }) => {
  if (!sources.length) return null

  if (compact) {
    return (
      <div css={compactStyle}>
        {sources.map(source => (
          <a
            key={source.id}
            className="src"
            style={{ '--brand': brandColor(source) }}
            href={source.href}
            target={source.external ? '_blank' : undefined}
            rel={source.external ? 'noreferrer' : undefined}
            title={`Watch on ${source.name}`}
          >
            <SourceIcon source={source} />
          </a>
        ))}
      </div>
    )
  }

  return (
    <div css={style}>
      <div className="label">Watch on</div>
      <div className="list">
        {sources.map(source => (
          <a
            key={source.id}
            className={`source${source.active ? ' active' : ''}`}
            style={{ '--brand': brandColor(source) }}
            href={source.href}
            target={source.external ? '_blank' : undefined}
            rel={source.external ? 'noreferrer' : undefined}
            title={source.name}
          >
            <SourceIcon source={source} />
            <span className="name">{source.name}</span>
            {source.active
              ? <span className="playing"><i/><i/><i/></span>
              : source.external
                ? <span className="ext">↗</span>
                : <span className="play">▶</span>}
          </a>
        ))}
      </div>
    </div>
  )
}

export default SourceSelector
