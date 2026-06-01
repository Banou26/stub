import type { Frame } from '@fkn/lib'

import type { PlayerProps } from '../players'

import { css } from '@emotion/react'
import { attachFrame } from '@fkn/lib'
import { useCallback, useEffect, useState } from 'preact/hooks'

const NETFLIX_DOMAINS = [
  'netflix.com',
  'www.netflix.com',
  'nflxvideo.net',
  'nflxso.net',
  'nflxext.com',
  'nflximg.net',
  'assets.nflxext.com'
]

const NETFLIX_LOGIN_URL = 'https://www.netflix.com/login'

const NETFLIX_OUTER_CSS = `
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
  .watch-video {
    position: absolute !important;
    inset: 0 !important;
    z-index: 9999999;
  }
`

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
  for (let i = 0; i < 50; i++) {
    const hasLoginForm = await frame.locator('[data-uia="header"] a[href*="/login"]').exists()
    if (hasLoginForm) return false
    const hasPlayer = await frame.locator('.watch-video, [data-uia="video-canvas"]').exists()
    if (hasPlayer) return true
    await new Promise(r => setTimeout(r, 200))
  }
  return false
}

const NetflixPlayer = ({ url }: PlayerProps) => {
  const [iframe, setIframe] = useState<HTMLIFrameElement | null>(null)
  const [frame, setFrame] = useState<Frame | null>(null)
  const [loading, setLoading] = useState(true)
  const [loggedOut, setLoggedOut] = useState(false)
  const [error, setError] = useState<string>()
  const [reloadKey, setReloadKey] = useState(0)

  // Attach once per iframe; the frame outlives navigation and re-logins.
  useEffect(() => {
    if (!iframe) return
    let cancelled = false
    ;(async () => {
      for (let attempt = 0; !cancelled; attempt++) {
        try {
          const f = await attachFrame({ iframe, domains: NETFLIX_DOMAINS })
          if (!cancelled) setFrame(f)
          return
        } catch (err) {
          if (cancelled) return
          if (attempt >= 4) {
            console.error('Failed to attach Netflix frame', err)
            setError(err instanceof Error ? err.message : 'Failed to load player')
            setLoading(false)
            return
          }
          await new Promise(resolve => setTimeout(resolve, 300 * (attempt + 1)))
        }
      }
    })()
    return () => { cancelled = true }
  }, [iframe])

  // Navigate to the episode URL, hide chrome, confirm login. Re-runs on url
  // change (episode switch) and on reloadKey bump after a login round-trip.
  useEffect(() => {
    if (!frame) return
    let cancelled = false
    setLoading(true)
    setError(undefined)
    setLoggedOut(false)
    ;(async () => {
      await frame.goto(url, { waitUntil: 'load' })
      await waitForContentScript(() => frame.addStyleTag({ content: NETFLIX_OUTER_CSS }))
      if (cancelled) return
      setLoading(false)
      const isLoggedIn = await checkIsLoggedIn(frame)
      if (cancelled) return
      if (!isLoggedIn) setLoggedOut(true)
    })().catch(err => {
      if (cancelled) return
      console.error('Failed to load Netflix player', err)
      setError(err?.message ?? 'Failed to load player')
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [frame, url, reloadKey])

  const openLogin = useCallback(() => {
    const popup = globalThis.open(NETFLIX_LOGIN_URL, '_blank', 'width=500,height=700')
    if (!popup) return
    const interval = setInterval(() => {
      if (!popup.closed) return
      clearInterval(interval)
      setReloadKey(k => k + 1)
    }, 500)
  }, [])

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
          You need to be logged in to Netflix to watch this content.
          <button
            onClick={openLogin}
            css={css`
              padding: 0.8rem 2rem;
              background: #e50914;
              color: #fff;
              border: none;
              border-radius: 0.4rem;
              font-size: 1.4rem;
              font-weight: 600;
              cursor: pointer;
              &:hover {
                background: #c11119;
              }
            `}
          >
            Open Netflix Login Page
          </button>
        </>
      )}
      {error && !loggedOut && error}
      {loading && !error && !loggedOut && 'Loading Netflix player...'}
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

export default NetflixPlayer
export { NETFLIX_DOMAINS, NETFLIX_OUTER_CSS }
