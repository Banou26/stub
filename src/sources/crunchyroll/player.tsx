import type { Frame } from '@fkn/lib'

import { css } from '@emotion/react'
import { newFrame } from '@fkn/lib'
import { useEffect, useRef, useState } from 'preact/hooks'

const CRUNCHYROLL_DOMAINS = [
  'crunchyroll.com',
  'www.crunchyroll.com',
  'sso.crunchyroll.com',
  'static.crunchyroll.com'
]

const CRUNCHYROLL_OUTER_CSS = `
  #onetrust-consent-sdk {
    display: none !important;
  }
  .video-player-wrapper, [class*="app-layout__content--"] {
    position: initial !important;
  }
  html {
    overflow: hidden !important;
  }
  html::before {
    content: '';
    position: fixed;
    inset: 0;
    background: #000;
    z-index: 999999;
    pointer-events: none;
  }
  .video-player {
    position: absolute !important;
    inset: 0 !important;
    z-index: 9999999;
  }
`

const CrunchyrollPlayer = ({ url }: { url: string }) => {
  const [iframe, setIframe] = useState<HTMLIFrameElement | null>(null)
  const frameRef = useRef<Frame>(undefined)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!iframe || frameRef.current) return
    let cancelled = false
    ;(async () => {
      const frame = await newFrame({
        iframe,
        domains: CRUNCHYROLL_DOMAINS
      })
      if (cancelled) return
      frameRef.current = frame
      await frame.goto(url, { waitUntil: 'documentstart' })
      // await frame.addStyleTag({ content: CRUNCHYROLL_OUTER_CSS })
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [iframe, url])

  return (
    <div className="player-container">
      {loading ? <div className="player-loading">Loading Crunchyroll player...</div> : undefined}
      <iframe
        ref={setIframe}
        referrerPolicy="no-referrer"
        allow="encrypted-media; autoplay; fullscreen;"
        css={css`
          width: 100%;
          aspect-ratio: 16 / 9;
          border: none;
          border-radius: 0.8rem;
          background: #000;
        `}
      />
    </div>
  )
}

export default CrunchyrollPlayer
export { CRUNCHYROLL_DOMAINS, CRUNCHYROLL_OUTER_CSS }
