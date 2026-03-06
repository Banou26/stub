import type { Frame } from '@fkn/lib'

import { css } from '@emotion/react'
import { newFrame } from '@fkn/lib'
import { useCallback, useEffect, useRef, useState } from 'preact/hooks'

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

const CRUNCHYROLL_LOGIN_URL = (() => {
  const authorizeParams = new URLSearchParams({
    client_id: 'kmj7imhjt_q90lcbzzsj',
    redirect_uri: 'https://www.crunchyroll.com/',
    response_type: 'cookie'
  })
  return `https://sso.crunchyroll.com/login?return_url=${encodeURIComponent(`/authorize?${authorizeParams}`)}`
})()

const checkLoginState = async (frame: Frame) => {
  for (let i = 0; i < 15; i++) {
    await new Promise(r => setTimeout(r, 1000))
    const count = (await frame.locator('.erc-anonymous-user-menu-old').count()) as number
    if (count > 0) return 'logged-out' as const
    const authCount = (await frame.locator('.erc-user-menu-old').count()) as number
    if (authCount > 0) return 'logged-in' as const
  }
  return undefined
}

import type { PlayerProps } from '../players'

const CrunchyrollPlayer = ({ url }: PlayerProps) => {
  const [iframe, setIframe] = useState<HTMLIFrameElement | null>(null)
  const frameRef = useRef<Frame>(undefined)
  const [loading, setLoading] = useState(true)
  const [loggedOut, setLoggedOut] = useState(false)

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
      await frame.addStyleTag({ content: CRUNCHYROLL_OUTER_CSS })
      if (cancelled) return
      setLoading(false)
      const state = await checkLoginState(frame)
      if (cancelled) return
      if (state === 'logged-out') setLoggedOut(true)
    })()
    return () => { cancelled = true }
  }, [iframe, url])

  const openLogin = useCallback(() => {
    const popup = globalThis.open(CRUNCHYROLL_LOGIN_URL, '_blank', 'width=500,height=700')
    if (!popup) return
    const interval = setInterval(() => {
      if (!popup.closed) return
      clearInterval(interval)
      // Re-check login state by reloading the iframe
      const frame = frameRef.current
      if (!frame) return
      setLoggedOut(false)
      setLoading(true)
      ;(async () => {
        await frame.goto(url, { waitUntil: 'documentstart' })
        setLoading(false)
        const state = await checkLoginState(frame)
        if (state === 'logged-out') setLoggedOut(true)
      })()
    }, 500)
  }, [url])

  if (loggedOut) {
    return (
      <div
        className="player-container"
        css={css`
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 1.6rem;
          aspect-ratio: 16 / 9;
          background: #000;
          border-radius: 0.8rem;
          font-size: 1.4rem;
          color: rgba(255, 255, 255, 0.8);
        `}
      >
        You need to be logged in to Crunchyroll to watch this content.
        <button
          onClick={openLogin}
          css={css`
            padding: 0.8rem 2rem;
            background: #f47521;
            color: #fff;
            border: none;
            border-radius: 0.4rem;
            font-size: 1.4rem;
            font-weight: 600;
            cursor: pointer;
            &:hover {
              background: #e0651a;
            }
          `}
        >
          Open Crunchyroll Login Page
        </button>
      </div>
    )
  }

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
