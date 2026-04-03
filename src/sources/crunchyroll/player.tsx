import type { Frame } from '@fkn/lib'

import type { PlayerProps } from '../players'

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
  .video-player, .player-container {
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

const waitForContentScript = async <T,>(fn: () => Promise<T>, retries = 10, delay = 500): Promise<T> => {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn()
    } catch (err) {
      if (i === retries - 1 || !(err instanceof Error) || !err.message.includes('not registered')) throw err
      await new Promise(r => setTimeout(r, delay))
    }
  }
  throw new Error('unreachable')
}

const checkIsLoggedIn = async (frame: Frame) => {
  for (let i = 0; i < 300; i++) {
    if (i === 299) throw new Error('Login state check timed out')
    const isLoading = await frame.locator('.shell-header-user-avatar [class*="loading"]').exists()
    if (isLoading) {
      await new Promise(r => setTimeout(r, 100))
      continue
    }
    const isLoggedOut = await frame.locator('.erc-anonymous-user-menu-old').exists()
    const isLoggedIn = await frame.locator('.erc-authenticated-user-menu-old').exists()
    if (isLoggedOut) return false
    if (isLoggedIn) return true
    await new Promise(r => setTimeout(r, 100))
  }
}

const CrunchyrollPlayer = ({ url }: PlayerProps) => {
  const [iframe, setIframe] = useState<HTMLIFrameElement | null>(null)
  const frameRef = useRef<Frame>(undefined)
  const [loading, setLoading] = useState(true)
  const [loggedOut, setLoggedOut] = useState(false)
  const [error, setError] = useState<string>()

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
      await waitForContentScript(() => frame.addStyleTag({ content: CRUNCHYROLL_OUTER_CSS }))
      if (cancelled) return
      setLoading(false)
      const isLoggedIn = await checkIsLoggedIn(frame)
      if (cancelled) return
      if (!isLoggedIn) setLoggedOut(true)
    })().catch(err => {
      console.error(err)
      if (cancelled) return
      setLoading(false)
      setError(err?.message ?? 'Failed to load player')
    })
    return () => { cancelled = true }
  }, [iframe, url])

  const openLogin = useCallback(() => {
    const popup = globalThis.open(CRUNCHYROLL_LOGIN_URL, '_blank', 'width=500,height=700')
    if (!popup) return
    const interval = setInterval(() => {
      if (!popup.closed) return
      clearInterval(interval)
      frameRef.current = undefined
      setLoggedOut(false)
      setLoading(true)
    }, 500)
  }, [url])

  const overlay = (loggedOut || error || loading) && (
    <div
      css={css`
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 1.6rem;
        background: #000;
        border-radius: 0.8rem;
        font-size: 1.4rem;
        color: rgba(255, 255, 255, 0.8);
        z-index: 1;
      `}
    >
      {loggedOut && (
        <>
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
        </>
      )}
      {error && !loggedOut && error}
      {loading && !error && !loggedOut && 'Loading Crunchyroll player...'}
    </div>
  )

  return (
    <div
      css={css`
        position: relative;
      `}
    >
      {overlay}
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
